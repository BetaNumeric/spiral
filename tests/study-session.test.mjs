import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));

// Recorder tests use an isolated archive adapter. IndexedDB journal/transaction and
// real cross-tab lease behavior have their own tests in study-storage.test.mjs.
class FakeStorage {
  constructor(backend = { sessions: new Map(), active: null, owner: null }) {
    this.backend = backend;
    this.writer = false;
    this.saved = [];
    this.failSave = false;
  }
  async initialize() { return true; }
  async acquireWriter() {
    if (this.backend.owner && this.backend.owner !== this) return false;
    this.backend.owner = this;
    return this.writer = true;
  }
  async releaseWriter() { if (this.backend.owner === this) this.backend.owner = null; this.writer = false; }
  async save(session) {
    if (!this.writer || this.failSave) return false;
    const snapshot = copy(session);
    this.backend.sessions.set(snapshot.sessionId, snapshot);
    this.backend.active = snapshot.isRecording ? snapshot.sessionId : null;
    this.saved.push(snapshot);
    return true;
  }
  async listSessions() { return copy([...this.backend.sessions.values()]); }
  async getFixture() { return copy(this.backend.fixture || null); }
  async saveFixture(value) {
    if (!this.writer || this.failSave) return false;
    this.backend.fixture = copy(value);
    return true;
  }
  async getActiveSession() { return copy(this.backend.sessions.get(this.backend.active) || null); }
}

function fixture(storage = new FakeStorage(), initialClock = {}) {
  const clock = { wall: Date.parse('2026-10-23T10:00:00Z'), mono: 100, ...initialClock };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.wall])); }
    static now() { return clock.wall; }
  }
  let nextTimer = 0;
  const timers = new Map();
  const browserStorage = new Map();
  const localStorage = { getItem: key => browserStorage.get(key) ?? null,
    setItem: (key, value) => browserStorage.set(key, String(value)), removeItem: key => browserStorage.delete(key) };
  const context = vm.createContext({ console, Date: FakeDate, Intl, Map, Set,
    performance: { now: () => clock.mono }, crypto: webcrypto,
    APP_VERSION: 'test-build', STUDY_MODE: true, SpiralCalendar: class {},
    window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2 },
    navigator: { userAgent: 'Study test browser', platform: 'Test', language: 'en' },
    document: { getElementById: () => null, body: { classList: { toggle() {} } }, documentElement: { classList: { toggle() {} } } },
    localStorage, isMobileDevice: () => true,
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  for (const file of ['time-model', 'event-projection', 'study-session']) {
    vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
  }
  const app = new context.SpiralCalendar();
  Object.assign(app, {
    studyStorage: storage, state: { days: 7, radiusExponent: 1, rotation: 0, spiralScale: 1,
      circleMode: false, detailViewDay: null, visibleCalendars: ['Home'], darkMode: false,
      locationTimezoneId: 'Europe/Berlin', animateEventColors: true },
    events: [{ persistentUID: 'event-A', title: 'Controlled fixture event', description: 'Controlled description',
      calendar: 'Home', start: new FakeDate('2026-10-25T00:00:00Z'), end: new FakeDate('2026-10-25T01:00:00Z'),
      color: '#aaffcc', colorSeed: 42, colorIsCustom: false }],
    mouseState: {}, referenceTime: new FakeDate('2026-10-25T00:00:00Z'),
    getCalendarTimeZone: () => 'Europe/Berlin',
    getEventInstant: (event, endpoint) => new FakeDate(event[endpoint]),
    visibleWindowStart() { return this.referenceTime; },
    visibleWindowEnd() { return new FakeDate(this.referenceTime.getTime() + 7 * 86400000); },
    getSegmentId: (day, segment) => day * 24 + segment,
    getSegmentDate: id => new FakeDate(Date.parse('2026-10-25T00:00:00Z') + id * 3600000),
    getDetailViewEventState() { return { detailEvent: this.selectedEvent }; },
    serializeEventTime: event => copy(event),
    normalizeRuntimeEvent: event => ({ ...event, start: new FakeDate(event.start), end: new FakeDate(event.end) }),
    saveSettingsToStorage() { localStorage.setItem('spiralCalendarSettings', JSON.stringify(this.state)); return true; },
    async saveEventsToStorage() { return true; },
    syncStudySessionUI() {}
  });
  const advance = duration => { clock.mono += duration; clock.wall += duration; };
  return { app, storage, clock, advance, context, timers, localStorage };
}

