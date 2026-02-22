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
const useLocationTimezoneToggle = document.getElementById('useLocationTimezoneToggle');
const locationTimezoneInfo = document.getElementById('locationTimezoneInfo');
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

const formatOffsetHours = (offsetHours) => {
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const hours = Math.floor(abs);
  const minutes = Math.round((abs - hours) * 60);
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const updateLocationTimezoneInfo = () => {
  if (!locationTimezoneInfo) return;
  const usingLocationTz = !!spiralCalendar.state.useLocationTimezone;
  const tzId = spiralCalendar.state.locationTimezoneId;
  if (usingLocationTz && tzId) {
    const offset = (typeof spiralCalendar.getTimezoneOffsetHours === 'function')
      ? spiralCalendar.getTimezoneOffsetHours(new Date())
      : (new Date().getTimezoneOffset() / -60);
    locationTimezoneInfo.textContent = `Timezone: ${tzId} (${formatOffsetHours(offset)})`;
    return;
  }
  if (usingLocationTz) {
    locationTimezoneInfo.textContent = 'Timezone: Location (not resolved yet)';
    return;
  }
  const deviceOffset = new Date().getTimezoneOffset() / -60;
  locationTimezoneInfo.textContent = `Timezone: Device (${formatOffsetHours(deviceOffset)})`;
};
window.updateLocationTimezoneInfo = updateLocationTimezoneInfo;

const extractTimezoneId = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.timezone === 'string' && payload.timezone.trim()) {
    return payload.timezone.trim();
  }
  const informative = payload.localityInfo && Array.isArray(payload.localityInfo.informative)
    ? payload.localityInfo.informative
    : [];
  for (const item of informative) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const description = typeof item.description === 'string' ? item.description.toLowerCase() : '';
    if (!name) continue;
    if (description.includes('time zone') || description.includes('timezone')) return name;
  }
  return null;
};

async function resolveTimezoneIdForCoordinates(lat, lng) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Timezone lookup failed');
  const data = await res.json();
  return extractTimezoneId(data);
}

async function updateLocationTimezoneFromCoordinates(lat, lng) {
  try {
    const tzId = await resolveTimezoneIdForCoordinates(lat, lng);
    if (tzId && typeof spiralCalendar.setLocationTimeZoneId === 'function') {
      spiralCalendar.setLocationTimeZoneId(tzId);
    }
  } catch (_) {
    // Keep existing timezone id if lookup fails.
  } finally {
    updateLocationTimezoneInfo();
  }
}

async function applyLocation(lat, lng) {
  if (!latInput || !lngInput) return;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
  latInput.value = latNum.toFixed(4);
  lngInput.value = lngNum.toFixed(4);
  spiralCalendar.setNightOverlayLocation(latNum, lngNum);
  await updateLocationTimezoneFromCoordinates(latNum, lngNum);
}

if (setLocationBtn && latInput && lngInput) {
  setLocationBtn.addEventListener('click', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      void applyLocation(lat, lng);
    } else {
      alert('Please enter valid latitude and longitude.');
    }
  });
}

// Helper function to get icon path based on dark mode
function getLocationIcon(iconName) {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const suffix = isDarkMode ? '_white.png' : '.png';
  return `icons/${iconName}${suffix}`;
}

// Helper function to update audio icon based on state
function updateAudioIcon(iconElement, isEnabled) {
  if (!iconElement) return;
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

if (geoLocationBtn && latInput && lngInput) {
  geoLocationBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
      geoLocationBtn.disabled = true;
      geoLocationBtn.innerHTML = `<img src="${getLocationIcon('wait')}" alt="Loading" style="width: 16px; height: 16px;">`;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await applyLocation(pos.coords.latitude, pos.coords.longitude);
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
}

if (latInput && lngInput && typeof LOCATION_COORDS === 'object' && LOCATION_COORDS) {
  latInput.value = Number(LOCATION_COORDS.lat).toFixed(4);
  lngInput.value = Number(LOCATION_COORDS.lng).toFixed(4);
}

// Simple geocoding using OpenStreetMap Nominatim (no API key, rate-limited)
async function geocodeQuery(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return Array.isArray(data) && data.length ? data[0] : null;
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
        await applyLocation(result.lat, result.lon);
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

if (useLocationTimezoneToggle) {
  useLocationTimezoneToggle.checked = !!spiralCalendar.state.useLocationTimezone;
  useLocationTimezoneToggle.addEventListener('change', (e) => {
    if (typeof spiralCalendar.setUseLocationTimezone === 'function') {
      spiralCalendar.setUseLocationTimezone(e.target.checked);
    } else {
      spiralCalendar.state.useLocationTimezone = !!e.target.checked;
      spiralCalendar.saveSettingsToStorage();
      spiralCalendar.drawSpiral();
    }
    updateLocationTimezoneInfo();
  });
}

updateLocationTimezoneInfo();
if (!spiralCalendar.state.locationTimezoneId &&
    Number.isFinite(Number(LOCATION_COORDS.lat)) &&
    Number.isFinite(Number(LOCATION_COORDS.lng))) {
  void updateLocationTimezoneFromCoordinates(LOCATION_COORDS.lat, LOCATION_COORDS.lng);
}
