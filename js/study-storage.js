// Study recordings are an archive, independent of the participant's calendar.
(function (globalScope) {
  'use strict';

  class SpiralStudyStorage {
    static DATABASE = 'spiralCalendarStudyArchive';
    static LEGACY_KEY = 'spiralCalendarStudySessionDraft';
    static LOCK = 'spiralCalendarStudyRecorder';

    constructor(options = {}) {
      this.indexedDB = options.indexedDB === undefined ? globalScope.indexedDB : options.indexedDB;
      this.locks = options.locks === undefined ? globalScope.navigator?.locks : options.locks;
      this.getStorage = options.getStorage || (() => globalScope.localStorage);
      this.onStatus = options.onStatus || (() => {});
      this.now = options.now || Date.now;
      this.setInterval = options.setInterval || globalScope.setInterval?.bind(globalScope);
      this.clearInterval = options.clearInterval || globalScope.clearInterval?.bind(globalScope);
      this.owner = options.owner || globalScope.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      this.leaseDurationMs = options.leaseDurationMs || 30000;
      this.database = null;
      this.initializing = null;
      this.queue = Promise.resolve();
      this.writer = false;
      this.acquiring = null;
      this.error = null;
      this.releaseLock = null;
      this.heartbeat = null;
    }

    notify(status, message = '') {
      try { this.onStatus({ status, message }); } catch (_) { /* Status UI cannot break saving. */ }
    }

    fail(error, status = 'error') {
      this.error = error instanceof Error ? error : new Error(String(error || 'Study storage failed.'));
      this.notify(status, this.error.message);
      return false;
    }

    async initialize() {
      if (this.database) return true;
      if (this.initializing) return this.initializing;
      this.initializing = (async () => {
        try {
          if (!this.indexedDB) throw new Error('Study recording requires IndexedDB. Export any unsaved recording.');
          this.database = await new Promise((resolve, reject) => {
            const request = this.indexedDB.open(SpiralStudyStorage.DATABASE, 1);
            let blocked = false;
            request.onupgradeneeded = () => {
              const database = request.result;
              database.createObjectStore('sessions', { keyPath: 'sessionId' });
              database.createObjectStore('interactions', { keyPath: ['sessionId', 'index'] });
              database.createObjectStore('control', { keyPath: 'key' });
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              blocked = true;
              reject(new Error('Study storage is blocked by another window. Close that window and retry.'));
            };
            request.onsuccess = () => {
              if (blocked) { request.result.close(); return; }
              resolve(request.result);
            };
          });
          this.database.onversionchange = () => {
            this.database?.close();
            this.database = null;
            this.writer = false;
            this.clearInterval?.(this.heartbeat);
            this.releaseLock?.();
            this.releaseLock = null;
            this.fail(new Error('Study storage changed in another window. Reload before recording.'));
          };
          this.error = null;
          this.notify('saved', 'Study archive ready.');
          await this.migrateLegacy();
          return true;
        } catch (error) { return this.fail(error); }
        finally { this.initializing = null; }
      })();
      return this.initializing;
    }

    // Callback-based requests keep each IndexedDB transaction alive until all writes are queued.
    transaction(stores, mode, operation) {
      return new Promise((resolve, reject) => {
        let transaction;
        let result;
        let failure;
        try {
          if (!this.database) throw new Error('Study archive is not open.');
          transaction = this.database.transaction(stores, mode);
          transaction.oncomplete = () => resolve(result);
          transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('Study storage transaction failed.'));
          const abort = error => {
            failure = error;
            try { transaction.abort(); } catch (_) { reject(error); }
          };
          operation(transaction, value => { result = value; }, abort);
        } catch (error) {
          failure = error;
          if (transaction) { try { transaction.abort(); } catch (_) { reject(error); } }
          else reject(error);
        }
      });
    }

    validate(session) {
      if (!session || typeof session !== 'object' || typeof session.sessionId !== 'string' || !session.sessionId.trim()
        || !Number.isInteger(session.schemaVersion) || session.schemaVersion < 1 || session.schemaVersion > 6
        || typeof session.isRecording !== 'boolean' || !Array.isArray(session.interactions)
        || session.interactions.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error('Invalid or unsupported study recording. The original data has been preserved.');
      }
      return JSON.parse(JSON.stringify(session));
    }

    // Prefix fingerprints prevent stale snapshots from replacing or truncating the append-only log.
    fingerprints(interactions) {
      const hashes = ['0'];
      let hash = 2166136261;
      for (const interaction of interactions) {
        const text = JSON.stringify(interaction);
        for (let index = 0; index < text.length; index++) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        hash ^= 10;
        hash = Math.imul(hash, 16777619);
        hashes.push((hash >>> 0).toString(16));
      }
      return hashes;
    }

    putSnapshot(transaction, session, previous, abort, imported = false) {
      try {
        const { interactions, ...metadata } = session;
        const hashes = this.fingerprints(interactions);
        const count = previous?._interactionCount || 0;
        if (previous && (interactions.length < count || hashes[count] !== previous._interactionHash)) {
          throw new Error('This study recording changed elsewhere. Export your current copy before recovering the saved recording.');
        }
        if (previous && previous.isRecording === false && session.isRecording) {
          throw new Error('A finalized study recording cannot be reopened. Start a new session.');
        }
        const store = transaction.objectStore('interactions');
        for (let index = count; index < interactions.length; index++) {
          store.add({ sessionId: session.sessionId, index, interaction: interactions[index] });
        }
        metadata.revision = Math.max((Number(previous?.revision) || 0) + 1, Number(metadata.revision) || 0);
        metadata._interactionCount = interactions.length;
        metadata._interactionHash = hashes[interactions.length];
        metadata._savedAt = this.now();
        if (imported) metadata._legacyImport = true;
        transaction.objectStore('sessions').put(metadata);
        const control = transaction.objectStore('control');
        if (session.isRecording) control.put({ key: 'active', sessionId: session.sessionId });
        else {
          const request = control.get('active');
          request.onsuccess = () => {
            if (request.result?.sessionId === session.sessionId) control.delete('active');
          };
        }
      } catch (error) { abort(error); }
    }

    async migrateLegacy() {
      let raw;
      try {
        raw = this.getStorage()?.getItem(SpiralStudyStorage.LEGACY_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        // The old app also wrote an empty, never-started draft. Leave it alone.
        if (parsed && parsed.sessionId === null && !parsed.isRecording && Array.isArray(parsed.interactions) && !parsed.interactions.length) return;
        const session = this.validate(parsed);
        await this.transaction(['sessions', 'interactions', 'control'], 'readwrite', (transaction, done, abort) => {
          const request = transaction.objectStore('sessions').get(session.sessionId);
          request.onsuccess = () => {
            if (request.result) return; // Reopening the app never reimports or overwrites an archive.
            const active = transaction.objectStore('control').get('active');
            active.onsuccess = () => {
              // Another active archive takes precedence; retain the legacy recording as interrupted.
              if (active.result && session.isRecording) {
                session.isRecording = false;
                session.legacyInterrupted = true;
              }
              this.putSnapshot(transaction, session, null, abort, true);
            };
          };
        });
      } catch (error) {
        this.fail(new Error(`Older study data was preserved but could not be imported: ${error.message}`));
      }
      // Do not remove even successfully imported legacy data: it remains a recovery copy.
    }

    async claimLease(webLock = false) {
      const claimed = await this.transaction(['control'], 'readwrite', (transaction, done) => {
        const store = transaction.objectStore('control');
        const request = store.get('writer');
        request.onsuccess = () => {
          const lease = request.result;
          // An acquired Web Lock proves its previous Web Lock owner has gone,
          // allowing immediate recovery after reload rather than waiting for expiry.
          if (lease && lease.owner !== this.owner && lease.expiresAt > this.now() && !(webLock && lease.webLock)) { done(false); return; }
          store.put({ key: 'writer', owner: this.owner, expiresAt: this.now() + this.leaseDurationMs, webLock });
          done(true);
        };
      });
      return claimed;
    }

    async acquireWriter() {
      if (this.writer) return true;
      if (this.acquiring) return this.acquiring;
      this.acquiring = this.acquireWriterLock();
      try { return await this.acquiring; }
      finally { this.acquiring = null; }
    }

    async acquireWriterLock() {
      if (!await this.initialize()) return false;
      try {
        let acquired;
        if (this.locks?.request) {
          acquired = await new Promise((resolve, reject) => {
            this.locks.request(SpiralStudyStorage.LOCK, { ifAvailable: true }, async lock => {
              if (!lock) { resolve(false); return; }
              let release;
              const held = new Promise(done => { release = done; });
              try {
                if (!await this.claimLease(true)) { resolve(false); return; }
                this.releaseLock = release;
                resolve(true);
                await held;
              } catch (error) { reject(error); }
            }).catch(reject);
          });
        } else acquired = await this.claimLease();
        if (!acquired) return this.fail(new Error('Another tab is recording. Use that tab or close it before continuing.'), 'blocked');
        this.writer = true;
        this.error = null;
        if (this.setInterval) {
          this.heartbeat = this.setInterval(() => { this.renewLease(); }, Math.floor(this.leaseDurationMs / 3));
          this.heartbeat?.unref?.();
        }
        this.notify('saved', 'Recorder ready.');
        return true;
      } catch (error) { return this.fail(error); }
    }

    async renewLease() {
      if (!this.writer) return false;
      try {
        return await this.transaction(['control'], 'readwrite', (transaction, done, abort) => {
          const store = transaction.objectStore('control');
          const request = store.get('writer');
          request.onsuccess = () => {
            if (request.result?.owner !== this.owner || request.result.expiresAt <= this.now()) {
              abort(new Error('Recorder ownership expired. Export unsaved data and recover before continuing.'));
              return;
            }
            store.put({ ...request.result, expiresAt: this.now() + this.leaseDurationMs });
            done(true);
          };
        });
      } catch (error) {
        this.writer = false;
        this.releaseLock?.();
        this.releaseLock = null;
        this.clearInterval?.(this.heartbeat);
        return this.fail(error, 'blocked');
      }
    }

    save(session) {
      let snapshot;
      try { snapshot = this.validate(session); }
      catch (error) { return Promise.resolve(this.fail(error)); }
      this.notify('saving', 'Saving recording…');
      const operation = this.queue.then(async () => {
        if (!this.writer) throw new Error('This tab does not own the recorder. Export unsaved data before recovering.');
        await this.transaction(['control', 'sessions', 'interactions'], 'readwrite', (transaction, done, abort) => {
          const control = transaction.objectStore('control');
          const lease = control.get('writer');
          lease.onsuccess = () => {
            if (lease.result?.owner !== this.owner || lease.result.expiresAt <= this.now()) {
              abort(new Error('Recorder ownership expired. Your unsaved recording has not overwritten the archive.'));
              return;
            }
            control.put({ ...lease.result, expiresAt: this.now() + this.leaseDurationMs });
            const active = control.get('active');
            active.onsuccess = () => {
              if (active.result?.sessionId && active.result.sessionId !== snapshot.sessionId && snapshot.isRecording) {
                abort(new Error('An unfinished recording is already archived. Recover and finalize it before starting another.'));
                return;
              }
              const previous = transaction.objectStore('sessions').get(snapshot.sessionId);
              previous.onsuccess = () => this.putSnapshot(transaction, snapshot, previous.result, abort);
            };
          };
        });
        this.error = null;
        this.notify('saved', 'Recording saved on this device.');
        return true;
      }).catch(error => this.fail(error));
      this.queue = operation;
      return operation;
    }

    async flush() { await this.queue; return !this.error; }

    saveFixture(fixture) {
      let snapshot;
      try {
        if (!fixture || typeof fixture.fixtureId !== 'string' || !Array.isArray(fixture.events) || !fixture.settings || typeof fixture.settings !== 'object') {
          throw new Error('Invalid study calendar baseline.');
        }
        snapshot = JSON.parse(JSON.stringify(fixture));
      } catch (error) { return Promise.resolve(this.fail(error)); }
      this.notify('saving', 'Saving study calendar baseline…');
      const operation = this.queue.then(async () => {
        if (!this.writer) throw new Error('Acquire the recorder before saving the study calendar baseline.');
        await this.transaction(['control'], 'readwrite', (transaction, done, abort) => {
          const control = transaction.objectStore('control');
          const request = control.get('writer');
          request.onsuccess = () => {
            if (request.result?.owner !== this.owner || request.result.expiresAt <= this.now()) {
              abort(new Error('Recorder ownership expired. The study calendar baseline was preserved.'));
              return;
            }
            control.put({ ...request.result, expiresAt: this.now() + this.leaseDurationMs });
            control.put({ key: 'baseline', fixture: snapshot });
          };
        });
        this.error = null;
        this.notify('saved', 'Study calendar baseline saved.');
        return true;
      }).catch(error => this.fail(error));
      this.queue = operation;
      return operation;
    }

    async getFixture() {
      if (!await this.initialize()) throw this.error;
      await this.queue;
      try {
        return await this.transaction(['control'], 'readonly', (transaction, done) => {
          const request = transaction.objectStore('control').get('baseline');
          request.onsuccess = () => done(request.result?.fixture || null);
        });
      } catch (error) { this.fail(error); throw error; }
    }

    async listSessions() {
      if (!await this.initialize()) throw this.error;
      await this.queue;
      try {
        return await this.transaction(['sessions', 'interactions'], 'readonly', (transaction, done, abort) => {
          let sessions;
          let interactions;
          const assemble = () => {
            if (!sessions || !interactions) return;
            const groups = new Map();
            for (const row of interactions) {
              if (!groups.has(row.sessionId)) groups.set(row.sessionId, []);
              groups.get(row.sessionId).push(row);
            }
            done(sessions.map(metadata => {
              const { _interactionCount, _interactionHash, _savedAt, _legacyImport, ...session } = metadata;
              session.interactions = (groups.get(session.sessionId) || []).sort((a, b) => a.index - b.index).map(row => row.interaction);
              if (session.interactions.length !== _interactionCount || this.fingerprints(session.interactions).at(-1) !== _interactionHash) {
                throw new Error(`Study recording ${session.sessionId} is incomplete. Preserve the archive and use a backup export.`);
              }
              return session;
            }).sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))));
          };
          const safelyAssemble = () => {
            try { assemble(); } catch (error) { abort(error); }
          };
          const sessionsRequest = transaction.objectStore('sessions').getAll();
          const interactionsRequest = transaction.objectStore('interactions').getAll();
          sessionsRequest.onsuccess = () => { sessions = sessionsRequest.result; safelyAssemble(); };
          interactionsRequest.onsuccess = () => { interactions = interactionsRequest.result; safelyAssemble(); };
        });
      } catch (error) { this.fail(error); throw error; }
    }

    async getActiveSession() {
      const sessions = await this.listSessions();
      const active = sessions.filter(session => session.isRecording);
      if (active.length > 1) throw new Error('Multiple unfinished recordings exist. Export the archive before continuing.');
      return active[0] || null;
    }

    async releaseWriter() {
      await this.queue;
      this.clearInterval?.(this.heartbeat);
      this.heartbeat = null;
      try {
        if (this.database) await this.transaction(['control'], 'readwrite', (transaction) => {
          const store = transaction.objectStore('control');
          const request = store.get('writer');
          request.onsuccess = () => { if (request.result?.owner === this.owner) store.delete('writer'); };
        });
      } catch (error) { this.fail(error); }
      finally {
        this.writer = false;
        this.releaseLock?.();
        this.releaseLock = null;
      }
    }

    async close() {
      await this.releaseWriter();
      this.database?.close();
      this.database = null;
    }
  }

  globalScope.SpiralStudyStorage = SpiralStudyStorage;
})(typeof window !== 'undefined' ? window : globalThis);
