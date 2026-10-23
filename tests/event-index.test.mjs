import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  alert() {}, SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection', 'core-methods',
  'state-storage-sync', 'event-time', 'event-index', 'event-editing', 'render-geometry', 'render-spiral']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const Time = context.SpiralTime;
const Index = context.SpiralEventIntervalIndex;
function randomSource() {
  let seed = 123456789;
  return () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 2 ** 32);
}
function calendar() {
  const app = new context.SpiralCalendar();
  Object.assign(app, { events: [], _eventsVersion: 0, mouseState: {},
    state: { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin', visibleCalendars: ['Home'],
      days: 7, rotation: 0 }, referenceTime: Time.parseWall('2026-10-25T00:00'),
    saveEventsToStorage: () => Promise.resolve(true), drawSpiral() {}, requestEventListRender() {},
    getDisplayColorForEvent: event => event.color,
    getRenderVisibilityRange: theta => ({ min: -app.state.rotation - 2 * Math.PI,
      max: -app.state.rotation + theta - 2 * Math.PI }) });
  return app;
}
function add(app, start, end, options = {}) {
  const event = app.normalizeRuntimeEvent({ start, end, calendar: 'Home', ...options });
  app.events.push(event);
  app._eventsVersion++;
  return event;
}

test('indexed interval queries match a full scan in source order, with exclusive ends and nested spans', () => {
  const random = randomSource();
  const entries = Array.from({ length: 400 }, (_, id) => {
    const startMs = Math.floor(random() * 2000) - 1000;
    return { startMs, endMs: startMs + Math.floor(random() * 200) + 1, event: { id } };
  });
  entries.push({ startMs: -100000, endMs: 100000, event: { id: 400 } });
  const index = new Index(entries);
  for (let i = 0; i < 300; i++) {
    const from = Math.floor(random() * 2200) - 1100, to = from + Math.floor(random() * 150) + 1;
    const expected = entries.filter(entry => entry.startMs < to && entry.endMs > from);
    assert.deepEqual(Array.from(index.query(from, to), entry => entry.event.id), expected.map(entry => entry.event.id));
  }
  assert.equal(new Index([]).query(0, 1).length, 0);
  assert.equal(index.query(10, 10).length, 0);
  const touching = new Index([{ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 }]);
  assert.deepEqual(Array.from(touching.query(10, 20), entry => entry.order), [1]);
});

test('sparse queries prune unrelated branches rather than visiting a large calendar', () => {
  const index = new Index(Array.from({ length: 10000 }, (_, i) => ({ startMs: i * 100, endMs: i * 100 + 10 })));
  let reads = 0;
  index.entries = new Proxy(index.entries, { get(target, property) {
    if (/^\d+$/.test(String(property))) reads++;
    return Reflect.get(target, property);
  } });
  assert.equal(index.query(900000, 900010).length, 1);
  assert.ok(reads < 64, `Read ${reads} intervals for one sparse query.`);
});

test('boundary lookups retain precise half-open coverage and exclude other pieces of the same event', () => {
  const a = {}, b = {}, c = {};
  const entries = [{ startMs: 0, endMs: 10, event: a }, { startMs: 10, endMs: 20, event: a },
    { startMs: 4.5, endMs: 7, event: b }, { startMs: 20, endMs: 30, event: c }];
  const lookup = new Index(entries).boundaryLookup;
  for (const target of [a, b, c]) for (const time of [-1, 0, 4.4, 4.5, 7, 10, 20, 30]) {
    assert.equal(lookup.isEventOverlappedAtLayout(target, time), entries.some(e =>
      e.event !== target && e.startMs <= time && time < e.endMs));
    assert.equal(lookup.isEventTouchingAtStartLayout(target, time), entries.some(e => e.event !== target && e.endMs === time));
    assert.equal(lookup.isEventTouchingAtEndLayout(target, time), entries.some(e => e.event !== target && e.startMs === time));
  }
});

