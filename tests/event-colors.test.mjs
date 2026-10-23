import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, crypto: webcrypto, SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection', 'core-methods',
  'event-time', 'event-index', 'event-editing', 'detail-view-state', 'render-circle']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const Time = context.SpiralTime;
const range = (start = '2026-10-23T08:00:00Z', end = '2026-10-23T09:00:00Z') =>
  ({ start: new Date(start), end: new Date(end) });
function calendar(mode = 'random') {
  const app = new context.SpiralCalendar();
  Object.assign(app, { events: [], _eventsVersion: 0, mouseState: {},
    state: { colorMode: mode, visibleCalendars: ['Home'], useLocationTimezone: true,
      locationTimezoneId: 'Europe/Berlin', paletteAffectsCustomColors: false },
    saveEventsToStorage() {}, requestEventListRender() {}, drawSpiral() {},
    referenceTime: Time.parseWall('2026-10-23T00:00') });
  return app;
}
function add(app, times, options = {}) {
  const event = app.normalizeRuntimeEvent({ ...times, color: '#ff9999', colorIsCustom: true, ...options });
  app.events.push(event);
  app._eventsVersion++;
  return event;
}
function candidateColors(app, colors) {
  app.generatePaletteColorFromSeed = seed => colors[seed % colors.length];
  let next = 0;
  app.createEventColorSeed = () => (++next % colors.length);
}
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test('hue dominates candidate selection, wraps through red, and does not distinguish identical grays', () => {
  const app = calendar();
  const profile = color => app.getPaletteProfileFromColor(color);
  const red = profile('#ff9999');
  assert.ok(app.getEventColorDifference(red, profile('#99ffff'))
    > app.getEventColorDifference(red, profile('#ff0000')));
  const nearRed = profile(app.hslToHex('hsl(359, 80%, 70%)'));
  assert.ok(app.getEventColorDifference(nearRed, profile(app.hslToHex('hsl(1, 80%, 70%)'))) < 0.01);
  assert.equal(app.getEventColorDifference({ hue: 0, saturationUnit: 0, lightnessUnit: 0.5 },
    { hue: 180, saturationUnit: 0, lightnessUnit: 0.5 }), 0);

  add(app, range());
  candidateColors(app, ['#ff9999', '#ffb399', '#99ffff']);
  assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range()), 2);
});

test('the closest-colored neighbor matters, including overlaps and exact contacts at both ends', () => {
  const app = calendar();
  const red = add(app, range('2026-10-23T07:00:00Z', '2026-10-23T08:00:00Z'));
  const blue = add(app, range('2026-10-23T09:00:00Z', '2026-10-23T10:00:00Z'), { color: '#9999ff' });
  add(app, range('2026-10-23T08:15:00Z', '2026-10-23T08:45:00Z'));
  // A green candidate must beat cyan, which contrasts with red but is close to blue.
  candidateColors(app, ['#ff9999', '#99ffff', '#99ff99']);
  const before = JSON.stringify(app.events);
  assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range()), 2);
  assert.equal(JSON.stringify(app.events), before, 'Choosing a color must not modify its neighbors.');
  assert.equal(red.color, '#ff9999');
  assert.equal(blue.color, '#9999ff');
});

test('distant past events and hidden events leave the original random choice alone', () => {
  const app = calendar();
  add(app, range('2026-10-23T05:00:00Z', '2026-10-23T05:59:59.999Z'));
  add(app, range('2026-10-23T11:00:00.001Z', '2026-10-23T12:00:00Z'), { calendar: 'Hidden' });
  add(app, range(), { calendar: 'Hidden' });
  app.createEventColorSeed = () => assert.fail('No candidates needed without nearby neighbors.');
  assert.equal(app.chooseInitialEventColorSeed(123, 'Home', null, range()), 123);
});