test('session start captures immutable fixture/settings and stopping archives each participant separately', async () => {
  const { app, storage, advance } = fixture();
  assert.equal(await app.startStudySession(' P01 ', 'explore', { studyId: 'pilot', fixtureId: 'fixture-v1' }), true);
  const firstId = app.studySession.sessionId;
  const initial = copy(app.studySession.initialEvents);
  app.events[0].title = 'Participant changed title';
  app.state.visibleCalendars.push('Work');
  advance(1000);
  assert.equal(await app.stopStudySession(), true);
  assert.deepEqual(copy(app.studySession.initialEvents), initial);
  assert.deepEqual(copy(app.studySession.initialSettings.visibleCalendars), ['Home']);
  assert.equal(app.studySession.finalEvents['event-A'].title, 'Participant changed title');
  assert.equal(app.studySession.participantId, 'P01');
  assert.equal(storage.writer, false);
  assert.equal(await app.startStudySession('P02'), true);
  assert.notEqual(app.studySession.sessionId, firstId);
  advance(500);
  await app.stopStudySession();
  const archived = await storage.listSessions();
  assert.equal(archived.length, 2);
  assert.equal(archived.find(session => session.sessionId === firstId).interactions.at(-1).type, 'session_stopped');
});

test('automatic palette color changes are ignored but meaningful edits and custom color choices are recorded', async () => {
  const { app } = fixture();
  await app.startStudySession('P01');
  app.events[0].color = '#ffeebb';
  app.events[0].lastModified = 777;
  app.recordStudyEventSnapshotDiff();
  assert.equal(app.studySession.interactions.filter(row => row.type === 'events_changed').length, 0);
  app.events[0].title = 'Edited';
  app.events[0].colorIsCustom = true;
  app.events[0].color = '#112233';
  app.runWithStudyEventSource('detail_text_editor', () => app.recordStudyEventSnapshotDiff());
  const change = app.studySession.interactions.find(row => row.type === 'events_changed');
  assert.equal(change.payload.updated.length, 1);
  assert.equal(change.payload.updated[0].changedFields.title.to, 'Edited');
  assert.equal(change.payload.updated[0].changedFields.color.to, '#112233');
  assert.equal(change.source, 'detail_text_editor');
  assert.equal(app.studySession.initialEvents['event-A'].color, null);
  assert.equal('description' in app.studySession.initialEvents['event-A'], false);
});

test('navigation summarizes one gesture and event selection deduplicates by event and repeated-hour occurrence', async () => {
  const { app, advance } = fixture();
  await app.startStudySession('P01');
  app.beginStudyNavigation('wheel', 'wheel');
  for (let index = 0; index < 10; index++) {
    app.state.rotation += 0.1;
    app.beginStudyNavigation('wheel', 'wheel');
    advance(10);
  }
  app.endStudyNavigation('wheel');
  app.endStudyNavigation('wheel');
  app.beginStudyNavigation('canvas_drag', 'mouse');
  app.endStudyNavigation('canvas_drag');
  const movements = app.studySession.interactions.filter(row => row.type === 'navigation_completed');
  assert.equal(movements.length, 1);
  assert.equal(movements[0].payload.before.rotation, 0);
  assert.ok(Math.abs(movements[0].payload.after.rotation - 1) < 1e-9);
  assert.equal(movements[0].payload.durationMs, 100);
  app.selectedEvent = app.events[0];
  app.mouseState.selectedSegment = { day: 0, segment: 2, clockOffsetMs: 7200000 };
  app.recordStudySelection('canvas_event', 'pen');
  app.recordStudySelection('canvas_event', 'pen');
  app.mouseState.selectedSegment.clockOffsetMs = 3600000;
  app.recordStudySelection('canvas_event', 'pen');
  const selections = app.studySession.interactions.filter(row => row.type === 'event_selected');
  assert.equal(selections.length, 2);
  assert.notEqual(selections[0].payload.segment.start, selections[1].payload.segment.start);
  assert.deepEqual(copy(selections.map(row => row.payload.segment.occurrence)), [0, 1]);
  assert.equal(selections[1].inputMethod, 'pen');
});

