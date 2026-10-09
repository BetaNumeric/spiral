// A deliberately bounded iCalendar importer. Unsupported scheduling semantics
// fail before any events are merged, rather than silently losing occurrences.
(function (scope) {
  'use strict';
  const text = value => value.replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? '\n' : c);

  function property(line) {
    // Colons and semicolons inside quoted parameters do not delimit a property.
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      if (line[i] === ':' && !quoted) { colon = i; break; }
    }
    if (colon < 1) throw new Error('Invalid calendar property.');
    const header = line.slice(0, colon).match(/(?:[^;"\r\n]|"[^"]*")+/g);
    const params = {};
    for (const part of header.slice(1)) {
      const equal = part.indexOf('=');
      if (equal < 1) throw new Error('Invalid calendar parameter.');
      params[part.slice(0, equal).toUpperCase()] = part.slice(equal + 1).replace(/^"|"$/g, '');
    }
    return { name: header[0].toUpperCase(), params, value: line.slice(colon + 1) };
  }

  function dateProperty(prop, defaultZone) {
    if (!prop) throw new Error('A calendar event has no start date.');
    const match = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!match) throw new Error(`Invalid ${prop.name} date.`);
    const [, y, m, d, h, min, second, utc] = match;
    const allDay = h === undefined;
    if ((prop.params.VALUE && prop.params.VALUE !== (allDay ? 'DATE' : 'DATE-TIME')) || ((utc || allDay) && prop.params.TZID)) {
      throw new Error(`Invalid ${prop.name} date parameters.`);
    }
    const wall = SpiralTime.parseWall(`${y}-${m}-${d}T${h || '00'}:${min || '00'}:${second === '60' ? '59' : second || '00'}`);
    if (!Number.isFinite(wall.getTime())) throw new Error(`Invalid ${prop.name} date.`);
    const zone = utc ? 'UTC' : prop.params.TZID || defaultZone;
    if (!SpiralTime.validTimeZone(zone)) throw new Error(`Unsupported calendar time zone: ${zone}. No events were imported.`);
    return { wall, zone, allDay, instant: utc ? wall : SpiralTime.wallToInstant(wall, zone) };
  }

  function duration(value) {
    const match = value.match(/^\+?P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/);
    if (!match || !match.slice(1).some(v => v !== undefined) || value.endsWith('T')) throw new Error('Invalid calendar duration.');
    const [, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
    return { days: Number(weeks) * 7 + Number(days), milliseconds: (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 };
  }

  function parse(content, defaultZone) {
    const lines = content.replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    const stack = [];
    let props = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      const prop = property(line);
      if (prop.name === 'BEGIN') {
        stack.push(prop.value.toUpperCase());
        if (prop.value.toUpperCase() === 'VEVENT') {
          if (props) throw new Error('Nested calendar events are invalid.');
          props = new Map();
        }
        continue;
      }
      if (prop.name === 'END') {
        if (stack.pop() !== prop.value.toUpperCase()) throw new Error('Incomplete calendar component.');
        if (prop.value.toUpperCase() !== 'VEVENT') continue;
        const start = dateProperty(props.get('DTSTART'), defaultZone);
        let end;
        const endProp = props.get('DTEND');
        const durationProp = props.get('DURATION');
        if (endProp && durationProp) throw new Error('Calendar events cannot have both an end date and a duration.');
        if (endProp) {
          end = dateProperty(endProp, defaultZone);
          if (end.allDay !== start.allDay) throw new Error('Calendar start and end must use the same date type.');
        } else {
          const span = durationProp ? duration(durationProp.value) : { days: start.allDay ? 1 : 0, milliseconds: 0 };
          if (start.allDay && span.milliseconds) throw new Error('All-day duration must use days or weeks.');
          // Nominal days are added in the source zone; hours/minutes/seconds are elapsed time.
          const wallEnd = new Date(start.wall.getTime() + span.days * SpiralTime.DAY);
          const dayEnd = span.days ? SpiralTime.wallToInstant(wallEnd, start.zone) : start.instant;
          end = { allDay: start.allDay, wall: wallEnd, instant: new Date(dayEnd.getTime() + span.milliseconds) };
        }
        if (end.instant <= start.instant) throw new Error('A calendar event must end after it starts.');
        const event = {
          title: text(props.get('SUMMARY')?.value || 'Untitled Event'),
          description: text(props.get('DESCRIPTION')?.value || ''),
          calendar: text(props.get('X-SPIRAL-CALENDAR')?.value || 'Home'),
          persistentUID: props.get('UID')?.value.trim() || '',
          start: start.instant, end: end.instant, timeModel: 'instant-v1'
        };
        if (start.allDay) {
          event.allDay = true;
          event.startDate = SpiralTime.formatWall(start.wall).split('T')[0];
          event.endDate = SpiralTime.formatWall(end.wall).split('T')[0];
        } else if (SpiralTime.instantToWall(end.instant, defaultZone) <= SpiralTime.instantToWall(start.instant, defaultZone)) {
          throw new Error('An event crosses a repeated clock hour that Spiral cannot yet display. No events were imported.');
        }
        const color = props.get('X-SPIRAL-COLOR') || props.get('COLOR');
        if (color) { event.color = color.value.trim(); event.colorIsCustom = true; }
        events.push(event);
        props = null;
        continue;
      }
      if (stack.at(-1) === 'VCALENDAR' && prop.name === 'METHOD' && prop.value.toUpperCase() === 'CANCEL') {
        throw new Error('Calendar cancellations are not supported yet. No events were imported.');
      }
      if (stack.at(-1) !== 'VEVENT') continue; // Alarm dates/durations belong to the alarm, not its event.
      if (['RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID', 'EXRULE'].includes(prop.name)) {
        throw new Error('Repeating calendar events are not supported yet. Export individual occurrences to import them. No events were imported.');
      }
      if (prop.name === 'STATUS' && prop.value.toUpperCase() === 'CANCELLED') {
        throw new Error('Calendar cancellations are not supported yet. No events were imported.');
      }
      if (props.has(prop.name) && ['DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'DESCRIPTION', 'UID'].includes(prop.name)) {
        throw new Error(`Duplicate calendar property: ${prop.name}.`);
      }
      props.set(prop.name, prop);
    }
    if (stack.length || props) throw new Error('Incomplete calendar file. No events were imported.');
    return events;
  }

  scope.SpiralICalendar = Object.freeze({ parse });
})(typeof globalThis !== 'undefined' ? globalThis : window);
