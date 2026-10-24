import assert from 'node:assert/strict';
import test from 'node:test';
import { createStudyRelayServer } from '../tools/study-relay.mjs';

const idle = () => ({ sessionId: null, attemptId: null, phase: 'explore', isRecording: false,
  isPaused: false, visible: true, busy: false, participantId: '', suggestedParticipantId: 'P01', saved: true });
const expected = state => Object.fromEntries(['sessionId', 'attemptId', 'phase', 'isRecording', 'isPaused'].map(key => [key, state[key]]));

async function fixture(t, options = {}) {
  const clock = { value: Date.parse('2026-10-24T12:00:00Z') };
  const server = createStudyRelayServer({ now: () => clock.value, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, { method = 'GET', body, token, origin, headers = {} } = {}) => {
    const response = await fetch(base + route, { method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}), ...headers
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const created = await request('/study-api/rooms', { method: 'POST', body: {} });
  assert.equal(created.status, 201);
  const room = created.body;
  const roomPath = `/study-api/rooms/${room.roomId}`;
  const pair = async (label = 'Test phone') => {
    const result = await request('/study-api/pair', { method: 'POST', body: { code: room.pairingCode, label } });
    assert.equal(result.status, 201);
    const phone = result.body;
    return { ...phone, path: `${roomPath}/devices/${phone.deviceId}` };
  };
  const state = (phone, value = idle()) => request(`${phone.path}/state`, { method: 'POST', token: phone.deviceToken, body: { state: value } });
  const command = (phone, stateValue, extra = {}) => request(`${phone.path}/commands`, { method: 'POST', token: room.controllerToken,
    body: { id: 'command-00000001', action: 'start', payload: {}, expected: expected(stateValue), ...extra } });
  const snapshot = () => request(roomPath, { token: room.controllerToken });
  return { clock, server, base, request, room, roomPath, pair, state, command, snapshot };
}

test('relay pairs multiple phones and keeps role credentials and commands isolated', async t => {
  const f = await fixture(t), one = await f.pair('One'), two = await f.pair('Two');
  assert.match(f.room.pairingCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.ok(f.room.pairingExpiresAt < f.room.expiresAt);
  assert.notEqual(one.deviceToken, two.deviceToken);
  const state = idle();
  await f.state(one, state); await f.state(two, state);
  assert.equal((await f.request(f.roomPath)).status, 401);
  assert.equal((await f.request(f.roomPath, { token: one.deviceToken })).status, 401);
  assert.equal((await f.request(`${one.path}/state`, { method: 'POST', token: two.deviceToken, body: { state } })).status, 401);
  assert.equal((await f.request(`${one.path}/commands`, { token: f.room.controllerToken })).status, 401);
  assert.equal((await f.command(one, state)).status, 201);
  assert.equal((await f.request(`${one.path}/commands`, { token: one.deviceToken })).body.commands.length, 1);
  assert.equal((await f.request(`${two.path}/commands`, { token: two.deviceToken })).body.commands.length, 0);
  const snapshot = (await f.snapshot()).body;
  assert.deepEqual(snapshot.devices.map(phone => phone.label), ['One', 'Two']);
  assert.ok(snapshot.devices.every(phone => !('deviceToken' in phone)));
  assert.equal(snapshot.devices[1].pendingCommand, null);
});

test('relay confirms commands only after the phone acknowledgement and deduplicates retries', async t => {
  const f = await fixture(t), phone = await f.pair(), initial = idle();
  await f.state(phone, initial);
  const sent = await f.command(phone, initial);
  assert.equal(sent.body.command.status, 'pending');
  assert.equal((await f.command(phone, initial)).status, 200);
  assert.equal((await f.command(phone, initial, { payload: { participantId: 'P99' } })).status, 409);
  assert.equal((await f.command(phone, initial, { id: 'different-command' })).body.code, 'command_pending');
  const running = { ...initial, participantId: 'P01', sessionId: 'session-A', isRecording: true };
  const ack = await f.request(`${phone.path}/commands/command-00000001/ack`, { method: 'POST', token: phone.deviceToken,
    body: { status: 'applied', message: 'Started', appliedAt: new Date(f.clock.value).toISOString(), state: running } });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.command.status, 'applied');
  assert.equal((await f.state(phone, running)).body.commands.length, 0);
  assert.equal((await f.command(phone, initial)).body.command.status, 'applied');
  const repeatedAck = await f.request(`${phone.path}/commands/command-00000001/ack`, { method: 'POST', token: phone.deviceToken,
    body: { status: 'failed', state: initial } });
  assert.equal(repeatedAck.body.command.status, 'applied');
  const snapshot = (await f.snapshot()).body.devices[0];
  assert.equal(snapshot.state.sessionId, 'session-A');
  assert.equal(snapshot.pendingCommand, null);
  assert.equal(snapshot.lastCommand.status, 'applied');
});

test('queued commands expire without replay and late confirmation preserves what the phone actually applied', async t => {
  const f = await fixture(t), phone = await f.pair(), initial = idle();
  await f.state(phone, initial); await f.command(phone, initial);
  f.clock.value += 16000;
  const poll = await f.state(phone, initial);
  assert.equal(poll.body.serverTime, f.clock.value);
  assert.deepEqual(poll.body.commands, []);
  assert.equal((await f.snapshot()).body.devices[0].lastCommand.status, 'expired');
  const running = { ...initial, isRecording: true, sessionId: 'already-applied' };
  const late = await f.request(`${phone.path}/commands/command-00000001/ack`, { method: 'POST', token: phone.deviceToken,
    body: { status: 'applied', state: running, appliedAt: new Date(f.clock.value - 15500).toISOString() } });
  assert.equal(late.body.command.status, 'applied');
  assert.equal(late.body.command.late, true);
  assert.deepEqual((await f.state(phone, running)).body.commands, []);
});

test('relay rejects stale, busy, hidden and offline commands and never moves another participant', async t => {
  const f = await fixture(t), phone = await f.pair(), initial = idle();
  await f.state(phone, initial);
  const invalid = { ...expected(initial), sessionId: 'old-session' };
  assert.equal((await f.command(phone, initial, { expected: invalid })).body.code, 'stale_state');
  await f.state(phone, { ...initial, busy: true });
  assert.equal((await f.command(phone, initial)).body.code, 'phone_busy');
  await f.state(phone, { ...initial, visible: false });
  assert.equal((await f.command(phone, initial)).body.code, 'phone_offline');
  await f.state(phone, initial); f.clock.value += 8000;
  assert.equal((await f.command(phone, initial)).body.code, 'phone_offline');
  await f.state(phone, { ...initial, isRecording: true, sessionId: 'new-participant' });
  assert.equal((await f.command(phone, initial, { action: 'finish' })).body.code, 'stale_state');
});

test('relay assigns distinct participant codes across phones and respects existing numbering', async t => {
  const f = await fixture(t), one = await f.pair(), two = await f.pair();
  const initial = { ...idle(), suggestedParticipantId: 'P05' };
  await f.state(one, initial); await f.state(two, idle());
  const first = await f.command(one, initial), second = await f.command(two, idle());
  assert.equal(first.body.command.payload.participantId, 'P05');
  assert.equal(second.body.command.payload.participantId, 'P06');
  assert.equal((await f.command(one, initial)).body.command.payload.participantId, 'P05');
  const three = await f.pair(), four = await f.pair();
  await f.state(three); await f.state(four);
  assert.equal((await f.command(three, idle(), { payload: { participantId: 'P30' } })).body.command.payload.participantId, 'P30');
  assert.equal((await f.command(four, idle())).body.command.payload.participantId, 'P31');
});

test('relay validates study commands and strips unrelated or sensitive state fields', async t => {
  const f = await fixture(t), phone = await f.pair();
  const running = { ...idle(), sessionId: 'session-A', isRecording: true, phase: 'task', attemptId: 'attempt-A',
    title: 'Private title', description: 'Private description', events: [{ title: 'Private' }],
    error: 'Failed note: private answer', taskOutcome: 'partial', activity: [{ type: 'events_changed', label: 'Event edited', eventTitle: 'Private title' }] };
  assert.equal((await f.state(phone, running)).status, 200);
  const result = (await f.snapshot()).body.devices[0].state;
  assert.equal(result.title, undefined); assert.equal(result.events, undefined);
  assert.equal(result.activity[0].eventTitle, undefined);
  assert.equal(result.taskOutcome, 'partial');
  assert.doesNotMatch(result.error, /private answer/);
  assert.equal((await f.command(phone, running, { action: 'arbitrary_javascript' })).status, 400);
  assert.equal((await f.command(phone, running, { action: 'phase', payload: { phase: 'unknown' } })).status, 400);
  assert.equal((await f.command(phone, running, { action: 'outcome', payload: { outcome: 'unknown' } })).status, 400);
  assert.equal((await f.command(phone, running, { action: 'note', payload: { text: ' ' } })).status, 400);
  assert.equal((await f.state(phone, { ...running, activity: [null] })).status, 400);
  assert.equal((await f.command(phone, running, { action: 'help', payload: { text: 'a'.repeat(2001) } })).status, 400);
});

test('completed and expired note commands remove note content from relay history', async t => {
  const f = await fixture(t), phone = await f.pair();
  const running = { ...idle(), sessionId: 'A', attemptId: 'task-A', phase: 'task', isRecording: true };
  await f.state(phone, running);
  const sent = await f.command(phone, running, { action: 'note', payload: { text: 'Private observation' } });
  assert.equal(sent.body.command.payload.text, 'Private observation');
  await f.request(`${phone.path}/commands/command-00000001/ack`, { method: 'POST', token: phone.deviceToken,
    body: { status: 'applied' } });
  let snapshot = (await f.snapshot()).body;
  assert.equal(JSON.stringify(snapshot).includes('Private observation'), false);
  assert.equal(snapshot.devices[0].lastCommand.payload.hasText, true);
  await f.command(phone, running, { id: 'second-command', action: 'note', payload: { text: 'Another private observation' } });
  f.clock.value += 16000;
  snapshot = (await f.snapshot()).body;
  assert.equal(JSON.stringify(snapshot).includes('Another private observation'), false);
  assert.equal(snapshot.devices[0].lastCommand.status, 'expired');
});

test('pairing refresh, room expiration, and device revocation reject old credentials', async t => {
  const f = await fixture(t), phone = await f.pair();
  const oldCode = f.room.pairingCode;
  const refreshed = await f.request(`${f.roomPath}/pairing`, { method: 'POST', token: f.room.controllerToken, body: {} });
  assert.notEqual(refreshed.body.pairingCode, oldCode);
  assert.equal((await f.request('/study-api/pair', { method: 'POST', body: { code: oldCode } })).status, 404);
  assert.equal((await f.request(phone.path, { method: 'DELETE', token: phone.deviceToken })).status, 200);
  assert.equal((await f.state(phone)).status, 401);
  f.clock.value += 8 * 60 * 60 * 1000;
  assert.equal((await f.snapshot()).status, 401);
});

test('cross-origin mutations are rejected and static serving excludes tools, credentials and traversal paths', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/study-api/rooms', { method: 'POST', body: {}, origin: 'https://unrelated.example' })).status, 403);
  const local = await fetch(f.base + '/', { headers: { Origin: 'https://unrelated.example' } });
  assert.equal(local.status, 200);
  assert.equal(local.headers.get('access-control-allow-origin'), null);
  assert.equal(local.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(f.base + '/tools/study-analysis-core.mjs')).status, 200);
  for (const route of ['/.git/config', '/tools/study-relay.mjs', '/tests/study-relay.test.mjs', '/package.json', '/%2e%2e/.git/config', '/js/../tools/study-relay.mjs']) {
    assert.equal((await fetch(f.base + route)).status, 404, route);
  }
  const malformed = await fetch(f.base + '/study-api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(f.base + '/study-api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(70000) }) });
  assert.equal(oversized.status, 413);
});

