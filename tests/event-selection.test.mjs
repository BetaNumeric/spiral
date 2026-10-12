import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  CONFIG: { SEGMENTS_PER_DAY: 24 }, SpiralCalendar: class {}, isMobileDevice: () => false });
for (const file of ['time-model', 'event-model', 'event-projection', 'core-methods',
  'event-time', 'event-index', 'event-editing', 'detail-view-state', 'input-mouse', 'touch-time-orientation']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}

function fixture(date = '2026-10-08', ranges = [
  ['08:00:00Z', '10:00:00Z'], ['08:15:00Z', '09:45:00Z'], ['08:30:00Z', '09:30:00Z']
]) {
  const app = new context.SpiralCalendar();
  Object.assign(app, {
    events: [], _eventsVersion: 0, draws: 0, colors: [], persists: 0, touchState: {},
    state: { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin',
      visibleCalendars: ['Home'], days: 7, detailViewDay: null, rotation: 0, circleMode: true },
    referenceTime: context.SpiralTime.parseWall(date + 'T00:00'),
    mouseState: { selectedEventIndex: 0 }, canvasClickAreas: {},
    canvas: { width: 100, height: 100, clientWidth: 100, clientHeight: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    drawSpiral() { this.draws++; }, refreshCanvasCursor() {}, playFeedback() {},
    finishActiveDetailTextEditor() { this._finishDetailTextEditor?.(); this._finishDetailTextEditor = null; },
    cancelDetailViewAutoZoomAnimation() {}, isModeTransitionActive: () => false,
    startDetailViewAutoZoomAnimation() {},
    getDetailViewMetrics: () => ({ centerX: 0, centerY: 0, outerRadius: 1 }),
    getDisplayColorForEvent: () => '#123456',
    persistEditedEvent() { this.persists++; }, resetPendingTouchJoystick() {},
    openColorPicker(event) { this.colors.push(event); },
    findSegmentAtPoint() { return this.pointSegment; },
    findEventEntryAtSegmentPoint() { return this.hitIndex; }
  });
  app.events = ranges.map(([start, end], index) => app.normalizeRuntimeEvent({
    title: String(index), calendar: 'Home', start: date + 'T' + start, end: date + 'T' + end
  }));
  app.pointSegment = app.getSegmentPositionFromId(10);
  app.hitIndex = 0;
  app.click = (pointerType = 'mouse') => app.handleClick({ clientX: 80, clientY: 80, pointerType });
  app.selected = () => app.getDetailViewEventState()?.detailEvent?.title;
  return app;
}

test('repeated mouse and pen clicks select the painted event without advancing', () => {
  for (const type of ['mouse', 'pen']) {
    const app = fixture();
    app.hitIndex = 1;
    for (let tap = 0; tap < 4; tap++) {
      app.click(type);
      assert.equal(app.selected(), '1');
    }
    app.hitIndex = 2;
    app.click(type);
    assert.equal(app.selected(), '2');
    assert.equal(app.colors.length, 0);
    app.hitIndex = null;
    app.click(type);
    assert.equal(app.selected(), '2');
  }
});

test('keyboard event navigation follows chronology across hours and days, skipping hidden calendars', () => {
  const app = fixture();
  app.requestRender = () => app.drawSpiral();
  const early = app.normalizeRuntimeEvent({ title: 'Early', calendar: 'Home',
    start: '2026-10-08T07:00:00Z', end: '2026-10-08T07:30:00Z' });
  const late = app.normalizeRuntimeEvent({ title: 'Tomorrow', calendar: 'Home',
    start: '2026-10-09T12:00:00Z', end: '2026-10-09T13:00:00Z' });
  const hidden = app.normalizeRuntimeEvent({ title: 'Hidden', calendar: 'Work',
    start: '2026-10-08T08:20:00Z', end: '2026-10-08T09:00:00Z' });
  app.events.push(late, hidden, early);
  app._eventsVersion++;
  const records = JSON.stringify(app.events);
  app.click();
  assert.equal(app.selected(), '0');
  assert.equal(app.navigateDetailViewEvent(-1), true);
  assert.equal(app.selected(), 'Early');
  assert.equal(app.navigateDetailViewEvent(-1), false);
  for (const title of ['0', '1', '2', 'Tomorrow']) {
    assert.equal(app.navigateDetailViewEvent(1), true);
    assert.equal(app.selected(), title);
  }
  assert.equal(app.navigateDetailViewEvent(1), false);
  assert.equal(JSON.stringify(app.events), records);
  assert.equal(app.persists, 0);
});

test('keyboard event navigation sorts repeated-hour events by their actual instants', () => {
  const app = fixture('2026-10-25', [
    ['00:00:00Z', '01:00:00Z'], ['01:00:00Z', '02:00:00Z'], ['02:00:00Z', '03:00:00Z']
  ]);
  app.requestRender = () => app.drawSpiral();
  assert.equal(app.openEventAtStart(app.events[0]), true);
  assert.equal(app.selected(), '0');
  assert.equal(app.mouseState.selectedSegment.clockOffsetMs, 2 * context.SpiralTime.HOUR);
  assert.equal(app.navigateDetailViewEvent(1), true);
  assert.equal(app.selected(), '1');
  assert.equal(app.mouseState.selectedSegment.clockOffsetMs, context.SpiralTime.HOUR);
  assert.equal(app.navigateDetailViewEvent(-1), true);
  assert.equal(app.selected(), '0');
});

test('keyboard navigation at a lone event or unsaved draft keeps the selection intact', () => {
  const app = fixture('2026-10-08', [['08:00:00Z', '10:00:00Z']]);
  app.click();
  const rotation = app.state.rotation;
  const selection = app.mouseState.selectedSegment;
  for (const direction of [-1, 1]) assert.equal(app.navigateDetailViewEvent(direction), false);
  assert.equal(app.mouseState.selectedSegment, selection);
  assert.equal(app.state.rotation, rotation);
  app.draftEvent = { ...app.events[0], title: 'Unsaved', isDraft: true,
    segmentId: app.getSelectedSegmentId() };
  const draft = JSON.stringify(app.draftEvent);
  assert.equal(app.navigateDetailViewEvent(1), false);
  assert.equal(JSON.stringify(app.draftEvent), draft);
  assert.equal(app.persists, 0);
});

test('touch taps visit every event and wrap without resetting to a narrow band', () => {
  for (const hits of [[1, 1, 1, 1, 1, 1, 1], [2, 0, 2, 1, 0, 1, 2]]) {
    const app = fixture();
    const actual = [];
    for (const hit of hits) {
      app.hitIndex = hit; // Staying on one band or small radial changes must both work.
      app.click('touch');
      actual.push(app.selected());
    }
    assert.deepEqual(actual, ['0', '1', '2', '0', '1', '2', '0']);
    assert.equal(app.colors.length, 0);
  }
});

test('touch starts from the first event when opening another hour', () => {
  const app = fixture();
  app.hitIndex = 2;
  app.click('touch');
  app.click('touch');
  assert.equal(app.selected(), '1');
  app.pointSegment = app.getSegmentPositionFromId(11);
  app.click('touch');
  assert.equal(app.selected(), '0');
});

test('legacy touch clicks use the gesture origin and modern mouse clicks override it', () => {
  const app = fixture();
  app.hitIndex = 2;
  for (let tap = 0; tap < 3; tap++) {
    app._canvasPointerType = 'touch';
    app.click('');
    assert.equal(app.selected(), String(tap));
    assert.equal(app._canvasPointerType, null);
  }
  app._canvasPointerType = 'touch';
  app.hitIndex = 1;
  app.click('mouse');
  assert.equal(app.selected(), '1');
  app.click('touch');
  assert.equal(app.selected(), '2');
});

test('touch-origin compatibility clicks can identify their source without pointer tracking', () => {
  const app = fixture();
  app.hitIndex = 2;
  for (let tap = 0; tap < 3; tap++) {
    app.handleClick({ clientX: 80, clientY: 80, sourceCapabilities: { firesTouchEvents: true } });
    assert.equal(app.selected(), String(tap));
  }
});

test('changing a mouse selection and touch cycling finish pending text on the old event', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const app = fixture();
    app.click(pointerType);
    const oldEvent = app.getDetailViewEventState().detailEvent;
    app._finishDetailTextEditor = () => {
      assert.equal(app.getDetailViewEventState().detailEvent, oldEvent);
      oldEvent.description = 'Saved before switching';
    };
    app.hitIndex = 1;
    app.click(pointerType);
    assert.equal(app.selected(), '1');
    assert.equal(oldEvent.description, 'Saved before switching');
    assert.equal(app._finishDetailTextEditor, null);
  }
});

