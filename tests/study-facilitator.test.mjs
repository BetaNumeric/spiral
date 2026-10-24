import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/study-facilitator.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const phone = (id = 'phone-a') => ({ deviceId: id, label: id, online: true, pendingCommand: null,
  state: { sessionId: 'session-' + id, attemptId: 'task-' + id, phase: 'task',
    isRecording: true, isPaused: false, visible: true, busy: false, saved: true } });

function fixture() {
  const clock = { now: 100000 };
  const elements = new Map(), stored = new Map(), timers = new Map();
  let nextTimer = 0, nextId = 0;
  const context = vm.createContext({ AbortController, URL, Date, Map, Set, console });
  const window = { document: { getElementById: id => elements.get(id) || null },
    location: { href: 'https://study.example/base/facilitator.html?unrelated=1#old' },
    fetch: async () => { throw new Error('Unused fetch'); },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, crypto: { randomUUID: () => 'command-' + (++nextId) },
    sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value),
      removeItem: key => stored.delete(key) } };
  context.window = window;
  vm.runInContext(fs.readFileSync(new URL('../js/study-connection.js', import.meta.url), 'utf8'), context);
  vm.runInContext(source, context);
  const app = new window.SpiralStudyFacilitator({ now: () => clock.now });
  app.connection = { roomId: 'room-1', controllerToken: 'private-controller-token-1234' };
  app.room = { roomId: 'room-1', devices: [phone(), phone('phone-b')] };
  app.selectedDeviceId = 'phone-a'; app.connected = true;
  return { app, window, clock, elements, stored, timers };
}

test('commands remain pending until the selected phone acknowledges and duplicate clicks do not repeat them', async () => {
  const { app } = fixture(), calls = [];
  app.request = async (path, options) => {
    calls.push({ path, ...copy(options) });
    return { command: { id: options.body.id, expiresAt: 115000, status: 'pending' } };
  };
  app.refresh = async () => true;
  await app.sendCommand('next_task');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.expected, { sessionId: 'session-phone-a', attemptId: 'task-phone-a',
    phase: 'task', isRecording: true, isPaused: false });
  assert.equal(app.pending.get('phone-a').status, 'pending');
  assert.equal(await app.sendCommand('next_task'), false);
  assert.equal(calls.length, 1);
  app.selectedDeviceId = 'phone-b';
  await app.sendCommand('pause');
  assert.equal(calls.length, 2, 'Another phone has its own pending command.');
  app.room.devices[0].lastCommand = { id: 'command-1', status: 'applied' };
  app.reconcileCommands();
  assert.equal(app.pending.has('phone-a'), false);
  assert.equal(app.pending.has('phone-b'), true);
  assert.match(app.messages.get('phone-a').text, /confirmed by phone/);
});

test('unconfirmed delivery never automatically repeats a command and expires without claiming success', async () => {
  const { app, clock } = fixture();
  let sends = 0;
  app.request = async () => { sends++; throw new Error('Network disconnected after request'); };
  app.refresh = async () => true;
  assert.equal(await app.sendCommand('finish'), false);
  assert.equal(app.pending.get('phone-a').status, 'unknown');
  assert.equal(app.canControl(app.room.devices[0]), false);
  app.reconcileCommands(); app.reconcileCommands();
  assert.equal(sends, 1);
  clock.now += 17000;
  app.reconcileCommands();
  assert.equal(app.pending.has('phone-a'), false);
  assert.match(app.messages.get('phone-a').text, /No phone confirmation/);
  assert.equal(app.messages.get('phone-a').error, true);
});

test('poll failures disable controls and reconnection consumes an acknowledgement without replay', async () => {
  const { app } = fixture();
  app.pending.set('phone-a', { id: 'old-command', action: 'pause', payload: {}, expiresAt: 115000 });
  app.request = async () => { throw new Error('Offline'); };
  assert.equal(await app.refresh(), false);
  assert.equal(app.connected, false);
  assert.equal(app.canControl(app.room.devices[1]), false);
  let polls = 0;
  app.request = async () => {
    polls++;
    return { devices: [{ ...phone(), lastCommand: { id: 'old-command', status: 'applied' } }, phone('phone-b')] };
  };
  assert.equal(await app.refresh(), true);
  assert.equal(polls, 1);
  assert.equal(app.pending.has('phone-a'), false);
  assert.equal(app.canControl(app.room.devices[1]), true);
});

