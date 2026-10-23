import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection', 'core-methods', 'state-storage-sync', 'detail-view-state', 'event-editors', 'event-time', 'event-index', 'event-editing', 'render-geometry', 'render-circle']) {
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
  app._clockLabelSlices = null;
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

test('dark labels follow the painted overlap lane in both views and stacking modes', () => {
  for (const circle of [false, true]) for (const stack of [false, true]) {
    const app = calendar();
    app.state.darkMode = true;
    app.state.overlayStackMode = stack;
    app.getDisplayColorForEvent = event => event.color;
    app.add('Dark', '08:00', '10:00').color = '#263448';
    app.add('Pale', '09:15', '09:45').color = '#9fe5df';
    const geometry = collect(app, 9, circle);
    for (const slice of app.eventSegments) {
      const angle = (slice.timeStartTheta + slice.timeEndTheta) / 2;
      const start = circle ? slice.edgeInnerRadius : geometry.radiusFunction(angle) + slice.edgeSliceStart * 100;
      const end = circle ? slice.edgeOuterRadius : geometry.radiusFunction(angle) + slice.edgeSliceEnd * 100;
      const radius = (start + end) / 2;
      const point = { day: geometry.day, segment: geometry.segment,
        angle: circle ? angle + 3 * turn : angle, radius };
      const hit = app.findEventEntryAtSegmentPoint(point);
      const event = app.getEventsForClockSegment(point)[hit].event;
      const label = { ...point, centerTheta: point.angle, centerRadius: radius };
      assert.equal(app.getClockLabelColor(label), event.title === 'Pale' ? '#000000' : '#ffffff');
      app.state.darkMode = false;
      assert.equal(app.getClockLabelColor(label), '#000000');
      app.state.darkMode = true;
    }
    const outside = { day: geometry.day, segment: geometry.segment,
      centerTheta: geometry.rawStartAngle + step / 2, centerRadius: 300 };
    assert.equal(app.getClockLabelColor(outside), vm.runInContext('getCanvasTheme(true).label', context));
  }
});

