// Explicit city/place searches. The endpoint can be replaced with an Open-Meteo-compatible proxy.
(function (scope) {
  'use strict';
  const CACHE_KEY = 'spiralLocationSearchCacheV1';
  const DAY = 86400000;

  class SpiralLocationSearch {
    constructor(options = {}) {
      this.endpoint = options.endpoint || scope.SPIRAL_LOCATION_SEARCH_ENDPOINT || 'https://geocoding-api.open-meteo.com/v1/search';
      this.fetch = options.fetch || ((...args) => scope.fetch(...args));
      this.getStorage = options.getStorage || (() => scope.localStorage);
      this.now = options.now || (() => Date.now());
      this.monotonicNow = options.monotonicNow || (() => scope.performance ? scope.performance.now() : this.now());
      this.wait = options.wait || ((ms, signal) => new Promise((resolve, reject) => {
        const timer = setTimeout(done, ms);
        function done() { signal?.removeEventListener('abort', cancel); resolve(); }
        function cancel() { clearTimeout(timer); reject(signal.reason || new DOMException('Cancelled', 'AbortError')); }
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
      }));
      this.cache = new Map();
      this.queue = Promise.resolve();
      this.nextRequestAt = 0;
      try {
        const entries = JSON.parse(this.getStorage().getItem(CACHE_KEY) || '[]');
        if (Array.isArray(entries)) for (const entry of entries.slice(-20)) {
          if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1]?.at) && Array.isArray(entry[1]?.results)) {
            const results = entry[1].results.filter(result => this.validResult(result));
            if (results.length === entry[1].results.length) this.cache.set(entry[0], { at: entry[1].at, results });
          }
        }
      } catch (_) { /* Cache availability never determines whether search works. */ }
    }

    validResult(result) {
      return result && typeof result.label === 'string' && Number.isFinite(result.latitude) && Math.abs(result.latitude) <= 90
        && Number.isFinite(result.longitude) && Math.abs(result.longitude) <= 180
        && (!result.timeZone || SpiralTime.validTimeZone(result.timeZone));
    }

    search(query, { signal } = {}) {
      const name = String(query || '').trim();
      if (name.length < 2) return Promise.reject(new Error('Enter at least two characters to search.'));
      if (name.length > 200) return Promise.reject(new Error('The location search is too long.'));
      const key = name.toLocaleLowerCase('en');
      const operation = this.queue.then(async () => {
        signal?.throwIfAborted();
        const cached = this.cache.get(key);
        if (cached && this.now() - cached.at < DAY) return { results: cached.results, cached: true, stale: false };
        const delay = this.nextRequestAt - this.monotonicNow();
        if (delay > 0) await this.wait(delay, signal);
        signal?.throwIfAborted();
        this.nextRequestAt = this.monotonicNow() + 1000;
        const controller = new AbortController();
        const cancel = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', cancel, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
        try {
          const url = new URL(this.endpoint, scope.location?.href || 'https://geocoding-api.open-meteo.com/');
          url.searchParams.set('name', name);
          url.searchParams.set('count', '5');
          url.searchParams.set('language', 'en');
          url.searchParams.set('format', 'json');
          const response = await this.fetch(url.href, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
          if (!response.ok) {
            if (response.status === 429) {
              const retry = response.headers?.get('Retry-After');
              const retryAt = /^\d+$/.test(retry || '') ? this.now() + Number(retry) * 1000 : Date.parse(retry);
              this.nextRequestAt = Math.max(this.nextRequestAt, this.monotonicNow() + (Number.isFinite(retryAt) ? Math.max(0, retryAt - this.now()) : 60000));
            }
            throw new Error(response.status === 429 ? 'Location search is busy. Please wait and try again.' : 'Location search is unavailable. Try again later.');
          }
          const data = await response.json();
          if (!data || Array.isArray(data) || data.error || (data.results !== undefined && !Array.isArray(data.results))) throw new Error('The location service returned an invalid response.');
          const results = (data.results || []).filter(result => result && typeof result === 'object').slice(0, 5).map(result => ({
            label: [...new Set([result.name, result.admin1, result.country].filter(value => typeof value === 'string' && value.trim()))].join(', '),
            latitude: result.latitude, longitude: result.longitude,
            timeZone: typeof result.timezone === 'string' ? result.timezone : null
          })).filter(result => result.label && this.validResult(result));
          signal?.throwIfAborted();
          this.cache.delete(key);
          this.cache.set(key, { at: this.now(), results });
          while (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
          try { this.getStorage().setItem(CACHE_KEY, JSON.stringify([...this.cache])); } catch (_) {}
          return { results, cached: false, stale: false };
        } catch (error) {
          signal?.throwIfAborted();
          if (cached && this.now() - cached.at < 7 * DAY) return { results: cached.results, cached: true, stale: true };
          if (timedOut) throw new Error('Location search timed out. Please try again.');
          throw error;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
        }
      });
      this.queue = operation.catch(() => {});
      return operation;
    }
  }
  scope.SpiralLocationSearch = SpiralLocationSearch;
})(typeof globalThis !== 'undefined' ? globalThis : window);