test('the next visible event influences the initial color at any distance, without including later events', () => {
  for (const gap of [3 * Time.HOUR, 2 * Time.DAY, 365 * Time.DAY]) for (const inBatch of [false, true]) {
    const app = calendar();
    const start = range().end.getTime() + gap;
    add(app, { start: new Date(start + Time.DAY), end: new Date(start + Time.DAY + Time.HOUR) }, { color: '#9999ff' });
    add(app, { start: new Date(start), end: new Date(start + Time.HOUR) });
    add(app, { start: new Date(start - Time.HOUR), end: new Date(start) }, { calendar: 'Hidden', color: '#9999ff' });
    let batch = null;
    if (inBatch) {
      batch = { index: new context.SpiralEventIntervalIndex([]),
        addedEntries: app.getVisibleEvents().flatMap(event => app.getEventProjection(event).intervals
          .map(interval => ({ event, startMs: interval.layoutStartMs, endMs: interval.layoutEndMs }))) };
    }
    const snapshot = JSON.stringify(app.events);
    candidateColors(app, ['#ff9999', '#99ffff', '#99ff99']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range(), batch), 1);
    assert.equal(JSON.stringify(app.events), snapshot);
  }
});

test('the earliest next event is chosen across saved and generated entries, including next events inside two hours', () => {
  for (const nearerInBatch of [false, true]) {
    const app = calendar();
    const near = add(app, range('2026-10-23T10:00:00Z', '2026-10-23T11:00:00Z'));
    const far = add(app, range('2027-10-23T10:00:00Z', '2027-10-23T11:00:00Z'), { color: '#9999ff' });
    const generated = nearerInBatch ? near : far;
    const batch = { index: new context.SpiralEventIntervalIndex(app.getEventIntervalIndex().entries.filter(entry => entry.event !== generated)),
      addedEntries: app.getEventProjection(generated).intervals.map(interval => ({ event: generated,
        startMs: interval.layoutStartMs, endMs: interval.layoutEndMs })) };
    candidateColors(app, ['#99ffff', '#99ff99']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range(), batch), 0);
  }
});

test('equal next start times are treated equally and distant next events retain lower priority', () => {
  const app = calendar();
  add(app, range('2027-10-23T10:00:00Z', '2027-10-23T11:00:00Z'));
  add(app, range('2027-10-23T10:00:00Z', '2027-10-23T12:00:00Z'), { color: '#9999ff' });
  candidateColors(app, ['#ff9999', '#99ffff', '#99ff99']);
  assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range()), 2);

  const overlap = calendar();
  add(overlap, range());
  add(overlap, range('2027-10-23T10:00:00Z', '2027-10-23T11:00:00Z'), { color: '#9999ff' });
  candidateColors(overlap, ['#99ffff', '#99ff99']);
  assert.equal(overlap.chooseInitialEventColorSeed(0, 'Home', null, range()), 0);
});

test('next-event ordering follows actual DST occurrences and floating all-day dates', () => {
  const app = calendar();
  add(app, range('2026-10-25T01:05:00Z', '2026-10-25T01:15:00Z'), { color: '#9999ff' });
  add(app, range('2026-10-25T00:55:00Z', '2026-10-25T01:00:00Z'));
  candidateColors(app, ['#ff9999', '#99ffff', '#99ff99']);
  assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null,
    range('2026-10-24T21:00:00Z', '2026-10-24T22:00:00Z')), 1);

  for (const allDay of [false, true]) {
    const calendarApp = calendar();
    add(calendarApp, range('2026-10-26T10:00:00Z', '2026-10-26T11:00:00Z'), { color: '#9999ff' });
    add(calendarApp, { ...range('2026-10-30T00:00:00Z', '2026-10-31T00:00:00Z'),
      allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' });
    const proposed = allDay ? { ...range('2026-10-30T00:00:00Z', '2026-10-31T00:00:00Z'),
      allDay: true, startDate: '2026-10-23', endDate: '2026-10-24' } : range();
    candidateColors(calendarApp, ['#ff9999', '#99ffff', '#99ff99']);
    assert.equal(calendarApp.chooseInitialEventColorSeed(0, 'Home', null, proposed), 1);
  }
});

