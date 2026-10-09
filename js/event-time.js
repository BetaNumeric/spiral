// The canvas still consumes wall-clock Date coordinates. Only this adapter
// converts versioned events to/from the canonical instants used by storage and sharing.
Object.assign(SpiralCalendar.prototype, {
  getCalendarTimeZone() {
    const zone = this.state?.useLocationTimezone && this.state.locationTimezoneId;
    return zone && SpiralTime.validTimeZone(zone) ? zone : SpiralTime.deviceTimeZone();
  },

  getEventTimeProjections() {
    return this._eventTimeProjections || (this._eventTimeProjections = new WeakMap());
  },

  projectEventTime(event) {
    if (event.timeModel !== 'instant-v1') return event; // Unclassified legacy dates retain their existing meaning.
    const start = new Date(event.start);
    const end = new Date(event.end);
    const zone = this.getCalendarTimeZone();
    event.start = event.allDay && event.startDate
      ? SpiralTime.parseWall(`${event.startDate}T00:00`) : SpiralTime.instantToWall(start, zone);
    event.end = event.allDay && event.endDate
      ? SpiralTime.parseWall(`${event.endDate}T00:00`) : SpiralTime.instantToWall(end, zone);
    if (!Number.isFinite(event.start.getTime()) || !Number.isFinite(event.end.getTime())) {
      throw new Error('Invalid calendar date.');
    }
    if (event.end <= event.start) {
      throw new Error('An event crosses a repeated clock hour that Spiral cannot yet display in this time zone. Choose another display time zone.');
    }
    this.getEventTimeProjections().set(event, {
      zone, startWall: event.start.getTime(), endWall: event.end.getTime(),
      startInstant: start.getTime(), endInstant: end.getTime()
    });
    return event;
  },

  getEventInstant(event, type) {
    if (event.timeModel !== 'instant-v1') return new Date(event[type]);
    const projection = this.getEventTimeProjections().get(event);
    const wallMs = new Date(event[type]).getTime();
    if (projection && projection[`${type}Wall`] === wallMs) return new Date(projection[`${type}Instant`]);
    const notBefore = type === 'end' ? this.getEventInstant(event, 'start').getTime() + 1 : -Infinity;
    const instant = SpiralTime.wallToInstant(wallMs, projection?.zone || this.getCalendarTimeZone(), { notBefore });
    if (projection) {
      projection[`${type}Wall`] = wallMs;
      projection[`${type}Instant`] = instant.getTime();
    }
    return instant;
  },

  initializeEventTime(event, { rejectGap = false } = {}) {
    const zone = this.getCalendarTimeZone();
    const disambiguation = rejectGap ? 'reject' : 'compatible';
    const start = SpiralTime.wallToInstant(event.start, zone, { disambiguation });
    const end = SpiralTime.wallToInstant(event.end, zone, { disambiguation, notBefore: start.getTime() + 1 });
    event.timeModel = 'instant-v1';
    event.start = start;
    event.end = end;
    return this.projectEventTime(event);
  },

  getDefaultEventEnd(start, event = null) {
    const nextHour = new Date(start.getTime() + SpiralTime.HOUR);
    if (event && event.timeModel !== 'instant-v1') return nextHour;
    const zone = (event && this.getEventTimeProjections().get(event)?.zone) || this.getCalendarTimeZone();
    return SpiralTime.instantToWall(SpiralTime.wallToInstant(nextHour, zone), zone);
  },

  applyEventTimeRange(event, start, end) {
    if (![start, end].every(d => Number.isFinite(d.getTime())) || end <= start) return false;
    if (event.timeModel === 'instant-v1') {
      try {
        const zone = this.getEventTimeProjections().get(event)?.zone || this.getCalendarTimeZone();
        SpiralTime.wallToInstant(start, zone, { disambiguation: 'reject' });
        SpiralTime.wallToInstant(end, zone, { disambiguation: 'reject' });
      } catch (error) { alert(error.message); return false; }
    }
    event.start = start;
    event.end = end;
    return true;
  },

  setEventHandleTime(event, type, value) {
    if (!['start', 'end'].includes(type) || !Number.isFinite(value.getTime())) return false;
    const other = type === 'start' ? 'end' : 'start';
    const minimumDuration = 5 * 60000;
    let changed;
    if (event.timeModel === 'instant-v1') {
      const projection = this.getEventTimeProjections().get(event);
      const zone = projection?.zone || this.getCalendarTimeZone();
      const candidate = SpiralTime.wallToInstant(value, zone).getTime();
      const bound = this.getEventInstant(event, other).getTime();
      const instant = type === 'start' ? Math.min(candidate, bound - minimumDuration)
        : Math.max(candidate, bound + minimumDuration);
      changed = SpiralTime.instantToWall(instant, zone);
      // The current renderer needs a positive wall interval even during a repeated hour.
      if (type === 'start' ? changed >= event.end : changed <= event.start) return false;
      if (projection) {
        projection[`${type}Wall`] = changed.getTime();
        projection[`${type}Instant`] = instant;
      }
    } else {
      const bound = event[other].getTime();
      changed = new Date(type === 'start' ? Math.min(value.getTime(), bound - minimumDuration)
        : Math.max(value.getTime(), bound + minimumDuration));
    }
    event[type] = changed;
    event.lastModified = Date.now();
    return true;
  },

  serializeEventTime(event) {
    const start = this.getEventInstant(event, 'start');
    const end = this.getEventInstant(event, 'end');
    const result = { ...event, start: start.toISOString(), end: end.toISOString() };
    if (event.timeModel === 'instant-v1') {
      if (end <= start) throw new Error('The event must end after it starts.');
      // A time edit changes an all-day event into a timed event; date edits retain exclusivity.
      const allDay = event.allDay && [event.start, event.end].every(d =>
        d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0);
      if (allDay) {
        result.startDate = SpiralTime.formatWall(event.start).split('T')[0];
        result.endDate = SpiralTime.formatWall(event.end).split('T')[0];
      } else {
        delete result.allDay;
        delete result.startDate;
        delete result.endDate;
      }
    }
    return result;
  },

  reprojectEventTimes() {
    const changed = this.events.filter(e => e.timeModel === 'instant-v1');
    const records = changed.map(e => this.serializeEventTime(e));
    const projected = records.map(record => this.projectEventTime({ ...record }));
    changed.forEach((event, i) => {
      Object.assign(event, projected[i]);
      if (!records[i].allDay) {
        delete event.allDay;
        delete event.startDate;
        delete event.endDate;
      }
      this.copyEventTimeProjection(projected[i], event);
    });
    this._eventsVersion++;
    this.layoutCache = null;
    this.requestEventListRender?.();
  },

  copyEventTimeProjection(source, target) {
    const projection = this.getEventTimeProjections().get(source);
    if (projection) this.getEventTimeProjections().set(target, { ...projection });
  },

  formatEventIcsDates(event) {
    const record = this.serializeEventTime(event);
    if (record.timeModel === 'instant-v1' && record.allDay) {
      return `DTSTART;VALUE=DATE:${record.startDate.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${record.endDate.replace(/-/g, '')}\r\n`;
    }
    return `DTSTART:${formatIcsDateUTC(record.start)}\r\nDTEND:${formatIcsDateUTC(record.end)}\r\n`;
  }
});
