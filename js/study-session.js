const STUDY_SESSION_STORAGE_KEY = 'spiralCalendarStudySessionDraft';
const STUDY_SESSION_SCHEMA_VERSION = 3;
const STUDY_TRACKED_SETTINGS_KEYS = [
  'days',
  'radiusExponent',
  'rotation',
  'staticMode',
  'showHourNumbers',
  'showDayNumbers',
  'hourNumbersOutward',
  'hourNumbersInsideSegment',
  'hourNumbersUpright',
  'dayNumbersUpright',
  'showEverySixthHour',
  'hourNumbersStartAtOne',
  'hourNumbersPosition',
  'showNightOverlay',
  'useLocationTimezone',
  'nightOverlayLat',
  'nightOverlayLng',
  'showDayOverlay',
  'showGradientOverlay',
  'showTimeDisplay',
  'showSegmentEdges',
  'showArcLines',
  'overlayStackMode',
  'showEventBoundaryStrokes',
  'showAllEventBoundaryStrokes',
  'audioFeedbackEnabled',
  'darkMode',
  'colorMode',
  'saturationLevel',
  'baseHue',
  'singleColor',
  'showMonthLines',
  'showMidnightLines',
  'showNoonLines',
  'showSixAmPmLines',
  'enableLongPressJoystick',
  'detailViewAutoZoomEnabled',
  'detailViewAutoZoomCoils',
  'detailViewCloseButtonEnabled',
  'detailViewCloseButtonAlignToSegment'
];