test('cycling remains available through the explicit previous and next controls', () => {
  const app = fixture();
  app.click('mouse');
  assert.equal(app.cycleDetailViewEvent(-1), true);
  assert.equal(app.selected(), '2');
  assert.equal(app.cycleDetailViewEvent(1), true);
  assert.equal(app.selected(), '0');
});

test('touch cycles only within the selected occurrence of a repeated hour', () => {
  const app = fixture('2026-10-25', [
    ['00:05:00Z', '00:55:00Z'], ['00:10:00Z', '00:50:00Z'],
    ['01:05:00Z', '01:55:00Z'], ['01:10:00Z', '01:50:00Z']
  ]);
  app.pointSegment = { ...app.getSegmentPositionFromId(2), clockOffsetMs: 7200000 };
  const first = [];
  for (let tap = 0; tap < 3; tap++) { app.click('touch'); first.push(app.selected()); }
  assert.deepEqual(first, ['0', '1', '0']);
  app.pointSegment = { ...app.getSegmentPositionFromId(2), clockOffsetMs: 3600000 };
  const second = [];
  for (let tap = 0; tap < 3; tap++) { app.click('touch'); second.push(app.selected()); }
  assert.deepEqual(second, ['2', '3', '2']);
});

test('stationary taps near a handle cycle without editing or saving event times', () => {
  for (const jitter of [0, 3]) {
    const app = fixture();
    app.click('touch');
    const event = app.getDetailViewEventState().detailEvent;
    const end = event.end.getTime();
    app.mouseState.isHandleDragging = true;
    app.handleDragState = { event, originalStart: new Date(event.start), originalEnd: new Date(event.end),
      touchIdentifier: 1, touchStartX: 80, touchStartY: 80, touchMoved: false };
    app.updateDraggingHandleAtCanvasPoint = () => { throw new Error('A tap must not resize'); };
    const touch = { identifier: 1, clientX: 80 + jitter, clientY: 80 };
    if (jitter) app.handleTouchMove({ touches: [touch], preventDefault() {} });
    let prevented = false;
    app.handleTouchEnd({ type: 'touchend', touches: [], changedTouches: [touch], cancelable: true,
      preventDefault() { prevented = true; } });
    assert.equal(app.selected(), '1');
    assert.equal(event.end.getTime(), end);
    assert.equal(app.persists, 0);
    assert.equal(prevented, true); // Suppress a second compatibility click.
  }
});

test('a moved or canceled handle gesture never cycles or opens another event', () => {
  for (const canceled of [false, true]) {
    const app = fixture();
    app.click('touch');
    const event = app.getDetailViewEventState().detailEvent;
    app.mouseState.isHandleDragging = true;
    app.handleDragState = { event, originalStart: new Date(event.start), originalEnd: new Date(event.end),
      touchIdentifier: 1, touchStartX: 80, touchStartY: 80, touchMoved: false };
    app.updateDraggingHandleAtCanvasPoint = () => { event.end = new Date(event.end.getTime() + 300000); };
    if (!canceled) app.handleTouchMove({ touches: [{ identifier: 1, clientX: 90, clientY: 80 }], preventDefault() {} });
    app.handleTouchEnd({ type: canceled ? 'touchcancel' : 'touchend', touches: [],
      changedTouches: [{ identifier: 1, clientX: 80, clientY: 80 }], cancelable: true, preventDefault() {} });
    assert.equal(app.selected(), '0'); // Returning a drag to its origin is still a drag.
    assert.equal(app.persists, canceled ? 0 : 1);
    assert.equal(app.mouseState.wasDragging, true);
  }
});
