import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection', 'core-methods', 'state-storage-sync', 'detail-view-state', 'event-editors', 'event-time', 'event-editing', 'render-geometry']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}
const Time = context.SpiralTime;
const Geometry = context.SpiralGeometry;
const turn = 2 * Math.PI, step = turn / 24;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function calendar() {
  const app = new context.SpiralCalendar();
  app.state = { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin', days: 7, rotation: 0,
    visibleCalendars: ['Home', 'Work'] };
  app.referenceTime = Time.parseWall('2026-10-08T00:00');
  app.events = [];
  app._eventsVersion = 0;
  app.mouseState = {};
  app.getDisplayColorForEvent = () => '#123456';
  app.getRenderVisibilityRange = theta => ({ min: -app.state.rotation - turn, max: -app.state.rotation + theta - turn });
  app.add = (title, start, end, calendar = 'Home') => {
    const event = app.initializeEventFromWallTimes({ title, start: Time.parseWall(`2026-10-08T${start}`),
      end: Time.parseWall(`2026-10-08T${end}`), calendar });
    app.events.push(event);
    app._eventsVersion++;
    return event;
  };
  return app;
}

function collect(app, hour, circle, clip = [0, 1]) {
  const position = app.getSegmentPositionFromId(hour);
  const origin = (circle ? 0 : position.day * turn) + position.segment * step;
  const geometry = { ...position, rawStartAngle: origin, rawEndAngle: origin + step,
    startTheta: origin + clip[0] * step, endTheta: origin + clip[1] * step,
    radiusFunction: theta => 100 + (theta - origin) / turn * 100 };
  if (circle) Object.assign(geometry, { innerRadius: 100, outerRadius: 200 });
  app.eventSegments = [];
  app.collectEventSegments(geometry, app.createVisibleEventBoundaryLookup());
  return geometry;
}

test('time-to-angle conversion and its inverse agree across positive and negative coils', () => {
  for (const origin of [-5 * turn + step, step, 6 * turn + 5 * step]) {
    for (const fraction of [0, 0.125, 0.5, 2 / 3, 1]) {
      const angle = Geometry.angleAtFraction(origin, origin + step, fraction);
      near(Geometry.fractionAtAngle(origin, origin + step, angle), fraction);
    }
    near(Geometry.unwrapAngle(origin + step / 2 - 3 * turn, origin), origin + step / 2);
  }
});

test('both views retain identical overlap coverage and select the event actually painted at each lane', () => {
  const app = calendar();
  app.add('Long', '08:00', '10:00');
  app.add('Short A', '09:15', '09:45');
  app.add('Short B', '09:30', '10:00');
  for (const stack of [false, true]) {
    app.state.overlayStackMode = stack;
    const layouts = [];
    for (const circle of [false, true]) {
      const geometry = collect(app, 9, circle);
      layouts.push(Array.from(app.eventSegments, slice => [slice.event.title,
        Math.round(Geometry.fractionAtAngle(geometry.rawStartAngle, geometry.rawEndAngle, slice.timeEndTheta) * 1e8),
        Math.round(Geometry.fractionAtAngle(geometry.rawStartAngle, geometry.rawEndAngle, slice.timeStartTheta) * 1e8),
        slice.eventSliceStart, slice.eventSliceEnd]));
      for (const slice of app.eventSegments) {
        const angle = (slice.timeStartTheta + slice.timeEndTheta) / 2;
        const start = circle ? slice.edgeInnerRadius : geometry.radiusFunction(angle) + slice.edgeSliceStart * 100;
        const end = circle ? slice.edgeOuterRadius : geometry.radiusFunction(angle) + slice.edgeSliceEnd * 100;
        const point = { day: geometry.day, segment: geometry.segment,
          angle: circle ? angle + geometry.day * turn : angle, radius: (start + end) / 2 };
        const hit = app.findEventEntryAtSegmentPoint(point);
        assert.notEqual(hit, null);
        assert.equal(app.getEventsForClockSegment(point)[hit].event, slice.event);
      }
    }
    assert.deepEqual(layouts[0], layouts[1]);
  }
});

test('stacked overlaps restore full coverage before and after a shorter event', () => {
  const app = calendar();
  app.add('Long', '09:00', '09:50');
  app.add('Short', '09:20', '09:40');
  app.state.overlayStackMode = true;
  const { day, segment } = app.getSegmentPositionFromId(9);
  const slices = app.getEventLayoutSlices(app.getAllEventsForSegment(day, segment));
  assert.deepEqual(Array.from(slices, s => [s.entry.event.title, s.startMinute, s.endMinute, s.eventSliceStart, s.eventSliceEnd]), [
    ['Long', 0, 20, 0, 1], ['Long', 20, 40, 0, 1], ['Short', 20, 40, 0.5, 1], ['Long', 40, 50, 0, 1]
  ]);
});

