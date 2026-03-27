// Date/Color Pickers and Calendar Selection
Object.assign(SpiralCalendar.prototype, {
  supportsNativeDateTimeLocalValue(value) {
    if (typeof value !== 'string' || !value) return false;
    const probe = document.createElement('input');
    probe.type = 'datetime-local';
    probe.value = value;
    return probe.value === value;
  },

  applyEventDateTimeInputValue(event, type, rawValue) {
    if (!event || typeof rawValue !== 'string' || !rawValue.trim()) return false;
    const parsedValue = parseDateTimeLocalAsUTC(rawValue.trim());
    if (!(parsedValue instanceof Date) || !Number.isFinite(parsedValue.getTime())) {
      return false;
    }

    if (type === 'start') {
      event.start = parsedValue;
      if (parsedValue >= event.end) {
        const newEnd = new Date(parsedValue);
        newEnd.setUTCHours(parsedValue.getUTCHours() + 1);
        event.end = newEnd;
      }
    } else {
      if (parsedValue < event.start) {
        const adjustedEnd = new Date(event.start);
        adjustedEnd.setUTCHours(event.start.getUTCHours() + 1);
        event.end = adjustedEnd;
      } else {
        event.end = parsedValue;
      }
    }

    this.syncEventAutoColor(event);
    const persistentColorPicker = document.getElementById('persistentColorPicker');
    if (persistentColorPicker) {
      persistentColorPicker.value = this.getDisplayColorForEvent(event);
    }

    event.lastModified = Date.now();
    this._eventsVersion++;
    this._detailViewHasChanges = true;
    this.ensureLayoutCache();
    
    if (event.isDraft && this.draftEvent && this.draftEvent.segmentId === event.segmentId) {
      this.draftEvent = event;
    }
    this.drawSpiral();
    this.saveEventsToStorage();
    setTimeout(() => renderEventList(), 0);
    this._ensureSelectedSegmentContainsEventOrJump(event);
    return true;
  },

  openExtendedDateTimeEditor(event, type, initialValue, anchorBox = null) {
    const isMobile = isMobileDevice();
    const isDarkMode = document.body.classList.contains('dark-mode');
    if (typeof this._cleanupExtendedDateTimeEditor === 'function') {
      this._cleanupExtendedDateTimeEditor();
    }

    const panel = document.createElement('div');
    panel.id = 'extendedDateTimeEditor';
    panel.style.position = 'fixed';
    panel.style.zIndex = '10001';
    panel.style.width = isMobile ? 'min(320px, calc(100vw - 24px))' : '280px';
    panel.style.maxWidth = 'calc(100vw - 24px)';
    panel.style.padding = '12px';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.22)';
    panel.style.boxSizing = 'border-box';
    panel.style.background = isDarkMode ? 'var(--dark-bg-secondary)' : 'rgba(255, 255, 255, 0.98)';
    panel.style.border = `1px solid ${isDarkMode ? 'var(--dark-border)' : 'rgba(0, 0, 0, 0.12)'}`;

    if (isMobile || !anchorBox) {
      panel.style.left = '50%';
      panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
    } else {
      const canvasRect = this.canvas.getBoundingClientRect();
      const left = Math.round(canvasRect.left + anchorBox.x + (anchorBox.width / 2) - 140);
      const top = Math.round(canvasRect.top + anchorBox.y + anchorBox.height + 8);
      panel.style.left = `${Math.max(12, Math.min(window.innerWidth - 292, left))}px`;
      panel.style.top = `${Math.max(12, Math.min(window.innerHeight - 120, top))}px`;
    }

    const label = document.createElement('div');
    label.textContent = type === 'start' ? 'Edit start date/time' : 'Edit end date/time';
    label.style.cssText = `font-size: 0.9em; font-weight: 600; margin-bottom: 8px; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#222'};`;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialValue;
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '0000-01-01T00:00';
    input.style.cssText = `
      width: 100%;
      height: 38px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#cfcfcf'};
      background: ${isDarkMode ? 'var(--dark-bg-primary)' : '#fff'};
      color: ${isDarkMode ? 'var(--dark-text-primary)' : '#111'};
      font: inherit;
      box-sizing: border-box;
    `;

    const hint = document.createElement('div');
    hint.textContent = 'Format: YYYY-MM-DDTHH:MM';
    hint.style.cssText = `font-size: 0.78em; line-height: 1.35; margin-top: 8px; color: ${isDarkMode ? 'var(--dark-text-primary)' : '#666'}; opacity: 0.9;`;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; margin-top:12px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      height: 34px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid ${isDarkMode ? 'var(--dark-border)' : '#cfcfcf'};
      background: ${isDarkMode ? 'var(--dark-bg-primary)' : '#f5f5f5'};
      color: ${isDarkMode ? 'var(--dark-text-primary)' : '#333'};
      cursor: pointer;
    `;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Set';
    saveBtn.style.cssText = `
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: none;
      background: #4CAF50;
      color: white;
      cursor: pointer;
    `;

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    panel.appendChild(label);
    panel.appendChild(input);
    panel.appendChild(hint);
    panel.appendChild(actions);
    document.body.appendChild(panel);

    let outsideCloseArmed = false;
    const handleDocumentPointerDown = (e) => {
      if (!outsideCloseArmed || panel.contains(e.target)) return;
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      if (this._cleanupExtendedDateTimeEditor === cleanup) {
        this._cleanupExtendedDateTimeEditor = null;
      }
      if (panel.parentNode) panel.remove();
    };
    this._cleanupExtendedDateTimeEditor = cleanup;
    const showInvalidState = () => {
      input.style.borderColor = '#e53935';
      hint.textContent = 'Invalid date/time. Use YYYY-MM-DDTHH:MM, for example 0000-01-01T00:00 or -0044-03-15T12:00.';
      hint.style.color = '#e53935';
      input.focus();
      input.select();
    };
    const save = () => {
      if (this.applyEventDateTimeInputValue(event, type, input.value)) {
        cleanup();
      } else {
        showInvalidState();
      }
    };

    cancelBtn.addEventListener('click', cleanup);
    saveBtn.addEventListener('click', save);
    input.addEventListener('input', () => {
      input.style.borderColor = isDarkMode ? 'var(--dark-border)' : '#cfcfcf';
      hint.textContent = 'Format: YYYY-MM-DDTHH:MM';
      hint.style.color = isDarkMode ? 'var(--dark-text-primary)' : '#666';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    requestAnimationFrame(() => {
      outsideCloseArmed = true;
    });
    input.focus();
    input.select();
  },

  openDateTimePicker(event, type, anchorBox = null) {
    // Convert UTC event time to local time for the input picker
    const eventTime = new Date(type === 'start' ? event.start : event.end);
    const deviceOffsetHours = (typeof getDeviceTimezoneOffsetHours === 'function')
      ? getDeviceTimezoneOffsetHours(eventTime)
      : (eventTime.getTimezoneOffset() / -60);
    const localTime = new Date(eventTime.getTime() - (deviceOffsetHours * 60 * 60 * 1000));
    const localValue = formatDateTimeLocalForInput(localTime);
    if (!this.supportsNativeDateTimeLocalValue(localValue)) {
      this.openExtendedDateTimeEditor(event, type, localValue, anchorBox);
      return;
    }

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.style.position = 'fixed';
    const isMobile = isMobileDevice();
    if (isMobile) {
      input.style.top = '50%';
      input.style.left = '50%';
      input.style.transform = 'translate(-50%, -50%)';
    } else if (anchorBox) {
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
    input.value = localValue;
    
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
        this.applyEventDateTimeInputValue(event, type, input.value);
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
  },

  _ensureSelectedSegmentContainsEventOrJump(event) {
    try {
      if (this.mouseState && this.mouseState.selectedSegment) {
        const seg = this.mouseState.selectedSegment;
        const list = this.getAllEventsForSegment(seg.day, seg.segment);
        if (list && list.some(ei => ei.event === event)) return;
      }
    } catch (_) { /* ignore */ }
    this._jumpToEventStart(event);
  },

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
      this.openDetailViewForSegment({ day: newDay, segment: targetSegment });
      const allEvents = this.getAllEventsForSegment(newDay, targetSegment);
      const eventIdx = allEvents.findIndex(ei => ei.event === ev);
      this.mouseState.selectedEventIndex = eventIdx >= 0 ? eventIdx : 0;

      // Disable auto align and sync UI
      if (this.autoTimeAlignState && this.autoTimeAlignState.enabled) {
        this.stopAutoTimeAlign();
      }

      this.drawSpiral();
    } catch (_) {
      // As a fallback, just redraw
      try { this.drawSpiral(); } catch (_) {}
    }
  },

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
  },

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
    input.value = this.getDisplayColorForEvent(calendarEvent);
    
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
      this.setEventCustomColor(calendarEvent, input.value);
      calendarEvent.lastModified = Date.now();
      // Mark that changes have been made
      this._detailViewHasChanges = true;
      // If this is a draft event, make sure it's still the active one
      if (calendarEvent.isDraft && this.draftEvent && this.draftEvent.segmentId === calendarEvent.segmentId) {
        this.draftEvent = calendarEvent; // Update the stored draft event
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
  },

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
    dialog.style.boxSizing = 'border-box';
    dialog.style.maxWidth = '92vw';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '0.35em';
    closeBtn.style.right = '0.45em';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'none';
    closeBtn.style.color = '#888';
    closeBtn.style.fontSize = '1.3em';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0.1em';
    
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
    
    dialog.appendChild(closeBtn);
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
          this.refreshAutoEventColors({ includeDraft: true });
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
    closeBtn.addEventListener('click', cleanup);
    cancelBtn.addEventListener('click', cleanup);
    createBtn.addEventListener('click', handleCreate);
    // Do not close on backdrop click: some browsers emit a backdrop click
    // when the native color picker closes, which would dismiss the dialog.
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    return null; // Will be handled by callbacks
  },

  editCalendar(calendarName, onSuccess = null) {
    if (!calendarName || !Array.isArray(this.state.calendars) || !this.state.calendars.includes(calendarName)) {
      return null;
    }

    // Create a custom input dialog with character limit
    const dialog = document.createElement('div');
    dialog.id = 'editCalendarDialog';
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
    dialog.style.boxSizing = 'border-box';
    dialog.style.maxWidth = '92vw';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '0.35em';
    closeBtn.style.right = '0.45em';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'none';
    closeBtn.style.color = '#888';
    closeBtn.style.fontSize = '1.3em';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0.1em';

    const label = document.createElement('label');
    label.textContent = 'Edit calendar name:';
    label.style.display = 'block';
    label.style.marginBottom = '0.5em';
    label.style.fontWeight = 'bold';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = calendarName;
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
    charCount.textContent = `${calendarName.length}/20`;

    const nameError = document.createElement('div');
    nameError.style.fontSize = '0.8em';
    nameError.style.color = '#c0392b';
    nameError.style.marginTop = '0.2em';
    nameError.style.display = 'none';

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Calendar color:';
    colorLabel.style.display = 'block';
    colorLabel.style.marginTop = '0.8em';
    colorLabel.style.marginBottom = '0.3em';
    colorLabel.style.fontWeight = 'bold';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    const currentColorRaw = (this.state.calendarColors && this.state.calendarColors[calendarName]) || '#4CAF50';
    const currentColorHex = currentColorRaw.startsWith('#') ? currentColorRaw : this.hslToHex(currentColorRaw);
    colorInput.value = currentColorHex;
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

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '0.5em 1em';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '0.3em';
    saveBtn.style.backgroundColor = '#4CAF50';
    saveBtn.style.color = 'white';
    saveBtn.style.cursor = 'pointer';

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    dialog.appendChild(closeBtn);
    dialog.appendChild(label);
    dialog.appendChild(input);
    dialog.appendChild(nameError);
    dialog.appendChild(charCount);
    dialog.appendChild(colorLabel);
    dialog.appendChild(colorInput);
    dialog.appendChild(buttonContainer);

    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    backdrop.style.zIndex = '9999';

    const cleanup = () => {
      if (dialog.parentNode) dialog.remove();
      if (backdrop.parentNode) backdrop.remove();
    };

    const handleSave = () => {
      const trimmed = input.value.trim();
      if (!trimmed) {
        nameError.textContent = 'Please enter a calendar name.';
        nameError.style.display = 'block';
        input.focus();
        return null;
      }
      if (trimmed !== calendarName && this.state.calendars.includes(trimmed)) {
        nameError.textContent = 'Calendar already exists.';
        nameError.style.display = 'block';
        return null;
      }

      const oldName = calendarName;
      const newName = trimmed;
      const renamed = oldName !== newName;

      if (renamed) {
        this.state.calendars = (this.state.calendars || []).map((n) => (n === oldName ? newName : n));
        this.state.visibleCalendars = (this.state.visibleCalendars || []).map((n) => (n === oldName ? newName : n));
        if (this.state.selectedCalendar === oldName) this.state.selectedCalendar = newName;
        if (this.selectedEventCalendar === oldName) this.selectedEventCalendar = newName;
        if (typeof this.updateEventCalendarDisplay === 'function') {
          this.updateEventCalendarDisplay();
        }

        let changedEventCount = 0;
        (this.events || []).forEach((ev) => {
          if ((ev.calendar || 'Home') === oldName) {
            ev.calendar = newName;
            ev.lastModified = Date.now();
            changedEventCount++;
          }
        });
        if (changedEventCount > 0) {
          this._eventsVersion++;
          this.saveEventsToStorage();
        }
      }

      if (!this.state.calendarColors || typeof this.state.calendarColors !== 'object') {
        this.state.calendarColors = {};
      }
      if (renamed) {
        delete this.state.calendarColors[oldName];
      }
      this.state.calendarColors[newName] = colorInput.value;
      this.refreshAutoEventColors({ includeDraft: true });
      this.saveSettingsToStorage();

      if (onSuccess) {
        try {
          onSuccess(newName);
        } catch (e) {
          console.error('Error in editCalendar onSuccess callback:', e);
        }
      }

      setTimeout(cleanup, 10);
      return newName;
    };

    input.addEventListener('input', () => {
      charCount.textContent = `${input.value.length}/20`;
      nameError.style.display = 'none';
      input.style.borderColor = '#ccc';
    });

    input.addEventListener('keypress', (e) => {
      const invalidChars = ['"', "'", '\\', '/'];
      if (invalidChars.includes(e.key)) {
        e.preventDefault();
      }
    });

    input.addEventListener('paste', () => {
      setTimeout(() => {
        let value = input.value;
        const invalidChars = ['"', "'", '\\', '/'];
        invalidChars.forEach((ch) => {
          value = value.split(ch).join('');
        });
        if (value.length > 20) value = value.substring(0, 20);
        input.value = value;
        charCount.textContent = `${value.length}/20`;
        nameError.style.display = 'none';
        input.style.borderColor = '#ccc';
      }, 0);
    });

    closeBtn.addEventListener('click', cleanup);
    cancelBtn.addEventListener('click', cleanup);
    saveBtn.addEventListener('click', handleSave);
    // Do not close on backdrop click: some browsers emit a backdrop click
    // when the native color picker closes, which would dismiss the dialog.

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    input.focus();
    input.select();
    return null;
  },

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
        if (typeof this.refreshAddEventColorSuggestion === 'function') {
          this.refreshAddEventColorSuggestion();
        }
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
        if (typeof this.refreshAddEventColorSuggestion === 'function') {
          this.refreshAddEventColorSuggestion();
        }
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
  },

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
          const updatedColor = this.syncEventAutoColor(event);
          // Update persistent color picker UI if present
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentColorPicker) {
            persistentColorPicker.value = event.colorIsCustom ? updatedColor : this.getDisplayColorForEvent(event);
          }
          event.lastModified = Date.now();
          // Mark that changes have been made
          this._detailViewHasChanges = true;
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
          const updatedColor = this.syncEventAutoColor(event);
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentColorPicker) {
            persistentColorPicker.value = event.colorIsCustom ? updatedColor : this.getDisplayColorForEvent(event);
          }

          event.lastModified = Date.now();
          // Mark that changes have been made
          this._detailViewHasChanges = true;
          
          // If this is a draft event, make sure it's still the active one
          if (this.draftEvent && this.draftEvent === event) {
            this.draftEvent.calendar = newCalendarName;
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
});
