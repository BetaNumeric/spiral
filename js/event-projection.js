// Read-only display coordinates derived from canonical instants. No event is changed.
(function (scope) {
  'use strict';
  const transitionDays = new Map();
  const repeatedDays = new Map();
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

  function repeatedHour(wallHourMs, zone) {
    const day = Math.floor(wallHourMs / SpiralTime.DAY) * SpiralTime.DAY;
    const key = `${zone}|${day}`;
    if (!repeatedDays.has(key)) {
      const hours = new Map();
      for (let utcDay = day - 2 * SpiralTime.DAY; utcDay <= day + SpiralTime.DAY; utcDay += SpiralTime.DAY) {
        for (const transition of transitionsForDay(utcDay, zone)) {
          const before = offsetMs(transition - 1, zone);
          const after = offsetMs(transition, zone);
          if (after >= before) continue;
          const repeatStart = transition + after;
          const repeatEnd = transition + before;
          for (let hour = Math.floor(repeatStart / SpiralTime.HOUR) * SpiralTime.HOUR; hour < repeatEnd; hour += SpiralTime.HOUR) {
            if (hour < day || hour >= day + SpiralTime.DAY) continue;
            const parts = [
              { startInstantMs: hour - before, endInstantMs: Math.min(hour + SpiralTime.HOUR - before, transition), offsetMs: before },
              { startInstantMs: Math.max(hour - after, transition), endInstantMs: hour + SpiralTime.HOUR - after, offsetMs: after }
            ].filter(part => part.endInstantMs > part.startInstantMs);
            const duration = parts.reduce((total, part) => total + part.endInstantMs - part.startInstantMs, 0);
            let elapsed = 0;
            const mapped = parts.map((part, occurrence) => {
              const startFraction = elapsed / duration;
              elapsed += part.endInstantMs - part.startInstantMs;
              return Object.freeze({ ...part, occurrence, startWallMs: part.startInstantMs + part.offsetMs,
                endWallMs: part.endInstantMs + part.offsetMs, startFraction, endFraction: elapsed / duration });
            });
            hours.set(hour, Object.freeze({ hourMs: hour, parts: Object.freeze(mapped) }));
          }
        }
      }
      if (repeatedDays.size >= 512) repeatedDays.delete(repeatedDays.keys().next().value);
      repeatedDays.set(key, hours);
    }
    return repeatedDays.get(key).get(wallHourMs) || null;
  }

  function layoutTime(wallMs, zone, offset) {
    if (offset == null) return wallMs;
    const hour = Math.floor(wallMs / SpiralTime.HOUR) * SpiralTime.HOUR;
    let layout = repeatedHour(hour, zone);
    // An interval ending at the transition retains its preceding offset, even
    // when its wall endpoint is the next hour's boundary.
    if (!layout && wallMs === hour) layout = repeatedHour(hour - SpiralTime.HOUR, zone);
    const part = layout?.parts.find(part => part.offsetMs === offset && part.startWallMs <= wallMs && wallMs <= part.endWallMs);
    if (!part) return wallMs;
    const fraction = part.startFraction + (wallMs - part.startWallMs) / (part.endWallMs - part.startWallMs) * (part.endFraction - part.startFraction);
    return layout.hourMs + fraction * SpiralTime.HOUR;
  }

  function clockTime(layoutMs, zone) {
    const hour = Math.floor(layoutMs / SpiralTime.HOUR) * SpiralTime.HOUR;
    const layout = repeatedHour(hour, zone);
    if (!layout) return { wallMs: layoutMs, offsetMs: undefined, occurrence: undefined };
    const fraction = (layoutMs - hour) / SpiralTime.HOUR;
    const part = layout.parts.find(part => fraction < part.endFraction) || layout.parts[layout.parts.length - 1];
    const wallMs = part.startWallMs + (fraction - part.startFraction) / (part.endFraction - part.startFraction) * (part.endWallMs - part.startWallMs);
    return { wallMs, instantMs: wallMs - part.offsetMs, offsetMs: part.offsetMs, occurrence: part.occurrence };
  }

  function layoutRanges(startMs, endMs, zone) {
    const hour = Math.floor(startMs / SpiralTime.HOUR) * SpiralTime.HOUR;
    const layout = repeatedHour(hour, zone);
    if (!layout) return [{ startMs, endMs }];
    return layout.parts.flatMap(part => {
      const from = Math.max(startMs, part.startWallMs);
      const to = Math.min(endMs, part.endWallMs);
      return from < to ? [{ startMs: layoutTime(from, zone, part.offsetMs), endMs: layoutTime(to, zone, part.offsetMs) }] : [];
    });
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
      intervals.push(Object.freeze({ index: 0, startMs: start.getTime(), endMs: end.getTime(), layoutStartMs: start.getTime(), layoutEndMs: end.getTime(), startInstantMs, endInstantMs, offsetMs: null }));
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
          layoutStartMs: layoutTime(from + offset, zone, offset), layoutEndMs: layoutTime(to + offset, zone, offset),
          startInstantMs: from, endInstantMs: to, offsetMs: offset }));
      }
    }
    return Object.freeze({ zone, startMs: start.getTime(), endMs: end.getTime(),
      layoutStartMs: layoutTime(start.getTime(), zone, event.allDay ? null : offsetMs(startInstantMs, zone)),
      layoutEndMs: layoutTime(end.getTime(), zone, event.allDay ? null : offsetMs(endInstantMs, zone)), startInstantMs, endInstantMs,
      intervals: Object.freeze(intervals),
      allDay: event.allDay === true, startDate: event.startDate, endDate: event.endDate });
  }
  scope.SpiralEventProjection = Object.freeze({ project, repeatedHour, layoutTime, clockTime, layoutRanges });
})(typeof globalThis !== 'undefined' ? globalThis : window);
