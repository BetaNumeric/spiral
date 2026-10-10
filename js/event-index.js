// Reuse projected intervals across frames; query only those meeting the requested hour.
(function (scope) {
  'use strict';

  class SpiralEventIntervalIndex {
    constructor(entries) {
      this.entries = entries.map((entry, order) => ({ ...entry, order }))
        .sort((a, b) => a.startMs - b.startMs || a.order - b.order);
      this.maxEnds = new Float64Array(entries.length);
      const build = (from, to) => {
        if (from >= to) return -Infinity;
        const middle = (from + to) >>> 1;
        return this.maxEnds[middle] = Math.max(this.entries[middle].endMs,
          build(from, middle), build(middle + 1, to));
      };
      build(0, entries.length);
      this.starts = new Map();
      this.ends = new Map();
      for (const entry of this.entries) {
        for (const [map, time] of [[this.starts, entry.startMs], [this.ends, entry.endMs]]) {
          if (!map.has(time)) map.set(time, new Set());
          map.get(time).add(entry.event);
        }
      }
      const touches = (map, event, time) => {
        const events = map.get(time);
        return !!events && (events.size > 1 || !events.has(event));
      };
      this.boundaryLookup = {
        isEventOverlappedAtLayout: (event, time) => this.overlapsOtherEvent(event, time),
        isEventTouchingAtStartLayout: (event, time) => touches(this.ends, event, time),
        isEventTouchingAtEndLayout: (event, time) => touches(this.starts, event, time)
      };
    }

    query(startMs, endMs) {
      const hits = [];
      if (!(endMs > startMs)) return hits;
      const visit = (from, to) => {
        if (from >= to) return;
        const middle = (from + to) >>> 1;
        if (this.maxEnds[middle] <= startMs) return;
        visit(from, middle);
        const entry = this.entries[middle];
        if (entry.startMs >= endMs) return;
        if (entry.endMs > startMs) hits.push(entry);
        visit(middle + 1, to);
      };
      visit(0, this.entries.length);
      // Keep the source event order, including ties used for painting and selection.
      return hits.sort((a, b) => a.order - b.order);
    }

    overlapsOtherEvent(event, time) {
      const visit = (from, to) => {
        if (from >= to) return false;
        const middle = (from + to) >>> 1;
        if (this.maxEnds[middle] <= time) return false;
        if (visit(from, middle)) return true;
        const entry = this.entries[middle];
        if (entry.startMs > time) return false;
        return (entry.endMs > time && entry.event !== event) || visit(middle + 1, to);
      };
      return visit(0, this.entries.length);
    }
  }

  scope.SpiralEventIntervalIndex = SpiralEventIntervalIndex;

  Object.assign(SpiralCalendar.prototype, {
    getEventIntervalIndex() {
      const events = this.getVisibleEvents();
      const zone = this.getCalendarTimeZone();
      const cached = this._eventIntervalIndex;
      if (cached?.events === events && cached.zone === zone) return cached.index;
      const entries = events.flatMap(event => {
        const projection = this.getEventProjection(event, zone);
        return projection.intervals.map(displayInterval => ({ event, projection, displayInterval,
          startMs: displayInterval.layoutStartMs, endMs: displayInterval.layoutEndMs }));
      });
      const index = new SpiralEventIntervalIndex(entries);
      this._eventIntervalIndex = { events, zone, index };
      return index;
    },

    getEventIntervalsForWindow() {
      const index = this.getEventIntervalIndex();
      const from = this.visibleWindowStart().getTime();
      const to = this.visibleWindowEnd().getTime();
      if (index.windowCache?.from !== from || index.windowCache.to !== to) {
        index.windowCache = { from, to, entries: index.query(from, to) };
      }
      return index.windowCache.entries;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