test('drafts blend into the current clock surface without changing event records', () => {
  const app = calendar();
  // Use the real color pipeline rather than the geometry fixture's fixed color.
  delete app.getDisplayColorForEvent;
  const event = app.add('Color', '09:00', '10:00');
  app.setEventCustomColor(event, '#9fe5df');
  const draft = { ...event, isDraft: true };
  const originalEvent = JSON.stringify(event), originalDraft = JSON.stringify(draft);
  const version = app._eventsVersion;
  const draftColors = [];
  for (const darkMode of [false, true, false]) {
    app.state.darkMode = darkMode;
    assert.equal(app.getDisplayColorForEvent(event), '#9fe5df');
    draftColors.push(app.getDisplayColorForEvent(draft));
    assert.equal(JSON.stringify(event), originalEvent);
    assert.equal(JSON.stringify(draft), originalDraft);
    assert.equal(app._eventsVersion, version);
  }
  assert.equal(draftColors[0], '#cff2ef');
  assert.equal(draftColors[0], draftColors[2]);
  assert.notEqual(draftColors[0], draftColors[1]);
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

test('an overlapping draft and saved event remain individually painted and selectable in both layouts and views', () => {
  for (const circle of [false, true]) for (const stack of [false, true]) {
    const app = calendar();
    app.state.overlayStackMode = stack;
    const saved = app.add('Saved', '09:00', '09:30');
    const draft = app.initializeEventFromWallTimes({ title: 'Draft', calendar: 'Home',
      start: Time.parseWall('2026-10-08T09:00'), end: Time.parseWall('2026-10-08T10:00') });
    Object.assign(draft, { isDraft: true, segmentId: 9 });
    app.draftEvent = draft;
    app.mouseState.selectedSegmentId = 9;
    const geometry = collect(app, 9, circle);
    const angle = Geometry.angleAtFraction(geometry.rawStartAngle, geometry.rawEndAngle, 0.25);
    assert.ok(app.eventSegments.some(slice => slice.event === saved && slice.drawStartEdge),
      'The saved event keeps its ending separator where it overlaps the draft.');
    const slices = app.eventSegments.filter(slice => slice.timeStartTheta < angle && slice.timeEndTheta > angle);
    assert.deepEqual(new Set(slices.map(slice => slice.event)), new Set([saved, draft]));
    const edges = slice => circle ? [(slice.edgeInnerRadius - 100) / 100, (slice.edgeOuterRadius - 100) / 100]
      : [slice.edgeSliceStart, slice.edgeSliceEnd];
    const ordered = slices.map(edges).sort((a, b) => a[0] - b[0]);
    near(ordered[0][0], 0);
    near(ordered[0][1], ordered[1][0]);
    near(ordered[1][1], 1);
    for (const slice of slices) {
      const [inner, outer] = edges(slice);
      assert.ok(outer > inner);
      const radius = circle ? (slice.edgeInnerRadius + slice.edgeOuterRadius) / 2
        : geometry.radiusFunction(angle) + (slice.edgeSliceStart + slice.edgeSliceEnd) / 2 * 100;
      const point = { day: geometry.day, segment: geometry.segment,
        angle: circle ? angle + geometry.day * turn : angle, radius };
      const hit = app.findEventEntryAtSegmentPoint(point);
      assert.notEqual(hit, null);
      assert.equal(app.getEventsForClockSegment(point)[hit].event, slice.event);
    }
  }
});

test('fixed lanes keep the same event width before and through both parts of a repeated hour', () => {
  for (const circle of [false, true]) {
    const app = calendar();
    app.referenceTime = Time.parseWall('2026-10-25T00:00');
    app.state.overlayStackMode = false;
    const long = app.normalizeRuntimeEvent({ title: 'Long', timeModel: 'instant-v1',
      start: '2026-10-24T23:00:00Z', end: '2026-10-25T02:00:00Z' });
    const short = app.normalizeRuntimeEvent({ title: 'First 02:00 only', timeModel: 'instant-v1',
      start: '2026-10-25T00:00:00Z', end: '2026-10-25T00:30:00Z' });
    app.events = [long, short];
    const bounds = [];
    for (const hour of [1, 2]) {
      collect(app, hour, circle);
      for (const slice of app.eventSegments.filter(slice => slice.event === long)) {
        bounds.push([slice.eventSliceStart, slice.eventSliceEnd]);
      }
    }
    assert.ok(bounds.length >= 3, 'Includes both occurrences of the repeated hour.');
    for (const bound of bounds) {
      assert.deepEqual(bound, bounds[0]);
      near(bound[1] - bound[0], 0.5);
    }
  }
});

test('start and end handles sit at the center of the rendered visible lane in both layouts and views', () => {
  for (const circle of [false, true]) for (const stack of [false, true]) {
    const app = calendar();
    app.state.overlayStackMode = stack;
    app.add('Earlier', '08:00', '09:30');
    const selected = app.add('Selected', '09:00', '12:00');
    app.add('Third', '09:00', '09:30');
    app.add('Later', '11:00', '12:30');
    app.mouseState.selectedSegment = app.getSegmentPositionFromId(9);
    for (const isEnd of [false, true]) {
      const date = app.getEventWallDate(selected, isEnd ? 'end' : 'start');
      const d = app._normalizeHandleDate(date, isEnd);
      const hour = d.getUTCHours();
      const geometry = collect(app, hour, circle);
      const pieces = app.eventSegments.filter(piece => piece.event === selected);
      const theta = Geometry.angleAtFraction(geometry.rawStartAngle, geometry.rawEndAngle,
        (d - Time.parseWall(`2026-10-08T${String(hour).padStart(2, '0')}:00`)) / Time.HOUR);
      const piece = pieces.find(piece => theta >= piece.timeStartTheta && theta <= piece.timeEndTheta);
      assert.ok(piece);
      const bounds = circle ? [piece.edgeInnerRadius, piece.edgeOuterRadius] : [
        geometry.radiusFunction(theta) + 100 * piece.edgeSliceStart,
        geometry.radiusFunction(theta) + 100 * piece.edgeSliceEnd];
      const position = app._computeSelectedEventHandlePosition(selected, {
        visibilityRange: { min: -Infinity, max: Infinity }, segmentAngle: step,
        totalVisibleSegments: app.getTotalVisibleSegments(), selectedEventSegments: pieces,
        // A newly constructed detail-view curve must not override the rendered curve.
        radiusFunction: angle => geometry.radiusFunction(angle) + 500,
        offsetMs: pieces[0].displayInterval.offsetMs
      }, date, isEnd);
      const expectedRadius = (bounds[0] + bounds[1]) / 2;
      const angle = -theta + vm.runInContext('CONFIG.INITIAL_ROTATION_OFFSET', context);
      near(position.x, expectedRadius * Math.cos(angle));
      near(position.y, expectedRadius * Math.sin(angle));
    }
  }
});
