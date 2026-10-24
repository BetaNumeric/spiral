import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  CONFIG: { SEGMENTS_PER_DAY: 24 }, SpiralCalendar: class {}, isMobileDevice: () => false,
  alert() {} });
for (const file of ['time-model', 'event-model', 'event-projection', 'core-methods',
  'event-time', 'event-index', 'event-editing', 'detail-view-state', 'input-mouse', 'ui-event-panel']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}

function fixture() {
  const app = new context.SpiralCalendar();
  Object.assign(app, {
    events: [], _eventsVersion: 0, actions: [], selections: [],
    state: { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin',
      visibleCalendars: ['Home'], days: 7, detailViewDay: null, rotation: 0, circleMode: true },
    referenceTime: context.SpiralTime.parseWall('2026-10-08T00:00'),
    mouseState: { selectedEventIndex: 0 }, canvasClickAreas: {},
    canvas: { width: 100, height: 100, clientWidth: 100, clientHeight: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    drawSpiral() {}, refreshCanvasCursor() {}, playFeedback() {},
    finishActiveDetailTextEditor() {}, cancelDetailViewAutoZoomAnimation() {},
    isModeTransitionActive: () => false, startDetailViewAutoZoomAnimation() {},
    getDetailViewMetrics: () => ({ centerX: 0, centerY: 0, outerRadius: 1 }),
    getDisplayColorForEvent: () => '#123456', persistEditedEvent() {},
    findSegmentAtPoint() { return this.pointSegment; },
    findEventEntryAtSegmentPoint() { return this.hitIndex; },
    recordStudyAction(type, payload, options) { this.actions.push({ type, payload, options }); },
    recordStudySelection(source, inputMethod) {
      this.selections.push({ source, inputMethod, event: this.getDetailViewEventState()?.detailEvent });
    }
  });
  app.events = [0, 1, 2].map(index => app.normalizeRuntimeEvent({
    title: `Event ${index}`, calendar: 'Home',
    start: '2026-10-08T08:00:00Z', end: '2026-10-08T10:00:00Z', persistentUID: `event-${index}`
  }));
  app.pointSegment = app.getSegmentPositionFromId(10);
  app.hitIndex = 1;
  return app;
}

test('study selection identifies precise event and repeated overlap cycles with actual input method', () => {
  for (const inputMethod of ['mouse', 'pen', 'touch']) {
    const app = fixture();
    const click = () => app.handleClick({ clientX: 80, clientY: 80, pointerType: inputMethod });
    click();
    assert.equal(app.selections[0].event.persistentUID, 'event-1');
    assert.equal(app.selections[0].inputMethod, inputMethod);
    assert.equal(app.actions.length, 0);
    click();
    assert.equal(app.actions.length, 1);
    assert.equal(app.actions[0].type, 'overlap_cycle');
    assert.equal(app.actions[0].payload.fromEventId, 'event-1');
    assert.equal(app.actions[0].payload.eventId, 'event-2');
    assert.equal(app.actions[0].options.inputMethod, inputMethod);
    assert.equal(app.selections.at(-1).event.persistentUID, 'event-2');
    assert.equal(app.actions.some(action => action.type === 'events_changed'), false);
  }
});

test('search logging aggregates results without retaining query or event text', () => {
  const app = fixture();
  app.events.push({ title: 'Private Event', calendar: 'Hidden' });
  app.eventListSearchQuery = 'Event';
  app.recordStudySearchCommit();
  app.recordStudySearchCommit();
  assert.equal(app.actions.length, 1, 'Blur and Enter cannot duplicate a committed query.');
  assert.equal(app.actions[0].payload.resultCount, 3);
  assert.equal(app.actions[0].payload.queryLength, 5);
  assert.equal(JSON.stringify(app.actions[0]).includes('Private'), false);
  assert.equal(Object.hasOwn(app.actions[0].payload, 'query'), false);
  app.eventListSearchQuery = '';
  app.recordStudySearchCommit('search_clear');
  assert.equal(app.actions[1].payload.cleared, true);
});

test('failed edits record failure and preserve canonical event', () => {
  const app = fixture();
  const event = app.events[0];
  const original = event.start.getTime();
  const errors = [];
  app.recordStudyValidationFailure = (...args) => errors.push(args);
  assert.equal(app.editEvent(event, { start: new Date(NaN) }), false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], 'event_edit');
  assert.equal(errors[0][2], event);
  assert.equal(event.start.getTime(), original);
});

test('handle summaries preserve endpoints and distinguish interruption from rollback', () => {
  for (const cancelled of [false, true]) {
    const app = fixture();
    const event = app.events[0];
    app.mouseState.draggingHandle = 'end';
    app.handleDragState = { event, originalStart: new Date(event.start), originalEnd: new Date(event.end), touchMoved: true, touchIdentifier: 3 };
    event.end = new Date(event.end.getTime() + 60000);
    app.finishEventHandleDrag({ cancelled });
    assert.equal(app.actions.length, 1);
    assert.equal(app.actions[0].type, cancelled ? 'handle_drag_cancelled' : 'handle_drag_completed');
    assert.equal(app.actions[0].options.inputMethod, 'touch');
    assert.equal(app.actions[0].payload.handle, 'end');
    assert.equal(Date.parse(app.actions[0].payload.after.end) - Date.parse(app.actions[0].payload.before.end), 60000);
    app.finishEventHandleDrag();
    assert.equal(app.actions.length, 1, 'A second mouseup cannot duplicate a finished gesture.');
  }
});
