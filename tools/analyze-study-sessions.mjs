#!/usr/bin/env node
// This script analyzes study session exports and generates summary CSV files and an HTML report.
// Usage: Place this script in the root of your project (where the study session JSON files are located) and run it with Node.js. It will create a 'study-analysis' folder with the results.
// node tools/analyze-study-sessions.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = path.join(ROOT_DIR, 'study-analysis');
const FILE_PATTERN = /^study-session-.*\.json$/i;
const PHASES = ['explore', 'task', 'debrief'];
const PHASE_COLORS = {
  explore: '#8ecae6',
  task: '#ffb703',
  debrief: '#90be6d'
};
const TYPE_COLORS = {
  session_started: '#2e7d32',
  session_stopped: '#455a64',
  session_recovered: '#ad1457',
  phase_changed: '#6a1b9a',
  panel_opened: '#1565c0',
  panel_closed: '#64b5f6',
  detail_view_opened: '#ef6c00',
  detail_view_switched: '#f57c00',
  detail_view_closed: '#ffb74d',
  events_changed: '#00897b',
  settings_changed: '#8e24aa',
  orientation_changed: '#546e7a'
};

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePhase(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PHASES.includes(normalized) ? normalized : 'explore';
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createPhaseMap(factory = () => 0) {
  const map = {};
  PHASES.forEach((phase) => {
    map[phase] = factory(phase);
  });
  return map;
}

function createMetricsSeed() {
  return {
    interactionCount: 0,
    detailViewOpenCount: 0,
    detailViewSwitchCount: 0,
    panelOpenCount: 0,
    orientationChangeCount: 0,
    createdEventCount: 0,
    updatedEventCount: 0,
    deletedEventCount: 0,
    phaseChangeCount: 0,
    settingsInteractionCount: 0,
    settingsFieldChangeCount: 0,
    changedSettings: {}
  };
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0s';
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSegment(segment) {
  if (!segment || typeof segment !== 'object') return null;

  const spiralDayIndex = Number.isFinite(Number(segment.spiralDayIndex))
    ? Number(segment.spiralDayIndex)
    : (Number.isFinite(Number(segment.day)) ? Number(segment.day) : null);
  const segmentIndex = Number.isFinite(Number(segment.segmentIndex))
    ? Number(segment.segmentIndex)
    : (Number.isFinite(Number(segment.segment)) ? Number(segment.segment) : null);
  const segmentId = Number.isFinite(Number(segment.segmentId)) ? Number(segment.segmentId) : null;

  return {
    spiralDayIndex,
    segmentIndex,
    segmentId,
    start: typeof segment.start === 'string' ? segment.start : '',
    end: typeof segment.end === 'string' ? segment.end : ''
  };
}

function getDurationMs(session) {
  const directDuration = toNumber(session.sessionDurationMs, NaN);
  if (Number.isFinite(directDuration) && directDuration >= 0) return directDuration;

  const start = Date.parse(session.startTime);
  const end = Date.parse(session.endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return end - start;
  }

  return 0;
}

function deriveMetrics(session) {
  const interactions = safeArray(session.interactions);
  const durationMs = getDurationMs(session);
  const metrics = {
    durationMs,
    durationText: formatDuration(durationMs),
    ...createMetricsSeed(),
    interactionCount: interactions.length,
    interactionsByPhase: createPhaseMap(() => 0),
    phaseDurationsMs: createPhaseMap(() => 0),
    phaseDurationsText: createPhaseMap(() => formatDuration(0)),
    perPhase: createPhaseMap(() => createMetricsSeed())
  };

  for (const interaction of interactions) {
    if (!interaction || typeof interaction !== 'object') continue;

    const phase = normalizePhase(interaction.phase || session.sessionPhase);
    metrics.interactionsByPhase[phase] += 1;
    metrics.perPhase[phase].interactionCount += 1;

    if (interaction.type === 'detail_view_opened') {
      metrics.detailViewOpenCount += 1;
      metrics.perPhase[phase].detailViewOpenCount += 1;
    } else if (interaction.type === 'detail_view_switched') {
      metrics.detailViewOpenCount += 1;
      metrics.detailViewSwitchCount += 1;
      metrics.perPhase[phase].detailViewOpenCount += 1;
      metrics.perPhase[phase].detailViewSwitchCount += 1;
    } else if (interaction.type === 'panel_opened') {
      metrics.panelOpenCount += 1;
      metrics.perPhase[phase].panelOpenCount += 1;
    } else if (interaction.type === 'orientation_changed') {
      metrics.orientationChangeCount += 1;
      metrics.perPhase[phase].orientationChangeCount += 1;
    } else if (interaction.type === 'phase_changed') {
      metrics.phaseChangeCount += 1;
      metrics.perPhase[phase].phaseChangeCount += 1;
    } else if (interaction.type === 'events_changed') {
      const payload = interaction.payload || {};
      const createdCount = safeArray(payload.created).length;
      const updatedCount = safeArray(payload.updated).length;
      const deletedCount = safeArray(payload.deleted).length;
      metrics.createdEventCount += createdCount;
      metrics.updatedEventCount += updatedCount;
      metrics.deletedEventCount += deletedCount;
      metrics.perPhase[phase].createdEventCount += createdCount;
      metrics.perPhase[phase].updatedEventCount += updatedCount;
      metrics.perPhase[phase].deletedEventCount += deletedCount;
    } else if (interaction.type === 'settings_changed') {
      const changes = interaction.payload && interaction.payload.changes ? interaction.payload.changes : {};
      const changedKeys = Object.keys(changes);
      metrics.settingsInteractionCount += 1;
      metrics.settingsFieldChangeCount += changedKeys.length;
      metrics.perPhase[phase].settingsInteractionCount += 1;
      metrics.perPhase[phase].settingsFieldChangeCount += changedKeys.length;
      changedKeys.forEach((key) => {
        metrics.changedSettings[key] = (metrics.changedSettings[key] || 0) + 1;
        metrics.perPhase[phase].changedSettings[key] = (metrics.perPhase[phase].changedSettings[key] || 0) + 1;
      });
    }
  }

  if (durationMs > 0) {
    let currentPhase = normalizePhase(interactions[0] && interactions[0].phase ? interactions[0].phase : session.sessionPhase);
    let segmentStartMs = 0;

    for (const interaction of interactions) {
      if (!interaction || interaction.type !== 'phase_changed') continue;

      const segmentEndMs = Math.max(0, toNumber(interaction.offsetMs, segmentStartMs));
      metrics.phaseDurationsMs[currentPhase] += Math.max(0, segmentEndMs - segmentStartMs);
      currentPhase = normalizePhase(
        interaction.payload && interaction.payload.toPhase ? interaction.payload.toPhase : interaction.phase
      );
      segmentStartMs = segmentEndMs;
    }

    metrics.phaseDurationsMs[currentPhase] += Math.max(0, durationMs - segmentStartMs);
  }

  PHASES.forEach((phase) => {
    metrics.phaseDurationsText[phase] = formatDuration(metrics.phaseDurationsMs[phase]);
  });

  return metrics;
}

function derivePhaseWindows(session, metrics) {
  const interactions = safeArray(session.interactions);
  const windows = [];
  const durationMs = metrics.durationMs;
  if (durationMs <= 0) return windows;

  let currentPhase = normalizePhase(interactions[0] && interactions[0].phase ? interactions[0].phase : session.sessionPhase);
  let segmentStartMs = 0;

  for (const interaction of interactions) {
    if (!interaction || interaction.type !== 'phase_changed') continue;
    const segmentEndMs = Math.max(0, Math.min(durationMs, toNumber(interaction.offsetMs, segmentStartMs)));
    windows.push({ phase: currentPhase, startMs: segmentStartMs, endMs: segmentEndMs });
    currentPhase = normalizePhase(
      interaction.payload && interaction.payload.toPhase ? interaction.payload.toPhase : interaction.phase
    );
    segmentStartMs = segmentEndMs;
  }

  windows.push({ phase: currentPhase, startMs: segmentStartMs, endMs: durationMs });
  return windows;
}

function deriveEventSourceCounts(interactions) {
  const counts = {};
  safeArray(interactions).forEach((interaction) => {
    if (!interaction || interaction.type !== 'events_changed') return;
    const source = interaction.payload && interaction.payload.source ? interaction.payload.source : 'unknown';
    counts[source] = (counts[source] || 0) + 1;
  });
  return counts;
}

function listSessionFiles(rootDir) {
  return fs.readdirSync(rootDir)
    .filter((fileName) => FILE_PATTERN.test(fileName))
    .sort((a, b) => a.localeCompare(b));
}

function loadSessions(rootDir) {
  const fileNames = listSessionFiles(rootDir);
  return fileNames.map((fileName) => {
    const absolutePath = path.join(rootDir, fileName);
    const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const metrics = deriveMetrics(raw);
    return {
      fileName,
      absolutePath,
      raw,
      metrics,
      phaseWindows: derivePhaseWindows(raw, metrics),
      eventSourceCounts: deriveEventSourceCounts(raw.interactions)
    };
  });
}

function writeCsv(filePath, columns, rows) {
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','))
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function buildSummaryRows(sessions) {
  return sessions.map((session) => {
    const { raw, metrics } = session;
    return {
      fileName: session.fileName,
      participantId: raw.participantId || '',
      sessionId: raw.sessionId || '',
      appVersion: raw.appVersion || '',
      finalPhase: normalizePhase(raw.sessionPhase),
      durationMs: metrics.durationMs,
      durationText: metrics.durationText,
      exploreMs: metrics.phaseDurationsMs.explore,
      taskMs: metrics.phaseDurationsMs.task,
      debriefMs: metrics.phaseDurationsMs.debrief,
      exploreText: metrics.phaseDurationsText.explore,
      taskText: metrics.phaseDurationsText.task,
      debriefText: metrics.phaseDurationsText.debrief,
      interactionCount: metrics.interactionCount,
      exploreInteractions: metrics.interactionsByPhase.explore,
      taskInteractions: metrics.interactionsByPhase.task,
      debriefInteractions: metrics.interactionsByPhase.debrief,
      createdEventCount: metrics.createdEventCount,
      updatedEventCount: metrics.updatedEventCount,
      deletedEventCount: metrics.deletedEventCount,
      settingsInteractionCount: metrics.settingsInteractionCount,
      settingsFieldChangeCount: metrics.settingsFieldChangeCount,
      panelOpenCount: metrics.panelOpenCount,
      detailViewOpenCount: metrics.detailViewOpenCount,
      phaseChangeCount: metrics.phaseChangeCount,
      changedSettingsJson: JSON.stringify(metrics.changedSettings),
      eventSourcesJson: JSON.stringify(session.eventSourceCounts),
      startTime: raw.startTime || '',
      endTime: raw.endTime || ''
    };
  });
}

function buildInteractionRows(sessions) {
  const rows = [];

  sessions.forEach((session) => {
    const interactions = safeArray(session.raw.interactions);
    interactions.forEach((interaction) => {
      const payload = interaction && interaction.payload ? interaction.payload : {};
      const segment = normalizeSegment(payload.segment);
      const fromSegment = normalizeSegment(payload.fromSegment);
      const toSegment = normalizeSegment(payload.toSegment);
      const changes = payload && payload.changes ? payload.changes : {};
      rows.push({
        fileName: session.fileName,
        participantId: session.raw.participantId || '',
        sessionId: session.raw.sessionId || '',
        appVersion: session.raw.appVersion || '',
        index: interaction.index,
        type: interaction.type || '',
        phase: normalizePhase(interaction.phase || session.raw.sessionPhase),
        timestamp: interaction.timestamp || '',
        offsetMs: toNumber(interaction.offsetMs, 0),
        source: payload.source || '',
        createdCount: safeArray(payload.created).length,
        updatedCount: safeArray(payload.updated).length,
        deletedCount: safeArray(payload.deleted).length,
        changedSettingKeys: Object.keys(changes).join('|'),
        fromPhase: payload.fromPhase || '',
        toPhase: payload.toPhase || '',
        segmentStart: segment ? segment.start : '',
        segmentEnd: segment ? segment.end : '',
        segmentSpiralDayIndex: segment && segment.spiralDayIndex !== null ? segment.spiralDayIndex : '',
        segmentIndex: segment && segment.segmentIndex !== null ? segment.segmentIndex : '',
        fromSegmentStart: fromSegment ? fromSegment.start : '',
        fromSegmentEnd: fromSegment ? fromSegment.end : '',
        toSegmentStart: toSegment ? toSegment.start : '',
        toSegmentEnd: toSegment ? toSegment.end : '',
        payloadJson: JSON.stringify(payload)
      });
    });
  });

  return rows;
}

function renderOverviewCards(sessions) {
  const totalDurationMs = sessions.reduce((sum, session) => sum + session.metrics.durationMs, 0);
  const totalInteractions = sessions.reduce((sum, session) => sum + session.metrics.interactionCount, 0);
  const totalCreates = sessions.reduce((sum, session) => sum + session.metrics.createdEventCount, 0);
  const totalUpdates = sessions.reduce((sum, session) => sum + session.metrics.updatedEventCount, 0);
  const totalDeletes = sessions.reduce((sum, session) => sum + session.metrics.deletedEventCount, 0);

  const cards = [
    { label: 'Sessions', value: sessions.length, subtext: 'Study exports found in repo root' },
    { label: 'Total Duration', value: formatDuration(totalDurationMs), subtext: 'Across all loaded sessions' },
    { label: 'Interactions', value: totalInteractions, subtext: 'All recorded interactions' },
    { label: 'Event Changes', value: `${totalCreates}/${totalUpdates}/${totalDeletes}`, subtext: 'Created / updated / deleted' }
  ];

  return cards.map((card) => `
    <div class="card">
      <div class="card-label">${escapeHtml(card.label)}</div>
      <div class="card-value">${escapeHtml(card.value)}</div>
      <div class="card-subtext">${escapeHtml(card.subtext)}</div>
    </div>
  `).join('');
}

function getSessionLabel(session) {
  return session.raw.participantId || session.fileName;
}

function formatTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getSortedInteractionTypes(sessions) {
  const typeCounts = {};
  sessions.forEach((session) => {
    safeArray(session.raw.interactions).forEach((interaction) => {
      const key = interaction.type || 'unknown';
      typeCounts[key] = (typeCounts[key] || 0) + 1;
    });
  });

  return Object.entries(typeCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([type]) => type);
}

function buildTopFindings(sessions) {
  const findings = [];
  const interactionsByPhase = createPhaseMap(() => 0);
  const settingTotals = {};
  const sourceTotals = {};

  sessions.forEach((session) => {
    PHASES.forEach((phase) => {
      interactionsByPhase[phase] += session.metrics.interactionsByPhase[phase];
    });

    Object.entries(session.metrics.changedSettings).forEach(([key, count]) => {
      settingTotals[key] = (settingTotals[key] || 0) + count;
    });

    Object.entries(session.eventSourceCounts).forEach(([key, count]) => {
      sourceTotals[key] = (sourceTotals[key] || 0) + count;
    });
  });

  const topPhaseEntry = Object.entries(interactionsByPhase).sort((a, b) => b[1] - a[1])[0];
  if (topPhaseEntry && topPhaseEntry[1] > 0) {
    findings.push({
      label: 'Most Active Phase',
      text: `${formatTitleCase(topPhaseEntry[0])} accounted for ${topPhaseEntry[1]} interactions across the loaded sessions.`
    });
  }

  const heaviestEventSession = sessions
    .map((session) => ({
      label: getSessionLabel(session),
      eventChanges: session.metrics.createdEventCount + session.metrics.updatedEventCount + session.metrics.deletedEventCount
    }))
    .sort((a, b) => b.eventChanges - a.eventChanges)[0];
  if (heaviestEventSession && heaviestEventSession.eventChanges > 0) {
    findings.push({
      label: 'Heaviest Event Editing',
      text: `${heaviestEventSession.label} logged ${heaviestEventSession.eventChanges} event changes in one session.`
    });
  }

  const longestExploreSession = sessions
    .map((session) => ({
      label: getSessionLabel(session),
      durationMs: session.metrics.phaseDurationsMs.explore
    }))
    .sort((a, b) => b.durationMs - a.durationMs)[0];
  if (longestExploreSession && longestExploreSession.durationMs > 0) {
    findings.push({
      label: 'Longest Explore',
      text: `${longestExploreSession.label} spent ${formatDuration(longestExploreSession.durationMs)} in explore before moving on.`
    });
  }

  const topSettingEntry = Object.entries(settingTotals).sort((a, b) => b[1] - a[1])[0];
  if (topSettingEntry && topSettingEntry[1] > 0) {
    findings.push({
      label: 'Most Changed Setting',
      text: `${topSettingEntry[0]} changed ${topSettingEntry[1]} time${topSettingEntry[1] === 1 ? '' : 's'} across the loaded sessions.`
    });
  }

  const topSourceEntry = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0];
  if (topSourceEntry && topSourceEntry[1] > 0) {
    findings.push({
      label: 'Primary Event Source',
      text: `${topSourceEntry[0]} produced ${topSourceEntry[1]} event-change interaction${topSourceEntry[1] === 1 ? '' : 's'}.`
    });
  }

  return findings.slice(0, 5);
}

