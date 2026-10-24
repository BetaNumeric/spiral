import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as analysisCore from '../tools/study-analysis-core.mjs';
import { analyzeSessions, buildTaskRows, buildSummaryRows, buildInteractionRows, buildReportHtml,
  getDurationMs, expandStudyData, buildStudyImportEntries, TASK_COLUMNS, buildCsv, validateStudySession } from '../tools/study-analysis-core.mjs';

const startTime = '2026-10-23T08:00:00.000Z';
const action = (type, offsetMs, payload = {}, actor = 'participant') => ({ type, offsetMs,
  timestamp: new Date(Date.parse(startTime) + offsetMs).toISOString(), phase: 'task', payload, actor });
const session = (extra = {}) => ({ sessionId: 'session-1', participantId: 'P01', startTime,
  sessionPhase: 'task', isRecording: false, sessionDurationMs: 10000,
  interactions: [action('session_started', 0)], ...extra });

test('analysis diagnoses invalid sessions and malformed rows without losing original JSON', () => {
  const raw = session({ interactions: [null, action('panel_opened', 100),
    { ...action('events_changed', 200), phase: 'unknown' }, { ...action('panel_closed', 300), timestamp: 'invalid' }] });
  const diagnostics = [];
  const prepared = analyzeSessions([{ fileName: 'bad.json', raw: null }, { raw: { startTime: 'bad', interactions: [] } }, { raw }], { diagnostics });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].metrics.interactionCount, 1);
  assert.equal(prepared[0].originalRaw, raw);
  assert.equal(raw.interactions.length, 4);
  assert.equal(buildInteractionRows(prepared).length, 1);
  assert.ok(diagnostics.some((item) => item.severity === 'error'));
  assert.ok(diagnostics.some((item) => item.issues.some((issue) => issue.includes('Interaction 1'))));
  assert.doesNotThrow(() => buildReportHtml(prepared, { diagnostics }));
});

test('unknown session phases are rejected rather than reassigned to exploration', () => {
  assert.equal(validateStudySession(session({ sessionPhase: 'broken' })).valid, false);
  assert.equal(analyzeSessions([session({ sessionPhase: 'broken' })]).length, 0);
});

test('deduplication retains latest recording regardless of input order or local/import source', () => {
  const old = session({ revision: 1, snapshotTime: '2026-10-23T08:01:00Z', interactions: [action('session_started', 0)] });
  const latest = session({ revision: 2, snapshotTime: '2026-10-23T08:02:00Z', interactions: [action('session_started', 0), action('event_selected', 1000)] });
  for (const entries of [[{ source: 'Local', raw: latest }, { source: 'Imported old', raw: old }],
    [{ source: 'Imported old', raw: old }, { source: 'Local', raw: latest }]]) {
    const result = analyzeSessions(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0].originalRaw, latest);
    assert.equal(result[0].metrics.interactionCount, 2);
  }
});

test('snapshot timestamps deduplicate legacy files without revisions', () => {
  const old = session({ snapshotTime: '2026-10-23T08:01:00Z' });
  const latest = session({ snapshotTime: '2026-10-23T08:02:00Z' });
  assert.equal(analyzeSessions([latest, old])[0].originalRaw, latest);
});

test('incomplete recordings never gain duration from the analysis clock', () => {
  const raw = session({ isRecording: true, sessionDurationMs: undefined,
    interactions: [action('session_started', 0), action('panel_opened', 2500)] });
  assert.equal(getDurationMs(raw, Date.now() + 999999999), 2500);
  assert.equal(getDurationMs({ ...raw, snapshotTime: '2026-10-23T08:00:05Z' }), 5000);
  assert.equal(getDurationMs({ ...raw, sessionDurationMs: 8000 }), 8000);
  assert.ok(analyzeSessions([raw])[0].issues.some((issue) => issue.includes('incomplete')));
});

