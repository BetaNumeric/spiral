# Time model boundary

`js/time-model.js` owns strict calendar input parsing, wall-clock formatting,
IANA-zone conversion and daylight-saving disambiguation. Its Date values have two
distinct meanings:

- An instant is a real timestamp, suitable for storage and external calendars.
- A wall coordinate uses UTC fields to encode the date and clock time drawn by
  the existing 24-hour canvas. It is never exported as an instant directly for
  an event.

`js/event-time.js` keeps runtime event `start` and `end` Dates as actual UTC
instants, with `timeModel: "instant-v1"`. Storage, JSON downloads, calendar
sharing, and study descriptors use the same timestamps. A Berlin 09:00 event
on October 8, 2026 has `start` equal to `2026-10-08T07:00:00.000Z` in memory
and in storage. Loading, copying, rendering, and changing zones cannot reinterpret
that timestamp.

`js/event-projection.js` derives an immutable display projection containing
numeric wall coordinates, layout coordinates, and actual timestamps. Both renderers, layout lanes,
segment hit testing, navigation, and display labels use this shared projection.
A WeakMap caches derived projections by event timestamps, all-day dates, and
zone; it contains no source data. Even an in-place Date edit invalidates the
cached result. `getEventWallDate` returns a fresh Date for UI boundaries so
mutating a display value cannot change the event or its projection.

`normalizeRuntimeEvent` validates already canonical events.
`initializeEventFromWallTimes` is the explicit creation boundary for temporary
wall inputs from forms, drafts, and the random generator. Editing and mouse/touch
handles resolve wall input into actual timestamps before committing changes.
Within a repeated hour they preserve the endpoint's current occurrence when
valid. Serialization reads actual timestamps directly without consulting a
projection. Timed list ordering and active-event detection use actual instants;
day headings and all-day activity use displayed calendar dates.

`js/event-model.js` owns the persisted schema and identity/revision validation.
Records have a permanent `persistentUID` and a `sequence` from 0 to 2147483647.
The revision tracker compares canonical content at each edit, advances revisions
before queuing writes, and retains that baseline after a failed save so retrying
cannot increment the revision again. Sharing status and derived palette colors
are not content revisions. Duplicate UIDs reject a whole store/import. Event
transfer merges only matching UIDs and skips older incoming revisions; it never
uses content as an identity. All ICS download paths share `js/event-transfer.js`,
including UTF-8 line folding, UID, SEQUENCE and LAST-MODIFIED.

The current store is `spiralCalendarEventsV2`. Earlier prototype data is left
under its old key and is not read. There is no legacy interpretation branch or
migration. JSON imports use actual ISO instants with explicit offsets; missing
IDs are assigned secure random UUIDs and missing revisions start at zero.

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

The renderer keeps one 24-hour coil per day. Timed projections split at actual
IANA offset transitions, discovered without assuming a one-hour change. Each
immutable interval carries its actual start/end, wall start/end, offset, and
index. Interval ends use the offset of the preceding piece, so spring-forward
intervals leave skipped clock time blank and fall-back intervals retain both
occurrences. All-day events keep one continuous calendar-date interval.
Transition lookups are cached by zone and UTC day in a bounded cache.

Lane allocation, overlap components, boundary strokes, both renderers, and band
hit testing use the projected layout intervals. Repeated times occupy consecutive
angular sections under one regular hour label. The radial divider appears when
there is a visible event in that hour or Segment edges is enabled.
Events remain canonical records in storage and the list.
Handles attach to the first and last actual pieces. Mouse and touch share one
dragging implementation and invert the section's time-to-angle mapping to choose
an occurrence, including empty sections. Text editing preserves the endpoint's occurrence.
The five-minute handle minimum is measured on the actual timeline.

`js/render-geometry.js` owns the shared time-to-angle mapping, clipping, radial
bounds, overlap groups, and event slice collection. Both renderers consume the
same logical slices, including stacked gap filling and persistent lane widths.
Circle mode supplies fixed ring radii; spiral mode supplies its radius function.
The painters retain their separate canvas paths and edge-cap behavior. Selection
and handle dragging use the same angle conversion and radial bounds as drawing.
Night overlap calculation and repeated-hour dividers also live in this module,
which is included in the offline cache.

`repeatedHour` derives each section's wall range, actual range, offset, and angular
fraction from the IANA transition. Berlin's sections each occupy half the usual
02:00 wedge. Lord Howe's repeated half-hour gives the affected 01:00 wedge a
two-thirds first section and one-third second section. Other hour positions and
the 24-hour day coil stay fixed. `layoutStartMs`/`layoutEndMs` are derived coordinates
used for drawing and overlap calculations; `startMs`/`endMs` keep their wall meaning
for editors. `layoutTime` and `clockTime` map in both directions. The live cursor,
browsing time, navigation, handles, selections, labels, and night overlays use that
mapping. Transition and repeated-day caches are bounded. All-day events span both
sections with their fixed calendar dates. Night overlay merging retains both
sections regardless of their angular order and preserves gaps between partial
overlays. Selecting one occurrence leaves the other occurrence's night shading
visible. Zone changes never rewrite event records.

Ambiguous endpoint labels include their UTC offset. Editing a repeated time
opens a first/second occurrence choice, including offsets and keyboard controls.
The Add Event panel provides the same choices inline during creation. Its
choices are bound to the wall value and zone so a different date or zone cannot
reuse a stale occurrence. Invalid ranges remain editable and disable Add Event;
the panel never silently changes a manually selected end occurrence.
Both creation paths suggest exactly one elapsed hour by adding to the actual
start instant. A canvas draft keeps that suggestion when its start is edited,
until its end is edited or a duration handle is dragged. This is temporary view
state and is not serialized. Detail views and the add panel display elapsed
duration for timed events; all-day durations count the fixed calendar dates.
Choosing an end before the actual start leaves the event unchanged. Positive
intervals with equal or reversed wall endpoints are supported. While browsing,
a selected clock piece disambiguates the list's display instant when it contains
the cursor; the live clock always uses the actual current timestamp.

ICS imports and stored events can now cross backward through a repeated hour.
The importer still rejects recurrence rules, recurrence exceptions, custom
non-IANA zones and cancellations rather than losing their semantics. Recurrence
needs a separate occurrence-expansion layer before imports can support it safely.

To check the clock-change cases manually, import
[`tests/fixtures/clock-changes.ics`](../tests/fixtures/clock-changes.ics). Select
Europe/Berlin and open the October 25 and March 29 events from the event list.
The October event crosses the radial divider between the first and second 02:00
sections; the March event leaves 02:00-03:00 blank. Switch to Australia/Lord_Howe and open the April 5 event to
check the repeated half-hour. Export/reimport and reload to check persistence.

To check creation, select Europe/Berlin and set the Add Event start to
October 25, 2026 at 02:00. First occurrence suggests an end at the second 02:00;
switching the start to Second occurrence suggests 03:00. Both show one hour.
Choose an end in the first occurrence before a second-occurrence start to check
the visible error and disabled Add Event button. Create a canvas draft in the
02:00 segment and use its start-time editor to select either occurrence. On
March 29, a 01:30 start suggests 03:30, while a manually entered 02:30 is rejected.
