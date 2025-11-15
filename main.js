// Configuration constants
const CONFIG = {
    SEGMENTS_PER_DAY: 24,           // hours per day
    ARC_RESOLUTION: 50,             // smoothness of arc curves
    INITIAL_ROTATION_OFFSET: Math.PI / 2,
    STROKE_COLOR: '#444',
    STROKE_WIDTH: .2,
    EVENT_EDGE_STROKE_WIDTH: 1,
    BLANK_COLOR: '#fff',
    MIDNIGHT_SEGMENT_COLOR: '#444',
    MIDNIGHT_BORDER_WIDTH: 1,
    NOON_BORDER_WIDTH: 0.5,
    SIX_AM_PM_BORDER_WIDTH: 0.2,
    MONTH_SEGMENT_COLOR: '#000000',
    MONTH_BORDER_WIDTH: 1,
    UNIFORM_EVENT_THICKNESS: true,
  getHoverSegmentColor: function() {
    return document.body.classList.contains('dark-mode') ? '#606000cc' : '#ffff00cc';
  },
    HOVER_BORDER_WIDTH: 2,
    SELECTED_SEGMENT_COLOR: '#ffff00',
    SELECTED_BORDER_WIDTH: 3,
    DEFAULT_VALUES: {
      days: 7,
    spiralScale: 0.40,
      radiusExponent: 2,
      rotation: 0
    },
    LABEL_COLOR: '#000000',
  LABEL_FONT: '16px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  NIGHT_OVERLAY_COLOR: 'rgba(0, 0, 0, 0.05)',
  TIME_DISPLAY_HEIGHT: 80,  // Height of the time display bar at the bottom
};

// Development flag - set to false to hide advanced options
const DEV_MODE = true;

// Study mode flag - set to true to enable study session controls
const STUDY_MODE = true;

// Runtime DEV_MODE override (for toggle button)
let runtimeDevModeOverride = null;

// Helper function to get effective DEV_MODE state
function getEffectiveDevMode() {
  return runtimeDevModeOverride !== null ? runtimeDevModeOverride : DEV_MODE;
}

// Default night time start and end (in hours, e.g., 18.5 = 18:30, 5.5 = 5:30)
let NIGHT_START = 19.25;
let NIGHT_END = 5.92;

// Coordinates for sunrise/sunset calculations (Bremen, Germany)
const LOCATION_COORDS = {
lat: 53.0793,
lng: 8.8017
};


// Automatically calculate timezone offset in hours
const TIMEZONE_OFFSET = new Date().getTimezoneOffset() / -60;

//Calculate sunrise and sunset times for a given date and location

// Helper function to parse datetime-local input as UTC
function parseDateTimeLocalAsUTC(dateTimeString) {
// datetime-local format is YYYY-MM-DDTHH:MM
// We need to parse this as UTC to avoid DST issues
const [datePart, timePart] = dateTimeString.split('T');
const [year, month, day] = datePart.split('-').map(Number);
const [hour, minute] = timePart.split(':').map(Number);
return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

function calculateSunTimes(date, coords = LOCATION_COORDS) {
try {
  const times = SunCalc.getTimes(date, coords.lat, coords.lng);
  
  // Convert Date objects to hours
  const sunrise = times.sunrise.getUTCHours() + TIMEZONE_OFFSET + times.sunrise.getUTCMinutes() / 60;
  const sunset = times.sunset.getUTCHours() + TIMEZONE_OFFSET + times.sunset.getUTCMinutes() / 60;
  
  return { sunrise, sunset };
} catch (error) {
  console.warn('Failed to calculate sun times, using defaults:', error);
  return { sunrise: 6, sunset: 18 };
}
}

// Global helpers
// Format a Date as UTC for ICS (YYYYMMDDTHHMMSSZ)
function formatIcsDateUTC(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

// Escape text for ICS properties
function escapeIcsText(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, '\\$&')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// Generate consistent UID for calendar events to prevent duplicates
function generateEventUID(event) {
  // If event has a persistent UID, use it (for existing events)
  if (event.persistentUID) {
    return event.persistentUID;
  }
  
  // For new events, create a hash-like identifier based on event properties
  const eventKey = `${event.title}-${event.start.getTime()}-${event.end.getTime()}-${event.description || ''}`;
  
  // Simple hash function to create a consistent UID
  let hash = 0;
  for (let i = 0; i < eventKey.length; i++) {
    const char = eventKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use absolute value and convert to base36 for shorter UID
  const uidHash = Math.abs(hash).toString(36);
  
  // Format: spiral-[hash]-[calendar] for consistency
  const calendar = event.calendar || 'Home';
  return `spiral-${uidHash}-${calendar.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

// Generate sequence number for event updates
function generateEventSequence(event) {
  // Use a combination of event properties to create a sequence number
  // This helps calendar apps identify when an event has been updated
  const sequenceKey = `${event.title}-${event.start.getTime()}-${event.end.getTime()}-${event.description || ''}-${event.color}`;
  
  let hash = 0;
  for (let i = 0; i < sequenceKey.length; i++) {
    const char = sequenceKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Return a sequence number (0-999) based on the hash
  return Math.abs(hash) % 1000;
}

// Format a Date for <input type="datetime-local"> using local time
function formatDateTimeLocalForInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Reliably open a native input picker (date/time/color) across platforms
function openNativePicker(input) {
  if (!input) return;
  try { input.focus(); } catch (_) {}
  try { input.click(); } catch (_) {}
  if (typeof input.showPicker === 'function') {
    try { input.showPicker(); } catch (_) {}
  }
}

// Small helpers
const pad2 = (n) => String(n).padStart(2, '0');
const isMobileDevice = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768 && window.innerHeight <= 1024);

// Helper function to ensure consistent font rendering across all devices
const getFontString = (size, weight = '') => {
  // Use a comprehensive font stack that ensures sans-serif on all devices
  const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  return `${weight}${size}px ${fontFamily}`;
};

// Shared UTC labels
const WEEKDAYS_UTC = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG_UTC = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT_UTC = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT_UTC = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Simple Union-Find (Disjoint Set) factory for small graphs
function createUnionFind(size) {
  const parent = new Array(size).fill(0).map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  return { parent, find, unite };
}

  // Spiral Calendar Class - Main application controller
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
        deviceOrientationEnabled: false,
        animationEnabled: false,
        animationSpeed: 1.0,
        betaThreshold: 8,
        gammaThreshold: 6,
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
        clickingTiltZoomArea: false, // Track if pressing the tilt-zoom area in time display
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
        colorRing: null,
        tiltZoomArea: null
      };
      // Long-press/suppression helpers for tilt-zoom
      this._tiltZoomPressTimerId = null;
      this._suppressTimeDisplayClickOnce = false;
      // Pending enable flag to trigger iOS permission on touchend/mouseup
      this._pendingEnableDeviceOrientation = false;
      
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
      
      // Unified device orientation thresholds - control both visual indicators and actual rotation
      // To modify sensitivity: change these values (higher = less sensitive, lower = more sensitive)
      // 
      // ADJUSTMENT GUIDE:
      // - beta: Minimum tilt up/down to start zooming (default: 8°)
      // - gamma: Minimum tilt left/right to start rotating (default: 6°)
      // - maxBeta: Maximum tilt range for zooming (default: 45°)
      // - maxGamma: Maximum tilt range for rotation (default: 45°)
      
      this.deviceOrientationThresholds = {
        beta: this.defaultSettings.betaThreshold,     // degrees - minimum tilt to start zooming (up/down)
        gamma: this.defaultSettings.gammaThreshold,    // degrees - minimum tilt to start rotating (left/right)
        maxBeta: 45, // degrees - maximum tilt range for zooming
        maxGamma: 45 // degrees - maximum tilt range for rotation
      };
      
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
      
      // Device orientation control state
      this.deviceOrientationState = {
        enabled: this.defaultSettings.deviceOrientationEnabled,
        permissionGranted: false,
        buttonVisible: this.defaultSettings.deviceOrientationEnabled, // Controls whether tilt-zoom button is shown
        alpha: 0,
        beta: 0,
        gamma: 0,
  
        lastBeta: null,
        lastGamma: null,
        lastAlpha: null,
        betaOffset: null,
        gammaOffset: null,
        boundHandler: null,
        lastUpdateTime: null,
        isRequestingPermission: false,
        tiltZoomActive: false,
        tiltZoomStartBeta: null,
        tiltZoomStartGamma: null,
        tiltZoomStartAlpha: null,
        tiltZoomStartRotation: null,
        lastJumpTime: null,
        lastRotationTime: null
      };
      
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
    ensureLayoutCache() {
      const windowStartMs = this.referenceTime.getTime();
      const windowEndMs = this.referenceTime.getTime() + this.state.days * 24 * 60 * 60 * 1000;
      const needRebuild = !this.layoutCache ||
        this.layoutCache.windowStartMs !== windowStartMs ||
        this.layoutCache.windowEndMs !== windowEndMs ||
        this.layoutCache.eventsVersion !== this._eventsVersion;
      if (!needRebuild) return;

      const { eventToLane } = this.computePersistentEventLanesForWindow();
      const { eventToComponent, componentLaneCount } = this.computeEventComponentsForWindow(eventToLane);
      this.layoutCache = {
        windowStartMs,
        windowEndMs,
        eventsVersion: this._eventsVersion,
        eventToLane,
        eventToComponent,
        componentLaneCount,
      };
    }

    init() {
      this.setupCache();
      this.generateColors();
      
      // Load settings before setting up event handlers
      this.loadSettingsFromStorage();
      
      this.setupEventHandlers();
      this.setupCanvas();
      // Prime audio after first user gesture to satisfy autoplay policies
      this.installAudioGesturePrimer();
      // Setup mobile orientation detection for time display
      this.setupMobileOrientationDetection();
    
    // Initialize Auto Time Align if enabled by default
    if (this.autoTimeAlignState.enabled) {
      this.startAutoTimeAlign();
    }
    
    // Load saved events from localStorage
    this.loadEventsFromStorage();
    
    // Ensure checkbox state is synchronized with internal state
    this.syncAutoTimeAlignCheckbox();
    
    // Initialize threshold controls to match current values
    this.syncThresholdControls();
    
    // Sync all UI controls with loaded settings
    this.syncAllUIControls();
    
    // Start animation if it was enabled in saved settings
    if (this.animationState.isAnimating) {
      this.startAnimation();
    }
    }

    setupCache() {
      this.cache.maxDays = +document.getElementById('daysSlider').max;
      // Add buffer segments for smooth rotation revealing
      this.cache.totalSegments = (this.cache.maxDays + 1) * CONFIG.SEGMENTS_PER_DAY;
    }

    /**
     * Wrap text to fit within a specified width
     */
    wrapText(text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      for (const word of words) {
        // Check if the word itself is longer than maxWidth
        const wordMetrics = this.ctx.measureText(word);
        if (wordMetrics.width > maxWidth) {
          // If current line has content, push it first
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          
          // Break the long word into characters
          let charLine = '';
          for (const char of word) {
            const testCharLine = charLine + char;
            const charMetrics = this.ctx.measureText(testCharLine);
            
            if (charMetrics.width > maxWidth) {
              if (charLine) {
                lines.push(charLine);
                charLine = char;
              } else {
                // Single character is too wide, clip it
                lines.push(char);
                charLine = '';
              }
            } else {
              charLine = testCharLine;
            }
          }
          
          if (charLine) {
            currentLine = charLine;
          }
        } else {
          // Normal word processing
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = this.ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && currentLine !== '') {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines;
    }

    /**
     * Convert HSL color to Hex format
     */
    hslToHex(hsl) {
      // Parse HSL values
      const match = hsl.match(/hsl\(([^,]+),\s*([^,]+)%,\s*([^)]+)%\)/);
      if (!match) return '#ff6b6b'; // fallback
      
      const h = parseFloat(match[1]);
      const s = parseFloat(match[2]);
      const l = parseFloat(match[3]);
      
      // Convert HSL to RGB
      const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l / 100 - c / 2;
      
      let r, g, b;
      if (h >= 0 && h < 60) {
        [r, g, b] = [c, x, 0];
      } else if (h >= 60 && h < 120) {
        [r, g, b] = [x, c, 0];
      } else if (h >= 120 && h < 180) {
        [r, g, b] = [0, c, x];
      } else if (h >= 180 && h < 240) {
        [r, g, b] = [0, x, c];
      } else if (h >= 240 && h < 300) {
        [r, g, b] = [x, 0, c];
      } else {
        [r, g, b] = [c, 0, x];
      }
      
      // Convert to hex
      const toHex = (n) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * Check if a segment represents the 1st day of a month
     */
    isFirstDayOfMonth(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
    // Check if this date is the 1st day of the month (using UTC)
    return segmentDate.getUTCDate() === 1;
    }

    /**
     * Check if a segment represents the first hour of the first day of a month
     */
    isFirstHourOfMonth(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
    // Check if this date is the 1st day of the month AND the hour is 0 (first hour) (using UTC)
    return segmentDate.getUTCDate() === 1 && segmentDate.getUTCHours() === 0;
    }

    /**
     * Get the month number for a segment (1-12)
     */
    getMonthNumber(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
    // Return month number (1-12) (using UTC)
    return segmentDate.getUTCMonth() + 1;
    }

    /**
     * Check if a segment represents the first hour of a day
     */
    isFirstHourOfDay(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Check if the hour is 0 (first hour of the day) (using UTC)
      return segmentDate.getUTCHours() === 0;
    }

    /**
     * Get the day number for a segment (1-31)
     */
    getDayNumber(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Return day number (1-31) (using UTC)
      return segmentDate.getUTCDate();
    }

    /**
     * Get all events that overlap with a segment and return their details
     */
    getAllEventsForSegment(day, segment) {
      // Calculate the date/time this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      const segmentHourStart = new Date(segmentDate);
    segmentHourStart.setUTCMinutes(0, 0, 0);
      const segmentHourEnd = new Date(segmentHourStart);
    segmentHourEnd.setUTCHours(segmentHourStart.getUTCHours() + 1);
      
      const overlappingEvents = [];
      
      // Check each event to see if this segment falls within it and passes calendar filter
      for (const event of this.events) {
        // Ensure event has a calendar tag; default to 'Home' for legacy
        const eventCalendar = event.calendar || 'Home';
        if (!this.state.visibleCalendars.includes(eventCalendar)) continue;
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        // Check if there's any overlap between the segment hour and the event
        if (eventStart < segmentHourEnd && eventEnd > segmentHourStart) {
          // Calculate the start and end minutes within this hour segment
          const overlapStart = eventStart > segmentHourStart ? eventStart : segmentHourStart;
          const overlapEnd = eventEnd < segmentHourEnd ? eventEnd : segmentHourEnd;
          
        const startMinute = overlapStart.getUTCMinutes();
        const endMinute = overlapEnd.getUTCMinutes();
          
          // If the event spans the entire next hour, end minute should be 60
          let actualEndMinute = endMinute;
          if (overlapEnd.getTime() === segmentHourEnd.getTime()) {
            actualEndMinute = 60;
          }
          
          overlappingEvents.push({
            event: event,
            color: this.getDisplayColorForEvent(event),
            startMinute: startMinute,
            endMinute: actualEndMinute,
            // Global properties for consistent ordering across segments
            totalDurationMinutes: Math.max(0, Math.round((eventEnd.getTime() - eventStart.getTime()) / (60 * 1000))),
            startUtcMs: eventStart.getTime(),
            endUtcMs: eventEnd.getTime()
          });
        }
      }
      
      return overlappingEvents;
    }

    // Helper: get start of hour UTC
    getHourStartUtc(date) {
      const d = new Date(date);
      d.setUTCMinutes(0, 0, 0);
      return d;
    }

    // Compute the maximum number of concurrent events across all hour slices the given
    // event spans. Used to keep a uniform per-event thickness across its duration.
    getMaxOverlapForEventAcrossHours(targetEvent) {
      if (!this.events || this.events.length === 0) return 1;
      const start = new Date(targetEvent.start);
      const end = new Date(targetEvent.end);
      if (!(start < end)) return 1;

      let hourCursor = this.getHourStartUtc(start);
      const endHour = this.getHourStartUtc(end);
      let maxOverlap = 1;
      const oneHourMs = 60 * 60 * 1000;

      // Iterate hour by hour including the last hour containing 'end' if it is exactly on hour
      while (hourCursor <= endHour) {
        const hourStart = new Date(hourCursor);
        const hourEnd = new Date(hourCursor.getTime() + oneHourMs);
        let overlapCount = 0;
        for (const ev of this.events) {
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          if (evStart < hourEnd && evEnd > hourStart) {
            overlapCount++;
          }
        }
        if (overlapCount > maxOverlap) maxOverlap = overlapCount;
        hourCursor = new Date(hourCursor.getTime() + oneHourMs);
      }
      return Math.max(1, maxOverlap);
    }

    /**
     * Compute lane assignment for events within a single hour segment so that
     * non-overlapping events share lanes and overlapping events are stacked.
     * Returns an object with a lane index per original event index and the total
     * number of lanes used.
     */
    computeEventLanes(events) {
      if (!events || events.length === 0) {
        return { lanes: [], numLanes: 0 };
      }

      // Sort for stable, cross-hour ordering of the same events:
      // 1) by totalDurationMinutes descending (longer events get stable priority)
      // 2) by event global start time (earlier starts first)
      // 3) by in-hour startMinute to keep a natural order within ties
      const indexed = events.map((ev, idx) => ({ ev, idx }));
      indexed.sort((a, b) => {
        const adur = a.ev.totalDurationMinutes || 0;
        const bdur = b.ev.totalDurationMinutes || 0;
        if (bdur !== adur) return bdur - adur;
        const aStart = a.ev.startUtcMs || 0;
        const bStart = b.ev.startUtcMs || 0;
        if (aStart !== bStart) return aStart - bStart;
        if (a.ev.startMinute !== b.ev.startMinute) return a.ev.startMinute - b.ev.startMinute;
        // Final tie-breaker: earlier end inside hour first
        return a.ev.endMinute - b.ev.endMinute;
      });

      const laneEndMinutes = []; // laneEndMinutes[lane] = last end minute in that lane
      const laneByOriginalIndex = new Array(events.length).fill(0);

      for (const item of indexed) {
        const start = item.ev.startMinute;
        const end = item.ev.endMinute;
        let assignedLane = -1;

        // Find first lane whose last event ends at or before this start (no overlap)
        for (let lane = 0; lane < laneEndMinutes.length; lane++) {
          if (start >= laneEndMinutes[lane]) {
            assignedLane = lane;
            laneEndMinutes[lane] = end;
            break;
          }
        }

        // If none fit, open a new lane
        if (assignedLane === -1) {
          assignedLane = laneEndMinutes.length;
          laneEndMinutes.push(end);
        }

        laneByOriginalIndex[item.idx] = assignedLane;
      }

      return { lanes: laneByOriginalIndex, numLanes: laneEndMinutes.length };
    }

    /**
     * Compute persistent lane assignment for all events across the current visible window
     * so that an event keeps the same lane across hour boundaries.
     */
    computePersistentEventLanesForWindow() {
      const windowStart = this.visibleWindowStart();
      const windowEnd = this.visibleWindowEnd();

      // Build list of effective intervals within the window
      const intervals = [];
      for (const ev of this.events) {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        if (!(evStart < windowEnd && evEnd > windowStart)) continue; // no overlap with window
        const start = evStart > windowStart ? evStart : windowStart;
        const end = evEnd < windowEnd ? evEnd : windowEnd;
        if (start >= end) continue;
        const totalDurationMinutes = Math.max(0, Math.round((evEnd.getTime() - evStart.getTime()) / (60 * 1000)));
        intervals.push({ event: ev, start, end, startMs: start.getTime(), endMs: end.getTime(), totalDurationMinutes, globalStartMs: evStart.getTime() });
      }

      // Sweep line: create points, ends before starts at same time
      const points = [];
      for (const it of intervals) {
        points.push({ t: it.startMs, type: 'start', it });
        points.push({ t: it.endMs, type: 'end', it });
      }
      points.sort((a, b) => {
        if (a.t !== b.t) return a.t - b.t;
        if (a.type !== b.type) return a.type === 'end' ? -1 : 1; // end before start
        if (a.type === 'start') {
          // longer events first, then earlier global start
          if (b.it.totalDurationMinutes !== a.it.totalDurationMinutes) return b.it.totalDurationMinutes - a.it.totalDurationMinutes;
          return a.it.globalStartMs - b.it.globalStartMs;
        } else {
          // ends: earlier ends first
          return a.it.endMs - b.it.endMs;
        }
      });

      const eventToLane = new Map();
      const freeLanes = [];
      let maxLaneIndex = -1;

      for (const p of points) {
        const ev = p.it.event;
        if (p.type === 'end') {
          const lane = eventToLane.get(ev);
          if (lane !== undefined) freeLanes.push(lane);
        } else {
          // assign lane
          let lane;
          if (freeLanes.length > 0) {
            // use smallest available lane index
            freeLanes.sort((x, y) => x - y);
            lane = freeLanes.shift();
          } else {
            lane = ++maxLaneIndex;
          }
          eventToLane.set(ev, lane);
        }
      }

      return { eventToLane, numLanes: Math.max(0, maxLaneIndex + 1) };
    }

    /**
     * Build connected components of events over the visible window (edge if two events
     * co-occur in any hour segment). For each component, compute a component-wide lane
     * count that is the max of (per-event required overlap across its hours) and
     * (max persistent lane index used by events in that component + 1).
     */
    computeEventComponentsForWindow(eventToLane) {
      const windowStart = this.visibleWindowStart();
      const windowEnd = this.visibleWindowEnd();

      // Collect window-overlapping events and give them indices
      const nodes = [];
      const eventIndex = new Map();
      for (const ev of this.events) {
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        if (s < windowEnd && e > windowStart) {
          eventIndex.set(ev, nodes.length);
          nodes.push(ev);
        }
      }
      const n = nodes.length;
      if (n === 0) return { eventToComponent: new Map(), componentLaneCount: new Map() };

      // Disjoint set
      const { parent, find, unite } = createUnionFind(n);

      // Build co-occurrence by iterating each hour segment in window
      const totalHours = this.state.days * CONFIG.SEGMENTS_PER_DAY;
      for (let h = 0; h < totalHours; h++) {
        const hourStart = new Date(windowStart.getTime() + h * 60 * 60 * 1000);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        // Gather events in this hour
        const present = [];
        for (const ev of nodes) {
          const s = new Date(ev.start);
          const e = new Date(ev.end);
          if (s < hourEnd && e > hourStart) present.push(ev);
        }
        if (present.length > 1) {
          const baseIdx = eventIndex.get(present[0]);
          for (let i = 1; i < present.length; i++) {
            const idx = eventIndex.get(present[i]);
            unite(baseIdx, idx);
          }
        }
      }

      // Aggregate per-component metrics
      const compEvents = new Map(); // root -> events[]
      for (const ev of nodes) {
        const idx = eventIndex.get(ev);
        const root = find(idx);
        if (!compEvents.has(root)) compEvents.set(root, []);
        compEvents.get(root).push(ev);
      }

      const componentLaneCount = new Map();
      const eventToComponent = new Map();
      for (const [root, evs] of compEvents.entries()) {
        let required = 1;
        let maxLaneIdx = -1;
        for (const ev of evs) {
          required = Math.max(required, this.getMaxOverlapForEventAcrossHours(ev));
          const ln = eventToLane.get(ev);
          if (ln !== undefined) maxLaneIdx = Math.max(maxLaneIdx, ln);
        }
        const compCount = Math.max(required, maxLaneIdx + 1);
        componentLaneCount.set(root, compCount);
        for (const ev of evs) eventToComponent.set(ev, root);
      }

      return { eventToComponent, componentLaneCount };
    }

    /**
     * Check if a segment should be colored by an event and return minute details (legacy function)
     */
    getEventColorForSegment(day, segment) {
      const events = this.getAllEventsForSegment(day, segment);
      if (events.length === 0) return null;
      
      // Use selected event index only for the currently selected segment
      let eventIndex = 0;
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === day && 
          this.mouseState.selectedSegment.segment === segment) {
        const selectedIndex = this.mouseState.selectedEventIndex;
        eventIndex = selectedIndex < events.length ? selectedIndex : 0;
      }
      
      return {
        color: events[eventIndex].color,
        startMinute: events[eventIndex].startMinute,
        endMinute: events[eventIndex].endMinute
      };
    }

    /**
     * Generate color palette for calendar segments
     */
    generateColors() {
      // All segments now use blank color by default - events will override this
      this.cache.colors = Array.from({ length: this.cache.totalSegments }, () => CONFIG.BLANK_COLOR);
    }

  /**
   * Setup mobile orientation detection for automatic time display toggle
   */
  setupMobileOrientationDetection() {
    // Only setup on mobile devices
    if (!isMobileDevice()) return;
    
    // Check if screen orientation API is available
    if (!screen || !screen.orientation) {
      this.setupMobileOrientationFallback();
      return;
    }
    
    // Store the current time display state
    this.mobileOrientationState.timeDisplayWasEnabled = this.state.showTimeDisplay;
    
    // Create orientation change handler
    this.mobileOrientationState.orientationChangeHandler = () => {
      this.handleMobileOrientationChange();
    };
    
    // Add event listener
    screen.orientation.addEventListener('change', this.mobileOrientationState.orientationChangeHandler);
    
    // Check initial orientation
    this.handleMobileOrientationChange();
  }

  /**
   * Align rotation so that when switching to circle mode for the selected day,
   * the outermost visible segment of that day is 0:00-1:00 (segment index 23).
   * We do this by rotating in multiples of one hour.
   */
  alignSelectedSegmentInCircleMode(segParam = null) {
    const segObj = segParam || this.mouseState.selectedSegment;
    if (!segObj) return;
    const currentSegment = segObj.segment; // 0..23 (0 = 23:00-0:00, 23 = 0:00-1:00)
    const desiredOutermost = CONFIG.SEGMENTS_PER_DAY - 1; // 23
    let deltaSegments = desiredOutermost - currentSegment; // positive means rotate forward
    // Normalize delta to [-24, 24] range
    if (deltaSegments > CONFIG.SEGMENTS_PER_DAY / 2) deltaSegments -= CONFIG.SEGMENTS_PER_DAY;
    if (deltaSegments < -CONFIG.SEGMENTS_PER_DAY / 2) deltaSegments += CONFIG.SEGMENTS_PER_DAY;
    const hourStep = (2 * Math.PI) / CONFIG.SEGMENTS_PER_DAY;
    this.state.rotation += deltaSegments * hourStep;
    // Mark as manual rotation so dependent UI updates
    this._shouldUpdateEventList = true;
  }

  // Get the effective time display height (supports collapsed and animation)
  updateThemeColor() {
    // Update theme-color meta tag based on dark mode
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = this.state.darkMode ? '#000000' : '#ffffff';
  }

  getTimeDisplayHeight() {
    if (!this.state.showTimeDisplay) return 0;
    if (this.timeDisplayState && typeof this.timeDisplayState.currentHeight === 'number') {
      return this.timeDisplayState.currentHeight;
    }
    if (this.timeDisplayState && this.timeDisplayState.collapsed) {
      return this.timeDisplayState.collapseHeight || 12;
    }
    return CONFIG.TIME_DISPLAY_HEIGHT;
  }

  // Get the time currently displayed in the time display (matches what's shown to the user)
  getDisplayTime() {
    if (this.autoTimeAlignState.enabled) {
      // Use UTC time consistently (same logic as drawTimeDisplay)
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 
                                 now.getUTCHours() + TIMEZONE_OFFSET, now.getUTCMinutes(), now.getUTCSeconds()));
    } else {
      // Calculate the time corresponding to the current spiral rotation (using UTC)
      // Same logic as drawTimeDisplay
      const rotationInHours = (this.state.rotation / (2 * Math.PI)) * CONFIG.SEGMENTS_PER_DAY;
      // Create UTC time based on reference time
      const utcTime = this.referenceTime.getTime() + rotationInHours * 60 * 60 * 1000;
      return new Date(utcTime);
    }
  }

  // Animate collapse/expand
  setTimeDisplayCollapsed(collapsed) {
    if (!this.timeDisplayState) return;
    const base = CONFIG.TIME_DISPLAY_HEIGHT;
    const minH = this.timeDisplayState.collapseHeight || 12;
    this.timeDisplayState.collapsed = !!collapsed;
    this.timeDisplayState.targetHeight = collapsed ? minH : base;
    if (typeof this.timeDisplayState.currentHeight !== 'number') {
      this.timeDisplayState.currentHeight = collapsed ? base : minH;
    }
    if (this.timeDisplayState.animId) cancelAnimationFrame(this.timeDisplayState.animId);
    const durationMs = 180;
    const startH = this.timeDisplayState.currentHeight;
    const endH = this.timeDisplayState.targetHeight;
    const startTs = performance.now();
    const ease = (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad
    const step = () => {
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - startTs) / durationMs));
      const p = ease(t);
      this.timeDisplayState.currentHeight = startH + (endH - startH) * p;
      this.drawSpiral();
      if (t < 1) {
        this.timeDisplayState.animId = requestAnimationFrame(step);
      } else {
        this.timeDisplayState.animId = null;
        this.timeDisplayState.currentHeight = endH;
      }
    };
    this.timeDisplayState.animId = requestAnimationFrame(step);
  }

  // Get event list max height, calculating it dynamically if not set
  getEventListMaxHeight() {
    if (!this.timeDisplayState) {
      return Math.floor(this.canvas.clientHeight / 3);
    }
    if (this.timeDisplayState.eventListMaxHeight === 0 || !this.timeDisplayState.eventListMaxHeight) {
      // Calculate as 1/3 of screen height
      this.timeDisplayState.eventListMaxHeight = Math.floor(this.canvas.clientHeight / 3);
    }
    return this.timeDisplayState.eventListMaxHeight;
  }

  // Update bottom event list based on current pull-up offset
  updateBottomEventList(skipRender = false) {
    const threshold = this.timeDisplayState.eventListThreshold || 20;
    const currentOffset = this.timeDisplayState.pullUpOffset || 0;
    if (currentOffset >= threshold) {
      // Calculate maximum allowed height based on available space
      const canvasHeight = this.canvas.clientHeight;
      const timeDisplayBottom = canvasHeight - currentOffset;
      const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
      const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
      const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
      const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
      
      // Get actual content height if available
      const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
      // Limit to actual content height or max allowed, whichever is smaller
      const eventListHeight = contentHeight > 0 ? 
        Math.min(maxAllowedHeight, Math.max(currentOffset, contentHeight)) : 
        Math.min(maxAllowedHeight, currentOffset);
      this.showBottomEventList(eventListHeight, skipRender);
    } else {
      this.hideBottomEventList();
    }
  }

  // Show bottom event list with specified height
  showBottomEventList(height, skipRender = false) {
    const bottomEventList = document.getElementById('bottomEventList');
    const bottomEventListItems = document.getElementById('bottomEventListItems');
    if (bottomEventList && bottomEventListItems) {
      // Only render event list if:
      // 1. Not skipping (e.g., drag ended), OR
      // 2. List is not yet visible (first time appearing) - render once even during drag to get content height
      const wasVisible = bottomEventList.style.maxHeight && bottomEventList.style.maxHeight !== '0px';
      const isEmpty = bottomEventListItems.children.length === 0;
      if (!skipRender || (!wasVisible || isEmpty)) {
        // Ensure event list is rendered first to get accurate content height
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      }
      
      // Get actual content height (scrollHeight gives us the full content height)
      const actualContentHeight = bottomEventListItems.scrollHeight;
      
      // Calculate maximum allowed height based on available space
      const canvasHeight = this.canvas.clientHeight;
      const pullUpOffset = this.timeDisplayState.pullUpOffset || 0;
      const timeDisplayHeight = this.getTimeDisplayHeight();
      const timeDisplayBottom = canvasHeight - pullUpOffset;
      
      // Limit expansion to max 60% of screen height, or whatever space is available above time display
      // Leave some margin at the top (at least 10% of screen height)
      const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
      const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
      const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
      const maxAllowedHeight = Math.min(maxScreenHeight, availableSpace);
      
      // Use the smaller of: requested height, actual content height, or max allowed height
      const displayHeight = Math.min(height, actualContentHeight + 10, maxAllowedHeight); // +10 for padding
      
      bottomEventList.style.maxHeight = displayHeight + 'px';
      
      // Position directly below time display
      // List top edge should be at: canvasHeight - pullUpOffset
      bottomEventList.style.bottom = 'auto';
      bottomEventList.style.top = (canvasHeight - pullUpOffset) + 'px';
      
      // Enable scrolling if content exceeds display height
      if (actualContentHeight > displayHeight) {
        bottomEventListItems.style.overflowY = 'auto';
      } else {
        bottomEventListItems.style.overflowY = 'visible';
      }
      
      // Store current height so time display can adjust its position
      this.timeDisplayState.eventListCurrentHeight = displayHeight;
      // Store actual content height to limit pull-up expansion
      this.timeDisplayState.eventListContentHeight = actualContentHeight;
    }
  }

  // Hide bottom event list
  hideBottomEventList() {
    const bottomEventList = document.getElementById('bottomEventList');
    if (bottomEventList) {
      bottomEventList.style.maxHeight = '0px';
      // Position top edge at time display bottom
      const canvasHeight = this.canvas.clientHeight;
      const pullUpOffset = this.timeDisplayState.pullUpOffset || 0;
      bottomEventList.style.bottom = 'auto';
      bottomEventList.style.top = (canvasHeight - pullUpOffset) + 'px';
      // Clear stored height so time display returns to bottom
      this.timeDisplayState.eventListCurrentHeight = 0;
      this.timeDisplayState.eventListContentHeight = 0;
      
      // Restore previous calendar visibility if it was filtered
      if (this._previousVisibleCalendars !== null) {
        this.state.visibleCalendars = [...this._previousVisibleCalendars];
        this._previousVisibleCalendars = null;
        this.saveSettingsToStorage();
        // Rebuild calendar dropdown menu to update checkboxes
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        // Re-render event list and spiral
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        this.drawSpiral();
      }
    }
  }
  
  // Get current event list height (for positioning calculations)
  getEventListHeight() {
    return this.timeDisplayState ? (this.timeDisplayState.eventListCurrentHeight || 0) : 0;
  }

  /**
   * Check if a segment represents the first day of a year (Jan 1)
   */
  isFirstDayOfYear(day, segment) {
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    const hoursFromReference = segmentId;
    const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
    return segmentDate.getUTCMonth() === 0 && segmentDate.getUTCDate() === 1;
  }

  /**
   * Get the year number for a segment (UTC)
   */
  getYearNumber(day, segment) {
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    const hoursFromReference = segmentId;
    const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
    return segmentDate.getUTCFullYear();
  }
  
  /**
   * Fallback orientation detection using window resize (for older browsers)
   */
  setupMobileOrientationFallback() {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    
    const resizeHandler = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      // Only trigger if dimensions actually changed significantly
      if (Math.abs(currentWidth - lastWidth) > 50 || Math.abs(currentHeight - lastHeight) > 50) {
        const wasLandscape = lastWidth > lastHeight;
        const isLandscape = currentWidth > currentHeight;
        
        if (wasLandscape !== isLandscape) {
          this.mobileOrientationState.isLandscape = isLandscape;
          this.handleMobileOrientationChange();
        }
        
        lastWidth = currentWidth;
        lastHeight = currentHeight;
      }
    };
    
    window.addEventListener('resize', resizeHandler);
    
    // Store handler for cleanup
    this.mobileOrientationState.orientationChangeHandler = resizeHandler;
    
    // Check initial orientation
    this.mobileOrientationState.isLandscape = window.innerWidth > window.innerHeight;
    this.handleMobileOrientationChange();
  }
  /**
   * Handle mobile orientation change
   */
  handleMobileOrientationChange() {
    if (!isMobileDevice()) return;
    
    let isLandscape = false;
    
    // Determine current orientation
    if (screen && screen.orientation) {
      // Use screen orientation API if available
      const angle = screen.orientation.angle;
      isLandscape = angle === 90 || angle === 270;
    } else {
      // Fallback to window dimensions
      isLandscape = window.innerWidth > window.innerHeight;
    }
    
    // Only act if orientation actually changed
    if (this.mobileOrientationState.isLandscape !== isLandscape) {
      this.mobileOrientationState.isLandscape = isLandscape;
      
      if (isLandscape) {
        // Entering landscape mode - turn off time display
        if (this.state.showTimeDisplay) {
          this.mobileOrientationState.timeDisplayWasEnabled = true;
          this.setTimeDisplayEnabled(false);
          timeDisplayToggle.checked = this.state.showTimeDisplay;
        }
      } else {
        // Entering portrait mode - restore time display if it was enabled
        if (this.mobileOrientationState.timeDisplayWasEnabled) {
          this.setTimeDisplayEnabled(true);
          timeDisplayToggle.checked = this.state.showTimeDisplay;
        }
      }
    }
    }

    /**
     * Setup UI event handlers with a cleaner approach
     */
    setupEventHandlers() {
      const sliderConfigs = [
        { 
          sliderId: 'daysSlider', 
          displayId: 'daysVal', 
          property: 'days',
          formatter: (val) => val,
          onChange: () => {
            // If a segment is selected, preserve its segmentId from the outside
            if (this.mouseState.selectedSegmentId !== null) {
              const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
              if (this.mouseState.selectedSegmentId < totalVisibleSegments) {
                const absPos = totalVisibleSegments - this.mouseState.selectedSegmentId - 1;
                const newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
                const newSegment = absPos % CONFIG.SEGMENTS_PER_DAY;
                this.mouseState.selectedSegment = { day: newDay, segment: newSegment };
              } else {
                // If the segmentId is now out of range, deselect
                this.mouseState.selectedSegment = null;
                this.mouseState.selectedSegmentId = null;
              }
            }
          }
        },
        { 
          sliderId: 'scaleSlider', 
          displayId: 'scaleVal', 
          property: 'spiralScale',
          formatter: (val) => val 
        },
        { 
          sliderId: 'radiusSlider', 
          displayId: 'radiusVal', 
          property: 'radiusExponent',
          formatter: (val) => val 
        },

        { 
          sliderId: 'rotateSlider', 
          displayId: 'rotateVal', 
          property: 'rotation',
          formatter: (val) => val + '°',
          transform: (val) => val * Math.PI / 180,  // convert to radians
          onChange: () => {
            // Mark that this is a manual rotation, so event list should update
            this._shouldUpdateEventList = true;
          }
        }
      ];

      sliderConfigs.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        if (slider) {
          slider.addEventListener('input', (e) => {
          const value = +e.target.value;
          const transformedValue = config.transform ? config.transform(value) : value;
          
          this.state[config.property] = transformedValue;
            const display = document.getElementById(config.displayId);
            if (display) display.textContent = config.formatter(value);
          
          if (config.onChange) config.onChange();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
        }
      });

      // Add static mode checkbox handler
      const staticModeCheckbox = document.getElementById('staticMode');
      if (staticModeCheckbox) {
        staticModeCheckbox.addEventListener('change', (e) => {
        this.state.staticMode = e.target.checked;
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
      }

      // Add auto time align checkbox handler
      const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
      if (autoTimeAlignCheckbox) {
        // Synchronize checkbox state with internal state
        autoTimeAlignCheckbox.checked = this.autoTimeAlignState.enabled;
        
      autoTimeAlignCheckbox.addEventListener('change', (e) => {
        this.autoTimeAlignState.enabled = e.target.checked;
        if (this.autoTimeAlignState.enabled) {
          this.startAutoTimeAlign();
        } else {
          this.stopAutoTimeAlign();
        }
      });
        

      }

      // Add show hour numbers checkbox handler
      const showHourNumbersCheckbox = document.getElementById('showHourNumbers');
      const hourNumbersControls = document.getElementById('hourNumbersControls');
        const showEverySixthHourCheckbox = document.getElementById('showEverySixthHour');
        const hourNumbersStartAtOneCheckbox = document.getElementById('hourNumbersStartAtOne');
        const hourNumbersPositionSlider = document.getElementById('hourNumbersPositionSlider');
        const hourNumbersPositionVal = document.getElementById('hourNumbersPositionVal');
      
      if (showHourNumbersCheckbox) {
      showHourNumbersCheckbox.addEventListener('change', (e) => {
        this.state.showHourNumbers = e.target.checked;
          // Show/hide sub-options (only if DEV_MODE is true)
          if (hourNumbersControls) {
            hourNumbersControls.style.display = (e.target.checked && DEV_MODE) ? 'block' : 'none';
          }
        this.drawSpiral();
          this.saveSettingsToStorage();
        });
        
        // Remove legacy commented initialization (handled dynamically elsewhere)
      }
      
      
      // Day numbers checkbox handler
      const showDayNumbersCheckbox = document.getElementById('showDayNumbers');
      const dayNumbersControls = document.getElementById('dayNumbersControls');
      if (showDayNumbersCheckbox) {
        showDayNumbersCheckbox.addEventListener('change', (e) => {
          this.state.showDayNumbers = e.target.checked;
          // Show/hide sub-options (only if DEV_MODE is true)
          if (dayNumbersControls) {
            dayNumbersControls.style.display = (e.target.checked && DEV_MODE) ? 'block' : 'none';
          }
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      
      // Month numbers checkbox handler
      const showMonthNumbersCheckbox = document.getElementById('showMonthNumbers');
      if (showMonthNumbersCheckbox) {
        showMonthNumbersCheckbox.addEventListener('change', (e) => {
          this.state.showMonthNumbers = e.target.checked;
          this.drawSpiral();
          
          // Show/hide month numbers sub-options (only if DEV_MODE is true)
          const monthNumbersControls = document.getElementById('monthNumbersControls');
          if (monthNumbersControls) {
            monthNumbersControls.style.display = (e.target.checked && DEV_MODE) ? 'block' : 'none';
          }
          this.saveSettingsToStorage();
        });
        
        // Remove legacy commented initialization (handled dynamically elsewhere)
      }
      
        const showMonthNamesCheckbox = document.getElementById('showMonthNames');
        if (showMonthNamesCheckbox) {
          showMonthNamesCheckbox.addEventListener('change', (e) => {
            this.state.showMonthNames = e.target.checked;
            this.drawSpiral();
            this.saveSettingsToStorage();
          });
        }

        // Year numbers checkbox handler (sub-option of month numbers)
        const showYearNumbersCheckbox = document.getElementById('showYearNumbers');
        if (showYearNumbersCheckbox) {
          showYearNumbersCheckbox.addEventListener('change', (e) => {
            this.state.showYearNumbers = e.target.checked;
            this.drawSpiral();
            this.saveSettingsToStorage();
          });
        }
      
      // Add sub-option handlers
      if (showEverySixthHourCheckbox) {
        showEverySixthHourCheckbox.addEventListener('change', (e) => {
          this.state.showEverySixthHour = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      
      if (hourNumbersStartAtOneCheckbox) {
        hourNumbersStartAtOneCheckbox.addEventListener('change', (e) => {
          this.state.hourNumbersStartAtOne = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      
        if (hourNumbersPositionSlider && hourNumbersPositionVal) {
          // Update display value
          const updatePositionDisplay = () => {
            const positionNames = ['-0.5', '0', '+0.5'];
            hourNumbersPositionVal.textContent = positionNames[this.state.hourNumbersPosition];
          };
          
          hourNumbersPositionSlider.addEventListener('input', (e) => {
            this.state.hourNumbersPosition = parseInt(e.target.value);
            updatePositionDisplay();
            this.drawSpiral();
            this.saveSettingsToStorage();
          });
          
          // Initialize display
          updatePositionDisplay();
        }
      
      // Add hour numbers outward checkbox handler
      const hourNumbersOutwardCheckbox = document.getElementById('hourNumbersOutward');
      if (hourNumbersOutwardCheckbox) {
        hourNumbersOutwardCheckbox.addEventListener('change', (e) => {
          this.state.hourNumbersOutward = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add hour numbers inside segment checkbox handler
      const hourNumbersInsideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
      if (hourNumbersInsideSegmentCheckbox) {
        hourNumbersInsideSegmentCheckbox.addEventListener('change', (e) => {
          this.state.hourNumbersInsideSegment = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add hour numbers upright checkbox handler
      const hourNumbersUprightCheckbox = document.getElementById('hourNumbersUpright');
      if (hourNumbersUprightCheckbox) {
        hourNumbersUprightCheckbox.addEventListener('change', (e) => {
          this.state.hourNumbersUpright = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add day numbers upright checkbox handler
      const dayNumbersUprightCheckbox = document.getElementById('dayNumbersUpright');
      if (dayNumbersUprightCheckbox) {
        dayNumbersUprightCheckbox.addEventListener('change', (e) => {
          this.state.dayNumbersUpright = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Day label composition controls
      const dayLabelShowWeekday = document.getElementById('dayLabelShowWeekday');
      const dayLabelShowMonth = document.getElementById('dayLabelShowMonth');
      const dayLabelShowYear = document.getElementById('dayLabelShowYear');
      const dayLabelUseShortNames = document.getElementById('dayLabelUseShortNames');
      const dayLabelUseShortMonth = document.getElementById('dayLabelUseShortMonth');
      const dayLabelUseShortYear = document.getElementById('dayLabelUseShortYear');
      const dayLabelUseOrdinal = document.getElementById('dayLabelUseOrdinal');
      const dayLabelMonthOnFirstOnly = document.getElementById('dayLabelMonthOnFirstOnly');
      const dayLabelYearOnFirstOnly = document.getElementById('dayLabelYearOnFirstOnly');
      const dayLabelWeekdaySubOptions = document.getElementById('dayLabelWeekdaySubOptions');
      const dayLabelMonthSubOptions = document.getElementById('dayLabelMonthSubOptions');
      const dayLabelYearSubOptions = document.getElementById('dayLabelYearSubOptions');
      if (dayLabelShowWeekday) {
        dayLabelShowWeekday.checked = !!this.state.dayLabelShowWeekday;
        dayLabelShowWeekday.addEventListener('change', (e) => {
          this.state.dayLabelShowWeekday = e.target.checked;
          if (dayLabelWeekdaySubOptions) dayLabelWeekdaySubOptions.style.display = this.state.dayLabelShowWeekday ? 'flex' : 'none';
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelWeekdaySubOptions) dayLabelWeekdaySubOptions.style.display = this.state.dayLabelShowWeekday ? 'flex' : 'none';
      if (dayLabelShowMonth) {
        dayLabelShowMonth.checked = !!this.state.dayLabelShowMonth;
        dayLabelShowMonth.addEventListener('change', (e) => {
          this.state.dayLabelShowMonth = e.target.checked;
          if (dayLabelMonthSubOptions) dayLabelMonthSubOptions.style.display = this.state.dayLabelShowMonth ? 'flex' : 'none';
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelMonthSubOptions) dayLabelMonthSubOptions.style.display = this.state.dayLabelShowMonth ? 'flex' : 'none';
      if (dayLabelMonthOnFirstOnly) {
        dayLabelMonthOnFirstOnly.checked = !!this.state.dayLabelMonthOnFirstOnly;
        dayLabelMonthOnFirstOnly.addEventListener('change', (e) => {
          this.state.dayLabelMonthOnFirstOnly = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelUseShortMonth) {
        dayLabelUseShortMonth.checked = !!this.state.dayLabelUseShortMonth;
        dayLabelUseShortMonth.addEventListener('change', (e) => {
          this.state.dayLabelUseShortMonth = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelShowYear) {
        dayLabelShowYear.checked = !!this.state.dayLabelShowYear;
        dayLabelShowYear.addEventListener('change', (e) => {
          this.state.dayLabelShowYear = e.target.checked;
          if (dayLabelYearSubOptions) dayLabelYearSubOptions.style.display = this.state.dayLabelShowYear ? 'flex' : 'none';
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelYearSubOptions) dayLabelYearSubOptions.style.display = this.state.dayLabelShowYear ? 'flex' : 'none';
      if (dayLabelYearOnFirstOnly) {
        dayLabelYearOnFirstOnly.checked = !!this.state.dayLabelYearOnFirstOnly;
        dayLabelYearOnFirstOnly.addEventListener('change', (e) => {
          this.state.dayLabelYearOnFirstOnly = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelUseShortYear) {
        dayLabelUseShortYear.checked = !!this.state.dayLabelUseShortYear;
        dayLabelUseShortYear.addEventListener('change', (e) => {
          this.state.dayLabelUseShortYear = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelUseShortNames) {
        dayLabelUseShortNames.checked = !!this.state.dayLabelUseShortNames;
        dayLabelUseShortNames.addEventListener('change', (e) => {
          this.state.dayLabelUseShortNames = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelUseOrdinal) {
        dayLabelUseOrdinal.checked = !!this.state.dayLabelUseOrdinal;
        dayLabelUseOrdinal.addEventListener('change', (e) => {
          this.state.dayLabelUseOrdinal = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add hide day when hour inside checkbox handler
      const hideDayWhenHourInsideCheckbox = document.getElementById('hideDayWhenHourInside');
      if (hideDayWhenHourInsideCheckbox) {
        hideDayWhenHourInsideCheckbox.addEventListener('change', (e) => {
          this.state.hideDayWhenHourInside = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add month numbers upright checkbox handler
      const monthNumbersUprightCheckbox = document.getElementById('monthNumbersUpright');
      if (monthNumbersUprightCheckbox) {
        monthNumbersUprightCheckbox.addEventListener('change', (e) => {
          this.state.monthNumbersUpright = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Add circle mode checkbox handler
      const circleModeCheckbox = document.getElementById('circleMode');
      if (circleModeCheckbox) {
      circleModeCheckbox.addEventListener('change', (e) => {
        const wasCircleMode = this.state.circleMode;
        this.state.circleMode = e.target.checked;
        
        // If switching to circle mode with a selected segment, adjust scale to align segments
        if (!wasCircleMode && this.state.circleMode && this.mouseState.selectedSegment) {
          this.alignSelectedSegmentInCircleMode();
        }
        // If switching from circle mode back to spiral mode, restore original scale
        else if (wasCircleMode && !this.state.circleMode && !this._suppressScaleRestore) {
          this.restoreOriginalSpiralScale();
        }
        
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
      }



    const nightOverlayToggle = document.getElementById('nightOverlayToggle');
    if (nightOverlayToggle) {
      nightOverlayToggle.addEventListener('change', function(e) {
      spiralCalendar.setNightOverlayEnabled(e.target.checked);
    });
    }

    const dayOverlayToggle = document.getElementById('dayOverlayToggle');
    if (dayOverlayToggle) {
      dayOverlayToggle.addEventListener('change', function(e) {
      spiralCalendar.setDayOverlayEnabled(e.target.checked);
    });
    }

    const gradientOverlayToggle = document.getElementById('gradientOverlayToggle');
    if (gradientOverlayToggle) {
      gradientOverlayToggle.addEventListener('change', function(e) {
      spiralCalendar.setGradientOverlayEnabled(e.target.checked);
    });
    }

    // Opacity slider handlers
    const nightOverlayOpacitySlider = document.getElementById('nightOverlayOpacitySlider');
    const nightOverlayOpacityVal = document.getElementById('nightOverlayOpacityVal');
    if (nightOverlayOpacitySlider && nightOverlayOpacityVal) {
      nightOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        spiralCalendar.state.nightOverlayOpacity = opacity;
        nightOverlayOpacityVal.textContent = e.target.value + '%';
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const dayOverlayOpacitySlider = document.getElementById('dayOverlayOpacitySlider');
    const dayOverlayOpacityVal = document.getElementById('dayOverlayOpacityVal');
    if (dayOverlayOpacitySlider && dayOverlayOpacityVal) {
      dayOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        spiralCalendar.state.dayOverlayOpacity = opacity;
        dayOverlayOpacityVal.textContent = e.target.value + '%';
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const gradientOverlayOpacitySlider = document.getElementById('gradientOverlayOpacitySlider');
    const gradientOverlayOpacityVal = document.getElementById('gradientOverlayOpacityVal');
    if (gradientOverlayOpacitySlider && gradientOverlayOpacityVal) {
      gradientOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        spiralCalendar.state.gradientOverlayOpacity = opacity;
        gradientOverlayOpacityVal.textContent = e.target.value + '%';
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const eventListColorStyleToggle = document.getElementById('eventListColorStyleToggle');
    if (eventListColorStyleToggle) {
      eventListColorStyleToggle.addEventListener('change', function(e) {
        spiralCalendar.state.eventListColorStyle = e.target.checked ? 'row' : 'dot';
        spiralCalendar.saveSettingsToStorage();
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      });
    }

    // Dev mode line toggle handlers
    const showMonthLinesToggle = document.getElementById('showMonthLinesToggle');
    if (showMonthLinesToggle) {
      showMonthLinesToggle.addEventListener('change', function(e) {
        spiralCalendar.state.showMonthLines = e.target.checked;
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const showMidnightLinesToggle = document.getElementById('showMidnightLinesToggle');
    if (showMidnightLinesToggle) {
      showMidnightLinesToggle.addEventListener('change', function(e) {
        spiralCalendar.state.showMidnightLines = e.target.checked;
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const showNoonLinesToggle = document.getElementById('showNoonLinesToggle');
    if (showNoonLinesToggle) {
      showNoonLinesToggle.addEventListener('change', function(e) {
        spiralCalendar.state.showNoonLines = e.target.checked;
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    const showSixAmPmLinesToggle = document.getElementById('showSixAmPmLinesToggle');
    if (showSixAmPmLinesToggle) {
      showSixAmPmLinesToggle.addEventListener('change', function(e) {
        spiralCalendar.state.showSixAmPmLines = e.target.checked;
        spiralCalendar.drawSpiral();
        spiralCalendar.saveSettingsToStorage();
      });
    }

    // Event color mode controls
    const colorModeSelect = document.getElementById('colorModeSelect');
    const singleColorWrapper = document.getElementById('singleColorWrapper');
    const singleColorInput = document.getElementById('singleColorInput');
    const baseHueWrapper = document.getElementById('baseHueWrapper');
    const baseHueSlider = document.getElementById('baseHueSlider');
    const baseHueVal = document.getElementById('baseHueVal');
    const updateColorModeVisibility = () => {
      const mode = this.state.colorMode;
      if (singleColorWrapper) singleColorWrapper.style.display = mode === 'single' ? '' : 'none';
      if (baseHueWrapper) baseHueWrapper.style.display = mode === 'monoHue' ? '' : 'none';
    };
    if (colorModeSelect) {
      colorModeSelect.value = this.state.colorMode;
      colorModeSelect.addEventListener('change', (e) => {
        this.state.colorMode = e.target.value;
        updateColorModeVisibility();
        this.drawSpiral();
        this.saveSettingsToStorage();
        // Refresh event list so dots/badges update to current palette
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        // Update Add Event panel preview if open
        try {
          const colorBox = document.getElementById('colorBox');
          const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
          const eventColor = document.getElementById('eventColor');
          if (colorBox && eventCalendarDisplay && eventColor) {
            const calName = (this.selectedEventCalendar || 'Home').trim();
            const calColor = this.state.calendarColors && this.state.calendarColors[calName];
            if ((this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') && calColor) {
              let hex = calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
              if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
              colorBox.style.background = hex;
              eventColor.value = hex; // suggest calendar (mono) color
            } else {
              colorBox.style.background = eventColor.value;
            }
          }
        } catch (_) {}
      });
    }
    if (singleColorInput) {
      singleColorInput.value = this.state.singleColor || '#4CAF50';
      singleColorInput.addEventListener('input', (e) => {
        this.state.singleColor = e.target.value;
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
    }
    if (baseHueSlider && baseHueVal) {
      baseHueSlider.value = String(this.state.baseHue ?? 200);
      baseHueVal.textContent = String(this.state.baseHue ?? 200);
      baseHueSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        this.state.baseHue = v;
        baseHueVal.textContent = String(v);
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
    }
    updateColorModeVisibility();

    const timeDisplayToggle = document.getElementById('timeDisplayToggle');
    if (timeDisplayToggle) {
      timeDisplayToggle.addEventListener('change', function(e) {
      spiralCalendar.setTimeDisplayEnabled(e.target.checked);
      });
    }

    const segmentEdgesToggle = document.getElementById('segmentEdgesToggle');
    if (segmentEdgesToggle) {
      segmentEdgesToggle.addEventListener('change', function(e) {
      spiralCalendar.setSegmentEdgesEnabled(e.target.checked);
    });
    }

    const arcLinesToggle = document.getElementById('arcLinesToggle');
    if (arcLinesToggle) {
      arcLinesToggle.addEventListener('change', function(e) {
      spiralCalendar.setArcLinesEnabled(e.target.checked);
    });
    }

      // Stacked overlap rendering toggle
      const overlayStackModeCheckbox = document.getElementById('overlayStackMode');
      if (overlayStackModeCheckbox) {
        overlayStackModeCheckbox.addEventListener('change', (e) => {
          this.state.overlayStackMode = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Audio feedback toggle
      const audioFeedbackToggle = document.getElementById('audioFeedbackToggle');
      const audioFeedbackIcon = document.getElementById('audioFeedbackIcon');
      if (audioFeedbackToggle) {
        audioFeedbackToggle.addEventListener('click', (e) => {
          // Toggle state
          this.state.audioFeedbackEnabled = !this.state.audioFeedbackEnabled;
          this.saveSettingsToStorage();
          
          // Update icon based on state
          if (audioFeedbackIcon) {
            updateAudioIcon(audioFeedbackIcon, this.state.audioFeedbackEnabled);
          }
        });
      }

      // Tooltip toggle
      const tooltipToggle = document.getElementById('tooltipToggle');
      if (tooltipToggle) {
        tooltipToggle.addEventListener('change', (e) => {
          this.state.showTooltip = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Text clipping toggle
      const textClippingToggle = document.getElementById('textClippingToggle');
      if (textClippingToggle) {
        textClippingToggle.addEventListener('change', (e) => {
          this.state.textClippingEnabled = e.target.checked;
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }

      // Dark mode toggle
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => {
          this.state.darkMode = e.target.checked;
          try { document.body.classList.toggle('dark-mode', this.state.darkMode); } catch (_) {}
          this.updateThemeColor();
          this.drawSpiral();
          this.saveSettingsToStorage();
          // Refresh event list to update calendar icons for dark mode
          if (typeof window.renderEventList === 'function') {
            window.renderEventList();
          }
          // Update location button icons for dark mode
          if (typeof updateLocationButtonIcons === 'function') {
            updateLocationButtonIcons();
          }
          // Update audio icon for dark mode
          const audioFeedbackIcon = document.getElementById('audioFeedbackIcon');
          if (audioFeedbackIcon) {
            updateAudioIcon(audioFeedbackIcon, this.state.audioFeedbackEnabled);
          }
        });
      }

    // Device orientation control
    const deviceOrientationToggle = document.getElementById('deviceOrientationToggle');
    if (deviceOrientationToggle) {
      deviceOrientationToggle.addEventListener('change', function(e) {
      spiralCalendar.setDeviceOrientationEnabled(e.target.checked);
        
        // Show/hide threshold controls based on device orientation state (only if DEV_MODE is true)
        const thresholdControls = document.getElementById('deviceOrientationControls');
        if (thresholdControls) {
          thresholdControls.style.display = (e.target.checked && DEV_MODE) ? 'block' : 'none';
        }
      });
    }
    
    // Device orientation threshold controls
    const betaThresholdSlider = document.getElementById('betaThresholdSlider');
    const gammaThresholdSlider = document.getElementById('gammaThresholdSlider');
    
    if (betaThresholdSlider) {
      betaThresholdSlider.addEventListener('input', (e) => {
        const value = +e.target.value;
        this.deviceOrientationThresholds.beta = value;
        const display = document.getElementById('betaThresholdVal');
        if (display) display.textContent = value + '°';
        this.drawSpiral(); // Redraw to update visual indicators
        this.saveSettingsToStorage();
      });
    }
    
    if (gammaThresholdSlider) {
      gammaThresholdSlider.addEventListener('input', (e) => {
        const value = +e.target.value;
        this.deviceOrientationThresholds.gamma = value;
        const display = document.getElementById('gammaThresholdVal');
        if (display) display.textContent = value + '°';
        this.drawSpiral(); // Redraw to update visual indicators
        this.saveSettingsToStorage();
      });
    }

      // Add animation controls
      const animateToggle = document.getElementById('animateToggle');
      if (animateToggle) {
        animateToggle.addEventListener('change', (e) => {
        this.animationState.isAnimating = e.target.checked;
        if (this.animationState.isAnimating) {
          this.startAnimation();
        } else {
          this.stopAnimation();
        }
          // Show/hide animation speed sub-options like other toggles
          const animationSpeedControls = document.getElementById('animationSpeedControls');
          if (animationSpeedControls) {
            animationSpeedControls.style.display = e.target.checked ? 'block' : 'none';
        }
      });
        // Initialize sub-options visibility
        const animationSpeedControls = document.getElementById('animationSpeedControls');
        if (animationSpeedControls) {
          animationSpeedControls.style.display = animateToggle.checked ? 'block' : 'none';
        }
      }

      const speedSlider = document.getElementById('speedSlider');
      if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
        this.animationState.speed = +e.target.value;
          const speedVal = document.getElementById('speedVal');
          if (speedVal) speedVal.textContent = e.target.value;
      });
      }

      // Study session controls
      this.setupStudySessionControls();

      // Add rotate max slider handler
  const rotateSlider = document.getElementById('rotateSlider');
      const rotateMaxSlider = document.getElementById('rotateMaxSlider');
      const rotateMaxVal = document.getElementById('rotateMaxVal');
      if (rotateMaxSlider && rotateSlider && rotateMaxVal) {
      rotateMaxSlider.addEventListener('input', (e) => {
        const maxVal = +e.target.value;
        rotateSlider.max = maxVal;
        rotateMaxVal.textContent = maxVal + '°';
        // Clamp current value if needed
        if (+rotateSlider.value > maxVal) {
          rotateSlider.value = maxVal;
          this.state.rotation = maxVal * Math.PI / 180;
          this.drawSpiral();
        }
      });
      }

      // Add mouse event listeners for segment detection
    this.canvas.addEventListener('mousemove', (e) => {
      const isMobile = isMobileDevice();
      if (isMobile) return; // disable hover handling on mobile
      // Only disable Auto Time Align if dragging and moved 
      if (this.mouseState.isDragging) {
        if (this.autoTimeAlignState.enabled) {
          this.autoTimeAlignState.enabled = false;
          this.stopAutoTimeAlign();
        }
      }
      this.handleMouseMove(e);
    });
      this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
      this.canvas.addEventListener('click', (e) => this.handleClick(e));
      this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
      // Also listen for mouseup and mousemove on window to catch events outside canvas
      this._boundHandleMouseUp = (e) => this.handleMouseUp(e);
      this._boundHandleMouseMove = (e) => {
        // Only handle time display drag when mouseActive is true
        if (this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay) {
          this.handleMouseMove(e);
        }
      };
      window.addEventListener('mouseup', this._boundHandleMouseUp);
      window.addEventListener('mousemove', this._boundHandleMouseMove);

      // Add mouse wheel support for rotating the spiral
      this.canvas.addEventListener('wheel', (e) => {
      // If page is zoomed, let browser handle zoom and ignore canvas gesture
      if (this.pageZoomActive) return;
      
      // If Shift key is held (but not Alt+Shift), adjust days slider instead of rotating
      // Alt+Shift is reserved for 7-day rotation scrolling
      if (e.shiftKey && !e.altKey) {
        e.preventDefault();
        
        const daysSlider = document.getElementById('daysSlider');
        const daysVal = document.getElementById('daysVal');
        
        if (daysSlider && daysVal) {
          const currentValue = parseInt(daysSlider.value);
          const min = parseInt(daysSlider.min);
          const max = parseInt(daysSlider.max);
          
          // Scroll down (deltaY > 0): decrease days, scroll up (deltaY < 0): increase days
          const delta = e.deltaY > 0 ? -1 : 1;
          let newValue = currentValue + delta;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));
          
          // Update slider and state
          daysSlider.value = newValue;
          this.state.days = newValue;
          daysVal.textContent = newValue.toString();
          
          // Handle onChange callback to preserve selected segment if applicable
          const sliderConfig = { 
            sliderId: 'daysSlider', 
            displayId: 'daysVal', 
            property: 'days',
            formatter: (val) => val,
            onChange: () => {
              // If a segment is selected, preserve its segmentId from the outside
              if (this.mouseState.selectedSegmentId !== null) {
                const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
                if (this.mouseState.selectedSegmentId < totalVisibleSegments) {
                  const absPos = totalVisibleSegments - this.mouseState.selectedSegmentId - 1;
                  const newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
                  const newSegment = absPos % CONFIG.SEGMENTS_PER_DAY;
                  this.mouseState.selectedSegment = { day: newDay, segment: newSegment };
                } else {
                  // If the segmentId is now out of range, deselect
                  this.mouseState.selectedSegment = null;
                  this.mouseState.selectedSegmentId = null;
                }
              }
            }
          };
          
          if (sliderConfig.onChange) sliderConfig.onChange();
          
          this.drawSpiral();
          this.saveSettingsToStorage();
        }
        
        return;
      }
      
      // If Ctrl key is held, adjust radius slider instead of rotating
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        const radiusSlider = document.getElementById('radiusSlider');
        const radiusVal = document.getElementById('radiusVal');
        
        if (radiusSlider && radiusVal) {
          const currentValue = parseFloat(radiusSlider.value);
          const min = parseFloat(radiusSlider.min);
          const max = parseFloat(radiusSlider.max);
          
          // Scale step size proportionally with value
          // At value 1: step = 0.05, at value 10: step = 1.0
          const minValue = 1;
          const maxValue = 10;
          const minStep = 0.05;
          const maxStep = 1.0;
          
          // Linear interpolation based on current value
          const ratio = (currentValue - minValue) / (maxValue - minValue);
          const scrollStep = minStep + ratio * (maxStep - minStep);
          
          // Scroll down (deltaY > 0): decrease radius, scroll up (deltaY < 0): increase radius
          const delta = e.deltaY > 0 ? -scrollStep : scrollStep;
          let newValue = currentValue + delta;
          
          // Round to 2 decimal places to avoid floating point precision issues
          newValue = Math.round(newValue * 100) / 100;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));
          
          // Update slider and state (slider value should match rounded value)
          radiusSlider.value = newValue;
          this.state.radiusExponent = newValue;
          // Display without decimals if it's a whole number, otherwise show 2 decimals
          radiusVal.textContent = newValue % 1 === 0 ? newValue.toString() : newValue.toFixed(2);
          
          this.drawSpiral();
          this.saveSettingsToStorage();
        }
        
        return;
      }
      
      if (this.autoTimeAlignState.enabled) {
        this.autoTimeAlignState.enabled = false;
        this.stopAutoTimeAlign();
      }                     
        e.preventDefault();
        
        // Store previous rotation to detect if we hit the limit
        const previousRotation = this.state.rotation;
        
        // Each scroll notch rotates by 10 degrees (π/18 radians)
        const delta = e.deltaY;
        let step;
        
        // Check key combinations for different scroll behaviors
        if (e.altKey && e.shiftKey) {
          // Alt + Shift: scroll by 7 days (one week)
          step = 7 * (2 * Math.PI); // 7 * 360 degrees in radians
        } else if (e.altKey) {
          // Alt key: fine-grained scrolling (one hour at a time)
          // One hour = 1/24 of a day = 2π/24 radians = π/12 radians
          step = Math.PI / 12; // 15 degrees in radians
          
          // Snap to nearest full hour after scrolling
          const hourStep = Math.PI / 12; // One hour in radians
          this.state.rotation = Math.round(this.state.rotation / hourStep) * hourStep;
        } else {
          // Normal scrolling: one day at a time
          step = 2 * Math.PI; // 360 degrees in radians
        }
        
        // Scroll up (deltaY < 0): rotate one way, down (deltaY > 0): the other
        this.state.rotation += delta > 0 ? step : -step;
        // Mark that this is a manual rotation, so event list should update
        this._shouldUpdateEventList = true;
        
        // Check if we're in detail mode and hit the outer limit
        if (this.state.detailMode !== null && this.mouseState.selectedSegment) {
          // Calculate what the rotation would be without clamping
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segment = this.mouseState.selectedSegment;
          const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY);
          const eventHour = segmentId;
          const maxRotation = ((eventHour - 23.999) / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
          
          // Check if the user tried to zoom past the limit
          const wouldExceedLimit = this.state.rotation > maxRotation;
          
          this.clampRotationToEventWindow();
          
          
          if (Math.abs(this.state.rotation - maxRotation) < 0.01 && wouldExceedLimit && delta > 0) {
            // Increment counter for scroll steps past the limit
            this.state.pastLimitScrollCount++;
            
            // First scroll step: set radius to 1
            if (this.state.pastLimitScrollCount >= 1) {
              
              // Store original radius exponent if not already stored
              if (this.state.originalRadiusExponent === null) {
                this.state.originalRadiusExponent = this.state.radiusExponent;
              }
              
            // Set radius exponent to 1
            this.state.radiusExponent = 1;
            
            // Update the UI slider
            const radiusSlider = document.getElementById('radiusSlider');
            if (radiusSlider) {
              radiusSlider.value = this.state.radiusExponent;
              const radiusVal = document.getElementById('radiusVal');
              if (radiusVal && this.state.radiusExponent !== null && this.state.radiusExponent !== undefined) {
                radiusVal.textContent = this.state.radiusExponent.toString();
              }
            }
            
            // Trigger redraw to apply radius change
            this.drawSpiral();
            }
            
            // Auto-activate after two scroll steps past the limit
            if (this.state.pastLimitScrollCount >= 2) {
              
              // Store original scale if not already stored
              if (this.state.originalSpiralScale === null) {
                this.state.originalSpiralScale = this.state.spiralScale;
              }
              
              // Increase scale to 0.45
              this.state.spiralScale = 0.4475;
              
              // Update the UI slider
              const scaleSlider = document.getElementById('scaleSlider');
              if (scaleSlider) {
                scaleSlider.value = this.state.spiralScale;
                const scaleVal = document.getElementById('scaleVal');
                if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
              }
              
              // Trigger redraw to apply scale change
              this.drawSpiral();
              
              this.state.autoInsideSegmentNumbers = true;
              this.state.hourNumbersInsideSegment = true;
              // Update the UI checkbox
              const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
              if (insideSegmentCheckbox) {
                insideSegmentCheckbox.checked = true;
              }
            }
            
            // Third scroll step: disable time display and increase scale to 0.5
            if (this.state.pastLimitScrollCount >= 3) {
              
              // Store original time display state if not already stored
              if (this.state.originalTimeDisplay === null) {
                this.state.originalTimeDisplay = this.state.showTimeDisplay;
              }
              
              // Disable time display
              this.state.showTimeDisplay = false;
              
              // Update the UI checkbox
              const timeDisplayCheckbox = document.getElementById('timeDisplayToggle');
              if (timeDisplayCheckbox) {
                timeDisplayCheckbox.checked = false;
              }
              
              // Increase scale to 0.5
              this.state.spiralScale = 0.4975;
              
              // Update the UI slider
              const scaleSlider = document.getElementById('scaleSlider');
              if (scaleSlider) {
                scaleSlider.value = this.state.spiralScale;
                const scaleVal = document.getElementById('scaleVal');
                if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
              }
              
              // Trigger redraw to apply scale change
              this.drawSpiral();
            }
          } else if (delta < 0) {
            // Reset counter when zooming in
            this.state.pastLimitScrollCount = 0;
            
            // Reset auto-activated settings
            this.resetAutoActivatedSettings();
          }
          
          // If we're zooming in and auto inside segment numbers are active, reset them
          if (delta < 0 && this.state.autoInsideSegmentNumbers) {
            this.state.autoInsideSegmentNumbers = false;
            this.state.hourNumbersInsideSegment = false;
            // Update the UI checkbox
            const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
            if (insideSegmentCheckbox) {
              insideSegmentCheckbox.checked = false;
            }
          }
        }
        
        // No clamping: allow indefinite rotation
        // Update the rotateSlider UI to match
        const rotateSlider = document.getElementById('rotateSlider');
        if (rotateSlider) {
          // Allow indefinite rotation for wheel events
          let degrees = this.state.rotation * 180 / Math.PI;
          rotateSlider.value = degrees % 360; // Only constrain slider visual, not the actual value
          const rotateVal = document.getElementById('rotateVal');
          if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
        }
        this.drawSpiral();
      }, { passive: false });

      // Touch state for pinch-to-zoom
      this.touchState = {
        isActive: false,
        initialDistance: 0,
        initialDays: 0,
        touches: [],
        // Three-finger gesture for radius adjustment
        radiusAdjustActive: false,
        initialRadiusValue: 0,
        anchorTouchId: null, // Track which touch is the anchor (held down finger)
        pinchTouchIds: [], // Track which two touches are pinching
        // Four-finger gesture for days adjustment (two anchor + two pinch)
        daysAdjustActive: false,
        initialDaysValue: 0,
        anchorTouchIds: [], // Track which two touches are anchors
        daysPinchTouchIds: [] // Track which two touches are pinching for days
      };

      // Add touch event listeners for pinch-to-zoom
      this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      // If page zoom is active, do not process canvas gestures
      if (this.pageZoomActive) return;
      // Disable Auto Time Align on touch drag
      if (this.mouseState.isDragging) {
        if (this.autoTimeAlignState.enabled) {
          this.autoTimeAlignState.enabled = false;
          this.stopAutoTimeAlign();
        }
      }
      this.handleTouchMove(e);
    }, { passive: false });
      this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
      this.canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });

      window.addEventListener('resize', () => this.handleResize());
      
    // Add reset settings button handler
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        // Confirm before resetting
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
          this.resetSettingsToDefaults();
        }
      });
    }
  }
  setupEventInputPanel() {
    // Elements
    const addEventPanelBtn = document.getElementById('addEventPanelBtn');
    const eventInputPanel = document.getElementById('eventInputPanel');
    const closeEventPanelBtn = document.getElementById('closeEventPanelBtn');
    const eventTitle = document.getElementById('eventTitle');
    const eventDescription = document.getElementById('eventDescription');
    const eventStart = document.getElementById('eventStart');
    const eventEnd = document.getElementById('eventEnd');
    const eventStartBox = document.getElementById('eventStartBox');
    const eventEndBox = document.getElementById('eventEndBox');
    const eventColor = document.getElementById('eventColor');
    const colorBox = document.getElementById('colorBox');
    const addEventBtn = document.getElementById('addEventBtn');
    const titleCharCount = document.getElementById('titleCharCount');
    const descCharCount = document.getElementById('descCharCount');
    const eventList = document.getElementById('eventList');

    // Reusable helpers for custom date/time boxes in the panel
    const openHiddenPicker = (inputEl) => {
      if (!inputEl) return;
      // Directly trigger the hidden input under the box so the OS places the popup near it when possible
      if (typeof inputEl.showPicker === 'function') {
        try { inputEl.showPicker(); return; } catch (_) {}
      }
      inputEl.focus();
      inputEl.click();
    };

    const openAnchoredPicker = (anchorEl, targetInputEl) => {
      if (!anchorEl || !targetInputEl) return openHiddenPicker(targetInputEl);
      const rect = anchorEl.getBoundingClientRect();
      const temp = document.createElement('input');
      temp.type = 'datetime-local';
      temp.style.position = 'fixed';
      temp.style.left = `${Math.max(0, Math.round(rect.left))}px`;
      temp.style.top = `${Math.min(window.innerHeight - 2, Math.round(rect.bottom + 2))}px`;
      temp.style.zIndex = '10000';
      temp.style.opacity = '0.01';
      temp.style.width = '2px';
      temp.style.height = '2px';
      temp.style.pointerEvents = 'auto';
      temp.value = targetInputEl.value || formatDateTimeLocalForInput(new Date());

      document.body.appendChild(temp);

      const cleanup = () => { if (temp.parentNode) temp.remove(); };
      const apply = () => {
        if (temp.value) {
          targetInputEl.value = temp.value;
          targetInputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        cleanup();
      };

      temp.addEventListener('change', apply);
      temp.addEventListener('blur', () => setTimeout(cleanup, 150));
      temp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cleanup();
        if (e.key === 'Enter') apply();
      });

      // Trigger picker on next tick to ensure layout is applied
      setTimeout(() => {
        if (typeof temp.showPicker === 'function') {
          try { temp.showPicker(); return; } catch (_) {}
        }
        temp.focus();
        temp.click();
      }, 0);
    };

    const formatBox = (value) => {
      if (!value) return '';
      const d = parseDateTimeLocalAsUTC(value);
      return this.formatDateTime(new Date(d));
    };

    const syncEventBoxes = () => {
      if (eventStartBox) eventStartBox.textContent = eventStart && eventStart.value ? formatBox(eventStart.value) : '';
      if (eventEndBox) eventEndBox.textContent = eventEnd && eventEnd.value ? formatBox(eventEnd.value) : '';
    };

    if (eventStartBox) eventStartBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(eventStart);
      } else {
        openAnchoredPicker(eventStartBox, eventStart);
      }
    });
    if (eventEndBox) eventEndBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(eventEnd);
      } else {
        openAnchoredPicker(eventEndBox, eventEnd);
      }
    });
    if (eventStart) eventStart.addEventListener('change', syncEventBoxes);
    if (eventEnd) eventEnd.addEventListener('change', syncEventBoxes);

    // Helper function to create "All:" header item
    const createAllHeaderItem = (isBottomList = false) => {
        const allLi = document.createElement('li');
      // Use centered layout on desktop, but keep space-between on mobile (matching event items)
      const isMobile = window.innerWidth <= 768;
      // For event panel (not bottom list), use responsive widths to fit panel
      const isEventPanel = !isBottomList;
      const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em'; // Smaller gap for event panel
      // When using row color style, extend header row to edges by using negative margins to counteract container padding
      const useRowColor = this.state.eventListColorStyle === 'row';
      // Use calc(100% + 1em) to extend width beyond container, counteracting both left and right padding
      const horizontalMargin = (useRowColor && !isEventPanel) ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
      // Background color for sticky header - match list container background (non-transparent)
      const isDarkMode = document.body.classList.contains('dark-mode');
      const headerBg = isDarkMode ? 'var(--dark-bg-panel)' : (isEventPanel ? '#dedede' : '#ffffff');
      // For bottom list, ul has padding: 0.5em, so extend sticky header upward to cover it
      // For event panel, ul has padding: 0, so no extension needed
      const stickyTopOffset = !isEventPanel ? '-0.5em' : '0';
      const stickyTopPadding = !isEventPanel ? '0.3em' : '0';
      // Make header sticky with proper background and z-index, extending upward to cover container padding
      allLi.style.cssText = `position: sticky; top: ${stickyTopOffset}; z-index: 5; background: ${headerBg}; padding: ${stickyTopPadding} 0 0.2em 0; ${horizontalMargin} border-bottom: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#eee'}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box;`;
      
      // Left side with search input and "All:" text (exact same width as event items)
        const leftContent = document.createElement('div');
      // For event panel, use flex to fit panel width; for bottom list on desktop, use fixed 300px
      const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
      leftContent.style.cssText = 'display: flex; align-items: center; gap: 0.5em; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
      
      // Search input container with clear button
      const searchContainer = document.createElement('div');
      searchContainer.style.cssText = 'position: relative; flex: 1; display: flex; align-items: center; min-width: 0;';
      
      // Search input - use unique ID for bottom list to avoid conflicts
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search';
      searchInput.id = isBottomList ? 'eventListSearchBottom' : 'eventListSearch';
      const isDarkModeSearch = document.body.classList.contains('dark-mode');
      searchInput.style.cssText = `width: 100%; padding: ${isMobile ? '0.2em 2em 0.2em 0.5em' : '0.2em 2em 0.2em 0.5em'}; border: 1px solid ${isDarkModeSearch ? 'var(--dark-border)' : '#ccc'}; border-radius: 0.3em; font-size: 16px; background: ${isDarkModeSearch ? 'var(--dark-bg-secondary)' : '#fff'}; color: ${isDarkModeSearch ? 'var(--dark-text-primary)' : '#333'}; min-width: 0; box-sizing: border-box;`;
      searchInput.value = this.eventListSearchQuery || '';
      
      // Clear button (×) - positioned inside the input on the right
      const clearButton = document.createElement('span');
      clearButton.innerHTML = '×';
      clearButton.style.cssText = `position: absolute; right: 0.4em; cursor: pointer; font-size: ${isMobile ? '1.2em' : '1.4em'}; line-height: 1; color: ${isDarkModeSearch ? 'var(--dark-text-primary)' : '#666'}; opacity: ${searchInput.value ? '0.6' : '0'}; pointer-events: ${searchInput.value ? 'auto' : 'none'}; transition: opacity 0.2s; user-select: none; z-index: 1;`;
      clearButton.title = 'Clear search';
      
      // Function to update clear button visibility
      const updateClearButton = () => {
        const hasValue = searchInput.value.length > 0;
        clearButton.style.opacity = hasValue ? '0.6' : '0';
        clearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
      };
      
      // Clear button click handler
      clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = '';
        this.eventListSearchQuery = '';
        // Sync the other search input
        const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
        const otherSearchInput = document.getElementById(otherSearchId);
        if (otherSearchInput) {
          otherSearchInput.value = '';
          // Update the other clear button if it exists
          const otherContainer = otherSearchInput.parentElement;
          if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
            const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
            otherClearButton.style.opacity = '0';
            otherClearButton.style.pointerEvents = 'none';
          }
        }
        updateClearButton();
        searchInput.focus();
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      });
      
      // Hover effect for clear button
      clearButton.addEventListener('mouseenter', () => {
        if (clearButton.style.opacity !== '0') {
          clearButton.style.opacity = '1';
        }
      });
      clearButton.addEventListener('mouseleave', () => {
        if (searchInput.value) {
          clearButton.style.opacity = '0.6';
        }
      });
      
      // Update search query and re-render on input - sync both inputs
      searchInput.addEventListener('input', (e) => {
        const inputValue = e.target.value;
        this.eventListSearchQuery = inputValue.trim();
        updateClearButton();
        // Sync the other search input (if it exists) to keep them in sync
        const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
        const otherSearchInput = document.getElementById(otherSearchId);
        if (otherSearchInput && otherSearchInput.value !== inputValue) {
          otherSearchInput.value = inputValue;
          // Update the other clear button if it exists
          const otherContainer = otherSearchInput.parentElement;
          if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
            const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
            const otherHasValue = inputValue.length > 0;
            otherClearButton.style.opacity = otherHasValue ? '0.6' : '0';
            otherClearButton.style.pointerEvents = otherHasValue ? 'auto' : 'none';
          }
        }
        // renderEventList will preserve the input element if it's focused, so no need to restore focus here
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      });
      
      // Clear search on Escape - sync both inputs
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.eventListSearchQuery = '';
          updateClearButton();
          const otherSearchId = isBottomList ? 'eventListSearch' : 'eventListSearchBottom';
          const otherSearchInput = document.getElementById(otherSearchId);
          if (otherSearchInput) {
            otherSearchInput.value = '';
            // Update the other clear button if it exists
            const otherContainer = otherSearchInput.parentElement;
            if (otherContainer && otherContainer.querySelector('span[title="Clear search"]')) {
              const otherClearButton = otherContainer.querySelector('span[title="Clear search"]');
              otherClearButton.style.opacity = '0';
              otherClearButton.style.pointerEvents = 'none';
            }
          }
          if (typeof window.renderEventList === 'function') {
            window.renderEventList();
          }
        }
      });
      
      // Assemble search container
      searchContainer.appendChild(searchInput);
      searchContainer.appendChild(clearButton);
      leftContent.appendChild(searchContainer);
      
      // Calendar column with dropdown (matching event items - smaller on mobile, but can shrink)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
      const calendarContent = document.createElement('div');
      const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '70px' : '80px'};`;
      calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: visible; position: relative;`;
      
      // Calendar dropdown button
      const bottomCalendarDropdownBtn = document.createElement('button');
      const isDarkModeCalendar = document.body.classList.contains('dark-mode');
      bottomCalendarDropdownBtn.textContent = isMobile ? 'Calendars' : 'Calendars ▾';
      bottomCalendarDropdownBtn.title = 'Filter calendars';
      bottomCalendarDropdownBtn.style.cssText = `padding: ${isMobile ? '0.5em 0.2em' : '0.5em 0.4em'}; background: ${isDarkModeCalendar ? 'var(--dark-bg-secondary)' : '#fff'}; border: 1px solid ${isDarkModeCalendar ? 'var(--dark-border)' : '#ccc'}; border-radius: 0.3em; cursor: pointer; font-size: 12px; color: ${isDarkModeCalendar ? 'var(--dark-text-primary)' : '#333'}; white-space: nowrap; width: 100%; overflow: hidden; text-overflow: ellipsis;`;
      bottomCalendarDropdownBtn.onmouseover = () => bottomCalendarDropdownBtn.style.opacity = '0.8';
      bottomCalendarDropdownBtn.onmouseout = () => bottomCalendarDropdownBtn.style.opacity = '1';
      
      // Calendar dropdown menu for bottom event list
      let bottomCalendarDropdownMenu = document.getElementById('bottomCalendarDropdownMenu');
      if (!bottomCalendarDropdownMenu) {
        bottomCalendarDropdownMenu = document.createElement('div');
        bottomCalendarDropdownMenu.id = 'bottomCalendarDropdownMenu';
        bottomCalendarDropdownMenu.style.cssText = 'display: none; position: fixed; background: ' + (isDarkModeCalendar ? 'var(--dark-bg-secondary)' : '#fff') + '; border: 2px solid ' + (isDarkModeCalendar ? 'var(--dark-border)' : '#ccc') + '; border-radius: 0.3em; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 200px; z-index: 10000; padding: 0.4em 0;';
        document.body.appendChild(bottomCalendarDropdownMenu);
      }
      
      // Build calendar menu function (reuse logic from main dropdown)
      const buildBottomCalendarMenu = () => {
        if (!bottomCalendarDropdownMenu) return;
        bottomCalendarDropdownMenu.innerHTML = ''; // Clear existing
        
        // Header
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = 'Visible calendars';
        header.style.cssText = 'padding: 0.5em 0.6em; color: #666; font-size: 0.85em; border-bottom: 1px solid #eee;';
        bottomCalendarDropdownMenu.appendChild(header);
        
        // Visible calendar checkboxes
        (this.state.calendars || []).forEach(name => {
          const row = document.createElement('div');
          row.className = 'calendar-option';
          row.style.cssText = 'padding: 0.45em 0.6em; display: flex; align-items: center; gap: 0.5em; cursor: pointer;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = this.state.visibleCalendars.includes(name);
          cb.onchange = (e) => {
            const checked = e.target.checked;
            if (checked && !this.state.visibleCalendars.includes(name)) {
              this.state.visibleCalendars.push(name);
            } else if (!checked) {
              this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
              if (this.state.visibleCalendars.length === 0) {
                this.state.visibleCalendars = [name];
                cb.checked = true;
              }
            }
            this.saveSettingsToStorage();
            this.drawSpiral();
            renderEventList();
          };
          const label = document.createElement('span');
          label.textContent = name;
          label.style.cssText = 'flex:1;';
          row.appendChild(cb);
          row.appendChild(label);
          
          // Add delete button for non-default calendars
          const isDefaultCalendar = ['Home', 'Work'].includes(name);
          if (!isDefaultCalendar) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.title = `Delete calendar "${name}"`;
            deleteBtn.style.cssText = 'background: none; border: none; color: #b44; font-size: 1.1em; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; width: 20px; text-align: center; padding: 0; margin-left: 0.3em;';
            deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
            deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.6';
            deleteBtn.onclick = (e) => {
              e.stopPropagation();
              this.playFeedback();
              if (confirm(`Delete calendar "${name}"? All events in this calendar will be permanently deleted.`)) {
                this.events = this.events.filter(event => event.calendar !== name);
                this._eventsVersion++;
                this.state.calendars = this.state.calendars.filter(n => n !== name);
                this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
                this.saveSettingsToStorage();
                this.saveEventsToStorage();
                buildBottomCalendarMenu();
                // The main dropdown will rebuild itself when next opened
                renderEventList();
                this.drawSpiral();
              }
            };
            row.appendChild(deleteBtn);
          }
          
          bottomCalendarDropdownMenu.appendChild(row);
        });
        
        // Add "Add New Calendar" option
        const addNewCalendar = document.createElement('div');
        addNewCalendar.style.cssText = 'padding: 0.5em 0.6em; cursor: pointer; border-top: 1px solid #eee; color: #333;';
        addNewCalendar.textContent = '+ Add New Calendar';
        addNewCalendar.onclick = (e) => {
          e.stopPropagation();
          this.playFeedback();
          this.addNewCalendar((newCalendarName) => {
            buildBottomCalendarMenu();
            // The main dropdown will rebuild itself when next opened
            renderEventList();
            this.drawSpiral();
          });
          bottomCalendarDropdownMenu.style.display = 'none';
        };
        bottomCalendarDropdownMenu.appendChild(addNewCalendar);
      };
      
      // Toggle dropdown
      bottomCalendarDropdownBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = bottomCalendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          const isMobileDevice = window.innerWidth <= 768;
          if (isMobileDevice) {
            bottomCalendarDropdownMenu.style.left = '50%';
            bottomCalendarDropdownMenu.style.top = '50%';
            bottomCalendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
            bottomCalendarDropdownMenu.style.width = '90vw';
            bottomCalendarDropdownMenu.style.maxWidth = '300px';
            bottomCalendarDropdownMenu.style.maxHeight = '70vh';
            bottomCalendarDropdownMenu.style.overflowY = 'auto';
          } else {
            const buttonRect = bottomCalendarDropdownBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;
            const estimatedDropdownHeight = 400; // Approximate max height before scrolling
            
            // Position above button if not enough space below, otherwise below
            if (spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow) {
              bottomCalendarDropdownMenu.style.top = (buttonRect.top - estimatedDropdownHeight - 5) + 'px';
            } else {
              bottomCalendarDropdownMenu.style.top = (buttonRect.bottom + 5) + 'px';
            }
            
            bottomCalendarDropdownMenu.style.left = (buttonRect.left - 120) + 'px';
            bottomCalendarDropdownMenu.style.transform = 'none';
            bottomCalendarDropdownMenu.style.width = 'auto';
            // Constrain height on desktop and allow scrolling
            bottomCalendarDropdownMenu.style.maxWidth = 'none';
            bottomCalendarDropdownMenu.style.maxHeight = '60vh';
            bottomCalendarDropdownMenu.style.overflowY = 'auto';
          }
          bottomCalendarDropdownMenu.style.display = 'block';
          buildBottomCalendarMenu();
        } else {
          bottomCalendarDropdownMenu.style.display = 'none';
        }
      };
      
      // Touch event for mobile
      bottomCalendarDropdownBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = bottomCalendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          bottomCalendarDropdownMenu.style.left = '50%';
          bottomCalendarDropdownMenu.style.top = '50%';
          bottomCalendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
          bottomCalendarDropdownMenu.style.width = '90vw';
          bottomCalendarDropdownMenu.style.maxWidth = '300px';
          bottomCalendarDropdownMenu.style.maxHeight = '70vh';
          bottomCalendarDropdownMenu.style.overflowY = 'auto';
          bottomCalendarDropdownMenu.style.display = 'block';
          buildBottomCalendarMenu();
        } else {
          bottomCalendarDropdownMenu.style.display = 'none';
        }
      });
      
      // Close dropdown when clicking outside
      if (!window.bottomCalendarDropdownClickListener) {
        window.bottomCalendarDropdownClickListener = (e) => {
          if (bottomCalendarDropdownMenu && !bottomCalendarDropdownMenu.contains(e.target) && e.target !== bottomCalendarDropdownBtn) {
            bottomCalendarDropdownMenu.style.display = 'none';
          }
        };
        document.addEventListener('click', window.bottomCalendarDropdownClickListener);
      }
      
      calendarContent.appendChild(bottomCalendarDropdownBtn);
      
      // Date column placeholder (matching event items - smaller on mobile, but can shrink)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
      const middleContent = document.createElement('div');
      const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
      middleContent.style.cssText = `${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''} overflow: hidden;`; // Fixed width to match time column
      
      // Right side with "All:" text and buttons (fixed width, must never shrink to stay visible)
      // For event panel, use slightly smaller buttons; for bottom list on desktop, use standard width
      const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
      rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;
      
      // "All:" text label removed for alignment
      // const allInfo = document.createElement('span');
      // const isDarkModeAll = document.body.classList.contains('dark-mode');
      // allInfo.style.cssText = `color: ${isDarkModeAll ? 'var(--dark-text-primary)' : '#666'}; font-size: ${isMobile ? '0.85em' : '0.93em'}; white-space: nowrap;`;
      // allInfo.textContent = 'All: ';
      // rightContent.appendChild(allInfo);
        
        // Add All to Calendar button
        const addAllToCalendarBtn = document.createElement('button');
      // Use row color style logic if enabled, otherwise use dark mode
      const useRowColorHeader = this.state.eventListColorStyle === 'row';
      const isDarkModeAll = document.body.classList.contains('dark-mode');
      const allIconSuffix = useRowColorHeader ? 
        (document.body.classList.contains('dark-mode') ? '_white.png' : '.png') : 
        (isDarkModeAll ? '_white.png' : '.png');
      addAllToCalendarBtn.innerHTML = `<img src="icons/add_to_calendar${allIconSuffix}" alt="Add to Calendar" style="width: 16px; height: 16px; display: block; margin: 0; vertical-align: middle;">`;
        addAllToCalendarBtn.title = 'Add all events to calendar';
      addAllToCalendarBtn.style.cssText = 'background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; line-height: 0;';
        addAllToCalendarBtn.onmouseover = () => addAllToCalendarBtn.style.opacity = '1';
        addAllToCalendarBtn.onmouseout = () => addAllToCalendarBtn.style.opacity = '0.7';
        addAllToCalendarBtn.onclick = (e) => {
          e.stopPropagation();
          this.showAddAllToCalendarDialog();
        };
        
        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.textContent = '×';
        deleteAllBtn.title = 'Delete all events';
        // Match event row button styling - use adaptive color if row style, otherwise default #b44
        // For header row, we don't have event brightness, so use default or check if row style is enabled
        const deleteAllBtnColor = '#b44'; // Default color for header row
        deleteAllBtn.style.cssText = `background: none; border: none; color: ${deleteAllBtnColor}; font-size: 1.1em; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;`;
        deleteAllBtn.onmouseover = () => deleteAllBtn.style.opacity = '1';
        deleteAllBtn.onmouseout = () => deleteAllBtn.style.opacity = '0.8';
        deleteAllBtn.onclick = (e) => {
          e.stopPropagation();
          // Only count events from visible calendars
          const visibleEvents = this.events.filter(e => this.state.visibleCalendars.includes((e.calendar || 'Home')));
          if (confirm(`Delete all ${visibleEvents.length} visible event${visibleEvents.length !== 1 ? 's' : ''}? This action cannot be undone.`)) {
            // Only delete events from visible calendars
            this.events = this.events.filter(e => !this.state.visibleCalendars.includes((e.calendar || 'Home')));
            this._eventsVersion++;
            // Save events to localStorage
            this.saveEventsToStorage();
            this.drawSpiral();
            renderEventList();
          }
        };
        
        rightContent.appendChild(addAllToCalendarBtn);
        rightContent.appendChild(deleteAllBtn);
        
        allLi.appendChild(leftContent);
      allLi.appendChild(calendarContent);
      allLi.appendChild(middleContent);
        allLi.appendChild(rightContent);
      return allLi;
    };
      
    // Helper function to create event list item with all handlers
    const createEventListItem = (ev, isBottomList = false, heightScale = 1.0) => {
        const li = document.createElement('li');
      // Use centered layout on desktop, but keep space-between on mobile
      const isMobile = window.innerWidth <= 768;
      // For event panel (not bottom list), use responsive widths to fit panel
      const isEventPanel = !isBottomList;
      const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em'; // Smaller gap for event panel
      
      // Calculate padding based on height scale (base padding scales with proximity)
      const basePadding = 0.2; // Base padding in em
      const scaledPadding = basePadding * heightScale;
      
      // Get event display color
      const isDarkMode = document.body.classList.contains('dark-mode');
      const displayColor = this.getDisplayColorForEvent(ev);
      
      // Check which style to use: 'row' for full row background, 'dot' for colored circle
      // Always use dot style for event panel, respect user preference for bottom list
      const useRowColor = !isEventPanel && this.state.eventListColorStyle === 'row';
      
      // Calculate text color based on background brightness (only needed for row style)
      let textColor = '#333'; // Default text color
      let brightness = 128;
      if (useRowColor) {
        const hex = displayColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        brightness = (r * 299 + g * 587 + b * 114) / 1000;
        textColor = brightness > 128 ? '#000' : '#fff';
      }
      
      // Set background color and text color on the row (only if using row style)
      // Use !important to override dark mode CSS that forces transparent backgrounds
      const rowBackgroundStyle = useRowColor ? `background-color: ${displayColor} !important; color: ${textColor} !important;` : '';
      // When using row color style, extend to edges by using negative margins to counteract container padding
      // For bottom list, we need to counteract the 0.5em padding; for event panel, no negative margin needed (panel handles padding)
      // Use calc(100% + 1em) to extend width beyond container, counteracting both left and right padding
      const horizontalMargin = (useRowColor && !isEventPanel) ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
      // Apply scaled padding for proximity-based height scaling
      li.style.cssText = `padding: ${scaledPadding}em 0; ${horizontalMargin} border-bottom: 1px solid ${useRowColor ? 'rgba(0,0,0,0.1)' : '#eee'}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box; transition: padding 0.3s ease; ${rowBackgroundStyle}`;
      
      // Left side with color dot and title
        const leftContent = document.createElement('div');
      // For event panel, use flex to fit panel width; for bottom list on desktop, use fixed 300px
      const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
      leftContent.style.cssText = 'display: flex; align-items: center; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
        
        // Format time using UTC to avoid DST issues (date is shown in day header)
        const eventDate = new Date(ev.start);
        const hours = pad2(eventDate.getUTCHours());
        const minutes = pad2(eventDate.getUTCMinutes());
        const dateStr = `${hours}:${minutes}`;
      
      // Add color dot - always show in event panel, only show in bottom list when using dot style
      const showColorDot = isEventPanel || !useRowColor;
      const colorDot = showColorDot ? `<span style="display:inline-block;width:14px;height:14px;min-width:14px;max-width:14px;flex-shrink:0;border-radius:50%;background:${displayColor};margin-right:7px;vertical-align:middle;box-sizing:border-box;"></span>` : '';
      leftContent.innerHTML = `${colorDot}<span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${ev.title}</span>`;
      
      // Calendar column (smaller on mobile to fit narrow screens, but can shrink if needed)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
      const calendarContent = document.createElement('div');
      const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '60px' : '80px'};`;
      calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: hidden;`;
      
      // Get calendar color for background, with fallback
      let calBgColor = isDarkMode ? 'var(--dark-bg-secondary)' : '#eee';
      let calTextColor = isDarkMode ? 'var(--dark-text-primary)' : '#555';
      let calBorderColor = isDarkMode ? 'var(--dark-border)' : '#ddd';
      
      if (ev.calendar && this.state.calendarColors && this.state.calendarColors[ev.calendar]) {
        calBgColor = this.state.calendarColors[ev.calendar];
        // Determine text color based on background brightness
        // Convert hex to RGB and calculate brightness
        const hex = calBgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        calTextColor = brightness > 128 ? '#000' : '#fff';
        calBorderColor = calBgColor;
      }
      
      if (ev.calendar) {
        const calTag = document.createElement('span');
        calTag.style.cssText = `padding: 0 ${isMobile ? '4px' : '6px'}; font-size: ${isMobile ? '0.72em' : '0.78em'}; background: ${calBgColor}; border: 1px solid ${calBorderColor}; border-radius: 0.6em; color: ${calTextColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; display: inline-block; cursor: pointer;`;
        calTag.textContent = ev.calendar;
        
        // Long press handler to deselect all other calendars (select only this one)
        let pressStartTime = 0;
        let pressTimer = null;
        let hasMoved = false;
        const longPressDuration = 500; // 500ms for long press
        
        const handlePressStart = (e) => {
          pressStartTime = Date.now();
          hasMoved = false;
          pressTimer = setTimeout(() => {
            // Long press detected - toggle calendar filter
            if (!hasMoved && ev.calendar) {
              const isCurrentlyFiltered = this.state.visibleCalendars.length === 1 && 
                                          this.state.visibleCalendars[0] === ev.calendar;
              
              if (isCurrentlyFiltered) {
                // Second long press: restore previous state
                if (this._previousVisibleCalendars !== null) {
                  this.state.visibleCalendars = [...this._previousVisibleCalendars];
                  this._previousVisibleCalendars = null;
                } else {
                  // If no previous state, show all calendars
                  this.state.visibleCalendars = [...this.state.calendars];
                }
              } else {
                // First long press: save current state and filter to this calendar only
                this._previousVisibleCalendars = [...this.state.visibleCalendars];
                this.state.visibleCalendars = [ev.calendar];
              }
              
              this.saveSettingsToStorage();
              // Rebuild calendar dropdown menu to update checkboxes
              if (typeof this.buildCalendarMenu === 'function') {
                this.buildCalendarMenu();
              }
              // Re-render event list
              if (typeof window.renderEventList === 'function') {
                window.renderEventList();
              }
              this.drawSpiral();
            }
          }, longPressDuration);
        };
        
        const handlePressEnd = (e) => {
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
          pressStartTime = 0;
          hasMoved = false;
        };
        
        const handleMove = (e) => {
          hasMoved = true;
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
        };
        
        // Add event listeners for both touch and mouse
        calTag.addEventListener('touchstart', handlePressStart, { passive: true });
        calTag.addEventListener('touchend', handlePressEnd, { passive: true });
        calTag.addEventListener('touchmove', handleMove, { passive: true });
        calTag.addEventListener('touchcancel', handlePressEnd, { passive: true });
        calTag.addEventListener('mousedown', handlePressStart);
        calTag.addEventListener('mouseup', handlePressEnd);
        calTag.addEventListener('mouseleave', handlePressEnd);
        calTag.addEventListener('mousemove', handleMove);
        
        calendarContent.appendChild(calTag);
      }
      
      // Time column (smaller on mobile to fit narrow screens, but can shrink if needed)
      // For event panel, use responsive widths; for bottom list on desktop, use fixed widths
      const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
        const middleContent = document.createElement('div');
      const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
      // Use the calculated text color for time (only if using row style, otherwise use default)
      const dateTextColor = useRowColor ? textColor : (isDarkMode ? 'var(--dark-text-primary)' : '#666');
      middleContent.style.cssText = `color: ${dateTextColor}; font-size: ${isMobile ? '0.85em' : '0.90em'}; white-space: nowrap; ${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''} text-align: left; overflow: hidden; text-overflow: ellipsis;`;
        middleContent.textContent = dateStr;
        
      // Right side with action buttons (fixed width, must never shrink to stay visible)
      // For event panel, use slightly smaller buttons; for bottom list on desktop, use standard width
      const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
      rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;

        // Add to Calendar button
        const addToCalendarBtn = document.createElement('button');
      let iconSrc, iconAlt, titleText;
      
      // Use white icon for dark backgrounds, dark icon for light backgrounds (only if using row style)
      const iconSuffix = useRowColor ? (brightness > 128 ? '.png' : '_white.png') : (isDarkMode ? '_white.png' : '.png');
      
      if (ev.addedToCalendar) {
        // Check if event has been modified since being added to calendar
        const hasBeenModified = ev.lastModified && ev.lastAddedToCalendar && 
                               ev.lastModified > ev.lastAddedToCalendar;
        
        if (hasBeenModified) {
          iconSrc = `icons/update_calendar${iconSuffix}`;
          iconAlt = 'Update in Calendar';
          titleText = 'Event needs update in calendar';
        } else {
          iconSrc = `icons/added_to_calendar${iconSuffix}`;
          iconAlt = 'Added to Calendar';
          titleText = 'Open calendar to manage event';
        }
      } else {
        iconSrc = `icons/add_to_calendar${iconSuffix}`;
        iconAlt = 'Add to Calendar';
        titleText = 'Add event to calendar';
      }
      
      addToCalendarBtn.innerHTML = `<img src="${iconSrc}" alt="${iconAlt}" style="width: 16px; height: 16px; display: block; margin: 0; vertical-align: middle;">`;
      addToCalendarBtn.title = titleText;
      addToCalendarBtn.style.cssText = 'background: none; border: none; cursor: pointer; opacity: 0.7; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; line-height: 0;';
        addToCalendarBtn.onmouseover = () => addToCalendarBtn.style.opacity = '1';
        addToCalendarBtn.onmouseout = () => addToCalendarBtn.style.opacity = '0.7';
      
      // Create add to calendar handler (same logic reused)
      const createAddToCalendarHandler = (event) => {
        return (e) => {
          e.stopPropagation();
          
          // Always open calendar app - even for up-to-date events, users might want to delete them
          // Detect iOS for better Apple Calendar integration
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          if (isIOS) {
            // For iOS, directly download ICS file that will open in Apple Calendar (like "Add All")
            let icsContent = 'BEGIN:VCALENDAR\r\n';
            icsContent += 'VERSION:2.0\r\n';
            icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
            icsContent += 'CALSCALE:GREGORIAN\r\n';
            icsContent += 'METHOD:PUBLISH\r\n';
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${generateEventUID(event)}\r\n`;
            icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
            icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
            icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
            icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
            if (event.description) {
              icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
            }
            icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
            // Add iOS-friendly properties
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += `SEQUENCE:${generateEventSequence(event)}\r\n`;
            icsContent += 'END:VEVENT\r\n';
            icsContent += 'END:VCALENDAR\r\n';

            const blob = new Blob([icsContent], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spiral-${event.title.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 0);
            
            // Mark event as added to calendar
            event.addedToCalendar = true;
            event.lastAddedToCalendar = Date.now();
            this.saveEventsToStorage();
            // Update event list to show new icon state (with delay to ensure properties are saved)
            setTimeout(() => renderEventList(), 0);
            return;
          }
          
          // For non-iOS devices, show the options dialog
          // Create options dialog
          const dialog = document.createElement('div');
          dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(222, 222, 222, 0.95);
            padding: 1.2em;
            border-radius: 0.5em;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 1000;
            min-width: 200px;
            text-align: center;
          `;

          const calendarButtonText = 'Open Calendar App';

          dialog.innerHTML = `
            <h4 style="margin: 0 0 0.8em 0; color: #333;">Add "${event.title}" to Calendar</h4>
            <div style="display: flex; gap: 0.5em; justify-content: center; flex-direction: column;">
              <button id="downloadICS" style="padding: 0.4em 1em; background: #4CAF50; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Download .ics file</button>
                <button id="openCalendar" style="padding: 0.4em 1em; background: #2196F3; color: white; border: none; border-radius: 0.3em; cursor: pointer;">${calendarButtonText}</button>
                <button id="openGoogleCalendar" style="padding: 0.4em 1em; background: #DB4437; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Google Calendar</button>
            </div>
            <button id="cancelCalendar" style="margin-top: 0.8em; padding: 0.3em 1em; background: #666; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Cancel</button>
          `;

          document.body.appendChild(dialog);

          // Download ICS file - mark as added since user is downloading
          dialog.querySelector('#downloadICS').onclick = () => {
            let icsContent = 'BEGIN:VCALENDAR\r\n';
            icsContent += 'VERSION:2.0\r\n';
            icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
            icsContent += 'CALSCALE:GREGORIAN\r\n';
            icsContent += 'METHOD:PUBLISH\r\n';
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${generateEventUID(event)}\r\n`;
            icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
            icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
            icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
            icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
            if (event.description) {
              icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
            }
            icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
            // Add iOS-friendly properties
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += `SEQUENCE:${generateEventSequence(event)}\r\n`;
            icsContent += 'END:VEVENT\r\n';
            icsContent += 'END:VCALENDAR\r\n';

            const blob = new Blob([icsContent], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spiral-${event.title.replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 0);
            
            // Mark event as added to calendar
            event.addedToCalendar = true;
            event.lastAddedToCalendar = Date.now();
            this.saveEventsToStorage();
            // Update event list to show new icon state (with delay to ensure properties are saved)
            setTimeout(() => renderEventList(), 0);
            
            document.body.removeChild(dialog);
          };

          // Open calendar app - don't mark as added since user might just view
          dialog.querySelector('#openCalendar').onclick = () => {
            const startDate = new Date(event.start).toISOString();
            const endDate = new Date(event.end).toISOString();
            
              // For non-iOS, try to open Google Calendar
            const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.replace(/[-:]/g, '').split('.')[0]}Z/${endDate.replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(event.description || '')}`;
              window.open(googleCalendarUrl, '_blank');
            
            // Don't mark as added - user might just view or cancel
            document.body.removeChild(dialog);
          };
          
          // Add Google Calendar button handler for non-iOS devices
            const googleCalendarBtn = dialog.querySelector('#openGoogleCalendar');
            if (googleCalendarBtn) {
              googleCalendarBtn.onclick = () => {
              const startDate = new Date(event.start).toISOString();
              const endDate = new Date(event.end).toISOString();
                
              const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.replace(/[-:]/g, '').split('.')[0]}Z/${endDate.replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(event.description || '')}`;
            window.open(googleCalendarUrl, '_blank');
              
              // Don't mark as added - user might just view or cancel
            document.body.removeChild(dialog);
          };
          }

          dialog.querySelector('#cancelCalendar').onclick = () => {
            document.body.removeChild(dialog);
          };

          // Close on outside click
          dialog.onclick = (e) => {
            if (e.target === dialog) {
              document.body.removeChild(dialog);
            }
          };
          };
        };

      addToCalendarBtn.onclick = createAddToCalendarHandler(ev);

        // Remove button - adjust color based on background brightness (only if using row style)
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove event';
        // Use appropriate color for remove button based on background
        const removeBtnColor = useRowColor ? (brightness > 128 ? '#b44' : '#ff6b6b') : '#b44';
        removeBtn.style.cssText = `background: none; border: none; color: ${removeBtnColor}; font-size: 1.1em; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;`;
        removeBtn.onmouseover = () => removeBtn.style.opacity = '1';
        removeBtn.onmouseout = () => removeBtn.style.opacity = '0.8';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
        if (confirm(`Delete event "${ev.title}"? This action cannot be undone.`)) {
          const idx = this.events.indexOf(ev);
          if (idx !== -1) {
            this.events.splice(idx, 1);
            this._eventsVersion++;
            // Save events to localStorage
            this.saveEventsToStorage();
            this.drawSpiral();
            renderEventList();
          }
          }
        };
        
        rightContent.appendChild(addToCalendarBtn);
        rightContent.appendChild(removeBtn);
        
        li.appendChild(leftContent);
      li.appendChild(calendarContent);
        li.appendChild(middleContent);
        li.appendChild(rightContent);

        // Select event on click
        li.style.cursor = 'pointer';
        li.onclick = (e) => {
        if (e.target === removeBtn || e.target.closest('button') === removeBtn) return;
          
          // Find the segment corresponding to the event's start time
          const eventStart = new Date(ev.start);
          const diffHours = (eventStart - this.referenceTime) / (1000 * 60 * 60);
          // Use floor for future and ceil for past to avoid off-by-one day rounding
          const segmentId = diffHours >= 0 ? Math.floor(diffHours) : Math.ceil(diffHours);
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const absPos = totalVisibleSegments - segmentId - 1;
          let newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
          // Map event UTC hour to spiral segment index (segment 0 = outermost/most recent, 23 = innermost/oldest)
          // The spiral counts from outside in, so segment 0 is hour 0 (00:00-01:00) when looking outward
          // But getAllEventsForSegment expects: segment 0 = 23:00-00:00, segment 23 = 00:00-01:00 (inverted)
          const eventUtcHour = eventStart.getUTCHours();
          // Convert UTC hour to spiral segment: hour 0 -> segment 23, hour 1 -> segment 22, ..., hour 23 -> segment 0
          const targetSegment = (CONFIG.SEGMENTS_PER_DAY - 1) - eventUtcHour;
          

          // Simple sanity adjustment: if computed day is off by exactly one day
          // compared to the event's actual UTC date, nudge the day index.
          try {
            const calcSegmentDate = (dayIdx, segIdx) => {
              const segId = totalVisibleSegments - (dayIdx * CONFIG.SEGMENTS_PER_DAY + segIdx) - 1;
              return new Date(this.referenceTime.getTime() + segId * 60 * 60 * 1000);
            };
            const candidateDate = calcSegmentDate(newDay, targetSegment);
            const eventStartUtc = new Date(ev.start);
            const dayMs = 24 * 60 * 60 * 1000;
            const deltaDays = Math.round((candidateDate - eventStartUtc) / dayMs);
            if (deltaDays === 1 && newDay > 0) {
              newDay -= 1;
            } else if (deltaDays === -1 && newDay < this.state.days - 1) {
              newDay += 1;
            }
          } catch (_) {
            // Fail-safe: ignore adjustment on any unexpected error
          }
          // After computing the rotation target, prefer to set rotation first
          const thetaMax = (this.state.days) * 2 * Math.PI;
          const eventRotation = (diffHours / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
          this.state.rotation = eventRotation;

          // Robustly locate the exact day containing this event for the computed hour segment
          // Check a few days around the computed day to handle edge cases
          let foundDay = -1;
          const searchRange = 2; // Check ±2 days around computed day
          const startDay = Math.max(0, newDay - searchRange);
          const endDay = Math.min(this.state.days - 1, newDay + searchRange);
          
          for (let d = startDay; d <= endDay; d++) {
            const list = this.getAllEventsForSegment(d, targetSegment);
            const idx = list.findIndex(ei => ei.event === ev);
            if (idx !== -1) { 
              foundDay = d;
              break;
            }
          }
          
          // If not found in nearby days, search all days as fallback
          if (foundDay === -1) {
            for (let d = 0; d < this.state.days; d++) {
              const list = this.getAllEventsForSegment(d, targetSegment);
              const idx = list.findIndex(ei => ei.event === ev);
              if (idx !== -1) { 
                foundDay = d;
                break;
              }
            }
          }
          
          if (foundDay !== -1) {
            newDay = foundDay;
          }

          this.mouseState.selectedSegment = { day: newDay, segment: targetSegment };
          // Keep selectedSegmentId consistent with the adjusted day/segment
          const adjustedSegmentId = totalVisibleSegments - (newDay * CONFIG.SEGMENTS_PER_DAY + targetSegment) - 1;
          this.mouseState.selectedSegmentId = adjustedSegmentId;
          // Find the event index for this segment
          const allEvents = this.getAllEventsForSegment(newDay, targetSegment);
          const eventIdx = allEvents.findIndex(ei => ei.event === ev);
          this.mouseState.selectedEventIndex = eventIdx >= 0 ? eventIdx : 0;
          this.state.detailMode = newDay;
          
          // --- rotation already updated above ---
          
          // Turn off Auto Time Align when jumping to an event
          if (this.autoTimeAlignState.enabled) {
            this.stopAutoTimeAlign();
          }
          
          // Update the rotateSlider UI to match
          const rotateSlider = document.getElementById('rotateSlider');
          if (rotateSlider) {
            const degrees = eventRotation * 180 / Math.PI;
            rotateSlider.value = degrees;
            const rotateVal = document.getElementById('rotateVal');
            if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
          }
          
          // Switch to circle mode for detail view
          if (!this.state.circleMode) {
            this._wasSpiralModeBeforeDetail = true;
            this.alignSelectedSegmentInCircleMode();
            this.state.circleMode = true;
            const circleModeCheckbox = document.getElementById('circleMode');
            if (circleModeCheckbox) circleModeCheckbox.checked = true;
          }
          
          // Force a redraw to ensure the time display shows the correct time
          this.drawSpiral();
        };
      
      return li;
    };

    window.renderEventList = () => {
      // Sort events by start date and apply calendar visibility filter and search query
      const searchQuery = (this.eventListSearchQuery || '').toLowerCase().trim();
      const sorted = this.events
        .filter(e => {
          // Filter by visible calendars
          if (!this.state.visibleCalendars.includes((e.calendar || 'Home'))) return false;
          // Filter by search query if present
          if (searchQuery) {
            const title = (e.title || '').toLowerCase();
            const description = (e.description || '').toLowerCase();
            const calendar = (e.calendar || 'Home').toLowerCase();
            return title.includes(searchQuery) || description.includes(searchQuery) || calendar.includes(searchQuery);
          }
          return true;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      
      // Preserve search input on mobile to prevent keyboard from closing
      // Check both search inputs (main panel and bottom list)
      const existingSearchInput = document.getElementById('eventListSearch');
      const existingBottomSearchInput = document.getElementById('eventListSearchBottom');
      const wasSearchFocused = existingSearchInput && document.activeElement === existingSearchInput;
      const wasBottomSearchFocused = existingBottomSearchInput && document.activeElement === existingBottomSearchInput;
      const activeSearchInput = wasSearchFocused ? existingSearchInput : (wasBottomSearchFocused ? existingBottomSearchInput : null);
      const searchCursorPos = activeSearchInput ? (activeSearchInput.selectionStart || activeSearchInput.value.length) : null;
      
      // Find and preserve the header row if search input is focused
      const headerLi = eventList.querySelector('li:first-child');
      const shouldPreserveHeader = wasSearchFocused && headerLi && headerLi.querySelector('#eventListSearch');
      
      // Remove all items except header if preserving
      if (shouldPreserveHeader) {
        // Remove all list items except the first one (header)
        // Don't touch the header or search input - keep them intact to preserve focus
        const items = Array.from(eventList.children);
        for (let i = 1; i < items.length; i++) {
          items[i].remove();
        }
      } else {
        // Full clear if not preserving
        eventList.innerHTML = '';
      }
      
      // Also prepare bottom event list container (if present)
      const bottomEventListItems = document.getElementById('bottomEventListItems');
      let shouldPreserveBottomHeader = false;
      if (bottomEventListItems) {
        // Check if bottom list has focused search input
        const bottomHeaderLi = bottomEventListItems.querySelector('li:first-child');
        shouldPreserveBottomHeader = wasBottomSearchFocused && bottomHeaderLi && bottomHeaderLi.querySelector('#eventListSearchBottom');
        
        if (shouldPreserveBottomHeader) {
          const bottomItems = Array.from(bottomEventListItems.children);
          for (let i = 1; i < bottomItems.length; i++) {
            bottomItems[i].remove();
          }
          // Value should already be synced via the input handler
        } else {
          bottomEventListItems.innerHTML = '';
        }
      }

      // Add "All:" header item if there are events OR if there's a search query (so search bar is always visible)
      // Only create if we didn't preserve it
      const hasSearchQuery = searchQuery.length > 0;
      if (!shouldPreserveHeader && (this.events.length > 0 || hasSearchQuery)) {
        const allHeaderItem = createAllHeaderItem();
        eventList.appendChild(allHeaderItem);
      }
      
      // Clone for bottom list
      if (bottomEventListItems && !shouldPreserveBottomHeader && (this.events.length > 0 || hasSearchQuery)) {
        const allHeaderBottom = createAllHeaderItem(true); // Pass true to indicate it's for bottom list
        bottomEventListItems.appendChild(allHeaderBottom);
      }
      
      // Empty state for both lists when no visible events (but still show header if searching)
      if (sorted.length === 0) {
        const isMobile = window.innerWidth <= 768;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const makeEmptyItem = () => {
          const li = document.createElement('li');
          li.style.cssText = 'padding: 0.6em 0; border-bottom: 1px solid #eee; display: flex; justify-content: center; align-items: center; gap: 0.6em;';
          const msg = document.createElement('div');
          msg.style.cssText = `font-size: ${isMobile ? '0.88em' : '0.95em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#666'}; opacity: 0.8; text-align: center;`;
          msg.textContent = hasSearchQuery ? 'No events found' : 'No events to show';
          const hint = document.createElement('div');
          hint.style.cssText = `font-size: ${isMobile ? '0.78em' : '0.85em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#888'}; opacity: 0.8;`;
          hint.textContent = hasSearchQuery ? 'Try a different search term.' : 'Use + to add events.';
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex; flex-direction: column; align-items: center;';
          wrap.appendChild(msg);
          wrap.appendChild(hint);
          li.appendChild(wrap);
          return li;
        };

        eventList.appendChild(makeEmptyItem());
        if (bottomEventListItems) {
          bottomEventListItems.appendChild(makeEmptyItem());
        }
        return;
      }
      
      // Calculate proximity scaling for events
      // Use the time shown in the time display, not just current time
      const displayTime = this.getDisplayTime();
      
      // First, check for all currently happening events (start <= displayTime < end)
      // Handle overlapping events by highlighting all of them
      const currentEvents = sorted.filter(e => {
        const eventStart = new Date(e.start);
        const eventEnd = new Date(e.end);
        return eventStart <= displayTime && displayTime < eventEnd;
      });
      
      // Create a Set of highlighted event IDs (for fast lookup)
      const highlightedEventIds = new Set();
      
      if (currentEvents.length > 0) {
        // Highlight all currently happening events (including overlapping ones)
        currentEvents.forEach(e => {
          const eventId = e.id || e.start;
          highlightedEventIds.add(eventId);
        });
      } else {
        // No current event, find the next upcoming event
        const upcomingEvents = sorted.filter(e => new Date(e.start) > displayTime);
        if (upcomingEvents.length > 0) {
          const eventId = upcomingEvents[0].id || upcomingEvents[0].start;
          highlightedEventIds.add(eventId);
        }
      }
      
      // Calculate height scale for each event - scale all highlighted events (current or next)
      const getEventHeightScale = (event) => {
        // Scale all highlighted events (3.5x size)
        const eventId = event.id || event.start;
        if (highlightedEventIds.has(eventId)) {
          return 3.5;
        }
        // All other events get normal height
        return 1.0;
      };
      
      // Group events by day (using UTC date to avoid timezone issues)
      const eventsByDay = new Map();
      for (const ev of sorted) {
        const eventDate = new Date(ev.start);
        const dayKey = `${eventDate.getUTCFullYear()}-${eventDate.getUTCMonth()}-${eventDate.getUTCDate()}`;
        if (!eventsByDay.has(dayKey)) {
          eventsByDay.set(dayKey, []);
        }
        eventsByDay.get(dayKey).push(ev);
      }
      
      // Helper function to create day header
      // Uses the same layout structure as event rows for proper alignment
      const createDayHeader = (dayKey, isBottomList = false) => {
        const li = document.createElement('li');
        const isMobile = window.innerWidth <= 768;
        const isEventPanel = !isBottomList;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const gapSize = (isMobile || isEventPanel) ? '0.5em' : '1em';
        
        // Parse dayKey (format: YYYY-M-D)
        const [year, month, day] = dayKey.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month, day));
        const today = new Date();
        const todayKey = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
        const isToday = dayKey === todayKey;
        
        // Format date string (e.g., "Monday, Jan 15, 2025" or "Today, Jan 15, 2025")
        const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getUTCDay()];
        const monthName = MONTHS_SHORT_UTC[month];
        const dateStr = isToday ? `Today, ${monthName} ${day}, ${year}` : `${weekday}, ${monthName} ${day}, ${year}`;
        
        // Use same layout structure as event rows: flex with leftContent, calendarContent, middleContent, rightContent
        const horizontalMargin = !isEventPanel ? 'margin-left: -0.5em; margin-right: -0.5em; padding-left: 0.5em; padding-right: 0.5em; width: calc(100% + 1em);' : '';
        // Sticky day header - sticks to top while day's events are visible
        // Use same background as header for seamless coverage
        const headerBg = isDarkMode ? 'var(--dark-bg-panel)' : (isEventPanel ? 'rgba(222, 222, 222, 0.85)' : 'rgba(255, 255, 255, 0.95)');
        // Calculate sticky top offset (0 if no "All:" header, or account for it)
        // We'll update this dynamically after measuring the "All:" header
        const stickyTop = '0'; // Will be updated in a follow-up pass
        // Thinner header with border on top, sticky positioning
        li.style.cssText = `position: sticky; top: ${stickyTop}; z-index: 4; padding: 0.3em 0; ${horizontalMargin} border-top: 2px solid ${isDarkMode ? 'var(--dark-border)' : '#ccc'}; background: ${headerBg}; display: flex; justify-content: ${isMobile || isEventPanel ? 'space-between' : 'center'}; align-items: center; gap: ${gapSize}; overflow: hidden; ${!horizontalMargin ? 'max-width: 100%; width: 100%;' : ''} box-sizing: border-box;`;
        
        // Left side - matches event title position (same width/style as leftContent in event rows)
        const leftContent = document.createElement('div');
        const leftWidth = (isMobile || isEventPanel) ? 'flex: 1; min-width: 60px; ' : 'width: 300px; ';
        leftContent.style.cssText = 'display: flex; align-items: center; ' + leftWidth + 'min-width: ' + (isMobile || isEventPanel ? '60px' : '0') + '; flex-shrink: 1;';
        
        // When dot style is enabled, add an invisible placeholder dot to align with event color circles
        const useRowColor = this.state.eventListColorStyle === 'row';
        if (!useRowColor) {
          // Add invisible placeholder dot (14px width + 7px margin) to align with event color circles
          const placeholderDot = document.createElement('span');
          placeholderDot.style.cssText = 'display:inline-block;width:14px;height:14px;min-width:14px;max-width:14px;flex-shrink:0;margin-right:7px;visibility:hidden;';
          leftContent.appendChild(placeholderDot);
        }
        
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = `font-weight: 600; font-size: ${isMobile ? '0.9em' : '0.95em'}; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#333'};`;
        titleSpan.textContent = dateStr;
        leftContent.appendChild(titleSpan);
        li.appendChild(leftContent);
        
        // Calendar column - empty but maintains spacing (same width as event rows)
        const calendarWidth = (isMobile || isEventPanel) ? (isMobile ? '60px' : 'flex: 0 0 auto; min-width: 40px; max-width: 65px;') : '80px';
        const calendarContent = document.createElement('div');
        const calendarWidthStyle = (isMobile || isEventPanel) && !isMobile ? calendarWidth : `width: ${isMobile ? '60px' : '80px'};`;
        calendarContent.style.cssText = `display: flex; align-items: center; justify-content: flex-start; ${calendarWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 30px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 80px;' : ''} overflow: hidden;`;
        li.appendChild(calendarContent);
        
        // Time column - empty but maintains spacing (same width as event rows)
        const dateWidth = (isMobile || isEventPanel) ? (isMobile ? '50px' : 'flex: 0 0 auto; min-width: 40px; max-width: 55px;') : '55px';
        const middleContent = document.createElement('div');
        const dateWidthStyle = (isMobile || isEventPanel) && !isMobile ? dateWidth : `width: ${isMobile ? '50px' : '55px'};`;
        middleContent.style.cssText = `${dateWidthStyle} ${isMobile || isEventPanel ? 'flex-shrink: 1; min-width: 35px;' : 'flex-shrink: 0;'} ${!isMobile && !isEventPanel ? 'max-width: 55px;' : ''}`;
        li.appendChild(middleContent);
        
        // Right side - empty but maintains spacing (same width as event rows)
        const buttonWidth = (isMobile || isEventPanel) ? (isMobile ? '45px' : '45px') : '50px';
        const rightContent = document.createElement('div');
        rightContent.style.cssText = `display: flex; align-items: center; justify-content: flex-end; gap: ${isMobile ? '3px' : '4px'}; width: ${buttonWidth}; flex-shrink: 0; min-width: ${buttonWidth};`;
        li.appendChild(rightContent);
        
        return li;
      };
      
      // Track the first highlighted event item for scrolling (prioritize current events over next)
      let firstHighlightedItem = null;
      let firstHighlightedItemBottom = null;
      
      // Sort day keys chronologically
      const sortedDayKeys = Array.from(eventsByDay.keys()).sort((a, b) => {
        const [yearA, monthA, dayA] = a.split('-').map(Number);
        const [yearB, monthB, dayB] = b.split('-').map(Number);
        const dateA = new Date(Date.UTC(yearA, monthA, dayA));
        const dateB = new Date(Date.UTC(yearB, monthB, dayB));
        return dateA - dateB;
      });
      
      // Render events grouped by day
      const dayHeaders = [];
      const dayHeadersBottom = [];
      
      for (const dayKey of sortedDayKeys) {
        const dayEvents = eventsByDay.get(dayKey);
        
        // Add day header for event panel
        const dayHeader = createDayHeader(dayKey, false);
        dayHeaders.push(dayHeader);
        eventList.appendChild(dayHeader);
        
        // Add day header for bottom list
        if (bottomEventListItems) {
          const dayHeaderBottom = createDayHeader(dayKey, true);
          dayHeadersBottom.push(dayHeaderBottom);
          bottomEventListItems.appendChild(dayHeaderBottom);
        }
        
        // Add events for this day
        for (const ev of dayEvents) {
          const heightScale = getEventHeightScale(ev);
          const eventItem = createEventListItem(ev, false, heightScale); // false = event panel, pass height scale
          eventList.appendChild(eventItem);
          
          // Track the first highlighted event item for scrolling
          const eventId = ev.id || ev.start;
          if (highlightedEventIds.has(eventId) && !firstHighlightedItem) {
            firstHighlightedItem = eventItem;
          }
          
          // Clone for bottom list
          if (bottomEventListItems) {
            const eventItemBottom = createEventListItem(ev, true, heightScale); // true = bottom list, pass height scale
            bottomEventListItems.appendChild(eventItemBottom);
            
            // Track the first highlighted event item in bottom list for scrolling
            if (highlightedEventIds.has(eventId) && !firstHighlightedItemBottom) {
              firstHighlightedItemBottom = eventItemBottom;
            }
          }
        }
      }
      
      // Update sticky top offset for day headers after they're in DOM (account for "All:" header if present)
      // Use requestAnimationFrame to ensure layout is calculated
      requestAnimationFrame(() => {
        // Helper to convert CSS value to pixels
        const cssToPx = (cssValue, element) => {
          if (typeof cssValue === 'number') return cssValue;
          const match = cssValue.match(/^(-?\d+\.?\d*)(px|em|rem)$/);
          if (!match) return 0;
          const value = parseFloat(match[1]);
          const unit = match[2];
          if (unit === 'px') return value;
          // Convert em/rem to px using element's computed font-size
          const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
          return value * fontSize;
        };
        
        // Event panel
        const allHeaderItem = eventList.querySelector('li:first-child');
        let stickyTopOffset = '0';
        if (allHeaderItem && allHeaderItem.querySelector('#eventListSearch')) {
          const allHeaderHeight = allHeaderItem.offsetHeight || 0;
          const computedStyle = window.getComputedStyle(allHeaderItem);
          const allHeaderTop = computedStyle.top;
          // Convert top value to pixels, accounting for negative values
          const topPx = cssToPx(allHeaderTop, allHeaderItem);
          // Day headers should stick at the bottom edge of the "All:" header
          // If top is negative (extends upward), bottom is at: topPx + height
          // If top is 0 or positive, bottom is at: height
          const headerBottomPx = topPx < 0 ? topPx + allHeaderHeight : allHeaderHeight;
          stickyTopOffset = `${headerBottomPx}px`;
        }
        
        dayHeaders.forEach(dayHeader => {
          dayHeader.style.top = stickyTopOffset;
        });
        
        // Bottom list
        if (bottomEventListItems) {
          const allHeaderItemBottom = bottomEventListItems.querySelector('li:first-child');
          let stickyTopOffsetBottom = '0';
          if (allHeaderItemBottom && allHeaderItemBottom.querySelector('#eventListSearchBottom')) {
            const allHeaderHeightBottom = allHeaderItemBottom.offsetHeight || 0;
            const computedStyleBottom = window.getComputedStyle(allHeaderItemBottom);
            const allHeaderTopBottom = computedStyleBottom.top;
            const topPxBottom = cssToPx(allHeaderTopBottom, allHeaderItemBottom);
            const headerBottomPxBottom = topPxBottom < 0 ? topPxBottom + allHeaderHeightBottom : allHeaderHeightBottom;
            stickyTopOffsetBottom = `${headerBottomPxBottom}px`;
          }
          
          dayHeadersBottom.forEach(dayHeaderBottom => {
            dayHeaderBottom.style.top = stickyTopOffsetBottom;
          });
        }
      });
      
      // Scroll to show the first highlighted event at the top (after header)
      // Use setTimeout to ensure DOM is updated before scrolling
      setTimeout(() => {
        // Scroll event panel list
        if (firstHighlightedItem && eventList) {
          // Account for sticky "All:" header height if present
          const allHeaderItem = eventList.querySelector('li:first-child');
          const allHeaderHeight = (allHeaderItem && allHeaderItem.querySelector('#eventListSearch')) 
            ? allHeaderItem.offsetHeight || 0 
            : 0;
          
          // Account for sticky day header if the highlighted event is under one
          let dayHeaderHeight = 0;
          const highlightedEventLi = firstHighlightedItem;
          // Find the previous sibling that is a day header (has sticky positioning)
          let prevSibling = highlightedEventLi.previousElementSibling;
          while (prevSibling) {
            const prevStyle = window.getComputedStyle(prevSibling);
            if (prevStyle.position === 'sticky' && prevStyle.zIndex === '4') {
              // This is a day header
              dayHeaderHeight = prevSibling.offsetHeight || 0;
              break;
            }
            prevSibling = prevSibling.previousElementSibling;
          }
          
          const itemOffset = firstHighlightedItem.offsetTop;
          eventList.scrollTop = itemOffset - allHeaderHeight - dayHeaderHeight;
        }
        
        // Scroll bottom event list
        if (firstHighlightedItemBottom && bottomEventListItems) {
          // Account for sticky "All:" header height if present
          const allHeaderItemBottom = bottomEventListItems.querySelector('li:first-child');
          const allHeaderHeightBottom = (allHeaderItemBottom && allHeaderItemBottom.querySelector('#eventListSearchBottom')) 
            ? allHeaderItemBottom.offsetHeight || 0 
            : 0;
          
          // Account for sticky day header if the highlighted event is under one
          let dayHeaderHeightBottom = 0;
          const highlightedEventLiBottom = firstHighlightedItemBottom;
          let prevSiblingBottom = highlightedEventLiBottom.previousElementSibling;
          while (prevSiblingBottom) {
            const prevStyleBottom = window.getComputedStyle(prevSiblingBottom);
            if (prevStyleBottom.position === 'sticky' && prevStyleBottom.zIndex === '4') {
              // This is a day header
              dayHeaderHeightBottom = prevSiblingBottom.offsetHeight || 0;
              break;
            }
            prevSiblingBottom = prevSiblingBottom.previousElementSibling;
          }
          
          const itemOffsetBottom = firstHighlightedItemBottom.offsetTop;
          bottomEventListItems.scrollTop = itemOffsetBottom - allHeaderHeightBottom - dayHeaderHeightBottom;
        }
      }, 0);
      
      // Restore search input cursor position if header was preserved (focus maintained automatically)
      if (wasSearchFocused && shouldPreserveHeader && existingSearchInput) {
        // Header was preserved, so just restore cursor position
        if (searchCursorPos !== null) {
          const maxPos = existingSearchInput.value.length;
          const restorePos = Math.min(searchCursorPos, maxPos);
          existingSearchInput.setSelectionRange(restorePos, restorePos);
        }
        // Update clear button visibility for preserved header
        const preservedContainer = existingSearchInput.parentElement;
        if (preservedContainer) {
          const preservedClearButton = preservedContainer.querySelector('span[title="Clear search"]');
          if (preservedClearButton) {
            const hasValue = existingSearchInput.value.length > 0;
            preservedClearButton.style.opacity = hasValue ? '0.6' : '0';
            preservedClearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
          }
        }
      } else if (wasBottomSearchFocused && shouldPreserveBottomHeader && existingBottomSearchInput) {
        // Bottom header was preserved, restore cursor position
        if (searchCursorPos !== null) {
          const maxPos = existingBottomSearchInput.value.length;
          const restorePos = Math.min(searchCursorPos, maxPos);
          existingBottomSearchInput.setSelectionRange(restorePos, restorePos);
        }
        // Update clear button visibility for preserved bottom header
        const preservedBottomContainer = existingBottomSearchInput.parentElement;
        if (preservedBottomContainer) {
          const preservedBottomClearButton = preservedBottomContainer.querySelector('span[title="Clear search"]');
          if (preservedBottomClearButton) {
            const hasValue = existingBottomSearchInput.value.length > 0;
            preservedBottomClearButton.style.opacity = hasValue ? '0.6' : '0';
            preservedBottomClearButton.style.pointerEvents = hasValue ? 'auto' : 'none';
          }
        }
      } else if ((wasSearchFocused || wasBottomSearchFocused) && !shouldPreserveHeader && !shouldPreserveBottomHeader) {
        // Header was recreated, so we need to restore focus
        requestAnimationFrame(() => {
          const newSearchInput = wasSearchFocused ? document.getElementById('eventListSearch') : document.getElementById('eventListSearchBottom');
          if (newSearchInput) {
            newSearchInput.focus();
            if (searchCursorPos !== null) {
              const maxPos = newSearchInput.value.length;
              const restorePos = Math.min(searchCursorPos, maxPos);
              newSearchInput.setSelectionRange(restorePos, restorePos);
            }
          }
        });
      }
      
    };

    // ICS helpers are provided globally: formatIcsDateUTC, escapeIcsText

    // Function to export as ICS
    const exportToICS = () => {
      if (this.events.length === 0) {
        alert('No events to export.');
        return;
      }

      let icsContent = 'BEGIN:VCALENDAR\r\n';
      icsContent += 'VERSION:2.0\r\n';
      icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
      icsContent += 'CALSCALE:GREGORIAN\r\n';
      icsContent += 'METHOD:PUBLISH\r\n';

      this.events.forEach((event, index) => {
        icsContent += 'BEGIN:VEVENT\r\n';
        icsContent += `UID:spiral-${Date.now()}-${index}\r\n`;
        icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
        icsContent += `DTSTART:${formatIcsDateUTC(event.start)}\r\n`;
        icsContent += `DTEND:${formatIcsDateUTC(event.end)}\r\n`;
        icsContent += `SUMMARY:${escapeIcsText(event.title)}\r\n`;
        if (event.description) {
          icsContent += `DESCRIPTION:${escapeIcsText(event.description)}\r\n`;
        }
        icsContent += `X-SPIRAL-COLOR:${event.color}\r\n`;
        if (event.calendar) {
          icsContent += `X-SPIRAL-CALENDAR:${escapeIcsText(event.calendar)}\r\n`;
        }
        icsContent += 'END:VEVENT\r\n';
      });

      icsContent += 'END:VCALENDAR\r\n';

      const blob = new Blob([icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spiral-calendar.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    };

    // Function to export as JSON
    const exportToJSON = () => {
      const data = JSON.stringify(this.events, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spiral-events.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    };

    exportEventsBtn.addEventListener('click', () => {
      if (this.events.length === 0) {
        alert('No events to export.');
        return;
      }

      // Create export options dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(222, 222, 222, 0.95);
        padding: 1.5em;
        border-radius: 0.5em;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 1000;
        min-width: 250px;
        text-align: center;
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 1em 0; color: #333;">Export Events</h3>
        <div style="display: flex; gap: 0.5em; justify-content: center;">
          <button id="exportJSON" style="padding: 0.5em 1em; background: #2196F3; color: white; border: none; border-radius: 0.3em; cursor: pointer;">JSON</button>
          <button id="exportICS" style="padding: 0.5em 1em; background: #4CAF50; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Calendar (.ics)</button>
        </div>
        <button id="cancelExport" style="margin-top: 1em; padding: 0.3em 1em; background: #666; color: white; border: none; border-radius: 0.3em; cursor: pointer;">Cancel</button>
      `;

      document.body.appendChild(dialog);

      // Event listeners
      dialog.querySelector('#exportJSON').onclick = () => {
        exportToJSON();
        document.body.removeChild(dialog);
      };

      dialog.querySelector('#exportICS').onclick = () => {
        exportToICS();
        document.body.removeChild(dialog);
      };

      dialog.querySelector('#cancelExport').onclick = () => {
        document.body.removeChild(dialog);
      };

      // Close on outside click
      dialog.onclick = (e) => {
        if (e.target === dialog) {
          document.body.removeChild(dialog);
        }
      };
    });

    importEventsBtn.addEventListener('click', () => {
      importEventsFile.value = '';
      importEventsFile.click();
    });




    // Helper function to unescape ICS text
    const unescapeICS = (text) => {
      return text
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
    };

    // Helper function to parse ICS date
    const parseICSDate = (dateStr) => {
      // Handle both date-only and date-time formats
      if (dateStr.length === 8) {
        // Date only: YYYYMMDD
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        return new Date(Date.UTC(year, month, day));
      } else {
        // Date-time: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(dateStr.substring(9, 11));
        const minute = parseInt(dateStr.substring(11, 13));
        const second = parseInt(dateStr.substring(13, 15));
        
        if (dateStr.endsWith('Z')) {
          return new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
          // Assume local time if no timezone indicator
          return new Date(year, month, day, hour, minute, second);
        }
      }
    };

    // Function to parse ICS content
    const parseICSContent = (content) => {
      const events = [];
      const lines = content.split(/\r?\n/);
      let currentEvent = null;
      let inEvent = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line === 'BEGIN:VEVENT') {
          inEvent = true;
          currentEvent = {};
        } else if (line === 'END:VEVENT') {
          inEvent = false;
          if (currentEvent && currentEvent.start && currentEvent.end) {
            // Preserve color if provided; otherwise assign a random color
            if (!currentEvent.color) {
              const eventCalendar = currentEvent.calendar || 'Home';
              const randomColor = this.generateRandomColor(eventCalendar);
              // If generateRandomColor returns hex (single mode), keep it;
              // if it returns HSL, convert to hex for consistency
              currentEvent.color = randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor);
            }
            // Set default calendar if not provided
            if (!currentEvent.calendar) {
              currentEvent.calendar = 'Home';
            }
            events.push(currentEvent);
          }
          currentEvent = null;
        } else if (inEvent && currentEvent) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex);
            let value = line.substring(colonIndex + 1);
            
            // Handle line folding (continued lines)
            while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
              i++;
              value += lines[i].substring(1);
            }
            
            switch (key) {
              case 'SUMMARY':
                currentEvent.title = unescapeICS(value);
                break;
              case 'DESCRIPTION':
                currentEvent.description = unescapeICS(value);
                break;
              case 'DTSTART':
                currentEvent.start = parseICSDate(value);
                break;
              case 'DTEND':
                currentEvent.end = parseICSDate(value);
                break;
              case 'DURATION':
                // Handle duration if no DTEND
                if (currentEvent.start && !currentEvent.end) {
                  const duration = value;
                  // Simple duration parsing (PT1H = 1 hour, PT30M = 30 minutes)
                  let hours = 0, minutes = 0;
                  const hourMatch = duration.match(/(\d+)H/);
                  const minuteMatch = duration.match(/(\d+)M/);
                  if (hourMatch) hours = parseInt(hourMatch[1]);
                  if (minuteMatch) minutes = parseInt(minuteMatch[1]);
                  currentEvent.end = new Date(currentEvent.start.getTime() + (hours * 60 + minutes) * 60 * 1000);
                }
                break;
              case 'COLOR':
                // Accept hex, rgb(), or hsl(); if hsl, convert to hex for consistency
                {
                  const raw = value.trim();
                  if (/^hsl/i.test(raw)) {
                    try {
                      currentEvent.color = this.hslToHex(raw);
                    } catch (_) {
                      currentEvent.color = raw;
                    }
                  } else {
                    currentEvent.color = raw;
                  }
                }
                break;
              case 'X-SPIRAL-CALENDAR':
                currentEvent.calendar = unescapeICS(value);
                break;
            }
          }
        }
      }
      
      return events;
    };
    importEventsFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const content = evt.target.result;
          
          // Try to parse as JSON first
          try {
            const imported = JSON.parse(content);
            if (Array.isArray(imported)) {
              // Validate and convert date fields
              const newEvents = imported.map(ev => ({
                ...ev,
                start: new Date(ev.start),
                end: new Date(ev.end)
              }));
              
              // Auto-create missing calendars
              const missingCalendars = new Set();
              newEvents.forEach(event => {
                if (event.calendar && !this.state.calendars.includes(event.calendar)) {
                  missingCalendars.add(event.calendar);
                }
              });
              
              // Add missing calendars
              missingCalendars.forEach(calendarName => {
                this.state.calendars.push(calendarName);
                // Make new calendars visible by default
                if (!this.state.visibleCalendars.includes(calendarName)) {
                  this.state.visibleCalendars.push(calendarName);
                }
              });
              
              if (missingCalendars.size > 0) {
                this.saveSettingsToStorage();
              }
              
              // Append imported events to existing events instead of replacing them
              this.events = [...this.events, ...newEvents];
              this._eventsVersion++; // Trigger layout cache rebuild
              // Save events to localStorage
              this.saveEventsToStorage();
              this.drawSpiral();
              renderEventList();
              
              let message = `Successfully imported ${newEvents.length} events from JSON file.`;
              if (missingCalendars.size > 0) {
                message += ` Created ${missingCalendars.size} new calendar(s): ${Array.from(missingCalendars).join(', ')}.`;
              }
              alert(message);
              // Clear the file input so the same file can be imported again
              e.target.value = '';
              return;
            }
          } catch (jsonError) {
            // Not JSON, try ICS
          }
          
          // Try to parse as ICS
          if (content.includes('BEGIN:VCALENDAR') && content.includes('BEGIN:VEVENT')) {
            const importedEvents = parseICSContent(content);
            if (importedEvents.length > 0) {
              // Auto-create missing calendars
              const missingCalendars = new Set();
              importedEvents.forEach(event => {
                if (event.calendar && !this.state.calendars.includes(event.calendar)) {
                  missingCalendars.add(event.calendar);
                }
              });
              
              // Add missing calendars
              missingCalendars.forEach(calendarName => {
                this.state.calendars.push(calendarName);
                // Make new calendars visible by default
                if (!this.state.visibleCalendars.includes(calendarName)) {
                  this.state.visibleCalendars.push(calendarName);
                }
              });
              
              if (missingCalendars.size > 0) {
                this.saveSettingsToStorage();
              }
              
              // Append imported events to existing events instead of replacing them
              this.events = [...this.events, ...importedEvents];
              this._eventsVersion++; // Trigger layout cache rebuild
              // Save events to localStorage
              this.saveEventsToStorage();
              this.drawSpiral();
              renderEventList();
              
              let message = `Successfully imported ${importedEvents.length} events from calendar file.`;
              if (missingCalendars.size > 0) {
                message += ` Created ${missingCalendars.size} new calendar(s): ${Array.from(missingCalendars).join(', ')}.`;
              }
              alert(message);
              // Clear the file input so the same file can be imported again
              e.target.value = '';
        } else {
              alert('No valid events found in the calendar file.');
            }
          } else {
            alert('Unsupported file format. Please use JSON or .ics calendar files.');
          }
        } catch (err) {
          alert('Failed to import events: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // Random events generator UI
    const randStart = document.getElementById('randStart');
    const randEnd = document.getElementById('randEnd');
    const randStartBox = document.getElementById('randStartBox');
    const randEndBox = document.getElementById('randEndBox');
    const randCountRange = document.getElementById('randCountRange');
    const randCountVal = document.getElementById('randCountVal');
    const randMinRange = document.getElementById('randMinRange');
    const randMinVal = document.getElementById('randMinVal');
    const randMaxRange = document.getElementById('randMaxRange');
    const randMaxVal = document.getElementById('randMaxVal');
    const randNightWeightRange = document.getElementById('randNightWeightRange');
    const randNightWeightVal = document.getElementById('randNightWeightVal');
    const randClear = document.getElementById('randClear');
    const randGenerate = document.getElementById('randGenerate');

    const toInputValue = (date) => formatDateTimeLocalForInput(date);
    const getVisibleStart = () => this.visibleWindowStart();
    const getVisibleEnd = () => new Date(this.visibleWindowEnd().getTime() + 24 * 60 * 60 * 1000 - 1);

    const setRangeInputs = () => {
      const start = getVisibleStart();
      const end = getVisibleEnd();
      randStart.value = toInputValue(start);
      randEnd.value = toInputValue(end);
      if (randStartBox) randStartBox.textContent = formatBox(randStart.value);
      if (randEndBox) randEndBox.textContent = formatBox(randEnd.value);
    };
    const syncRandBoxes = () => {
      if (randStartBox) randStartBox.textContent = randStart && randStart.value ? formatBox(randStart.value) : '';
      if (randEndBox) randEndBox.textContent = randEnd && randEnd.value ? formatBox(randEnd.value) : '';
    };
    if (randStartBox) randStartBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(randStart);
      } else {
        openAnchoredPicker(randStartBox, randStart);
      }
    });
    if (randEndBox) randEndBox.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isMobile = isMobileDevice();
      if (isMobile) {
        this.openDateTimePickerForInput(randEnd);
      } else {
        openAnchoredPicker(randEndBox, randEnd);
      }
    });
    if (randStart) randStart.addEventListener('change', syncRandBoxes);
    if (randEnd) randEnd.addEventListener('change', syncRandBoxes);

    // Set initial range and update when days slider changes
    setRangeInputs();
    
    // Listen for days slider changes to update the random event range
    const daysSlider = document.getElementById('daysSlider');
    if (daysSlider) {
      daysSlider.addEventListener('input', setRangeInputs);
    }

    // Update value displays
    const updateValueDisplay = (slider, display) => {
      if (slider && display) {
        display.textContent = slider.value;
      }
    };

    // Enforce min <= max for length sliders (bidirectional)
    const clampLengths = () => {
      const minNum = parseInt(randMinRange.value || '15', 10);
      const maxNum = parseInt(randMaxRange.value || '240', 10);
      
      if (minNum > maxNum) {
        // If min exceeds max, adjust the other slider
        // Determine which slider was moved and adjust the other
        if (randMinRange === document.activeElement) {
          // Min was moved, adjust max up
          randMaxRange.value = String(minNum);
          updateValueDisplay(randMaxRange, randMaxVal);
        } else {
          // Max was moved, adjust min down
          randMinRange.value = String(maxNum);
          updateValueDisplay(randMinRange, randMinVal);
        }
      }
      
      // Update both displays
      updateValueDisplay(randMinRange, randMinVal);
      updateValueDisplay(randMaxRange, randMaxVal);
    };

    // Add event listeners for all sliders
    if (randCountRange && randCountVal) {
      randCountRange.addEventListener('input', () => updateValueDisplay(randCountRange, randCountVal));
      updateValueDisplay(randCountRange, randCountVal);
    }
    
    randMinRange.addEventListener('input', clampLengths);
    randMaxRange.addEventListener('input', clampLengths);
    
    if (randNightWeightRange && randNightWeightVal) {
      randNightWeightRange.addEventListener('input', () => updateValueDisplay(randNightWeightRange, randNightWeightVal));
      updateValueDisplay(randNightWeightRange, randNightWeightVal);
    }
    
    // Initial value display updates
    clampLengths();
    
    // Random events toggle functionality
    window.toggleRandomEvents = function() {
      const content = document.getElementById('randomEventsContent');
      const icon = document.getElementById('randToggleIcon');
      
      if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.textContent = '▲';
      } else {
        content.style.display = 'none';
        icon.textContent = '▼';
      }
    };

    // Study session toggle functionality
    window.toggleStudySession = function() {
      const content = document.getElementById('studySessionContent');
      const icon = document.getElementById('studyToggleIcon');
      
      if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.textContent = '▲';
      } else {
        content.style.display = 'none';
        icon.textContent = '▼';
      }
    };

    // Calendars dropdown functionality
    const calendarDropdownBtn = document.getElementById('calendarDropdownBtn');
    const calendarDropdownMenu = document.getElementById('calendarDropdownMenu');
    const addNewCalendar = document.getElementById('addNewCalendar');
    // Make buildCalendarMenu accessible for long press handler on calendar tags
    this.buildCalendarMenu = () => {
      if (!calendarDropdownMenu) return;
      // Remove existing options (keep addNewCalendar)
      const existing = calendarDropdownMenu.querySelectorAll('.calendar-option, .calendar-header');
      existing.forEach(el => el.remove());
      // Header
      const header = document.createElement('div');
      header.className = 'calendar-header';
      header.textContent = 'Visible calendars';
      header.style.cssText = 'padding: 0.5em 0.6em; color: #666; font-size: 0.85em; border-bottom: 1px solid #eee;';
      calendarDropdownMenu.insertBefore(header, addNewCalendar);
      // Visible calendar checkboxes
      (this.state.calendars || []).forEach(name => {
        const row = document.createElement('div');
        row.className = 'calendar-option';
        row.style.cssText = 'padding: 0.45em 0.6em; display: flex; align-items: center; gap: 0.5em; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.state.visibleCalendars.includes(name);
        cb.onchange = (e) => {
          const checked = e.target.checked;
          if (checked && !this.state.visibleCalendars.includes(name)) {
            this.state.visibleCalendars.push(name);
          } else if (!checked) {
            this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
            if (this.state.visibleCalendars.length === 0) {
              // keep at least one visible to avoid empty screen
              this.state.visibleCalendars = [name];
              cb.checked = true;
            }
          }
          this.saveSettingsToStorage();
          this.drawSpiral();
          renderEventList();
        };
        const label = document.createElement('span');
        label.textContent = name;
        label.style.cssText = 'flex:1;';
        row.appendChild(cb);
        row.appendChild(label);
        
        // Add delete button for non-default calendars
        const isDefaultCalendar = ['Home', 'Work'].includes(name);
        if (!isDefaultCalendar) {
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = '×';
          deleteBtn.title = `Delete calendar "${name}"`;
          deleteBtn.style.cssText = 'background: none; border: none; color: #b44; font-size: 1.1em; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; width: 20px; text-align: center; padding: 0; margin-left: 0.3em;';
          deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
          deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.6';
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.playFeedback();
            if (confirm(`Delete calendar "${name}"? All events in this calendar will be permanently deleted.`)) {
              // Delete all events from the calendar
              this.events = this.events.filter(event => event.calendar !== name);
              this._eventsVersion++;
              // Remove calendar from lists
              this.state.calendars = this.state.calendars.filter(n => n !== name);
              this.state.visibleCalendars = this.state.visibleCalendars.filter(n => n !== name);
              this.saveSettingsToStorage();
              this.saveEventsToStorage();
              this.buildCalendarMenu();
              populateEventCalendarSelect(); // Refresh the event calendar select dropdown
              renderEventList();
              this.drawSpiral();
            }
          };
          row.appendChild(deleteBtn);
        }
        
        calendarDropdownMenu.insertBefore(row, addNewCalendar);
      });
    };
    
    // Initial build of calendar menu
    this.buildCalendarMenu();
    if (calendarDropdownBtn && calendarDropdownMenu) {
      calendarDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = calendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          // Check if mobile device
          const isMobile = isMobileDevice();
          
          if (isMobile) {
            // Center dropdown on mobile
            calendarDropdownMenu.style.left = '50%';
            calendarDropdownMenu.style.top = '50%';
            calendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
            calendarDropdownMenu.style.width = '90vw';
            calendarDropdownMenu.style.maxWidth = '300px';
            calendarDropdownMenu.style.maxHeight = '70vh';
            calendarDropdownMenu.style.overflowY = 'auto';
          } else {
            // Desktop positioning
            const buttonRect = calendarDropdownBtn.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;
            const estimatedDropdownHeight = 400; // Approximate max height before scrolling
            
            // Position above button if not enough space below, otherwise below
            if (spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow) {
              calendarDropdownMenu.style.top = (buttonRect.top - estimatedDropdownHeight - 5) + 'px';
            } else {
            calendarDropdownMenu.style.top = (buttonRect.bottom + 5) + 'px';
            }
            
            calendarDropdownMenu.style.left = (buttonRect.right - 200) + 'px'; // 200px is min-width
            calendarDropdownMenu.style.transform = 'none';
            calendarDropdownMenu.style.width = 'auto';
            // Constrain height on desktop and allow scrolling
            calendarDropdownMenu.style.maxWidth = 'none';
            calendarDropdownMenu.style.maxHeight = '60vh';
            calendarDropdownMenu.style.overflowY = 'auto';
          }
          
          calendarDropdownMenu.style.display = 'block';
          this.buildCalendarMenu();
        } else {
          calendarDropdownMenu.style.display = 'none';
        }
      });
      
      // Add touch event for mobile
      calendarDropdownBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.playFeedback();
        const isVisible = calendarDropdownMenu.style.display === 'block';
        if (!isVisible) {
          // Always center on mobile for touch events
          calendarDropdownMenu.style.left = '50%';
          calendarDropdownMenu.style.top = '50%';
          calendarDropdownMenu.style.transform = 'translate(-50%, -50%)';
          calendarDropdownMenu.style.width = '90vw';
          calendarDropdownMenu.style.maxWidth = '300px';
          calendarDropdownMenu.style.maxHeight = '70vh';
          calendarDropdownMenu.style.overflowY = 'auto';
          
          calendarDropdownMenu.style.display = 'block';
          this.buildCalendarMenu();
        } else {
          calendarDropdownMenu.style.display = 'none';
        }
      });
      document.addEventListener('click', (e) => {
        if (!calendarDropdownMenu.contains(e.target) && e.target !== calendarDropdownBtn) {
          calendarDropdownMenu.style.display = 'none';
        }
      });
    }
    if (addNewCalendar) {
      addNewCalendar.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playFeedback();
        this.addNewCalendar((newCalendarName) => {
          this.buildCalendarMenu();
          // Update event calendar picker display if it exists
          const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
          if (eventCalendarDisplay) {
            this.selectedEventCalendar = newCalendarName;
            this.updateEventCalendarDisplay();
          }
          renderEventList();
          this.drawSpiral();
        });
      });
    }

    const roundToStepMinutes = (date, stepMinutes) => {
      const d = new Date(date);
      const ms = d.getTime();
      const stepMs = stepMinutes * 60 * 1000;
      const rounded = Math.round(ms / stepMs) * stepMs;
      d.setTime(rounded);
      return d;
    };

    randGenerate.addEventListener('click', () => {
      try {
        const count = Math.max(1, Math.min(5000, parseInt(randCountRange.value || '0', 10)));
        const minMin = Math.max(5, Math.min(720, parseInt(randMinRange.value || '15', 10)));
        const maxMin = Math.max(minMin, Math.min(720, parseInt(randMaxRange.value || String(minMin), 10)));
        const step = 5;
        const biasDay = true; // Always favor daytime
        const nightWeightFraction = Math.max(0, Math.min(1, (parseInt((randNightWeightRange && randNightWeightRange.value) || '5', 10) || 0) / 100));

        let startRange, endRange;
        // Always use visible window as default, but allow manual override
        if (randStart.value && randEnd.value) {
          startRange = parseDateTimeLocalAsUTC(randStart.value);
          endRange = parseDateTimeLocalAsUTC(randEnd.value);
        } else {
          startRange = getVisibleStart();
          endRange = getVisibleEnd();
        }
        if (endRange <= startRange) {
          alert('End must be after start for the random range.');
          return;
        }

        if (randClear.checked) {
          // Only clear previously generated random events, keep user-added ones
          this.events = this.events.filter(ev => ev.calendar !== 'Random');
          this._eventsVersion++;
          
          // Remove "Random" calendar if it exists (since we're clearing random events)
          const randomCalendarIndex = this.state.calendars.indexOf('Random');
          if (randomCalendarIndex !== -1) {
            this.state.calendars.splice(randomCalendarIndex, 1);
            // Also remove from visible calendars
            const randomVisibleIndex = this.state.visibleCalendars.indexOf('Random');
            if (randomVisibleIndex !== -1) {
              this.state.visibleCalendars.splice(randomVisibleIndex, 1);
            }
            this.saveSettingsToStorage();
          }
        }

        // Create "Random" calendar if it doesn't exist
        if (!this.state.calendars.includes('Random')) {
          this.state.calendars.push('Random');
          // Make Random calendar visible by default
          if (!this.state.visibleCalendars.includes('Random')) {
            this.state.visibleCalendars.push('Random');
          }
          this.saveSettingsToStorage();
        }

        const rangeMs = endRange.getTime() - startRange.getTime();
        
        // Helper function to check if two events overlap
        const eventsOverlap = (ev1, ev2) => {
          return ev1.start < ev2.end && ev2.start < ev1.end;
        };
        
        // Helper function to check if a new event overlaps with existing events
        const hasOverlap = (newEvent, existingEvents) => {
          return existingEvents.some(existing => eventsOverlap(newEvent, existing));
        };
        
        // Helper function to apply time preferences (full hours, half hours, etc.)
        const applyTimePreferences = (date) => {
          const minutes = date.getUTCMinutes();
          const random = Math.random();
          
          // 60% chance for full hour (00 minutes)
          if (random < 0.6 && minutes === 0) {
            return date; // Already at full hour
          } else if (random < 0.6) {
            // Move to full hour
            date.setUTCMinutes(0, 0, 0);
            return date;
          }
          
          // 20% chance for half hour (30 minutes)
          if (random < 0.8 && minutes === 30) {
            return date; // Already at half hour
          } else if (random < 0.8) {
            // Move to half hour
            date.setUTCMinutes(30, 0, 0);
            return date;
          }
          
          // 10% chance for quarter hours (15 or 45 minutes)
          if (random < 0.9) {
            if (minutes === 15 || minutes === 45) {
              return date; // Already at quarter hour
            } else {
              // Move to nearest quarter hour
              if (minutes < 15) {
                date.setUTCMinutes(15, 0, 0);
              } else if (minutes < 30) {
                date.setUTCMinutes(15, 0, 0);
              } else if (minutes < 45) {
                date.setUTCMinutes(45, 0, 0);
              } else {
                date.setUTCMinutes(45, 0, 0);
              }
              return date;
            }
          }
          
          // 10% chance for any 5-minute interval (keep as is)
          return date;
        };
        
        // Helper function to apply duration preferences (full hours, half hours, etc.)
        const applyDurationPreferences = (durationMinutes, minMin, maxMin) => {
          const random = Math.random();
          
          // 60% chance for full hour durations (60, 120, 180, etc.)
          if (random < 0.6) {
            // Find the nearest full hour duration within limits
            const fullHourDurations = [];
            for (let hours = 1; hours <= Math.floor(maxMin / 60); hours++) {
              const duration = hours * 60;
              if (duration >= minMin && duration <= maxMin) {
                fullHourDurations.push(duration);
              }
            }
            
            if (fullHourDurations.length > 0) {
              // Choose randomly from available full hour durations
              return fullHourDurations[Math.floor(Math.random() * fullHourDurations.length)];
            }
          }
          
          // 20% chance for half hour durations (30, 90, 150, etc.)
          if (random < 0.8) {
            const halfHourDurations = [];
            for (let halfHours = 1; halfHours <= Math.floor(maxMin / 30); halfHours++) {
              const duration = halfHours * 30;
              if (duration >= minMin && duration <= maxMin) {
                halfHourDurations.push(duration);
              }
            }
            
            if (halfHourDurations.length > 0) {
              return halfHourDurations[Math.floor(Math.random() * halfHourDurations.length)];
            }
          }
          
          // 10% chance for quarter hour durations (15, 45, 75, etc.)
          if (random < 0.9) {
            const quarterHourDurations = [];
            for (let quarterHours = 1; quarterHours <= Math.floor(maxMin / 15); quarterHours++) {
              const duration = quarterHours * 15;
              if (duration >= minMin && duration <= maxMin) {
                quarterHourDurations.push(duration);
              }
            }
            
            if (quarterHourDurations.length > 0) {
              return quarterHourDurations[Math.floor(Math.random() * quarterHourDurations.length)];
            }
          }
          
          // 10% chance for any 5-minute duration (keep original logic)
          return durationMinutes;
        };
        
        for (let i = 0; i < count; i++) {
          const stepsCount = Math.floor((maxMin - minMin) / step) + 1;
          let durMin = minMin + Math.floor(Math.random() * stepsCount) * step;
          
          // Apply duration preferences (full hours, half hours, etc.)
          durMin = applyDurationPreferences(durMin, minMin, maxMin);
          
          const durMs = durMin * 60 * 1000;

          let latestStartMs = endRange.getTime() - durMs;
          if (latestStartMs <= startRange.getTime()) {
            latestStartMs = startRange.getTime();
          }
          
          // Try to find a non-overlapping time slot
          let startDate, endDate;
          const maxAttempts = 200; // Increased attempts for overlap avoidance
          let foundNonOverlappingSlot = false;
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Generate a random start time
            const startMs = startRange.getTime() + Math.floor(Math.random() * Math.max(1, (latestStartMs - startRange.getTime())));
            let candidateStartDate = new Date(startMs);
            candidateStartDate = roundToStepMinutes(candidateStartDate, step);
            
            // Apply time preferences (full hours, half hours, etc.)
            candidateStartDate = applyTimePreferences(candidateStartDate);
            
            // Apply day/night bias using rejection sampling
            if (biasDay) {
              const localHour = (candidateStartDate.getUTCHours() + TIMEZONE_OFFSET) + candidateStartDate.getUTCMinutes() / 60;
              const { sunrise, sunset } = this.getSunTimesForDate(candidateStartDate);
              const isDay = sunrise <= sunset ? (localHour >= sunrise && localHour < sunset)
                                              : (localHour >= sunrise || localHour < sunset); // polar edge-case
              const acceptProb = isDay ? 1.0 : nightWeightFraction;
              
              // If this time doesn't match our bias preference, skip this attempt
              if (Math.random() >= acceptProb) {
                continue;
              }
            }
            
            startDate = candidateStartDate;
            endDate = new Date(startDate.getTime() + durMs);
            
            // Adjust if end date exceeds range
            if (endDate > endRange) {
              startDate = new Date(endRange.getTime() - durMs);
              startDate = roundToStepMinutes(startDate, step);
              endDate = new Date(startDate.getTime() + durMs);
            }
            
            // Check for overlaps with existing events
            const candidateEvent = { start: startDate, end: endDate };
            if (!hasOverlap(candidateEvent, this.events)) {
              foundNonOverlappingSlot = true;
              break;
            }
          }
          
          // If we couldn't find a non-overlapping slot, place it anyway (better than not generating the event)
          if (!foundNonOverlappingSlot) {
            // Fallback: place at a random time without overlap checking, but still respect day/night bias
            const fallbackAttempts = 50;
            for (let fallbackAttempt = 0; fallbackAttempt < fallbackAttempts; fallbackAttempt++) {
            const startMs = startRange.getTime() + Math.floor(Math.random() * Math.max(1, (latestStartMs - startRange.getTime())));
            startDate = new Date(startMs);
            startDate = roundToStepMinutes(startDate, step);
              
              // Apply time preferences (full hours, half hours, etc.)
              startDate = applyTimePreferences(startDate);
              
              // Apply day/night bias in fallback too
              if (biasDay) {
            const localHour = (startDate.getUTCHours() + TIMEZONE_OFFSET) + startDate.getUTCMinutes() / 60;
                const { sunrise, sunset } = this.getSunTimesForDate(startDate);
            const isDay = sunrise <= sunset ? (localHour >= sunrise && localHour < sunset)
                                                : (localHour >= sunrise || localHour < sunset);
            const acceptProb = isDay ? 1.0 : nightWeightFraction;
                
            if (Math.random() < acceptProb) break; // accepted
              } else {
                break; // no bias, accept immediately
              }
          }

            endDate = new Date(startDate.getTime() + durMs);
            
          if (endDate > endRange) {
            startDate = new Date(endRange.getTime() - durMs);
            startDate = roundToStepMinutes(startDate, step);
            endDate = new Date(startDate.getTime() + durMs);
            }
          }

          const randomColor = this.generateRandomColor('Random');
          const ev = {
            title: `Random Event ${i + 1}`,
            description: '',
            start: startDate,
            end: endDate,
            color: randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor),
            calendar: 'Random',
            addedToCalendar: false,
            lastModified: Date.now(),
            lastAddedToCalendar: null,
            persistentUID: generateEventUID({
              title: `Random Event ${i + 1}`,
              description: '',
              start: startDate,
              end: endDate,
            calendar: 'Random'
            })
          };
          this.events.push(ev);
          this._eventsVersion++;
        }

        // Save events to localStorage
        this.saveEventsToStorage();

        this.drawSpiral();
        renderEventList();
      } catch (err) {
        alert('Failed to generate events: ' + (err && err.message ? err.message : String(err)));
      }
    });

    // Delete random events button
    const randDeleteRandom = document.getElementById('randDeleteRandom');
    if (randDeleteRandom) {
      randDeleteRandom.addEventListener('click', () => {
        const randomEventCount = this.events.filter(ev => ev.calendar === 'Random').length;
        if (randomEventCount === 0) {
          alert('No random events to delete.');
          return;
        }
        
        if (confirm(`Delete ${randomEventCount} random event${randomEventCount !== 1 ? 's' : ''}?`)) {
          this.events = this.events.filter(ev => ev.calendar !== 'Random');
          this._eventsVersion++;
          
          // Remove "Random" calendar if it exists (since no more random events)
          const randomCalendarIndex = this.state.calendars.indexOf('Random');
          if (randomCalendarIndex !== -1) {
            this.state.calendars.splice(randomCalendarIndex, 1);
            // Also remove from visible calendars
            const randomVisibleIndex = this.state.visibleCalendars.indexOf('Random');
            if (randomVisibleIndex !== -1) {
              this.state.visibleCalendars.splice(randomVisibleIndex, 1);
            }
            this.saveSettingsToStorage();
          }
          
          // Save events to localStorage
          this.saveEventsToStorage();
          this.drawSpiral();
          renderEventList();
          alert(`Deleted ${randomEventCount} random event${randomEventCount !== 1 ? 's' : ''}.`);
        }
      });
    }

    // Show panel
    addEventPanelBtn.addEventListener('click', () => {
      // Play feedback for button click
      this.playFeedback(0.1, 6);
      
      // Hide the button and show the panel
      addEventPanelBtn.style.display = 'none';
      eventInputPanel.style.display = 'block';
      // Prevent zooming while panel is open
      document.body.classList.add('panel-open');
      // Set default values
      renderEventList();
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0); // Set to next full hour in local time
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      const nextHourString = formatLocalDateTime(nextHour);
      eventStart.value = nextHourString;
      const endTime = new Date(nextHour);
      endTime.setHours(nextHour.getHours() + 1); // Add 1 hour in local time
      eventEnd.value = formatLocalDateTime(endTime);
      // Update visible dt boxes
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
      if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
        // Suggest selected calendar color in calendar mode
        const calName = (this.selectedEventCalendar || 'Home').trim();
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        let hex = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
        if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
        eventColor.value = hex;
        colorBox.style.background = hex;
      } else {
        // Stored event color (independent from calendar palette)
        eventColor.value = this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
      colorBox.style.background = eventColor.value;
      }
      eventTitle.value = '';
      eventDescription.value = '';
      titleCharCount.textContent = '0';
      descCharCount.textContent = '0';
    });
    // Hide panel
    closeEventPanelBtn.addEventListener('click', () => {
      // Play feedback for button click
      this.playFeedback(0.1, 6);
      
      // Restore previous calendar visibility if it was filtered
      if (this._previousVisibleCalendars !== null) {
        this.state.visibleCalendars = [...this._previousVisibleCalendars];
        this._previousVisibleCalendars = null;
        this.saveSettingsToStorage();
        // Rebuild calendar dropdown menu to update checkboxes
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        // Re-render event list and spiral
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        this.drawSpiral();
      }
      
      eventInputPanel.style.display = 'none';
      // Show the button again
      addEventPanelBtn.style.display = 'grid';
      // Re-enable zooming and reset zoom level
      document.body.classList.remove('panel-open');
      this.resetMobileZoom();
    });
    
    // Hide tilt zoom HTML button on mobile; we use in-canvas control instead
    const tiltZoomBtn = document.getElementById('tiltZoomBtn');
    const isMobile = isMobileDevice();
    if (tiltZoomBtn) {
      tiltZoomBtn.style.display = isMobile ? 'none' : 'grid';
    }
    // --- Click outside to close ---
    document.addEventListener('mousedown', function handleOutsideClick(e) {
      // Handle event panel
      if (eventInputPanel.style.display === 'block') {
        const eventCalendarDropdown = document.getElementById('eventCalendarDropdown');
        const newCalendarDialog = document.getElementById('newCalendarDialog');
        if (!eventInputPanel.contains(e.target) && !addEventPanelBtn.contains(e.target) && 
            (!eventCalendarDropdown || !eventCalendarDropdown.contains(e.target)) &&
            (!newCalendarDialog || !newCalendarDialog.contains(e.target))) {
          // Restore previous calendar visibility if it was filtered
          if (spiralCalendar._previousVisibleCalendars !== null) {
            spiralCalendar.state.visibleCalendars = [...spiralCalendar._previousVisibleCalendars];
            spiralCalendar._previousVisibleCalendars = null;
            spiralCalendar.saveSettingsToStorage();
            // Rebuild calendar dropdown menu to update checkboxes
            if (typeof spiralCalendar.buildCalendarMenu === 'function') {
              spiralCalendar.buildCalendarMenu();
            }
            // Re-render event list and spiral
            if (typeof window.renderEventList === 'function') {
              window.renderEventList();
            }
            spiralCalendar.drawSpiral();
          }
          
          eventInputPanel.style.display = 'none';
          // Show the button again when closing via outside click
          addEventPanelBtn.style.display = 'grid';
          // Re-enable zooming and reset zoom level
          document.body.classList.remove('panel-open');
          spiralCalendar.resetMobileZoom();
        }
      }
      
      // Handle settings panel
      const settingsPanel = document.getElementById('settingsPanel');
      const settingsPanelBtn = document.getElementById('settingsPanelBtn');
      if (settingsPanel && settingsPanel.style.display === 'block') {
        if (!settingsPanel.contains(e.target) && !settingsPanelBtn.contains(e.target)) {
          settingsPanel.style.display = 'none';
          // Show the button again when closing via outside click
          settingsPanelBtn.style.display = 'grid';
          // Re-enable zooming and reset zoom level
          document.body.classList.remove('panel-open');
          spiralCalendar.resetMobileZoom();
        }
      }
    });
    
    // Settings panel handlers
    const settingsPanelBtn = document.getElementById('settingsPanelBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettingsPanelBtn = document.getElementById('closeSettingsPanelBtn');
    
    if (settingsPanelBtn && settingsPanel && closeSettingsPanelBtn) {
      // Show settings panel
      settingsPanelBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        // Hide the button and show the panel
        settingsPanelBtn.style.display = 'none';
        settingsPanel.style.display = 'block';
        // Prevent zooming while panel is open
        document.body.classList.add('panel-open');
      });
      
      // Hide settings panel
      closeSettingsPanelBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        settingsPanel.style.display = 'none';
        // Show the button again
        settingsPanelBtn.style.display = 'grid';
        // Re-enable zooming and reset zoom level
        document.body.classList.remove('panel-open');
        this.resetMobileZoom();
      });
    }
    // Add event
    addEventBtn.addEventListener('click', () => {
      this.playFeedback(); // Add click sound
      const title = eventTitle.value.trim();
      const description = eventDescription.value.trim();
      const startDate = eventStart.value;
      const endDate = eventEnd.value;
      // Store exactly what the user sees in the color input
      let color = eventColor.value;
      const chosenCalendar = this.selectedEventCalendar;
      if (startDate && endDate) {
        const event = {
          title: title || 'Untitled Event',
          description: description || '',
          start: parseDateTimeLocalAsUTC(startDate),
          end: parseDateTimeLocalAsUTC(endDate),
        color: color,
          calendar: chosenCalendar,
          addedToCalendar: false,
          lastModified: Date.now(),
          lastAddedToCalendar: null,
          persistentUID: generateEventUID({
            title: title || 'Untitled Event',
            description: description || '',
            start: parseDateTimeLocalAsUTC(startDate),
            end: parseDateTimeLocalAsUTC(endDate),
        calendar: chosenCalendar
          })
        };
        this.events.push(event);
        this._eventsVersion++;
        // Save events to localStorage
        this.saveEventsToStorage();
        this.drawSpiral();
        // Reset fields
        eventTitle.value = '';
        eventDescription.value = '';
        titleCharCount.textContent = '0';
        descCharCount.textContent = '0';
        // Generate new suggested color for next event
        if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
          const calName = (this.selectedEventCalendar || 'Home').trim();
          const calColor = this.state.calendarColors && this.state.calendarColors[calName];
          let hex = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
          if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
          eventColor.value = hex;
        } else {
          eventColor.value = this.generateRandomColorForStorage(this.state.selectedCalendar || 'Home');
        }
        // Reset auto-activated settings
        this.resetAutoActivatedSettings();
        
        // Hide panel after adding
        eventInputPanel.style.display = 'none';
        addEventPanelBtn.style.display = 'block'; // Show the add event button again
        // Re-enable zooming and reset zoom level
        document.body.classList.remove('panel-open');
        this.resetMobileZoom();
        renderEventList();
      } else {
        alert('Please select both start and end dates');
      }
    });

    eventColor.addEventListener('input', () => {
      // If user picks a color, reflect it unless we are in 'calendar' palette
      if (this.state.colorMode === 'calendar') {
        // Keep showing calendar color as preview in calendar mode
        try {
          const calName = (this.selectedEventCalendar || 'Home').trim();
          const calColor = this.state.calendarColors && this.state.calendarColors[calName];
          colorBox.style.background = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : eventColor.value;
        } catch (_) {
      colorBox.style.background = eventColor.value;
        }
      } else {
        colorBox.style.background = eventColor.value;
      }
    });
    colorBox.addEventListener('click', () => {
      eventColor.click();
    });
    // Set initial color box background per current palette
    try {
      if (this.state.colorMode === 'calendar') {
        const calName = (this.selectedEventCalendar || 'Home').trim();
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        colorBox.style.background = calColor ? (calColor.startsWith('#') ? calColor : this.hslToHex(calColor)) : eventColor.value;
      } else {
    colorBox.style.background = eventColor.value;
      }
    } catch (_) {
      colorBox.style.background = eventColor.value;
    }

    // Setup custom calendar picker for new events
    const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
    this.selectedEventCalendar = (this.state.selectedCalendar || 'Home'); // Default calendar for new events
    
    this.updateEventCalendarDisplay = () => {
      if (eventCalendarDisplay) {
        eventCalendarDisplay.textContent = this.selectedEventCalendar;
      }
    };
    
    // Add click handler for calendar picker
    if (eventCalendarDisplay) {
      eventCalendarDisplay.addEventListener('click', () => {
        this.playFeedback();
        this.openEventCalendarPicker();
      });
    }
    
    this.updateEventCalendarDisplay();
    
    // Character count handlers
    eventTitle.addEventListener('input', (e) => {
      titleCharCount.textContent = e.target.value.length;
    });
    eventDescription.addEventListener('input', (e) => {
      descCharCount.textContent = e.target.value.length;
      });
      // Auto-populate end date when start date changes
    eventStart.addEventListener('change', (e) => {
      const startValue = e.target.value;
      if (!startValue) return;
        const [datePart, timePart] = startValue.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);
        const endHour = (hour + 1) % 24;
        const endDay = hour + 1 >= 24 ? day + 1 : day;
        const endDateStr = `${year}-${month.toString().padStart(2, '0')}-${endDay.toString().padStart(2, '0')}`;
        const endTimeStr = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      eventEnd.value = `${endDateStr}T${endTimeStr}`;
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
    });
    // Prevent end date from being set earlier than start date
    eventEnd.addEventListener('change', (e) => {
      const startValue = eventStart.value;
      const endValue = eventEnd.value;
      if (!startValue || !endValue) return;
      const startDate = parseDateTimeLocalAsUTC(startValue);
      let endDate = parseDateTimeLocalAsUTC(endValue);
      if (endDate <= startDate) {
        // Auto-adjust end time to be 1 hour after start time
        endDate = new Date(startDate);
        endDate.setUTCHours(startDate.getUTCHours() + 1);
        // Format for input
        const year = endDate.getFullYear();
        const month = String(endDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(endDate.getUTCDate()).padStart(2, '0');
        const hours = String(endDate.getUTCHours()).padStart(2, '0');
        const minutes = String(endDate.getUTCMinutes()).padStart(2, '0');
        eventEnd.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
      if (typeof syncEventBoxes === 'function') syncEventBoxes();
      });
      
      // Render the event list after everything is set up
      renderEventList();
    }

    /**
     * Handle canvas resize and high-DPI displays
     */
    handleResize() {
      this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
      this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
      this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      // Update event list max height to 1/3 of screen height
      if (this.timeDisplayState) {
        this.timeDisplayState.eventListMaxHeight = Math.floor(this.canvas.clientHeight / 3);
      }
      this.drawSpiral();
    }

    setupCanvas() {
      this.handleResize();
    }

    /**
     * Handle mouse move events for segment detection
     */
    handleMouseMove(event) {
      // Desktop time display drag tracking
      if (this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseY = event.clientY - rect.top;
        this.timeDisplayState.mouseLastY = mouseY;
        const dy = mouseY - this.timeDisplayState.mouseStartY;
        const base = CONFIG.TIME_DISPLAY_HEIGHT;
        const minH = this.timeDisplayState.collapseHeight || 12;
        const startHeight = this.timeDisplayState.mouseStartHeight || base;
        const startOffset = this.timeDisplayState.mouseStartPullUpOffset || 0;
        
        if (dy > 0 && startOffset === 0) {
          // Dragging down from no pull-up: collapse time display (1:1 with cursor)
          let newH = startHeight - dy; // Drag down reduces height
          newH = Math.max(minH, Math.min(base, newH));
          this.timeDisplayState.currentHeight = newH;
          // Reset pull-up offset when collapsing
          this.timeDisplayState.pullUpOffset = 0;
          this.hideBottomEventList();
        } else {
          // Dragging up or dragging down from pulled-up state: track pull-up offset
          // Keep time display at fixed height
          this.timeDisplayState.currentHeight = base;
          this.timeDisplayState.collapsed = false;
          // Track pull-up offset: drag up (negative dy) increases offset 1:1
          let newOffset = startOffset - dy;
          // Calculate maximum allowed offset based on screen limits
          const canvasHeight = this.canvas.clientHeight;
          const timeDisplayBottom = canvasHeight - newOffset;
          const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
          const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
          const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
          const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
          // Limit to actual content height if available, otherwise use max allowed height
          const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
          const maxOffset = contentHeight > 0 ? Math.min(contentHeight, maxAllowedHeight) : maxAllowedHeight;
          newOffset = Math.max(0, Math.min(maxOffset, newOffset));
          this.timeDisplayState.pullUpOffset = newOffset;
          // Update event list visibility based on offset (skip rendering during drag to prevent flicker)
          this.updateBottomEventList(true);
        }
        this.drawSpiral();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
    // Track last mouse position for hover rendering in draw routines
    this.mouseState.lastMouseX = mouseX;
    this.mouseState.lastMouseY = mouseY;
      
      // Convert to canvas coordinates (accounting for device pixel ratio)
      const canvasX = mouseX * this.canvas.width / this.canvas.clientWidth;
      const canvasY = mouseY * this.canvas.height / this.canvas.clientHeight;
      
      // Handle event time handle dragging
      if (this.mouseState.isHandleDragging && this.handleDragState && this.handleDragState.event) {
        // Determine which hour segment we're over
        const seg = this.findSegmentAtPoint(canvasX, canvasY);
        if (seg) {
          // Compute minute within this segment using pre-rotation coordinates
          const canvasWidth = this.canvas.clientWidth;
          const canvasHeight = this.canvas.clientHeight;
          const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
          // Transform point to pre-rotation spiral space
          let modelX = canvasX / devicePixelRatio - centerX;
          let modelY = canvasY / devicePixelRatio - centerY;
          if (this.state.staticMode) {
            modelX = -modelX; modelY = -modelY;
          } else {
            const cosR = Math.cos(this.state.rotation);
            const sinR = Math.sin(this.state.rotation);
            const tx = cosR * modelX - sinR * modelY;
            const ty = sinR * modelX + cosR * modelY;
            modelX = tx; modelY = ty;
          }
          // Angle in draw space: ang = atan2(y, x), and ang = -th + offset => th = -ang + offset
          const ang = Math.atan2(modelY, modelX);
          const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
          const rawStartAngle = seg.day * 2 * Math.PI + seg.segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;
          let th = -ang + CONFIG.INITIAL_ROTATION_OFFSET;
          // Normalize th to be within [rawStartAngle, rawEndAngle]
          while (th < rawStartAngle) th += 2 * Math.PI;
          while (th > rawEndAngle) th -= 2 * Math.PI;
          // Compute minute fraction within the hour
          let minuteFrac = 1 - (th - rawStartAngle) / segmentAngle;
          // Clamp to [0,1]
          minuteFrac = Math.max(0, Math.min(1, minuteFrac));
          // Snap to nearest 5-minute step
          let minute = Math.round((minuteFrac * 60) / 5) * 5;
          // Keep within hour bounds
          if (minute >= 60) minute = 55;
          if (minute < 0) minute = 0;
          // Compute the UTC hour start datetime for this segment
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (seg.day * CONFIG.SEGMENTS_PER_DAY + seg.segment) - 1;
          const hoursFromReference = segmentId;
          const hourStart = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
          hourStart.setUTCMinutes(0, 0, 0);
          const newTime = new Date(hourStart.getTime() + minute * 60 * 1000);
          // Apply constraints and update event
          const ev = this.handleDragState.event;
          if (this.mouseState.draggingHandle === 'start') {
            // Start must be before end by at least 1 minute
            if (newTime >= ev.end) {
              const adjusted = new Date(ev.end.getTime() - 60 * 1000);
              ev.start = adjusted;
            } else {
              ev.start = newTime;
            }
          } else if (this.mouseState.draggingHandle === 'end') {
            // End must be after start by at least 1 minute
            if (newTime <= ev.start) {
              const adjusted = new Date(ev.start.getTime() + 60 * 1000);
              ev.end = adjusted;
            } else {
              ev.end = newTime;
            }
          }
          // Mark as changed and redraw
          this._eventCircleHasChanges = true;
          this.canvas.style.cursor = 'grabbing';
          // Rebuild layout cache since event times changed
          this._eventsVersion++;
          this.ensureLayoutCache();
          this.drawSpiral();
        }
        return;
      }
      
      // Handle drag rotation
      if (this.mouseState.isDragging) {
        // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
        const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
        const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
        
        // Calculate incremental angle change from last position
        let deltaAngle = currentAngle - this.mouseState.lastAngle;
        
        // Handle angle wraparound to prevent jumps when crossing -180°/+180° boundary
        if (deltaAngle > Math.PI) {
          deltaAngle -= 2 * Math.PI;
        } else if (deltaAngle < -Math.PI) {
          deltaAngle += 2 * Math.PI;
        }
        
        // Check if we've moved significantly to consider this a drag
        if (Math.abs(deltaAngle) > 0.05) { // 0.05 radians ≈ 3 degrees
          this.mouseState.hasMovedDuringDrag = true;
        }
        
        // Always apply rotation for smooth movement (even small movements)
        if (Math.abs(deltaAngle) > 0.001) { // Very small threshold to avoid jitter
          // Apply incremental rotation (invert direction when not in static mode)
          const rotationDirection = this.state.staticMode ? 1 : -1;
          const appliedDelta = deltaAngle * rotationDirection;
          this.state.rotation += appliedDelta;
          // Mark that this is a manual rotation, so event list should update
          this._shouldUpdateEventList = true;
          this.mouseState.lastAngle = currentAngle; // Update reference for next move
          // Track velocity sample for inertia
          const now = performance.now();
          if (!this._velSamples) this._velSamples = [];
          // Only track velocity if we've moved recently (within last 200ms)
          if (this._lastMoveTs !== undefined) {
            const dt = Math.max(0.001, (now - this._lastMoveTs) / 1000);
            const v = appliedDelta / dt;
            this._velSamples.push({ t: now, v });
            // Keep only last ~200ms of samples
            const cutoff = now - 200;
            while (this._velSamples.length && this._velSamples[0].t < cutoff) this._velSamples.shift();
          }
          this._lastMoveTs = now;
          
          // Update the rotateSlider UI to match
          const rotateSlider = document.getElementById('rotateSlider');
          if (rotateSlider) {
            let degrees = this.state.rotation * 180 / Math.PI;
            // Allow indefinite rotation - don't constrain to 0-360°
            rotateSlider.value = degrees % 360; // Only constrain slider visual, not the actual value
            const rotateVal = document.getElementById('rotateVal');
            if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
          }
          
          this.drawSpiral();
        }
        return; // Don't update hover when dragging
      }
      
    // Check if mouse is hovering over time display area
    if (this.state.showTimeDisplay) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
      const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
      const timeDisplayArea = {
        x: 0,
        y: canvasHeight - tdHeight - pullUpOffset,
        width: canvasWidth,
        height: tdHeight
      };
      
      const isHoveringTimeDisplay = mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
                                  mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height;
      
      if (isHoveringTimeDisplay !== this.mouseState.hoveredTimeDisplay) {
        this.mouseState.hoveredTimeDisplay = isHoveringTimeDisplay;
        
        // Change cursor
        this.canvas.style.cursor = isHoveringTimeDisplay ? 'pointer' : 'default';
        
        this.drawSpiral(); // Redraw to show hover effects
      }
    } else {
      // Reset hover state when time display is disabled
      if (this.mouseState.hoveredTimeDisplay) {
        this.mouseState.hoveredTimeDisplay = false;
        this.canvas.style.cursor = 'default';
        this.drawSpiral();
      }
    }
    
    // Check if cursor is within the info circle area (when detail view is open)
    let shouldCheckHover = true;
    if (this.state.detailMode !== null) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
      
      // First, check hover over event time handles (outside event circle)
      if (this.handleHandles) {
        // Convert to spiral-centered coordinates (CSS pixels)
        let modelX = canvasX / devicePixelRatio - centerX;
        let modelY = canvasY / devicePixelRatio - centerY;
        // Transform mouse vector into the same pre-rotation space used for handle coordinates
        if (this.state.staticMode) {
          // Canvas rotated by PI -> inverse is also PI (flip)
          modelX = -modelX;
          modelY = -modelY;
        } else {
          // Canvas rotated by -rotation -> inverse rotate by +rotation
          const cosR = Math.cos(this.state.rotation);
          const sinR = Math.sin(this.state.rotation);
          const tx = cosR * modelX - sinR * modelY;
          const ty = sinR * modelX + cosR * modelY;
          modelX = tx;
          modelY = ty;
        }
        const distStart = Math.hypot(modelX - this.handleHandles.start.x, modelY - this.handleHandles.start.y);
        const distEnd = Math.hypot(modelX - this.handleHandles.end.x, modelY - this.handleHandles.end.y);
        const startHit = distStart <= (this.handleHandles.start.r + 4);
        const endHit = distEnd <= (this.handleHandles.end.r + 4);
        const newHovered = startHit ? 'start' : (endHit ? 'end' : null);
        if (newHovered !== this.mouseState.hoveredHandle) {
          this.mouseState.hoveredHandle = newHovered;
          // Update cursor
          this.canvas.style.cursor = newHovered ? 'pointer' : 'default';
          // Redraw to update handle sizes on hover
          this.drawSpiral();
        }
        // If a handle is hovered, suppress segment hover checks
        if (this.mouseState.hoveredHandle) {
          shouldCheckHover = false;
        }
      } else if (this.mouseState.hoveredHandle) {
        // Clear stale hover state if handles aren't present
        this.mouseState.hoveredHandle = null;
        this.canvas.style.cursor = 'default';
        this.drawSpiral();
      }
      
      // Calculate distance from center (accounting for shifted center when time display is enabled)
      const distanceFromCenter = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);
      
      // Get the actual info circle radius
      const maxRadius = Math.min(canvasWidth, canvasHeight) * this.state.spiralScale;
      const infoCircleRadius = this.getInfoCircleRadius(maxRadius);
      
      // If cursor is within the info circle, don't check for segment hover
      if (distanceFromCenter <= infoCircleRadius) {
        shouldCheckHover = false;
        // Clear any existing hover state
        if (this.mouseState.hoveredSegment !== null) {
          this.mouseState.hoveredSegment = null;
          this.drawSpiral(); // Redraw to remove hover highlight
        }
        
        // Check for hover over clickable elements in the event circle
        this.checkEventCircleHover(mouseX, mouseY, centerX, centerY);
      } else {
        // Cursor is outside the event circle, reset hover state
        if (this.mouseState.hoveredEventElement !== null) {
          this.mouseState.hoveredEventElement = null;
          this.canvas.style.cursor = 'default';
        }
      }
    }
    
    // Find which segment the mouse is over (only if not in info circle)
    if (shouldCheckHover) {
      const segment = this.findSegmentAtPoint(canvasX, canvasY);
      
      if (segment !== this.mouseState.hoveredSegment) {
        this.mouseState.hoveredSegment = segment;
        this.drawSpiral(); // Redraw to show hover highlight
      }
      
      // Update tooltip info for hovered segment (only on desktop, not mobile)
      if (segment && !isMobileDevice()) {
        const events = this.getAllEventsForSegment(segment.day, segment.segment);
        this.mouseState.hoveredEvent = {
          segment: segment,
          events: events
        };
        this.mouseState.tooltipPosition = { x: mouseX, y: mouseY };
      } else {
        // Clear tooltip when not hovering over a segment or on mobile
        this.mouseState.hoveredEvent = null;
      }
      }
    }

  /**
   * Check for hover over clickable elements in the event circle
   */
  checkEventCircleHover(mouseX, mouseY, centerX, centerY) {
    let hoveredElement = null;
    
    // Check title click area
    if (this.titleClickArea && this.isPointInRect(mouseX, mouseY, this.titleClickArea)) {
      hoveredElement = 'title';
    }
    // Check description click area
    else if (this.descClickArea && this.isPointInRect(mouseX, mouseY, this.descClickArea)) {
      hoveredElement = 'description';
    }
    // Check date/time boxes
    else if (this.canvasClickAreas.startDateBox && this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.startDateBox)) {
      hoveredElement = 'startDate';
    }
    else if (this.canvasClickAreas.endDateBox && this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.endDateBox)) {
      hoveredElement = 'endDate';
    }
    // Check calendar box
    else if (this.canvasClickAreas.calendarBox && this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.calendarBox)) {
      hoveredElement = 'calendar';
    }
    // Check color ring
    else if (this.canvasClickAreas.colorRing && this.isPointInCircle(mouseX, mouseY, this.canvasClickAreas.colorRing)) {
      hoveredElement = 'color';
    }
    // Check buttons
    else if (this.deleteButtonInfo && this.isPointInRect(mouseX, mouseY, this.deleteButtonInfo)) {
      hoveredElement = 'deleteButton';
    }
    else if (this.addButtonInfo && this.isPointInRect(mouseX, mouseY, this.addButtonInfo)) {
      hoveredElement = 'addButton';
    }
    
    // Update cursor based on hovered element
    if (hoveredElement !== this.mouseState.hoveredEventElement) {
      this.mouseState.hoveredEventElement = hoveredElement;
      
      if (hoveredElement) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }
      // Redraw to reflect hover styling changes on canvas elements
      this.drawSpiral();
    }
  }
  
  /**
   * Check if a point is within a rectangle
   */
  isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && 
           y >= rect.y && y <= rect.y + rect.height;
  }
  /**
   * Check if a point is within a circle (for color ring)
   */
  isPointInCircle(x, y, circle) {
    const distance = Math.sqrt((x - circle.centerX) ** 2 + (y - circle.centerY) ** 2);
    return distance >= circle.innerRadius && distance <= circle.outerRadius;
    }

    /**
     * Handle mouse leave events
     */
    handleMouseLeave() {
      // Don't finalize time display drag on mouseleave - let window mouseup handle it
      // This allows dragging to continue when mouse moves outside canvas
      
      this.mouseState.hoveredSegment = null;
    this.mouseState.hoveredTimeDisplay = false;
    this.mouseState.clickingTimeDisplay = false;
    this.mouseState.hoveredEventElement = null;
      // Only stop spiral dragging when mouse leaves canvas, not time display dragging
      if (!(this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay)) {
        this.mouseState.isDragging = false;
      }
    this.canvas.style.cursor = 'default'; // Reset cursor
      this.mouseState.hoveredEvent = null; // Clear tooltip
      this.drawSpiral(); // Redraw to remove hover highlight
    }

    /**
     * Handle click events for segment selection
     */
    handleClick(event) {
      // Don't handle click if we just finished dragging
      if (this.mouseState.wasDragging) {
        this.mouseState.wasDragging = false;
        return;
      }
      
      // Don't handle click if we just finished dragging the time display
      if (this.timeDisplayState && this.timeDisplayState.justFinishedDrag) {
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const canvasX = mouseX * this.canvas.width / this.canvas.clientWidth;
      const canvasY = mouseY * this.canvas.height / this.canvas.clientHeight;
    
    // Check if click is on the time display (only if time display is enabled)
    if (this.state.showTimeDisplay) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
      const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
      const timeDisplayArea = {
        x: 0,
        y: canvasHeight - tdHeight - pullUpOffset,
        width: canvasWidth,
        height: tdHeight
      };
      
      if (mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
          mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height) {
        // If collapsed, expand on click and exit
        if (this.timeDisplayState && this.timeDisplayState.collapsed) {
          this.setTimeDisplayCollapsed(false);
          return;
        }
        // If we just long-pressed to start tilt zoom, suppress this click once
        if (this._suppressTimeDisplayClickOnce) {
          this._suppressTimeDisplayClickOnce = false;
          return;
        }
        
        // If an event is open, close it and reset auto-activated settings
        if (this.state.detailMode !== null) {
          // Close the event circle
          this.state.detailMode = null;
          this.mouseState.selectedSegment = null;
          this.mouseState.selectedSegmentId = null;
          this.virtualEvent = null;
          this._eventCircleHasChanges = false; // Reset changes when closing event circle
          this.mouseState.hoveredEventElement = null;
          this.canvas.style.cursor = 'default';
          
          // Reset auto-activated settings
          this.resetAutoActivatedSettings();
          
          // Play feedback for closing event
          this.playFeedback(0.15, 10);
          return; // Don't process other clicks
        }
        
        // Time display clicked - activate Auto Time Align if it's currently off
        if (!this.autoTimeAlignState.enabled) {
          const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
          if (autoTimeAlignCheckbox) {
            autoTimeAlignCheckbox.checked = true;
            this.autoTimeAlignState.enabled = true;
            this.startAutoTimeAlign();
          }
        }
        // Play feedback for time display click
        this.playFeedback(0.15, 10);
        return; // Don't process other clicks
      }
    }
      // Remove persistent inputs if clicking outside info circle
      const removePersistentInputs = () => {
        const persistentStartInput = document.getElementById('persistentStartDateTime');
        const persistentEndInput = document.getElementById('persistentEndDateTime');
        const persistentColorPicker = document.getElementById('persistentColorPicker');
        if (persistentStartInput) persistentStartInput.remove();
        if (persistentEndInput) persistentEndInput.remove();
        if (persistentColorPicker) persistentColorPicker.remove();
        this.persistentInputsState.currentEventId = null;
        this.persistentInputsState.inputsCreated = false;
      };
      
      // Check if click is within the info circle area
      if (this.state.detailMode !== null) {
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
        
        // Calculate the radius of the info circle
        let circleRadius;
        if (this.mouseState.selectedSegment) {
          const segment = this.mouseState.selectedSegment;
          if (this.state.circleMode) {
            // All segments of a day share the same radius in circle mode
            const day = segment.day;
            const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
            const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
            circleRadius = radiusFunction(day * 2 * Math.PI);
          } else {
            // Spiral mode: use the segment's theta
            const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
            const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
            const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
            const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
            circleRadius = radiusFunction(segmentTheta);
          }
        } else {
          // fallback
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
          circleRadius = radiusFunction(visibilityRange.max);
        }
        
        // Check if click is within the info circle
        const distance = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);
        if (distance <= circleRadius) {
          // Check for canvas-drawn clickable areas first
          if (this.canvasClickAreas.startDateBox) {
            const box = this.canvasClickAreas.startDateBox;
            if (mouseX >= box.x && mouseX <= box.x + box.width &&
                mouseY >= box.y && mouseY <= box.y + box.height) {
              this.openDateTimePicker(box.event, 'start', box);
              return;
            }
          }

          if (this.canvasClickAreas.endDateBox) {
            const box = this.canvasClickAreas.endDateBox;
            if (mouseX >= box.x && mouseX <= box.x + box.width &&
                mouseY >= box.y && mouseY <= box.y + box.height) {
              this.openDateTimePicker(box.event, 'end', box);
              return;
            }
          }

          if (this.canvasClickAreas.calendarBox) {
            const box = this.canvasClickAreas.calendarBox;
            if (mouseX >= box.x && mouseX <= box.x + box.width &&
                mouseY >= box.y && mouseY <= box.y + box.height) {
              this.openCalendarPicker(box.event);
              return;
            }
          }
          
          // Check for color ring click (outer ring but not inner circle)
          if (this.canvasClickAreas.colorRing) {
            const ring = this.canvasClickAreas.colorRing;
            const distanceFromRingCenter = Math.sqrt((mouseX - ring.centerX) ** 2 + (mouseY - ring.centerY) ** 2);
            if (distanceFromRingCenter <= ring.outerRadius && distanceFromRingCenter >= ring.innerRadius) {
              // Click is in the colored ring area
              if (ring.event) {
                this.openColorPicker(ring.event, { clientX: event.clientX, clientY: event.clientY });
              }
              return;
            }
          }
          
          // Check for title, description, and delete button
          if (this.titleClickArea) {
            const title = this.titleClickArea;
            if (mouseX >= title.x && mouseX <= title.x + title.width &&
                mouseY >= title.y && mouseY <= title.y + title.height) {
              // Title clicked - create editable input
              this.createTitleEditor(title.event, mouseX, mouseY);
              return;
            }
          }
          
          if (this.descClickArea) {
            const desc = this.descClickArea;
            if (mouseX >= desc.x && mouseX <= desc.x + desc.width &&
                mouseY >= desc.y && mouseY <= desc.y + desc.height) {
              // Description clicked - create editable textarea
              this.createDescriptionEditor(desc.event, mouseX, mouseY);
              return;
            }
          }
          
          // Check for add another event button
          if (this.addButtonInfo) {
            const addBtn = this.addButtonInfo;
            if (mouseX >= addBtn.x && mouseX <= addBtn.x + addBtn.width &&
                mouseY >= addBtn.y && mouseY <= addBtn.y + addBtn.height) {
              // "+ New" or "Done" button clicked
              this.playFeedback(); // Add click sound
              if (this._eventCircleHasChanges) {
                // "Done" button clicked - close the event circle
                this.state.detailMode = null;
                this._eventCircleHasChanges = false;
                this.drawSpiral();
                return;
              }
              // "+ New" button clicked - create a virtual event for editing
              if (addBtn.isAddAnotherButton) {
                // Calculate the segment time range
                const segment = this.mouseState.selectedSegment;
                const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
                const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
                const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
                const segmentHourStart = new Date(segmentDate);
              segmentHourStart.setUTCMinutes(0, 0, 0);
                const segmentHourEnd = new Date(segmentHourStart);
              segmentHourEnd.setUTCHours(segmentHourStart.getUTCHours() + 1);
                
                // Create a virtual event for editing (like clicking on a blank segment)
                const randomColor = this.generateRandomColor('Home');
                this.virtualEvent = {
                  title: '',
                  description: '',
                  start: new Date(segmentHourStart),
                  end: new Date(segmentHourEnd),
                  color: randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor),
                  calendar: 'Home',
                  isVirtual: true,
                  segmentId: segmentId
                };
                
                // Reset selected event index to show the virtual event interface
                this.mouseState.selectedEventIndex = 0;
                
                // Update the calculated color for the selected segment stroke
                if (this.mouseState.selectedSegment) {
                  this.mouseState.selectedSegment.calculatedColor = this.virtualEvent.color;
                }
                
              // Force immediate redraw to show the virtual event editing interface
                this.drawSpiral();
              
              // Ensure button info is properly updated for the virtual event
              // This forces the detail view to be redrawn with the correct button setup
              setTimeout(() => {
                this.drawSpiral();
              }, 10);
              }
              return;
            }
          }
          
          if (this.deleteButtonInfo) {
            const btn = this.deleteButtonInfo;
            if (mouseX >= btn.x && mouseX <= btn.x + btn.width &&
                mouseY >= btn.y && mouseY <= btn.y + btn.height) {
              // Delete button clicked
              this.playFeedback(); // Add click sound
              if (btn.isAddButton) {
                // Add Event button clicked - convert virtual event to real event
              if (btn.event && btn.event.isVirtual) {
                  // Convert virtual event to real event
                  const newEvent = {
                    title: btn.event.title || 'Untitled Event',
                    description: btn.event.description || '',
                    start: new Date(btn.event.start),
                    end: new Date(btn.event.end),
                    color: btn.event.color,
                    calendar: btn.event.calendar || 'Home',
                    addedToCalendar: false,
                    lastModified: Date.now(),
                    lastAddedToCalendar: null,
                    persistentUID: generateEventUID({
                      title: btn.event.title || 'Untitled Event',
                      description: btn.event.description || '',
                      start: new Date(btn.event.start),
                      end: new Date(btn.event.end),
                    calendar: btn.event.calendar || 'Home'
                    })
                  };
                  this.events.push(newEvent);
                  this.virtualEvent = null; // Clear virtual event
                  
                  // Reset auto-activated settings
                  this.resetAutoActivatedSettings();
                // Force redraw to update the interface
                this.drawSpiral();
                }
                // Only restore previous mode when adding event if we were originally in spiral mode
                if (this._wasSpiralModeBeforeDetail) {
                  // Prevent double restoration by temporarily setting a flag
                  this._suppressScaleRestore = true;
                  this.state.circleMode = false;
                  const circleModeCheckbox = document.getElementById('circleMode');
                  if (circleModeCheckbox) circleModeCheckbox.checked = false;
                  this._suppressScaleRestore = false;
                  // Restore original spiral scale when exiting circle mode
                  this.restoreOriginalSpiralScale();
                }
                this.deleteButtonInfo = null;
                this.addButtonInfo = null;
                this.titleClickArea = null;
                this.state.detailMode = null;
                this.mouseState.selectedSegment = null;
                this.mouseState.selectedSegmentId = null;
                this._eventCircleHasChanges = false; // Reset changes when closing event circle
                this.mouseState.hoveredEventElement = null;
                this.canvas.style.cursor = 'default';
                
                // Reset auto-activated inside segment numbers
                if (this.state.autoInsideSegmentNumbers) {
                  this.state.autoInsideSegmentNumbers = false;
                  this.state.hourNumbersInsideSegment = false;
                  // Update the UI checkbox
                  const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
                  if (insideSegmentCheckbox) {
                    insideSegmentCheckbox.checked = false;
                  }
                }
              // Switch back to spiral mode if we were previously in spiral mode
              if (this._wasSpiralModeBeforeDetail) {
                this.state.circleMode = false;
                const circleModeCheckbox = document.getElementById('circleMode');
                if (circleModeCheckbox) circleModeCheckbox.checked = false;
                this.restoreOriginalSpiralScale();
              }
                this.drawSpiral();
              } else {
                // Delete button clicked
                this.playFeedback(); // Add click sound
                if (confirm(`Delete event "${btn.event.title}"? This action cannot be undone.`)) {
                const eventIndex = this.events.indexOf(btn.event);
                if (eventIndex > -1) {
                  this.events.splice(eventIndex, 1);
                  this.deleteButtonInfo = null;
                  this.addButtonInfo = null;
                  this.titleClickArea = null;
                  this.state.detailMode = null;
                  this.mouseState.selectedSegment = null;
                  this.mouseState.selectedSegmentId = null;
                  this.mouseState.hoveredEventElement = null;
                  this.canvas.style.cursor = 'default';
                  
                  // Reset auto-activated settings
                  this.resetAutoActivatedSettings();
                // Switch back to spiral mode if we were previously in spiral mode
                if (this._wasSpiralModeBeforeDetail) {
                  this.state.circleMode = false;
                  const circleModeCheckbox = document.getElementById('circleMode');
                  if (circleModeCheckbox) circleModeCheckbox.checked = false;
                  this.restoreOriginalSpiralScale();
                }
                  this.drawSpiral();
                  }
                }
              }
              return;
            }
          }
          // Click is inside the info circle but not on any interactive element - do nothing
          return;
        }
      } else {
        // Not in detail mode, always remove persistent inputs
        removePersistentInputs();
      }
      
      const segment = this.findSegmentAtPoint(canvasX, canvasY);

      if (segment) {
        // Check if this is the same segment that's already selected
        const isSameSegment = this.mouseState.selectedSegment && 
                             this.mouseState.selectedSegment.day === segment.day && 
                             this.mouseState.selectedSegment.segment === segment.segment;
        
        if (isSameSegment) {
          // Clicked the same segment again
          if (this.state.detailMode !== null) {
            // If info screen is open, check events in this segment
            const allEvents = this.getAllEventsForSegment(segment.day, segment.segment);
            if (allEvents.length > 1) {
              // Cycle to the next event
              this.mouseState.selectedEventIndex = (this.mouseState.selectedEventIndex + 1) % allEvents.length;
              this.drawSpiral(); // Redraw to update the info screen
              return; // Keep info screen open
            } else if (allEvents.length === 1) {
              // Single event: open color picker for that event, keep info screen open
              this.openColorPicker(allEvents[0].event, { clientX: event.clientX, clientY: event.clientY });
              return;
            } else {
              // No events: close info screen as before
              if (this._wasSpiralModeBeforeDetail) {
                this.state.circleMode = false;
                const circleModeCheckbox = document.getElementById('circleMode');
                if (circleModeCheckbox) circleModeCheckbox.checked = false;
                // Restore original spiral scale when exiting circle mode
                this.restoreOriginalSpiralScale();
              }
              this.state.detailMode = null;
              this.virtualEvent = null; // Clear virtual event when closing
              this.mouseState.hoveredEventElement = null;
              this._eventCircleHasChanges = false; // Reset changes when closing event circle
              this.canvas.style.cursor = 'default';
              
              // Reset auto-activated inside segment numbers
              if (this.state.autoInsideSegmentNumbers) {
                this.state.autoInsideSegmentNumbers = false;
                this.state.hourNumbersInsideSegment = false;
                // Update the UI checkbox
                const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
                if (insideSegmentCheckbox) {
                  insideSegmentCheckbox.checked = false;
                }
              }
            }
          } else {
            // Opening info screen: remember previous mode and switch to circle mode
            this._wasSpiralModeBeforeDetail = !this.state.circleMode;
            
            // Reset event index when opening info screen
            this.mouseState.selectedEventIndex = 0;
            
            // If switching from spiral to circle mode, align the selected segment
            if (!this.state.circleMode) {
              // Align using the clicked segment (selectedSegment updates later in this handler)
              this.alignSelectedSegmentInCircleMode(segment);
            }
            
            this.state.circleMode = true;
            const circleModeCheckbox = document.getElementById('circleMode');
            if (circleModeCheckbox) circleModeCheckbox.checked = true;
            this.state.detailMode = segment.day;
          }
        } else {
          // Clicked a different segment - select it and reset event index
          this.mouseState.selectedEventIndex = 0;
          // Opening info screen: remember previous mode and switch to circle mode
          if (this.state.detailMode === null) {
            this._wasSpiralModeBeforeDetail = !this.state.circleMode;
            
            // If switching from spiral to circle mode, align the selected segment
            if (!this.state.circleMode) {
              // Align using the clicked segment (selectedSegment updates later in this handler)
              this.alignSelectedSegmentInCircleMode(segment);
            }
            
            this.state.circleMode = true;
            const circleModeCheckbox = document.getElementById('circleMode');
            if (circleModeCheckbox) circleModeCheckbox.checked = true;
          }
          this.state.detailMode = segment.day;
        }
        
        this.mouseState.selectedSegment = segment;
        // Store the selected segmentId for persistence
        const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
        this.mouseState.selectedSegmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
        
        // Play feedback for event selection
        this.playFeedback(0.12, 8);
      } else {
        // Clicked outside of any segment - deselect current selection
        const hadSelection = this.state.detailMode !== null || this.mouseState.selectedSegment !== null;
        
        if (this.state.detailMode !== null) {
          // Closing info screen: restore spiral mode if it was active before
          if (this._wasSpiralModeBeforeDetail) {
            this.state.circleMode = false;
            const circleModeCheckbox = document.getElementById('circleMode');
            if (circleModeCheckbox) circleModeCheckbox.checked = false;
            // Restore original spiral scale when exiting circle mode
            this.restoreOriginalSpiralScale();
          }
        }
        this.state.detailMode = null;
        this.mouseState.selectedSegment = null;
        this.mouseState.selectedSegmentId = null;
        this.virtualEvent = null; // Clear virtual event when deselecting
        
        // Reset auto-activated settings (independent of autoInsideSegmentNumbers flag)
        let needsRedraw = false;
        
        // Restore original scale if it was stored
        if (this.state.originalSpiralScale !== null) {
          this.state.spiralScale = this.state.originalSpiralScale;
          this.state.originalSpiralScale = null;
          
          // Update the UI slider
          const scaleSlider = document.getElementById('scaleSlider');
          if (scaleSlider) {
            scaleSlider.value = this.state.spiralScale;
            const scaleVal = document.getElementById('scaleVal');
            if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
          }
          needsRedraw = true;
        }
        
        // Restore original radius exponent if it was stored
        if (this.state.originalRadiusExponent !== null) {
          this.state.radiusExponent = this.state.originalRadiusExponent;
          this.state.originalRadiusExponent = null;
          
          // Update the UI slider
          const radiusSlider = document.getElementById('radiusSlider');
          if (radiusSlider) {
            radiusSlider.value = this.state.radiusExponent;
            const radiusVal = document.getElementById('radiusVal');
            if (radiusVal && this.state.radiusExponent !== null && this.state.radiusExponent !== undefined) {
              radiusVal.textContent = this.state.radiusExponent.toString();
            }
          }
          needsRedraw = true;
        }
        
        // Restore original time display if it was stored
        if (this.state.originalTimeDisplay !== null) {
          this.state.showTimeDisplay = this.state.originalTimeDisplay;
          this.state.originalTimeDisplay = null;
          
          // Update the UI checkbox
          const timeDisplayCheckbox = document.getElementById('timeDisplayToggle');
          if (timeDisplayCheckbox) {
            timeDisplayCheckbox.checked = this.state.showTimeDisplay;
          }
          needsRedraw = true;
        }
        
        // Reset auto-activated inside segment numbers
        if (this.state.autoInsideSegmentNumbers) {
          this.state.autoInsideSegmentNumbers = false;
          this.state.hourNumbersInsideSegment = false;
          
          // Update the UI checkbox
          const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
          if (insideSegmentCheckbox) {
            insideSegmentCheckbox.checked = false;
          }
          needsRedraw = true;
        }
        
        // Reset scroll counter
        this.state.pastLimitScrollCount = 0;
        
        // Trigger redraw if any settings were restored
        if (needsRedraw) {
          this.drawSpiral();
        }
        this.mouseState.hoveredEventElement = null;
        this.canvas.style.cursor = 'default';
        
        // Play feedback for deselection only if there was actually a selection
        if (hadSelection) {
          this.playFeedback(0.08, 5);
        }
      }
      this.drawSpiral();
    }

    /**
     * Handle mouse down events for drag rotation
     */
    handleMouseDown(event) {
      // Time display drag to collapse/expand (desktop)
      if (this.state.showTimeDisplay) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
        const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
        // Reduce hit padding when event list is extended (when pullUpOffset > 0)
        const basePad = (this.timeDisplayState && this.timeDisplayState.hitPadding) ? this.timeDisplayState.hitPadding : 80;
        const pad = pullUpOffset > 0 ? Math.max(20, basePad * 0.25) : basePad; // Reduce to 25% (min 20px) when extended
        const area = { x: 0, y: Math.max(0, canvasHeight - tdHeight - pullUpOffset - pad), width: canvasWidth, height: tdHeight + pad };
        if (mouseX >= area.x && mouseX <= area.x + area.width && mouseY >= area.y && mouseY <= area.y + area.height) {
          this.timeDisplayState.mouseActive = true;
          this.timeDisplayState.mouseStartY = mouseY;
          this.timeDisplayState.mouseLastY = mouseY;
          // Store initial state for tracking collapse/expand and pull-up
          this.timeDisplayState.mouseStartPullUpOffset = this.timeDisplayState.pullUpOffset || 0;
          this.timeDisplayState.mouseStartHeight = this.getTimeDisplayHeight();
          // Stop inertia when interacting with time display
          this.stopInertia();
          return; // Don't start spiral drag
        }
      }

      // In detail mode: allow starting a handle drag when over a handle
      if (this.state.detailMode !== null) {
        if (this.mouseState.hoveredHandle && this.mouseState.selectedSegment) {
          const which = this.mouseState.hoveredHandle; // 'start' | 'end'
          const seg = this.mouseState.selectedSegment;
          const eventsHere = this.getAllEventsForSegment(seg.day, seg.segment) || [];
          const idx = Math.min(this.mouseState.selectedEventIndex || 0, Math.max(0, eventsHere.length - 1));
          const selectedEvent = eventsHere[idx] && eventsHere[idx].event ? eventsHere[idx].event : null;
          if (selectedEvent) {
            this.mouseState.isHandleDragging = true;
            this.mouseState.draggingHandle = which;
            this.handleDragState = {
              which,
              event: selectedEvent,
              originalStart: new Date(selectedEvent.start),
              originalEnd: new Date(selectedEvent.end)
            };
            // Ensure spiral mode during handle drag (temporarily)
            if (this.state.circleMode) {
              this._originalCircleModeDuringHandleDrag = true;
              this.state.circleMode = false;
            } else {
              this._originalCircleModeDuringHandleDrag = false;
            }
            // Visual feedback
            this.canvas.style.cursor = 'grabbing';
            // Stop inertia when beginning a handle drag
            this.stopInertia();
            // Mark changes so "+ New" → "Done"
            this._eventCircleHasChanges = true;
            // Redraw to reflect mode change instantly
            this.drawSpiral();
            event.preventDefault();
            return;
          }
        }
        // If in detail mode and not on handles, don't start spiral drag
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
    
    // Check if clicking on time display area
    if (this.state.showTimeDisplay) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
      const timeDisplayArea = {
        x: 0,
        y: canvasHeight - CONFIG.TIME_DISPLAY_HEIGHT - pullUpOffset,
        width: canvasWidth,
        height: CONFIG.TIME_DISPLAY_HEIGHT
      };
      
      // If tilt-zoom area exists, allow press to enable orientation (and request permission) and long-press to activate
      if (this.canvasClickAreas && this.canvasClickAreas.tiltZoomArea) {
        const a = this.canvasClickAreas.tiltZoomArea;
        if (mouseX >= a.x && mouseX <= a.x + a.width && mouseY >= a.y && mouseY <= a.y + a.height) {
          // If orientation is not enabled yet, mark to enable after press completes to keep user gesture context
          if (!this.deviceOrientationState.enabled) {
            this._pendingEnableDeviceOrientation = true;
          }
          // Arm long-press (500ms) to start tilt-zoom; simple click should still reset time
          this.mouseState.clickingTiltZoomArea = true;
          if (this._tiltZoomPressTimerId) clearTimeout(this._tiltZoomPressTimerId);
          this._tiltZoomPressTimerId = setTimeout(() => {
            // Long press activated - only start tilt zoom if orientation is already enabled
            if (this.deviceOrientationState.enabled && this.deviceOrientationState.permissionGranted) {
              this.startTiltZoomMode();
              this._suppressTimeDisplayClickOnce = true; // prevent time reset from the eventual click
            } else {
              // Clear the pending flag to prevent permission request on release
              this._pendingEnableDeviceOrientation = false;
            }
          }, 500);
          return;
        }
      }
      
      const isClickingTimeDisplay = mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
                                  mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height;
      
      if (isClickingTimeDisplay) {
        this.mouseState.clickingTimeDisplay = true;
        this.drawSpiral(); // Redraw to show click effect
        return; // Don't start dragging when clicking on time display
      }
    }
      
      // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
      const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
      
      this.mouseState.isDragging = true;
      this.mouseState.hasMovedDuringDrag = false; // Reset movement flag
      this.mouseState.dragStartAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
      this.mouseState.lastAngle = this.mouseState.dragStartAngle; // Initialize last angle
      this.mouseState.dragStartRotation = this.state.rotation;
      
      // Store current inertia velocity before stopping it (for momentum accumulation)
      this.mouseState.previousInertiaVelocity = this._inertiaVelocity || 0;
      // Stop any existing inertia when a new drag starts
      this.stopInertia();
      
      // Prevent text selection while dragging
      event.preventDefault();
    }

    /**
     * Handle mouse up events for drag rotation
     */
    handleMouseUp(event) {
      // Finalize event time handle dragging
      if (this.mouseState.isHandleDragging) {
        this.mouseState.isHandleDragging = false;
        this.mouseState.draggingHandle = null;
        this.handleDragState = null;
        // Restore circle mode if it was enabled before dragging
        if (this._originalCircleModeDuringHandleDrag) {
          this.state.circleMode = true;
          this._originalCircleModeDuringHandleDrag = false;
        }
        // Persist event changes
        if (typeof this.saveEventsToStorage === 'function') {
          this.saveEventsToStorage();
        }
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        this.canvas.style.cursor = 'default';
        this.drawSpiral();
        return;
      }
      // Finalize desktop time display drag/tap
      if (this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay) {
        // Update mouseLastY if event provides coordinates (in case mouseup happened outside canvas)
        if (event && event.clientY !== undefined) {
          const rect = this.canvas.getBoundingClientRect();
          const mouseY = event.clientY - rect.top;
          this.timeDisplayState.mouseLastY = mouseY;
        }
        const dy = this.timeDisplayState.mouseLastY - this.timeDisplayState.mouseStartY;
        const tiny = Math.abs(dy) < 6;
        if (tiny) {
          if (this.timeDisplayState.collapsed) {
            this.setTimeDisplayCollapsed(false);
          } else {
            // Enable Auto Time Align on tap if off
            const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
            if (!this.autoTimeAlignState.enabled) {
              if (autoTimeAlignCheckbox) autoTimeAlignCheckbox.checked = true;
              this.autoTimeAlignState.enabled = true;
              this.startAutoTimeAlign();
            }
            this.playFeedback(0.15, 10);
          }
          this.timeDisplayState.mouseActive = false;
          return;
        }
        const base = CONFIG.TIME_DISPLAY_HEIGHT;
        const minH = this.timeDisplayState.collapseHeight || 12;
        const threshold = this.timeDisplayState.eventListThreshold || 20;
        const currentOffset = this.timeDisplayState.pullUpOffset || 0;
        const h = this.getTimeDisplayHeight();
        
        if (h <= minH + (base - minH) / 2) {
          // Snap collapsed - reset offset
          this.timeDisplayState.collapsed = true;
          this.timeDisplayState.currentHeight = minH;
          this.timeDisplayState.targetHeight = minH;
          this.timeDisplayState.pullUpOffset = 0;
          this.hideBottomEventList();
        } else {
          // Time display is expanded
          this.timeDisplayState.collapsed = false;
          this.timeDisplayState.currentHeight = base;
          this.timeDisplayState.targetHeight = base;
          // Snap pull-up offset: use midpoint of max offset (similar to touch handler)
          const canvasHeight = this.canvas.clientHeight;
          const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
          const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
          const timeDisplayBottom = canvasHeight - currentOffset;
          const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
          const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
          const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
          const maxOffset = contentHeight > 0 ? Math.min(contentHeight, maxAllowedHeight) : maxAllowedHeight;
          const offsetMid = maxOffset / 2;
          if (currentOffset < offsetMid) {
            // Snapped back to default - hide event list and reset offset
            this.timeDisplayState.pullUpOffset = 0;
            this.hideBottomEventList();
          } else {
            // Snapped to extended event list position
            this.timeDisplayState.pullUpOffset = maxOffset;
            this.showBottomEventList(maxOffset);
          }
        }
        this.timeDisplayState.mouseActive = false;
        // Set flag to prevent segment selection after time display drag
        this.timeDisplayState.justFinishedDrag = true;
        // Clear the flag after a short delay to allow normal interaction
        setTimeout(() => {
          if (this.timeDisplayState) {
            this.timeDisplayState.justFinishedDrag = false;
          }
        }, 100);
        this.drawSpiral();
        return;
      }
      // Handle long-press timer and stop tilt zoom if it was active
      if (this.mouseState.clickingTiltZoomArea) {
        if (this._tiltZoomPressTimerId) {
          clearTimeout(this._tiltZoomPressTimerId);
          this._tiltZoomPressTimerId = null;
        }
        // If currently active, stop on release
        if (this.deviceOrientationState.tiltZoomActive) {
          this.stopTiltZoomMode();
        }
        this.mouseState.clickingTiltZoomArea = false;
      }
      // If we marked to enable device orientation from button press, do it now (still in user gesture)
      if (this._pendingEnableDeviceOrientation) {
        this._pendingEnableDeviceOrientation = false;
        // Call the gesture-safe enabler to ensure iOS prompt appears
        this.enableDeviceOrientationViaGesture();
      }
      if (this.mouseState.isDragging && this.mouseState.hasMovedDuringDrag) {
        this.mouseState.wasDragging = true;
      }
      this.mouseState.isDragging = false;
      this.mouseState.hasMovedDuringDrag = false;
      // On release, compute averaged velocity and start inertia
      if (this._velSamples && this._velSamples.length) {
        const now = performance.now();
        // Only start inertia if we've moved recently (within last 300ms)
        const recentCutoff = now - 300;
        const recentSamples = this._velSamples.filter(s => s.t >= recentCutoff);
        
        if (recentSamples.length > 0) {
          // Weighted average (more weight to latest samples)
          let wsum = 0, vsum = 0;
          for (const s of recentSamples) {
            const w = 1 + Math.max(0, (s.t - recentCutoff) / 300); // 1..2
            wsum += w; vsum += s.v * w;
          }
          let avgV = vsum / (wsum || 1);
          
          // Add momentum from previous inertia (if any)
          if (this.mouseState.previousInertiaVelocity) {
            // Add previous velocity with some decay based on how much time passed since drag started
            const dragDuration = Math.min(now - (recentSamples[0]?.t || now), 1000); // Cap at 1 second
            const momentumDecay = Math.exp(-dragDuration / 500); // Decay over 0.5 seconds
            const momentumContribution = this.mouseState.previousInertiaVelocity * momentumDecay;
            
            // Add momentum in the same direction, or allow cancellation if dragging opposite
            avgV += momentumContribution;
          }
          
          // Clear stored previous velocity
          this.mouseState.previousInertiaVelocity = 0;
          
          // If very slow, just snap to boundary instead of inertia
          if (Math.abs(avgV) < 0.15) {
            this.snapIfClose();
            this.drawSpiral();
          } else {
            this.startInertia(avgV);
          }
        }
        // Clear samples regardless
        this._velSamples = [];
        this._lastMoveTs = undefined;
      }
    
    // Reset time display clicking state
    if (this.mouseState.clickingTimeDisplay) {
      this.mouseState.clickingTimeDisplay = false;
      this.drawSpiral(); // Redraw to remove click effect
    }
    }

    /**
     * Find which segment contains the given point
     */
    findSegmentAtPoint(canvasX, canvasY) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      
      // Convert to spiral coordinate system (reverse all the canvas transforms)
    // Account for the shifted center when time display is enabled
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
    let x = canvasX / devicePixelRatio - centerX;
    let y = canvasY / devicePixelRatio - centerY;

      if (this.state.staticMode) {
        // Apply 180° rotation: (x, y) -> (-x, -y)
        x = -x;
        y = -y;
      } else {
        // Reverse the rotation transformation
        const cosR = Math.cos(this.state.rotation);
        const sinR = Math.sin(this.state.rotation);
        const newX = x * cosR - y * sinR;
        const newY = x * sinR + y * cosR;
        x = newX;
        y = newY;
      }
      
      // Convert to polar coordinates (negate angle to match spiral direction)
      const radius = Math.sqrt(x * x + y * y);
      let angle = -(Math.atan2(y, x) - CONFIG.INITIAL_ROTATION_OFFSET);
      
      // Normalize angle to positive range
      while (angle < 0) angle += 2 * Math.PI;
      
      if (this.state.circleMode) {
        // Circle mode detection - use same logic as drawing
        const { maxRadius, thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
        const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
        
        const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
        const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
        
        // Find which day ring the point is in
        for (let day = startDay; day < endDay; day++) {
          // For each ring, use spiral's segment radii for the corresponding day
          const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
          const innerRadius = radiusFunction(day * 2 * Math.PI);
          
          if (radius >= innerRadius && radius <= outerRadius) {
            // Point is in this day ring, now find the segment
            for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
              const dayStartAngle = day * 2 * Math.PI;
              const segmentStartAngle = dayStartAngle + segment * segmentAngle;
              const segmentEndAngle = segmentStartAngle + segmentAngle;
              
              const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
              const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
              
              if (segmentEnd <= segmentStart) continue;
              
              // Check if angle is within this segment
              let checkAngle = angle;
              while (checkAngle < segmentStart) checkAngle += 2 * Math.PI;
              while (checkAngle > segmentStart + 2 * Math.PI) checkAngle -= 2 * Math.PI;
              
              if (checkAngle >= segmentStart && checkAngle <= segmentEnd) {
                return {
                  day: day,
                  segment: segment,
                  angle: checkAngle,
                  radius: radius
                };
              }
            }
            break; // Found the day ring, no need to check others
          }
        }
      } else {
        // Spiral mode detection
        const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
        const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
        
        const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
        const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
        
        for (let day = startDay; day < endDay; day++) {
          for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
            const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
            const rawEndAngle = rawStartAngle + segmentAngle;
            
            const startTheta = Math.max(rawStartAngle, visibilityRange.min);
            const endTheta = Math.min(rawEndAngle, visibilityRange.max);
            
            if (endTheta <= startTheta) continue;
            
            // Check if the point is within this segment
            // No need to adjust angle since we already reversed rotation in coordinates
            let checkAngle = angle;
            
            // More robust angle checking - check if point is within segment bounds
            const segmentSpan = endTheta - startTheta;
            let normalizedAngle = checkAngle;
            
            // Normalize to the segment's range
            while (normalizedAngle < startTheta) normalizedAngle += 2 * Math.PI;
            while (normalizedAngle > startTheta + 2 * Math.PI) normalizedAngle -= 2 * Math.PI;
            
            // Check if within the angular range of this segment
            if (normalizedAngle >= startTheta && normalizedAngle <= endTheta) {
              // Check radius bounds more carefully
              const minCheckRadius = Math.max(0, radiusFunction(startTheta));
              const maxCheckRadius = radiusFunction(endTheta + 2 * Math.PI);
              
              if (radius >= minCheckRadius && radius <= maxCheckRadius) {
                return {
                  day: day,
                  segment: segment,
                  angle: normalizedAngle,
                  radius: radius
                };
              }
            }
          }
        }
      }
      
      return null;
    }



    /**
     * Create radius function for the spiral growth
     * Maintains constant spiral size during rotation
     */
    createRadiusFunction(maxRadius, thetaMax, exponent, rotation) {
      return (theta) => {
        // Adjust theta to maintain constant spiral size during rotation
        const adjustedTheta = theta + rotation;
        const normalizedTheta = adjustedTheta / thetaMax;
        const t = Math.max(0, Math.min(1, normalizedTheta));
        
        if (this.state.circleMode) {
          // Circle mode: Create discrete rings that jump at the beginning of each day (0:00)
          // Each day gets its own ring, so we floor to the current day
          const daysInTheta = adjustedTheta / (2 * Math.PI);
          const flooredDays = Math.ceil(daysInTheta);
          const discreteT = Math.max(0, Math.min(1, flooredDays / this.state.days));
          
          return maxRadius * Math.pow(discreteT, exponent);
        } else {
          // Spiral mode: Keep the gradual growth
        return maxRadius * Math.pow(t, exponent);
        }
      };
    }

    /**
     * Calculate visibility range for segments - snail shell approach
     */
    calculateVisibilityRange(rotation, thetaMax) {
      // Make the spiral end at the bottom like a snail shell
      const extendedRange = thetaMax - 2 * Math.PI; // subtracted 360°
      const rangeStart = -rotation;
      const rangeEnd = rangeStart + extendedRange;
      
      // Key insight: to keep the center filled as we rotate, we need to ensure that
      // segments with theta values that map to small radii are always available
      // We extend the range backwards to include segments that will have small adjustedTheta values
      const actualMin = rangeStart - 2 * Math.PI; // Always include one full rotation worth
      
      return {
        min: actualMin,
        max: rangeEnd
      };
    }

    // Calculate canvas transformations - compensate for snail shell cut-off
    calculateTransforms(canvasWidth, canvasHeight) {
      // Add one extra day to compensate for the 360° cut-off in the visibility range
      // This ensures that when user selects 7 days, they actually see 7 days worth of content
      const thetaMax = (this.state.days) * 2 * Math.PI;
      let maxRadius = Math.min(canvasWidth, canvasHeight) * this.state.spiralScale;

      // Scale down spiral when time display is pulled up, but only if the spiral would exceed available space
      if (this.state.showTimeDisplay && this.timeDisplayState) {
        const pullUpOffset = this.timeDisplayState.pullUpOffset || 0;
        if (pullUpOffset > 0) {
          // Calculate available space above the time display
          // Center Y accounts for time display height and pull-up offset
          const effectiveTD = this.getTimeDisplayHeight();
          const totalBottomOffset = effectiveTD + pullUpOffset;
          const centerY = canvasHeight / 2 - totalBottomOffset / 2;
          // Add a small margin from the top (e.g., 5% of canvas height)
          const topMargin = canvasHeight * 0.05;
          const availableSpace = centerY - topMargin;
          
          // Only scale if the spiral radius would exceed the available space
          if (maxRadius > availableSpace && availableSpace > 0) {
            // Scale down to fit in available space, with a small safety margin
            const safetyMargin = 0.95; // Use 95% of available space to avoid touching edges
            const scaleFactor = (availableSpace * safetyMargin) / maxRadius;
            maxRadius *= Math.max(0.5, scaleFactor); // Don't scale below 50% to keep it usable
          }
        }
      }

      return { thetaMax, maxRadius };
    }

  calculateCenter(canvasWidth, canvasHeight) {
    // Calculate center coordinates, accounting for time display offset and pull-up offset
    const centerX = canvasWidth / 2;
    const effectiveTD = this.getTimeDisplayHeight();
    const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
    // Adjust center Y to account for time display and pull-up offset
    const totalBottomOffset = (this.state.showTimeDisplay ? effectiveTD : 0) + pullUpOffset;
    const centerY = canvasHeight / 2 - totalBottomOffset / 2;
    return { centerX, centerY };
    }



    /**
     * Draw a single spiral segment (wedge)
     */
  drawSegment(startTheta, endTheta, radiusFunction, color, isMidnightSegment = false, isAfterMidnightSegment = false, isHovered = false, drawLeadingEdge = false, isSelected = false, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, day = null, segment = null, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false) {
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      let angle = -startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      let radius = radiusFunction(startTheta);
      let x = radius * Math.cos(angle);
      let y = radius * Math.sin(angle);
      
    // Draw the full segment path for fill
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (endTheta - startTheta) / segmentAngle);
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
        const rawAngle = startTheta + t * (endTheta - startTheta);
        angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
        radius = radiusFunction(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      // Draw radial line outwards (one full turn)
      const outerEnd = endTheta + 2 * Math.PI;
      angle = -outerEnd + CONFIG.INITIAL_ROTATION_OFFSET;
      radius = radiusFunction(outerEnd);
      this.ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
      // Draw outer arc back to start edge
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
        const rawAngle = outerEnd - t * (endTheta - startTheta);
        angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
        radius = radiusFunction(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      if (drawLeadingEdge) {
        this.ctx.closePath();
      }
      // Fill the segment (works for both open and closed paths)
      this.ctx.fillStyle = color;
      this.ctx.fill();
      


    // Draw straight edge lines (radial lines)
    // Always draw for event sub-segments; for normal segments respect showSegmentEdges
    if (isEventSubSegment || (drawStroke && this.state.showSegmentEdges)) {
        this.ctx.beginPath();
        // Draw start radial line
        let angle = -startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        let innerRadius = radiusFunction(startTheta);
        let outerRadius = radiusFunction(startTheta + 2 * Math.PI);
        let x1 = innerRadius * Math.cos(angle);
        let y1 = innerRadius * Math.sin(angle);
        let x2 = outerRadius * Math.cos(angle);
        let y2 = outerRadius * Math.sin(angle);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        
        // Draw end radial line
        angle = -endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        innerRadius = radiusFunction(endTheta);
        outerRadius = radiusFunction(endTheta + 2 * Math.PI);
        x1 = innerRadius * Math.cos(angle);
        y1 = innerRadius * Math.sin(angle);
        x2 = outerRadius * Math.cos(angle);
        y2 = outerRadius * Math.sin(angle);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        
        this.ctx.strokeStyle = isEventSubSegment ? color : CONFIG.STROKE_COLOR;
        this.ctx.lineWidth = isEventSubSegment ? CONFIG.EVENT_EDGE_STROKE_WIDTH : CONFIG.STROKE_WIDTH/5;
        
        this.ctx.stroke();
      }

          // Store arc line data for drawing later (to avoid gaps with event-colored edge lines)
      if (drawStroke && this.state.showArcLines) {
        // Store inner arc data - skip for event sub-segments
        if (!isEventSubSegment) {
          this.arcLines.push({
            startTheta: startTheta,
            endTheta: endTheta,
            radiusFunction: radiusFunction,
            isInner: true
          });
        }
        
        // Store outer arc data - ensure it's drawn for all segments including outermost
        this.arcLines.push({
          startTheta: startTheta + 2 * Math.PI,
          endTheta: endTheta + 2 * Math.PI,
          radiusFunction: radiusFunction,
          isInner: false
        });
      }

    // Handle hover and selection effects
        if (isHovered) {
          this.highlightedSegments.push({
            startTheta: startTheta,
            endTheta: endTheta,
            radiusFunction: radiusFunction,
            isHovered: true,
            isSelected: false,
            drawLeadingEdge: drawLeadingEdge,
            segmentAngle: segmentAngle
          });
      }
      
      // Store midnight line info for drawing later (only when segment is fully visible)
      if (isMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && startTheta === rawStartAngle && endTheta === rawEndAngle) {
        // Midnight segment (23:00-0:00) - trailing edge
        this.midnightLines.push({
          endTheta: endTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: false
        });
      }
      
      if (isAfterMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && startTheta === rawStartAngle && endTheta === rawEndAngle) {
        // After midnight segment (0:00-1:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true
        });
      }

      // Store noon line info for drawing later (when segment is at least partially visible)
      if (isNoonSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // Noon segment (12:00-13:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isNoonLine: true
        });
      }

      // Store 6:00 AM line info for drawing later (when segment is at least partially visible)
      if (isSixAMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 6:00 AM segment (6:00-7:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isSixAMLine: true
        });
      }

      // Store 18:00 (6:00 PM) line info for drawing later (when segment is at least partially visible)
      if (isSixPMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 18:00 segment (18:00-19:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isSixPMLine: true
        });
      }

      // Store month line info for drawing later (when segment represents 1st day of month and is at least partially visible)
      if (isFirstDayOfMonth && rawStartAngle !== null && rawEndAngle !== null) {
        // For month boundaries, we want to draw the outer arc of all segments of the 1st day
        // Store the month line as long as the segment is at least partially visible
        this.monthLines.push({
          startTheta: startTheta,
          endTheta: endTheta,
          radiusFunction: radiusFunction
        });
      }

      // Store selected highlight for drawing later
      if (isSelected) {
        // Get event info for this segment
        const eventInfo = day !== null && segment !== null ? this.getEventColorForSegment(day, segment) : null;
        
        this.highlightedSegments.push({
          startTheta: startTheta,
          endTheta: endTheta,
          radiusFunction: radiusFunction,
          isHovered: false,
          isSelected: true,
          drawLeadingEdge: drawLeadingEdge,
          segmentAngle: segmentAngle,
          eventInfo: eventInfo,
          segmentColor: color,
          day: day,
          segment: segment
        });
      }
    }

    /**
     * Draw detail view - white circle with segment information
     */
  /**
   * Compute adaptive theta samples for a polar curve r(θ) so that the
   * straight-line approximation deviates less than tolPx in screen space.
   * Returns an ordered array of theta values including start and end.
   */
  adaptiveThetaSamples(startTheta, endTheta, radiusFunction, tolPx = 0.75, maxDepth = 10) {
      // Convert a theta to outer Cartesian point (use outer curve for curvature test)
      const thetaToOuterPoint = (th) => {
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
      };

      const samples = [startTheta];
      const stack = [{ th0: startTheta, th1: endTheta, depth: 0,
        p0: thetaToOuterPoint(startTheta), p1: thetaToOuterPoint(endTheta) }];

      // Distance from point P to segment AB
      const pointToSegDist = (px, py, ax, ay, bx, by) => {
        const abx = bx - ax, aby = by - ay;
        const apx = px - ax, apy = py - ay;
        const abLen2 = abx * abx + aby * aby;
        const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
        const qx = ax + t * abx, qy = ay + t * aby;
        const dx = px - qx, dy = py - qy;
        return Math.hypot(dx, dy);
      };

      while (stack.length) {
        const { th0, th1, depth, p0, p1 } = stack.pop();
        const thMid = 0.5 * (th0 + th1);
        const pm = thetaToOuterPoint(thMid);
        const err = pointToSegDist(pm.x, pm.y, p0.x, p0.y, p1.x, p1.y);
        if (err > tolPx && depth < maxDepth) {
          // Subdivide
          const pMid0 = thetaToOuterPoint(0.5 * (th0 + thMid)); // hint not used
          // Push second half then first half so that first half is processed first (stack LIFO)
          stack.push({ th0: thMid, th1, depth: depth + 1, p0: pm, p1 });
          stack.push({ th0, th1: thMid, depth: depth + 1, p0, p1: pm });
        } else {
          // Accept segment end
          samples.push(th1);
        }
      }
      // Ensure strict monotonic increase and dedupe
      samples.sort((a, b) => a - b);
      const dedup = [];
      for (let i = 0; i < samples.length; i++) {
        if (i === 0 || Math.abs(samples[i] - samples[i - 1]) > 1e-9) dedup.push(samples[i]);
      }
      return dedup;
  }

  /**
   * Draw a filled spiral band from startTheta..endTheta using adaptive sampling.
   * The band spans between radiusFunction(th) and radiusFunction(th + 2π).
   */
  drawSpiralBand(startTheta, endTheta, radiusFunction, fillStyle, minAvgThicknessPx = 0.6, tolPx = 0.75) {
      if (endTheta <= startTheta) return;
      // For semi-transparent overlays, use higher resolution (lower tolerance) to prevent gaps
      // Check if fillStyle is semi-transparent (contains rgba - overlays use rgba with alpha < 1)
      const isSemiTransparent = typeof fillStyle === 'string' && fillStyle.includes('rgba');
      const effectiveTolPx = isSemiTransparent ? Math.min(tolPx, 0.1) : tolPx; // Higher resolution for overlays
      const thetas = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, effectiveTolPx, 10);
      if (thetas.length < 2) return;
      // Average thickness check to avoid drawing near-zero-width slivers
      let avgThick = 0;
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        avgThick += (outer - inner);
      }
      avgThick /= thetas.length;
      if (avgThick < minAvgThicknessPx) return;

      // Build path
      this.ctx.save();
      this.ctx.beginPath();
      // Inner edge forward
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const r = radiusFunction(th);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = r * Math.cos(ang), y = r * Math.sin(ang);
        if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
      }
      // Connect to outer edge at the end
      {
        const th = thetas[thetas.length - 1];
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }
      // Outer edge backward
      for (let i = thetas.length - 2; i >= 0; i--) {
        const th = thetas[i];
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }
      // Close along the start radial
      {
        const th = thetas[0];
        const r = radiusFunction(th);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }
      this.ctx.closePath();
      this.ctx.fillStyle = fillStyle;
      this.ctx.fill();
      this.ctx.restore();
  }
    drawEventSpiralSubsegment(eventSegment) {
      const startTheta = eventSegment.timeStartTheta;
      const endTheta = eventSegment.timeEndTheta;
      const color = eventSegment.color;
      const eventSliceStart = eventSegment.eventSliceStart;
      const eventSliceEnd = eventSegment.eventSliceEnd;
      const radiusFunction = eventSegment.originalRadiusFunction;

      // Use adaptive sampling with tighter tolerance (same as overlays) for smooth arcs without gaps
      const thetas = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, 0.1, 10);
      // Skip degenerate slivers near center to avoid flicker
      const thicknessPxAt = (th) => {
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        return (outer - inner) * (eventSliceEnd - eventSliceStart);
      };
      // If average thickness is less than ~0.6px, skip drawing
      let avgThick = 0;
      for (let i = 0; i < thetas.length; i++) avgThick += thicknessPxAt(thetas[i]);
      avgThick /= Math.max(1, thetas.length);
      if (avgThick < 0.6) {
        return;
      }

      const samples = [];
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        const h = outer - inner;
        const rInner = inner + eventSliceStart * h;
        const rOuter = inner + eventSliceEnd * h;
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        samples.push({ th, ang, rInner, rOuter });
      }

      // Build path: inner curve forward, connect to outer end, outer curve backward, connect back
      this.ctx.beginPath();
      this.ctx.moveTo(samples[0].rInner * Math.cos(samples[0].ang), samples[0].rInner * Math.sin(samples[0].ang));
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        this.ctx.lineTo(s.rInner * Math.cos(s.ang), s.rInner * Math.sin(s.ang));
      }
      const last = samples[samples.length - 1];
      // connect via short radial edge at the end
      this.ctx.lineTo(last.rOuter * Math.cos(last.ang), last.rOuter * Math.sin(last.ang));
      for (let i = samples.length - 2; i >= 0; i--) {
        const s = samples[i];
        this.ctx.lineTo(s.rOuter * Math.cos(s.ang), s.rOuter * Math.sin(s.ang));
      }
      // close along start radial to ensure no gaps
      const first = samples[0];
      this.ctx.lineTo(first.rInner * Math.cos(first.ang), first.rInner * Math.sin(first.ang));
      this.ctx.closePath();

      // Fill with high resolution sampling (no stroke needed - same method as overlays)
      this.ctx.fillStyle = color;
      this.ctx.fill();
      // Stroke only the two short radial edges for visual clarity
      this.ctx.save();
      this.ctx.lineWidth = CONFIG.EVENT_EDGE_STROKE_WIDTH;
      this.ctx.strokeStyle = color;
      // end radial
      this.ctx.beginPath();
      this.ctx.moveTo(last.rInner * Math.cos(last.ang), last.rInner * Math.sin(last.ang));
      this.ctx.lineTo(last.rOuter * Math.cos(last.ang), last.rOuter * Math.sin(last.ang));
      this.ctx.stroke();
      // start radial
      this.ctx.beginPath();
      this.ctx.moveTo(first.rInner * Math.cos(first.ang), first.rInner * Math.sin(first.ang));
      this.ctx.lineTo(first.rOuter * Math.cos(first.ang), first.rOuter * Math.sin(first.ang));
      this.ctx.stroke();
      this.ctx.restore();
    }
    drawDetailView(maxRadius) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
    
    // Clear previous button info to prevent stale references
    this.deleteButtonInfo = null;
    this.addButtonInfo = null;
      
      // Draw white circle in center
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
      // Calculate the radius at the start of the visible segments
      // This ensures the circle covers the inner area and leaves outermost segments visible
      const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
      const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
      const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
      // Align circle with the selected segment
      let circleRadius;
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        if (this.state.circleMode) {
          // All segments of a day share the same radius in circle mode
          const day = segment.day;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(day * 2 * Math.PI);
        } else {
          // Spiral mode: use the segment's theta
          const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
          const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
          circleRadius = radiusFunction(segmentTheta);
        }
      } else {
        // fallback
        circleRadius = radiusFunction(visibilityRange.max);
      }
      
      this.ctx.save();
      
      // Draw the colored outer ring and white inner circle first (before content)
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        // Calculate segmentId (distance from outside) - needed for virtual event check
        const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
        const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
        
        // Check if there's an event for this segment
        const eventInfo = this.getEventColorForSegment(segment.day, segment.segment);
        
        // Determine if a virtual event is active for this segment
        const virtualEventActive = this.virtualEvent && this.virtualEvent.segmentId === segmentId;
        
        // Determine the color for the outer ring
        const outerRingColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);
        
        // Store the calculated color in the selected segment for use by stroke
        this.mouseState.selectedSegment.calculatedColor = outerRingColor;
        
        // Draw the colored outer circle (full size)
        this.ctx.fillStyle = outerRingColor;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Calculate inner circle radius (smaller than outer, narrower ring)
        const innerRadius = circleRadius * 0.90; // 90% of outer radius (narrower ring)
        
        // Draw the white inner circle
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Store the clickable area for the color ring
        let colorRingEvent = null;
        if (virtualEventActive) {
          colorRingEvent = this.virtualEvent;
        } else if (eventInfo) {
          // Get the selected event for this segment
          const allEventsForSegment = this.getAllEventsForSegment(segment.day, segment.segment);
          const selectedEventIndex = this.mouseState.selectedEventIndex;
          const eventIndex = selectedEventIndex < allEventsForSegment.length ? selectedEventIndex : 0;
          colorRingEvent = allEventsForSegment[eventIndex]?.event || null;
        }
        this.canvasClickAreas.colorRing = {
          centerX: centerX,
          centerY: centerY,
          outerRadius: circleRadius,
          innerRadius: innerRadius,
          event: colorRingEvent
        };
        
        // Update circleRadius for inner content positioning
        circleRadius = innerRadius;
      } else {
        // Fallback: draw a simple white circle if no segment is selected
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
      }
      
      // --- DYNAMICALLY UPDATE PERSISTENT INPUTS IF THEY EXIST ---
      const persistentStartInput = document.getElementById('persistentStartDateTime');
      const persistentEndInput = document.getElementById('persistentEndDateTime');
      const persistentColorPicker = document.getElementById('persistentColorPicker');
      if (persistentStartInput && persistentEndInput && persistentColorPicker && 
          !this.editingState.isEditingTitle && !this.editingState.isEditingDescription) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
        const baseFontSize = Math.max(1, circleRadius * 0.1);
        const inputWidth = circleRadius * 1.2;
        const inputHeight = baseFontSize * 1.2;
        const dateTimeY = centerY - circleRadius * 0.32;
        const startInputLeft = centerX - inputWidth / 2;
        const startInputTop = canvasRect.top + (dateTimeY - inputHeight * 0.8) + safeTop;
        const endInputTop = canvasRect.top + (dateTimeY + inputHeight * 0.6) + safeTop;
        const colorInputLeft = centerX - inputWidth / 2;
        const colorInputTop = endInputTop + inputHeight + 10;
        persistentStartInput.style.left = `${startInputLeft}px`;
        persistentStartInput.style.top = `${startInputTop}px`;
        persistentStartInput.style.width = `${inputWidth}px`;
        persistentStartInput.style.height = `${inputHeight}px`;
        persistentStartInput.style.fontSize = `${baseFontSize * 0.7}px`;
        persistentEndInput.style.left = `${startInputLeft}px`;
        persistentEndInput.style.top = `${endInputTop}px`;
        persistentEndInput.style.width = `${inputWidth}px`;
        persistentEndInput.style.height = `${inputHeight}px`;
        persistentEndInput.style.fontSize = `${baseFontSize * 0.7}px`;
        persistentColorPicker.style.left = `${colorInputLeft}px`;
        persistentColorPicker.style.top = `${colorInputTop}px`;
        persistentColorPicker.style.width = `${inputWidth}px`;
        persistentColorPicker.style.height = `${inputHeight}px`;
      }

      // Draw segment information
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        // Calculate segmentId (distance from outside)
        const totalVisibleSegments = (this.state.days -1) * CONFIG.SEGMENTS_PER_DAY;
        const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
        const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
        const segmentColor = this.cache.colors[colorIndex];
        
        // Check if there's an event for this segment
        const eventInfo = this.getEventColorForSegment(segment.day, segment.segment);
        
        // Determine stroke color
        let strokeColor;
        if (eventInfo) {
          strokeColor = eventInfo.color;
        } else if (segmentColor === CONFIG.BLANK_COLOR) {
          strokeColor = '#000'; // Black stroke for blank segments
        } else {
          strokeColor = segmentColor;
        }
        

        
        // Calculate info for display (reuse segmentId)
        const hoursAhead = segmentId;
        const segmentDate = new Date(this.referenceTime.getTime() + hoursAhead * 60 * 60 * 1000);
      const startHour = segmentDate.getUTCHours() + TIMEZONE_OFFSET;
        const endHour = (startHour + 1) % 24;
      // Format date using UTC to avoid DST issues
        const weekday = WEEKDAYS_UTC[segmentDate.getUTCDay()];
        const month = MONTHS_LONG_UTC[segmentDate.getUTCMonth()];
      const day = segmentDate.getUTCDate();
      const year = segmentDate.getUTCFullYear();
        
        // Draw text on top of the circle
        this.ctx.fillStyle = '#000';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Scale font sizes with circle size
        let titleFontSize = Math.max(1, circleRadius * 0.12);
        const baseFontSize = Math.max(1, circleRadius * 0.1);
        const smallFontSize = Math.max(1, circleRadius * 0.08);
        
        const smallLineHeight = smallFontSize;
        
        // Static, symmetric layout (no dynamic pushing):
        const edgePadding = baseFontSize * 0.8;
        const topY = centerY - circleRadius;
        const bottomY = centerY + circleRadius;
        // Title a bit lower than top edge
        let titleY = topY + edgePadding * 3 + titleFontSize / 2;
        // Date boxes exactly centered
        const dateTimeY = centerY;
        // Description midway between title and date boxes
        const descriptionY = (titleY + dateTimeY) / 2;
        // Buttons a bit higher than bottom edge
        const buttonY = bottomY - edgePadding * 3;
        
        // --- Unified event model for rendering ---
        const showVirtualEvent = this.virtualEvent && this.virtualEvent.segmentId === segmentId;
          const allEventsForSegment = this.getAllEventsForSegment(segment.day, segment.segment);
          const selectedEventIndex = this.mouseState.selectedEventIndex;
          const eventIndex = selectedEventIndex < allEventsForSegment.length ? selectedEventIndex : 0;
        const selectedEvent = allEventsForSegment[eventIndex]?.event || null;
        const isVirtual = !selectedEvent || showVirtualEvent;

        // Ensure virtual event exists if needed
        if (isVirtual && (!this.virtualEvent || this.virtualEvent.segmentId !== segmentId)) {
          const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
          const segmentHourStart = new Date(segmentDate);
          segmentHourStart.setUTCMinutes(0, 0, 0);
          const segmentHourEnd = new Date(segmentHourStart);
          segmentHourEnd.setUTCHours(segmentHourStart.getUTCHours() + 1);
          const randomColor = this.generateRandomColor('Home');
          this.virtualEvent = {
            title: '',
            description: '',
            start: new Date(segmentHourStart),
            end: new Date(segmentHourEnd),
            color: randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor),
            calendar: 'Home',
            isVirtual: true,
            segmentId: segmentId
          };
          this.drawSpiral();
        }

        const currentEvent = isVirtual ? this.virtualEvent : selectedEvent;

        // Event counter for real events with multiples
        if (!isVirtual && allEventsForSegment.length > 1) {
          const eventCounterText = `Event ${eventIndex + 1} of ${allEventsForSegment.length}`;
            this.ctx.fillStyle = '#666';
            this.ctx.font = getFontString(smallFontSize);
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const counterY = titleY - circleRadius * 0.15;
            this.ctx.fillText(eventCounterText, centerX, counterY);
          }
          
        // Draw title (fitted) and set click area
        const displayTitle = isVirtual ? (currentEvent.title || 'Click to add title...') : currentEvent.title;
        if (!this.hideTitleWhileEditing) {
          const color = isVirtual && !currentEvent.title ? '#999' : '#000';
          const { width: fittedWidth, height: fittedHeight } = this.drawTitleFitted(displayTitle, centerX, titleY, circleRadius, titleFontSize, color, true);
          this.titleClickArea = {
            x: centerX - fittedWidth / 2,
            y: titleY - fittedHeight / 2,
            width: fittedWidth,
            height: fittedHeight,
            event: currentEvent,
            centerY: titleY
          };
        }

        // Description height and static date/time Y (center)
            const maxWidth = circleRadius * 1.6;
        const actualTextHeight = this.calculateTextHeight(currentEvent.description, maxWidth, smallFontSize);
        const dynamicDateTimeY = dateTimeY;
        this.drawDateTimeAndColorBoxes(currentEvent, centerX, dateTimeY, baseFontSize, circleRadius, buttonY);

        // Description click area (static spacing between title and date boxes for empty)
          this.descClickArea = {
          ...this.buildDescriptionClickArea(centerX, descriptionY, circleRadius, baseFontSize, titleY, titleFontSize, dateTimeY, actualTextHeight, !!currentEvent.description),
          event: currentEvent,
          centerY: descriptionY
        };

        // Draw description or placeholder
          if (!this.hideDescriptionWhileEditing) {
              this.ctx.font = getFontString(smallFontSize);
          if (currentEvent.description) {
            this.ctx.fillStyle = '#000';
            const wrappedText = this.wrapText(currentEvent.description, maxWidth);
              let lineY = descriptionY - (wrappedText.length - 1) * smallLineHeight / 2;
              for (const line of wrappedText) {
                this.ctx.fillText(line, centerX, lineY);
                lineY += smallLineHeight;
              }
            } else {
              this.ctx.fillStyle = '#999';
              this.ctx.fillText('Click to add description...', centerX, descriptionY);
            }
          }
          
        // Click background for description
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.00)';
          this.ctx.fillRect(this.descClickArea.x, this.descClickArea.y, this.descClickArea.width, this.descClickArea.height);
          
        // Buttons: virtual => single "Add Event"; real => "+ New" and "Delete"
        if (isVirtual) {
          const buttonWidth = baseFontSize * 5.5;
          const buttonHeight = baseFontSize * 2.5;
          const buttonRadius = buttonHeight / 2;
          const buttonX = centerX - buttonWidth / 2;
          const deleteButtonY = buttonY - buttonHeight / 2;
          this.deleteButtonInfo = {
            x: buttonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: currentEvent,
            isAddButton: true
          };
          // Hover effect for single center button
          const isHoverButton = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: buttonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverButton ? '#43A047' : '#4CAF50';
          this.ctx.beginPath();
          this.ctx.roundRect(buttonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('Add Event', centerX, deleteButtonY + buttonHeight / 2);
        } else {
          const buttonWidth = baseFontSize * 4.5;
          const buttonHeight = baseFontSize * 2.2;
          const buttonRadius = buttonHeight / 2;
          const buttonSpacing = baseFontSize * 0.4;
          const totalButtonWidth = (buttonWidth * 2) + buttonSpacing;
          const buttonsStartX = centerX - totalButtonWidth / 2;
          const deleteButtonY = buttonY - buttonHeight / 2;
          const addButtonX = buttonsStartX;
          this.addButtonInfo = {
            x: addButtonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: currentEvent,
            isAddButton: true,
            isAddAnotherButton: true
          };
          // Hover effect for "+ New" or "Done" button
          const isHoverAdd = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: addButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          const buttonText = this._eventCircleHasChanges ? 'Done' : '+ New';
          //this.ctx.fillStyle = isHoverAdd ? '#43A047' : '#4CAF50';
          this.ctx.fillStyle = isHoverAdd ? '#666666' : '#888888';
          this.ctx.beginPath();
          this.ctx.roundRect(addButtonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(buttonText, addButtonX + buttonWidth / 2, deleteButtonY + buttonHeight / 2);
          const deleteButtonX = buttonsStartX + buttonWidth + buttonSpacing;
          this.deleteButtonInfo = {
            x: deleteButtonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: currentEvent
          };
          // Hover effect for delete button
          const isHoverDelete = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: deleteButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverDelete ? '#e53935' : '#ff4444';
          this.ctx.beginPath();
          this.ctx.roundRect(deleteButtonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('Delete', deleteButtonX + buttonWidth / 2, deleteButtonY + buttonHeight / 2);
        }
      }
      this.ctx.restore();
    }

    /**
     * Create an editable input field for the event title
     */
    createTitleEditor(event, clickX, clickY) {
      // Remove any existing title editor
      const existingEditor = document.getElementById('titleEditor');
      if (existingEditor) {
        existingEditor.remove();
      }
      // Calculate the exact position and size to match the original title
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
      // Get the same font size as used in drawDetailView
      let titleFontSize = this.titleClickArea ? this.titleClickArea.height : 16;
      
      // Get circle radius to use same positioning as display
      let circleRadius;
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        if (this.state.circleMode) {
          const day = segment.day;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(day * 2 * Math.PI);
        } else {
          const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
          const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(segmentTheta);
        }
      } else {
        const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
        const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        circleRadius = radiusFunction(visibilityRange.max);
      }
      
      // Apply the same dynamic font sizing logic as in drawDetailView
      let maxTitleWidth = circleRadius * 1.4;
      this.ctx.font = getFontString(titleFontSize, 'bold ');
      let titleMetrics = this.ctx.measureText(event.title);
      
      if (titleMetrics.width > maxTitleWidth) {
        const scaleFactor = maxTitleWidth / titleMetrics.width;
        titleFontSize = Math.max(1, Math.floor(titleFontSize * scaleFactor));
      }
      
      const titleY = centerY - circleRadius * 0.55;
      // Use the same font size and width as the title in the circle
      this.ctx.font = getFontString(titleFontSize, 'bold ');
      const textMetrics = this.ctx.measureText(event.title);
      const textWidth = textMetrics.width;
      const textHeight = titleFontSize;
      const titleX = centerX;
      // Calculate canvas offset and safe area inset
      const canvasRect = this.canvas.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      // Calculate input position to center it exactly where the text was
      const inputLeft = titleX - textWidth / 2;
      // Adjust for text baseline alignment - canvas fillText uses baseline, HTML input uses top edge
      const baselineAdjustment = titleFontSize * 0.8; // Approximate baseline offset
      const inputTop = canvasRect.top + (this.titleClickArea && this.titleClickArea.centerY !== undefined ? this.titleClickArea.centerY - textHeight / 2 : titleY - baselineAdjustment) + safeTop;
      
      // Apply iOS minimum font size only to the HTML input element
      let inputFontSize = titleFontSize;
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        inputFontSize = Math.max(inputFontSize, 16);
      }
      
      // Create input element
      const input = document.createElement('input');
      input.id = 'titleEditor';
      input.type = 'text';
      input.value = event.title;
      input.maxLength = document.getElementById('eventTitle').maxLength; // Use value from form input
      input.style.cssText = `
        position: absolute;
        left: ${inputLeft}px;
        top: ${inputTop}px;
        width: ${textWidth}px;
        height: ${textHeight}px;
        font-size: ${inputFontSize}px;
        font-weight: bold;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 0;
        background: ${document.body.classList.contains('dark-mode') ? 'var(--dark-bg-secondary)' : 'white'};
        color: ${document.body.classList.contains('dark-mode') ? 'var(--dark-text-primary)' : 'black'};
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;
      // iOS: Hide persistent inputs while editing to prevent jump
      function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      }
      let hiddenPersistent = false;
      input.addEventListener('focus', () => {
        if (isIOS()) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = 'none';
          if (persistentEndInput) persistentEndInput.style.display = 'none';
          if (persistentColorPicker) persistentColorPicker.style.display = 'none';
          hiddenPersistent = true;
        }
        this.editingState.isEditingTitle = true;
      });
      input.addEventListener('blur', () => {
        if (isIOS() && hiddenPersistent) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = '';
          if (persistentEndInput) persistentEndInput.style.display = '';
          if (persistentColorPicker) persistentColorPicker.style.display = '';
          hiddenPersistent = false;
          setTimeout(() => this.drawSpiral(), 100); // force redraw after keyboard closes
        }
        this.editingState.isEditingTitle = false;
      });

      // Add to page
      document.body.appendChild(input);
      input.focus();
      input.select();
      
      // Hide the original title text while editing
      this.hideTitleWhileEditing = true;
      this.drawSpiral();

      // Track maximum width to prevent shrinking
      let maxWidth = textWidth;
      
      // Function to resize input based on text content (only expand)
      const resizeInput = () => {
        this.ctx.font = getFontString(titleFontSize, 'bold ');
        const newTextMetrics = this.ctx.measureText(input.value || 'A'); // Use 'A' as minimum width
        const newTextWidth = Math.max(newTextMetrics.width, 20); // Minimum width of 20px
        
        // Only expand, never shrink
        if (newTextWidth > maxWidth) {
          maxWidth = newTextWidth;
        }
        
        // Update input width and position to keep it centered
        const newInputLeft = titleX - maxWidth / 2;
        input.style.width = `${maxWidth}px`;
        input.style.left = `${newInputLeft}px`;
      };

      // Handle save on Enter or blur
      const saveTitle = () => {
        const newTitle = input.value.trim() || 'Untitled Event';
        event.title = newTitle;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._eventCircleHasChanges = true;
        input.remove();
        this.hideTitleWhileEditing = false;
        this.drawSpiral();
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Add input event listener for real-time resizing
      input.addEventListener('input', resizeInput);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveTitle();
        } else if (e.key === 'Escape') {
          input.remove();
          this.hideTitleWhileEditing = false;
          this.drawSpiral();
        }
      });

      input.addEventListener('blur', saveTitle);
    }

    /**
     * Create persistent datetime inputs that are always visible
     */
    createPersistentDateTimeInputs(event, centerX, dateTimeY, baseFontSize, circleRadius) {
      // Create a unique ID for this event (using start time as identifier)
      const eventId = event.start.getTime() + '_' + event.title;
      
      // Check if inputs are already created for this event
      if (this.persistentInputsState.currentEventId === eventId && this.persistentInputsState.inputsCreated) {
        // Inputs already exist for this event, don't recreate them
        return;
      }
      
      // Remove any existing persistent datetime inputs and color picker
      const existingStartInput = document.getElementById('persistentStartDateTime');
      const existingEndInput = document.getElementById('persistentEndDateTime');
      const existingColorPicker = document.getElementById('persistentColorPicker');
      if (existingStartInput) existingStartInput.remove();
      if (existingEndInput) existingEndInput.remove();
      if (existingColorPicker) existingColorPicker.remove();
      
      // Update state tracking
      this.persistentInputsState.currentEventId = eventId;
      this.persistentInputsState.inputsCreated = true;
      this._eventCircleHasChanges = false; // Reset changes when opening event circle

      // Format datetime for input
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      // Create start time input
      const startInput = document.createElement('input');
      startInput.id = 'persistentStartDateTime';
      startInput.type = 'datetime-local';
      startInput.value = formatLocalDateTime(new Date(event.start));
      
      const inputWidth = circleRadius * 1.2; // Scale with circle size
      const inputHeight = baseFontSize * 1.2;
      const startInputLeft = centerX - inputWidth / 2;
      const startInputTop = dateTimeY - inputHeight * 0.8;
      
      startInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${startInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.7}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 2px;
        background: white;
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create end time input
      const endInput = document.createElement('input');
      endInput.id = 'persistentEndDateTime';
      endInput.type = 'datetime-local';
      endInput.value = formatLocalDateTime(new Date(event.end));
      
      const endInputTop = dateTimeY + inputHeight * 0.6;
      
      endInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${endInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.7}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 2px;
        background: white;
        z-index: 1001;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create color picker
      const colorInput = document.createElement('input');
      colorInput.id = 'persistentColorPicker';
      colorInput.type = 'color';
      colorInput.value = event.color;
      
      const colorInputLeft = centerX - inputWidth / 2;
      const colorInputTop = endInputTop + inputHeight + 10;
      
      colorInput.style.cssText = `
        position: absolute;
        left: ${colorInputLeft}px;
        top: ${colorInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        background: white;
        z-index: 1002;
        cursor: pointer;
        box-sizing: border-box;
      `;

      // Add to page
      document.body.appendChild(startInput);
      document.body.appendChild(endInput);
      document.body.appendChild(colorInput);

      // Handle changes
      const updateEvent = () => {
        if (startInput.value && endInput.value) {
                const newStart = parseDateTimeLocalAsUTC(startInput.value);
      const newEnd = parseDateTimeLocalAsUTC(endInput.value);
          
          // Prevent end date from being earlier than start date
          if (newEnd < newStart) {
            // Auto-adjust end time to be 1 hour after start time
            const adjustedEnd = new Date(newStart);
          adjustedEnd.setUTCHours(newStart.getUTCHours() + 1);
            endInput.value = formatLocalDateTime(adjustedEnd);
            event.start = newStart;
            event.end = adjustedEnd;
          } else {
            event.start = newStart;
            event.end = newEnd;
          }
          
          event.lastModified = Date.now();
          
          // Mark that changes have been made
          this._eventCircleHasChanges = true;
          
          this.drawSpiral(); // Redraw to update any event visualization
          // Save events to localStorage
          this.saveEventsToStorage();
          // Update event list to show new icon state (with delay to ensure properties are saved)
          setTimeout(() => renderEventList(), 0);

          // If current selection no longer includes this event, jump to event start
          this._ensureSelectedSegmentContainsEventOrJump(event);
        }
      };

      // Add event listeners
      startInput.addEventListener('change', updateEvent);
      endInput.addEventListener('change', updateEvent);
      colorInput.addEventListener('change', () => {
        event.color = colorInput.value;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._eventCircleHasChanges = true;
        this.drawSpiral(); // Redraw to update event visualization
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      });
      
      // Auto-populate end date when start date changes
      startInput.addEventListener('change', () => {
        if (startInput.value) {
        const startDate = parseDateTimeLocalAsUTC(startInput.value);
          const endDate = new Date(startDate);
        endDate.setUTCHours(startDate.getUTCHours() + 1); // Add 1 hour
          endInput.value = formatLocalDateTime(endDate);
          updateEvent(); // Update the event with new end time
        }
      });
    }
    /**
     * Create editable datetime inputs for start and end times
     */
    createDateTimeEditor(event, clickX, clickY) {
      // Remove any existing datetime editor
      const existingStartEditor = document.getElementById('startDateTimeEditor');
      const existingEndEditor = document.getElementById('endDateTimeEditor');
      if (existingStartEditor) existingStartEditor.remove();
      if (existingEndEditor) existingEndEditor.remove();

      // Calculate the exact position and size to match the original date/time
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
      
      // Get circle radius and font size (same as display calculation)
      let circleRadius;
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        if (this.state.circleMode) {
          const day = segment.day;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(day * 2 * Math.PI);
        } else {
          const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
          const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(segmentTheta);
        }
      } else {
        const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
        const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        circleRadius = radiusFunction(visibilityRange.max);
      }
      
      const baseFontSize = Math.max(1, circleRadius * 0.1);
      const dateTimeY = centerY - circleRadius * 0.15;
      
      // Create start time input
      const startInput = document.createElement('input');
      startInput.id = 'startDateTimeEditor';
      startInput.type = 'datetime-local';
      
      // Format current start time for input
      const startDate = new Date(event.start);
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      startInput.value = formatLocalDateTime(startDate);
      
      const inputWidth = 180;
      const inputHeight = baseFontSize * 1.5;
      const startInputLeft = centerX - inputWidth / 2;
      const startInputTop = dateTimeY - inputHeight;
      
      startInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${startInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.8}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 2px;
        background: white;
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create end time input
      const endInput = document.createElement('input');
      endInput.id = 'endDateTimeEditor';
      endInput.type = 'datetime-local';
      
      const endDate = new Date(event.end);
      endInput.value = formatLocalDateTime(endDate);
      
      const endInputTop = dateTimeY + inputHeight / 4;
      
      endInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${endInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.8}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 2px;
        background: white;
        z-index: 1001;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Add to page
      document.body.appendChild(startInput);
      document.body.appendChild(endInput);
      startInput.focus();
      
      // Hide the original date/time text while editing
      this.hideDateTimeWhileEditing = true;
      this.drawSpiral();

      // Handle save function
      const saveDateTimes = () => {
        if (startInput.value && endInput.value) {
        event.start = parseDateTimeLocalAsUTC(startInput.value);
        event.end = parseDateTimeLocalAsUTC(endInput.value);
        event.lastModified = Date.now();
        }
        startInput.remove();
        endInput.remove();
        this.hideDateTimeWhileEditing = false;
        this.drawSpiral();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Handle cancel function
      const cancelEditing = () => {
        startInput.remove();
        endInput.remove();
        this.hideDateTimeWhileEditing = false;
        this.drawSpiral();
      };

      // Add event listeners
      startInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          endInput.focus();
        } else if (e.key === 'Escape') {
          cancelEditing();
        }
      });

      endInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveDateTimes();
        } else if (e.key === 'Escape') {
          cancelEditing();
        }
      });

      startInput.addEventListener('blur', (e) => {
        // Only save if focus didn't move to the end input
        if (e.relatedTarget !== endInput) {
          setTimeout(() => {
            if (document.activeElement !== endInput) {
              saveDateTimes();
            }
          }, 100);
        }
      });

      endInput.addEventListener('blur', (e) => {
        // Only save if focus didn't move to the start input
        if (e.relatedTarget !== startInput) {
          setTimeout(() => {
            if (document.activeElement !== startInput) {
              saveDateTimes();
            }
          }, 100);
        }
      });
    }

    /**
     * Create an editable textarea for the event description
     */
    createDescriptionEditor(event, clickX, clickY) {
      // Remove any existing description editor
      const existingEditor = document.getElementById('descEditor');
      if (existingEditor) {
        existingEditor.remove();
      }
      // Calculate the exact position and size to match the original description area
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
      // Calculate the same font size as used in drawDetailView
      let circleRadius;
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        if (this.state.circleMode) {
          const day = segment.day;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(day * 2 * Math.PI);
        } else {
          const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
          const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
          const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
          circleRadius = radiusFunction(segmentTheta);
        }
      } else {
        const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
        const radiusFunction = this.createRadiusFunction(Math.min(canvasWidth, canvasHeight) * this.state.spiralScale, thetaMax, this.state.radiusExponent, this.state.rotation);
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        circleRadius = radiusFunction(visibilityRange.max);
      }
      let smallFontSize = Math.max(1, circleRadius * 0.08); // Same calculation as in drawDetailView
      // iOS Safari zooms in when font size is below 16px, so ensure minimum size
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        smallFontSize = Math.max(smallFontSize, 16);
      }
      // Calculate the area where description was drawn
      const descAreaWidth = this.descClickArea ? this.descClickArea.width : 115;
      const descAreaHeight = this.descClickArea ? this.descClickArea.height : 20;
      const descX = centerX;
      const descY = this.descClickArea ? this.descClickArea.y + descAreaHeight / 2 : centerY + smallFontSize * 1.2;
      // Calculate canvas offset and safe area inset
      const canvasRect = this.canvas.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      // Calculate input position to center it over the description area
      const inputLeft = descX - descAreaWidth / 2;
      // Adjust for text baseline alignment - canvas fillText uses baseline, HTML textarea uses top edge
      const baselineAdjustment = smallFontSize * 0.8; // Approximate baseline offset
      const inputTop = canvasRect.top + (this.descClickArea && this.descClickArea.centerY !== undefined ? this.descClickArea.centerY - descAreaHeight / 2 : descY - baselineAdjustment) + safeTop;
      // Create textarea element
      const textarea = document.createElement('textarea');
      textarea.id = 'descEditor';
      textarea.value = event.description || '';
      textarea.maxLength = document.getElementById('eventDescription').maxLength; // Use value from form input
      textarea.placeholder = 'Enter description...';
      // Calculate the same line height as the display text
      const smallLineHeight = smallFontSize;
      textarea.style.cssText = `
        position: absolute;
        left: ${inputLeft}px;
        top: ${inputTop}px;
        width: ${descAreaWidth}px;
        height: ${descAreaHeight}px;
        font-size: ${smallFontSize}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 6px;
        background: ${document.body.classList.contains('dark-mode') ? 'var(--dark-bg-secondary)' : 'white'};
        color: ${document.body.classList.contains('dark-mode') ? 'var(--dark-text-primary)' : 'black'};
        z-index: 1000;
        font-family: inter, sans-serif;
        resize: none;
        box-sizing: border-box;
        line-height: ${smallLineHeight}px;
        text-align: center;
        overflow: hidden;
      `;
      // iOS: Hide persistent inputs while editing to prevent jump
      function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      }
      let hiddenPersistent = false;
      textarea.addEventListener('focus', () => {
        if (isIOS()) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = 'none';
          if (persistentEndInput) persistentEndInput.style.display = 'none';
          if (persistentColorPicker) persistentColorPicker.style.display = 'none';
          hiddenPersistent = true;
        }
        this.editingState.isEditingDescription = true;
      });
      textarea.addEventListener('blur', () => {
        if (isIOS() && hiddenPersistent) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = '';
          if (persistentEndInput) persistentEndInput.style.display = '';
          if (persistentColorPicker) persistentColorPicker.style.display = '';
          hiddenPersistent = false;
          setTimeout(() => this.drawSpiral(), 100); // force redraw after keyboard closes
        }
        this.editingState.isEditingDescription = false;
      });

      // Add to page
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      // Hide the original description text while editing
      this.hideDescriptionWhileEditing = true;
      this.drawSpiral();

      // Function to auto-resize textarea based on content and keep it centered
      const resizeTextarea = () => {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = descAreaHeight*5; // Limit maximum height
        const newHeight = Math.min(scrollHeight, maxHeight);
        
        // Calculate how much the height changed
        const heightDifference = newHeight - descAreaHeight;
        
        // Move the textarea up by half the height difference to keep it centered
        const newTop = inputTop - heightDifference / 2;
        
        textarea.style.height = `${newHeight}px`;
        textarea.style.top = `${newTop}px`;
      };

      // Handle save on Enter (with Ctrl) or blur
      const saveDescription = () => {
        const newDescription = textarea.value.trim();
        event.description = newDescription;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._eventCircleHasChanges = true;
        textarea.remove();
        this.hideDescriptionWhileEditing = false;
        this.drawSpiral();
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Add input event listener for auto-resizing
      textarea.addEventListener('input', resizeTextarea);

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          saveDescription();
        } else if (e.key === 'Escape') {
          textarea.remove();
          this.hideDescriptionWhileEditing = false;
          this.drawSpiral();
        }
      });

      textarea.addEventListener('blur', saveDescription);
      
      // Initial resize
      resizeTextarea();
    }

    /**
     * Main drawing function - now much cleaner and focused
     */
    drawSpiral() {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      
      // Clear and prepare canvas
      this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

              // Rotation milestone feedback (every full 360° / 2π radians)
        {
          const turns = this.state.rotation / (2 * Math.PI); //360°
          const quarter_turns = this.state.rotation / (Math.PI / 2); // 90°
          const segments = this.state.rotation / (Math.PI / 12); // 15
          if (this._lastRotationTurns === undefined) {
            this._lastRotationTurns = turns;
            this._lastRotationQuarterTurns = quarter_turns;
            this._lastRotationSegments = segments;
          } else {
            let crossings = 0;
            if (turns > this._lastRotationTurns) {
              crossings = Math.floor(turns) - Math.floor(this._lastRotationTurns);
            } else if (turns < this._lastRotationTurns) {
              crossings = Math.abs(Math.ceil(turns) - Math.ceil(this._lastRotationTurns));
            }
            
            // Check for 90° quarter turn crossings
            let quarterTurnCrossings = 0;
            if (quarter_turns > this._lastRotationQuarterTurns) {
              quarterTurnCrossings = Math.floor(quarter_turns) - Math.floor(this._lastRotationQuarterTurns);
            } else if (quarter_turns < this._lastRotationQuarterTurns) {
              quarterTurnCrossings = Math.abs(Math.ceil(quarter_turns) - Math.ceil(this._lastRotationQuarterTurns));
            }
            
            // Check for 15° segment crossings (hour boundaries)
            let segmentCrossings = 0;
            if (segments > this._lastRotationSegments) {
              segmentCrossings = Math.floor(segments) - Math.floor(this._lastRotationSegments);
            } else if (segments < this._lastRotationSegments) {
              segmentCrossings = Math.abs(Math.ceil(segments) - Math.ceil(this._lastRotationSegments));
            }
            
            if (crossings > 0) {
              for (let i = 0; i < crossings; i++) {
                this.playFeedback(0.15, 30);
              }
            }
            
            // Trigger feedback for quarter turn crossings (medium) - but only if not at a 360° boundary
            if (quarterTurnCrossings > 0 && crossings === 0) {
              // Limit quarter turn feedback to prevent overwhelming during large rotations
              const maxQuarterTurnFeedback = Math.min(quarterTurnCrossings, 2);
              for (let i = 0; i < maxQuarterTurnFeedback; i++) {
                this.playFeedback(0.04, 20);
              }
            }
            
            // Trigger feedback for segment crossings (subtle) - but only if not at a 360° boundary
            if (segmentCrossings > 0 && crossings === 0) {
              // Limit subtle feedback to prevent overwhelming during large rotations
              const maxSubtleFeedback = Math.min(segmentCrossings, 3);
              for (let i = 0; i < maxSubtleFeedback; i++) {
                this.playFeedback(0.015, 15);
              }
            }
            
            this._lastRotationTurns = turns;
            this._lastRotationQuarterTurns = quarter_turns;
            this._lastRotationSegments = segments;
          }
        }
      
      // Clear arrays for this frame
      this.midnightLines = [];
      this.monthLines = [];
      this.monthNumbers = [];
        this.dayNumbers = [];
      this.hourNumbersInSegments = [];
      this.highlightedSegments = [];
      this.eventSegments = [];
      this.nightOverlays = [];
      this.dayOverlays = [];
      this.gradientOverlays = [];
      this.arcLines = [];
      
      // Clear delete button info if no event is being displayed
      if (this.state.detailMode === null) {
        this.deleteButtonInfo = null;
        this.addButtonInfo = null;
        this.titleClickArea = null;
        this.dateTimeClickArea = null;
        this.descClickArea = null;
        this.canvasClickAreas.startDateBox = null;
        this.canvasClickAreas.endDateBox = null;
        this.canvasClickAreas.calendarBox = null;
        this.canvasClickAreas.colorBox = null;
        this.canvasClickAreas.colorRing = null;
        
        // Remove persistent datetime inputs and color picker only when closing detail mode
        const persistentStartInput = document.getElementById('persistentStartDateTime');
        const persistentEndInput = document.getElementById('persistentEndDateTime');
        const persistentColorPicker = document.getElementById('persistentColorPicker');
        if (persistentStartInput) persistentStartInput.remove();
        if (persistentEndInput) persistentEndInput.remove();
        if (persistentColorPicker) persistentColorPicker.remove();
        
        // Reset persistent inputs state
        this.persistentInputsState.currentEventId = null;
        this.persistentInputsState.inputsCreated = false;
      }
      
      this.ctx.save();

      // Calculate transforms and set up coordinate system (without scaling)
      const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
    // Move spiral center up if time display is enabled
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
    this.ctx.translate(centerX, centerY);
      
      if (this.state.circleMode) {
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // 180° turn in static mode
        } else {
          this.ctx.rotate(-this.state.rotation); // <-- add this!
        }
        this.drawCircleModeSegments(maxRadius);
      } else {
        // Spiral mode: apply rotation to canvas
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // 180° turn in static mode
        } else {
          this.ctx.rotate(-this.state.rotation);
        }
        
        // Set up drawing parameters for spiral mode
        const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
        const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      // Draw all segments within the visible range
      // Calculate which segments fall within the visible angular range
      const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
      const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
      
      let isFirstVisibleSegment = true;
      
      // First pass: collect all segments with their radii for hour number filtering
      const segmentsWithRadii = [];
      
      for (let day = startDay; day < endDay; day++) {
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          // Calculate segment angles
          const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;

          // Clamp to visible range for smooth disappearance
          const startTheta = Math.max(rawStartAngle, visibilityRange.min);
          const endTheta = Math.min(rawEndAngle, visibilityRange.max);
          
          if (endTheta <= startTheta) continue; // segment is fully hidden
          
          // Calculate radius for this segment
          const segmentCenterAngle = (startTheta + endTheta) / 2;
          const segmentRadius = radiusFunction(segmentCenterAngle + Math.PI);
          
          // Store segment info for hour number filtering
          segmentsWithRadii.push({
            day, segment, startTheta, endTheta, segmentRadius
          });
        }
      }
      
      // Sort by radius (descending) and take the top 24 for hour numbers
      segmentsWithRadii.sort((a, b) => b.segmentRadius - a.segmentRadius);
      
      // Calculate visibility for each segment and create a priority list
      const segmentsWithVisibility = segmentsWithRadii.map(segment => {
        const rawStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
        const rawEndAngle = rawStartAngle + segmentAngle;
        const startTheta = Math.max(rawStartAngle, visibilityRange.min);
        const endTheta = Math.min(rawEndAngle, visibilityRange.max);
        
        const visibility = endTheta > startTheta ? (endTheta - startTheta) / (rawEndAngle - rawStartAngle) : 0;
        
        return {
          ...segment,
          visibility,
          segmentKey: `${segment.day}-${segment.segment}`
        };
      });
      
      // Sort by radius first, then by visibility (descending)
      segmentsWithVisibility.sort((a, b) => {
        if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
          return b.segmentRadius - a.segmentRadius; // Sort by radius first
        }
        return b.visibility - a.visibility; // Then by visibility
      });
      
      // Take segments based on position-adjusted threshold, up to 24 total
      const segmentsToShowNumbers = [];
      for (const segment of segmentsWithVisibility) {
        if (segmentsToShowNumbers.length >= 24) break;
        
        let shouldShow = false;
        if (this.state.hourNumbersPosition === 2 || this.state.hourNumbersPosition === 0) {
          // +0.5 position: Different thresholds based on positioning
          if (this.state.hourNumbersInsideSegment) {
            // Inside segment center: 66% threshold (two thirds)
            shouldShow = segment.visibility >= 0.66;
          } else {
            // Outside segment: 33% threshold (one third)
            shouldShow = segment.visibility >= 0.33;
          }
        } else if (this.state.hourNumbersPosition === 1) {
          if (this.state.hourNumbersInsideSegment) {
            // Inside segment center: 17% threshold (two thirds minus 0.5)
            shouldShow = segment.visibility >= 0.17;
          } else {
            // Outside segment: 83% threshold with shifted visibility range
            const rawStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
            const rawEndAngle = rawStartAngle + segmentAngle;
            
            // Shift visibility range by half a segment for middle position
            const shiftedVisibilityRange = {
              min: visibilityRange.min - (segmentAngle * 0.5),
              max: visibilityRange.max - (segmentAngle * 0.5)
            };
            
            const startTheta = Math.max(rawStartAngle, shiftedVisibilityRange.min);
            const endTheta = Math.min(rawEndAngle, shiftedVisibilityRange.max);
            const shiftedVisibility = endTheta > startTheta ? (endTheta - startTheta) / (rawEndAngle - rawStartAngle) : 0;
            
            shouldShow = shiftedVisibility >= 0.17;
          }
        }
 
        if (shouldShow) {
          segmentsToShowNumbers.push(segment);
        }
      }
      
      // If we don't have 24 segments at threshold, fill with the most visible remaining segments
      if (segmentsToShowNumbers.length < 24) {
        for (const segment of segmentsWithVisibility) {
          if (segmentsToShowNumbers.length >= 24) break;
          if (!segmentsToShowNumbers.some(s => s.segmentKey === segment.segmentKey) && segment.visibility > 0) {
            segmentsToShowNumbers.push(segment);
          }
        }
      }
      
      const segmentsToShowNumbersSet = new Set(segmentsToShowNumbers.map(s => s.segmentKey));
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          // Calculate segment angles
          const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;

          // Clamp to visible range for smooth disappearance
          const startTheta = Math.max(rawStartAngle, visibilityRange.min);
          const endTheta = Math.min(rawEndAngle, visibilityRange.max);
          
          if (endTheta <= startTheta) continue; // segment is fully hidden

          // Get color for this segment (check events first, then fall back to random colors)
          const eventInfo = this.getEventColorForSegment(day, segment);
          let color;
          
          // Get base color
          const segmentIndex = day * CONFIG.SEGMENTS_PER_DAY + segment;
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
          color = this.cache.colors[colorIndex];

          // Check if this is a midnight segment (segment 23 of each day) or the segment after midnight (segment 0 of next day)
          const isMidnightSegment = segment === 23;
          const isAfterMidnightSegment = segment === 0;
          
          // Check if this is a noon segment (segment 12 of each day)
          const isNoonSegment = segment === 12;
          
          // Check if this is a 6:00 segment (segment 6 of each day)
          const isSixAMSegment = segment === 6;
          
          // Check if this is an 18:00 segment (segment 18 of each day)
          const isSixPMSegment = segment === 18;
          
          // Check if this is a month boundary segment
          const isFirstDayOfMonth = this.isFirstDayOfMonth(day, segment);
          
          // Check if this is the first hour of a month (for month numbers)
          const isFirstHourOfMonth = this.isFirstHourOfMonth(day, segment);
          
          // Check if this segment is currently hovered
          const isHovered = this.mouseState.hoveredSegment && 
                           this.mouseState.hoveredSegment.day === day && 
                           this.mouseState.hoveredSegment.segment === segment;
          // Check if this segment is currently selected
          const isSelected = this.mouseState.selectedSegment && 
                            this.mouseState.selectedSegment.day === day && 
                            this.mouseState.selectedSegment.segment === segment;
          // Draw the segment - only draw leading edge for the first visible segment
          this.drawSegment(startTheta, endTheta, radiusFunction, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isFirstVisibleSegment, isSelected, rawStartAngle, rawEndAngle, isFirstDayOfMonth, day, segment, true, false, isNoonSegment, isSixAMSegment, isSixPMSegment);
          
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle);
          }
        }
          
          // --- NIGHT OVERLAY LOGIC FOR SPIRAL MODE ---
          if (day !== null && segment !== null && this.state.showNightOverlay) {
            // Calculate the hour this segment represents relative to the reference time
            const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
            const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
            let segStart = segmentDate.getUTCHours() + segmentDate.getUTCMinutes() / 60;
            let segEnd = segStart + 1;
            
            // Calculate sunrise/sunset times for this segment's date
            const sunTimes = this.getSunTimesForDate(segmentDate);
            let nightStart = sunTimes.sunset;
            let nightEnd = sunTimes.sunrise;
            if (nightEnd <= nightStart) nightEnd += 24;
            
            let segStartNorm = segStart;
            let segEndNorm = segEnd;
            if (segEndNorm < nightStart) {
              segStartNorm += 24;
              segEndNorm += 24;
            }
            
            // Calculate overlap
            const overlapStart = Math.max(segStartNorm, nightStart);
            const overlapEnd = Math.min(segEndNorm, nightEnd);
            const nightMinutes = Math.max(0, overlapEnd - overlapStart);
            const segmentMinutes = segEnd - segStart;
            const nightFraction = nightMinutes / segmentMinutes;
            
            if (nightFraction > 0) {
              const overlayStartFrac = Math.max(0, (overlapStart - segStartNorm) / (segEnd - segStart));
              const overlayEndFrac = Math.min(1, (overlapEnd - segStartNorm) / (segEnd - segStart));
              
              if (overlayEndFrac > overlayStartFrac) {
                // Store night overlay data for drawing after events
                this.nightOverlays.push({
                  startTheta: startTheta,
                  endTheta: endTheta,
                  radiusFunction: radiusFunction,
                  overlayStartFrac: overlayStartFrac,
                  overlayEndFrac: overlayEndFrac,
                  rawStartAngle: rawStartAngle,
                  rawEndAngle: rawEndAngle,
                  segmentAngle: segmentAngle,
                  day: day,
                  segment: segment,
                  isCircleMode: false
                });
              }
            }
          }
          
          // --- DAY OVERLAY LOGIC FOR SPIRAL MODE ---
          if (day !== null && this.state.showDayOverlay) {
            // Calculate the date for this day to get the day of week
            const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
            const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
            const dayOfWeek = segmentDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            
            // Create gradient from Monday (white) to Sunday (black)
            let brightness;
            if (dayOfWeek === 0) {
              // Sunday - black (0)
              brightness = 0;
            } else if (dayOfWeek === 6) {
              // Saturday - much darker to separate weekend
              brightness = 50;
            } else {
              // Monday (1) to Friday (5) - progressively darker
              brightness = 255 - (dayOfWeek - 1) * 35;
            }
            
            // Use configurable opacity for day overlay
            const dayOverlayColor = `rgba(${brightness}, ${brightness}, ${brightness}, ${this.state.dayOverlayOpacity})`;
            
            // Store day overlay data for drawing after events
            this.dayOverlays.push({
              startTheta: startTheta,
              endTheta: endTheta,
              radiusFunction: radiusFunction,
              color: dayOverlayColor,
              day: day,
              segment: segment,
              isCircleMode: false
            });
          }
          
          // --- GRADIENT OVERLAY LOGIC FOR SPIRAL MODE ---
          if (this.state.showGradientOverlay) {
            // Calculate average radius of this segment to determine how far inward it is
            const startRadius = radiusFunction(startTheta);
            const endRadius = radiusFunction(endTheta);
            const avgRadius = (startRadius + endRadius) / 2;
            
            // Get max radius for normalization
            const { maxRadius } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
            
            // Normalize radius: 0 = outermost, 1 = innermost
            // Clamp to valid range in case of edge cases
            const normalizedRadius = Math.max(0, Math.min(1, 1 - (avgRadius / maxRadius)));
            
            // Calculate darkness: 0 (white/no darkening) at outer edge, increasing toward center
            // Use configurable maximum opacity
            const maxDarkness = this.state.gradientOverlayOpacity;
            const darkness = normalizedRadius * maxDarkness;
            
            const gradientOverlayColor = `rgba(0, 0, 0, ${darkness})`;
            
            // Store gradient overlay data for drawing after events
            this.gradientOverlays.push({
              startTheta: startTheta,
              endTheta: endTheta,
              radiusFunction: radiusFunction,
              color: gradientOverlayColor,
              day: day,
              segment: segment,
              isCircleMode: false
            });
          }
          
          // Store month number info if this is the first hour of a month
          if (isFirstHourOfMonth && rawStartAngle !== null && rawEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip month number if hiding outermost due to inside hour numbers
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForHourOverlap) {
            // Only collect on full segments if clipping is disabled
            if (this.state.textClippingEnabled || (startTheta === rawStartAngle && endTheta === rawEndAngle)) {
            const monthNumber = this.getMonthNumber(day, segment);
            const centerTheta = (startTheta + endTheta) / 2;
            const centerRadius = radiusFunction(centerTheta + Math.PI); // Middle of segment (between inner and outer)
            
            // Calculate font size based on segment dimensions
            const segmentAngleSize = endTheta - startTheta;
            const innerRadius = radiusFunction(centerTheta);
            const outerRadius = radiusFunction(centerTheta + 2 * Math.PI);
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            let fontSize = Math.max(0.1, Math.min(24, maxDimension));
            
            // Determine display text: replace January with year when enabled
            const showYearForThis = this.state.showYearNumbers && monthNumber === 1;
            const monthText = this.state.showMonthNames ? MONTHS_SHORT_UTC[monthNumber - 1] : monthNumber.toString();
            const displayText = showYearForThis ? this.getYearNumber(day, segment).toString() : monthText;
            
            // Make year numbers slightly smaller than month names (4 digits vs 3 letters)
            if (showYearForThis) {
              fontSize = Math.max(1, Math.floor(fontSize * 0.85));
            }
            
            this.monthNumbers.push({
              x: centerRadius * Math.cos(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              text: displayText,
              fontSize: fontSize,
              isCircleMode: false,
              // Add clipping information
              clipStartTheta: startTheta,
              clipEndTheta: endTheta,
              clipInnerRadius: radiusFunction(centerTheta),
              clipOuterRadius: radiusFunction(centerTheta + 2 * Math.PI),
              centerTheta: centerTheta,
              fullSegment: startTheta === rawStartAngle && endTheta === rawEndAngle
            });
            }
            }
          }
          
          // Store day number info if this is the first hour of a day
          const isFirstHourOfDay = this.isFirstHourOfDay(day, segment);
          if (isFirstHourOfDay && rawStartAngle !== null && rawEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip day number if overlapping with month or if hiding outermost due to inside hour numbers
            const skipForMonthOverlap = (isFirstDayOfMonth && this.state.showDayNumbers && this.state.showMonthNumbers);
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForMonthOverlap && !skipForHourOverlap) {
            // Only collect on full segments if clipping is disabled
            if (this.state.textClippingEnabled || (startTheta === rawStartAngle && endTheta === rawEndAngle)) {
            const dayNumber = this.getDayNumber(day, segment);
            const centerTheta = (startTheta + endTheta) / 2;
            const centerRadius = radiusFunction(centerTheta + Math.PI); // Middle of segment (between inner and outer)
            // Build weekday + day label (e.g., Mon 28)
            // Defaults in case of errors
            let includeMonth = false;
            let includeYear = false;
            try {
              const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
              const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
              const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
              const weekdayFull = WEEKDAYS_UTC[segmentDate.getUTCDay()];
              const weekdayShort = weekdayFull.slice(0, 3);
              const monthFull = MONTHS_LONG_UTC[segmentDate.getUTCMonth()];
              const monthShort = MONTHS_SHORT_UTC[segmentDate.getUTCMonth()];
              const year = segmentDate.getUTCFullYear();
              const parts = [];
              const useShortWeekday = !!this.state.dayLabelUseShortNames;
              const useShortMonth = !!this.state.dayLabelUseShortMonth;
              const useShortYear = !!this.state.dayLabelUseShortYear;
              const isFirstOfMonth = segmentDate.getUTCDate() === 1;
              const isFirstOfYear = isFirstOfMonth && segmentDate.getUTCMonth() === 0;
              if (this.state.dayLabelShowWeekday) {
                parts.push(useShortWeekday ? weekdayShort : weekdayFull);
              }
              includeMonth = this.state.dayLabelShowMonth && (!this.state.dayLabelMonthOnFirstOnly || isFirstOfMonth);
              if (includeMonth) {
                parts.push(useShortMonth ? monthShort : monthFull);
              }
              const dayText = this.state.dayLabelUseOrdinal ? this.dayToOrdinal(dayNumber) : String(dayNumber);
              parts.push(dayText);
              if (this.state.dayLabelShowWeekday && parts.length > 1) parts[0] = parts[0] + ',';
              var fullDayLabel = parts.join(' ');
              includeYear = this.state.dayLabelShowYear && (!this.state.dayLabelYearOnFirstOnly || isFirstOfYear);
              if (includeYear) {
                const yearText = useShortYear ? String(year).slice(2) : String(year);
                fullDayLabel += `, ${yearText}`;
              }
            } catch (_) {
              var fullDayLabel = dayNumber.toString();
            }
            
            // Calculate font size based on segment dimensions
            const segmentAngleSize = endTheta - startTheta;
            const innerRadius = radiusFunction(centerTheta);
            const outerRadius = radiusFunction(centerTheta + 2 * Math.PI);
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            const fontSize = Math.max(1, Math.min(24, maxDimension));
            
            this.dayNumbers.push({
              x: centerRadius * Math.cos(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              isCircleMode: false,
              radiusFunction: radiusFunction,
              // Add clipping information
              clipStartTheta: startTheta,
              clipEndTheta: endTheta,
              clipInnerRadius: radiusFunction(centerTheta),
              clipOuterRadius: radiusFunction(centerTheta + 2 * Math.PI),
              centerTheta: centerTheta,
              centerRadius: centerRadius,
              onlyNumeric: (!this.state.dayLabelShowWeekday && !includeMonth && !includeYear),
              fullSegment: startTheta === rawStartAngle && endTheta === rawEndAngle
            });
            }
            }
          }
          
        // Store event data for drawing after main segments
          const allEvents = this.getAllEventsForSegment(day, segment);
          if (allEvents.length > 0) {
            // Use cached layout for speed
            this.ensureLayoutCache();
            const { eventToLane } = this.layoutCache;
            // Compute lane assignment inside the hour for non-overlapping sharing within same lane
            const { lanes: hourLanes } = this.computeEventLanes(allEvents);

            // Build local overlap groups within the hour: only overlapping events share space
            const n = allEvents.length;
            const uf = createUnionFind(n);
            const overlapsInHour = (a, b) => !(a.endMinute <= b.startMinute || b.endMinute <= a.startMinute);
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                if (overlapsInHour(allEvents[i], allEvents[j])) uf.unite(i, j);
              }
            }
            const groups = new Map();
            for (let i = 0; i < n; i++) {
              const r = uf.find(i);
              if (!groups.has(r)) groups.set(r, []);
              groups.get(r).push(i);
            }

            if (this.state.overlayStackMode) {
              // Stacked overlap mode with gap filling by sub-splitting on change points
              for (const idxList of groups.values()) {
                // Stable order bottom->top by descending coverage within hour, then lane, then start time
                const ordered = idxList.map(i => {
                  const ev = allEvents[i];
                  const laneFromPersistent = eventToLane.get(ev.event);
                  const lane = (laneFromPersistent !== undefined) ? laneFromPersistent : (hourLanes[i] ?? 0);
                  return { idx: i, lane, startUtcMs: ev.startUtcMs || 0, startMin: ev.startMinute };
                }).sort((a, b) => {
                  if (a.lane !== b.lane) return a.lane - b.lane; // stable bottom->top by lane
                  if (a.startUtcMs !== b.startUtcMs) return a.startUtcMs - b.startUtcMs;
                  return a.startMin - b.startMin;
                });

                // Build change boundaries (in minutes within hour)
                const boundarySet = new Set([0, 60]);
                for (const i of idxList) {
                  const ev = allEvents[i];
                  boundarySet.add(Math.max(0, Math.min(60, ev.startMinute)));
                  boundarySet.add(Math.max(0, Math.min(60, ev.endMinute)));
                }
                const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

                for (let s = 0; s < boundaries.length - 1; s++) {
                  const aMin = boundaries[s];
                  const bMin = boundaries[s + 1];
                  if (bMin <= aMin) continue;
                  // Active events in this sub-interval
                  const active = ordered.filter(({ idx }) => {
                    const ev = allEvents[idx];
                    return ev.startMinute < bMin && ev.endMinute > aMin;
                  });
                  if (active.length === 0) continue;
                  const m = active.length;
                  for (let rank = 0; rank < m; rank++) {
                    const i = active[rank].idx;
                    const eventData = allEvents[i];
                    const subStart = aMin / 60;
                    const subEnd = bMin / 60;
                    const eventSliceStart = (rank === 0) ? 0 : (rank / m);
                    const eventSliceEnd = 1;
                    const segmentAngleSize = rawEndAngle - rawStartAngle;
                    let timeStartTheta = rawStartAngle + (1 - subEnd) * segmentAngleSize;
                    let timeEndTheta = rawStartAngle + (1 - subStart) * segmentAngleSize;
                    timeStartTheta = Math.max(timeStartTheta, startTheta);
                    timeEndTheta = Math.min(timeEndTheta, endTheta);
                    if (timeEndTheta > timeStartTheta) {
                      this.eventSegments.push({
                        timeStartTheta,
                        timeEndTheta,
                        eventSliceStart,
                        eventSliceEnd,
                        originalRadiusFunction: radiusFunction,
                        color: eventData.color,
                        event: eventData.event,
                        rawStartAngle,
                        rawEndAngle,
                        day,
                        segment
                      });
                    }
                  }
                }
              }
            } else {
              // Uniform-thickness within overlap groups mode (current)
              // Optionally make thickness uniform across the full duration of each event
              // by using the maximum overlap this specific event encounters across all its hours
              const getLaneCountForEvent = (evData) => {
                if (!CONFIG.UNIFORM_EVENT_THICKNESS) {
                  // Fallback to per-hour lane count
                  const { numLanes } = this.computeEventLanes(allEvents);
                  return Math.max(1, numLanes);
                }
                return this.getMaxOverlapForEventAcrossHours(evData.event);
              };

              // Precompute slice positions per event index based on group-local needs
              const eventSliceStartArr = new Array(n).fill(0);
              const eventSliceEndArr = new Array(n).fill(1);
              for (const idxList of groups.values()) {
                let groupRequiredCount = 1;
                for (const i of idxList) {
                  groupRequiredCount = Math.max(groupRequiredCount, getLaneCountForEvent(allEvents[i]));
                }
                const persistentLanes = idxList.map(i => {
                  const pl = eventToLane.get(allEvents[i].event);
                  return (pl !== undefined) ? pl : (hourLanes[i] ?? 0);
                });
                const uniqueSorted = Array.from(new Set(persistentLanes)).sort((a, b) => a - b);
                const laneToCompact = new Map(uniqueSorted.map((lane, i) => [lane, i]));
                const compactLaneCount = uniqueSorted.length;
                const groupLaneCount = Math.max(groupRequiredCount, compactLaneCount);
                for (let k = 0; k < idxList.length; k++) {
                  const i = idxList[k];
                  const compactLane = laneToCompact.get(persistentLanes[k]) || 0;
                  const sliceH = 1 / groupLaneCount;
                  eventSliceStartArr[i] = compactLane * sliceH;
                  eventSliceEndArr[i] = (compactLane + 1) * sliceH;
                }
              }

            for (let i = 0; i < allEvents.length; i++) {
              const eventData = allEvents[i];
              const minuteStart = eventData.startMinute / 60;
              const minuteEnd = eventData.endMinute / 60;
                const eventSliceStart = eventSliceStartArr[i];
                const eventSliceEnd = eventSliceEndArr[i];
            const segmentAngleSize = rawEndAngle - rawStartAngle;
            let timeStartTheta = rawStartAngle + (1 - minuteEnd) * segmentAngleSize;
            let timeEndTheta = rawStartAngle + (1 - minuteStart) * segmentAngleSize;
            timeStartTheta = Math.max(timeStartTheta, startTheta);
            timeEndTheta = Math.min(timeEndTheta, endTheta);
            if (timeEndTheta > timeStartTheta) {
              this.eventSegments.push({
                    timeStartTheta,
                    timeEndTheta,
                    eventSliceStart,
                    eventSliceEnd,
                originalRadiusFunction: radiusFunction,
                color: eventData.color,
                event: eventData.event,
                    rawStartAngle,
                    rawEndAngle,
                    day,
                    segment
                  });
                }
            }
            }
          }
          
          // After drawing the first visible segment, set flag to false
          if (isFirstVisibleSegment) {
            isFirstVisibleSegment = false;
          }
        }
      }
      }

      // Draw hour labels outside the spiral
      if (this.state.showHourNumbers) {
        this.drawHourLabels(maxRadius);
      }

      // Draw event segments after main segments
      this.drawEventSegments();
      // Draw handles for selected event (start/end indicators)
      this.drawSelectedEventHandles();

      // Draw hour numbers inside segments above events
      if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
        this.drawHourNumbersInSegments();
      }
      
      this.drawMonthNumbers();
      this.drawDayNumbers();
      
      // Draw month lines on top of all segments
      this.drawMonthLines();

      // Draw arc lines on top of everything
      this.drawArcLines();
      
      // Draw midnight lines on top of all segments
      this.drawMidnightLines();
      
      // Draw overlays on top of everything
      this.drawGradientOverlays();
      this.drawDayOverlays();
      this.drawNightOverlays();
      
      // Calculate color for selected segment before drawing highlighted segments
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        this.mouseState.selectedSegment.calculatedColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);
      }
      
      // Draw highlighted segments on top of everything
      this.drawHighlightedSegments();

      this.ctx.restore();
      
      // Draw tooltip on top of everything (not affected by transforms)
      this.drawTooltip();
      
      // Draw detail view if in detail mode (after all other drawing)
      if (this.state.detailMode !== null && !this.mouseState.isHandleDragging) {
        this.drawDetailView(maxRadius);
      }
    
    // Draw current time/date display if enabled
    if (this.state.showTimeDisplay) {
      this.drawTimeDisplay(canvasWidth, canvasHeight);
      }
    }

  /**
   * Generate a random color using the same algorithm as segment colors
   */
  generateRandomColor(calendarName = null) {
    const mode = this.state?.colorMode || 'random';
    if (mode === 'single') {
      return this.state.singleColor || '#4CAF50';
    }
    if (mode === 'calendar') {
      // Use calendar color if available, otherwise fallback to random
      if (calendarName && this.state.calendarColors && this.state.calendarColors[calendarName]) {
        return this.state.calendarColors[calendarName];
      }
      // Fallback to random if calendar color not found
      const hue = Math.random() * 360;
      return this.hslToHex(`hsl(${hue}, 70%, 60%)`);
    }
    if (mode === 'calendarMono') {
      // Use grayscale of calendar color if available
      if (calendarName && this.state.calendarColors && this.state.calendarColors[calendarName]) {
        return this.toGrayscaleHex(this.state.calendarColors[calendarName]);
      }
      // Fallback: grayscale of a pleasant random color
      const hue = Math.random() * 360;
      const hex = this.hslToHex(`hsl(${hue}, 70%, 60%)`);
      return this.toGrayscaleHex(hex);
    }
    if (mode === 'colorblind') {
      // Okabe–Ito colorblind-safe qualitative palette (excluding black)
      const palette = [
        '#E69F00', // orange
        '#56B4E9', // sky blue
        '#009E73', // bluish green
        '#F0E442', // yellow
        '#0072B2', // blue
        '#D55E00', // vermillion
        '#CC79A7'  // reddish purple
      ];
      return palette[Math.floor(Math.random() * palette.length)];
    }
    if (mode === 'monoHue') {
      const hue = this.state.baseHue || 200;
      const saturation = 60 + Math.random() * 30; // 60-90%
      const lightness = 60 + Math.random() * 15; // 60-75%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    if (mode === 'pastel') {
      const hue = Math.random() * 360;
      const saturation = 45 + Math.random() * 15; // 45-60%
      const lightness = 75 + Math.random() * 10; // 75-85%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    if (mode === 'vibrant') {
      const hue = Math.random() * 360;
      const saturation = 75 + Math.random() * 20; // 75-95%
      const lightness = 50 + Math.random() * 10; // 50-60%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    // default 'random'
    const hue = Math.random() * 360;
    const saturation = 60 + Math.random() * 30; // 60-90% saturation
    const lightness = 70 + Math.random() * 10; // 70-80% lightness
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // Convert a hex or hsl color to grayscale hex using luminance
  toGrayscaleHex(color) {
    try {
      let hex = color;
      if (!hex.startsWith('#')) {
        hex = this.hslToHex(hex);
      }
      const clean = hex.replace('#', '');
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      const y = Math.round((0.299 * r) + (0.587 * g) + (0.114 * b));
      const v = Math.max(0, Math.min(255, y));
      const h = v.toString(16).padStart(2, '0');
      return `#${h}${h}${h}`;
    } catch (_) {
      return '#888888';
    }
  }

  /**
   * Generate a color to store on a new event. In 'calendar' palette, avoid
   * storing the calendar color so switching palettes later reveals per-event colors.
   * Returns a hex string.
   */
  generateRandomColorForStorage(calendarName = null) {
    const mode = this.state?.colorMode || 'random';
    if (mode === 'calendar') {
      // Pleasant random color independent of calendar color
      const hue = Math.random() * 360;
      return this.hslToHex(`hsl(${hue}, 70%, 60%)`);
    }
    const generated = this.generateRandomColor(calendarName);
    return generated.startsWith('#') ? generated : this.hslToHex(generated);
  }

  /**
   * Compute the display color for an event based on current palette mode.
   * In 'calendar' mode, use the calendar's color when available; otherwise use the event's own color.
   */
  getDisplayColorForEvent(event) {
    try {
      if (this.state && (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono')) {
        const calName = event && ((event.calendar || 'Home').trim());
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        if (calColor) {
          return this.state.colorMode === 'calendarMono' ? this.toGrayscaleHex(calColor) : calColor;
        }
      }
      const c = event && event.color ? event.color : '#888888';
      return c.startsWith('#') ? c : this.hslToHex(c);
    } catch (_) {
      return '#888888';
    }
  }
  /**
   * Calculate the color for a selected segment (used by both stroke and detail view)
   */
  calculateSelectedSegmentColor(day, segment) {
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
    const segmentColor = this.cache.colors[colorIndex];
    
    const eventInfo = this.getEventColorForSegment(day, segment);
    const virtualEventActive = this.virtualEvent && this.virtualEvent.segmentId === segmentId;
    
    if (virtualEventActive) {
      return this.virtualEvent.color;
    } else if (eventInfo) {
      return eventInfo.color;
    } else if (segmentColor === CONFIG.BLANK_COLOR) {
      // Generate the same random color that would be used for a new event
      const hue = (segmentId * 137.5) % 360;
      const saturation = 60 + (segmentId % 3) * 15; // 60-90% saturation
      const lightness = 70 + (segmentId % 2) * 10; // 70-80% lightness
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    } else {
      return segmentColor;
      }
    }

    /**
     * Draw highlighted segments on top
     */
    drawHighlightedSegments() {
      const isMobile = isMobileDevice();
      for (const segment of this.highlightedSegments) {
        if (isMobile && segment.isHovered) continue; // suppress hover highlight on mobile
        if (segment.isHovered) {
          this.ctx.strokeStyle = CONFIG.getHoverSegmentColor();
          this.ctx.lineWidth = CONFIG.HOVER_BORDER_WIDTH;
        } else if (segment.isSelected) {
          // Use event color for selected segment stroke, or random color for blank segments
          let strokeColor;
          // Prioritize calculated color (includes virtual event color) over existing event color
          if (this.mouseState.selectedSegment && this.mouseState.selectedSegment.calculatedColor) {
            strokeColor = this.mouseState.selectedSegment.calculatedColor;
          } else if (segment.eventInfo && segment.eventInfo.color) {
            strokeColor = segment.eventInfo.color;
          } else if (segment.segmentColor === CONFIG.BLANK_COLOR) {
            // Default to yellow until detail view calculates the color
            strokeColor = CONFIG.SELECTED_SEGMENT_COLOR;
          } else {
            strokeColor = segment.segmentColor;
          }
          this.ctx.strokeStyle = strokeColor;
          this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
        }
        
        if (segment.isCircleMode) {
          // Circle mode highlight
          this.ctx.beginPath();
          
          // Draw the ring segment path
          // Outer arc
          this.ctx.arc(0, 0, segment.outerRadius, segment.startAngle, segment.endAngle, true);
          // Radial line to inner radius
          this.ctx.lineTo(segment.innerRadius * Math.cos(segment.endAngle), segment.innerRadius * Math.sin(segment.endAngle));
          // Inner arc (counter-clockwise)
          this.ctx.arc(0, 0, segment.innerRadius, segment.endAngle, segment.startAngle, false);
          // Radial line back to start
          this.ctx.lineTo(segment.outerRadius * Math.cos(segment.startAngle), segment.outerRadius * Math.sin(segment.startAngle));
          
          this.ctx.closePath();
          this.ctx.stroke();
        } else {
          // Spiral mode highlight
          // Redraw the segment path for highlighting
          let angle = -segment.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = segment.radiusFunction(segment.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          
          this.ctx.beginPath();
          this.ctx.moveTo(x, y);

          // Draw inner arc from start to end
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (segment.endTheta - segment.startTheta) / segment.segmentAngle);
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
            const rawAngle = segment.startTheta + t * (segment.endTheta - segment.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = segment.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }

          // Draw radial line outwards (one full turn)
          const outerEnd = segment.endTheta + 2 * Math.PI;
          angle = -outerEnd + CONFIG.INITIAL_ROTATION_OFFSET;
          radius = segment.radiusFunction(outerEnd);
          this.ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));

          // Draw outer arc back to start edge
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
            const rawAngle = outerEnd - t * (segment.endTheta - segment.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = segment.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }

          // Only close path if we're drawing the leading edge
          if (segment.drawLeadingEdge) {
            this.ctx.closePath();
          }
          
          // Draw the segment outline
          this.ctx.stroke();
          
          // Draw the leading edge only for highlighted segments
          this.ctx.beginPath();
          const leadingAngle = -segment.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          const innerRadius = segment.radiusFunction(segment.startTheta);
          const outerRadius = segment.radiusFunction(segment.startTheta + 2 * Math.PI);
          
          this.ctx.moveTo(
            innerRadius * Math.cos(leadingAngle),
            innerRadius * Math.sin(leadingAngle)
          );
          this.ctx.lineTo(
            outerRadius * Math.cos(leadingAngle),
            outerRadius * Math.sin(leadingAngle)
          );
          
          this.ctx.stroke();
        }
      }
    }
  /**
   * Draw event segments after main segments
   */
  drawEventSegments() {
    for (const eventSegment of this.eventSegments) {
      if (eventSegment.isCircleMode) {
        // Circle mode event (no stroke to avoid arc lines on overlaps)
        this.drawCircleSegment(
          eventSegment.innerRadius,
          eventSegment.outerRadius,
          -eventSegment.timeStartTheta,
          -eventSegment.timeEndTheta,
          eventSegment.color,
          false, false, false, false,
          eventSegment.timeStartTheta,
          eventSegment.timeEndTheta,
          false,
          false,
          true, // isEventSubSegment = true
          false, false, false, // isNoonSegment, isSixAMSegment, isSixPMSegment
          null, null // day, segment
        );
      } else {
        // Spiral mode event: custom draw to avoid outer-arc switching glitches
        this.drawEventSpiralSubsegment(eventSegment);
        }
      }
    }

    /**
     * Draw midnight lines on top of all segments
     */
    drawMidnightLines() {
      this.ctx.save();
      
      for (const line of this.midnightLines) {
        // Check if this line type is enabled
        if (line.isNoonLine && !this.state.showNoonLines) {
          continue;
        } else if ((line.isSixAMLine || line.isSixPMLine) && !this.state.showSixAmPmLines) {
          continue;
        } else if (!line.isNoonLine && !line.isSixAMLine && !line.isSixPMLine && !this.state.showMidnightLines) {
          continue;
        }
        
        // Set stroke width based on line type
        if (line.isNoonLine) {
          this.ctx.lineWidth = CONFIG.NOON_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else if (line.isSixAMLine) {
          this.ctx.lineWidth = CONFIG.SIX_AM_PM_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else if (line.isSixPMLine) {
          this.ctx.lineWidth = CONFIG.SIX_AM_PM_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else {
          this.ctx.lineWidth = CONFIG.MIDNIGHT_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Black for midnight
        }
        
        if (line.isCircleMode) {
          // Circle mode midnight line
          
          if (line.isLeadingEdge) {
            // Leading edge (0:00-1:00 segment)
            this.ctx.beginPath();
            this.ctx.moveTo(line.innerRadius * Math.cos(line.startAngle), line.innerRadius * Math.sin(line.startAngle));
            this.ctx.lineTo(line.outerRadius * Math.cos(line.startAngle), line.outerRadius * Math.sin(line.startAngle));
            this.ctx.stroke();
          } else {
            // Trailing edge (23:00-0:00 segment)
            this.ctx.beginPath();
            this.ctx.moveTo(line.innerRadius * Math.cos(line.endAngle), line.innerRadius * Math.sin(line.endAngle));
            this.ctx.lineTo(line.outerRadius * Math.cos(line.endAngle), line.outerRadius * Math.sin(line.endAngle));
            this.ctx.stroke();
          }
        } else {
          // Spiral mode midnight line
          
          if (line.isLeadingEdge) {
            // Leading edge (0:00-1:00 segment, noon, 6:00 AM, 6:00 PM)
            const leadingAngle = -line.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const innerRadius = line.radiusFunction(line.startTheta);
            const outerRadius = line.radiusFunction(line.startTheta + 2 * Math.PI);
            
            this.ctx.beginPath();
            this.ctx.moveTo(
              innerRadius * Math.cos(leadingAngle),
              innerRadius * Math.sin(leadingAngle)
            );
            this.ctx.lineTo(
              outerRadius * Math.cos(leadingAngle),
              outerRadius * Math.sin(leadingAngle)
            );
            this.ctx.stroke();
          } else {
            // Trailing edge (23:00-0:00 segment)
            const trailingAngle = -line.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const innerRadius = line.radiusFunction(line.endTheta);
            const outerRadius = line.radiusFunction(line.endTheta + 2 * Math.PI);
            
            this.ctx.beginPath();
            this.ctx.moveTo(
              innerRadius * Math.cos(trailingAngle),
              innerRadius * Math.sin(trailingAngle)
            );
            this.ctx.lineTo(
              outerRadius * Math.cos(trailingAngle),
              outerRadius * Math.sin(trailingAngle)
            );
            this.ctx.stroke();
          }
        }
      }
      
      this.ctx.restore();
    }

    /**
     * Draw month lines on top of all segments
     */
    drawMonthLines() {
      // Check if month lines are enabled
      if (!this.state.showMonthLines) {
        return;
      }
      this.ctx.save();
      this.ctx.strokeStyle = CONFIG.MONTH_SEGMENT_COLOR;
      
      // Separate spiral and circle mode month lines
      const spiralLines = [];
      const circleLines = [];
      
      for (const line of this.monthLines) {
        if (line.isCircleMode) {
          circleLines.push(line);
        } else {
          spiralLines.push(line);
        }
      }
      
      // Make stroke width scale with radius (distance from center)
      const maxSpiralRadius = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * this.state.spiralScale;
      
      // Draw circle mode month lines as individual arc segments (like spiral mode)
      for (const line of circleLines) {
        // Debug: Check if we have valid data
        if (typeof line.startAngle === 'undefined' || typeof line.endAngle === 'undefined' || 
            typeof line.outerRadius === 'undefined') {
          console.warn('Invalid month line data:', line);
          continue;
        }
        
        // Scale stroke width based on radius position (smaller near center, larger near outside)
        const baseStrokeWidth = CONFIG.MONTH_BORDER_WIDTH;
        const strokeWidthScale = Math.max(0.75, Math.min(2.5, line.outerRadius / maxSpiralRadius));
        const scaledStrokeWidth = baseStrokeWidth * strokeWidthScale;
        this.ctx.lineWidth = scaledStrokeWidth;
        
        // Draw the outer arc segment using the same method as segment drawing
        this.ctx.beginPath();
        this.ctx.arc(0, 0, line.outerRadius, line.startAngle, line.endAngle, true);
        this.ctx.stroke();
      }
      
      // Draw spiral mode month lines with variable stroke width
      for (const line of spiralLines) {
        // Spiral mode: draw the outer arc of the segment with variable stroke width
        const outerStart = line.startTheta + 2 * Math.PI;
        const outerEnd = line.endTheta + 2 * Math.PI;
        
        // Calculate the maximum radius for this line to determine stroke width scaling
        const maxRadius = line.radiusFunction(outerStart);
        const minRadius = line.radiusFunction(outerEnd);
        const avgRadius = (maxRadius + minRadius) / 2;
        
        // Scale stroke width based on radius position (smaller near center, larger near outside)
        // Use a base stroke width and scale it relative to the radius
        const baseStrokeWidth = CONFIG.MONTH_BORDER_WIDTH;
        const maxSpiralRadius = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * this.state.spiralScale;
        const strokeWidthScale = Math.max(0.7, Math.min(2.5, avgRadius / maxSpiralRadius));
        const scaledStrokeWidth = baseStrokeWidth * strokeWidthScale;
        
        this.ctx.lineWidth = scaledStrokeWidth;
        
        // Draw outer arc
        const steps = Math.ceil(CONFIG.ARC_RESOLUTION * (line.endTheta - line.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
        this.ctx.beginPath();
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const rawAngle = outerStart + t * (outerEnd - outerStart);
          const angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
          const radius = line.radiusFunction(rawAngle);
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          
          if (i === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        
        this.ctx.stroke();
      }
      
      this.ctx.restore();
    }

    /**
     * Draw hour numbers (0-23) around the outside of the spiral
     */
    drawHourLabels(maxRadius) {
      if (!this.state.showHourNumbers || this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment) return;
      
      // Fixed distance from outer edge (in pixels) instead of proportional to radius
      const fixedDistance = 20; // pixels from the outer edge
      const labelRadius = maxRadius + fixedDistance;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Calculate dynamic font size based on spiral scale
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const minDimension = Math.min(canvasWidth, canvasHeight);
      const fontSize = Math.max(0, Math.min(26, minDimension * this.state.spiralScale * 0.082));
      
      this.ctx.save();
      this.ctx.font = getFontString(fontSize);
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
      // Determine which hours to show
      const hoursToShow = [];
      for (let hour = 0; hour < CONFIG.SEGMENTS_PER_DAY; hour++) {
        // Check if we should show this hour based on options
        if (this.state.showEverySixthHour) {
          // Only show every 6th hour (0, 6, 12, 18)
          if (hour % 6 === 0) {
            hoursToShow.push(hour);
          }
        } else {
          // Show all hours
          hoursToShow.push(hour);
        }
      }
      
      for (const hour of hoursToShow) {
        // Center angle of the segment (outermost day)
        // Position offset: 0=start, 1=middle, 2=end
        const hourOffset = this.state.hourNumbersPosition * 0.5 - 0.5;
        const angle = ((hour + hourOffset) * segmentAngle) + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);
        // Keep text upright: rotate canvas, draw, then restore
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Apply rotation based on upright option
        if (this.state.hourNumbersUpright) {
          // Keep numbers upright - compensate for spiral rotation
        if (this.state.staticMode) {
            this.ctx.rotate(Math.PI); // Static mode: just flip 180°
        } else {
            // Non-static mode: compensate for current spiral rotation
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          // Normal rotation behavior
          if (this.state.staticMode) {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI + (hour + hourOffset) * segmentAngle);
          } else {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET + (hour + hourOffset) * segmentAngle);
        }
        this.ctx.rotate(Math.PI/2); // make numbers upright
        }
        
        // Determine the display number based on startAtOne option
        let displayNumber = hour;
        if (this.state.hourNumbersStartAtOne) {
          // Shift by 1: where 0 was, show 24; where 1 was, show 1, etc.
          displayNumber = hour === 0 ? 24 : hour;
        }
        
        this.ctx.fillText(displayNumber.toString(), 0, 0);
        this.ctx.restore();
      }
      this.ctx.restore();
    }

    /**
     * Draw hour number inside a specific segment
     */
    drawHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Kept for direct drawing if needed; primary flow now collects and draws later
      this._renderHourNumberAtComputedPosition(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius, outerRadius);
    }

    collectHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Compute properties as in drawing function, but store for later draw above events
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const actualHour = ((segmentId % CONFIG.SEGMENTS_PER_DAY) + CONFIG.SEGMENTS_PER_DAY) % CONFIG.SEGMENTS_PER_DAY;

      // Calculate the final displayed hour (after position shifting)
      let displayHour = actualHour;
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayHour = (displayHour + 0 + 24) % 24;
        } else {
          displayHour = (displayHour + 1 + 24) % 24;
        }
      }

      // Check "Show only every 6th hour" against the final displayed hour
      let shouldShow = true;
      if (this.state.showEverySixthHour) shouldShow = displayHour % 6 === 0;
      if (!shouldShow) return;

      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      let centerTheta;
      if (this.state.hourNumbersPosition === 1) {
        const positionOffset = this.state.hourNumbersInsideSegment ? -0.5 : 0.5;
        centerTheta = (rawStartAngle + rawEndAngle) / 2 + (positionOffset * segmentAngle);
      } else {
        centerTheta = (rawStartAngle + rawEndAngle) / 2;
      }

      let labelRadius;
      let computedInner = innerRadius;
      let computedOuter = outerRadius;
      if (computedInner === null || computedOuter === null) {
        computedInner = radiusFunction(centerTheta);
        computedOuter = radiusFunction(centerTheta + 2 * Math.PI);
      }
      if (this.state.hourNumbersOutward) {
        if (this.state.hourNumbersInsideSegment) {
          labelRadius = (computedInner + computedOuter) / 2;
        } else {
          const fixedDistance = 20;
          labelRadius = computedOuter + fixedDistance;
        }
      } else {
        labelRadius = (computedInner + computedOuter) / 2;
      }

      // Compute dynamic font size based on segment geometry (similar to day numbers)
      const centerRadius = (computedInner + computedOuter) / 2;
      const radialHeight = computedOuter - computedInner;
      const arcWidth = centerRadius * segmentAngle;
      const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
      const fontSize = Math.max(1, Math.min(24, maxDimension));

      const angle = -centerTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = labelRadius * Math.cos(angle);
      const y = labelRadius * Math.sin(angle);

      this.hourNumbersInSegments.push({
        x, y, centerTheta, actualHour, fontSize
      });
    }

    drawHourNumbersInSegments() {
      for (const item of this.hourNumbersInSegments) {
        const { x, y, centerTheta, actualHour } = item;
        this.ctx.save();
        this.ctx.translate(x, y);

        if (this.state.hourNumbersUpright) {
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          if (this.state.staticMode) {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI - centerTheta);
          } else {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - centerTheta);
          }
          this.ctx.rotate(Math.PI/2);
        }

        let displayNumber = actualHour;
        if (this.state.hourNumbersStartAtOne) {
          displayNumber = actualHour === 0 ? 24 : actualHour;
        }
        if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
          if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
            displayNumber = (displayNumber + 0 + 24) % 24;
          } else {
            displayNumber = (displayNumber + 1 + 24) % 24;
          }
        }
        // Apply start at one functionality to shifted numbers
        if (this.state.hourNumbersStartAtOne && displayNumber === 0) {
          displayNumber = 24;
        }

        this.ctx.fillStyle = CONFIG.LABEL_COLOR;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = getFontString(item.fontSize);
        this.ctx.fillText(displayNumber.toString(), 0, 0);
        this.ctx.restore();
      }
    }

    _renderHourNumberAtComputedPosition(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Calculate the actual hour this segment represents in the spiral
      // The spiral counts up from outside in, so we need to calculate the hour based on position
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const actualHour = ((segmentId % CONFIG.SEGMENTS_PER_DAY) + CONFIG.SEGMENTS_PER_DAY) % CONFIG.SEGMENTS_PER_DAY;
      
      // Determine if this segment should show a number
      // Calculate the final displayed hour (after position shifting) for the 6th hour check
      let displayHour = actualHour;
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayHour = (displayHour + 0 + 24) % 24;
        } else {
          displayHour = (displayHour + 1 + 24) % 24;
        }
      }
      
      let shouldShow = true;
      if (this.state.showEverySixthHour) {
        // Only show every 6th hour (0, 6, 12, 18)
        shouldShow = displayHour % 6 === 0;
      }
      
      if (!shouldShow) return;
      
      // Calculate the center of the segment
      let centerTheta;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Apply position offset for middle position (1), keep others at center
      if (this.state.hourNumbersPosition === 1) {
        // Middle position: shift by half a segment
        // Inside segment numbers: -0.5, Outside segment numbers: +0.5
        const positionOffset = this.state.hourNumbersInsideSegment ? -0.5 : 0.5;
        centerTheta = (rawStartAngle + rawEndAngle) / 2 + (positionOffset * segmentAngle);
      } else {
        // Other positions: always at center (no position offset)
        centerTheta = (rawStartAngle + rawEndAngle) / 2;
      }
      // Position the number in the vertical center of the segment
      // Use provided inner/outer radius for circle mode, or calculate for spiral mode
      let labelRadius;
      if (innerRadius !== null && outerRadius !== null) {
        // Circle mode: use the provided inner and outer radius
        if (this.state.hourNumbersOutward) {
          if (this.state.hourNumbersInsideSegment) {
            // Place numbers in the center of the segment (relative positioning)
            labelRadius = (innerRadius + outerRadius) / 2;
          } else {
            // Place fixed distance outward (fixed positioning)
            const fixedDistance = 20; // pixels from the outer edge
            labelRadius = outerRadius + fixedDistance;
          }
        } else {
          labelRadius = (innerRadius + outerRadius) / 2;
        }
      } else {
        // Spiral mode: calculate both inner and outer radius to find the center
        const innerRadius = radiusFunction(centerTheta);
        const outerRadius = radiusFunction(centerTheta + 2 * Math.PI);
        if (this.state.hourNumbersOutward) {
          if (this.state.hourNumbersInsideSegment) {
            // Place numbers in the center of the segment (relative positioning)
            labelRadius = (innerRadius + outerRadius) / 2;
          } else {
            // Place fixed distance outward (fixed positioning)
            const fixedDistance = 20; // pixels from the outer edge
            labelRadius = outerRadius + fixedDistance;
          }
        } else {
          labelRadius = (innerRadius + outerRadius) / 2; // Vertical center of the segment
        }
      }
      const angle = -centerTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = labelRadius * Math.cos(angle);
      const y = labelRadius * Math.sin(angle);
      
      this.ctx.save();
      this.ctx.translate(x, y);
      
      // Apply rotation based on upright option
      if (this.state.hourNumbersUpright) {
        // Keep numbers upright - compensate for spiral rotation
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // Static mode: just flip 180°
        } else {
          // Non-static mode: compensate for current spiral rotation
          this.ctx.rotate(this.state.rotation);
        }
      } else {
        // Normal rotation behavior
        if (this.state.staticMode) {
          this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI - centerTheta);
        } else {
          this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - centerTheta);
        }
        this.ctx.rotate(Math.PI/2); // make numbers upright
      }
      
      // Determine the display number based on the actual hour
      let displayNumber = actualHour;
      if (this.state.hourNumbersStartAtOne) {
        // Shift by 1: where 0 was, show 24; where 1 was, show 1, etc.
        displayNumber = actualHour === 0 ? 24 : actualHour;
      }

      // Rename the labels based on position (for both inside and outside segment numbers)
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        // Position 0 and 1: shift back by 1 hour, wrapping around
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayNumber = (displayNumber + 0 + 24) % 24;
        } else {
          displayNumber = (displayNumber + 1 + 24) % 24;
        }
      }
      // Position 2: no shift (keep original number)
      
      // Apply start at one functionality to shifted numbers
      if (this.state.hourNumbersStartAtOne && displayNumber === 0) {
        displayNumber = 24;
      }

      
      // Calculate dynamic font size based on spiral scale
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const minDimension = Math.min(canvasWidth, canvasHeight);
      const fontSize = Math.max(1, Math.min(24, minDimension * this.state.spiralScale * 0.075));
      
      // Set text properties (same as regular hour numbers)
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      this.ctx.font = getFontString(fontSize);
      
      this.ctx.fillText(displayNumber.toString(), 0, 0);
      this.ctx.restore();
    }

    /**
     * Draw month numbers inside segments
     */
    drawMonthNumbers() {
      // Only draw if month numbers are enabled
      if (!this.state.showMonthNumbers) return;
      
      this.ctx.save();
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
      // 7.5 degrees in radians
      const tiltRadians = 7.5 * Math.PI / 180;
      
      for (const monthNum of this.monthNumbers) {
        this.ctx.save();
        this.ctx.translate(monthNum.x, monthNum.y);
        
        // Set font size for this specific month number (bold)
        this.ctx.font = getFontString(monthNum.fontSize, 'bold ');
        
        // Apply rotation based on upright option
        if (this.state.monthNumbersUpright) {
          // Keep numbers upright - compensate for spiral rotation
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI); // Static mode: just flip 180°
          } else {
            // Non-static mode: compensate for current spiral rotation
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          // Normal rotation behavior
        // Tilt the month number by 7.5° in the direction of the segment
        // If spiral counts from outside in, positive tilt is correct
        this.ctx.rotate(tiltRadians);
        
        // Keep text upright in static mode
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI);
          }
        }
        
        // Apply clipping if this is a partial segment and clipping is enabled
        if (this.state.textClippingEnabled && !monthNum.fullSegment && monthNum.clipStartTheta !== undefined) {
          this.ctx.save();
          
          // Create clipping path for the segment
          this.ctx.beginPath();
          
          if (monthNum.isCircleMode) {
            // Circle mode clipping
            const startAngle = -monthNum.clipStartAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            const endAngle = -monthNum.clipEndAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            
            // Create a sector clipping path
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, monthNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
            this.ctx.lineTo(0, 0);
          } else {
            // Spiral mode clipping
            const startAngle = -monthNum.clipStartTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const endAngle = -monthNum.clipEndTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            
            // Create a sector clipping path
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, monthNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
            this.ctx.lineTo(0, 0);
          }
          
          this.ctx.clip();
          
          // Draw the text
        this.ctx.fillText(monthNum.text, 0, 0);
          
          this.ctx.restore();
        } else {
          // Draw normally for full segments
          this.ctx.fillText(monthNum.text, 0, 0);
        }
        
        this.ctx.restore();
      }
      
      this.ctx.restore();
    }
    /**
     * Draw day numbers inside segments
     */
    drawDayNumbers() {
      // Only draw if day numbers are enabled
      if (!this.state.showDayNumbers) return;
      
      this.ctx.save();
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
    // 7.5 degrees in radians (used if upright is off)
      const tiltRadians = 7.5 * Math.PI / 180;
    const onlyDayNumber = !this.state.dayLabelShowWeekday && !this.state.dayLabelShowMonth && !this.state.dayLabelShowYear;
    
    // Helper: draw text following the local spiral tangent by placing characters sequentially
    const drawCurvedText = (item) => {
      const text = item.text;
      if (!text) return;
      // Base angle along spiral
      const baseTheta = item.centerTheta !== undefined ? item.centerTheta : (item.centerAngle || 0);
      const labelRadius = item.centerRadius || 0;
      // Start slightly before center so text centers around the stored anchor
      // Estimate half text angular length
      if (!isFinite(labelRadius) || labelRadius < 1) return;
      this.ctx.save();
      const fontPx = Math.max(1, Math.floor(item.fontSize || 0));
      this.ctx.font = getFontString(fontPx);
      // Precompute kerning-aware per-character advances using cumulative widths
      const advances = [];
      let prevWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const sub = text.slice(0, i + 1);
        const w = this.ctx.measureText(sub).width;
        const adv = Math.max(0.5, w - prevWidth);
        advances.push(adv);
        prevWidth = w;
      }
      const totalWidth = prevWidth;
      if (!isFinite(totalWidth) || totalWidth < 0.5) { this.ctx.restore(); return; }
      // Left-align: begin at anchor and advance along path, with a small pre-offset so text starts earlier
      let theta = baseTheta;
      // Helper to compute arc-length-based theta delta for a given width using mid-curve
      const midR = (t) => {
        if (!item.radiusFunction || item.isCircleMode) return labelRadius;
        const rin = item.radiusFunction(t);
        const rout = item.radiusFunction(t + 2 * Math.PI);
        return (rin + rout) / 2;
      };
      const stepByArc = (thetaStart, targetWidth) => {
        let r0 = item.radiusFunction && !item.isCircleMode ? midR(thetaStart) : labelRadius;
        if (!isFinite(r0) || r0 < 1) r0 = 1;
        let dTheta = Math.max(1e-5, targetWidth / r0);
        let thetaEnd = thetaStart - dTheta;
        let r1 = item.radiusFunction && !item.isCircleMode ? midR(thetaEnd) : labelRadius;
        const x0 = r0 * Math.cos(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
        const y0 = r0 * Math.sin(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
        const x1 = r1 * Math.cos(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
        const y1 = r1 * Math.sin(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
        let ds = Math.hypot(x1 - x0, y1 - y0);
        if (ds > 0.0001) {
          dTheta = dTheta * (targetWidth / ds);
          thetaEnd = thetaStart - dTheta;
        }
        if (!isFinite(dTheta) || dTheta <= 0) dTheta = 1e-4;
        dTheta = Math.min(dTheta, 0.5);
        return dTheta;
      };
      // Pre-advance backward (opposite of reading direction) to start earlier
      const preOffsetPx = fontPx * 0.85; // tweakable leading offset
      const preDTheta = stepByArc(theta, preOffsetPx);
      theta = theta + preDTheta;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const chWidth = advances[i];
        // Half-advance to center glyph on its path position
        const halfAdvance = chWidth * 0.5;
        const dThetaHalf = stepByArc(theta, halfAdvance);
        const thetaMid = theta - dThetaHalf;
        // Position and orientation at mid point
        const rMid = item.radiusFunction && !item.isCircleMode ? midR(thetaMid) : labelRadius;
        const angleMid = -thetaMid + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = rMid * Math.cos(angleMid);
        const y = rMid * Math.sin(angleMid);
        // Tangent from a tiny forward difference around mid
        const eps = Math.max(1e-5, dThetaHalf * 0.5);
        const r2 = item.radiusFunction && !item.isCircleMode ? midR(thetaMid - eps) : labelRadius;
        const angle2 = -(thetaMid - eps) + CONFIG.INITIAL_ROTATION_OFFSET;
        const x2 = r2 * Math.cos(angle2);
        const y2 = r2 * Math.sin(angle2);
        const tangentAngle = Math.atan2(y2 - y, x2 - x);
        this.ctx.save();
        this.ctx.translate(x, y);
        // Upright vs tangent orientation
        if (this.state.dayNumbersUpright) {
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          // Rotate to the actual tangent direction in canvas space
          this.ctx.rotate(tangentAngle);
        }
        this.ctx.fillText(ch, 0, 0);
        this.ctx.restore();
        // Advance remaining half to end of glyph
        const dThetaHalf2 = stepByArc(thetaMid, halfAdvance);
        theta = thetaMid - dThetaHalf2;
      }
      this.ctx.restore();
    };
      
      for (const dayNum of this.dayNumbers) {
      // If only the numeric day is shown, render centered like before (non-curved)
      if (onlyDayNumber || dayNum.onlyNumeric) {
        const drawCentered = () => {
        this.ctx.save();
        this.ctx.translate(dayNum.x, dayNum.y);
        this.ctx.font = getFontString(dayNum.fontSize);
        if (this.state.dayNumbersUpright) {
          if (this.state.staticMode) {
              this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          this.ctx.rotate(tiltRadians);
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          }
        }
          this.ctx.fillText(dayNum.text, 0, 0);
          this.ctx.restore();
        };
        if (this.state.textClippingEnabled && !dayNum.fullSegment && (dayNum.clipStartTheta !== undefined || dayNum.clipStartAngle !== undefined)) {
          this.ctx.save();
          this.ctx.beginPath();
          if (dayNum.isCircleMode) {
            const startAngle = -dayNum.clipStartAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            const endAngle = -dayNum.clipEndAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, dayNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
            this.ctx.lineTo(0, 0);
          } else {
            const startAngle = -dayNum.clipStartTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const endAngle = -dayNum.clipEndTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, dayNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
            this.ctx.lineTo(0, 0);
          }
          this.ctx.clip();
          drawCentered();
          this.ctx.restore();
        } else {
          drawCentered();
        }
        continue;
      }

      // Otherwise, curved rendering
      if (this.state.textClippingEnabled && !dayNum.fullSegment && (dayNum.clipStartTheta !== undefined || dayNum.clipStartAngle !== undefined)) {
        this.ctx.save();
        this.ctx.beginPath();
        if (dayNum.isCircleMode) {
          const startAngle = -dayNum.clipStartAngle + CONFIG.INITIAL_ROTATION_OFFSET;
          const endAngle = -dayNum.clipEndAngle + CONFIG.INITIAL_ROTATION_OFFSET;
          this.ctx.moveTo(0, 0);
          this.ctx.arc(0, 0, dayNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
          this.ctx.lineTo(0, 0);
        } else {
          const startAngle = -dayNum.clipStartTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          const endAngle = -dayNum.clipEndTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          this.ctx.moveTo(0, 0);
          this.ctx.arc(0, 0, dayNum.clipOuterRadius * 1.1, startAngle, endAngle, false);
          this.ctx.lineTo(0, 0);
        }
        this.ctx.clip();
        drawCurvedText(dayNum);
        this.ctx.restore();
      } else {
        drawCurvedText(dayNum);
      }
      }
      
      this.ctx.restore();
    }

    /**
     * Draw tooltip showing segment time and event titles
     */
    drawTooltip() {
      // Only draw tooltip if enabled and on desktop, not mobile
      if (!this.state.showTooltip || !this.mouseState.hoveredEvent || isMobileDevice()) return;
      
      // Don't show tooltip if event detail window is open
      if (this.state.detailMode !== null) return;
      
      const { segment, events } = this.mouseState.hoveredEvent;
      const { x, y } = this.mouseState.tooltipPosition;
      
      // Calculate segment time
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Format time
      const timeStr = this.formatUTCHHMM(segmentDate);
      const dateStr = this.formatUTCDateShort(segmentDate);
      
      // Prepare tooltip content
      const lines = [`${dateStr} ${timeStr}`];
      if (events.length > 0) {
          lines.push(''); // Empty line separator
          events.forEach(eventData => {
          lines.push(`• ${eventData.event.title}`);
        });
      } else {
        //lines.push('No events');
      }
      
      // Calculate tooltip dimensions
      const padding = 8;
      const lineHeight = 12;
      const maxWidth = 200;
      
      this.ctx.save();
      this.ctx.font = getFontString(12);
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      
      // Measure text to calculate tooltip size with clipping
      const textMetrics = lines.map(line => this.ctx.measureText(line));
      const maxTextWidth = Math.max(...textMetrics.map(m => m.width));
      const tooltipWidth = Math.min(maxWidth, Math.max(120, maxTextWidth + padding * 2)); // Min width 120px
      const tooltipHeight = lines.length * lineHeight + padding * 2;
      
      // Position tooltip above cursor with some offset
      const tooltipX = x + 5;
      const tooltipY = y - tooltipHeight - 5;
      
      // Draw tooltip background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
       
      // Draw tooltip text with clipping
      this.ctx.fillStyle = '#ffffff';
      const textAreaWidth = tooltipWidth - padding * 2;
      
      lines.forEach((line, index) => {
        const textY = tooltipY + padding + index * lineHeight;
        const textX = tooltipX + padding;
        
        // Clip text if it's too long
        const metrics = this.ctx.measureText(line);
        if (metrics.width <= textAreaWidth) {
          this.ctx.fillText(line, textX, textY);
        } else {
          // Find the longest text that fits
          let truncatedLine = line;
          while (this.ctx.measureText(truncatedLine + '...').width > textAreaWidth && truncatedLine.length > 0) {
            truncatedLine = truncatedLine.slice(0, -1);
          }
          this.ctx.fillText(truncatedLine + '...', textX, textY);
        }
      });
      
      this.ctx.restore();
    }

    /**
     * Draw all segments in concentric circle mode
     */
    drawCircleModeSegments(maxRadius) {
      const days = this.state.days + 1;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Use the same visibility logic as spiral mode
      const { thetaMax } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
      const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
      
      // Create radius function using the same logic as spiral mode
      const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
      
      // Calculate which days (rings) fall within the visible angular range
      const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
      const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
      
      // First pass: collect all visible segments with their radii for hour number filtering
      const segmentsWithRadii = [];
      
      for (let day = startDay; day < endDay; day++) {
        const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
        const innerRadius = radiusFunction(day * 2 * Math.PI);
        
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          const dayStartAngle = day * 2 * Math.PI;
          const segmentStartAngle = dayStartAngle + segment * segmentAngle;
          const segmentEndAngle = segmentStartAngle + segmentAngle;
          
          // Check if this segment is within the visible range
          const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
          const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
          
          if (segmentEnd <= segmentStart) continue; // segment is fully hidden
          
          // Calculate radius for this segment (use outer radius for circle mode)
          const segmentRadius = outerRadius;
          
          // Store segment info for hour number filtering
          segmentsWithRadii.push({
            day, segment, segmentStart, segmentEnd, segmentRadius, innerRadius, outerRadius
          });
        }
      }
      
      // Sort by radius (descending), then by spiral position for consistent revealing order
      segmentsWithRadii.sort((a, b) => {
        if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
          return b.segmentRadius - a.segmentRadius; // Sort by radius first (outermost first)
        }
        // For segments with same radius (same ring), sort by spiral position
        const aPosition = a.day * CONFIG.SEGMENTS_PER_DAY + a.segment;
        const bPosition = b.day * CONFIG.SEGMENTS_PER_DAY + b.segment;
        return bPosition - aPosition; // Sort by inverted spiral progression for correct revealing order
      });
      
      // Calculate visibility for each segment and create a priority list
      const segmentsWithVisibility = segmentsWithRadii.map(segment => {
        const segmentStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
        const segmentEndAngle = segmentStartAngle + segmentAngle;
        const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
        const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
        
        const visibility = segmentEnd > segmentStart ? (segmentEnd - segmentStart) / (segmentEndAngle - segmentStartAngle) : 0;
        
        return {
          ...segment,
          visibility,
          segmentKey: `${segment.day}-${segment.segment}`
        };
      });
      
      // Sort by radius first, then by visibility (descending)
      segmentsWithVisibility.sort((a, b) => {
        if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
          return b.segmentRadius - a.segmentRadius; // Sort by radius first
        }
        return b.visibility - a.visibility; // Then by visibility
      });
      
      // Take segments based on position-adjusted threshold, up to 24 total
      const segmentsToShowNumbers = [];
      for (const segment of segmentsWithVisibility) {
        if (segmentsToShowNumbers.length >= 24) break;
        
        let shouldShow = false;
        if (this.state.hourNumbersPosition === 2 || this.state.hourNumbersPosition === 0) {
          // +0.5 position: Different thresholds based on positioning
          if (this.state.hourNumbersInsideSegment) {
            // Inside segment center: 66% threshold (two thirds)
            shouldShow = segment.visibility >= 0.66;
          } else {
            // Outside segment: 33% threshold (one third)
            shouldShow = segment.visibility >= 0.33;
          }
        } else if (this.state.hourNumbersPosition === 1) {
          // 0 position: Different thresholds based on positioning
          if (this.state.hourNumbersInsideSegment) {
            // Inside segment center: 17% threshold (two thirds minus 0.5)
            shouldShow = segment.visibility >= 0.17;
          } else {
            // Outside segment: 83% threshold with shifted visibility range
            const rawStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
            const rawEndAngle = rawStartAngle + segmentAngle;
            
            // Shift visibility range by half a segment for middle position
            const shiftedVisibilityRange = {
              min: visibilityRange.min - (segmentAngle * 0.5),
              max: visibilityRange.max - (segmentAngle * 0.5)
            };
            
            const startTheta = Math.max(rawStartAngle, shiftedVisibilityRange.min);
            const endTheta = Math.min(rawEndAngle, shiftedVisibilityRange.max);
            const shiftedVisibility = endTheta > startTheta ? (endTheta - startTheta) / (rawEndAngle - rawStartAngle) : 0;
            
            shouldShow = shiftedVisibility >= 0.17;
          }
        } 

        if (shouldShow) {
          segmentsToShowNumbers.push(segment);
        }
      }
      
      // If we don't have 24 segments at threshold, fill with the most visible remaining segments
      if (segmentsToShowNumbers.length < 24) {
        for (const segment of segmentsWithVisibility) {
          if (segmentsToShowNumbers.length >= 24) break;
          if (!segmentsToShowNumbers.some(s => s.segmentKey === segment.segmentKey) && segment.visibility > 0) {
            segmentsToShowNumbers.push(segment);
          }
        }
      }
      
      const segmentsToShowNumbersSet = new Set(segmentsToShowNumbers.map(s => s.segmentKey));
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        // For each ring, use spiral's segment radii for the corresponding day
        const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
        const innerRadius = radiusFunction(day * 2 * Math.PI);
        
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
            const dayStartAngle = day * 2 * Math.PI;
            const segmentStartAngle = dayStartAngle + segment * segmentAngle;
            const segmentEndAngle = segmentStartAngle + segmentAngle;
            
            // Check if this segment is within the visible range (same as spiral mode)
            const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
            const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
            
            if (segmentEnd <= segmentStart) continue; // segment is fully hidden
          
          // Get color for this segment (check events first, then fall back to random colors)
          const eventInfo = this.getEventColorForSegment(day, segment);
          
          // Get base color
          const segmentIndex = day * CONFIG.SEGMENTS_PER_DAY + segment;
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
          const color = this.cache.colors[colorIndex];
          const isMidnightSegment = segment === 23;
          const isAfterMidnightSegment = segment === 0;
          
          // Check if this is a noon segment (segment 12 of each day)
          const isNoonSegment = segment === 12;
          
          // Check if this is a 6:00 segment (segment 6 of each day)
          const isSixAMSegment = segment === 6;
          
          // Check if this is an 18:00 segment (segment 18 of each day)
          const isSixPMSegment = segment === 18;
          
          const isFirstDayOfMonth = this.isFirstDayOfMonth(day, segment);
          const isFirstHourOfMonth = this.isFirstHourOfMonth(day, segment);
          const isHovered = this.mouseState.hoveredSegment &&
                           this.mouseState.hoveredSegment.day === day &&
                           this.mouseState.hoveredSegment.segment === segment;
          const isSelected = this.mouseState.selectedSegment &&
                            this.mouseState.selectedSegment.day === day &&
                            this.mouseState.selectedSegment.segment === segment;
          
        


          
          // Store month number info if this is the first hour of a month
          if (isFirstHourOfMonth && segmentStartAngle !== null && segmentEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip month number if hiding outermost due to inside hour numbers
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForHourOverlap) {
            // Only collect on full segments if clipping is disabled
            if (this.state.textClippingEnabled || (segmentStart === segmentStartAngle && segmentEnd === segmentEndAngle)) {
            const monthNumber = this.getMonthNumber(day, segment);
            const centerAngle = (segmentStart + segmentEnd) / 2;
            const centerRadius = (innerRadius + outerRadius) / 2;
            
            // Calculate font size based on segment dimensions in circle mode
            const segmentAngleSize = segmentEnd - segmentStart;
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            let fontSize = Math.max(1, Math.min(24, maxDimension));
            
            // Determine display text: replace January with year when enabled
            const showYearForThis = this.state.showYearNumbers && monthNumber === 1;
            const monthText = this.state.showMonthNames ? MONTHS_SHORT_UTC[monthNumber - 1] : monthNumber.toString();
            const displayText = showYearForThis ? this.getYearNumber(day, segment).toString() : monthText;
            
            // Make year numbers slightly smaller than month names (4 digits vs 3 letters)
            if (showYearForThis) {
              fontSize = Math.max(1, Math.floor(fontSize * 0.85));
            }
            
            this.monthNumbers.push({
              x: centerRadius * Math.cos(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              text: displayText,
              fontSize: fontSize,
              isCircleMode: true,
              // Add clipping information for circle mode
              clipStartAngle: segmentStart,
              clipEndAngle: segmentEnd,
              clipInnerRadius: innerRadius,
              clipOuterRadius: outerRadius,
              centerAngle: centerAngle,
              fullSegment: segmentStart === segmentStartAngle && segmentEnd === segmentEndAngle
            });
            }
            }
          }
          
          // Store day number info if this is the first hour of a day
          const isFirstHourOfDay = this.isFirstHourOfDay(day, segment);
          if (isFirstHourOfDay && segmentStartAngle !== null && segmentEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip day number if overlapping with month or if hiding outermost due to inside hour numbers
            const skipForMonthOverlap = (isFirstDayOfMonth && this.state.showDayNumbers && this.state.showMonthNumbers);
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForMonthOverlap && !skipForHourOverlap) {
            // Only collect on full segments if clipping is disabled
            if (this.state.textClippingEnabled || (segmentStart === segmentStartAngle && segmentEnd === segmentEndAngle)) {
            const dayNumber = this.getDayNumber(day, segment);
            const centerAngle = (segmentStart + segmentEnd) / 2;
            const centerRadius = (innerRadius + outerRadius) / 2;
            // Build weekday + day label (e.g., Mon 28)
            // Defaults in case of errors (circle mode)
            let includeMonth = false;
            let includeYear = false;
            try {
              const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
              const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
              const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
              const weekdayFull = WEEKDAYS_UTC[segmentDate.getUTCDay()];
              const weekdayShort = weekdayFull.slice(0, 3);
              const monthFull = MONTHS_LONG_UTC[segmentDate.getUTCMonth()];
              const monthShort = MONTHS_SHORT_UTC[segmentDate.getUTCMonth()];
              const year = segmentDate.getUTCFullYear();
              const parts = [];
              const useShortWeekday = !!this.state.dayLabelUseShortNames;
              const useShortMonth = !!this.state.dayLabelUseShortMonth;
              const useShortYear = !!this.state.dayLabelUseShortYear;
              const isFirstOfMonth = segmentDate.getUTCDate() === 1;
              const isFirstOfYear = isFirstOfMonth && segmentDate.getUTCMonth() === 0;
              if (this.state.dayLabelShowWeekday) {
                parts.push(useShortWeekday ? weekdayShort : weekdayFull);
              }
              includeMonth = this.state.dayLabelShowMonth && (!this.state.dayLabelMonthOnFirstOnly || isFirstOfMonth);
              if (includeMonth) {
                parts.push(useShortMonth ? monthShort : monthFull);
              }
              const dayText = this.state.dayLabelUseOrdinal ? this.dayToOrdinal(dayNumber) : String(dayNumber);
              parts.push(dayText);
              if (this.state.dayLabelShowWeekday && parts.length > 1) parts[0] = parts[0] + ',';
              var fullDayLabel = parts.join(' ');
              includeYear = this.state.dayLabelShowYear && (!this.state.dayLabelYearOnFirstOnly || isFirstOfYear);
              if (includeYear) {
                const yearText = useShortYear ? String(year).slice(2) : String(year);
                fullDayLabel += `, ${yearText}`;
              }
            } catch (_) {
              var fullDayLabel = dayNumber.toString();
            }
            
            // Calculate font size based on segment dimensions in circle mode
            const segmentAngleSize = segmentEnd - segmentStart;
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            const fontSize = Math.max(1, Math.min(24, maxDimension));
            
            this.dayNumbers.push({
              x: centerRadius * Math.cos(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              isCircleMode: true,
              // Add clipping information for circle mode
              clipStartAngle: segmentStart,
              clipEndAngle: segmentEnd,
              clipInnerRadius: innerRadius,
              clipOuterRadius: outerRadius,
              centerAngle: centerAngle,
              centerRadius: centerRadius,
              onlyNumeric: (!this.state.dayLabelShowWeekday && !includeMonth && !includeYear),
              fullSegment: segmentStart === segmentStartAngle && segmentEnd === segmentEndAngle
            });
            }
            }
          }
        // Draw as a ring segment with inner and outer radius
        this.drawCircleSegment(innerRadius, outerRadius, -segmentStart, -segmentEnd, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, segmentStartAngle, segmentEndAngle, isFirstDayOfMonth, true, false, isNoonSegment, isSixAMSegment, isSixPMSegment, day, segment);
        
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(segmentStart, segmentEnd, radiusFunction, segment, day, segmentStartAngle, segmentEndAngle, innerRadius, outerRadius);
          }
        }
          
        // Store event data for drawing after main segments (circle mode)
          const allEvents = this.getAllEventsForSegment(day, segment);
          if (allEvents.length > 0) {
            // Use cached layout for speed
            this.ensureLayoutCache();
            const { eventToLane, eventToComponent, componentLaneCount } = this.layoutCache;
            // Compute lane assignment inside the hour for non-overlapping sharing within same lane
            const { lanes: hourLanes, numLanes: hourLaneCount } = this.computeEventLanes(allEvents);

            const getLaneCountForEvent = (evData) => {
              if (!CONFIG.UNIFORM_EVENT_THICKNESS) return Math.max(1, hourLaneCount);
              return this.getMaxOverlapForEventAcrossHours(evData.event);
            };

            // Build local overlap groups within the hour (circle mode)
            const n = allEvents.length;
            const uf = createUnionFind(n);
            const overlapsInHour = (a, b) => !(a.endMinute <= b.startMinute || b.endMinute <= a.startMinute);
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                if (overlapsInHour(allEvents[i], allEvents[j])) uf.unite(i, j);
              }
            }
            const groups = new Map();
            for (let i = 0; i < n; i++) {
              const r = uf.find(i);
              if (!groups.has(r)) groups.set(r, []);
              groups.get(r).push(i);
            }

            if (this.state.overlayStackMode) {
              // Stacked overlap mode with gap filling by sub-splitting on change points (circle)
              for (const idxList of groups.values()) {
                // Order bottom->top by descending coverage within hour, then lane, then start time
                const ordered = idxList.map(i => {
                  const ev = allEvents[i];
                  const laneFromPersistent = eventToLane.get(ev.event);
                  const lane = (laneFromPersistent !== undefined) ? laneFromPersistent : (hourLanes[i] ?? 0);
                  return { idx: i, lane, startUtcMs: ev.startUtcMs || 0, startMin: ev.startMinute };
                }).sort((a, b) => {
                  if (a.lane !== b.lane) return a.lane - b.lane; // stable bottom->top by lane
                  if (a.startUtcMs !== b.startUtcMs) return a.startUtcMs - b.startUtcMs;
                  return a.startMin - b.startMin;
                });

                // Build change boundaries (0..60 minutes)
                const boundarySet = new Set([0, 60]);
                for (const i of idxList) {
                  const ev = allEvents[i];
                  boundarySet.add(Math.max(0, Math.min(60, ev.startMinute)));
                  boundarySet.add(Math.max(0, Math.min(60, ev.endMinute)));
                }
                const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

                for (let s = 0; s < boundaries.length - 1; s++) {
                  const aMin = boundaries[s];
                  const bMin = boundaries[s + 1];
                  if (bMin <= aMin) continue;
                  const active = ordered.filter(({ idx }) => {
                    const ev = allEvents[idx];
                    return ev.startMinute < bMin && ev.endMinute > aMin;
                  });
                  if (active.length === 0) continue;
                  const m = active.length;
                  for (let rank = 0; rank < m; rank++) {
                    const i = active[rank].idx;
                    const eventData = allEvents[i];
                    const subStart = aMin / 60;
                    const subEnd = bMin / 60;
                    const eventSliceStart = (rank === 0) ? 0 : (rank / m);
                    const eventSliceEnd = 1;
                    const totalRadialHeight = outerRadius - innerRadius;
                    const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
                    const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
                    const segmentAngleSize = segmentEndAngle - segmentStartAngle;
                    let timeStartAngle = segmentStartAngle + (1 - subEnd) * segmentAngleSize;
                    let timeEndAngle = segmentStartAngle + (1 - subStart) * segmentAngleSize;
                    timeStartAngle = Math.max(timeStartAngle, segmentStart);
                    timeEndAngle = Math.min(timeEndAngle, segmentEnd);
                    if (timeEndAngle > timeStartAngle) {
                      this.eventSegments.push({
                        timeStartTheta: timeStartAngle,
                        timeEndTheta: timeEndAngle,
                        eventSliceStart,
                        eventSliceEnd,
                        innerRadius: sliceInnerRadius,
                        outerRadius: sliceOuterRadius,
                        color: eventData.color,
                        event: eventData.event,
                        rawStartAngle: segmentStartAngle,
                        rawEndAngle: segmentEndAngle,
                        day: day,
                        segment: segment,
                        isCircleMode: true
                      });
                    }
                  }
                }
              }
            } else {
              // Precompute slice positions per event index based on group-local needs
              const eventSliceStartArr = new Array(n).fill(0);
              const eventSliceEndArr = new Array(n).fill(1);
              for (const idxList of groups.values()) {
                let groupRequiredCount = 1;
                for (const i of idxList) {
                  groupRequiredCount = Math.max(groupRequiredCount, getLaneCountForEvent(allEvents[i]));
                }
                const persistentLanes = idxList.map(i => {
                  const pl = eventToLane.get(allEvents[i].event);
                  return (pl !== undefined) ? pl : (hourLanes[i] ?? 0);
                });
                const uniqueSorted = Array.from(new Set(persistentLanes)).sort((a, b) => a - b);
                const laneToCompact = new Map(uniqueSorted.map((lane, i) => [lane, i]));
                const compactLaneCount = uniqueSorted.length;
                const groupLaneCount = Math.max(groupRequiredCount, compactLaneCount);
                for (let k = 0; k < idxList.length; k++) {
                  const i = idxList[k];
                  const compactLane = laneToCompact.get(persistentLanes[k]) || 0;
                  const sliceH = 1 / groupLaneCount;
                  eventSliceStartArr[i] = compactLane * sliceH;
                  eventSliceEndArr[i] = (compactLane + 1) * sliceH;
                }
              }

            for (let i = 0; i < allEvents.length; i++) {
              const eventData = allEvents[i];
              const minuteStart = eventData.startMinute / 60;
              const minuteEnd = eventData.endMinute / 60;
              
                // Group-local slice for this event (circle mode)
                const eventSliceStart = eventSliceStartArr[i];
                const eventSliceEnd = eventSliceEndArr[i];
              
              // Calculate the radial slice for this event
              const totalRadialHeight = outerRadius - innerRadius;
              const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
              const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
              
            // Use the full segment's angular range for partial event overlay
            const segmentAngleSize = segmentEndAngle - segmentStartAngle;
            let timeStartAngle = segmentStartAngle + (1 - minuteEnd) * segmentAngleSize;
            let timeEndAngle = segmentStartAngle + (1 - minuteStart) * segmentAngleSize;
            // Clamp event arc to visible segment range
            timeStartAngle = Math.max(timeStartAngle, segmentStart);
            timeEndAngle = Math.min(timeEndAngle, segmentEnd);
            if (timeEndAngle > timeStartAngle) {
              // Store event for drawing later (circle mode)
              this.eventSegments.push({
                timeStartTheta: timeStartAngle,
                timeEndTheta: timeEndAngle,
                eventSliceStart: eventSliceStart,
                eventSliceEnd: eventSliceEnd,
                innerRadius: sliceInnerRadius,
                outerRadius: sliceOuterRadius,
                color: eventData.color,
                event: eventData.event,
                rawStartAngle: segmentStartAngle,
                rawEndAngle: segmentEndAngle,
                day: day,
                segment: segment,
                isCircleMode: true
              });
              }
            }
          }
        }

        {
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
          let segStart = segmentDate.getUTCHours() + segmentDate.getUTCMinutes() / 60;
          let segEnd = segStart + 1;
          // Calculate sunrise/sunset times for this segment's date
          const sunTimes = this.getSunTimesForDate(segmentDate);
          let nightStart = sunTimes.sunset;
          let nightEnd = sunTimes.sunrise;
          if (nightEnd <= nightStart) nightEnd += 24;
          let segStartNorm = segStart;
          let segEndNorm = segEnd;
          if (segEndNorm < nightStart) {
            segStartNorm += 24;
            segEndNorm += 24;
          }
          // Calculate overlap
          const overlapStart = Math.max(segStartNorm, nightStart);
          const overlapEnd = Math.min(segEndNorm, nightEnd);
          const nightMinutes = Math.max(0, overlapEnd - overlapStart);
          const segmentMinutes = segEnd - segStart;
          const nightFraction = nightMinutes / segmentMinutes;
          let overlayStartFrac = 0.0;
          let overlayEndFrac = 0.0;
          if (nightFraction > 0 && this.state.showNightOverlay) {
            overlayStartFrac = Math.max(0, (overlapStart - segStartNorm) / (segEnd - segStart));
            overlayEndFrac = Math.min(1, (overlapEnd - segStartNorm) / (segEnd - segStart));
            // Use the full segment's angular range for partial overlay
            const segmentAngleSize = segmentEndAngle - segmentStartAngle;
            let timeStartAngle = segmentStartAngle + (1 - overlayEndFrac) * segmentAngleSize;
            let timeEndAngle = segmentStartAngle + (1 - overlayStartFrac) * segmentAngleSize;
            // Clamp overlay to visible segment range (same as main segments)
            timeStartAngle = Math.max(timeStartAngle, segmentStart);
            timeEndAngle = Math.min(timeEndAngle, segmentEnd);
            if (timeEndAngle > timeStartAngle) {
              // Store night overlay data for drawing after events (circle mode)
              this.nightOverlays.push({
                innerRadius: innerRadius,
                outerRadius: outerRadius,
                startTheta: -timeStartAngle,
                endTheta: -timeEndAngle,
                timeStartAngle: timeStartAngle,
                timeEndAngle: timeEndAngle,
                isCircleMode: true,
                day: day,
                segment: segment
              });
            }
          }
        }

        // --- WEEKDAY GRADIENT OVERLAY LOGIC FOR CIRCLE MODE ---
        if (this.state.showDayOverlay) {
          // Calculate the date for this day to get the day of week
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
          const dayOfWeek = segmentDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          
          // Create gradient from Monday (white) to Sunday (black)
          // Monday = 1, Sunday = 0, so we need to adjust the calculation
          let brightness;
          if (dayOfWeek === 0) {
            // Sunday - black (0)
            brightness = 0;
          } else if (dayOfWeek === 6) {
            // Saturday - much darker to separate weekend
            brightness = 50;
          } else {
            // Monday (1) to Friday (5) - progressively darker
            // Monday = 255, Tuesday = 220, Wednesday = 185, Thursday = 150, Friday = 115
            brightness = 255 - (dayOfWeek - 1) * 35;
          }
          
          // Use configurable opacity for day overlay
          const dayOverlayColor = `rgba(${brightness}, ${brightness}, ${brightness}, ${this.state.dayOverlayOpacity})`;
          
          // Store day overlay data for drawing after events (circle mode)
          this.dayOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -segmentStart,
            endTheta: -segmentEnd,
            segmentStartAngle: segmentStartAngle,
            segmentEndAngle: segmentEndAngle,
            color: dayOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        // --- GRADIENT OVERLAY LOGIC FOR CIRCLE MODE ---
        if (this.state.showGradientOverlay) {
          // In circle mode, use day index to determine darkness (later days = more inward = darker)
          // Normalize by total days visible
          const normalizedDay = day / (this.state.days - 1);
          
          // Calculate darkness: 0 (white/no darkening) at outer edge, increasing toward center
          // Use configurable maximum opacity
          const maxDarkness = this.state.gradientOverlayOpacity;
          const darkness = normalizedDay * maxDarkness;
          
          const gradientOverlayColor = `rgba(0, 0, 0, ${darkness})`;
          
          // Store gradient overlay data for drawing after events (circle mode)
          this.gradientOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -segmentStart,
            endTheta: -segmentEnd,
            segmentStartAngle: segmentStartAngle,
            segmentEndAngle: segmentEndAngle,
            color: gradientOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        }
      }
    }

    /**
     * Draw a single segment as a ring segment in circle mode
     */
  drawCircleSegment(innerRadius, outerRadius, startTheta, endTheta, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false, day = null, segment = null) {
      this.ctx.save();
      this.ctx.beginPath();
      
      // Draw the ring segment path
      const startAngle = startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const endAngle = endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      
      // Outer arc
      this.ctx.arc(0, 0, outerRadius, startAngle, endAngle, true);
      // Radial line to inner radius
      this.ctx.lineTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
      // Inner arc (counter-clockwise)
      this.ctx.arc(0, 0, innerRadius, endAngle, startAngle, false);
      // Radial line back to start
      this.ctx.lineTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
      
      this.ctx.closePath();
      this.ctx.fillStyle = color;
      this.ctx.fill();
    
    // Draw straight edge lines (radial lines)
    // Always draw for event sub-segments; for normal segments respect showSegmentEdges
    if (isEventSubSegment || (drawStroke && this.state.showSegmentEdges)) {
      this.ctx.beginPath();
      // Radial line from inner to outer radius at start angle
      this.ctx.moveTo(innerRadius * Math.cos(startAngle), innerRadius * Math.sin(startAngle));
      this.ctx.lineTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
      // Radial line from inner to outer radius at end angle
      this.ctx.moveTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
      this.ctx.lineTo(outerRadius * Math.cos(endAngle), outerRadius * Math.sin(endAngle));
      this.ctx.strokeStyle = isEventSubSegment ? color : CONFIG.STROKE_COLOR;
      
      this.ctx.lineWidth = isEventSubSegment ? CONFIG.EVENT_EDGE_STROKE_WIDTH : CONFIG.STROKE_WIDTH/5;
      this.ctx.stroke();
    }
    
                // Store arc line data for circle mode (to avoid gaps with event-colored edge lines)
        if (drawStroke && this.state.showArcLines) {
          // Store outer arc data
          this.arcLines.push({
            startAngle: startAngle,
            endAngle: endAngle,
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            isCircleMode: true,
            isInner: false
          });
          
          // Store inner arc data - skip for event sub-segments
          if (!isEventSubSegment) {
            this.arcLines.push({
              startAngle: endAngle,
              endAngle: startAngle,
              innerRadius: innerRadius,
              outerRadius: outerRadius,
              isCircleMode: true,
              isInner: true
            });
          }
        }
      // Store highlights for drawing later
      if (isHovered) {
        this.highlightedSegments.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isHovered: true,
          isSelected: false,
          isCircleMode: true
        });
      }
      if (isSelected) {
        // Get event info for this segment
        const eventInfo = day !== null && segment !== null ? this.getEventColorForSegment(day, segment) : null;
        
        this.highlightedSegments.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isHovered: false,
          isSelected: true,
          isCircleMode: true,
          eventInfo: eventInfo,
          segmentColor: color,
          day: day,
          segment: segment
        });
      }
      
      // Store midnight line info for circle mode (only when segment is fully visible)
      if (isMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && 
          Math.abs(startTheta - (-rawStartAngle)) < 0.001 && Math.abs(endTheta - (-rawEndAngle)) < 0.001) {
        // Midnight segment (23:00-0:00) - trailing edge
        this.midnightLines.push({
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: false
        });
      }
      
      if (isAfterMidnightSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // After midnight segment (0:00-1:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true
        });
      }

      // Store noon line info for circle mode (when segment is at least partially visible)
      if (isNoonSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // Noon segment (12:00-13:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isNoonLine: true
        });
      }

      // Store 6:00 AM line info for circle mode (when segment is at least partially visible)
      if (isSixAMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 6:00 AM segment (6:00-7:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isSixAMLine: true
        });
      }

      // Store 18:00 (6:00 PM) line info for circle mode (when segment is at least partially visible)
      if (isSixPMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 18:00 segment (18:00-19:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isSixPMLine: true
        });
      }
      
      // Store month line info for circle mode (when segment represents 1st day of month and is at least partially visible)
      if (isFirstDayOfMonth && rawStartAngle !== null && rawEndAngle !== null) {
        // For month boundaries in circle mode, draw the outer arc with thicker line
        // Store the month line as long as the segment is at least partially visible
        this.monthLines.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true
        });
      }
      
      this.ctx.restore();
    }

    /**
     * Start the animation loop
     */
    startAnimation() {
      if (this.animationState.animationId) return; // Already animating
      
      this.animationState.startTime = performance.now();
      this.animate();
    }

    /**
     * Stop the animation loop
     */
    stopAnimation() {
      if (this.animationState.animationId) {
        cancelAnimationFrame(this.animationState.animationId);
        this.animationState.animationId = null;
      }
    }

    /**
     * Animation loop - smoothly animate rotation from 0 to max degrees
     */
    animate() {
      if (!this.animationState.isAnimating) return;

      const currentTime = performance.now();
      const elapsed = (currentTime - this.animationState.startTime) / 1000; // Convert to seconds
      
      // Get the current max value from the rotateMaxSlider
      const rotateMaxSlider = document.getElementById('rotateMaxSlider');
      const maxDegrees = +rotateMaxSlider.value;
      
      // Calculate rotation based on time and speed
      // One complete cycle takes 4 seconds at speed 1.0
      const cycleDuration = 4 / this.animationState.speed;
      const progress = (elapsed % cycleDuration) / cycleDuration;
      
      // Convert progress (0-1) to rotation (0-maxDegrees)
      const rotationDegrees = progress * maxDegrees;
      const rotationRadians = rotationDegrees * Math.PI / 180;
      
      // Update the rotation state
      this.state.rotation = rotationRadians;
      
      // Update the UI slider to reflect current rotation
      document.getElementById('rotateSlider').value = rotationDegrees;
      document.getElementById('rotateVal').textContent = Math.round(rotationDegrees) + '°';
      
      // Redraw the spiral
      this.drawSpiral();
      
      // Continue animation
      this.animationState.animationId = requestAnimationFrame(() => this.animate());
    }

    // Inertia (momentum) rotation after drag release
    // and magnetic snapping to nearest hour boundary
    snapIfClose() {
      // Snap when close to nearest 15° boundary and moving slowly
      const hourAngle = Math.PI / 12; // 15°
      const r = this.state.rotation;
      const k = Math.round(r / hourAngle);
      const target = k * hourAngle;
      const delta = target - r;
      const angleThreshold = 0.06;
      const speedThreshold = 0.3; // rad/s
      const speed = Math.abs(this._inertiaVelocity || 0);
      if (Math.abs(delta) < angleThreshold && speed < speedThreshold) {
        this.state.rotation = target;
        return true;
      }
      return false;
    }

    stopInertia() {
      if (this._inertiaAnimationId) {
        cancelAnimationFrame(this._inertiaAnimationId);
        this._inertiaAnimationId = null;
      }
      this._inertiaVelocity = 0;
      this._inertiaLastTs = 0;
    }

    resetMobileZoom() {
      // Reset mobile zoom level when panels close
      // This prevents users from getting "stuck" zoomed in
      if (isMobileDevice()) {
        // Check if page is zoomed in
        const currentZoom = window.visualViewport ? window.visualViewport.scale : 1;
        if (currentZoom > 1.1) { // If zoomed in more than 10%
          // Reset zoom by setting viewport meta tag
          const viewport = document.querySelector('meta[name="viewport"]');
          if (viewport) {
            const originalContent = viewport.getAttribute('content');
            // Temporarily change viewport to reset zoom
            viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
            setTimeout(() => {
              // Restore original viewport settings
              viewport.setAttribute('content', originalContent);
            }, 100);
          }
        }
      }
    }

    // VisualViewport zoom fail-safe: allow page zoom when zoomed-in and pause canvas gestures
    initializeZoomFailSafe() {
      this.pageZoomActive = false;
      this._boundUpdatePageZoomMode = this.updatePageZoomMode.bind(this);
      this.updatePageZoomMode();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._boundUpdatePageZoomMode);
        window.visualViewport.addEventListener('scroll', this._boundUpdatePageZoomMode);
      }
      window.addEventListener('resize', this._boundUpdatePageZoomMode);
    }

    updatePageZoomMode() {
      const scale = window.visualViewport ? window.visualViewport.scale : 1;
      const isZoomed = scale > 1.05; // 5% threshold
      if (this.pageZoomActive === isZoomed) return;
      this.pageZoomActive = isZoomed;
      // Toggle canvas touch-action so pinch-to-zoom can work when page is zoomed
      try {
        if (this.canvas && this.canvas.style) {
          this.canvas.style.touchAction = isZoomed ? 'auto' : 'none';
        }
      } catch (_) {}
      this.updateViewportForPageZoom(isZoomed);
    }

    updateViewportForPageZoom(isZoomed) {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) return;
      const base = 'width=device-width, initial-scale=1, viewport-fit=cover';
      if (isZoomed) {
        // Allow user zoom to enable zooming back out
        viewport.setAttribute('content', base + ', user-scalable=yes');
      } else {
        // Lock zoom to dedicate pinch gesture to the canvas interactions
        viewport.setAttribute('content', base + ', maximum-scale=1, user-scalable=no');
      }
    }

    /**
     * Add all events to calendar directly (no dialog)
     */
    showAddAllToCalendarDialog() {
      if (this.events.length === 0) {
        alert('No events to add to calendar.');
        return;
      }

      // Detect iOS for better Apple Calendar integration
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (isIOS) {
        // For iOS, directly download ICS file that will open in Apple Calendar
        const generateAllEventsICS = () => {
          let icsContent = 'BEGIN:VCALENDAR\r\n';
          icsContent += 'VERSION:2.0\r\n';
          icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
          icsContent += 'CALSCALE:GREGORIAN\r\n';
          icsContent += 'METHOD:PUBLISH\r\n';

          for (const ev of this.events) {
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:spiral-${ev.start.getTime()}-${ev.title.replace(/[^a-zA-Z0-9]/g, '')}\r\n`;
            const formatDateForICS = (date) => {
              return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
            };
            const escapeICS = (text) => {
              return text.replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
            };
            
            icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
            icsContent += `DTSTART:${formatIcsDateUTC(ev.start)}\r\n`;
            icsContent += `DTEND:${formatIcsDateUTC(ev.end)}\r\n`;
            icsContent += `SUMMARY:${escapeIcsText(ev.title)}\r\n`;
            if (ev.description) {
              icsContent += `DESCRIPTION:${escapeIcsText(ev.description)}\r\n`;
            }
            icsContent += `X-SPIRAL-COLOR:${ev.color}\r\n`;
            // Add iOS-friendly properties
            icsContent += 'STATUS:CONFIRMED\r\n';
            icsContent += `SEQUENCE:${generateEventSequence(ev)}\r\n`;
            icsContent += 'END:VEVENT\r\n';
          }

          icsContent += 'END:VCALENDAR\r\n';
          return icsContent;
        };

        const icsContent = generateAllEventsICS();
        const blob = new Blob([icsContent], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spiral-calendar-all-events.ics`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
        
        // Mark all events as added to calendar
        this.events.forEach(ev => {
          ev.addedToCalendar = true;
          ev.lastAddedToCalendar = Date.now();
        });
        this.saveEventsToStorage();
        renderEventList();
      } else {
        // Detect Android for better system calendar integration
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (isAndroid) {
          // For Android, try to download ICS file which can open in system calendar apps
          const generateAllEventsICS = () => {
            let icsContent = 'BEGIN:VCALENDAR\r\n';
            icsContent += 'VERSION:2.0\r\n';
            icsContent += 'PRODID:-//Spiral Calendar//Calendar//EN\r\n';
            icsContent += 'CALSCALE:GREGORIAN\r\n';
            icsContent += 'METHOD:PUBLISH\r\n';

            for (const ev of this.events) {
              icsContent += 'BEGIN:VEVENT\r\n';
              icsContent += `UID:${generateEventUID(ev)}\r\n`;
              const formatDateForICS = (date) => {
                return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
              };
              const escapeICS = (text) => {
                return text.replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\n/g, '\\n');
              };
              
              icsContent += `DTSTAMP:${formatIcsDateUTC(new Date())}\r\n`;
              icsContent += `DTSTART:${formatIcsDateUTC(ev.start)}\r\n`;
              icsContent += `DTEND:${formatIcsDateUTC(ev.end)}\r\n`;
              icsContent += `SUMMARY:${escapeIcsText(ev.title)}\r\n`;
              if (ev.description) {
                icsContent += `DESCRIPTION:${escapeIcsText(ev.description)}\r\n`;
              }
              icsContent += `X-SPIRAL-COLOR:${ev.color}\r\n`;
              icsContent += 'STATUS:CONFIRMED\r\n';
              icsContent += 'SEQUENCE:0\r\n';
              icsContent += 'END:VEVENT\r\n';
            }

            icsContent += 'END:VCALENDAR\r\n';
            return icsContent;
          };

          // Download ICS file for Android system calendar
          const icsContent = generateAllEventsICS();
          const blob = new Blob([icsContent], { type: 'text/calendar' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `spiral-calendar-all-events.ics`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 0);
          
          // Show Android-specific instructions
          setTimeout(() => {
            alert('Calendar file downloaded! Tap on the downloaded .ics file to add all events to your Android calendar app.');
          }, 500);
        } else {
          // For desktop/other non-iOS devices, show Google Calendar instructions
          const message = `To import all events to Google Calendar:\n\n1. Use the "Export All" button to download a .ics file\n2. In Google Calendar, go to Settings > Import & Export\n3. Select the downloaded .ics file\n\nOpening Google Calendar now...`;
          alert(message);
          window.open('https://calendar.google.com/calendar/', '_blank');
        }
      }
    }

    startInertia(initialVelocityRadPerSec) {
      // Ignore tiny velocities
      if (!isFinite(initialVelocityRadPerSec) || Math.abs(initialVelocityRadPerSec) < 0.05) return;
      this.stopInertia();
      this._inertiaVelocity = initialVelocityRadPerSec;
      this._inertiaLastTs = performance.now();
      const friction = 5.0; // per-second exponential decay
      const minVelocity = 0.05; // rad/s cutoff
      const step = (ts) => {
        const dt = Math.max(0, (ts - this._inertiaLastTs) / 1000);
        this._inertiaLastTs = ts;
        // Apply rotation
        this.state.rotation += this._inertiaVelocity * dt;
        // Mark that this is a manual rotation continuation (inertia), so event list should update
        this._shouldUpdateEventList = true;
        // Try snap if near boundary
        if (this.snapIfClose()) {
          this.stopInertia();
          this.drawSpiral();
          return;
        }
        // Update UI slider
        const rotateSlider = document.getElementById('rotateSlider');
        if (rotateSlider) {
          let degrees = this.state.rotation * 180 / Math.PI;
          rotateSlider.value = degrees % 360;
          const rotateVal = document.getElementById('rotateVal');
          if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
        }
        // Redraw
        this.drawSpiral();
        // Exponential damping
        this._inertiaVelocity *= Math.exp(-friction * dt);
        if (Math.abs(this._inertiaVelocity) < minVelocity) {
          // Final snap if close enough when stopping
          this.snapIfClose();
          this.stopInertia();
          this.drawSpiral();
          return;
        }
        this._inertiaAnimationId = requestAnimationFrame(step);
      };
      this._inertiaAnimationId = requestAnimationFrame(step);
    }

  /**
   * Start interval to update rotation to match current time
   */
  startAutoTimeAlign() {
    if (this.autoTimeAlignState.intervalId) return;
  this.autoTimeAlignState.enabled = true;
    this.syncAutoTimeAlignCheckbox();
    this.updateRotationToCurrentTime();
    this.autoTimeAlignState.intervalId = setInterval(() => {
      this.updateRotationToCurrentTime();
    }, 1000); // update every seconds
  }

  /**
   * Stop the auto time align interval
   */
  stopAutoTimeAlign() {
    if (this.autoTimeAlignState.intervalId) {
      clearInterval(this.autoTimeAlignState.intervalId);
      this.autoTimeAlignState.intervalId = null;
    }
  this.autoTimeAlignState.enabled = false;
    this.syncAutoTimeAlignCheckbox();
  }
  
  /**
   * Synchronize the checkbox state with the internal state
   */
  syncAutoTimeAlignCheckbox() {
    const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
    if (autoTimeAlignCheckbox) {
      autoTimeAlignCheckbox.checked = this.autoTimeAlignState.enabled;
    }
  }
  
  syncThresholdControls() {
    // Update slider values and displays to match current thresholds
    const betaSlider = document.getElementById('betaThresholdSlider');
    const gammaSlider = document.getElementById('gammaThresholdSlider');
    const betaVal = document.getElementById('betaThresholdVal');
    const gammaVal = document.getElementById('gammaThresholdVal');
    
    if (betaSlider && betaVal) {
      betaSlider.value = this.deviceOrientationThresholds.beta;
      betaVal.textContent = this.deviceOrientationThresholds.beta + '°';
    }
    
    if (gammaSlider && gammaVal) {
      gammaSlider.value = this.deviceOrientationThresholds.gamma;
      gammaVal.textContent = this.deviceOrientationThresholds.gamma + '°';
    }
    
    // Show/hide threshold controls based on device orientation state
    const thresholdControls = document.getElementById('deviceOrientationControls');
    if (thresholdControls) {
      thresholdControls.style.display = this.deviceOrientationState.enabled ? 'block' : 'none';
    }
  }

  /**
   * Save events to localStorage
   */
  saveEventsToStorage() {
    try {
      const eventsData = this.events.map(event => ({
        ...event,
        start: event.start.toISOString(),
        end: event.end.toISOString()
      }));
      localStorage.setItem('spiralCalendarEvents', JSON.stringify(eventsData));
    } catch (error) {
      console.warn('Failed to save events to localStorage:', error);
    }
  }

  /**
   * Load events from localStorage
   */
  loadEventsFromStorage() {
    try {
      const stored = localStorage.getItem('spiralCalendarEvents');
      if (stored) {
        const eventsData = JSON.parse(stored);
        this.events = eventsData.map(event => ({
          ...event,
          start: new Date(event.start),
          end: new Date(event.end)
        }));
        // Ensure each event has a calendar tag and persistent UID
        this.events.forEach(ev => { 
          if (!ev.calendar) ev.calendar = 'Home';
          if (!ev.persistentUID) {
            ev.persistentUID = generateEventUID(ev);
          }
          // Keep existing addedToCalendar state; don't reset on load
          if (!ev.lastModified) {
            ev.lastModified = Date.now();
          }
          if (!ev.lastAddedToCalendar) {
            ev.lastAddedToCalendar = null;
          }
        });
        this._eventsVersion++; // Trigger layout cache rebuild
        // Draw the spiral immediately with loaded events
        this.drawSpiral();
        return true;
      }
    } catch (error) {
      console.warn('Failed to load events from localStorage:', error);
    }
    return false;
  }

  /**
   * Save settings to localStorage
   */
  saveSettingsToStorage() {
    try {
      const settingsToSave = {
        days: this.state.days,
        // Only save original values if auto-activation is active, otherwise save current values
        radiusExponent: this.state.originalRadiusExponent !== null ? this.state.originalRadiusExponent : this.state.radiusExponent,
        rotation: this.state.rotation,
        staticMode: this.state.staticMode,
        showHourNumbers: this.state.showHourNumbers,
        showDayNumbers: this.state.showDayNumbers,
        showMonthNumbers: this.state.showMonthNumbers,
        showMonthNames: this.state.showMonthNames,
        showYearNumbers: this.state.showYearNumbers,
        showTooltip: this.state.showTooltip,
        hourNumbersOutward: this.state.hourNumbersOutward,
        // Only save original value if auto-activation is active, otherwise save current value
        hourNumbersInsideSegment: this.state.autoInsideSegmentNumbers ? false : this.state.hourNumbersInsideSegment,
        hourNumbersUpright: this.state.hourNumbersUpright,
        dayNumbersUpright: this.state.dayNumbersUpright,
        monthNumbersUpright: this.state.monthNumbersUpright,
        showEverySixthHour: this.state.showEverySixthHour,
        hourNumbersStartAtOne: this.state.hourNumbersStartAtOne,
        hourNumbersPosition: this.state.hourNumbersPosition,
        showNightOverlay: this.state.showNightOverlay,
        showDayOverlay: this.state.showDayOverlay,
        showGradientOverlay: this.state.showGradientOverlay,
        showTimeDisplay: this.state.originalTimeDisplay !== null ? this.state.originalTimeDisplay : this.state.showTimeDisplay,
        showSegmentEdges: this.state.showSegmentEdges,
        showArcLines: this.state.showArcLines,
        overlayStackMode: this.state.overlayStackMode,
        audioFeedbackEnabled: this.state.audioFeedbackEnabled,
        textClippingEnabled: this.state.textClippingEnabled,
        darkMode: this.state.darkMode,
        calendars: this.state.calendars,
        selectedCalendar: this.state.selectedCalendar,
        visibleCalendars: this.state.visibleCalendars,
        calendarColors: this.state.calendarColors,
        deviceOrientationEnabled: this.deviceOrientationState.enabled,
        betaThreshold: this.deviceOrientationThresholds.beta,
        gammaThreshold: this.deviceOrientationThresholds.gamma,
        colorMode: this.state.colorMode,
        baseHue: this.state.baseHue,
        singleColor: this.state.singleColor,
        dayLabelShowWeekday: this.state.dayLabelShowWeekday,
        dayLabelShowMonth: this.state.dayLabelShowMonth,
        dayLabelShowYear: this.state.dayLabelShowYear,
        dayLabelUseShortNames: this.state.dayLabelUseShortNames,
        dayLabelUseShortMonth: this.state.dayLabelUseShortMonth,
        dayLabelUseShortYear: this.state.dayLabelUseShortYear,
        dayLabelMonthOnFirstOnly: this.state.dayLabelMonthOnFirstOnly,
        dayLabelYearOnFirstOnly: this.state.dayLabelYearOnFirstOnly,
        dayLabelUseOrdinal: this.state.dayLabelUseOrdinal,
        eventListColorStyle: this.state.eventListColorStyle,
        // Dev mode line toggles
        showMonthLines: this.state.showMonthLines,
        showMidnightLines: this.state.showMidnightLines,
        showNoonLines: this.state.showNoonLines,
        showSixAmPmLines: this.state.showSixAmPmLines,
        // Overlay opacity values
        nightOverlayOpacity: this.state.nightOverlayOpacity,
        dayOverlayOpacity: this.state.dayOverlayOpacity,
        gradientOverlayOpacity: this.state.gradientOverlayOpacity,
      };
      localStorage.setItem('spiralCalendarSettings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * Load settings from localStorage
   */
  loadSettingsFromStorage() {
    try {
      const stored = localStorage.getItem('spiralCalendarSettings');
      if (stored) {
        const settings = JSON.parse(stored);
        
        // Apply loaded settings to state
        Object.keys(settings).forEach(key => {
          if (key === 'deviceOrientationEnabled') {
            this.deviceOrientationState.enabled = settings[key];
            this.deviceOrientationState.buttonVisible = settings[key];
          } else if (key === 'betaThreshold') {
            this.deviceOrientationThresholds.beta = settings[key];
          } else if (key === 'gammaThreshold') {
            this.deviceOrientationThresholds.gamma = settings[key];
          } else if (key === 'textClippingEnabled') {
            this.state.textClippingEnabled = settings[key];
          } else if (key === 'circleMode') {
            // Skip circleMode - always start in spiral mode
            return;
          } else if (key === 'spiralScale') {
            // Skip spiralScale - always use default value, don't load from storage
            return;
          } else if (this.state.hasOwnProperty(key)) {
            this.state[key] = settings[key];
          }
        });

        // Apply dark mode class after loading
        try {
          document.body.classList.toggle('dark-mode', !!this.state.darkMode);
        } catch (_) {}
        this.updateThemeColor();

        // Backfill calendars if missing from older storage
        if (!Array.isArray(this.state.calendars) || this.state.calendars.length === 0) {
          this.state.calendars = this.defaultSettings.calendars.slice();
        }
        if (!Array.isArray(this.state.visibleCalendars) || this.state.visibleCalendars.length === 0) {
          this.state.visibleCalendars = this.state.calendars.slice();
        }
        if (!this.state.selectedCalendar || !this.state.calendars.includes(this.state.selectedCalendar)) {
          this.state.selectedCalendar = this.defaultSettings.selectedCalendar;
        }
        
        // Backfill calendarColors if missing from older storage
        if (!this.state.calendarColors || typeof this.state.calendarColors !== 'object') {
          this.state.calendarColors = JSON.parse(JSON.stringify(this.defaultSettings.calendarColors));
        }
        // Ensure all existing calendars have colors (use random colors if missing)
        this.state.calendars.forEach(calName => {
          if (!this.state.calendarColors[calName]) {
            // Generate a random color for missing calendars
            const hue = Math.random() * 360;
            this.state.calendarColors[calName] = this.hslToHex(`hsl(${hue}, 70%, 60%)`);
          }
        });
        
        // Backfill eventListColorStyle if missing from older storage
        if (!this.state.eventListColorStyle || (this.state.eventListColorStyle !== 'row' && this.state.eventListColorStyle !== 'dot')) {
          this.state.eventListColorStyle = this.defaultSettings.eventListColorStyle;
        }
        
        return true;
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return false;
  }

  /**
   * Reset all settings to defaults
   */
  resetSettingsToDefaults() {
    // Reset state
    Object.keys(this.defaultSettings).forEach(key => {
      if (key === 'deviceOrientationEnabled') {
        this.deviceOrientationState.enabled = this.defaultSettings[key];
        this.deviceOrientationState.buttonVisible = this.defaultSettings[key];
      } else if (key === 'betaThreshold') {
        this.deviceOrientationThresholds.beta = this.defaultSettings[key];
      } else if (key === 'gammaThreshold') {
        this.deviceOrientationThresholds.gamma = this.defaultSettings[key];
      } else if (key === 'textClippingEnabled') {
        this.state.textClippingEnabled = this.defaultSettings[key];
      } else if (this.state.hasOwnProperty(key)) {
        this.state[key] = this.defaultSettings[key];
      }
    });
    
    // Reset rotation slider max value
    const rotateMaxSlider = document.getElementById('rotateMaxSlider');
    if (rotateMaxSlider) {
      rotateMaxSlider.value = 720;
      const rotateMaxVal = document.getElementById('rotateMaxVal');
      if (rotateMaxVal) rotateMaxVal.textContent = '720°';
    }
    
    // Sync all UI controls
    this.syncAllUIControls();
    // Apply dark mode class
    try { document.body.classList.toggle('dark-mode', !!this.state.darkMode); } catch(_) {}
    this.updateThemeColor();
    
    // Update audio icon for dark mode
    const audioFeedbackIcon = document.getElementById('audioFeedbackIcon');
    if (audioFeedbackIcon) {
      updateAudioIcon(audioFeedbackIcon, this.state.audioFeedbackEnabled);
    }
    
    // Update location button icons for dark mode
    if (typeof updateLocationButtonIcons === 'function') {
      updateLocationButtonIcons();
    }
    
    // Save the reset settings
    this.saveSettingsToStorage();
    
    // Reset A2HS banner dismissal state
    try { localStorage.removeItem('a2hsDismissed'); } catch (_) {}
    
    // Redraw
    this.drawSpiral();
  }
  /**
   * Sync all UI controls with current settings
   */
  syncAllUIControls() {
    // Sliders with value displays
    const controls = [
      { slider: 'daysSlider', value: this.state.days, display: 'daysVal' },
      { slider: 'scaleSlider', value: this.state.spiralScale, display: 'scaleVal' },
      { slider: 'radiusSlider', value: this.state.radiusExponent, display: 'radiusVal' },
      { slider: 'rotateSlider', value: this.state.rotation * 180 / Math.PI, display: 'rotateVal', suffix: '°' },
      { slider: 'hourNumbersPositionSlider', value: this.state.hourNumbersPosition, display: 'hourNumbersPositionVal' },
      { slider: 'betaThresholdSlider', value: this.deviceOrientationThresholds.beta, display: 'betaThresholdVal', suffix: '°' },
      { slider: 'gammaThresholdSlider', value: this.deviceOrientationThresholds.gamma, display: 'gammaThresholdVal', suffix: '°' },
    ];
    
    controls.forEach(control => {
      const slider = document.getElementById(control.slider);
      const display = document.getElementById(control.display);
      if (slider) {
        slider.value = control.value;
      }
      if (display) {
        display.textContent = control.value + (control.suffix || '');
      }
    });
    
    // Checkboxes
    const checkboxes = [
      { id: 'staticMode', value: this.state.staticMode },
      { id: 'showHourNumbers', value: this.state.showHourNumbers },
      { id: 'showDayNumbers', value: this.state.showDayNumbers },
      { id: 'showMonthNumbers', value: this.state.showMonthNumbers },
      { id: 'showMonthNames', value: this.state.showMonthNames },
      { id: 'showYearNumbers', value: this.state.showYearNumbers },
      { id: 'tooltipToggle', value: this.state.showTooltip },
      { id: 'darkModeToggle', value: this.state.darkMode },
      { id: 'hourNumbersOutward', value: this.state.hourNumbersOutward },
      { id: 'hourNumbersInsideSegment', value: this.state.hourNumbersInsideSegment },
      { id: 'hourNumbersUpright', value: this.state.hourNumbersUpright },
      { id: 'dayNumbersUpright', value: this.state.dayNumbersUpright },
      { id: 'hideDayWhenHourInside', value: this.state.hideDayWhenHourInside },
      { id: 'monthNumbersUpright', value: this.state.monthNumbersUpright },
      { id: 'showEverySixthHour', value: this.state.showEverySixthHour },
      { id: 'hourNumbersStartAtOne', value: this.state.hourNumbersStartAtOne },
      { id: 'dayLabelShowWeekday', value: this.state.dayLabelShowWeekday },
      { id: 'dayLabelShowMonth', value: this.state.dayLabelShowMonth },
      { id: 'dayLabelShowYear', value: this.state.dayLabelShowYear },
      { id: 'dayLabelUseShortMonth', value: this.state.dayLabelUseShortMonth },
      { id: 'dayLabelUseShortYear', value: this.state.dayLabelUseShortYear },
      { id: 'dayLabelMonthOnFirstOnly', value: this.state.dayLabelMonthOnFirstOnly },
      { id: 'dayLabelYearOnFirstOnly', value: this.state.dayLabelYearOnFirstOnly },
      { id: 'dayLabelUseOrdinal', value: this.state.dayLabelUseOrdinal },
      { id: 'nightOverlayToggle', value: this.state.showNightOverlay },
      { id: 'dayOverlayToggle', value: this.state.showDayOverlay },
      { id: 'gradientOverlayToggle', value: this.state.showGradientOverlay },
      { id: 'segmentEdgesToggle', value: this.state.showSegmentEdges },
      { id: 'arcLinesToggle', value: this.state.showArcLines },
      { id: 'overlayStackMode', value: this.state.overlayStackMode },
      { id: 'textClippingToggle', value: this.state.textClippingEnabled },
      { id: 'deviceOrientationToggle', value: this.deviceOrientationState.enabled },
    ];
    
    checkboxes.forEach(checkbox => {
      const element = document.getElementById(checkbox.id);
      if (element) {
        element.checked = checkbox.value;
      }
    });

    // Event color mode composite controls
    const colorModeSelect = document.getElementById('colorModeSelect');
    if (colorModeSelect) colorModeSelect.value = this.state.colorMode;
    const singleColorInput = document.getElementById('singleColorInput');
    if (singleColorInput) singleColorInput.value = this.state.singleColor || '#4CAF50';
    const baseHueSlider = document.getElementById('baseHueSlider');
    const baseHueVal = document.getElementById('baseHueVal');
    if (baseHueSlider && baseHueVal) {
      baseHueSlider.value = String(this.state.baseHue ?? 200);
      baseHueVal.textContent = String(this.state.baseHue ?? 200);
    }
    
    // Update color mode visibility after setting values
    const singleColorWrapper = document.getElementById('singleColorWrapper');
    const baseHueWrapper = document.getElementById('baseHueWrapper');
    if (singleColorWrapper && baseHueWrapper && colorModeSelect) {
      const mode = this.state.colorMode;
      singleColorWrapper.style.display = (mode === 'single' || mode === 'monoHue') ? '' : 'none';
      baseHueWrapper.style.display = mode === 'monoHue' ? '' : 'none';
    }
    
    // Manually sync circleMode checkbox (not persisted, always starts false)
    const circleModeCheckbox = document.getElementById('circleMode');
    if (circleModeCheckbox) {
      circleModeCheckbox.checked = this.state.circleMode;
    }
    
    // Update sub-options visibility
    const hourNumbersControls = document.getElementById('hourNumbersControls');
    if (hourNumbersControls) {
      hourNumbersControls.style.display = (this.state.showHourNumbers && DEV_MODE) ? 'block' : 'none';
    }
    
    const dayNumbersControls = document.getElementById('dayNumbersControls');
    if (dayNumbersControls) {
      dayNumbersControls.style.display = (this.state.showDayNumbers && DEV_MODE) ? 'block' : 'none';
    }
    // Sync day label short-name toggle
    const dayLabelUseShortNames = document.getElementById('dayLabelUseShortNames');
    if (dayLabelUseShortNames) dayLabelUseShortNames.checked = !!this.state.dayLabelUseShortNames;
    
    const monthNumbersControls = document.getElementById('monthNumbersControls');
    if (monthNumbersControls) {
      monthNumbersControls.style.display = (this.state.showMonthNumbers && DEV_MODE) ? 'block' : 'none';
    }
    // Ensure day label weekday/month/year sub-options visibility
    const dayLabelWeekdaySubOptions = document.getElementById('dayLabelWeekdaySubOptions');
    if (dayLabelWeekdaySubOptions) dayLabelWeekdaySubOptions.style.display = this.state.dayLabelShowWeekday ? 'flex' : 'none';
    const dayLabelMonthSubOptions = document.getElementById('dayLabelMonthSubOptions');
    if (dayLabelMonthSubOptions) dayLabelMonthSubOptions.style.display = this.state.dayLabelShowMonth ? 'flex' : 'none';
    const dayLabelYearSubOptions = document.getElementById('dayLabelYearSubOptions');
    if (dayLabelYearSubOptions) dayLabelYearSubOptions.style.display = this.state.dayLabelShowYear ? 'flex' : 'none';
    
    const eventListColorStyleToggle = document.getElementById('eventListColorStyleToggle');
    if (eventListColorStyleToggle) {
      eventListColorStyleToggle.checked = this.state.eventListColorStyle === 'row';
    }

    // Sync dev mode line toggle states
    const showMonthLinesToggle = document.getElementById('showMonthLinesToggle');
    if (showMonthLinesToggle) {
      showMonthLinesToggle.checked = this.state.showMonthLines;
    }

    const showMidnightLinesToggle = document.getElementById('showMidnightLinesToggle');
    if (showMidnightLinesToggle) {
      showMidnightLinesToggle.checked = this.state.showMidnightLines;
    }

    const showNoonLinesToggle = document.getElementById('showNoonLinesToggle');
    if (showNoonLinesToggle) {
      showNoonLinesToggle.checked = this.state.showNoonLines;
    }

    const showSixAmPmLinesToggle = document.getElementById('showSixAmPmLinesToggle');
    if (showSixAmPmLinesToggle) {
      showSixAmPmLinesToggle.checked = this.state.showSixAmPmLines;
    }
    
    const deviceOrientationControls = document.getElementById('deviceOrientationControls');
    if (deviceOrientationControls) {
      deviceOrientationControls.style.display = (this.deviceOrientationState.enabled && DEV_MODE) ? 'block' : 'none';
    }
    
    // Sync overlay opacity sliders and show/hide controls
    const nightOverlayOpacitySlider = document.getElementById('nightOverlayOpacitySlider');
    const nightOverlayOpacityVal = document.getElementById('nightOverlayOpacityVal');
    if (nightOverlayOpacitySlider && nightOverlayOpacityVal) {
      const opacityPercent = Math.round(this.state.nightOverlayOpacity * 100);
      nightOverlayOpacitySlider.value = opacityPercent;
      nightOverlayOpacityVal.textContent = opacityPercent + '%';
    }
    const nightOverlayOpacityControls = document.getElementById('nightOverlayOpacityControls');
    if (nightOverlayOpacityControls) {
      nightOverlayOpacityControls.style.display = this.state.showNightOverlay ? 'block' : 'none';
    }
    
    const dayOverlayOpacitySlider = document.getElementById('dayOverlayOpacitySlider');
    const dayOverlayOpacityVal = document.getElementById('dayOverlayOpacityVal');
    if (dayOverlayOpacitySlider && dayOverlayOpacityVal) {
      const opacityPercent = Math.round(this.state.dayOverlayOpacity * 100);
      dayOverlayOpacitySlider.value = opacityPercent;
      dayOverlayOpacityVal.textContent = opacityPercent + '%';
    }
    const dayOverlayOpacityControls = document.getElementById('dayOverlayOpacityControls');
    if (dayOverlayOpacityControls) {
      dayOverlayOpacityControls.style.display = this.state.showDayOverlay ? 'block' : 'none';
    }
    
    const gradientOverlayOpacitySlider = document.getElementById('gradientOverlayOpacitySlider');
    const gradientOverlayOpacityVal = document.getElementById('gradientOverlayOpacityVal');
    if (gradientOverlayOpacitySlider && gradientOverlayOpacityVal) {
      const opacityPercent = Math.round(this.state.gradientOverlayOpacity * 100);
      gradientOverlayOpacitySlider.value = opacityPercent;
      gradientOverlayOpacityVal.textContent = opacityPercent + '%';
    }
    const gradientOverlayOpacityControls = document.getElementById('gradientOverlayOpacityControls');
    if (gradientOverlayOpacityControls) {
      gradientOverlayOpacityControls.style.display = this.state.showGradientOverlay ? 'block' : 'none';
    }
    
    // Special case: hour numbers position display text
    const positionTexts = ['-0.5', '0', '+0.5'];
    const hourNumbersPositionVal = document.getElementById('hourNumbersPositionVal');
    if (hourNumbersPositionVal) {
      hourNumbersPositionVal.textContent = positionTexts[this.state.hourNumbersPosition] || 'End';
    }
    
    // Initialize audio icon
    const audioFeedbackIcon = document.getElementById('audioFeedbackIcon');
    if (audioFeedbackIcon) {
      updateAudioIcon(audioFeedbackIcon, this.state.audioFeedbackEnabled);
    }
  }

  /**
 * Set rotation so current hour is at the bottom (using UTC)
   */
  updateRotationToCurrentTime() {
    const now = new Date();
  // Ensure we're using UTC time consistently
  const currentHour = now.getUTCHours() + TIMEZONE_OFFSET + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const rotation = (currentHour / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
    this.state.rotation = rotation;
    // Update the rotateSlider UI to match
    const rotateSlider = document.getElementById('rotateSlider');
    if (rotateSlider) {
      const degrees = rotation * 180 / Math.PI;
      rotateSlider.value = degrees;
      const rotateVal = document.getElementById('rotateVal');
      if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
    }
    this.drawSpiral();
  }

  /**
   * Adjust spiral scale when switching to circle mode to keep selected segment at same radius
   */
  alignSelectedSegmentInCircleMode() {
    if (!this.mouseState.selectedSegment) return;
    
    // Store the original spiral scale before making adjustments
    if (this._originalSpiralScale === null) {
      this._originalSpiralScale = this.state.spiralScale;
    }
    
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const segment = this.mouseState.selectedSegment;
    
    // Calculate the radius the selected segment had in spiral mode
    const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
    const currentMaxRadius = Math.min(canvasWidth, canvasHeight) * this._originalSpiralScale;
    const spiralRadiusFunction = this.createRadiusFunction(currentMaxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
    
    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
    const spiralRadius = spiralRadiusFunction(segmentTheta);
    
    // In circle mode, all segments of a day share the same radius
    // We want the day ring to have the same radius as the selected segment had in spiral mode
    const dayTheta = segment.day * 2 * Math.PI;
    
    // For circle mode with discrete rings, we need to calculate what scale would make
    // the discrete ring for this day match the spiral radius
    const adjustedTheta = dayTheta + this.state.rotation;
    const daysInTheta = adjustedTheta / (2 * Math.PI);
    const roundedDays = Math.ceil(daysInTheta); // Use same logic as circle mode
    const discreteT = Math.max(0, Math.min(1, roundedDays / this.state.days));
    
    if (discreteT > 0) {
      const targetMaxRadius = spiralRadius / Math.pow(discreteT, this.state.radiusExponent);
      const newSpiralScale = targetMaxRadius / Math.min(canvasWidth, canvasHeight);
      
      // Clamp to reasonable bounds
      const minScale = 0.1;
      const maxScale = 1.0;
      this.state.spiralScale = Math.max(minScale, Math.min(maxScale, newSpiralScale));
      
      // Update the UI slider
      const scaleSlider = document.getElementById('scaleSlider');
      if (scaleSlider) {
        scaleSlider.value = this.state.spiralScale;
        const scaleVal = document.getElementById('scaleVal');
        if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
      }
    }
  }
  
  /**
   * Draw start/end handle indicators for the currently selected event.
   * One handle at the exact start timestamp, one at the exact end timestamp.
   * For multi-segment events, only a single start and a single end handle are drawn.
   */
  drawSelectedEventHandles() {
    // Only show when an event is selected (detail mode) and a segment is selected
    if (this.state.detailMode === null || !this.mouseState.selectedSegment) return;
    
    // Reset cached handle hit areas
    this.handleHandles = null;
    
    // Resolve the selected event from the selected segment and selectedEventIndex
    const seg = this.mouseState.selectedSegment;
    const eventsHere = this.getAllEventsForSegment(seg.day, seg.segment);
    if (!eventsHere || eventsHere.length === 0) return;
    const idx = Math.min(this.mouseState.selectedEventIndex || 0, eventsHere.length - 1);
    const selectedEvent = eventsHere[idx] && eventsHere[idx].event ? eventsHere[idx].event : null;
    if (!selectedEvent) return;
    
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
    const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    
    // Compute the on-spiral handle position for a given UTC date
    const computeHandlePosition = (date, isEnd) => {
      const d = new Date(date);
      // If end is exactly on an hour boundary, nudge slightly backward to stay within the last covered hour
      if (isEnd && d.getUTCHours !== undefined &&
          d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
        d.setTime(d.getTime() - 1);
      }
      const diffHours = (d - this.referenceTime) / (1000 * 60 * 60);
      const segmentId = Math.floor(diffHours);
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const absPos = totalVisibleSegments - segmentId - 1;
      const day = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
      const segment = absPos - day * CONFIG.SEGMENTS_PER_DAY;
      
      const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
      const minuteFrac = (d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000) / 60;
      const th = rawStartAngle + (1 - minuteFrac) * segmentAngle;
      
      // Default radial slice is full segment thickness; refine if we can find event slice for this hour
      let rInner = radiusFunction(th);
      let rOuter = radiusFunction(th + 2 * Math.PI);
      
      // Try to align handle radially with the selected event's slice in that hour
      const es = this.eventSegments.find(es =>
        es.day === day && es.segment === segment && es.event === selectedEvent
      );
      if (es) {
        const h = rOuter - rInner;
        const sliceStart = (es.eventSliceStart != null) ? es.eventSliceStart : 0;
        const sliceEnd = (es.eventSliceEnd != null) ? es.eventSliceEnd : 1;
        rInner = rInner + sliceStart * h;
        rOuter = rInner + (sliceEnd - sliceStart) * h;
      }
      
      const rMid = (rInner + rOuter) * 0.5;
      const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = rMid * Math.cos(ang);
      const y = rMid * Math.sin(ang);
      return { x, y };
    };
    
    const startPos = computeHandlePosition(selectedEvent.start, false);
    const endPos = computeHandlePosition(selectedEvent.end, true);
    
    // Draw small circular handles with the event color stroke and white fill
    const eventColor = this.getDisplayColorForEvent(selectedEvent) || '#000';
    const isStartHovered = this.mouseState.hoveredHandle === 'start';
    const isEndHovered = this.mouseState.hoveredHandle === 'end';
    const baseHandleRadius = 6;
    const hoverExtra = 3;
    const startRadius = baseHandleRadius + (isStartHovered ? hoverExtra : 0);
    const endRadius = baseHandleRadius + (isEndHovered ? hoverExtra : 0);
    
    this.ctx.save();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = eventColor;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = 'rgba(0,0,0,0.25)';
    this.ctx.shadowBlur = 2;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 1;
    
    // Start handle
    this.ctx.beginPath();
    this.ctx.arc(startPos.x, startPos.y, startRadius, 0, 2 * Math.PI);
    this.ctx.fill();
    this.ctx.stroke();
    
    // End handle
    this.ctx.beginPath();
    this.ctx.arc(endPos.x, endPos.y, endRadius, 0, 2 * Math.PI);
    this.ctx.fill();
    this.ctx.stroke();
    
    this.ctx.restore();
    
    // Cache hit areas in spiral-centered coordinate system (same used in drawing)
    this.handleHandles = {
      start: { x: startPos.x, y: startPos.y, r: startRadius },
      end: { x: endPos.x, y: endPos.y, r: endRadius }
    };
  }
/**
 * Calculate the info circle radius for the current selected segment
 */
getInfoCircleRadius(maxRadius) {
  if (!this.mouseState.selectedSegment) return 0;
  
  const canvasWidth = this.canvas.clientWidth;
  const canvasHeight = this.canvas.clientHeight;
  const { thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
  const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
  
  const segment = this.mouseState.selectedSegment;
  if (this.state.circleMode) {
    // All segments of a day share the same radius in circle mode
    const day = segment.day;
    return radiusFunction(day * 2 * Math.PI);
  } else {
    // Spiral mode: use the segment's theta
    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
    return radiusFunction(segmentTheta);
    }
  }

  /**
   * Restore the original spiral scale when exiting circle mode
   */
  restoreOriginalSpiralScale() {
    if (this._originalSpiralScale !== null) {
      this.state.spiralScale = this._originalSpiralScale;
      this._originalSpiralScale = null; // Reset the stored value
      
      // Update the UI slider
      const scaleSlider = document.getElementById('scaleSlider');
      if (scaleSlider) {
        scaleSlider.value = this.state.spiralScale;
        const scaleVal = document.getElementById('scaleVal');
        if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
      }
    }
  }

  /**
   * Reset all temporary auto-activated settings (radius, scale, time display,
   * inside-segment numbers) and sync related UI controls. Also resets the
   * past-limit scroll counter. Triggers a redraw if anything changed.
   */
  resetAutoActivatedSettings() {
    let needsRedraw = false;
    
    // Restore original scale if it was stored
    if (this.state.originalSpiralScale !== null) {
      this.state.spiralScale = this.state.originalSpiralScale;
      this.state.originalSpiralScale = null;
      
      const scaleSlider = document.getElementById('scaleSlider');
      if (scaleSlider) {
        scaleSlider.value = this.state.spiralScale;
        const scaleVal = document.getElementById('scaleVal');
        if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
      }
      needsRedraw = true;
    }
    
    // Restore original radius exponent if it was stored
    if (this.state.originalRadiusExponent !== null) {
      this.state.radiusExponent = this.state.originalRadiusExponent;
      this.state.originalRadiusExponent = null;
      
      const radiusSlider = document.getElementById('radiusSlider');
      if (radiusSlider) {
        radiusSlider.value = this.state.radiusExponent;
        const radiusVal = document.getElementById('radiusVal');
        if (radiusVal && this.state.radiusExponent !== null && this.state.radiusExponent !== undefined) {
          radiusVal.textContent = this.state.radiusExponent.toString();
        }
      }
      needsRedraw = true;
    }
    
    // Restore original time display if it was stored
    if (this.state.originalTimeDisplay !== null) {
      this.state.showTimeDisplay = this.state.originalTimeDisplay;
      this.state.originalTimeDisplay = null;
      
      const timeDisplayCheckbox = document.getElementById('timeDisplayToggle');
      if (timeDisplayCheckbox) {
        timeDisplayCheckbox.checked = this.state.showTimeDisplay;
      }
      needsRedraw = true;
    }
    
    // Reset auto-activated inside segment numbers
    if (this.state.autoInsideSegmentNumbers) {
      this.state.autoInsideSegmentNumbers = false;
      this.state.hourNumbersInsideSegment = false;
      
      const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
      if (insideSegmentCheckbox) {
        insideSegmentCheckbox.checked = false;
      }
      needsRedraw = true;
    }
    
    // Reset scroll counter
    this.state.pastLimitScrollCount = 0;
    
    if (needsRedraw) {
      this.drawSpiral();
    }
  }

  /**
   * Draw clickable date/time and color boxes on canvas
   */
  drawDateTimeAndColorBoxes(event, centerX, dateTimeY, baseFontSize, circleRadius, buttonY = null) {
    // Make boxes smaller and arrange side by side like in Event Panel
    const boxWidth = circleRadius * 0.75; // Much smaller width for compact layout
    const boxHeight = baseFontSize * 1.8; // Slightly smaller height
    const fontSize = baseFontSize * 0.9; // Slightly smaller font for compact boxes
    const boxSpacing = boxWidth * 0.2; // Horizontal spacing between boxes
    const totalWidth = (boxWidth * 2) + boxSpacing; // Total width for both boxes
    
    // Start date box (left side)
    const startBoxX = centerX - totalWidth / 2 + boxWidth / 2;
    const isHoverStart = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: startBoxX - boxWidth / 2, y: dateTimeY - boxHeight / 2, width: boxWidth, height: boxHeight });
    this.drawClickableBox(startBoxX, dateTimeY, boxWidth, boxHeight, 
                         this.formatDateTimeCompact(new Date(event.start)), fontSize, '#f0f0f0', isHoverStart);
    this.canvasClickAreas.startDateBox = {
      x: startBoxX - boxWidth / 2,
      y: dateTimeY - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
      event: event
    };
    
    // End date box (right side)
    const endBoxX = centerX + totalWidth / 2 - boxWidth / 2;
    const isHoverEnd = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: endBoxX - boxWidth / 2, y: dateTimeY - boxHeight / 2, width: boxWidth, height: boxHeight });
    this.drawClickableBox(endBoxX, dateTimeY, boxWidth, boxHeight, 
                         this.formatDateTimeCompact(new Date(event.end)), fontSize, '#f0f0f0', isHoverEnd);
    this.canvasClickAreas.endDateBox = {
      x: endBoxX - boxWidth / 2,
      y: dateTimeY - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
      event: event
    };
    
    // Small connector between start and end boxes
    const dashLength = boxSpacing * 1.0; // Scale with box spacing
    this.ctx.strokeStyle = '#ccc'; // Same color as box borders
    this.ctx.lineWidth = 1; // Same line width as box borders
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - dashLength / 2, dateTimeY);
    this.ctx.lineTo(centerX + dashLength / 2, dateTimeY);
    this.ctx.stroke();
    
    // Calendar selection box (centered between date boxes and buttons)
    const calendarBoxY = buttonY ? (dateTimeY + buttonY) / 2 : dateTimeY + boxHeight + boxSpacing;
    const calendarText = event.calendar || 'Home';
    const calendarBoxWidth = boxWidth; // Same width as date boxes
    const calendarBoxHeight = boxHeight; // Same height as date boxes
    const calendarFontSize = fontSize; // Same font size as date boxes
    
    const isHoverCalendar = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: centerX - calendarBoxWidth / 2, y: calendarBoxY - calendarBoxHeight / 2, width: calendarBoxWidth, height: calendarBoxHeight });
    this.drawClickableBox(centerX, calendarBoxY, calendarBoxWidth, calendarBoxHeight, 
                         `${calendarText}`, calendarFontSize, '#ffffff', isHoverCalendar);
    this.canvasClickAreas.calendarBox = {
      x: centerX - calendarBoxWidth / 2,
      y: calendarBoxY - calendarBoxHeight / 2,
      width: calendarBoxWidth,
      height: calendarBoxHeight,
      event: event
    };
    
    // Color box removed - now using outer ring for color selection
  }

  /**
   * Draw a clickable box on canvas
   */
  drawClickableBox(centerX, centerY, width, height, text, fontSize, backgroundColor = '#f0f0f0', isHovered = false) {
    const x = centerX - width / 2;
    const y = centerY - height / 2;
    
    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeStyle = isHovered ? '#888' : '#ccc';
    this.ctx.lineWidth = isHovered ? 2 : 1;
    this.ctx.strokeRect(x, y, width, height);
    
            // Use white text on dark backgrounds, black on light
      const isLight = backgroundColor === '#f0f0f0' || backgroundColor === '#ffffff';
      this.ctx.fillStyle = isLight ? '#000' : '#fff';
    this.ctx.font = getFontString(fontSize);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    // Truncate text if it's too long to fit in the box
    const maxWidth = width - 10; // Leave 5px padding on each side
    let displayText = text;
    
    if (this.ctx.measureText(text).width > maxWidth) {
      // Binary search to find the longest text that fits
      let left = 0;
      let right = text.length;
      let bestFit = '';
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const testText = text.substring(0, mid) + '...';
        const testWidth = this.ctx.measureText(testText).width;
        
        if (testWidth <= maxWidth) {
          bestFit = testText;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      
      displayText = bestFit || '...';
    }
    
    this.ctx.fillText(displayText, centerX, centerY);
  }

  /**
   * Calculate accurate text height for wrapped text
   */
  calculateTextHeight(text, maxWidth, fontSize) {
    if (!text) return fontSize * 0.5; // Minimal height for empty text
    
    // Set font to get accurate measurements
    this.ctx.font = getFontString(fontSize);
    
    // Wrap text and calculate actual height
    const wrappedText = this.wrapText(text, maxWidth);
    const lineHeight = fontSize * 1.2; // Standard line height multiplier
    const totalHeight = wrappedText.length * lineHeight;
    
    return totalHeight;
  }

  /**
   * Compute Y position for date/time boxes. Centers by default; moves down if description is tall.
   */
  computeDynamicDateTimeY(centerY, circleRadius, baseFontSize, smallFontSize, descriptionY, actualTextHeight, deleteButtonY) {
    const boxHeight = baseFontSize * 1.8;
    const trueCenterY = centerY;
    const descriptionThreshold = smallFontSize * 2.5;
    let dynamicDateTimeY = trueCenterY;
    if (actualTextHeight > descriptionThreshold) {
      const descriptionBottomY = descriptionY + actualTextHeight / 2;
      const spacing = circleRadius * 0.2;
      const minDateTimeY = descriptionBottomY + spacing + (boxHeight / 2);
      const maxDateTimeY = deleteButtonY - circleRadius * 0.4;
      dynamicDateTimeY = Math.min(minDateTimeY, maxDateTimeY);
    }
    return dynamicDateTimeY;
  }

  /**
   * Build description click area, expanding to the space between title and date boxes if empty.
   */
  buildDescriptionClickArea(centerX, descriptionY, circleRadius, baseFontSize, titleY, titleFontSize, dynamicDateTimeY, actualTextHeight, hasDescription) {
    const descAreaWidth = circleRadius * 1.6;
    let clickAreaHeight = actualTextHeight;
    if (!hasDescription) {
      const titleBottomY = titleY + titleFontSize / 2 + 20;
      const dateBoxTopY = dynamicDateTimeY - (baseFontSize * 1.8) / 2;
      clickAreaHeight = Math.max(actualTextHeight, dateBoxTopY - titleBottomY);
    }
    return {
      x: centerX - descAreaWidth / 2,
      y: descriptionY - clickAreaHeight / 2,
      width: descAreaWidth,
      height: clickAreaHeight
    };
  }

  /**
   * Draw a title fitted to available width, returning its measured box.
   */
  drawTitleFitted(text, centerX, titleY, circleRadius, baseTitleFontSize, color = '#000', isBold = true) {
    let fontSize = baseTitleFontSize;
    const maxTitleWidth = circleRadius * 1.4;
    this.ctx.font = getFontString(fontSize, isBold ? 'bold ' : '');
    let metrics = this.ctx.measureText(text);
    if (metrics.width > maxTitleWidth && metrics.width > 0) {
      const scaleFactor = maxTitleWidth / metrics.width;
      fontSize = Math.max(1, Math.floor(fontSize * scaleFactor));
      this.ctx.font = getFontString(fontSize, isBold ? 'bold ' : '');
      metrics = this.ctx.measureText(text);
    }
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, centerX, titleY);
    return { width: metrics.width, height: fontSize, fontSizeUsed: fontSize };
  }

  /**
   * Format date/time for display
   */
  formatDateTime(date) {
  // Format date/time using UTC to avoid DST issues
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
    const hours = pad2(date.getUTCHours());
    const minutes = pad2(date.getUTCMinutes());
  return `${month} ${day}, ${year} ${hours}:${minutes}`;
  }

  /**
   * Format date/time for event circles (compact, no year)
   */
  formatDateTimeCompact(date) {
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
    const day = date.getUTCDate();
    const hours = pad2(date.getUTCHours());
    const minutes = pad2(date.getUTCMinutes());
    return `${month} ${day}, ${hours}:${minutes}`;
  }

  /**
   * UTC time helpers for overlays and labels
   */
  formatUTCHHMM(date) {
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${hours}:${minutes}`;
  }

  dayToOrdinal(n) {
    try {
      const v = Math.abs(parseInt(n, 10)) || 0;
      const j = v % 10, k = v % 100;
      if (k >= 11 && k <= 13) return v + 'th';
      if (j === 1) return v + 'st';
      if (j === 2) return v + 'nd';
      if (j === 3) return v + 'rd';
      return v + 'th';
    } catch (_) {
      return String(n);
    }
  }

  formatUTCDateLong(date) {
  const weekday = WEEKDAYS_UTC[date.getUTCDay()];
  const month = MONTHS_LONG_UTC[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
  }

  formatUTCDateShort(date) {
    const weekday = WEEKDAYS_SHORT_UTC[date.getUTCDay()];
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    return `${weekday}, ${month} ${day}, ${year}`;
    }

  /**
   * Precompute sunrise/sunset per UTC date for the visible window.
   */
  ensureSunTimesCacheForWindow() {
  const windowStart = new Date(this.referenceTime.getTime());
  const windowEnd = new Date(this.referenceTime.getTime() + (this.state.days + 1) * 24 * 60 * 60 * 1000 - 1);
  const coordsKey = `${LOCATION_COORDS.lat},${LOCATION_COORDS.lng}`;
  if (this._sunTimesCache && this._sunTimesCache.coordsKey === coordsKey &&
      this._sunTimesCache.windowStartMs === windowStart.getTime() &&
      this._sunTimesCache.windowEndMs === windowEnd.getTime()) {
    return;
  }
  const byDateKey = new Map();
  const startUTC = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate(), 0, 0, 0, 0));
  const endUTC = new Date(Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth(), windowEnd.getUTCDate(), 0, 0, 0, 0));
  for (let d = new Date(startUTC); d.getTime() <= endUTC.getTime(); d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    try {
      byDateKey.set(key, calculateSunTimes(d));
    } catch (e) {
      byDateKey.set(key, { sunrise: 6, sunset: 18 });
    }
  }
  this._sunTimesCache = { windowStartMs: windowStart.getTime(), windowEndMs: windowEnd.getTime(), coordsKey, byDateKey };
  }

  /**
   * Get sunrise/sunset for a given date using the window cache when possible.
   */
  getSunTimesForDate(date) {
  this.ensureSunTimesCacheForWindow();
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  if (this._sunTimesCache && this._sunTimesCache.byDateKey && this._sunTimesCache.byDateKey.has(key)) {
    return this._sunTimesCache.byDateKey.get(key);
  }
  return calculateSunTimes(date);
  }

  /**
   * Visible window helpers
   */
  visibleWindowStart() {
  return new Date(this.referenceTime.getTime());
  }
  visibleWindowEnd() {
  return new Date(this.referenceTime.getTime() + this.state.days * 24 * 60 * 60 * 1000);
  }

        /**
     * Open native date/time picker
     */
  openDateTimePicker(event, type, anchorBox = null) {
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.style.position = 'fixed';
    // On mobile, always center for reliability
    const isMobile = isMobileDevice();
    if (isMobile) {
    input.style.top = '50%';
    input.style.left = '50%';
    input.style.transform = 'translate(-50%, -50%)';
    } else if (anchorBox) {
      // Desktop: anchor under the clicked canvas box
      const canvasRect = this.canvas.getBoundingClientRect();
      const left = Math.round(canvasRect.left + anchorBox.x);
      const top = Math.round(canvasRect.top + anchorBox.y + anchorBox.height + 2);
      input.style.top = `${Math.min(window.innerHeight - 2, Math.max(0, top))}px`;
      input.style.left = `${Math.min(window.innerWidth - 2, Math.max(0, left))}px`;
    } else {
      input.style.top = '50%';
      input.style.left = '50%';
      input.style.transform = 'translate(-50%, -50%)';
    }
    input.style.zIndex = '10000';
    input.style.opacity = '0.01';
    input.style.pointerEvents = 'auto';
    input.style.width = '2px';
    input.style.height = '2px';
    
    // Convert UTC event time to local time for the input picker
    const eventTime = new Date(type === 'start' ? event.start : event.end);
    // Apply timezone offset to convert from UTC (display) to local time (picker)
    const localTime = new Date(eventTime.getTime() - (TIMEZONE_OFFSET * 60 * 60 * 1000));
    input.value = formatDateTimeLocalForInput(localTime);
    
    document.body.appendChild(input);
    
    // Trigger immediately on mobile to keep user gesture alive; desktop next tick
    const trigger = () => {
      // iOS reliability: click first, then try showPicker
    input.focus();
      try { input.click(); } catch (_) {}
    if (input.showPicker) {
        try { input.showPicker(); } catch (_) {}
      }
    };
    if (isMobile) {
      trigger();
    } else {
      setTimeout(trigger, 0);
    }
    
    const handleChange = () => {
      if (input.value) {
        if (type === 'start') {
        const newStart = parseDateTimeLocalAsUTC(input.value);
          event.start = newStart;
          // Auto-update end time if start time is later than or equal to end time
          if (newStart >= event.end) {
            const newEnd = new Date(newStart);
          newEnd.setUTCHours(newStart.getUTCHours() + 1);
            event.end = newEnd;
          }
        } else {
        const newEnd = parseDateTimeLocalAsUTC(input.value);
          // Prevent end date from being earlier than start date
          if (newEnd < event.start) {
            // Auto-adjust end time to be 1 hour after start time
            const adjustedEnd = new Date(event.start);
          adjustedEnd.setUTCHours(event.start.getUTCHours() + 1);
            event.end = adjustedEnd;
          } else {
            event.end = newEnd;
          }
        }
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._eventCircleHasChanges = true;
        // If this is a virtual event, make sure it's still the active one
        if (event.isVirtual && this.virtualEvent && this.virtualEvent.segmentId === event.segmentId) {
          this.virtualEvent = event; // Update the stored virtual event
        }
        this.drawSpiral();
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);

        // If current selection no longer includes this event, jump to event start
        this._ensureSelectedSegmentContainsEventOrJump(event);
      }
      if (input.parentNode) {
        input.remove();
      }
    };
    
    const handleCancel = () => {
      if (input.parentNode) {
        input.remove();
      }
    };
    
    input.addEventListener('change', handleChange);
    input.addEventListener('blur', () => {
      setTimeout(handleCancel, 100);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
      if (e.key === 'Enter') {
        handleChange();
      }
    });
    
    // Auto-remove after 30 seconds as failsafe
    setTimeout(() => {
      if (input.parentNode) {
        input.remove();
      }
    }, 30000);
  }

  /**
   * Open a native date/time picker and write the result back to a given input element.
   * Mirrors the behavior used in the info circle to ensure iOS compatibility.
   */
  /**
   * Ensure the current selection still contains the event; otherwise jump to its start.
   */
  _ensureSelectedSegmentContainsEventOrJump(event) {
    try {
      if (this.mouseState && this.mouseState.selectedSegment) {
        const seg = this.mouseState.selectedSegment;
        const list = this.getAllEventsForSegment(seg.day, seg.segment);
        if (list && list.some(ei => ei.event === event)) return;
      }
    } catch (_) { /* ignore */ }
    this._jumpToEventStart(event);
  }

  /**
   * Jump selection and rotation to the first hour of the given event (reuse list-click logic).
   */
  _jumpToEventStart(ev) {
    try {
      const eventStart = new Date(ev.start);
      const diffHours = (eventStart - this.referenceTime) / (1000 * 60 * 60);
      const segmentId = diffHours >= 0 ? Math.floor(diffHours) : Math.ceil(diffHours);
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const absPos = totalVisibleSegments - segmentId - 1;
      let newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
      const eventUtcHour = eventStart.getUTCHours();
      const targetSegment = (CONFIG.SEGMENTS_PER_DAY - 1) - eventUtcHour;

      // Update rotation first
      const eventRotation = (diffHours / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
      this.state.rotation = eventRotation;

      // Search nearby days first
      let foundDay = -1;
      const searchRange = 2;
      const startDay = Math.max(0, newDay - searchRange);
      const endDay = Math.min(this.state.days - 1, newDay + searchRange);
      for (let d = startDay; d <= endDay; d++) {
        const list = this.getAllEventsForSegment(d, targetSegment);
        if (list.find(ei => ei.event === ev)) { foundDay = d; break; }
      }
      if (foundDay === -1) {
        for (let d = 0; d < this.state.days; d++) {
          const list = this.getAllEventsForSegment(d, targetSegment);
          if (list.find(ei => ei.event === ev)) { foundDay = d; break; }
        }
      }
      if (foundDay !== -1) newDay = foundDay;

      // Apply selection
      this.mouseState.selectedSegment = { day: newDay, segment: targetSegment };
      const adjustedSegmentId = totalVisibleSegments - (newDay * CONFIG.SEGMENTS_PER_DAY + targetSegment) - 1;
      this.mouseState.selectedSegmentId = adjustedSegmentId;
      const allEvents = this.getAllEventsForSegment(newDay, targetSegment);
      const eventIdx = allEvents.findIndex(ei => ei.event === ev);
      this.mouseState.selectedEventIndex = eventIdx >= 0 ? eventIdx : 0;
      this.state.detailMode = newDay;

      // Disable auto align and sync UI
      if (this.autoTimeAlignState && this.autoTimeAlignState.enabled) {
        this.stopAutoTimeAlign();
      }
      const rotateSlider = document.getElementById('rotateSlider');
      if (rotateSlider) {
        const degrees = eventRotation * 180 / Math.PI;
        rotateSlider.value = degrees;
        const rotateVal = document.getElementById('rotateVal');
        if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
      }

      this.drawSpiral();
    } catch (_) {
      // As a fallback, just redraw
      try { this.drawSpiral(); } catch (_) {}
    }
  }

  openDateTimePickerForInput(inputEl) {
    if (!inputEl) return;
    const temp = document.createElement('input');
    temp.type = 'datetime-local';
    temp.style.position = 'fixed';
    temp.style.top = '50%';
    temp.style.left = '50%';
    temp.style.transform = 'translate(-50%, -50%)';
    temp.style.zIndex = '10000';
    temp.style.opacity = '0.01';
    temp.style.width = '2px';
    temp.style.height = '2px';

    // Seed with current input value if present, else now (rounded to minutes)
    const seed = inputEl.value ? inputEl.value : formatDateTimeLocalForInput(new Date());
    temp.value = seed;

    document.body.appendChild(temp);
    // iOS reliability: click first, then try showPicker
    temp.focus();
    try { temp.click(); } catch (_) {}
    if (temp.showPicker) {
      try { temp.showPicker(); } catch (_) {}
    }

    const applyAndCleanup = () => {
      if (temp.value) {
        inputEl.value = temp.value;
        // Fire change so existing listeners update UI/constraints
        const evt = new Event('change', { bubbles: true });
        inputEl.dispatchEvent(evt);
      }
      if (temp.parentNode) temp.remove();
    };
    const cancelAndCleanup = () => { if (temp.parentNode) temp.remove(); };

    temp.addEventListener('change', applyAndCleanup);
    temp.addEventListener('blur', () => setTimeout(cancelAndCleanup, 100));
    temp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancelAndCleanup();
      if (e.key === 'Enter') applyAndCleanup();
    });

    setTimeout(() => { if (temp.parentNode) temp.remove(); }, 30000);
  }
        /**
     * Open native color picker
     */
  openColorPicker(calendarEvent, position) {
    const input = document.createElement('input');
    input.type = 'color';
    input.style.position = 'fixed';
    // If a cursor position is provided and we're not on mobile, place near cursor
    if (position && !isMobileDevice()) {
      const margin = 8;
      const x = Math.max(margin, Math.min(window.innerWidth - margin, position.clientX)) + 12;
      const y = Math.max(margin, Math.min(window.innerHeight - margin, position.clientY)) + 12;
      input.style.left = `${x}px`;
      input.style.top = `${y}px`;
      input.style.transform = 'translate(-50%, -50%)';
    } else {
      // Center fallback
    input.style.top = '50%';
    input.style.left = '50%';
    input.style.transform = 'translate(-50%, -50%)';
    }
    input.style.zIndex = '10000';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.width = '1px';
    input.style.height = '1px';
    input.value = calendarEvent.color;
    
    document.body.appendChild(input);
    input.focus();
    
    // Try to open the color picker programmatically
    if (input.showPicker) {
      try {
        input.showPicker();
      } catch (e) {
        input.click();
      }
    } else {
      input.click();
    }
    
    const handleChange = () => {
      calendarEvent.color = input.value;
      calendarEvent.lastModified = Date.now();
      // Mark that changes have been made
      this._eventCircleHasChanges = true;
      // If this is a virtual event, make sure it's still the active one
      if (calendarEvent.isVirtual && this.virtualEvent && this.virtualEvent.segmentId === calendarEvent.segmentId) {
        this.virtualEvent = calendarEvent; // Update the stored virtual event
      }
      this.drawSpiral();
      // Save events to localStorage
      this.saveEventsToStorage();
      if (input.parentNode) {
        input.remove();
      }
    };
    
    const handleCancel = () => {
      if (input.parentNode) {
        input.remove();
      }
    };
    
    input.addEventListener('change', handleChange);
    input.addEventListener('blur', () => {
      setTimeout(handleCancel, 100);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    });
    
    // Auto-remove after 30 seconds as failsafe
    setTimeout(() => {
      if (input.parentNode) {
        input.remove();
      }
    }, 30000);
  }

  /**
   * Setup study session controls
   */
  setupStudySessionControls() {
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const downloadBtn = document.getElementById('downloadDataBtn');
    const participantNameInput = document.getElementById('participantName');
    const statusDiv = document.getElementById('recordingStatus');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const name = participantNameInput.value.trim();
        if (!name) {
          alert('Please enter a participant name before starting recording.');
          return;
        }
        
        this.startStudySession(name);
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        downloadBtn.style.display = 'none';
        participantNameInput.disabled = true;
        statusDiv.textContent = `Recording session for ${name}`;
        statusDiv.style.color = '#4CAF50';
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.stopStudySession();
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        downloadBtn.style.display = 'block';
        participantNameInput.disabled = false;
        statusDiv.textContent = 'Session completed - ready to download';
        statusDiv.style.color = '#2196F3';
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadStudyData();
      });
    }
  }

  /**
   * Start study session recording
   */
  startStudySession(participantName) {
    this.studySession = {
      isRecording: true,
      participantName: participantName,
      startTime: new Date().toISOString(),
      endTime: null
    };
  }

  /**
   * Stop study session recording
   */
  stopStudySession() {
    if (!this.studySession.isRecording) return;
    
    this.studySession.isRecording = false;
    this.studySession.endTime = new Date().toISOString();
  }


  /**
   * Download study data as JSON
   */
  downloadStudyData() {
    if (!this.studySession.participantName) {
      alert('No study session data to download.');
      return;
    }
    
    const studyData = {
      participantName: this.studySession.participantName,
      startTime: this.studySession.startTime,
      endTime: this.studySession.endTime,
      sessionDuration: this.studySession.endTime ? 
        new Date(this.studySession.endTime) - new Date(this.studySession.startTime) : null,
      exportTime: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(studyData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-session-${this.studySession.participantName}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Reusable function to add a new calendar
   * @param {Function} onSuccess - Callback when calendar is successfully created
   * @returns {string|null} - The new calendar name or null if cancelled/invalid
   */
  addNewCalendar(onSuccess = null) {
    // Create a custom input dialog with character limit
    const dialog = document.createElement('div');
    dialog.id = 'newCalendarDialog';
    dialog.style.position = 'fixed';
    dialog.style.top = '50%';
    dialog.style.left = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '10000';
    dialog.style.backgroundColor = '#fff';
    dialog.style.border = '2px solid #ccc';
    dialog.style.borderRadius = '0.5em';
    dialog.style.padding = '1em';
    dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    dialog.style.minWidth = '300px';
    
    const label = document.createElement('label');
    label.textContent = 'Enter new calendar name:';
    label.style.display = 'block';
    label.style.marginBottom = '0.5em';
    label.style.fontWeight = 'bold';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20; // Enforce character limit directly
    input.style.width = '100%';
    input.style.padding = '0.5em';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '0.3em';
    input.style.fontSize = '1em';
    input.style.boxSizing = 'border-box';
    
    const charCount = document.createElement('div');
    charCount.style.textAlign = 'right';
    charCount.style.fontSize = '0.8em';
    charCount.style.color = '#666';
    charCount.style.marginTop = '0.2em';
    charCount.textContent = '0/20';
    
    // Inline validation message
    const nameError = document.createElement('div');
    nameError.id = 'newCalendarNameError';
    nameError.style.fontSize = '0.8em';
    nameError.style.color = '#c0392b';
    nameError.style.marginTop = '0.2em';
    nameError.style.display = 'none';
    
    // Add color picker
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Calendar color:';
    colorLabel.style.display = 'block';
    colorLabel.style.marginTop = '0.8em';
    colorLabel.style.marginBottom = '0.3em';
    colorLabel.style.fontWeight = 'bold';
    
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    // Use the same random color generation as events
    const defaultColor = this.generateRandomColor();
    colorInput.value = defaultColor.startsWith('#') ? defaultColor : this.hslToHex(defaultColor);
    colorInput.style.width = '100%';
    colorInput.style.height = '40px';
    colorInput.style.border = '1px solid #ccc';
    colorInput.style.borderRadius = '0.3em';
    colorInput.style.cursor = 'pointer';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5em';
    buttonContainer.style.marginTop = '1em';
    buttonContainer.style.justifyContent = 'flex-end';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '0.5em 1em';
    cancelBtn.style.border = '1px solid #ccc';
    cancelBtn.style.borderRadius = '0.3em';
    cancelBtn.style.backgroundColor = '#f5f5f5';
    cancelBtn.style.cursor = 'pointer';
    
    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create';
    createBtn.style.padding = '0.5em 1em';
    createBtn.style.border = 'none';
    createBtn.style.borderRadius = '0.3em';
    createBtn.style.backgroundColor = '#4CAF50';
    createBtn.style.color = 'white';
    createBtn.style.cursor = 'pointer';
    // Allow clicking Create to show inline validation when invalid
    createBtn.disabled = false;
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(createBtn);
    
    dialog.appendChild(label);
    dialog.appendChild(input);
    dialog.appendChild(nameError);
    dialog.appendChild(charCount);
    dialog.appendChild(colorLabel);
    dialog.appendChild(colorInput);
    dialog.appendChild(buttonContainer);
    
    document.body.appendChild(dialog);
    input.focus();
    
    // Update character count; hide any previous error while typing
    input.addEventListener('input', () => {
      charCount.textContent = `${input.value.length}/20`;
      nameError.style.display = 'none';
      input.style.borderColor = '#ccc';
    });
    
    // Prevent invalid characters
    input.addEventListener('keypress', (e) => {
      const invalidChars = ['"', "'", '\\', '/'];
      if (invalidChars.includes(e.key)) {
        e.preventDefault();
      }
    });
    
    // Handle paste to remove invalid characters
    input.addEventListener('paste', (e) => {
      setTimeout(() => {
        let value = input.value;
        const invalidChars = ['"', "'", '\\', '/'];
        invalidChars.forEach(char => {
          value = value.replace(new RegExp(char, 'g'), '');
        });
        if (value.length > 20) {
          value = value.substring(0, 20);
        }
        input.value = value;
        charCount.textContent = `${value.length}/20`;
        // hide error on paste; will show on Create click if invalid
        nameError.style.display = 'none';
        input.style.borderColor = '#ccc';
      }, 0);
    });
    
    // Add backdrop click handler for better UX
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    backdrop.style.zIndex = '9999';
    
    const cleanup = () => {
      if (dialog.parentNode) {
        dialog.remove();
      }
      if (backdrop.parentNode) {
        backdrop.remove();
      }
    };
    
    const handleCreate = () => {
      const trimmed = input.value.trim();
      if (trimmed) {
        if (!this.state.calendars.includes(trimmed)) {
          this.state.calendars.push(trimmed);
          if (!this.state.visibleCalendars.includes(trimmed)) this.state.visibleCalendars.push(trimmed);
          // Save calendar color
          if (!this.state.calendarColors) {
            this.state.calendarColors = {};
          }
          this.state.calendarColors[trimmed] = colorInput.value;
          this.saveSettingsToStorage();
          
          // Call success callback first
          if (onSuccess) {
            try {
              onSuccess(trimmed);
            } catch (e) {
              console.error('Error in onSuccess callback:', e);
            }
          }
          
          // Always cleanup after success callback with a small delay to ensure DOM updates complete
          setTimeout(() => {
            cleanup();
          }, 10);
          
          // Failsafe cleanup in case setTimeout doesn't work
          setTimeout(() => {
            if (dialog.parentNode || backdrop.parentNode) {
              cleanup();
            }
          }, 100);
          return trimmed;
        } else {
          nameError.textContent = 'Calendar already exists.';
          nameError.style.display = 'block';
          return null;
        }
      }
      // Invalid: empty name -> keep dialog open and focus input
      nameError.textContent = 'Please enter a calendar name.';
      nameError.style.display = 'block';
      input.focus();
      return null;
    };
    
    // Event handlers
    cancelBtn.addEventListener('click', cleanup);
    createBtn.addEventListener('click', handleCreate);
    backdrop.addEventListener('click', cleanup);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });
    
    // Click outside to close - enhanced
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
      }
    });
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    return null; // Will be handled by callbacks
  }

  openEventCalendarPicker() {
    // Create a custom dropdown positioned relative to the calendar display
    const existingDropdown = document.getElementById('eventCalendarDropdown');
    if (existingDropdown) {
      existingDropdown.remove();
    }

    const dropdown = document.createElement('div');
    dropdown.id = 'eventCalendarDropdown';
    const isDarkMode = document.body.classList.contains('dark-mode');
    dropdown.style.cssText = `
      position: absolute;
      background: ${isDarkMode ? 'var(--dark-bg-secondary)' : '#fff'};
      border: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#ccc'};
      border-radius: 0.3em;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 1000;
      max-height: 200px;
      overflow-y: auto;
      min-width: 150px;
    `;

    // Position dropdown relative to the calendar display
    const calendarDisplay = document.getElementById('eventCalendarDisplay');
    if (calendarDisplay) {
      const rect = calendarDisplay.getBoundingClientRect();
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.top = `${rect.bottom + 2}px`;
    }

    // Add calendar options
    if (!Array.isArray(this.state.calendars) || this.state.calendars.length === 0) {
      this.state.calendars = this.defaultSettings.calendars.slice();
    }

    // Filter out Random calendar for new events (Add Event panel)
    this.state.calendars.filter(calendarName => calendarName !== 'Random').forEach(calendarName => {
      const option = document.createElement('div');
      option.style.cssText = `
        padding: 0.5em 0.6em;
        cursor: pointer;
        border-bottom: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#eee'};
        background: ${calendarName === this.selectedEventCalendar ? (isDarkMode ? '#333' : '#e3f2fd') : (isDarkMode ? 'var(--dark-bg-secondary)' : '#fff')};
        color: ${isDarkMode ? 'var(--dark-text-primary)' : '#000'};
      `;
      option.textContent = calendarName;
      option.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event from bubbling up
        this.selectedEventCalendar = calendarName;
        this.updateEventCalendarDisplay();
        // If palette is 'calendar', suggest that calendar color (both preview and input)
        try {
          if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
            const calColor = this.state.calendarColors && this.state.calendarColors[calendarName];
            if (calColor && colorBox) {
              let hex = calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
              if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
              colorBox.style.background = hex;
              if (eventColor) eventColor.value = hex;
            }
          } else {
            if (colorBox) colorBox.style.background = eventColor.value;
          }
        } catch (_) {}
        dropdown.remove();
        this.playFeedback();
      });
      dropdown.appendChild(option);
    });

    // Add "Add New Calendar" option
    const addNewOption = document.createElement('div');
    addNewOption.style.cssText = `
      padding: 0.5em 0.6em;
      cursor: pointer;
      border-top: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#eee'};
      color: ${isDarkMode ? 'var(--dark-text-primary)' : '#333'};
      background: ${isDarkMode ? 'var(--dark-bg-secondary)' : '#f5f5f5'};
    `;
    addNewOption.textContent = '+ Add New Calendar';
    addNewOption.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event from bubbling up
      dropdown.remove();
      this.playFeedback();
      this.addNewCalendar((newCalendarName) => {
        this.selectedEventCalendar = newCalendarName;
        this.updateEventCalendarDisplay();
        // Refresh the calendar menu
        const buildCalendarMenu = () => {
          // This function is defined in setupEventInputPanel
          // We'll call it to refresh the main calendar menu
        };
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        renderEventList();
        this.drawSpiral();
      });
    });
    dropdown.appendChild(addNewOption);

    document.body.appendChild(dropdown);

    // Close dropdown when clicking outside
    const cleanup = () => {
      if (dropdown.parentNode) {
        dropdown.remove();
      }
      document.removeEventListener('click', cleanup);
    };

    // Use setTimeout to avoid immediate closure
    setTimeout(() => {
      document.addEventListener('click', cleanup);
    }, 10);
  }

  openCalendarPicker(event, onCalendarSelected = null) {
    // Create a custom dropdown menu instead of a select element
    const isDarkMode = document.body.classList.contains('dark-mode');
    const dropdown = document.createElement('div');
    dropdown.style.position = 'fixed';
    dropdown.style.top = '50%';
    dropdown.style.left = '50%';
    dropdown.style.transform = 'translate(-50%, -50%)';
    dropdown.style.zIndex = '10000';
    dropdown.style.backgroundColor = isDarkMode ? 'var(--dark-bg-secondary)' : '#fff';
    dropdown.style.border = `2px solid ${isDarkMode ? 'var(--dark-border)' : '#ccc'}`;
    dropdown.style.borderRadius = '0.3em';
    dropdown.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    dropdown.style.minWidth = '200px';
    dropdown.style.maxHeight = '300px';
    dropdown.style.overflowY = 'auto';
    
    // Populate with available calendars
    if (!Array.isArray(this.state.calendars) || this.state.calendars.length === 0) {
      this.state.calendars = this.defaultSettings.calendars.slice();
    }
    
    // Filter calendars: show Random only if editing an existing random event
    const calendarsToShow = event && event.calendar === 'Random' 
      ? this.state.calendars 
      : this.state.calendars.filter(name => name !== 'Random');
    
    calendarsToShow.forEach(calendarName => {
      const option = document.createElement('div');
      option.style.padding = '0.8em 1em';
      option.style.cursor = 'pointer';
      option.style.borderBottom = `1px solid ${isDarkMode ? 'var(--dark-border)' : '#eee'}`;
      option.style.fontSize = '1em';
      option.style.color = isDarkMode ? 'var(--dark-text-primary)' : '#333';
      option.textContent = calendarName;
      
      // Highlight current selection
      if (calendarName === (event.calendar || 'Home')) {
        option.style.backgroundColor = isDarkMode ? '#333' : '#e3f2fd';
        option.style.fontWeight = 'bold';
      }
      
      // Hover effects
      option.addEventListener('mouseenter', () => {
        if (calendarName !== (event.calendar || 'Home')) {
          option.style.backgroundColor = isDarkMode ? '#444' : '#f5f5f5';
        }
      });
      option.addEventListener('mouseleave', () => {
        if (calendarName !== (event.calendar || 'Home')) {
          option.style.backgroundColor = 'transparent';
        }
      });
      
      option.addEventListener('click', () => {
        if (onCalendarSelected) {
          // Use callback for new event calendar selection
          onCalendarSelected(calendarName);
        } else {
          // Direct event modification for existing events
          event.calendar = calendarName;
          // In Calendar Color mode, also suggest/update the color to the calendar's color
          try {
            if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
              const calColor = this.state.calendarColors && this.state.calendarColors[calendarName];
              if (calColor) {
                let hex = calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
                if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
                event.color = hex;
                // Update persistent color picker UI if present
                const persistentColorPicker = document.getElementById('persistentColorPicker');
                if (persistentColorPicker) persistentColorPicker.value = hex;
              }
            }
          } catch (_) {}
          event.lastModified = Date.now();
          // Mark that changes have been made
          this._eventCircleHasChanges = true;
          this.saveEventsToStorage();
          this.drawSpiral();
          // Update event list to show new icon state (with delay to ensure properties are saved)
          setTimeout(() => renderEventList(), 0);
        }
        dropdown.remove();
        if (backdrop.parentNode) backdrop.remove();
      });
      
      dropdown.appendChild(option);
    });
    
    // Add "Add New Calendar" option
    const addNewOption = document.createElement('div');
    addNewOption.style.padding = '0.8em 1em';
    addNewOption.style.cursor = 'pointer';
    addNewOption.style.borderTop = `2px solid ${isDarkMode ? 'var(--dark-border)' : '#ccc'}`;
    addNewOption.style.fontSize = '1em';
    addNewOption.style.color = isDarkMode ? 'var(--dark-text-primary)' : '#666';
    addNewOption.style.fontStyle = 'italic';
    addNewOption.textContent = '+ Add New Calendar';
    
    addNewOption.addEventListener('mouseenter', () => {
      addNewOption.style.backgroundColor = isDarkMode ? '#444' : '#f5f5f5';
    });
    addNewOption.addEventListener('mouseleave', () => {
      addNewOption.style.backgroundColor = 'transparent';
    });
    
    addNewOption.addEventListener('click', () => {
      dropdown.remove();
      if (backdrop.parentNode) backdrop.remove();
      
      // Handle "Add New Calendar" option using reusable function
      this.addNewCalendar((newCalendarName) => {
        if (onCalendarSelected) {
          // Use callback for new event calendar selection
          onCalendarSelected(newCalendarName);
        } else {
          // Direct event modification for existing events
          event.calendar = newCalendarName;
          
          // In Calendar Color mode, also suggest/update the color to the new calendar's color
          try {
            if (this.state.colorMode === 'calendar' || this.state.colorMode === 'calendarMono') {
              const calColor = this.state.calendarColors && this.state.calendarColors[newCalendarName];
              if (calColor) {
                let hex = calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
                if (this.state.colorMode === 'calendarMono') hex = this.toGrayscaleHex(hex);
                event.color = hex;
                const persistentColorPicker = document.getElementById('persistentColorPicker');
                if (persistentColorPicker) persistentColorPicker.value = hex;
              }
            }
          } catch (_) {}

          event.lastModified = Date.now();
          // Mark that changes have been made
          this._eventCircleHasChanges = true;
          
          // If this is a virtual event, make sure it's still the active one
          if (this.mouseState.virtualEvent && this.mouseState.virtualEvent === event) {
            this.mouseState.virtualEvent.calendar = newCalendarName;
          }
          
          this.saveEventsToStorage();
          this.drawSpiral();
          // Update event list to show new icon state (with delay to ensure properties are saved)
          setTimeout(() => renderEventList(), 0);
        }
      });
    });
    
    dropdown.appendChild(addNewOption);
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    backdrop.style.zIndex = '9999';
    
    const cleanup = () => {
      if (dropdown.parentNode) {
        dropdown.remove();
      }
      if (backdrop.parentNode) {
        backdrop.remove();
      }
    };
    
    backdrop.addEventListener('click', cleanup);
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dropdown);
    
    // Handle escape key to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // Auto-remove after 30 seconds as failsafe
    setTimeout(() => {
      cleanup();
    }, 30000);
  }
  /**
   * Handle touch start event for pinch-to-zoom and drag rotation
   */
  handleTouchStart(e) {
    // If page zoom is active, allow browser pinch zoom and ignore canvas gesture
    if (this.pageZoomActive) return;
    // Mark user interaction for audio/vibration feedback
    if (!this._userHasInteracted) {
      this._userHasInteracted = true;
      try {
        this.warmAudio();
      } catch (_) {}
    }

    // Check time display swipe/tap area first (single touch)
    if (e.touches.length === 1 && this.state.showTimeDisplay) {
      const rect = this.canvas.getBoundingClientRect();
      const touchX = e.touches[0].clientX - rect.left;
      const touchY = e.touches[0].clientY - rect.top;
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
      const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
      // Reduce hit padding when event list is extended (when pullUpOffset > 0)
      const basePad = (this.timeDisplayState && this.timeDisplayState.hitPadding) ? this.timeDisplayState.hitPadding : 80;
      const pad = pullUpOffset > 0 ? Math.max(20, basePad * 0.25) : basePad; // Reduce to 25% (min 20px) when extended
      const timeDisplayArea = { x: 0, y: Math.max(0, canvasHeight - tdHeight - pullUpOffset - pad), width: canvasWidth, height: tdHeight + pad };
      const inside = touchX >= timeDisplayArea.x && touchX <= timeDisplayArea.x + timeDisplayArea.width && touchY >= timeDisplayArea.y && touchY <= timeDisplayArea.y + timeDisplayArea.height;
      if (inside) {
        // Begin swipe tracking for collapse/expand
        this.timeDisplayState.swipeActive = true;
        this.timeDisplayState.swipeStartY = touchY;
        this.timeDisplayState.swipeLastY = touchY;
        // Store initial state for tracking collapse/expand and pull-up
        this.timeDisplayState.swipeStartPullUpOffset = this.timeDisplayState.pullUpOffset || 0;
        this.timeDisplayState.swipeStartHeight = this.getTimeDisplayHeight();
        // Stop any ongoing animation for interactive tracking
        if (this.timeDisplayState.animId) {
          cancelAnimationFrame(this.timeDisplayState.animId);
          this.timeDisplayState.animId = null;
        }
        e.preventDefault();
        return;
      }
    }

    if (e.touches.length === 4) {
      // Four-finger gesture: two anchor + two-finger pinch for radius adjustment
      e.preventDefault();
      this.touchState.radiusAdjustActive = true;
      // First two touches are anchors, third and fourth are pinch
      this.touchState.anchorTouchIds = [e.touches[0].identifier, e.touches[1].identifier];
      this.touchState.pinchTouchIds = [e.touches[2].identifier, e.touches[3].identifier];
      this.touchState.initialRadiusValue = this.state.radiusExponent;
      // Store initial pinch distance
      this.touchState.initialDistance = this.getTouchDistance(e.touches[2], e.touches[3]);
      this.mouseState.isDragging = false;
      // Reset days adjust if active
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
      }
    } else if (e.touches.length === 3) {
      // Three-finger gesture: one anchor + two-finger pinch for days adjustment
      e.preventDefault();
      this.touchState.daysAdjustActive = true;
      // First touch is anchor, second and third are pinch
      this.touchState.anchorTouchId = e.touches[0].identifier;
      this.touchState.daysPinchTouchIds = [e.touches[1].identifier, e.touches[2].identifier];
      this.touchState.initialDaysValue = this.state.days;
      // Store initial pinch distance
      this.touchState.initialDistance = this.getTouchDistance(e.touches[1], e.touches[2]);
      this.mouseState.isDragging = false;
      // Reset radius adjust if active
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
      }
    } else if (e.touches.length === 2) {
      // Two-finger pinch-to-zoom
      e.preventDefault();
      this.touchState.isActive = true;
      this.touchState.initialDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      this.touchState.initialDays = this.state.days;
      this.mouseState.isDragging = false; // Stop any single-finger drag
      // Reset radius adjust if active
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
      }
    } else if (e.touches.length === 1) {
      // If in detail mode and tapping on info circle date boxes, open picker immediately (mobile reliability)
      if (this.state.detailMode !== null && this.canvasClickAreas) {
        const rect = this.canvas.getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        if (this.canvasClickAreas.startDateBox) {
          const box = this.canvasClickAreas.startDateBox;
          if (touchX >= box.x && touchX <= box.x + box.width &&
              touchY >= box.y && touchY <= box.y + box.height) {
            e.preventDefault();
            this.mouseState.isDragging = false;
            this.openDateTimePicker(box.event, 'start', box);
            return;
          }
        }
        if (this.canvasClickAreas.endDateBox) {
          const box = this.canvasClickAreas.endDateBox;
          if (touchX >= box.x && touchX <= box.x + box.width &&
              touchY >= box.y && touchY <= box.y + box.height) {
            e.preventDefault();
            this.mouseState.isDragging = false;
            this.openDateTimePicker(box.event, 'end', box);
            return;
          }
        }
      }

      // Single-finger interactions (only if not in detail mode)
      if (this.state.detailMode === null) {
        const rect = this.canvas.getBoundingClientRect();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        // If tilt-zoom area exists, allow press to enable orientation (and request permission) and long-press to activate
        if (this.canvasClickAreas && this.canvasClickAreas.tiltZoomArea) {
          const a = this.canvasClickAreas.tiltZoomArea;
          if (touchX >= a.x && touchX <= a.x + a.width && touchY >= a.y && touchY <= a.y + a.height) {
            // If orientation is not enabled yet, mark to enable after press completes to keep user gesture context
            if (!this.deviceOrientationState.enabled) {
              this._pendingEnableDeviceOrientation = true;
            }
            // Long press (500ms) to activate tilt zoom; short tap still acts as time click
            this.mouseState.clickingTiltZoomArea = true;
            if (this._tiltZoomPressTimerId) clearTimeout(this._tiltZoomPressTimerId);
            this._tiltZoomPressTimerId = setTimeout(() => {
              // Long press activated - only start tilt zoom if orientation is already enabled
              if (this.deviceOrientationState.enabled && this.deviceOrientationState.permissionGranted) {
                this.startTiltZoomMode();
                this._suppressTimeDisplayClickOnce = true; // prevent time reset from the eventual tap
              } else {
                // Clear the pending flag to prevent permission request on release
                this._pendingEnableDeviceOrientation = false;
              }
            }, 500);
            return;
          }
        }
        // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
        const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
        const currentAngle = Math.atan2(touchY - centerY, touchX - centerX);
        this.mouseState.isDragging = true;
        this.mouseState.hasMovedDuringDrag = false; // Reset movement flag
        this.mouseState.dragStartAngle = currentAngle;
        this.mouseState.lastAngle = currentAngle; // Initialize last angle
        this.mouseState.dragStartRotation = this.state.rotation;
        
        // Store current inertia velocity before stopping it (for momentum accumulation)
        this.mouseState.previousInertiaVelocity = this._inertiaVelocity || 0;
        // Stop any existing inertia when a new drag starts
        this.stopInertia();
        // Reset wasDragging flag for new interaction
        this.mouseState.wasDragging = false;
      }
      this.touchState.isActive = false;
    } else {
      this.touchState.isActive = false;
      this.mouseState.isDragging = false;
    }
  }

  /**
   * Handle touch move event for pinch-to-zoom and drag rotation
   */
  handleTouchMove(e) {
    // If page zoom is active, allow browser pinch zoom and ignore canvas gesture
    if (this.pageZoomActive) return;

    // Handle time display swipe (interactive tracking - time display stays fixed height, only pull-up offset changes)
    if (this.timeDisplayState && this.timeDisplayState.swipeActive && this.state.showTimeDisplay) {
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch) {
        const touchY = touch.clientY - rect.top;
        this.timeDisplayState.swipeLastY = touchY;
        const dy = touchY - this.timeDisplayState.swipeStartY;
        const base = CONFIG.TIME_DISPLAY_HEIGHT;
        const minH = this.timeDisplayState.collapseHeight || 12;
        const startHeight = this.timeDisplayState.swipeStartHeight || base;
        const startOffset = this.timeDisplayState.swipeStartPullUpOffset || 0;
        
        if (dy > 0 && startOffset === 0) {
          // Dragging down from no pull-up: collapse time display (1:1 with cursor)
          let newH = startHeight - dy; // Drag down reduces height
          newH = Math.max(minH, Math.min(base, newH));
          this.timeDisplayState.currentHeight = newH;
          // Reset pull-up offset when collapsing
          this.timeDisplayState.pullUpOffset = 0;
          this.hideBottomEventList();
        } else {
          // Dragging up or dragging down from pulled-up state: track pull-up offset
          // Keep time display at fixed height
          this.timeDisplayState.currentHeight = base;
          this.timeDisplayState.collapsed = false;
          // Track pull-up offset: drag up (negative dy) increases offset 1:1
          let newOffset = startOffset - dy;
          // Calculate maximum allowed offset based on screen limits
          const canvasHeight = this.canvas.clientHeight;
          const timeDisplayBottom = canvasHeight - newOffset;
          const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
          const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
          const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
          const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
          // Limit to actual content height if available, otherwise use max allowed height
          const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
          const maxOffset = contentHeight > 0 ? Math.min(contentHeight, maxAllowedHeight) : maxAllowedHeight;
          newOffset = Math.max(0, Math.min(maxOffset, newOffset));
          this.timeDisplayState.pullUpOffset = newOffset;
          // Update event list visibility based on offset (skip rendering during drag to prevent flicker)
          this.updateBottomEventList(true);
        }
        // Do not change collapsed flag until end; just redraw
        this.drawSpiral();
      }
      e.preventDefault();
      return;
    }
    
    // Handle four-finger gesture for radius adjustment
    if (e.touches.length === 4 && this.touchState.radiusAdjustActive) {
      e.preventDefault();
      
      // Find the two pinch touches (excluding the two anchors)
      const pinchTouches = Array.from(e.touches).filter(touch => 
        this.touchState.pinchTouchIds.includes(touch.identifier)
      );
      
      if (pinchTouches.length === 2) {
        const currentDistance = this.getTouchDistance(pinchTouches[0], pinchTouches[1]);
        const distanceRatio = currentDistance / this.touchState.initialDistance;
        
        // Calculate new radius value based on pinch scale
        // Pinch apart (distanceRatio > 1): increase radius
        // Pinch together (distanceRatio < 1): decrease radius
        const radiusSlider = document.getElementById('radiusSlider');
        const radiusVal = document.getElementById('radiusVal');
        
        if (radiusSlider && radiusVal) {
          const min = parseFloat(radiusSlider.min);
          const max = parseFloat(radiusSlider.max);
          const minValue = 1;
          const maxValue = 10;
          const minStep = 0.05;
          const maxStep = 1.0;
          
          // Use proportional scaling like Ctrl+scroll
          // Calculate change from initial value
          const initialValue = this.touchState.initialRadiusValue;
          // Scale the change based on current value (use initial for initial scaling)
          const ratio = (initialValue - minValue) / (maxValue - minValue);
          const baseStep = minStep + ratio * (maxStep - minStep);
          
          // Scale by distance ratio (subtract 1 to get relative change)
          // Sensitivity multiplier for pinch gesture (increased for more responsive control)
          const sensitivity = 10;
          const change = (distanceRatio - 1) * baseStep * sensitivity;
          let newValue = initialValue + change;
          
          // Round to 2 decimal places
          newValue = Math.round(newValue * 100) / 100;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));
          
          // Update slider and state
          radiusSlider.value = newValue;
          this.state.radiusExponent = newValue;
          radiusVal.textContent = newValue % 1 === 0 ? newValue.toString() : newValue.toFixed(2);
          
          this.drawSpiral();
          this.saveSettingsToStorage();
        }
      }
      return;
    }
    
    // Handle three-finger gesture for days adjustment
    if (e.touches.length === 3 && this.touchState.daysAdjustActive) {
      e.preventDefault();
      
      // Find the two pinch touches (excluding the anchor)
      const pinchTouches = Array.from(e.touches).filter(touch => 
        this.touchState.daysPinchTouchIds.includes(touch.identifier)
      );
      
      if (pinchTouches.length === 2) {
        const currentDistance = this.getTouchDistance(pinchTouches[0], pinchTouches[1]);
        const distanceRatio = currentDistance / this.touchState.initialDistance;
        
        // Calculate new days value based on pinch scale
        // Pinch apart (distanceRatio > 1): increase days
        // Pinch together (distanceRatio < 1): decrease days
        const daysSlider = document.getElementById('daysSlider');
        const daysVal = document.getElementById('daysVal');
        
        if (daysSlider && daysVal) {
          const min = parseInt(daysSlider.min);
          const max = parseInt(daysSlider.max);
          const initialValue = this.touchState.initialDaysValue;
          
          // Calculate change - integer steps for days
          // Step size of 1 day per unit of distance ratio change
          const sensitivity = 10; // Adjust sensitivity as needed
          const change = Math.round((distanceRatio - 1) * sensitivity);
          let newValue = initialValue + change;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));
          
          // Update slider and state
          daysSlider.value = newValue;
          this.state.days = newValue;
          daysVal.textContent = newValue.toString();
          
          // Handle onChange callback to preserve selected segment if applicable
          // If a segment is selected, preserve its segmentId from the outside
          if (this.mouseState.selectedSegmentId !== null) {
            const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            if (this.mouseState.selectedSegmentId < totalVisibleSegments) {
              const absPos = totalVisibleSegments - this.mouseState.selectedSegmentId - 1;
              const newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
              const newSegment = absPos % CONFIG.SEGMENTS_PER_DAY;
              this.mouseState.selectedSegment = { day: newDay, segment: newSegment };
            } else {
              // If the segmentId is now out of range, deselect
              this.mouseState.selectedSegment = null;
              this.mouseState.selectedSegmentId = null;
            }
          }
          
          this.drawSpiral();
          this.saveSettingsToStorage();
        }
      }
      return;
    }
    
    if (e.touches.length === 2 && this.touchState.isActive) {
      // Two-finger pinch-to-zoom
      e.preventDefault();
      // Reset days adjust if transitioning from 4-finger gesture
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
        this.touchState.anchorTouchIds = [];
        this.touchState.daysPinchTouchIds = [];
      }
      // Reset radius adjust if transitioning from 3-finger gesture
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
        this.touchState.anchorTouchId = null;
        this.touchState.pinchTouchIds = [];
      }
    // Disable Auto Time Align on pinch-zoom
    if (this.autoTimeAlignState.enabled) {
      this.autoTimeAlignState.enabled = false;
      this.stopAutoTimeAlign();
    }
      const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      const distanceRatio = currentDistance / this.touchState.initialDistance;
    const sensitivity = 2.0; // Adjust as needed
        const rotationChange = (distanceRatio - 1) * sensitivity;
        const rotationSteps = Math.round(rotationChange);
        if (rotationSteps !== 0) {
          // Store previous rotation to detect if we hit the limit
          const previousRotation = this.state.rotation;
          
      this.state.rotation += rotationSteps * 2 * Math.PI;
      
      // Check if we're in detail mode and hit the outer limit
      if (this.state.detailMode !== null && this.mouseState.selectedSegment) {
        // Calculate what the rotation would be without clamping
        const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
        const segment = this.mouseState.selectedSegment;
        const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY);
        const eventHour = segmentId;
        const maxRotation = ((eventHour - 23.999) / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
        
        // Check if the user tried to zoom past the limit
        const wouldExceedLimit = this.state.rotation > maxRotation;
        
        this.clampRotationToEventWindow();
        
        // Simplified pinch zoom detection - try a more lenient approach
        const isNearLimit = Math.abs(this.state.rotation - maxRotation) < 0.1; // More lenient threshold
        const isZoomingOut = rotationSteps > 0; // Positive steps mean zooming out (pinch apart)
        
        if (isNearLimit && wouldExceedLimit && isZoomingOut) {
          // Increment counter for scroll steps past the limit
          this.state.pastLimitScrollCount++;
          
          // First scroll step: set radius to 1
          if (this.state.pastLimitScrollCount >= 1) {
            // Store original radius exponent if not already stored
            if (this.state.originalRadiusExponent === null) {
              this.state.originalRadiusExponent = this.state.radiusExponent;
            }
            
            // Set radius exponent to 1
            this.state.radiusExponent = 1;
            
            // Update the UI slider
            const radiusSlider = document.getElementById('radiusSlider');
            if (radiusSlider) {
              radiusSlider.value = this.state.radiusExponent;
              const radiusVal = document.getElementById('radiusVal');
              if (radiusVal && this.state.radiusExponent !== null && this.state.radiusExponent !== undefined) {
                radiusVal.textContent = this.state.radiusExponent.toString();
              }
            }
            
            // Trigger redraw to apply radius change
            this.drawSpiral();
          }
          
          // Auto-activate after two scroll steps past the limit
          if (this.state.pastLimitScrollCount >= 2) {
            // Store original scale if not already stored
            if (this.state.originalSpiralScale === null) {
              this.state.originalSpiralScale = this.state.spiralScale;
            }
            
            // Increase scale to 0.45
            this.state.spiralScale = 0.4475;
            
            // Update the UI slider
            const scaleSlider = document.getElementById('scaleSlider');
            if (scaleSlider) {
              scaleSlider.value = this.state.spiralScale;
              const scaleVal = document.getElementById('scaleVal');
              if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
            }
            
            // Trigger redraw to apply scale change
            this.drawSpiral();
            
            this.state.autoInsideSegmentNumbers = true;
            this.state.hourNumbersInsideSegment = true;
            // Update the UI checkbox
            const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
            if (insideSegmentCheckbox) {
              insideSegmentCheckbox.checked = true;
            }
          }
          
          // Third scroll step: disable time display and increase scale to 0.5
          if (this.state.pastLimitScrollCount >= 3) {
            // Store original time display state if not already stored
            if (this.state.originalTimeDisplay === null) {
              this.state.originalTimeDisplay = this.state.showTimeDisplay;
            }
            
            // Disable time display
            this.state.showTimeDisplay = false;
            
            // Update the UI checkbox
            const timeDisplayCheckbox = document.getElementById('timeDisplayToggle');
            if (timeDisplayCheckbox) {
              timeDisplayCheckbox.checked = false;
            }
            
            // Increase scale to 0.5
            this.state.spiralScale = 0.4975;
            
            // Update the UI slider
            const scaleSlider = document.getElementById('scaleSlider');
            if (scaleSlider) {
              scaleSlider.value = this.state.spiralScale;
              const scaleVal = document.getElementById('scaleVal');
              if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
            }
            
            // Trigger redraw to apply scale change
            this.drawSpiral();
          }
        } else if (rotationSteps < 0) {
          // Reset counter when zooming in (pinch together)
          this.state.pastLimitScrollCount = 0;
          
          // Reset auto-activated settings
          this.resetAutoActivatedSettings();
        }
        
        // If we're zooming in and auto inside segment numbers are active, reset them
        if (rotationSteps < 0 && this.state.autoInsideSegmentNumbers) {
          this.state.autoInsideSegmentNumbers = false;
          this.state.hourNumbersInsideSegment = false;
          // Update the UI checkbox
          const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
          if (insideSegmentCheckbox) {
            insideSegmentCheckbox.checked = false;
          }
        }
      }
      
          const rotateSlider = document.getElementById('rotateSlider');
          if (rotateSlider) {
            let degrees = this.state.rotation * 180 / Math.PI;
            rotateSlider.value = degrees % 360;
            const rotateVal = document.getElementById('rotateVal');
            if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
          }
          this.touchState.initialDistance = currentDistance;
      // Mark that a pinch-zoom just occurred
      this._justPinchZoomed = true;
          this.drawSpiral();
      }
    } else if (e.touches.length === 1 && this.mouseState.isDragging) {
      // Single-finger drag rotation
      const rect = this.canvas.getBoundingClientRect();
      const touchX = e.touches[0].clientX - rect.left;
      const touchY = e.touches[0].clientY - rect.top;
      // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
      const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
      const currentAngle = Math.atan2(touchY - centerY, touchX - centerX);
      
      // Calculate incremental angle change from last position
      let deltaAngle = currentAngle - this.mouseState.lastAngle;
      
      // Handle angle wraparound to prevent jumps when crossing -180°/+180° boundary
      if (deltaAngle > Math.PI) {
        deltaAngle -= 2 * Math.PI;
      } else if (deltaAngle < -Math.PI) {
        deltaAngle += 2 * Math.PI;
      }
      
      // Check if we've moved significantly to consider this a drag
      if (Math.abs(deltaAngle) > 0.05) { // 0.05 radians ≈ 3 degrees
        this.mouseState.hasMovedDuringDrag = true;
      }
      
      // Always apply rotation for smooth movement (even small movements)
      if (Math.abs(deltaAngle) > 0.001) { // Very small threshold to avoid jitter
        // Apply incremental rotation (invert direction when not in static mode)
        const rotationDirection = this.state.staticMode ? 1 : -1;
        const appliedDelta = deltaAngle * rotationDirection;
        this.state.rotation += appliedDelta;
        // Mark that this is a manual rotation, so event list should update
        this._shouldUpdateEventList = true;
        this.mouseState.lastAngle = currentAngle; // Update reference for next move
        // Track velocity sample for inertia (touch)
        const now = performance.now();
        if (!this._velSamples) this._velSamples = [];
        if (this._lastMoveTs !== undefined) {
          const dt = Math.max(0.001, (now - this._lastMoveTs) / 1000);
          const v = appliedDelta / dt;
          this._velSamples.push({ t: now, v });
          const cutoff = now - 200;
          while (this._velSamples.length && this._velSamples[0].t < cutoff) this._velSamples.shift();
        }
        this._lastMoveTs = now;
        
        // Update the rotateSlider UI to match
        const rotateSlider = document.getElementById('rotateSlider');
        if (rotateSlider) {
          let degrees = this.state.rotation * 180 / Math.PI;
          // Allow indefinite rotation for touch drag
          rotateSlider.value = degrees % 360; // Only constrain slider visual, not the actual value
          const rotateVal = document.getElementById('rotateVal');
          if (rotateVal) rotateVal.textContent = Math.round(degrees) + '°';
        }
        
        this.drawSpiral();
      }
    }
  // In handleTouchMove, after updating this.state.rotation (for pinch-zoom):
  this.clampRotationToEventWindow();
  }

  /**
   * Handle touch end event for pinch-to-zoom and drag rotation
   */
  handleTouchEnd(e) {
    // If page zoom is active, no canvas gesture to finalize
    if (this.pageZoomActive) return;

    // Finalize time display swipe/tap
    if (this.timeDisplayState && this.timeDisplayState.swipeActive && this.state.showTimeDisplay) {
      // Treat as tap if minimal movement
      const dy = this.timeDisplayState.swipeLastY - this.timeDisplayState.swipeStartY;
      const tiny = Math.abs(dy) < 6;
      if (tiny) {
        if (this.timeDisplayState.collapsed) {
          // Tap on collapsed bar expands it
          this.setTimeDisplayCollapsed(false);
        } else {
          // Tap on expanded bar -> enable Auto Time Align if currently off
          const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
          if (!this.autoTimeAlignState.enabled) {
            if (autoTimeAlignCheckbox) autoTimeAlignCheckbox.checked = true;
            this.autoTimeAlignState.enabled = true;
            this.startAutoTimeAlign();
          }
          // Light feedback
          this.playFeedback(0.15, 10);
        }
        this.timeDisplayState.swipeActive = false;
        return;
      }
      // Decide final state based on pull-up offset and time display height
      const base = CONFIG.TIME_DISPLAY_HEIGHT;
      const minH = this.timeDisplayState.collapseHeight || 12;
      const threshold = this.timeDisplayState.eventListThreshold || 20;
      const currentOffset = this.timeDisplayState.pullUpOffset || 0;
      const h = this.getTimeDisplayHeight();
      
      if (h <= minH + (base - minH) / 2) {
        // Snap collapsed - reset offset
        this.timeDisplayState.collapsed = true;
        this.timeDisplayState.currentHeight = minH;
        this.timeDisplayState.targetHeight = minH;
        this.timeDisplayState.pullUpOffset = 0;
        this.hideBottomEventList();
      } else {
        // Time display is expanded
        this.timeDisplayState.collapsed = false;
        this.timeDisplayState.currentHeight = base;
        this.timeDisplayState.targetHeight = base;
        // Snap pull-up offset: use midpoint of max offset (similar to pull-down using midpoint of height range)
        const canvasHeight = this.canvas.clientHeight;
        const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
        const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
        const timeDisplayBottom = canvasHeight - currentOffset;
        const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
        const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
        const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
        const maxOffset = contentHeight > 0 ? Math.min(contentHeight, maxAllowedHeight) : maxAllowedHeight;
        const offsetMid = maxOffset / 2;
        if (currentOffset < offsetMid) {
          // Snapped back to default - hide event list and reset offset
          this.timeDisplayState.pullUpOffset = 0;
          this.hideBottomEventList();
        } else {
          // Snapped to extended event list position
          this.timeDisplayState.pullUpOffset = maxOffset;
          this.showBottomEventList(maxOffset);
        }
      }
      this.timeDisplayState.swipeActive = false;
      // Set flag to prevent segment selection after time display drag
      this.timeDisplayState.justFinishedDrag = true;
      // Clear the flag after a short delay to allow normal interaction
      setTimeout(() => {
        if (this.timeDisplayState) {
          this.timeDisplayState.justFinishedDrag = false;
        }
      }, 100);
      this.drawSpiral();
      return;
    }
    
    // Reset four-finger days adjust if we no longer have 4 touches
    if (e.touches.length < 4) {
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
        this.touchState.anchorTouchIds = [];
        this.touchState.daysPinchTouchIds = [];
      }
    }
    
    // Reset three-finger radius adjust if we no longer have 3 touches
    if (e.touches.length < 3) {
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
        this.touchState.anchorTouchId = null;
        this.touchState.pinchTouchIds = [];
      }
    }
    
    if (e.touches.length < 2) {
      this.touchState.isActive = false;
    }
    if (e.touches.length === 0) {
      // If we marked to enable device orientation from button press, do it now (still in user gesture)
      if (this._pendingEnableDeviceOrientation) {
        this._pendingEnableDeviceOrientation = false;
        // Call the gesture-safe enabler to ensure iOS prompt appears
        this.enableDeviceOrientationViaGesture();
      }
      if (this.mouseState.isDragging && this.mouseState.hasMovedDuringDrag) {
        this.mouseState.wasDragging = true;
      }
      this.mouseState.isDragging = false;
      this.mouseState.hasMovedDuringDrag = false;
      // On release, compute averaged velocity and start inertia (touch)
      if (this._velSamples && this._velSamples.length) {
        const now = performance.now();
        // Only start inertia if we've moved recently (within last 300ms)
        const recentCutoff = now - 300;
        const recentSamples = this._velSamples.filter(s => s.t >= recentCutoff);
        
        if (recentSamples.length > 0) {
          // Weighted average (more weight to latest samples)
          let wsum = 0, vsum = 0;
          for (const s of recentSamples) {
            const w = 1 + Math.max(0, (s.t - recentCutoff) / 300); // 1..2
            wsum += w; vsum += s.v * w;
          }
          let avgV = vsum / (wsum || 1);
          
          // Add momentum from previous inertia (if any) - same as mouse handler
          if (this.mouseState.previousInertiaVelocity) {
            // Add previous velocity with some decay based on how much time passed since drag started
            const dragDuration = Math.min(now - (recentSamples[0]?.t || now), 1000); // Cap at 1 second
            const momentumDecay = Math.exp(-dragDuration / 500); // Decay over 0.5 seconds
            const momentumContribution = this.mouseState.previousInertiaVelocity * momentumDecay;
            
            // Add momentum in the same direction, or allow cancellation if dragging opposite
            avgV += momentumContribution;
          }
          
          // Clear stored previous velocity
          this.mouseState.previousInertiaVelocity = 0;
          
          if (Math.abs(avgV) < 0.15) {
            this.snapIfClose();
            this.drawSpiral();
          } else {
            this.startInertia(avgV);
          }
        }
        // Clear samples regardless
        this._velSamples = [];
        this._lastMoveTs = undefined;
      }
      
      // Handle long-press timer and stop tilt zoom if it was active
      if (this.mouseState.clickingTiltZoomArea) {
        if (this._tiltZoomPressTimerId) {
          clearTimeout(this._tiltZoomPressTimerId);
          this._tiltZoomPressTimerId = null;
        }
        if (this.deviceOrientationState.tiltZoomActive) {
          this.stopTiltZoomMode();
        }
        this.mouseState.clickingTiltZoomArea = false;
      }

      // Handle touch click for time display and info circle date boxes (mobile devices)
      if (!this.mouseState.wasDragging && !this.mouseState.hasMovedDuringDrag) {
        // Don't handle tap if we just finished dragging the time display
        if (this.timeDisplayState && this.timeDisplayState.justFinishedDrag) {
          return;
        }
        
        // This was a tap, not a drag - handle as a click
        const rect = this.canvas.getBoundingClientRect();
        const touchX = e.changedTouches[0].clientX - rect.left;
        const touchY = e.changedTouches[0].clientY - rect.top;
        
        // Check if tap is on the time display (only if time display is enabled)
        if (this.state.showTimeDisplay) {
          const canvasWidth = this.canvas.clientWidth;
          const canvasHeight = this.canvas.clientHeight;
          const timeDisplayArea = {
            x: 0,
            y: canvasHeight - CONFIG.TIME_DISPLAY_HEIGHT,
            width: canvasWidth,
            height: CONFIG.TIME_DISPLAY_HEIGHT
          };
          
          if (touchX >= timeDisplayArea.x && touchX <= timeDisplayArea.x + timeDisplayArea.width &&
              touchY >= timeDisplayArea.y && touchY <= timeDisplayArea.y + timeDisplayArea.height) {
            // Time display tapped - activate Auto Time Align if it's currently off
            if (!this.autoTimeAlignState.enabled) {
              const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
              if (autoTimeAlignCheckbox) {
                autoTimeAlignCheckbox.checked = true;
                this.autoTimeAlignState.enabled = true;
                this.startAutoTimeAlign();
              }
            }
            return; // Don't process other clicks
          }
        }

        // If in detail mode, also treat taps on the canvas-drawn date boxes like clicks
        if (this.state.detailMode !== null && this.canvasClickAreas) {
          if (this.canvasClickAreas.startDateBox) {
            const box = this.canvasClickAreas.startDateBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              // Mobile-friendly: open centered (handled inside openDateTimePicker)
              this.openDateTimePicker(box.event, 'start', box);
              return;
            }
          }
          if (this.canvasClickAreas.endDateBox) {
            const box = this.canvasClickAreas.endDateBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              this.openDateTimePicker(box.event, 'end', box);
              return;
            }
          }
          if (this.canvasClickAreas.calendarBox) {
            const box = this.canvasClickAreas.calendarBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              this.openCalendarPicker(box.event);
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Calculate distance between two touch points
   */
  getTouchDistance(touch1, touch2) {
    const rect = this.canvas.getBoundingClientRect();
    const x1 = touch1.clientX - rect.left;
    const y1 = touch1.clientY - rect.top;
    const x2 = touch2.clientX - rect.left;
    const y2 = touch2.clientY - rect.top;
    
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

setNightOverlayEnabled(enabled) {
  this.state.showNightOverlay = enabled;
  // Show/hide opacity controls
  const nightOverlayOpacityControls = document.getElementById('nightOverlayOpacityControls');
  if (nightOverlayOpacityControls) {
    nightOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
}

setNightOverlayLocation(lat, lng) {
  LOCATION_COORDS.lat = lat;
  LOCATION_COORDS.lng = lng;
  this.drawSpiral();
}

setDayOverlayEnabled(enabled) {
  this.state.showDayOverlay = enabled;
  // Show/hide opacity controls
  const dayOverlayOpacityControls = document.getElementById('dayOverlayOpacityControls');
  if (dayOverlayOpacityControls) {
    dayOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
}

setGradientOverlayEnabled(enabled) {
  this.state.showGradientOverlay = enabled;
  // Show/hide opacity controls
  const gradientOverlayOpacityControls = document.getElementById('gradientOverlayOpacityControls');
  if (gradientOverlayOpacityControls) {
    gradientOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
}

setTimeDisplayEnabled(enabled) {
  this.state.showTimeDisplay = enabled;
  
  // On mobile, update the stored state for orientation changes
  if (isMobileDevice()) {
    if (enabled) {
      // User manually enabled time display - store this preference
      this.mobileOrientationState.timeDisplayWasEnabled = true;
    } else {
      // User manually disabled time display - only update stored state if not in landscape
      if (!this.mobileOrientationState.isLandscape) {
        this.mobileOrientationState.timeDisplayWasEnabled = false;
      }
    }
  }
  
  this.drawSpiral();
}

setSegmentEdgesEnabled(enabled) {
  this.state.showSegmentEdges = enabled;
  this.drawSpiral();
  this.saveSettingsToStorage();
}

setArcLinesEnabled(enabled) {
  this.state.showArcLines = enabled;
  this.drawSpiral();
  this.saveSettingsToStorage();
}

setDeviceOrientationEnabled(enabled) {
  this.deviceOrientationState.buttonVisible = enabled;
  
  // Update threshold controls visibility
  const thresholdControls = document.getElementById('deviceOrientationControls');
  if (thresholdControls) {
    thresholdControls.style.display = enabled ? 'block' : 'none';
  }
  
  // Redraw to show/hide the button
  this.drawSpiral();
  this.saveSettingsToStorage();
}

startTiltZoomMode() {
  if (!this.deviceOrientationState.enabled) {
    alert('Please enable device orientation control first');
    return;
  }
  this.deviceOrientationState.tiltZoomActive = true;
  this.deviceOrientationState.tiltZoomStartBeta = null;
  this.deviceOrientationState.tiltZoomStartGamma = null;
  this.deviceOrientationState.tiltZoomStartRotation = this.state.rotation;
  this.deviceOrientationState.lastJumpTime = null;
  this.deviceOrientationState.lastRotationTime = null;
  this.deviceOrientationState.lastBeta = null;
  this.deviceOrientationState.lastGamma = null;
  this.drawSpiral();
}

stopTiltZoomMode() {
  this.deviceOrientationState.tiltZoomActive = false;
  this.deviceOrientationState.tiltZoomStartBeta = null;
  this.deviceOrientationState.tiltZoomStartGamma = null;
  this.deviceOrientationState.tiltZoomStartRotation = null;
  this.deviceOrientationState.lastJumpTime = null;
  this.deviceOrientationState.lastRotationTime = null;
  this.deviceOrientationState.lastBeta = null;
  this.deviceOrientationState.lastGamma = null;
  this.drawSpiral();
}
drawTimeDisplay(canvasWidth, canvasHeight) {
  // Helper function to get time span for a segment
  const getSegmentTimeSpan = (segment) => {
    if (!segment) return null;
    
    // Calculate the segment's time based on its position
    // The spiral counts up from outside in, so we need to account for this
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
    const hoursFromReference = segmentId;
    
    // Calculate start time for this segment
    const startTime = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour
    
    return { startTime, endTime };
  };
  
  // Determine what to display
  let displayTime, timeString, dateString;
  
  const isMobile2 = isMobileDevice();
  if (this.mouseState.hoveredSegment && !isMobile2) {
    // Show segment time span when hovering
    const timeSpan = getSegmentTimeSpan(this.mouseState.hoveredSegment);
    if (timeSpan) {
      const formatTime = (date) => this.formatUTCHHMM(date);
      
      timeString = `${formatTime(timeSpan.startTime)} - ${formatTime(timeSpan.endTime)}`;
      
      // Format date
      const weekday = WEEKDAYS_UTC[timeSpan.startTime.getUTCDay()];
      const month = MONTHS_LONG_UTC[timeSpan.startTime.getUTCMonth()];
      const day = timeSpan.startTime.getUTCDate();
      const year = timeSpan.startTime.getUTCFullYear();
      
      dateString = `${weekday}, ${month} ${day}, ${year}`;
    }
  } else if (this.mouseState.selectedSegment) {
    // Show selected segment time span when a segment is clicked
    const timeSpan = getSegmentTimeSpan(this.mouseState.selectedSegment);
    if (timeSpan) {
      const formatTime = (date) => this.formatUTCHHMM(date);
      
      timeString = `${formatTime(timeSpan.startTime)} - ${formatTime(timeSpan.endTime)}`;
      
      // Format date
      const weekday = WEEKDAYS_UTC[timeSpan.startTime.getUTCDay()];
      const month = MONTHS_LONG_UTC[timeSpan.startTime.getUTCMonth()];
      const day = timeSpan.startTime.getUTCDate();
      const year = timeSpan.startTime.getUTCFullYear();
      
      dateString = `${weekday}, ${month} ${day}, ${year}`;
    }
  } else {
    // Show normal time display (current time or spiral time)
    if (this.autoTimeAlignState.enabled) {
      // Use UTC time consistently
      const now = new Date();
      displayTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 
                                     now.getUTCHours() + TIMEZONE_OFFSET, now.getUTCMinutes(), now.getUTCSeconds()));
    } else {
      // Calculate the time corresponding to the current spiral rotation (using UTC)
      const rotationInHours = (this.state.rotation / (2 * Math.PI)) * CONFIG.SEGMENTS_PER_DAY;
      // Create UTC time based on reference time
      const utcTime = this.referenceTime.getTime() + rotationInHours * 60 * 60 * 1000;
      displayTime = new Date(utcTime);
    }
    
    // Format time and date manually using UTC methods to avoid timezone issues
    const formatUTCTime = (date) => {
      const base = this.formatUTCHHMM(date);
      const seconds = this.autoTimeAlignState.enabled ? ':' + date.getUTCSeconds().toString().padStart(2, '0') : '';
      return `${base}${seconds}`;
    };
    
    const formatUTCDate = (date) => this.formatUTCDateLong(date);
    
    timeString = formatUTCTime(displayTime);
    dateString = formatUTCDate(displayTime);
  }
  
  // Ensure timeString and dateString are always defined
  if (!timeString || !dateString) {
    // Fallback to current time if something went wrong
    const now = new Date();
    const formatTime = (date) => this.formatUTCHHMM(date);
    
    const weekday = WEEKDAYS_UTC[now.getUTCDay()];
    const month = MONTHS_LONG_UTC[now.getUTCMonth()];
    const day = now.getUTCDate();
    const year = now.getUTCFullYear();
    
    timeString = formatTime(now);
    dateString = `${weekday}, ${month} ${day}, ${year}`;
  }
  

  
  // Detect standalone mode (PWA installed on home screen)
  // In standalone mode, viewport is full screen and safe area is part of viewport
  // In browser mode, safe area needs to be accounted for differently
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                       (window.navigator && window.navigator.standalone);
  
  // Get safe area bottom for iOS to position time display correctly
  // The safe area is typically ~34px on iPhones, but env() gives us CSS pixels which account for device pixel ratio
  const appElement = document.getElementById('app');
  const appPaddingBottom = appElement ? 
    parseFloat(getComputedStyle(appElement).paddingBottom) || 0 : 0;
  
  // Detect iOS/iPhone device
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  // In standalone mode, canvas fills the full viewport (including safe area)
  // In browser mode, canvas is within #app which may have padding-bottom
  // Position time display at canvas bottom - it should be flush with viewport bottom in standalone
  // But if event list is visible, move time display up to make room for it
  const baseHeight = CONFIG.TIME_DISPLAY_HEIGHT;
  const timeDisplayHeight = this.getTimeDisplayHeight();
  const minHForRender = this.timeDisplayState ? (this.timeDisplayState.collapseHeight || 12) : 12;
  const timeDisplayCollapsed = timeDisplayHeight <= (minHForRender + 0.5);
  const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
  const eventListHeight = this.getEventListHeight();
  
  // Add safe area bottom inset for iPhones when in default (middle) state
  // Only apply when not pulled up (pullUpOffset is 0 or very small)
  const safeAreaBottom = (isIOS && pullUpOffset < 10) ? 34 : 0;
  
  // Time display moves up by the pull-up offset and accounts for safe area on iOS
  const timeDisplayY = canvasHeight - timeDisplayHeight - pullUpOffset - safeAreaBottom;
  
  // Check if mouse is hovering over time display area
  const timeDisplayArea = {
    x: 0,
    y: timeDisplayY,
    width: canvasWidth,
    height: CONFIG.TIME_DISPLAY_HEIGHT  // Use base height for hit detection
  };
  
  const isHovering = this.mouseState.hoveredTimeDisplay || false;
  const isClicking = this.mouseState.clickingTimeDisplay || false;
  
  // Draw background with hover/click effects
  this.ctx.save();
  
  // Background color based on state
  let backgroundColor = 'rgba(255, 255, 255, 0.9)'; // Default normal background
  
  if (isClicking) {
    backgroundColor = 'rgba(240, 240, 240, 0.95)'; // Slightly darker when clicking
  } else if (isHovering) {
    backgroundColor = 'rgba(248, 248, 248, 0.95)'; // Slightly lighter when hovering
  }
  
  
  
  this.ctx.fillStyle = backgroundColor;
  
  // Fill the entire bottom area (no side margins)
  // In standalone mode, extend background slightly into safe area for flush appearance
  // But keep text positioning as-is to ensure visibility
  const fillHeight = isStandalone ? timeDisplayHeight : timeDisplayHeight;
  this.ctx.fillRect(0, timeDisplayY, canvasWidth, fillHeight);
  
  // Draw a small grab indicator at the top of the time display (expanded/animating state)
  if (!timeDisplayCollapsed) {
    this.ctx.save();
    const minH = (this.timeDisplayState && this.timeDisplayState.collapseHeight) ? this.timeDisplayState.collapseHeight : 12;
    const baseH = CONFIG.TIME_DISPLAY_HEIGHT;
    const progress = Math.max(0, Math.min(1, (timeDisplayHeight - minH) / Math.max(1, (baseH - minH))));
    // Collapsed center-handle reference
    const collapsedW = 16;
    const collapsedH = 3;
    // Expanded top-handle target
    const expandedW = Math.max(24, Math.min(48, timeDisplayHeight * 0.5));
    const expandedH = Math.max(1, Math.min(2, timeDisplayHeight * 0.12));
    const handleWidth = collapsedW + (expandedW - collapsedW) * progress;
    const handleHeight = collapsedH + (expandedH - collapsedH) * progress;
    const handleX = (canvasWidth - handleWidth) / 2;
    // Distance from the top morphs from half of collapsed height to a small top padding
    const topPadExpanded = 3;
    const topPadCollapsed = (minH / 2);
    const handleTopOffset = topPadCollapsed + (topPadExpanded - topPadCollapsed) * progress;
    const handleY = timeDisplayY + handleTopOffset;
    this.ctx.fillStyle = '#888';
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillRect(handleX, handleY, handleWidth, handleHeight);
    this.ctx.globalAlpha = 1.0;
    this.ctx.restore();
  }
  
  // Draw the border around the entire time display area
  const isMobile = isMobileDevice();
  if (this.mouseState.hoveredSegment && !isMobile) {
    // Check if hovering over the already selected segment
    const isHoveringOverSelected = this.mouseState.selectedSegment && 
      this.mouseState.hoveredSegment.day === this.mouseState.selectedSegment.day && 
      this.mouseState.hoveredSegment.segment === this.mouseState.selectedSegment.segment;
    
    if (isHoveringOverSelected) {
      // Hovering over selected segment - use SELECTED_SEGMENT_COLOR and SELECTED_BORDER_WIDTH
      this.ctx.strokeStyle = CONFIG.SELECTED_SEGMENT_COLOR;
      this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
    } else {
      // Hovering over different segment - use HOVER_SEGMENT_COLOR and HOVER_BORDER_WIDTH
        this.ctx.strokeStyle = CONFIG.getHoverSegmentColor();
      this.ctx.lineWidth = CONFIG.HOVER_BORDER_WIDTH;
    }
  } else if (this.mouseState.selectedSegment) {
    // Selected segment - use SELECTED_SEGMENT_COLOR and SELECTED_BORDER_WIDTH
    this.ctx.strokeStyle = CONFIG.SELECTED_SEGMENT_COLOR;
    this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
  } else if (isClicking) {
    this.ctx.strokeStyle = '#999'; // Darker border when clicking time display
    this.ctx.lineWidth = 1;
  } else if (isHovering) {
    this.ctx.strokeStyle = '#bbb'; // Slightly darker border when hovering time display
    this.ctx.lineWidth = 1;
  } else {
    this.ctx.strokeStyle = '#ccc'; // Normal border
    this.ctx.lineWidth = 1;
  }


  
  // Check if hovered segment has an event and use its color
  if (this.mouseState.hoveredSegment) {
    const eventInfo = this.getEventColorForSegment(this.mouseState.hoveredSegment.day, this.mouseState.hoveredSegment.segment);
    if (eventInfo) {
      this.ctx.strokeStyle = eventInfo.color;
    }
  }
  
  // Check if selected segment has an event and use its color
  if (this.mouseState.selectedSegment && !this.mouseState.hoveredSegment) {
    const eventInfo = this.getEventColorForSegment(this.mouseState.selectedSegment.day, this.mouseState.selectedSegment.segment);
    if (eventInfo) {
      this.ctx.strokeStyle = eventInfo.color;
    }
  }

  // just show the default border
  this.ctx.strokeStyle = '#ccc';
  this.ctx.lineWidth = 1;


  

  
  // Draw border on top and bottom of the time display only (inside edge to avoid clipping)
  const halfStrokeWidth = this.ctx.lineWidth / 2;
  // Top border
  this.ctx.beginPath();
  this.ctx.moveTo(halfStrokeWidth, timeDisplayY + halfStrokeWidth);
  this.ctx.lineTo(canvasWidth - halfStrokeWidth, timeDisplayY + halfStrokeWidth);
  this.ctx.stroke();
  // Bottom border
  this.ctx.beginPath();
  this.ctx.moveTo(halfStrokeWidth, timeDisplayY + timeDisplayHeight - halfStrokeWidth);
  this.ctx.lineTo(canvasWidth - halfStrokeWidth, timeDisplayY + timeDisplayHeight - halfStrokeWidth);
  this.ctx.stroke();
  
  // If collapsed, draw only a small grab-handle indicator and skip text
  if (timeDisplayCollapsed) {
    // Small chevron to indicate expandable bar
    this.ctx.fillStyle = '#888';
    const cx = canvasWidth / 2;
    const cy = timeDisplayY + timeDisplayHeight / 2;
    const w = 16, h = 3;
    this.ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    this.ctx.restore();
    return;
  }
  
  // Draw text
  this.ctx.fillStyle = '#333';
  this.ctx.textAlign = 'center';
  // Use middle baseline so time+date pair can be centered perfectly within the bar
  this.ctx.textBaseline = 'middle';
  
  // Time (font, with fixed-width centering)
  // Scale font size with canvas width, but only shrink below threshold
  const thresholdWidth = 400; // Fixed size above this width
  let fontSize = 24; // Default size
  if (canvasWidth < thresholdWidth) {
    // Scale down proportionally below threshold
    const scaleFactor = canvasWidth / thresholdWidth;
    fontSize = Math.max(1, scaleFactor * 24); // Scale down from 24px, minimum 1px
  }
  this.ctx.font = getFontString(fontSize);
  
  // Calculate time display center using the current (possibly animating) height
  const timeDisplayCenterY = timeDisplayY + this.getTimeDisplayHeight() / 2;
  const actualCenterY = timeDisplayCenterY;
  
  // Calculate the maximum possible time string width based on format
  let maxTimeString;
  if (this.mouseState.hoveredSegment || this.mouseState.selectedSegment) {
    // For segment time ranges, use the maximum possible range width
    maxTimeString = '23:59 - 00:00';
  } else {
    maxTimeString = this.autoTimeAlignState.enabled ? '23:59:59' : '23:59';
  }
  const maxTimeWidth = this.ctx.measureText(maxTimeString).width;
  const currentTimeWidth = this.ctx.measureText(timeString).width;
  
  // Position text based on the top of the bar (moves at same rate as the box)
  const timeX = canvasWidth / 2 - (maxTimeWidth - currentTimeWidth) / 2;
  const topY = timeDisplayY;
  // Offsets scale with height but have sensible caps
  // Compute centered Y positions with a consistent gap between time and date
  const centerYLive = timeDisplayY + timeDisplayHeight / 2;
  const gap = Math.max(16, Math.min(26, timeDisplayHeight * 0.36)); // balanced spacing
  // Slide text from below screen as the bar expands
  const minH = (this.timeDisplayState && this.timeDisplayState.collapseHeight) ? this.timeDisplayState.collapseHeight : 12;
  const baseH = CONFIG.TIME_DISPLAY_HEIGHT;
  const progress = Math.max(0, Math.min(1, (timeDisplayHeight - minH) / Math.max(1, (baseH - minH))));
  const appearOvershoot = 28; // px extra below-screen shift when nearly collapsed
  const extraBelow = (1 - progress) * appearOvershoot;
  const timeY = centerYLive - gap / 2 + extraBelow;
  this.ctx.fillText(timeString, timeX, timeY);
  
  // Date
  this.ctx.font = getFontString(fontSize);
  const dateY = centerYLive + gap / 2 + extraBelow;
  this.ctx.fillText(dateString, canvasWidth / 2, dateY);
  
  // Draw tilt-zoom control area on mobile when button is set to be visible
  const isMobileTZ = isMobileDevice();
  
  
  
  if (isMobileTZ && this.deviceOrientationState.buttonVisible) {
    // Always show the button on mobile, but with different appearance based on state
    const isEnabled = this.deviceOrientationState.enabled;
    const isActive = this.deviceOrientationState.tiltZoomActive;
    const areaHeight = CONFIG.TIME_DISPLAY_HEIGHT - 2 * 10; // full time display height minus padding
    const areaWidth = areaHeight; // make it square
    const padding = 10;
    const areaX = canvasWidth - areaWidth - padding; // right edge
    const areaY = timeDisplayY + padding;
    
    // Background pill
    this.ctx.save();
    
    // Different appearance based on state
    if (!isEnabled) {
      // Device orientation not enabled - show as disabled
      this.ctx.fillStyle = 'rgba(200,200,200,0.3)';
      this.ctx.strokeStyle = '#ccc';
    } else if (isActive) {
      // Tilt zoom active - show as active
      this.ctx.fillStyle = 'rgba(33,150,243,0.25)';
      this.ctx.strokeStyle = '#2196F3';
    } else {
      // Enabled but not active - show as ready
      this.ctx.fillStyle = 'rgba(0,0,0,0.06)';
      this.ctx.strokeStyle = '#bbb';
    }
    
    this.ctx.lineWidth = 1;
    const r = areaHeight / 2; // fully rounded (pill/square-circle)
    this.ctx.beginPath();
    this.ctx.moveTo(areaX + r, areaY);
    this.ctx.lineTo(areaX + areaWidth - r, areaY);
    this.ctx.quadraticCurveTo(areaX + areaWidth, areaY, areaX + areaWidth, areaY + r);
    this.ctx.lineTo(areaX + areaWidth, areaY + areaHeight - r);
    this.ctx.quadraticCurveTo(areaX + areaWidth, areaY + areaHeight, areaX + areaWidth - r, areaY + areaHeight);
    this.ctx.lineTo(areaX + r, areaY + areaHeight);
    this.ctx.quadraticCurveTo(areaX, areaY + areaHeight, areaX, areaY + areaHeight - r);
    this.ctx.lineTo(areaX, areaY + r);
    this.ctx.quadraticCurveTo(areaX, areaY, areaX + r, areaY);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    // Minimalist indicator: small dot that moves up/down based on tilt
    const dotR = Math.max(3, Math.min(6, areaHeight * 0.12));
    
    // Determine dot color based on state and threshold
    let dotColor = '#888'; // default gray
    if (!isEnabled) {
      // Device orientation not enabled - show as disabled
      dotColor = '#ccc';
    } else if (isActive) {
      // Check if we're in threshold zones
      let inThresholdZone = false;
      
      if (this.deviceOrientationState.tiltZoomStartBeta !== null && 
          this.deviceOrientationState.lastBeta !== null) {
        const betaDelta = Math.abs(this.deviceOrientationState.lastBeta - this.deviceOrientationState.tiltZoomStartBeta);
        if (betaDelta <= this.deviceOrientationThresholds.beta) inThresholdZone = true; // beta threshold
      }
      
      if (this.deviceOrientationState.tiltZoomStartGamma !== null && 
          this.deviceOrientationState.lastGamma !== null) {
        const gammaDelta = Math.abs(this.deviceOrientationState.lastGamma - this.deviceOrientationState.tiltZoomStartGamma);
        if (gammaDelta <= this.deviceOrientationThresholds.gamma) inThresholdZone = true; // gamma threshold
      }
      
      // Blue when active, orange when in threshold zone
      dotColor = inThresholdZone ? '#FF9800' : '#2196F3';
    } else {
      // Enabled but not active - show as ready
      dotColor = '#666';
    }
    
    this.ctx.fillStyle = dotColor;
    
    // Calculate dot position based on current tilt (both beta and gamma)
    let dotX = areaX + areaWidth / 2; // center X position
    let dotY = areaY + areaHeight / 2; // center Y position
    
    // Use unified threshold constants from class
    const betaThreshold = this.deviceOrientationThresholds.beta;
    const gammaThreshold = this.deviceOrientationThresholds.gamma;
    const maxBetaTilt = this.deviceOrientationThresholds.maxBeta;
    const maxGammaTilt = this.deviceOrientationThresholds.maxGamma;
    
    if (this.deviceOrientationState.tiltZoomActive) {
      // Vertical movement based on beta (tilt up/down)
      if (this.deviceOrientationState.tiltZoomStartBeta !== null && 
          this.deviceOrientationState.lastBeta !== null) {
        const betaDelta = this.deviceOrientationState.lastBeta - this.deviceOrientationState.tiltZoomStartBeta;
        const maxDotMovementY = (areaHeight - dotR * 2) / 2; // pixels
        
        if (Math.abs(betaDelta) > betaThreshold) {
          // Outside threshold: move dot proportionally
          const betaRatio = Math.max(-1, Math.min(1, betaDelta / maxBetaTilt)); // clamp to -1 to 1
          dotY += betaRatio * maxDotMovementY;
        }
        // Inside threshold: dot stays centered (dotY remains center)
      }
      
      // Horizontal movement based on gamma (tilt left/right)
      if (this.deviceOrientationState.tiltZoomStartGamma !== null && 
          this.deviceOrientationState.lastGamma !== null) {
        const gammaDelta = this.deviceOrientationState.lastGamma - this.deviceOrientationState.tiltZoomStartGamma;
        const maxDotMovementX = (areaWidth - dotR * 2) / 2; // pixels
        
        if (Math.abs(gammaDelta) > gammaThreshold) {
          // Outside threshold: move dot proportionally
          const gammaRatio = Math.max(-1, Math.min(1, gammaDelta / maxGammaTilt)); // clamp to -1 to 1
          dotX += gammaRatio * maxDotMovementX;
        }
        // Inside threshold: dot stays centered (dotX remains center)
      }
      
      // Clamp dot position within button bounds
      dotX = Math.max(areaX + dotR, Math.min(areaX + areaWidth - dotR, dotX));
      dotY = Math.max(areaY + dotR, Math.min(areaY + areaHeight - dotR, dotY));
      
      // Draw subtle center cross indicator (only when enabled)
      if (isEnabled) {
        this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        this.ctx.lineWidth = 1;
        
        // Vertical center line
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + areaWidth / 2, areaY + 4);
        this.ctx.lineTo(areaX + areaWidth / 2, areaY + areaHeight - 4);
        this.ctx.stroke();
        
        // Horizontal center line
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + 4, areaY + areaHeight / 2);
        this.ctx.lineTo(areaX + areaWidth - 4, areaY + areaHeight / 2);
        this.ctx.stroke();
      }
      
      // Draw threshold zone indicators (only when enabled and active)
      if (isEnabled && isActive) {
        this.ctx.strokeStyle = 'rgba(255,0,0,0.15)';
        this.ctx.lineWidth = 2;
        
        // Vertical threshold zones (beta)
        const maxDotMovementY = (areaHeight - dotR * 2) / 2; // pixels
        const betaThresholdPixels = (betaThreshold / maxBetaTilt) * maxDotMovementY;
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + areaWidth / 2 - 6, areaY + areaHeight / 2 - betaThresholdPixels);
        this.ctx.lineTo(areaX + areaWidth / 2 + 6, areaY + areaHeight / 2 - betaThresholdPixels);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + areaWidth / 2 - 6, areaY + areaHeight / 2 + betaThresholdPixels);
        this.ctx.lineTo(areaX + areaWidth / 2 + 6, areaY + areaHeight / 2 + betaThresholdPixels);
        this.ctx.stroke();
        
        // Horizontal threshold zones (gamma)
        const maxDotMovementX = (areaWidth - dotR * 2) / 2; // pixels
        const gammaThresholdPixels = (gammaThreshold / maxGammaTilt) * maxDotMovementX;
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + areaWidth / 2 - gammaThresholdPixels, areaY + areaHeight / 2 - 6);
        this.ctx.lineTo(areaX + areaWidth / 2 - gammaThresholdPixels, areaY + areaHeight / 2 + 6);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(areaX + areaWidth / 2 + gammaThresholdPixels, areaY + areaHeight / 2 - 6);
        this.ctx.lineTo(areaX + areaWidth / 2 + gammaThresholdPixels, areaY + areaHeight / 2 + 6);
        this.ctx.stroke();
      }
    }
    
    this.ctx.beginPath();
    this.ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    
    // Store hit area for interaction
    this.canvasClickAreas.tiltZoomArea = { x: areaX, y: areaY, width: areaWidth, height: areaHeight };
  } else {
    this.canvasClickAreas.tiltZoomArea = null;
  }

  this.ctx.restore();
  
  // Update event list if visible to reflect new display time for proximity scaling
  // But skip updates when auto time align is enabled (to prevent scroll position reset every second)
  // Still update when user manually moves the spiral (checked via flag set before drawSpiral calls)
  if (!this.autoTimeAlignState.enabled || this._shouldUpdateEventList) {
    // Clear the flag after checking
    if (this._shouldUpdateEventList) {
      this._shouldUpdateEventList = false;
    }
    
    // Throttle updates to avoid excessive re-rendering (only check every 100ms)
    const now = performance.now();
    if (!this._lastEventListUpdateTime) this._lastEventListUpdateTime = 0;
    if (now - this._lastEventListUpdateTime > 100) { // Update at most every 100ms
      this._lastEventListUpdateTime = now;
      
      if (typeof window.renderEventList === 'function') {
        // Check if bottom event list is visible
        const bottomEventList = document.getElementById('bottomEventList');
        const isBottomListVisible = bottomEventList && bottomEventList.style.maxHeight && bottomEventList.style.maxHeight !== '0px';
        
        // Check if event panel is open
        const eventInputPanel = document.getElementById('eventInputPanel');
        const isEventPanelVisible = eventInputPanel && eventInputPanel.style.display !== 'none';
        
        // Update event list if either is visible
        if (isBottomListVisible || isEventPanelVisible) {
          window.renderEventList();
        }
      }
    }
  }
}
// Helper function to clamp rotation when detailMode is active
clampRotationToEventWindow() {
  if (this.state.detailMode !== null && this.mouseState.selectedSegment) {
    // Use the same totalVisibleSegments as everywhere else
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segment = this.mouseState.selectedSegment;
    const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY);
    const eventHour = segmentId;
    const maxRotation = ((eventHour - 23.999) / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
    const minRotation = -1;
    if (this.state.rotation < minRotation) this.state.rotation = minRotation;
    if (this.state.rotation > maxRotation) this.state.rotation = maxRotation;
    
    // Reset scale to original spiral scale when clamping rotation in circle mode
    if (this.state.circleMode && this._originalSpiralScale !== null) {
      this.state.spiralScale = this._originalSpiralScale;
      
      // Update the UI slider
      const scaleSlider = document.getElementById('scaleSlider');
      if (scaleSlider) {
        scaleSlider.value = this.state.spiralScale;
        const scaleVal = document.getElementById('scaleVal');
        if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
      }
    }
  }
  this.drawSpiral();
  }

  /**
   * Draw night overlays on top of everything
   */
  drawNightOverlays() {
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.nightOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode night overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for night overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        // Use configurable opacity for night overlay
        const nightOverlayColor = `rgba(0, 0, 0, ${this.state.nightOverlayOpacity})`;
        this.ctx.fillStyle = nightOverlayColor;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode night overlay: use adaptive band drawing
        const segmentAngleSize = overlay.rawEndAngle - overlay.rawStartAngle;
        const timeStartTheta = overlay.rawStartAngle + (1 - overlay.overlayEndFrac) * segmentAngleSize;
        const timeEndTheta = overlay.rawStartAngle + (1 - overlay.overlayStartFrac) * segmentAngleSize;
        const arcStart = Math.max(timeStartTheta, overlay.startTheta);
        const arcEnd = Math.min(timeEndTheta, overlay.endTheta);
        if (arcEnd > arcStart) {
          // Use configurable opacity for night overlay
          const nightOverlayColor = `rgba(0, 0, 0, ${this.state.nightOverlayOpacity})`;
          this.drawSpiralBand(arcStart, arcEnd, overlay.radiusFunction, nightOverlayColor);
        }
      }
    }
  }

  /**
   * Draw day overlays on top of everything
   */
  drawGradientOverlays() {
    if (!this.state.showGradientOverlay) return;
    
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.gradientOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode gradient overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for gradient overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        this.ctx.fillStyle = overlay.color;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode gradient overlay: use adaptive band drawing
        this.drawSpiralBand(overlay.startTheta, overlay.endTheta, overlay.radiusFunction, overlay.color);
      }
    }
  }
  
  drawDayOverlays() {
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.dayOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode day overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for day overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        this.ctx.fillStyle = overlay.color;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode day overlay: use adaptive band drawing
        this.drawSpiralBand(overlay.startTheta, overlay.endTheta, overlay.radiusFunction, overlay.color);
      }
    }
  }
  
  /**
   * Draw arc lines on top of everything
   */
  drawArcLines() {
    if (!this.state.showArcLines) return;
    
    this.ctx.strokeStyle = CONFIG.STROKE_COLOR;
    this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
    
    for (const arcLine of this.arcLines) {
      this.ctx.beginPath();
      
      if (arcLine.isCircleMode) {
        // Circle mode arc lines
        if (arcLine.isInner) {
          // Draw inner arc (counter-clockwise)
          this.ctx.arc(0, 0, arcLine.innerRadius, arcLine.startAngle, arcLine.endAngle, false);
        } else {
          // Draw outer arc (clockwise)
          this.ctx.arc(0, 0, arcLine.outerRadius, arcLine.startAngle, arcLine.endAngle, true);
        }
      } else {
        // Spiral mode arc lines
        if (arcLine.isInner) {
          // Draw inner arc
          let angle = -arcLine.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = arcLine.radiusFunction(arcLine.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          this.ctx.moveTo(x, y);
          
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (arcLine.endTheta - arcLine.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
          for (let i = 1; i <= innerSteps; i++) {
            const t = i / innerSteps;
            const rawAngle = arcLine.startTheta + t * (arcLine.endTheta - arcLine.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = arcLine.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }
        } else {
          // Draw outer arc
          let angle = -arcLine.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = arcLine.radiusFunction(arcLine.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          this.ctx.moveTo(x, y);
          
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (arcLine.endTheta - arcLine.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
          for (let i = 1; i <= innerSteps; i++) {
            const t = i / innerSteps;
            const rawAngle = arcLine.startTheta + t * (arcLine.endTheta - arcLine.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = arcLine.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }
        }
      }
      
      this.ctx.stroke();
    }
  }

  // Device orientation methods
  async requestDeviceOrientationPermission() {
    if (this.deviceOrientationState.isRequestingPermission) return;
    
    this.deviceOrientationState.isRequestingPermission = true;
    
    try {
      // Check if we need to request permission (iOS 13+)
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          alert('Device orientation permission denied. Please enable it in your browser settings.');
          this.deviceOrientationState.enabled = false;
          document.getElementById('deviceOrientationToggle').checked = false;
          return;
        }
      }
      
      this.deviceOrientationState.permissionGranted = true;
      this.startDeviceOrientation();
      
    } catch (error) {
      console.error('Error requesting device orientation permission:', error);
      alert('Failed to get device orientation permission. Please check your browser settings.');
      this.deviceOrientationState.enabled = false;
      document.getElementById('deviceOrientationToggle').checked = false;
    } finally {
      this.deviceOrientationState.isRequestingPermission = false;
    }
  }

  // Enable orientation by calling iOS permission directly within a user gesture (touchend/mouseup)
  enableDeviceOrientationViaGesture() {
    if (this.deviceOrientationState.enabled && this.deviceOrientationState.permissionGranted) return;
    if (this.deviceOrientationState.isRequestingPermission) return;
    try {
      const toggle = document.getElementById('deviceOrientationToggle');
      const thresholdControls = document.getElementById('deviceOrientationControls');
      // iOS 13+: explicit permission required
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        this.deviceOrientationState.isRequestingPermission = true;
        DeviceOrientationEvent.requestPermission()
          .then((permission) => {
            if (permission === 'granted') {
              this.deviceOrientationState.permissionGranted = true;
              this.deviceOrientationState.enabled = true;
              if (toggle) toggle.checked = true;
              if (thresholdControls) thresholdControls.style.display = 'block';
              this.startDeviceOrientation();
              this.drawSpiral();
            } else {
              alert('Device orientation permission denied. Please enable it in your browser settings.');
              this.deviceOrientationState.enabled = false;
              if (toggle) toggle.checked = false;
            }
          })
          .catch((error) => {
            console.error('Error requesting device orientation permission:', error);
            alert('Failed to get device orientation permission. Please check your browser settings.');
            this.deviceOrientationState.enabled = false;
            if (toggle) toggle.checked = false;
          })
          .finally(() => {
            this.deviceOrientationState.isRequestingPermission = false;
          });
      } else {
        // Other platforms: permission not required
        this.deviceOrientationState.permissionGranted = true;
        this.deviceOrientationState.enabled = true;
        if (toggle) toggle.checked = true;
        if (thresholdControls) thresholdControls.style.display = 'block';
        this.startDeviceOrientation();
        this.drawSpiral();
      }
    } catch (error) {
      console.error('Error enabling device orientation:', error);
      alert('Failed to get device orientation permission. Please check your browser settings.');
      this.deviceOrientationState.enabled = false;
      const toggle = document.getElementById('deviceOrientationToggle');
      if (toggle) toggle.checked = false;
    }
  }

  startDeviceOrientation() {
    if (!this.deviceOrientationState.enabled || !this.deviceOrientationState.permissionGranted) return;
    
    
    
    // Create bound handler once and store reference
    this.deviceOrientationState.boundHandler = this.handleDeviceOrientation.bind(this);
    
    // Add event listener for device orientation
    window.addEventListener('deviceorientation', this.deviceOrientationState.boundHandler);
    
  }

  stopDeviceOrientation() {
    if (!this.deviceOrientationState.enabled) return;
    
    // Remove event listener using the bound function reference
    if (this.deviceOrientationState.boundHandler) {
      window.removeEventListener('deviceorientation', this.deviceOrientationState.boundHandler);
      this.deviceOrientationState.boundHandler = null;
    }
    
    // Reset state
    
    this.deviceOrientationState.lastBeta = null;
    this.deviceOrientationState.lastGamma = null;
    this.deviceOrientationState.betaOffset = null;
    this.deviceOrientationState.gammaOffset = null;
    this.deviceOrientationState.lastUpdateTime = null;
    this.deviceOrientationState.tiltZoomActive = false;
    this.deviceOrientationState.tiltZoomStartBeta = null;
    this.deviceOrientationState.tiltZoomStartGamma = null;
    this.deviceOrientationState.tiltZoomStartRotation = null;
    this.deviceOrientationState.lastJumpTime = null;
    this.deviceOrientationState.lastRotationTime = null;
    
    // Reset tilt zoom button if it exists
    const tiltZoomBtn = document.getElementById('tiltZoomBtn');
    if (tiltZoomBtn) {
      tiltZoomBtn.style.background = '#2196F3';
      tiltZoomBtn.title = 'Tilt to Zoom (360° jumps)';
    }
    
  }

  /**
   * Cleanup mobile orientation detection listeners
   */
  cleanupMobileOrientationDetection() {
    if (!this.mobileOrientationState.orientationChangeHandler) return;
    
    // Remove the appropriate event listener based on what was used
    if (screen && screen.orientation) {
      screen.orientation.removeEventListener('change', this.mobileOrientationState.orientationChangeHandler);
    } else {
      window.removeEventListener('resize', this.mobileOrientationState.orientationChangeHandler);
    }
    
    this.mobileOrientationState.orientationChangeHandler = null;
  }

  // Low-latency audio/haptic helpers
  ensureAudioContext() {
    if (!this._audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        this._audioContext = new Ctx({ latencyHint: 'interactive' });
      }
    }
  }

  async loadClickBuffer() {
    try {
      this.ensureAudioContext();
      if (!this._audioContext || this._clickBuffer || this._loadingClickBufferPromise) return;
      // Skip WebAudio fetch when not served over http(s) to avoid file:// CORS errors
      try {
        if (typeof location !== 'undefined') {
          const proto = location.protocol;
          if (proto !== 'http:' && proto !== 'https:') {
            return; // fallback HTMLAudio will still work on file://
          }
        }
      } catch (_) {}
      this._loadingClickBufferPromise = (async () => {
        const response = await fetch('sounds/click.mp3');
        const arrayBuffer = await response.arrayBuffer();
        let audioBuffer;
        if (this._audioContext.decodeAudioData.length === 1) {
          audioBuffer = await this._audioContext.decodeAudioData(arrayBuffer);
        } else {
          audioBuffer = await new Promise((resolve, reject) => {
            this._audioContext.decodeAudioData(arrayBuffer, resolve, reject);
          });
        }
        this._clickBuffer = audioBuffer;
      })().catch(() => {});
      await this._loadingClickBufferPromise;
    } catch (_) {}
  }

  warmAudio() {
    try {
      this.ensureAudioContext();
      if (this._audioContext && this._audioContext.state === 'suspended') {
        this._audioContext.resume().catch(() => {});
      }
      if (!this._clickBuffer && !this._loadingClickBufferPromise) {
        this.loadClickBuffer();
      }
    } catch (_) {}
  }

  installAudioGesturePrimer() {
    const prime = () => {
      this._userHasInteracted = true;
      try { this.warmAudio(); } catch (_) {}
      window.removeEventListener('pointerdown', prime, true);
      window.removeEventListener('keydown', prime, true);
      window.removeEventListener('touchstart', prime, true);
      window.removeEventListener('click', prime, true);
      window.removeEventListener('wheel', prime, true);
      
      this.canvas.removeEventListener('pointerdown', prime, true);
      this.canvas.removeEventListener('touchstart', prime, true);
      this.canvas.removeEventListener('click', prime, true);
      this.canvas.removeEventListener('wheel', prime, true);
    };
    window.addEventListener('pointerdown', prime, true);
    window.addEventListener('keydown', prime, true);
    window.addEventListener('touchstart', prime, true);
    window.addEventListener('click', prime, true);
    window.addEventListener('wheel', prime, true);
    
    this.canvas.addEventListener('pointerdown', prime, true);
    this.canvas.addEventListener('touchstart', prime, true);
    this.canvas.addEventListener('click', prime, true);
    this.canvas.addEventListener('wheel', prime, true);
  }

  playFeedback(volume = 0.1, vibrateMs = 0) {
    // Check if audio feedback is enabled
    if (!this.state.audioFeedbackEnabled) return;
    
    // Require a user gesture for audio/vibration on some platforms
    if (!this._userHasInteracted) return;

    // Haptics
    try {
      if (vibrateMs > 0 && 'vibrate' in navigator) {
        navigator.vibrate(vibrateMs);
      }
    } catch (_) {}

    // Audio
    try {
      // Rate-limit to avoid spamming players on rapid rotations
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const minIntervalMs = 30;
        if (this._lastFeedbackAt && (nowTs - this._lastFeedbackAt) < minIntervalMs) {
          return;
        }
        this._lastFeedbackAt = nowTs;
      } catch (_) {}

      this.warmAudio();
      if (this._audioContext && this._clickBuffer) {
        const ctx = this._audioContext;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const source = ctx.createBufferSource();
        source.buffer = this._clickBuffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain).connect(ctx.destination);
        try { source.start(); } catch (_) {}
        return;
      }
      // Fallback HTMLAudio with a small fixed pool to avoid creating too many players
      if (!this._fallbackPool) {
        this._fallbackPool = [];
        this._fallbackPoolIndex = 0;
        for (let i = 0; i < 4; i++) {
          const el = new Audio('sounds/click.mp3');
          el.preload = 'auto';
          this._fallbackPool.push(el);
        }
      }
      let a = null;
      const n = this._fallbackPool.length;
      for (let k = 0; k < n; k++) {
        const idx = (this._fallbackPoolIndex + k) % n;
        const el = this._fallbackPool[idx];
        if (el.paused || el.ended) {
          a = el;
          this._fallbackPoolIndex = (idx + 1) % n;
          break;
        }
      }
      if (!a) {
        // All players busy; skip this tick to avoid creating more
        return;
      }
      a.volume = Math.max(0, Math.min(1, volume));
      try { a.currentTime = 0; } catch (_) {}
      a.play().catch(() => {});
    } catch (_) {}
  }

  handleDeviceOrientation(event) {
    if (!this.deviceOrientationState.enabled) return;
    
    // Throttle updates to improve performance (max 30fps)
    const now = performance.now();
    if (this.deviceOrientationState.lastUpdateTime && 
        now - this.deviceOrientationState.lastUpdateTime < 33) { // ~30fps
      return;
    }
    this.deviceOrientationState.lastUpdateTime = now;
    
    // Handle tilt zooming (beta - tilt up/down)
    const beta = event.beta;
    const gamma = event.gamma; // roll-like
    const alpha = event.alpha; // yaw/azimuth
    
    let hasChanges = false;
    
    // Handle tilt zooming (beta - tilt up/down)
    if (beta !== null && beta !== undefined && this.deviceOrientationState.tiltZoomActive) {
      // Initialize beta tracking if not already done
      if (this.deviceOrientationState.lastBeta === null) {
        this.deviceOrientationState.lastBeta = beta;
        this.deviceOrientationState.tiltZoomStartBeta = beta;
        this.deviceOrientationState.tiltZoomStartRotation = this.state.rotation;
        this.deviceOrientationState.lastJumpTime = performance.now();
      }
      
      // Calculate tilt relative to start position
      const tiltDelta = beta - this.deviceOrientationState.tiltZoomStartBeta;
      
      // Convert tilt to jump frequency (jumps per second)
      // Tilt range: -45° to +45° maps to jump frequency
        const maxTilt = this.deviceOrientationThresholds.maxBeta; // degrees
      const maxJumpFrequency = 10; // jumps per second at max tilt
        const minTiltThreshold = this.deviceOrientationThresholds.beta; // degrees - minimum tilt to start jumping
      
      if (Math.abs(tiltDelta) > minTiltThreshold) {
        // Calculate jump frequency based on tilt intensity
        const tiltRatio = Math.min(Math.abs(tiltDelta) / maxTilt, 1.0);
        const jumpFrequency = tiltRatio * maxJumpFrequency; // jumps per second
        
        // Determine jump direction
        const jumpDirection = tiltDelta > 0 ? 1 : -1;
        
        // Calculate time since last jump
        const now = performance.now();
        const timeSinceLastJump = (now - this.deviceOrientationState.lastJumpTime) / 1000; // seconds
        
        // Calculate if it's time for the next jump
        const jumpInterval = 1.0 / jumpFrequency; // seconds between jumps
        
        if (timeSinceLastJump >= jumpInterval) {
          // Make a discrete 360° jump
          const jumpRotation = (360 * jumpDirection * Math.PI) / 180;
          this.state.rotation += jumpRotation;
          hasChanges = true;
          
          // Feedback is handled by rotation milestone checker in drawSpiral()
          
          // Update last jump time
          this.deviceOrientationState.lastJumpTime = now;
        }
      }
      
      // Store current beta for next calculation
      this.deviceOrientationState.lastBeta = beta;
    }
    
    // Handle precise rotation control using a blend of gamma (roll) and alpha (yaw)
    if (this.deviceOrientationState.tiltZoomActive && ((gamma !== null && gamma !== undefined) || (alpha !== null && alpha !== undefined))) {
      // Initialize tracking if not already done
      if (this.deviceOrientationState.lastGamma === null) {
        this.deviceOrientationState.lastGamma = gamma;
        this.deviceOrientationState.tiltZoomStartGamma = gamma;
        this.deviceOrientationState.lastRotationTime = performance.now();
      }
      if (this.deviceOrientationState.lastAlpha === null) {
        this.deviceOrientationState.lastAlpha = alpha;
        this.deviceOrientationState.tiltZoomStartAlpha = alpha;
      }
      
      // Compute deltas from start
      const gammaDelta = (gamma != null ? gamma : 0) - (this.deviceOrientationState.tiltZoomStartGamma != null ? this.deviceOrientationState.tiltZoomStartGamma : 0);
      let alphaDelta = 0;
      if (alpha != null && this.deviceOrientationState.tiltZoomStartAlpha != null) {
        let d = alpha - this.deviceOrientationState.tiltZoomStartAlpha;
        d = ((d + 540) % 360) - 180; // wrap into [-180, 180]
        alphaDelta = d;
      }
      
      // Blend by pitch: use gamma when flat, alpha when vertical
      const absPitch = Math.abs(beta || 0);
      const blendStart = 20; // degrees
      const blendEnd = 60;   // degrees
      const t = Math.max(0, Math.min(1, (absPitch - blendStart) / (blendEnd - blendStart)));
      const finalDelta = (1 - t) * (gammaDelta || 0) + t * (alphaDelta || 0);
      
      // Convert blended delta magnitude to rotation speed
      const maxTilt = this.deviceOrientationThresholds.maxGamma; // degrees
      const maxRotationSpeed = 180; // degrees per second at max tilt
      const minTiltThreshold = this.deviceOrientationThresholds.gamma; // degrees
      
      if (Math.abs(finalDelta) > minTiltThreshold) {
        const tiltRatio = Math.min(Math.abs(finalDelta) / maxTilt, 1.0);
        const rotationSpeed = tiltRatio * maxRotationSpeed;
        const rotationDirection = finalDelta > 0 ? 1 : -1;
        
        const now = performance.now();
        const timeSinceLastRotation = (now - this.deviceOrientationState.lastRotationTime) / 1000;
        const rotationDelta = (rotationSpeed * rotationDirection * timeSinceLastRotation * Math.PI) / 180;
        this.state.rotation += rotationDelta;
        hasChanges = true;
        this.deviceOrientationState.lastRotationTime = now;
      }
      
      this.deviceOrientationState.lastGamma = gamma;
      this.deviceOrientationState.lastAlpha = alpha;
    }
    
    // Only update UI and redraw if there were actual changes
    if (hasChanges) {
      // Update the rotateSlider UI to match
      const rotateSlider = document.getElementById('rotateSlider');
      if (rotateSlider) {
        let degrees = this.state.rotation * 180 / Math.PI;
        // Keep degrees in a reasonable range for the slider
        degrees = degrees % 360;
        if (degrees < 0) degrees += 360;
        rotateSlider.value = degrees;
        const rotateVal = document.getElementById('rotateVal');
        if (rotateVal) rotateVal.textContent = Math.round(this.state.rotation * 180 / Math.PI) + '°';
      }
      
      // Disable auto time align when using device orientation
      if (this.autoTimeAlignState.enabled) {
        this.stopAutoTimeAlign();
      }
      
      // Redraw the spiral
      this.drawSpiral();
    }
  }
}

// Initialize the spiral calendar when page loads
const spiralCalendar = new SpiralCalendar('spiral');
// Start zoom fail-safe monitor so users can always zoom back out in browsers
try { spiralCalendar.initializeZoomFailSafe(); } catch (_) {}


    // Save events and settings before page unload
    window.addEventListener('beforeunload', () => {
      spiralCalendar.saveEventsToStorage();
      spiralCalendar.saveSettingsToStorage();
    });

// Location controls
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const setLocationBtn = document.getElementById('setLocationBtn');
const geoLocationBtn = document.getElementById('geoLocationBtn');
const locationSearch = document.getElementById('locationSearch');
const locationSearchBtn = document.getElementById('locationSearchBtn');
const nightOverlayToggle = document.getElementById('nightOverlayToggle');
const locationControls = document.getElementById('locationControls');

// Show/hide location controls based on night overlay toggle
function updateLocationControlsVisibility() {
  if (locationControls && nightOverlayToggle) {
    locationControls.style.display = nightOverlayToggle.checked ? 'block' : 'none';
  }
}

// Initialize visibility and add event listener
if (nightOverlayToggle) {
  updateLocationControlsVisibility();
  nightOverlayToggle.addEventListener('change', updateLocationControlsVisibility);
}

setLocationBtn.addEventListener('click', () => {
const lat = parseFloat(latInput.value);
const lng = parseFloat(lngInput.value);
if (!isNaN(lat) && !isNaN(lng)) {
  spiralCalendar.setNightOverlayLocation(lat, lng);
} else {
  alert('Please enter valid latitude and longitude.');
}
});

// Helper function to get icon path based on dark mode
function getLocationIcon(iconName) {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const suffix = isDarkMode ? '_white.png' : '.png';
  return `icons/${iconName}${suffix}`;
}

// Helper function to update audio icon based on state
function updateAudioIcon(iconElement, isEnabled) {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const suffix = isDarkMode ? '_white.png' : '.png';
  const iconName = isEnabled ? 'speaker' : 'mute';
  iconElement.src = `icons/${iconName}${suffix}`;
}

// Initialize location button icons
function initializeLocationButtons() {
  if (locationSearchBtn) {
    locationSearchBtn.innerHTML = `<img src="${getLocationIcon('search')}" alt="Search" style="width: 16px; height: 16px;">`;
  }
  if (geoLocationBtn) {
    geoLocationBtn.innerHTML = `<img src="${getLocationIcon('location')}" alt="Location" style="width: 16px; height: 16px;">`;
  }
}

// Update location button icons when dark mode changes
function updateLocationButtonIcons() {
  initializeLocationButtons();
}

// Initialize buttons when page loads
initializeLocationButtons();

geoLocationBtn.addEventListener('click', () => {
if (navigator.geolocation) {
  geoLocationBtn.disabled = true;
  geoLocationBtn.innerHTML = `<img src="${getLocationIcon('wait')}" alt="Loading" style="width: 16px; height: 16px;">`;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      latInput.value = pos.coords.latitude.toFixed(4);
      lngInput.value = pos.coords.longitude.toFixed(4);
      spiralCalendar.setNightOverlayLocation(pos.coords.latitude, pos.coords.longitude);
      geoLocationBtn.disabled = false;
      geoLocationBtn.innerHTML = `<img src="${getLocationIcon('location')}" alt="Location" style="width: 16px; height: 16px;">`;
    },
    (err) => {
      alert('Could not get location: ' + err.message);
      geoLocationBtn.disabled = false;
      geoLocationBtn.innerHTML = `<img src="${getLocationIcon('location')}" alt="Location" style="width: 16px; height: 16px;">`;
    }
  );
} else {
  alert('Geolocation is not supported by your browser.');
}
});

latInput.value = LOCATION_COORDS.lat;
lngInput.value = LOCATION_COORDS.lng;

// Simple geocoding using OpenStreetMap Nominatim (no API key, rate-limited)
async function geocodeQuery(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return Array.isArray(data) && data.length ? data[0] : null;
}

function applyLocation(lat, lng) {
  latInput.value = Number(lat).toFixed(4);
  lngInput.value = Number(lng).toFixed(4);
  spiralCalendar.setNightOverlayLocation(Number(lat), Number(lng));
}
if (locationSearch && locationSearchBtn) {
  const triggerSearch = async () => {
    const q = (locationSearch.value || '').trim();
    if (!q) return;
    locationSearchBtn.disabled = true;
    const prev = locationSearchBtn.innerHTML;
    locationSearchBtn.innerHTML = `<img src="${getLocationIcon('wait')}" alt="Loading" style="width: 16px; height: 16px;">`;
    try {
      const result = await geocodeQuery(q);
      if (!result) {
        alert('No results found for that location.');
      } else {
        applyLocation(result.lat, result.lon);
      }
    } catch (e) {
      alert('Could not search location. Please try again.');
    } finally {
      locationSearchBtn.disabled = false;
      locationSearchBtn.innerHTML = prev;
    }
  };
  locationSearchBtn.addEventListener('click', triggerSearch);
  locationSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    }
  });
}