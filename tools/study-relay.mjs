#!/usr/bin/env node
// Optional study-only relay. Calendar recordings stay on the participant device.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PHASES = ['explore', 'task', 'debrief'];
const OUTCOMES = ['unrated', 'success', 'partial', 'failure', 'skipped'];
const ACTIONS = ['start', 'phase', 'next_task', 'pause', 'resume', 'finish', 'note', 'help', 'outcome'];
const TERMINAL = ['applied', 'rejected', 'failed', 'uncertain'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

class RequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (code = 'invalid_request', message = 'Invalid request.') => new RequestError(400, code, message);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const token = () => randomBytes(32).toString('base64url');
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const text = (value, max = 100, nullable = false) => {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw bad();
  return value;
};
const bool = value => { if (typeof value !== 'boolean') throw bad(); return value; };
const amount = value => { if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw bad(); return value; };

function sanitizeState(input) {
  if (!record(input)) throw bad('invalid_state', 'Invalid device state.');
  try {
    const state = { sessionId: text(input.sessionId, 150, true),
      attemptId: text(input.attemptId ?? input.taskAttemptId, 150, true),
      phase: text(input.phase, 20), isRecording: bool(input.isRecording), isPaused: bool(input.isPaused),
      busy: bool(input.busy ?? false), visible: bool(input.visible ?? true) };
    if (!PHASES.includes(state.phase)) throw bad();
    for (const key of ['participantId', 'suggestedParticipantId', 'taskId', 'taskLabel', 'storageStatus']) {
      if (input[key] != null) state[key] = text(input[key], key === 'taskLabel' ? 120 : 100);
    }
    if (input.taskOutcome != null) {
      if (!OUTCOMES.includes(input.taskOutcome)) throw bad();
      state.taskOutcome = input.taskOutcome;
    }
    if (input.error != null) state.error = input.error ? 'The phone reported a recording or storage problem.' : '';
    for (const key of ['elapsedMs', 'taskElapsedMs', 'protocolVersion', 'revision']) {
      if (input[key] != null) state[key] = amount(input[key]);
    }
    for (const key of ['saved', 'ownsRecorder', 'canControl']) if (input[key] != null) state[key] = bool(input[key]);
    if (input.activity != null) {
      if (!Array.isArray(input.activity) || input.activity.length > 30) throw bad();
      state.activity = input.activity.map(item => {
        if (!record(item)) throw bad();
        const result = {};
        for (const key of ['id', 'type', 'label', 'actor', 'timestamp']) {
          if (item[key] != null) result[key] = text(String(item[key]), key === 'label' ? 160 : 100);
        }
        if (item.offsetMs != null) result.offsetMs = amount(item.offsetMs);
        return result;
      });
    }
    return state;
  } catch { throw bad('invalid_state', 'Invalid device state.'); }
}

function sanitizeExpected(input) {
  if (!record(input)) throw bad('invalid_expected', 'The current phone state is required.');
  const expected = { sessionId: text(input.sessionId, 150, true), attemptId: text(input.attemptId, 150, true),
    phase: text(input.phase, 20), isRecording: bool(input.isRecording), isPaused: bool(input.isPaused) };
  if (!PHASES.includes(expected.phase)) throw bad();
  return expected;
}

function sanitizePayload(action, input = {}) {
  if (!record(input)) throw bad();
  const payload = {};
  if (action === 'start') {
    if (input.participantId != null) payload.participantId = text(input.participantId, 80).trim();
  } else if (action === 'phase') {
    payload.phase = text(input.phase, 20);
    if (!PHASES.includes(payload.phase)) throw bad('invalid_phase', 'Invalid study phase.');
  } else if (action === 'note' || action === 'help') {
    payload.text = text(input.text ?? '', 2000).trim();
    if (action === 'note' && !payload.text) throw bad('empty_note', 'Enter a note.');
  } else if (action === 'outcome') {
    payload.outcome = text(input.outcome, 20);
    if (!OUTCOMES.includes(payload.outcome)) throw bad('invalid_outcome', 'Invalid task outcome.');
  }
  return payload;
}

function matchesExpected(state, expected) {
  return Object.keys(expected).every(key => (state[key] ?? null) === expected[key]);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw new RequestError(415, 'json_required', 'Send application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new RequestError(413, 'body_too_large', 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!record(value)) throw bad();
    return value;
  } catch { throw bad('invalid_json', 'Invalid JSON request.'); }
}

function canServe(relative) {
  if (['index.html', 'facilitator.html', 'facilitator.css', 'service-worker.js', 'manifest.json',
    'install.html', 'install.css', 'a2hs.js', 'study-analysis.html', 'tools/study-analysis-core.mjs',
    'docs/study.md', 'docs/study-remote.md', 'docs/study-remote-server.md'].includes(relative)) return true;
  if (/^js\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/.test(relative)) return true;
  return /^(?:icons|images|sounds)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|gif|svg|wav|mp3)$/.test(relative);
}

