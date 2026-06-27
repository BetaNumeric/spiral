import {
  INTERACTION_COLUMNS,
  STUDY_ANALYSIS_CSS,
  STUDY_ANALYSIS_IMPORTS_STORAGE_KEY,
  STUDY_SESSION_STORAGE_KEY,
  SUMMARY_COLUMNS,
  analyzeSessions,
  buildCsv,
  buildInteractionRows,
  buildReportHtml,
  buildSummaryRows,
  escapeHtml,
  renderAnalysisSections
} from '../tools/study-analysis-core.mjs';

const state = {
  sessions: [],
  localEntry: null,
  importedEntries: []
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
  localJsonButton: document.getElementById('downloadLocalStudyJsonBtn')
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
  } catch (_) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalStudyEntry() {
  const raw = readJsonStorage(STUDY_SESSION_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.startTime) return null;

  const normalized = {
    ...raw,
    appVersion: raw.appVersion || window.APP_VERSION || null
  };
  const label = normalized.isRecording ? 'Current local recording' : 'Local saved study session';

  return {
    fileName: 'local-study-session.json',
    source: label,
    raw: normalized
  };
}

function getImportedEntries() {
  const entries = readJsonStorage(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY, []);
  return Array.isArray(entries)
    ? entries.filter((entry) => entry && entry.raw && typeof entry.raw === 'object')
    : [];
}

function saveImportedEntries(entries) {
  writeJsonStorage(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY, entries);
}

function getImportKey(raw, fileName) {
  return raw && raw.sessionId ? `session:${raw.sessionId}` : `file:${fileName}`;
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
  const hasLocal = !!state.localEntry;

  [
    elements.summaryButton,
    elements.interactionsButton,
    elements.reportButton
  ].forEach((button) => {
    if (button) button.disabled = !hasSessions;
  });

  if (elements.clearButton) elements.clearButton.disabled = !hasImported;
  if (elements.localJsonButton) elements.localJsonButton.disabled = !hasLocal;
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

function render() {
  state.localEntry = getLocalStudyEntry();
  state.importedEntries = getImportedEntries();
  const entries = [
    ...(state.localEntry ? [state.localEntry] : []),
    ...state.importedEntries
  ];

  state.sessions = analyzeSessions(entries, {
    nowMs: Date.now(),
    appVersion: window.APP_VERSION || null
  });

  const sourceParts = [];
  if (state.localEntry) sourceParts.push('local study draft');
  if (state.importedEntries.length) sourceParts.push(`${state.importedEntries.length} imported JSON file${state.importedEntries.length === 1 ? '' : 's'}`);
  const sourceText = sourceParts.length
    ? `Loaded ${sourceParts.join(' and ')} from this browser.`
    : 'No study data is saved in this browser yet.';

  elements.report.innerHTML = renderAnalysisSections(state.sessions, {
    title: 'Study Data Analysis',
    sourceText
  });

  bindTimelineFilters(document);
  updateActionState();

  const sessionText = state.sessions.length === 1 ? '1 session loaded' : `${state.sessions.length} sessions loaded`;
  setStatus(`${sessionText}. ${sourceText}`);
}

function expandParsedStudyData(parsed, fileName) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.sessions)) return parsed.sessions;
  if (parsed && parsed.raw && typeof parsed.raw === 'object') return [parsed.raw];
  return [parsed];
}

async function importFiles(files) {
  const currentEntries = getImportedEntries();
  let importedCount = 0;

  for (const file of files) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const sessions = expandParsedStudyData(parsed, file.name);

    sessions.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') return;
      const fileName = sessions.length > 1 ? `${file.name}#${index + 1}` : file.name;
      const importKey = getImportKey(raw, fileName);
      const existingIndex = currentEntries.findIndex((entry) =>
        entry.importKey === importKey
          || getImportKey(entry.raw || {}, entry.fileName || fileName) === importKey
      );
      const entry = {
        fileName,
        source: `Imported ${file.name}`,
        importKey,
        importedAt: new Date().toISOString(),
        raw
      };

      if (existingIndex >= 0) {
        currentEntries[existingIndex] = entry;
      } else {
        currentEntries.push(entry);
      }
      importedCount += 1;
    });
  }

  saveImportedEntries(currentEntries);
  if (elements.fileInput) elements.fileInput.value = '';
  setStatus(`Imported ${importedCount} session${importedCount === 1 ? '' : 's'}.`);
  render();
}

function attachEvents() {
  elements.refreshButton?.addEventListener('click', render);

  elements.clearButton?.addEventListener('click', () => {
    localStorage.removeItem(STUDY_ANALYSIS_IMPORTS_STORAGE_KEY);
    setStatus('Cleared imported sessions. Local study draft was left untouched.');
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
      sourceText: `Downloaded from the local browser analysis page with ${state.sessions.length} loaded session${state.sessions.length === 1 ? '' : 's'}.`
    });
    downloadText(`study-report-${getDownloadStamp()}.html`, html, 'text/html');
  });

  elements.localJsonButton?.addEventListener('click', () => {
    if (!state.localEntry) return;
    const participant = String(state.localEntry.raw.participantId || 'participant')
      .trim()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'participant';
    downloadText(
      `study-session-${participant}-${new Date().toISOString().slice(0, 10)}.json`,
      `${JSON.stringify(state.localEntry.raw, null, 2)}\n`,
      'application/json'
    );
  });
}

installReportStyles();

if (elements.report) {
  attachEvents();
  render();
} else {
  document.body.insertAdjacentHTML('beforeend', `<p>${escapeHtml('Study analysis page failed to initialize.')}</p>`);
}
