import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, crypto: webcrypto });
for (const file of ['time-model', 'event-model']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
vm.runInContext(fs.readFileSync(new URL('../js/event-storage.js', import.meta.url), 'utf8'), context);
const EventStorage = context.SpiralEventStorage;
const key = EventStorage.KEY;
const event = title => ({
  title,
  start: '2026-10-08T09:00:00.000Z',
  end: '2026-10-08T10:00:00.000Z',
  calendar: 'Home',
  persistentUID: title, sequence: 0, timeModel: 'instant-v1',
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
  const f = fixture(snapshot('saved'));
  const store = f.create();
  assert.equal(JSON.stringify(store.load()), snapshot('saved'));
  assert.equal(await store.save(snapshot('saved')), true);
  assert.equal(f.writes, 0);
  assert.equal(f.raw, snapshot('saved'));
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
for (const file of ['event-projection', 'event-time', 'event-editing']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
vm.runInContext(fs.readFileSync(new URL('../js/event-storage-ui.js', import.meta.url), 'utf8'), context);
const calendarPrototype = vm.runInContext('SpiralCalendar.prototype', context);

test('versioned events retain actual instants in memory and storage without drift', async () => {
  const saved = { ...event('canonical'), timeModel: 'instant-v1' };
  const { f, calendar } = calendarFixture(JSON.stringify([saved]));
  calendar.state.useLocationTimezone = true;
  calendar.state.locationTimezoneId = 'Europe/Berlin';
  assert.equal(calendar.loadEventsFromStorage(), true);
  assert.equal(calendar.events[0].start.toISOString(), saved.start);
  assert.equal(calendar.getEventWallDate(calendar.events[0], 'start').toISOString(), '2026-10-08T11:00:00.000Z');
  assert.equal(calendar.hasUnsavedEventChanges(), false);
  assert.equal(await calendar.saveEventsToStorage(), true);
  assert.equal(JSON.parse(f.raw)[0].start, saved.start);
  calendar.applyEventTimeRange(calendar.events[0], context.SpiralTime.parseWall('2026-10-08T12:00'), context.SpiralTime.parseWall('2026-10-08T13:00'));
  assert.equal(await calendar.saveEventsToStorage(), true);
  assert.equal(JSON.parse(f.raw)[0].start, '2026-10-08T10:00:00.000Z');
  assert.equal(calendar.hasUnsavedEventChanges(), false);
});

test('calendar revisions increase once per edit, including rapid saves, and survive a failed write retry', async () => {
  const { f, calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  const uid = calendar.events[0].persistentUID;
  calendar.events[0].title = 'First edit';
  const first = calendar.saveEventsToStorage();
  calendar.events[0].title = 'Second edit';
  const second = calendar.saveEventsToStorage();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(JSON.parse(f.raw)[0].sequence, 2);
  f.failWrites = true;
  calendar.events[0].description = 'Unsaved change';
  assert.equal(await calendar.saveEventsToStorage(), false);
  assert.equal(calendar.events[0].sequence, 3);
  f.failWrites = false;
  assert.equal(await calendar.saveEventsToStorage(), true);
  assert.equal(JSON.parse(f.raw)[0].sequence, 3);
  assert.equal(JSON.parse(f.raw)[0].persistentUID, uid);
  calendar.loadEventsFromStorage();
  calendar.events[0].title = 'After reload';
  assert.equal(await calendar.saveEventsToStorage(), true);
  assert.equal(JSON.parse(f.raw)[0].sequence, 4);
});

test('ambiguous or duplicate records cannot be loaded into the current event store', () => {
  const current = event('current');
  for (const records of [[{ ...current, timeModel: undefined }], [{ ...current, sequence: undefined }],
    [{ ...current, start: '2026-10-08T09:00' }], [current, current]]) {
    const original = JSON.stringify(records);
    const f = fixture(original);
    assert.throws(() => f.create().load());
    assert.equal(f.raw, original);
  }
});

test('stored repeated-hour events load without changing the original bytes', () => {
  const saved = { ...event('repeated hour'), timeModel: 'instant-v1',
    start: '2026-10-25T00:45:00.000Z', end: '2026-10-25T01:15:00.000Z' };
  const raw = JSON.stringify([saved]);
  const { f, calendar } = calendarFixture(raw);
  calendar.state.useLocationTimezone = true;
  calendar.state.locationTimezoneId = 'Europe/Berlin';
  calendar.events = [{ title: 'Keep current memory' }];
  assert.equal(calendar.loadEventsFromStorage(), true);
  assert.equal(f.raw, raw);
  assert.equal(calendar.events[0].start.toISOString(), saved.start);
  assert.equal(calendar.getEventProjection(calendar.events[0]).intervals.length, 2);
  assert.equal(calendar.hasUnsavedEventChanges(), false);
});

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

test('shared editing retains failed saves and retries without increasing the revision twice', async () => {
  const { f, calendar } = calendarFixture();
  calendar.loadEventsFromStorage();
  const originalRaw = f.raw;
  const event = calendar.events[0];
  const save = calendar.saveEventsToStorage.bind(calendar);
  let pending;
  calendar.saveEventsToStorage = () => (pending = save());
  f.failWrites = true;
  assert.equal(calendar.editEvent(event, { title: 'Unsaved edit' }), true);
  assert.equal(await pending, false);
  assert.equal(f.raw, originalRaw);
  assert.equal(calendar.events[0], event);
  assert.equal(calendar.hasUnsavedEventChanges(), true);
  const sequence = event.sequence;
  f.failWrites = false;
  assert.equal(await calendar.persistEditedEvent(event), true);
  assert.equal(event.sequence, sequence);
  assert.equal(JSON.parse(f.raw)[0].title, 'Unsaved edit');
  assert.equal(calendar.hasUnsavedEventChanges(), false);
});

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
