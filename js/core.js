// SpiralCalendar core class declaration (constructor only).
// Additional methods are attached in separate files via Object.assign.

class SpiralCalendar {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');
      
      // Default settings object for persistence and reset functionality.
      // Primary source: js/settings-config.js (APP_SETTINGS_DEFAULTS).
      const builtInDefaultSettings = {
        days: CONFIG.DEFAULT_VALUES.days,
        spiralScale: CONFIG.DEFAULT_VALUES.spiralScale,
        radiusExponent: CONFIG.DEFAULT_VALUES.radiusExponent,
        rotation: CONFIG.DEFAULT_VALUES.rotation,
        staticMode: true,
        showHourNumbers: true,
        showDayNumbers: true,
        showTooltip: true,
        hourNumbersOutward: true,
        hourNumbersInsideSegment: false,
        hourNumbersUpright: false,
        dayNumbersUpright: false,
        hideDayWhenHourInside: true,
        dayLabelShowWeekday: true,
        dayLabelShowMonth: true,
        dayLabelShowYear: true,
        dayLabelWeekdayOnOutermost: false,
        dayLabelMonthOnOutermost: true,
        dayLabelYearOnOutermost: false,
        dayLabelUseShortNames: true,
        dayLabelUseShortMonth: true,
        dayLabelUseShortYear: false,
        dayLabelMonthOnFirstOnly: true,
        dayLabelYearOnFirstOnly: true,
        dayLabelUseOrdinal: false,
        showEverySixthHour: false,
        hourNumbersStartAtOne: false,
        hourNumbersPosition: 2,
        showNightOverlay: true,
        useLocationTimezone: true,
        locationTimezoneId: null,
        nightOverlayLat: LOCATION_COORDS.lat,
        nightOverlayLng: LOCATION_COORDS.lng,
        showDayOverlay: true,
        colorMode: 'random',
        paletteAffectsCustomColors: false,
        saturationLevel: 80,
        baseHue: 200,
        singleColor: '#4CAF50',
        showGradientOverlay: true,
        showTimeDisplay: true,
        showSegmentEdges: false,
        showArcLines: true,
        overlayStackMode: true,
        showEventBoundaryStrokes: true,
        showAllEventBoundaryStrokes: false,
        audioFeedbackEnabled: true,
        darkMode: false,
        calendars: ['Home', 'Work'],
        selectedCalendar: 'Home',
        visibleCalendars: ['Home', 'Work'],
        calendarColors: {
          Home: '#59a7d7',
          Work: '#d57ff5'
        },
        showMonthLines: true,
        showMidnightLines: true,
        showNoonLines: false,
        showSixAmPmLines: false,
        enableLongPressJoystick: true,
        detailViewAutoCircleMode: true,
        detailViewAutoZoomEnabled: true,
        detailViewAutoZoomCoils: 0,
        detailViewCloseButtonEnabled: true,
        detailViewCloseButtonAlignToSegment: true,
        nightOverlayOpacity: 0.05,
        dayOverlayOpacity: 0.15,
        gradientOverlayOpacity: 0.15
      };
      const configuredDefaultSettings =
        (typeof APP_SETTINGS_DEFAULTS !== 'undefined' &&
         APP_SETTINGS_DEFAULTS &&
         typeof APP_SETTINGS_DEFAULTS === 'object')
          ? APP_SETTINGS_DEFAULTS
          : {};
      this.defaultSettings = {
        ...builtInDefaultSettings,
        ...configuredDefaultSettings,
        calendars: Array.isArray(configuredDefaultSettings.calendars)
          ? configuredDefaultSettings.calendars.slice()
          : builtInDefaultSettings.calendars.slice(),
        visibleCalendars: Array.isArray(configuredDefaultSettings.visibleCalendars)
          ? configuredDefaultSettings.visibleCalendars.slice()
          : builtInDefaultSettings.visibleCalendars.slice(),
        calendarColors: JSON.parse(JSON.stringify(
          (configuredDefaultSettings.calendarColors &&
           typeof configuredDefaultSettings.calendarColors === 'object')
            ? configuredDefaultSettings.calendarColors
            : builtInDefaultSettings.calendarColors
        ))
      };
      if (!Array.isArray(this.defaultSettings.visibleCalendars) || this.defaultSettings.visibleCalendars.length === 0) {
        this.defaultSettings.visibleCalendars = this.defaultSettings.calendars.slice();
      }
      
