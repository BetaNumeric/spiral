// Initialize the spiral calendar when page loads
const spiralCalendar = new SpiralCalendar('spiral');
// Start zoom fail-safe monitor so users can always zoom back out in browsers
try { spiralCalendar.initializeZoomFailSafe(); } catch (_) {}


spiralCalendar.setupEventStorageSync();

// Events save when edited. Never write an old event snapshot on page exit.
const flushPersistedCalendarState = () => {
  if (typeof spiralCalendar.flushSettingsSave === 'function') {
    spiralCalendar.flushSettingsSave();
  } else {
    spiralCalendar.saveSettingsToStorage();
  }
};
window.addEventListener('beforeunload', (event) => {
  flushPersistedCalendarState();
  if ((!spiralCalendar._allowDiscardUnsavedEvents && spiralCalendar.hasUnsavedEventChanges())
    || spiralCalendar.hasUnsavedStudyChanges?.()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', flushPersistedCalendarState);

const isEditableTarget = (target) => {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .visually-hidden-datetime');
};

// Suppress iOS long-press callout/magnifier outside editable fields.
document.addEventListener('contextmenu', (e) => {
  if (!isEditableTarget(e.target)) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('selectstart', (e) => {
  if (!isEditableTarget(e.target)) {
    e.preventDefault();
  }
}, { passive: false });

// Location controls
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const setLocationBtn = document.getElementById('setLocationBtn');
const geoLocationBtn = document.getElementById('geoLocationBtn');
const locationSearch = document.getElementById('locationSearch');
const locationSearchBtn = document.getElementById('locationSearchBtn');
const locationSearchSuggestions = document.getElementById('locationSearchSuggestions');
const useLocationTimezoneToggle = document.getElementById('useLocationTimezoneToggle');
const locationTimezoneInfo = document.getElementById('locationTimezoneInfo');
const locationCurrentInfo = document.getElementById('locationCurrentInfo');
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
  const totalMinutes = Math.round(Math.abs(offsetHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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
    locationTimezoneInfo.textContent = `${tzId} (${formatOffsetHours(offset)})`;
    return;
  }
  if (usingLocationTz) {
    locationTimezoneInfo.textContent = 'Location (not resolved yet)';
    return;
  }
  const deviceOffset = new Date().getTimezoneOffset() / -60;
  locationTimezoneInfo.textContent = `Device (${formatOffsetHours(deviceOffset)})`;
};
window.updateLocationTimezoneInfo = updateLocationTimezoneInfo;

const formatCoordinateLabel = (lat, lng) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return 'Unknown';
  return `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
};

const compactLocationLabel = (label, fallbackLat = LOCATION_COORDS.lat, fallbackLng = LOCATION_COORDS.lng) => {
  if (typeof label !== 'string') return formatCoordinateLabel(fallbackLat, fallbackLng);
  const parts = label.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return formatCoordinateLabel(fallbackLat, fallbackLng);
  return parts.slice(0, 3).join(', ');
};

const updateLocationCurrentInfo = (label = null, lat = LOCATION_COORDS.lat, lng = LOCATION_COORDS.lng) => {
  if (!locationCurrentInfo) return;
  locationCurrentInfo.textContent = compactLocationLabel(label, lat, lng);
};

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

const extractLocationLabel = (payload, lat, lng) => {
  if (!payload || typeof payload !== 'object') {
    return formatCoordinateLabel(lat, lng);
  }
  const candidates = [
    payload.city,
    payload.locality,
    payload.principalSubdivision,
    payload.countryName
  ];
  const parts = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || parts.includes(trimmed)) continue;
    parts.push(trimmed);
  }
  return parts.length ? parts.join(', ') : formatCoordinateLabel(lat, lng);
};

async function resolveLocationMetadataForCoordinates(lat, lng) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Timezone lookup failed');
    const data = await res.json();
    return { timezoneId: extractTimezoneId(data), label: extractLocationLabel(data, lat, lng) };
  } finally { clearTimeout(timer); }
}

let locationUpdateToken = 0;
async function updateLocationTimezoneFromCoordinates(lat, lng, preferredLabel = null) {
  const token = ++locationUpdateToken;
  try {
    const metadata = await resolveLocationMetadataForCoordinates(lat, lng);
    if (token !== locationUpdateToken) return;
    if (metadata.timezoneId && SpiralTime.validTimeZone(metadata.timezoneId)) {
      spiralCalendar.setLocationTimeZoneId(metadata.timezoneId);
    }
    updateLocationCurrentInfo(preferredLabel || metadata.label, lat, lng);
  } catch (_) {
    if (token !== locationUpdateToken) return;
    // Keep existing timezone id if lookup fails.
    updateLocationCurrentInfo(preferredLabel, lat, lng);
  } finally {
    updateLocationTimezoneInfo();
  }
}

async function applyLocation(lat, lng, label = null, timeZone = null) {
  if (!latInput || !lngInput) return;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || Math.abs(latNum) > 90 || !Number.isFinite(lngNum) || Math.abs(lngNum) > 180) {
    alert('Latitude must be between -90 and 90, and longitude between -180 and 180.');
    return;
  }
  latInput.value = latNum.toFixed(4);
  lngInput.value = lngNum.toFixed(4);
  spiralCalendar.setNightOverlayLocation(latNum, lngNum);
  updateLocationCurrentInfo(label, latNum, lngNum);
  if (timeZone && SpiralTime.validTimeZone(timeZone)) {
    locationUpdateToken++;
    spiralCalendar.setLocationTimeZoneId(timeZone);
    updateLocationTimezoneInfo();
  } else {
    await updateLocationTimezoneFromCoordinates(latNum, lngNum, label);
  }
}

if (setLocationBtn && latInput && lngInput) {
  setLocationBtn.addEventListener('click', () => {
    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);
    if (latInput.value.trim() && lngInput.value.trim() && Number.isFinite(lat) && Number.isFinite(lng)) {
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
  if (setLocationBtn) {
    setLocationBtn.innerHTML = `<img src="${getLocationIcon('enter')}" alt="Set coordinates" style="width: 16px; height: 16px;">`;
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
updateLocationCurrentInfo(null, LOCATION_COORDS.lat, LOCATION_COORDS.lng);

if (locationSearch && locationSearchBtn && locationSearchSuggestions) {
  const client = new SpiralLocationSearch();
  const status = document.getElementById('locationSearchStatus');
  let requestToken = 0;
  let controller = null;
  const setStatus = text => { if (status) status.textContent = text; };
  const dismiss = () => {
    requestToken++;
    controller?.abort();
    controller = null;
    locationSearchSuggestions.replaceChildren();
    locationSearchSuggestions.style.display = 'none';
    locationSearchBtn.disabled = false;
    locationSearchBtn.innerHTML = `<img src="${getLocationIcon('search')}" alt="Search" style="width: 16px; height: 16px;">`;
  };
  const triggerSearch = async () => {
    if (locationSearchBtn.disabled) return;
    const query = locationSearch.value.trim();
    dismiss();
    if (query.length < 2) { setStatus('Enter at least two characters to search.'); return; }
    const token = requestToken;
    controller = new AbortController();
    locationSearchBtn.disabled = true;
    locationSearchBtn.innerHTML = `<img src="${getLocationIcon('wait')}" alt="Loading" style="width: 16px; height: 16px;">`;
    setStatus('Searching...');
    try {
      const { results, stale } = await client.search(query, { signal: controller.signal });
      if (token !== requestToken) return;
      setStatus(results.length ? `Choose a place from ${results.length} results.${stale ? ' Showing saved results while search is unavailable.' : ''}` : 'No places found. Try a city name or postal code.');
      for (const result of results) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = result.label;
        button.addEventListener('click', () => {
          locationSearch.value = result.label;
          dismiss();
          setStatus(`Selected ${result.label}.`);
          void applyLocation(result.latitude, result.longitude, result.label, result.timeZone);
          locationSearch.focus();
        });
        locationSearchSuggestions.appendChild(button);
      }
      locationSearchSuggestions.style.display = results.length ? 'block' : 'none';
    } catch (error) {
      if (token === requestToken) setStatus(error.message || 'Could not search places. Please try again.');
    } finally {
      if (token === requestToken) {
        controller = null;
        locationSearchBtn.disabled = false;
        locationSearchBtn.innerHTML = `<img src="${getLocationIcon('search')}" alt="Search" style="width: 16px; height: 16px;">`;
      }
    }
  };
  locationSearchBtn.addEventListener('click', () => void triggerSearch());
  locationSearch.addEventListener('input', () => { dismiss(); setStatus('Press Enter or Search to look up a place.'); });
  locationSearch.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const hasResults = controller || locationSearchSuggestions.childElementCount > 0;
      dismiss(); setStatus('');
      if (hasResults) event.preventDefault();
    }
    if (event.key === 'Enter') { event.preventDefault(); void triggerSearch(); }
    if (event.key === 'ArrowDown') {
      const first = locationSearchSuggestions.querySelector('button');
      if (first) { event.preventDefault(); first.focus(); }
    }
  });
  locationSearchSuggestions.addEventListener('keydown', event => {
    const buttons = [...locationSearchSuggestions.querySelectorAll('button')];
    const index = buttons.indexOf(event.target);
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); setStatus(''); locationSearch.focus(); }
    if (event.key === 'Enter' && index >= 0) { event.preventDefault(); buttons[index].click(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = index + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) locationSearch.focus();
      else buttons[Math.min(next, buttons.length - 1)]?.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!locationSearchSuggestions.contains(event.target) && event.target !== locationSearch
      && !locationSearchBtn.contains(event.target)) { dismiss(); setStatus(''); }
  });
}

if (useLocationTimezoneToggle) {
  useLocationTimezoneToggle.checked = !!spiralCalendar.state.useLocationTimezone;
  useLocationTimezoneToggle.addEventListener('change', (e) => {
    if (typeof spiralCalendar.setUseLocationTimezone === 'function') {
      spiralCalendar.setUseLocationTimezone(e.target.checked);
      e.target.checked = !!spiralCalendar.state.useLocationTimezone;
    } else {
      spiralCalendar.state.useLocationTimezone = !!e.target.checked;
      spiralCalendar.requestSettingsSave();
      spiralCalendar.drawSpiral();
    }
    updateLocationTimezoneInfo();
  });
}

updateLocationTimezoneInfo();
if (spiralCalendar.state.useLocationTimezone && !spiralCalendar.state.locationTimezoneId &&
    Number.isFinite(Number(LOCATION_COORDS.lat)) &&
    Number.isFinite(Number(LOCATION_COORDS.lng))) {
  void updateLocationTimezoneFromCoordinates(LOCATION_COORDS.lat, LOCATION_COORDS.lng);
}
