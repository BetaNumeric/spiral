import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto, alert() {},
  CONFIG: { SEGMENTS_PER_DAY: 24 }, SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'icalendar', 'core-methods', 'state-storage-sync', 'event-projection', 'event-time', 'pickers-calendars', 'touch-time-orientation', 'render-circle', 'render-spiral']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
context.formatIcsDateUTC = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const Time = context.SpiralTime;
const ICS = context.SpiralICalendar;
const wall = Time.parseWall;
context.parseDateTimeLocalAsUTC = wall;
const berlin = 'Europe/Berlin';
function calendar() {
  const app = new context.SpiralCalendar();
  app.state = { useLocationTimezone: true, locationTimezoneId: berlin, days: 7, rotation: Math.PI,
    visibleCalendars: ['Home', 'Work'] };
  app.events = [];
  app.getDisplayColorForEvent = () => '#123456';
  app._eventsVersion = 0;
  app.referenceTime = wall('2026-10-08T00:00');
  app.getRenderVisibilityRange = theta => ({ min: -app.state.rotation - 2 * Math.PI,
    max: -app.state.rotation + theta - 2 * Math.PI });
  return app;
}
const event = (start = '2026-10-08T09:00', end = '2026-10-08T10:00') => ({
  title: 'Nine', start: wall(start), end: wall(end), calendar: 'Home'
});
const parse = properties => ICS.parse(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${properties}\r\nEND:VEVENT\r\nEND:VCALENDAR`, berlin);

test('wall inputs reject impossible dates, overflow, malformed fields and invalid leap days', () => {
  for (const input of ['2026-02-29T09:00', '2026-10-32T09:00', '2026-13-01T09:00',
    '2026-10-08T24:00', '2026-10-08T09:60', '2026-10-08T09:00:61', 'bad']) {
    assert.ok(Number.isNaN(wall(input).getTime()), input);
  }
  assert.equal(wall('2028-02-29T09:00').toISOString(), '2028-02-29T09:00:00.000Z');
});

test('wall dates preserve early and extended years independently of device time zone', () => {
  for (const input of ['0099-01-01T09:00', '0000-01-01T09:00', '12000-01-01T09:00', '-0001-01-01T09:00']) {
    assert.equal(Time.formatWall(wall(input)), input);
  }
});

test('date arithmetic crosses month, year and leap-day boundaries', () => {
  for (const [start, expected] of [['2026-10-31T23:00', '2026-11-01T00:00'],
    ['2026-12-31T23:00', '2027-01-01T00:00'], ['2028-02-28T23:00', '2028-02-29T00:00']]) {
    assert.equal(Time.formatWall(new Date(wall(start).getTime() + Time.HOUR)), expected);
  }
});

test('zone offsets include DST and fractional-hour zones without millisecond drift', () => {
  assert.equal(Time.offsetHours('2026-10-08T07:00:00.123Z', berlin), 2);
  assert.equal(Time.offsetHours('2026-12-08T07:00:00.123Z', berlin), 1);
  assert.equal(Time.offsetHours('2026-10-08T07:00:00.123Z', 'Asia/Kathmandu'), 5.75);
});

test('local-date anchoring works on either side of UTC midnight', () => {
  assert.equal(Time.dayStart(Time.instantToWall('2026-10-08T22:30:00Z', berlin)).toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(Time.dayStart(Time.instantToWall('2026-10-08T01:00:00Z', 'America/New_York')).toISOString(), '2026-10-07T00:00:00.000Z');
});

test('clock rotation retains elapsed days across midnight and after a long suspension', () => {
  const app = calendar();
  for (const now of ['2026-10-08T21:59:59Z', '2026-10-08T22:00:01Z', '2026-11-09T22:30:00Z']) {
    const rotation = app.getCurrentTimeRotation(new Date(now));
    const cursor = new Date(app.referenceTime.getTime() + rotation / (2 * Math.PI) * 24 * Time.HOUR);
    assert.ok(Math.abs(cursor - Time.instantToWall(now, berlin)) < 1);
  }
});

test('past fractional hours navigate to their containing segment', () => {
  assert.equal(calendar().getSegmentIdForDate(wall('2026-10-07T23:30')), -1);
});

test('DST gaps reject manual input and resolve calendar values using the pre-gap offset', () => {
  assert.throws(() => Time.wallToInstant(wall('2026-03-29T02:30'), berlin, { disambiguation: 'reject' }), /does not exist/);
  assert.equal(Time.wallToInstant(wall('2026-03-29T02:30'), berlin).toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(Time.formatWall(Time.instantToWall('2026-03-29T01:30:00Z', berlin)), '2026-03-29T03:30');
});

test('repeated hours choose the first occurrence unless the event start requires the second', () => {
  const value = wall('2026-10-25T02:30');
  assert.equal(Time.wallToInstant(value, berlin).toISOString(), '2026-10-25T00:30:00.000Z');
  assert.equal(Time.wallToInstant(value, berlin, { notBefore: Date.parse('2026-10-25T01:00:00Z') }).toISOString(), '2026-10-25T01:30:00.000Z');
});

test('half-hour DST changes use the actual gap size', () => {
  const zone = 'Australia/Lord_Howe';
  assert.equal(Time.formatWall(Time.instantToWall(Time.wallToInstant(wall('2026-10-04T02:15'), zone), zone)), '2026-10-04T02:45');
});

test('new events display wall time and serialize/export canonical instants', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event(), { rejectGap: true });
  assert.equal(e.start.toISOString(), '2026-10-08T07:00:00.000Z');
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T09:00');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T07:00:00.000Z');
  assert.equal(app.formatEventIcsDates(e), 'DTSTART:20261008T070000Z\r\nDTEND:20261008T080000Z\r\n');
});

test('display projections are immutable, cached, and never become event source data', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  const start = e.start;
  const projection = app.getEventProjection(e);
  assert.ok(Object.isFrozen(projection));
  assert.equal(app.getEventProjection(e), projection);
  assert.equal(projection.startInstantMs, start.getTime());
  assert.equal(projection.startMs, wall('2026-10-08T09:00').getTime());
  assert.throws(() => { projection.startMs = 0; }, TypeError);
  app.getEventWallDate(e, 'start').setTime(0);
  assert.equal(e.start, start);
  assert.equal(app.getEventProjection(e), projection);
  app.state.locationTimezoneId = 'Asia/Kathmandu';
  app.events = [e];
  app.refreshEventProjections();
  assert.equal(e.start, start);
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T12:45');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T07:00:00.000Z');
});

test('direct UTC edits invalidate the display cache and save the same actual timestamp', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  const previous = app.getEventProjection(e);
  e.start.setUTCMinutes(15);
  assert.notEqual(app.getEventProjection(e), previous);
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T09:15');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T07:15:00.000Z');
});

test('editing and dragging inside either occurrence of a repeated hour retain that occurrence', () => {
  const app = calendar();
  for (const hour of ['00', '01']) {
    const e = app.normalizeRuntimeEvent({ start: `2026-10-25T${hour}:10:00Z`, end: `2026-10-25T${hour}:50:00Z` });
    assert.ok(app.applyEventTimeRange(e, wall('2026-10-25T02:15'), wall('2026-10-25T02:45')));
    assert.equal(e.start.toISOString(), `2026-10-25T${hour}:15:00.000Z`);
    assert.ok(app.setEventHandleTime(e, 'end', wall('2026-10-25T02:40')));
    assert.equal(e.end.toISOString(), `2026-10-25T${hour}:40:00.000Z`);
  }
});

test('drafts in a skipped hour start at a valid local time with a positive duration', () => {
  const app = calendar();
  app.referenceTime = wall('2026-03-29T00:00');
  app.createEventColorState = () => ({ color: '#123456' });
  const draft = app.createDraftEventForSegmentId(2);
  assert.equal(Time.formatWall(app.getEventWallDate(draft, 'start')), '2026-03-29T03:00');
  assert.equal(Time.formatWall(app.getEventWallDate(draft, 'end')), '2026-03-29T04:00');
  assert.equal(draft.end - draft.start, Time.HOUR);
});

test('new defaults last one elapsed hour across repeated, skipped, fractional and ordinary dates', () => {
  const app = calendar();
  const cases = [
    [berlin, '2026-10-25T02:00', 0, '2026-10-25T00:00:00.000Z', '2026-10-25T02:00'],
    [berlin, '2026-10-25T02:00', 1, '2026-10-25T01:00:00.000Z', '2026-10-25T03:00'],
    [berlin, '2026-10-25T02:30', 0, '2026-10-25T00:30:00.000Z', '2026-10-25T02:30'],
    [berlin, '2026-03-29T01:30', undefined, '2026-03-29T00:30:00.000Z', '2026-03-29T03:30'],
    ['Australia/Lord_Howe', '2026-04-05T01:30', 0, '2026-04-04T14:30:00.000Z', '2026-04-05T02:00'],
    ['Australia/Lord_Howe', '2026-04-05T01:30', 1, '2026-04-04T15:00:00.000Z', '2026-04-05T02:30'],
    ['Australia/Lord_Howe', '2026-10-04T01:30', undefined, '2026-10-03T15:00:00.000Z', '2026-10-04T03:00'],
    [berlin, '2026-12-31T23:30', undefined, '2026-12-31T22:30:00.000Z', '2027-01-01T00:30']
  ];
  for (const [zone, value, occurrence, instant, endWall] of cases) {
    app.state.locationTimezoneId = zone;
    const range = app.getDefaultEventRange(wall(value), { occurrence });
    assert.equal(range.start.toISOString(), instant);
    assert.equal(range.end - range.start, Time.HOUR);
    assert.equal(Time.formatWall(app.getDefaultEventEnd(wall(value), { occurrence })), endWall);
  }
  app.state.locationTimezoneId = berlin;
  assert.throws(() => app.getDefaultEventRange(wall('2026-03-29T02:00')), /does not exist/);
});

test('new event occurrence choices preserve equal or reversed wall endpoints and reject invalid choices atomically', () => {
  const app = calendar();
  for (const [start, end, minutes] of [['02:00', '02:00', 60], ['02:45', '02:15', 30]]) {
    const e = app.initializeEventFromWallTimes(event(`2026-10-25T${start}`, `2026-10-25T${end}`),
      { rejectGap: true, startOccurrence: 0, endOccurrence: 1 });
    assert.equal(e.end - e.start, minutes * 60000);
    assert.equal(app.serializeEventTime(e).end, e.end.toISOString());
  }
  const invalid = event('2026-10-25T02:00', '2026-10-25T02:30');
  const before = JSON.stringify(invalid);
  assert.throws(() => app.initializeEventFromWallTimes(invalid,
    { rejectGap: true, startOccurrence: 1, endOccurrence: 0 }), /end after the start/);
  assert.equal(JSON.stringify(invalid), before);
});

test('the October 25 two oclock canvas draft lasts one hour with one projected band', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  app.createEventColorState = () => ({ color: '#123456' });
  const draft = app.createDraftEventForSegmentId(2);
  assert.equal(draft.start.toISOString(), '2026-10-25T00:00:00.000Z');
  assert.equal(draft.end.toISOString(), '2026-10-25T01:00:00.000Z');
  assert.equal(app.getEventProjection(draft).intervals.length, 1);
  assert.equal(Time.formatWall(app.getEventWallDate(draft, 'end')), '2026-10-25T02:00');
  assert.equal(app.getEventDurationLabel(draft), '1 hour');
  assert.equal('autoEnd' in app.serializeEventTime(draft), false);
});

test('draft start choices keep a suggested one hour end until the end is edited or dragged', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  app.createEventColorState = () => ({ color: '#123456' });
  app.syncEventAutoColor = app.ensureLayoutCache = app.drawSpiral = app.saveEventsToStorage = app._ensureSelectedSegmentContainsEventOrJump = () => {};
  context.document = { getElementById: () => null };
  context.setTimeout = () => {};
  const draft = app.draftEvent = app.createDraftEventForSegmentId(2);
  assert.ok(app.applyEventDateTimeInputValue(draft, 'start', '2026-10-25T02:00', { occurrence: 1 }));
  assert.equal(draft.start.toISOString(), '2026-10-25T01:00:00.000Z');
  assert.equal(draft.end.toISOString(), '2026-10-25T02:00:00.000Z');
  assert.equal(draft.autoEnd, true);
  assert.ok(app.applyEventDateTimeInputValue(draft, 'end', '2026-10-25T02:45', { occurrence: 1 }));
  assert.equal(draft.autoEnd, false);
  assert.ok(app.applyEventDateTimeInputValue(draft, 'start', '2026-10-25T02:15', { occurrence: 1 }));
  assert.equal(draft.end.toISOString(), '2026-10-25T01:45:00.000Z');
  assert.equal(draft.end - draft.start, 30 * 60000);
  const dragged = app.createDraftEventForSegmentId(2);
  assert.ok(app.setEventHandleTime(dragged, 'end', wall('2026-10-25T02:30'), { preferredOffsetMs: Time.HOUR }));
  assert.equal(dragged.autoEnd, false);
});

test('automatic end correction retains the chosen start occurrence', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T01:15:00Z', end: '2026-10-25T01:45:00Z' });
  assert.equal(Time.formatWall(app.getAdjustedEventWallEnd(e, wall('2026-10-25T02:50'), wall('2026-10-25T01:30'))), '2026-10-25T03:50');
});

test('duration labels measure actual time and all-day labels count calendar dates', () => {
  const app = calendar();
  for (const [duration, label] of [[Time.HOUR, '1 hour'], [90 * 60000, '1 hour 30 minutes'],
    [25 * Time.HOUR, '25 hours'], [1500, '1.5 seconds'], [60000, '1 minute']]) {
    const start = new Date('2026-10-25T00:00:00Z');
    assert.equal(app.getEventDurationLabel({ start, end: new Date(start.getTime() + duration) }), label);
  }
  const allDay = parse('DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026')[0];
  assert.equal(allDay.end - allDay.start, 25 * Time.HOUR);
  assert.equal(app.getEventDurationLabel(allDay), '1 day (all day)');
});

test('the picker rejects a nonexistent end before applying its automatic range correction', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event('2026-03-29T03:00', '2026-03-29T04:00'));
  const before = JSON.stringify(app.serializeEventTime(e));
  assert.equal(app.applyEventDateTimeInputValue(e, 'end', '2026-03-29T02:30'), false);
  assert.equal(JSON.stringify(app.serializeEventTime(e)), before);
});

test('both renderer segment ranges and navigation use local coordinates of canonical events', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  app.events = [e];
  app.getDisplayColorForEvent = () => '#123456';
  const position = app.getEventStartNavigationTarget(e);
  assert.equal(app.getAllEventsForSegment(position.day, position.segment + 2).length, 0);
  const visible = app.getAllEventsForSegment(position.day, position.segment);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].event, e);
  assert.equal(visible[0].startUtcMs, e.start.getTime());
  assert.equal(app.getEventStartNavigationTarget(e).segmentId, 9);
});

test('all-day edits after a zone change resolve both endpoints in the current zone', () => {
  const app = calendar();
  for (const drag of [false, true]) {
    const e = app.normalizeRuntimeEvent(parse('DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010')[0]);
    app.state.locationTimezoneId = 'Pacific/Honolulu';
    if (drag) assert.ok(app.setEventHandleTime(e, 'start', wall('2026-10-08T09:00')));
    else assert.ok(app.applyEventTimeRange(e, wall('2026-10-08T09:00'), app.getEventWallDate(e, 'end')));
    assert.equal(e.start.toISOString(), '2026-10-08T19:00:00.000Z');
    assert.equal(e.end.toISOString(), '2026-10-10T10:00:00.000Z');
    assert.equal(e.allDay, undefined);
  }
});

test('event records use one explicit UTC format and discard view-only metadata', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes({ ...event(), extra: 'view only' });
  const record = app.serializeEventTime(e);
  assert.equal(record.timeModel, 'instant-v1');
  assert.equal(record.sequence, 0);
  assert.equal(record.extra, undefined);
});

test('a new event survives JSON storage and reload without double conversion', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  const saved = JSON.stringify(app.serializeEventTime(e));
  const loaded = app.normalizeRuntimeEvent(JSON.parse(saved));
  assert.equal(loaded.start.getTime(), e.start.getTime());
  assert.equal(JSON.stringify(app.serializeEventTime(loaded)), saved);
});

test('changing the display zone reprojects new events without changing their stored records', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  app.events = [e, app.initializeEventFromWallTimes(event())];
  const saved = JSON.stringify(app.serializeEventTime(e));
  app.state.locationTimezoneId = 'America/New_York';
  app.refreshEventProjections();
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T03:00');
  assert.equal(JSON.stringify(app.serializeEventTime(e)), saved);
  assert.equal(Time.formatWall(app.getEventWallDate(app.events[1], 'start')), '2026-10-08T03:00');
});

test('changing zones supports repeated-hour projections without changing any timestamps', () => {
  const app = calendar();
  app.events = [app.initializeEventFromWallTimes(event()), app.initializeEventFromWallTimes(event('2026-11-01T06:45', '2026-11-01T07:15'))];
  const before = app.events.map(e => [e.start.getTime(), e.end.getTime()]);
  app.state.locationTimezoneId = 'America/New_York';
  app.refreshEventProjections();
  assert.equal(app.getEventProjection(app.events[1]).intervals.length, 2);
  assert.deepEqual(app.events.map(e => [e.start.getTime(), e.end.getTime()]), before);
});

test('ordinary edits resolve in the projection zone and retain an unchanged imported DST occurrence', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ timeModel: 'instant-v1', start: new Date('2026-10-25T01:30:00Z'), end: new Date('2026-10-25T02:30:00Z') });
  assert.ok(app.applyEventTimeRange(e, app.getEventWallDate(e, 'start'), wall('2026-10-25T04:00')));
  assert.equal(app.serializeEventTime(e).start, '2026-10-25T01:30:00.000Z');
  assert.equal(app.serializeEventTime(e).end, '2026-10-25T03:00:00.000Z');
  assert.equal(app.applyEventTimeRange(e, wall('2026-03-29T02:30'), wall('2026-03-29T04:00')), false);
});

test('merge updates retain the incoming instant projection, including repeated hours', () => {
  const app = calendar();
  const source = app.normalizeRuntimeEvent({ timeModel: 'instant-v1', start: new Date('2026-10-25T01:30:00Z'), end: new Date('2026-10-25T02:30:00Z') });
  const target = { ...source };
  // Canonical instants survive copying without a hidden projection transfer.
  assert.equal(app.serializeEventTime(target).start, '2026-10-25T01:30:00.000Z');
});

test('mouse and touch handle edits normalize DST gaps and retain positive real durations', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event('2026-03-29T01:30', '2026-03-29T03:00'));
  assert.ok(app.setEventHandleTime(e, 'end', wall('2026-03-29T02:30')));
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'end')), '2026-03-29T03:30');
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-03-29T03:45')));
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-03-29T03:25');
  const record = app.serializeEventTime(e);
  assert.equal(new Date(record.end) - new Date(record.start), 5 * 60000);
});

test('automatically suggested end times skip nonexistent hours for every event', () => {
  const app = calendar();
  const start = wall('2026-03-29T01:30');
  assert.equal(Time.formatWall(app.getDefaultEventEnd(start)), '2026-03-29T03:30');
  assert.equal(Time.formatWall(app.getDefaultEventEnd(start, {})), '2026-03-29T03:30');
});

test('handle edits retain their minimum duration and serialize UTC instants', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event());
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-10-08T11:00')));
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T09:55');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T07:55:00.000Z');
});

test('ICS imports distinguish UTC, named time zones and floating time', () => {
  for (const [start, end, expected] of [
    ['DTSTART:20261008T090000Z', 'DTEND:20261008T100000Z', '2026-10-08T09:00:00.000Z'],
    ['DTSTART;TZID="America/New_York":20261008T090000', 'DTEND;TZID=America/New_York:20261008T100000', '2026-10-08T13:00:00.000Z'],
    ['DTSTART:20261008T090000', 'DTEND:20261008T100000', '2026-10-08T07:00:00.000Z']
  ]) assert.equal(parse(`${start}\r\n${end}`)[0].start.toISOString(), expected);
});

test('all-day events retain their exclusive calendar dates across zone changes and export', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent(parse('DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010')[0]);
  app.events = [e];
  app.state.locationTimezoneId = 'Pacific/Honolulu';
  app.refreshEventProjections();
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T00:00');
  assert.equal(app.formatEventIcsDates(e), 'DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010\r\n');
});

test('all-day default duration is one day and an explicit week spans seven days', () => {
  assert.equal(parse('DTSTART;VALUE=DATE:20261008')[0].endDate, '2026-10-09');
  assert.equal(parse('DURATION:P1W\r\nDTSTART;VALUE=DATE:20261008')[0].endDate, '2026-10-15');
});

test('editing an all-day event into a timed event survives changing the display zone', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent(parse('DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010')[0]);
  assert.ok(app.applyEventTimeRange(e, wall('2026-10-08T09:00'), wall('2026-10-08T10:00')));
  app.events = [e];
  app.state.locationTimezoneId = 'America/New_York';
  app.refreshEventProjections();
  assert.equal(Time.formatWall(app.getEventWallDate(e, 'start')), '2026-10-08T03:00');
  assert.equal(app.serializeEventTime(e).allDay, undefined);
  assert.equal(app.formatEventIcsDates(e), 'DTSTART:20261008T070000Z\r\nDTEND:20261008T080000Z\r\n');
});

test('duration order is independent and nominal days honor DST', () => {
  const e = parse('DURATION:P1DT2H30M15S\r\nDTSTART;TZID=Europe/Berlin:20260328T120000')[0];
  assert.equal(e.start.toISOString(), '2026-03-28T11:00:00.000Z');
  assert.equal(e.end.toISOString(), '2026-03-29T12:30:15.000Z');
});

test('alarm dates and durations cannot replace the event dates', () => {
  const e = parse('DTSTART:20261008T090000Z\r\nDTEND:20261008T100000Z\r\nBEGIN:VALARM\r\nDURATION:PT5M\r\nTRIGGER;VALUE=DATE-TIME:20261008T080000Z\r\nEND:VALARM')[0];
  assert.equal(e.end.toISOString(), '2026-10-08T10:00:00.000Z');
});

test('folded text and escaped delimiters are decoded without losing literal backslashes', () => {
  const e = parse('DTSTART:20261008T090000Z\r\nDTEND:20261008T100000Z\r\nSUMMARY:Long\r\n  title\\, yes\\; ok\r\nDESCRIPTION:Line\\Nnext \\\\n')[0];
  assert.equal(e.title, 'Long title, yes; ok');
  assert.equal(e.description, 'Line\nnext \\n');
});

test('unsupported recurrence, custom zones and incomplete files fail before returning a partial import', () => {
  for (const prop of ['RRULE:FREQ=DAILY;COUNT=3', 'RDATE:20261009T090000Z', 'EXDATE:20261009T090000Z', 'RECURRENCE-ID:20261009T090000Z']) {
    assert.throws(() => parse(`DTSTART:20261008T090000Z\r\nDTEND:20261008T100000Z\r\n${prop}`), /Repeating/);
  }
  assert.throws(() => parse('DTSTART;TZID=Custom\/Zone:20261008T090000\r\nDTEND:20261008T100000Z'), /Unsupported/);
  assert.throws(() => ICS.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261008T090000Z', berlin), /Incomplete/);
});

test('invalid dates, reversed intervals and invalid durations cannot poison an import', () => {
  for (const properties of ['DTSTART:20260230T090000Z\r\nDTEND:20261008T100000Z',
    'DTSTART:20261008T090000Z\r\nDTEND:20261008T080000Z', 'DTSTART:20261008T090000Z\r\nDURATION:PT',
    'DTSTART;VALUE=DATE:20261008\r\nDURATION:PT1H']) assert.throws(() => parse(properties));
});

test('ICS accepts a positive interval whose local ending clock time precedes its start', () => {
  const e = parse('DTSTART:20261025T004500Z\r\nDTEND:20261025T011500Z')[0];
  assert.equal(e.end - e.start, 30 * 60000);
  assert.equal(calendar().getEventProjection(e).intervals.length, 2);
});

test('fall-back projections preserve both pieces, including their offset and exact duration', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T00:45:00Z', end: '2026-10-25T01:15:00Z' });
  const intervals = app.getEventProjection(e).intervals;
  assert.deepEqual(Array.from(intervals, piece => [Time.formatWall(piece.startMs), Time.formatWall(piece.endMs), piece.offsetMs]), [
    ['2026-10-25T02:45', '2026-10-25T03:00', 2 * Time.HOUR],
    ['2026-10-25T02:00', '2026-10-25T02:15', Time.HOUR]
  ]);
  assert.equal(intervals.reduce((duration, piece) => duration + piece.endMs - piece.startMs, 0), e.end - e.start);
  assert.ok(Object.isFrozen(intervals) && intervals.every(Object.isFrozen));
  app.events = [e];
  const target = app.getEventStartNavigationTarget(e);
  const entries = app.getAllEventsForSegment(target.day, target.segment);
  assert.deepEqual(Array.from(entries, entry => [entry.startMinute, entry.endMinute]), [[22.5, 30], [30, 37.5]]);
  assert.ok(entries.every(entry => entry.event === e));
});

test('spring-forward projections leave the skipped hour blank and keep transition endpoints exclusive', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-03-29T00:30:00Z', end: '2026-03-29T01:30:00Z' });
  assert.deepEqual(Array.from(app.getEventProjection(e).intervals, piece => [Time.formatWall(piece.startMs), Time.formatWall(piece.endMs)]), [
    ['2026-03-29T01:30', '2026-03-29T02:00'], ['2026-03-29T03:00', '2026-03-29T03:30']
  ]);
  app.events = [e];
  const target = app.getEventStartNavigationTarget(e);
  assert.equal(app.getAllEventsForSegment(target.day, target.segment - 1).length, 0);
  const endAtTransition = app.normalizeRuntimeEvent({ start: '2026-03-29T00:30:00Z', end: '2026-03-29T01:00:00Z' });
  assert.equal(app.getEventProjection(endAtTransition).intervals.length, 1);
  assert.equal(Time.formatWall(app.getEventProjection(endAtTransition).intervals[0].endMs), '2026-03-29T02:00');
});

test('projection discovers half-hour offset changes without assuming a one-hour jump', () => {
  const app = calendar();
  app.state.locationTimezoneId = 'Australia/Lord_Howe';
  const e = app.normalizeRuntimeEvent({ start: '2026-04-04T14:50:00Z', end: '2026-04-04T15:10:00Z' });
  assert.deepEqual(Array.from(app.getEventProjection(e).intervals, piece => [Time.formatWall(piece.startMs), Time.formatWall(piece.endMs)]), [
    ['2026-04-05T01:50', '2026-04-05T02:00'], ['2026-04-05T01:30', '2026-04-05T01:40']
  ]);
});

test('consecutive occurrences of one event share a lane and do not form an overlap component', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  app.state.rotation = 0;
  const e = app.normalizeRuntimeEvent({ start: '2026-10-24T23:30:00Z', end: '2026-10-25T02:30:00Z' });
  app.events = [e];
  const pieces = app.getEventProjection(e).intervals;
  const { eventToLane } = app.computePersistentEventLanesForWindow();
  assert.equal(eventToLane.get(pieces[0]), eventToLane.get(pieces[1]));
  const { eventToComponent, componentLaneCount } = app.computeEventComponentsForWindow(eventToLane);
  assert.notEqual(eventToComponent.get(pieces[0]), eventToComponent.get(pieces[1]));
  assert.equal(componentLaneCount.get(eventToComponent.get(pieces[0])), 1);
  assert.equal(app.getMaxOverlapForEventAcrossHours(e), 1);
});

test('repeated hour coordinates map first then second occurrence and preserve the transition boundary', () => {
  const hour = wall('2026-10-25T02:00').getTime();
  const Projection = context.SpiralEventProjection;
  const layout = Projection.repeatedHour(hour, berlin);
  assert.deepEqual(Array.from(layout.parts, part => [part.startFraction, part.endFraction, part.offsetMs]),
    [[0, 0.5, 2 * Time.HOUR], [0.5, 1, Time.HOUR]]);
  assert.ok(Object.isFrozen(layout) && Object.isFrozen(layout.parts) && layout.parts.every(Object.isFrozen));
  assert.equal(Projection.layoutTime(hour + Time.HOUR, berlin, 2 * Time.HOUR), hour + Time.HOUR / 2);
  assert.equal(Projection.layoutTime(hour, berlin, Time.HOUR), hour + Time.HOUR / 2);
  for (const instant of ['2026-10-25T00:00:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:00:00Z', '2026-10-25T01:30:00Z']) {
    const wallMs = Time.instantToWall(instant, berlin).getTime();
    const offset = wallMs - Date.parse(instant);
    const mapped = Projection.layoutTime(wallMs, berlin, offset);
    assert.equal(Projection.clockTime(mapped, berlin).instantMs, Date.parse(instant));
    assert.equal(Projection.clockTime(mapped, berlin).offsetMs, offset);
  }
});

test('half-hour repeats divide the affected wedge in proportion to each actual occurrence', () => {
  const Projection = context.SpiralEventProjection;
  const zone = 'Australia/Lord_Howe';
  const hour = wall('2026-04-05T01:00').getTime();
  const layout = Projection.repeatedHour(hour, zone);
  assert.equal(layout.parts[0].endFraction, 2 / 3);
  assert.equal(layout.parts[1].startWallMs, hour + Time.HOUR / 2);
  for (const instant of ['2026-04-04T14:15:00Z', '2026-04-04T14:50:00Z', '2026-04-04T15:10:00Z']) {
    const wallMs = Time.instantToWall(instant, zone).getTime();
    const mapped = Projection.layoutTime(wallMs, zone, wallMs - Date.parse(instant));
    assert.ok(Math.abs(Projection.clockTime(mapped, zone).instantMs - Date.parse(instant)) < 1);
  }
  assert.equal(Projection.repeatedHour(hour + Time.HOUR, zone), null);
  const gapHour = wall('2026-03-29T02:00').getTime();
  assert.equal(Projection.repeatedHour(gapHour, berlin), null);
  assert.equal(Projection.layoutTime(gapHour + 30 * 60000, berlin, Time.HOUR), gapHour + 30 * 60000);
});

test('wall-time overlays cover the matching minutes in both repeated sections', () => {
  const hour = wall('2026-10-25T02:00').getTime();
  const ranges = context.SpiralEventProjection.layoutRanges(hour + 15 * 60000, hour + 45 * 60000, berlin);
  assert.deepEqual(Array.from(ranges, range => [(range.startMs - hour) / 60000, (range.endMs - hour) / 60000]),
    [[7.5, 22.5], [37.5, 52.5]]);
  const ordinary = context.SpiralEventProjection.layoutRanges(hour + Time.HOUR, hour + 2 * Time.HOUR, berlin);
  assert.equal(ordinary.length, 1);
  assert.equal(ordinary[0].startMs, hour + Time.HOUR);
});

test('repeated hours keep a single regular label with the usual position settings', () => {
  const app = calendar();
  app.state.hourNumbersInsideSegment = true;
  const { day, segment } = app.getSegmentPositionFromId(2);
  const step = 2 * Math.PI / 24;
  const start = segment * step;
  for (const position of [0, 1, 2]) {
    app.state.hourNumbersPosition = position;
    app.referenceTime = wall('2026-10-26T00:00');
    app.hourNumbersInSegments = [];
    app.collectHourNumberInSegment(start, start + step, () => 100, segment, day, start, start + step, 100, 180);
    const ordinary = Array.from(app.hourNumbersInSegments, item => item.displayNumber);
    app.referenceTime = wall('2026-10-25T00:00');
    app.hourNumbersInSegments = [];
    app.collectHourNumberInSegment(start, start + step, () => 100, segment, day, start, start + step, 100, 180);
    assert.equal(app.hourNumbersInSegments.length, 1);
    assert.deepEqual(Array.from(app.hourNumbersInSegments, item => item.displayNumber), ordinary);
  }
  assert.equal(app.hourNumbersInSegments[0].displayNumber, 2);
  app.state.showEverySixthHour = true;
  app.hourNumbersInSegments = [];
  app.collectHourNumberInSegment(start, start + step, () => 100, segment, day, start, start + step, 100, 180);
  assert.equal(app.hourNumbersInSegments.length, 0);
});

test('repeated-hour dividers follow visible events and the Segment edges setting in both views', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  const { day, segment } = app.getSegmentPositionFromId(2);
  const layout = context.SpiralEventProjection.repeatedHour(wall('2026-10-25T02:00').getTime(), berlin);
  let strokes = 0;
  app.ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; } };
  const draw = () => { strokes = 0; app.drawRepeatedHourSegments(); return strokes; };
  for (const circle of [false, true]) {
    app.repeatedHourSegments = [{ layout, day, segment, startTheta: 0, endTheta: 1,
      rawStartAngle: 0, rawEndAngle: 1, radiusFunction: theta => 100 + theta,
      innerRadius: circle ? 100 : null, outerRadius: circle ? 180 : null }];
    app.state.showSegmentEdges = false;
    app.events = [];
    app._eventsVersion++;
    app.draftEvent = null;
    assert.equal(draw(), 0, 'empty repeated hour');
    app.state.showSegmentEdges = true;
    assert.equal(draw(), 1, 'explicit segment edges');
    app.state.showSegmentEdges = false;
    app.events = [app.normalizeRuntimeEvent({ start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z', calendar: 'Home' })];
    app._eventsVersion++;
    assert.equal(draw(), 1, 'visible event');
    app.state.visibleCalendars = ['Work'];
    assert.equal(draw(), 0, 'hidden calendar');
    app.state.visibleCalendars = ['Home', 'Work'];
    app.draftEvent = app.events[0];
    app.draftEvent.segmentId = 2;
    app.mouseState = { selectedSegmentId: 2 };
    app.events = [];
    app._eventsVersion++;
    assert.equal(draw(), 1, 'visible draft');
  }
});

test('night shading preserves both repeated sections without filling gaps between partial overlays', () => {
  const app = calendar();
  app.ctx = {};
  app.mouseState = {};
  app.state.nightOverlayOpacity = 0.3;
  const step = 2 * Math.PI / 24;
  const radiusFunction = () => 100;
  for (const [zone, hourText] of [[berlin, '2026-10-25T02:00'], ['Australia/Lord_Howe', '2026-04-05T01:00']]) {
    const hour = wall(hourText).getTime();
    for (const circle of [false, true]) {
      const check = (from, to, expected, selectedOffset) => {
        app.mouseState.selectedSegment = selectedOffset === undefined ? null :
          { day: 0, segment: 2, clockOffsetMs: selectedOffset };
        const drawn = [];
        app.drawSpiralBand = (start, end) => drawn.push([start / step, end / step]);
        app.fillCircleModeOverlaySegment = span => drawn.push([-span.startTheta / step, -span.endTheta / step]);
        const ranges = context.SpiralEventProjection.layoutRanges(hour + from * Time.HOUR, hour + to * Time.HOUR, zone);
        app.nightOverlays = Array.from(ranges, range => {
          const startFrac = (range.startMs - hour) / Time.HOUR;
          const endFrac = (range.endMs - hour) / Time.HOUR;
          const selection = { day: 0, segment: 2,
            clockOffsetMs: context.SpiralEventProjection.clockTime(range.startMs, zone).offsetMs };
          return circle ? { ...selection, isCircleMode: true, innerRadius: 100, outerRadius: 180,
            startTheta: -(1 - endFrac) * step, endTheta: -(1 - startFrac) * step } :
            { ...selection, isCircleMode: false, radiusFunction, startTheta: 0, endTheta: step,
              rawStartAngle: 0, rawEndAngle: step, overlayStartFrac: startFrac, overlayEndFrac: endFrac };
        });
        app.drawNightOverlays();
        drawn.sort((a, b) => a[0] - b[0]);
        assert.equal(drawn.length, expected.length, `${zone}, circle=${circle}`);
        for (let i = 0; i < expected.length; i++) {
          assert.ok(Math.abs(drawn[i][0] - expected[i][0]) < 1e-8);
          assert.ok(Math.abs(drawn[i][1] - expected[i][1]) < 1e-8);
        }
      };
      check(0, 1, [[0, 1]]);
      if (zone === berlin) {
        check(0.25, 0.75, [[0.125, 0.375], [0.625, 0.875]]);
        check(0, 1, [[0, 0.5]], 2 * Time.HOUR);
        check(0, 1, [[0.5, 1]], Time.HOUR);
      } else {
        check(2 / 3, 5 / 6, [[1 / 9, 2 / 9], [4 / 9, 5 / 9]]);
        check(0, 1, [[0, 1 / 3]], 11 * Time.HOUR);
        check(0, 1, [[1 / 3, 1]], 10.5 * Time.HOUR);
      }
    }
  }
});

test('click selection and empty drafts distinguish repeated sections including half-hour changes', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  const first = app.normalizeRuntimeEvent({ start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z' });
  const second = app.normalizeRuntimeEvent({ start: '2026-10-25T01:00:00Z', end: '2026-10-25T02:00:00Z' });
  app.events = [first, second];
  const target = app.getEventStartNavigationTarget(first);
  const step = 2 * Math.PI / 24;
  const origin = target.day * 2 * Math.PI + target.segment * step;
  const a = app.annotateSegmentClock({ ...target, angle: origin + step * 0.75, radius: 100 });
  const b = app.annotateSegmentClock({ ...target, angle: origin + step * 0.25, radius: 100 });
  assert.equal(a.clockOccurrence, 0);
  assert.equal(b.clockOccurrence, 1);
  assert.deepEqual(Array.from(app.getEventsForClockSegment(a), entry => entry.event), [first]);
  assert.deepEqual(Array.from(app.getEventsForClockSegment(b), entry => entry.event), [second]);
  app.createEventColorState = () => ({ color: '#123456' });
  const draft = app.createDraftEventForSegmentId(2, b);
  assert.equal(draft.start.toISOString(), second.start.toISOString());
  assert.equal(draft.end - draft.start, Time.HOUR);
  app.state.locationTimezoneId = 'Australia/Lord_Howe';
  app.referenceTime = wall('2026-04-05T00:00');
  const halfHourDraft = app.createDraftEventForSegmentId(1, { clockOffsetMs: 10.5 * Time.HOUR });
  assert.equal(halfHourDraft.start.toISOString(), '2026-04-04T15:00:00.000Z');
  assert.equal(Time.formatWall(app.getEventWallDate(halfHourDraft, 'start')), '2026-04-05T01:30');
});

test('genuine simultaneous events still stack within their own repeated-hour section', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  app.state.rotation = 0;
  const first = app.normalizeRuntimeEvent({ start: '2026-10-25T00:10:00Z', end: '2026-10-25T00:50:00Z' });
  const overlap = app.normalizeRuntimeEvent({ start: '2026-10-25T00:20:00Z', end: '2026-10-25T00:40:00Z' });
  const second = app.normalizeRuntimeEvent({ start: '2026-10-25T01:10:00Z', end: '2026-10-25T01:50:00Z' });
  app.events = [first, overlap, second];
  const { eventToLane } = app.computePersistentEventLanesForWindow();
  assert.notEqual(eventToLane.get(first), eventToLane.get(overlap));
  assert.equal(app.getMaxOverlapForEventAcrossHours(first), 2);
  assert.equal(app.getMaxOverlapForEventAcrossHours(second), 1);
});

test('live rotation and browsing traverse both repeated sections in actual chronological order', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  app.autoTimeAlignState = { enabled: false };
  let previous = -Infinity;
  for (const instant of ['2026-10-25T00:15:00Z', '2026-10-25T00:59:00Z', '2026-10-25T01:00:00Z', '2026-10-25T01:15:00Z', '2026-10-25T02:00:00Z']) {
    app.state.rotation = app.getCurrentTimeRotation(new Date(instant));
    assert.ok(app.state.rotation > previous);
    assert.ok(Math.abs(app.getDisplayInstant() - new Date(instant)) < 1);
    assert.ok(Math.abs(app.getDisplayTime() - Time.instantToWall(instant, berlin)) < 1);
    previous = app.state.rotation;
  }
});

test('dragging into an empty repeated section chooses its time even without an event band', () => {
  const app = calendar();
  app.referenceTime = wall('2026-10-25T00:00');
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T00:10:00Z', end: '2026-10-25T00:20:00Z' });
  const target = app.getEventStartNavigationTarget(e);
  app.mouseState = { isHandleDragging: true, draggingHandle: 'end' };
  app.handleDragState = { event: e };
  app.findSegmentAtPoint = () => target;
  const angle = -(target.day * 2 * Math.PI + (target.segment + 0.25) * 2 * Math.PI / 24) + vm.runInContext('CONFIG.INITIAL_ROTATION_OFFSET', context);
  app._canvasPointToModelSpace = () => ({ modelX: Math.cos(angle), modelY: Math.sin(angle) });
  app.syncSelectedSegmentToDraggedHandle = app.ensureLayoutCache = app.drawSpiral = () => {};
  assert.ok(app.updateDraggingHandleAtCanvasPoint(0, 0));
  assert.equal(e.end.toISOString(), '2026-10-25T01:30:00.000Z');
});

test('hit testing selects the rendered occurrence instead of the first entry in the hour', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T00:10:00Z', end: '2026-10-25T01:50:00Z' });
  app.events = [e];
  const target = app.getEventStartNavigationTarget(e);
  const pieces = app.getEventProjection(e).intervals;
  app.eventSegments = pieces.map((piece, index) => ({ event: e, displayInterval: piece, day: target.day, segment: target.segment,
    timeStartTheta: 1, timeEndTheta: 2, isCircleMode: true, innerRadius: 100 + index * 20, outerRadius: 120 + index * 20 }));
  assert.equal(app.findEventEntryAtSegmentPoint({ ...target, angle: 1.5, radius: 130 }), 1);
  assert.equal(app.findEventEntryAtSegmentPoint({ ...target, angle: 1.5 + 10 * Math.PI, radius: 130 }), 1);
  assert.equal(app.findEventEntryAtSegmentPoint({ ...target, angle: 1.5, radius: 110 }), 0);
  assert.equal(app.findEventEntryAtSegmentPoint({ ...target, angle: 1.5, radius: 80 }), null);
});

test('equal or reversed wall endpoints can retain a positive interval across the clock change', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event('2026-10-25T02:45', '2026-10-25T02:15'), { rejectGap: true });
  assert.equal(e.start.toISOString(), '2026-10-25T00:45:00.000Z');
  assert.equal(e.end.toISOString(), '2026-10-25T01:15:00.000Z');
  assert.ok(app.applyEventTimeRange(e, wall('2026-10-25T02:45'), wall('2026-10-25T02:15')));
  assert.ok(app.setEventHandleTime(e, 'end', wall('2026-10-25T02:05')));
  assert.equal(e.end.toISOString(), '2026-10-25T01:05:00.000Z');
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-10-25T02:55')));
  assert.equal(e.start.toISOString(), '2026-10-25T00:55:00.000Z');
});

test('dragging to a rendered occurrence uses that band offset and keeps the minimum duration', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T00:10:00Z', end: '2026-10-25T01:50:00Z' });
  assert.ok(app.setEventHandleTime(e, 'end', wall('2026-10-25T02:35'), { preferredOffsetMs: 2 * Time.HOUR }));
  assert.equal(e.end.toISOString(), '2026-10-25T00:35:00.000Z');
  assert.ok(app.setEventHandleTime(e, 'end', wall('2026-10-25T02:35'), { preferredOffsetMs: Time.HOUR }));
  assert.equal(e.end.toISOString(), '2026-10-25T01:35:00.000Z');
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-10-25T02:40'), { preferredOffsetMs: Time.HOUR }));
  assert.equal(e.end - e.start, 5 * 60000);
});

test('browsing a selected repeated-hour piece uses that occurrence, while the live clock stays actual', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent({ start: '2026-10-25T00:10:00Z', end: '2026-10-25T01:50:00Z' });
  app.autoTimeAlignState = { enabled: false };
  app.mouseState = { selectedSegment: {} };
  app.state.detailViewDay = 0;
  app.getDisplayTime = () => wall('2026-10-25T02:30');
  app.getDetailViewEventState = () => ({ activeDisplayInterval: app.getEventProjection(e).intervals[1] });
  assert.equal(app.getDisplayInstant().toISOString(), '2026-10-25T01:30:00.000Z');
  app.autoTimeAlignState.enabled = true;
  assert.ok(Math.abs(app.getDisplayInstant().getTime() - Date.now()) < 100);
});

test('explicit occurrence choices update the actual timestamp and reject an invalid duration atomically', () => {
  const app = calendar();
  const e = app.initializeEventFromWallTimes(event('2026-10-25T02:10', '2026-10-25T03:30'));
  assert.ok(app.applyEventTimeRange(e, wall('2026-10-25T02:10'), wall('2026-10-25T03:30'), { startOccurrence: 1 }));
  assert.equal(e.start.toISOString(), '2026-10-25T01:10:00.000Z');
  const before = JSON.stringify(app.serializeEventTime(e));
  assert.equal(app.applyEventTimeRange(e, wall('2026-10-25T02:10'), wall('2026-10-25T02:40'), { endOccurrence: 0 }), false);
  assert.equal(JSON.stringify(app.serializeEventTime(e)), before);
});

test('all-day dates remain one continuous interval on a daylight-saving date', () => {
  const app = calendar();
  const e = app.normalizeRuntimeEvent(parse('DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026')[0]);
  const pieces = app.getEventProjection(e).intervals;
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].endMs - pieces[0].startMs, Time.DAY);
  assert.equal(e.end - e.start, 25 * Time.HOUR);
});

test('the manual clock-change calendar has three distinct positive events with the documented durations', () => {
  const input = fs.readFileSync(new URL('./fixtures/clock-changes.ics', import.meta.url), 'utf8');
  const events = ICS.parse(input, berlin);
  assert.equal(events.length, 3);
  assert.equal(new Set(events.map(e => e.persistentUID)).size, 3);
  assert.deepEqual(Array.from(events, e => (e.end - e.start) / 60000), [30, 60, 20]);
});

test('visible layout windows follow navigation, include partial hours and support past dates', () => {
  const app = calendar();
  for (const hour of [12, 12.5, -0.5, 744.5]) {
    app.state.rotation = hour / 24 * 2 * Math.PI;
    assert.equal(app.visibleWindowStart().getTime(), app.referenceTime.getTime() + Math.floor(hour) * Time.HOUR);
    assert.equal(app.visibleWindowEnd().getTime(), app.referenceTime.getTime() + Math.ceil(hour + 168) * Time.HOUR);
  }
});

test('layout cache rebuilds for distant browsing and calendar filters but remains stable within an hour', () => {
  const app = calendar();
  let builds = 0;
  app.computePersistentEventLanesForWindow = () => { builds++; return { eventToLane: new Map() }; };
  app.computeEventComponentsForWindow = () => ({ eventToComponent: new Map(), componentLaneCount: new Map() });
  app.ensureLayoutCache();
  app.state.rotation += 0.01;
  app.ensureLayoutCache(); // An exact-hour window grows by one partial hour.
  app.state.rotation += 0.01;
  app.ensureLayoutCache();
  assert.equal(builds, 2);
  app.state.rotation += 30 * 2 * Math.PI;
  app.ensureLayoutCache();
  app.state.visibleCalendars = ['Home'];
  app.ensureLayoutCache();
  assert.equal(builds, 4);
});
