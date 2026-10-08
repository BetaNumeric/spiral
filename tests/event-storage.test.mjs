import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL('../js/event-storage.js', import.meta.url), 'utf8'), context);
const EventStorage = context.SpiralEventStorage;
const key = EventStorage.KEY;
const event = title => ({
  title,
  start: '2026-10-08T09:00:00.000Z',
  end: '2026-10-08T10:00:00.000Z',
  calendar: 'Home',
  persistentUID: title,
  color: '#abcdef',
  extraMetadata: { preserved: true }
});
const snapshot = (...titles) => JSON.stringify(titles.map(event));

function fixture(initial = null) {
  let raw = initial;
  let failWrites = false;
  let writes = 0;
  let lockQueue = Promise.resolve();
  const storage = {
    getItem: name => { assert.equal(name, key); return raw; },
    setItem: (name, value) => {
      assert.equal(name, key);
      if (failWrites) throw new Error('Quota exceeded');
      writes++;
      raw = value;
    }
  };
  const locks = {
    request: (name, callback) => {
      assert.equal(name, key);
      const result = lockQueue.then(callback);
      lockQueue = result.catch(() => {});
      return result;
    }
  };
  return {
    create: () => new EventStorage({ getStorage: () => storage, locks }),
    get raw() { return raw; },
    set raw(value) { raw = value; },
    get writes() { return writes; },
    set failWrites(value) { failWrites = value; }
  };
}

test('load and save preserve existing event dates, IDs and metadata', async () => {
  const f = fixture(snapshot('legacy'));
  const store = f.create();
  assert.equal(JSON.stringify(store.load()), snapshot('legacy'));
  assert.equal(await store.save(snapshot('legacy')), true);
  assert.equal(f.writes, 0);
  assert.equal(f.raw, snapshot('legacy'));
});

test('empty storage loads safely and accepts the first event', async () => {
  const f = fixture();
  const store = f.create();
  assert.equal(JSON.stringify(store.load()), '[]');
  assert.equal(await store.save(snapshot('first')), true);
  assert.equal(f.raw, snapshot('first'));
});

test('unreadable or invalid stored events cannot be overwritten by ordinary saves', async () => {
  for (const original of ['{invalid json', '{}', '[null]', JSON.stringify([{ ...event('bad'), end: 'invalid' }])]) {
    const f = fixture(original);
    const store = f.create();
    assert.throws(() => store.load());
    assert.equal(await store.save('[]'), false);
    assert.equal(f.raw, original);
    assert.equal(f.writes, 0);
    assert.equal(store.error.kind, 'load');
  }
});

test('failed writes preserve the saved copy and can be retried', async () => {
  const f = fixture(snapshot('saved'));
  const store = f.create();
  store.load();
  f.failWrites = true;
  assert.equal(await store.save(snapshot('saved', 'unsaved')), false);
  assert.equal(f.raw, snapshot('saved'));
  assert.equal(store.error.kind, 'save');
  assert.equal(store.pendingWrites, 0);
  f.failWrites = false;
  assert.equal(await store.save(snapshot('saved', 'unsaved')), true);
  assert.equal(store.error, null);
  assert.equal(f.raw, snapshot('saved', 'unsaved'));
});

test('concurrent tabs serialize commits and reject stale copies', async () => {
  const f = fixture(snapshot('original'));
  const tabs = Array.from({ length: 20 }, () => f.create());
  tabs.forEach(tab => tab.load());
  const results = await Promise.all(tabs.map((tab, i) => tab.save(snapshot('original', `tab-${i}`))));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(f.writes, 1);
  assert.equal(JSON.parse(f.raw).length, 2);
  tabs.filter((_, i) => !results[i]).forEach(tab => assert.equal(tab.error.kind, 'conflict'));
});

test('a stale deletion cannot overwrite an edit in another tab', async () => {
  const f = fixture(snapshot('original'));
  const a = f.create();
  const b = f.create();
  a.load();
  b.load();
  assert.equal(await a.save(snapshot('edited')), true);
  assert.equal(await b.save('[]'), false);
  assert.equal(f.raw, snapshot('edited'));
});

test('a storage change between reading and acquiring the lock is detected', async () => {
  const f = fixture(snapshot('original'));
  const store = f.create();
  store.load();
  const pending = store.save(snapshot('local'));
  f.raw = snapshot('remote');
  assert.equal(await pending, false);
  assert.equal(f.raw, snapshot('remote'));
});

test('identical concurrent saves succeed without writing twice', async () => {
  const f = fixture();
  const a = f.create();
  const b = f.create();
  a.load();
  b.load();
  assert.deepEqual(await Promise.all([a.save(snapshot('same')), b.save(snapshot('same'))]), [true, true]);
  assert.equal(f.writes, 1);
});

test('quick successive edits in one tab save in order', async () => {
  const f = fixture();
  const store = f.create();
  store.load();
  assert.deepEqual(await Promise.all([
    store.save(snapshot('first')),
    store.save(snapshot('first', 'second')),
    store.save(snapshot('second'))
  ]), [true, true, true]);
  assert.equal(f.raw, snapshot('second'));
  assert.equal(store.pendingWrites, 0);
});

