// Canvas Setup and Mouse Interaction
Object.assign(SpiralCalendar.prototype, {
    handleResize() {
      this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
      this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
      this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      // Update event list max height to 1/3 of screen height
      if (this.timeDisplayState) {
        this.timeDisplayState.eventListMaxHeight = Math.floor(this.canvas.clientHeight / 3);
      }
      this.drawSpiral();
    },

    setupCanvas() {
      this.handleResize();
    },

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
    },

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
  },

  isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && 
           y >= rect.y && y <= rect.y + rect.height;
  },

  isPointInCircle(x, y, circle) {
    const distance = Math.sqrt((x - circle.centerX) ** 2 + (y - circle.centerY) ** 2);
    return distance >= circle.innerRadius && distance <= circle.outerRadius;
    },

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
    },

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
              this.alignSelectedSegmentInCircleMode();
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
              this.alignSelectedSegmentInCircleMode();
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
});
