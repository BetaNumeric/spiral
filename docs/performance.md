# Calendar performance

Version 1.42.32 indexes projected event intervals in `js/event-index.js`.
Hour queries prune intervals outside the requested time range instead of scanning
the entire calendar. Results retain event insertion order so painting, tie
breaking, and selection behave consistently. Endpoint maps and point queries
provide boundary-stroke decisions without rebuilding full-calendar lookups.

The index is reused while browsing. Event versions, calendar filters, and display
zones refresh it; the visible-window subset refreshes when the window moves.
Draft intervals and displayed colors are read separately so they remain current.
Overlap components use a sweep rather than comparing every pair of active
intervals. Runtime normalization also retains its validated display projection.
Device time zones are resolved once per frame, with a fresh lookup on the next
draw so a system zone change does not leave a permanent cached value.

Run the repeatable geometry/query benchmark with Node:

```powershell
node tools/benchmark-events.mjs
```

Before committing, compare with the checkout's HEAD using
`node tools/benchmark-events.mjs --baseline`. The benchmark generates deterministic
1,000-event and 10,000-event calendars spread over a year and a 500-event calendar
concentrated in one day. It reports preparation time, initial and median warm
geometry time, mean time per hour query, and the resulting slice count. Geometry
timings exclude Canvas painting and storage. Timing values are informational;
regression tests check results and query work rather than timing thresholds.

A local Chrome headless check on October 10, 2026 measured synchronous Canvas draw
calls, using the same generated datasets and view settings before and after this
pass. Each warm result is the median of seven draws, with no concurrent browser
benchmark. These are local CPU timings, rather than a device-independent frame-rate
guarantee or a measurement of final screen presentation.

| Calendar | Spiral before / after | Circles before / after |
| --- | ---: | ---: |
| Empty | 10.1 / 9.1 ms | 2.5 / 2.0 ms |
| 1,000 events over a year | 42.5 / 9.5 ms | 33.2 / 1.9 ms |
| 10,000 events over a year | 453.7 / 14.9 ms | 385.3 / 5.0 ms |
| 500 events in one day | 115.3 / 116.6 ms | 104.0 / 95.6 ms |

The 10,000-event hour queries fell from about 2 ms each to under 0.01 ms.
The dense case still paints 8,807 pieces in stacked mode: Canvas painting,
especially save/restore and edge drawing, is the remaining bottleneck there.
Indexing improves query work but does not reduce the number of pieces painted.

A separate device-zone check with 5,001 events took about 55 ms per circle draw
before resolving the zone once per frame, and about 5 ms afterward. Saving,
dragging an event handle, hiding its calendar, and reloading retained the edits.

Validation includes comparison with full scans across DST transitions, all-day
events, exclusive endpoints, arbitrary event order, distant dates, and draft
changes; cache refresh checks; and before/after comparisons of 24 Canvas renders.

## Dense event painting (1.42.33)

Event pieces now share a single Canvas drawing scope, with a second scope only
when deferred boundary edges need painting. Each stroke sets its required style
and line cap explicitly. Event circle fills use the same ring path as the clock
segments without running the clock's highlight and label bookkeeping per piece.

Spiral pieces with the same angle range and radius function reuse adaptive curve
samples, radii, and trigonometry. The sample cache lasts only for the current event
painting pass; navigation, dragging, resizing, and the next frame calculate fresh
geometry. Paint order, sampling tolerance, and the minimum sliver thickness stay
the same. Canvas styles and the sample cache are cleaned up even after an error.

Run the local browser benchmark with:

```powershell
node tools/benchmark-canvas.mjs --baseline-painter
node tools/benchmark-canvas.mjs
```

The first command uses the painter methods from HEAD with the current app's other
code, allowing an isolated comparison before committing. Chrome must be installed;
set `CHROME_PATH` if it is outside the default location. The benchmark uses a local
server and an isolated temporary browser profile, disables external app data, and
measures both views with stacking on and off. It reports median synchronous draw
time over seven warm frames and the number of Canvas scopes used by the event pass.
Headless GPU acceleration is disabled for this controlled CPU comparison. These
timings exclude final screen presentation and are not a frame-rate guarantee.

Sequential local runs on October 10, 2026 produced:

| Calendar / stacking | Spiral before / after | Circles before / after |
| --- | ---: | ---: |
| 10,000 events over a year / on | 12.7 / 10.3 ms | 4.9 / 3.8 ms |
| 500 events in one day / off | 17.8 / 13.9 ms | 6.6 / 5.2 ms |
| 500 events in one day / on | 90.5 / 67.2 ms | 95.4 / 70.4 ms |

The stacked dense case still paints 8,807 pieces. Its event pass now uses two
Canvas scopes instead of 17,385 in spiral view or 34,105 in circle view. Filling
and stroking that many pieces remains expensive, despite removing repeated
calculations and state changes.

Validation: 153 automated tests; 140 before/after renders with identical geometry
and PNGs, covering both views, both stacking modes, five edge configurations,
dense multicolored overlaps, clock changes, and clipped/past windows; offline
loading; and real mouse/touch repeated-hour selection and handle dragging.