test('hour entries equal full projection scans across DST changes, all-day events, and distant dates', () => {
  const app = calendar();
  add(app, '2026-10-25T00:10:00Z', '2026-10-25T01:50:00Z');
  add(app, '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', {
    allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' });
  add(app, '2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z');
  add(app, '2026-04-04T14:00:00Z', '2026-04-04T16:00:00Z');
  add(app, '2027-11-01T08:00:00Z', '2027-11-01T09:00:00Z');
  for (const zone of ['Europe/Berlin', 'Australia/Lord_Howe', 'Asia/Kathmandu']) {
    app.state.locationTimezoneId = zone;
    for (const day of ['2026-10-25', '2026-03-29', '2026-04-05', '2027-11-01']) {
      app.referenceTime = Time.parseWall(day + 'T00:00');
      for (let hour = -1; hour <= 24; hour++) {
        const absolute = app.getTotalVisibleSegments() - hour - 1;
        const position = { day: Math.floor(absolute / 24), segment: ((absolute % 24) + 24) % 24 };
        const range = app.getSegmentHourRange(position.day, position.segment);
        const expected = app.events.flatMap(event => app.getEventProjection(event).intervals
          .filter(interval => interval.layoutStartMs < range.endMs && interval.layoutEndMs > range.startMs)
          .map(interval => [event.persistentUID, interval.index,
            (Math.max(interval.layoutStartMs, range.startMs) - range.startMs) / 60000,
            (Math.min(interval.layoutEndMs, range.endMs) - range.startMs) / 60000]));
        assert.deepEqual(Array.from(app.getAllEventsForSegment(position.day, position.segment), entry =>
          [entry.event.persistentUID, entry.displayInterval.index, entry.startMinute, entry.endMinute]), expected);
      }
    }
  }
});

test('the index is reused across frames and navigation and refreshes after edits, filters, and zone changes', () => {
  const app = calendar();
  const event = add(app, '2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z');
  const index = app.getEventIntervalIndex();
  assert.equal(app.createVisibleEventBoundaryLookup(), app.createVisibleEventBoundaryLookup());
  app.state.rotation += 20 * 2 * Math.PI;
  assert.equal(app.getEventIntervalIndex(), index);
  app.state.rotation = 0;
  app.editEvent(event, { end: new Date('2026-10-25T01:30:00Z') });
  const edited = app.getEventIntervalIndex();
  assert.notEqual(edited, index);
  app.state.visibleCalendars = [];
  assert.equal(app.getEventIntervalIndex().entries.length, 0);
  app.state.visibleCalendars = ['Home'];
  assert.equal(app.getEventIntervalIndex().entries.length, 2);
  app.ensureLayoutCache();
  const layout = app.layoutCache;
  const berlin = app.getEventIntervalIndex();
  app.state.locationTimezoneId = 'Pacific/Honolulu';
  assert.notEqual(app.getEventIntervalIndex(), berlin);
  app.ensureLayoutCache();
  assert.notEqual(app.layoutCache, layout);
});

test('warm hour queries avoid projecting unrelated stored events and keep draft times and colors current', () => {
  const app = calendar();
  const event = add(app, '2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z');
  const position = app.getSegmentPositionFromId(2);
  app.getEventIntervalIndex();
  const project = app.getEventProjection.bind(app);
  let projections = 0;
  app.getEventProjection = (...args) => { projections++; return project(...args); };
  for (let hour = 0; hour < 144; hour++) {
    const point = app.getSegmentPositionFromId(hour);
    app.getAllEventsForSegment(point.day, point.segment);
  }
  assert.equal(projections, 0);
  event.color = '#aabbcc';
  assert.equal(app.getAllEventsForSegment(position.day, position.segment)[0].color, '#aabbcc');
  app.draftEvent = { ...event, isDraft: true, segmentId: 2 };
  app.mouseState.selectedSegmentId = 2;
  assert.equal(app.getAllEventsForSegment(position.day, position.segment).length, 2);
  app.draftEvent.start = new Date('2026-10-25T02:00:00Z');
  app.draftEvent.end = new Date('2026-10-25T03:00:00Z');
  assert.equal(app.getAllEventsForSegment(position.day, position.segment).length, 1);
  assert.equal(app.getAllEventsForSegment(position.day, position.segment - 1).at(-1).event, app.draftEvent);
});

test('a dense overlap group and its disconnected neighbors receive the same component lane counts', () => {
  const app = calendar();
  const a = add(app, '2026-10-25T08:00:00Z', '2026-10-25T09:00:00Z');
  const b = add(app, '2026-10-25T08:30:00Z', '2026-10-25T10:00:00Z');
  const c = add(app, '2026-10-25T09:30:00Z', '2026-10-25T10:30:00Z');
  const after = add(app, '2026-10-25T10:30:00Z', '2026-10-25T11:00:00Z');
  for (let i = 0; i < 300; i++) add(app, '2026-10-25T12:00:00Z', '2026-10-25T13:00:00Z');
  const { eventToLane, eventToComponent, componentLaneCount } = app.computeEventOverlapLayout();
  assert.equal(eventToComponent.get(a), eventToComponent.get(c));
  assert.equal(componentLaneCount.get(eventToComponent.get(b)), 2);
  assert.notEqual(eventToComponent.get(c), eventToComponent.get(after));
  assert.equal(componentLaneCount.get(eventToComponent.get(after)), 1);
  assert.equal(componentLaneCount.get(eventToComponent.get(app.events.at(-1))), 300);
});

test('overlap components match independent pairwise connectivity for shuffled, nested intervals', () => {
  const app = calendar(), random = randomSource();
  for (let i = 0; i < 100; i++) {
    const start = Date.parse('2026-10-25T07:00:00Z') + Math.floor(random() * 400) * 60000;
    add(app, new Date(start), new Date(start + (Math.floor(random() * 75) + 1) * 60000));
  }
  const records = app.getEventIntervalsForWindow();
  const groups = new Map();
  let group = 0;
  for (let i = 0; i < records.length; i++) {
    if (groups.has(i)) continue;
    const queue = [i];
    groups.set(i, group);
    while (queue.length) {
      const a = records[queue.pop()];
      for (let j = 0; j < records.length; j++) {
        const b = records[j];
        if (!groups.has(j) && a.startMs < b.endMs && b.startMs < a.endMs) {
          groups.set(j, group);
          queue.push(j);
        }
      }
    }
    group++;
  }
  const { eventToLane, eventToComponent } = app.computeEventOverlapLayout();
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    assert.equal(eventToComponent.get(records[i].displayInterval) === eventToComponent.get(records[j].displayInterval),
      groups.get(i) === groups.get(j));
    if (records[i].startMs < records[j].endMs && records[j].startMs < records[i].endMs) {
      assert.notEqual(eventToLane.get(records[i].displayInterval), eventToLane.get(records[j].displayInterval));
    }
  }
});

test('rendering resolves the device zone once per frame and refreshes it after changes or errors', () => {
  const app = calendar();
  add(app, '2026-10-25T08:00:00Z', '2026-10-25T09:00:00Z');
  app.state.useLocationTimezone = false;
  delete app.drawSpiral;
  let zone = 'Europe/Berlin', resolutions = 0;
  const previousIntl = context.Intl;
  context.Intl = { DateTimeFormat(locale, options) {
    if (options?.timeZone) return new Intl.DateTimeFormat(locale, options);
    resolutions++;
    return { resolvedOptions: () => ({ timeZone: zone }) };
  } };
  try {
    app.drawSpiralFrame = () => {
      for (let hour = 0; hour < 144; hour++) {
        const position = app.getSegmentPositionFromId(hour);
        app.getAllEventsForSegment(position.day, position.segment);
        assert.equal(app.getCalendarTimeZone(), zone);
      }
    };
    app.drawSpiral();
    assert.equal(resolutions, 1);
    const index = app.getEventIntervalIndex();
    assert.equal(resolutions, 2);
    zone = 'Pacific/Honolulu';
    app.drawSpiral();
    assert.equal(resolutions, 3);
    assert.equal(app._eventIntervalIndex.zone, zone);
    assert.notEqual(app._eventIntervalIndex.index, index);
    app.drawSpiralFrame = () => { throw new Error('Canvas failed'); };
    assert.throws(() => app.drawSpiral(), /Canvas failed/);
    assert.equal(resolutions, 4);
    zone = 'Asia/Kathmandu';
    assert.equal(app.getCalendarTimeZone(), zone);
    assert.equal(resolutions, 5);
  } finally {
    context.Intl = previousIntl;
  }
});

test('overlap lanes and fixed widths remain stable when their earlier neighbor leaves the visible window', () => {
  const app = calendar();
  const a = add(app, '2026-10-25T06:00:00Z', '2026-10-25T07:00:00Z', { timeModel: 'instant-v1' });
  const b = add(app, '2026-10-25T06:30:00Z', '2026-10-25T09:00:00Z', { timeModel: 'instant-v1' });
  const c = add(app, '2026-10-25T08:00:00Z', '2026-10-25T08:30:00Z', { timeModel: 'instant-v1' });
  // After the fold, these canonical times correspond to 07:00, 07:30, and 09:00 locally.
  let firstHour = 7;
  app.visibleWindowStart = () => Time.parseWall(`2026-10-25T${String(firstHour).padStart(2, '0')}:00`);
  app.visibleWindowEnd = () => Time.parseWall('2026-10-25T12:00');
  const snapshot = () => {
    app.ensureLayoutCache();
    const { eventToLane, eventToComponent, componentLaneCount } = app.layoutCache;
    return [b, c].map(event => [eventToLane.get(event), componentLaneCount.get(eventToComponent.get(event))]);
  };
  const before = snapshot();
  assert.ok(before.every(([lane, count]) => Number.isInteger(lane) && count === 2));
  firstHour = 8;
  assert.deepEqual(snapshot(), before);
  assert.ok(app.visibleWindowStart() >= app.getEventWallDate(a, 'end'));
});

test('identical event times use persistent identities to retain lane order across import order', () => {
  const records = ['uid-z', 'uid-a', 'uid-m'].map(persistentUID => ({ persistentUID, timeModel: 'instant-v1',
    start: '2026-10-25T08:00:00Z', end: '2026-10-25T10:00:00Z' }));
  const snapshots = [records, [...records].reverse(), [records[1], records[0], records[2]]].map(order => {
    const app = calendar();
    for (const record of order) add(app, record.start, record.end, record);
    const { eventToLane } = app.computeEventOverlapLayout();
    return app.events.map(event => [event.persistentUID, eventToLane.get(event)]).sort((a, b) => a[0].localeCompare(b[0]));
  });
  assert.deepEqual(snapshots[1], snapshots[0]);
  assert.deepEqual(snapshots[2], snapshots[0]);
});

test('draft time changes refresh shared lanes, and adding the draft retains its lane assignment', () => {
  const app = calendar();
  app.finishActiveDetailTextEditor = () => {};
  const saved = add(app, '2026-10-25T08:00:00Z', '2026-10-25T08:30:00Z', { timeModel: 'instant-v1' });
  const draft = app.normalizeRuntimeEvent({ title: 'Draft', timeModel: 'instant-v1', calendar: 'Home',
    start: '2026-10-25T08:30:00Z', end: '2026-10-25T09:00:00Z' });
  Object.assign(draft, { isDraft: true, segmentId: 9 });
  app.draftEvent = draft;
  app.mouseState.selectedSegmentId = 9;
  const snapshot = events => {
    app.ensureLayoutCache();
    const { eventToLane, eventToComponent, componentLaneCount } = app.layoutCache;
    return events.map(event => [eventToLane.get(event), componentLaneCount.get(eventToComponent.get(event))]);
  };
  assert.deepEqual(snapshot([saved, draft]), [[0, 1], [0, 1]]);
  const version = app._eventsVersion;
  // Handle drags can update the draft directly without changing the stored events version.
  draft.start = new Date('2026-10-25T08:00:00Z');
  const overlapping = snapshot([saved, draft]);
  assert.equal(app._eventsVersion, version);
  assert.ok(overlapping.every(([lane, count]) => Number.isInteger(lane) && count === 2));
  assert.notEqual(overlapping[0][0], overlapping[1][0]);
  app.mouseState.selectedSegmentId = null;
  assert.deepEqual(snapshot([saved]), [[0, 1]], 'An inactive draft must stop occupying a lane.');
  app.mouseState.selectedSegmentId = 9;
  assert.deepEqual(snapshot([saved, draft]), overlapping);
  const added = app.addDraftEvent();
  assert.ok(added);
  assert.equal(app.draftEvent, null);
  assert.deepEqual(snapshot([saved, added]), overlapping);
});

test('all-day overlap follows calendar dates in the display zone rather than its original stored instants', () => {
  const app = calendar();
  const allDay = add(app, '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', {
    timeModel: 'instant-v1', allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' });
  const late = add(app, '2026-10-26T08:00:00Z', '2026-10-26T09:00:00Z', { timeModel: 'instant-v1' });
  assert.ok(allDay.end <= late.start, 'The original canonical instants do not overlap.');
  app.state.locationTimezoneId = 'Pacific/Honolulu';
  const point = app.getSegmentPositionFromId(22);
  assert.deepEqual(new Set(Array.from(app.getAllEventsForSegment(point.day, point.segment), entry => entry.event)),
    new Set([allDay, late]), 'Both events occupy October 25 at 22:00 in the chosen display zone.');
  app.ensureLayoutCache();
  let { eventToLane, eventToComponent, componentLaneCount } = app.layoutCache;
  assert.notEqual(eventToLane.get(allDay), eventToLane.get(late));
  assert.equal(eventToComponent.get(allDay), eventToComponent.get(late));
  assert.equal(componentLaneCount.get(eventToComponent.get(allDay)), 2);
  app.state.locationTimezoneId = 'UTC';
  app.ensureLayoutCache();
  ({ eventToLane, eventToComponent, componentLaneCount } = app.layoutCache);
  assert.notEqual(eventToComponent.get(allDay), eventToComponent.get(late));
  assert.equal(componentLaneCount.get(eventToComponent.get(allDay)), 1);
  assert.equal(componentLaneCount.get(eventToComponent.get(late)), 1);
});
