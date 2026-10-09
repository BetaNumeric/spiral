import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, alert() {},
  CONFIG: { SEGMENTS_PER_DAY: 24 }, SpiralCalendar: class {} });
for (const file of ['time-model', 'icalendar', 'core-methods', 'state-storage-sync', 'event-time']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
context.formatIcsDateUTC = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const Time = context.SpiralTime;
const ICS = context.SpiralICalendar;
const wall = Time.parseWall;
const berlin = 'Europe/Berlin';
function calendar() {
  const app = new context.SpiralCalendar();
  app.state = { useLocationTimezone: true, locationTimezoneId: berlin, days: 7, rotation: Math.PI,
    visibleCalendars: ['Home', 'Work'] };
  app.events = [];
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
  const e = app.initializeEventTime(event(), { rejectGap: true });
  assert.equal(e.start.toISOString(), '2026-10-08T09:00:00.000Z');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T07:00:00.000Z');
  assert.equal(app.formatEventIcsDates(e), 'DTSTART:20261008T070000Z\r\nDTEND:20261008T080000Z\r\n');
});

test('legacy timestamps and metadata are never reinterpreted or tagged automatically', () => {
  const app = calendar();
  const e = { ...event(), extra: 'preserve' };
  app.projectEventTime(e);
  const record = app.serializeEventTime(e);
  assert.equal(record.start, '2026-10-08T09:00:00.000Z');
  assert.equal(record.extra, 'preserve');
  assert.equal(record.timeModel, undefined);
});

test('a new event survives JSON storage and reload without double conversion', () => {
  const app = calendar();
  const e = app.initializeEventTime(event());
  const saved = JSON.stringify(app.serializeEventTime(e));
  const loaded = app.projectEventTime(JSON.parse(saved));
  assert.equal(loaded.start.getTime(), e.start.getTime());
  assert.equal(JSON.stringify(app.serializeEventTime(loaded)), saved);
});

test('changing the display zone reprojects new events without changing their stored records', () => {
  const app = calendar();
  const e = app.initializeEventTime(event());
  app.events = [e, event()];
  const saved = JSON.stringify(app.serializeEventTime(e));
  app.state.locationTimezoneId = 'America/New_York';
  app.reprojectEventTimes();
  assert.equal(Time.formatWall(e.start), '2026-10-08T03:00');
  assert.equal(JSON.stringify(app.serializeEventTime(e)), saved);
  assert.equal(Time.formatWall(app.events[1].start), '2026-10-08T09:00');
});

test('an unsupported repeated-hour projection leaves every current event unchanged', () => {
  const app = calendar();
  app.events = [app.initializeEventTime(event()), app.initializeEventTime(event('2026-11-01T06:45', '2026-11-01T07:15'))];
  const before = app.events.map(e => [e.start.getTime(), e.end.getTime()]);
  app.state.locationTimezoneId = 'America/New_York';
  assert.throws(() => app.reprojectEventTimes(), /repeated clock hour/);
  assert.deepEqual(app.events.map(e => [e.start.getTime(), e.end.getTime()]), before);
});

test('ordinary edits resolve in the projection zone and retain an unchanged imported DST occurrence', () => {
  const app = calendar();
  const e = app.projectEventTime({ timeModel: 'instant-v1', start: new Date('2026-10-25T01:30:00Z'), end: new Date('2026-10-25T02:30:00Z') });
  assert.ok(app.applyEventTimeRange(e, new Date(e.start), wall('2026-10-25T04:00')));
  assert.equal(app.serializeEventTime(e).start, '2026-10-25T01:30:00.000Z');
  assert.equal(app.serializeEventTime(e).end, '2026-10-25T03:00:00.000Z');
  assert.equal(app.applyEventTimeRange(e, wall('2026-03-29T02:30'), wall('2026-03-29T04:00')), false);
});

test('merge updates retain the incoming instant projection, including repeated hours', () => {
  const app = calendar();
  const source = app.projectEventTime({ timeModel: 'instant-v1', start: new Date('2026-10-25T01:30:00Z'), end: new Date('2026-10-25T02:30:00Z') });
  const target = { ...source };
  app.copyEventTimeProjection(source, target);
  assert.equal(app.serializeEventTime(target).start, '2026-10-25T01:30:00.000Z');
});

test('mouse and touch handle edits normalize DST gaps and retain positive real durations', () => {
  const app = calendar();
  const e = app.initializeEventTime(event('2026-03-29T01:30', '2026-03-29T03:00'));
  assert.ok(app.setEventHandleTime(e, 'end', wall('2026-03-29T02:30')));
  assert.equal(Time.formatWall(e.end), '2026-03-29T03:30');
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-03-29T03:45')));
  assert.equal(Time.formatWall(e.start), '2026-03-29T03:25');
  const record = app.serializeEventTime(e);
  assert.equal(new Date(record.end) - new Date(record.start), 5 * 60000);
});

test('automatically suggested end times skip nonexistent hours while legacy dates retain their convention', () => {
  const app = calendar();
  const start = wall('2026-03-29T01:30');
  assert.equal(Time.formatWall(app.getDefaultEventEnd(start)), '2026-03-29T03:30');
  assert.equal(Time.formatWall(app.getDefaultEventEnd(start, {})), '2026-03-29T02:30');
});

test('legacy handle edits retain their wall-coordinate meaning and minimum duration', () => {
  const app = calendar();
  const e = event();
  assert.ok(app.setEventHandleTime(e, 'start', wall('2026-10-08T11:00')));
  assert.equal(Time.formatWall(e.start), '2026-10-08T09:55');
  assert.equal(app.serializeEventTime(e).start, '2026-10-08T09:55:00.000Z');
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
  const e = app.projectEventTime(parse('DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010')[0]);
  app.events = [e];
  app.state.locationTimezoneId = 'Pacific/Honolulu';
  app.reprojectEventTimes();
  assert.equal(Time.formatWall(e.start), '2026-10-08T00:00');
  assert.equal(app.formatEventIcsDates(e), 'DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010\r\n');
});

test('all-day default duration is one day and an explicit week spans seven days', () => {
  assert.equal(parse('DTSTART;VALUE=DATE:20261008')[0].endDate, '2026-10-09');
  assert.equal(parse('DURATION:P1W\r\nDTSTART;VALUE=DATE:20261008')[0].endDate, '2026-10-15');
});

test('editing an all-day event into a timed event survives changing the display zone', () => {
  const app = calendar();
  const e = app.projectEventTime(parse('DTSTART;VALUE=DATE:20261008\r\nDTEND;VALUE=DATE:20261010')[0]);
  assert.ok(app.applyEventTimeRange(e, wall('2026-10-08T09:00'), wall('2026-10-08T10:00')));
  app.events = [e];
  app.state.locationTimezoneId = 'America/New_York';
  app.reprojectEventTimes();
  assert.equal(Time.formatWall(e.start), '2026-10-08T03:00');
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

test('a repeated-hour interval the renderer cannot represent is reported explicitly', () => {
  assert.throws(() => parse('DTSTART:20261025T004500Z\r\nDTEND:20261025T011500Z'), /repeated clock hour/);
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