test('loading during a pending write is refused', async () => {
  const f = fixture();
  const store = f.create();
  store.load();
  const pending = store.save(snapshot('first'));
  assert.throws(() => store.load(), /Wait for event saving/);
  assert.equal(await pending, true);
});

test('explicit reset can recover corrupt storage after confirmation in the UI', async () => {
  const f = fixture('{invalid json');
  const store = f.create();
  assert.throws(() => store.load());
  assert.equal(await store.reset(), true);
  assert.equal(f.raw, '[]');
  assert.equal(await store.save(snapshot('recovered')), true);
});

test('missing coordination APIs fail visibly instead of attempting an unsafe write', async () => {
  const f = fixture();
  const base = f.create();
  const store = new EventStorage({ getStorage: base.getStorage, locks: null, indexedDB: null });
  store.load();
  assert.equal(await store.save(snapshot('unsaved')), false);
  assert.equal(store.error.kind, 'save');
  assert.equal(f.raw, null);
});

test('invalid new timestamps cannot poison the saved event array', async () => {
  const f = fixture(snapshot('saved'));
  const store = f.create();
  store.load();
  assert.equal(await store.save(JSON.stringify([{ ...event('invalid'), start: null }])), false);
  assert.equal(f.raw, snapshot('saved'));
});

test('a failed explicit reset keeps the previous saved events intact', async () => {
  const f = fixture(snapshot('saved'));
  const store = f.create();
  store.load();
  f.failWrites = true;
  assert.equal(await store.reset(), false);
  assert.equal(f.raw, snapshot('saved'));
});

test('blocked storage access never attempts to replace unreadable data', async () => {
  const store = new EventStorage({
    getStorage: () => { throw new Error('Access denied'); },
    locks: { request: (_, callback) => Promise.resolve().then(callback) }
  });
  assert.throws(() => store.load(), /Access denied/);
  assert.equal(await store.save('[]'), false);
  assert.equal(store.error.kind, 'load');
});

vm.runInContext('class SpiralCalendar {}', context);
vm.runInContext(fs.readFileSync(new URL('../js/event-storage-ui.js', import.meta.url), 'utf8'), context);
const calendarPrototype = vm.runInContext('SpiralCalendar.prototype', context);

function calendarFixture(initial = snapshot('original')) {
  const f = fixture(initial);
  const calendar = Object.assign(Object.create(calendarPrototype), {
    events: [],
    eventStorage: f.create(),
    _eventsVersion: 0,
    state: { detailViewDay: null },
    mouseState: {},
    editingState: {},
    ensureEventColorMetadata: () => {},
    updateEventStorageNotice: () => {},
    drawSpiral: () => {},
    requestRender: () => {},
    requestEventListRender: () => {},
    recordStudyEventSnapshotDiff: () => {},
    isModeTransitionActive: () => false
  });
  return { f, calendar };
}

test('a failed calendar load preserves both the current events and the original stored bytes', async () => {
  const { f, calendar } = calendarFixture();
  assert.equal(calendar.loadEventsFromStorage(), true);
  f.raw = '{broken';
  assert.equal(calendar.loadEventsFromStorage(), false);
  assert.equal(calendar.events[0].title, 'original');
  assert.equal(await calendar.saveEventsToStorage(), false);
  assert.equal(f.raw, '{broken');
});

test('idle calendars refresh remote events, while unsaved edits are retained', async () => {
  const { f, calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  f.raw = snapshot('remote');
  calendar._externalEventStorageChangePending = true;
  calendar.refreshStoredEventsIfIdle();
  assert.equal(calendar.events[0].title, 'remote');
  assert.equal(calendar.hasUnsavedEventChanges(), false);
  calendar.events[0].title = 'local edit';
  f.raw = snapshot('new remote');
  calendar._externalEventStorageChangePending = true;
  calendar.refreshStoredEventsIfIdle();
  assert.equal(calendar.events[0].title, 'local edit');
  assert.equal(await calendar.saveEventsToStorage(), false);
  assert.equal(f.raw, snapshot('new remote'));
});

test('derived palette colors do not create unsaved edits, but custom colors do', () => {
  const { calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  calendar.events[0].color = '#123456';
  assert.equal(calendar.hasUnsavedEventChanges(), false);
  calendar.events[0].colorIsCustom = true;
  assert.equal(calendar.hasUnsavedEventChanges(), true);
});

test('a failed delete-all restores the current calendar events', async () => {
  const { f, calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  f.failWrites = true;
  assert.equal(await calendar.clearAllStoredEvents(), false);
  assert.equal(calendar.events[0].title, 'original');
  assert.equal(f.raw, snapshot('original'));
  assert.equal(calendar.hasUnsavedEventChanges(), false);
});

test('an event created while delete-all is pending cannot resurrect the deleted events', async () => {
  const { f, calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  const deleting = calendar.clearAllStoredEvents();
  calendar.events.push({ ...event('new'), start: new Date(event('new').start), end: new Date(event('new').end) });
  const saving = calendar.saveEventsToStorage();
  assert.deepEqual(await Promise.all([deleting, saving]), [true, true]);
  assert.deepEqual(JSON.parse(f.raw).map(e => e.title), ['new']);
  assert.equal(calendar.events.length, 1);
  assert.equal(calendar.hasUnsavedEventChanges(), false);
});
