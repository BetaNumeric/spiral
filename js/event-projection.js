// Read-only display coordinates derived from canonical instants. No event is changed.
(function (scope) {
  'use strict';
  const transitionDays = new Map();
  const offsetMs = (instant, zone) => SpiralTime.instantToWall(instant, zone).getTime() - instant;

  function transitionsForDay(day, zone) {
    const key = `${zone}|${day}`;
    if (transitionDays.has(key)) return transitionDays.get(key);
    const changes = [];
    let previous = offsetMs(day, zone);
    // IANA offset changes are isolated transitions. Probe through each calendar day,
    // then find the exact millisecond of a change instead of assuming a one-hour jump.
    for (let probe = day + 6 * SpiralTime.HOUR; probe <= day + SpiralTime.DAY; probe += 6 * SpiralTime.HOUR) {
      const next = offsetMs(probe, zone);
      if (next !== previous) {
        let low = probe - 6 * SpiralTime.HOUR;
        let high = probe;
        while (high - low > 1) {
          const middle = Math.floor((low + high) / 2);
          if (offsetMs(middle, zone) === previous) low = middle;
          else high = middle;
        }
        changes.push(high);
      }
      previous = next;
    }
    if (transitionDays.size >= 2048) transitionDays.delete(transitionDays.keys().next().value);
    transitionDays.set(key, Object.freeze(changes));
    return changes;
  }

  function project(event, zone) {
    const startInstantMs = new Date(event.start).getTime();
    const endInstantMs = new Date(event.end).getTime();
    if (!Number.isFinite(startInstantMs) || !Number.isFinite(endInstantMs) || endInstantMs <= startInstantMs) {
      throw new Error('The event must have valid timestamps and end after it starts.');
    }
    const start = event.allDay ? SpiralTime.parseWall(`${event.startDate}T00:00`) : SpiralTime.instantToWall(startInstantMs, zone);
    const end = event.allDay ? SpiralTime.parseWall(`${event.endDate}T00:00`) : SpiralTime.instantToWall(endInstantMs, zone);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Invalid calendar date.');
    const intervals = [];
    if (event.allDay) {
      if (end <= start) throw new Error('The all-day event must end after it starts.');
      intervals.push(Object.freeze({ index: 0, startMs: start.getTime(), endMs: end.getTime(), startInstantMs, endInstantMs, offsetMs: null }));
    } else {
      const boundaries = [startInstantMs];
      for (let day = Math.floor(startInstantMs / SpiralTime.DAY) * SpiralTime.DAY; day < endInstantMs; day += SpiralTime.DAY) {
        for (const transition of transitionsForDay(day, zone)) {
          if (transition > startInstantMs && transition < endInstantMs) boundaries.push(transition);
        }
      }
      boundaries.push(endInstantMs);
      for (let index = 0; index < boundaries.length - 1; index++) {
        const from = boundaries[index];
        const to = boundaries[index + 1];
        const offset = offsetMs(from, zone);
        intervals.push(Object.freeze({ index, startMs: from + offset, endMs: to + offset,
          startInstantMs: from, endInstantMs: to, offsetMs: offset }));
      }
    }
    return Object.freeze({ zone, startMs: start.getTime(), endMs: end.getTime(), startInstantMs, endInstantMs,
      intervals: Object.freeze(intervals),
      allDay: event.allDay === true, startDate: event.startDate, endDate: event.endDate });
  }
  scope.SpiralEventProjection = Object.freeze({ project });
})(typeof globalThis !== 'undefined' ? globalThis : window);
