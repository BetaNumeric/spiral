// Calendar geometry and query benchmark; no browser, Canvas, or storage required.
// Use --baseline to compare with the current checkout's HEAD before committing.
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = process.argv.includes('--baseline');
const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection',
  'core-methods', 'state-storage-sync', 'event-time', 'event-index', 'render-geometry']) {
  let source;
  if (baseline) {
    try {
      source = execFileSync('git', ['show', `HEAD:js/${file}.js`], {
        cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      if (file === 'event-index') continue;
      throw error;
    }
  } else source = fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8');
  vm.runInContext(source, context);
}

const Time = context.SpiralTime;
const turn = 2 * Math.PI, step = turn / 24;
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sample = action => median(Array.from({ length: 7 }, () => {
  const before = performance.now();
  action();
  return performance.now() - before;
}));
const round = value => Math.round(value * 1000) / 1000;

function calendar(count, days) {
  const app = new context.SpiralCalendar();
  app.state = { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin',
    visibleCalendars: ['Home'], days: 7, rotation: 0, overlayStackMode: false };
  app.referenceTime = Time.parseWall('2026-10-25T00:00');
  app.mouseState = {};
  app._eventsVersion = 1;
  app.getDisplayColorForEvent = () => '#9fe5df';
  app.getRenderVisibilityRange = theta => ({ min: -app.state.rotation - turn,
    max: -app.state.rotation + theta - turn });
  app.events = Array.from({ length: count }, (_, i) => {
    const start = Date.parse('2026-10-25T00:00:00Z') + (i % days) * Time.DAY
      + (Math.floor(i / days) % 12) * Time.HOUR + (i % 5) * 60000;
    return app.normalizeRuntimeEvent({ persistentUID: `benchmark-${i}`, title: `Event ${i}`,
      calendar: i % 7 === 0 ? 'Hidden' : 'Home', start: new Date(start),
      end: new Date(start + (30 + i % 90) * 60000) });
  });
  return app;
}

function geometry(app) {
  app.eventSegments = [];
  const boundaries = app.createVisibleEventBoundaryLookup();
  for (let hour = 0; hour < 144; hour++) {
    const position = app.getSegmentPositionFromId(hour);
    const origin = position.day * turn + position.segment * step;
    app.collectEventSegments({ ...position, rawStartAngle: origin, rawEndAngle: origin + step,
      startTheta: origin, endTheta: origin + step, innerRadius: 100, outerRadius: 200 }, boundaries);
  }
}

const results = [];
for (const [scenario, count, days] of [['year-1000', 1000, 365], ['year-10000', 10000, 365], ['dense-500', 500, 1]]) {
  const start = performance.now();
  const app = calendar(count, days);
  const prepareMs = performance.now() - start;
  const before = performance.now();
  geometry(app);
  const firstGeometryMs = performance.now() - before;
  const warmGeometryMs = sample(() => geometry(app));
  const queryMs = sample(() => {
    for (let i = 0; i < 144; i++) {
      const position = app.getSegmentPositionFromId(i);
      app.getEventsForClockSegment(position);
    }
  }) / 144;
  results.push({ scenario, prepareMs: round(prepareMs), firstGeometryMs: round(firstGeometryMs),
    warmGeometryMs: round(warmGeometryMs), hourQueryMs: round(queryMs), slices: app.eventSegments.length });
}
console.log(`Source: ${baseline ? 'HEAD' : 'workspace'}; Node ${process.version}`);
console.table(results);
