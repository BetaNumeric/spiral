// Central place to customize app defaults and what DEV options hide/show.
// Loaded before core/bootstrap scripts.

const APP_SETTINGS_DEFAULTS = {
  // Core spiral defaults
  days: CONFIG.DEFAULT_VALUES.days,
  spiralScale: CONFIG.DEFAULT_VALUES.spiralScale,
  radiusExponent: CONFIG.DEFAULT_VALUES.radiusExponent,
  rotation: CONFIG.DEFAULT_VALUES.rotation,
  staticMode: true,

  // Labels and tooltips
  showHourNumbers: true,
  showDayNumbers: true,
  showTooltip: true,
  hourNumbersOutward: true,
  hourNumbersInsideSegment: false,
  hourNumbersUpright: true,
  dayNumbersUpright: false,
  hideDayWhenHourInside: true,

  // Day label composition
  dayLabelShowWeekday: true,
  dayLabelShowMonth: true,
  dayLabelShowYear: true,
  dayLabelUseShortNames: true,
  dayLabelUseShortMonth: true,
  dayLabelUseShortYear: false,
  dayLabelMonthOnFirstOnly: true,
  dayLabelYearOnFirstOnly: true,
  dayLabelUseOrdinal: false,

  // Hour display options
  showEverySixthHour: false,
  hourNumbersStartAtOne: false,
  hourNumbersPosition: 2,

  // Overlays and colors
  showNightOverlay: true,
  // Optional: use the selected location's timezone for current-time alignment
  // and sunrise/sunset calculations.
  useLocationTimezone: false,
  locationTimezoneId: null,
  nightOverlayLat: LOCATION_COORDS.lat,
  nightOverlayLng: LOCATION_COORDS.lng,
  showDayOverlay: true,
  colorMode: 'random',
  saturationLevel: 80,
  baseHue: 200,
  singleColor: '#4CAF50',
  showGradientOverlay: true,
  showTimeDisplay: true,
  showSegmentEdges: false,
  showArcLines: true,
  overlayStackMode: true,

  // UX
  audioFeedbackEnabled: true,
  animationEnabled: false,
  animationSpeed: 1.0,
  darkMode: false,

  // Calendars
  calendars: ['Home', 'Work'],
  selectedCalendar: 'Home',
  visibleCalendars: ['Home', 'Work'],
  calendarColors: {
    Home: '#59a7d7',
    Work: '#d57ff5'
  },
  eventListColorStyle: 'dot',

  // DEV mode line toggles
  showMonthLines: true,
  showMidnightLines: true,
  showNoonLines: false,
  showSixAmPmLines: false,

  // Overlay opacity values (0.0 - 1.0)
  nightOverlayOpacity: 0.05,
  dayOverlayOpacity: 0.15,
  gradientOverlayOpacity: 0.05
};

const APP_DEV_OPTIONS_CONFIG = {
  // Elements hidden when "Dev Options" is OFF.
  advancedOptionIds: [
    'circleMode',
    'rotateSlider', 'rotateVal',
    'rotateMaxSlider', 'rotateMaxVal',
    'showMidnightLinesToggle','showNoonLinesToggle','showSixAmPmLinesToggle',
    'showHourNumbers', 'hourNumbersControls',
    'showDayNumbers', 'dayNumbersControls',
    'timeDisplayToggle',
    'segmentEdgesToggle',
    'arcLinesToggle', 'showMonthLinesToggle',
    'overlayStackMode',
    'tooltipToggle',
    'animateToggle',
    'speedSlider', 'speedVal',
    'eventListColorStyleToggle'
  ],

  // Whole sections hidden when "Dev Options" is OFF.
  devOnlySectionIds: [
    'randomEventsSection',
    'devModeLineToggles'
  ],

  // Visible only when DEV_MODE (compile-time) is true.
  devModeToggleSectionId: 'devModeToggleSection'
};
