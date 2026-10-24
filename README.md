# Spiral

Spiral combines a clock and calendar in one continuous view. Each turn represents
a day, events fill the hours they occupy, and nighttime shading shows the time
between sunset and sunrise at your chosen location.

[**Open Spiral**](https://betanumeric.github.io/spiral/)

## Getting started

1. Drag around the center to move through time, or scroll to step through days.
2. Click or tap an empty hour to create an event. Set its title, times, color,
   and calendar, then choose **Add Event**. The **+** button opens the same
   options in a form.
3. Pull the time display at the bottom upward to browse and search your events.
4. Tap the time display to return to now.

Spiral runs in your browser. To add it to your phone's Home Screen, open the
[installation guide](https://betanumeric.github.io/spiral/install.html), or choose
**Settings > Install Spiral**. The guide adapts to your device and can be shared
as a link or QR code. On Android, use **Install Spiral** when available, or your
browser's **Install app / Add to Home Screen** menu option. On iPhone or iPad,
use **Share > Add to Home Screen**, keep **Open as Web App** enabled if shown,
then tap **Add**. If these options are missing, open the link in Safari on iPhone
or Chrome on Android. The Home Screen icon opens the calendar directly.
Once its files are cached, the clock, events, and settings work offline; new
place searches need a connection.

## Your data

Events and settings are saved in this browser. They do not sync automatically
between devices. To keep a backup or move events, open **+ > Events > Export All**
and choose JSON or Calendar (.ics). Clearing browser data removes locally saved
events and settings.

Place searches send the text you submit to Open-Meteo. Device-location and
coordinate lookups use a reverse-geocoding service. Sharing an event sends it
to the external calendar you choose. Study recordings are saved in this browser
and can be downloaded as files.

Open windows share event changes. If saving fails or another window has changed
the events you are editing, a notice offers recovery actions, including downloading
your unsaved events. Unreadable saved data is preserved so you can recover it.

## Events and calendars

Click or tap an event to open its details. Edit its title, description, times,
or calendar; changes to an existing event are saved automatically. New drafts
are saved only when you choose **Add Event**. **Home** and **Work** are the default
calendars, and you can add your own.

To change an event's color, select it and tap its colored ring.
New random colors favor different hues from overlapping events and neighbors
up to two hours away, with more weight given to closer events.
The next event after the new event ends is also considered, however far away it is.
The initial choice stays fixed when events are edited or moved.
New drafts briefly preview the color candidates before settling on the chosen color.
Turn this off with **Settings > Show Dev Options > Animate new event colors**.
Drag the start or end handle to change its duration directly on the spiral.
Overlapping events share the coil's width. Under **Settings > Show Dev Options**,
choose **Adaptive widths** to fill the available space as overlaps start and end,
or **Fixed lanes** to keep each event's lane and width throughout its duration.
A mouse or pen click selects the event under the pointer; consecutive clicks on
that same event within the same hour cycle through the hour's events.
The first touch tap selects the event under your finger; consecutive taps anywhere
in that hour cycle from there, following the lanes from inner to outer. The chevrons
in the details let you cycle with either input. **+ New** creates another event, and
**Delete** removes the selected event.

When editing text, **Enter** saves a title, **Ctrl+Enter** saves a description,
and **Escape** cancels the text edit. Leaving the field, switching events, or
closing the details finishes the active edit.

[Watch event editing](https://github.com/user-attachments/assets/3ff0ea48-aaf1-4e68-8e91-d3330bf4e0c8)

### Finding, importing, and sharing events

Pull up the bottom time display for the chronological event list. Search by
name, choose which calendars are visible, or long-press an event's calendar tag
to show only that calendar. Selecting a list item jumps to the event and opens
its details. Each row has actions to delete or share it with an external calendar;
the list's bulk actions apply to visible events.

The **Events** section in the **+** panel also offers **Export All** and
**Import Files**. Imports support Spiral JSON and .ics files, including timed
and all-day events. Matching event IDs update existing events; older revisions
are skipped. Invalid files are rejected before adding any events. Recurring
schedules, cancellations, and custom non-IANA time zones are not supported.
See the [time and import guide](docs/time-model.md) for the exact rules.

## Moving through time

Drag clockwise to move forward and counterclockwise to move backward. Release
while moving to let the spiral coast. Scrolling or a two-finger pinch steps
through days. Tap the time display, double-tap outside the spiral, or press
**Space** or **Home** to return to the live clock.

One turn covers the day's 24 clock hours. Midnight has a thicker dividing line,
months have thicker arcs, and the weekday gradient resets on Mondays. Hovering
over an hour shows its date and time. Opening details can switch the view to
circles and zoom in; clicking outside or pressing **Escape** closes it.

Press **?** for the shortcut guide in Settings. Shortcuts apply when you are
outside form controls; **Escape** also works while a control has focus.

| Key | Action |
| --- | --- |
| Left / Right or A / D | Previous / next visible event while selected; otherwise rotate. Add Alt for finer rotation or Alt+Shift for faster rotation |
| Up / Down or W / S | Previous / next visible event while selected; otherwise step through days. Add Alt for hours or Alt+Shift for weeks |
| Space or Home | Return to now |
| N, +, or = | Open Add Event |
| F | Search events |
| Delete or Backspace | Delete the selected event |
| , | Open Settings |
| M | Toggle dark mode |
| ? | Show the shortcut guide |
| Escape | Close the top popup, panel, or view; cancel a text edit or clear a search first |

[Watch navigation](https://github.com/user-attachments/assets/25569a37-a7fb-4b82-8bc3-bdac0c8dc9c4)

## Location and clock changes

Under **Settings > Nighttime Shading**, search for a city, place, or postal code,
enter coordinates, or use your device's location. Search runs when you press
**Enter** or the search button. Use **Use location time zone** to display times
in the selected place's zone. Changing the display zone preserves event times.

During a backward clock change, the repeated hour occupies two consecutive
sections under one hour label. Their divider appears when an event occupies
the hour or **Segment edges** is enabled. These sections are two occurrences
of the same clock hour; simultaneous events still stack within each section.

New timed events last one elapsed hour by default. At a repeated time, you can
choose the first or second occurrence, identified by its UTC offset. The duration
label shows the actual elapsed time. Skipped clock hours stay blank, and manually
entering a nonexistent time shows an error. All-day events keep their calendar
dates when you change zones.

## Customizing Spiral

Open **Settings** for dark mode, sound and vibration, color palettes, layout
presets, and overlays. **Static Mode** keeps midnight at the top; turning it off
keeps the spiral's end at the bottom. **Circle Mode** uses concentric day rings.
**Reset Settings** restores the defaults.
Dark mode uses charcoal surfaces and keeps event colors consistent with light mode.
Nighttime shading remembers a separate opacity for each theme.

**Show Dev Options** reveals controls for the number of days, scale, coil
thickness, guide lines, and labels. You can also adjust the day count with
**Shift+scroll** or a three-finger pinch, and coil thickness with **Ctrl+scroll**
or a four-finger pinch. A Radius value of 1 gives coils equal thickness; higher
values make outer coils wider. The **+** panel includes a random-event generator
for trying different calendars and overlaps. Its progress bar includes **Cancel**;
cancelling discards the unfinished batch and keeps existing events.

**Study Session** records Explore, Tasks, and Debrief, with automatic participant
and task numbering. Switch modes or move to the next task from Settings, then
return to the normal calendar. Optional facilitator tools provide notes, help
markers, starting-calendar resets, and exports. **Study Analysis** shows saved
sessions and task timings. See the [facilitator guide](docs/study.md).
For remote control from a laptop, the optional [study connection service](docs/study-remote-server.md)
pairs multiple phones with one facilitator page. Phone recordings remain local.
Study Session and Dev Options are visible by default, with their controls collapsed.

## Developing Spiral

Spiral is a static web app with Canvas rendering and a service worker for offline
use. There is no build step; the calendar works without a backend. Remote study
control uses a separate optional Node service.

- [Development guide](docs/development.md): run locally, tests, module map, provider configuration, and study tools.
- [Time and import guide](docs/time-model.md): event identity, time zones, clock changes, and import limits.
- [Performance guide](docs/performance.md): rendering design, benchmarks, and remaining limits.