test('clipped circle arcs omit hidden endpoint strokes and fully hidden events produce no band', () => {
  const app = calendar();
  app.add('Clipped', '09:15', '09:45');
  app.state.showAllEventBoundaryStrokes = true;
  for (const stack of [false, true]) {
    app.state.overlayStackMode = stack;
    const geometry = collect(app, 9, true, [0, 0.5]);
    assert.equal(app.eventSegments.length, 1);
    const slice = app.eventSegments[0];
    near(slice.timeEndTheta, geometry.endTheta);
    assert.equal(slice.drawStartEdge, true);
    assert.equal(slice.drawEndEdge, false);
    collect(app, 9, true, [0.8, 1]);
    assert.equal(app.eventSegments.length, 0);
  }
});

test('continuing events keep their hour joins closed without drawing false endpoints', () => {
  const app = calendar();
  app.add('Continues', '08:15', '10:45');
  app.state.showAllEventBoundaryStrokes = true;
  for (const circle of [false, true]) for (const stack of [false, true]) {
    app.state.overlayStackMode = stack;
    collect(app, 9, circle);
    assert.equal(app.eventSegments.length, 1);
    const slice = app.eventSegments[0];
    assert.equal(slice.coverStartEdge, true);
    assert.equal(slice.coverEndEdge, true);
    assert.equal(slice.drawStartEdge, false);
    assert.equal(slice.drawEndEdge, false);
  }
});

test('calendar filtering and an active unsaved draft feed the same shared layout', () => {
  const app = calendar();
  const hidden = app.add('Hidden', '09:00', '10:00', 'Work');
  app.state.visibleCalendars = ['Home'];
  collect(app, 9, false);
  assert.equal(app.eventSegments.length, 0);
  app.draftEvent = { ...hidden, title: 'Draft', calendar: 'Home', segmentId: 9 };
  app.mouseState.selectedSegmentId = 9;
  for (const circle of [false, true]) {
    collect(app, 9, circle);
    assert.equal(app.eventSegments.length, 1);
    assert.equal(app.eventSegments[0].event, app.draftEvent);
    assert.equal(app.eventSegments[0].eventSliceStart, 0);
    assert.equal(app.eventSegments[0].eventSliceEnd, 1);
  }
});

test('repeated hours retain consecutive full-width pieces in both views and stacking modes', () => {
  for (const [zone, date, hour, start, end, firstFraction] of [
    ['Europe/Berlin', '2026-10-25', 2, '2026-10-25T00:00:00Z', '2026-10-25T02:00:00Z', 0.5],
    ['Australia/Lord_Howe', '2026-04-05', 1, '2026-04-04T14:00:00Z', '2026-04-04T15:30:00Z', 2 / 3]
  ]) {
    const app = calendar();
    app.state.locationTimezoneId = zone;
    app.referenceTime = Time.parseWall(date + 'T00:00');
    app.events = [app.normalizeRuntimeEvent({ title: 'Fold', start, end })];
    for (const circle of [false, true]) for (const stack of [false, true]) {
      app.state.overlayStackMode = stack;
      const geometry = collect(app, hour, circle);
      assert.equal(app.eventSegments.length, 2);
      for (const slice of app.eventSegments) {
        assert.equal(slice.eventSliceStart, 0);
        assert.equal(slice.eventSliceEnd, 1);
      }
      const [first, second] = app.eventSegments;
      near(Geometry.fractionAtAngle(geometry.rawStartAngle, geometry.rawEndAngle, first.timeStartTheta), firstFraction);
      near(first.timeStartTheta, second.timeEndTheta);
      near(second.timeStartTheta, geometry.rawStartAngle);
    }
  }
});

test('all-day events fill every calendar hour including both occurrences of a repeated hour', () => {
  const app = calendar();
  app.referenceTime = Time.parseWall('2026-10-25T00:00');
  app.events = [app.normalizeRuntimeEvent({ title: 'All day', start: '2026-10-24T22:00:00Z', end: '2026-10-25T23:00:00Z',
    allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' })];
  assert.equal(app.events[0].end - app.events[0].start, 25 * Time.HOUR);
  for (const circle of [false, true]) for (const stack of [false, true]) for (const hour of [0, 2, 23]) {
    app.state.overlayStackMode = stack;
    const geometry = collect(app, hour, circle);
    assert.equal(app.eventSegments.length, 1);
    const slice = app.eventSegments[0];
    near(slice.timeStartTheta, geometry.rawStartAngle);
    near(slice.timeEndTheta, geometry.rawEndAngle);
    assert.equal(slice.eventSliceStart, 0);
    assert.equal(slice.eventSliceEnd, 1);
  }
});
