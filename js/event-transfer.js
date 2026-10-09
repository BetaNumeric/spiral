// One import merge and one VEVENT serializer serve every calendar sharing path.
Object.assign(SpiralCalendar.prototype, {
  mergeImportedEvents(incomingEvents) {
    SpiralEventModel.validateUnique(incomingEvents);
    SpiralEventModel.validateUnique(this.events);
    const existingById = new Map(this.events.map(event => [event.persistentUID, event]));
    const stats = { added: 0, updated: 0, skipped: 0, stale: 0 };
    // Validate and plan the entire merge before changing the live collection.
    const changes = incomingEvents.map(incoming => {
      const record = this.serializeEventTime(incoming);
      const existing = existingById.get(record.persistentUID);
      if (!existing) { stats.added++; return { incoming }; }
      const previous = this.serializeEventTime(existing);
      if (record.sequence < previous.sequence) { stats.skipped++; stats.stale++; return null; }
      if (record.sequence === previous.sequence && SpiralEventModel.fingerprint(record) === SpiralEventModel.fingerprint(previous)) {
        stats.skipped++;
        return null;
      }
      stats.updated++;
      return { incoming, existing };
    });
    for (const change of changes) {
      if (!change) continue;
      const { incoming, existing } = change;
      if (!existing) { this.events.push(incoming); continue; }
      const sharing = { addedToCalendar: existing.addedToCalendar, lastAddedToCalendar: existing.lastAddedToCalendar };
      Object.assign(existing, incoming, sharing);
      if (!incoming.allDay) {
        delete existing.allDay;
        delete existing.startDate;
        delete existing.endDate;
      }
    }
    return stats;
  },

  formatEventIcs(event) {
    const record = this.serializeEventTime(event);
    const lines = [
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(record.persistentUID)}`,
      `SEQUENCE:${record.sequence}`,
      `DTSTAMP:${formatIcsDateUTC(new Date())}`,
      `LAST-MODIFIED:${formatIcsDateUTC(new Date(record.lastModified))}`,
      ...this.formatEventIcsDates(event).trim().split('\r\n'),
      `SUMMARY:${escapeIcsText(record.title)}`,
      `DESCRIPTION:${escapeIcsText(record.description)}`,
      `X-SPIRAL-CALENDAR:${escapeIcsText(record.calendar)}`,
      `X-SPIRAL-COLOR:${escapeIcsText(record.color)}`,
      `X-SPIRAL-COLOR-CUSTOM:${record.colorIsCustom ? 'TRUE' : 'FALSE'}`,
      ...(record.colorSeed !== undefined ? [`X-SPIRAL-COLOR-SEED:${record.colorSeed}`] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT'
    ];
    // iCalendar lines are limited to 75 UTF-8 octets, including the continuation space.
    const encoder = new TextEncoder();
    return lines.map(line => {
      const parts = [];
      let part = '';
      let bytes = 0;
      for (const character of line) {
        const length = encoder.encode(character).length;
        if (bytes + length > 75) { parts.push(part); part = ' '; bytes = 1; }
        part += character;
        bytes += length;
      }
      parts.push(part);
      return parts.join('\r\n');
    }).join('\r\n') + '\r\n';
  }
});
