// Remote study integration checks in isolated Chrome contexts and a temporary relay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createStudyRelayServer } from './study-relay.mjs';

const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spiral-study-remote-check-'));
const separate = process.argv.includes('--separate-service');
let staticApp, staticOrigin;
if (separate) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
  staticApp = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      if (!pathname.startsWith('/spiral/')) { response.writeHead(404).end(); return; }
      const file = path.resolve(root, pathname.slice('/spiral/'.length) || 'index.html');
      if (!file.startsWith(path.resolve(root) + path.sep)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      response.end(fs.readFileSync(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => staticApp.listen(0, '127.0.0.1', resolve));
  staticOrigin = `http://127.0.0.1:${staticApp.address().port}`;
}
const relay = createStudyRelayServer({ commandTtlMs: 5000, allowedOrigins: staticOrigin ? [staticOrigin] : [] });
await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
const serviceUrl = `http://127.0.0.1:${relay.address().port}/`;
const appUrl = separate ? staticOrigin + '/spiral/' : serviceUrl;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-background-networking',
  '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let launchError, browser;
chrome.on('error', error => { launchError = error; });
const pages = [];

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), events = [];
  ws.onmessage = message => {
    const result = JSON.parse(message.data);
    if (!result.id) { events.push(result); return; }
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id); clearTimeout(request.timer);
    if (result.error) request.reject(new Error(JSON.stringify(result.error)));
    else request.resolve(result.result);
  };
  ws.onclose = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser closed.')); }
    pending.clear();
  };
  return { events, close: () => ws.close(), call: (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out.`)); }, 30000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  }) };
}

async function evaluate(target, expression) {
  const result = await target.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function run(target, source) { return evaluate(target, `(async()=>{const app=spiralCalendar;${source}})()`); }
async function until(callback, message, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (await callback()) return; await delay(80); }
  throw new Error(message);
}
async function api(route, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(new URL(`study-api/${route}`, serviceUrl), { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(`${response.status}: ${JSON.stringify(result)}`), { status: response.status, result });
  return result;
}

try {
  let address;
  for (let index = 0; index < 100; index++) {
    if (launchError) throw launchError;
    try { address = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!address) throw new Error('Chrome did not start. Set CHROME_PATH.');
  const debugOrigin = 'http://127.0.0.1:' + address[0];
  browser = await connect('ws://127.0.0.1:' + address[0] + address[1].trim());

  async function newPage(relative, { phone = false } = {}) {
    // Separate contexts model real phones: separate event data, recordings, and Web Locks.
    const { browserContextId } = await browser.call('Target.createBrowserContext');
    const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank', browserContextId });
    const targets = await (await fetch(debugOrigin + '/json')).json();
    const target = await connect(targets.find(item => item.id === targetId).webSocketDebuggerUrl);
    target.targetId = targetId; target.browserContextId = browserContextId; pages.push(target);
    await target.call('Runtime.enable'); await target.call('Page.enable');
    await target.call('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' });
    await target.call('Emulation.setDeviceMetricsOverride', { width: phone ? 390 : 1280, height: phone ? 844 : 900,
      deviceScaleFactor: 1, mobile: phone });
    await target.call('Page.addScriptToEvaluateOnNewDocument', { source: `
      const localFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin !== location.origin && url.origin !== ${JSON.stringify(new URL(serviceUrl).origin)}) return Promise.reject(new TypeError('External data disabled in remote study checks.'));
        if (window.__studyTestRelayOffline && url.pathname.startsWith('/study-api/')) return Promise.reject(new TypeError('Simulated relay connection loss.'));
        return localFetch(input, options);
      };
      // Real phones stay foreground while another device's dashboard is used.
      Object.defineProperty(document, 'hidden', { configurable:true, get:()=>!!window.__studyTestHidden });
      Object.defineProperty(document, 'visibilityState', { configurable:true, get:()=>window.__studyTestHidden?'hidden':'visible' });
      if (navigator.serviceWorker) navigator.serviceWorker.register=async()=>({});
      window.alert=()=>{};window.confirm=()=>true;
    ` });
    await target.call('Page.navigate', { url: new URL(relative, appUrl).href });
    if (phone) {
      await until(() => evaluate(target, 'typeof spiralCalendar!=="undefined" && spiralCalendar._studyInitialized && !!spiralCalendar.studyRemote'),
        'Phone controls did not initialize: ' + relative);
      await run(target, `app.stopAutoTimeAlign();app.startupAnimationState.active=false;app.completeModeTransitionImmediately();`);
    } else await until(() => evaluate(target, '!!window.spiralStudyFacilitator'), 'Facilitator page did not initialize.');
    return target;
  }

  const checks = [];
  async function check(name, callback) { await callback(); checks.push(name); console.log('PASS ' + name); }
  const dashboard = await newPage('facilitator.html');
  let controller, phoneA, phoneB, pairingA, pairingB;
  const room = () => api(`rooms/${controller.roomId}`, { token: controller.controllerToken });
  const device = async id => (await room()).devices.find(item => item.deviceId === id);
  const expected = state => ({ sessionId: state.sessionId ?? null, attemptId: state.attemptId ?? null,
    phase: state.phase, isRecording: state.isRecording, isPaused: state.isPaused });
  async function send(id, action, payload = {}, options = {}) {
    const current = await device(id);
    const body = { id: options.id || crypto.randomUUID(), action, payload,
      expected: options.expected || expected(current.state) };
    await api(`rooms/${controller.roomId}/devices/${id}/commands`, { token: controller.controllerToken, body });
    if (options.wait === false) return body;
    await until(async () => {
      const currentDevice = await device(id);
      return currentDevice.lastCommand?.id === body.id && currentDevice.lastCommand.status !== 'pending';
    }, `${action} did not receive a phone acknowledgement.`);
    const command = (await device(id)).lastCommand;
    assert.equal(command.status, options.status || 'applied', `${action}: ${JSON.stringify(command)}`);
    return body;
  }
  async function fresh(target, id) {
    await run(target, `await app.studyRemote.publish();`);
    await until(async () => (await device(id))?.online, 'Phone did not publish online status.');
  }

  await check('facilitator pairs two isolated phones into one dashboard', async () => {
    await evaluate(dashboard, `const originalQR=SpiralInstallQR.toSvg;window.SpiralInstallQR={toSvg:url=>{window.__studyPairURL=url;return originalQR(url);}};
      if(${separate})document.getElementById('studyRelayAddress').value=${JSON.stringify(serviceUrl)};`);
    await evaluate(dashboard, `document.getElementById('createStudyConnectionBtn').click();`);
    await until(() => evaluate(dashboard, `!!sessionStorage.getItem('spiralStudyFacilitatorConnection')`), 'Facilitator room was not created.');
    controller = await evaluate(dashboard, `JSON.parse(sessionStorage.getItem('spiralStudyFacilitatorConnection'))`);
    const code = (await room()).pairingCode;
    phoneA = await newPage('?study=1', { phone: true });
    const pairURL = await evaluate(dashboard, 'window.__studyPairURL');
    assert.ok(pairURL.startsWith(appUrl), 'The QR link must stay on the static app address.');
    phoneB = await newPage(pairURL, { phone: true });
    for (const phone of [phoneA]) {
      await run(phone, `document.getElementById('studyRemoteCode').value=${JSON.stringify(code)};
        if(${separate})document.getElementById('studyRemoteRelay').value=${JSON.stringify(serviceUrl)};
        document.getElementById('studyRemoteConnectBtn').click();`);
      await until(() => run(phone, `return !!app.studyRemote.pairing;`), 'Phone did not pair.');
    }
    if (separate) {
      assert.equal(await run(phoneB, 'return app.studyRemote.pairing;'), null, 'A new external service requires confirmation before pairing.');
      assert.equal(await evaluate(phoneB, 'document.getElementById("studyRemoteRelay").value'), new URL(serviceUrl).origin);
      await evaluate(phoneB, 'document.getElementById("studyRemoteConnectBtn").click()');
    }
    await until(() => run(phoneB, `return !!app.studyRemote.pairing;`), 'Phone QR link did not pair.');
    assert.equal(await evaluate(phoneB, 'location.hash.includes("studyCode")'), false, 'Pairing code must be removed from phone history.');
    pairingA = await run(phoneA, `return app.studyRemote.pairing;`);
    pairingB = await run(phoneB, `return app.studyRemote.pairing;`);
    assert.notEqual(pairingA.deviceId, pairingB.deviceId);
    await fresh(phoneA, pairingA.deviceId); await fresh(phoneB, pairingB.deviceId);
    await until(() => evaluate(dashboard, `document.querySelectorAll('#studyPhoneList [data-device-id]').length===2`), 'Dashboard did not display both phones.');
  });

  await check('both phones start independently with unique participant codes', async () => {
    await send(pairingA.deviceId, 'start'); await send(pairingB.deviceId, 'start');
    const a = await run(phoneA, `return app.studySession.participantId;`);
    const b = await run(phoneB, `return app.studySession.participantId;`);
    assert.notEqual(a, b);
    assert.ok(await run(phoneA, `return app.studySession.isRecording;`));
    assert.ok(await run(phoneB, `return app.studySession.isRecording;`));
  });

  await check('monitoring exposes action summaries while event text stays in the phone recording', async () => {
    await run(phoneA, `app.events=[app.normalizeRuntimeEvent({persistentUID:'remote-browser-event',title:'Private event title marker',
      description:'Private description marker',calendar:'Home',start:'2026-10-25T08:00:00Z',end:'2026-10-25T09:00:00Z',
      timeModel:'instant-v1',color:'#abcdef',colorIsCustom:true})];app.invalidateEventViews();
      if(!await app.saveEventsToStorage()||!await app.flushStudySession())throw new Error('Could not save test event');`);
    await fresh(phoneA, pairingA.deviceId);
    const snapshot = JSON.stringify(await room());
    assert.equal(snapshot.includes('Private event title marker'), false);
    assert.equal(snapshot.includes('Private description marker'), false);
    assert.ok(await run(phoneA, `return app.studySession.interactions.some(row=>row.type==='events_changed'
      && row.payload.created?.some(event=>event.title==='Private event title marker'));`));
  });

  await check('remote phase changes preserve the participant panels and control only one phone', async () => {
    await run(phoneA, `document.getElementById('settingsPanel').style.display='block';`);
    await send(pairingA.deviceId, 'phase', { phase: 'task' });
    assert.equal(await run(phoneA, `return document.getElementById('settingsPanel').style.display;`), 'block');
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), 'T01');
    assert.equal(await run(phoneB, `return app.studySession.sessionPhase;`), 'explore');
    await run(phoneA, `document.getElementById('settingsPanel').style.display='none';document.getElementById('eventInputPanel').style.display='block';`);
    const next = await send(pairingA.deviceId, 'next_task');
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), 'T02');
    assert.equal(await run(phoneA, `return document.getElementById('eventInputPanel').style.display;`), 'block');
    await api(`rooms/${controller.roomId}/devices/${pairingA.deviceId}/commands`, { token: controller.controllerToken, body: next });
    await delay(1600);
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), 'T02', 'Redelivery must not advance twice.');
    const journal = await run(phoneA, `return app.studySession.interactions.filter(row=>
      row.payload?.remoteCommandId===${JSON.stringify(next.id)});`);
    assert.equal(journal.filter(row=>row.type==='task_started').length,1);
    assert.equal(journal.filter(row=>row.type==='remote_command_applied').length,1);
    assert.ok(journal.every(row=>row.actor==='facilitator'&&row.inputMethod==='remote'&&row.source==='study_remote'));
  });

  await check('facilitator buttons target the selected phone and await applied confirmation', async () => {
    await until(() => evaluate(dashboard, `!!document.querySelector('#studyPhoneList [data-device-id="${pairingB.deviceId}"]')`), 'Second phone card is absent.');
    await evaluate(dashboard, `document.querySelector('#studyPhoneList [data-device-id="${pairingB.deviceId}"]').click();document.getElementById('studyRemoteTasksBtn').click();`);
    await until(() => run(phoneB, `return app.currentStudyTask()?.taskId==='T01';`), 'Dashboard Tasks button did not control selected phone.');
    await until(() => evaluate(dashboard, `/applied|confirmed|done/i.test(document.getElementById('studyCommandStatus').textContent)`), 'Dashboard did not show phone confirmation.');
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), 'T02');
  });

  await check('pause, resume, help and notes are saved before acknowledgement', async () => {
    await send(pairingA.deviceId, 'pause');
    assert.equal(await run(phoneA, `return app.studySession.isPaused;`), true);
    await send(pairingA.deviceId, 'help', { text: 'Facilitator help marker' });
    await send(pairingA.deviceId, 'note', { text: 'Facilitator observation' });
    await send(pairingA.deviceId, 'outcome', { outcome: 'partial' });
    const saved = await run(phoneA, `return (await app.getStudyStorage().getActiveSession());`);
    assert.equal(saved.notes.at(-1).text, 'Facilitator observation');
    assert.equal(saved.tasks.at(-1).helpCount, 1);
    await delay(200);
    await send(pairingA.deviceId, 'resume');
    assert.equal(await run(phoneA, `return app.studySession.isPaused;`), false);
    assert.equal(await run(phoneA, `return app.hasUnsavedStudyChanges();`), false);
  });

  await check('connection loss leaves recording local and reconnect does not replay old commands', async () => {
    const before = await run(phoneA, `return {task:app.currentStudyTask().taskId,session:app.studySession.sessionId};`);
    await run(phoneA, `window.__studyTestRelayOffline=true;await app.studyRemote.publish();`);
    await run(phoneA, `app.recordStudyAction('local_during_relay_outage',{marker:'kept'});await app.flushStudySession();`);
    assert.equal(await run(phoneA, `return app.studySession.isRecording;`), true);
    await run(phoneA, `window.__studyTestRelayOffline=false;await app.studyRemote.publish();`);
    await fresh(phoneA, pairingA.deviceId);
    const after = await run(phoneA, `return {task:app.currentStudyTask().taskId,session:app.studySession.sessionId};`);
    assert.deepEqual(after, before);
    assert.ok(await run(phoneA, `return app.studySession.interactions.some(row=>row.type==='local_during_relay_outage');`));
  });

  await check('a command queued against an old local task is rejected rather than applied later', async () => {
    await fresh(phoneA, pairingA.deviceId);
    const old = expected((await device(pairingA.deviceId)).state);
    await run(phoneA, `window.__studyTestRelayOffline=true;await app.changeStudyMode('task',{nextTask:true,returnToCalendar:false});`);
    const queued = await send(pairingA.deviceId, 'next_task', {}, { expected: old, wait: false });
    const localTask = await run(phoneA, `return app.currentStudyTask().taskId;`);
    await run(phoneA, `window.__studyTestRelayOffline=false;await app.studyRemote.publish();`);
    await until(async () => (await device(pairingA.deviceId)).lastCommand?.id === queued.id
      && (await device(pairingA.deviceId)).lastCommand.status !== 'pending', 'Stale command did not finish.');
    assert.equal((await device(pairingA.deviceId)).lastCommand.status, 'rejected');
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), localTask);
  });

  await check('expired offline commands are never applied on reconnection', async () => {
    await fresh(phoneA, pairingA.deviceId);
    await run(phoneA, `window.__studyTestRelayOffline=true;`);
    const task = await run(phoneA, `return app.currentStudyTask().taskId;`);
    const queued = await send(pairingA.deviceId, 'next_task', {}, { wait: false });
    await delay(5500);
    assert.equal((await device(pairingA.deviceId)).lastCommand?.id, queued.id);
    assert.equal((await device(pairingA.deviceId)).lastCommand.status, 'expired');
    await run(phoneA, `window.__studyTestRelayOffline=false;await app.studyRemote.publish();`);
    await delay(1200);
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), task);
  });

  await check('phone reload retains pairing and task history while requiring local recovery first', async () => {
    await fresh(phoneA, pairingA.deviceId);
    const task = await run(phoneA, `await app.flushStudySession();return app.currentStudyTask().taskId;`);
    const previousLoads = phoneA.events.filter(event => event.method === 'Page.loadEventFired').length;
    await phoneA.call('Page.reload', { ignoreCache: true });
    await until(() => Promise.resolve(phoneA.events.filter(event => event.method === 'Page.loadEventFired').length > previousLoads),
      'Phone did not reload.');
    await until(() => evaluate(phoneA, 'typeof spiralCalendar!=="undefined" && spiralCalendar._studyInitialized && !!spiralCalendar.studyRemote'),
      'Reloaded phone did not initialize.');
    assert.equal(await run(phoneA, `return app.studySession.isPaused;`), true);
    assert.equal(await run(phoneA, `return app.studyRemote.pairing.deviceId;`), pairingA.deviceId);
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), task);
    await fresh(phoneA, pairingA.deviceId);
    assert.equal((await device(pairingA.deviceId)).state.busy, true);
    await assert.rejects(() => send(pairingA.deviceId, 'resume'), error => error.status >= 400);
    assert.equal(await run(phoneA, `return await app.resumeStudySession();`), true);
    await fresh(phoneA, pairingA.deviceId);
    assert.equal((await device(pairingA.deviceId)).state.busy, false);
    assert.equal(await run(phoneA, `return app.currentStudyTask().taskId;`), task);
    assert.ok(await run(phoneA, `return app.studySession.interactions.some(row=>row.type==='local_during_relay_outage');`));
  });

  await check('debrief continues recording and finish archives only the targeted phone', async () => {
    await fresh(phoneA, pairingA.deviceId);
    await send(pairingA.deviceId, 'phase', { phase: 'debrief' });
    await run(phoneA, `app.recordStudyAction('debrief_interaction',{marker:'kept'});await app.flushStudySession();`);
    await evaluate(dashboard, 'window.spiralStudyFacilitator.refresh()');
    for (const [name, width, dark] of [['light',1280,false],['dark',1280,true],['mobile',390,false]]) {
      await dashboard.call('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width<500 });
      await dashboard.call('Emulation.setEmulatedMedia', { features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}] });
      await evaluate(dashboard, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout = await evaluate(dashboard, '({viewport:innerWidth,width:document.documentElement.scrollWidth})');
      assert.ok(layout.width <= layout.viewport, JSON.stringify({ name, ...layout }));
      if (process.argv.includes('--screenshots')) {
        const screenshot = await dashboard.call('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
        const file = path.join(os.tmpdir(), `spiral-study-facilitator-${name}.png`);
        fs.writeFileSync(file, Buffer.from(screenshot.data,'base64')); console.log('Screenshot: '+file);
      }
    }
    await send(pairingA.deviceId, 'finish');
    const archive = await run(phoneA, `return await app.getStudyStorage().listSessions();`);
    assert.equal(archive.length, 1); assert.equal(archive[0].isRecording, false);
    assert.ok(archive[0].interactions.some(row => row.type === 'debrief_interaction' && row.phase === 'debrief'));
    assert.equal(await run(phoneB, `return app.studySession.isRecording;`), true);
    await send(pairingB.deviceId, 'finish');
  });

  for (const target of pages) assert.equal(target.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0,
    JSON.stringify(target.events.filter(event => event.method === 'Runtime.exceptionThrown')));
  console.log(`${checks.length} remote study browser checks passed using isolated phone contexts${separate ? ' and a separate service behind a static /spiral/ app' : ''}.`);
} finally {
  for (const page of pages) page.close();
  if (browser) { await browser.call('Browser.close').catch(() => {}); browser.close(); }
  chrome.kill(); relay.close(); relay.closeAllConnections?.();
  staticApp?.close(); staticApp?.closeAllConnections?.();
  if (chrome.exitCode === null && chrome.signalCode === null && !launchError) {
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
  }
  const absoluteProfile = path.resolve(profile), tempRoot = path.resolve(os.tmpdir());
  if (absoluteProfile.startsWith(tempRoot + path.sep) && path.basename(absoluteProfile).startsWith('spiral-study-remote-check-')) {
    await fs.promises.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      .catch(error => console.error(`Temporary profile retained at ${absoluteProfile}: ${error.code}`));
  }
}