Object.assign(SpiralCalendar.prototype, {
  createEmptyStudySession() {
    return {
      schemaVersion: STUDY_SESSION_SCHEMA_VERSION,
      sessionId: null,
      isRecording: false,
      participantName: '',
      startTime: null,
      endTime: null,
      recovered: false,
      recoveryCount: 0,
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
      device: null,
      initialSettings: null,
      initialUiState: null,
      lastSettingsSnapshot: null,
      lastEventSnapshot: null,
      interactions: [],
      lastDownloadedAt: null
    };
  },

  ensureStudySessionState() {
    if (!this.studySession || typeof this.studySession !== 'object') {
      this.studySession = this.createEmptyStudySession();
    }
    if (!Array.isArray(this.studySession.interactions)) {
      this.studySession.interactions = [];
    }
    return this.studySession;
  },

  cloneStudyValue(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  },

  ensureStudyRuntimeState() {
    if (!this._studyRuntimeState || typeof this._studyRuntimeState !== 'object') {
      this._studyRuntimeState = {
        activeDetailSegment: null,
        activeDetailSegmentKey: null
      };
    }
    return this._studyRuntimeState;
  },

  getLastStudyInteraction() {
    const session = this.ensureStudySessionState();
    return session.interactions.length > 0
      ? session.interactions[session.interactions.length - 1]
      : null;
  },

  hashStudyText(value) {
    const text = String(value || '');
    if (!text) return null;

    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  },

  getCurrentStudyEventSource() {
    return Array.isArray(this._studyEventSourceStack) && this._studyEventSourceStack.length > 0
      ? this._studyEventSourceStack[this._studyEventSourceStack.length - 1]
      : null;
  },

  runWithStudyEventSource(source, callback) {
    if (typeof callback !== 'function') return undefined;
    if (!source) return callback();

    if (!Array.isArray(this._studyEventSourceStack)) {
      this._studyEventSourceStack = [];
    }

    this._studyEventSourceStack.push(source);
    try {
      return callback();
    } finally {
      this._studyEventSourceStack.pop();
    }
  },

  getStudyViewportSnapshot() {
    const viewport = (typeof this.getViewportDimensions === 'function')
      ? this.getViewportDimensions()
      : {
          width: Math.max(0, Math.round(window.innerWidth || 0)),
          height: Math.max(0, Math.round(window.innerHeight || 0))
        };

    return {
      width: viewport.width,
      height: viewport.height,
      pixelRatio: window.devicePixelRatio || 1,
      isLandscape: viewport.width > viewport.height
    };
  },

  getStudyDeviceSnapshot() {
    const viewport = this.getStudyViewportSnapshot();
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform || '',
      language: navigator.language || '',
      isMobile: isMobileDevice(),
      viewport
    };
  },

  captureStudyUiStateSnapshot() {
    const eventInputPanel = document.getElementById('eventInputPanel');
    const settingsPanel = document.getElementById('settingsPanel');
    const bottomEventList = document.getElementById('bottomEventList');
    const selectedSegment = this.mouseState && this.mouseState.selectedSegment
      ? this.getStudySegmentDescriptor(this.mouseState.selectedSegment)
      : null;

    return {
      eventPanelOpen: !!(eventInputPanel && eventInputPanel.style.display === 'block'),
      settingsPanelOpen: !!(settingsPanel && settingsPanel.style.display === 'block'),
      detailViewOpen: this.state.detailViewDay !== null,
      selectedSegment,
      circleMode: !!this.state.circleMode,
      timeDisplayVisible: !!this.state.showTimeDisplay,
      timeDisplayCollapsed: !!(this.timeDisplayState && this.timeDisplayState.collapsed),
      bottomEventListVisible: !!(bottomEventList && bottomEventList.style.maxHeight && bottomEventList.style.maxHeight !== '0px')
    };
  },

  captureStudySettingsSnapshot(settingsOverride = null) {
    const base = settingsOverride || {};
    const snapshot = {};

    STUDY_TRACKED_SETTINGS_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        snapshot[key] = this.cloneStudyValue(base[key]);
      } else if (Object.prototype.hasOwnProperty.call(this.state, key)) {
        snapshot[key] = this.cloneStudyValue(this.state[key]);
      }
    });

    snapshot.circleMode = !!this.state.circleMode;
    return snapshot;
  },

  getStudyEventPersistentId(event) {
    if (!event || typeof event !== 'object') return null;
    if (event.persistentUID) return event.persistentUID;

    const normalizedEvent = {
      ...event,
      start: event.start instanceof Date ? event.start : new Date(event.start),
      end: event.end instanceof Date ? event.end : new Date(event.end)
    };

    if (typeof generateEventUID === 'function') {
      return generateEventUID(normalizedEvent);
    }

    return `${normalizedEvent.title || 'event'}-${normalizedEvent.start.getTime()}-${normalizedEvent.end.getTime()}`;
  },

  describeEventForStudy(event) {
    if (!event) return null;

    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date ? event.end : new Date(event.end);
    const title = event.title || 'Untitled Event';
    const description = event.description || '';

    return {
      id: this.getStudyEventPersistentId(event),
      title,
      titleLength: title.length,
      descriptionLength: description.length,
      descriptionHash: this.hashStudyText(description),
      start: start.toISOString(),
      end: end.toISOString(),
      color: event.color || null,
      calendar: event.calendar || 'Home',
      addedToCalendar: !!event.addedToCalendar
    };
  },

  captureStudyEventSnapshot() {
    const snapshot = {};
    for (const event of (this.events || [])) {
      const descriptor = this.describeEventForStudy(event);
      if (!descriptor || !descriptor.id) continue;
      snapshot[descriptor.id] = descriptor;
    }
    return snapshot;
  },

  inferStudyEventSource() {
    const explicitSource = this.getCurrentStudyEventSource();
    if (explicitSource) return explicitSource;

    if (this.state.detailViewDay !== null) {
      return 'detail_view';
    }

    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel && settingsPanel.style.display === 'block') {
      return 'settings_panel';
    }

    const eventInputPanel = document.getElementById('eventInputPanel');
    if (eventInputPanel && eventInputPanel.style.display === 'block') {
      return 'event_panel';
    }

    return 'unknown';
  },

  getStudySegmentKey(segmentOrDescriptor) {
    if (!segmentOrDescriptor) return null;
    const descriptor = Object.prototype.hasOwnProperty.call(segmentOrDescriptor, 'start') &&
      Object.prototype.hasOwnProperty.call(segmentOrDescriptor, 'end')
      ? segmentOrDescriptor
      : this.getStudySegmentDescriptor(segmentOrDescriptor);

    return descriptor
      ? `${descriptor.start}|${descriptor.end}`
      : null;
  },

  setStudyActiveDetailSegment(segmentOrDescriptor) {
    const runtime = this.ensureStudyRuntimeState();
    const descriptor = Object.prototype.hasOwnProperty.call(segmentOrDescriptor || {}, 'start') &&
      Object.prototype.hasOwnProperty.call(segmentOrDescriptor || {}, 'end')
      ? segmentOrDescriptor
      : this.getStudySegmentDescriptor(segmentOrDescriptor);

    runtime.activeDetailSegment = descriptor
      ? this.cloneStudyValue(descriptor)
      : null;
    runtime.activeDetailSegmentKey = this.getStudySegmentKey(descriptor);
  },

  diffStudySnapshotMaps(previousSnapshot, nextSnapshot) {
    const previous = previousSnapshot || {};
    const next = nextSnapshot || {};
    const created = [];
    const deleted = [];
    const updated = [];

    for (const [id, nextEntry] of Object.entries(next)) {
      const previousEntry = previous[id];
      if (!previousEntry) {
        created.push(nextEntry);
        continue;
      }

      const changedFields = {};
      for (const key of Object.keys(nextEntry)) {
        if (JSON.stringify(previousEntry[key]) !== JSON.stringify(nextEntry[key])) {
          changedFields[key] = {
            from: this.cloneStudyValue(previousEntry[key]),
            to: this.cloneStudyValue(nextEntry[key])
          };
        }
      }

      if (Object.keys(changedFields).length > 0) {
        updated.push({
          id,
          title: nextEntry.title,
          changedFields
        });
      }
    }

    for (const [id, previousEntry] of Object.entries(previous)) {
      if (!Object.prototype.hasOwnProperty.call(next, id)) {
        deleted.push(previousEntry);
      }
    }

    return { created, updated, deleted };
  },

  formatStudyDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return '0s';
    const totalSeconds = Math.round(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  },

  buildStudyInteraction(type, payload = {}) {
    const session = this.ensureStudySessionState();
    const timestamp = new Date().toISOString();
    return {
      index: session.interactions.length,
      type,
      timestamp,
      offsetMs: session.startTime ? Math.max(0, new Date(timestamp) - new Date(session.startTime)) : null,
      payload: this.cloneStudyValue(payload)
    };
  },

  appendStudyInteraction(type, payload = {}, allowWhenStopped = false) {
    if (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) return false;

    const session = this.ensureStudySessionState();
    if (!session.isRecording && !allowWhenStopped) return false;

    session.interactions.push(this.buildStudyInteraction(type, payload));
    this.saveStudySessionDraft();
    this.syncStudySessionUI();
    return true;
  },

  recordStudyEvent(type, payload = {}) {
    return this.appendStudyInteraction(type, payload, false);
  },

  saveStudySessionDraft() {
    if (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) return;

    try {
      const session = this.ensureStudySessionState();
      localStorage.setItem(STUDY_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn('Failed to save study session draft:', error);
    }
  },

  loadStudySessionDraft() {
    if (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) return null;

    try {
      const stored = localStorage.getItem(STUDY_SESSION_STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return null;

      return {
        ...this.createEmptyStudySession(),
        ...parsed,
        interactions: Array.isArray(parsed.interactions) ? parsed.interactions : []
      };
    } catch (error) {
      console.warn('Failed to load study session draft:', error);
      return null;
    }
  },

  restoreStudySessionDraft() {
    const restored = this.loadStudySessionDraft();
    this.studySession = restored || this.createEmptyStudySession();
    this.setStudyActiveDetailSegment(
      this.state.detailViewDay !== null && this.mouseState && this.mouseState.selectedSegment
        ? this.mouseState.selectedSegment
        : null
    );

    if (!restored) {
      return false;
    }

    if (!this.studySession.lastSettingsSnapshot) {
      this.studySession.lastSettingsSnapshot = this.captureStudySettingsSnapshot();
    }
    if (!this.studySession.lastEventSnapshot) {
      this.studySession.lastEventSnapshot = this.captureStudyEventSnapshot();
    }
    if (!this.studySession.initialUiState) {
      this.studySession.initialUiState = this.captureStudyUiStateSnapshot();
    }

    if (this.studySession.isRecording) {
      this.studySession.recovered = true;
      this.studySession.recoveryCount = (this.studySession.recoveryCount || 0) + 1;
      this.appendStudyInteraction('session_recovered', {
        viewport: this.getStudyViewportSnapshot()
      }, true);
    }

    return true;
  },

  summarizeStudySession(session = this.ensureStudySessionState()) {
    const summary = {
      interactionCount: Array.isArray(session.interactions) ? session.interactions.length : 0,
      detailViewOpenCount: 0,
      detailViewSwitchCount: 0,
      panelOpenCount: 0,
      orientationChangeCount: 0,
      createdEventCount: 0,
      updatedEventCount: 0,
      deletedEventCount: 0,
      settingsChangeCount: 0,
      changedSettings: {}
    };

    for (const interaction of session.interactions || []) {
      if (!interaction || typeof interaction !== 'object') continue;
      if (interaction.type === 'detail_view_opened') {
        summary.detailViewOpenCount += 1;
      } else if (interaction.type === 'detail_view_switched') {
        summary.detailViewOpenCount += 1;
        summary.detailViewSwitchCount += 1;
      } else if (interaction.type === 'panel_opened') {
        summary.panelOpenCount += 1;
      } else if (interaction.type === 'orientation_changed') {
        summary.orientationChangeCount += 1;
      } else if (interaction.type === 'events_changed') {
        const payload = interaction.payload || {};
        summary.createdEventCount += Array.isArray(payload.created) ? payload.created.length : 0;
        summary.updatedEventCount += Array.isArray(payload.updated) ? payload.updated.length : 0;
        summary.deletedEventCount += Array.isArray(payload.deleted) ? payload.deleted.length : 0;
      } else if (interaction.type === 'settings_changed') {
        const changes = interaction.payload && interaction.payload.changes ? interaction.payload.changes : {};
        const changedKeys = Object.keys(changes);
        summary.settingsChangeCount += changedKeys.length;
        changedKeys.forEach((key) => {
          summary.changedSettings[key] = (summary.changedSettings[key] || 0) + 1;
        });
      }
    }

    return summary;
  },

  buildStudyExportData() {
    const session = this.ensureStudySessionState();
    const durationMs = session.startTime
      ? ((session.endTime ? new Date(session.endTime) : new Date()) - new Date(session.startTime))
      : null;

    return {
      schemaVersion: STUDY_SESSION_SCHEMA_VERSION,
      exportTime: new Date().toISOString(),
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
      sessionId: session.sessionId,
      participantName: session.participantName,
      startTime: session.startTime,
      endTime: session.endTime,
      sessionDurationMs: durationMs,
      sessionDurationText: this.formatStudyDuration(durationMs),
      recovered: !!session.recovered,
      recoveryCount: session.recoveryCount || 0,
      device: session.device || this.getStudyDeviceSnapshot(),
      initialSettings: session.initialSettings,
      initialUiState: session.initialUiState,
      finalSettings: this.captureStudySettingsSnapshot(),
      finalUiState: this.captureStudyUiStateSnapshot(),
      summary: this.summarizeStudySession(session),
      interactions: this.cloneStudyValue(session.interactions || [])
    };
  },

  sanitizeStudyFilePart(value) {
    return String(value || 'participant')
      .trim()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'participant';
  },

  syncStudySessionUI() {
    const studySection = document.getElementById('studySessionSection');
    if (!studySection) return;

    if (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) {
      studySection.style.display = 'none';
      return;
    }

    const session = this.ensureStudySessionState();
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const downloadBtn = document.getElementById('downloadDataBtn');
    const participantNameInput = document.getElementById('participantName');
    const statusDiv = document.getElementById('recordingStatus');

    studySection.style.display = 'block';

    if (participantNameInput) {
      if (!participantNameInput.value && session.participantName) {
        participantNameInput.value = session.participantName;
      }
      participantNameInput.disabled = !!session.isRecording;
    }

    if (startBtn) startBtn.style.display = session.isRecording ? 'none' : 'block';
    if (stopBtn) stopBtn.style.display = session.isRecording ? 'block' : 'none';
    if (downloadBtn) {
      const hasSessionData = !!session.startTime;
      downloadBtn.style.display = hasSessionData && !session.isRecording ? 'block' : 'none';
    }

    if (statusDiv) {
      if (session.isRecording) {
        const count = Array.isArray(session.interactions) ? session.interactions.length : 0;
        const recoveredText = session.recovered ? ' (recovered)' : '';
        statusDiv.textContent = `Recording session for ${session.participantName}${recoveredText} • ${count} entries`;
        statusDiv.style.color = '#4CAF50';
      } else if (session.startTime) {
        const durationMs = session.endTime
          ? new Date(session.endTime) - new Date(session.startTime)
          : 0;
        const count = Array.isArray(session.interactions) ? session.interactions.length : 0;
        statusDiv.textContent = `Session ready to download • ${this.formatStudyDuration(durationMs)} • ${count} entries`;
        statusDiv.style.color = '#2196F3';
      } else {
        statusDiv.textContent = 'Record a lightweight interaction log for play testing.';
        statusDiv.style.color = '#666';
      }
    }
  },

  toggleStudySessionSection() {
    const content = document.getElementById('studySessionContent');
    const icon = document.getElementById('studyToggleIcon');
    if (!content || !icon) return;

    const isOpen = content.style.display === 'flex';
    content.style.display = isOpen ? 'none' : 'flex';
    icon.textContent = isOpen ? '▼' : '▲';
  },

  setupStudySessionControls() {
    const studySection = document.getElementById('studySessionSection');
    if (!studySection) return;

    if (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) {
      studySection.style.display = 'none';
      return;
    }

    if (this._studySessionControlsBound) {
      this.syncStudySessionUI();
      return;
    }

    this.restoreStudySessionDraft();

    const toggle = document.getElementById('studySessionToggle');
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const downloadBtn = document.getElementById('downloadDataBtn');
    const participantNameInput = document.getElementById('participantName');

    if (toggle) {
      toggle.addEventListener('click', () => this.toggleStudySessionSection());
    }

    if (startBtn && participantNameInput) {
      startBtn.addEventListener('click', () => {
        const name = participantNameInput.value.trim();
        if (!name) {
          alert('Please enter a participant name before starting recording.');
          return;
        }
        this.startStudySession(name);
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.stopStudySession();
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadStudyData();
      });
    }

    this._studySessionControlsBound = true;
    this.syncStudySessionUI();
  },

  startStudySession(participantName) {
    const now = new Date().toISOString();
    this.studySession = this.createEmptyStudySession();
    this.studySession.sessionId = `study-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.studySession.isRecording = true;
    this.studySession.participantName = participantName;
    this.studySession.startTime = now;
    this.studySession.endTime = null;
    this.studySession.recovered = false;
    this.studySession.recoveryCount = 0;
    this.studySession.device = this.getStudyDeviceSnapshot();
    this.studySession.initialSettings = this.captureStudySettingsSnapshot();
    this.studySession.initialUiState = this.captureStudyUiStateSnapshot();
    this.studySession.lastSettingsSnapshot = this.captureStudySettingsSnapshot();
    this.studySession.lastEventSnapshot = this.captureStudyEventSnapshot();
    this.studySession.interactions = [];
    this.setStudyActiveDetailSegment(
      this.studySession.initialUiState.detailViewOpen
        ? this.studySession.initialUiState.selectedSegment
        : null
    );

    this.recordStudyEvent('session_started', {
      viewport: this.getStudyViewportSnapshot(),
      visibleEventCount: Array.isArray(this.events) ? this.events.length : 0,
      uiState: this.cloneStudyValue(this.studySession.initialUiState)
    });
    this.syncStudySessionUI();
  },

  stopStudySession() {
    const session = this.ensureStudySessionState();
    if (!session.isRecording) return;

    session.endTime = new Date().toISOString();
    this.recordStudyEvent('session_stopped', {
      viewport: this.getStudyViewportSnapshot(),
      visibleEventCount: Array.isArray(this.events) ? this.events.length : 0,
      uiState: this.captureStudyUiStateSnapshot()
    });
    session.isRecording = false;
    session.lastSettingsSnapshot = this.captureStudySettingsSnapshot();
    session.lastEventSnapshot = this.captureStudyEventSnapshot();
    this.saveStudySessionDraft();
    this.syncStudySessionUI();
  },

  downloadStudyData() {
    const session = this.ensureStudySessionState();
    if (!session.participantName || !session.startTime) {
      alert('No study session data to download.');
      return;
    }

    const exportData = this.buildStudyExportData();
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `study-session-${this.sanitizeStudyFilePart(session.participantName)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    session.lastDownloadedAt = new Date().toISOString();
    this.saveStudySessionDraft();
    this.syncStudySessionUI();
  },

  recordStudyEventSnapshotDiff() {
    const session = this.ensureStudySessionState();
    if (!session.isRecording) return;

    const nextSnapshot = this.captureStudyEventSnapshot();
    const previousSnapshot = session.lastEventSnapshot || {};
    const diff = this.diffStudySnapshotMaps(previousSnapshot, nextSnapshot);
    const source = this.inferStudyEventSource();

    if (diff.created.length || diff.updated.length || diff.deleted.length) {
      this.recordStudyEvent('events_changed', {
        source,
        created: diff.created,
        updated: diff.updated,
        deleted: diff.deleted,
        totalEventCount: Object.keys(nextSnapshot).length
      });
    }

    session.lastEventSnapshot = nextSnapshot;
    this.saveStudySessionDraft();
  },

  recordStudySettingsSnapshotDiff(settingsToSave) {
    const session = this.ensureStudySessionState();
    if (!session.isRecording) return;

    const nextSnapshot = this.captureStudySettingsSnapshot(settingsToSave);
    const previousSnapshot = session.lastSettingsSnapshot || {};
    const changes = {};
    const source = this.inferStudyEventSource();

    Object.keys(nextSnapshot).forEach((key) => {
      if (JSON.stringify(previousSnapshot[key]) !== JSON.stringify(nextSnapshot[key])) {
        changes[key] = {
          from: this.cloneStudyValue(previousSnapshot[key]),
          to: this.cloneStudyValue(nextSnapshot[key])
        };
      }
    });

    if (Object.keys(changes).length > 0) {
      this.recordStudyEvent('settings_changed', { source, changes });
    }

    session.lastSettingsSnapshot = nextSnapshot;
    this.saveStudySessionDraft();
  },

  getStudySegmentDescriptor(segment) {
    if (!segment) return null;

    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
    const start = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      day: segment.day,
      segment: segment.segment,
      start: start.toISOString(),
      end: end.toISOString()
    };
  },

  recordStudyDetailViewOpened(segment) {
    const nextSegment = this.getStudySegmentDescriptor(segment);
    const nextKey = this.getStudySegmentKey(nextSegment);
    if (!nextSegment || !nextKey) return false;

    const runtime = this.ensureStudyRuntimeState();
    const activeKey = runtime.activeDetailSegmentKey;
    const selectedEventIndex = this.mouseState ? this.mouseState.selectedEventIndex : 0;
    const lastInteraction = this.getLastStudyInteraction();
    const lastSegment = lastInteraction && lastInteraction.payload
      ? (lastInteraction.payload.toSegment || lastInteraction.payload.segment || null)
      : null;
    const lastKey = this.getStudySegmentKey(lastSegment);
    const lastTimestampMs = lastInteraction ? Date.parse(lastInteraction.timestamp) : NaN;
    const isImmediateDuplicate = !!(
      lastInteraction &&
      (lastInteraction.type === 'detail_view_opened' || lastInteraction.type === 'detail_view_switched') &&
      lastKey === nextKey &&
      Number.isFinite(lastTimestampMs) &&
      Date.now() - lastTimestampMs < 750
    );

    if (activeKey === nextKey || isImmediateDuplicate) {
      this.setStudyActiveDetailSegment(nextSegment);
      return false;
    }

    if (activeKey && runtime.activeDetailSegment) {
      this.recordStudyEvent('detail_view_switched', {
        fromSegment: runtime.activeDetailSegment,
        toSegment: nextSegment,
        selectedEventIndex
      });
    } else {
      this.recordStudyEvent('detail_view_opened', {
        segment: nextSegment,
        selectedEventIndex
      });
    }

    this.setStudyActiveDetailSegment(nextSegment);
    return true;
  },

  recordStudyDetailViewClosed(payload = {}) {
    const runtime = this.ensureStudyRuntimeState();
    const segment = payload.segment ||
      runtime.activeDetailSegment ||
      (this.mouseState && this.mouseState.selectedSegment
        ? this.getStudySegmentDescriptor(this.mouseState.selectedSegment)
        : null);

    if (!segment && this.state.detailViewDay === null) {
      return false;
    }

    this.recordStudyEvent('detail_view_closed', {
      ...payload,
      segment
    });
    this.setStudyActiveDetailSegment(null);
    return true;
  },

  recordStudyPanelOpened(panelName) {
    this.recordStudyEvent('panel_opened', { panel: panelName });
  },

  recordStudyPanelClosed(panelName) {
    this.recordStudyEvent('panel_closed', { panel: panelName });
  },

  recordStudyOrientationChange(isLandscape) {
    this.recordStudyEvent('orientation_changed', {
      isLandscape: !!isLandscape,
      viewport: this.getStudyViewportSnapshot(),
      timeDisplayVisible: !!this.state.showTimeDisplay
    });
  }
});
