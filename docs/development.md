# Developing Spiral

Spiral is a static HTML, CSS, and JavaScript app. Canvas draws the calendar, browser
storage holds events and settings, and a service worker caches the app for offline
use. There is no build step or application backend.

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
| Study recording and analysis | `js/study-session.js`, `js/study-analysis-page.js`, `tools/study-analysis-core.mjs` |
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

## Study analysis

Open `study-analysis.html?study=1` from Study Session to analyze the session saved
in the same browser, or import downloaded `study-session-*.json` files. Analysis
runs locally and offers timelines, phase durations, summary CSV, interaction CSV,
and a standalone HTML report.

The command-line analyzer uses the same shared analysis module:

```powershell
node tools/analyze-study-sessions.mjs ./study-exports --out ./study-analysis
```

It accepts explicit JSON files or directories. With no arguments, it scans the
current directory for `study-session-*.json` and writes `summary.csv`,
`interactions.csv`, and `report.html` to `study-analysis`.

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