test('pairing expires independently of recordings and online state only follows phone updates', async t => {
  const f = await fixture(t), phone = await f.pair();
  await f.state(phone);
  assert.equal((await f.snapshot()).body.devices[0].online, true);
  f.clock.value += 10 * 60 * 1000;
  assert.equal((await f.request('/study-api/pair', { method: 'POST', body: { code: f.room.pairingCode } })).status, 404);
  const snapshot = (await f.snapshot()).body;
  assert.equal(snapshot.devices[0].online, false);
  assert.equal(snapshot.devices.length, 1);
  assert.equal((await f.state(phone)).status, 200);
});

test('an explicitly allowed GitHub Pages origin can preflight and authenticate without wildcard access', async t => {
  const origin = 'https://betanumeric.github.io';
  const f = await fixture(t, { allowedOrigins: [origin] });
  const preflight = await fetch(f.base + f.roomPath, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  const permitted = await f.request(f.roomPath, { origin, token: f.room.controllerToken, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers.get('access-control-allow-origin'), origin);
  assert.equal((await f.request(f.roomPath, { origin })).status, 401, 'CORS permission must not bypass room authentication.');
  const rejected = await f.request(f.roomPath, { origin: 'https://unrelated.github.io', token: f.room.controllerToken });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('CORS preflights reject unrelated headers and configuration cannot allow arbitrary HTTP hosts', async t => {
  const origin = 'https://betanumeric.github.io';
  const f = await fixture(t, { allowedOrigins: [origin] });
  const response = await fetch(f.base + '/study-api/pair', { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Unrelated-Header'
  } });
  assert.equal(response.status, 403);
  for (const value of ['*', 'http://external.example', 'https://betanumeric.github.io/spiral/', 'https://user:secret@example.org']) {
    assert.throws(() => createStudyRelayServer({ allowedOrigins: [value] }), Error, value);
  }
});
