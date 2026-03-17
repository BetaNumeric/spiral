# **Spiral**

 
[**Live Demo**](https://betanumeric.github.io/spiral/)

This time-visualization application combines two time-measuring methods: the calendar and the clock. It uses the same motion we go through during a day as we move around Earth’s rotational axis. It doesn’t assume a circular repetition of days, as clocks do, but rather a continuous forward motion, as our planet does when it orbits the sun. The length of the solar illumination varies, since Earth's axis is tilted relative to the ecliptic (obliquity of the ecliptic). This is incorporated into the spiral with a subtle overlay that marks the time between sunset and sunrise for each day, based on the user’s location.





## **Controls and Usage**

You navigate by performing a circular motion around the spiral's center. The spiral follows the finger/cursor and rotates with it: clockwise moves forward in time, counterclockwise rewinds. The spiral has inertia, so you can keep adding momentum by releasing it mid-motion, and it will keep rotating, slowing down until it stops. 
Pinch-zooming or scrolling lets you move through time faster, skipping in steps of whole days. When moving the spiral manually, each hour produces a light click sound/vibration, and crossing midnight produces a stronger one.
By default, the spiral shows the current time and adjusts its position every second. To reset to the current time after the spiral has been rotated, double-tap anywhere outside the spiral or tap the time display at the bottom of the screen. This box shows the date and time at which the calendar is currently scrolled to. Tapping it syncs the spiral to the device’s local time, resuming to update every second. It can be minimized by dragging it down.

## **Visual Structure of the Spiral**

The beginning of a new day is marked by a thicker stroke at the 24:00 / 0:00 segment line. Similarly, a new month is indicated by a thicker arc line. Weekdays can be separated by a gradient overlay that makes each weekday slightly darker and resets on Mondays. 

Each day has its number and weekday written in the first segment; the first day of the month also has the month, and the first day of the year has the year number added to it. Around the outer segments are the hour numbers going from 0 to 23.
Each revolution of the spiral is divided into 24 segments, representing the hours of a day. Hovering over them reveals the outline of the segment, and a tooltip text appears with the segment’s date and time. Clicking a segment opens a circular info screen in the middle. To properly accommodate the info circle, the calendar switches to a concentric-circle mode. It can be enlarged by zooming in, which maximizes its size in multiple steps. Clicking anywhere else closes the screen and returns to the spiral.

https://github.com/user-attachments/assets/25569a37-a7fb-4b82-8bc3-bdac0c8dc9c4

## **Adding and Editing Events**

The info circle lets you add an event to the calendar. It contains several input fields and a button to add the event. In the center are two fields for setting the event’s start and end time and date, which defaults to the beginning and end of the selected segment. Above them, you can add a title and description. Below, you can choose which calendar the event belongs to. “Home” and “Work” are defaults, but custom calendars can be added.
The circle has an outline in the event’s color. You can change the randomly selected default color by clicking this ring or clicking on the selected segment containing the event.

When you click the “Add Event” button at the bottom, the circle closes, and the event is added to the spiral calendar, coloring the area during which it takes place. Clicking any segment with an event in it opens a similar window, but with the event’s data already in the input fields. At the bottom, there are two buttons, one to delete the event and one to add a new event, which opens an empty circle like before. If you change anything, the “add” button becomes a “done” button, which closes the event screen.
When two or more events are added to the same segment, they will stack in the spiral. To access an overlapping event, you can click the selected segment multiple times or the chevron arrows at the top of the event circle to cycle through the events. 

Another feature is the manipulation of an event’s length in the spiral directly. When clicking on an event, it will open the event circle and also show a handle at the start and end of the event. You can click and drag each handle to increase or decrease the event’s length. While dragging, it will switch to spiral mode and hide the event screen. When releasing the handle, the event is saved with the new start and end time. 

## **Event List Timeline**

The time display at the bottom of the screen can be pulled up to reveal an event list. Each event is listed chronologically here, grouped by day, with the event that is closest in the spiral being scrolled to the top and highlighted when it is selected. At the top, there is a search bar to find events by name. One can select which calendars are shown by toggling the active calendars in a list, or by long-pressing the calendar tag of an element to show only events from that calendar. Behind each event in the list, there is a delete “x” button that lets you remove the event, and an “add” button that lets you add the event to your local calendar app. At the top, there is also the option to delete all events or add all events to your local calendar.
Clicking on an event in the list will skip to the first segment containing that event and open it in the info circle.
At the top left corner of the screen is a “+” button that opens a panel with an alternative way to add events to the calendar. It has the same options as the circle, but in a more classic form layout. It also includes the event list and an option to export all events as JSON or .ics files, and another button to import them.

## **Settings**

At the top right corner of the screen is a settings button that opens a panel with multiple options. You can, for example, toggle a dark mode and turn off the sounds. There are sliders with which you can adjust how many days are shown in the spiral. You can also do that by pinch-zooming with three fingers or by scrolling while holding down the Shift key. 
Another slider controls the change in the radius of the spiral segments, where a value of 1 keeps all segments at the same thickness, and higher values make them wider the further out they are. You can also adjust this value by pinch-zooming with four fingers or scrolling while holding the CTRL key.

“Static Mode” is enabled by default and keeps the spiral oriented in a fixed way, with midnight at the top, with the end of the spiral rotating around. Turning it off lets you rotate the spiral and keeps the end of the spiral always fixed at the bottom. 

Other options are toggling the overlays, with sub-options to change their opacity. The nighttime overlay also has the option to enter your coordinates, search for a place, or let the calendar access your device's location. 

Another option is to change the color palette used to generate the random default event colors. For example, a colorblind palette that only uses colors that maximize visibility for the colorblind. Other options are a softer, pastel color palette, a monochrome or single hue palette, a single color palette, seasonal change over a year, or the option to show the color of the event’s calendar instead.

At the bottom, there is the option to reset the settings to the default.

## **Developer Mode and Experimental Features**

More experimental settings are hidden, but can be accessed in the developer mode. 

For fine-grained control of the calendar's looks, the dev setting includes a group of advanced visual options. Here you can toggle additional guide lines (such as noon or 6 am / 6 pm markers), show or hide segment borders, and adjust how text is rendered inside the spiral (for example, showing year and month names only on the first segment of each period). You can also fine-tune how hours, days, months, and years are labeled, choosing between different formats and levels of detail.

Developer Mode also includes a random events generator used for testing. It is located at the bottom of the “Add Events” panel. With it, you can quickly populate the spiral with synthetic events spread across multiple days, using varying durations, start times, and calendars. This makes it easy to see how overlapping events stack, how different color palettes behave, and how the event list and interactions perform under heavier loads. 
