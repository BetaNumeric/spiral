# Developing Spiral

Spiral is a static HTML, CSS, and JavaScript app. Canvas draws the calendar, browser
storage holds events and settings, and a service worker caches the app for offline
use. There is no build step. The calendar needs no backend; remote study controls
use the optional standalone service described below.

## Run locally

From the repository root, start a web server:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. Serve the files over HTTP rather than opening
`index.html` directly so modules and the service worker can load normally.

## Tests and benchmarks

The regression suite uses Node's built-in test runner:

```powershell
node --test tests/*.test.mjs
```

If the environment prohibits spawning test processes, use:

```powershell
node --test --test-isolation=none tests/*.test.mjs
```

Tests cover storage coordination, identity and revisions, imports, time zones,
clock changes, editing, geometry, indexing, painting, location search, and offline
caching. The [time guide](time-model.md#manual-checks) includes manual clock-change
checks. The [performance guide](performance.md) explains the Node and Chrome
benchmarks and their limits.

The facilitated study workflow has an isolated Chrome check:

```powershell
node tools/check-study-browser.mjs
```

It creates a temporary browser profile and checks recording, tasks, resets,
cross-tab ownership, recovery, imports, and phone-width layouts. Set `CHROME_PATH`
if Chrome is installed elsewhere. Add `--screenshots` to save previews in the
system temporary directory.

Remote control has a separate browser check using an actual relay, a facilitator
page, and two phones with independent browser storage:

```powershell
node tools/check-study-remote-browser.mjs
```

## Code map

Paths below are relative to the repository root.

| Area | Main files |
| --- | --- |
| Page and startup | `index.html`, `js/bootstrap.js`, `js/core.js` |
| Time conversion and display projection | `js/time-model.js`, `js/event-time.js`, `js/event-projection.js` |
| Event schema and persistence | `js/event-model.js`, `js/event-storage.js`, `js/event-storage-ui.js` |
| Calendar import, export, and sharing | `js/icalendar.js`, `js/event-transfer.js` |
| Event changes and detail state | `js/event-editing.js`, `js/detail-view-state.js`, `js/event-editors.js` |
| Forms, lists, and input | `js/ui-event-panel.js`, `js/ui-handlers.js`, `js/input-mouse.js`, `js/touch-time-orientation.js` |
| Geometry, queries, and painting | `js/render-geometry.js`, `js/event-index.js`, `js/render-spiral.js`, `js/render-circle.js` |
| Settings and location | `js/settings-config.js`, `js/state-storage-sync.js`, `js/pickers-calendars.js`, `js/location-search.js` |
| Study recording and analysis | `js/study-storage.js`, `js/study-session.js`, `js/study-analysis-page.js`, `tools/study-analysis-core.mjs` |
| App version and offline cache | `js/app-version.js`, `service-worker.js`, `a2hs.js`, `manifest.json` |

Keep event records canonical at storage and editing boundaries; derive display
coordinates without changing saved times. The [time guide](time-model.md) defines
the schema, import rules, and repeated-hour geometry. Both painters should consume
the shared geometry rather than implement separate time or overlap rules.

Update `js/app-version.js` when changing cached app files. The window and service
worker use its version to select the same app cache.

## Developer and study controls

Dev Options and Study Session are visible on normal launches, including the
installed app. Advanced controls start collapsed. `?dev=0` or `?study=0` hides
the corresponding controls for that page; returning to the normal URL shows them
again. Build defaults are `DEFAULT_DEV_MODE` and `DEFAULT_STUDY_MODE` in
`js/config-utils.js`.

The random-event generator in the Add Event panel can populate a date range with
different durations, calendars, and overlaps. Its **Clear existing events** option
replaces the current event set, so use a separate browser profile for sample data.

## Study recording and analysis

The [facilitator guide](study.md) covers preparing a baseline, running tasks,
interruptions, participant resets, exports, and interpretation.

The study UI uses Explore, Tasks, and Debrief, with automatic participant and task
numbers. It returns to the calendar after a mode change. Results, assistance,
notes, resets, and exports are optional facilitator tools. An ended task has an
`unrated` outcome unless the facilitator marks a result; it still has a measured
duration and is separate from an incomplete attempt.

Remote control is isolated in `facilitator.html`, `facilitator.css`,
`js/study-facilitator.js`, `js/study-remote.js`, and `tools/study-relay.mjs`.
The relay serves the existing app and uses small authenticated HTTP messages and
one-second polling. It has no package dependencies or recording database.
The [service guide](study-remote-server.md) explains local/HTTPS hosting, connection
expiry, and removal after the study. Study recording remains on the phone.

Commands identify the expected session, phase, task attempt, and pause state.
Phone receipts prevent replay after reload, and acknowledgements follow durable
study saves. Participant actions retain their original actor; remote control
records use `source: study_remote`, `inputMethod: remote`, and the command ID.
The service worker bypasses `/study-api/` so commands and status cannot come from
the offline cache. There is no remote command queue for disconnected phones.

`js/study-storage.js` keeps an IndexedDB archive with session metadata and an
interaction journal. Recording requires a single writer; save failures appear in
the study controls. The calendar's event/settings storage is independent, so a
participant reset does not remove recordings. The legacy localStorage draft is
preserved during migration.

The recorder in `js/study-session.js` writes schema 6 sessions. Each session has a
participant code, stable session ID and revision, study/protocol/condition/setup
metadata, immutable starting event/view/settings snapshots, task attempts,
interruptions, notes, and structured actions. Actions carry elapsed offsets,
timestamps, actor, input method, source, task/attempt IDs, and relevant payloads.
Calendar targets use canonical instants plus time-zone/wall-time/occurrence
context. Description text is opt-in; titles and other study context remain in
the export. Task targets and expected-state fields are context, not automatic
grading rules.

`study-analysis.html` reads the local archive or imported session/archive JSON.
Browser and CLI analysis share `tools/study-analysis-core.mjs`: validation,
session-ID/revision deduplication, frozen snapshot durations, task timing minus
recorded interruptions, outcome/help counts, and descriptive charts. Original
imports remain available alongside normalized analysis data. A named task's
completion time differs from the broader Task phase's elapsed time.

```powershell
node tools/analyze-study-sessions.mjs ./study-exports --out ./study-analysis
```

The CLI accepts explicit JSON files or directories containing
`study-session-*.json`, `study-sessions-*.json`, or `study-archive-*.json`. With no
arguments it scans the current directory. It writes `summary.csv`,
`interactions.csv`, `tasks.csv`, `raw-archive.json`, and `report.html`; invalid
files produce diagnostics without preventing valid sessions from being analyzed.
Keep raw JSON for later measures and link questionnaire responses by participant,
session, and task IDs as appropriate.


## Place-search provider

`js/location-search.js` uses the
[Open-Meteo geocoding endpoint](https://open-meteo.com/en/docs/geocoding-api)
for cities, places, and postal codes, rather than street addresses. The UI
attributes Open-Meteo and GeoNames. Coordinates and device location remain
available for exact locations.

The default endpoint is for non-commercial use under its
[free-service terms](https://open-meteo.com/en/terms). A commercial release needs
a suitable paid service or proxy. Set `window.SPIRAL_LOCATION_SEARCH_ENDPOINT`
before `bootstrap.js` loads to select an Open-Meteo-compatible endpoint.

Search starts only on Enter or the search button. Results are cached for 24 hours;
saved results up to seven days old are available offline. Requests are serialized,
spaced at least one second apart, canceled when superseded, and limited to ten
seconds. Arrow Up/Down moves through results, and Enter selects one.