function renderTopFindings(sessions) {
  const findings = buildTopFindings(sessions);
  if (findings.length === 0) {
    return '<p class="note">No findings available yet.</p>';
  }

  return `
    <div class="findings">
      ${findings.map((finding) => `
        <div class="finding-card">
          <div class="finding-label">${escapeHtml(finding.label)}</div>
          <div class="finding-text">${escapeHtml(finding.text)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSessionTable(sessions) {
  const rows = sessions.map((session) => {
    const { raw, metrics } = session;
    return `
      <tr>
        <td>${escapeHtml(raw.participantId || session.fileName)}</td>
        <td>${escapeHtml(metrics.durationText)}</td>
        <td>${escapeHtml(metrics.phaseDurationsText.explore)}</td>
        <td>${escapeHtml(metrics.phaseDurationsText.task)}</td>
        <td>${escapeHtml(metrics.phaseDurationsText.debrief)}</td>
        <td>${escapeHtml(metrics.interactionCount)}</td>
        <td>${escapeHtml(`${metrics.createdEventCount} / ${metrics.updatedEventCount} / ${metrics.deletedEventCount}`)}</td>
        <td>${escapeHtml(`${metrics.settingsInteractionCount} / ${metrics.settingsFieldChangeCount}`)}</td>
        <td>${escapeHtml(Object.keys(metrics.changedSettings).join(', ') || 'None')}</td>
      </tr>
    `;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Participant</th>
          <th>Duration</th>
          <th>Explore</th>
          <th>Task</th>
          <th>Debrief</th>
          <th>Interactions</th>
          <th>Events + / ~ / -</th>
          <th>Settings Int / Fields</th>
          <th>Changed Settings</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPhaseBars(sessions) {
  return sessions.map((session) => {
    const total = Math.max(1, session.metrics.durationMs);
    const segments = PHASES.map((phase) => {
      const width = (session.metrics.phaseDurationsMs[phase] / total) * 100;
      return `<span class="phase-segment" style="width:${width}%;background:${PHASE_COLORS[phase]};" title="${escapeHtml(`${phase}: ${session.metrics.phaseDurationsText[phase]}`)}"></span>`;
    }).join('');

    return `
      <div class="phase-row">
        <div class="phase-row-label">${escapeHtml(session.raw.participantId || session.fileName)}</div>
        <div class="phase-row-bar">${segments}</div>
        <div class="phase-row-text">${escapeHtml(`${session.metrics.phaseDurationsText.explore} / ${session.metrics.phaseDurationsText.task} / ${session.metrics.phaseDurationsText.debrief}`)}</div>
      </div>
    `;
  }).join('');
}

function renderTimelines(sessions) {
  return sessions.map((session) => {
    const total = Math.max(1, session.metrics.durationMs);
    const sessionLabel = getSessionLabel(session);
    const totalMarkers = safeArray(session.raw.interactions).length;
    const backgroundWindows = session.phaseWindows.map((window) => {
      const left = (window.startMs / total) * 100;
      const width = ((window.endMs - window.startMs) / total) * 100;
      return `<span class="timeline-window" style="left:${left}%;width:${width}%;background:${PHASE_COLORS[window.phase]};" title="${escapeHtml(`${window.phase}: ${formatDuration(window.endMs - window.startMs)}`)}"></span>`;
    }).join('');

    const markers = safeArray(session.raw.interactions).map((interaction) => {
      const left = Math.min(100, Math.max(0, (toNumber(interaction.offsetMs, 0) / total) * 100));
      const color = TYPE_COLORS[interaction.type] || '#607d8b';
      const title = [
        interaction.type,
        `phase: ${normalizePhase(interaction.phase || session.raw.sessionPhase)}`,
        `offset: ${formatDuration(toNumber(interaction.offsetMs, 0))}`
      ].join(' | ');
      return `<span class="timeline-marker" data-phase="${escapeHtml(normalizePhase(interaction.phase || session.raw.sessionPhase))}" data-type="${escapeHtml(interaction.type || 'unknown')}" style="left:${left}%;background:${color};" title="${escapeHtml(title)}"></span>`;
    }).join('');

    return `
      <div class="timeline-session" data-session-label="${escapeHtml(sessionLabel)}">
        <div class="timeline-header">
          <div class="timeline-title">${escapeHtml(sessionLabel)}</div>
          <div class="timeline-meta">
            <span>${escapeHtml(`${session.metrics.durationText} • ${session.metrics.interactionCount} interactions`)}</span>
            <span class="timeline-filter-count" data-total="${escapeHtml(totalMarkers)}">${escapeHtml(`${totalMarkers}/${totalMarkers} visible`)}</span>
          </div>
        </div>
        <div class="timeline-track">
          ${backgroundWindows}
          ${markers}
        </div>
      </div>
    `;
  }).join('');
}

function renderEventSourceTable(sessions) {
  const rows = sessions.map((session) => {
    const sources = Object.entries(session.eventSourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => `${source}: ${count}`)
      .join(', ');

    return `
      <tr>
        <td>${escapeHtml(session.raw.participantId || session.fileName)}</td>
        <td>${escapeHtml(sources || 'None')}</td>
      </tr>
    `;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Participant</th>
          <th>Event Change Sources</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTypeLegend(sessions) {
  const typeCounts = {};
  sessions.forEach((session) => {
    safeArray(session.raw.interactions).forEach((interaction) => {
      const key = interaction.type || 'unknown';
      typeCounts[key] = (typeCounts[key] || 0) + 1;
    });
  });

  return Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${TYPE_COLORS[type] || '#607d8b'};"></span>
        <span>${escapeHtml(`${type} (${count})`)}</span>
      </div>
    `).join('');
}

function renderTimelineFilters(sessions) {
  const interactionTypes = getSortedInteractionTypes(sessions);

  return `
    <div class="filters">
      <label class="filter-control">
        <span>Phase</span>
        <select id="phaseFilter">
          <option value="all">All phases</option>
          ${PHASES.map((phase) => `<option value="${escapeHtml(phase)}">${escapeHtml(formatTitleCase(phase))}</option>`).join('')}
        </select>
      </label>
      <label class="filter-control">
        <span>Interaction</span>
        <select id="typeFilter">
          <option value="all">All interaction types</option>
          ${interactionTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}
        </select>
      </label>
      <div class="filter-summary" id="filterSummary">Showing all interactions in the timeline view.</div>
    </div>
  `;
}

function buildReportHtml(sessions) {
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Study Session Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #667085;
      --border: #d7dce5;
      --shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(180deg, #eef4f8 0%, var(--bg) 100%);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }
    h1, h2 { margin: 0 0 14px; }
    p { margin: 0; color: var(--muted); }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      margin-top: 18px;
      box-shadow: var(--shadow);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .findings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      background: #fbfcfe;
    }
    .finding-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      background: linear-gradient(180deg, #fcfefe 0%, #f7fafc 100%);
    }
    .card-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .finding-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .card-value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .finding-text {
      font-size: 14px;
      line-height: 1.45;
    }
    .card-subtext {
      font-size: 13px;
      color: var(--muted);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 8px;
      border-top: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-top: none;
      padding-top: 0;
    }
    .phase-row {
      display: grid;
      grid-template-columns: 170px 1fr 190px;
      gap: 14px;
      align-items: center;
      margin-top: 12px;
    }
    .phase-row:first-child { margin-top: 0; }
    .phase-row-label, .phase-row-text, .timeline-title {
      font-weight: 600;
    }
    .phase-row-bar {
      display: flex;
      overflow: hidden;
      height: 18px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: #edf1f5;
    }
    .phase-segment { display: block; height: 100%; }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, auto));
      gap: 12px 16px;
      align-items: end;
      margin-bottom: 16px;
    }
    .filter-control {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
    }
    .filter-control select {
      min-width: 0;
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #fff;
      color: var(--text);
      font: inherit;
    }
    .filter-summary {
      font-size: 13px;
      color: var(--muted);
      align-self: center;
    }
    .timeline-session { margin-top: 16px; }
    .timeline-session:first-child { margin-top: 0; }
    .timeline-session.is-empty {
      opacity: 0.45;
    }
    .timeline-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .timeline-meta {
      font-size: 13px;
      color: var(--muted);
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    .timeline-filter-count {
      font-variant-numeric: tabular-nums;
    }
    .timeline-track {
      position: relative;
      height: 46px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: #eef2f7;
      overflow: hidden;
    }
    .timeline-window {
      position: absolute;
      top: 0;
      bottom: 0;
      opacity: 0.4;
    }
    .timeline-marker {
      position: absolute;
      top: 7px;
      width: 4px;
      height: 32px;
      margin-left: -2px;
      border-radius: 999px;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.6);
    }
    .timeline-marker.is-hidden {
      display: none;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-top: 14px;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 999px;
    }
    .note {
      margin-top: 10px;
      font-size: 13px;
      color: var(--muted);
    }
    .mono {
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
    }
    @media (max-width: 900px) {
      .phase-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Study Session Report</h1>
      <p>Generated ${escapeHtml(generatedAt)} from ${escapeHtml(sessions.length)} study export file(s) in ${escapeHtml(ROOT_DIR)}.</p>
    </section>

    <section>
      <h2>Overview</h2>
      <div class="cards">${renderOverviewCards(sessions)}</div>
    </section>

    <section>
      <h2>Top Findings</h2>
      ${renderTopFindings(sessions)}
    </section>

    <section>
      <h2>Session Summary</h2>
      ${renderSessionTable(sessions)}
    </section>

    <section>
      <h2>Phase Durations</h2>
      ${renderPhaseBars(sessions)}
      <div class="note">Bars are stacked left-to-right as explore, task, then debrief.</div>
    </section>

    <section>
      <h2>Interaction Timelines</h2>
      ${renderTimelineFilters(sessions)}
      ${renderTimelines(sessions)}
      <div class="note">Filters affect the timeline markers below without changing the exported CSV files.</div>
      <div class="legend">${renderTypeLegend(sessions)}</div>
    </section>

    <section>
      <h2>Event Sources</h2>
      ${renderEventSourceTable(sessions)}
      <div class="note">These counts help distinguish direct detail-view work from add-panel or list-based edits.</div>
    </section>
  </main>
  <script>
    (() => {
      const phaseFilter = document.getElementById('phaseFilter');
      const typeFilter = document.getElementById('typeFilter');
      const filterSummary = document.getElementById('filterSummary');
      const timelineSessions = Array.from(document.querySelectorAll('.timeline-session'));

      if (!phaseFilter || !typeFilter || !filterSummary || timelineSessions.length === 0) {
        return;
      }

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
            if (isVisible) {
              sessionVisibleMarkers += 1;
            }
          });

          visibleMarkers += sessionVisibleMarkers;
          if (sessionVisibleMarkers > 0) {
            visibleSessions += 1;
          }

          session.classList.toggle('is-empty', sessionVisibleMarkers === 0);
          const countLabel = session.querySelector('.timeline-filter-count');
          if (countLabel) {
            countLabel.textContent = sessionVisibleMarkers === markers.length
              ? selectedPhase === 'all' && selectedType === 'all'
                ? 'all visible'
                : sessionVisibleMarkers + '/' + markers.length + ' visible'
              : sessionVisibleMarkers + '/' + markers.length + ' visible';
          }
        });

        const phaseLabel = selectedPhase === 'all' ? 'all phases' : selectedPhase;
        const typeLabel = selectedType === 'all' ? 'all interaction types' : selectedType;
        filterSummary.textContent = 'Showing ' + visibleMarkers + ' of ' + totalMarkers + ' markers across ' + visibleSessions + ' session(s) for ' + phaseLabel + ' and ' + typeLabel + '.';
      };

      phaseFilter.addEventListener('change', updateTimelineFilters);
      typeFilter.addEventListener('change', updateTimelineFilters);
      updateTimelineFilters();
    })();
  </script>
</body>
</html>`;
}

function main() {
  const sessions = loadSessions(ROOT_DIR);
  if (sessions.length === 0) {
    console.error('No study-session-*.json files found in the repo root.');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const summaryColumns = [
    'fileName', 'participantId', 'sessionId', 'appVersion', 'finalPhase',
    'durationMs', 'durationText',
    'exploreMs', 'taskMs', 'debriefMs',
    'exploreText', 'taskText', 'debriefText',
    'interactionCount', 'exploreInteractions', 'taskInteractions', 'debriefInteractions',
    'createdEventCount', 'updatedEventCount', 'deletedEventCount',
    'settingsInteractionCount', 'settingsFieldChangeCount',
    'panelOpenCount', 'detailViewOpenCount', 'phaseChangeCount',
    'changedSettingsJson', 'eventSourcesJson',
    'startTime', 'endTime'
  ];
  const interactionColumns = [
    'fileName', 'participantId', 'sessionId', 'appVersion',
    'index', 'type', 'phase', 'timestamp', 'offsetMs', 'source',
    'createdCount', 'updatedCount', 'deletedCount',
    'changedSettingKeys', 'fromPhase', 'toPhase',
    'segmentStart', 'segmentEnd', 'segmentSpiralDayIndex', 'segmentIndex',
    'fromSegmentStart', 'fromSegmentEnd', 'toSegmentStart', 'toSegmentEnd',
    'payloadJson'
  ];

  writeCsv(path.join(OUTPUT_DIR, 'summary.csv'), summaryColumns, buildSummaryRows(sessions));
  writeCsv(path.join(OUTPUT_DIR, 'interactions.csv'), interactionColumns, buildInteractionRows(sessions));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.html'), buildReportHtml(sessions), 'utf8');

  console.log(`Wrote ${sessions.length} session(s) to ${OUTPUT_DIR}`);
  console.log(`- ${path.join(OUTPUT_DIR, 'summary.csv')}`);
  console.log(`- ${path.join(OUTPUT_DIR, 'interactions.csv')}`);
  console.log(`- ${path.join(OUTPUT_DIR, 'report.html')}`);
}

main();