test('pending settings and event changes stay in the phase/task where they happened', async () => {
  const { app, advance } = fixture();
  await app.startStudySession('P01');
  app.state.darkMode = true;
  app.state.rotation = 2;
  app.events[0].title = 'Before task';
  advance(100);
  app.startStudyTask({ taskId: 'read-event', taskVersion: '2' });
  const settings = app.studySession.interactions.find(row => row.type === 'settings_changed');
  const change = app.studySession.interactions.find(row => row.type === 'events_changed');
  assert.equal(settings.phase, 'explore');
  assert.equal(settings.taskId, null);
  assert.equal('rotation' in settings.payload.changes, false);
  assert.equal(settings.payload.changes.darkMode.to, true);
  assert.equal(change.phase, 'explore');
  app.state.animateEventColors = false;
  app.endStudyTask('success', { answer: 'Read the title correctly' });
  const taskSettings = app.studySession.interactions.filter(row => row.type === 'settings_changed').at(-1);
  assert.equal(taskSettings.taskId, 'read-event');
  app.state.darkMode = false;
  await app.stopStudySession();
  assert.equal(app.studySession.interactions.filter(row => row.type === 'settings_changed').at(-1).payload.changes.darkMode.to, false);
});

test('tasks track outcomes, assistance, retries and active durations without dropping quiet thinking time', async () => {
  const { app, advance, clock } = fixture();
  await app.startStudySession('P01');
  const first = app.startStudyTask({ taskId: 'find-event', label: 'Find the event' });
  assert.equal(app.startStudyTask({ taskId: 'other' }), false);
  advance(2000);
  app.recordStudyAssistance('Facilitator explained zoom');
  app.pauseStudySession();
  const count = app.studySession.interactions.length;
  advance(5000);
  assert.equal(app.recordStudyAction('participant_action'), false);
  assert.equal(app.studySession.interactions.length, count);
  await app.resumeStudySession();
  advance(3000);
  clock.wall -= 3600000;
  const ended = app.endStudyTask('partial', { answer: 'Found the date', notes: 'Needed help' });
  assert.equal(ended.taskDurationMs, 5000);
  assert.equal(ended.helpCount, 1);
  assert.equal(ended.assisted, true);
  assert.equal(ended.outcome, 'partial');
  assert.equal(app.studySession.interactions.find(row => row.type === 'task_completed').attemptId, first.attemptId);
  const second = app.startStudyTask({ taskId: 'find-event' });
  assert.equal(second.attemptNumber, 2);
  assert.notEqual(first.attemptId, second.attemptId);
  advance(1000);
  await app.stopStudySession();
  assert.equal(second.outcome, 'abandoned');
  assert.equal(app.studySession.elapsedMs, 11000);
  assert.equal(app.studySession.activeDurationMs, 6000);
});

test('blocked second tab cannot replace or append to an active recording', async () => {
  const backend = { sessions: new Map(), active: null, owner: null };
  const first = fixture(new FakeStorage(backend));
  const second = fixture(new FakeStorage(backend));
  await first.app.startStudySession('P01');
  first.app.recordStudyAction('first_action');
  await first.app.flushStudySession();
  const original = copy(await first.storage.getActiveSession());
  assert.equal(await second.app.startStudySession('P02'), false);
  assert.equal(second.app.recordStudyAction('blocked_action'), false);
  assert.deepEqual(await first.storage.getActiveSession(), original);
  assert.equal(second.storage.saved.length, 0);
});

test('recovery is explicit and offline gaps count as interruptions rather than task time', async () => {
  const storage = new FakeStorage();
  const first = fixture(storage);
  await first.app.startStudySession('P01');
  first.app.startStudyTask({ taskId: 'read-event' });
  first.advance(2000);
  await first.app.flushStudySession();
  await storage.releaseWriter();
  const recoveredStorage = new FakeStorage(storage.backend);
  const recovered = fixture(recoveredStorage, { wall: first.clock.wall + 60000, mono: 500 });
  assert.equal(await recovered.app.restoreStudySessionDraft(), true);
  assert.equal(recovered.app.studySession.isPaused, true);
  assert.equal(recovered.app.studySession.recovered, true);
  assert.equal(await recovered.app.startStudySession('P02'), false);
  assert.equal(await recovered.app.resumeStudySession(), true);
  assert.equal(recovered.app.studySession.sessionId, first.app.studySession.sessionId);
  const marker = recovered.app.studySession.interactions.find(row => row.type === 'session_recovered');
  assert.equal(marker.payload.gapMs, 60000);
  recovered.advance(3000);
  const task = recovered.app.endStudyTask('success');
  assert.equal(task.taskDurationMs, 5000);
  await recovered.app.stopStudySession();
  assert.equal(recovered.app.studySession.activeDurationMs, 5000);
  assert.equal(recovered.app.studySession.sessionDurationMs, 65000);
  assert.equal((await storage.listSessions()).length, 1);
});

