import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('offline installation caches every local script loaded by the main page', async () => {
  const listeners = new Map();
  let cached;
  const context = vm.createContext({ URL, location: new URL('https://example.test/spiral/service-worker.js'),
    addEventListener: (name, listener) => listeners.set(name, listener), skipWaiting() {},
    caches: { open: async () => ({ addAll: async urls => { cached = urls; } }) },
    importScripts: () => vm.runInContext(fs.readFileSync(new URL('../js/app-version.js', import.meta.url), 'utf8'), context)
  });
  vm.runInContext('self = globalThis', context);
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  let installation;
  listeners.get('install')({ waitUntil: promise => { installation = promise; } });
  await installation;
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), match => match[1]);
  for (const script of scripts.filter(src => !/^https?:/.test(src))) {
    assert.ok(cached.includes(new URL(script, 'https://example.test/spiral/').toString()), script);
  }
  for (const path of ['install.html', 'install.css']) {
    assert.ok(cached.includes(new URL(path, 'https://example.test/spiral/').toString()), path);
  }
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  for (const screenshot of manifest.screenshots || []) {
    assert.ok(cached.includes(new URL(screenshot.src, 'https://example.test/spiral/').toString()), screenshot.src);
    assert.ok(fs.existsSync(new URL(`../${screenshot.src}`, import.meta.url)), screenshot.src);
  }
});

test('activating a new Spiral cache preserves other applications on the same origin', async () => {
  const listeners = new Map();
  const deleted = [];
  let claimed = 0;
  const context = vm.createContext({ URL, location: new URL('https://example.test/spiral/service-worker.js'),
    clients: { claim: async () => { claimed++; } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    caches: {
      keys: async () => ['spiral-v1.42.19', 'spiral-v1.42.20', context.APP_CACHE_NAME, 'another-app-v2', 'shared-assets'],
      delete: async key => { deleted.push(key); return true; }
    },
    importScripts: () => vm.runInContext(fs.readFileSync(new URL('../js/app-version.js', import.meta.url), 'utf8'), context)
  });
  vm.runInContext('self = globalThis', context);
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['spiral-v1.42.19', 'spiral-v1.42.20']);
  assert.equal(claimed, 1);
});

function offlineWorker() {
  const listeners = new Map();
  const entries = new Map();
  const matches = [], network = [];
  const key = request => typeof request === 'string' ? request : request.url;
  const context = vm.createContext({ URL, Request, location: new URL('https://example.test/team/spiral/service-worker.js'),
    registration: { scope: 'https://example.test/team/spiral/' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    caches: { match: async request => { matches.push(key(request)); return entries.get(key(request)); } },
    fetch: async request => { network.push(key(request)); throw new TypeError('offline'); },
    importScripts: () => vm.runInContext(fs.readFileSync(new URL('../js/app-version.js', import.meta.url), 'utf8'), context)
  });
  vm.runInContext('self = globalThis', context);
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  return { entries, matches, network,
    request(url, options = {}) {
      let response;
      listeners.get('fetch')({ request: { url, method: 'GET', mode: 'navigate', ...options },
        respondWith: promise => { response = promise; } });
      return response;
    }
  };
}

test('installed launch and shareable installation links resolve to the cached document offline', async () => {
  const worker = offlineWorker();
  for (const path of ['', 'index.html', 'install.html']) {
    const canonical = `https://example.test/team/spiral/${path}`;
    const document = { source: canonical };
    worker.entries.set(canonical, document);
    for (const query of ['?source=pwa', '?install=1', '?study=1&install=1']) {
      assert.equal(await worker.request(`${canonical}${query}`), document, canonical + query);
    }
  }
  assert.equal(worker.network.length, 0);
});

test('asset and data query strings retain distinct cache keys', async () => {
  const worker = offlineWorker();
  for (const path of ['js/config-utils.js', 'manifest.json', 'calendar.json']) {
    const canonical = `https://example.test/team/spiral/${path}`;
    const plain = { source: 'plain' }, versioned = { source: 'versioned' };
    worker.entries.set(canonical, plain);
    worker.entries.set(`${canonical}?version=42`, versioned);
    assert.equal(await worker.request(`${canonical}?version=42`, { mode: 'cors' }), versioned);
    assert.equal(await worker.request(`${canonical}?version=43`, { mode: 'cors' }), undefined);
  }
  assert.equal(worker.network.length, 3);
});

test('unrelated navigations and non-GET requests never receive the cached app document', async () => {
  const worker = offlineWorker();
  for (const path of ['', 'index.html', 'install.html']) {
    worker.entries.set(`https://example.test/team/spiral/${path}`, { source: 'app document' });
  }
  for (const url of ['https://example.test/team/spiral/missing.html?install=1',
    'https://example.test/another-app/?install=1', 'https://other.test/team/spiral/?install=1']) {
    assert.equal(await worker.request(url), undefined, url);
  }
  assert.equal(await worker.request('https://example.test/team/spiral/?install=1', { method: 'POST' }), undefined);
  assert.equal(worker.network.length, 4);
});