test('task metrics exclude merged interruptions and preserve outcomes, answers and help counts', () => {
  const raw = session({ condition: 'circle', protocolVersion: 'v1',
    pauses: [{ startOffsetMs: 2000, endOffsetMs: 5000, reason: 'background' },
      { startOffsetMs: 3000, endOffsetMs: 6000, reason: 'facilitator' }],
    interactions: [action('session_started', 0, {}, 'system'),
      action('task_assistance', 7000, { taskId: 'find', attemptId: 'find-1', note: 'Prompt repeated' }, 'facilitator')],
    tasks: [{ attemptId: 'find-1', taskId: 'find', startOffsetMs: 1000, endOffsetMs: 9000,
      outcome: 'partial', assisted: true, answer: 'Friday', notes: '<script>bad</script>' }] });
  const analyzed = analyzeSessions([raw]);
  const [row] = buildTaskRows(analyzed);
  assert.equal(row.elapsedMs, 8000);
  assert.equal(row.interruptionMs, 4000);
  assert.equal(row.taskDurationMs, 4000);
  assert.equal(row.helpCount, 1);
  assert.equal(row.outcome, 'partial');
  assert.equal(row.assisted, 'yes');
  const [summary] = buildSummaryRows(analyzed);
  assert.equal(summary.activeDurationMs, 6000);
  assert.equal(summary.facilitatorActions, 1);
  assert.equal(summary.systemActions, 1);
  assert.equal(summary.participantActions, 0);
  const html = buildReportHtml(analyzed);
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad</script>'));
  assert.match(buildCsv(TASK_COLUMNS, [row]), /circle/);
});

test('open task attempts and open pauses stop at the recording snapshot', () => {
  const raw = session({ isRecording: true, tasks: [{ taskId: 'find', startOffsetMs: 1000 }],
    pauses: [{ startOffsetMs: 5000, endOffsetMs: null }] });
  const [row] = buildTaskRows(analyzeSessions([raw]));
  assert.equal(row.outcome, 'incomplete');
  assert.equal(row.elapsedMs, 9000);
  assert.equal(row.taskDurationMs, 4000);
  assert.equal(row.endOffsetMs, '');
});

test('interruption marker fallback matches pauses and retains thinking time', () => {
  const raw = session({ interactions: [action('session_started', 0),
    action('session_paused', 2000, { reason: 'background' }), action('session_resumed', 5000, { reason: 'background' })],
    tasks: [{ taskId: 'read', startOffsetMs: 0, endOffsetMs: 10000, outcome: 'success' }] });
  assert.equal(buildTaskRows(analyzeSessions([raw]))[0].taskDurationMs, 7000);
});

test('archives, wrapped sessions and legacy arrays expand through one parser', () => {
  const raw = session();
  assert.deepEqual(expandStudyData({ sessions: [raw] }), [raw]);
  assert.deepEqual(expandStudyData({ raw }), [raw]);
  assert.deepEqual(expandStudyData([raw]), [raw]);
  assert.deepEqual(expandStudyData(raw), [raw]);
});

test('explicit active durations survive exports even when pause spans are unavailable', () => {
  const raw = session({ activeDurationMs: 7000, tasks: [{ taskId: 'read', startOffsetMs: 0,
    endOffsetMs: 10000, taskDurationMs: 7000, outcome: 'success', helpCount: 2 }] });
  const analyzed = analyzeSessions([raw]);
  assert.equal(analyzed[0].metrics.activeDurationMs, 7000);
  const [row] = buildTaskRows(analyzed);
  assert.equal(row.interruptionMs, 3000);
  assert.equal(row.taskDurationMs, 7000);
  assert.equal(row.helpCount, 2);
  assert.equal(row.assisted, 'yes');
});

test('a malformed newer revision does not replace a usable recording', () => {
  const good = session({ revision: 1 });
  const malformed = session({ revision: 2, startTime: 'broken' });
  const diagnostics = [];
  const analyzed = analyzeSessions([good, malformed], { diagnostics });
  assert.equal(analyzed.length, 1);
  assert.equal(analyzed[0].originalRaw, good);
  assert.ok(diagnostics.some((item) => item.severity === 'error'));
});

