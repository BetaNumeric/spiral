// UI Event Handlers
Object.assign(SpiralCalendar.prototype, {
    setupEventHandlers() {
      const self = this;
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

      // Add Layout Preset handler
      const layoutPresetSelect = document.getElementById('layoutPresetSelect');
      if (layoutPresetSelect) {
        layoutPresetSelect.addEventListener('change', (e) => {
          const preset = e.target.value;
          if (!preset) return;

          // First, reset all affected layout fields to defaults as a baseline
          const fieldsToReset = [
            'hourNumbersStartAtOne',
            'showEverySixthHour',
            'hourNumbersPosition',
            'showArcLines',
            'dayLabelWeekdayOnOutermost',
            'dayLabelMonthOnOutermost',
            'dayLabelYearOnOutermost',
            'dayLabelUseShortNames',
            'dayLabelUseShortMonth',
            'dayLabelMonthOnFirstOnly',
            'dayLabelYearOnFirstOnly',
            'dayLabelUseOrdinal',
            'showAllEventBoundaryStrokes',
            'showNoonLines',
            'showSixAmPmLines'
          ];
          
          fieldsToReset.forEach(key => {
            if (this.defaultSettings.hasOwnProperty(key)) {
              this.state[key] = this.defaultSettings[key];
            }
          });

          // Apply specific overrides
          if (preset === 'minimal') {
            this.state.hourNumbersStartAtOne = true;
            this.state.showEverySixthHour = true;
            this.state.hourNumbersPosition = 1;
            this.state.showArcLines = false;
            this.state.dayLabelShowWeekday = false;
            this.state.dayLabelWeekdayOnOutermost = true;
          } else if (preset === 'default') {
            this.state.dayLabelShowWeekday = true;
            this.state.dayLabelWeekdayOnOutermost = false;
          } else if (preset === 'complex') {
            this.state.dayLabelShowWeekday = true;
            this.state.dayLabelWeekdayOnOutermost = false;
            this.state.dayLabelUseShortNames = false;
            this.state.hourNumbersStartAtOne = true;
            this.state.hourNumbersPosition = 0;
            this.state.dayLabelUseShortMonth = false;
            this.state.dayLabelMonthOnFirstOnly = false;
            this.state.dayLabelYearOnFirstOnly = false;
            this.state.dayLabelUseOrdinal = true;
            this.state.showAllEventBoundaryStrokes = true;
            this.state.showNoonLines = true;
            this.state.showSixAmPmLines = true;
          }
          // 'default' just uses the reset baseline

          if (typeof this.syncAllUIControls === 'function') {
            this.syncAllUIControls();
          }
          this.drawSpiral();
          this.saveSettingsToStorage();

          // Reset the select box
          setTimeout(() => {
            e.target.value = '';
          }, 300);
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
          // Show/hide sub-options
          if (hourNumbersControls) {
            hourNumbersControls.style.display = e.target.checked ? 'block' : 'none';
          }
        this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      
      
      // Day numbers checkbox handler
      const showDayNumbersCheckbox = document.getElementById('showDayNumbers');
      const dayNumbersControls = document.getElementById('dayNumbersControls');
      if (showDayNumbersCheckbox) {
        showDayNumbersCheckbox.addEventListener('change', (e) => {
          this.state.showDayNumbers = e.target.checked;
          // Show/hide sub-options
          if (dayNumbersControls) {
            dayNumbersControls.style.display = e.target.checked ? 'block' : 'none';
          }
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
      const dayLabelWeekdayOnOutermost = document.getElementById('dayLabelWeekdayOnOutermost');
      const dayLabelMonthOnOutermost = document.getElementById('dayLabelMonthOnOutermost');
      const dayLabelYearOnOutermost = document.getElementById('dayLabelYearOnOutermost');
      const dayLabelMonthOnFirstOnly = document.getElementById('dayLabelMonthOnFirstOnly');
      const dayLabelYearOnFirstOnly = document.getElementById('dayLabelYearOnFirstOnly');
      const dayLabelWeekdaySubOptions = document.getElementById('dayLabelWeekdaySubOptions');
      const dayLabelMonthSubOptions = document.getElementById('dayLabelMonthSubOptions');
      const dayLabelYearSubOptions = document.getElementById('dayLabelYearSubOptions');
      const updateDayLabelSubOptionVisibility = () => {
        if (dayLabelWeekdaySubOptions) {
          dayLabelWeekdaySubOptions.style.display = (this.state.dayLabelShowWeekday || this.state.dayLabelWeekdayOnOutermost) ? 'flex' : 'none';
        }
        if (dayLabelMonthSubOptions) {
          dayLabelMonthSubOptions.style.display = (this.state.dayLabelShowMonth || this.state.dayLabelMonthOnOutermost) ? 'flex' : 'none';
        }
        if (dayLabelYearSubOptions) {
          dayLabelYearSubOptions.style.display = (this.state.dayLabelShowYear || this.state.dayLabelYearOnOutermost) ? 'flex' : 'none';
        }
      };
      if (dayLabelShowWeekday) {
        dayLabelShowWeekday.checked = !!this.state.dayLabelShowWeekday;
        dayLabelShowWeekday.addEventListener('change', (e) => {
          this.state.dayLabelShowWeekday = e.target.checked;
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelWeekdayOnOutermost) {
        dayLabelWeekdayOnOutermost.checked = !!this.state.dayLabelWeekdayOnOutermost;
        dayLabelWeekdayOnOutermost.addEventListener('change', (e) => {
          this.state.dayLabelWeekdayOnOutermost = e.target.checked;
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelShowMonth) {
        dayLabelShowMonth.checked = !!this.state.dayLabelShowMonth;
        dayLabelShowMonth.addEventListener('change', (e) => {
          this.state.dayLabelShowMonth = e.target.checked;
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelMonthOnOutermost) {
        dayLabelMonthOnOutermost.checked = !!this.state.dayLabelMonthOnOutermost;
        dayLabelMonthOnOutermost.addEventListener('change', (e) => {
          this.state.dayLabelMonthOnOutermost = e.target.checked;
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
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
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
      if (dayLabelYearOnOutermost) {
        dayLabelYearOnOutermost.checked = !!this.state.dayLabelYearOnOutermost;
        dayLabelYearOnOutermost.addEventListener('change', (e) => {
          this.state.dayLabelYearOnOutermost = e.target.checked;
          updateDayLabelSubOptionVisibility();
          this.drawSpiral();
          this.saveSettingsToStorage();
        });
      }
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
      updateDayLabelSubOptionVisibility();

      // Add circle mode checkbox handler
      const circleModeCheckbox = document.getElementById('circleMode');
      if (circleModeCheckbox) {
      circleModeCheckbox.addEventListener('change', (e) => {
        const wasCircleMode = this.state.circleMode;
        const nextCircleMode = e.target.checked;
        this.state.circleMode = nextCircleMode;

        const shouldAnimate = !this.isDetailViewCircleModeActive();
        if (shouldAnimate) {
          this.startModeTransition(nextCircleMode, {
            fromProgress: wasCircleMode ? 1 : 0,
            restoreScale: !this._suppressScaleRestore
          });
        } else {
          // Detail view already forces circle rendering, so keep the old immediate behavior.
          if (!wasCircleMode && nextCircleMode && this.mouseState.selectedSegment) {
            this.alignSelectedSegmentInCircleMode();
          } else if (wasCircleMode && !nextCircleMode && !this._suppressScaleRestore) {
            this.restoreOriginalSpiralScale();
          }
          this.drawSpiral();
        }

        this.saveSettingsToStorage();
      });
      }



    const nightOverlayToggle = document.getElementById('nightOverlayToggle');
    if (nightOverlayToggle) {
      nightOverlayToggle.addEventListener('change', function(e) {
      self.setNightOverlayEnabled(e.target.checked);
    });
    }

    const dayOverlayToggle = document.getElementById('dayOverlayToggle');
    if (dayOverlayToggle) {
      dayOverlayToggle.addEventListener('change', function(e) {
      self.setDayOverlayEnabled(e.target.checked);
    });
    }

    const gradientOverlayToggle = document.getElementById('gradientOverlayToggle');
    if (gradientOverlayToggle) {
      gradientOverlayToggle.addEventListener('change', function(e) {
      self.setGradientOverlayEnabled(e.target.checked);
    });
    }

    // Opacity slider handlers
    const nightOverlayOpacitySlider = document.getElementById('nightOverlayOpacitySlider');
    const nightOverlayOpacityVal = document.getElementById('nightOverlayOpacityVal');
    if (nightOverlayOpacitySlider && nightOverlayOpacityVal) {
      nightOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        self.state.nightOverlayOpacity = opacity;
        nightOverlayOpacityVal.textContent = e.target.value + '%';
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const dayOverlayOpacitySlider = document.getElementById('dayOverlayOpacitySlider');
    const dayOverlayOpacityVal = document.getElementById('dayOverlayOpacityVal');
    if (dayOverlayOpacitySlider && dayOverlayOpacityVal) {
      dayOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        self.state.dayOverlayOpacity = opacity;
        dayOverlayOpacityVal.textContent = e.target.value + '%';
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    document.addEventListener('keydown', (e) => {
      const target = e.target;
      const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
      const inInput = target && (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select');

      // 1. Delete Event Handling via Delete or Backspace key
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        if (this.state.detailViewDay !== null && this.deleteButtonInfo && this.deleteButtonInfo.event) {
          e.preventDefault();
          const btn = this.deleteButtonInfo;
          this.playFeedback(); // Add click sound
          if (confirm(`Delete event "${btn.event.title}"? This action cannot be undone.`)) {
            const eventIndex = this.events.indexOf(btn.event);
            if (eventIndex > -1) {
              this.runWithStudyEventSource('detail_view', () => {
                this.events.splice(eventIndex, 1);
                this._eventsVersion++;
                this.saveEventsToStorage();
              });
              if (typeof window.renderEventList === 'function') {
                window.renderEventList();
              }
              this.deleteButtonInfo = null;
              this.addButtonInfo = null;
              this.titleClickArea = null;
              this.closeDetailView({ clearSelection: true });
              
              this.resetAutoActivatedSettings();
              this.drawSpiral();
            }
          }
          return;
        }
      }

      // 2. Global Shortcuts (when not typing in an input)
      if (!inInput) {
        if (e.key === ' ' || e.key === 'Home') {
          // Spacebar or Home: reset rotation to current time
          e.preventDefault();
          if (typeof this.resetToCurrentTimeFromTap === 'function') {
            this.resetToCurrentTimeFromTap();
          }
          return;
        }
        
        if (e.key === '+' || e.key === '=' || e.key.toLowerCase() === 'n') {
          // '+', '=', or 'n': open New Event panel
          e.preventDefault();
          const addEventPanelBtn = document.getElementById('addEventPanelBtn');
          if (addEventPanelBtn && addEventPanelBtn.offsetParent !== null) { // visible
            addEventPanelBtn.click();
          }
          return;
        }

        if (e.key.toLowerCase() === 'f' || e.key === '/') {
          // 'f' or '/': Open bottom slide and focus search
          e.preventDefault();
          const searchInput = document.getElementById('eventListSearchBottom') || document.getElementById('eventListSearch');
          if (searchInput) {
            // Expand the event list naturally up to 1/3 if bottom list
            if (this.timeDisplayState && searchInput.id === 'eventListSearchBottom') {
              const canvasHeight = this.canvas ? this.canvas.clientHeight : window.innerHeight;
              const maxScreenHeight = canvasHeight * 0.6;
              const minTopMargin = canvasHeight * 0.1;
              const availableSpace = Math.max(0, canvasHeight - minTopMargin);
              const maxAllowedHeight = Math.min(typeof this.getEventListMaxHeight === 'function' ? this.getEventListMaxHeight() : 300, maxScreenHeight, availableSpace);
              this.timeDisplayState.pullUpOffset = maxAllowedHeight;
              if (typeof this.showBottomEventList === 'function') {
                this.showBottomEventList(maxAllowedHeight);
              }
              this.drawSpiral();
            }
            setTimeout(() => {
              searchInput.focus();
            }, 50); // delay focus to allow rendering
          }
          return;
        }
      }

      if (e.key !== 'Escape' || e.defaultPrevented) {
        return;
      }

      if (inInput) {
        return;
      }

      let handled = false;
      
      // 1. Close specific dynamically generated dialogs first
      const dynamicDialogs = ['newCalendarDialog', 'editCalendarDialog'];
      for (const id of dynamicDialogs) {
        const dialog = document.getElementById(id);
        if (dialog && dialog.parentNode) {
          const closeBtn = dialog.querySelector('button'); 
          if(closeBtn) {
            closeBtn.click();
            handled = true;
            break;
          }
        }
      }
      
      if (handled) {
        e.preventDefault();
        return;
      }

      // 2. Settings Panel
      const sp = document.getElementById('settingsPanel');
      if (sp && sp.style.display !== 'none') {
        const closeBtn = document.getElementById('closeSettingsPanelBtn');
        if (closeBtn) {
           closeBtn.click();
           handled = true;
        }
      }

      if (handled) {
        e.preventDefault();
        return;
      }

      // 3. Add Event Panel
      const ep = document.getElementById('eventInputPanel');
      if (ep && ep.style.display !== 'none') {
        const closeBtn = document.getElementById('closeEventPanelBtn');
        if (closeBtn) {
           closeBtn.click();
           handled = true;
        }
      }

      if (handled) {
        e.preventDefault();
        return;
      }
      
      // 4. Time Display / Bottom Event List
      if (this.timeDisplayState && this.timeDisplayState.pullUpOffset > 0) {
        this.timeDisplayState.pullUpOffset = 0;
        if (typeof this.hideBottomEventList === 'function') {
           this.hideBottomEventList();
        }
        this.drawSpiral();
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        return;
      }

      // 5. Detail View Day
      if (this.state.detailViewDay !== null) {
        this.closeDetailView({ clearSelection: true, clearDraft: true });
        this.resetAutoActivatedSettings();
        this.drawSpiral();
        handled = true;
      }

      if (handled) {
        e.preventDefault();
      }
    });

    const gradientOverlayOpacitySlider = document.getElementById('gradientOverlayOpacitySlider');
    const gradientOverlayOpacityVal = document.getElementById('gradientOverlayOpacityVal');
    if (gradientOverlayOpacitySlider && gradientOverlayOpacityVal) {
      gradientOverlayOpacitySlider.addEventListener('input', function(e) {
        const opacity = parseFloat(e.target.value) / 100; // Convert from 0-100 to 0-1
        self.state.gradientOverlayOpacity = opacity;
        gradientOverlayOpacityVal.textContent = e.target.value + '%';
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    // Dev mode line toggle handlers
    const showMonthLinesToggle = document.getElementById('showMonthLinesToggle');
    if (showMonthLinesToggle) {
      showMonthLinesToggle.addEventListener('change', function(e) {
        self.state.showMonthLines = e.target.checked;
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const showMidnightLinesToggle = document.getElementById('showMidnightLinesToggle');
    if (showMidnightLinesToggle) {
      showMidnightLinesToggle.addEventListener('change', function(e) {
        self.state.showMidnightLines = e.target.checked;
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const showNoonLinesToggle = document.getElementById('showNoonLinesToggle');
    if (showNoonLinesToggle) {
      showNoonLinesToggle.addEventListener('change', function(e) {
        self.state.showNoonLines = e.target.checked;
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const showSixAmPmLinesToggle = document.getElementById('showSixAmPmLinesToggle');
    if (showSixAmPmLinesToggle) {
      showSixAmPmLinesToggle.addEventListener('change', function(e) {
        self.state.showSixAmPmLines = e.target.checked;
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const longPressJoystickToggle = document.getElementById('longPressJoystickToggle');
    if (longPressJoystickToggle) {
      longPressJoystickToggle.addEventListener('change', function(e) {
        self.state.enableLongPressJoystick = e.target.checked;
        if (!self.state.enableLongPressJoystick && typeof self.cancelTouchJoystick === 'function') {
          self.cancelTouchJoystick(true);
          self.mouseState.isDragging = false;
          self.mouseState.hasMovedDuringDrag = false;
        }
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const detailViewAutoCircleModeToggle = document.getElementById('detailViewAutoCircleModeToggle');
    if (detailViewAutoCircleModeToggle) {
      detailViewAutoCircleModeToggle.addEventListener('change', function(e) {
        self.state.detailViewAutoCircleMode = e.target.checked;
        if (self.state.detailViewDay !== null && !self.state.circleMode) {
          self._detailViewAutoCircleActive = e.target.checked;
        }
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const syncDetailViewAutoZoomControls = () => {
      const controls = document.getElementById('detailViewAutoZoomControls');
      if (controls) {
        controls.style.display = self.state.detailViewAutoZoomEnabled !== false ? 'block' : 'none';
      }

      const limit = typeof self.getDetailViewAutoZoomCoilLimit === 'function'
        ? self.getDetailViewAutoZoomCoilLimit()
        : 40;
      const normalizedValue = typeof self.normalizeDetailViewAutoZoomCoils === 'function'
        ? self.normalizeDetailViewAutoZoomCoils(self.state.detailViewAutoZoomCoils, 2)
        : Math.max(0, Math.min(limit, Math.round(Number(self.state.detailViewAutoZoomCoils) || 0)));
      self.state.detailViewAutoZoomCoils = normalizedValue;

      const slider = document.getElementById('detailViewAutoZoomSlider');
      if (slider) {
        slider.max = String(limit);
        slider.value = String(normalizedValue);
      }

      const display = document.getElementById('detailViewAutoZoomVal');
      if (display) {
        display.textContent = typeof self.formatDetailViewAutoZoomCoils === 'function'
          ? self.formatDetailViewAutoZoomCoils(normalizedValue)
          : `${normalizedValue} coil${normalizedValue === 1 ? '' : 's'}`;
      }
    };

    const detailViewAutoZoomToggle = document.getElementById('detailViewAutoZoomToggle');
    if (detailViewAutoZoomToggle) {
      detailViewAutoZoomToggle.addEventListener('change', function(e) {
        self.state.detailViewAutoZoomEnabled = e.target.checked;
        if (!e.target.checked && typeof self.cancelDetailViewAutoZoomAnimation === 'function') {
          self.cancelDetailViewAutoZoomAnimation();
        }
        syncDetailViewAutoZoomControls();
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    const detailViewAutoZoomSlider = document.getElementById('detailViewAutoZoomSlider');
    if (detailViewAutoZoomSlider) {
      detailViewAutoZoomSlider.addEventListener('input', function(e) {
        const normalizedValue = typeof self.normalizeDetailViewAutoZoomCoils === 'function'
          ? self.normalizeDetailViewAutoZoomCoils(e.target.value, self.state.detailViewAutoZoomCoils)
          : Math.max(0, Math.round(Number(e.target.value) || 0));
        self.state.detailViewAutoZoomCoils = normalizedValue;
        e.target.value = String(normalizedValue);

        const display = document.getElementById('detailViewAutoZoomVal');
        if (display) {
          display.textContent = typeof self.formatDetailViewAutoZoomCoils === 'function'
            ? self.formatDetailViewAutoZoomCoils(normalizedValue)
            : `${normalizedValue} coil${normalizedValue === 1 ? '' : 's'}`;
        }

        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }
    syncDetailViewAutoZoomControls();

    const eventBoundaryStrokesToggle = document.getElementById('eventBoundaryStrokesToggle');
    const eventBoundaryStrokeControls = document.getElementById('eventBoundaryStrokeControls');
    if (eventBoundaryStrokesToggle) {
      eventBoundaryStrokesToggle.addEventListener('change', function(e) {
        self.state.showEventBoundaryStrokes = e.target.checked;
        if (eventBoundaryStrokeControls) {
          eventBoundaryStrokeControls.style.display = self.state.showEventBoundaryStrokes ? 'block' : 'none';
        }
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }
    if (eventBoundaryStrokeControls) {
      eventBoundaryStrokeControls.style.display = this.state.showEventBoundaryStrokes ? 'block' : 'none';
    }
    const eventBoundaryAllEdgesToggle = document.getElementById('eventBoundaryAllEdgesToggle');
    if (eventBoundaryAllEdgesToggle) {
      eventBoundaryAllEdgesToggle.addEventListener('change', function(e) {
        self.state.showAllEventBoundaryStrokes = e.target.checked;
        self.drawSpiral();
        self.saveSettingsToStorage();
      });
    }

    // Event color mode controls
    const colorModeSelect = document.getElementById('colorModeSelect');
    const colorModeButtons = Array.from(document.querySelectorAll('#colorModeButtons .palette-mode-btn'));
    const paletteCurrentMode = document.getElementById('paletteCurrentMode');
    const paletteSelectorSection = document.getElementById('paletteSelectorSection');
    const paletteSelectorToggle = document.getElementById('paletteSelectorToggle');
    const paletteSelectorContent = document.getElementById('paletteSelectorContent');
    const singleColorWrapper = document.getElementById('singleColorWrapper');
    const singleColorInput = document.getElementById('singleColorInput');
    const saturationWrapper = document.getElementById('saturationWrapper');
    const saturationSlider = document.getElementById('saturationSlider');
    const saturationVal = document.getElementById('saturationVal');
    const baseHueWrapper = document.getElementById('baseHueWrapper');
    const baseHueSlider = document.getElementById('baseHueSlider');
    const baseHueVal = document.getElementById('baseHueVal');
    const modeLabels = {
      random: 'Random',
      calendar: 'Calendar Color',
      colorblind: 'Colorblind',
      pastel: 'Pastel',
      saturation: 'Saturation',
      seasonal: 'Seasonal',
      monoHue: 'Single Hue',
      single: 'Single Color'
    };
    const colorblindPalette = [
      '#E69F00',
      '#56B4E9',
      '#009E73',
      '#F0E442',
      '#0072B2',
      '#D55E00',
      '#CC79A7'
    ];
    const previewCount = 5;
    const setPaletteSelectorExpanded = (expanded) => {
      if (paletteSelectorContent) {
        paletteSelectorContent.style.display = expanded ? 'block' : 'none';
      }
      if (paletteSelectorToggle) {
        paletteSelectorToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }
      if (paletteSelectorSection) {
        paletteSelectorSection.classList.toggle('expanded', expanded);
      }
    };
    const updateColorModeVisibility = () => {
      const mode = this.state.colorMode;
      if (singleColorWrapper) singleColorWrapper.style.display = mode === 'single' ? '' : 'none';
      if (saturationWrapper) saturationWrapper.style.display = mode === 'saturation' ? '' : 'none';
      if (baseHueWrapper) baseHueWrapper.style.display = mode === 'monoHue' ? '' : 'none';
    };
    const getCalendarPreviewColor = (index) => {
      const calendars = Array.isArray(this.state.calendars) && this.state.calendars.length > 0
        ? this.state.calendars
        : [this.state.selectedCalendar || 'Home'];
      const calName = calendars[index % calendars.length];
      const calColor = this.state.calendarColors && this.state.calendarColors[calName];
      if (calColor) {
        return calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
      }
      const hue = (index * 67 + 23) % 360;
      return this.hslToHex(`hsl(${hue}, 70%, 60%)`);
    };
    const getPreviewColor = (mode, index) => {
      if (mode === 'single') {
        return this.state.singleColor || '#4CAF50';
      }
      if (mode === 'calendar') {
        return getCalendarPreviewColor(index);
      }
      if (mode === 'colorblind') {
        return colorblindPalette[index % colorblindPalette.length];
      }
      if (mode === 'saturation') {
        const hue = (index * 73 + 34) % 360;
        const saturation = Math.max(0, Math.min(100, Number(this.state.saturationLevel ?? 80)));
        const lightnessBase = saturation < 15 ? 62 : 58;
        const lightnessRange = saturation < 15 ? 14 : 10;
        const lightness = lightnessBase + ((index * 3) % (lightnessRange + 1));
        return this.hslToHex(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
      if (mode === 'monoHue') {
        const hue = this.state.baseHue ?? 200;
        const saturation = 60 + ((index * 9) % 31);
        const lightness = 60 + ((index * 5) % 16);
        return this.hslToHex(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
      if (mode === 'pastel') {
        const hue = (index * 71 + 12) % 360;
        const saturation = 45 + ((index * 4) % 16);
        const lightness = 75 + ((index * 3) % 11);
        return this.hslToHex(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
      if (mode === 'seasonal') {
        if (typeof this.generateSeasonalColor === 'function') {
          const now = new Date();
          const year = now.getUTCFullYear();
          const yearStartUtc = Date.UTC(year, 0, 1);
          const nextYearStartUtc = Date.UTC(year + 1, 0, 1);
          const daysInYear = Math.max(1, Math.round((nextYearStartUtc - yearStartUtc) / (24 * 60 * 60 * 1000)));
          const sampleProgress = previewCount > 1 ? (index / (previewCount - 1)) : 0;
          const sampleDay = Math.round(sampleProgress * Math.max(0, daysInYear - 1));
          const sampleDate = new Date(yearStartUtc + sampleDay * 24 * 60 * 60 * 1000);
          return this.hslToHex(this.generateSeasonalColor(sampleDate));
        }
        const hue = (index * 67 + 5) % 360;
        return this.hslToHex(`hsl(${hue}, 72%, 62%)`);
      }
      const hue = (index * 67 + 5) % 360;
      const saturation = 60 + ((index * 7) % 31);
      const lightness = 70 + ((index * 3) % 11);
      return this.hslToHex(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    };
    const renderColorModePreviews = () => {
      colorModeButtons.forEach((button) => {
        const mode = button.dataset.colorMode;
        const previewRow = button.querySelector('[data-preview-mode]');
        if (!previewRow || !mode) return;
        previewRow.innerHTML = '';
        for (let i = 0; i < previewCount; i++) {
          const swatch = document.createElement('span');
          swatch.className = 'palette-swatch';
          swatch.style.background = getPreviewColor(mode, i);
          previewRow.appendChild(swatch);
        }
      });
    };
    const updateAddEventColorPreview = () => {
      try {
        const colorBox = document.getElementById('colorBox');
        const eventCalendarDisplay = document.getElementById('eventCalendarDisplay');
        const eventColor = document.getElementById('eventColor');
        if (colorBox && eventCalendarDisplay && eventColor) {
          if (this.state.colorMode === 'single') {
            const singleColor = this.state.singleColor || '#4CAF50';
            colorBox.style.background = singleColor;
            eventColor.value = singleColor;
            return;
          }
          if (this.state.colorMode === 'seasonal') {
            let seasonalDate = new Date();
            try {
              const eventStartInput = document.getElementById('eventStart');
              if (eventStartInput && eventStartInput.value) {
                seasonalDate = (typeof parseDateTimeLocalAsUTC === 'function')
                  ? parseDateTimeLocalAsUTC(eventStartInput.value)
                  : new Date(eventStartInput.value);
              }
            } catch (_) {}
            const seasonalColor = typeof this.generateSeasonalColor === 'function'
              ? this.generateSeasonalColor(seasonalDate)
              : '#4CAF50';
            const seasonalHex = seasonalColor.startsWith('#') ? seasonalColor : this.hslToHex(seasonalColor);
            colorBox.style.background = seasonalHex;
            eventColor.value = seasonalHex;
            return;
          }
          const calName = (this.selectedEventCalendar || 'Home').trim();
          const calColor = this.state.calendarColors && this.state.calendarColors[calName];
          if (this.state.colorMode === 'calendar' && calColor) {
            let hex = calColor.startsWith('#') ? calColor : this.hslToHex(calColor);
            colorBox.style.background = hex;
            eventColor.value = hex;
          } else {
            colorBox.style.background = eventColor.value;
          }
        }
      } catch (_) {}
    };
    const syncColorModePickerUI = () => {
      const mode = this.state.colorMode || 'random';
      if (colorModeSelect) colorModeSelect.value = mode;
      colorModeButtons.forEach((button) => {
        const isActive = button.dataset.colorMode === mode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
      if (paletteCurrentMode) {
        paletteCurrentMode.textContent = modeLabels[mode] || mode;
      }
      updateColorModeVisibility();
      renderColorModePreviews();
    };
    const applyColorMode = (mode) => {
      if (!mode) return;
      this.state.colorMode = mode;
      syncColorModePickerUI();
      this.drawSpiral();
      this.saveSettingsToStorage();
      if (typeof window.renderEventList === 'function') {
        window.renderEventList();
      }
      updateAddEventColorPreview();
    };
    if (colorModeSelect) {
      colorModeSelect.value = this.state.colorMode;
      colorModeSelect.addEventListener('change', (e) => {
        applyColorMode(e.target.value);
      });
    }
    colorModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        applyColorMode(button.dataset.colorMode);
      });
    });
    if (paletteSelectorToggle) {
      paletteSelectorToggle.addEventListener('click', () => {
        const currentlyExpanded = paletteSelectorToggle.getAttribute('aria-expanded') === 'true';
        setPaletteSelectorExpanded(!currentlyExpanded);
      });
    }
    setPaletteSelectorExpanded(false);
    if (singleColorInput) {
      singleColorInput.value = this.state.singleColor || '#4CAF50';
      singleColorInput.addEventListener('input', (e) => {
        this.state.singleColor = e.target.value;
        renderColorModePreviews();
        updateAddEventColorPreview();
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
    }
    if (saturationSlider && saturationVal) {
      const initialSat = Math.max(0, Math.min(100, Number(this.state.saturationLevel ?? 80)));
      saturationSlider.value = String(initialSat);
      saturationVal.textContent = String(initialSat);
      saturationSlider.addEventListener('input', (e) => {
        const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
        this.state.saturationLevel = v;
        saturationVal.textContent = String(v);
        renderColorModePreviews();
        updateAddEventColorPreview();
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
        renderColorModePreviews();
        updateAddEventColorPreview();
        this.drawSpiral();
        this.saveSettingsToStorage();
      });
    }
    this.syncColorModePickerUI = syncColorModePickerUI;
    syncColorModePickerUI();

    const timeDisplayToggle = document.getElementById('timeDisplayToggle');
    if (timeDisplayToggle) {
      timeDisplayToggle.addEventListener('change', function(e) {
      self.setTimeDisplayEnabled(e.target.checked);
      });
    }

    const segmentEdgesToggle = document.getElementById('segmentEdgesToggle');
    if (segmentEdgesToggle) {
      segmentEdgesToggle.addEventListener('change', function(e) {
      self.setSegmentEdgesEnabled(e.target.checked);
    });
    }

    const arcLinesToggle = document.getElementById('arcLinesToggle');
    if (arcLinesToggle) {
      arcLinesToggle.addEventListener('change', function(e) {
      self.setArcLinesEnabled(e.target.checked);
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

// Add other logic here if there is any below

      // Study session controls
      this.setupStudySessionControls();

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
      this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
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
      if (typeof this.isDetailViewOpeningTransitionActive === 'function' &&
          this.isDetailViewOpeningTransitionActive()) {
        if (typeof this.completeModeTransitionImmediately === 'function') {
          this.completeModeTransitionImmediately();
        }
      }
      if (typeof this.cancelDetailViewAutoZoomAnimation === 'function') {
        this.cancelDetailViewAutoZoomAnimation();
      }
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
        
        // Check if we're in the detail view and hit the outer limit
        if (this.state.detailViewDay !== null && this.mouseState.selectedSegment) {
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

        this.drawSpiral();
      }, { passive: false });

      // Touch state for pinch-to-zoom
      this.touchState = {
        isActive: false,
        initialDistance: 0,
        initialDays: 0,
        touches: [],
        // Four-finger gesture for radius adjustment
        radiusAdjustActive: false,
        initialRadiusValue: 0,
        anchorTouchId: null,
        pinchTouchIds: [], // Track which two touches are pinching
        // Three-finger gesture for days adjustment
        daysAdjustActive: false,
        initialDaysValue: 0,
        anchorTouchIds: [],
        daysPinchTouchIds: [], // Track which two touches are pinching for days
        radiusResetAnimationId: null,
        daysResetAnimationId: null,
        longPressTimerId: null,
        longPressPendingTouchId: null,
        longPressStartTouchX: 0,
        longPressStartTouchY: 0,
        longPressCurrentTouchX: 0,
        longPressCurrentTouchY: 0,
        joystickActive: false,
        joystickConsumedTouch: false,
        joystickTouchId: null,
        joystickOriginX: 0,
        joystickOriginY: 0,
        joystickBaseX: 0,
        lastTouchEndTs: 0,
        joystickBaseY: 0,
        joystickDx: 0,
        joystickDy: 0,
        joystickFrameId: null,
        joystickLastFrameTs: 0,
        joystickDayAccumulator: 0,
        joystickLastDayDirection: 0,
        joystickLastDayStep: 0,
        joystickMode: 'idle',
        joystickLastAngle: null,
        lastTapTs: 0,
        lastTapX: 0,
        lastTapY: 0
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

      const resizeHandler = () => this.scheduleViewportResize();
      window.addEventListener('resize', resizeHandler);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeHandler);
        window.visualViewport.addEventListener('scroll', resizeHandler);
      }
      
    // Add reset settings button handler
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 6);
        
        // Confirm before resetting
        if (confirm('Reset UI and physics settings to defaults? (Your events and calendars will NOT be deleted).')) {
          this.resetSettingsToDefaults();
        }
      });
    }

    const deleteAllDataBtn = document.getElementById('deleteAllDataBtn');
    if (deleteAllDataBtn) {
      deleteAllDataBtn.addEventListener('click', () => {
        // Play feedback for button click
        this.playFeedback(0.1, 8);

        // Confirm before deleting
        if (confirm('Delete ALL events and data? This cannot be undone.')) {
          // Clear events memory
          if (this.events) {
            this.events = [];
          }
          if (typeof this.saveEventsToStorage === 'function') {
            this.saveEventsToStorage();
          }

          // Force delete from local storage to be absolute sure
          try {
            if (typeof Storage !== 'undefined') {
              localStorage.removeItem('spiralCalendarEvents');
            }
          } catch(e) { }

          // Close detail views
          const eventDetailOverlay = document.getElementById('eventDetailOverlay');
          if (eventDetailOverlay) {
            eventDetailOverlay.style.display = 'none';
          }
          const eventModalOverlay = document.getElementById('eventModalOverlay');
          if (eventModalOverlay) {
            eventModalOverlay.style.display = 'none';
          }
          
          if (this.mouseState) {
            this.mouseState.selectedSegment = null;
            this.mouseState.selectedSegmentTime = null;
          }

          // Redraw everything empty
          if (typeof this.rebuildTimelines === 'function') {
            this.rebuildTimelines();
          }
          if (typeof this.render === 'function') {
            this.render();
          }
          // Ensure caches and layouts pick up the deleted events
          if (typeof this._eventsVersion === 'number') {
            this._eventsVersion++;
          } else {
            this._eventsVersion = 1;
          }
          if (typeof window.renderEventList === 'function') {
            window.renderEventList();
          }
          if (typeof this.drawSpiral === 'function') {
            this.drawSpiral();
          }

          alert('All event data has been deleted.');
        }
      });
    }

    this.setupKeyboardNavigation();
  },

  setupKeyboardNavigation() {
    this.keyboardState = {
      keys: {},
      modifiers: { shift: false, alt: false, ctrl: false },
      loopId: null,
      lastFrameTs: 0,
      dayAccumulator: 0,
      lastDayDirection: 0
    };

    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      
      // Track modifiers globally
      this.keyboardState.modifiers.shift = e.shiftKey;
      this.keyboardState.modifiers.alt = e.altKey;
      this.keyboardState.modifiers.ctrl = e.ctrlKey;
      
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (!this.keyboardState.keys[key]) {
          this.keyboardState.keys[key] = true;
          this.startKeyboardLoop();
        }
        e.preventDefault(); // prevent scrolling the page
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keyboardState.modifiers.shift = e.shiftKey;
      this.keyboardState.modifiers.alt = e.altKey;
      this.keyboardState.modifiers.ctrl = e.ctrlKey;

      const key = e.key.toLowerCase();
      if (typeof this.keyboardState.keys[key] !== 'undefined') {
        this.keyboardState.keys[key] = false;
        // Check if any tracked keys are still pressed
        if (!Object.values(this.keyboardState.keys).some(Boolean)) {
          this.stopKeyboardLoop();
        }
      }
    });

    window.addEventListener('blur', () => {
      // Release all keys if window loses focus
      this.keyboardState.keys = {};
      this.keyboardState.modifiers.shift = false;
      this.keyboardState.modifiers.alt = false;
      this.keyboardState.modifiers.ctrl = false;
      this.stopKeyboardLoop();
    });
  },

  startKeyboardLoop() {
    if (this.keyboardState.loopId) return;
    
    if (this.autoTimeAlignState && this.autoTimeAlignState.enabled) {
      this.autoTimeAlignState.enabled = false;
      if (typeof this.stopAutoTimeAlign === 'function') this.stopAutoTimeAlign();
    }
    
    const step = (now) => {
      const dtMs = Math.max(0, Math.min(80, now - (this.keyboardState.lastFrameTs || now)));
      this.keyboardState.lastFrameTs = now;
      
      let rotationChanged = false;
      const keys = this.keyboardState.keys;
      const mods = this.keyboardState.modifiers;
      
      // Horizontal A/D and Left/Right -> Rotate
      let x = 0;
      if (keys['a'] || keys['arrowleft']) x -= 1;
      if (keys['d'] || keys['arrowright']) x += 1;
      
      if (x !== 0) {
        let multiplier = 1.0;
        if (mods.alt && mods.shift) multiplier = 7.0; // Week scale
        else if (mods.alt) multiplier = 0.25;         // Fine grained
        
        const angularVelocity = x * (Math.PI * 2.1) * multiplier; 
        this.state.rotation += angularVelocity * (dtMs / 1000);
        this._shouldUpdateEventList = true;
        rotationChanged = true;
      }
      
      // Vertical W/S and Up/Down -> Scroll days/hours
      let y = 0;
      if (keys['w'] || keys['arrowup']) y -= 1; // Scroll direction (Up)
      if (keys['s'] || keys['arrowdown']) y += 1; // Scroll direction (Down)
      
      if (y !== 0) {
        const direction = y > 0 ? -1 : 1; 
        // Speed up repetition if we are doing small hour steps
        const intervalMs = (mods.alt && !mods.shift) ? 120 : 250; 
        
        if (direction !== this.keyboardState.lastDayDirection || 
            this.keyboardState.dayAccumulator >= intervalMs) {
          
          this.keyboardState.lastDayDirection = direction;
          this.keyboardState.dayAccumulator = 0;
          
          if (mods.alt && mods.shift) {
            // Alt + Shift: step by 7 days
            if (typeof this.stepTouchJoystickDay === 'function') {
               this.stepTouchJoystickDay(direction, 7);
            } else {
               this.state.rotation += (direction > 0 ? 1 : -1) * 7 * 2 * Math.PI;
               this._shouldUpdateEventList = true;
            }
          } else if (mods.alt) {
            // Alt: step by 1 hour and snap
            const hourStep = Math.PI / 12; // 1 hour
            this.state.rotation += (direction > 0 ? 1 : -1) * hourStep;
            this.state.rotation = Math.round(this.state.rotation / hourStep) * hourStep;
            this._shouldUpdateEventList = true;
          } else {
            // Default: step by 1 day
            if (typeof this.stepTouchJoystickDay === 'function') {
               this.stepTouchJoystickDay(direction, 1);
            } else {
               this.state.rotation += (direction > 0 ? 1 : -1) * 2 * Math.PI;
               this._shouldUpdateEventList = true;
            }
          }
          
          rotationChanged = true;
        } else {
          this.keyboardState.dayAccumulator += dtMs;
        }
      } else {
        this.keyboardState.lastDayDirection = 0;
        this.keyboardState.dayAccumulator = 0;
      }
      
      // Clamp the rotation so we don't spin endlessly past the visible limits if needed
      if (this.state.detailViewDay !== null && this.mouseState && this.mouseState.selectedSegment) {
          this.clampRotationToEventWindow();
      }

      if (rotationChanged) {
        this.drawSpiral();
      }
      
      if (Object.values(this.keyboardState.keys).some(Boolean)) {
        this.keyboardState.loopId = requestAnimationFrame(step);
      } else {
        this.keyboardState.loopId = null;
      }
    };
    
    this.keyboardState.lastFrameTs = performance.now();
    this.keyboardState.loopId = requestAnimationFrame(step);
  },

  stopKeyboardLoop() {
    if (this.keyboardState.loopId) {
      cancelAnimationFrame(this.keyboardState.loopId);
      this.keyboardState.loopId = null;
    }
    this.keyboardState.lastDayDirection = 0;
    this.keyboardState.dayAccumulator = 0;
  }
});