test('next-event lookup ignores continuation pieces and refreshes after edits and filtering', () => {
  const app = calendar();
  app.state.visibleCalendars = ['Home', 'Work'];
  add(app, range('2026-10-20T00:00:00Z', '2026-10-26T00:00:00Z'));
  const next = add(app, range('2026-10-27T10:00:00Z', '2026-10-27T11:00:00Z'));
  const later = add(app, range('2026-10-28T10:00:00Z', '2026-10-28T11:00:00Z'), { calendar: 'Work' });
  const selected = () => Array.from(app.getNextEventColorNeighbors(app.getEventIntervalIndex(), range()), entry => entry.event);
  assert.deepEqual(selected(), [next]);
  assert.ok(app.editEvent(next, range('2026-10-29T10:00:00Z', '2026-10-29T11:00:00Z'), { redraw: false, persist: false }));
  assert.deepEqual(selected(), [later]);
  app.state.visibleCalendars = ['Home'];
  assert.deepEqual(selected(), [next]);
  app.state.visibleCalendars = [];
  assert.deepEqual(selected(), []);
});

test('cached next-event lookup searches a large calendar without rescanning every start', () => {
  const app = calendar();
  const entries = Array.from({ length: 10000 }, (_, i) => ({ startMs: i * Time.HOUR, endMs: (i + 1) * Time.HOUR,
    event: { start: new Date(i * Time.HOUR), end: new Date((i + 1) * Time.HOUR) } }));
  const index = new context.SpiralEventIntervalIndex(entries);
  app.getNextEventColorNeighbors(index, { start: new Date(0), end: new Date(Time.HOUR) });
  let reads = 0;
  index.colorEventStarts.entries = new Proxy(index.colorEventStarts.entries, { get(target, property) {
    if (/^\d+$/.test(String(property))) reads++;
    return Reflect.get(target, property);
  } });
  const next = app.getNextEventColorNeighbors(index, { start: new Date(8999 * Time.HOUR), end: new Date(9000 * Time.HOUR) });
  assert.equal(next[0].event, entries[9000].event);
  assert.ok(reads < 64, `Read ${reads} cached event starts.`);
});

test('neighbors up to two hours before or after influence colors in saved and generated batches', () => {
  for (const gap of [5 * 60000, 30 * 60000, 60 * 60000, 120 * 60000, 120 * 60000 + 1]) {
    for (const before of [false, true]) for (const inBatch of [false, true]) {
      const app = calendar();
      const proposed = range();
      const end = before ? proposed.start.getTime() - gap : proposed.end.getTime() + gap + Time.HOUR;
      const event = add(app, { start: new Date(end - Time.HOUR), end: new Date(end) });
      const snapshot = JSON.stringify(event);
      let batch = null;
      if (inBatch) {
        batch = { index: new context.SpiralEventIntervalIndex([]),
          addedEntries: app.getEventProjection(event).intervals.map(interval => ({ event,
            startMs: interval.layoutStartMs, endMs: interval.layoutEndMs })) };
      }
      candidateColors(app, ['#ff9999', '#99ffff']);
      assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, proposed, batch), !before || gap <= 120 * 60000 ? 1 : 0,
        JSON.stringify({ gap, before, inBatch }));
      assert.equal(JSON.stringify(event), snapshot);
    }
  }
});

test('overlapping and touching colors have more influence than distant neighbors', () => {
  for (const [gapMinutes, expected] of [[0, 1], [5, 1], [120, 0]]) {
    const app = calendar();
    const proposed = range();
    add(app, range());
    const start = proposed.end.getTime() + gapMinutes * 60000;
    add(app, { start: new Date(start), end: new Date(start + Time.HOUR) }, { color: '#9999ff' });
    candidateColors(app, ['#99ffff', '#99ff99']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, proposed), expected, `${gapMinutes} minute gap`);
  }
});