test('save failures keep the in-memory recording dirty and exportable', async () => {
  const { app, storage, advance } = fixture();
  await app.startStudySession('P01');
  storage.failSave = true;
  advance(1000);
  app.recordStudyAction('important_action');
  assert.equal(await app.flushStudySession(), false);
  assert.equal(app.hasUnsavedStudyChanges(), true);
  const exported = app.buildStudyExportData();
  assert.equal(exported.interactions.at(-1).type, 'important_action');
  assert.equal(exported.sessionDurationMs, 1000);
  storage.failSave = false;
  assert.equal(await app.flushStudySession(), true);
  assert.equal(app.hasUnsavedStudyChanges(), false);
});

test('fixture save/reset restores known calendar and view while preserving archived recordings', async () => {
  const { app, storage, context } = fixture();
  await app.startStudySession('P01');
  await app.stopStudySession();
  const archived = await storage.listSessions();
  assert.equal(await app.saveStudyFixture(' fixture-v1 '), true);
  const initialTitle = app.events[0].title;
  app.events[0].title = 'Changed';
  app.events.push({ ...app.events[0], persistentUID: 'new-event' });
  app.state.days = 30;
  app.state.darkMode = true;
  app.referenceTime = new context.Date('2026-12-25T00:00:00Z');
  assert.equal(await app.resetStudyFixture(), true);
  assert.equal(app.events.length, 1);
  assert.equal(app.events[0].title, initialTitle);
  assert.equal(app.state.days, 7);
  assert.equal(app.state.darkMode, false);
  assert.equal(app.referenceTime.toISOString(), '2026-10-25T00:00:00.000Z');
  assert.equal((await storage.getFixture()).fixtureId, 'fixture-v1');
  assert.deepEqual(await storage.listSessions(), archived);
  assert.equal(storage.writer, false);
});

test('failed fixture saves preserve the prior setup and busy/recording/dirty operations are rejected', async () => {
  const { app, storage } = fixture();
  await app.saveStudyFixture('first');
  storage.failSave = true;
  assert.equal(await app.saveStudyFixture('replacement'), false);
  assert.equal((await storage.getFixture()).fixtureId, 'first');
  assert.equal(storage.writer, false);
  storage.failSave = false;
  for (const flag of ['_studyBusy', '_studyDirty']) {
    app[flag] = true;
    assert.equal(await app.saveStudyFixture('blocked'), false, flag);
    assert.equal(await app.resetStudyFixture(), false, flag);
    app[flag] = false;
  }
  await app.startStudySession('P01');
  assert.equal(await app.saveStudyFixture('blocked'), false);
  assert.equal(await app.resetStudyFixture(), false);
});

test('fixture reset failures restore live state and persisted settings before returning', async () => {
  for (const failingStore of ['settings', 'events']) {
    const { app, localStorage } = fixture();
    await app.saveStudyFixture('fixture-v1');
    app.events[0].title = 'Participant current event';
    app.state.days = 21;
    const previousEvents = app.events;
    const previousState = copy(app.state);
    const previousSettings = '{"preserve":"this exact stored value"}';
    localStorage.setItem('spiralCalendarSettings', previousSettings);
    let eventWrites = 0;
    if (failingStore === 'settings') app.saveSettingsToStorage = () => false;
    app.saveEventsToStorage = async () => { eventWrites++; return failingStore !== 'events'; };
    assert.equal(await app.resetStudyFixture(), false, failingStore);
    assert.equal(app.events, previousEvents);
    assert.deepEqual(copy(app.state), previousState);
    assert.equal(localStorage.getItem('spiralCalendarSettings'), previousSettings);
    if (failingStore === 'settings') assert.equal(eventWrites, 0, 'Do not replace stored events when settings cannot be saved.');
  }
});

