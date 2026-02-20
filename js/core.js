// SpiralCalendar core class declaration (constructor only).
// Additional methods are attached in separate files via Object.assign.

class SpiralCalendar {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');
      
      // Default settings object for persistence and reset functionality
      this.defaultSettings = {
        days: CONFIG.DEFAULT_VALUES.days,
        spiralScale: CONFIG.DEFAULT_VALUES.spiralScale,
        radiusExponent: CONFIG.DEFAULT_VALUES.radiusExponent,
        rotation: CONFIG.DEFAULT_VALUES.rotation,
        staticMode: true,
        showHourNumbers: true,
        showDayNumbers: true,
        showMonthNumbers: false,
        showMonthNames: true,
        showYearNumbers: false,
        showTooltip: true,
        hourNumbersOutward: true,
        hourNumbersInsideSegment: false,
        hourNumbersUpright: false,
        dayNumbersUpright: false,
        hideDayWhenHourInside: true,
        monthNumbersUpright: false,
        // Day label composition options
        dayLabelShowWeekday: true,
        dayLabelShowMonth: true,
        dayLabelShowYear: true,
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
        showDayOverlay: true,
        // Event color generation
        colorMode: 'random', // 'random' | 'pastel' | 'vibrant' | 'monoHue' | 'single'
        baseHue: 200,        // used by monoHue
        singleColor: '#4CAF50',
        showGradientOverlay: true,
        showTimeDisplay: true,
        showSegmentEdges: false,
        showArcLines: true,
        overlayStackMode: true,
        audioFeedbackEnabled: true,
        animationEnabled: false,
        animationSpeed: 1.0,
        textClippingEnabled: false,
        darkMode: false,
        calendars: ['Home', 'Work'],
        selectedCalendar: 'Home',
        visibleCalendars: ['Home', 'Work'],
        calendarColors: {
          'Home': '#59a7d7',
          'Work': '#d57ff5'
        },
        eventListColorStyle: 'dot', // 'row' for full row background, 'dot' for colored circle
        // Dev mode line toggles
        showMonthLines: true,
        showMidnightLines: true,
        showNoonLines: false,
        showSixAmPmLines: false,
        // Overlay opacity values (0.0 to 1.0)
        nightOverlayOpacity: 0.05,
        dayOverlayOpacity: 0.15,
        gradientOverlayOpacity: 0.05, // Maximum opacity at center/inward edge
      };
      