test('the neighborhood uses elapsed minutes across skipped and repeated hours', () => {
  const cases = [
    ['2026-03-29T00:00:00Z', '2026-03-29T00:45:00Z', '2026-03-29T01:00:00Z', '2026-03-29T01:30:00Z', true],
    ['2026-03-29T01:15:00Z', '2026-03-29T01:45:00Z', '2026-03-29T00:00:00Z', '2026-03-29T00:45:00Z', true],
    ['2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z', '2026-10-25T00:50:00Z', '2026-10-25T01:10:00Z', true],
    ['2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z', '2026-10-25T01:10:00Z', '2026-10-25T01:15:00Z', true],
    ['2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z', '2026-10-25T02:20:00.001Z', '2026-10-25T02:45:00Z', false]
  ];
  for (const [start, end, proposedStart, proposedEnd, nearby] of cases) {
    const app = calendar();
    add(app, range(start, end));
    candidateColors(app, ['#ff9999', '#99ffff']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range(proposedStart, proposedEnd)), nearby ? 1 : 0);
  }
});

test('the neighborhood crosses midnight and respects all-day display dates', () => {
  for (const allDay of [false, true]) for (const gap of [15 * 60000, 120 * 60000, 120 * 60000 + 1]) {
    const app = calendar();
    add(app, allDay ? { ...range('2026-10-22T00:00:00Z', '2026-10-23T00:00:00Z'),
      allDay: true, startDate: '2026-10-23', endDate: '2026-10-24' }
      : range('2026-10-23T21:00:00Z', '2026-10-23T22:00:00Z'));
    const start = Date.parse('2026-10-23T22:00:00Z') + gap;
    const proposed = { start: new Date(start), end: new Date(start + Time.HOUR) };
    candidateColors(app, ['#ff9999', '#99ffff']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, proposed), gap <= 120 * 60000 ? 1 : 0);
  }
});

test('neighbors are compared using their current palette colors without changing stored metadata', () => {
  for (const custom of [false, true]) {
    const app = calendar();
    app.state.paletteAffectsCustomColors = true;
    add(app, range(), { color: '#ff9999', colorIsCustom: custom, colorSeed: 0 });
    candidateColors(app, ['#99ffff', '#ff9999']);
    app.generatePaletteColorFromCustomColor = () => '#99ffff';
    const before = JSON.stringify(app.events);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, range()), 1);
    assert.equal(JSON.stringify(app.events), before);
  }
});

test('batch creation considers both saved and earlier generated neighbors without rebuilding the index', () => {
  const app = calendar();
  add(app, range());
  const batch = { index: app.getEventIntervalIndex(), addedEntries: [] };
  const generated = add(app, range(), { color: '#9999ff' });
  for (const interval of app.getEventProjection(generated).intervals) {
    batch.addedEntries.push({ event: generated, startMs: interval.layoutStartMs, endMs: interval.layoutEndMs });
  }
  candidateColors(app, ['#99ffff', '#99ff99']);
  app.getEventIntervalIndex = () => assert.fail('The batch must reuse its original index.');
  const color = app.createEventColorState({ calendarName: 'Home', eventDate: app.getEventWallDate(generated, 'start'),
    initialRange: range(), initialColorNeighbors: batch });
  assert.equal(color.color, '#99ff99');
});

