import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, crypto: webcrypto, TextEncoder, SpiralCalendar: class {} });
for (const file of ['time-model', 'event-model', 'config-utils', 'icalendar', 'event-projection', 'event-time', 'event-transfer']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const Model = context.SpiralEventModel;
const input = (overrides = {}) => ({ title: 'Same title', start: '2026-10-08T09:00:00Z',
  end: '2026-10-08T10:00:00Z', calendar: 'Home', ...overrides });
const record = overrides => Model.normalize(input(overrides));
const app = () => Object.assign(new context.SpiralCalendar(), {
  events: [], state: { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin' }
});
const imported = (calendar, overrides) => calendar.normalizeRuntimeEvent(record(overrides));

test('identical event content gets distinct permanent UUIDs that survive edits', () => {
  const first = record();
  const second = record();
  assert.match(first.persistentUID, /^spiral-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first.persistentUID, second.persistentUID);
  assert.equal(context.generateEventUID(first), first.persistentUID);
  first.title = 'Edited';
  assert.equal(context.generateEventUID(first), first.persistentUID);
  assert.equal(Model.normalize(JSON.parse(JSON.stringify(first)), { stored: true }).persistentUID, first.persistentUID);
});

test('UUID generation has a secure fallback when randomUUID is unavailable', () => {
  const fallback = vm.createContext({ crypto: { getRandomValues: array => webcrypto.getRandomValues(array) } });
  vm.runInContext(fs.readFileSync(new URL('../js/event-model.js', import.meta.url), 'utf8'), fallback);
  assert.match(fallback.SpiralEventModel.createUID(), /^spiral-[0-9a-f-]{36}$/);
  assert.notEqual(fallback.SpiralEventModel.createUID(), fallback.SpiralEventModel.createUID());
});

test('canonical timestamps reject ambiguous local dates, invalid dates and nonpositive intervals', () => {
  for (const start of ['2026-10-08T09:00', '2026-10-08', '2026-02-30T09:00:00Z',
    '2026-10-08T24:00:00Z', 1791442800000, null]) assert.throws(() => record({ start }));
  assert.throws(() => record({ end: '2026-10-08T08:00:00Z' }));
  assert.equal(record({ start: '2026-10-08T11:00:00+02:00' }).start, '2026-10-08T09:00:00.000Z');
});

test('stored records require the current time format and persisted identity/revision', () => {
  for (const overrides of [{ timeModel: undefined }, { persistentUID: '' }, { sequence: undefined }]) {
    assert.throws(() => Model.normalize({ ...record(), ...overrides }, { stored: true }));
  }
  assert.equal(record({ lastAddedToCalendar: null }).lastAddedToCalendar, null);
});

test('duplicate or unsafe UIDs and invalid revision numbers are rejected', () => {
  const first = record();
  assert.throws(() => Model.validateUnique([first, first]), /Duplicate/);
  for (const persistentUID of ['\r\nUID:injected', ' ', 123]) assert.throws(() => record({ persistentUID }));
  for (const sequence of [-1, 1.5, '2', 2147483648]) assert.throws(() => record({ sequence }));
});

test('revisions increase for consecutive content edits, survive reload and do not increase on retries', () => {
  const revisions = new Model.Revisions();
  let current = revisions.prepare([record()])[0];
  assert.equal(current.sequence, 0);
  current = revisions.prepare([{ ...current, title: 'First edit' }])[0];
  assert.equal(current.sequence, 1);
  assert.equal(revisions.prepare([current])[0].sequence, 1);
  current = revisions.prepare([{ ...current, description: 'Second edit' }])[0];
  assert.equal(current.sequence, 2);
  const reloaded = new Model.Revisions();
  reloaded.reset([JSON.parse(JSON.stringify(current))]);
  assert.equal(reloaded.prepare([{ ...current, calendar: 'Work' }])[0].sequence, 3);
});

test('sharing flags and derived palette changes do not revise event content', () => {
  const revisions = new Model.Revisions();
  const current = revisions.prepare([record({ sequence: 9 })])[0];
  assert.equal(revisions.prepare([{ ...current, addedToCalendar: true, color: '#abcdef' }])[0].sequence, 9);
  assert.equal(revisions.prepare([{ ...current, colorIsCustom: true, color: '#abcdef' }])[0].sequence, 10);
});

test('incoming higher revisions are respected and overflow leaves all revision baselines intact', () => {
  const revisions = new Model.Revisions();
  const first = record({ sequence: 4 });
  const full = record({ sequence: 2147483647 });
  revisions.reset([first, full]);
  assert.throws(() => revisions.prepare([{ ...first, title: 'Change' }, { ...full, title: 'Overflow' }]), /revision/);
  assert.equal(revisions.records.get(first.persistentUID).sequence, 4);
  assert.equal(revisions.prepare([{ ...first, title: 'Remote change', sequence: 20 }])[0].sequence, 20);
});

test('imports match UIDs exclusively and never collapse identical-looking events', () => {
  const calendar = app();
  const first = imported(calendar);
  const second = imported(calendar);
  calendar.events = [first];
  assert.equal(calendar.mergeImportedEvents([second]).added, 1);
  assert.equal(calendar.events.length, 2);
  assert.equal(calendar.mergeImportedEvents([imported(calendar, { persistentUID: first.persistentUID })]).skipped, 1);
});

test('older imports cannot replace a newer event; incoming revisions and repeated-hour instants survive merging', () => {
  const calendar = app();
  const first = imported(calendar, { persistentUID: 'remote', sequence: 5, addedToCalendar: true, lastAddedToCalendar: 123 });
  calendar.events = [first];
  assert.equal(calendar.mergeImportedEvents([imported(calendar, { persistentUID: 'remote', title: 'Old', sequence: 4 })]).stale, 1);
  assert.equal(first.title, 'Same title');
  const newer = imported(calendar, { persistentUID: 'remote', sequence: 8,
    start: '2026-10-25T01:30:00Z', end: '2026-10-25T02:30:00Z' });
  assert.equal(calendar.mergeImportedEvents([newer]).updated, 1);
  assert.equal(first.sequence, 8);
  assert.equal(first.addedToCalendar, true);
  assert.equal(first.lastAddedToCalendar, 123);
  assert.equal(calendar.serializeEventTime(first).start, '2026-10-25T01:30:00.000Z');
});

test('duplicate import UIDs reject the entire merge without modifying existing events', () => {
  const calendar = app();
  calendar.events = [imported(calendar)];
  const duplicate = imported(calendar, { persistentUID: 'duplicate' });
  assert.throws(() => calendar.mergeImportedEvents([imported(calendar), duplicate, duplicate]), /Duplicate/);
  assert.equal(calendar.events.length, 1);
});

test('shared ICS serialization round-trips Unicode, identity, revision, custom color and calendar', () => {
  const calendar = app();
  const event = imported(calendar, { sequence: 17, title: '🌀'.repeat(80), calendar: 'Work, Home',
    description: 'Line\nSecond; comma, backslash \\', color: '#abcdef', colorIsCustom: true, lastModified: 1791442800000 });
  const body = calendar.formatEventIcs(event);
  for (const line of body.trim().split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  const [parsed] = context.SpiralICalendar.parse(`BEGIN:VCALENDAR\r\n${body}END:VCALENDAR\r\n`, 'Europe/Berlin');
  for (const key of ['persistentUID', 'sequence', 'title', 'description', 'calendar', 'color', 'lastModified']) assert.equal(parsed[key], event[key]);
});

test('ICS preserves automatic color seeds and does not turn a reimport into a content edit', () => {
  const calendar = app();
  const event = imported(calendar, { color: '#abcdef', colorIsCustom: false, colorSeed: 1234, sequence: 6 });
  calendar.events = [event];
  const body = calendar.formatEventIcs(event);
  const [parsed] = context.SpiralICalendar.parse(`BEGIN:VCALENDAR\r\n${body}END:VCALENDAR\r\n`, 'Europe/Berlin');
  assert.equal(parsed.colorIsCustom, false);
  assert.equal(parsed.colorSeed, 1234);
  assert.equal(calendar.mergeImportedEvents([calendar.normalizeRuntimeEvent(Model.normalize(parsed))]).skipped, 1);
  assert.equal(event.sequence, 6);
});

test('invalid or duplicate ICS revision metadata is rejected before a partial result is returned', () => {
  const parse = metadata => context.SpiralICalendar.parse(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261008T090000Z\nDTEND:20261008T100000Z\n${metadata}\nEND:VEVENT\nEND:VCALENDAR`, 'UTC');
  for (const metadata of ['SEQUENCE:-1', 'SEQUENCE:1.5', 'SEQUENCE:2147483648', 'SEQUENCE:1\nSEQUENCE:2',
    'LAST-MODIFIED:20261008T090000', 'LAST-MODIFIED:20260230T090000Z']) assert.throws(() => parse(metadata));
  const eventBody = 'BEGIN:VEVENT\nUID:same\nDTSTART:20261008T090000Z\nDTEND:20261008T100000Z\nEND:VEVENT\n';
  assert.throws(() => context.SpiralICalendar.parse(`BEGIN:VCALENDAR\n${eventBody}${eventBody}END:VCALENDAR`, 'UTC'), /Duplicate/);
});