test('browser analysis reads the archive through the storage constructor and reuses its connection', async () => {
  const source = fs.readFileSync(new URL('../js/study-analysis-page.js', import.meta.url), 'utf8');
  const moduleSource = source.slice(0, source.lastIndexOf('\ninstallReportStyles();'))
    .replace(/^import \{([\s\S]*?)\} from '\.\.\/tools\/study-analysis-core\.mjs';/, 'const {$1} = analysisCore;');
  let instances = 0;
  let fail = false;
  class Storage {
    constructor() { instances++; this.error = new Error('Archive unavailable'); }
    async initialize() { return !fail; }
    async listSessions() { return [session()]; }
  }
  const context = vm.createContext({ analysisCore, window: { SpiralStudyStorage: Storage },
    document: { getElementById: () => null } });
  vm.runInContext(moduleSource, context);
  const first = await vm.runInContext('getLocalStudyEntries()', context);
  const second = await vm.runInContext('getLocalStudyEntries()', context);
  assert.equal(instances, 1);
  assert.equal(first[0].raw.sessionId, 'session-1');
  assert.equal(second[0].source, 'Local study archive');
  fail = true;
  await assert.rejects(vm.runInContext('getLocalStudyEntries()', context), /Archive unavailable/);
});

test('schema 6 recordings survive a backwards device clock using monotonic duration', () => {
  const raw = session({ schemaVersion: 6, endTime: '2026-10-23T07:00:00Z',
    interactions: [action('session_started', 0),
      { ...action('session_stopped', 10000), timestamp: '2026-10-23T07:00:00Z' }],
    tasks: [{ taskId: 'read', startOffsetMs: 1000, endOffsetMs: 9000, outcome: 'success' }] });
  const diagnostics = [];
  const analyzed = analyzeSessions([raw], { diagnostics });
  assert.equal(analyzed.length, 1);
  assert.equal(analyzed[0].metrics.durationMs, 10000);
  assert.equal(buildTaskRows(analyzed)[0].taskDurationMs, 8000);
  assert.ok(diagnostics.some((item) => item.issues.some((issue) => issue.includes('clock moved backwards'))));
  assert.equal(analyzeSessions([{ ...raw, sessionDurationMs: undefined }]).length, 0);
  assert.equal(analyzeSessions([{ ...raw, endTime: 'not-a-date' }]).length, 0);
});

test('successful archive imports preserve their full envelope without analyzing recovery snapshots', () => {
  const canonical = session({ revision: 2 });
  const recovery = session({ revision: 3, participantId: 'unsaved-conflict' });
  const envelope = { sessions: [canonical, session({ sessionId: 'session-2' })],
    imports: [{ raw: null, originalText: 'invalid original recording' }],
    recoverySnapshots: [recovery], fixtureMetadata: { label: 'pilot' } };
  const originalText = JSON.stringify(envelope, null, 2);
  const entries = buildStudyImportEntries(envelope, { fileName: 'study-sessions-pilot.json', originalText });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].originalText, originalText);
  assert.equal(entries[1].originalText, undefined);
  assert.equal(JSON.parse(entries[0].originalText).imports[0].originalText, 'invalid original recording');
  assert.equal(analyzeSessions(entries).find((row) => row.raw.sessionId === 'session-1').raw.participantId, 'P01');
  assert.ok(!analyzeSessions(entries).some((row) => row.raw.participantId === 'unsaved-conflict'));
});

test('empty archives retain their original data and report the absence of canonical sessions', () => {
  const envelope = { sessions: [], recoverySnapshots: [session()], imports: [{ originalText: 'broken original' }] };
  const originalText = JSON.stringify(envelope);
  const entries = buildStudyImportEntries(envelope, { originalText });
  const diagnostics = [];
  assert.equal(entries.length, 1);
  assert.equal(entries[0].originalText, originalText);
  assert.equal(analyzeSessions(entries, { diagnostics }).length, 0);
  assert.ok(diagnostics.some((row) => row.issues.some((issue) => issue.includes('No canonical sessions'))));
});


test('finished unrated tasks retain their timing and stay separate from success and incomplete attempts', () => {
  const raw = session({ tasks: [{ taskId: 'T01', attemptId: 'a1', startOffsetMs: 1000,
    endOffsetMs: 5000, outcome: 'unrated', taskDurationMs: 4000 }] });
  const prepared = analyzeSessions([raw]);
  assert.equal(prepared.length, 1);
  const rows = buildTaskRows(prepared);
  assert.equal(rows[0].outcome, 'unrated');
  assert.equal(rows[0].taskDurationMs, 4000);
  assert.equal(validateStudySession(raw).issues.length, 0);
  const report = buildReportHtml(prepared);
  assert.match(report, /Not rated/);
  assert.match(report, /<td>unrated<\/td>/);
  assert.doesNotMatch(report, /NaN/);
});
