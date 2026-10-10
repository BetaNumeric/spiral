# **Spiral**

 
[**Live Demo**](https://betanumeric.github.io/spiral/)

This time-visualization application combines two time-measuring methods: the calendar and the clock. It uses the same motion we go through during a day as we move around Earth’s rotational axis. It doesn’t assume a circular repetition of days, as clocks do, but rather a continuous forward motion, as our planet does when it orbits the sun. The length of the solar illumination varies, since Earth's axis is tilted relative to the ecliptic (obliquity of the ecliptic). This is incorporated into the spiral with a subtle overlay that marks the time between sunset and sunrise for each day, based on the user’s location.





## **Controls and Usage**

You navigate by performing a circular motion around the spiral's center. The spiral follows the finger/cursor and rotates with it: clockwise moves forward in time, counterclockwise rewinds. The spiral has inertia, so you can keep adding momentum by releasing it mid-motion, and it will keep rotating, slowing down until it stops. 
Pinch-zooming or scrolling lets you move through time faster, skipping in steps of whole days. When moving the spiral manually, each hour produces a light click sound/vibration, and crossing midnight produces a stronger one.
Alternatively, you can navigate using the keyboard. The classical `W`, `A`, `S`, `D`, or the arrow keys move the spiral. The left and right arrows sweep the rotation precisely (use `Alt` for fine-tuning or `Alt+Shift` for sweeping fast), while the up and down arrows allow you to scroll in entire day-steps (use `Alt` for hour steps or `Alt+Shift` for week steps) just like scrolling would. 

By default, the spiral shows the current time and adjusts its position every second. To reset to the current time after the spiral has been rotated, double-tap anywhere outside the spiral. You can also quickly press the `Spacebar` or `Home` key to jump right back to the current time. The time display box at the bottom of the screen shows the date and time at which the calendar is currently scrolled to. Tapping it syncs the spiral to the device’s local time, resuming to update every second. It can be minimized by dragging it down.

## **Visual Structure of the Spiral**

The beginning of a new day is marked by a thicker stroke at the 24:00 / 0:00 segment line. Similarly, a new month is indicated by a thicker arc line. Weekdays can be separated by a gradient overlay that makes each weekday slightly darker and resets on Mondays. 

Each day has its number and weekday written in the first segment; the first day of the month also has the month, and the first day of the year has the year number added to it. Around the outer segments are the hour numbers going from 0 to 23.
Each revolution of the spiral is divided into 24 segments, representing the hours of a day. Hovering over them reveals the outline of the segment, and a tooltip text appears with the segment’s date and time. Clicking a segment opens a circular info screen in the middle. To properly accommodate the info circle, the calendar switches to a concentric-circle mode. It can be enlarged by zooming in, which maximizes its size in multiple steps. Clicking anywhere else or pressing the `Escape` key closes the open screen, panel, or event list, returning you to the spiral.

https://github.com/user-attachments/assets/25569a37-a7fb-4b82-8bc3-bdac0c8dc9c4

## **Adding and Editing Events**

The info circle lets you add an event to the calendar. It contains several input fields and a button to add the event. In the center are two fields for setting the event’s start and end time and date. New events default to one elapsed hour from the selected segment, including clock changes. A duration label shows the actual time between the endpoints. Above them, you can add a title and description. Below, you can choose which calendar the event belongs to. “Home” and “Work” are defaults, but custom calendars can be added.
The circle has an outline in the event’s color. You can change the randomly selected default color by clicking this ring or clicking on the selected segment containing the event.

When you click the “Add Event” button at the bottom, the circle closes, and the event is added to the spiral calendar, coloring the area during which it takes place. Clicking any segment with an event in it opens a similar window, but with the event’s data already in the input fields. At the bottom, there are two buttons, one to delete the event and one to add a new event, which opens an empty circle like before. You can also quickly press the `Delete` or `Backspace` keys while an event is selected to trigger the deletion. If you change anything, the “add” button becomes a “done” button, which closes the event screen.
When two or more events are added to the same segment, they will stack in the spiral. To access an overlapping event, you can click the selected segment multiple times or the chevron arrows at the top of the event circle to cycle through the events. 


https://github.com/user-attachments/assets/3ff0ea48-aaf1-4e68-8e91-d3330bf4e0c8


Another feature is the manipulation of an event’s length in the spiral directly. When clicking on an event, it will open the event circle and also show a handle at the start and end of the event. You can click and drag each handle to increase or decrease the event’s length. While dragging, it will switch to spiral mode and hide the event screen. When releasing the handle, the event is saved with the new start and end time. 

Events and configuration settings are stored locally in your browser. Explicit location searches send the place name to Open-Meteo; device-location and coordinate lookup use a reverse-geocoding service. Calendar sharing sends the events you choose to your external calendar.

Event saves are coordinated across open windows. Idle windows refresh when another
window saves events. If two windows edit an older copy, Spiral blocks the stale
save and offers a download of the unsaved events before reloading the saved copy.
Failed saves show a notice with retry and download actions; unreadable stored data
is preserved rather than replaced with an empty calendar. Reload older open windows after an app update so they also use these protections.

Events use one canonical format: `timeModel: "instant-v1"`, actual UTC start/end
instants, a permanent UID (`persistentUID`), and a nonnegative increasing
`sequence`. New events receive secure random UUIDs; imports retain their supplied
UIDs. Runtime Dates retain the same actual timestamps as storage; both renderers
use shared immutable display projections. Changing the display zone changes only the view. Content edits
increase the revision; saving again or sharing an unchanged event does not.
The two canvas views share event layout, clipping, night-overlay calculations,
and selection geometry in `js/render-geometry.js`.
Detail editors and single-event additions and deletions use `js/event-editing.js`
to validate changes and refresh event caches. Detail selection and drafts live in
`js/detail-view-state.js`; DOM text editors live in `js/event-editors.js`.
Draft edits stay local until Add. Enter saves a title, Ctrl+Enter saves a
description, and Escape cancels text editing. Blur saves changed text; switching
events or closing the detail view finishes the active editor.
All calendar exports use the same serializer and retain these identities.
Imports match by UID, keep distinct events with identical content, and skip
older revisions. Invalid records and duplicate UIDs reject the entire file.
JSON timestamps require an explicit UTC offset.

Version 1.42.22 starts a new prototype event store, `spiralCalendarEventsV2`.
Earlier sample records remain untouched under the old key but are not loaded
or automatically migrated. No compatibility or legacy timestamp guessing is
retained. Current-format JSON and ICS files can be imported normally.

Calendar imports honor UTC dates, IANA `TZID` values, floating times in the
selected zone, all-day dates with exclusive end dates, and day/week/time
durations. In both views, a repeated hour is divided into consecutive angular
sections under the regular single hour label. A radial divider appears when an
event occupies that hour or when Segment edges is enabled.
Each fills the day ring's full thickness; simultaneous events still stack within
their own section. Clicking an empty section creates an event in that occurrence.
Skipped hours stay blank, and repeated times can be created or edited by choosing their first or
second occurrence. The Add Event panel displays these choices with UTC offsets
and previews the actual duration. On October 25, 2026 in Europe/Berlin, a new
event at the first 02:00 ends at the second 02:00 after one hour; starting at the
second 02:00 instead ends at 03:00. All-day durations count calendar dates.
Unsupported recurring schedules, custom time-zone definitions
and cancellations are rejected before any events are imported. Nonexistent clock times entered
manually during a daylight-saving change are reported instead of silently saved.
The conversion boundary and its current limits are documented in
[docs/time-model.md](docs/time-model.md).

Location search runs only after pressing Enter or the Search button. It looks up
cities, places and postal codes, shows selectable matches, and uses their IANA
time zones. Results are cached for 24 hours; saved results up to seven days old
are available when search is offline. Requests are serialized, spaced at least
one second apart, cancelled when superseded, and time out after ten seconds.
Coordinates and device location are still available. Keyboard users can use
Arrow Down/Up to move through results and Enter to choose one.

The default [Open-Meteo geocoding endpoint](https://open-meteo.com/en/docs/geocoding-api)
is for non-commercial use under its [free-service terms](https://open-meteo.com/en/terms).
A commercial release needs a suitable paid service or proxy. An
Open-Meteo-compatible endpoint can be selected by setting
`window.SPIRAL_LOCATION_SEARCH_ENDPOINT` before `bootstrap.js` loads. The UI
attributes Open-Meteo and GeoNames. This provider supplies place lookup rather
than street-address search; coordinates remain available for exact locations.

Storage regression checks use Node's built-in test runner:
`node --test tests/*.test.mjs`. In environments that prohibit spawning test
processes, use `node --test --test-isolation=none tests/*.test.mjs`.

Rendering and hover queries reuse a projected interval index so large calendars
do not require a full event scan for every hour. Run
`node tools/benchmark-events.mjs` for the geometry/query benchmark; measurement
details and remaining limits are in [docs/performance.md](docs/performance.md).
For a local Chrome Canvas benchmark, run `node tools/benchmark-canvas.mjs`.

## **Event List Timeline**

The time display at the bottom of the screen can be pulled up to reveal an event list. Each event is listed chronologically here, grouped by day, with the event that is closest in the spiral being scrolled to the top and highlighted when it is selected. At the top, there is a search bar to find events by name (you can quickly pull up this list and jump straight to the search bar by simply pressing `f` or `/`). One can select which calendars are shown by toggling the active calendars in a list, or by long-pressing the calendar tag of an element to show only events from that calendar. Behind each event in the list, there is a delete “x” button that lets you remove the event, and an “add” button that lets you add the event to your local calendar app. At the top, there is also the option to delete all events or add all events to your local calendar.
Clicking on an event in the list will skip to the first segment containing that event and open it in the info circle.
At the top left corner of the screen is a “+” button that opens a panel with an alternative way to add events to the calendar (which can also be triggered globally at any time by pressing `+`, `=`, or `n`). It has the same options as the circle, but in a more classic form layout. It also includes the event list and an option to export all events as JSON or .ics files, and another button to import them.

## **Settings**

At the top right corner of the screen is a settings button that opens a panel with multiple options. You can, for example, toggle a dark mode and turn off the sounds. There are sliders with which you can adjust how many days are shown in the spiral. You can also do that by pinch-zooming with three fingers or by scrolling while holding down the Shift key. 
Another slider controls the change in the radius of the spiral segments, where a value of 1 keeps all segments at the same thickness, and higher values make them wider the further out they are. You can also adjust this value by pinch-zooming with four fingers or scrolling while holding the CTRL key.

“Static Mode” is enabled by default and keeps the spiral oriented in a fixed way, with midnight at the top, with the end of the spiral rotating around. Turning it off lets you rotate the spiral and keeps the end of the spiral always fixed at the bottom. 

Other options are toggling the overlays, with sub-options to change their opacity. The nighttime overlay also has the option to enter your coordinates, search for a place, or let the calendar access your device's location. 

Another option is to change the color palette used to generate the random default event colors. For example, a colorblind palette that only uses colors that maximize visibility for the colorblind. Other options are a softer, pastel color palette, a monochrome or single hue palette, a single color palette, seasonal change over a year, or the option to show the color of the event’s calendar instead.

At the bottom, there is the option to reset the settings to the default.

## **Developer Mode and Experimental Features**

The Dev Options button and Study Session section are visible by default, including in the installed PWA. Advanced dev settings start collapsed and can be opened with Show Dev Options. Earlier saved visibility flags do not hide these controls on a normal launch. To hide them for a particular page, use `?dev=0` or `?study=0`; returning to the normal URL shows them again. For build-level defaults, change `DEFAULT_DEV_MODE` or `DEFAULT_STUDY_MODE` in `js/config-utils.js`.

For fine-grained control of the calendar's looks, the dev setting includes a group of advanced visual options. Here you can toggle additional guide lines (such as noon or 6 am / 6 pm markers), show or hide segment borders, and adjust how text is rendered inside the spiral (for example, showing year and month names only on the first segment of each period). You can also fine-tune how hours, days, months, and years are labeled, choosing between different formats and levels of detail.

Developer Mode also includes a random events generator used for testing. It is located at the bottom of the “Add Events” panel. With it, you can quickly populate the spiral with synthetic events spread across multiple days, using varying durations, start times, and calendars. This makes it easy to see how overlapping events stack, how different color palettes behave, and how the event list and interactions perform under heavier loads.

Study mode includes a local analysis page at `study-analysis.html?study=1`, linked from the Study Session controls. It reads the current study-session draft from the same browser storage, can import downloaded `study-session-*.json` exports, visualizes timelines and phase durations, and can download summary CSV, interaction CSV, and a standalone HTML report. The Node analyzer uses the same shared analysis module: run `node tools/analyze-study-sessions.mjs`, or pass JSON files/directories plus `--out <dir>`.

## **Installation and Standalone App Support**

Spiral is built as a Progressive Web App (PWA) with full standalone support. Once loaded, it caches the necessary files and works completely offline without requiring a backend server. 

### **Using via Browser**
To run the application, simply visit the [Live Demo](https://betanumeric.github.io/spiral/). To set up the app locally, clone the repository, run a local web server (such as `python -m http.server 8000` or `npx serve`), and open `http://localhost:8000` in your browser.

### **Adding to Home Screen (Mobiles & Tablets)**
Because it’s a PWA, you can install the app on your mobile device for a native, fullscreen viewing experience:
- **Android:** Open the application in Chrome. A prompt to "Install app"  or "Add Spiral to Home screen" might appear at the bottom. Alternatively, tap the browser's three-dot menu and select "Install app".
- **iOS / iPhone:** Open the application in Safari. Tap the Share icon (the square with an arrow pointing up), scroll down, and tap "Add to Home Screen".
- **Desktop:** In supported browsers (like Chrome or Edge), an installation tag or icon will appear inside the right side of the URL address bar. Clicking it installs Spiral natively on your computer. 
