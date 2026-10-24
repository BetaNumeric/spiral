import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture() {
  const values = new Map(), acknowledgements = [], calls = [];
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const window = { sessionStorage: storage, fetch: async () => { throw new Error('offline'); } };
  const context = vm.createContext({ window, SpiralCalendar: class {}, document: { hidden: false },
    AbortController, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams });
  vm.runInContext(fs.readFileSync(new URL('../js/study-connection.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../js/study-remote.js', import.meta.url), 'utf8'), context);
  const app = {
    _studyInitialized: true, studyStorage: { writer: true }, dirty: false, failSave: false,
    session: { sessionId: null, participantId: '', sessionPhase: 'explore', isRecording: false, isPaused: false, interactions: [] },
    ensureStudySessionState() { return this.session; }, currentStudyTask() { return this.task; },
    getStudyElapsedMs: () => 5000, getStudyPausedMs: () => 0, getNextStudyParticipantId: () => 'P01',
    hasUnsavedStudyChanges() { return this.dirty; }, syncStudySessionUI() {},
    recordStudyAction(type, payload) { if (this.session.isRecording) { this.session.interactions.push({ type, payload, index: this.session.interactions.length, offsetMs: 5000 }); this.dirty = true; } },
    async flushStudySession() { calls.push('flush'); if (this.failSave) return false; this.dirty = false; return true; },
    async startSimpleStudySession(id, options) {
      calls.push(['start', options]); Object.assign(this.session, { sessionId: 's1', participantId: id, isRecording: true }); return true;
    },
    async changeStudyMode(phase, options) {
      calls.push(['phase', phase, options]); this.session.sessionPhase = phase;
      if (phase === 'task') this.task = { taskId: 'T01', attemptId: `attempt-${calls.length}`, label: 'Task 1', startOffsetMs: 1000 };
      return true;
    },
    pauseStudySession() { this.session.isPaused = true; return true; },
    async resumeStudySession() { this.session.isPaused = false; return true; },
    async finishSimpleStudySession() { this.session.isRecording = false; calls.push('finish'); return true; },
    addStudyNote(text) { calls.push(['note', text]); return true; },
    recordStudyAssistance(text) { calls.push(['help', text]); return true; }
  };
  const create = () => {
    const remote = new window.SpiralStudyRemote(app, { storage, now: () => 10000, onChange() {} });
    remote.pairing ||= { roomId: 'room', deviceId: 'phone', deviceToken: 'secret' };
    remote.request = async (path, body) => { acknowledgements.push({ path, body }); return {}; };
    return remote;
  };
  const remote = create();
  const command = (action, payload = {}, extra = {}) => ({ id: `command-${acknowledgements.length}-${calls.length}`,
    action, payload, expected: remote.expectedState(), expiresAt: 20000, ...extra });
  return { app, remote, create, command, context, acknowledgements, calls, storage };
}

test('remote controls preserve the phone UI and acknowledge only after saving', async () => {
  const { remote, command, calls, acknowledgements } = fixture();
  await remote.processCommand(command('start', { participantId: 'P03' }));
  assert.equal(calls[0][0], 'start');
  assert.equal(calls[0][1].returnToCalendar, false);
  assert.ok(calls.includes('flush'));
  assert.equal(acknowledgements.at(-1).body.status, 'applied');
  await remote.processCommand(command('phase', { phase: 'task' }));
  assert.equal(calls.find(call => Array.isArray(call) && call[0] === 'phase')[2].returnToCalendar, false);
});

test('redelivered commands and reload receipts never execute Next task twice', async () => {
  const { app, remote, command, create, calls } = fixture();
  Object.assign(app.session, { sessionId: 's1', isRecording: true, sessionPhase: 'task' });
  app.task = { taskId: 'T01', attemptId: 'a1', startOffsetMs: 1000 };
  const next = command('next_task');
  await remote.processCommand(next);
  await remote.processCommand(next);
  const restored = create();
  await restored.processCommand(next);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'phase').length, 1);
});

test('a reload during command execution reports uncertainty without replay', async () => {
  const { remote, create, command, calls, acknowledgements } = fixture();
  const start = command('start');
  remote.ledger = [{ id: start.id, status: 'processing', acknowledged: false }]; remote.persist();
  await create().processCommand(start);
  assert.equal(calls.length, 0);
  assert.equal(acknowledgements.at(-1).body.status, 'uncertain');
});

