// Temporary study dashboard. The participant phone remains the recorder.
(function (root) {
  'use strict';

  const CONNECTION_KEY = 'spiralStudyFacilitatorConnection';
  const TERMINAL = new Set(['applied', 'rejected', 'failed', 'uncertain', 'expired']);
  const PHASE_LABELS = { explore: 'Explore', task: 'Tasks', debrief: 'Debrief' };
  const ACTION_LABELS = { start: 'Start exploring', phase: 'Change phase', next_task: 'Next task',
    pause: 'Pause', resume: 'Resume', finish: 'Finish study', note: 'Add note',
    help: 'Log help', outcome: 'Set result' };

  function milliseconds(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  class SpiralStudyFacilitator {
    constructor(options = {}) {
      this.document = options.document || root.document;
      this.fetch = options.fetch || root.fetch.bind(root);
      this.getStorage = options.getStorage || (() => root.sessionStorage);
      this.now = options.now || Date.now;
      this.setTimeout = options.setTimeout || root.setTimeout.bind(root);
      this.clearTimeout = options.clearTimeout || root.clearTimeout.bind(root);
      this.randomUUID = options.randomUUID || (() => root.crypto.randomUUID());
      this.connection = null;
      this.room = null;
      this.connected = false;
      this.selectedDeviceId = null;
      this.pending = new Map();
      this.messages = new Map();
      this.noteDrafts = new Map();
      this.phoneNodes = new Map();
      this.displayedDevice = null;
      this.displayedAttempt = null;
      this.creating = false;
      this.pollTimer = null;
      this.refreshPromise = null;
      this.stopped = false;
      this.serverOffset = 0;
    }

    get(id) { return this.document.getElementById(id); }
    text(id, value) { const element = this.get(id); if (element) element.textContent = value; }
    show(id, visible) { const element = this.get(id); if (element) element.hidden = !visible; }
    serverNow() { return this.now() + this.serverOffset; }
    disable(id, disabled) { const element = this.get(id); if (element) element.disabled = !!disabled; }
    bind(id, callback) {
      this.get(id)?.addEventListener('click', () => {
        Promise.resolve().then(callback).catch(error => this.setStatus(error.message, true));
      });
    }

    static duration(value) {
      const seconds = Math.floor(Math.max(0, Number(value) || 0) / 1000);
      const minutes = Math.floor(seconds / 60);
      return (minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') : String(minutes))
        + ':' + String(seconds % 60).padStart(2, '0');
    }

    static expected(state = {}) {
      return { sessionId: state.sessionId || null, attemptId: state.attemptId || null,
        phase: state.phase || 'explore', isRecording: !!state.isRecording, isPaused: !!state.isPaused };
    }

    setStatus(message, error = false) {
      this.text('facilitatorStatus', message);
      this.get('facilitatorStatus')?.classList.toggle('error', error);
    }

    async request(path, { method = 'GET', body, token } = {}) {
      const controller = new AbortController();
      const timer = this.setTimeout(() => controller.abort(), 6000);
      try {
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await this.fetch('/study-api' + path, {
          method, headers, cache: 'no-store', credentials: 'omit', redirect: 'error',
          signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        let data;
        try { data = await response.json(); } catch (_) { data = null; }
        if (!response.ok) {
          const message = typeof data?.error === 'string' ? data.error : response.status === 404
            ? 'The study connection service is unavailable here. Open the facilitator page at the study relay address.'
            : 'The connection service could not complete this request.';
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }
        if (!data || typeof data !== 'object') throw new Error('The connection service returned an unreadable response.');
        if (typeof data.serverTime === 'number' && Number.isFinite(data.serverTime)) this.serverOffset = data.serverTime - this.now();
        return data;
      } finally { this.clearTimeout(timer); }
    }

    roomPath() { return '/rooms/' + encodeURIComponent(this.connection.roomId); }
    devicePath(deviceId) { return this.roomPath() + '/devices/' + encodeURIComponent(deviceId); }

    restoreConnection() {
      try {
        const saved = JSON.parse(this.getStorage().getItem(CONNECTION_KEY) || 'null');
        if (!saved) return;
        if (typeof saved.roomId !== 'string' || !saved.roomId || typeof saved.controllerToken !== 'string'
          || saved.controllerToken.length < 20) throw new Error('Invalid stored connection.');
        this.connection = { roomId: saved.roomId, controllerToken: saved.controllerToken };
      } catch (_) {
        try { this.getStorage().removeItem(CONNECTION_KEY); } catch (_) {}
      }
    }

    persistConnection() {
      try { this.getStorage().setItem(CONNECTION_KEY, JSON.stringify(this.connection)); }
      catch (_) {
        this.show('studyConnectionStorageWarning', true);
        this.text('studyConnectionStorageWarning', 'This browser cannot remember the connection. Keep this tab open.');
      }
    }

    async createConnection() {
      if (this.creating) return false;
      this.creating = true;
      this.disable('createStudyConnectionBtn', true);
      this.setStatus('Creating connection…');
      try {
        const created = await this.request('/rooms', { method: 'POST', body: {} });
        if (typeof created.roomId !== 'string' || typeof created.controllerToken !== 'string'
          || created.controllerToken.length < 20) throw new Error('The connection service did not provide a usable connection.');
        this.connection = { roomId: created.roomId, controllerToken: created.controllerToken };
        this.room = { ...created, devices: [] };
        this.pending.clear(); this.messages.clear(); this.noteDrafts.clear();
        this.selectedDeviceId = null;
        this.connected = true; this.stopped = false;
        this.persistConnection(); this.render();
        await this.refresh();
        return true;
      } catch (error) { this.setStatus(error.message, true); return false; }
      finally { this.creating = false; this.disable('createStudyConnectionBtn', false); }
    }

    forgetConnection() {
      this.connection = null; this.room = null; this.connected = false;
      this.selectedDeviceId = null; this.pending.clear(); this.messages.clear(); this.noteDrafts.clear();
      this.clearTimeout(this.pollTimer); this.pollTimer = null;
      try { this.getStorage().removeItem(CONNECTION_KEY); } catch (_) {}
      this.render();
      this.setStatus('Connection forgotten here. Phone recordings continue locally.');
    }

    async refreshPairingCode() {
      if (!this.connection) return;
      this.disable('refreshPairingCodeBtn', true);
      const connection = this.connection;
      try {
        const result = await this.request(this.roomPath() + '/pairing', {
          method: 'POST', body: {}, token: connection.controllerToken
        });
        if (this.connection !== connection) return;
        this.room = { ...this.room, ...result };
        this.renderPairing();
      } finally { this.disable('refreshPairingCodeBtn', false); }
    }

    schedulePoll() {
      this.clearTimeout(this.pollTimer);
      if (this.connection && !this.stopped) this.pollTimer = this.setTimeout(() => this.refresh(), 1000);
    }

    async refresh() {
      if (!this.connection || this.stopped) return false;
      if (this.refreshPromise) return this.refreshPromise;
      const connection = this.connection;
      this.refreshPromise = (async () => {
        try {
          const room = await this.request(this.roomPath(), { token: connection.controllerToken });
          if (this.connection !== connection) return false;
          if (!Array.isArray(room.devices)) throw new Error('The connection service did not return the phone list.');
          this.room = room; this.connected = true;
          this.reconcileCommands();
          this.render();
          const count = room.devices.filter(device => device.online).length;
          this.setStatus(count ? count + ' phone' + (count === 1 ? '' : 's') + ' connected.' : 'Waiting for a phone to connect.');
          return true;
        } catch (error) {
          if (this.connection !== connection) return false;
          this.connected = false; this.render();
          this.setStatus(error.message + ' Remote controls are unavailable; phone recordings continue locally.', true);
          return false;
        } finally { this.refreshPromise = null; this.schedulePoll(); }
      })();
      return this.refreshPromise;
    }

    selectedDevice() { return this.room?.devices?.find(device => device.deviceId === this.selectedDeviceId) || null; }
    canControl(device) {
      return !!(this.connected && device?.online && device.state && device.state.visible !== false
        && device.state.saved !== false && !device.state.busy && !device.pendingCommand && !this.pending.has(device.deviceId));
    }

    reconcileCommands() {
      for (const device of this.room?.devices || []) {
        const local = this.pending.get(device.deviceId);
        if (!local) continue;
        const acknowledgement = device.lastCommand;
        if (acknowledgement?.id === local.id && TERMINAL.has(acknowledgement.status)) {
          const applied = acknowledgement.status === 'applied';
          const label = ACTION_LABELS[local.action] || 'Command';
          this.messages.set(device.deviceId, {
            text: applied ? label + ' confirmed by phone.' : label + ': ' + (acknowledgement.message || acknowledgement.status),
            error: !applied
          });
          if (applied && ['note', 'help'].includes(local.action)
            && (this.noteDrafts.get(device.deviceId) || '') === local.noteDraft) {
            this.noteDrafts.set(device.deviceId, '');
            const note = this.get('studyRemoteNote');
            if (this.selectedDeviceId === device.deviceId && note?.value === local.noteDraft) note.value = '';
          }
          this.pending.delete(device.deviceId);
        } else if (this.serverNow() > local.expiresAt + 1000 && !device.pendingCommand) {
          this.pending.delete(device.deviceId);
          this.messages.set(device.deviceId, { text: 'No phone confirmation was received. Review its current state before sending another command.', error: true });
        }
      }
    }

    async sendCommand(action, payload = {}) {
      const device = this.selectedDevice();
      if (!this.canControl(device)) return false;
      const id = this.randomUUID();
      const connection = this.connection;
      const pending = { id, action, payload: { ...payload }, expiresAt: this.serverNow() + 15000, status: 'sending',
        noteDraft: this.noteDrafts.get(device.deviceId) || '' };
      this.pending.set(device.deviceId, pending);
      this.messages.delete(device.deviceId); this.renderSelected();
      try {
        const result = await this.request(this.devicePath(device.deviceId) + '/commands', {
          method: 'POST', token: connection.controllerToken,
          body: { id, action, payload, expected: SpiralStudyFacilitator.expected(device.state) }
        });
        if (this.connection !== connection) return false;
        pending.status = 'pending';
        pending.expiresAt = milliseconds(result.command?.expiresAt) || pending.expiresAt;
        this.renderSelected();
        await this.refresh();
        return result.command || pending;
      } catch (error) {
        if (this.connection !== connection) return false;
        if ([400, 401, 403, 404, 409, 410, 422, 429].includes(error.status)) {
          this.pending.delete(device.deviceId);
          this.messages.set(device.deviceId, { text: error.message, error: true });
        } else {
          pending.status = 'unknown';
          this.messages.set(device.deviceId, { text: 'Delivery is unconfirmed. Waiting for the phone; this command will not be sent again automatically.', error: true });
        }
        this.renderSelected();
        await this.refresh();
        return false;
      }
    }

    renderPairing() {
      if (!this.room) return;
      const code = typeof this.room.pairingCode === 'string' ? this.room.pairingCode : '';
      const expiresAt = milliseconds(this.room.pairingExpiresAt);
      const expired = !code || (expiresAt && expiresAt <= this.serverNow());
      const minutes = Math.max(1, Math.ceil((expiresAt - this.serverNow()) / 60000));
      this.text('studyPairingCode', code);
      this.text('studyPairingExpiry', expired ? 'Pairing code expired. Request a new code to add phones.'
        : expiresAt ? 'Code expires in ' + minutes + ' minute' + (minutes === 1 ? '.' : 's.') : '');
      this.show('studyLocalAddressWarning', ['localhost', '127.0.0.1', '[::1]'].includes(new URL(root.location.href).hostname));
      const qr = this.get('studyPairingQR');
      if (qr && code && !expired && this.qrCode !== code) {
        try {
          const url = new URL('./', root.location.href);
          url.search = '?study=1&studyConnect=1';
          url.hash = 'studyCode=' + encodeURIComponent(code);
          qr.innerHTML = root.SpiralInstallQR.toSvg(url.href)
            .replace('Scan to open the Spiral installation guide', 'Scan to connect this phone to the study');
          this.qrCode = code;
        } catch (_) { qr.replaceChildren(); }
      }
      if (qr) qr.hidden = !!expired;
    }

    renderPhones() {
      const list = this.get('studyPhoneList');
      if (!list) return;
      const devices = this.room?.devices || [];
      const present = new Set(devices.map(device => device.deviceId));
      for (const [id, button] of this.phoneNodes) if (!present.has(id)) { button.remove(); this.phoneNodes.delete(id); }
      if (!present.has(this.selectedDeviceId)) this.selectedDeviceId = devices[0]?.deviceId || null;
      for (const device of devices) {
        let button = this.phoneNodes.get(device.deviceId);
        if (!button) {
          button = this.document.createElement('button'); button.type = 'button'; button.className = 'phone-card';
          button.dataset.deviceId = device.deviceId;
          button.append(this.document.createElement('strong'), this.document.createElement('span'));
          button.addEventListener('click', () => { this.selectedDeviceId = device.deviceId; this.render(); });
          this.phoneNodes.set(device.deviceId, button); list.appendChild(button);
        }
        button.firstElementChild.textContent = device.label || 'Study phone';
        const state = device.state || {};
        const connection = !this.connected || !device.online ? 'Disconnected' : state.visible === false ? 'App in background'
          : state.isPaused ? 'Paused' : 'Connected';
        button.lastElementChild.textContent = connection + (state.participantId ? ' · ' + state.participantId : '');
        button.setAttribute('aria-pressed', String(device.deviceId === this.selectedDeviceId));
      }
      this.show('studyPhoneEmpty', !devices.length);
    }

    renderSelected() {
      const device = this.selectedDevice(), state = device?.state || {};
      this.show('studySelectedPhone', !!device);
      this.text('selectedPhoneTitle', device?.label || 'Select a phone');
      if (!device) { this.text('studyPhoneConnection', ''); return; }
      const online = this.connected && device.online;
      this.text('studyPhoneConnection', !online ? 'Disconnected. Recording continues on the phone.'
        : state.visible === false ? 'App is in the background. Bring Spiral to the front to use remote controls.'
        : state.busy ? 'Phone is saving or changing state.' : 'Connected');
      this.text('studyPhoneParticipant', state.participantId || 'Ready for a participant');
      this.text('studyPhonePhase', PHASE_LABELS[state.phase] || '—');
      this.text('studyPhoneTask', state.taskLabel || state.taskId || '—');
      this.text('studyPhoneElapsed', SpiralStudyFacilitator.duration(state.elapsedMs));
      this.text('studyPhoneTaskElapsed', state.attemptId ? SpiralStudyFacilitator.duration(state.taskElapsedMs) : '—');
      this.text('studyPhoneSave', state.isRecording ? (state.isPaused ? 'Paused · ' : 'Recording · ')
        + (state.saved ? 'Saved' : 'Not saved yet') : state.saved === false ? 'Not saved yet' : 'Saved');
      const available = this.canControl(device);
      const active = !!state.isRecording;
      this.show('studyRemoteStartBtn', !active); this.show('studyRemotePhaseControls', active);
      this.show('studyRemoteNextTaskBtn', active && state.phase === 'task');
      this.show('studyRemotePauseBtn', active); this.show('studyRemoteFinishBtn', active);
      this.disable('studyRemoteStartBtn', !available || state.saved === false);
      this.disable('studyRemoteFinishBtn', !available);
      this.disable('studyRemotePauseBtn', !available);
      this.text('studyRemotePauseBtn', state.isPaused ? 'Resume' : 'Pause');
      for (const [id, phase] of [['studyRemoteExploreBtn', 'explore'], ['studyRemoteTasksBtn', 'task'], ['studyRemoteDebriefBtn', 'debrief']]) {
        this.disable(id, !available || state.isPaused);
        this.get(id)?.setAttribute('aria-pressed', String(state.phase === phase));
      }
      this.disable('studyRemoteNextTaskBtn', !available || state.isPaused);
      this.disable('studyRemoteNoteBtn', !available || !active);
      for (const id of ['studyRemoteHelpBtn', 'studyRemoteOutcomeBtn']) this.disable(id, !available || !active || !state.attemptId);
      if (this.displayedDevice !== device.deviceId || this.displayedAttempt !== state.attemptId) {
        this.get('studyRemoteOutcome') && (this.get('studyRemoteOutcome').value = state.taskOutcome || 'unrated');
        this.displayedAttempt = state.attemptId;
      }
      const note = this.get('studyRemoteNote');
      if (note && (this.displayedDevice !== device.deviceId || this.document.activeElement !== note)) note.value = this.noteDrafts.get(device.deviceId) || '';
      this.displayedDevice = device.deviceId;
      const pending = this.pending.get(device.deviceId) || device.pendingCommand;
      const message = this.messages.get(device.deviceId);
      this.text('studyCommandStatus', pending ? (pending.status === 'unknown'
        ? 'Delivery unconfirmed. Waiting for phone confirmation…' : 'Waiting for phone confirmation…') : message?.text || '');
      this.get('studyCommandStatus')?.classList.toggle('error', !!message?.error);
      const activity = this.get('studyRecentActivity');
      if (activity) {
        const items = (Array.isArray(state.activity) ? state.activity : []).slice(-12).reverse().map(row => {
          const item = this.document.createElement('li'), time = this.document.createElement('span');
          time.className = 'activity-time'; time.textContent = SpiralStudyFacilitator.duration(row.offsetMs);
          item.append(time, this.document.createTextNode(typeof row.label === 'string' ? row.label : String(row.type || 'Action')));
          return item;
        });
        activity.replaceChildren(...items);
      }
    }

    render() {
      this.show('createStudyConnection', !this.connection);
      this.show('studyPairingPanel', !!this.connection); this.show('studyDeviceWorkspace', !!this.connection);
      this.disable('refreshPairingCodeBtn', !this.connected);
      this.renderPairing(); this.renderPhones(); this.renderSelected();
    }

    async start() {
      this.bind('createStudyConnectionBtn', () => this.createConnection());
      this.bind('refreshPairingCodeBtn', () => this.refreshPairingCode());
      this.bind('forgetStudyConnectionBtn', () => this.forgetConnection());
      this.bind('studyRemoteStartBtn', () => this.sendCommand('start'));
      for (const [id, phase] of [['studyRemoteExploreBtn', 'explore'], ['studyRemoteTasksBtn', 'task'], ['studyRemoteDebriefBtn', 'debrief']]) {
        this.bind(id, () => this.sendCommand('phase', { phase }));
      }
      this.bind('studyRemoteNextTaskBtn', () => this.sendCommand('next_task'));
      this.bind('studyRemotePauseBtn', () => this.sendCommand(this.selectedDevice()?.state?.isPaused ? 'resume' : 'pause'));
      this.bind('studyRemoteFinishBtn', () => this.sendCommand('finish'));
      this.bind('studyRemoteNoteBtn', () => {
        const text = this.get('studyRemoteNote')?.value.trim() || '';
        return text && this.sendCommand('note', { text });
      });
      this.bind('studyRemoteHelpBtn', () => this.sendCommand('help', { text: this.get('studyRemoteNote')?.value.trim() || '' }));
      this.bind('studyRemoteOutcomeBtn', () => this.sendCommand('outcome', { outcome: this.get('studyRemoteOutcome')?.value || 'unrated' }));
      this.get('studyRemoteNote')?.addEventListener('input', event => {
        if (this.selectedDeviceId) this.noteDrafts.set(this.selectedDeviceId, event.target.value);
      });
      this.restoreConnection(); this.render();
      if (this.connection) await this.refresh();
    }

    stop() { this.stopped = true; this.clearTimeout(this.pollTimer); }
  }

  root.SpiralStudyFacilitator = SpiralStudyFacilitator;
  if (root.document?.getElementById('createStudyConnectionBtn')) {
    root.spiralStudyFacilitator = new SpiralStudyFacilitator();
    root.spiralStudyFacilitator.start().catch(error => root.spiralStudyFacilitator.setStatus(error.message, true));
    root.addEventListener('pagehide', () => root.spiralStudyFacilitator.stop());
    root.addEventListener('pageshow', () => {
      const dashboard = root.spiralStudyFacilitator;
      if (dashboard.stopped) { dashboard.stopped = false; void dashboard.refresh(); }
    });
  }
})(window);