      // State variables - load from localStorage or use defaults
      this.state = {
        days: this.defaultSettings.days,
        spiralScale: this.defaultSettings.spiralScale,
        radiusExponent: this.defaultSettings.radiusExponent,
        rotation: this.defaultSettings.rotation,
        staticMode: this.defaultSettings.staticMode,
        showHourNumbers: this.defaultSettings.showHourNumbers,
        showDayNumbers: this.defaultSettings.showDayNumbers,
        showMonthNumbers: this.defaultSettings.showMonthNumbers,
        showMonthNames: this.defaultSettings.showMonthNames,
        showYearNumbers: this.defaultSettings.showYearNumbers,
        showTooltip: this.defaultSettings.showTooltip,
        hourNumbersOutward: this.defaultSettings.hourNumbersOutward,
        hourNumbersInsideSegment: this.defaultSettings.hourNumbersInsideSegment,
        hourNumbersUpright: this.defaultSettings.hourNumbersUpright,
        dayNumbersUpright: this.defaultSettings.dayNumbersUpright,
        hideDayWhenHourInside: this.defaultSettings.hideDayWhenHourInside,
        monthNumbersUpright: this.defaultSettings.monthNumbersUpright,
        dayLabelShowWeekday: this.defaultSettings.dayLabelShowWeekday,
        dayLabelShowMonth: this.defaultSettings.dayLabelShowMonth,
        dayLabelShowYear: this.defaultSettings.dayLabelShowYear,
        dayLabelUseShortNames: this.defaultSettings.dayLabelUseShortNames,
        dayLabelUseShortMonth: this.defaultSettings.dayLabelUseShortMonth,
        dayLabelUseShortYear: this.defaultSettings.dayLabelUseShortYear,
        dayLabelMonthOnFirstOnly: this.defaultSettings.dayLabelMonthOnFirstOnly,
        dayLabelYearOnFirstOnly: this.defaultSettings.dayLabelYearOnFirstOnly,
        dayLabelUseOrdinal: this.defaultSettings.dayLabelUseOrdinal,
        showEverySixthHour: this.defaultSettings.showEverySixthHour,
        hourNumbersStartAtOne: this.defaultSettings.hourNumbersStartAtOne,
        hourNumbersPosition: this.defaultSettings.hourNumbersPosition,
        detailMode: null, // Never persist this
        circleMode: false, // Always start in spiral mode, not persisted
        autoInsideSegmentNumbers: false, // Auto-activated inside segment numbers when zooming past limit
        pastLimitScrollCount: 0, // Count of scroll steps past the limit
        originalSpiralScale: null, // Store original scale before auto-activation
        originalTimeDisplay: null, // Store original time display state before auto-activation
        originalRadiusExponent: null, // Store original radius exponent before auto-activation
        showNightOverlay: this.defaultSettings.showNightOverlay,
        showDayOverlay: this.defaultSettings.showDayOverlay,
        colorMode: this.defaultSettings.colorMode,
        baseHue: this.defaultSettings.baseHue,
        singleColor: this.defaultSettings.singleColor,
        showGradientOverlay: this.defaultSettings.showGradientOverlay,
        showTimeDisplay: this.defaultSettings.showTimeDisplay,
        showSegmentEdges: this.defaultSettings.showSegmentEdges,
        showArcLines: this.defaultSettings.showArcLines,
        overlayStackMode: this.defaultSettings.overlayStackMode,
        audioFeedbackEnabled: this.defaultSettings.audioFeedbackEnabled,
        textClippingEnabled: this.defaultSettings.textClippingEnabled,
        darkMode: this.defaultSettings.darkMode,
        calendars: this.defaultSettings.calendars.slice(),
        selectedCalendar: this.defaultSettings.selectedCalendar,
        visibleCalendars: this.defaultSettings.visibleCalendars.slice(),
        calendarColors: JSON.parse(JSON.stringify(this.defaultSettings.calendarColors)),
        eventListColorStyle: this.defaultSettings.eventListColorStyle,
        // Dev mode line toggles
        showMonthLines: this.defaultSettings.showMonthLines,
        showMidnightLines: this.defaultSettings.showMidnightLines,
        showNoonLines: this.defaultSettings.showNoonLines,
        showSixAmPmLines: this.defaultSettings.showSixAmPmLines,
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
    const currentHour = now.getUTCHours() + TIMEZONE_OFFSET + now.getUTCMinutes() / 60;
      const initialRotation = (currentHour / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
      this.state.rotation = initialRotation;
      // Update the rotateSlider UI to match
      const rotateSlider = document.getElementById('rotateSlider');
      if (rotateSlider) {
        const degrees = initialRotation * 180 / Math.PI;
        rotateSlider.value = degrees;
        const rotateVal = document.getElementById('rotateVal');
        if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
      }

      // Mouse interaction state
      this.mouseState = {
        hoveredSegment: null,
        selectedSegment: null,
        selectedSegmentId: null, // Store segmentId (distance from outside)
        selectedEventIndex: 0, // Track which event is selected when multiple events exist
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
        tooltipPosition: { x: 0, y: 0 } // Tooltip position next to cursor
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
      
      // Track previous mode for auto-switching between spiral/circle
      this._wasSpiralModeBeforeDetail = false;
      
      // Store original spiral scale before adjustments
      this._originalSpiralScale = null;
      
      // Store clickable areas for canvas-drawn elements
      this.canvasClickAreas = {
        startDateBox: null,
        endDateBox: null,
        colorBox: null,
        colorRing: null
      };
      
      // Store virtual event for blank segments being edited
      this.virtualEvent = null;
      
      // Study session data collection (simplified)
      this.studySession = {
        isRecording: false,
        participantName: '',
        startTime: null,
        endTime: null
      };

      // Midnight lines to draw on top
      this.midnightLines = [];
      
      // Month lines to draw on top
      this.monthLines = [];
      
      // Month numbers to draw on top
      this.monthNumbers = [];
        
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
        orientationChangeHandler: null
      };
      
      // Overlay data to draw after events
      this.nightOverlays = [];
      this.dayOverlays = [];
      this.gradientOverlays = [];
      
      // Arc lines to draw on top of everything
      this.arcLines = [];

      // Animation state
      this.animationState = {
        isAnimating: this.defaultSettings.animationEnabled,
        speed: this.defaultSettings.animationSpeed,
        startTime: 0,
        animationId: null
      };

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
        swipeStartY: 0,
        swipeStartHeight: CONFIG.TIME_DISPLAY_HEIGHT,
        swipeLastY: 0,
        swipeThreshold: 18,
        hitPadding: 80,
        // Desktop mouse drag support
        mouseActive: false,
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
      this._eventCircleHasChanges = false; // Track if current event in circle has unsaved changes

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