test('neighbor matching respects DST occurrences, midnight, and all-day display dates', () => {
  const cases = [
    [range('2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z'),
      range('2026-10-25T00:10:00Z', '2026-10-25T00:15:00Z'), true],
    [range('2026-10-25T00:00:00Z', '2026-10-25T00:20:00Z'),
      range('2026-10-25T01:10:00Z', '2026-10-25T01:15:00Z'), true],
    [range('2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z'),
      range('2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z'), true],
    [range('2026-10-23T21:30:00Z', '2026-10-23T22:00:00Z'),
      range('2026-10-23T22:00:00Z', '2026-10-23T23:00:00Z'), true],
    [{ ...range('2026-10-22T00:00:00Z', '2026-10-23T00:00:00Z'), allDay: true,
      startDate: '2026-10-23', endDate: '2026-10-24' }, range(), true]
  ];
  for (const [existing, proposed, touching] of cases) {
    const app = calendar();
    add(app, existing);
    candidateColors(app, ['#ff9999', '#99ffff']);
    assert.equal(app.chooseInitialEventColorSeed(0, 'Home', null, proposed), touching ? 1 : 0);
  }
});

test('real palette candidates improve hue separation while staying within each palette', () => {
  for (const mode of ['random', 'pastel', 'saturation', 'colorblind', 'calendar']) {
    const app = calendar(mode);
    const date = Time.parseWall('2026-10-23T10:00');
    const originalColor = app.generatePaletteColorFromSeed(10, 'Home', date);
    add(app, range(), { color: originalColor });
    let seed = 10;
    app.createEventColorSeed = () => ++seed;
    const chosen = app.chooseInitialEventColorSeed(10, 'Home', date, range());
    const color = app.generatePaletteColorFromSeed(chosen, 'Home', date);
    assert.ok(hueGap(app.getPaletteProfileFromColor(originalColor).hue,
      app.getPaletteProfileFromColor(color).hue) > 120, mode);
    assert.ok(chosen >= 10 && chosen <= 21);
  }
});

test('fixed palettes keep their colors; monochrome palettes can use lightness differences', () => {
  for (const mode of ['single', 'seasonal', 'calendar']) {
    const app = calendar(mode);
    app.state.calendarColors = { Home: '#123456' };
    app.getEventIntervalIndex = () => assert.fail('Fixed palettes do not need neighbor queries.');
    assert.equal(app.chooseInitialEventColorSeed(10, 'Home', null, range()), 10);
  }
  for (const [mode, saturationLevel] of [['monoHue', 80], ['saturation', 0]]) {
    const app = calendar(mode);
    app.state.saturationLevel = saturationLevel;
    const date = Time.parseWall('2026-10-23T10:00');
    const color = app.generatePaletteColorFromSeed(10, 'Home', date);
    add(app, range(), { color });
    let seed = 10;
    app.createEventColorSeed = () => ++seed;
    const chosen = app.chooseInitialEventColorSeed(10, 'Home', date, range());
    const newColor = app.generatePaletteColorFromSeed(chosen, 'Home', date);
    assert.ok(Math.abs(app.getPaletteProfileFromColor(color).lightnessUnit
      - app.getPaletteProfileFromColor(newColor).lightnessUnit) > 0.03, mode);
  }
});

test('only initial creation opts in; explicit seeds, imports, existing events and manual colors bypass it', () => {
  const app = calendar();
  const options = { calendarName: 'Home', eventDate: Time.parseWall('2026-10-23T10:00'), initialRange: range() };
  let calls = 0;
  app.chooseInitialEventColorSeed = () => { calls++; return 123; };
  assert.equal(app.createEventColorState(options).colorSeed, 123);
  for (const extra of [{ colorSeed: 0 }, { colorSeed: 1234 }, { customColor: '#aabbcc' }, { event: range() }]) {
    app.createEventColorState({ ...options, ...extra });
  }
  app.createEventColorState({ calendarName: 'Home', eventDate: options.eventDate }); // Import without a seed.
  assert.equal(calls, 1);
});

