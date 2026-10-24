// Persistent study-recorder smoke checks against real Chrome and IndexedDB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spiral-study-check-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
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

  const evaluate = async (target, expression) => {
    const result = await target.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const appUrl = `http://127.0.0.1:${server.address().port}/`;
  const pages = [];
  async function newPage() {
    const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank' });
    const targets = await (await fetch(origin + '/json')).json();
    const target = await connect(targets.find(item => item.id === targetId).webSocketDebuggerUrl);
    target.targetId = targetId;
    pages.push(target);
    await target.call('Runtime.enable');
    await target.call('Page.enable');
    await target.call('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' });
    await target.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await target.call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.fetch = async () => { throw new Error('External data disabled for study checks.'); };
      if (navigator.serviceWorker) navigator.serviceWorker.register = async () => ({});
      window.alert = () => {};
      window.confirm = () => true;
    ` });
    await target.call('Page.navigate', { url: appUrl });
    await ready(target);
    return target;
  }
  async function ready(target) {
    for (let index = 0; index < 150; index++) {
      if (await evaluate(target, 'typeof spiralCalendar !== "undefined" && spiralCalendar?._studyInitialized === true')) {
        await evaluate(target, `(() => { const app=spiralCalendar; app.stopAutoTimeAlign(); app.startupAnimationState.active=false;
          app.completeModeTransitionImmediately(); app._allowDiscardUnsavedEvents=true; return true; })()`);
        return;
      }
      await delay(100);
    }
    throw new Error('Study controls did not initialize: ' + JSON.stringify(target.events.filter(item => item.method === 'Runtime.exceptionThrown')));
  }
  async function run(target, source) {
    return evaluate(target, `(async()=>{const app=spiralCalendar;${source}})()`);
  }
  async function until(target, expression, message) {
    for(let index=0;index<100;index++) {
      if(await evaluate(target,expression)) return;
      await delay(50);
    }
    throw new Error(message);
  }
  const results = [];
  async function check(name, callback) { await callback(); results.push(name); console.log('PASS ' + name); }

  page = await newPage();
  await run(page, `
    app.events=[app.normalizeRuntimeEvent({title:'Baseline event',persistentUID:'study-browser-event',
      calendar:'Home', start:'2026-10-25T08:00:00Z',end:'2026-10-25T09:00:00Z',timeModel:'instant-v1',color:'#abcdef',colorIsCustom:true})];
    app.state.visibleCalendars=['Home'];app.invalidateEventViews();
    if(!await app.saveEventsToStorage()) throw new Error('Could not save fixture event');
  `);

  await check('baseline uses persistent IndexedDB', async () => {
    assert.equal(await run(page, `return await app.saveStudyFixture('browser-baseline');`), true);
    assert.equal(await run(page, `return (await app.getStudyStorage().getFixture()).events[0].title;`), 'Baseline event');
  });

  await check('session, task, assistance, pause, resume and finalization', async () => {
    const result = await run(page, `
      if(!await app.startStudySession('P01','explore',{studyId:'pilot',condition:'spiral',fixtureId:'browser-baseline'})) throw new Error(app._studyMessage);
      const task=app.startStudyTask({taskId:'find-event',label:'Find the event'});
      if(!task) throw new Error('Task did not start');
      app.recordStudyAssistance('Prompted participant');
      app.addStudyNote('Observed exploration');
      app.recordStudyAction('event_selected',{eventId:'study-browser-event'});
      app.pauseStudySession();
      await new Promise(resolve=>setTimeout(resolve,70));
      if(!await app.resumeStudySession()) throw new Error('Resume failed');
      app.endStudyTask('success',{answer:'09:00',notes:'Completed'});
      if(!await app.stopStudySession()) throw new Error(app._studyMessage);
      const sessions=await app.getStudyStorage().listSessions();
      return {count:sessions.length,session:sessions[0],writer:app.getStudyStorage().writer};
    `);
    assert.equal(result.count, 1);
    assert.equal(result.writer, false);
    assert.equal(result.session.isRecording, false);
    assert.equal(result.session.tasks[0].outcome, 'success');
    assert.equal(result.session.tasks[0].helpCount, 1);
    assert.equal(result.session.pauses.length, 1);
    assert.ok(result.session.pauses[0].endOffsetMs > result.session.pauses[0].startOffsetMs);
    for (const type of ['session_started','task_started','task_assistance','session_paused','session_resumed','task_completed','session_stopped']) {
      assert.ok(result.session.interactions.some(row => row.type === type), type);
    }
  });

  await check('second participant remains separate and schema 6 analysis reads exports', async () => {
    const result = await run(page, `
      if(!await app.startStudySession('P02','task',{studyId:'pilot',condition:'circle'})) throw new Error(app._studyMessage);
      app.startStudyTask({taskId:'create-event'});
      app.endStudyTask('partial',{answer:'Created draft'});
      if(!await app.stopStudySession()) throw new Error(app._studyMessage);
      const sessions=await app.getStudyStorage().listSessions();
      const core=await import('./tools/study-analysis-core.mjs');
      const analysis=core.analyzeSessions(sessions.map(raw=>({raw,fileName:'browser archive'})));
      return {count:sessions.length,ids:sessions.map(row=>row.participantId),analysisCount:analysis.length,tasks:core.buildTaskRows(analysis)};
    `);
    assert.equal(result.count, 2);
    assert.deepEqual(result.ids, ['P01','P02']);
    assert.equal(result.analysisCount, 2);
    assert.equal(result.tasks.length, 2);
  });

  await check('baseline reset restores calendar and preserves both archived participants', async () => {
    const result = await run(page, `
      app.events[0].title='Changed by participant';app.events.push(app.normalizeRuntimeEvent({
        title:'Extra',persistentUID:'study-extra',calendar:'Home',start:'2026-10-25T09:00:00Z',end:'2026-10-25T10:00:00Z',timeModel:'instant-v1'}));
      app.invalidateEventViews();await app.saveEventsToStorage();
      if(!await app.resetStudyFixture()) throw new Error(app._studyMessage);
      return {titles:app.events.map(row=>row.title),archive:(await app.getStudyStorage().listSessions()).length};
    `);
    assert.deepEqual(result.titles, ['Baseline event']);
    assert.equal(result.archive, 2);
  });

  await check('another tab cannot record while the first tab owns the writer', async () => {
    assert.equal(await run(page, `return await app.startStudySession('P03');`), true);
    const second = await newPage();
    const result = await run(second, `return {started:await app.startStudySession('P-other'),writer:app.getStudyStorage().writer,message:app._studyMessage};`);
    assert.equal(result.started, false);
    assert.equal(result.writer, false);
    assert.match(result.message, /another|finish|recover/i);
    await browser.call('Target.closeTarget', { targetId: second.targetId });
    second.close();
  });

  await check('reload recovers a paused session, retaining actions and requiring manual resume', async () => {
    await page.call('Page.bringToFront');
    await run(page, `if(app.studySession.isPaused) await app.resumeStudySession();
      if(!app.recordStudyAction('before_reload',{marker:'kept'})) throw new Error('Could not record reload marker');
      if(!await app.flushStudySession()) throw new Error(app._studyMessage);`);
    const loadCount=page.events.filter(event=>event.method==='Page.loadEventFired').length;
    await page.call('Page.reload', { ignoreCache: true });
    for(let index=0;index<100&&page.events.filter(event=>event.method==='Page.loadEventFired').length<=loadCount;index++) await delay(50);
    await ready(page);
    const recovered = await run(page, `return {participant:app.studySession.participantId,paused:app.studySession.isPaused,
      writer:app.getStudyStorage().writer,kept:app.studySession.interactions.some(row=>row.type==='before_reload')};`);
    assert.equal(recovered.participant, 'P03');
    assert.equal(recovered.paused, true);
    assert.equal(recovered.writer, false);
    assert.equal(recovered.kept, true);
    assert.equal(await run(page, `return await app.resumeStudySession();`), true);
  });

  await check('study controls fit a 390px screen in both themes', async () => {
    await run(page, `await app.changeStudyMode('task');`);
    await page.call('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
    for(const dark of [false,true]) {
      const layout = await run(page, `
        document.body.classList.toggle('dark-mode',${dark});app.state.darkMode=${dark};
        const panel=document.getElementById('settingsPanel');panel.style.display='block';
        const content=document.getElementById('studySessionContent');content.style.display='flex';
        for(const details of content.querySelectorAll('details')) details.open=true;
        document.getElementById('studyTaskFinishControls').hidden=false;
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const section=document.getElementById('studySessionSection'),bounds=section.getBoundingClientRect();
        const overflow=[...content.querySelectorAll('input,select,textarea,button')].filter(element=>{
          const rect=element.getBoundingClientRect();return rect.width>0&&(rect.left<bounds.left-2||rect.right>bounds.right+2);
        }).map(element=>({id:element.id,width:element.getBoundingClientRect().width}));
        return {overflow,panelWidth:panel.getBoundingClientRect().width,viewport:innerWidth,scroll:document.documentElement.scrollWidth};
      `);
      assert.deepEqual(layout.overflow, [], JSON.stringify({dark,...layout}));
      assert.ok(layout.panelWidth<=390, JSON.stringify(layout));
      if(process.argv.includes('--screenshots')) {
        await run(page, `document.getElementById('studySessionSection').scrollIntoView({block:'start'});`);
        const capture=await page.call('Page.captureScreenshot',{format:'png'});
        const file=path.join(os.tmpdir(),`spiral-study-controls-${dark?'dark':'light'}.png`);
        fs.writeFileSync(file,Buffer.from(capture.data,'base64'));
        console.log('Screenshot: '+file);
        // Expand only the panel's scrolling container for a full-content preview.
        // Restore every style immediately after capture; normal layout checks above
        // run against the actual phone viewport and normal scrolling container.
        const clip=await run(page, `
          const panel=document.getElementById('settingsPanel'),section=document.getElementById('studySessionSection');
          const originals=new Map(),save=element=>{if(!originals.has(element)) originals.set(element,element.getAttribute('style'));};
          save(panel);save(section);panel.style.cssText+=';position:absolute;top:0;bottom:auto;max-height:none;height:auto;overflow:visible';
          let node=section;while(node!==panel&&node.parentElement){for(const sibling of node.parentElement.children){
            if(sibling!==node){save(sibling);sibling.style.display='none';}}node=node.parentElement;
            save(node);for(const [property,value] of [['max-height','none'],['height','auto'],['overflow','visible']]) node.style.setProperty(property,value,'important');}
          const banner=document.getElementById('a2hs-banner');if(banner){save(banner);banner.style.display='none';}
          section.style.marginTop='0';section.style.paddingTop='0';panel.scrollTop=0;
          window._restoreStudyPreview=()=>{for(const [element,style] of originals){if(style===null)element.removeAttribute('style');else element.setAttribute('style',style);}};
          const bounds=section.getBoundingClientRect();return {x:Math.max(0,bounds.left),y:Math.max(0,bounds.top),width:bounds.width,height:bounds.height,scale:1};
        `);
        await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:Math.ceil(clip.y+clip.height+40),deviceScaleFactor:1,mobile:true});
        await run(page,'await new Promise(resolve=>requestAnimationFrame(resolve));');
        const full=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
        const fullFile=path.join(os.tmpdir(),`spiral-study-controls-${dark?'dark':'light'}-full.png`);
        fs.writeFileSync(fullFile,Buffer.from(full.data,'base64'));
        await page.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await evaluate(page,'window._restoreStudyPreview();delete window._restoreStudyPreview;');
        console.log('Full-content preview: '+fullFile);
      }
    }
  });

  await check('recovery refreshes the saved recording after the previous owner appends actions', async () => {
    const observer = await newPage();
    const before = await run(observer, `return app.studySession.interactions.length;`);
    await run(page, `if(app.studySession.isPaused) await app.resumeStudySession();
      if(!app.recordStudyAction('after_observer_loaded',{marker:'fresh'})) throw new Error('Could not record fresh marker');
      app.pauseStudySession();await app.flushStudySession();await app.getStudyStorage().releaseWriter();`);
    const result = await run(observer, `
      const resumed=await app.resumeStudySession();
      return {resumed,count:app.studySession.interactions.length,marker:app.studySession.interactions.some(row=>row.type==='after_observer_loaded'),
        stopped:resumed?await app.stopStudySession():false,message:app._studyMessage};
    `);
    assert.equal(result.resumed, true, result.message);
    assert.equal(result.marker, true);
    assert.ok(result.count > before);
    assert.equal(result.stopped, true, result.message);
    await browser.call('Target.closeTarget', { targetId: observer.targetId });
    observer.close();
    await run(page, `await app.restoreStudySessionDraft();`);
  });

  await check('minimal DOM flow hides study controls and numbers tasks without setup forms',async()=>{
    await page.call('Page.bringToFront');
    const openControls=async()=>{
      await run(page, `if(document.getElementById('settingsPanel').style.display!=='block') document.getElementById('settingsPanelBtn').click();
        if(document.getElementById('studySessionContent').style.display!=='flex') document.getElementById('studySessionToggle').click();`);
      await until(page, `document.getElementById('studySessionContent').style.display==='flex'`, 'Study controls did not open');
    };
    const assertCalendar=async()=>{
      assert.deepEqual(await run(page, `return {settings:document.getElementById('settingsPanel').style.display,
        study:document.getElementById('studySessionContent').style.display,
        tools:document.getElementById('studyFacilitatorTools').open};`), {settings:'none',study:'none',tools:false});
    };
    await openControls();
    assert.equal(await run(page, `return document.querySelectorAll('#studySessionContent input').length;`),1);
    assert.equal(await run(page, `return document.getElementById('participantId').value;`),'P04');
    await run(page, `document.getElementById('participantId').value='P04-dom';document.getElementById('startRecordingBtn').click();`);
    await until(page,'spiralCalendar.studySession?.participantId==="P04-dom" && spiralCalendar.studySession.isRecording && !spiralCalendar._studyBusy','DOM Start did not finish');
    await assertCalendar();
    await openControls();
    await run(page, `document.getElementById('studyTasksBtn').click();`);
    await until(page,'spiralCalendar.currentStudyTask()?.taskId==="T01" && !spiralCalendar._studyFlowBusy','DOM first task did not start');
    await assertCalendar();
    await openControls();
    await run(page, `document.getElementById('studyFacilitatorTools').open=true;
      document.getElementById('studyHelpBtn').click();document.getElementById('studyNote').value='First note';
      document.getElementById('studyAddNoteBtn').click();`);
    await until(page, 'spiralCalendar.studySession.notes.length===1', 'Facilitator note did not save');
    await run(page, `document.getElementById('nextStudyTaskBtn').click();`);
    await until(page,'spiralCalendar.currentStudyTask()?.taskId==="T02" && !spiralCalendar._studyFlowBusy','DOM next task did not start');
    await assertCalendar();
    assert.equal(await run(page, `return app.studySession.tasks[0].outcome;`),'unrated');
    await openControls();
    assert.equal(await run(page, `return document.getElementById('studyTaskOutcome').value;`),'unrated');
    await run(page, `const result=document.getElementById('studyTaskOutcome');result.value='partial';result.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('studyDebriefBtn').click();`);
    await until(page, 'spiralCalendar.studySession.sessionPhase==="debrief" && !spiralCalendar._studyFlowBusy', 'Debrief did not start');
    await assertCalendar();
    await run(page, `if(!app.recordStudyAction('debrief_interaction',{marker:'kept'})) throw new Error('Debrief was not recorded');`);
    await openControls();
    await run(page, `document.getElementById('stopRecordingBtn').click();`);
    await until(page,'!spiralCalendar.studySession.isRecording && !spiralCalendar._studyBusy','DOM Finish did not archive');
    const session=await run(page, `return (await app.getStudyStorage().listSessions()).find(row=>row.participantId==='P04-dom');`);
    assert.deepEqual(session.tasks.map(task=>task.taskId), ['T01','T02']);
    assert.deepEqual(session.tasks.map(task=>task.outcome), ['unrated','partial']);
    assert.equal(session.tasks[0].helpCount,1);
    assert.equal(session.notes[0].attemptId,session.tasks[0].attemptId);
    assert.ok(session.interactions.some(row=>row.type==='debrief_interaction'&&row.phase==='debrief'&&!row.taskId));
  });

  await check('Study Analysis loads local archives and deduplicates real JSON imports with validation warnings',async()=>{
    const exported=await run(page, `let captured;const original=app.downloadStudyJson;
      app.downloadStudyJson=data=>{captured=data;};try{await app.downloadStudyArchive();}finally{app.downloadStudyJson=original;}
      return captured;`);
    assert.equal(exported.schemaVersion,6);
    assert.equal(exported.sessions.length,4);
    const file=path.join(profile,'study-import.json');
    fs.writeFileSync(file,JSON.stringify({sessions:[...exported.sessions,{startTime:'invalid',interactions:[null]}]}));
    const analysis=await newPage();
    await analysis.call('Page.navigate',{url:appUrl+'study-analysis.html'});
    await until(analysis,`document.getElementById('analysisStatus')?.textContent.includes('4 sessions loaded')`,'Analysis did not load local recordings');
    assert.match(await evaluate(analysis,`document.getElementById('analysisReport').textContent`),/Task Attempts/);
    const {root:documentRoot}=await analysis.call('DOM.getDocument');
    const {nodeId}=await analysis.call('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'#importStudyFiles'});
    await analysis.call('DOM.setFileInputFiles',{nodeId,files:[file]});
    await until(analysis,`document.getElementById('analysisStatus')?.textContent.includes('imported')`,'Analysis did not process imported JSON');
    const result=await evaluate(analysis,`({status:document.getElementById('analysisStatus').textContent,
      report:document.getElementById('analysisReport').textContent,imports:localStorage.getItem('spiralCalendarStudyAnalysisImports')})`);
    assert.match(result.status,/4 sessions loaded/);
    assert.match(result.status,/warning/);
    assert.match(result.report,/duplicate|superseded|invalid|startTime/i);
    assert.ok(result.imports,'Imports were not retained in localStorage');
    await browser.call('Target.closeTarget',{targetId:analysis.targetId});analysis.close();
  });

  for(const target of pages) assert.equal(target.events.filter(event=>event.method==='Runtime.exceptionThrown').length,0,
    JSON.stringify(target.events.filter(event=>event.method==='Runtime.exceptionThrown')));
  console.log(`${results.length} study browser checks passed using an isolated temporary profile.`);
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
  if (absoluteProfile.startsWith(tempRoot + path.sep) && path.basename(absoluteProfile).startsWith('spiral-study-check-')) {
    await fs.promises.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      .catch(error => console.error(`Temporary profile retained at ${absoluteProfile}: ${error.code}`));
  }
}