test('recovered tab refreshes under its writer lock before resuming so later actions survive', async () => {
  const first = fixture();
  await first.app.startStudySession('P01');
  const second = fixture(new FakeStorage(first.storage.backend), { wall: first.clock.wall, mono: 100 });
  await second.app.restoreStudySessionDraft();
  first.advance(5000);
  first.app.recordStudyAction('later_action_from_first_tab');
  await first.app.flushStudySession();
  await first.storage.releaseWriter();
  second.clock.wall = first.clock.wall + 10000;
  assert.equal(await second.app.resumeStudySession(), true);
  assert.equal(second.app.studySession.interactions.filter(row => row.type === 'later_action_from_first_tab').length, 1);
  assert.equal(second.app.studySession.interactions.find(row => row.type === 'session_recovered').payload.gapMs, 10000);
  assert.equal(second.app.studySession.sessionId, first.app.studySession.sessionId);
});

test('stale recovered tab cannot resurrect a session finalized in the original tab', async () => {
  const first = fixture();
  await first.app.startStudySession('P01');
  const second = fixture(new FakeStorage(first.storage.backend));
  await second.app.restoreStudySessionDraft();
  first.advance(5000);
  await first.app.stopStudySession();
  const archived = await first.storage.listSessions();
  assert.equal(await second.app.resumeStudySession(), false);
  assert.equal(second.app.studySession.isRecording, false);
  assert.deepEqual(await first.storage.listSessions(), archived);
  assert.equal(second.storage.writer, false);
});

test('legacy schema 5 recovery derives missing elapsed offsets without adding offline gaps to active duration', async () => {
  const { app, storage, clock } = fixture();
  const start = clock.wall - 70000;
  const legacy = { schemaVersion: 5, sessionId: 'legacy-session', participantId: 'P01', isRecording: true,
    startTime: new Date(start).toISOString(), snapshotTime: new Date(start + 10000).toISOString(),
    interactions: [{ index: 0, type: 'session_started', timestamp: new Date(start).toISOString() },
      { index: 1, type: 'panel_opened', timestamp: new Date(start + 10000).toISOString() }], tasks: [], pauses: [] };
  storage.backend.sessions.set(legacy.sessionId, legacy);
  storage.backend.active = legacy.sessionId;
  await app.restoreStudySessionDraft();
  assert.equal(await app.resumeStudySession(), true);
  assert.equal(app.getStudyElapsedMs(), 70000);
  assert.equal(app.getStudyPausedMs(), 60000);
  await app.stopStudySession();
  assert.equal(app.studySession.activeDurationMs, 10000);
  assert.equal(app.studySession.schemaVersion, 6);
});

test('a non-writer tab cannot consume a future selection record through deduplication state', async () => {
  const { app, storage } = fixture();
  await app.startStudySession('P01');
  app.mouseState.selectedSegment = { day: 0, segment: 2, clockOffsetMs: 7200000 };
  app.selectedEvent = app.events[0];
  storage.writer = false;
  app.recordStudySelection('canvas_event', 'mouse');
  storage.writer = true;
  app.recordStudySelection('canvas_event', 'mouse');
  const selections = app.studySession.interactions.filter(row => row.type === 'event_selected');
  assert.equal(selections.length, 1);
  assert.equal(selections[0].payload.eventId, 'event-A');
});

test('starting with a selected event records the actual initial view and all-day date semantics', async () => {
  const { app } = fixture();
  app.selectedEvent = app.events[0];
  app.state.detailViewDay = 0;
  app.mouseState.selectedSegment = { day: 0, segment: 2, clockOffsetMs: 3600000 };
  Object.assign(app.events[0], { allDay: true, startDate: '2026-10-25', endDate: '2026-10-26' });
  await app.startStudySession('P01', 'explore', { contentPolicy: { includeDescriptionText: true } });
  assert.equal(app.studySession.initialUiState.selectedEventId, 'event-A');
  assert.equal(app.studySession.initialUiState.selectedSegment.occurrence, 1);
  const event = app.studySession.initialEvents['event-A'];
  assert.equal(event.allDay, true);
  assert.equal(event.startDate, '2026-10-25');
  assert.equal(event.endDate, '2026-10-26');
  assert.equal(event.description, 'Controlled description');
  app.selectedEvent = null;
  assert.equal(app.captureStudyViewContext().selectedEventId, null, 'An empty selection must not retain the prior runtime ID.');
});