test('the initial draft color survives edits, save/reload, new neighbors, and repeated display reads', () => {
  const app = calendar();
  add(app, range());
  app.draftEvent = app.createDraftEventForSegmentId(10);
  const { colorSeed, color } = app.draftEvent;
  app.finishActiveDetailTextEditor = () => {};
  assert.ok(app.editEvent(app.draftEvent, { title: 'Moved', ...range('2026-10-24T08:00:00Z', '2026-10-24T10:00:00Z') }));
  const saved = app.addDraftEvent();
  const record = JSON.parse(JSON.stringify(app.serializeEventTime(saved)));
  const reloaded = app.normalizeRuntimeEvent(record);
  add(app, range('2026-10-24T08:30:00Z', '2026-10-24T09:30:00Z'), { color });
  app.chooseInitialEventColorSeed = () => assert.fail('An assigned seed must never be reselected.');
  for (const event of [saved, reloaded]) {
    for (let read = 0; read < 3; read++) assert.equal(app.getDisplayColorForEvent(event), color);
    assert.equal(event.colorSeed, colorSeed);
  }
});

function animationFixture({ reducedMotion = false } = {}) {
  const frames = new Map();
  let nextFrame = 0;
  let now = 0;
  const media = { matches: reducedMotion };
  const animationContext = vm.createContext({ SpiralCalendar: class {},
    performance: { now: () => now }, window: { matchMedia: () => media },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id) });
  vm.runInContext(fs.readFileSync(new URL('../js/render-circle.js', import.meta.url), 'utf8'), animationContext);
  const app = calendar();
  app.animateEventColorCandidates = animationContext.SpiralCalendar.prototype.animateEventColorCandidates;
  app.requestRender = () => {};
  const advance = time => {
    now = time;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
  };
  return { app, advance, frames, media };
}

test('creation exposes the actual candidates without putting animation data in event records', () => {
  for (const withNeighbor of [false, true]) {
    const app = calendar();
    if (withNeighbor) add(app, range());
    const candidates = [];
    const state = app.createEventColorState({ calendarName: 'Home', initialRange: range(), candidateColors: candidates });
    assert.equal(candidates.length, 12);
    assert.ok(candidates.includes(state.color));
    if (!withNeighbor) assert.equal(state.color, candidates[0], 'Unconstrained choice stays random.');
    assert.deepEqual(Object.keys(state).sort(), ['color', 'colorIsCustom', 'colorSeed']);
  }
  const app = calendar('single');
  const candidates = [];
  app.createEventColorState({ initialRange: range(), candidateColors: candidates });
  assert.equal(candidates.length, 0, 'Fixed palettes have no random shuffle.');
});

test('candidate preview cycles in order, settles on the winner within 300 ms, and stops scheduling frames', () => {
  const { app, advance, frames } = animationFixture();
  const seen = [];
  const finish = app.animateEventColorCandidates(['#ff0000', '#00ff00', '#0000ff'], '#00ff00',
    (color, done) => seen.push([color, done]));
  for (const time of [50, 115, 190, 300]) advance(time);
  assert.deepEqual(seen, [['#ff0000', false], ['#00ff00', false], ['#0000ff', false], ['#00ff00', true]]);
  assert.equal(frames.size, 0);
  finish();
  advance(1000);
  assert.equal(seen.length, 4);
});

test('canceling or abandoning a preview settles once and prevents stale animation callbacks', () => {
  for (const abandon of [false, true]) {
    const { app, advance, frames } = animationFixture();
    const seen = [];
    let active = true;
    const finish = app.animateEventColorCandidates(['#ff0000', '#0000ff'], '#0000ff',
      (color, done) => seen.push([color, done]), () => active);
    const staleCallback = [...frames.values()][0];
    if (abandon) { active = false; advance(100); }
    else finish();
    staleCallback(500);
    advance(1000);
    assert.deepEqual(seen, [['#ff0000', false], ['#0000ff', true]]);
    assert.equal(frames.size, 0);
  }
});

