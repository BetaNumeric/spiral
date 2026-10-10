// Local headless Chrome benchmark. Timings cover synchronous Canvas draw calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = process.argv.includes('--baseline-painter');
let baselineMethods = '';
if (baseline) {
  const context = vm.createContext({ SpiralCalendar: class {} });
  for (const file of ['render-circle', 'render-spiral']) {
    vm.runInContext(execFileSync('git', ['show', `HEAD:js/${file}.js`], {
      cwd: root, encoding: 'utf8', windowsHide: true
    }), context);
  }
  const names = ['drawEventSegments', 'drawEventCircleSubsegment', 'drawCircleRadialEdge', 'drawCircleSegment',
    'traceCircleBandPath', 'drawEventSpiralSubsegment', 'getEventSpiralSamples', 'adaptiveThetaSamples',
    'queuePendingSpiralOverlapEdge', 'drawPendingSpiralOverlapEdges']
    .filter(name => typeof context.SpiralCalendar.prototype[name] === 'function');
  baselineMethods = `Object.assign(SpiralCalendar.prototype,{${names.map(name =>
    context.SpiralCalendar.prototype[name].toString()).join(',')}});`;
}

const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spiral-canvas-benchmark-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const server = http.createServer((request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-background-networking',
  '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let launchError, browser, page;
chrome.on('error', error => { launchError = error; });

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
    pending.delete(result.id);
    clearTimeout(request.timer);
    if (result.error) request.reject(new Error(JSON.stringify(result.error)));
    else request.resolve(result.result);
  };
  ws.onclose = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Browser connection closed.'));
    }
    pending.clear();
  };
  return { events, close: () => ws.close(), call: (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out.`)); }, 30000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  }) };
}

try {
  let address;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { address = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!address) throw new Error('Chrome did not start. Set CHROME_PATH to your Chrome executable.');
  const origin = 'http://127.0.0.1:' + address[0];
  browser = await connect('ws://127.0.0.1:' + address[0] + address[1].trim());
  const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank' });
  const targets = await (await fetch(origin + '/json')).json();
  page = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
  await page.call('Runtime.enable');
  await page.call('Page.enable');
  await page.call('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' });
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-08T10:00:00Z'])); }
      static now() { return RealDate.parse('2026-10-08T10:00:00Z'); }
    };
    window.fetch = async () => { throw new Error('External data disabled for the benchmark.'); };
    window.alert = () => {};
  ` });
  await page.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  const evaluate = async expression => {
    const result = await page.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (let i = 0; i < 100; i++) {
    if (await evaluate('typeof spiralCalendar !== "undefined" && !!spiralCalendar')) break;
    await delay(100);
  }
  if (baselineMethods) await evaluate(baselineMethods);
  await evaluate(`(()=>{const app=spiralCalendar;app.stopAutoTimeAlign();app.startupAnimationState.active=false;
    app.completeModeTransitionImmediately();app.state.useLocationTimezone=true;app.state.locationTimezoneId='Europe/Berlin';
    app.state.days=7;app.state.rotation=0;app.state.spiralScale=1.2;app.state.staticMode=true;
    app.state.showArcLines=true;app.state.showSegmentEdges=false;app.state.showEventBoundaryStrokes=true;
    app.state.showAllEventBoundaryStrokes=false;app.state.showNightOverlay=true;app.state.showGradientOverlay=false;
    app.state.showDayOverlay=false;app.state.visibleCalendars=['Home'];
    app.referenceTime=SpiralTime.parseWall('2026-10-25T00:00');})()`);
  const results = [];
  for (const [name, count, days] of [['empty', 0, 365], ['year-1000', 1000, 365],
    ['year-10000', 10000, 365], ['dense-500', 500, 1]]) {
    await evaluate(`(()=>{const app=spiralCalendar;app.events=Array.from({length:${count}},(_,i)=>{
      const start=Date.parse('2026-10-25T00:00:00Z')+(i%${days})*SpiralTime.DAY
        +(Math.floor(i/${days})%12)*SpiralTime.HOUR+(i%5)*60000;
      return app.normalizeRuntimeEvent({title:'Event '+i,persistentUID:'benchmark-'+i,calendar:i%7===0?'Hidden':'Home',
        start:new Date(start),end:new Date(start+(30+i%90)*60000),color:'#9fe5df',colorIsCustom:true});});
      app.invalidateEventViews();})()`);
    for (const stack of [false, true]) for (const circle of [false, true]) {
      const result = await evaluate(`(()=>{const app=spiralCalendar;app.state.circleMode=${circle};
        app.state.overlayStackMode=${stack};app.drawSpiral();const times=[];
        for(let i=0;i<7;i++){const before=performance.now();app.drawSpiral();times.push(performance.now()-before);}
        times.sort((a,b)=>a-b);let scopes=0;const ctx=app.ctx,save=ctx.save;
        ctx.save=function(){scopes++;return save.call(this);};try{app.drawEventSegments();}finally{ctx.save=save;}
        return {medianDrawMs:Math.round(times[3]*10)/10,pieces:app.eventSegments.length,eventScopes:scopes};})()`);
      results.push({ calendar: name, view: circle ? 'circles' : 'spiral', stack, ...result });
    }
  }
  assert.equal(page.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
  console.log(`Painter: ${baseline ? 'HEAD' : 'workspace'}; viewport 1280x900; median of seven draws`);
  console.table(results);
} finally {
  page?.close();
  if (browser) {
    await browser.call('Browser.close').catch(() => {});
    browser.close();
  }
  chrome.kill();
  server.close();
  server.closeAllConnections();
  if (chrome.exitCode === null && chrome.signalCode === null && !launchError) {
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
  }
  // Remove only this tool's newly created profile within the system temp directory.
  const absoluteProfile = path.resolve(profile), tempRoot = path.resolve(os.tmpdir());
  if (absoluteProfile.startsWith(tempRoot + path.sep) && path.basename(absoluteProfile).startsWith('spiral-canvas-benchmark-')) {
    await fs.promises.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      .catch(error => console.error(`Temporary profile retained at ${absoluteProfile}: ${error.code}`));
  }
}
