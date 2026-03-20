// Canvas Setup and Mouse Interaction
Object.assign(SpiralCalendar.prototype, {
    getViewportDimensions() {
      const viewport = window.visualViewport;
      const width = viewport && Number.isFinite(viewport.width) ? viewport.width : window.innerWidth;
      const height = viewport && Number.isFinite(viewport.height) ? viewport.height : window.innerHeight;

      return {
        width: Math.max(0, Math.round(width || 0)),
        height: Math.max(0, Math.round(height || 0))
      };
    },

    syncViewportHostSize() {
      const { height } = this.getViewportDimensions();
      if (!height) return;

      const rootStyle = document.documentElement && document.documentElement.style;
      if (!rootStyle) return;

      rootStyle.setProperty('--app-viewport-height', `${height}px`);
    },

    handleResize() {
      this.syncViewportHostSize();

      const clientWidth = this.canvas.clientWidth;
      const clientHeight = this.canvas.clientHeight;
      if (!clientWidth || !clientHeight) return;

      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(clientWidth * dpr);
      this.canvas.height = Math.round(clientHeight * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Update event list max height to 1/3 of screen height
      if (this.timeDisplayState) {
        this.timeDisplayState.eventListMaxHeight = Math.floor(clientHeight / 3);
      }
      if (typeof this.syncBottomEventListPosition === 'function') {
        this.syncBottomEventListPosition();
      }
      this.drawSpiral();
    },

    scheduleViewportResize() {
      if (this.resizeSyncState) {
        if (this.resizeSyncState.animationFrameId) {
          cancelAnimationFrame(this.resizeSyncState.animationFrameId);
          this.resizeSyncState.animationFrameId = null;
        }
        if (Array.isArray(this.resizeSyncState.timeoutIds)) {
          this.resizeSyncState.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
          this.resizeSyncState.timeoutIds = [];
        }
      }

      const runResize = () => {
        if (this.resizeSyncState) {
          this.resizeSyncState.animationFrameId = null;
        }
        this.handleResize();
      };

      const queueResize = (delayMs) => {
        if (delayMs <= 0) {
          this.resizeSyncState.animationFrameId = requestAnimationFrame(runResize);
          return;
        }
        const timeoutId = setTimeout(() => {
          this.resizeSyncState.timeoutIds = this.resizeSyncState.timeoutIds.filter((id) => id !== timeoutId);
          this.resizeSyncState.animationFrameId = requestAnimationFrame(runResize);
        }, delayMs);
        this.resizeSyncState.timeoutIds.push(timeoutId);
      };

      queueResize(0);

      if (isMobileDevice()) {
        // iPhone Safari often reports one or two transient sizes mid-rotation.
        // Follow-up passes let the viewport settle before the canvas locks in.
        queueResize(80);
        queueResize(220);
      }
    },

    setupCanvas() {
      this.scheduleViewportResize();
      this.refreshCanvasCursor(true);
    },

    getDetailViewElementCursor(element) {
      switch (element) {
        case 'title':
        case 'description':
          return 'text';
        default:
          return 'pointer';
      }
    },

    shouldMirrorCanvasCursorGlobally() {
      return !!(
        (this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay) ||
        this.mouseState.isHandleDragging ||
        this.mouseState.isDragging ||
        (this.touchState && this.touchState.joystickActive && this.touchState.joystickTouchId === 'mouse')
      );
    },

    getCanvasInteractionCursor() {
      if (this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay) {
        return 'ns-resize';
      }

      if (this.mouseState.isHandleDragging || this.mouseState.isDragging) {
        return 'grabbing';
      }

      if (this.touchState && this.touchState.joystickActive && this.touchState.joystickTouchId === 'mouse') {
        return 'grabbing';
      }

      if (this.mouseState.hoveredHandle) {
        return 'grab';
      }

      if (this.mouseState.hoveredDetailElement) {
        return this.getDetailViewElementCursor(this.mouseState.hoveredDetailElement);
      }

      if (this.mouseState.hoveredTimeDisplay) {
        return 'ns-resize';
      }

      if (this.mouseState.hoveredSegment) {
        return 'pointer';
      }

      return this.state.detailViewDay === null ? 'grab' : 'default';
    },

    refreshCanvasCursor(force = false) {
      const nextCanvasCursor = this.getCanvasInteractionCursor();
      const nextGlobalCursor = this.shouldMirrorCanvasCursorGlobally() ? nextCanvasCursor : '';

      if (!force &&
          this._canvasInteractionCursor === nextCanvasCursor &&
          this._globalInteractionCursor === nextGlobalCursor) {
        return;
      }

      this._canvasInteractionCursor = nextCanvasCursor;
      this._globalInteractionCursor = nextGlobalCursor;

      if (this.canvas && this.canvas.style) {
        this.canvas.style.cursor = nextCanvasCursor;
      }

      if (document.documentElement && document.documentElement.style) {
        document.documentElement.style.cursor = nextGlobalCursor;
      }

      if (document.body && document.body.style) {
        document.body.style.cursor = nextGlobalCursor;
      }
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
        
        // Throttle canvas drawing during Time Display drag to ~30 FPS
        const now = performance.now();
        if (!this._lastTimeDisplayDragDraw || now - this._lastTimeDisplayDragDraw > 33) {
          this._lastTimeDisplayDragDraw = now;
          this.drawSpiral();
        }

        this.refreshCanvasCursor();
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
        const seg = this.findSegmentAtPoint(canvasX, canvasY, { clampToOuterFallback: true });
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
            // Start must be before end by at least 5 minutes
            if (newTime >= ev.end) {
              const adjusted = new Date(ev.end.getTime() - 5 * 60 * 1000);
              ev.start = adjusted;
            } else {
              ev.start = newTime;
            }
          } else if (this.mouseState.draggingHandle === 'end') {
            // End must be after start by at least 5 minutes
            if (newTime <= ev.start) {
              const adjusted = new Date(ev.start.getTime() + 5 * 60 * 1000);
              ev.end = adjusted;
            } else {
              ev.end = newTime;
            }
          }
          
          // Keep selectedSegment within the resized event bounds
          if (this.mouseState.selectedSegment) {
            const totVisSegs = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            const seg = this.mouseState.selectedSegment;
            const curSegId = totVisSegs - (seg.day * CONFIG.SEGMENTS_PER_DAY + seg.segment) - 1;
            const curHourStart = new Date(this.referenceTime.getTime() + curSegId * 60 * 60 * 1000);
            curHourStart.setUTCMinutes(0, 0, 0, 0);
            const curHourEnd = new Date(curHourStart.getTime() + 60 * 60 * 1000);
            
            const overlaps = ev.start < curHourEnd && ev.end > curHourStart;
            if (!overlaps) {
              // Jump selected segment to the dragged edge
              const pullDate = this.mouseState.draggingHandle === 'start' ? ev.start : new Date(ev.end.getTime() - 1);
              const dHrs = (pullDate - this.referenceTime) / (1000 * 60 * 60);
              const nSegId = dHrs >= 0 ? Math.floor(dHrs) : Math.ceil(dHrs);
              const nAbsPos = totVisSegs - nSegId - 1;
              const nDay = Math.floor(nAbsPos / CONFIG.SEGMENTS_PER_DAY);
              const nSeg = (CONFIG.SEGMENTS_PER_DAY - 1) - pullDate.getUTCHours();
              
              this.mouseState.selectedSegment = { day: nDay, segment: nSeg };
              this.state.detailViewDay = nDay;
            }
          }

          // Mark as changed and redraw
          this._detailViewHasChanges = true;
          // Rebuild layout cache since event times changed
          this._eventsVersion++;
          this.ensureLayoutCache();
          this.drawSpiral();
        }
        this.refreshCanvasCursor();
        return;
      }
      
      // Handle drag rotation
      if (this.touchState && this.touchState.joystickActive && this.touchState.joystickTouchId === 'mouse') {
        this.updateMouseJoystick(mouseX, mouseY);
        this.drawSpiral();
        this.refreshCanvasCursor();
        return;
      }

      if (this.touchState && this.touchState.longPressPendingTouchId === 'mouse') {
        const cancelledForDrag = this.trackPendingJoystickMotion(mouseX, mouseY);
        if (cancelledForDrag) {
          this.resetPendingTouchJoystick();
          this.beginPointerRotationDragAtPoint(mouseX, mouseY);
        } else {
          return;
        }
      }

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
          

          
          this.drawSpiral();
        }
        this.refreshCanvasCursor();
        return; // Don't update hover when dragging
      }
      
    // Check if mouse is hovering over time display area
    if (this.state.showTimeDisplay) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const timeDisplayArea = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
      
      const isHoveringTimeDisplay = mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
                                  mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height;
      
      if (isHoveringTimeDisplay !== this.mouseState.hoveredTimeDisplay) {
        this.mouseState.hoveredTimeDisplay = isHoveringTimeDisplay;
        this.drawSpiral(); // Redraw to show hover effects
      }
    } else {
      // Reset hover state when time display is disabled
      if (this.mouseState.hoveredTimeDisplay) {
        this.mouseState.hoveredTimeDisplay = false;
        this.drawSpiral();
      }
    }
    
    // Check if cursor is within the detail circle area (when detail view is open)
    let shouldCheckHover = true;
    if (this.state.detailViewDay !== null) {
      const detailMetrics = this.getDetailViewMetrics();
      const { centerX, centerY, outerRadius } = detailMetrics;
      
      // First, check hover over event time handles (outside detail view)
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
          // Redraw to update handle sizes on hover
          this.drawSpiral();
        }
        // If a handle is hovered, suppress segment hover checks
        if (this.mouseState.hoveredHandle) {
          this.mouseState.hoveredSegment = null;
          this.mouseState.hoveredEvent = null;
          shouldCheckHover = false;
        }
      } else if (this.mouseState.hoveredHandle) {
        // Clear stale hover state if handles aren't present
        this.mouseState.hoveredHandle = null;
        this.drawSpiral();
      }
      
      // Calculate distance from center (accounting for shifted center when time display is enabled)
      const distanceFromCenter = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);

      // If cursor is within the detail circle, don't check for segment hover
      if (distanceFromCenter <= outerRadius) {
        shouldCheckHover = false;
        // Clear any existing hover state
        if (this.mouseState.hoveredSegment !== null || this.mouseState.hoveredEvent !== null) {
          this.mouseState.hoveredSegment = null;
          this.mouseState.hoveredEvent = null;
          this.drawSpiral(); // Redraw to remove hover highlight
        }
        
        // Check for hover over clickable elements in the detail view
        this.checkDetailViewHover(mouseX, mouseY, centerX, centerY);
      } else {
        // Cursor is outside the detail view, reset hover state
        if (this.mouseState.hoveredDetailElement !== null) {
          this.mouseState.hoveredDetailElement = null;
        }
      }
    }
    
    // Find which segment the mouse is over (only if not in detail circle)
    if (shouldCheckHover) {
      const segment = this.findSegmentAtPoint(canvasX, canvasY);
      let shouldRedraw = false;
      const tooltipWasVisible = this.mouseState.hoveredEvent !== null;
      
      if (segment !== this.mouseState.hoveredSegment) {
        this.mouseState.hoveredSegment = segment;
        shouldRedraw = true;
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
      const tooltipIsVisible = this.mouseState.hoveredEvent !== null;
      if (tooltipWasVisible !== tooltipIsVisible) {
        shouldRedraw = true;
      }
      if (shouldRedraw) {
        this.drawSpiral(); // Redraw to update hover highlight / tooltip visibility
      }
    }

      this.refreshCanvasCursor();
    },

  checkDetailViewHover(mouseX, mouseY, centerX, centerY) {
    let hoveredElement = null;
    
    if (this.canvasClickAreas.prevEventChevron && this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.prevEventChevron)) {
      hoveredElement = 'prevEventChevron';
    }
    else if (this.canvasClickAreas.nextEventChevron && this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.nextEventChevron)) {
      hoveredElement = 'nextEventChevron';
    }
    // Check title click area
    else if (this.titleClickArea && this.isPointInRect(mouseX, mouseY, this.titleClickArea)) {
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
    if (hoveredElement !== this.mouseState.hoveredDetailElement) {
      this.mouseState.hoveredDetailElement = hoveredElement;
      // Redraw to reflect hover styling changes on canvas elements
      this.drawSpiral();
      this.refreshCanvasCursor();
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
      this.mouseState.hoveredHandle = null;
      this.mouseState.hoveredTimeDisplay = false;
      this.mouseState.clickingTimeDisplay = false;
      this.mouseState.hoveredDetailElement = null;
      // Only stop spiral dragging when mouse leaves canvas, not time display dragging
      if (!(this.timeDisplayState && this.timeDisplayState.mouseActive && this.state.showTimeDisplay)) {
        this.mouseState.isDragging = false;
      }
      this.mouseState.hoveredEvent = null; // Clear tooltip
      this.refreshCanvasCursor();
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
      const timeDisplayArea = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
      
      if (mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
          mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height) {
        // If collapsed, expand on click and exit
        if (this.timeDisplayState && this.timeDisplayState.collapsed) {
          this.setTimeDisplayCollapsed(false);
          this.refreshCanvasCursor();
          return;
        }
        // If an event is open, close it and reset auto-activated settings
        if (this.state.detailViewDay !== null) {
          this.closeDetailView({ clearSelection: true, clearDraft: true });
          
          // Reset auto-activated settings
          this.resetAutoActivatedSettings();
          
          // Play feedback for closing event
          this.playFeedback(0.15, 10);
          this.refreshCanvasCursor();
          return; // Don't process other clicks
        }
        
        this.resetToCurrentTimeFromTap();
        // Play feedback for time display click
        this.refreshCanvasCursor();
        return; // Don't process other clicks
      }
    }
      // Remove persistent inputs if clicking outside detail circle
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
      
      // Check if click is within the detail circle area
      if (this.state.detailViewDay !== null) {
        const detailMetrics = this.getDetailViewMetrics();
        const { centerX, centerY, outerRadius } = detailMetrics;

        // Check if click is within the detail circle
        const distance = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);
        if (distance <= outerRadius) {
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

          if (this.canvasClickAreas.prevEventChevron &&
              this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.prevEventChevron)) {
            if (this.cycleDetailViewEvent(-1)) {
              this.playFeedback(0.08, 6);
              this.drawSpiral();
            }
            return;
          }

          if (this.canvasClickAreas.nextEventChevron &&
              this.isPointInRect(mouseX, mouseY, this.canvasClickAreas.nextEventChevron)) {
            if (this.cycleDetailViewEvent(1)) {
              this.playFeedback(0.08, 6);
              this.drawSpiral();
            }
            return;
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
              if (this._detailViewHasChanges) {
                // "Done" button clicked - close the detail view
                this.closeDetailView();
                this.refreshCanvasCursor();
                this.drawSpiral();
                return;
              }
              // "+ New" button clicked - create a draft event for editing
              if (addBtn.isAddAnotherButton) {
                const selectedSegmentId = this.getSelectedSegmentId();
                this.draftEvent = this.createDraftEventForSegmentId(selectedSegmentId);
                
                // Reset selected event index to show the virtual event interface
                this.mouseState.selectedEventIndex = 0;
                
                // Update the calculated color for the selected segment stroke
                if (this.mouseState.selectedSegment) {
                  this.mouseState.selectedSegment.calculatedColor = this.draftEvent.color;
                }
                
              // Force immediate redraw to show the virtual event editing interface
                this.drawSpiral();
              
              // Ensure button info is properly updated for the draft event
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
                // Add Event button clicked - convert draft event to real event
                if (btn.event && btn.event.isDraft) {
                  // Convert draft event to real event
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
                  this.runWithStudyEventSource('detail_view', () => {
                    this.events.push(newEvent);
                    this._eventsVersion++;
                    this.saveEventsToStorage();
                  });
                  if (typeof window.renderEventList === 'function') {
                    window.renderEventList();
                  }
                  this.draftEvent = null; // Clear draft event
                  
                // Reset auto-activated settings
                  this.resetAutoActivatedSettings();
                // Force redraw to update the interface
                this.drawSpiral();
                }
                this.deleteButtonInfo = null;
                this.addButtonInfo = null;
                this.titleClickArea = null;
                this.closeDetailView({ clearSelection: true });
                
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
                this.refreshCanvasCursor();
                this.drawSpiral();
              } else {
                // Delete button clicked
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
                  
                  // Reset auto-activated settings
                  this.resetAutoActivatedSettings();
                  this.refreshCanvasCursor();
                  this.drawSpiral();
                  }
                }
              }
              return;
            }
          }
          // Click is inside the detail circle but not on any interactive element - do nothing
          return;
        }
      } else {
        // Not in detail view, always remove persistent inputs
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
          if (this.state.detailViewDay !== null) {
            const detailEventState = this.getDetailViewEventState();
            const selectedEventCount = detailEventState ? detailEventState.selectedEventCount : 0;
            const activeEvent = detailEventState ? detailEventState.activePersistedEvent : null;
            if (selectedEventCount > 1 && this.cycleDetailViewEvent(1)) {
              // Cycle to the next event
              this.drawSpiral(); // Redraw to update the detail view
              return; // Keep detail view open
            } else if (selectedEventCount === 1 && activeEvent) {
              // Single event: open color picker for that event, keep detail view open
              this.openColorPicker(activeEvent, { clientX: event.clientX, clientY: event.clientY });
              return;
            } else {
              // No events: close detail view as before
              this.closeDetailView({ clearDraft: true });
              
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
            this.openDetailViewForSegment(segment, { selectedEventIndex: 0 });
          }
        } else {
          // Clicked a different segment - select it and reset event index
          this.openDetailViewForSegment(segment, { selectedEventIndex: 0 });
        }
        
        this.mouseState.selectedSegment = segment;
        // Store the selected segmentId for persistence
        this.mouseState.selectedSegmentId = this.getSelectedSegmentId(segment);
        
        // Play feedback for event selection
        this.playFeedback(0.12, 8);
      } else {
        // Clicked outside of any segment - deselect current selection
        const hadSelection = this.state.detailViewDay !== null || this.mouseState.selectedSegment !== null;
        this.closeDetailView({ clearSelection: true, clearDraft: true });

// Reset auto-activated settings (independent of autoInsideSegmentNumbers flag)
        let needsRedraw = false;

        // Close event list if click was fully outside the spiral's outer bounds
        if (this.timeDisplayState && this.timeDisplayState.pullUpOffset > 0) {
          const canvasWidth = this.canvas.clientWidth;
          const canvasHeight = this.canvas.clientHeight;
          const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
          const x = canvasX / (window.devicePixelRatio || 1) - centerX;
          const y = canvasY / (window.devicePixelRatio || 1) - centerY;
          const dist = Math.sqrt(x * x + y * y);
          const { maxRadius, thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
          const visibilityRange = this.getRenderVisibilityRange(thetaMax);
          const circleMode = this.getRenderCircleMode();
          const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation, {
            circleMode: circleMode,
            allowSpiralOverflow: !circleMode && this.shouldAllowDetailViewSpiralOverflow(thetaMax, null)
          });
          const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
          const outerRadius = radiusFunction((endDay + 1) * 2 * Math.PI);
          
          if (dist > outerRadius) {
            this.timeDisplayState.pullUpOffset = 0;
            if (typeof this.hideBottomEventList === 'function') {
              this.hideBottomEventList();
            }
            needsRedraw = true; // ensure we redraw after hiding
          }
        }
        
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
        this.mouseState.hoveredDetailElement = null;
        
        // Play feedback for deselection only if there was actually a selection
        if (hadSelection) {
          this.playFeedback(0.08, 5);
        }
      }
      this.refreshCanvasCursor();
      this.drawSpiral();
    },

    handleMouseDown(event) {
      if (event.button !== 0) {
        return;
      }

      // Time display drag to collapse/expand (desktop)
      if (this.state.showTimeDisplay) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const renderRect = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
        const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
        const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
        // Reduce hit padding when event list is extended (when pullUpOffset > 0)
        const basePad = (this.timeDisplayState && this.timeDisplayState.hitPadding) ? this.timeDisplayState.hitPadding : 80;
        const pad = pullUpOffset > 0 ? Math.max(20, basePad * 0.25) : basePad; // Reduce to 25% (min 20px) when extended
        const area = { x: 0, y: Math.max(0, canvasHeight - tdHeight - pullUpOffset - pad), width: canvasWidth, height: tdHeight + pad };
        if (mouseX >= area.x && mouseX <= area.x + area.width && mouseY >= area.y && mouseY <= area.y + area.height) {
          this.timeDisplayState.mouseActive = true;
          this.timeDisplayState.mouseStartedInRenderRect = (
            mouseX >= renderRect.x &&
            mouseX <= renderRect.x + renderRect.width &&
            mouseY >= renderRect.y &&
            mouseY <= renderRect.y + renderRect.height
          );
          this.timeDisplayState.mouseStartY = mouseY;
          this.timeDisplayState.mouseLastY = mouseY;
          // Store initial state for tracking collapse/expand and pull-up
          this.timeDisplayState.mouseStartPullUpOffset = this.timeDisplayState.pullUpOffset || 0;
          this.timeDisplayState.mouseStartHeight = this.getTimeDisplayHeight();
          // Stop inertia when interacting with time display
          this.stopInertia();
          this.refreshCanvasCursor();
          return; // Don't start spiral drag
        }
      }

      // In detail view: allow starting a handle drag when over a handle
      if (this.state.detailViewDay !== null) {
        if (this.mouseState.hoveredHandle && this.mouseState.selectedSegment) {
          const which = this.mouseState.hoveredHandle; // 'start' | 'end'
          const detailEventState = this.getDetailViewEventState();
          const activeEvent = detailEventState ? detailEventState.detailEvent : null;
          if (activeEvent) {
            this.mouseState.isHandleDragging = true;
            this.mouseState.draggingHandle = which;
            this.handleDragState = {
              which,
              event: activeEvent,
              originalStart: new Date(activeEvent.start),
              originalEnd: new Date(activeEvent.end)
            };
            // Ensure spiral mode during handle drag (temporarily)
            if (this.state.circleMode) {
              this._originalCircleModeDuringHandleDrag = true;
              this.state.circleMode = false;
            } else {
              this._originalCircleModeDuringHandleDrag = false;
            }
            // Visual feedback
            // Stop inertia when beginning a handle drag
            this.stopInertia();
            // Blur any active text input (title/description)
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }
            // Mark changes so "+ New" → "Done"
            this._detailViewHasChanges = true;
            // Redraw to reflect mode change instantly
            this.refreshCanvasCursor();
            this.drawSpiral();
            event.preventDefault();
            return;
          }
        }
        // If in detail view and not on handles, don't start spiral drag
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
    
    // Check if clicking on time display area
    if (this.state.showTimeDisplay) {
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const timeDisplayArea = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
      
      const isClickingTimeDisplay = mouseX >= timeDisplayArea.x && mouseX <= timeDisplayArea.x + timeDisplayArea.width &&
                                  mouseY >= timeDisplayArea.y && mouseY <= timeDisplayArea.y + timeDisplayArea.height;
      
      if (isClickingTimeDisplay) {
        this.mouseState.clickingTimeDisplay = true;
        this.drawSpiral(); // Redraw to show click effect
        return; // Don't start dragging when clicking on time display
      }
    }
      
      // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
      if (!this.startPendingMouseJoystick(mouseX, mouseY)) {
        this.beginPointerRotationDragAtPoint(mouseX, mouseY);
      }
      this.refreshCanvasCursor();
      
      // Prevent text selection while dragging
      event.preventDefault();
    },

    handleMouseUp(event) {
      const mouseUsedJoystick = !!(
        this.touchState &&
        this.touchState.joystickConsumedTouch &&
        this.touchState.joystickTouchId === 'mouse'
      );

      if (this.touchState && this.touchState.longPressPendingTouchId === 'mouse') {
        this.resetPendingTouchJoystick();
      }

      if (mouseUsedJoystick) {
        this.cancelTouchJoystick(true);
        this.mouseState.isDragging = false;
        this.mouseState.hasMovedDuringDrag = false;
        this.mouseState.wasDragging = true;
        this.refreshCanvasCursor();
        this.drawSpiral();
        return;
      }

      // Finalize event time handle dragging
      if (this.mouseState.isHandleDragging) {
        this.mouseState.wasDragging = true; // Prevent handleClick from firing
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
        this.refreshCanvasCursor();
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
          const startedInRenderRect = !!this.timeDisplayState.mouseStartedInRenderRect;
          if (this.timeDisplayState.collapsed) {
            if (startedInRenderRect) {
              this.setTimeDisplayCollapsed(false);
            }
          } else if (startedInRenderRect) {
            this.resetToCurrentTimeFromTap();
          }
          this.timeDisplayState.mouseActive = false;
          this.timeDisplayState.mouseStartedInRenderRect = false;
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
        this.timeDisplayState.mouseStartedInRenderRect = false;
        // Set flag to prevent segment selection after time display drag
        this.timeDisplayState.justFinishedDrag = true;
        // Clear the flag after a short delay to allow normal interaction
        setTimeout(() => {
          if (this.timeDisplayState) {
            this.timeDisplayState.justFinishedDrag = false;
          }
        }, 100);
        this.refreshCanvasCursor();
        this.drawSpiral();
        return;
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

    this.refreshCanvasCursor();
    },

    handleDoubleClick(event) {
      if (event.target !== this.canvas || isMobileDevice()) return;

      // Ignore after drag interactions so the reset only comes from an intentional double-click.
      if (this.mouseState.wasDragging) {
        this.mouseState.wasDragging = false;
        return;
      }
      if (this.timeDisplayState && this.timeDisplayState.justFinishedDrag) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const canvasX = mouseX * this.canvas.width / this.canvas.clientWidth;
      const canvasY = mouseY * this.canvas.height / this.canvas.clientHeight;

      if (!this.canUseCanvasDoubleTapReset(mouseX, mouseY, canvasX, canvasY)) {
        return;
      }

      this.resetToCurrentTimeFromTap();
    },

    findSegmentAtPoint(canvasX, canvasY, options = {}) {
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
      
      if (this.getRenderCircleMode()) {
        let bestClampSegment = null;
        // Circle mode detection - use same logic as drawing
        const { maxRadius, thetaMax } = this.calculateTransforms(canvasWidth, canvasHeight);
        const visibilityRange = this.getRenderVisibilityRange(thetaMax);
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
          } else if (options.clampToOuterFallback && radius > outerRadius) {
            for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
              const dayStartAngle = day * 2 * Math.PI;
              const segmentStartAngle = dayStartAngle + segment * segmentAngle;
              const segmentEndAngle = segmentStartAngle + segmentAngle;

              const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
              const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);

              if (segmentEnd <= segmentStart) continue;

              let checkAngle = angle;
              while (checkAngle < segmentStart) checkAngle += 2 * Math.PI;
              while (checkAngle > segmentStart + 2 * Math.PI) checkAngle -= 2 * Math.PI;

              if (checkAngle >= segmentStart && checkAngle <= segmentEnd) {
                bestClampSegment = { day, segment, angle: checkAngle, radius: outerRadius };
              }
            }
          }
        }
        if (options.clampToOuterFallback && bestClampSegment) {
          return bestClampSegment;
        }
      } else {
        let bestClampSegment = null;
        // Spiral mode detection
        const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
        const visibilityRange = this.getRenderVisibilityRange(thetaMax);
        const detailDayNormalization = this.mouseState.isHandleDragging
          ? this.getDetailViewOutermostDayNormalization(thetaMax, visibilityRange)
          : null;
        const radiusFunction = this.createRadiusFunction(
          maxRadius,
          thetaMax,
          this.state.radiusExponent,
          this.state.rotation,
          {
            allowSpiralOverflow: this.shouldAllowDetailViewSpiralOverflow(thetaMax, detailDayNormalization),
            circleMode: false
          }
        );
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
              // Match the rendered segment band at the cursor's actual angle
              // instead of using the whole segment's broad start/end extrema.
              const minCheckRadius = Math.max(0, radiusFunction(normalizedAngle));
              const maxCheckRadius = radiusFunction(normalizedAngle + 2 * Math.PI);
              
              if (radius >= minCheckRadius && radius <= maxCheckRadius) {
                return {
                  day: day,
                  segment: segment,
                  angle: normalizedAngle,
                  radius: radius
                };
              } else if (options.clampToOuterFallback && radius > maxCheckRadius) {
                // If we are clamping and the point is beyond this segment's outer edge,
                // we record it. The outer loop will naturally overwrite this with the
                // outermost available valid day's segment that meets this angle.
                bestClampSegment = {
                  day: day,
                  segment: segment,
                  angle: normalizedAngle,
                  radius: maxCheckRadius
                };
              }
            }
          }
        }
        
        if (options.clampToOuterFallback && bestClampSegment) {
          return bestClampSegment;
        }
      }
      
      return null;
    },

    createRadiusFunction(maxRadius, thetaMax, exponent, rotation, options = {}) {
      const circleMode = typeof options.circleMode === 'boolean'
        ? options.circleMode
        : this.getRenderCircleMode();
      const dayCount = Number.isFinite(options.dayCount) ? options.dayCount : this.state.days;
      const allowSpiralOverflow = !!options.allowSpiralOverflow;
      const modeMorphProgress = Number.isFinite(options.modeMorphProgress)
        ? Math.max(0, Math.min(1, options.modeMorphProgress))
        : this.getModeMorphProgress();
      const radialOffset = Number.isFinite(options.radialOffset)
        ? options.radialOffset
        : this.getCurrentRenderedRadialOffset();
      const turnsPerDay = 2 * Math.PI;
      const rotationTurns = rotation / turnsPerDay;
      const computeBaseRadius = (theta) => {
        // Adjust theta to maintain constant spiral size during rotation
        const adjustedTheta = theta + rotation;
        const normalizedTheta = adjustedTheta / thetaMax;
        let radius = 0;
        
        if (circleMode) {
          // Anchor the day seam to actual midnight boundaries instead of the
          // current rotated viewport edge.
          const rawDayTurns = theta / turnsPerDay;
          const dayIndex = Math.floor(rawDayTurns + 1e-9);
          const dayStartTurns = dayIndex + rotationTurns;
          const discreteT = Math.max(0, Math.min(1, dayStartTurns / dayCount));
          radius = maxRadius * Math.pow(discreteT, exponent);
          return Math.max(0, radius);
        }

        if (modeMorphProgress > 0) {
          // Collapse the intra-day spiral slope toward the real midnight seam,
          // while preserving the scrolled day ordering from rotation.
          const rawDayTurns = theta / turnsPerDay;
          const dayIndex = Math.floor(rawDayTurns + 1e-9);
          const withinDay = rawDayTurns - dayIndex;
          const morphedTurns = dayIndex + rotationTurns + withinDay * (1 - modeMorphProgress);
          const morphedT = allowSpiralOverflow && modeMorphProgress < 1
            ? Math.max(0, morphedTurns / dayCount)
            : Math.max(0, Math.min(1, morphedTurns / dayCount));
          radius = maxRadius * Math.pow(morphedT, exponent);
          return Math.max(0, radius);
        }

        // Spiral mode: Keep the gradual growth, but allow temporary
        // overflow when detail-view handle dragging fills the outer day.
        const t = allowSpiralOverflow
          ? Math.max(0, normalizedTheta)
          : Math.max(0, Math.min(1, normalizedTheta));
        radius = maxRadius * Math.pow(t, exponent);
        return Math.max(0, radius);
      };

      let selectedReferenceRadius = null;
      if (radialOffset !== 0 && this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
        const segmentTheta = segment.day * 2 * Math.PI + (segment.segment + 0.5) * segmentAngle;
        const innerRadius = computeBaseRadius(segmentTheta);
        const outerRadius = computeBaseRadius(segmentTheta + 2 * Math.PI);
        selectedReferenceRadius = Math.max(1e-6, (innerRadius + outerRadius) * 0.5);
      }

      return (theta) => {
        const radius = computeBaseRadius(theta);
        if (radialOffset === 0) {
          return radius;
        }

        let effectiveOffset = radialOffset;
        if (selectedReferenceRadius !== null) {
          const offsetWeight = Math.max(0, Math.min(1, radius / selectedReferenceRadius));
          effectiveOffset *= offsetWeight;
        }

        return Math.max(0, radius + effectiveOffset);
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

    calculateTransforms(canvasWidth, canvasHeight, options = {}) {
      // Add one extra day to compensate for the 360° cut-off in the visibility range
      // This ensures that when user selects 7 days, they actually see 7 days worth of content
      const thetaMax = (this.state.days) * 2 * Math.PI;
      const spiralScale = Number.isFinite(options.spiralScale)
        ? options.spiralScale
        : this.getRenderSpiralScale();
      let maxRadius = Math.min(canvasWidth, canvasHeight) * spiralScale;

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
