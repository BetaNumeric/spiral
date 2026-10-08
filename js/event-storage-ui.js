// Adapt the event storage boundary to the existing calendar and its recovery UI.
Object.assign(SpiralCalendar.prototype, {
  getEventStorage() {
    if (!this.eventStorage) {
      this.eventStorage = new SpiralEventStorage({
        onStatus: () => this.updateEventStorageNotice()
      });
    }
    return this.eventStorage;
  },

  serializeEventsForStorage() {
    return JSON.stringify(this.events.map(event => {
      this.ensureEventColorMetadata(event);
      return { ...event, start: event.start.toISOString(), end: event.end.toISOString() };
    }));
  },

  getEventStorageSnapshot(raw) {
    // Automatic palette colors are derived from settings, not unsaved edits.
    return JSON.stringify(JSON.parse(raw).map(event => {
      if (event.colorIsCustom === true) return event;
      const { color, ...snapshot } = event;
      return snapshot;
    }));
  },

  hasUnsavedEventChanges() {
    const storage = this.getEventStorage();
    if (storage.pendingWrites) return true;
    if (!storage.loaded) return this.events.length > 0;
    try { return this.getEventStorageSnapshot(this.serializeEventsForStorage()) !== this._savedEventsSnapshot; }
    catch (_) { return true; }
  },

  saveEventsToStorage() {
    const storage = this.getEventStorage();
    let raw;
    try { raw = this.serializeEventsForStorage(); }
    catch (error) {
      storage.reportFailure('save', error);
      return Promise.resolve(false);
    }
    const saved = storage.save(raw);
    // Capture the interaction while the synchronous study source is still active.
    // It describes the user's edit, including an edit that remains unsaved.
    if (typeof this.recordStudyEventSnapshotDiff === 'function') {
      this.recordStudyEventSnapshotDiff();
    }
    return saved.then(success => {
      if (success) {
        this._savedEventsSnapshot = this.getEventStorageSnapshot(storage.raw);
        this.refreshStoredEventsIfIdle();
      }
      return success;
    });
  },

  loadEventsFromStorage(options = {}) {
    const storage = this.getEventStorage();
    try {
      const events = storage.load().map(event => {
        const loaded = { ...event, start: new Date(event.start), end: new Date(event.end) };
        if (!loaded.calendar) loaded.calendar = 'Home';
        if (!loaded.persistentUID) loaded.persistentUID = generateEventUID(loaded);
        if (!loaded.lastModified) loaded.lastModified = Date.now();
        if (!loaded.lastAddedToCalendar) loaded.lastAddedToCalendar = null;
        this.ensureEventColorMetadata(loaded);
        return loaded;
      });
      // Replace memory only after every stored event has loaded successfully.
      this.events = events;
      this._savedEventsSnapshot = this.getEventStorageSnapshot(this.serializeEventsForStorage());
      this._externalEventStorageChangePending = false;
      this._eventsVersion++;
      if (options.external && this.studySession?.isRecording) {
        this.studySession.lastEventSnapshot = this.captureStudyEventSnapshot();
      }
      this.updateEventStorageNotice();
      if (options.redraw !== false) this.drawSpiral();
      if (options.external) this.requestEventListRender();
      return true;
    } catch (error) {
      storage.loaded = false;
      storage.reportFailure('load', error);
      console.warn('Failed to load saved events:', error);
      return false;
    }
  },

  setupEventStorageSync() {
    if (this._eventStorageSyncInstalled) return;
    this._eventStorageSyncInstalled = true;
    window.addEventListener('storage', event => {
      if (event.key !== null && event.key !== SpiralEventStorage.KEY) return;
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      this._externalEventStorageChangePending = true;
      this.refreshStoredEventsIfIdle();
      this.updateEventStorageNotice();
    });
    window.addEventListener('focus', () => this.refreshStoredEventsIfIdle());
  },

  refreshStoredEventsIfIdle() {
    if (!this._externalEventStorageChangePending) return;
    const storage = this.getEventStorage();
    if (storage.pendingWrites || this.hasUnsavedEventChanges() ||
        this.state.detailViewDay !== null || this.isModeTransitionActive() ||
        this.mouseState.isDragging || this.mouseState.isHandleDragging ||
        this.editingState.isEditingTitle || this.editingState.isEditingDescription) return;
    this._externalEventStorageChangePending = false;
    if (this.loadEventsFromStorage({ external: true, redraw: false })) this.requestRender();
  },

  async clearAllStoredEvents() {
    const storage = this.getEventStorage();
    const previousEvents = this.events;
    this.events = [];
    this._eventsVersion++;
    this.requestRender();
    this.requestEventListRender();
    if (!(await storage.reset())) {
      // Restore the originals without discarding events created while saving.
      this.events = [...previousEvents, ...this.events];
      this._eventsVersion++;
      this.requestRender();
      this.requestEventListRender();
      return false;
    }
    this._savedEventsSnapshot = this.getEventStorageSnapshot(storage.raw);
    this._externalEventStorageChangePending = false;
    this.recordStudyEventSnapshotDiff();
    this.updateEventStorageNotice();
    return true;
  },

  downloadEventStorageBackup(storedCopy = false) {
    try {
      const raw = storedCopy
        ? this.getEventStorage().getStorage().getItem(SpiralEventStorage.KEY)
        : JSON.stringify(this.events, null, 2);
      const url = URL.createObjectURL(new Blob([raw ?? '[]'], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = storedCopy ? 'spiral-stored-events-backup.json' : 'spiral-unsaved-events.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      this.getEventStorage().reportFailure(storedCopy ? 'load' : 'save', error);
    }
  },

  updateEventStorageNotice() {
    const storage = this.eventStorage;
    if (!storage) return;
    let notice = document.getElementById('eventStorageNotice');
    const needsNotice = storage.error || this._externalEventStorageChangePending;
    if (!notice && !needsNotice) return;
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'eventStorageNotice';
      notice.className = 'event-storage-notice';
      const message = document.createElement('p');
      message.id = 'eventStorageMessage';
      message.setAttribute('role', 'status');
      message.setAttribute('aria-live', 'polite');
      notice.appendChild(message);
      const actions = document.createElement('div');
      actions.className = 'event-storage-actions';
      const addButton = (id, label, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.textContent = label;
        button.addEventListener('click', onClick);
        actions.appendChild(button);
      };
      addButton('retryEventSave', 'Retry saving', () => this.saveEventsToStorage());
      addButton('downloadUnsavedEvents', 'Download events', () => this.downloadEventStorageBackup());
      addButton('downloadStoredEvents', 'Download stored copy', () => this.downloadEventStorageBackup(true));
      addButton('reloadStoredEvents', 'Reload saved events', () => {
        if (confirm('Reload saved events? Any unsaved changes in this window will be discarded.')) {
          this._allowDiscardUnsavedEvents = true;
          window.location.reload();
        }
      });
      notice.appendChild(actions);
      document.getElementById('app').appendChild(notice);
    }
    notice.hidden = !needsNotice;
    if (!needsNotice) return;
    const kind = storage.error?.kind;
    const messages = {
      load: 'Saved events could not be read. The stored copy has been preserved. Download a backup before reloading.',
      conflict: 'Events changed in another window. Your edits have not been saved. Download them before reloading saved events.',
      save: 'Your latest event changes could not be saved. Retry saving or download your events before leaving.'
    };
    document.getElementById('eventStorageMessage').textContent = messages[kind] ||
      (this.hasUnsavedEventChanges()
        ? messages.conflict
        : 'Events changed in another window. Finish editing to refresh, or reload saved events.');
    const retry = document.getElementById('retryEventSave');
    retry.hidden = !storage.error || kind === 'load' || kind === 'conflict';
    retry.disabled = storage.pendingWrites > 0;
    document.getElementById('downloadStoredEvents').hidden = kind !== 'load';
    document.getElementById('reloadStoredEvents').disabled = storage.pendingWrites > 0;
  }
});