      // State variables - load from localStorage or use defaults
      this.state = {
        days: this.defaultSettings.days,
        spiralScale: this.defaultSettings.spiralScale,
        radiusExponent: this.defaultSettings.radiusExponent,
        rotation: this.defaultSettings.rotation,
        staticMode: this.defaultSettings.staticMode,
        showHourNumbers: this.defaultSettings.showHourNumbers,
        showDayNumbers: this.defaultSettings.showDayNumbers,
        showTooltip: this.defaultSettings.showTooltip,
        hourNumbersOutward: this.defaultSettings.hourNumbersOutward,
        hourNumbersInsideSegment: this.defaultSettings.hourNumbersInsideSegment,
        hourNumbersUpright: this.defaultSettings.hourNumbersUpright,
        dayNumbersUpright: this.defaultSettings.dayNumbersUpright,
        hideDayWhenHourInside: this.defaultSettings.hideDayWhenHourInside,
        dayLabelShowWeekday: this.defaultSettings.dayLabelShowWeekday,
        dayLabelShowMonth: this.defaultSettings.dayLabelShowMonth,
        dayLabelShowYear: this.defaultSettings.dayLabelShowYear,
        dayLabelWeekdayOnOutermost: this.defaultSettings.dayLabelWeekdayOnOutermost,
        dayLabelMonthOnOutermost: this.defaultSettings.dayLabelMonthOnOutermost,
        dayLabelYearOnOutermost: this.defaultSettings.dayLabelYearOnOutermost,
        dayLabelUseShortNames: this.defaultSettings.dayLabelUseShortNames,
        dayLabelUseShortMonth: this.defaultSettings.dayLabelUseShortMonth,
        dayLabelUseShortYear: this.defaultSettings.dayLabelUseShortYear,
        dayLabelMonthOnFirstOnly: this.defaultSettings.dayLabelMonthOnFirstOnly,
        dayLabelYearOnFirstOnly: this.defaultSettings.dayLabelYearOnFirstOnly,
        dayLabelUseOrdinal: this.defaultSettings.dayLabelUseOrdinal,
        showEverySixthHour: this.defaultSettings.showEverySixthHour,
        hourNumbersStartAtOne: this.defaultSettings.hourNumbersStartAtOne,
        hourNumbersPosition: this.defaultSettings.hourNumbersPosition,
        detailViewDay: null, // Never persist this
        circleMode: false, // Always start in spiral mode, not persisted
        autoInsideSegmentNumbers: false, // Auto-activated inside segment numbers when zooming past limit
        pastLimitScrollCount: 0, // Count of scroll steps past the limit
        originalSpiralScale: null, // Store original scale before auto-activation
        originalTimeDisplay: null, // Store original time display state before auto-activation
        originalRadiusExponent: null, // Store original radius exponent before auto-activation
        showNightOverlay: this.defaultSettings.showNightOverlay,
        useLocationTimezone: this.defaultSettings.useLocationTimezone,
        locationTimezoneId: this.defaultSettings.locationTimezoneId,
        nightOverlayLat: this.defaultSettings.nightOverlayLat,
        nightOverlayLng: this.defaultSettings.nightOverlayLng,
        showDayOverlay: this.defaultSettings.showDayOverlay,
        colorMode: this.defaultSettings.colorMode,
        paletteAffectsCustomColors: this.defaultSettings.paletteAffectsCustomColors,
        saturationLevel: this.defaultSettings.saturationLevel,
        baseHue: this.defaultSettings.baseHue,
        singleColor: this.defaultSettings.singleColor,
        showGradientOverlay: this.defaultSettings.showGradientOverlay,
        showTimeDisplay: this.defaultSettings.showTimeDisplay,
        showSegmentEdges: this.defaultSettings.showSegmentEdges,
        showArcLines: this.defaultSettings.showArcLines,
        overlayStackMode: this.defaultSettings.overlayStackMode,
        showEventBoundaryStrokes: this.defaultSettings.showEventBoundaryStrokes,
        showAllEventBoundaryStrokes: this.defaultSettings.showAllEventBoundaryStrokes,
        audioFeedbackEnabled: this.defaultSettings.audioFeedbackEnabled,
        darkMode: this.defaultSettings.darkMode,
        calendars: this.defaultSettings.calendars.slice(),
        selectedCalendar: this.defaultSettings.selectedCalendar,
        visibleCalendars: this.defaultSettings.visibleCalendars.slice(),
        calendarColors: JSON.parse(JSON.stringify(this.defaultSettings.calendarColors)),
        // Dev mode line toggles
        showMonthLines: this.defaultSettings.showMonthLines,
        showMidnightLines: this.defaultSettings.showMidnightLines,
        showNoonLines: this.defaultSettings.showNoonLines,
        showSixAmPmLines: this.defaultSettings.showSixAmPmLines,
        enableLongPressJoystick: this.defaultSettings.enableLongPressJoystick,
        detailViewAutoCircleMode: this.defaultSettings.detailViewAutoCircleMode,
        detailViewAutoZoomEnabled: this.defaultSettings.detailViewAutoZoomEnabled,
        detailViewAutoZoomCoils: this.defaultSettings.detailViewAutoZoomCoils,
        detailViewCloseButtonEnabled: this.defaultSettings.detailViewCloseButtonEnabled,
        detailViewCloseButtonAlignToSegment: this.defaultSettings.detailViewCloseButtonAlignToSegment,
        // Overlay opacity values
        nightOverlayOpacity: this.defaultSettings.nightOverlayOpacity,
        dayOverlayOpacity: this.defaultSettings.dayOverlayOpacity,
        gradientOverlayOpacity: this.defaultSettings.gradientOverlayOpacity,
      };

