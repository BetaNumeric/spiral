import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ console, setInterval, clearInterval });
vm.runInContext(fs.readFileSync(new URL('../js/study-storage.js', import.meta.url), 'utf8'), context);
const StudyStorage = context.SpiralStudyStorage;
const copy = value => value === undefined ? undefined : structuredClone(value);

// Serialized, atomic transactions with asynchronous request callbacks. Failed writes
// roll back the complete transaction, including metadata and the active-session pointer.
function fakeIndexedDB() {
  const stores = new Map();
  const paths = new Map();
  let tail = Promise.resolve();
  let failWrites = false;
  const database = {
    close() {},
    createObjectStore(name, options) { stores.set(name, new Map()); paths.set(name, options.keyPath); },
    transaction(names, mode) {
      if (typeof names === 'string') names = [names];
      let pending = 0;
      let active = false;
      let finished = false;
      let snapshots;
      const work = [];
      let release;
      const completed = new Promise(resolve => { release = resolve; });
      const previous = tail;
      tail = completed;
      const finish = () => setImmediate(() => {
        if (finished || !active || pending) return;
        finished = true;
        if (mode === 'readwrite') for (const name of names) stores.set(name, snapshots.get(name));
        transaction.oncomplete?.();
        release();
      });
      const request = operation => {
        const result = {};
        pending++;
        const run = () => setImmediate(() => {
          if (finished) return;
          try { result.result = copy(operation()); result.onsuccess?.({ target: result }); }
          catch (error) { result.error = error; transaction.error = error; transaction.abort(); }
          pending--;
          finish();
        });
        if (active) run(); else work.push(run);
        return result;
      };
      const transaction = {
        abort() {
          if (finished) return;
          finished = true;
          setImmediate(() => { transaction.onabort?.(); release(); });
        },
        objectStore(name) {
          assert.ok(names.includes(name));
          const keyFor = value => {
            const path = paths.get(name);
            return JSON.stringify(Array.isArray(path) ? path.map(key => value[key]) : value[path]);
          };
          const write = (value, addOnly) => request(() => {
            if (failWrites) throw new Error('Quota exceeded');
            const key = keyFor(value);
            const store = snapshots.get(name);
            if (addOnly && store.has(key)) throw new Error('ConstraintError');
            store.set(key, copy(value));
          });
          return {
            get: key => request(() => snapshots.get(name).get(JSON.stringify(key))),
            getAll: () => request(() => [...snapshots.get(name).values()]),
            put: value => write(value, false),
            add: value => write(value, true),
            delete: key => request(() => {
              if (failWrites) throw new Error('Quota exceeded');
              snapshots.get(name).delete(JSON.stringify(key));
            })
          };
        }
      };
      previous.then(() => {
        if (finished) return;
        snapshots = new Map(names.map(name => [name, new Map([...stores.get(name)].map(([key, value]) => [key, copy(value)]))]));
        active = true;
        work.forEach(run => run());
        finish();
      });
      return transaction;
    }
  };
  return {
    stores,
    set failWrites(value) { failWrites = value; },
    open() {
      const request = {};
      setImmediate(() => {
        request.result = database;
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

function fixture(raw = null) {
  const indexedDB = fakeIndexedDB();
  const notices = [];
  let time = 100000;
  let owner = 0;
  const storage = { getItem: () => raw, removeItem() { throw new Error('Legacy must never be deleted'); } };
  return {
    indexedDB, notices,
    get raw() { return raw; },
    set time(value) { time = value; },
    create: (options = {}) => new StudyStorage({
      indexedDB, locks: null, getStorage: () => storage, now: () => time,
      owner: `tab-${++owner}`, setInterval: () => null, clearInterval() {},
      onStatus: status => notices.push(status), ...options
    })
  };
}

const session = (id = 's1', interactions = []) => ({
  schemaVersion: 6, sessionId: id, participantId: 'P01', isRecording: true,
  startTime: '2026-10-23T10:00:00Z', revision: 0, interactions
});
const action = index => ({ index, type: 'event_selected', at: `2026-10-23T10:00:0${index}Z`, payload: { eventId: `event-${index}` } });

test('archive preserves finalized participants and recovers the next unfinished recording', async () => {
  const f = fixture();
  const store = f.create();
  assert.equal(await store.initialize(), true);
  assert.equal(await store.acquireWriter(), true);
  assert.equal(await store.save(session('first', [action(1)])), true);
  assert.equal(await store.save({ ...session('first', [action(1), action(2)]), isRecording: false, endTime: '2026-10-23T10:02:00Z' }), true);
  assert.equal(await store.save(session('second', [action(1)])), true);
  assert.equal(await store.flush(), true);
  const all = await store.listSessions();
  assert.equal(all.length, 2);
  assert.equal(all[0].isRecording, false);
  assert.deepEqual(copy(all[0].interactions), [action(1), action(2)]);
  assert.equal(all[0].revision, 2);
  assert.equal((await store.getActiveSession()).sessionId, 'second');
  await store.releaseWriter();
  const recovered = f.create();
  assert.equal((await recovered.getActiveSession()).sessionId, 'second');
});

test('two tabs cannot acquire the recorder concurrently, including without Web Locks', async () => {
  const f = fixture();
  const first = f.create();
  const second = f.create();
  const result = await Promise.all([first.acquireWriter(), second.acquireWriter()]);
  assert.equal(result.filter(Boolean).length, 1);
  const winner = result[0] ? first : second;
  const loser = result[0] ? second : first;
  assert.equal(await loser.save(session()), false);
  assert.equal(await winner.save(session()), true);
  await winner.releaseWriter();
  assert.equal(await loser.acquireWriter(), true);
  assert.equal((await loser.getActiveSession()).sessionId, 's1');
  await loser.releaseWriter();
});

test('a crashed fallback writer expires and cannot overwrite the recovered archive', async () => {
  const f = fixture();
  const crashed = f.create();
  const recovery = f.create();
  assert.equal(await crashed.acquireWriter(), true);
  assert.equal(await crashed.save(session('s1', [action(1)])), true);
  f.time = 131000;
  assert.equal(await recovery.acquireWriter(), true);
  assert.equal(await recovery.save(session('s1', [action(1), action(2)])), true);
  assert.equal(await crashed.save(session('s1', [action(1), action(3)])), false);
  assert.deepEqual(copy((await recovery.getActiveSession()).interactions), [action(1), action(2)]);
  await recovery.releaseWriter();
});

test('lease renewal extends ownership while stale renewal fails visibly', async () => {
  const f = fixture();
  const first = f.create();
  const second = f.create();
  assert.equal(await first.acquireWriter(), true);
  f.time = 120000;
  assert.equal(await first.renewLease(), true);
  f.time = 135000;
  assert.equal(await second.acquireWriter(), false);
  f.time = 151000;
  assert.equal(await second.acquireWriter(), true);
  assert.equal(await first.renewLease(), false);
  assert.equal(first.writer, false);
  assert.ok(f.notices.some(notice => notice.status === 'blocked'));
  await second.releaseWriter();
});

test('a second session cannot displace an unfinished participant', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  assert.equal(await store.save(session('first')), true);
  assert.equal(await store.save(session('second')), false);
  assert.equal((await store.getActiveSession()).sessionId, 'first');
  assert.equal((await store.listSessions()).length, 1);
  await store.releaseWriter();
});

test('quota failure rolls back finalization and can be retried without losing actions', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  await store.save(session('s1', [action(1)]));
  const final = { ...session('s1', [action(1), action(2)]), isRecording: false };
  f.indexedDB.failWrites = true;
  assert.equal(await store.save(final), false);
  assert.equal(await store.flush(), false);
  assert.equal((await store.getActiveSession()).interactions.length, 1);
  f.indexedDB.failWrites = false;
  assert.equal(await store.save(final), true);
  assert.equal(await store.flush(), true);
  assert.equal(await store.getActiveSession(), null);
  assert.equal((await store.listSessions())[0].interactions.length, 2);
  await store.releaseWriter();
});

test('queued saves capture a snapshot and refuse prefix edits or truncation', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  const current = session('s1', [action(1)]);
  const save = store.save(current);
  current.interactions.push(action(2));
  await save;
  assert.equal((await store.getActiveSession()).interactions.length, 1);
  assert.equal(await store.save(current), true);
  assert.equal(await store.save(session('s1', [action(1)])), false);
  assert.equal(await store.save(session('s1', [action(4), action(2)])), false);
  assert.deepEqual(copy((await store.getActiveSession()).interactions), [action(1), action(2)]);
  await store.releaseWriter();
});

test('finalized sessions cannot be reopened, and actions are stored separately', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  await store.save({ ...session('s1', [action(1)]), isRecording: false });
  assert.equal(await store.save(session('s1', [action(1)])), false);
  const metadata = [...f.indexedDB.stores.get('sessions').values()][0];
  assert.equal(metadata.interactions, undefined);
  assert.equal(f.indexedDB.stores.get('interactions').size, 1);
  await store.releaseWriter();
});

test('legacy schema 5 imports once, remains readable, and retains its original backup', async () => {
  const original = { ...session('legacy', [action(1)]), schemaVersion: 5 };
  const raw = JSON.stringify(original);
  const f = fixture(raw);
  const store = f.create();
  assert.equal(await store.initialize(), true);
  assert.equal((await store.getActiveSession()).schemaVersion, 5);
  assert.equal(f.raw, raw);
  await store.acquireWriter();
  await store.save({ ...original, isRecording: false });
  await store.releaseWriter();
  const reloaded = f.create();
  assert.equal(await reloaded.initialize(), true);
  assert.equal(await reloaded.getActiveSession(), null);
  assert.equal((await reloaded.listSessions()).length, 1);
  assert.equal(f.raw, raw);
});

test('corrupt and unsupported legacy data is never discarded or silently accepted', async () => {
  for (const raw of ['{broken', JSON.stringify({ ...session(), schemaVersion: 20 }), JSON.stringify({ ...session(), interactions: [null] })]) {
    const f = fixture(raw);
    const store = f.create();
    assert.equal(await store.initialize(), true);
    assert.equal(f.raw, raw);
    assert.equal((await store.listSessions()).length, 0);
    assert.ok(f.notices.some(notice => notice.status === 'error' && notice.message.includes('preserved')));
  }
});

test('unavailable persistence fails visibly and never reports an empty archive as loaded', async () => {
  const store = new StudyStorage({ indexedDB: null });
  assert.equal(await store.initialize(), false);
  assert.equal(await store.acquireWriter(), false);
  assert.equal(await store.save(session()), false);
  await assert.rejects(() => store.listSessions());
});

test('Web Locks hold ownership until release and coordinate with fallback lease users', async () => {
  const f = fixture();
  let held = false;
  const locks = {
    request: async (name, options, callback) => {
      assert.equal(name, StudyStorage.LOCK);
      assert.equal(options.ifAvailable, true);
      if (held) return callback(null);
      held = true;
      try { return await callback({ name }); } finally { held = false; }
    }
  };
  const first = f.create({ locks });
  const second = f.create({ locks });
  const fallback = f.create();
  assert.equal(await first.acquireWriter(), true);
  assert.equal(await second.acquireWriter(), false);
  assert.equal(await fallback.acquireWriter(), false);
  await first.releaseWriter();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(held, false);
  assert.equal(await second.acquireWriter(), true);
  await second.releaseWriter();
});

test('an acquired Web Lock recovers immediately after its old tab crashes', async () => {
  const f = fixture();
  let held = false;
  const locks = {
    request: async (name, options, callback) => {
      if (held) return callback(null);
      held = true;
      try { return await callback({ name }); } finally { held = false; }
    }
  };
  const crashed = f.create({ locks });
  const recovered = f.create({ locks });
  await crashed.acquireWriter();
  await crashed.save(session());
  held = false; // Browser releases Web Locks on tab destruction, before the IDB lease expires.
  assert.equal(await recovered.acquireWriter(), true);
  assert.equal(await recovered.save(session('s1', [action(1)])), true);
  assert.equal(await crashed.save(session('s1', [action(2)])), false);
  await recovered.releaseWriter();
});

test('baseline saving requires ownership and does not modify the archived recordings', async () => {
  const f = fixture();
  const store = f.create();
  const baseline = { fixtureId: 'baseline-1', savedAt: '2026-10-23T10:00:00Z', appVersion: '1.42', events: [{ title: 'Practice' }], settings: { days: 7 }, referenceTime: 1234, viewContext: { rotation: 2 } };
  assert.equal(await store.getFixture(), null);
  assert.equal(await store.saveFixture(baseline), false);
  await store.acquireWriter();
  await store.save({ ...session('first', [action(1)]), isRecording: false });
  assert.equal(await store.saveFixture(baseline), true);
  assert.deepEqual(copy(await store.getFixture()), baseline);
  assert.equal((await store.listSessions()).length, 1);
  await store.releaseWriter();
  assert.deepEqual(copy(await f.create().getFixture()), baseline);
});

test('failed baseline replacement preserves the previous baseline', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  const baseline = { fixtureId: 'one', events: [], settings: {} };
  await store.saveFixture(baseline);
  f.indexedDB.failWrites = true;
  assert.equal(await store.saveFixture({ ...baseline, fixtureId: 'two' }), false);
  assert.deepEqual(copy(await store.getFixture()), baseline);
  f.indexedDB.failWrites = false;
  await store.releaseWriter();
});

test('an incomplete archive is reported instead of being presented as valid data', async () => {
  const f = fixture();
  const store = f.create();
  await store.acquireWriter();
  await store.save(session('s1', [action(1)]));
  f.indexedDB.stores.get('interactions').clear();
  await assert.rejects(() => store.listSessions(), /incomplete/);
  assert.equal(f.notices.at(-1).status, 'error');
  await store.releaseWriter();
});
