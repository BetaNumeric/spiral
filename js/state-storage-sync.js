// Animation, Storage, and Settings Sync
Object.assign(SpiralCalendar.prototype, {
    startAnimation() {
      if (this.animationState.animationId) return; // Already animating
      
      this.animationState.startTime = performance.now();
      this.animate();
    },

    stopAnimation() {
      if (this.animationState.animationId) {
        cancelAnimationFrame(this.animationState.animationId);
        this.animationState.animationId = null;
      }
    },

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
    },

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
    },

    stopInertia() {
      if (this._inertiaAnimationId) {
        cancelAnimationFrame(this._inertiaAnimationId);
        this._inertiaAnimationId = null;
      }
      this._inertiaVelocity = 0;
      this._inertiaLastTs = 0;
    },

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
    },

    initializeZoomFailSafe() {
      this.pageZoomActive = false;
      this._boundUpdatePageZoomMode = this.updatePageZoomMode.bind(this);
      this.updatePageZoomMode();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._boundUpdatePageZoomMode);
        window.visualViewport.addEventListener('scroll', this._boundUpdatePageZoomMode);
      }
      window.addEventListener('resize', this._boundUpdatePageZoomMode);
    },

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
    },

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
    },

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
    },

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
    },

  startAutoTimeAlign() {
    if (this.autoTimeAlignState.intervalId) return;
    this.autoTimeAlignState.enabled = true;
    this.updateRotationToCurrentTime();
    this.autoTimeAlignState.intervalId = setInterval(() => {
      this.updateRotationToCurrentTime();
    }, 1000); // update every seconds
  },

  stopAutoTimeAlign() {
    if (this.autoTimeAlignState.intervalId) {
      clearInterval(this.autoTimeAlignState.intervalId);
      this.autoTimeAlignState.intervalId = null;
    }
    this.autoTimeAlignState.enabled = false;
  },

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
  },

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
  },

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
        showTooltip: this.state.showTooltip,
        hourNumbersOutward: this.state.hourNumbersOutward,
        // Only save original value if auto-activation is active, otherwise save current value
        hourNumbersInsideSegment: this.state.autoInsideSegmentNumbers ? false : this.state.hourNumbersInsideSegment,
        hourNumbersUpright: this.state.hourNumbersUpright,
        dayNumbersUpright: this.state.dayNumbersUpright,
        showEverySixthHour: this.state.showEverySixthHour,
        hourNumbersStartAtOne: this.state.hourNumbersStartAtOne,
        hourNumbersPosition: this.state.hourNumbersPosition,
        showNightOverlay: this.state.showNightOverlay,
        useLocationTimezone: this.state.useLocationTimezone,
        locationTimezoneId: this.state.locationTimezoneId,
        nightOverlayLat: this.state.nightOverlayLat,
        nightOverlayLng: this.state.nightOverlayLng,
        showDayOverlay: this.state.showDayOverlay,
        showGradientOverlay: this.state.showGradientOverlay,
        showTimeDisplay: this.state.originalTimeDisplay !== null ? this.state.originalTimeDisplay : this.state.showTimeDisplay,
        showSegmentEdges: this.state.showSegmentEdges,
        showArcLines: this.state.showArcLines,
        overlayStackMode: this.state.overlayStackMode,
        showEventBoundaryStrokes: this.state.showEventBoundaryStrokes,
        showAllEventBoundaryStrokes: this.state.showAllEventBoundaryStrokes,
        audioFeedbackEnabled: this.state.audioFeedbackEnabled,
        darkMode: this.state.darkMode,
        calendars: this.state.calendars,
        selectedCalendar: this.state.selectedCalendar,
        visibleCalendars: this.state.visibleCalendars,
        calendarColors: this.state.calendarColors,
        colorMode: this.state.colorMode,
        saturationLevel: this.state.saturationLevel,
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
        // Dev mode line toggles
        showMonthLines: this.state.showMonthLines,
        showMidnightLines: this.state.showMidnightLines,
        showNoonLines: this.state.showNoonLines,
        showSixAmPmLines: this.state.showSixAmPmLines,
        enableLongPressJoystick: this.state.enableLongPressJoystick,
        // Overlay opacity values
        nightOverlayOpacity: this.state.nightOverlayOpacity,
        dayOverlayOpacity: this.state.dayOverlayOpacity,
        gradientOverlayOpacity: this.state.gradientOverlayOpacity,
      };
      localStorage.setItem('spiralCalendarSettings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  },

  loadSettingsFromStorage() {
    try {
      const stored = localStorage.getItem('spiralCalendarSettings');
      if (stored) {
        const settings = JSON.parse(stored);

        // Backward compatibility for removed palette modes.
        if (settings.colorMode === 'vibrant') {
          settings.colorMode = 'saturation';
          if (settings.saturationLevel === undefined || settings.saturationLevel === null) {
            settings.saturationLevel = 90;
          }
        } else if (settings.colorMode === 'calendarMono') {
          settings.colorMode = 'saturation';
          if (settings.saturationLevel === undefined || settings.saturationLevel === null) {
            settings.saturationLevel = 0;
          }
        }

        const validColorModes = new Set([
          'random', 'calendar', 'colorblind', 'pastel',
          'saturation', 'seasonal', 'monoHue', 'single'
        ]);
        if (settings.colorMode && !validColorModes.has(settings.colorMode)) {
          settings.colorMode = this.defaultSettings.colorMode || 'random';
        }
        if (settings.saturationLevel !== undefined && settings.saturationLevel !== null) {
          const parsedSaturation = Number(settings.saturationLevel);
          if (Number.isFinite(parsedSaturation)) {
            settings.saturationLevel = Math.max(0, Math.min(100, Math.round(parsedSaturation)));
          } else {
            delete settings.saturationLevel;
          }
        }
        
        // Apply loaded settings to state
        Object.keys(settings).forEach(key => {
          if (key === 'circleMode') {
            // Skip circleMode - always start in spiral mode
            return;
          } else if (key === 'spiralScale' || key === 'days' || key === 'radiusExponent') {
            // Keep size-related sliders on the configured defaults after reload.
            return;
          } else if (key === 'deviceOrientationEnabled' || key === 'betaThreshold' || key === 'gammaThreshold') {
            // Legacy settings keys from removed device-orientation feature
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

        // Backfill saturation level if missing/invalid from older storage.
        const defaultSaturation = Number(this.defaultSettings.saturationLevel ?? 80);
        const fallbackSaturation = Number.isFinite(defaultSaturation)
          ? Math.max(0, Math.min(100, Math.round(defaultSaturation)))
          : 80;
        const currentSaturation = Number(this.state.saturationLevel);
        this.state.saturationLevel = Number.isFinite(currentSaturation)
          ? Math.max(0, Math.min(100, Math.round(currentSaturation)))
          : fallbackSaturation;

        // Backfill location/timezone settings used by night overlay.
        if (typeof this.state.useLocationTimezone !== 'boolean') {
          this.state.useLocationTimezone = !!this.defaultSettings.useLocationTimezone;
        }
        if (!(typeof this.state.locationTimezoneId === 'string' && this.state.locationTimezoneId.trim())) {
          this.state.locationTimezoneId = this.defaultSettings.locationTimezoneId || null;
        } else {
          this.state.locationTimezoneId = this.state.locationTimezoneId.trim();
        }
        const defaultLat = Number(this.defaultSettings.nightOverlayLat ?? LOCATION_COORDS.lat);
        const defaultLng = Number(this.defaultSettings.nightOverlayLng ?? LOCATION_COORDS.lng);
        const loadedLat = Number(this.state.nightOverlayLat);
        const loadedLng = Number(this.state.nightOverlayLng);
        this.state.nightOverlayLat = Number.isFinite(loadedLat) ? loadedLat : defaultLat;
        this.state.nightOverlayLng = Number.isFinite(loadedLng) ? loadedLng : defaultLng;
        if (Number.isFinite(this.state.nightOverlayLat) && Number.isFinite(this.state.nightOverlayLng)) {
          LOCATION_COORDS.lat = this.state.nightOverlayLat;
          LOCATION_COORDS.lng = this.state.nightOverlayLng;
        }
        this._sunTimesCache = null;

        // Removed toggle: always keep overlap-hiding on.
        this.state.hideDayWhenHourInside = true;
        
        return true;
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return false;
  },

  resetSettingsToDefaults() {
    // Reset state
    Object.keys(this.defaultSettings).forEach(key => {
      if (this.state.hasOwnProperty(key)) {
        this.state[key] = this.defaultSettings[key];
      }
    });
    // Runtime/UI-only defaults not persisted in defaultSettings.
    this.state.circleMode = false;
    this.state.detailViewDay = null;
    this.animationState.isAnimating = !!this.defaultSettings.animationEnabled;
    this.animationState.speed = Number(this.defaultSettings.animationSpeed ?? 1.0);
    if (!this.animationState.isAnimating) {
      this.stopAnimation();
    }
    if (Number.isFinite(Number(this.state.nightOverlayLat)) && Number.isFinite(Number(this.state.nightOverlayLng))) {
      LOCATION_COORDS.lat = Number(this.state.nightOverlayLat);
      LOCATION_COORDS.lng = Number(this.state.nightOverlayLng);
    }
    this._sunTimesCache = null;
    // Removed toggle: always keep overlap-hiding on.
    this.state.hideDayWhenHourInside = true;
    
    // Reset rotation slider max value
    const rotateMaxSlider = document.getElementById('rotateMaxSlider');
    if (rotateMaxSlider) {
      rotateMaxSlider.value = 720;
      const rotateMaxVal = document.getElementById('rotateMaxVal');
      if (rotateMaxVal) rotateMaxVal.textContent = '720°';
    }
    
    // Sync all UI controls
    this.syncAllUIControls();
    if (this.animationState.isAnimating) {
      this.startAnimation();
    }
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
  },

  syncAllUIControls() {
    // Sliders with value displays
    const controls = [
      { slider: 'daysSlider', value: this.state.days, display: 'daysVal' },
      { slider: 'scaleSlider', value: this.state.spiralScale, display: 'scaleVal' },
      { slider: 'radiusSlider', value: this.state.radiusExponent, display: 'radiusVal' },
      { slider: 'rotateSlider', value: this.state.rotation * 180 / Math.PI, display: 'rotateVal', suffix: '°' },
      { slider: 'hourNumbersPositionSlider', value: this.state.hourNumbersPosition, display: 'hourNumbersPositionVal' },
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
      { id: 'tooltipToggle', value: this.state.showTooltip },
      { id: 'darkModeToggle', value: this.state.darkMode },
      { id: 'hourNumbersOutward', value: this.state.hourNumbersOutward },
      { id: 'hourNumbersInsideSegment', value: this.state.hourNumbersInsideSegment },
      { id: 'hourNumbersUpright', value: this.state.hourNumbersUpright },
      { id: 'dayNumbersUpright', value: this.state.dayNumbersUpright },
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
      { id: 'eventBoundaryStrokesToggle', value: this.state.showEventBoundaryStrokes },
      { id: 'eventBoundaryAllEdgesToggle', value: this.state.showAllEventBoundaryStrokes },
      { id: 'longPressJoystickToggle', value: this.state.enableLongPressJoystick },
    ];
    
    checkboxes.forEach(checkbox => {
      const element = document.getElementById(checkbox.id);
      if (element) {
        element.checked = checkbox.value;
      }
    });
    const useLocationTimezoneToggle = document.getElementById('useLocationTimezoneToggle');
    if (useLocationTimezoneToggle) {
      useLocationTimezoneToggle.checked = !!this.state.useLocationTimezone;
    }
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    if (latInput && Number.isFinite(Number(this.state.nightOverlayLat))) {
      latInput.value = Number(this.state.nightOverlayLat).toFixed(4);
    }
    if (lngInput && Number.isFinite(Number(this.state.nightOverlayLng))) {
      lngInput.value = Number(this.state.nightOverlayLng).toFixed(4);
    }
    if (typeof window.updateLocationTimezoneInfo === 'function') {
      window.updateLocationTimezoneInfo();
    }

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
    const saturationSlider = document.getElementById('saturationSlider');
    const saturationVal = document.getElementById('saturationVal');
    if (saturationSlider && saturationVal) {
      const saturation = Math.max(0, Math.min(100, Number(this.state.saturationLevel ?? 80)));
      saturationSlider.value = String(Math.round(saturation));
      saturationVal.textContent = String(Math.round(saturation));
    }
    
    // Keep custom palette selector UI in sync if available.
    if (typeof this.syncColorModePickerUI === 'function') {
      this.syncColorModePickerUI();
    } else {
      // Fallback for startup sequencing.
      const singleColorWrapper = document.getElementById('singleColorWrapper');
      const saturationWrapper = document.getElementById('saturationWrapper');
      const baseHueWrapper = document.getElementById('baseHueWrapper');
      if (colorModeSelect) {
        const mode = this.state.colorMode;
        if (singleColorWrapper) singleColorWrapper.style.display = mode === 'single' ? '' : 'none';
        if (saturationWrapper) saturationWrapper.style.display = mode === 'saturation' ? '' : 'none';
        if (baseHueWrapper) baseHueWrapper.style.display = mode === 'monoHue' ? '' : 'none';
      }
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
    
    // Ensure day label weekday/month/year sub-options visibility
    const dayLabelWeekdaySubOptions = document.getElementById('dayLabelWeekdaySubOptions');
    if (dayLabelWeekdaySubOptions) dayLabelWeekdaySubOptions.style.display = this.state.dayLabelShowWeekday ? 'flex' : 'none';
    const dayLabelMonthSubOptions = document.getElementById('dayLabelMonthSubOptions');
    if (dayLabelMonthSubOptions) dayLabelMonthSubOptions.style.display = this.state.dayLabelShowMonth ? 'flex' : 'none';
    const dayLabelYearSubOptions = document.getElementById('dayLabelYearSubOptions');
    if (dayLabelYearSubOptions) dayLabelYearSubOptions.style.display = this.state.dayLabelShowYear ? 'flex' : 'none';
    
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

    const longPressJoystickToggle = document.getElementById('longPressJoystickToggle');
    if (longPressJoystickToggle) {
      longPressJoystickToggle.checked = this.state.enableLongPressJoystick;
    }

    const eventBoundaryStrokesToggle = document.getElementById('eventBoundaryStrokesToggle');
    if (eventBoundaryStrokesToggle) {
      eventBoundaryStrokesToggle.checked = this.state.showEventBoundaryStrokes;
    }
    const eventBoundaryStrokeControls = document.getElementById('eventBoundaryStrokeControls');
    if (eventBoundaryStrokeControls) {
      eventBoundaryStrokeControls.style.display = this.state.showEventBoundaryStrokes ? 'block' : 'none';
    }
    const eventBoundaryAllEdgesToggle = document.getElementById('eventBoundaryAllEdgesToggle');
    if (eventBoundaryAllEdgesToggle) {
      eventBoundaryAllEdgesToggle.checked = this.state.showAllEventBoundaryStrokes;
    }

    // Sync animation controls
    const animateToggle = document.getElementById('animateToggle');
    if (animateToggle) {
      animateToggle.checked = !!this.animationState.isAnimating;
    }
    const speedSlider = document.getElementById('speedSlider');
    const speedVal = document.getElementById('speedVal');
    if (speedSlider && speedVal) {
      const speed = Number(this.animationState.speed ?? 1);
      speedSlider.value = String(speed);
      speedVal.textContent = String(speed);
    }
    const animationSpeedControls = document.getElementById('animationSpeedControls');
    if (animationSpeedControls) {
      animationSpeedControls.style.display = this.animationState.isAnimating ? 'block' : 'none';
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
  },

  updateRotationToCurrentTime() {
    const now = new Date();
  // Ensure we're using UTC time consistently
  const tzOffsetHours = (typeof this.getTimezoneOffsetHours === 'function')
    ? this.getTimezoneOffsetHours(now)
    : (now.getTimezoneOffset() / -60);
  const currentHour = ((now.getUTCHours() + tzOffsetHours + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600) % 24 + 24) % 24;
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
  },

  isDetailViewCircleModeActive() {
    return this.state.detailViewDay !== null &&
      !!this.mouseState.selectedSegment &&
      !this.mouseState.isHandleDragging;
  },

  updateSpiralScaleUI() {
    const scaleSlider = document.getElementById('scaleSlider');
    if (scaleSlider) {
      scaleSlider.value = this.state.spiralScale;
      const scaleVal = document.getElementById('scaleVal');
      if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
    }
  },

  isModeTransitionActive() {
    return !!(this.modeTransitionState && this.modeTransitionState.active);
  },

  getModeMorphProgress() {
    if (!this.isModeTransitionActive()) return 0;
    return Math.max(0, Math.min(1, Number(this.modeTransitionState.progress) || 0));
  },

  shouldAlignVisibilityToMidnight() {
    if (this.isDetailViewCircleModeActive()) {
      return true;
    }
    return !!(
      this.isModeTransitionActive() &&
      this.modeTransitionState &&
      this.modeTransitionState.alignVisibilityToMidnight
    );
  },

  getCurrentRenderedSpiralScale() {
    if (this.isModeTransitionActive()) {
      const startScale = Number.isFinite(this.modeTransitionState.startScale)
        ? this.modeTransitionState.startScale
        : this.state.spiralScale;
      const endScale = Number.isFinite(this.modeTransitionState.endScale)
        ? this.modeTransitionState.endScale
        : startScale;
      const progress = this.getModeMorphProgress();
      return startScale + (endScale - startScale) * progress;
    }

    if (this.isDetailViewCircleModeActive()) {
      const baseSpiralScale = this._originalSpiralScale !== null
        ? this._originalSpiralScale
        : this.state.spiralScale;
      return this.getAlignedCircleModeScaleForSegment(this.mouseState.selectedSegment, baseSpiralScale);
    }

    return this.state.spiralScale;
  },

  getRenderCircleMode() {
    if (this.isModeTransitionActive()) {
      return false;
    }
    return this.state.circleMode || this.isDetailViewCircleModeActive();
  },

  getAlignedCircleModeScaleForSegment(segment = this.mouseState.selectedSegment, baseSpiralScale = this.state.spiralScale) {
    if (!segment) return baseSpiralScale;

    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const thetaMax = this.state.days * 2 * Math.PI;
    const currentMaxRadius = Math.min(canvasWidth, canvasHeight) * baseSpiralScale;
    const spiralRadiusFunction = this.createRadiusFunction(
      currentMaxRadius,
      thetaMax,
      this.state.radiusExponent,
      this.state.rotation,
      { circleMode: false }
    );

    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 0.5) * segmentAngle;
    const spiralRadius = spiralRadiusFunction(segmentTheta);
    const rotationTurns = this.state.rotation / (2 * Math.PI);
    const innerT = Math.max(0, Math.min(1, (segment.day + rotationTurns) / this.state.days));
    const outerT = Math.max(0, Math.min(1, (segment.day + 1 + rotationTurns) / this.state.days));
    const discreteRadiusFactor = (
      Math.pow(innerT, this.state.radiusExponent) +
      Math.pow(outerT, this.state.radiusExponent)
    ) / 2;

    if (!(discreteRadiusFactor > 0)) return baseSpiralScale;

    const targetMaxRadius = spiralRadius / discreteRadiusFactor;
    const newSpiralScale = targetMaxRadius / Math.min(canvasWidth, canvasHeight);
    if (!Number.isFinite(newSpiralScale)) return baseSpiralScale;
    const minScale = 0.1;
    const maxScale = 1.0;
    return Math.max(minScale, Math.min(maxScale, newSpiralScale));
  },

  getRenderSpiralScale() {
    return this.getCurrentRenderedSpiralScale();
  },

  cancelModeTransition() {
    if (!this.modeTransitionState) return;
    if (this.modeTransitionState.animationId) {
      cancelAnimationFrame(this.modeTransitionState.animationId);
      this.modeTransitionState.animationId = null;
    }
    this.modeTransitionState.active = false;
  },

  startModeTransition(toCircleMode, options = {}) {
    const transition = this.modeTransitionState;
    if (!transition) {
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      this.drawSpiral();
      return;
    }

    const prefersReducedMotion = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onComplete = typeof options.onComplete === 'function'
      ? options.onComplete
      : null;
    const persistScaleState = options.persistScaleState !== false;
    const alignVisibilityToMidnight = !!options.alignVisibilityToMidnight;

    const fromProgress = this.isModeTransitionActive()
      ? this.getModeMorphProgress()
      : (Number.isFinite(options.fromProgress)
        ? Math.max(0, Math.min(1, options.fromProgress))
        : (toCircleMode ? 0 : 1));
    const targetProgress = toCircleMode ? 1 : 0;
    const restoreScaleOnExit = options.restoreScale !== false;
    const currentScale = this.getCurrentRenderedSpiralScale();

    this.cancelModeTransition();

    let targetScale = currentScale;
    if (toCircleMode) {
      if (this.mouseState.selectedSegment) {
        if (persistScaleState && this._originalSpiralScale === null) {
          this._originalSpiralScale = this.state.spiralScale;
        }
        const alignmentBaseScale = (persistScaleState && this._originalSpiralScale !== null)
          ? this._originalSpiralScale
          : this.state.spiralScale;
        targetScale = this.getAlignedCircleModeScaleForSegment(
          this.mouseState.selectedSegment,
          alignmentBaseScale
        );
        if (persistScaleState) {
          this.state.spiralScale = targetScale;
          this.updateSpiralScaleUI();
        }
      }
    } else if (persistScaleState && restoreScaleOnExit && this._originalSpiralScale !== null) {
      targetScale = this._originalSpiralScale;
    }

    transition.fromProgress = fromProgress;
    transition.toProgress = targetProgress;
    transition.startScale = currentScale;
    transition.endScale = targetScale;
    transition.targetCircleMode = !!toCircleMode;
    transition.restoreScaleOnExit = restoreScaleOnExit;
    transition.alignVisibilityToMidnight = alignVisibilityToMidnight;
    transition.progress = fromProgress;

    if (prefersReducedMotion || Math.abs(targetProgress - fromProgress) < 0.001) {
      transition.active = false;
      transition.progress = targetProgress;
      if (onComplete) {
        onComplete();
      }
      if (!toCircleMode && persistScaleState && restoreScaleOnExit) {
        this.restoreOriginalSpiralScale();
        this.saveSettingsToStorage();
      }
      this.drawSpiral();
      return;
    }

    transition.active = true;
    const span = Math.max(0.15, Math.abs(targetProgress - fromProgress));
    const durationMs = Math.max(180, Math.round(transition.durationMs * span));
    const startTs = performance.now();
    const ease = (t) => (t < 0.5)
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now) => {
      const linear = Math.max(0, Math.min(1, (now - startTs) / durationMs));
      const eased = ease(linear);
      transition.progress = fromProgress + (targetProgress - fromProgress) * eased;
      this.drawSpiral();

      if (linear < 1) {
        transition.animationId = requestAnimationFrame(step);
        return;
      }

      transition.animationId = null;
      transition.active = false;
      transition.progress = targetProgress;
      if (onComplete) {
        onComplete();
      }
      if (!toCircleMode && persistScaleState && restoreScaleOnExit) {
        this.restoreOriginalSpiralScale();
        this.saveSettingsToStorage();
      }
      this.drawSpiral();
    };

    transition.animationId = requestAnimationFrame(step);
  },

  getDetailViewOutermostDayNormalization(thetaMax, visibilityRange = null) {
    const baseVisibilityRange = visibilityRange || this.calculateVisibilityRange(this.state.rotation, thetaMax);
    if (this.state.detailViewDay === null || !this.mouseState.selectedSegment) {
      return null;
    }

    const daySpan = 2 * Math.PI;
    const selectedDayStart = this.mouseState.selectedSegment.day * daySpan;
    const epsilon = 1e-9;
    const outerDayStart = Math.floor((baseVisibilityRange.max - epsilon) / daySpan) * daySpan;
    const outerDayEnd = outerDayStart + daySpan;
    const visibleOuterFraction = Math.max(0, Math.min(1, (baseVisibilityRange.max - outerDayStart) / daySpan));
    const isSelectedOutermostDay = Math.abs(selectedDayStart - outerDayStart) < epsilon * 10;
    const normalizedMax = isSelectedOutermostDay || visibleOuterFraction >= 0.5
      ? outerDayEnd
      : outerDayStart;

    return {
      outerDayStart,
      outerDayEnd,
      normalizedMax,
      fillOutermostDay: normalizedMax >= outerDayEnd - epsilon
    };
  },

  getModeAlignedDayNormalization(thetaMax, visibilityRange = null) {
    if (!this.shouldAlignVisibilityToMidnight()) {
      return null;
    }

    const baseVisibilityRange = visibilityRange || this.calculateVisibilityRange(this.state.rotation, thetaMax);
    const daySpan = 2 * Math.PI;
    const epsilon = 1e-9;
    const selectedDayStart = this.mouseState.selectedSegment
      ? this.mouseState.selectedSegment.day * daySpan
      : null;
    const outerDayStart = Math.floor((baseVisibilityRange.max - epsilon) / daySpan) * daySpan;
    const outerDayEnd = outerDayStart + daySpan;
    const visibleOuterFraction = Math.max(0, Math.min(1, (baseVisibilityRange.max - outerDayStart) / daySpan));
    const isSelectedOutermostDay = selectedDayStart !== null &&
      Math.abs(selectedDayStart - outerDayStart) < epsilon * 10;
    const normalizedMax = isSelectedOutermostDay || visibleOuterFraction >= 0.5
      ? outerDayEnd
      : outerDayStart;

    return {
      outerDayStart,
      outerDayEnd,
      normalizedMax,
      fillOutermostDay: normalizedMax >= outerDayEnd - epsilon
    };
  },

  shouldAllowDetailViewSpiralOverflow(thetaMax, normalization = null) {
    return !!(
      this.mouseState.isHandleDragging &&
      (normalization || this.getDetailViewOutermostDayNormalization(thetaMax))?.fillOutermostDay
    );
  },

  getRenderVisibilityRange(thetaMax) {
    const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
    const normalization = this.getDetailViewOutermostDayNormalization(thetaMax, visibilityRange);
    if (normalization) {
      return {
        min: normalization.normalizedMax - thetaMax,
        max: normalization.normalizedMax
      };
    }

    const modeNormalization = this.getModeAlignedDayNormalization(thetaMax, visibilityRange);
    if (modeNormalization) {
      if (this.isModeTransitionActive() && this.modeTransitionState.alignVisibilityToMidnight) {
        const progress = this.getModeMorphProgress();
        const interpolatedMax = visibilityRange.max +
          (modeNormalization.normalizedMax - visibilityRange.max) * progress;
        return {
          min: interpolatedMax - thetaMax,
          max: interpolatedMax
        };
      }
      return {
        min: modeNormalization.normalizedMax - thetaMax,
        max: modeNormalization.normalizedMax
      };
    }

    return visibilityRange;
  },

  alignSelectedSegmentInCircleMode() {
    if (!this.mouseState.selectedSegment) return;
    
    // Store the original spiral scale before making adjustments
    if (this._originalSpiralScale === null) {
      this._originalSpiralScale = this.state.spiralScale;
    }
    
    this.state.spiralScale = this.getAlignedCircleModeScaleForSegment(
      this.mouseState.selectedSegment,
      this._originalSpiralScale
    );
    this.updateSpiralScaleUI();
  },

  openDetailViewForSegment(segment, options = {}) {
    if (!segment) return null;

    const nextSegment = { day: segment.day, segment: segment.segment };
    const shouldAnimate = options.animateTransition !== false &&
      this.state.detailViewDay === null &&
      !this.state.circleMode &&
      !this.isModeTransitionActive();

    this.mouseState.selectedSegment = nextSegment;
    this.mouseState.selectedSegmentId = this.getSelectedSegmentId(nextSegment);
    if (typeof options.selectedEventIndex === 'number') {
      this.mouseState.selectedEventIndex = options.selectedEventIndex;
    }

    const applyDetailViewState = () => {
      if (!this.mouseState.selectedSegment ||
          this.mouseState.selectedSegment.day !== nextSegment.day ||
          this.mouseState.selectedSegment.segment !== nextSegment.segment) {
        return;
      }
      this.state.detailViewDay = nextSegment.day;
      this._detailViewHasChanges = false;
      this.mouseState.hoveredDetailElement = null;
    };

    if (shouldAnimate) {
      this.startModeTransition(true, {
        fromProgress: 0,
        persistScaleState: false,
        alignVisibilityToMidnight: true,
        onComplete: applyDetailViewState
      });
    } else {
      applyDetailViewState();
    }

    return nextSegment;
  },

  closeDetailView(options = {}) {
    const {
      clearSelection = false,
      clearDraft = false
    } = options;

    this.state.detailViewDay = null;
    this._detailViewHasChanges = false;
    this.mouseState.hoveredDetailElement = null;

    if (clearDraft) {
      this.draftEvent = null;
    }
    if (clearSelection) {
      this.mouseState.selectedSegment = null;
      this.mouseState.selectedSegmentId = null;
    }
    if (this.canvasClickAreas) {
      this.canvasClickAreas.prevEventChevron = null;
      this.canvasClickAreas.nextEventChevron = null;
    }

    if (this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  },

  cycleDetailViewEvent(direction = 1) {
    const detailEventState = this.getDetailViewEventState();
    if (!detailEventState || detailEventState.selectedEventCount < 2) {
      return false;
    }

    const eventCount = detailEventState.selectedEventCount;
    const normalizedDirection = direction < 0 ? -1 : 1;
    const nextIndex = (this.mouseState.selectedEventIndex + normalizedDirection + eventCount) % eventCount;
    this.mouseState.selectedEventIndex = nextIndex;
    return true;
  },

  _getSelectedEventForHandleEditing() {
    if (this.state.detailViewDay === null) return null;
    const detailEventState = this.getDetailViewEventState();
    if (!detailEventState || detailEventState.isDraftEventActive) return null;
    return detailEventState.activePersistedEvent;
  },

  _normalizeHandleDate(date, isEnd) {
    const d = new Date(date);
    if (isEnd &&
        d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
      d.setTime(d.getTime() - 1);
    }
    return d;
  },

  _resolveHandleSegmentForDate(selectedEvent, selectedEventSegments, totalVisibleSegments, date, isEnd) {
    const d = this._normalizeHandleDate(date, isEnd);

    if (selectedEventSegments.length > 0) {
      const hourMatches = new Map();
      for (const es of selectedEventSegments) {
        const segId = totalVisibleSegments - (es.day * CONFIG.SEGMENTS_PER_DAY + es.segment) - 1;
        const hourStart = new Date(this.referenceTime.getTime() + segId * 60 * 60 * 1000);
        hourStart.setUTCMinutes(0, 0, 0);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        if (d >= hourStart && d < hourEnd) {
          const key = `${es.day}:${es.segment}`;
          if (!hourMatches.has(key)) {
            hourMatches.set(key, { day: es.day, segment: es.segment });
          }
        }
      }
      if (hourMatches.size > 0) {
        const selectedDay = (this.mouseState && this.mouseState.selectedSegment) ? this.mouseState.selectedSegment.day : 0;
        let best = null;
        for (const match of hourMatches.values()) {
          if (!best || Math.abs(match.day - selectedDay) < Math.abs(best.day - selectedDay)) {
            best = match;
          }
        }
        if (best) return { day: best.day, segment: best.segment, d };
      }
    }

    const diffHours = (d - this.referenceTime) / (1000 * 60 * 60);
    const segmentId = Math.floor(diffHours);
    const absPos = totalVisibleSegments - segmentId - 1;
    let day = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
    const segment = (CONFIG.SEGMENTS_PER_DAY - 1) - d.getUTCHours();

    const visibleMatches = (this.eventSegments || []).filter(es =>
      es.event === selectedEvent && es.segment === segment
    );
    if (visibleMatches.length > 0) {
      day = visibleMatches.reduce((bestDay, es) => {
        return Math.abs(es.day - day) < Math.abs(bestDay - day) ? es.day : bestDay;
      }, visibleMatches[0].day);
      return { day, segment, d };
    }

    const probeDays = [day, day - 1, day + 1, day - 2, day + 2];
    for (const probeDay of probeDays) {
      const list = this.getAllEventsForSegment(probeDay, segment) || [];
      if (list.some(item => item && item.event === selectedEvent)) {
        day = probeDay;
        break;
      }
    }

    return { day, segment, d };
  },

  _findRenderedSliceForHandleTime(selectedEventSegments, totalVisibleSegments, date, segmentAngle) {
    const d = new Date(date);
    if (!selectedEventSegments.length) return null;

    const selectedDay = (this.mouseState && this.mouseState.selectedSegment) ? this.mouseState.selectedSegment.day : 0;
    const minuteFrac = (d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000) / 60;
    const slicesInHour = [];

    for (const es of selectedEventSegments) {
      const segId = totalVisibleSegments - (es.day * CONFIG.SEGMENTS_PER_DAY + es.segment) - 1;
      const hourStart = new Date(this.referenceTime.getTime() + segId * 60 * 60 * 1000);
      hourStart.setUTCMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      if (d >= hourStart && d < hourEnd) {
        slicesInHour.push(es);
      }
    }

    if (!slicesInHour.length) return null;

    const targetTheta = slicesInHour[0].rawStartAngle + (1 - minuteFrac) * segmentAngle;
    let bestSlice = null;
    let bestScore = Infinity;
    for (const es of slicesInHour) {
      const inSlice = targetTheta >= (es.timeStartTheta - 1e-9) && targetTheta <= (es.timeEndTheta + 1e-9);
      const boundaryDist = inSlice ? 0 : Math.min(
        Math.abs(targetTheta - es.timeStartTheta),
        Math.abs(targetTheta - es.timeEndTheta)
      );
      const dayDist = Math.abs(es.day - selectedDay);
      const score = boundaryDist * 1000 + dayDist;
      if (score < bestScore) {
        bestScore = score;
        bestSlice = es;
      }
    }

    if (!bestSlice) return null;
    return { slice: bestSlice, targetTheta };
  },

  _computeSelectedEventHandlePosition(selectedEvent, context, date, isEnd) {
    const { visibilityRange, radiusFunction, segmentAngle, totalVisibleSegments, selectedEventSegments } = context;
    const d = this._normalizeHandleDate(date, isEnd);

    let th;
    let matchedSlice = null;
    const renderedMatch = this._findRenderedSliceForHandleTime(selectedEventSegments, totalVisibleSegments, d, segmentAngle);
    if (renderedMatch) {
      matchedSlice = renderedMatch.slice;
      th = renderedMatch.targetTheta;
      const rawStartAngle = matchedSlice.rawStartAngle;
      const rawEndAngle = matchedSlice.rawEndAngle;
      const visibleStart = Math.max(rawStartAngle, visibilityRange.min);
      const visibleEnd = Math.min(rawEndAngle, visibilityRange.max);
      if (visibleEnd > visibleStart) {
        th = Math.max(visibleStart, Math.min(visibleEnd, th));
      }
      th = Math.max(matchedSlice.timeStartTheta, Math.min(matchedSlice.timeEndTheta, th));
    } else {
      const { day, segment } = this._resolveHandleSegmentForDate(
        selectedEvent,
        selectedEventSegments,
        totalVisibleSegments,
        date,
        isEnd
      );
      const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
      const rawEndAngle = rawStartAngle + segmentAngle;
      const minuteFrac = (d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000) / 60;
      th = rawStartAngle + (1 - minuteFrac) * segmentAngle;
      const visibleStart = Math.max(rawStartAngle, visibilityRange.min);
      const visibleEnd = Math.min(rawEndAngle, visibilityRange.max);
      if (visibleEnd > visibleStart) {
        th = Math.max(visibleStart, Math.min(visibleEnd, th));
      }
    }

    let rInner;
    let rOuter;
    if (matchedSlice && matchedSlice.isCircleMode &&
        typeof matchedSlice.innerRadius === 'number' &&
        typeof matchedSlice.outerRadius === 'number') {
      rInner = matchedSlice.innerRadius;
      rOuter = matchedSlice.outerRadius;
    } else {
      rInner = radiusFunction(th);
      rOuter = radiusFunction(th + 2 * Math.PI);
      if (matchedSlice) {
        const h = rOuter - rInner;
        const sliceStart = (matchedSlice.eventSliceStart != null) ? matchedSlice.eventSliceStart : 0;
        const sliceEnd = (matchedSlice.eventSliceEnd != null) ? matchedSlice.eventSliceEnd : 1;
        rInner = rInner + sliceStart * h;
        rOuter = rInner + (sliceEnd - sliceStart) * h;
      }
    }

    const rMid = (rInner + rOuter) * 0.5;
    const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
    const x = rMid * Math.cos(ang);
    const y = rMid * Math.sin(ang);
    return { x, y };
  },

  drawSelectedEventHandles() {
    if (this.state.detailViewDay === null || !this.mouseState.selectedSegment) return;

    this.handleHandles = null;

    const selectedEvent = this._getSelectedEventForHandleEditing();
    if (!selectedEvent) return;

    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
    const visibilityRange = this.getRenderVisibilityRange(thetaMax);
    const detailDayNormalization = this.mouseState.isHandleDragging
      ? this.getDetailViewOutermostDayNormalization(thetaMax)
      : null;
    const radiusFunction = this.createRadiusFunction(
      maxRadius,
      thetaMax,
      this.state.radiusExponent,
      this.state.rotation,
      {
        allowSpiralOverflow: this.shouldAllowDetailViewSpiralOverflow(thetaMax, detailDayNormalization),
        circleMode: this.getRenderCircleMode()
      }
    );
    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const selectedEventSegments = (this.eventSegments || []).filter(es => es && es.event === selectedEvent);
    const context = { visibilityRange, radiusFunction, segmentAngle, totalVisibleSegments, selectedEventSegments };

    const startPos = this._computeSelectedEventHandlePosition(selectedEvent, context, selectedEvent.start, false);
    const endPos = this._computeSelectedEventHandlePosition(selectedEvent, context, selectedEvent.end, true);
    
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
  },

  getDetailViewMetrics(maxRadius = null) {
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const { thetaMax, maxRadius: effectiveMaxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
    const resolvedMaxRadius = Number.isFinite(maxRadius) ? maxRadius : effectiveMaxRadius;
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
    const visibilityRange = this.getRenderVisibilityRange(thetaMax);
    const radiusFunction = this.createRadiusFunction(
      resolvedMaxRadius,
      thetaMax,
      this.state.radiusExponent,
      this.state.rotation
    );

    let outerRadius = radiusFunction(visibilityRange.max);
    if (this.mouseState.selectedSegment) {
      const segment = this.mouseState.selectedSegment;
      if (this.getRenderCircleMode()) {
        outerRadius = radiusFunction(segment.day * 2 * Math.PI);
      } else {
        const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
        const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 1) * segmentAngle;
        outerRadius = radiusFunction(segmentTheta);
      }
    }

    return {
      canvasWidth,
      canvasHeight,
      centerX,
      centerY,
      maxRadius: resolvedMaxRadius,
      thetaMax,
      visibilityRange,
      radiusFunction,
      outerRadius,
      contentRadius: this.mouseState.selectedSegment ? outerRadius * 0.90 : outerRadius
    };
  },

  getDetailViewLayout(maxRadius = null) {
    const metrics = this.getDetailViewMetrics(maxRadius);
    const circleRadius = metrics.contentRadius;
    const titleFontSize = Math.max(1, circleRadius * 0.12);
    const baseFontSize = Math.max(1, circleRadius * 0.1);
    const smallFontSize = Math.max(1, circleRadius * 0.08);
    const edgePadding = baseFontSize * 0.8;
    const topY = metrics.centerY - circleRadius;
    const bottomY = metrics.centerY + circleRadius;
    const boxHeight = baseFontSize * 1.8;
    const innerGap = baseFontSize * 0.55;
    const titleY = topY + edgePadding * 3 + titleFontSize / 2;
    const counterY = titleY - circleRadius * 0.15;
    const dateTimeY = metrics.centerY;
    const buttonY = bottomY - edgePadding * 3;

    const titleBottom = titleY + titleFontSize / 2 + baseFontSize * 0.35;
    const dateTimeTop = dateTimeY - boxHeight / 2 - baseFontSize * 0.35;
    const descriptionTop = titleBottom;
    const descriptionBottom = Math.max(descriptionTop + smallFontSize, dateTimeTop);
    const descriptionY = (descriptionTop + descriptionBottom) / 2;
    const maxDescriptionHeight = Math.max(smallFontSize, descriptionBottom - descriptionTop);

    const headerTop = topY + edgePadding * 1.2;
    const headerBottom = descriptionTop - innerGap * 0.4;
    const bodyTop = descriptionTop;
    const bodyBottom = descriptionBottom;
    const footerTop = dateTimeY + boxHeight + innerGap;
    const footerBottom = bottomY - edgePadding * 1.2;

    return {
      ...metrics,
      circleRadius,
      titleFontSize,
      baseFontSize,
      smallFontSize,
      edgePadding,
      innerGap,
      boxHeight,
      topY,
      bottomY,
      headerZone: {
        top: headerTop,
        bottom: headerBottom,
        centerY: (headerTop + headerBottom) / 2,
        height: headerBottom - headerTop
      },
      bodyZone: {
        top: bodyTop,
        bottom: bodyBottom,
        centerY: (bodyTop + bodyBottom) / 2,
        height: bodyBottom - bodyTop
      },
      footerZone: {
        top: footerTop,
        bottom: footerBottom,
        centerY: (footerTop + footerBottom) / 2,
        height: footerBottom - footerTop
      },
      counterY,
      titleY,
      dateTimeY,
      descriptionTop,
      descriptionBottom,
      descriptionY,
      maxDescriptionHeight,
      buttonY
    };
  },

  getDetailViewInputLayout(detailLayout, canvasRect = null) {
    const rect = canvasRect || this.canvas.getBoundingClientRect();
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
    const inputWidth = detailLayout.circleRadius * 1.2;
    const inputHeight = detailLayout.baseFontSize * 1.2;
    const inputLeft = detailLayout.centerX - inputWidth / 2;
    const startInputTop = rect.top + (detailLayout.dateTimeY - inputHeight * 0.8) + safeTop;
    const endInputTop = rect.top + (detailLayout.dateTimeY + inputHeight * 0.6) + safeTop;

    return {
      safeTop,
      inputWidth,
      inputHeight,
      inputLeft,
      startInputTop,
      endInputTop,
      colorInputTop: endInputTop + inputHeight + 10,
      fontSize: detailLayout.baseFontSize * 0.7
    };
  },

  getSelectedSegmentId(segment = this.mouseState.selectedSegment) {
    if (!segment) return null;
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    return totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
  },

  createDraftEventForSegmentId(segmentId) {
    if (segmentId === null || segmentId === undefined) return null;
    const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
    const segmentStart = new Date(segmentDate);
    segmentStart.setUTCMinutes(0, 0, 0);
    const segmentEnd = new Date(segmentStart);
    segmentEnd.setUTCHours(segmentStart.getUTCHours() + 1);
    const randomColor = this.generateRandomColor('Home', segmentStart);

    return {
      title: '',
      description: '',
      start: new Date(segmentStart),
      end: new Date(segmentEnd),
      color: randomColor.startsWith('#') ? randomColor : this.hslToHex(randomColor),
      calendar: 'Home',
      isDraft: true,
      segmentId
    };
  },

  getDetailViewEventState(options = {}) {
    const { ensureDraft = false } = options;
    const selectedSegment = this.mouseState.selectedSegment;
    const selectedSegmentId = this.getSelectedSegmentId(selectedSegment);
    if (!selectedSegment || selectedSegmentId === null) return null;

    const segmentEventEntries = this.getAllEventsForSegment(selectedSegment.day, selectedSegment.segment) || [];
    const selectedEventCount = segmentEventEntries.length;
    const activeEventIndex = Math.min(
      this.mouseState.selectedEventIndex || 0,
      Math.max(0, selectedEventCount - 1)
    );
    const activePersistedEvent = segmentEventEntries[activeEventIndex]?.event || null;

    if (ensureDraft && !activePersistedEvent && (!this.draftEvent || this.draftEvent.segmentId !== selectedSegmentId)) {
      this.draftEvent = this.createDraftEventForSegmentId(selectedSegmentId);
    }

    const draftEvent = this.draftEvent && this.draftEvent.segmentId === selectedSegmentId
      ? this.draftEvent
      : null;
    const isDraftEventActive = !!draftEvent && (!activePersistedEvent || draftEvent.segmentId === selectedSegmentId);
    const detailEvent = isDraftEventActive ? draftEvent : activePersistedEvent;

    return {
      selectedSegment,
      selectedSegmentId,
      segmentEventEntries,
      selectedEventCount,
      activeEventIndex,
      activePersistedEvent,
      draftEvent,
      isDraftEventActive,
      detailEvent
    };
  },

  restoreOriginalSpiralScale() {
    if (this._originalSpiralScale !== null) {
      this.state.spiralScale = this._originalSpiralScale;
      this._originalSpiralScale = null; // Reset the stored value
      this.updateSpiralScaleUI();
    }
  },

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
  },

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
  },

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
  },

  calculateTextHeight(text, maxWidth, fontSize) {
    if (!text) return fontSize * 0.5; // Minimal height for empty text
    
    // Set font to get accurate measurements
    this.ctx.font = getFontString(fontSize);
    
    // Wrap text and calculate actual height
    const wrappedText = this.wrapText(text, maxWidth);
    const lineHeight = fontSize * 1.2; // Standard line height multiplier
    const totalHeight = wrappedText.length * lineHeight;
    
    return totalHeight;
  },

  buildDescriptionClickArea(centerX, descriptionTop, descriptionBottom, circleRadius) {
    const descAreaWidth = circleRadius * 1.6;
    return {
      x: centerX - descAreaWidth / 2,
      y: descriptionTop,
      width: descAreaWidth,
      height: Math.max(1, descriptionBottom - descriptionTop)
    };
  },

  measureTitleFitted(text, circleRadius, baseTitleFontSize, isBold = true) {
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
    return { width: metrics.width, height: fontSize, fontSizeUsed: fontSize, maxTitleWidth };
  },

  drawTitleFitted(text, centerX, titleY, circleRadius, baseTitleFontSize, color = '#000', isBold = true) {
    const measured = this.measureTitleFitted(text, circleRadius, baseTitleFontSize, isBold);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, centerX, titleY);
    return measured;
  },

  formatDateTime(date) {
  // Format date/time using UTC to avoid DST issues
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
    const hours = pad2(date.getUTCHours());
    const minutes = pad2(date.getUTCMinutes());
  return `${month} ${day}, ${year} ${hours}:${minutes}`;
  },

  formatDateTimeCompact(date) {
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
    const day = date.getUTCDate();
    const hours = pad2(date.getUTCHours());
    const minutes = pad2(date.getUTCMinutes());
    return `${month} ${day}, ${hours}:${minutes}`;
  },

  formatUTCHHMM(date) {
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${hours}:${minutes}`;
  },

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
  },

  formatUTCDateLong(date) {
  const weekday = WEEKDAYS_UTC[date.getUTCDay()];
  const month = MONTHS_LONG_UTC[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
  },

  formatUTCDateShort(date) {
    const weekday = WEEKDAYS_SHORT_UTC[date.getUTCDay()];
    const month = MONTHS_SHORT_UTC[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    return `${weekday}, ${month} ${day}, ${year}`;
    },

  ensureSunTimesCacheForWindow() {
  const windowStart = new Date(this.referenceTime.getTime());
  const windowEnd = new Date(this.referenceTime.getTime() + (this.state.days + 1) * 24 * 60 * 60 * 1000 - 1);
  const coordsKey = `${LOCATION_COORDS.lat},${LOCATION_COORDS.lng}`;
  const timezoneKey = (this.state.useLocationTimezone && this.state.locationTimezoneId)
    ? `location:${this.state.locationTimezoneId}`
    : 'device';
  if (this._sunTimesCache && this._sunTimesCache.coordsKey === coordsKey &&
      this._sunTimesCache.timezoneKey === timezoneKey &&
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
      const tzOffset = (typeof this.getTimezoneOffsetHours === 'function')
        ? this.getTimezoneOffsetHours(d)
        : (d.getTimezoneOffset() / -60);
      byDateKey.set(key, calculateSunTimes(d, LOCATION_COORDS, tzOffset));
    } catch (e) {
      byDateKey.set(key, { sunrise: 6, sunset: 18 });
    }
  }
  this._sunTimesCache = { windowStartMs: windowStart.getTime(), windowEndMs: windowEnd.getTime(), coordsKey, timezoneKey, byDateKey };
  },

  getSunTimesForDate(date) {
  this.ensureSunTimesCacheForWindow();
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  if (this._sunTimesCache && this._sunTimesCache.byDateKey && this._sunTimesCache.byDateKey.has(key)) {
    return this._sunTimesCache.byDateKey.get(key);
  }
  const tzOffset = (typeof this.getTimezoneOffsetHours === 'function')
    ? this.getTimezoneOffsetHours(date)
    : (date.getTimezoneOffset() / -60);
  return calculateSunTimes(date, LOCATION_COORDS, tzOffset);
  },

  visibleWindowStart() {
  return new Date(this.referenceTime.getTime());
  },

  visibleWindowEnd() {
  return new Date(this.referenceTime.getTime() + this.state.days * 24 * 60 * 60 * 1000);
  }
});
