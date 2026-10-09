# Time model boundary

`js/time-model.js` owns strict calendar input parsing, wall-clock formatting,
IANA-zone conversion and daylight-saving disambiguation. Its Date values have two
distinct meanings:

- An instant is a real timestamp, suitable for storage and external calendars.
- A wall coordinate uses UTC fields to encode the date and clock time drawn by
  the existing 24-hour canvas. It is never exported as an instant directly for
  a versioned event.

`js/event-time.js` adapts these types to the existing renderer. New events and
iCalendar imports carry `timeModel: "instant-v1"`. Storage, JSON downloads,
calendar sharing, and study event descriptors use canonical instants. Loading
and changing the selected zone project them into canvas coordinates. A WeakMap
retains the corresponding original instants, including the second occurrence
of a repeated hour. Changing a title or color cannot change that occurrence.
Import merges explicitly copy the projection to the retained event object.

The storage record keeps the existing array structure. For example, a Berlin
09:00 event on October 8, 2026 has start `2026-10-08T07:00:00.000Z` and marker
`instant-v1`. Its runtime start coordinate is `2026-10-08T09:00:00.000Z`.
`serializeEventTime` and `projectEventTime` are the boundary: callers must not
serialize runtime Dates directly or project the same runtime object twice.

Events without the marker are legacy records. Some were created as wall
coordinates and others imported as instants; those histories cannot be inferred
from their timestamps. They are kept unchanged, including on JSON reimport.
Repairing them requires an explicit per-source interpretation in a later pass.
Older application windows also need reloading before editing versioned records.

All-day imports additionally retain `allDay`, `startDate` and `endDate`. These
calendar dates stay fixed when changing zones. The end is exclusive and exports
as `DTEND;VALUE=DATE`. Editing a clock time converts the event into a timed event.

The live clock is anchored to the selected calendar date at startup. Rotation
measures wall hours from that fixed origin, including elapsed days. Midnight,
time-zone offsets and returning after suspension therefore use the same cursor
date as the footer. Layout and sun-time caches follow the rendered interval,
including partially visible hours and calendar filters.

Manual entry rejects nonexistent local times. Imported dates resolve gaps using
the pre-gap offset and repeated times using the first occurrence, as specified
by [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.5).
Untouched imported instants keep their precise occurrence. Handle drags through
a gap resolve forward to the next valid clock time when committed.

The renderer still has one 24-hour coil per day. It cannot represent an interval
whose ending wall coordinate precedes its starting coordinate within a repeated
hour; iCalendar imports report that limitation before merging. A display-zone
change that would produce such an interval is rejected atomically, keeping the
previous view. Loading an unsupported stored projection uses the existing
storage recovery notice and preserves the stored bytes. A future renderer
projection should expose multiple visible intervals for such an event. The
current importer also rejects recurrence rules, recurrence exceptions, custom
non-IANA time zones and cancellations rather than losing their semantics. It
supports positive day/week/time durations and preserves exclusive all-day ends.

The next structural step is to keep canonical events in memory and give both
renderers a shared immutable projection. That will remove the need for the
runtime Date convention and allow richer DST and recurrence behavior without
adding more conversion paths to the interaction code.
