// Calendar dates are wall-clock coordinates; instants are points on the UTC timeline.
// Keep the conversion independent of the canvas, inputs, and storage.
(function (scope) {
  'use strict';
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const formatters = new Map();

  function parseWall(value) {
    const match = typeof value === 'string' && value.trim().match(
      /^([+-]?\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
    );
    if (!match) return new Date(NaN);
    const [, y, m, d, h, min, s = '0', ms = '0'] = match;
    const fields = [+y, +m - 1, +d, +h, +min, +s, +ms.padEnd(3, '0')];
    const result = new Date(0);
    result.setUTCFullYear(fields[0], fields[1], fields[2]);
    result.setUTCHours(fields[3], fields[4], fields[5], fields[6]);
    const actual = [result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate(),
      result.getUTCHours(), result.getUTCMinutes(), result.getUTCSeconds(), result.getUTCMilliseconds()];
    return actual.every((v, i) => v === fields[i]) ? result : new Date(NaN);
  }

  function formatWall(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    const year = d.getUTCFullYear();
    const yyyy = `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}`;
    const pad = n => String(n).padStart(2, '0');
    return `${yyyy}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  function formatter(timeZone) {
    if (!formatters.has(timeZone)) {
      formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
        timeZone, era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }));
    }
    return formatters.get(timeZone);
  }

  function deviceTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  function validTimeZone(timeZone) {
    try { formatter(timeZone); return typeof timeZone === 'string' && !!timeZone; }
    catch (_) { return false; }
  }

  function instantToWall(value, timeZone) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) throw new Error('Invalid event timestamp.');
    const parts = Object.fromEntries(formatter(timeZone).formatToParts(d).map(p => [p.type, p.value]));
    const result = new Date(0);
    const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
    result.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
    result.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), d.getUTCMilliseconds());
    return result;
  }

  function offsetHours(value, timeZone) {
    const d = new Date(value);
    return (instantToWall(d, timeZone).getTime() - d.getTime()) / HOUR;
  }

  function wallCandidates(value, timeZone) {
    const wallMs = new Date(value).getTime();
    if (!Number.isFinite(wallMs)) throw new Error('Invalid event date.');
    // Probe both sides of nearby offset transitions, including half-hour DST changes.
    const offsets = new Set();
    for (let delta = -48; delta <= 48; delta += 6) {
      offsets.add(offsetHours(wallMs + delta * HOUR, timeZone) * HOUR);
    }
    const candidates = [...offsets].map(offset => wallMs - offset);
    const exact = candidates.filter(ms => instantToWall(ms, timeZone).getTime() === wallMs).sort((a, b) => a - b);
    return { wallMs, candidates, exact };
  }

  function possibleInstants(value, timeZone) {
    return wallCandidates(value, timeZone).exact.map(ms => new Date(ms));
  }

  function wallToInstant(value, timeZone, { disambiguation = 'compatible', notBefore = -Infinity } = {}) {
    const { wallMs, candidates, exact } = wallCandidates(value, timeZone);
    if (exact.length) {
      const chosen = exact.find(ms => ms >= notBefore);
      if (chosen === undefined) throw new Error('The event must end after it starts.');
      return new Date(chosen); // First occurrence in a repeated hour, unless its start requires the second.
    }
    if (disambiguation === 'reject') {
      throw new Error(`This clock time does not exist in ${timeZone} because the clocks move forward. Choose a later time.`);
    }
    // RFC 5545: use the offset before a gap, moving the result forward by the gap.
    const forward = candidates.filter(ms => ms >= notBefore && instantToWall(ms, timeZone).getTime() > wallMs)
      .sort((a, b) => instantToWall(a, timeZone) - instantToWall(b, timeZone));
    if (!forward.length) throw new Error('Unable to resolve the event time.');
    return new Date(forward[0]);
  }

  function dayStart(value) {
    const d = new Date(value);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  scope.SpiralTime = Object.freeze({ HOUR, DAY, parseWall, formatWall, deviceTimeZone,
    validTimeZone, instantToWall, wallToInstant, possibleInstants, offsetHours, dayStart });
})(typeof globalThis !== 'undefined' ? globalThis : window);