/** Create an import-safe relay/static HTTP(S) server. No listener or account is created here. */
export function createStudyRelayServer(options = {}) {
  const root = fs.realpathSync(options.rootDir || DEFAULT_ROOT);
  const now = options.now || Date.now;
  const roomTtlMs = options.roomTtlMs || 8 * 60 * 60 * 1000;
  const pairingTtlMs = options.pairingTtlMs || 10 * 60 * 1000;
  const commandTtlMs = options.commandTtlMs || 15000;
  const onlineMs = options.onlineMs || 8000;
  const rooms = new Map(), pairingCodes = new Map(), limits = new Map();
  const publicOrigin = options.publicOrigin ? new URL(options.publicOrigin).origin : null;
  if (publicOrigin && new URL(publicOrigin).protocol !== 'https:') throw new Error('publicOrigin must use HTTPS.');

  const limit = (key, count, interval) => {
    const current = now();
    let entry = limits.get(key);
    if (!entry || entry.until <= current) {
      if (!entry && limits.size >= 10000) throw new RequestError(429, 'rate_limited', 'Too many requests. Wait and try again.');
      entry = { count: 0, until: current + interval }; limits.set(key, entry);
    }
    if (++entry.count > count) throw new RequestError(429, 'rate_limited', 'Too many requests. Wait and try again.');
  };
  const complete = (command, status, message = '') => {
    command.status = status; command.message = message; command.completedAt = now();
    if ('text' in command.payload) command.payload = { hasText: !!command.payload.text };
  };
  const sweep = () => {
    const current = now();
    for (const [id, room] of rooms) {
      if (room.expiresAt <= current) { rooms.delete(id); pairingCodes.delete(room.pairingCode); continue; }
      if (room.pairingExpiresAt <= current) pairingCodes.delete(room.pairingCode);
      for (const device of room.devices.values()) {
        const command = device.pendingId && device.commands.get(device.pendingId);
        if (command && command.status === 'pending' && command.expiresAt <= current) {
          complete(command, 'expired', 'The phone did not confirm this command before it expired.');
          device.pendingId = null;
        }
      }
    }
    for (const [key, entry] of limits) if (entry.until <= current) limits.delete(key);
  };
  const newCode = room => {
    pairingCodes.delete(room.pairingCode);
    let code;
    do { code = Array.from(randomBytes(8), value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join(''); }
    while (pairingCodes.has(code));
    room.pairingCode = code; room.pairingExpiresAt = Math.min(room.expiresAt, now() + pairingTtlMs);
    pairingCodes.set(code, room.roomId);
  };
  const authorization = request => /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization || '')?.[1] || '';
  const requireController = (request, room) => {
    if (!sameToken(authorization(request), room.controllerToken)) throw new RequestError(401, 'unauthorized', 'Study connection is unavailable. Pair again.');
  };
  const requireDevice = (request, device) => {
    if (!sameToken(authorization(request), device.deviceToken)) throw new RequestError(401, 'unauthorized', 'Study connection is unavailable. Pair again.');
  };
  const pending = device => {
    const command = device.pendingId && device.commands.get(device.pendingId);
    return command?.status === 'pending' ? [publicCommand(command)] : [];
  };
  const publicCommand = command => {
    if (!command) return null;
    const { fingerprint, ...safe } = command;
    return safe;
  };
  const publicDevice = device => ({ deviceId: device.deviceId, label: device.label, lastSeen: device.lastSeen,
    online: device.lastSeen != null && now() - device.lastSeen < onlineMs,
    state: device.state, pendingCommand: pending(device)[0] || null,
    lastCommand: publicCommand([...device.commands.values()].at(-1)) });
  const allocateParticipant = room => {
    let highest = room.participantCounter;
    for (const device of room.devices.values()) {
      for (const value of [device.state?.participantId, device.state?.suggestedParticipantId]) {
        const match = /^P(\d+)$/i.exec(value || '');
        if (match && Number.isSafeInteger(Number(match[1]))) highest = Math.max(highest, Number(match[1]) - (value === device.state?.suggestedParticipantId ? 1 : 0));
      }
    }
    room.participantCounter = highest + 1;
    return `P${String(room.participantCounter).padStart(2, '0')}`;
  };

  async function api(request, pathname) {
    const method = request.method;
    const peer = request.socket.remoteAddress || 'unknown';
    limit(`api:${peer}`, 10000, 60000);
    if (['POST', 'DELETE'].includes(method)) {
      const origin = request.headers.origin;
      const expected = publicOrigin || `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
      if ((origin && origin !== expected) || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new RequestError(403, 'origin_rejected', 'Use the study page on this server.');
      }
    }
    if (pathname === '/study-api/rooms' && method === 'POST') {
      await readJson(request);
      limit(`create:${peer}`, 20, 60 * 60 * 1000);
      if (rooms.size >= 16) throw new RequestError(503, 'room_limit', 'The study relay is full. Try again later.');
      const room = { roomId: randomUUID(), controllerToken: token(), createdAt: now(), expiresAt: now() + roomTtlMs,
        participantCounter: 0, deviceCounter: 0, devices: new Map(), pairingCode: null, pairingExpiresAt: null };
      newCode(room); rooms.set(room.roomId, room);
      return { status: 201, value: { roomId: room.roomId, controllerToken: room.controllerToken,
        pairingCode: room.pairingCode, pairingExpiresAt: room.pairingExpiresAt, expiresAt: room.expiresAt } };
    }
    if (pathname === '/study-api/pair' && method === 'POST') {
      limit(`pair:${peer}`, 120, 60000);
      const input = await readJson(request);
      const code = text(input.code, 20).replace(/[\s-]/g, '').toUpperCase();
      const room = rooms.get(pairingCodes.get(code));
      if (!room || room.pairingExpiresAt <= now()) throw new RequestError(404, 'pairing_expired', 'Pairing code is invalid or expired.');
      if (room.devices.size >= 32) throw new RequestError(409, 'device_limit', 'This study already has 32 phones.');
      const label = `Phone ${++room.deviceCounter}`;
      const device = { deviceId: randomUUID(), deviceToken: token(), label: input.label == null ? label : text(input.label, 80).trim() || label,
        state: null, lastSeen: null, commands: new Map(), pendingId: null };
      room.devices.set(device.deviceId, device);
      return { status: 201, value: { roomId: room.roomId, deviceId: device.deviceId, deviceToken: device.deviceToken, expiresAt: room.expiresAt } };
    }
    const match = /^\/study-api\/rooms\/([A-Za-z0-9-]+)(?:\/(.*))?$/.exec(pathname);
    if (!match) throw new RequestError(404, 'not_found', 'Study endpoint not found.');
    const room = rooms.get(match[1]);
    if (!room) throw new RequestError(401, 'room_expired', 'Study connection expired or the relay restarted. Pair again.');
    const rest = match[2] || '';
    if (!rest) {
      requireController(request, room);
      if (method === 'DELETE') { rooms.delete(room.roomId); pairingCodes.delete(room.pairingCode); return { value: { disconnected: true } }; }
      if (method !== 'GET') throw new RequestError(405, 'method_not_allowed', 'Method not allowed.');
      return { value: { roomId: room.roomId, pairingCode: room.pairingCode,
        pairingExpiresAt: room.pairingExpiresAt, expiresAt: room.expiresAt,
        serverTime: now(), devices: [...room.devices.values()].map(publicDevice) } };
    }
    if (rest === 'pairing' && method === 'POST') {
      requireController(request, room); await readJson(request); newCode(room);
      return { value: { pairingCode: room.pairingCode, pairingExpiresAt: room.pairingExpiresAt, expiresAt: room.expiresAt } };
    }
    const target = /^devices\/([A-Za-z0-9-]+)(?:\/(.*))?$/.exec(rest);
    const device = target && room.devices.get(target[1]);
    if (!device) throw new RequestError(401, 'device_unavailable', 'Study connection is unavailable. Pair again.');
    const operation = target[2] || '';
    if (!operation && method === 'DELETE') {
      if (!sameToken(authorization(request), room.controllerToken)) requireDevice(request, device);
      room.devices.delete(device.deviceId);
      return { value: { disconnected: true } };
    }
    if (operation === 'state' && method === 'POST') {
      requireDevice(request, device);
      const input = await readJson(request);
      device.state = sanitizeState(input.state); device.lastSeen = now();
      return { value: { serverTime: now(), commands: pending(device) } };
    }
    if (operation === 'commands' && method === 'GET') {
      requireDevice(request, device);
      return { value: { serverTime: now(), commands: pending(device) } };
    }
    if (operation === 'commands' && method === 'POST') {
      requireController(request, room);
      const input = await readJson(request);
      const id = text(input.id, 100);
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(id) || !ACTIONS.includes(input.action)) throw bad('invalid_command', 'Invalid study command.');
      const action = input.action, payload = sanitizePayload(action, input.payload), expected = sanitizeExpected(input.expected);
      const fingerprint = createHash('sha256').update(JSON.stringify({ id, action, payload, expected })).digest('hex');
      const previous = device.commands.get(id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new RequestError(409, 'command_conflict', 'This command ID was already used.');
        return { value: { command: publicCommand(previous) } };
      }
      if (!device.state || device.lastSeen == null || now() - device.lastSeen >= onlineMs || !device.state.visible) {
        throw new RequestError(409, 'phone_offline', 'The phone is disconnected or in the background.');
      }
      if (device.state.busy || device.state.canControl === false) throw new RequestError(409, 'phone_busy', 'The phone is busy. Wait for its updated status.');
      if (device.state.isRecording && device.state.ownsRecorder === false) throw new RequestError(409, 'recorder_unavailable', 'The phone does not own its recorder. Recover it on the phone first.');
      if (!matchesExpected(device.state, expected)) throw new RequestError(409, 'stale_state', 'The phone state changed. Review its current status.');
      if (pending(device).length) throw new RequestError(409, 'command_pending', 'Wait for the phone to confirm the previous command.');
      if (device.commands.size >= 2048) throw new RequestError(409, 'command_limit', 'This phone reached the study command limit. Export and start a new connection.');
      let totalCommands = 0;
      for (const item of rooms.values()) for (const phone of item.devices.values()) totalCommands += phone.commands.size;
      if (totalCommands >= 20000) throw new RequestError(503, 'command_limit', 'The study relay is full.');
      if ((action === 'start') === device.state.isRecording) throw new RequestError(409, 'invalid_transition', action === 'start' ? 'A participant is already recording.' : 'Start a participant first.');
      if (['phase', 'next_task'].includes(action) && device.state.isPaused) throw new RequestError(409, 'recording_paused', 'Resume the recording first.');
      if (action === 'resume' && !device.state.isPaused || action === 'pause' && device.state.isPaused) throw new RequestError(409, 'invalid_transition', 'The pause state changed.');
      if (['help', 'outcome'].includes(action) && !device.state.attemptId) throw new RequestError(409, 'no_task', 'Start a task first.');
      if (action === 'start') {
        if (!payload.participantId) payload.participantId = allocateParticipant(room);
        else {
          const numeric = /^P(\d+)$/i.exec(payload.participantId);
          if (numeric && Number.isSafeInteger(Number(numeric[1]))) room.participantCounter = Math.max(room.participantCounter, Number(numeric[1]));
        }
      }
      const command = { id, action, payload, expected, createdAt: now(), expiresAt: now() + commandTtlMs,
        status: 'pending', fingerprint };
      device.commands.set(id, command); device.pendingId = id;
      return { status: 201, value: { command: publicCommand(command) } };
    }
    const acknowledgement = /^commands\/([A-Za-z0-9_-]+)\/ack$/.exec(operation);
    if (acknowledgement && method === 'POST') {
      requireDevice(request, device);
      const input = await readJson(request), command = device.commands.get(acknowledgement[1]);
      if (!command) throw new RequestError(404, 'command_unavailable', 'Command is no longer available.');
      if (!TERMINAL.includes(input.status)) throw bad('invalid_ack', 'Invalid command acknowledgement.');
      if (command.status !== 'pending' && command.status !== 'expired') return { value: { command: publicCommand(command), serverTime: now() } };
      if (input.state != null) device.state = sanitizeState(input.state);
      const wasExpired = command.status === 'expired';
      complete(command, input.status, text(input.message ?? '', 300));
      command.appliedAt = input.appliedAt == null ? null : text(input.appliedAt, 50);
      if (wasExpired) command.late = true;
      if (device.pendingId === command.id) device.pendingId = null;
      device.lastSeen = now();
      return { value: { command: publicCommand(command), serverTime: now() } };
    }
    throw new RequestError(405, 'method_not_allowed', 'Method not allowed.');
  }

  const handler = async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      sweep();
      const url = new URL(request.url, 'http://study.invalid');
      if (url.pathname.startsWith('/study-api/')) {
        const result = await api(request, url.pathname);
        response.writeHead(result.status || 200, { 'Content-Type': MIME['.json'] });
        response.end(JSON.stringify(result.value)); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new RequestError(405, 'method_not_allowed', 'Method not allowed.');
      const pathname = decodeURIComponent(url.pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      if (!canServe(relative)) throw new RequestError(404, 'not_found', 'Page not found.');
      const filename = await fs.promises.realpath(path.join(root, relative));
      if (!filename.startsWith(root + path.sep)) throw new RequestError(404, 'not_found', 'Page not found.');
      const stat = await fs.promises.stat(filename);
      if (!stat.isFile()) throw new RequestError(404, 'not_found', 'Page not found.');
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream', 'Content-Length': stat.size });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(filename).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const known = error instanceof RequestError;
      const status = known ? error.status : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      response.writeHead(status, { 'Content-Type': MIME['.json'] });
      response.end(JSON.stringify({ error: known ? error.message : status === 404 ? 'Page not found.' : 'Study relay request failed.', code: known ? error.code : status === 404 ? 'not_found' : 'server_error' }));
    }
  };
  const server = options.tls ? https.createServer(options.tls, handler) : http.createServer(handler);
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  const timer = setInterval(sweep, 1000); timer.unref();
  server.once('close', () => { clearInterval(timer); rooms.clear(); pairingCodes.clear(); limits.clear(); });
  return server;
}

function parseCli(argv) {
  const options = { host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8080),
    cert: process.env.TLS_CERT, key: process.env.TLS_KEY, publicOrigin: process.env.PUBLIC_ORIGIN };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--help' || option === '-h') { options.help = true; continue; }
    const name = { '--host': 'host', '--port': 'port', '--cert': 'cert', '--key': 'key', '--public-origin': 'publicOrigin' }[option];
    if (!name || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${option}`);
    options[name] = name === 'port' ? Number(argv[++index]) : argv[++index];
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('Invalid port.');
  if (!!options.cert !== !!options.key) throw new Error('Provide both --cert and --key.');
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node tools/study-relay.mjs [--host 127.0.0.1] [--port 8080] [--cert cert.pem --key key.pem] [--public-origin https://study.example.org]');
    } else {
      const tls = options.cert ? { cert: fs.readFileSync(options.cert), key: fs.readFileSync(options.key) } : null;
      const server = createStudyRelayServer({ tls, publicOrigin: options.publicOrigin });
      server.on('error', error => { console.error(`Study relay could not start: ${error.message}`); process.exitCode = 1; });
      server.listen(options.port, options.host, () => {
        const address = server.address();
        const local = `${tls ? 'https' : 'http'}://${options.host.includes(':') ? `[${options.host}]` : options.host}:${address.port}`;
        console.log(`Study relay ready: ${options.publicOrigin || local}/facilitator.html`);
        console.log('For phones, use an HTTPS address with a certificate trusted by each device. Recordings remain on the phones.');
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