test('a stale recovery action cannot resume or stop a different participant started later', async () => {
  for (const action of ['resumeStudySession', 'stopStudySession']) {
    const first = fixture();
    await first.app.startStudySession('P01');
    const stale = fixture(new FakeStorage(first.storage.backend));
    await stale.app.restoreStudySessionDraft();
    await first.app.stopStudySession();
    await first.app.startStudySession('P02');
    const secondParticipantId = first.app.studySession.sessionId;
    await first.storage.releaseWriter();
    const before = await first.storage.listSessions();
    assert.equal(await stale.app[action](), false, action);
    assert.deepEqual(await first.storage.listSessions(), before);
    assert.equal(stale.storage.writer, false);
    assert.equal(stale.app.studySession.sessionId, secondParticipantId);
    assert.equal(stale.app.studySession.isPaused, true);
    assert.match(stale.app._studyMessage, /participant|recording.*changed/i);
  }
});

test('losing recorder ownership pauses active time immediately and preserves the unsaved in-memory log', async () => {
  for (const status of ['blocked', 'error']) {
    const { app, context, advance } = fixture();
    let onStatus;
    context.SpiralStudyStorage = class extends FakeStorage {
      constructor(options) { super(); onStatus = options.onStatus; }
    };
    app.studyStorage = null;
    await app.startStudySession('P01');
    advance(1000);
    await app.flushStudySession();
    app.recordStudyAction('unsaved_action');
    app.studyStorage.writer = false;
    onStatus({ status, message: 'Recorder ownership was lost.' });
    assert.equal(app.studySession.isPaused, true);
    assert.equal(app.hasUnsavedStudyChanges(), true);
    advance(4000);
    const exported = app.buildStudyExportData();
    assert.equal(exported.interactions.at(-1).type, 'unsaved_action');
    assert.equal(exported.sessionDurationMs, 5000);
    assert.equal(exported.activeDurationMs, 1000);
    assert.equal(app.recordStudyAction('should_not_be_recorded'), false);
  }
});

test('retrying a failed finalization archives the session and releases the recorder for another tab', async () => {
  const { app, storage, advance } = fixture();
  await app.startStudySession('P01');
  advance(1000);
  storage.failSave = true;
  assert.equal(await app.stopStudySession(), false);
  assert.equal(app.studySession.isRecording, false);
  assert.equal(app.hasUnsavedStudyChanges(), true);
  storage.failSave = false;
  assert.equal(await app.retryStudySave(), true);
  assert.equal(app.hasUnsavedStudyChanges(), false);
  assert.equal(storage.writer, false);
  assert.equal(app._studyArchive.length, 1);
  assert.equal(app._studyArchive[0].isRecording, false);
  const second = fixture(new FakeStorage(storage.backend));
  assert.equal(await second.app.startStudySession('P02'), true);
});

test('downloading an active session flushes meaningful observations and includes its current event snapshot', async () => {
  const { app, advance } = fixture();
  await app.startStudySession('P01');
  app.beginStudyNavigation('canvas_drag', 'mouse');
  app.state.rotation = 2;
  app.state.darkMode = true;
  app.events[0].title = 'Pending live event change';
  advance(500);
  let downloaded;
  app.downloadStudyJson = data => { downloaded = data; };
  app.downloadStudyData();
  assert.equal(downloaded.isRecording, true);
  assert.equal(downloaded.finalEvents['event-A'].title, 'Pending live event change');
  assert.equal(downloaded.finalSettings.darkMode, true);
  assert.equal(downloaded.initialEvents['event-A'].title, 'Controlled fixture event');
  for (const type of ['events_changed', 'settings_changed', 'navigation_completed']) {
    assert.equal(downloaded.interactions.filter(row => row.type === type).length, 1);
  }
  assert.equal(downloaded.sessionDurationMs, 500);
});

test('archive export from a stale recovered tab preserves the latest authoritative finalized session', async () => {
  const first = fixture();
  await first.app.startStudySession('P01');
  const stale = fixture(new FakeStorage(first.storage.backend));
  await stale.app.restoreStudySessionDraft();
  first.advance(1000);
  first.app.recordStudyAction('new_action_after_stale_tab_loaded');
  await first.app.stopStudySession();
  let downloaded;
  stale.app.downloadStudyJson = data => { downloaded = data; };
  await stale.app.downloadStudyArchive();
  const session = downloaded.sessions.find(row => row.sessionId === first.app.studySession.sessionId);
  assert.equal(session.isRecording, false);
  assert.equal(session.interactions.at(-1).type, 'session_stopped');
  assert.equal(session.interactions.filter(row => row.type === 'new_action_after_stale_tab_loaded').length, 1);
});

