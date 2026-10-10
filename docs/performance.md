# Calendar performance

Spiral limits event queries to the visible time range and reuses geometry during
each drawing pass. Large calendars spread across many dates benefit most.
Hundreds of simultaneous events still require thousands of painted pieces, so
dense stacked overlaps remain the main rendering limit.

## Running benchmarks

From the repository root:

```powershell
node tools/benchmark-events.mjs
node tools/benchmark-canvas.mjs
```

The Node benchmark generates deterministic calendars: 1,000 and 10,000 events
spread over a year, plus 500 events concentrated in one day. It reports preparation
time, initial and median warm geometry time, mean time per hour query, and slice
count. It excludes Canvas painting and storage.

The browser benchmark uses local Chrome, a local server, and an isolated temporary
profile with external app data disabled. Set `CHROME_PATH` if Chrome is outside
the default location. It measures both views with stacking on and off, reporting
median synchronous draw time over seven warm frames and the event pass's Canvas
scope count. GPU acceleration is disabled for the controlled CPU measurement.
These timings exclude final screen presentation and do not guarantee a frame rate.

To compare uncommitted changes with HEAD:

```powershell
node tools/benchmark-events.mjs --baseline
node tools/benchmark-canvas.mjs --baseline-painter
```

`--baseline-painter` uses HEAD's painter methods with the working tree's other
code to isolate painter changes. Timing values are informational; regression
tests check results and query work rather than timing thresholds.

## How rendering works

`js/event-index.js` indexes projected intervals. Hour queries prune intervals
outside the requested range and preserve insertion order for painting and
selection. Endpoint maps and point queries supply boundary-stroke decisions.
Event versions, calendar filters, and display zones refresh the index; moving
the window refreshes its visible subset. Draft intervals and colors are read
separately so they stay current.

Overlap components use a sweep instead of comparing every pair. Validated
projections are reused, and the device zone is resolved once per frame with a
fresh lookup on the next draw.

Event pieces share one Canvas drawing scope, with a second when deferred boundary
edges need painting. Each stroke explicitly sets its style and line cap. Circle
fills reuse the clock's ring path without its highlight and label bookkeeping.

Spiral pieces sharing an angle range and radius function reuse adaptive curve
samples, radii, and trigonometry. The cache lasts for one event painting pass;
navigation, dragging, resizing, and subsequent frames calculate fresh geometry.
Paint order, sampling tolerance, and minimum sliver thickness are preserved.
Canvas styles and the cache are cleaned up even after an error.

## Reference measurements and limits

Sequential local Chrome headless runs on October 10, 2026, using version 1.42.33
and the method above, measured:

| Calendar / stacking | Spiral | Circles |
| --- | ---: | ---: |
| 10,000 events over a year / on | 10.3 ms | 3.8 ms |
| 500 events in one day / off | 13.9 ms | 5.2 ms |
| 500 events in one day / on | 67.2 ms | 70.4 ms |

The dense stacked case paints 8,807 pieces using two Canvas scopes. Filling and
stroking that many pieces remains expensive even with shared queries, geometry,
and drawing state. Indexing reduces search work without reducing the piece count.

Automated coverage compares indexed results with full scans across clock changes,
all-day events, exclusive endpoints, arbitrary event order, distant dates, and
draft changes. It also checks cache refresh and painting behavior. The reference
implementation was verified with 140 matching geometry and PNG comparisons across
both views, stacking modes, edge settings, dense overlaps, clock changes, and
clipped windows, plus offline loading and mouse/touch selection and dragging.