test('notes remain isolated per phone and an acknowledgement never clears a newer draft', async () => {
  const { app } = fixture();
  app.noteDrafts.set('phone-a', '  observed difficulty  ');
  app.noteDrafts.set('phone-b', 'Other participant');
  app.request = async (path, { body }) => ({ command: { id: body.id, status: 'pending' } });
  app.refresh = async () => true;
  await app.sendCommand('note', { text: 'observed difficulty' });
  app.room.devices[0].lastCommand = { id: 'command-1', status: 'applied' };
  app.reconcileCommands();
  assert.equal(app.noteDrafts.get('phone-a'), '');
  assert.equal(app.noteDrafts.get('phone-b'), 'Other participant');
  app.noteDrafts.set('phone-a', 'Second note');
  await app.sendCommand('note', { text: 'Second note' });
  app.noteDrafts.set('phone-a', 'New note written while waiting');
  app.room.devices[0].lastCommand = { id: 'command-2', status: 'applied' };
  app.reconcileCommands();
  assert.equal(app.noteDrafts.get('phone-a'), 'New note written while waiting');
});

test('background, offline, busy and server-pending phones cannot receive dashboard commands', () => {
  const { app } = fixture();
  for (const edit of [
    device => { device.online = false; },
    device => { device.state.visible = false; },
    device => { device.state.busy = true; },
    device => { device.state.saved = false; },
    device => { device.pendingCommand = { id: 'another-controller-command' }; }
  ]) {
    const device = phone(); edit(device);
    assert.equal(app.canControl(device), false);
  }
});

test('pairing QR contains only the expiring code and never controller credentials or unrelated URL state', () => {
  const { app, elements, window } = fixture();
  const qr = { hidden: false, innerHTML: '', replaceChildren() {} };
  elements.set('studyPairingQR', qr);
  let url;
  window.SpiralInstallQR = { toSvg(value) { url = value; return '<svg aria-label="Scan to open the Spiral installation guide"></svg>'; } };
  app.room.pairingCode = 'ABCDEFGH'; app.room.pairingExpiresAt = 200000;
  app.renderPairing();
  assert.equal(url, 'https://study.example/base/?study=1&studyConnect=1#studyCode=ABCDEFGH');
  assert.doesNotMatch(url, /controller|private|unrelated|old/);
  assert.match(qr.innerHTML, /connect this phone to the study/);
});

test('requests authenticate in headers and bypass caches without allowing redirects', async () => {
  const { app } = fixture();
  let request;
  app.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ devices: [] }) };
  };
  await app.request('/rooms/room-1', { token: 'private-token' });
  assert.equal(request.url, '/study-api/rooms/room-1');
  assert.equal(request.options.headers.Authorization, 'Bearer private-token');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.credentials, 'omit');
});

test('pairing and pending expiry use relay time when the laptop clock is wrong', async () => {
  const { app, clock, elements, window } = fixture();
  clock.now = 9999990000;
  app.fetch = async () => ({ ok: true, json: async () => ({ serverTime: 100000 }) });
  await app.request('/rooms/room-1');
  assert.equal(app.serverNow(), 100000);
  const qr = { hidden: false, innerHTML: '', replaceChildren() {} };
  elements.set('studyPairingQR', qr);
  window.SpiralInstallQR = { toSvg: () => '<svg></svg>' };
  app.room.pairingCode = 'ABCDEFGH'; app.room.pairingExpiresAt = 200000;
  app.renderPairing();
  assert.equal(qr.hidden, false, 'The wrong laptop clock must not immediately expire a live pairing code.');
  app.pending.set('phone-a', { id: 'waiting', action: 'pause', payload: {}, expiresAt: 115000 });
  app.reconcileCommands();
  assert.equal(app.pending.has('phone-a'), true);
  clock.now += 17000;
  app.reconcileCommands();
  assert.equal(app.pending.has('phone-a'), false);
});

test('separate service requests stay bound to the stored connection and pairing links retain the app URL', async () => {
  const { app, window, elements } = fixture();
  app.relayOrigin = 'https://relay.example';
  app.connection.relayOrigin = app.relayOrigin;
  let request;
  app.fetch = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({}) }; };
  app.relayOrigin = 'https://unrelated.example';
  await app.request('/rooms/room-1', { token: 'private-token' });
  assert.equal(request.url, 'https://relay.example/study-api/rooms/room-1');
  app.relayOrigin = app.connection.relayOrigin;
  const qr = { hidden: false, innerHTML: '', replaceChildren() {} };
  elements.set('studyPairingQR', qr);
  let link;
  window.SpiralInstallQR = { toSvg: value => { link = new URL(value); return '<svg></svg>'; } };
  app.room.pairingCode = 'ABCDEFGH'; app.room.pairingExpiresAt = 200000;
  app.renderPairing();
  assert.equal(link.origin, 'https://study.example');
  assert.equal(link.pathname, '/base/');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('studyRelay'), 'https://relay.example');
  assert.doesNotMatch(link.href, /private-token|controller/);
});