test('concurrent flushes serialize revisions and drain actions arriving during the pending write', async () => {
  const { app, storage, advance } = fixture();
  await app.startStudySession('P01');
  const originalSave = storage.save.bind(storage);
  const writes = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  storage.save = async session => {
    const snapshot = copy(session);
    writes.push(snapshot);
    if (writes.length === 1) await pending;
    return originalSave(snapshot);
  };
  app.recordStudyAction('before_pending_write');
  const first = app.flushStudySession();
  const second = app.flushStudySession();
  assert.equal(writes.length, 1, 'Concurrent callers share the first pending save.');
  advance(100);
  app.recordStudyAction('during_pending_write');
  const third = app.flushStudySession();
  release();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.equal(writes.length, 2, 'New actions produce one additional revision, not duplicate writes.');
  assert.ok(writes[1].revision > writes[0].revision);
  assert.equal(writes[0].interactions.at(-1).type, 'before_pending_write');
  assert.equal(writes[1].interactions.at(-1).type, 'during_pending_write');
  assert.equal((await storage.getActiveSession()).interactions.at(-1).type, 'during_pending_write');
  assert.equal(app.hasUnsavedStudyChanges(), false);
});

test('a clean no-op flush cannot swallow an action recorded immediately afterwards', async () => {
  const { app, storage } = fixture();
  await app.startStudySession('P01');
  const clean = app.flushStudySession();
  app.recordStudyAction('after_noop_flush');
  const dirty = app.flushStudySession();
  await Promise.all([clean, dirty]);
  assert.equal(app.hasUnsavedStudyChanges(), false);
  assert.equal((await storage.getActiveSession()).interactions.at(-1).type, 'after_noop_flush');
});

test('archive exports keep dirty conflicting snapshots separately without replacing canonical saved sessions', async () => {
  const { app, storage } = fixture();
  await app.startStudySession('P01');
  const canonical = await storage.getActiveSession();
  app.recordStudyAction('unsaved_recovery_action');
  await storage.releaseWriter();
  let downloaded;
  app.downloadStudyJson = data => { downloaded = data; };
  await app.downloadStudyArchive();
  assert.deepEqual(downloaded.sessions[0], canonical);
  assert.equal(downloaded.recoverySnapshots.length, 1);
  assert.equal(downloaded.recoverySnapshots[0].interactions.at(-1).type, 'unsaved_recovery_action');
  assert.equal(app.hasUnsavedStudyChanges(), true, 'A download is a backup, not an acknowledged successful save.');
});

test('text edits finished at task boundaries retain their actual task and phase attribution', async () => {
  const { app } = fixture();
  let pending = null;
  app.finishActiveDetailTextEditor = () => {
    if (!pending) return;
    app.events[0].title = pending;
    pending = null;
    app.recordStudyEventSnapshotDiff();
  };
  await app.startStudySession('P01');
  pending = 'Exploration edit before task';
  const task = app.startStudyTask({ taskId: 'edit-title' });
  pending = 'Task edit before completion';
  app.endStudyTask('success');
  const edits = app.studySession.interactions.filter(row => row.type === 'events_changed');
  assert.equal(edits.length, 2);
  assert.equal(edits[0].phase, 'explore');
  assert.equal(edits[0].attemptId, null);
  assert.equal(edits[1].phase, 'task');
  assert.equal(edits[1].attemptId, task.attemptId);
  assert.ok(app.studySession.interactions.indexOf(edits[1]) < app.studySession.interactions.findIndex(row => row.type === 'task_completed'));
});


