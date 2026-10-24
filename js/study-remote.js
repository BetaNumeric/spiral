// Optional study-only remote control. Recordings remain owned by the phone.
(function (scope) {
  'use strict';
  const STORAGE_KEY = 'spiralStudyRemotePhone';
  const ACTION_LABELS = {
    session_started: 'Study started', session_stopped: 'Study finished', phase_changed: 'Phase changed',
    task_started: 'Task started', task_completed: 'Task ended', task_assistance: 'Help marked',
    event_selected: 'Event selected', overlap_cycle: 'Overlapping events browsed',
    navigation_completed: 'Calendar navigated', search_committed: 'Search used',
    search_result_selected: 'Search result opened', calendar_filter_changed: 'Calendar filter changed',
    draft_started: 'Event draft started', draft_discarded: 'Event draft discarded',
    validation_failed: 'Edit validation failed', settings_changed: 'Settings changed',
    session_paused: 'Recording paused', session_resumed: 'Recording resumed',
    handle_drag_completed: 'Event handle moved', detail_view_opened: 'Event details opened'
  };

  class SpiralStudyRemote {
    constructor(app, options = {}) {
      this.app = app;
      this.fetch = options.fetch || scope.fetch.bind(scope);
      this.storage = options.storage;
      this.now = options.now || Date.now;
      this.timer = null;
      this.pairing = null;
      this.ledger = [];
      this.status = 'Connect once before handing the phone to a participant.';
      this.connected = false;
      this.serverOffset = 0;
      this.generation = 0;
      this.onChange = options.onChange || (() => this.syncUI());
      try {
        this.storage ||= scope.sessionStorage;
        const saved = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null');
        if (saved?.pairing && ['roomId','deviceId','deviceToken'].every(key => typeof saved.pairing[key] === 'string')) {
          this.pairing = saved.pairing;
          this.ledger = Array.isArray(saved.ledger) ? saved.ledger.slice(-64) : [];
          this.status = 'Reconnecting to facilitator…';
        }
      } catch (_) { this.status = 'Tab storage is unavailable. Local study recording is still available.'; }
    }

    persist() {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ pairing: this.pairing, ledger: this.ledger.slice(-64) }));
    }

    async request(path, body, token, method) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await this.fetch(`/study-api${path}`, {
          method: method || (body === undefined ? 'GET' : 'POST'), cache: 'no-store', credentials: 'omit', redirect: 'error',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal
        });
        let data;
        try { data = await response.json(); }
        catch (_) { throw new Error('The study connection service is unavailable at this address.'); }
        if (!response.ok) {
          const error = new Error(data.error || 'Study connection failed.'); error.status = response.status; throw error;
        }
        return data;
      } finally { clearTimeout(timer); }
    }

    devicePath() { return `/rooms/${encodeURIComponent(this.pairing.roomId)}/devices/${encodeURIComponent(this.pairing.deviceId)}`; }

    async connect(code) {
      if (this.pairing || this.connecting) throw new Error('Disconnect the current facilitator before pairing again.');
      const normalized = String(code || '').toUpperCase().replace(/[\s-]/g, '');
      if (!/^[A-Z0-9]{8}$/.test(normalized)) throw new Error('Enter the eight-character code from the facilitator page.');
      // Fail before pairing if reload receipts cannot be stored safely.
      this.persist(); this.connecting = true; this.onChange();
      try {
        const paired = await this.request('/pair', { code: normalized });
        this.pairing = { roomId: paired.roomId, deviceId: paired.deviceId, deviceToken: paired.deviceToken };
        this.ledger = []; this.persist(); this.generation++;
        this.status = 'Connecting…';
        this.start(); await this.publish();
        return true;
      } catch (error) {
        if (!this.pairing) this.status = error.message;
        throw error;
      } finally { this.connecting = false; this.onChange(); }
    }

    disconnect() {
      if (this.processing) return false;
      if (this.pairing) void this.request(this.devicePath(), undefined, this.pairing.deviceToken, 'DELETE').catch(() => {});
      this.generation++;
      clearInterval(this.timer); this.timer = null;
      this.pairing = null; this.connected = false; this.ledger = [];
      try { this.storage.removeItem(STORAGE_KEY); } catch (_) { /* Existing receipts must never be replayed. */ }
      this.status = 'Disconnected. Local recording continues.';
      this.onChange(); return true;
    }

    start() {
      if (!this.pairing || this.timer) return;
      this.timer = setInterval(() => { void this.publish(); }, 1000);
      void this.publish();
    }

    state() {
      const app = this.app, session = app.ensureStudySessionState(), task = app.currentStudyTask();
      const elapsedMs = app.getStudyElapsedMs();
      const activity = session.interactions.slice(-20).map(row => {
        let label = ACTION_LABELS[row.type];
        if (row.type === 'events_changed') {
          const payload = row.payload || {};
          label = `${payload.created?.length || 0} added · ${payload.updated?.length || 0} edited · ${payload.deleted?.length || 0} deleted`;
        }
        return label ? { id: `${session.sessionId}:${row.index}`, type: row.type, label, offsetMs: row.offsetMs } : null;
      }).filter(Boolean).slice(-8);
      return { protocolVersion: 1, participantId: session.participantId, sessionId: session.sessionId,
        suggestedParticipantId: app.getNextStudyParticipantId(), phase: session.sessionPhase,
        isRecording: session.isRecording, isPaused: session.isPaused,
        taskId: task?.taskId || null, attemptId: task?.attemptId || null, taskLabel: task?.label || '', taskOutcome: task?.facilitatorOutcome || 'unrated',
        elapsedMs, taskElapsedMs: task ? Math.max(0, elapsedMs - task.startOffsetMs - app.getStudyPausedMs(task.startOffsetMs, elapsedMs)) : 0,
        saved: !app.hasUnsavedStudyChanges(), storageStatus: app._studyStorageStatus?.status || 'saved',
        error: app._studyRecoveredSnapshot ? 'Recover the recording on this phone first.'
          : app.hasUnsavedStudyChanges() ? 'Study data has not finished saving on the phone.' : '',
        busy: !!(this.processing || app._studyBusy || app._studyFlowBusy || app._studyRecoveredSnapshot || !app._studyInitialized),
        ownsRecorder: !!app.studyStorage?.writer,
        visible: typeof document === 'undefined' || !document.hidden, activity };
    }

    expectedState() {
      const state = this.state();
      return Object.fromEntries(['sessionId','attemptId','phase','isRecording','isPaused'].map(key => [key, state[key]]));
    }

    async publish() {
      if (!this.pairing) return false;
      if (this.publishing) return this.publishing;
      const generation = this.generation;
      this.publishing = (async () => {
        try {
          const data = await this.request(`${this.devicePath()}/state`, { state: this.state() }, this.pairing.deviceToken);
          if (generation !== this.generation) return false;
          if (Number.isFinite(data.serverTime)) this.serverOffset = data.serverTime - this.now();
          this.connected = true; this.status = 'Connected to facilitator';
          for (const receipt of this.ledger.filter(row => row.status !== 'processing' && !row.acknowledged)) {
            if (generation !== this.generation || !this.pairing) return false;
            await this.acknowledge(receipt);
          }
          for (const command of data.commands || []) {
            if (generation !== this.generation || !this.pairing) return false;
            await this.processCommand(command);
          }
          return true;
        } catch (error) {
          if (generation !== this.generation) return false;
          this.connected = false;
          this.status = error.status === 401 || error.status === 404 || error.status === 410
            ? 'Pairing ended. Disconnect and connect with a new code. Local recording continues.'
            : 'Connection lost. Reconnecting; local recording continues.';
          if ([401, 404, 410].includes(error.status)) { clearInterval(this.timer); this.timer = null; }
          return false;
        } finally { this.onChange(); }
      })().finally(() => { this.publishing = null; });
      return this.publishing;
    }

    async acknowledge(receipt) {
      try {
        await this.request(`${this.devicePath()}/commands/${encodeURIComponent(receipt.id)}/ack`, {
          status: receipt.status, message: receipt.message, appliedAt: receipt.appliedAt || null, state: this.state()
        }, this.pairing.deviceToken);
      } catch (error) {
        if (![404, 409, 410].includes(error.status)) throw error;
        receipt.deliveryNote = 'The relay no longer accepts this receipt. Its local result is preserved.';
      }
      receipt.acknowledged = true;
      this.persist();
    }

    async processCommand(command) {
      if (!this.pairing || !command || typeof command.id !== 'string') return;
      let receipt = this.ledger.find(row => row.id === command.id);
      if (receipt) {
        if (receipt.status === 'processing') {
          receipt.status = 'uncertain'; receipt.message = 'The phone reloaded during this command. Review its current state before sending another.';
          this.persist();
        }
        await this.acknowledge(receipt); return;
      }
      receipt = { id: command.id, status: 'processing', acknowledged: false };
      this.ledger.push(receipt); this.ledger = this.ledger.slice(-64);
      this.persist(); // A reload from this point never executes this command a second time.
      try {
        const current = this.state(), expected = this.expectedState();
        if (!Number.isFinite(command.expiresAt) || command.expiresAt <= this.now() + this.serverOffset) throw new Error('Command expired; it was not applied.');
        if (!command.expected || Object.keys(expected).some(key => command.expected[key] !== expected[key])) throw new Error('The study changed on the phone. Refresh its status before sending another command.');
        if (!current.visible || current.busy || !current.saved || (current.isRecording && !current.ownsRecorder)) throw new Error('The phone is unavailable or needs local recovery. The command was not applied.');
        const payload = command.payload || {}, app = this.app;
        const actions = {
          start: () => app.startSimpleStudySession(payload.participantId, { returnToCalendar: false }),
          phase: () => ['explore','task','debrief'].includes(payload.phase) && app.changeStudyMode(payload.phase, { returnToCalendar: false }),
          next_task: () => current.isRecording && current.phase === 'task' && app.changeStudyMode('task', { nextTask: true, returnToCalendar: false }),
          pause: () => app.pauseStudySession(), resume: () => app.resumeStudySession(),
          finish: () => app.finishSimpleStudySession(),
          note: () => app.addStudyNote(String(payload.text || '').slice(0, 2000)),
          help: () => app.recordStudyAssistance(String(payload.text || '').slice(0, 2000)),
          outcome: () => {
            const task = app.currentStudyTask();
            if (!task || !['unrated','success','partial','failure','skipped'].includes(payload.outcome)) return false;
            task.facilitatorOutcome = payload.outcome;
            app.recordStudyAction('task_outcome_marked', { outcome: payload.outcome }, { actor: 'facilitator', allowWhenPaused: true });
            return true;
          }
        };
        if (!actions[command.action]) throw new Error('Unsupported study command.');
        this.processing = true; app._studyRemoteBusy = true; app._studyRemoteCommand = command;
        app.syncStudySessionUI(); this.onChange();
        app.recordStudyAction('remote_command_requested', { commandId: command.id, action: command.action },
          { actor: 'facilitator', source: 'study_remote', inputMethod: 'remote', allowWhenPaused: true });
        const applied = await actions[command.action]();
        if (!applied) throw new Error('The phone could not apply this command. Review its current state.');
        app.recordStudyAction('remote_command_applied', { commandId: command.id, action: command.action },
          { actor: 'facilitator', source: 'study_remote', inputMethod: 'remote', allowWhenPaused: true });
        if (!await app.flushStudySession() || app.hasUnsavedStudyChanges()) throw new Error('Saving was not confirmed. Check the phone before continuing.');
        receipt.status = 'applied'; receipt.message = 'Applied and saved on the phone.'; receipt.appliedAt = new Date().toISOString();
      } catch (error) {
        receipt.status = this.processing ? 'failed' : 'rejected'; receipt.message = error.message;
      } finally {
        this.processing = false; this.app._studyRemoteBusy = false; this.app._studyRemoteCommand = null;
        this.app.syncStudySessionUI(); this.persist(); this.onChange();
      }
      await this.acknowledge(receipt);
    }

    syncUI() {
      if (typeof document === 'undefined') return;
      const get = id => document.getElementById(id);
      if (get('studyRemoteStatus')) get('studyRemoteStatus').textContent = this.status;
      if (get('studyRemoteConnectBtn')) get('studyRemoteConnectBtn').disabled = !!this.pairing || !!this.connecting;
      if (get('studyRemoteCode')) get('studyRemoteCode').disabled = !!this.pairing || !!this.connecting;
      if (get('studyRemoteDisconnectBtn')) {
        get('studyRemoteDisconnectBtn').hidden = !this.pairing;
        get('studyRemoteDisconnectBtn').disabled = !!this.processing;
      }
    }
  }

  scope.SpiralStudyRemote = SpiralStudyRemote;
  Object.assign(SpiralCalendar.prototype, {
    setupStudyRemoteControls() {
      if (this.studyRemote || (typeof STUDY_MODE !== 'undefined' && !STUDY_MODE)) return;
      const remote = this.studyRemote = new SpiralStudyRemote(this);
      const get = id => document.getElementById(id);
      get('studyRemoteConnectBtn')?.addEventListener('click', () => {
        remote.connect(get('studyRemoteCode')?.value).catch(error => { remote.status = error.message; remote.syncUI(); });
      });
      get('studyRemoteDisconnectBtn')?.addEventListener('click', () => remote.disconnect());
      document.addEventListener('visibilitychange', () => { void remote.publish(); });
      const fragment = new URLSearchParams(location.hash.slice(1));
      const code = fragment.get('studyCode');
      if (code) {
        fragment.delete('studyCode');
        const query = new URL(location.href); query.searchParams.delete('studyConnect'); query.hash = fragment.toString();
        history.replaceState(history.state, '', query);
        if (!remote.pairing) void remote.connect(code).catch(error => { remote.status = error.message; remote.syncUI(); });
      }
      if (remote.pairing) remote.start();
      remote.syncUI();
    }
  });
})(window);
