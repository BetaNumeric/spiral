import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const alerts = [];
const context = vm.createContext({ console, Date, Intl, WeakMap, Map, Set, crypto: webcrypto,
  alert: message => alerts.push(message), CONFIG: { SEGMENTS_PER_DAY: 24 }, SpiralCalendar: class {} });
for (const file of ['config-utils', 'time-model', 'event-model', 'event-projection', 'core-methods',
  'event-time', 'event-index', 'event-editing', 'event-editors', 'detail-view-state']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
}

function fixture() {
  const app = new context.SpiralCalendar();
  Object.assign(app, {
    events: [], _eventsVersion: 0, saves: 0, listRenders: 0, draws: 0,
    state: { useLocationTimezone: true, locationTimezoneId: 'Europe/Berlin',
      visibleCalendars: ['Home'], detailViewDay: null, rotation: 0 },
    mouseState: {},
    saveEventsToStorage() { this.saves++; return Promise.resolve(true); },
    requestEventListRender() { this.listRenders++; },
    drawSpiral() { this.draws++; },
    refreshCanvasCursor() {}
  });
  const event = app.normalizeRuntimeEvent({ title: 'Original', calendar: 'Home',
    start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z' });
  app.events.push(event);
  return { app, event };
}

test('calendar edits immediately refresh visibility while retaining event identity', () => {
  const { app, event } = fixture();
  assert.equal(app.getVisibleEvents()[0], event);
  app.layoutCache = { old: true };
  assert.equal(app.editEvent(event, { calendar: 'Hidden' }), true);
  assert.equal(app.events[0], event);
  assert.equal(app.getVisibleEvents().length, 0);
  assert.equal(app.layoutCache, null);
  assert.equal(app._eventsVersion, 1);
  assert.equal(app.saves, 1);
  assert.equal(app.listRenders, 1);
});

test('unchanged edits do not save, invalidate views, or alter modification time', () => {
  const { app, event } = fixture();
  const lastModified = event.lastModified;
  app.layoutCache = { old: true };
  assert.ok(app.editEvent(event, { title: ' Original ' }));
  assert.equal(event.lastModified, lastModified);
  assert.equal(app._eventsVersion, 0);
  assert.equal(app.saves, 0);
  assert.equal(app.draws, 0);
  assert.ok(app.layoutCache.old);
});

test('invalid and cancelled edits leave dates and other fields untouched', () => {
  const { app, event } = fixture();
  const original = JSON.stringify(event);
  const originalStart = event.start;
  assert.equal(app.editEvent(event, candidate => {
    candidate.title = 'Invalid';
    candidate.start.setTime(candidate.end.getTime());
  }), false);
  assert.equal(JSON.stringify(event), original);
  assert.equal(event.start, originalStart);
  assert.equal(app.editEvent(event, candidate => { candidate.title = 'Cancelled'; return false; }), false);
  assert.equal(app.editEvent(event, { persistentUID: 'replacement-uid' }), false);
  assert.equal(JSON.stringify(event), original);
  assert.equal(app._eventsVersion, 0);
  assert.equal(app.saves, 0);
});

test('detached editors cannot edit or save a replacement event with the same UID', () => {
  const { app, event } = fixture();
  const replacement = app.normalizeRuntimeEvent({ ...event });
  app.events = [replacement];
  let called = false;
  assert.equal(app.editEvent(event, () => { called = true; }), false);
  assert.equal(called, false);
  assert.equal(app.deleteCalendarEvent(event), false);
  assert.equal(app.saves, 0);
  assert.equal(replacement.title, 'Original');
});

test('draft edits remain local and keep an empty title until explicitly edited', () => {
  const { app, event } = fixture();
  const draft = app.draftEvent = { ...event, title: '', isDraft: true, autoEnd: true, segmentId: 2 };
  assert.ok(app.editEvent(draft, { color: '#aabbcc', colorIsCustom: true }));
  assert.equal(draft.title, '');
  assert.ok(app.editEvent(draft, { title: 'Draft title' }));
  assert.equal(draft.title, 'Draft title');
  assert.equal(app.saves, 0);
  assert.equal(app.listRenders, 0);
  assert.equal(app.events.length, 1);
  app.draftEvent = null;
  assert.equal(app.editEvent(draft, { title: 'Discarded' }), false);
});

test('validated all-day to timed edits remove all-day fields from the live event', () => {
  const { app, event } = fixture();
  Object.assign(event, { allDay: true, startDate: '2026-10-25', endDate: '2026-10-26',
    start: new Date('2026-10-24T22:00:00Z'), end: new Date('2026-10-25T23:00:00Z') });
  assert.ok(app.editEvent(event, candidate => app.applyEventTimeRange(candidate,
    context.SpiralTime.parseWall('2026-10-25T09:00'), context.SpiralTime.parseWall('2026-10-25T10:00'))));
  for (const key of ['allDay', 'startDate', 'endDate']) assert.equal(key in event, false);
  assert.equal(event.start.toISOString(), '2026-10-25T08:00:00.000Z');
  assert.equal(event.end - event.start, context.SpiralTime.HOUR);
});

test('adding validates the whole candidate and duplicate UID before changing the collection', () => {
  const { app, event } = fixture();
  assert.equal(app.addCalendarEvent(event), false);
  assert.equal(app.addCalendarEvent({ ...event, persistentUID: 'new', end: event.start }), false);
  assert.equal(app.events.length, 1);
  assert.equal(app.saves, 0);
  const added = app.addCalendarEvent({ ...event, persistentUID: 'new', isDraft: true, autoEnd: true });
  assert.ok(added);
  assert.equal('isDraft' in added, false);
  assert.equal('autoEnd' in added, false);
  assert.equal(app.events.length, 2);
  assert.equal(app.saves, 1);
  assert.equal(app.deleteCalendarEvent(added), true);
  assert.equal(app.events.length, 1);
  assert.equal(app.saves, 2);
});

test('drag completion saves once, restores view state, and leaves draft drags unsaved', () => {
  for (const draft of [false, true]) {
    const { app, event } = fixture();
    if (draft) { event.isDraft = true; app.draftEvent = event; app.events = []; }
    app.mouseState = { isHandleDragging: true, draggingHandle: 'end', hoveredHandle: 'end' };
    app.handleDragState = { event, originalStart: new Date(event.start), originalEnd: new Date(event.end) };
    app._originalCircleModeDuringHandleDrag = true;
    assert.ok(app.editEvent(event, { end: new Date('2026-10-25T01:30:00Z') }, { persist: false, redraw: false }));
    assert.equal(app.saves, 0);
    app.finishEventHandleDrag();
    assert.equal(app.saves, draft ? 0 : 1);
    assert.equal(app.state.circleMode, true);
    assert.equal(app.mouseState.isHandleDragging, false);
    assert.equal(app.mouseState.hoveredHandle, null);
    assert.equal(app.handleDragState, null);
    app.finishEventHandleDrag();
    assert.equal(app.saves, draft ? 0 : 1);
  }
});

test('adding a draft finishes pending text before copying it and clears only a successful draft', () => {
  const { app, event } = fixture();
  app.events = [];
  const draft = app.draftEvent = { ...event, isDraft: true, autoEnd: true, segmentId: 2 };
  app._finishDetailTextEditor = () => { app.editEvent(draft, { title: 'Pending title' }); };
  const added = app.addDraftEvent();
  assert.equal(added.title, 'Pending title');
  assert.equal(added.persistentUID, draft.persistentUID);
  assert.equal('isDraft' in added, false);
  assert.equal(app.draftEvent, null);
  assert.equal(app.saves, 1);
  app._finishDetailTextEditor = null;
  app.draftEvent = draft;
  assert.equal(app.addDraftEvent(), false); // UID already in the collection.
  assert.equal(app.draftEvent, draft);
  assert.equal(app.saves, 1);
});

test('grabbing and releasing a handle without changing it does not save', () => {
  const { app, event } = fixture();
  app.handleDragState = { event, originalStart: new Date(event.start), originalEnd: new Date(event.end) };
  app.finishEventHandleDrag();
  assert.equal(app.saves, 0);
});

test('an old opening transition cannot activate another occurrence of the same hour', () => {
  const { app } = fixture();
  const completions = [];
  let opened = 0;
  app.cancelDetailViewAutoZoomAnimation = () => {};
  app.isModeTransitionActive = () => false;
  app.startModeTransition = (_, options) => completions.push(options.onComplete);
  app.recordStudyDetailViewOpened = () => opened++;
  app.startDetailViewAutoZoomAnimation = () => {};
  app.openDetailViewForSegment({ day: 0, segment: 2, clockOffsetMs: 7200000 });
  app.openDetailViewForSegment({ day: 0, segment: 2, clockOffsetMs: 3600000 });
  completions[0]();
  assert.equal(app.state.detailViewDay, null);
  assert.equal(opened, 0);
  // Pointer handlers may annotate or copy the selected segment during a transition.
  app.mouseState.selectedSegment = { ...app.mouseState.selectedSegment };
  completions[1]();
  assert.equal(app.state.detailViewDay, 0);
  assert.equal(opened, 1);
});

test('text editor cancel and save stay final when removing the input also triggers blur', () => {
  for (const field of ['title', 'description']) for (const cancel of [false, true]) {
    const { app, event } = fixture();
    let input;
    context.document = {
      body: {
        classList: { contains: () => false },
        appendChild(element) { input = element; }
      },
      getElementById: () => ({ maxLength: 100 }),
      createElement: () => {
        const listeners = new Map();
        return { style: {}, focus() {}, select() {},
          addEventListener: (name, listener) => listeners.set(name, listener),
          remove() { listeners.get('blur')?.(); },
          dispatch(name, event) { listeners.get(name)?.(event); }
        };
      }
    };
    app.editingState = {};
    app.updateActiveTitleEditorLayout = app.updateActiveDescriptionEditorLayout = () => {};
    app.getDetailViewLayout = () => ({});
    app.updateActiveDetailTextEditorViewportSyncState = () => {};
    app.createDetailTextEditor(event, field);
    input.value = 'Changed text';
    input.dispatch('keydown', { key: cancel ? 'Escape' : 'Enter', ctrlKey: true,
      preventDefault() {}, stopPropagation() {} });
    input.dispatch('blur'); // A late blur must also be harmless.
    assert.equal(event[field], cancel ? (field === 'title' ? 'Original' : '') : 'Changed text');
    assert.equal(app.saves, cancel ? 0 : 1);
    assert.equal(app._finishDetailTextEditor, null);
    assert.equal(app.editingState[field === 'title' ? 'isEditingTitle' : 'isEditingDescription'], false);
    assert.equal(app[field === 'title' ? 'hideTitleWhileEditing' : 'hideDescriptionWhileEditing'], false);
  }
});