test('simple study flow numbers participants and tasks, records debrief use, and never infers success', async () => {
  const { app, advance, storage } = fixture();
  let returns = 0;
  app.returnToStudyCalendar = () => { returns++; };
  assert.equal(await app.startSimpleStudySession(''), true);
  assert.equal(app.studySession.participantId, 'P01');
  assert.equal(app.studySession.sessionPhase, 'explore');
  advance(1000);
  app.recordStudyAction('free_exploration');
  assert.equal(await app.changeStudyMode('task'), true);
  assert.equal(app.currentStudyTask().taskId, 'T01');
  assert.equal(await app.changeStudyMode('task'), true);
  assert.equal(app.studySession.tasks.length, 1, 'Tapping the current mode must not create a second task.');
  advance(2000);
  app.events[0].title = 'First task edit';
  assert.equal(await app.changeStudyMode('task', { nextTask: true }), true);
  assert.equal(app.studySession.tasks[0].outcome, 'unrated');
  assert.equal(app.studySession.tasks[0].taskDurationMs, 2000);
  assert.equal(app.currentStudyTask().taskId, 'T02');
  const edit = app.studySession.interactions.find(row => row.type === 'events_changed');
  assert.equal(edit.taskId, 'T01');
  app.currentStudyTask().facilitatorOutcome = 'partial';
  app.recordStudyAssistance();
  advance(3000);
  assert.equal(await app.changeStudyMode('debrief'), true);
  assert.equal(app.studySession.tasks[1].outcome, 'partial');
  assert.equal(app.studySession.tasks[1].helpCount, 1);
  assert.equal(app.currentStudyTask(), null);
  app.recordStudyAction('debrief_exploration');
  const debrief = app.studySession.interactions.at(-1);
  assert.equal(debrief.phase, 'debrief');
  assert.equal(debrief.taskId, null);
  assert.equal(await app.finishSimpleStudySession(), true);
  assert.equal((await storage.listSessions()).length, 1);
  assert.equal(app.getNextStudyParticipantId(), 'P02');
  assert.equal(returns, 5);
  await app.startSimpleStudySession('');
  assert.equal(app.studySession.participantId, 'P02');
  await app.changeStudyMode('task');
  assert.equal(app.currentStudyTask().taskId, 'T01', 'Task numbering restarts for each participant.');
});

test('simple task transitions reject pauses and simultaneous double taps without changing task boundaries', async () => {
  const { app, storage } = fixture();
  app.returnToStudyCalendar = () => {};
  await app.startSimpleStudySession('P01');
  await app.changeStudyMode('task');
  app.pauseStudySession();
  assert.equal(await app.changeStudyMode('task', { nextTask: true }), false);
  assert.equal(app.currentStudyTask().taskId, 'T01');
  await app.resumeStudySession();
  const save = storage.save.bind(storage);
  let release;
  storage.save = async session => {
    await new Promise(resolve => { release = resolve; });
    return save(session);
  };
  const first = app.changeStudyMode('task', { nextTask: true });
  assert.equal(await app.changeStudyMode('task', { nextTask: true }), false);
  assert.equal(app.currentStudyTask().taskId, 'T02');
  release();
  assert.equal(await first, true);
  assert.equal(app.studySession.tasks.length, 2);
});

test('Finish study closes an active or manually paused task without requiring an outcome form', async () => {
  for (const paused of [false, true]) {
    const { app, advance } = fixture();
    app.returnToStudyCalendar = () => {};
    await app.startSimpleStudySession('P01');
    await app.changeStudyMode('task');
    advance(1000);
    if (paused) { app.pauseStudySession(); advance(5000); }
    assert.equal(await app.finishSimpleStudySession(), true);
    assert.equal(app.studySession.tasks[0].outcome, 'unrated');
    assert.equal(app.studySession.tasks[0].taskDurationMs, 1000);
    assert.equal(app.studySession.isRecording, false);
  }
});


test('participant suggestions advance with the archive without replacing an explicitly edited code', () => {
  const { app, context } = fixture();
  const input = { value: '', disabled: false };
  context.document.getElementById = id => id === 'participantId' ? input : null;
  app.syncStudySessionUI = context.SpiralCalendar.prototype.syncStudySessionUI;
  app._studyInitialized = true;
  app._studyArchive = [{ participantId: 'P01' }, { participantId: 'P02' }];
  app.syncStudySessionUI();
  assert.equal(input.value, 'P03');
  input.value = 'Custom-code';
  app.syncStudySessionUI();
  assert.equal(input.value, 'Custom-code');
  input.value = 'P03';
  app._studyArchive.push({ participantId: 'P03' });
  app.studySession = app.createEmptyStudySession();
  app.syncStudySessionUI();
  assert.equal(input.value, 'P04', 'A stale automatic suggestion must advance when another tab archives that participant.');
});
