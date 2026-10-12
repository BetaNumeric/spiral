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
    return document.body.classList.contains('dark-mode') ? '#9ccedbcc' : '#ffff00cc';
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

// Canvas colors are native paint colors; event colors never pass through an inversion filter.
const CANVAS_THEMES = Object.freeze({
  light: Object.freeze({
    page: '#ffffff', clock: '#fff', surface: '#ffffff', text: '#000', label: '#000000',
    muted: '#666', placeholder: '#999', stroke: '#444', midnight: '#444', month: '#000000',
    eventSeparator: '#000', divider: '#666', shadeRgb: '0, 0, 0',
    field: '#f0f0f0', fieldBorder: '#ccc', fieldHoverBorder: '#888',
    footer: 'rgba(255, 255, 255, 0.9)', footerHover: 'rgba(248, 248, 248, 0.95)',
    footerPressed: 'rgba(240, 240, 240, 0.95)', footerText: '#333', grabber: '#888',
    tooltip: 'rgba(0, 0, 0, 0.3)', tooltipText: '#ffffff',
    chevron: '#555', chevronHover: '#111',
    add: '#4CAF50', addHover: '#43A047', neutral: '#888888', neutralHover: '#666666',
    danger: '#ff4444', dangerHover: '#e53935'
  }),
  dark: Object.freeze({
    page: '#101820', clock: '#293641', surface: '#18232d', text: '#e3ebf2', label: '#d6e2eb',
    muted: '#a4b5c4', placeholder: '#8c9fad', stroke: '#4c6171', midnight: '#7891a3', month: '#7891a3',
    eventSeparator: '#17232d', divider: '#8198aa', shadeRgb: '5, 10, 17',
    field: '#253440', fieldBorder: '#465c6d', fieldHoverBorder: '#8faec2',
    footer: 'rgba(20, 31, 41, 0.96)', footerHover: 'rgba(29, 43, 55, 0.98)',
    footerPressed: 'rgba(36, 53, 67, 0.98)', footerText: '#d6e2eb', grabber: '#7891a3',
    tooltip: 'rgba(27, 41, 53, 0.96)', tooltipText: '#e3ebf2',
    chevron: '#a4b5c4', chevronHover: '#e3ebf2',
    add: '#2b756a', addHover: '#328779', neutral: '#3d5363', neutralHover: '#4c6375',
    danger: '#b94851', dangerHover: '#cb535d'
  })
});

function getCanvasTheme(darkMode = false) {
  return darkMode ? CANVAS_THEMES.dark : CANVAS_THEMES.light;
}

