import {
  INTERACTION_COLUMNS,
  STUDY_ANALYSIS_CSS,
  STUDY_ANALYSIS_IMPORTS_STORAGE_KEY,
  STUDY_SESSION_STORAGE_KEY,
  SUMMARY_COLUMNS,
  TASK_COLUMNS,
  analyzeSessions,
  buildCsv,
  buildInteractionRows,
  buildReportHtml,
  buildSummaryRows,
  buildTaskRows,
  buildStudyImportEntries,
  escapeHtml,
  renderAnalysisSections
} from '../tools/study-analysis-core.mjs';

const state = {
  sessions: [],
  localEntries: [],
  importedEntries: [],
  diagnostics: [],
  storage: null
};

const elements = {
  app: document.getElementById('analysisApp'),
  report: document.getElementById('analysisReport'),
  status: document.getElementById('analysisStatus'),
  fileInput: document.getElementById('importStudyFiles'),
  refreshButton: document.getElementById('refreshStudyDataBtn'),
  clearButton: document.getElementById('clearImportedStudyDataBtn'),
  summaryButton: document.getElementById('downloadSummaryCsvBtn'),
  interactionsButton: document.getElementById('downloadInteractionsCsvBtn'),
  reportButton: document.getElementById('downloadReportHtmlBtn'),
  localJsonButton: document.getElementById('downloadLocalStudyJsonBtn'),
  tasksButton: document.getElementById('downloadTasksCsvBtn')
};

function installReportStyles() {
  if (document.getElementById('studyAnalysisCoreStyles')) return;
  const style = document.createElement('style');
  style.id = 'studyAnalysisCoreStyles';
  style.textContent = STUDY_ANALYSIS_CSS;
  document.head.appendChild(style);
}

function readJsonStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    return JSON.parse(stored);
  } catch (error) {
    throw new Error(`Could not read ${key}: ${error.message}`);
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function getLocalStudyEntries() {
  if (window.SpiralStudyStorage) {
    state.storage ||= new window.SpiralStudyStorage();
    if (!await state.storage.initialize()) throw state.storage.error || new Error('Study archive could not be opened.');
    const sessions = await state.storage.listSessions();
    return sessions.map((raw) => ({ fileName: `local-${raw.sessionId}.json`, source: 'Local study archive', raw }));
  }
  const raw = readJsonStorage(STUDY_SESSION_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.startTime) return [];

  const normalized = {
    ...raw,
    appVersion: raw.appVersion || window.APP_VERSION || null
  };
  const label = normalized.isRecording ? 'Current local recording' : 'Local saved study session';

  return [{
    fileName: 'local-study-session.json',
    source: label,
    raw: normalized
  }];
}

function getImportedEntries() {
  const entries = readJsonStorage(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY, []);
  if (!Array.isArray(entries)) throw new Error('Saved study imports are malformed. Export a browser backup before replacing them.');
  return entries;
}

function saveImportedEntries(entries) {
  writeJsonStorage(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY, entries);
}

function setStatus(message) {
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function downloadText(fileName, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getDownloadStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function updateActionState() {
  const hasSessions = state.sessions.length > 0;
  const hasImported = state.importedEntries.length > 0;

  [
    elements.summaryButton,
    elements.interactionsButton,
    elements.reportButton,
    elements.tasksButton
  ].forEach((button) => {
    if (button) button.disabled = !hasSessions;
  });

  if (elements.clearButton) elements.clearButton.disabled = !hasImported;
  if (elements.localJsonButton) elements.localJsonButton.disabled = !hasSessions && !hasImported;
}

function bindTimelineFilters(root = document) {
  const phaseFilter = root.getElementById ? root.getElementById('phaseFilter') : document.getElementById('phaseFilter');
  const typeFilter = root.getElementById ? root.getElementById('typeFilter') : document.getElementById('typeFilter');
  const filterSummary = root.getElementById ? root.getElementById('filterSummary') : document.getElementById('filterSummary');
  const timelineSessions = Array.from(document.querySelectorAll('.timeline-session'));

  if (!phaseFilter || !typeFilter || !filterSummary || timelineSessions.length === 0) return;

  const updateTimelineFilters = () => {
    const selectedPhase = phaseFilter.value;
    const selectedType = typeFilter.value;
    let visibleSessions = 0;
    let visibleMarkers = 0;
    let totalMarkers = 0;

    timelineSessions.forEach((session) => {
      const markers = Array.from(session.querySelectorAll('.timeline-marker'));
      totalMarkers += markers.length;
      let sessionVisibleMarkers = 0;

      markers.forEach((marker) => {
        const matchesPhase = selectedPhase === 'all' || marker.dataset.phase === selectedPhase;
        const matchesType = selectedType === 'all' || marker.dataset.type === selectedType;
        const isVisible = matchesPhase && matchesType;
        marker.classList.toggle('is-hidden', !isVisible);
        if (isVisible) sessionVisibleMarkers += 1;
      });

      visibleMarkers += sessionVisibleMarkers;
      if (sessionVisibleMarkers > 0) visibleSessions += 1;
      session.classList.toggle('is-empty', sessionVisibleMarkers === 0);

      const countLabel = session.querySelector('.timeline-filter-count');
      if (countLabel) {
        countLabel.textContent = `${sessionVisibleMarkers}/${markers.length} visible`;
      }
    });

    filterSummary.textContent = `Showing ${visibleMarkers} of ${totalMarkers} markers across ${visibleSessions} session(s).`;
  };

  phaseFilter.addEventListener('change', updateTimelineFilters);
  typeFilter.addEventListener('change', updateTimelineFilters);
  updateTimelineFilters();
}

async function render() {
  state.diagnostics = [];
  try {
    state.localEntries = await getLocalStudyEntries();
  } catch (error) {
    state.localEntries = [];
    state.diagnostics.push({ source: 'Local archive', severity: 'error', issues: [`Could not read recordings: ${error.message}. Refresh to retry; no recordings were removed.`] });
  }
  try {
    state.importedEntries = getImportedEntries();
  } catch (error) {
    state.importedEntries = [];
    state.diagnostics.push({ source: 'Saved imports', severity: 'error', issues: [error.message] });
  }
  const entries = [
    ...state.localEntries,
    ...state.importedEntries
  ];

  state.sessions = analyzeSessions(entries, {
    nowMs: Date.now(),
    appVersion: window.APP_VERSION || null,
    diagnostics: state.diagnostics
  });

  const sourceParts = [];
  if (state.localEntries.length) sourceParts.push(`${state.localEntries.length} local recordings`);
  if (state.importedEntries.length) sourceParts.push(`${state.importedEntries.length} imported JSON file${state.importedEntries.length === 1 ? '' : 's'}`);
  const sourceText = sourceParts.length
    ? `Loaded ${sourceParts.join(' and ')} from this browser.`
    : 'No study data is saved in this browser yet.';

  elements.report.innerHTML = renderAnalysisSections(state.sessions, {
    title: 'Study Data Analysis',
    sourceText, diagnostics: state.diagnostics
  });

  bindTimelineFilters(document);
  updateActionState();

  const sessionText = state.sessions.length === 1 ? '1 session loaded' : `${state.sessions.length} sessions loaded`;
  const problems = state.diagnostics.filter((item) => item.severity !== 'info');
  setStatus(`${sessionText}. ${sourceText}${problems.length ? ` ${problems.length} data warning(s): ${problems.map((item) => `${item.source}: ${item.issues.join(' ')}`).join(' ')}` : ''}`);
}

async function importFiles(files) {
  const currentEntries = getImportedEntries();
  for (const file of files) {
    const source = `Imported ${file.name}`;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      currentEntries.push(...buildStudyImportEntries(parsed, { fileName: file.name, source,
        importedAt: new Date().toISOString(), originalText: text }));
    } catch (error) {
      currentEntries.push({ fileName: file.name, source, raw: null,
        importError: error.message, originalText: text });
    }
  }
  // Preserve every raw import; shared analysis selects the newest valid session snapshot.
  saveImportedEntries(currentEntries);
  if (elements.fileInput) elements.fileInput.value = '';
  await render();
}

function attachEvents() {
  elements.refreshButton?.addEventListener('click', render);

  elements.clearButton?.addEventListener('click', () => {
    localStorage.removeItem(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY);
    setStatus('Cleared imported sessions. Local recordings were preserved.');
    render();
  });

  elements.fileInput?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      await importFiles(files);
    } catch (error) {
      console.error(error);
      setStatus(`Could not import study data: ${error.message}`);
    }
  });

  elements.summaryButton?.addEventListener('click', () => {
    const csv = buildCsv(SUMMARY_COLUMNS, buildSummaryRows(state.sessions));
    downloadText(`study-summary-${getDownloadStamp()}.csv`, csv, 'text/csv');
  });

  elements.interactionsButton?.addEventListener('click', () => {
    const csv = buildCsv(INTERACTION_COLUMNS, buildInteractionRows(state.sessions));
    downloadText(`study-interactions-${getDownloadStamp()}.csv`, csv, 'text/csv');
  });

  elements.reportButton?.addEventListener('click', () => {
    const html = buildReportHtml(state.sessions, {
      title: 'Study Data Analysis',
      diagnostics: state.diagnostics,
      sourceText: `Downloaded from the local browser analysis page with ${state.sessions.length} loaded session${state.sessions.length === 1 ? '' : 's'}.`
    });
    downloadText(`study-report-${getDownloadStamp()}.html`, html, 'text/html');
  });

  elements.tasksButton?.addEventListener('click', () => {
    downloadText(`study-tasks-${getDownloadStamp()}.csv`, buildCsv(TASK_COLUMNS, buildTaskRows(state.sessions)), 'text/csv');
  });

  elements.localJsonButton?.addEventListener('click', () => {
    downloadText(`study-archive-${getDownloadStamp()}.json`, `${JSON.stringify({
      format: 'spiral-study-archive', exportTime: new Date().toISOString(),
      sessions: state.sessions.map((session) => session.originalRaw),
      localRecordings: state.localEntries.map((entry) => entry.raw),
      imports: state.importedEntries
    }, null, 2)}\n`, 'application/json');
  });
}

installReportStyles();

if (elements.report) {
  attachEvents();
  render();
} else {
  document.body.insertAdjacentHTML('beforeend', `<p>${escapeHtml('Study analysis page failed to initialize.')}</p>`);
}
