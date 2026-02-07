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
    this.syncAutoTimeAlignCheckbox();
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
    this.syncAutoTimeAlignCheckbox();
  },

  syncAutoTimeAlignCheckbox() {
    const autoTimeAlignCheckbox = document.getElementById('autoTimeAlign');
    if (autoTimeAlignCheckbox) {
      autoTimeAlignCheckbox.checked = this.autoTimeAlignState.enabled;
    }
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  getSunTimesForDate(date) {
  this.ensureSunTimesCacheForWindow();
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  if (this._sunTimesCache && this._sunTimesCache.byDateKey && this._sunTimesCache.byDateKey.has(key)) {
    return this._sunTimesCache.byDateKey.get(key);
  }
  return calculateSunTimes(date);
  },

  visibleWindowStart() {
  return new Date(this.referenceTime.getTime());
  },

  visibleWindowEnd() {
  return new Date(this.referenceTime.getTime() + this.state.days * 24 * 60 * 60 * 1000);
  }
});
