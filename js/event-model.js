// Canonical records contain UTC instants, a permanent UID, and an increasing revision.
(function (scope) {
  'use strict';
  const MAX_SEQUENCE = 2147483647;

  function createUID() {
    if (scope.crypto?.randomUUID) return `spiral-${scope.crypto.randomUUID()}`;
    const bytes = new Uint8Array(16);
    if (!scope.crypto?.getRandomValues) throw new Error('Secure event IDs are unavailable in this browser.');
    scope.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `spiral-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function sequence(value = 0) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_SEQUENCE) throw new Error('Invalid event revision number.');
    return value;
  }

  function initializeIdentity(event) {
    if (!event.persistentUID) event.persistentUID = createUID();
    if (typeof event.persistentUID !== 'string' || !event.persistentUID.trim() || /[\x00-\x1f\x7f]/.test(event.persistentUID)) {
      throw new Error('Invalid event UID.');
    }
    event.sequence = sequence(event.sequence);
    return event;
  }

  function parseInstant(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }
    if (typeof value === 'string') {
      const match = value.match(/^(.+T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})$/);
      if (match && Number.isFinite(SpiralTime.parseWall(match[1]).getTime())) {
        const date = new Date(value);
        if (Number.isFinite(date.getTime())) return date;
      }
    }
    throw new Error('Event timestamps must be valid ISO dates with an explicit UTC offset.');
  }

  function normalize(input, { stored = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid event record.');
    if (input.timeModel && input.timeModel !== 'instant-v1') throw new Error('Unsupported event time format.');
    if (stored && (input.timeModel !== 'instant-v1' || !input.persistentUID || input.sequence === undefined)) {
      throw new Error('Stored events do not use the current event format.');
    }
    const start = parseInstant(input.start);
    const end = parseInstant(input.end);
    if (end <= start) throw new Error('The event must end after it starts.');
    const record = initializeIdentity({
      persistentUID: input.persistentUID || '', sequence: input.sequence,
      timeModel: 'instant-v1',
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled Event',
      description: typeof input.description === 'string' ? input.description : '',
      calendar: typeof input.calendar === 'string' && input.calendar.trim() ? input.calendar.trim() : 'Home',
      start: start.toISOString(), end: end.toISOString(),
      color: typeof input.color === 'string' ? input.color : '#ff6b6b',
      colorIsCustom: input.colorIsCustom === true,
      addedToCalendar: input.addedToCalendar === true,
      lastModified: Number.isFinite(new Date(input.lastModified).getTime()) && typeof input.lastModified === 'number' ? input.lastModified : Date.now(),
      lastAddedToCalendar: Number.isFinite(new Date(input.lastAddedToCalendar).getTime()) && typeof input.lastAddedToCalendar === 'number' ? input.lastAddedToCalendar : null
    });
    if (Number.isInteger(input.colorSeed) && input.colorSeed >= 0 && input.colorSeed <= 0xffffffff) record.colorSeed = input.colorSeed;
    if (input.allDay === true) {
      const startDate = typeof input.startDate === 'string' ? SpiralTime.parseWall(`${input.startDate}T00:00`) : new Date(NaN);
      const endDate = typeof input.endDate === 'string' ? SpiralTime.parseWall(`${input.endDate}T00:00`) : new Date(NaN);
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
        throw new Error('All-day events need valid start and exclusive end dates.');
      }
      record.allDay = true;
      record.startDate = input.startDate;
      record.endDate = input.endDate;
    }
    return record;
  }

  function validateUnique(records) {
    const seen = new Set();
    for (const record of records) {
      if (seen.has(record.persistentUID)) throw new Error(`Duplicate event UID: ${record.persistentUID}.`);
      seen.add(record.persistentUID);
    }
    return records;
  }

  function fingerprint(record) {
    return JSON.stringify([record.title, record.description, record.calendar, record.start, record.end,
      !!record.allDay, record.startDate || '', record.endDate || '',
      !!record.colorIsCustom, record.colorIsCustom ? record.color : '']);
  }

  class Revisions {
    constructor() { this.records = new Map(); }
    reset(records) {
      this.records = new Map(validateUnique(records).map(record => [record.persistentUID, {
        fingerprint: fingerprint(record), sequence: sequence(record.sequence), lastModified: record.lastModified
      }]));
    }
    prepare(records) {
      validateUnique(records);
      const prepared = records.map(record => {
        const previous = this.records.get(record.persistentUID);
        const changed = previous && previous.fingerprint !== fingerprint(record);
        const nextSequence = Math.max(sequence(record.sequence), previous ? previous.sequence + (changed ? 1 : 0) : 0);
        sequence(nextSequence); // Check overflow before changing any tracked revision.
        return { ...record, sequence: nextSequence,
          lastModified: changed ? Math.max(Date.now(), record.lastModified || 0, previous.lastModified || 0) : record.lastModified };
      });
      this.reset(prepared);
      return prepared;
    }
  }

  scope.SpiralEventModel = Object.freeze({ createUID, sequence, initializeIdentity, parseInstant,
    normalize, validateUnique, fingerprint, Revisions });
})(typeof globalThis !== 'undefined' ? globalThis : window);
