import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ console, Date, Intl, URL, AbortController, DOMException, setTimeout, clearTimeout });
for (const file of ['time-model', 'location-search']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const Client = context.SpiralLocationSearch;
const bremen = { name: 'Bremen', admin1: 'Bremen', country: 'Germany', latitude: 53.08, longitude: 8.8, timezone: 'Europe/Berlin' };
const response = (results = [bremen]) => ({ ok: true, json: async () => ({ results }) });

function fixture() {
  let now = 100000;
  let fetcher = async () => response();
  const calls = [];
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  const options = { getStorage: () => storage, now: () => now,
    wait: async (ms, signal) => { signal?.throwIfAborted(); now += ms; },
    fetch: async (url, opts) => { calls.push({ url, opts, at: now }); return fetcher(url, opts); }
  };
  return { client: new Client(options), calls, saved, options,
    advance: ms => { now += ms; }, set fetcher(fn) { fetcher = fn; } };
}

test('client construction performs no searches; explicit requests normalize coordinates, labels and time zones', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0);
  const result = await f.client.search(' Bremen ');
  assert.equal(f.calls.length, 1);
  const url = new URL(f.calls[0].url);
  assert.equal(url.origin, 'https://geocoding-api.open-meteo.com');
  assert.equal(url.searchParams.get('name'), 'Bremen');
  assert.equal(url.searchParams.get('count'), '5');
  assert.equal(result.results[0].label, 'Bremen, Germany');
  assert.equal(result.results[0].timeZone, 'Europe/Berlin');
});

test('identical concurrent and repeated queries share cached results without extra requests', async () => {
  const f = fixture();
  await Promise.all([f.client.search('Bremen'), f.client.search(' BREMEN ')]);
  const result = await f.client.search('bremen');
  assert.equal(f.calls.length, 1);
  assert.equal(result.cached, true);
  const reloaded = new Client(f.options);
  assert.equal((await reloaded.search('Bremen')).cached, true);
  assert.equal(f.calls.length, 1);
});

test('different requests are serialized and start at least one second apart', async () => {
  const f = fixture();
  await Promise.all(['Bremen', 'Berlin', 'Hamburg'].map(query => f.client.search(query)));
  assert.deepEqual(f.calls.map(call => call.at), [100000, 101000, 102000]);
});

test('empty results are cached and invalid searches make no network requests', async () => {
  const f = fixture();
  f.fetcher = async () => response([]);
  assert.equal((await f.client.search('Missing city')).results.length, 0);
  assert.equal((await f.client.search('Missing city')).cached, true);
  for (const query of ['', 'a', 'x'.repeat(201)]) await assert.rejects(f.client.search(query));
  assert.equal(f.calls.length, 1);
});

test('coordinates and named zones from the provider are validated before presenting results', async () => {
  const f = fixture();
  f.fetcher = async () => response([bremen, { ...bremen, latitude: 91 }, { ...bremen, longitude: -181 },
    { ...bremen, latitude: '53' }, { ...bremen, timezone: 'Invalid/Zone' }]);
  assert.equal((await f.client.search('Bremen')).results.length, 1);
});

test('expired cached results can be used offline and never silently become fresh again', async () => {
  const f = fixture();
  await f.client.search('Bremen');
  f.advance(2 * 86400000);
  f.fetcher = async () => { throw new Error('Offline'); };
  assert.equal((await f.client.search('Bremen')).stale, true);
  f.advance(6 * 86400000);
  await assert.rejects(f.client.search('Bremen'), /Offline/);
});

test('a cancelled queued search never contacts the service', async () => {
  const f = fixture();
  const controller = new AbortController();
  const first = f.client.search('Bremen');
  const cancelled = f.client.search('Berlin', { signal: controller.signal });
  controller.abort();
  await first;
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  assert.equal(f.calls.length, 1);
});

test('active search cancellation does not cache stale results or prevent the next search', async () => {
  const f = fixture();
  const controller = new AbortController();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  f.fetcher = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    started();
  });
  const pending = f.client.search('Bremen', { signal: controller.signal });
  await ready;
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  f.fetcher = async () => response();
  assert.equal((await f.client.search('Bremen')).cached, false);
  assert.equal(f.calls.length, 2);
});

test('rate-limit responses honor Retry-After and are never cached as successful searches', async () => {
  const f = fixture();
  f.fetcher = async () => ({ ok: false, status: 429, headers: { get: () => '12' } });
  await assert.rejects(f.client.search('Bremen'), /busy/);
  f.fetcher = async () => response();
  await f.client.search('Bremen');
  assert.deepEqual(f.calls.map(call => call.at), [100000, 112000]);
});

test('unavailable or corrupt local storage does not break search', async () => {
  for (const getStorage of [() => { throw new Error('Unavailable'); }, () => ({ getItem: () => '{bad', setItem() { throw new Error('Quota'); } })]) {
    const client = new Client({ getStorage, fetch: async () => response() });
    assert.equal((await client.search('Bremen')).results.length, 1);
  }
});

test('malformed provider responses are reported and never cached', async () => {
  const f = fixture();
  for (const data of [null, [], { results: 'invalid' }, { error: true }]) {
    f.fetcher = async () => ({ ok: true, json: async () => data });
    await assert.rejects(f.client.search('Bremen'), /invalid response/);
  }
  f.fetcher = async () => response();
  assert.equal((await f.client.search('Bremen')).cached, false);
});

test('a stalled network request times out, clears its timer and exposes a useful error', async () => {
  let timeout;
  let cleared = 0;
  const timed = vm.createContext({ URL, AbortController, DOMException, Date, SpiralTime: context.SpiralTime,
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout: () => { cleared++; } });
  vm.runInContext(fs.readFileSync(new URL('../js/location-search.js', import.meta.url), 'utf8'), timed);
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const client = new timed.SpiralLocationSearch({ getStorage: () => ({ getItem: () => null }),
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      started();
    }) });
  const pending = client.search('Bremen');
  await ready;
  timeout();
  await assert.rejects(pending, /timed out/);
  assert.equal(cleared, 1);
});

test('the endpoint can be switched to a compatible proxy without changing the UI', async () => {
  const f = fixture();
  const client = new Client({ ...f.options, endpoint: 'https://example.test/places' });
  await client.search('Bremen');
  assert.equal(new URL(f.calls[0].url).origin, 'https://example.test');
});