      // User activation state for audio/haptics policies
      this._userHasInteracted = false;

      // Event/layout cache
      this._eventsVersion = 0;
      this.layoutCache = null; // { windowStartMs, windowEndMs, eventsVersion, eventToLane, eventToComponent, componentLaneCount }

    // Set referenceTime to the first hour of the current day (00:00) in UTC
      const now = new Date();
    // Create a pure UTC reference time
    this.referenceTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    // Set initial rotation so the current hour is at the bottom (using UTC)
    const timezoneOffsetHours = (typeof this.getTimezoneOffsetHours === 'function')
      ? this.getTimezoneOffsetHours(now)
      : (now.getTimezoneOffset() / -60);
    const currentHour = ((now.getUTCHours() + timezoneOffsetHours + now.getUTCMinutes() / 60) % 24 + 24) % 24;
      const initialRotation = (currentHour / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
      this.state.rotation = initialRotation;


      // Mouse interaction state
      this.mouseState = {
        hoveredSegment: null,
        selectedSegment: null,
        selectedSegmentId: null, // Store segmentId (distance from outside)
        selectedEventIndex: 0, // Track which event is selected when multiple events exist
        hoveredDetailElement: null,
        hoveredHandle: null, // 'start' | 'end' | null for event time handles
        draggingHandle: null, // 'start' | 'end' while dragging a handle
        isHandleDragging: false,
        isDragging: false,
        wasDragging: false,
        dragStartAngle: 0,
        dragStartRotation: 0,
        lastAngle: 0, // Track the last angle for continuous rotation
        hasMovedDuringDrag: false,
        hoveredTimeDisplay: false, // Track if hovering over time display
        clickingTimeDisplay: false, // Track if clicking on time display
        previousInertiaVelocity: 0, // Store previous inertia velocity for momentum accumulation
        hoveredEvent: null, // Track hovered event for tooltip
        tooltipPosition: { x: 0, y: 0 }, // Tooltip position next to cursor
        lastMouseX: 0,
        lastMouseY: 0
      };

      // Track persistent inputs state
      this.persistentInputsState = {
        currentEventId: null,
        inputsCreated: false
      };
      
      // Track editing state to prevent repositioning during edits
      this.editingState = {
        isEditingTitle: false,
        isEditingDescription: false
      };
      
      // Store original spiral scale before adjustments
      this._originalSpiralScale = null;
      this._detailViewAutoZoomAnimationId = null;
      this._detailViewOpeningRotation = null;
      
      // Store clickable areas for canvas-drawn elements
      this.canvasClickAreas = {
        startDateBox: null,
        endDateBox: null,
        colorBox: null,
        colorRing: null,
        closeDetailButton: null,
        prevEventChevron: null,
        nextEventChevron: null
      };
      
      // Store draft event for blank segments being edited
      this.draftEvent = null;
      
      // Study session state is managed in js/study-session.js
      this.studySession = null;

      // Midnight lines to draw on top
      this.midnightLines = [];
      
      // Month lines to draw on top
      this.monthLines = [];
        
        // Day numbers to draw on top
        this.dayNumbers = [];

      // Hour numbers inside segments to draw above events
      this.hourNumbersInSegments = [];
      
      // Highlighted segments to draw on top
      this.highlightedSegments = [];
    
          // Event segments to draw after main segments
      this.eventSegments = [];
      
      // Mobile orientation state for time display
      this.mobileOrientationState = {
        isLandscape: false,
        timeDisplayWasEnabled: false,
        orientationChangeHandler: null,
        orientationResizeHandler: null
      };

      this.resizeSyncState = {
        animationFrameId: null,
        timeoutIds: []
      };
      
      // Overlay data to draw after events
      this.nightOverlays = [];
      this.dayOverlays = [];
      this.gradientOverlays = [];
      
      // Arc lines to draw on top of everything
      this.arcLines = [];

      this.startupAnimationState = {
        active: true,
        started: false,
        animationId: null,
        progress: 0,
        revealedHourSegmentKeys: []
      };

      this.urlSettingsOverrides = {
        active: false,
        forcedKeys: [],
        baseSettings: null
      };

      this.modeTransitionState = {
        active: false,
        progress: 0,
        fromProgress: 0,
        toProgress: 0,
        startScale: this.state.spiralScale,
        endScale: this.state.spiralScale,
        startRadialOffset: 0,
        endRadialOffset: 0,
        animationId: null,
        durationMs: 650,
        targetCircleMode: false,
        morphGeometry: true,
        persistScaleState: true,
        restoreScaleOnExit: true,
        alignVisibilityToMidnight: false,
        showDetailViewPreview: false,
        onComplete: null
      };

      this._detailViewAutoCircleActive = false;

      // Auto time align state
      this.autoTimeAlignState = {
      enabled: true,
        intervalId: null
      };

      // Time display UI state (collapsible bar)
      this.timeDisplayState = {
        collapsed: false,
        collapseHeight: 14, // px
        currentHeight: CONFIG.TIME_DISPLAY_HEIGHT,
        targetHeight: CONFIG.TIME_DISPLAY_HEIGHT,
        animId: null,
        swipeActive: false,
        swipeStartedInRenderRect: false,
        swipeStartY: 0,
        swipeStartHeight: CONFIG.TIME_DISPLAY_HEIGHT,
        swipeLastY: 0,
        swipeThreshold: 18,
        hitPadding: 80,
        // Desktop mouse drag support
        mouseActive: false,
        mouseStartedInRenderRect: false,
        mouseStartY: 0,
        mouseLastY: 0,
        mouseStartHeight: CONFIG.TIME_DISPLAY_HEIGHT,
      // Event list expansion state
      eventListMaxHeight: 0, // Maximum height for event list when fully expanded (calculated as 1/3 of screen height)
      eventListThreshold: 20, // Pull-up distance threshold to start showing event list (in pixels above normal position)
      eventListCurrentHeight: 0, // Current visible height of event list
      pullUpOffset: 0, // How far up the time display has been pulled (affects event list height)
      justFinishedDrag: false // Flag to prevent segment selection after time display drag
      };

      // Events storage
      this.events = [];
      this.eventListSearchQuery = ''; // Search query for filtering events
      this._shouldUpdateEventList = false; // Flag to control event list updates
      this._previousVisibleCalendars = null; // Store previous calendar visibility before filtering
      this._detailViewHasChanges = false; // Track if current detail view has unsaved changes

      // Cached calculations
      this.cache = {
        colors: [],
        maxDays: 0,
        totalSegments: 0
      };

      this.init();
    // --- Event Input Panel logic ---
    this.setupEventInputPanel();
  }
}

window.SpiralCalendar = SpiralCalendar;
