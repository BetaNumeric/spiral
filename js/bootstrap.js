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

if (setLocationBtn && latInput && lngInput) {
  setLocationBtn.addEventListener('click', () => {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      spiralCalendar.setNightOverlayLocation(lat, lng);
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
}

if (latInput && lngInput && typeof LOCATION_COORDS === 'object' && LOCATION_COORDS) {
  latInput.value = LOCATION_COORDS.lat;
  lngInput.value = LOCATION_COORDS.lng;
}

// Simple geocoding using OpenStreetMap Nominatim (no API key, rate-limited)
async function geocodeQuery(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return Array.isArray(data) && data.length ? data[0] : null;
}

function applyLocation(lat, lng) {
  if (!latInput || !lngInput) return;
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