function blendCanvasColor(color, background, alpha = 0.5) {
  const rgb = value => {
    const hex = value.slice(1);
    return (hex.length === 3 ? [...hex].map(char => char + char) : hex.match(/../g))
      .map(channel => parseInt(channel, 16));
  };
  const foreground = rgb(color), behind = rgb(background);
  return '#' + foreground.map((channel, index) =>
    Math.round(channel * alpha + behind[index] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

function getContrastingCanvasText(color) {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return '#ffffff';
  const channels = (hex.length === 3 ? [...hex].map(char => char + char) : hex.match(/../g))
    .map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

function getCanvasWeekdayOverlay(brightness, opacity, darkMode = false) {
  const channels = darkMode
    ? [32 + brightness * 0.6, 42 + brightness * 0.65, 58 + brightness * 0.7].map(Math.round)
    : [brightness, brightness, brightness];
  return `rgba(${channels.join(', ')}, ${opacity})`;
}

const RUNTIME_FEATURE_FLAGS_STORAGE_KEY = 'spiralRuntimeFeatureFlags';
const DEFAULT_DEV_MODE = true;
const DEFAULT_STUDY_MODE = true;

function parseRuntimeFeatureFlagValue(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function getRuntimeFeatureFlagParam(paramName) {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (!params.has(paramName)) return null;
    return parseRuntimeFeatureFlagValue(params.get(paramName));
  } catch (_) {}
  return null;
}

function getRuntimeFeatureFlagStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch (_) {
    return null;
  }
}

function getStoredRuntimeFeatureFlags() {
  const storage = getRuntimeFeatureFlagStorage();
  if (!storage) return {};
  try {
    const stored = storage.getItem(RUNTIME_FEATURE_FLAGS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getStoredRuntimeFeatureFlag(paramName) {
  const flags = getStoredRuntimeFeatureFlags();
  return typeof flags[paramName] === 'boolean' ? flags[paramName] : null;
}

function persistRuntimeFeatureFlag(paramName, value) {
  const storage = getRuntimeFeatureFlagStorage();
  if (!storage || typeof value !== 'boolean') return;
  try {
    const flags = getStoredRuntimeFeatureFlags();
    flags[paramName] = value;
    storage.setItem(RUNTIME_FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(flags));
  } catch (_) {}
}

function resolveRuntimeFeatureFlag(paramName, fallback = false) {
  const urlValue = getRuntimeFeatureFlagParam(paramName);
  if (urlValue !== null) {
    persistRuntimeFeatureFlag(paramName, urlValue);
    return urlValue;
  }

  // Visible-by-default builds keep their controls available despite older saved opt-outs.
  // An explicit URL flag still controls the current page.
  if (fallback === true) return true;
  const storedValue = getStoredRuntimeFeatureFlag(paramName);
  if (storedValue !== null) return storedValue;
  return fallback;
}

// Developer and study controls are available on normal launches, including installed PWAs.
const DEV_MODE = resolveRuntimeFeatureFlag('dev', DEFAULT_DEV_MODE);
const STUDY_MODE = resolveRuntimeFeatureFlag('study', DEFAULT_STUDY_MODE);

// Advanced options start collapsed; their toggle button remains available.
let runtimeDevModeOverride = false;

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


// Legacy static timezone offset (kept for backwards compatibility in code paths
// that may still reference it).
const TIMEZONE_OFFSET = new Date().getTimezoneOffset() / -60;

function getDeviceTimezoneOffsetHours(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getTimezoneOffset() / -60;
}

//Calculate sunrise and sunset times for a given date and location

// Compatibility name: parse clock fields into the renderer's wall coordinates.
function parseDateTimeLocalAsUTC(dateTimeString) {
  return SpiralTime.parseWall(dateTimeString);
}

function calculateSunTimes(date, coords = LOCATION_COORDS, timezoneOffsetHours = null, timeZone = null) {
try {
  const tzOffset = Number.isFinite(timezoneOffsetHours)
    ? timezoneOffsetHours
    : getDeviceTimezoneOffsetHours(date);
  const noonWall = new Date(date);
  noonWall.setUTCHours(12, 0, 0, 0);
  const localNoonUtc = timeZone ? SpiralTime.wallToInstant(noonWall, timeZone)
    : new Date(noonWall.getTime() - tzOffset * SpiralTime.HOUR);
  const times = SunCalc.getTimes(localNoonUtc, coords.lat, coords.lng);
  const hasValidSunrise = times.sunrise instanceof Date && Number.isFinite(times.sunrise.getTime());
  const hasValidSunset = times.sunset instanceof Date && Number.isFinite(times.sunset.getTime());
  const wrap = (h) => ((h % 24) + 24) % 24;

  if (!hasValidSunrise || !hasValidSunset) {
    // Polar day/night: SunCalc yields invalid sunrise/sunset dates.
    // Sample local noon to determine whether the sun stays above or below the horizon all day.
    const noonAltitude = SunCalc.getPosition(localNoonUtc, coords.lat, coords.lng).altitude;
    if (Number.isFinite(noonAltitude) && noonAltitude > 0) {
      return { sunrise: 0, sunset: 24 };
    }
    return { sunrise: 0, sunset: 0 };
  }
  
  // Convert Date objects to hours
  const sunriseOffset = timeZone ? SpiralTime.offsetHours(times.sunrise, timeZone) : tzOffset;
  const sunsetOffset = timeZone ? SpiralTime.offsetHours(times.sunset, timeZone) : tzOffset;
  const sunriseRaw = times.sunrise.getUTCHours() + sunriseOffset + times.sunrise.getUTCMinutes() / 60;
  const sunsetRaw = times.sunset.getUTCHours() + sunsetOffset + times.sunset.getUTCMinutes() / 60;
  const sunrise = wrap(sunriseRaw);
  const sunset = wrap(sunsetRaw);
  
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
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 0 || d.getUTCFullYear() > 9999) {
    throw new Error('Calendar export requires dates between years 0000 and 9999.');
  }
  const pad = (n) => String(n).padStart(2, '0');
  return (
    String(d.getUTCFullYear()).padStart(4, '0') +
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
    .replace(/\r\n|\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, '\\$&')
    .replace(/\n/g, '\\n');
}

// Assign an identity once; edits and exports keep it.
function generateEventUID(event) {
  return SpiralEventModel.initializeIdentity(event).persistentUID;
}

// Format a Date for <input type="datetime-local"> using local time
function formatDateTimeLocalForInput(date) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const yyyy = year < 0
    ? `-${String(Math.abs(year)).padStart(4, '0')}`
    : String(year).padStart(4, '0');
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
