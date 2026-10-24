// Runtime event Dates always represent actual instants. Only projections encode wall coordinates.
Object.assign(SpiralCalendar.prototype, {
  getCalendarTimeZone() {
    if (this._renderTimeZone) return this._renderTimeZone;
    const zone = this.state?.useLocationTimezone && this.state.locationTimezoneId;
    return zone && SpiralTime.validTimeZone(zone) ? zone : SpiralTime.deviceTimeZone();
  },

  getDisplayInstant() {
    if (this.autoTimeAlignState?.enabled) return new Date();
    const layoutMs = this.referenceTime.getTime() + this.state.rotation / (2 * Math.PI) * 24 * SpiralTime.HOUR;
    const clock = SpiralEventProjection.clockTime(layoutMs, this.getCalendarTimeZone());
    if (Number.isFinite(clock.instantMs)) return new Date(clock.instantMs);
    const wall = this.getDisplayTime();
    const interval = this.mouseState?.selectedSegment && this.state.detailViewDay !== null
      ? this.getDetailViewEventState()?.activeDisplayInterval : null;
    if (interval?.offsetMs != null && interval.startMs <= wall.getTime() && wall.getTime() < interval.endMs) {
      return new Date(wall.getTime() - interval.offsetMs);
    }
    return SpiralTime.wallToInstant(wall, this.getCalendarTimeZone());
  },

  getEventProjection(event, zone = this.getCalendarTimeZone()) {
    const cache = this._eventDisplayProjections || (this._eventDisplayProjections = new WeakMap());
    const previous = cache.get(event);
    const startMs = new Date(event.start).getTime();
    const endMs = new Date(event.end).getTime();
    if (previous && previous.zone === zone && previous.startInstantMs === startMs && previous.endInstantMs === endMs
      && previous.allDay === (event.allDay === true) && previous.startDate === event.startDate && previous.endDate === event.endDate) return previous;
    const projection = SpiralEventProjection.project(event, zone);
    cache.set(event, projection);
    return projection;
  },

  getEventWallDate(event, type) {
    if (!['start', 'end'].includes(type)) throw new Error('Invalid event endpoint.');
    return new Date(this.getEventProjection(event)[`${type}Ms`]);
  },

  normalizeRuntimeEvent(event) {
    const record = SpiralEventModel.normalize(event);
    const normalized = { ...record, start: new Date(record.start), end: new Date(record.end) };
    const projection = this.getEventProjection(normalized);
    Object.assign(event, normalized);
    this._eventDisplayProjections.set(event, projection);
    return event;
  },

  getEventInstant(event, type) {
    if (!['start', 'end'].includes(type)) throw new Error('Invalid event endpoint.');
    return SpiralEventModel.parseInstant(event[type]);
  },

  resolveNewEventWallTime(wall, { occurrence, disambiguation = 'reject', notBefore = -Infinity } = {}) {
    if (occurrence === undefined) return SpiralTime.wallToInstant(wall, this.getCalendarTimeZone(), { disambiguation, notBefore });
    const chosen = SpiralTime.possibleInstants(wall, this.getCalendarTimeZone())[occurrence];
    if (!chosen || chosen.getTime() < notBefore) throw new Error('Choose an occurrence with the end after the start.');
    return chosen;
  },

  initializeEventFromWallTimes(event, { rejectGap = false, startOccurrence, endOccurrence } = {}) {
    const disambiguation = rejectGap ? 'reject' : 'compatible';
    const start = this.resolveNewEventWallTime(event.start, { disambiguation, occurrence: startOccurrence });
    const end = this.resolveNewEventWallTime(event.end, { disambiguation, occurrence: endOccurrence, notBefore: start.getTime() + 1 });
    const candidate = this.normalizeRuntimeEvent({ ...event, timeModel: 'instant-v1', start, end });
    Object.assign(event, candidate);
    return event;
  },

  getDefaultEventRange(startWall, options = {}) {
    const start = this.resolveNewEventWallTime(startWall, options);
    return { start, end: new Date(start.getTime() + SpiralTime.HOUR) };
  },

  getDefaultEventEnd(startWall, options = {}) {
    return SpiralTime.instantToWall(this.getDefaultEventRange(startWall, options).end, this.getCalendarTimeZone());
  },

  resolveEventWallTime(event, type, wall, { disambiguation = 'reject', notBefore = -Infinity, occurrence, preferredOffsetMs } = {}) {
    const zone = this.getCalendarTimeZone();
    if (occurrence !== undefined) {
      return this.resolveNewEventWallTime(wall, { occurrence, notBefore });
    }
    if (event.allDay) return SpiralTime.wallToInstant(wall, zone, { disambiguation, notBefore });
    if (Number.isFinite(preferredOffsetMs)) {
      const preferred = wall.getTime() - preferredOffsetMs;
      if (preferred >= notBefore && SpiralTime.instantToWall(preferred, zone).getTime() === wall.getTime()) return new Date(preferred);
    }
    const current = this.getEventInstant(event, type);
    if (this.getEventWallDate(event, type).getTime() === wall.getTime() && current.getTime() >= notBefore) return current;
    // Keep the current occurrence when editing within an ambiguous repeated hour.
    const preferred = wall.getTime() - SpiralTime.offsetHours(current, zone) * SpiralTime.HOUR;
    if (preferred >= notBefore && SpiralTime.instantToWall(preferred, zone).getTime() === wall.getTime()) return new Date(preferred);
    return SpiralTime.wallToInstant(wall, zone, { disambiguation, notBefore });
  },

  applyEventTimeRange(event, startWall, endWall, { startOccurrence, endOccurrence } = {}) {
    if (![startWall, endWall].every(date => Number.isFinite(date.getTime()))) return false;
    try {
      const start = this.resolveEventWallTime(event, 'start', startWall, { occurrence: startOccurrence });
      const end = this.resolveEventWallTime(event, 'end', endWall, { notBefore: start.getTime() + 1, occurrence: endOccurrence });
      const candidate = { ...event, start, end };
      const allDay = event.allDay && [startWall, endWall].every(date =>
        date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0);
      if (allDay) {
        candidate.startDate = SpiralTime.formatWall(startWall).split('T')[0];
        candidate.endDate = SpiralTime.formatWall(endWall).split('T')[0];
      } else { delete candidate.allDay; delete candidate.startDate; delete candidate.endDate; }
      this.getEventProjection(candidate);
      Object.assign(event, candidate);
      if (!allDay) { delete event.allDay; delete event.startDate; delete event.endDate; }
      return true;
    } catch (error) { this.recordStudyValidationFailure?.('event_time_range', error, event); alert(error.message); return false; }
  },

  setEventHandleTime(event, type, wall, { preferredOffsetMs } = {}) {
    if (!['start', 'end'].includes(type) || !Number.isFinite(wall.getTime())) return false;
    const other = type === 'start' ? 'end' : 'start';
    const minimumDuration = 5 * 60000;
    const base = event.allDay ? { ...event,
      start: SpiralTime.wallToInstant(this.getEventWallDate(event, 'start'), this.getCalendarTimeZone()),
      end: SpiralTime.wallToInstant(this.getEventWallDate(event, 'end'), this.getCalendarTimeZone())
    } : event;
    const bound = this.getEventInstant(base, other).getTime();
    const candidateMs = this.resolveEventWallTime(event, type, wall, { disambiguation: 'compatible', preferredOffsetMs }).getTime();
    const instantMs = type === 'start' ? Math.min(candidateMs, bound - minimumDuration) : Math.max(candidateMs, bound + minimumDuration);
    const candidate = { ...base, [type]: new Date(instantMs) };
    const changedWall = SpiralTime.instantToWall(instantMs, this.getCalendarTimeZone());
    const otherWall = this.getEventWallDate(event, other);
    if (event.allDay) {
      const startWall = type === 'start' ? changedWall : otherWall;
      const endWall = type === 'end' ? changedWall : otherWall;
      const allDay = [startWall, endWall].every(date => date.getUTCHours() === 0 && date.getUTCMinutes() === 0
        && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0);
      if (allDay) {
        candidate.startDate = SpiralTime.formatWall(startWall).split('T')[0];
        candidate.endDate = SpiralTime.formatWall(endWall).split('T')[0];
      } else { delete candidate.allDay; delete candidate.startDate; delete candidate.endDate; }
    }
    this.getEventProjection(candidate);
    Object.assign(event, candidate, { lastModified: Date.now() });
    if (!candidate.allDay) { delete event.allDay; delete event.startDate; delete event.endDate; }
    if (event.isDraft) event.autoEnd = false;
    return true;
  },

  getAdjustedEventWallEnd(event, startWall, requestedEnd, options = {}) {
    if (requestedEnd > startWall) return requestedEnd;
    try {
      const start = this.resolveEventWallTime(event, 'start', startWall, { occurrence: options.startOccurrence });
      this.resolveEventWallTime(event, 'end', requestedEnd, { notBefore: start.getTime() + 1, occurrence: options.endOccurrence });
      return requestedEnd;
    } catch (error) {
      if (options.startOccurrence !== undefined || options.endOccurrence !== undefined) throw error;
      const start = this.resolveEventWallTime(event, 'start', startWall);
      return SpiralTime.instantToWall(start.getTime() + SpiralTime.HOUR, this.getCalendarTimeZone());
    }
  },

  formatEventOffset(offset) {
    const minutes = Math.round(Math.abs(offset) / 60000);
    return `UTC${offset < 0 ? '-' : '+'}${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  },

  getEventEndpointLabel(event, type) {
    const wall = this.getEventWallDate(event, type);
    const label = this.formatDateTimeCompact(wall);
    if (event.allDay || SpiralTime.possibleInstants(wall, this.getCalendarTimeZone()).length < 2) return label;
    return `${label}\n${this.formatEventOffset(wall.getTime() - this.getEventInstant(event, type).getTime())}`;
  },

  getEventDurationLabel(event) {
    if (event.allDay) {
      const days = (SpiralTime.parseWall(`${event.endDate}T00:00`) - SpiralTime.parseWall(`${event.startDate}T00:00`)) / SpiralTime.DAY;
      return `${days} ${days === 1 ? 'day' : 'days'} (all day)`;
    }
    const duration = this.getEventInstant(event, 'end') - this.getEventInstant(event, 'start');
    const hours = Math.floor(duration / SpiralTime.HOUR);
    const minutes = Math.floor(duration % SpiralTime.HOUR / 60000);
    const seconds = Math.round(duration % 60000) / 1000;
    return [[hours, 'hour'], [minutes, 'minute'], [seconds, 'second']]
      .filter(([value]) => value > 0)
      .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`).join(' ');
  },

  serializeEventTime(event) {
    return SpiralEventModel.normalize(event);
  },

  refreshEventProjections() {
    // Prepare all projections first so an unsupported zone change can be rolled back.
    for (const event of [...this.events, ...(this.draftEvent ? [this.draftEvent] : [])]) this.getEventProjection(event);
    this._eventsVersion++;
    this.layoutCache = null;
    this.refreshEventCreationPanel?.();
    this.requestEventListRender?.();
  },

  formatEventIcsDates(event) {
    const record = this.serializeEventTime(event);
    if (record.allDay) return `DTSTART;VALUE=DATE:${record.startDate.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${record.endDate.replace(/-/g, '')}\r\n`;
    return `DTSTART:${formatIcsDateUTC(record.start)}\r\nDTEND:${formatIcsDateUTC(record.end)}\r\n`;
  }
});
