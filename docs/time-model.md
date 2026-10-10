# Event times and calendar imports

Spiral stores timed events as actual instants and displays them in the selected
time zone. Changing the zone changes the view, not the saved event. All-day events
retain fixed calendar dates. This guide defines those contracts and the calendar
formats Spiral accepts.

## Accepted calendar input

| Input | Interpretation |
| --- | --- |
| JSON timestamps | ISO instants with an explicit UTC offset |
| ICS UTC timestamps | Actual UTC instants |
| ICS timestamps with an IANA `TZID` | Local time in the named zone |
| ICS floating timestamps | Local time in the selected display zone |
| ICS all-day dates | Fixed calendar dates with an exclusive end date |
| ICS day, week, or time durations | Calendar or elapsed duration as specified by the input |

Imports merge events by permanent UID, skip older revisions, and preserve
distinct events with identical content. Invalid records or duplicate UIDs reject
the entire file. Missing JSON IDs receive secure random UUIDs; missing revisions
start at zero.

Recurrence rules, recurrence exceptions, custom non-IANA zones, and cancellations
are rejected because their semantics cannot be retained. Supporting recurrence
requires a separate occurrence-expansion layer.

## Instants, clock coordinates, and dates

`js/time-model.js` handles strict parsing, wall-clock formatting, IANA-zone
conversion, and daylight-saving disambiguation. Its Date values have two distinct
meanings:

- An **instant** is a real timestamp used for events, storage, and external calendars.
- A **wall coordinate** uses UTC fields to encode the displayed date and clock
  time. It must be converted before it can become an event instant.

`js/event-time.js` keeps runtime event `start` and `end` Dates as actual UTC
instants with `timeModel: "instant-v1"`. A Berlin 09:00 event on October 8, 2026
has `start` equal to `2026-10-08T07:00:00.000Z` in memory and storage. JSON,
calendar sharing, and study descriptors use the same timestamps. Loading,
copying, and rendering cannot reinterpret them.

All-day events additionally retain `allDay`, `startDate`, and `endDate`. Their
dates stay fixed across zone changes, and the exclusive end exports as
`DTEND;VALUE=DATE`. Editing a clock time converts an all-day event to a timed one.
Timed durations measure elapsed time; all-day durations count calendar dates.

## Creation and editing

`normalizeRuntimeEvent` validates canonical events. `initializeEventFromWallTimes`
converts temporary wall inputs from forms, drafts, and the random generator into
instants. Editors and mouse/touch handles resolve wall input before committing.
Serialization reads actual timestamps directly, without using display projections.

Manual entry rejects nonexistent local times. Imported clock times resolve gaps
using the pre-gap offset and repeated times using the first occurrence, following
[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.5). Untouched
imported instants keep their occurrence. A handle dragged into a gap moves forward
to the next valid clock time when committed.

Repeated-time editors offer first and second occurrences with UTC offsets.
Text edits and handle drags preserve the endpoint's current occurrence when valid.
The Add Event panel binds each occurrence choice to its wall value and zone,
preventing a different date or zone from reusing it. Invalid ranges remain editable
and disable Add Event; a manually selected end occurrence is never adjusted silently.

Both creation paths suggest one elapsed hour by adding to the actual start
instant. A canvas draft keeps that suggestion when its start changes until its
end is edited or a duration handle is dragged. This is temporary view state.
An end before the actual start leaves the event unchanged. Positive intervals
with equal or reversed wall endpoints are valid during a repeated hour. The
five-minute handle minimum is measured on the actual timeline.

## Display projections and clock changes

`js/event-projection.js` derives immutable numeric wall coordinates, layout
coordinates, and actual timestamps. Both renderers, lane allocation, hit testing,
navigation, and labels use this projection. A WeakMap caches it by timestamps,
all-day dates, and zone; even an in-place Date edit invalidates the result.
`getEventWallDate` returns a fresh Date so UI code cannot mutate the source event.

Each day retains a 24-hour coil. Timed projections split at actual IANA offset
transitions without assuming a one-hour change. Each interval carries its actual
and wall endpoints, offset, and index. Interval ends use the preceding piece's
offset: spring-forward gaps stay blank and fall-back retains both occurrences.
All-day events span a continuous calendar-date interval.

Repeated times occupy consecutive angular sections under one regular hour label.
Berlin's repeated 02:00 uses two equal halves. Lord Howe's repeated half-hour
divides the affected 01:00 wedge into a two-thirds first section and a one-third
second section. Other hours remain fixed. The radial divider appears when a
visible event occupies the hour or Segment edges is enabled. Simultaneous events
stack within their own section.

`repeatedHour` derives the wall range, actual range, offset, and angular fraction.
`layoutStartMs`/`layoutEndMs` are drawing and overlap coordinates;
`startMs`/`endMs` retain their wall meaning for editors. `layoutTime` and `clockTime`
map in both directions. The cursor, navigation, handles, selections, labels, and
night overlays use this mapping. Transition and repeated-day caches are bounded.

`js/render-geometry.js` supplies shared angle conversion, clipping, radial bounds,
overlap groups, and event slices. Both renderers use the same slices, including
stacked gap filling and persistent lane widths. Circle mode supplies fixed ring
radii; spiral mode supplies a radius function. Each painter keeps its own paths
and edge caps. Selection and dragging share the drawing geometry, including
empty repeated-hour sections. Handles attach to the first and last actual pieces.

Night shading includes both repeated sections, preserves gaps in partial overlays,
and keeps the other occurrence shaded when one is selected. All-day events span
both sections. Event records remain canonical in storage and in the list.

## Event identity and persistence

`js/event-model.js` validates records with a permanent `persistentUID` and a
`sequence` from 0 to 2147483647. Content edits advance the revision before writes
are queued. The tracker retains its baseline after a failed save, so retrying does
not increment it again. Sharing status and derived palette colors are not revisions.

The event store is `spiralCalendarEventsV2`, with no legacy interpretation or
migration. Transfer code never uses matching content as identity. All ICS download
paths share `js/event-transfer.js`, including UTF-8 line folding, UID, SEQUENCE,
and LAST-MODIFIED.

## Clock and list navigation

At startup, the live clock is anchored to the selected calendar date. Rotation
measures wall hours from that fixed origin, including elapsed days. Midnight,
zone offsets, and resuming after suspension therefore share the footer's cursor
date. Layout and sun-time caches follow the rendered interval, including partially
visible hours and calendar filters.

Timed list ordering and active-event detection use actual instants; day headings
and all-day activity use displayed calendar dates. While browsing, a selected
clock piece disambiguates the list's display instant when it contains the cursor.
The live clock always uses the actual current timestamp.

## Manual checks

Import [`clock-changes.ics`](../tests/fixtures/clock-changes.ics) and check these
events from the list in both spiral and circle views:

| Zone and date | Expected display |
| --- | --- |
| Europe/Berlin, October 25, 2026 | Event crosses the divider between the first and second 02:00 sections |
| Europe/Berlin, March 29, 2026 | Event leaves 02:00-03:00 blank |
| Australia/Lord_Howe, April 5, 2026 | Repeated half-hour occupies its own section |

Export, reimport, and reload to check persistence. For creation in Europe/Berlin:

1. Set the start to October 25, 2026 at 02:00. First occurrence suggests an end
   at the second 02:00; Second occurrence suggests 03:00. Both show one hour.
2. Select a first-occurrence end before a second-occurrence start. The panel
   should show an error and disable Add Event.
3. Create a canvas draft in the 02:00 segment. Use its start-time editor to
   select either occurrence.
4. On March 29, a 01:30 start suggests 03:30. Manually entering 02:30 is rejected.
