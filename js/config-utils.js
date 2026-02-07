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