test('stale, expired, background and recovered-phone commands cannot mutate the recording', async () => {
  for (const kind of ['stale', 'expired', 'background', 'recovery']) {
    const { app, remote, command, calls, context, acknowledgements } = fixture();
    const start = command('start');
    if (kind === 'stale') start.expected.sessionId = 'another-participant';
    if (kind === 'expired') start.expiresAt = 9999;
    if (kind === 'background') context.document.hidden = true;
    if (kind === 'recovery') app._studyRecoveredSnapshot = {};
    await remote.processCommand(start);
    assert.equal(calls.length, 0, kind);
    assert.equal(acknowledgements.at(-1).body.status, 'rejected', kind);
  }
});

test('failed phone saves never produce an applied acknowledgement', async () => {
  const { app, remote, command, acknowledgements } = fixture();
  app.failSave = true;
  await remote.processCommand(command('start', { participantId: 'P01' }));
  assert.equal(app.session.isRecording, true, 'The recording stays in memory for recovery.');
  assert.equal(acknowledgements.at(-1).body.status, 'failed');
  assert.equal(app._studyRemoteBusy, false);
});

test('status and activity omit event titles, searches, descriptions and note text', () => {
  const { app, remote } = fixture();
  app.session.interactions = [
    { type: 'events_changed', index: 0, offsetMs: 1, payload: { created: [{ title: 'PRIVATE TITLE', description: 'PRIVATE DESCRIPTION' }] } },
    { type: 'search_committed', index: 1, offsetMs: 2, payload: { query: 'PRIVATE QUERY' } },
    { type: 'facilitator_note', index: 2, offsetMs: 3, payload: { text: 'PRIVATE NOTE' } }
  ];
  const state = JSON.stringify(remote.state());
  assert.doesNotMatch(state, /PRIVATE/);
  assert.match(state, /1 added/);
});

test('a pruned acknowledgement cannot block later commands', async () => {
  const { remote, command, calls } = fixture();
  remote.ledger = [{ id: 'old-command', status: 'applied', acknowledged: false }];
  remote.request = async path => {
    if (path.includes('old-command')) throw Object.assign(new Error('gone'), { status: 404 });
    return {};
  };
  await remote.acknowledge(remote.ledger[0]);
  assert.equal(remote.ledger[0].acknowledged, true);
  await remote.processCommand(command('start', { participantId: 'P01' }));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'start'));
});

test('unavailable receipt storage stops a command before any study mutation', async () => {
  const { remote, command, calls } = fixture();
  remote.storage = { setItem() { throw new Error('quota'); } };
  await assert.rejects(remote.processCommand(command('start')), /quota/);
  assert.equal(calls.length, 0);
});

test('disconnecting during an acknowledgement prevents a fetched command from executing afterwards', async () => {
  const { remote, command, calls } = fixture();
  remote.ledger = [{ id: 'old-command', status: 'applied', acknowledged: false }];
  const next = command('start');
  let release;
  let entered;
  const acknowledgementStarted = new Promise(resolve => { entered = resolve; });
  remote.request = async path => {
    if (path.endsWith('/state')) return { commands: [next], serverTime: 10000 };
    if (path.includes('old-command')) await new Promise(resolve => { release = resolve; entered(); });
    return {};
  };
  const pending = remote.publish();
  await acknowledgementStarted;
  assert.equal(typeof release, 'function');
  remote.disconnect(); release();
  await pending;
  assert.equal(calls.length, 0);
});

test('phone requests use the paired service even if another service address is entered', async () => {
  const { remote } = fixture();
  remote.pairing.relayOrigin = 'https://paired.example';
  remote.relayOrigin = 'https://other.example';
  remote.request = Object.getPrototypeOf(remote).request;
  let destination;
  remote.fetch = async (url, options) => {
    destination = url;
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return { ok: true, json: async () => ({}) };
  };
  await remote.request('/rooms/room/devices/phone/state', { state: {} }, 'secret');
  assert.equal(destination, 'https://paired.example/study-api/rooms/room/devices/phone/state');
  await assert.rejects(remote.connect('ABCDEFGH', 'https://other.example'), /Disconnect/);
});