test('reduced motion and nonanimated environments show only the final color', () => {
  for (const app of [animationFixture({ reducedMotion: true }).app, calendar()]) {
    const seen = [];
    app.animateEventColorCandidates(['#ff0000', '#0000ff'], '#0000ff',
      (color, done) => seen.push([color, done]));
    assert.deepEqual(seen, [['#0000ff', true]]);
  }
  const { app, advance, frames, media } = animationFixture();
  const seen = [];
  app.animateEventColorCandidates(['#ff0000', '#0000ff'], '#0000ff', color => seen.push(color));
  media.matches = true;
  advance(100);
  assert.deepEqual(seen, ['#ff0000', '#0000ff']);
  assert.equal(frames.size, 0);
});

test('the animation setting skips the shuffle and can stop an ongoing preview', () => {
  for (const disableDuringPreview of [false, true]) {
    const { app, advance, frames } = animationFixture();
    const seen = [];
    app.state.animateEventColors = disableDuringPreview;
    app.animateEventColorCandidates(['#ff0000', '#0000ff'], '#0000ff',
      (color, done) => seen.push([color, done]));
    app.state.animateEventColors = false;
    advance(50);
    assert.deepEqual(seen, disableDuringPreview
      ? [['#ff0000', false], ['#0000ff', true]] : [['#0000ff', true]]);
    assert.equal(frames.size, 0);
  }
});

test('draft animation changes only the displayed fill and ring; an immediate Save keeps the winner', () => {
  const { app, advance, frames } = animationFixture();
  app.finishActiveDetailTextEditor = () => {};
  const event = app.draftEvent = app.normalizeRuntimeEvent({ ...range(), colorSeed: 5, isDraft: true });
  app.ensureEventColorMetadata(event);
  event.segmentId = 10;
  const finalColor = event.color;
  const finalDisplay = app.getDisplayColorForEvent(event);
  const before = JSON.stringify(event);
  const version = app._eventsVersion;
  app.cache = { colors: ['#ffffff'] };
  app.getSegmentId = () => 10;
  app.getEventColorForSegment = () => null;
  app.startDraftEventColorPreview(event, ['#ff0000', '#00ff00', finalColor]);
  assert.equal(app.calculateSelectedSegmentColor(0, 0), '#ff0000');
  assert.notEqual(app.getDisplayColorForEvent(event), finalDisplay);
  advance(115);
  assert.equal(app.calculateSelectedSegmentColor(0, 0), '#00ff00');
  assert.equal(JSON.stringify(event), before);
  assert.equal(app._eventsVersion, version);
  assert.ok(!JSON.stringify(app.serializeEventTime(event)).includes('preview'));
  const saved = app.addDraftEvent();
  assert.equal(saved.color, finalColor);
  assert.equal(saved.colorSeed, event.colorSeed);
  assert.equal(app._eventColorPreviews.has(event), false);
  assert.equal(frames.size, 0);
  advance(1000);
  assert.equal(saved.color, finalColor);
});

test('manual picking, palette changes, and replacement drafts cannot be overwritten by an old preview', () => {
  for (const action of ['picker', 'custom', 'palette', 'replacement']) {
    const { app, advance, frames } = animationFixture();
    const event = app.draftEvent = app.normalizeRuntimeEvent({ ...range(), colorSeed: 5, isDraft: true });
    app.ensureEventColorMetadata(event);
    const finalDisplay = app.getDisplayColorForEvent(event);
    app.startDraftEventColorPreview(event, ['#ff0000', '#00ff00', event.color]);
    if (action === 'picker') assert.equal(app.getColorPickerColorForEvent(event), finalDisplay);
    if (action === 'custom') app.setEventCustomColor(event, '#123456');
    if (action === 'palette') app.state.colorMode = 'single';
    if (action === 'replacement') app.draftEvent = null;
    const display = app.getDisplayColorForEvent(event);
    advance(250);
    assert.equal(app.getDisplayColorForEvent(event), display);
    assert.equal(app._eventColorPreviews.has(event), false);
    assert.equal(frames.size, 0);
    if (action === 'custom') assert.equal(event.color, '#123456');
  }
});
