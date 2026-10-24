const STUDY_SESSION_STORAGE_KEY = 'spiralCalendarStudySessionDraft';
const STUDY_SESSION_SCHEMA_VERSION = 6;
const STUDY_SESSION_PHASES = ['explore', 'task', 'debrief'];
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
  'paletteAffectsCustomColors',
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
  normalizeStudySessionPhase(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return STUDY_SESSION_PHASES.includes(normalized) ? normalized : 'explore';
  },

  formatStudySessionPhase(phase) {
    const normalized = this.normalizeStudySessionPhase(phase);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  },

  cloneStudyValue(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
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

  sanitizeStudyFilePart(value) {
    return String(value || 'participant')
      .trim()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'participant';
  },

  createEmptyStudySession() {
    return { schemaVersion: STUDY_SESSION_SCHEMA_VERSION, sessionId: null, participantId: '',
      studyId: '', protocolVersion: '1', condition: '', fixtureId: '', questionnaireRef: '',
      sessionPhase: 'explore', isRecording: false, isPaused: false, pauseReason: null,
      startTime: null, endTime: null, snapshotTime: null, elapsedMs: 0, revision: 0,
      recovered: false, recoveryCount: 0, appVersion: typeof APP_VERSION === 'undefined' ? null : APP_VERSION,
      device: null, initialSettings: null, initialUiState: null, initialEvents: null,
      lastSettingsSnapshot: null, lastEventSnapshot: null, interactions: [], tasks: [], pauses: [], notes: [],
      contentPolicy: { includeDescriptionText: false }, lastDownloadedAt: null };
  },

  ensureStudySessionState() {
    if (!this.studySession) this.studySession = this.createEmptyStudySession();
    return this.studySession;
  },

  ensureStudyRuntimeState() {
    return this._studyRuntimeState || (this._studyRuntimeState = { activeDetailSegment: null,
      activeDetailSegmentKey: null, lastSelectionKey: null, navigation: new Map(), inputMethod: 'unknown' });
  },

  getStudyStorage() {
    if (!this.studyStorage) this.studyStorage = new SpiralStudyStorage({ onStatus: status => {
      this._studyStorageStatus = status;
      if (status.status === 'error' || status.status === 'blocked') this._studyMessage = status.message;
      if (['blocked','error'].includes(status.status) && this.studySession?.isRecording && !this.studySession.isPaused
        && this.studyStorage && !this.studyStorage.writer) {
        this._studyRecoveredSnapshot = this.cloneStudyValue(this.studySession);
        this.studySession.pauses.push({ startOffsetMs: this.getStudyElapsedMs(), endOffsetMs: null, reason: 'ownership_lost' });
        this.studySession.isPaused = true;
        this.studySession.pauseReason = 'recovery';
        this._studyMessage = this._studyDirty
          ? 'Recorder paused after losing ownership. Export a backup, then retry saving before resuming. If saving conflicts, keep the backup and reload.'
          : 'Recorder paused after losing ownership. Resume or stop to recover the saved recording.';
      }
      this.syncStudySessionUI();
    } });
    return this.studyStorage;
  },

  studyNow() { return typeof performance === 'undefined' ? Date.now() : performance.now(); },

  getStudyElapsedMs() {
    const session = this.ensureStudySessionState();
    return Math.max(session.elapsedMs || 0, this._studyClock && session.isRecording
      ? this._studyClock.base + Math.max(0, this.studyNow() - this._studyClock.start) : 0);
  },

  getStudyPausedMs(from = 0, to = this.getStudyElapsedMs()) {
    return (this.ensureStudySessionState().pauses || []).reduce((sum, pause) => sum +
      Math.max(0, Math.min(to, pause.endOffsetMs ?? to) - Math.max(from, pause.startOffsetMs)), 0);
  },

  captureStudySettingsSnapshot() {
    const keys = new Set([...(this.getSettingsStorageKeys?.() || []), ...STUDY_TRACKED_SETTINGS_KEYS,
      'spiralScale', 'circleMode', 'locationTimezoneId', 'visibleCalendars', 'animateEventColors']);
    return Object.fromEntries([...keys].filter(key => this.state[key] !== undefined)
      .map(key => [key, this.cloneStudyValue(this.state[key])]));
  },

  captureStudyViewContext() {
    const wall = date => date instanceof Date && Number.isFinite(date.getTime())
      ? SpiralTime.formatWall(date) : null;
    return { timeZone: this.getCalendarTimeZone(), referenceWallTime: wall(this.referenceTime),
      visibleStartWall: wall(this.visibleWindowStart?.()), visibleEndWall: wall(this.visibleWindowEnd?.()),
      displayInstant: this.getDisplayInstant?.()?.toISOString() || null,
      rotation: this.state.rotation, spiralScale: this.getCurrentRenderedSpiralScale?.() ?? this.state.spiralScale,
      days: this.state.days, radiusExponent: this.state.radiusExponent, circleMode: !!this.state.circleMode,
      visibleCalendars: this.cloneStudyValue(this.state.visibleCalendars || []),
      autoTimeAlign: !!this.autoTimeAlignState?.enabled,
      selectedEventId: typeof this.getDetailViewEventState === 'function'
        ? this.getDetailViewEventState()?.detailEvent?.persistentUID || null
        : this.ensureStudyRuntimeState().selectedEventId || null,
      selectedSegment: this.mouseState?.selectedSegment ? this.getStudySegmentDescriptor(this.mouseState.selectedSegment) : null };
  },

  captureStudyUiStateSnapshot() {
    const open = id => document.getElementById(id)?.style.display === 'block';
    return { ...this.captureStudyViewContext(), eventPanelOpen: open('eventInputPanel'),
      settingsPanelOpen: open('settingsPanel'), detailViewOpen: this.state.detailViewDay !== null,
      timeDisplayCollapsed: !!this.timeDisplayState?.collapsed };
  },

  getStudyEventPersistentId(event) { return event?.persistentUID || null; },

  describeEventForStudy(event) {
    if (!event) return null;
    const description = event.description || '';
    return { id: this.getStudyEventPersistentId(event), title: event.title || 'Untitled Event',
      descriptionLength: description.length, descriptionHash: this.hashStudyText(description),
      ...(this.studySession?.contentPolicy?.includeDescriptionText ? { description } : {}),
      start: this.getEventInstant(event, 'start').toISOString(), end: this.getEventInstant(event, 'end').toISOString(),
      timeModel: 'instant-v1', allDay: event.allDay === true, startDate: event.startDate || null, endDate: event.endDate || null,
      colorIsCustom: event.colorIsCustom === true, color: event.colorIsCustom ? event.color : null,
      colorSeed: event.colorSeed ?? null, calendar: event.calendar || 'Home', addedToCalendar: !!event.addedToCalendar };
  },

  captureStudyEventSnapshot() {
    return Object.fromEntries((this.events || []).map(event => this.describeEventForStudy(event)).filter(event => event?.id)
      .map(event => [event.id, event]));
  },

  inferStudyEventSource() {
    return this.getCurrentStudyEventSource() || (this.state.detailViewDay !== null ? 'detail_view' : 'calendar');
  },

  currentStudyTask() { return this.ensureStudySessionState().tasks?.find(task => task.endOffsetMs == null) || null; },

  recordStudyAction(type, payload = {}, options = {}) {
    const session = this.ensureStudySessionState();
    if ((typeof STUDY_MODE !== 'undefined' && !STUDY_MODE) || !this.getStudyStorage().writer || !session.isRecording
      || (session.isPaused && !options.allowWhenPaused)) return false;
    const task = this.currentStudyTask();
    const remote = options.actor === 'facilitator' ? this._studyRemoteCommand : null;
    session.interactions.push({ index: session.interactions.length, type, phase: session.sessionPhase,
      timestamp: new Date().toISOString(), offsetMs: this.getStudyElapsedMs(),
      actor: options.actor || 'participant', inputMethod: options.inputMethod || (remote ? 'remote' : this.ensureStudyRuntimeState().inputMethod),
      source: options.source || (remote ? 'study_remote' : this.inferStudyEventSource()), taskId: task?.taskId || null, attemptId: task?.attemptId || null,
      payload: this.cloneStudyValue(remote ? { ...payload, remoteCommandId: remote.id } : payload) });
    this.saveStudySessionDraft();
    this.syncStudySessionUI();
    return true;
  },

  recordStudyEvent(type, payload = {}) { return this.recordStudyAction(type, payload); },

  appendStudyInteraction(type, payload = {}, allowWhenStopped = false) {
    return this.recordStudyAction(type, payload, { actor: 'system', allowWhenPaused: allowWhenStopped });
  },

  saveStudySessionDraft() {
    const session = this.ensureStudySessionState();
    if (!session.sessionId || !this.getStudyStorage().writer) return;
    session.revision++;
    this._studyDirty = true;
    if (this._studySaveTimer) return;
    this._studySaveTimer = setTimeout(() => { this._studySaveTimer = null; void this.flushStudySession(); }, 100);
  },

  async flushStudySession() {
    if (this._studySaveTimer) clearTimeout(this._studySaveTimer);
    this._studySaveTimer = null;
    if (this._studyFlushPromise) return this._studyFlushPromise;
    if (!this._studyDirty) return true;
    this._studyFlushPromise = (async () => {
      while (this._studyDirty) {
        const session = this.ensureStudySessionState();
        if (!this.getStudyStorage().writer) return false;
        session.elapsedMs = this.getStudyElapsedMs();
        session.snapshotTime = new Date().toISOString();
        session.sessionDurationMs = session.elapsedMs;
        session.activeDurationMs = Math.max(0, session.elapsedMs - this.getStudyPausedMs());
        const revision = session.revision;
        const saved = await this.getStudyStorage().save(session);
        if (!saved) { this.syncStudySessionUI(); return false; }
        if (this.studySession === session && session.revision === revision) this._studyDirty = false;
      }
      this.syncStudySessionUI();
      return true;
    })().finally(() => { this._studyFlushPromise = null; });
    return this._studyFlushPromise;
  },

  hasUnsavedStudyChanges() { return !!this._studyDirty; },

  async retryStudySave() {
    if (this._studyBusy) return false;
    this._studyBusy = true; this.syncStudySessionUI();
    try {
      if (!await this.acquireStudyWriter() || !await this.flushStudySession()) return false;
      if (!this.studySession?.isRecording) {
        this._studyArchive = await this.getStudyStorage().listSessions();
        this._studyMessage = 'Session saved.';
      } else this._studyMessage = '';
      return true;
    } finally {
      if (!this.studySession?.isRecording && !this._studyDirty) await this.getStudyStorage().releaseWriter();
      this._studyBusy = false; this.syncStudySessionUI();
    }
  },

  async restoreStudySessionDraft() {
    const storage = this.getStudyStorage();
    if (!await storage.initialize()) return false;
    this._studyArchive = await storage.listSessions();
    this._studyFixture = await storage.getFixture();
    const restored = await storage.getActiveSession();
    this.studySession = restored || this.createEmptyStudySession();
    if (restored) {
      this.studySession = { ...this.createEmptyStudySession(), ...restored,
        isPaused: true, pauseReason: 'recovery', recovered: true };
      this._studyRecoveredSnapshot = this.cloneStudyValue(this.studySession);
      this._studyMessage = 'Recording recovered. Resume or stop it before starting another participant.';
    }
    this.syncStudySessionUI();
    return !!restored;
  },

  async acquireStudyWriter() {
    const storage = this.getStudyStorage();
    if (!await storage.initialize() || !await storage.acquireWriter()) {
      this._studyMessage = storage.error?.message || 'Another tab is recording. Use that tab or close it first.';
      this.syncStudySessionUI();
      return false;
    }
    return true;
  },

  adoptStudyRecovery() {
    if (!this._studyRecoveredSnapshot) return;
    const session = this.ensureStudySessionState();
    const startMs = Date.parse(session.startTime);
    const previousSnapshot = Date.parse(session.snapshotTime || session.interactions.at(-1)?.timestamp || session.startTime);
    const oldElapsed = session.interactions.reduce((elapsed, row) => Math.max(elapsed,
      Number.isFinite(row.offsetMs) ? row.offsetMs : Math.max(0, (Date.parse(row.timestamp) || startMs) - startMs)),
      Math.max(session.elapsedMs || 0, session.schemaVersion < 6 ? Math.max(0, previousSnapshot - startMs) : 0));
    const gapMs = Number.isFinite(previousSnapshot) ? Math.max(0, Date.now() - previousSnapshot) : 0;
    const elapsed = oldElapsed + gapMs;
    const openPause = session.pauses.find(pause => pause.endOffsetMs == null);
    if (!openPause) session.pauses.push({ startOffsetMs: oldElapsed, endOffsetMs: null, reason: 'recovery' });
    session.elapsedMs = elapsed;
    this._studyClock = { base: elapsed, start: this.studyNow() };
    session.recoveryCount = (session.recoveryCount || 0) + 1;
    session.schemaVersion = STUDY_SESSION_SCHEMA_VERSION;
    this._studyRecoveredSnapshot = null;
    this.recordStudyAction('session_recovered', { gapMs, previousAppVersion: session.appVersion,
      appVersion: typeof APP_VERSION === 'undefined' ? null : APP_VERSION }, { actor: 'system', allowWhenPaused: true });
    session.lastSettingsSnapshot = this.captureStudySettingsSnapshot();
    session.lastEventSnapshot = this.captureStudyEventSnapshot();
  },

  async refreshStudyRecovery() {
    if (!this._studyRecoveredSnapshot) return true;
    const expectedSessionId = this._studyRecoveredSnapshot.sessionId;
    if (this._studyDirty) throw new Error('Export or save the unsaved recording before recovering another snapshot.');
    const latest = await this.getStudyStorage().getActiveSession();
    if (!latest) {
      this.studySession = this.createEmptyStudySession();
      this._studyRecoveredSnapshot = null;
      this._studyArchive = await this.getStudyStorage().listSessions();
      await this.getStudyStorage().releaseWriter();
      this._studyMessage = 'The recording was already archived in another tab.';
      this.syncStudySessionUI();
      return false;
    }
    this.studySession = { ...this.createEmptyStudySession(), ...latest,
      isPaused: true, pauseReason: 'recovery', recovered: true };
    this._studyRecoveredSnapshot = this.cloneStudyValue(this.studySession);
    if (latest.sessionId !== expectedSessionId) {
      await this.getStudyStorage().releaseWriter();
      this._studyMessage = 'A different participant is now recording. Review the recovered participant before resuming or stopping.';
      this.syncStudySessionUI();
      return false;
    }
    return true;
  },

  async startStudySession(participantId, sessionPhase = 'explore', metadata = {}) {
    if (this._studyBusy || this.ensureStudySessionState().isRecording) return false;
    if (!String(participantId || '').trim()) { this._studyMessage = 'Enter a participant ID.'; this.syncStudySessionUI(); return false; }
    this._studyBusy = true; this.syncStudySessionUI();
    try {
      if (!await this.acquireStudyWriter()) return false;
      if (this._studyDirty && !await this.flushStudySession()) return false;
      const active = await this.getStudyStorage().getActiveSession();
      if (active) { await this.restoreStudySessionDraft(); this._studyMessage = 'Finish the recovered recording first.'; return false; }
      this.finishActiveDetailTextEditor?.({ redraw: false });
      this.studySession = { ...this.createEmptyStudySession(), ...metadata,
        schemaVersion: STUDY_SESSION_SCHEMA_VERSION, sessionId: `study-${crypto.randomUUID()}`,
        participantId: String(participantId).trim(), sessionPhase: this.normalizeStudySessionPhase(sessionPhase),
        startTime: new Date().toISOString(), isRecording: true, isPaused: false };
      const session = this.studySession;
      this._studyClock = { base: 0, start: this.studyNow() };
      this._studyRuntimeState = null;
      session.device = this.getStudyDeviceSnapshot();
      session.initialSettings = this.captureStudySettingsSnapshot();
      session.initialUiState = this.captureStudyUiStateSnapshot();
      session.initialEvents = this.captureStudyEventSnapshot();
      session.lastSettingsSnapshot = this.cloneStudyValue(session.initialSettings);
      session.lastEventSnapshot = this.cloneStudyValue(session.initialEvents);
      this._studyMessage = '';
      this.recordStudyAction('session_started', { viewport: session.device.viewport,
        eventCount: this.events.length, uiState: session.initialUiState }, { actor: 'facilitator' });
      const saved = await this.flushStudySession();
      if (!saved) this._studyMessage = 'Recording is in memory but could not be saved. Retry saving or export it.';
      return saved;
    } catch (error) { this._studyMessage = error.message; return false; }
    finally {
      if (!this.studySession?.isRecording && !this._studyDirty) await this.getStudyStorage().releaseWriter();
      this._studyBusy = false; this.syncStudySessionUI();
    }
  },

  flushStudyObservations() {
    this.captureStudySettingsChange();
    this.recordStudyEventSnapshotDiff();
    for (const source of [...this.ensureStudyRuntimeState().navigation.keys()]) this.endStudyNavigation(source);
  },

  pauseStudySession(reason = 'facilitator') {
    const session = this.ensureStudySessionState();
    if (!session.isRecording || session.isPaused || !this.getStudyStorage().writer) return false;
    this.finishActiveDetailTextEditor?.({ redraw: false });
    this.flushStudyObservations();
    session.pauses.push({ startOffsetMs: this.getStudyElapsedMs(), endOffsetMs: null, reason });
    session.isPaused = true; session.pauseReason = reason;
    this.recordStudyAction('session_paused', { reason }, { actor: reason === 'facilitator' ? 'facilitator' : 'system', allowWhenPaused: true });
    void this.flushStudySession();
    return true;
  },

  async resumeStudySession(reason = 'facilitator') {
    if (this._studyBusy || !this.studySession?.isRecording || !this.studySession.isPaused) return false;
    this._studyBusy = true; this.syncStudySessionUI();
    try {
      if (!await this.acquireStudyWriter() || !await this.refreshStudyRecovery()) return false;
      const session = this.ensureStudySessionState();
      this.adoptStudyRecovery();
      const pause = session.pauses.find(row => row.endOffsetMs == null);
      if (pause) pause.endOffsetMs = this.getStudyElapsedMs();
      session.isPaused = false; session.pauseReason = null;
      session.lastSettingsSnapshot = this.captureStudySettingsSnapshot();
      session.lastEventSnapshot = this.captureStudyEventSnapshot();
      this._studyMessage = '';
      this.recordStudyAction('session_resumed', { reason }, { actor: reason === 'facilitator' ? 'facilitator' : 'system' });
      return await this.flushStudySession();
    } finally { this._studyBusy = false; this.syncStudySessionUI(); }
  },

  async stopStudySession({ finishTask = false } = {}) {
    if (!this.studySession?.isRecording || this._studyBusy) return false;
    this._studyBusy = true; this.syncStudySessionUI();
    try {
      if (!await this.acquireStudyWriter()) return false;
      if (!await this.refreshStudyRecovery()) return false;
      const session = this.ensureStudySessionState();
      this.adoptStudyRecovery();
      this.finishActiveDetailTextEditor?.({ redraw: false });
      this.flushStudyObservations();
      if (this.currentStudyTask()) {
        if (finishTask) this.finishCurrentStudyTask();
        else this.endStudyTask('abandoned', { notes: 'Session stopped before this attempt was completed.' });
      }
      this.recordStudyAction('session_stopped', { uiState: this.captureStudyUiStateSnapshot() }, { actor: 'facilitator', allowWhenPaused: true });
      session.elapsedMs = this.getStudyElapsedMs();
      const pause = session.pauses.find(row => row.endOffsetMs == null);
      if (pause) pause.endOffsetMs = session.elapsedMs;
      session.endTime = new Date().toISOString();
      session.isRecording = false; session.isPaused = false;
      session.finalSettings = this.captureStudySettingsSnapshot();
      session.finalUiState = this.captureStudyUiStateSnapshot();
      session.finalEvents = this.captureStudyEventSnapshot();
      this._studyClock = null;
      this.saveStudySessionDraft();
      const saved = await this.flushStudySession();
      if (saved) {
        this._studyArchive = await this.getStudyStorage().listSessions();
        await this.getStudyStorage().releaseWriter();
        this._studyMessage = 'Session saved.';
      }
      return saved;
    } catch (error) { this._studyMessage = error.message; return false; }
    finally {
      if (!this.studySession?.isRecording && !this._studyDirty) await this.getStudyStorage().releaseWriter();
      this._studyBusy = false; this.syncStudySessionUI();
    }
  },

  updateStudySessionPhase(nextPhase) {
    const session = this.ensureStudySessionState();
    const phase = this.normalizeStudySessionPhase(nextPhase);
    if (!session.isRecording) { session.sessionPhase = phase; return false; }
    if (session.sessionPhase === phase || !this.getStudyStorage().writer) return false;
    this.finishActiveDetailTextEditor?.({ redraw: false });
    this.flushStudyObservations();
    if (this.currentStudyTask() && phase !== 'task') this.endStudyTask('abandoned', { notes: 'Phase changed before completion.' });
    const fromPhase = session.sessionPhase;
    session.sessionPhase = phase;
    return this.recordStudyAction('phase_changed', { fromPhase, toPhase: phase }, { actor: 'facilitator', allowWhenPaused: true });
  },

  startStudyTask(definition) {
    const session = this.ensureStudySessionState();
    if (!session.isRecording || session.isPaused || this.currentStudyTask() || !definition?.taskId?.trim()
      || !this.getStudyStorage().writer) return false;
    this.finishActiveDetailTextEditor?.({ redraw: false });
    this.flushStudyObservations();
    this.updateStudySessionPhase('task');
    const taskId = definition.taskId.trim();
    const task = { attemptId: `attempt-${crypto.randomUUID()}`, taskId, taskVersion: definition.taskVersion || '1',
      label: definition.label || taskId, targetEventIds: definition.targetEventIds || [], expectedState: definition.expectedState || '',
      attemptNumber: session.tasks.filter(row => row.taskId === taskId).length + 1,
      startOffsetMs: this.getStudyElapsedMs(), endOffsetMs: null, outcome: null,
      assisted: false, helpCount: 0, answer: '', notes: '', viewBefore: this.captureStudyViewContext() };
    session.tasks.push(task);
    this.recordStudyAction('task_started', { taskId, attemptId: task.attemptId, taskVersion: task.taskVersion,
      targetEventIds: task.targetEventIds, view: task.viewBefore }, { actor: 'facilitator' });
    return task;
  },

  endStudyTask(outcome = 'success', values = {}) {
    const session = this.ensureStudySessionState();
    const task = this.currentStudyTask();
    if (!task || !this.getStudyStorage().writer || !['unrated','success','partial','failure','skipped','abandoned'].includes(outcome)) return false;
    this.finishActiveDetailTextEditor?.({ redraw: false });
    this.flushStudyObservations();
    const end = this.getStudyElapsedMs();
    Object.assign(task, { answer: String(values.answer ?? task.answer), notes: String(values.notes ?? task.notes),
      outcome, viewAfter: this.captureStudyViewContext(),
      taskDurationMs: Math.max(0, end - task.startOffsetMs - this.getStudyPausedMs(task.startOffsetMs, end)) });
    // Keep the attempt associated with its completion record before closing it.
    this.recordStudyAction('task_completed', { attemptId: task.attemptId, taskId: task.taskId, outcome,
      assisted: task.assisted, answer: task.answer, notes: task.notes, taskDurationMs: task.taskDurationMs },
      { actor: 'facilitator', allowWhenPaused: true });
    task.endOffsetMs = end;
    this.saveStudySessionDraft();
    this.syncStudySessionUI();
    return task;
  },

  recordStudyAssistance(note = '') {
    const task = this.currentStudyTask();
    if (!task || !this.getStudyStorage().writer) return false;
    task.assisted = true; task.helpCount++;
    return this.recordStudyAction('task_assistance', { taskId: task.taskId, attemptId: task.attemptId, note },
      { actor: 'facilitator', allowWhenPaused: true });
  },

  addStudyNote(text) {
    if (!text?.trim()) return false;
    const session = this.ensureStudySessionState();
    if (!session.isRecording || !this.getStudyStorage().writer) return false;
    session.notes.push({ text: text.trim(), offsetMs: this.getStudyElapsedMs(), attemptId: this.currentStudyTask()?.attemptId || null });
    return this.recordStudyAction('facilitator_note', { text: text.trim() }, { actor: 'facilitator', allowWhenPaused: true });
  },

  recordStudyEventSnapshotDiff() {
    const session = this.ensureStudySessionState();
    if (!session.isRecording || session.isPaused || !this.getStudyStorage().writer) return;
    const next = this.captureStudyEventSnapshot();
    const diff = this.diffStudySnapshotMaps(session.lastEventSnapshot || {}, next);
    session.lastEventSnapshot = next;
    if (diff.created.length || diff.updated.length || diff.deleted.length) {
      this.recordStudyAction('events_changed', { ...diff, source: this.inferStudyEventSource(), totalEventCount: this.events.length });
    }
  },

  captureStudySettingsChange() {
    const session = this.ensureStudySessionState();
    if (!session.isRecording || session.isPaused || !this.getStudyStorage().writer) return;
    const next = this.captureStudySettingsSnapshot();
    const previous = session.lastSettingsSnapshot || {};
    session.lastSettingsSnapshot = next;
    const changes = {};
    for (const key of Object.keys(next)) {
      // Movement is described by navigation actions, not setting-edit counts.
      if (['rotation', 'spiralScale'].includes(key)) continue;
      if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) changes[key] = { from: previous[key], to: next[key] };
    }
    if (Object.keys(changes).length) this.recordStudyAction('settings_changed', { source: this.inferStudyEventSource(), changes });
  },

  recordStudySettingsSnapshotDiff() { this.captureStudySettingsChange(); },

  beginStudyNavigation(source, inputMethod) {
    if (!this.studySession?.isRecording || this.studySession.isPaused || !this.getStudyStorage().writer) return;
    const navigation = this.ensureStudyRuntimeState().navigation;
    if (!navigation.has(source)) navigation.set(source, { before: this.captureStudyViewContext(),
      startOffsetMs: this.getStudyElapsedMs(), inputMethod: inputMethod || this.ensureStudyRuntimeState().inputMethod });
  },

  endStudyNavigation(source, inputMethod) {
    const navigation = this.ensureStudyRuntimeState().navigation;
    const start = navigation.get(source);
    if (!start) return;
    navigation.delete(source);
    const after = this.captureStudyViewContext();
    const fields = ['rotation','spiralScale','days','radiusExponent','circleMode'];
    if (!fields.some(key => Math.abs((after[key] ?? 0) - (start.before[key] ?? 0)) > 0.000001)) return;
    this.recordStudyAction('navigation_completed', { before: start.before, after,
      durationMs: Math.max(0, this.getStudyElapsedMs() - start.startOffsetMs) }, { source, inputMethod: inputMethod || start.inputMethod });
  },

  recordStudySelection(source, inputMethod) {
    if (!this.studySession?.isRecording || this.studySession.isPaused || !this.getStudyStorage().writer) return;
    const detail = this.getDetailViewEventState?.();
    const event = detail?.detailEvent;
    if (!event) return;
    const runtime = this.ensureStudyRuntimeState();
    const segment = this.getStudySegmentDescriptor(this.mouseState?.selectedSegment);
    const key = `${event.persistentUID}|${segment?.start}|${segment?.offsetMs}`;
    if (runtime.lastSelectionKey === key) return;
    runtime.lastSelectionKey = key; runtime.selectedEventId = event.persistentUID;
    this.recordStudyAction('event_selected', { eventId: event.persistentUID, isDraft: !!event.isDraft, segment }, { source, inputMethod });
  },

  recordStudyValidationFailure(source, error, event) {
    return this.recordStudyAction('validation_failed', { eventId: event?.persistentUID || null,
      message: String(error?.message || error || 'Invalid value') }, { source });
  },

  recordStudyDraftDiscard(event, source = 'detail_view') {
    if (event?.isDraft) this.recordStudyAction('draft_discarded', { eventId: event.persistentUID || null,
      hasTitle: !!event.title, hasDescription: !!event.description }, { source });
  },

  getStudySegmentDescriptor(segment) {
    if (!segment || !Number.isFinite(Number(segment.day)) || !Number.isFinite(Number(segment.segment))) return null;
    const segmentId = this.getSegmentId(segment.day, segment.segment);
    const wall = this.getSegmentDate(segmentId);
    const zone = this.getCalendarTimeZone();
    const repeated = SpiralEventProjection.repeatedHour(wall.getTime(), zone);
    const part = repeated?.parts.find(row => row.offsetMs === segment.clockOffsetMs) || repeated?.parts[0];
    const start = part ? new Date(part.startInstantMs) : SpiralTime.possibleInstants(wall, zone)[0];
    const end = part ? new Date(part.endInstantMs) : start && SpiralTime.wallToInstant(new Date(wall.getTime() + SpiralTime.HOUR), zone,
      { notBefore: start.getTime() + 1 });
    return { spiralDayIndex: Number(segment.day), segmentIndex: Number(segment.segment), segmentId,
      timeZone: zone, wallStart: SpiralTime.formatWall(wall), wallEnd: SpiralTime.formatWall(new Date(wall.getTime() + SpiralTime.HOUR)),
      start: start?.toISOString() || null, end: end?.toISOString() || null,
      offsetMs: part?.offsetMs ?? (start ? wall.getTime() - start.getTime() : null), occurrence: part?.occurrence ?? null,
      gap: !start };
  },

  getStudySegmentKey(segment) { return segment ? `${segment.start}|${segment.end}|${segment.offsetMs}` : null; },

  setStudyActiveDetailSegment(segment) {
    const runtime = this.ensureStudyRuntimeState();
    const descriptor = segment && 'start' in segment ? segment : this.getStudySegmentDescriptor(segment);
    runtime.activeDetailSegment = descriptor;
    runtime.activeDetailSegmentKey = this.getStudySegmentKey(descriptor);
  },

  recordStudyDetailViewOpened(segment) {
    const descriptor = this.getStudySegmentDescriptor(segment);
    const runtime = this.ensureStudyRuntimeState();
    if (!descriptor || this.getStudySegmentKey(descriptor) === runtime.activeDetailSegmentKey) return false;
    const previous = runtime.activeDetailSegment;
    this.setStudyActiveDetailSegment(descriptor);
    return this.recordStudyAction(previous ? 'detail_view_switched' : 'detail_view_opened',
      previous ? { fromSegment: previous, toSegment: descriptor } : { segment: descriptor });
  },

  recordStudyDetailViewClosed(payload = {}) {
    const runtime = this.ensureStudyRuntimeState();
    const segment = payload.segment || runtime.activeDetailSegment;
    this.setStudyActiveDetailSegment(null);
    runtime.lastSelectionKey = null; runtime.selectedEventId = null;
    if (!segment) return false;
    return this.recordStudyAction('detail_view_closed', { ...payload, segment });
  },

  recordStudyPanelOpened(panel) { this.recordStudyAction('panel_opened', { panel }); },
  recordStudyPanelClosed(panel) { this.recordStudyAction('panel_closed', { panel }); },
  recordStudyOrientationChange(isLandscape) {
    this.recordStudyAction('orientation_changed', { isLandscape, viewport: this.getStudyViewportSnapshot() }, { actor: 'system' });
  },

  buildStudyExportData() {
    const session = this.ensureStudySessionState();
    const elapsed = this.getStudyElapsedMs();
    const data = this.cloneStudyValue({ ...session, snapshotTime: new Date().toISOString(), exportTime: new Date().toISOString(),
      currentAppVersion: typeof APP_VERSION === 'undefined' ? null : APP_VERSION,
      sessionDurationMs: elapsed, activeDurationMs: Math.max(0, elapsed - this.getStudyPausedMs()),
      finalSettings: session.isRecording ? this.captureStudySettingsSnapshot() : session.finalSettings,
      finalEvents: session.isRecording ? this.captureStudyEventSnapshot() : session.finalEvents,
      finalUiState: session.isRecording ? this.captureStudyUiStateSnapshot() : session.finalUiState });
    delete data.lastSettingsSnapshot; delete data.lastEventSnapshot;
    return data;
  },

  downloadStudyJson(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  downloadStudyData() {
    const session = this.ensureStudySessionState();
    if (!session.startTime) return;
    this.flushStudyObservations();
    this.downloadStudyJson(this.buildStudyExportData(), `study-session-${this.sanitizeStudyFilePart(session.participantId)}-${session.sessionId}.json`);
  },

  async downloadStudyArchive() {
    this.flushStudyObservations();
    const storage = this.getStudyStorage();
    let saved = false;
    if (storage.writer) { this.saveStudySessionDraft(); saved = await this.flushStudySession(); }
    const sessions = await storage.listSessions();
    const current = this.ensureStudySessionState();
    const recoverySnapshots = [];
    if (current.sessionId) {
      const index = sessions.findIndex(session => session.sessionId === current.sessionId);
      if (saved && storage.writer && !this._studyRecoveredSnapshot) {
        const snapshot = this.buildStudyExportData();
        snapshot.revision = Math.max(snapshot.revision, sessions[index]?.revision || 0);
        if (index >= 0) sessions[index] = snapshot;
        else sessions.push(snapshot);
      } else if (this._studyDirty || index < 0) recoverySnapshots.push(this.buildStudyExportData());
    }
    this.downloadStudyJson({ schemaVersion: 6, exportTime: new Date().toISOString(), sessions, recoverySnapshots },
      `study-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  },

  async saveStudyFixture(fixtureId) {
    if (this._studyBusy || this.studySession?.isRecording || this._studyDirty || !fixtureId?.trim()) return false;
    this._studyBusy = true; this.syncStudySessionUI();
    try {
      if (!await this.acquireStudyWriter()) return false;
      const fixture = { fixtureId: fixtureId.trim(), savedAt: new Date().toISOString(),
        appVersion: typeof APP_VERSION === 'undefined' ? null : APP_VERSION,
        settings: this.captureStudySettingsSnapshot(), referenceTime: this.referenceTime.toISOString(),
        events: this.events.map(event => this.serializeEventTime(event)), viewContext: this.captureStudyViewContext() };
      const saved = await this.getStudyStorage().saveFixture(fixture);
      if (saved) { this._studyFixture = fixture; this._studyMessage = 'Test setup saved.'; }
      return saved;
    } finally { await this.getStudyStorage().releaseWriter(); this._studyBusy = false; this.syncStudySessionUI(); }
  },

  async resetStudyFixture() {
    if (this._studyBusy || this.studySession?.isRecording || this._studyDirty) return false;
    this._studyBusy = true; this.syncStudySessionUI();
    const previous = { events: this.events, state: this.cloneStudyValue(this.state), referenceTime: this.referenceTime };
    let previousSettingsRaw;
    let settingsWritten = false;
    try {
      if (!await this.acquireStudyWriter()) return false;
      const fixture = await this.getStudyStorage().getFixture();
      if (!fixture) { this._studyMessage = 'Save a test setup first.'; return false; }
      const events = fixture.events.map(event => this.normalizeRuntimeEvent(this.cloneStudyValue(event)));
      previousSettingsRaw = localStorage.getItem('spiralCalendarSettings');
      this.stopAutoTimeAlign?.(); this.closeDetailView?.({ clearDraft: true, clearSelection: true, animateTransition: false });
      Object.assign(this.state, this.cloneStudyValue(fixture.settings));
      this.state.detailViewDay = null; this.events = events; this.referenceTime = new Date(fixture.referenceTime);
      this.refreshEventProjections?.(); this.invalidateEventViews?.();
      if (this.saveSettingsToStorage?.() === false) throw new Error('The test settings could not be saved.');
      settingsWritten = true;
      if (!await this.saveEventsToStorage()) throw new Error('The test calendar could not be saved.');
      if (typeof LOCATION_COORDS !== 'undefined') {
        LOCATION_COORDS.lat = Number(this.state.nightOverlayLat); LOCATION_COORDS.lng = Number(this.state.nightOverlayLng);
      }
      this._sunTimesCache = null;
      this.syncAllUIControls?.();
      this.setDarkModeEnabled?.(this.state.darkMode, { persist: false, redraw: false });
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('dark-mode', !!this.state.darkMode);
        document.documentElement.classList.toggle('dark-mode', !!this.state.darkMode);
      }
      this.drawSpiral?.(); this.requestEventListRender?.();
      this._studyMessage = 'Test setup restored. Archived recordings are unchanged.';
      return true;
    } catch (error) {
      this.events = previous.events; Object.assign(this.state, previous.state); this.referenceTime = previous.referenceTime;
      if (settingsWritten) {
        try {
          if (previousSettingsRaw === null) localStorage.removeItem('spiralCalendarSettings');
          else localStorage.setItem('spiralCalendarSettings', previousSettingsRaw);
        } catch (_) { error = new Error(`${error.message} Previous settings could not be restored; retry before the next participant.`); }
      }
      this.invalidateEventViews?.(); this.drawSpiral?.(); this._studyMessage = error.message;
      return false;
    } finally { await this.getStudyStorage().releaseWriter(); this._studyBusy = false; this.syncStudySessionUI(); }
  },

  getNextStudyParticipantId() {
    const sessions = [...(this._studyArchive || []), this.ensureStudySessionState()];
    const highest = sessions.reduce((max, session) => {
      const match = /^P(\d+)$/i.exec(session.participantId || '');
      return match && Number.isSafeInteger(Number(match[1])) ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `P${String(highest + 1).padStart(2, '0')}`;
  },

  startNextStudyTask() {
    const tasks = this.ensureStudySessionState().tasks;
    const next = tasks.reduce((max, task) => {
      const match = /^T(\d+)$/.exec(task.taskId);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    return this.startStudyTask({ taskId: `T${String(next).padStart(2, '0')}`, label: `Task ${next}` });
  },

  finishCurrentStudyTask() {
    const task = this.currentStudyTask();
    return !task || this.endStudyTask(task.facilitatorOutcome || 'unrated');
  },

  returnToStudyCalendar() {
    const content = document.getElementById('studySessionContent');
    if (content) {
      content.style.display = 'none';
      for (const details of content.querySelectorAll('details')) details.open = false;
    }
    document.getElementById('studySessionToggle')?.setAttribute('aria-expanded', 'false');
    const icon = document.getElementById('studyToggleIcon');
    if (icon) icon.textContent = '▼';
    document.getElementById('closeSettingsPanelBtn')?.click();
  },

  async startSimpleStudySession(participantId, { returnToCalendar = true } = {}) {
    const saved = await this.startStudySession(participantId || this.getNextStudyParticipantId(), 'explore', {
      fixtureId: this._studyFixture?.fixtureId || ''
    });
    if (saved && returnToCalendar) this.returnToStudyCalendar();
    return saved;
  },

  async changeStudyMode(phase, { nextTask = false, returnToCalendar = true } = {}) {
    const session = this.ensureStudySessionState();
    if (this._studyBusy || this._studyFlowBusy || !session.isRecording) return false;
    if (session.isPaused || !this.getStudyStorage().writer) {
      this._studyMessage = 'Resume the recording before changing modes.';
      this.syncStudySessionUI();
      return false;
    }
    this._studyFlowBusy = true; this._studyMessage = ''; this.syncStudySessionUI();
    try {
      const mode = this.normalizeStudySessionPhase(phase);
      if ((mode !== 'task' || nextTask) && !this.finishCurrentStudyTask()) return false;
      this.updateStudySessionPhase(mode);
      if (mode === 'task' && !this.currentStudyTask() && !this.startNextStudyTask()) return false;
      this.saveStudySessionDraft();
      const saved = await this.flushStudySession();
      if (saved && returnToCalendar) this.returnToStudyCalendar();
      return saved;
    } finally { this._studyFlowBusy = false; this.syncStudySessionUI(); }
  },

  async finishSimpleStudySession() {
    if (this._studyBusy || this._studyFlowBusy || !this.studySession?.isRecording) return false;
    return this.stopStudySession({ finishTask: true });
  },

  toggleStudySessionSection() {
    const content = document.getElementById('studySessionContent'), icon = document.getElementById('studyToggleIcon');
    if (content) { content.style.display = content.style.display === 'flex' ? 'none' : 'flex';
      const expanded = content.style.display === 'flex';
      if (icon) icon.textContent = expanded ? '▲' : '▼';
      document.getElementById('studySessionToggle')?.setAttribute('aria-expanded', String(expanded)); }
  },

  syncStudySessionUI() {
    if (typeof document === 'undefined') return;
    const session = this.ensureStudySessionState(), task = this.currentStudyTask();
    const get = id => document.getElementById(id);
    const show = (id, visible) => { if (get(id)) get(id).hidden = !visible; };
    const busy = !!this._studyBusy || !!this._studyFlowBusy || !!this._studyRemoteBusy || !this._studyInitialized;
    const recording = session.isRecording, owner = !!this.studyStorage?.writer;
    show('studyParticipantSetup', !recording); show('studyModeControls', recording);
    show('pauseRecordingBtn', recording); show('studyTaskControls', recording && session.sessionPhase === 'task');
    show('studyTaskFinishControls', !!task); show('studySetupControls', !recording);
    show('studyNoteControls', recording);
    show('downloadDataBtn', !!session.startTime); show('retryStudySaveBtn', !!this._studyDirty);
    for (const id of ['startRecordingBtn','stopRecordingBtn','pauseRecordingBtn','studyReturnBtn',
      'downloadStudyArchiveBtn','retryStudySaveBtn','downloadDataBtn']) if (get(id)) get(id).disabled = busy;
    for (const id of ['studyExploreBtn','studyTasksBtn','studyDebriefBtn','nextStudyTaskBtn']) {
      if (get(id)) get(id).disabled = busy || !recording || session.isPaused || !owner;
    }
    for (const id of ['studyHelpBtn','studyTaskOutcome']) if (get(id)) get(id).disabled = busy || !task || !owner;
    if (get('studyAddNoteBtn')) get('studyAddNoteBtn').disabled = busy || !recording || !owner;
    for (const id of ['saveStudyFixtureBtn','resetStudyFixtureBtn']) {
      if (get(id)) get(id).disabled = busy || recording || !!this._studyDirty;
    }
    if (get('resetStudyFixtureBtn')) get('resetStudyFixtureBtn').disabled ||= !this._studyFixture;
    const participant = get('participantId');
    if (participant) {
      participant.disabled = busy || recording;
      if (recording) {
        participant.value = session.participantId;
        this._studyParticipantSuggestion = session.participantId;
      } else if (!participant.value || participant.value === session.participantId || participant.value === this._studyParticipantSuggestion) {
        participant.value = this.getNextStudyParticipantId();
        this._studyParticipantSuggestion = participant.value;
      }
    }
    for (const [id, phase] of [['studyExploreBtn','explore'],['studyTasksBtn','task'],['studyDebriefBtn','debrief']]) {
      get(id)?.setAttribute('aria-pressed', String(session.sessionPhase === phase));
    }
    if (get('pauseRecordingBtn')) get('pauseRecordingBtn').textContent = session.isPaused ? 'Resume' : 'Pause';
    if (get('studyTaskStatus')) get('studyTaskStatus').textContent = task?.label || 'No task running';
    if (get('nextStudyTaskBtn')) get('nextStudyTaskBtn').textContent = task ? 'Next task' : 'Start task';
    if (get('studyTaskOutcome')) get('studyTaskOutcome').value = task?.facilitatorOutcome || 'unrated';
    if (get('studyArchiveCount')) {
      const count = (this._studyArchive || []).filter(row => !row.isRecording).length;
      get('studyArchiveCount').textContent = `${count} saved session${count === 1 ? '' : 's'}`;
    }
    const status = get('recordingStatus');
    if (status) {
      const storage = this._studyStorageStatus;
      const health = this._studyDirty ? (storage?.status === 'error' ? 'Not saved' : 'Saving…') : 'Saved';
      const phase = session.sessionPhase === 'task' && task ? task.label : this.formatStudySessionPhase(session.sessionPhase);
      status.textContent = busy ? (this._studyInitialized ? 'Saving…' : 'Opening study archive…') : [
        recording ? `${session.participantId} · ${phase} · ${session.isPaused ? 'Paused' : health}` : '',
        this._studyMessage,
        storage?.status === 'error' || storage?.status === 'blocked' ? storage.message : ''
      ].filter(Boolean).join(' · ');
      status.style.color = storage?.status === 'error' || storage?.status === 'blocked' ? '#c62828' : '';
    }
  },

  async setupStudySessionControls() {
    if (this._studySessionControlsBound || (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE)) return;
    this._studySessionControlsBound = true;
    const get = id => document.getElementById(id), value = id => get(id)?.value.trim() || '';
    const bind = (id, callback) => get(id)?.addEventListener('click', () => {
      Promise.resolve().then(callback).catch(error => { this._studyMessage = error.message; this.syncStudySessionUI(); });
    });
    bind('studySessionToggle', () => this.toggleStudySessionSection());
    bind('startRecordingBtn', () => this.startSimpleStudySession(value('participantId')));
    bind('stopRecordingBtn', () => this.finishSimpleStudySession());
    for (const [id, phase] of [['studyExploreBtn','explore'],['studyTasksBtn','task'],['studyDebriefBtn','debrief']]) {
      bind(id, () => this.changeStudyMode(phase));
    }
    bind('nextStudyTaskBtn', () => this.changeStudyMode('task', { nextTask: true }));
    bind('studyReturnBtn', () => this.returnToStudyCalendar());
    bind('pauseRecordingBtn', () => this.studySession.isPaused ? this.resumeStudySession() : this.pauseStudySession());
    bind('downloadDataBtn', () => this.downloadStudyData());
    bind('downloadStudyArchiveBtn', () => this.downloadStudyArchive());
    bind('retryStudySaveBtn', () => this.retryStudySave());
    bind('studyHelpBtn', () => this.recordStudyAssistance(value('studyNote')));
    bind('studyAddNoteBtn', () => { if (this.addStudyNote(value('studyNote'))) get('studyNote').value = ''; });
    bind('saveStudyFixtureBtn', () => this.saveStudyFixture(`setup-${crypto.randomUUID()}`));
    bind('resetStudyFixtureBtn', () => {
      if (confirm('Restore the starting calendar and settings? Saved study sessions will be kept.')) return this.resetStudyFixture();
    });
    get('studyTaskOutcome')?.addEventListener('change', () => {
      const task = this.currentStudyTask(), outcome = value('studyTaskOutcome');
      if (task && this.getStudyStorage().writer && ['unrated','success','partial','failure','skipped'].includes(outcome)) {
        task.facilitatorOutcome = outcome; this.saveStudySessionDraft();
      }
    });
    document.addEventListener('pointerdown', event => { this.ensureStudyRuntimeState().inputMethod = event.pointerType || 'mouse'; }, true);
    document.addEventListener('keydown', () => { this.ensureStudyRuntimeState().inputMethod = 'keyboard'; }, true);
    for (const type of ['input','change','click']) document.addEventListener(type, event => {
      if (!event.target.closest?.('#studySessionSection')) queueMicrotask(() => this.captureStudySettingsChange());
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pauseStudySession('background');
        this.recordStudyAction('page_hidden', {}, { actor: 'system', allowWhenPaused: true }); void this.flushStudySession();
      } else if (this.studySession?.isRecording) {
        if (this.studySession.pauseReason === 'background') void this.resumeStudySession('background');
        this.recordStudyAction('page_visible', {}, { actor: 'system', allowWhenPaused: true });
      }
    });
    window.addEventListener('pagehide', () => { this.pauseStudySession('background'); void this.flushStudySession(); });
    try { await this.restoreStudySessionDraft(); }
    catch (error) { this._studyMessage = `Study archive could not be read: ${error.message}`; }
    this._studyInitialized = true;
    this.setupStudyRemoteControls?.();
    this._studyHeartbeat = setInterval(() => {
      if (this.studySession?.isRecording && this.getStudyStorage().writer) {
        this.flushStudyObservations(); this.saveStudySessionDraft(); void this.flushStudySession();
      }
    }, 10000);
    this.syncStudySessionUI();
  }

});
