// Coordinate event writes without changing the existing localStorage format.
// Keep this boundary independent of calendar rendering and date interpretation.
(function (globalScope) {
  'use strict';

  class SpiralEventStorage {
    static KEY = 'spiralCalendarEvents';

    constructor(options = {}) {
      this.getStorage = options.getStorage || (() => globalScope.localStorage);
      this.locks = options.locks === undefined ? globalScope.navigator?.locks : options.locks;
      this.indexedDB = options.indexedDB === undefined ? globalScope.indexedDB : options.indexedDB;
      this.onStatus = options.onStatus || (() => {});
      this.raw = null;
      this.loaded = false;
      this.pendingWrites = 0;
      this.error = null;
      this.queue = Promise.resolve();
      this.databasePromise = null;
    }

    static parse(raw) {
      if (raw === null) return [];
      const events = JSON.parse(raw);
      if (!Array.isArray(events) || events.some(event => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return true;
        return ['start', 'end'].some(key => {
          const value = event[key];
          return !['string', 'number'].includes(typeof value) ||
            !Number.isFinite(new Date(value).getTime());
        });
      })) {
        throw new Error('Stored events contain invalid data.');
      }
      return events;
    }

    notify() {
      try { this.onStatus({ pendingWrites: this.pendingWrites, error: this.error }); }
      catch (error) { console.warn('Failed to update event storage status:', error); }
    }

    reportFailure(kind, cause) {
      this.error = { kind, cause };
      this.notify();
      return false;
    }

    load() {
      if (this.pendingWrites) throw new Error('Wait for event saving to finish.');
      try {
        const raw = this.getStorage().getItem(SpiralEventStorage.KEY);
        const events = SpiralEventStorage.parse(raw);
        this.raw = raw;
        this.loaded = true;
        this.error = null;
        this.notify();
        return events;
      } catch (error) {
        this.loaded = false;
        this.reportFailure('load', error);
        throw error;
      }
    }

    async withWriteLock(callback) {
      if (this.locks) {
        return this.locks.request(SpiralEventStorage.KEY, callback);
      }
      // Older browsers can coordinate through a shared IndexedDB transaction.
      // Only the lock lives here; events remain in their original storage key.
      if (!this.indexedDB) throw new Error('Safe event saving is unavailable in this browser.');
      if (!this.databasePromise) {
        this.databasePromise = new Promise((resolve, reject) => {
          const request = this.indexedDB.open('spiralCalendarWriteLock', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('eventWrites');
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Event saving is blocked by another window.'));
          request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
              database.close();
              this.databasePromise = null;
            };
            resolve(database);
          };
        }).catch(error => {
          this.databasePromise = null;
          throw error;
        });
      }
      const database = await this.databasePromise;
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('eventWrites', 'readwrite');
        let result;
        let failure;
        transaction.objectStore('eventWrites').get('events').onsuccess = () => {
          try { result = callback(); }
          catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(failure || transaction.error);
      });
    }

    enqueue(raw, { reset = false } = {}) {
      try { SpiralEventStorage.parse(raw); }
      catch (error) { return Promise.resolve(this.reportFailure('save', error)); }
      if (!this.loaded && !reset) {
        return Promise.resolve(this.reportFailure('load', new Error('Stored events have not been loaded safely.')));
      }
      this.pendingWrites++;
      this.notify();
      const operation = this.queue.then(() => this.withWriteLock(() => {
        const storage = this.getStorage();
        const current = storage.getItem(SpiralEventStorage.KEY);
        if (!reset && current !== this.raw && current !== raw) {
          const error = new Error('Events changed in another window.');
          error.kind = 'conflict';
          throw error;
        }
        if (current !== raw) storage.setItem(SpiralEventStorage.KEY, raw);
        this.raw = raw;
        this.loaded = true;
      }));
      // A rejected write must not prevent subsequent retries from running.
      this.queue = operation.catch(() => {});
      return operation.then(() => {
        this.error = null;
        return true;
      }, error => this.reportFailure(error?.kind || 'save', error)).finally(() => {
        this.pendingWrites--;
        this.notify();
      });
    }

    save(raw) {
      return this.enqueue(raw);
    }

    // Used only after the user explicitly confirms deleting ALL event data.
    reset() {
      return this.enqueue('[]', { reset: true });
    }
  }

  globalScope.SpiralEventStorage = SpiralEventStorage;
})(typeof window !== 'undefined' ? window : globalThis);
