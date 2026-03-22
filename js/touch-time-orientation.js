// Touch and Time Display
Object.assign(SpiralCalendar.prototype, {
  _touchToCanvasPoint(touch) {
    const rect = this.canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    return {
      touchX,
      touchY,
      canvasX: touchX * this.canvas.width / this.canvas.clientWidth,
      canvasY: touchY * this.canvas.height / this.canvas.clientHeight
    };
  },

  _canvasPointToModelSpace(canvasX, canvasY) {
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);

    let modelX = canvasX / devicePixelRatio - centerX;
    let modelY = canvasY / devicePixelRatio - centerY;
    if (this.state.staticMode) {
      modelX = -modelX;
      modelY = -modelY;
    } else {
      const cosR = Math.cos(this.state.rotation);
      const sinR = Math.sin(this.state.rotation);
      const tx = cosR * modelX - sinR * modelY;
      const ty = sinR * modelX + cosR * modelY;
      modelX = tx;
      modelY = ty;
    }

    return { modelX, modelY };
  },

  getHandleAtCanvasPoint(canvasX, canvasY, extraPadding = 4) {
    if (!this.handleHandles) return null;

    // Convert point to the same pre-rotation spiral coordinate space used for handles.
    const { modelX, modelY } = this._canvasPointToModelSpace(canvasX, canvasY);

    const distStart = Math.hypot(modelX - this.handleHandles.start.x, modelY - this.handleHandles.start.y);
    const distEnd = Math.hypot(modelX - this.handleHandles.end.x, modelY - this.handleHandles.end.y);
    const startHit = distStart <= (this.handleHandles.start.r + extraPadding);
    const endHit = distEnd <= (this.handleHandles.end.r + extraPadding);

    if (startHit && endHit) return distStart <= distEnd ? 'start' : 'end';
    if (startHit) return 'start';
    if (endHit) return 'end';
    return null;
  },

  updateDraggingHandleAtCanvasPoint(canvasX, canvasY) {
    if (!this.mouseState.isHandleDragging || !this.handleDragState || !this.handleDragState.event) {
      return false;
    }

    const seg = this.findSegmentAtPoint(canvasX, canvasY, { clampToOuterFallback: true });
    if (!seg) return false;

    // Transform point to pre-rotation spiral space.
    const { modelX, modelY } = this._canvasPointToModelSpace(canvasX, canvasY);

    const ang = Math.atan2(modelY, modelX);
    const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
    const rawStartAngle = seg.day * 2 * Math.PI + seg.segment * segmentAngle;
    const rawEndAngle = rawStartAngle + segmentAngle;
    let th = -ang + CONFIG.INITIAL_ROTATION_OFFSET;
    while (th < rawStartAngle) th += 2 * Math.PI;
    while (th > rawEndAngle) th -= 2 * Math.PI;

    let minuteFrac = 1 - (th - rawStartAngle) / segmentAngle;
    minuteFrac = Math.max(0, Math.min(1, minuteFrac));
    let minute = Math.round((minuteFrac * 60) / 5) * 5;
    if (minute >= 60) minute = 55;
    if (minute < 0) minute = 0;

    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (seg.day * CONFIG.SEGMENTS_PER_DAY + seg.segment) - 1;
    const hoursFromReference = segmentId;
    const hourStart = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
    hourStart.setUTCMinutes(0, 0, 0);
    const newTime = new Date(hourStart.getTime() + minute * 60 * 1000);

    const ev = this.handleDragState.event;
    if (this.mouseState.draggingHandle === 'start') {
      if (newTime >= ev.end) {
        ev.start = new Date(ev.end.getTime() - 5 * 60 * 1000);
      } else {
        ev.start = newTime;
      }
    } else if (this.mouseState.draggingHandle === 'end') {
      if (newTime <= ev.start) {
        ev.end = new Date(ev.start.getTime() + 5 * 60 * 1000);
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

    this._detailViewHasChanges = true;
    this._eventsVersion++;
    this.ensureLayoutCache();
    this.drawSpiral();
    return true;
  },

  syncSelectedSegmentToCurrentDays() {
    if (this.mouseState.selectedSegmentId === null) return;

    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    if (this.mouseState.selectedSegmentId < totalVisibleSegments) {
      const absPos = totalVisibleSegments - this.mouseState.selectedSegmentId - 1;
      const newDay = Math.floor(absPos / CONFIG.SEGMENTS_PER_DAY);
      const newSegment = absPos % CONFIG.SEGMENTS_PER_DAY;
      this.mouseState.selectedSegment = { day: newDay, segment: newSegment };
    } else {
      this.mouseState.selectedSegment = null;
      this.mouseState.selectedSegmentId = null;
    }
  },

  setTemporaryTouchDays(value) {
    this.state.days = Math.round(value);
    this.syncSelectedSegmentToCurrentDays();
  },

  cancelTouchResetAnimation(kind, snapToSlider = false) {
    if (!this.touchState) return;

    const frameKey = kind === 'days' ? 'daysResetAnimationId' : 'radiusResetAnimationId';
    if (this.touchState[frameKey]) {
      cancelAnimationFrame(this.touchState[frameKey]);
      this.touchState[frameKey] = null;
    }

    if (!snapToSlider) return;

    if (kind === 'days') {
      const daysSlider = document.getElementById('daysSlider');
      if (daysSlider) {
        this.setTemporaryTouchDays(parseInt(daysSlider.value, 10));
      }
    } else {
      const radiusSlider = document.getElementById('radiusSlider');
      if (radiusSlider) {
        this.state.radiusExponent = parseFloat(radiusSlider.value);
      }
    }
    this.drawSpiral();
  },

  animateTouchSettingBack(kind, duration = 180) {
    if (!this.touchState) return;

    const isDays = kind === 'days';
    const frameKey = isDays ? 'daysResetAnimationId' : 'radiusResetAnimationId';
    const slider = document.getElementById(isDays ? 'daysSlider' : 'radiusSlider');
    if (!slider) return;

    const targetValue = isDays ? parseInt(slider.value, 10) : parseFloat(slider.value);
    const startValue = isDays ? this.state.days : this.state.radiusExponent;
    const applyValue = isDays
      ? (value) => this.setTemporaryTouchDays(value)
      : (value) => { this.state.radiusExponent = Math.round(value * 100) / 100; };
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    this.cancelTouchResetAnimation(kind, false);

    if (!Number.isFinite(targetValue) || Math.abs(startValue - targetValue) < 0.001) {
      if (Number.isFinite(targetValue)) {
        applyValue(targetValue);
      }
      this.drawSpiral();
      return;
    }

    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const value = startValue + (targetValue - startValue) * easeOutCubic(t);
      applyValue(value);
      this.drawSpiral();

      if (t < 1) {
        this.touchState[frameKey] = requestAnimationFrame(step);
      } else {
        applyValue(targetValue);
        this.touchState[frameKey] = null;
        this.drawSpiral();
      }
    };

    this.touchState[frameKey] = requestAnimationFrame(step);
  },



  clearTouchJoystickTimer() {
    if (!this.touchState || !this.touchState.longPressTimerId) return;
    clearTimeout(this.touchState.longPressTimerId);
    this.touchState.longPressTimerId = null;
  },

  resetPendingTouchJoystick() {
    if (!this.touchState) return;
    this.clearTouchJoystickTimer();
    this.touchState.longPressPendingTouchId = null;
    this.touchState.longPressStartTouchX = 0;
    this.touchState.longPressStartTouchY = 0;
    this.touchState.longPressCurrentTouchX = 0;
    this.touchState.longPressCurrentTouchY = 0;
  },

  clearTouchTapSequence() {
    if (!this.touchState) return;
    this.touchState.lastTapTs = 0;
    this.touchState.lastTapX = 0;
    this.touchState.lastTapY = 0;
  },

  isBlockingTopPanelOpen() {
    if (document.body && document.body.classList.contains('panel-open')) {
      return true;
    }

    const panelIds = ['eventInputPanel', 'settingsPanel'];
    return panelIds.some((panelId) => {
      const panel = document.getElementById(panelId);
      if (!panel) return false;
      return panel.style.display === 'block' || window.getComputedStyle(panel).display !== 'none';
    });
  },

  isTouchInsideTimeDisplay(touchX, touchY) {
    if (!this.state.showTimeDisplay || !this.canvas) return false;

    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    if (!canvasWidth || !canvasHeight) return false;

    return this.isPointInRect(
      touchX,
      touchY,
      this.getTimeDisplayRenderRect(canvasWidth, canvasHeight)
    );
  },

  canUseCanvasDoubleTapReset(touchX, touchY, canvasX, canvasY) {
    if (this.state.detailViewDay !== null) return false;
    if (this.isBlockingTopPanelOpen()) return false;
    if (this.isTouchInsideTimeDisplay(touchX, touchY)) return false;

    return !this.findSegmentAtPoint(canvasX, canvasY);
  },

  isTouchDoubleTap(touchX, touchY, now = performance.now()) {
    if (!this.touchState) return false;

    const doubleTapWindowMs = 320;
    const doubleTapMaxDistance = 28;
    const dt = now - (this.touchState.lastTapTs || 0);
    const dx = touchX - (this.touchState.lastTapX || 0);
    const dy = touchY - (this.touchState.lastTapY || 0);
    const isDoubleTap =
      this.touchState.lastTapTs > 0 &&
      dt > 0 &&
      dt <= doubleTapWindowMs &&
      Math.hypot(dx, dy) <= doubleTapMaxDistance;

    if (isDoubleTap) {
      this.clearTouchTapSequence();
      return true;
    }

    this.touchState.lastTapTs = now;
    this.touchState.lastTapX = touchX;
    this.touchState.lastTapY = touchY;
    return false;
  },

  resetToCurrentTimeFromTap() {
    this.animateResetToCurrentTime({ enableAutoTimeAlign: true });
    this.playFeedback(0.15, 10);
  },

  getTouchJoystickLongPressConfig() {
    return {
      activationDelayMs: 700,
      dragCancelDistance: 12,
      motionResetDistance: 3
    };
  },

  schedulePendingJoystickActivation(pointerId) {
    if (!this.touchState || this.touchState.longPressPendingTouchId !== pointerId) return;

    this.clearTouchJoystickTimer();
    const { activationDelayMs } = this.getTouchJoystickLongPressConfig();

    this.touchState.longPressTimerId = setTimeout(() => {
      if (!this.touchState || this.touchState.longPressPendingTouchId !== pointerId) {
        return;
      }
      this.activatePendingJoystick(
        pointerId,
        this.touchState.longPressCurrentTouchX,
        this.touchState.longPressCurrentTouchY
      );
    }, activationDelayMs);
  },

  trackPendingJoystickMotion(pointX, pointY) {
    if (!this.touchState || this.touchState.longPressPendingTouchId === null) {
      return false;
    }

    const {
      dragCancelDistance,
      motionResetDistance
    } = this.getTouchJoystickLongPressConfig();
    const dxFromStart = pointX - this.touchState.longPressStartTouchX;
    const dyFromStart = pointY - this.touchState.longPressStartTouchY;
    if (Math.hypot(dxFromStart, dyFromStart) > dragCancelDistance) {
      return true;
    }

    const dxFromCurrent = pointX - this.touchState.longPressCurrentTouchX;
    const dyFromCurrent = pointY - this.touchState.longPressCurrentTouchY;
    if (Math.hypot(dxFromCurrent, dyFromCurrent) > motionResetDistance) {
      this.touchState.longPressCurrentTouchX = pointX;
      this.touchState.longPressCurrentTouchY = pointY;
      this.schedulePendingJoystickActivation(this.touchState.longPressPendingTouchId);
    }

    return false;
  },

  getTouchJoystickTravel(dx, dy, maxTravel = 68) {
    const distance = Math.hypot(dx, dy);
    if (!distance || distance <= maxTravel) {
      return { x: dx, y: dy, distance };
    }

    const scale = maxTravel / distance;
    return {
      x: dx * scale,
      y: dy * scale,
      distance: maxTravel
    };
  },

  getTouchJoystickConfig() {
    const canvasWidth = this.canvas ? this.canvas.clientWidth : 0;
    const canvasHeight = this.canvas ? this.canvas.clientHeight : 0;
    const minDimension = Math.max(0, Math.min(canvasWidth, canvasHeight));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const axialEnterRadius = Math.round(clamp(minDimension * 0.28, 120, 220));
    const maxTravel = Math.round(clamp(minDimension * 0.42, axialEnterRadius + 60, 320));

    return {
      deadZone: 1,
      maxTravel,
      axialEnterRadius,
      axialExitRadius: Math.round(axialEnterRadius * 0.78),
      dayStepVerticalRatio: 0.7071,
      circularGuideRadius: Math.round(clamp(minDimension * 0.024, 16, 28)),
      knobRadius: Math.round(clamp(minDimension * 0.022, 16, 22))
    };
  },

  getTouchJoystickOverlayPalette(circularActive, axialActive) {
    const isDarkCanvas = !!(document.body && document.body.classList.contains('dark-mode'));
    const alpha = (lightModeAlpha, darkModeAlpha = lightModeAlpha) =>
      isDarkCanvas ? darkModeAlpha : lightModeAlpha;

    // The spiral canvas is CSS-inverted in dark mode, so these stay in
    // pre-inversion dark colors to display as light overlays on screen.
    return {
      centerDotRadius: 3,
      angularAreaFill: circularActive
        ? `rgba(28,36,48,${alpha('0.04', '0.08')})`
        : `rgba(28,36,48,${alpha('0.02', '0.04')})`,
      guideStroke: circularActive
        ? `rgba(28,36,48,${alpha('0.14', '0.28')})`
        : `rgba(19,29,42,${alpha('0.02', '0.04')})`,
      centerDotColor: axialActive
        ? `rgba(28,36,48,${alpha('0.14', '0.24')})`
        : `rgba(28,36,48,${alpha('0.1', '0.18')})`,
      knobFill: circularActive
        ? `rgba(28,36,48,${alpha('0.88', '0.94')})`
        : `rgba(28,36,48,${alpha('0.8', '0.86')})`,
      wedgeFill: `rgba(28,36,48,${alpha('0.06', '0.12')})`,
      wedgeActiveFill: `rgba(28,36,48,${alpha('0.15', '0.25')})`
    };
  },

  normalizeTouchJoystickAngleDelta(deltaAngle) {
    if (deltaAngle > Math.PI) return deltaAngle - Math.PI * 2;
    if (deltaAngle < -Math.PI) return deltaAngle + Math.PI * 2;
    return deltaAngle;
  },

  getTouchJoystickMode(distance) {
    if (!this.touchState) return 'idle';

    const {
      deadZone,
      axialEnterRadius,
      axialExitRadius
    } = this.getTouchJoystickConfig();

    if (!Number.isFinite(distance) || distance <= deadZone) {
      return 'idle';
    }

    const previousMode = this.touchState.joystickMode || 'idle';
    if (previousMode === 'axial') {
      return distance < axialExitRadius ? 'circular' : 'axial';
    }

    if (previousMode === 'circular') {
      return distance > axialEnterRadius ? 'axial' : 'circular';
    }

    return distance > axialEnterRadius ? 'axial' : 'circular';
  },

  cancelTouchJoystick(resetConsumedTouch = false) {
    if (!this.touchState) return;

    this.resetPendingTouchJoystick();

    if (this.touchState.joystickFrameId) {
      cancelAnimationFrame(this.touchState.joystickFrameId);
      this.touchState.joystickFrameId = null;
    }

    this.touchState.joystickActive = false;
    this.touchState.joystickTouchId = null;
    this.touchState.joystickOriginX = 0;
    this.touchState.joystickOriginY = 0;
    this.touchState.joystickBaseX = 0;
    this.touchState.joystickBaseY = 0;
    this.touchState.joystickDx = 0;
    this.touchState.joystickDy = 0;
    this.touchState.joystickLastFrameTs = 0;
    this.touchState.joystickDayAccumulator = 0;
    this.touchState.joystickLastDayDirection = 0;
    this.touchState.joystickLastDayStep = 0;
    this.touchState.joystickMode = 'idle';
    this.touchState.joystickLastAngle = null;

    if (resetConsumedTouch) {
      this.touchState.joystickConsumedTouch = false;
    }

    if (typeof this.refreshCanvasCursor === 'function') {
      this.refreshCanvasCursor();
    }
  },

  beginPointerRotationDragAtPoint(pointX, pointY) {
    this.clearTouchTapSequence();
    const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
    const currentAngle = Math.atan2(pointY - centerY, pointX - centerX);

    this.mouseState.isDragging = true;
    this.mouseState.hasMovedDuringDrag = false;
    this.mouseState.dragStartAngle = currentAngle;
    this.mouseState.lastAngle = currentAngle;
    this.mouseState.dragStartRotation = this.state.rotation;
    this.mouseState.previousInertiaVelocity = this._inertiaVelocity || 0;
    this.stopInertia();
    this.mouseState.wasDragging = false;

    if (this.autoTimeAlignState.enabled) {
      this.autoTimeAlignState.enabled = false;
      this.stopAutoTimeAlign();
    }

    if (typeof this.refreshCanvasCursor === 'function') {
      this.refreshCanvasCursor();
    }
  },

  beginSingleTouchRotationDrag(touch) {
    const { touchX, touchY } = this._touchToCanvasPoint(touch);
    this.beginPointerRotationDragAtPoint(touchX, touchY);
  },

  activatePendingJoystick(pointerId, originX, originY) {
    if (!this.touchState || !this.state.enableLongPressJoystick || this.state.detailViewDay !== null) return;

    this.resetPendingTouchJoystick();
    this.touchState.joystickActive = true;
    this.touchState.joystickConsumedTouch = true;
    this.touchState.joystickTouchId = pointerId;
    this.touchState.joystickOriginX = originX;
    this.touchState.joystickOriginY = originY;
    this.touchState.joystickBaseX = originX;
    this.touchState.joystickBaseY = originY;
    this.touchState.joystickDx = 0;
    this.touchState.joystickDy = 0;
    this.touchState.joystickDayAccumulator = 0;
    this.touchState.joystickLastDayDirection = 0;
    this.touchState.joystickLastDayStep = 0;
    this.touchState.joystickMode = 'idle';
    this.touchState.joystickLastAngle = null;
    this.touchState.joystickLastFrameTs = performance.now();

    this.mouseState.isDragging = false;
    this.mouseState.hasMovedDuringDrag = false;
    this.mouseState.wasDragging = false;
    this.stopInertia();

    if (this.autoTimeAlignState.enabled) {
      this.autoTimeAlignState.enabled = false;
      this.stopAutoTimeAlign();
    }

    this.playFeedback(0.08, 12);
    if (typeof this.refreshCanvasCursor === 'function') {
      this.refreshCanvasCursor();
    }
    this.startTouchJoystickLoop();
    this.drawSpiral();
  },

  startPendingJoystick(pointerId, originX, originY) {
    if (!this.touchState || !this.state.enableLongPressJoystick) return false;

    this.cancelTouchJoystick(true);
    this.mouseState.isDragging = false;
    this.mouseState.hasMovedDuringDrag = false;
    this.mouseState.wasDragging = false;

    this.touchState.longPressPendingTouchId = pointerId;
    this.touchState.longPressStartTouchX = originX;
    this.touchState.longPressStartTouchY = originY;
    this.touchState.longPressCurrentTouchX = originX;
    this.touchState.longPressCurrentTouchY = originY;
    this.schedulePendingJoystickActivation(pointerId);

    return true;
  },

  startPendingTouchJoystick(touch) {
    const { touchX, touchY } = this._touchToCanvasPoint(touch);
    return this.startPendingJoystick(touch.identifier, touchX, touchY);
  },

  startPendingMouseJoystick(mouseX, mouseY) {
    return this.startPendingJoystick('mouse', mouseX, mouseY);
  },

  updateJoystickFromPoint(pointX, pointY) {
    if (!this.touchState || !this.touchState.joystickActive) return;

    this.touchState.joystickDx = pointX - this.touchState.joystickOriginX;
    this.touchState.joystickDy = pointY - this.touchState.joystickOriginY;
  },

  updateTouchJoystickFromTouch(touch) {
    const { touchX, touchY } = this._touchToCanvasPoint(touch);
    this.updateJoystickFromPoint(touchX, touchY);
  },

  updateMouseJoystick(mouseX, mouseY) {
    this.updateJoystickFromPoint(mouseX, mouseY);
  },

  stepTouchJoystickDay(direction, dayStep = 1) {
    if (!direction) return;
    const stepCount = Math.max(1, Math.round(Math.abs(dayStep)));
    this.state.rotation += (direction > 0 ? 1 : -1) * 2 * Math.PI * stepCount;
    this._shouldUpdateEventList = true;
  },

  startTouchJoystickLoop() {
    if (!this.touchState || this.touchState.joystickFrameId) return;

    const step = (now) => {
      if (!this.touchState || !this.touchState.joystickActive) {
        if (this.touchState) this.touchState.joystickFrameId = null;
        return;
      }

      const dtMs = Math.max(0, Math.min(80, now - (this.touchState.joystickLastFrameTs || now)));
      this.touchState.joystickLastFrameTs = now;

      const {
        deadZone,
        maxTravel,
        axialEnterRadius,
        dayStepVerticalRatio
      } = this.getTouchJoystickConfig();
      const limited = this.getTouchJoystickTravel(this.touchState.joystickDx, this.touchState.joystickDy, maxTravel);
      const distance = limited.distance;
      const currentAngle = distance > deadZone ? Math.atan2(limited.y, limited.x) : null;
      const nextMode = this.getTouchJoystickMode(distance);
      const previousMode = this.touchState.joystickMode || 'idle';
      let rotationChanged = false;

      if (nextMode !== previousMode) {
        this.touchState.joystickMode = nextMode;
        this.touchState.joystickLastAngle = nextMode === 'circular' ? currentAngle : null;
        if (nextMode !== 'axial') {
          this.touchState.joystickDayAccumulator = 0;
          this.touchState.joystickLastDayDirection = 0;
          this.touchState.joystickLastDayStep = 0;
        }
      }

      if (this.touchState.joystickMode === 'circular') {
        const previousAngle = this.touchState.joystickLastAngle;
        if (Number.isFinite(currentAngle) && Number.isFinite(previousAngle)) {
          let deltaAngle = this.normalizeTouchJoystickAngleDelta(currentAngle - previousAngle);
          const circularNorm = Math.min(
            1,
            Math.max(0, (distance - deadZone) / Math.max(1, axialEnterRadius - deadZone))
          );
          deltaAngle *= 0.45 + circularNorm * 0.55;

          if (Math.abs(deltaAngle) > 0.001) {
            const rotationDirection = this.state.staticMode ? 1 : -1;
            this.state.rotation += deltaAngle * rotationDirection;
            this._shouldUpdateEventList = true;
            rotationChanged = true;
          }
        }

        this.touchState.joystickLastAngle = currentAngle;
      } else if (this.touchState.joystickMode === 'axial') {
        const verticalAlignment = distance > 0 ? Math.abs(limited.y) / distance : 0;
        const isDaySkipArea = distance > deadZone && verticalAlignment >= dayStepVerticalRatio;
        
        const trueDistance = Math.sqrt(this.touchState.joystickDx ** 2 + this.touchState.joystickDy ** 2);

        if (!isDaySkipArea && Math.abs(limited.x) > deadZone) {
          const horizontalNorm = Math.min(1, (Math.abs(limited.x) - deadZone) / (maxTravel - deadZone));
          
          let speedMultiplier = Math.pow(horizontalNorm, 1.45) * 2.1;
          if (trueDistance > maxTravel) {
            speedMultiplier = 6.5;
          }
          
          const angularVelocity = Math.sign(limited.x) * speedMultiplier * Math.PI;
          if (angularVelocity) {
            this.state.rotation += angularVelocity * (dtMs / 1000);
            this._shouldUpdateEventList = true;
            rotationChanged = true;
          }
        }

        if (isDaySkipArea) {
          const verticalNorm = Math.min(1, (Math.abs(limited.y) - deadZone) / (maxTravel - deadZone));
          const direction = limited.y > 0 ? -1 : 1;
          const dayStep = trueDistance > maxTravel ? 7 : 1;
          const intervalMs = (420 - verticalNorm * 320) + (dayStep === 7 ? 80 : 0);
          if (
            direction !== this.touchState.joystickLastDayDirection ||
            dayStep !== this.touchState.joystickLastDayStep
          ) {
            this.touchState.joystickLastDayDirection = direction;
            this.touchState.joystickLastDayStep = dayStep;
            this.touchState.joystickDayAccumulator = intervalMs;
          } else {
            this.touchState.joystickDayAccumulator += dtMs;
          }

          let safety = 0;
          while (this.touchState.joystickDayAccumulator >= intervalMs && safety < 4) {
            this.touchState.joystickDayAccumulator -= intervalMs;
            this.stepTouchJoystickDay(direction, dayStep);
            rotationChanged = true;
            safety += 1;
          }
        } else {
          this.touchState.joystickDayAccumulator = 0;
          this.touchState.joystickLastDayDirection = 0;
          this.touchState.joystickLastDayStep = 0;
        }
      } else {
        this.touchState.joystickLastAngle = null;
        this.touchState.joystickDayAccumulator = 0;
        this.touchState.joystickLastDayDirection = 0;
        this.touchState.joystickLastDayStep = 0;
      }

      if (rotationChanged) {
        
        this.drawSpiral();
      }

      this.touchState.joystickFrameId = requestAnimationFrame(step);
    };

    this.touchState.joystickFrameId = requestAnimationFrame(step);
  },

  handleTouchStart(e) {
    // If page zoom is active, allow browser pinch zoom and ignore canvas gesture
    if (this.pageZoomActive) return;
    // Mark user interaction for audio/vibration feedback
    if (!this._userHasInteracted) {
      this._userHasInteracted = true;
      try {
        this.warmAudio();
      } catch (_) {}
    }

    // Check time display swipe/tap area first (single touch)
    if (e.touches.length === 1 && this.state.showTimeDisplay) {
      const { touchX, touchY, canvasX, canvasY } = this._touchToCanvasPoint(e.touches[0]);
      const touchesHandleInDetailMode = this.state.detailViewDay !== null && !!this.getHandleAtCanvasPoint(canvasX, canvasY, 14);
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const renderRect = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
      const tdHeight = (this.timeDisplayState && this.timeDisplayState.collapsed) ? (this.timeDisplayState.collapseHeight || 12) : CONFIG.TIME_DISPLAY_HEIGHT;
      const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
      // Reduce hit padding when event list is extended (when pullUpOffset > 0)
      // Remove padding on wide screens/desktops
      const isMobile = typeof isMobileDevice === 'function' ? isMobileDevice() : true;
      const configPad = (this.timeDisplayState && this.timeDisplayState.hitPadding) ? this.timeDisplayState.hitPadding : 80;
      const basePad = isMobile ? configPad : 0;
      const pad = pullUpOffset > 0 && isMobile ? Math.max(20, basePad * 0.25) : basePad; // Reduce to 25% (min 20px) when extended
      const timeDisplayArea = { x: 0, y: Math.max(0, canvasHeight - tdHeight - pullUpOffset - pad), width: canvasWidth, height: tdHeight + pad };
      const inside = touchX >= timeDisplayArea.x && touchX <= timeDisplayArea.x + timeDisplayArea.width && touchY >= timeDisplayArea.y && touchY <= timeDisplayArea.y + timeDisplayArea.height;
      if (inside && !touchesHandleInDetailMode) {
        // Begin swipe tracking for collapse/expand
        this.timeDisplayState.swipeActive = true;
        this.timeDisplayState.swipeStartedInRenderRect = (
          touchX >= renderRect.x &&
          touchX <= renderRect.x + renderRect.width &&
          touchY >= renderRect.y &&
          touchY <= renderRect.y + renderRect.height
        );
        this.timeDisplayState.swipeStartY = touchY;
        this.timeDisplayState.swipeLastY = touchY;
        // Store initial state for tracking collapse/expand and pull-up
        this.timeDisplayState.swipeStartPullUpOffset = this.timeDisplayState.pullUpOffset || 0;
        this.timeDisplayState.swipeStartHeight = this.getTimeDisplayHeight();
        // Stop any ongoing animation for interactive tracking
        if (this.timeDisplayState.animId) {
          cancelAnimationFrame(this.timeDisplayState.animId);
          this.timeDisplayState.animId = null;
        }
        e.preventDefault();
        return;
      }
    }

    if (e.touches.length > 1 && this.timeDisplayState) {
      // Cancel any time display swipe/tap tracking if multiple touches occur (e.g. pinch zoom)
      this.timeDisplayState.swipeActive = false;
      this.timeDisplayState.swipeStartedInRenderRect = false;
      this.touchState.wasMultiTouch = true;
    }

    if (e.touches.length === 4) {
      // Four-finger gesture: two anchor + two-finger pinch for radius adjustment
      this.cancelTouchJoystick(true);
      e.preventDefault();
      this.cancelTouchResetAnimation('radius', true);
      this.touchState.radiusAdjustActive = true;
      // First two touches are anchors, third and fourth are pinch
      this.touchState.anchorTouchIds = [e.touches[0].identifier, e.touches[1].identifier];
      this.touchState.pinchTouchIds = [e.touches[2].identifier, e.touches[3].identifier];
      this.touchState.initialRadiusValue = this.state.radiusExponent;
      // Store initial pinch distance
      this.touchState.initialDistance = this.getTouchDistance(e.touches[2], e.touches[3]);
      this.mouseState.isDragging = false;
      // Reset days adjust if active
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
      }
    } else if (e.touches.length === 3) {
      // Three-finger gesture: one anchor + two-finger pinch for days adjustment
      this.cancelTouchJoystick(true);
      e.preventDefault();
      this.cancelTouchResetAnimation('days', true);
      this.touchState.daysAdjustActive = true;
      // First touch is anchor, second and third are pinch
      this.touchState.anchorTouchId = e.touches[0].identifier;
      this.touchState.daysPinchTouchIds = [e.touches[1].identifier, e.touches[2].identifier];
      this.touchState.initialDaysValue = this.state.days;
      // Store initial pinch distance
      this.touchState.initialDistance = this.getTouchDistance(e.touches[1], e.touches[2]);
      this.mouseState.isDragging = false;
      // Reset radius adjust if active
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
      }
    } else if (e.touches.length === 2) {
      // Two-finger pinch-to-zoom
      this.cancelTouchJoystick(true);
      e.preventDefault();
      this.touchState.isActive = true;
      this.touchState.initialDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      this.touchState.initialDays = this.state.days;
      this.mouseState.isDragging = false; // Stop any single-finger drag
      // Reset radius adjust if active
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
      }
    } else if (e.touches.length === 1) {
      const { touchX, touchY, canvasX, canvasY } = this._touchToCanvasPoint(e.touches[0]);

      // In detail view, allow direct touch-drag of start/end event handles.
      if (this.state.detailViewDay !== null && this.mouseState.selectedSegment) {
        const touchedHandle = this.getHandleAtCanvasPoint(canvasX, canvasY, 14);
        if (touchedHandle) {
          const detailEventState = this.getDetailViewEventState();
          const selectedEvent = detailEventState ? detailEventState.detailEvent : null;
          if (selectedEvent) {
            this.mouseState.hoveredHandle = touchedHandle;
            this.mouseState.isHandleDragging = true;
            this.mouseState.draggingHandle = touchedHandle;
            this.mouseState.isDragging = false;
            this.mouseState.hasMovedDuringDrag = false;
            this.handleDragState = {
              which: touchedHandle,
              event: selectedEvent,
              originalStart: new Date(selectedEvent.start),
              originalEnd: new Date(selectedEvent.end),
              touchIdentifier: e.touches[0].identifier
            };

            // Ensure spiral mode during handle drag (temporarily).
            if (this.state.circleMode) {
              this._originalCircleModeDuringHandleDrag = true;
              this.state.circleMode = false;
            } else {
              this._originalCircleModeDuringHandleDrag = false;
            }

            this.touchState.isActive = false;
            this.stopInertia();
            // Blur any active text input (title/description)
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }
            this._detailViewHasChanges = true;
            this.drawSpiral();
            e.preventDefault();
            return;
          }
        }
      }

      // If in detail view and tapping on detail circle date boxes, open picker immediately (mobile reliability)
      if (this.state.detailViewDay !== null && this.canvasClickAreas) {
        if (this.canvasClickAreas.startDateBox) {
          const box = this.canvasClickAreas.startDateBox;
          if (touchX >= box.x && touchX <= box.x + box.width &&
              touchY >= box.y && touchY <= box.y + box.height) {
            e.preventDefault();
            this.mouseState.isDragging = false;
            this.openDateTimePicker(box.event, 'start', box);
            return;
          }
        }
        if (this.canvasClickAreas.endDateBox) {
          const box = this.canvasClickAreas.endDateBox;
          if (touchX >= box.x && touchX <= box.x + box.width &&
              touchY >= box.y && touchY <= box.y + box.height) {
            e.preventDefault();
            this.mouseState.isDragging = false;
            this.openDateTimePicker(box.event, 'end', box);
            return;
          }
        }
      }

      // Single-finger interactions (only if not in detail view)
      if (this.state.detailViewDay === null) {
        if (!this.startPendingTouchJoystick(e.touches[0])) {
          this.beginSingleTouchRotationDrag(e.touches[0]);
        }
      }
      this.touchState.isActive = false;
    } else {
      this.cancelTouchJoystick(true);
      this.touchState.isActive = false;
      this.mouseState.isDragging = false;
    }
  },

  handleTouchMove(e) {
    // If page zoom is active, allow browser pinch zoom and ignore canvas gesture
    if (this.pageZoomActive) return;

    // While dragging a start/end handle, update event time from touch position.
    if (this.mouseState.isHandleDragging && this.handleDragState && this.handleDragState.event) {
      const trackedId = this.handleDragState.touchIdentifier;
      const activeTouch = Array.from(e.touches).find((touch) => touch.identifier === trackedId) || e.touches[0];
      if (!activeTouch) return;
      const { canvasX, canvasY } = this._touchToCanvasPoint(activeTouch);
      this.updateDraggingHandleAtCanvasPoint(canvasX, canvasY);
      e.preventDefault();
      return;
    }

    // Handle time display swipe (interactive tracking - time display stays fixed height, only pull-up offset changes)
    if (this.timeDisplayState && this.timeDisplayState.swipeActive && this.state.showTimeDisplay) {
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch) {
        const touchY = touch.clientY - rect.top;
        this.timeDisplayState.swipeLastY = touchY;
        const dy = touchY - this.timeDisplayState.swipeStartY;
        const base = CONFIG.TIME_DISPLAY_HEIGHT;
        const minH = this.timeDisplayState.collapseHeight || 12;
        const startHeight = this.timeDisplayState.swipeStartHeight || base;
        const startOffset = this.timeDisplayState.swipeStartPullUpOffset || 0;
        
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
        
        // Throttle canvas drawing during Time Display swipe to ~30 FPS
        const now = performance.now();
        if (!this._lastTimeDisplaySwipeDraw || now - this._lastTimeDisplaySwipeDraw > 33) {
          this._lastTimeDisplaySwipeDraw = now;
          this.drawSpiral();
        }
      }
      e.preventDefault();
      return;
    }
    
    // Handle four-finger gesture for radius adjustment
    if (e.touches.length === 4 && this.touchState.radiusAdjustActive) {
      e.preventDefault();
      
      // Find the two pinch touches (excluding the two anchors)
      const pinchTouches = Array.from(e.touches).filter(touch => 
        this.touchState.pinchTouchIds.includes(touch.identifier)
      );
      
      if (pinchTouches.length === 2) {
        const currentDistance = this.getTouchDistance(pinchTouches[0], pinchTouches[1]);
        const distanceRatio = currentDistance / this.touchState.initialDistance;
        
        // Calculate new radius value based on pinch scale
        // Pinch apart (distanceRatio > 1): increase radius
        // Pinch together (distanceRatio < 1): decrease radius
        const radiusSlider = document.getElementById('radiusSlider');
        
        if (radiusSlider) {
          const min = parseFloat(radiusSlider.min);
          const max = parseFloat(radiusSlider.max);
          const minValue = 1;
          const maxValue = 10;
          const minStep = 0.05;
          const maxStep = 1.0;
          
          // Use proportional scaling like Ctrl+scroll
          // Calculate change from initial value
          const initialValue = this.touchState.initialRadiusValue;
          // Scale the change based on current value (use initial for initial scaling)
          const ratio = (initialValue - minValue) / (maxValue - minValue);
          const baseStep = minStep + ratio * (maxStep - minStep);
          
          // Scale by distance ratio (subtract 1 to get relative change)
          // Sensitivity multiplier for pinch gesture (increased for more responsive control)
          const sensitivity = 10;
          const change = (distanceRatio - 1) * baseStep * sensitivity;
          let newValue = initialValue + change;
          
          // Round to 2 decimal places
          newValue = Math.round(newValue * 100) / 100;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));

          this.state.radiusExponent = newValue;
          this.drawSpiral();
        }
      }
      return;
    }
    
    // Handle three-finger gesture for days adjustment
    if (e.touches.length === 3 && this.touchState.daysAdjustActive) {
      e.preventDefault();
      
      // Find the two pinch touches (excluding the anchor)
      const pinchTouches = Array.from(e.touches).filter(touch => 
        this.touchState.daysPinchTouchIds.includes(touch.identifier)
      );
      
      if (pinchTouches.length === 2) {
        const currentDistance = this.getTouchDistance(pinchTouches[0], pinchTouches[1]);
        const distanceRatio = currentDistance / this.touchState.initialDistance;
        
        // Calculate new days value based on pinch scale
        // Pinch apart (distanceRatio > 1): increase days
        // Pinch together (distanceRatio < 1): decrease days
        const daysSlider = document.getElementById('daysSlider');
        
        if (daysSlider) {
          const min = parseInt(daysSlider.min);
          const max = parseInt(daysSlider.max);
          const initialValue = this.touchState.initialDaysValue;
          
          // Calculate change - integer steps for days
          // Step size of 1 day per unit of distance ratio change
          const sensitivity = 10; // Adjust sensitivity as needed
          const change = Math.round((distanceRatio - 1) * sensitivity);
          let newValue = initialValue + change;
          
          // Clamp to bounds
          newValue = Math.max(min, Math.min(max, newValue));

          this.setTemporaryTouchDays(newValue);
          this.drawSpiral();
        }
      }
      return;
    }
    
    if (e.touches.length === 2 && this.touchState.isActive) {
      // Two-finger pinch-to-zoom
      e.preventDefault();
      // Reset days adjust if transitioning from 4-finger gesture
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
        this.touchState.anchorTouchIds = [];
        this.touchState.daysPinchTouchIds = [];
      }
      // Reset radius adjust if transitioning from 3-finger gesture
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
        this.touchState.anchorTouchId = null;
        this.touchState.pinchTouchIds = [];
      }
    // Disable Auto Time Align on pinch-zoom
    if (this.autoTimeAlignState.enabled) {
      this.autoTimeAlignState.enabled = false;
      this.stopAutoTimeAlign();
    }
      const currentDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      const distanceRatio = currentDistance / this.touchState.initialDistance;
    const sensitivity = 2.0; // Adjust as needed
        const rotationChange = (distanceRatio - 1) * sensitivity;
        const rotationSteps = Math.round(rotationChange);
        if (rotationSteps !== 0) {
          // Store previous rotation to detect if we hit the limit
          const previousRotation = this.state.rotation;
          
      this.state.rotation += rotationSteps * 2 * Math.PI;
      
      // Check if we're in detail view and hit the outer limit
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
        
        // Simplified pinch zoom detection - try a more lenient approach
        const isNearLimit = Math.abs(this.state.rotation - maxRotation) < 0.1; // More lenient threshold
        const isZoomingOut = rotationSteps > 0; // Positive steps mean zooming out (pinch apart)
        
        if (isNearLimit && wouldExceedLimit && isZoomingOut) {
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
        } else if (rotationSteps < 0) {
          // Reset counter when zooming in (pinch together)
          this.state.pastLimitScrollCount = 0;
          
          // Reset auto-activated settings
          this.resetAutoActivatedSettings();
        }
        
        // If we're zooming in and auto inside segment numbers are active, reset them
        if (rotationSteps < 0 && this.state.autoInsideSegmentNumbers) {
          this.state.autoInsideSegmentNumbers = false;
          this.state.hourNumbersInsideSegment = false;
          // Update the UI checkbox
          const insideSegmentCheckbox = document.getElementById('hourNumbersInsideSegment');
          if (insideSegmentCheckbox) {
            insideSegmentCheckbox.checked = false;
          }
        }
      }

          this.touchState.initialDistance = currentDistance;
      // Mark that a pinch-zoom just occurred
      this._justPinchZoomed = true;
          this.drawSpiral();
      }
    } else if (e.touches.length === 1) {
      const activeTouch = e.touches[0];

      if (this.touchState.joystickActive) {
        if (activeTouch.identifier === this.touchState.joystickTouchId) {
          this.updateTouchJoystickFromTouch(activeTouch);
          this.drawSpiral();
          e.preventDefault();
        }
        return;
      }

      if (this.touchState.longPressPendingTouchId !== null) {
        if (activeTouch.identifier !== this.touchState.longPressPendingTouchId) {
          this.resetPendingTouchJoystick();
        } else {
          const { touchX, touchY } = this._touchToCanvasPoint(activeTouch);
          const cancelledForDrag = this.trackPendingJoystickMotion(touchX, touchY);
          if (cancelledForDrag) {
            this.resetPendingTouchJoystick();
            this.beginSingleTouchRotationDrag(activeTouch);
          } else {
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
      }

      if (!this.mouseState.isDragging) {
        return;
      }

      // Single-finger drag rotation
      const rect = this.canvas.getBoundingClientRect();
      const touchX = activeTouch.clientX - rect.left;
      const touchY = activeTouch.clientY - rect.top;
      // Use calculateCenter to get the correct center coordinates (accounting for time display offset)
      const { centerX, centerY } = this.calculateCenter(this.canvas.clientWidth, this.canvas.clientHeight);
      const currentAngle = Math.atan2(touchY - centerY, touchX - centerX);
      
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
        // Track velocity sample for inertia (touch)
        const now = performance.now();
        if (!this._velSamples) this._velSamples = [];
        if (this._lastMoveTs !== undefined) {
          const dt = Math.max(0.001, (now - this._lastMoveTs) / 1000);
          const v = appliedDelta / dt;
          this._velSamples.push({ t: now, v });
          const cutoff = now - 200;
          while (this._velSamples.length && this._velSamples[0].t < cutoff) this._velSamples.shift();
        }
        this._lastMoveTs = now;
        

        
        this.drawSpiral();
      }
    }
  // In handleTouchMove, after updating this.state.rotation (for pinch-zoom):
  this.clampRotationToEventWindow();
  },

  handleTouchEnd(e) {
    // If page zoom is active, no canvas gesture to finalize
    if (this.pageZoomActive) return;

    const touchUsedJoystick = !!(this.touchState && this.touchState.joystickConsumedTouch);

    if (this.touchState) {
      if (this.touchState.joystickActive) {
        const trackedId = this.touchState.joystickTouchId;
        const stillTrackedTouchActive = trackedId !== null && Array.from(e.touches || []).some((touch) => touch.identifier === trackedId);
        if (!stillTrackedTouchActive) {
          this.cancelTouchJoystick(false);
        }
      } else if (e.touches.length === 0 || !Array.from(e.touches || []).some((touch) => touch.identifier === this.touchState.longPressPendingTouchId)) {
        this.resetPendingTouchJoystick();
      }
    }

    if (touchUsedJoystick && e.touches.length === 0) {
      this.touchState.joystickConsumedTouch = false;
      this.mouseState.isDragging = false;
      this.mouseState.hasMovedDuringDrag = false;
      this.mouseState.wasDragging = false;
      this.drawSpiral();
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Finalize event time handle dragging.
    if (this.mouseState.isHandleDragging) {
      const trackedId = this.handleDragState ? this.handleDragState.touchIdentifier : null;
      const stillTrackedTouchActive = trackedId !== null && Array.from(e.touches || []).some((touch) => touch.identifier === trackedId);
      if (stillTrackedTouchActive) return;

      this.mouseState.wasDragging = true; // Prevent synthetic click from firing
      this.mouseState.isHandleDragging = false;
      this.mouseState.draggingHandle = null;
      this.mouseState.hoveredHandle = null;
      this.handleDragState = null;

      if (this._originalCircleModeDuringHandleDrag) {
        this.state.circleMode = true;
        this._originalCircleModeDuringHandleDrag = false;
      }

      if (typeof this.saveEventsToStorage === 'function') {
        this.saveEventsToStorage();
      }
      if (typeof window.renderEventList === 'function') {
        window.renderEventList();
      }

      if (typeof this.refreshCanvasCursor === 'function') {
        this.refreshCanvasCursor();
      } else {
        this.canvas.style.cursor = 'default';
      }
      this.drawSpiral();
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Finalize time display swipe/tap
    if (this.timeDisplayState && this.timeDisplayState.swipeActive && this.state.showTimeDisplay) {
      // Treat as tap if minimal movement
      const dy = this.timeDisplayState.swipeLastY - this.timeDisplayState.swipeStartY;
      const tiny = Math.abs(dy) < 6;
      if (tiny) {
        const startedInRenderRect = !!this.timeDisplayState.swipeStartedInRenderRect;
        if (this.timeDisplayState.collapsed) {
          if (startedInRenderRect) {
            // Tap on collapsed bar expands it
            this.setTimeDisplayCollapsed(false);
          }
        } else if (startedInRenderRect) {
          // Tap on expanded bar -> enable Auto Time Align if currently off
          this.resetToCurrentTimeFromTap();
        }
        this.timeDisplayState.swipeActive = false;
        this.timeDisplayState.swipeStartedInRenderRect = false;
        if (startedInRenderRect) {
          return;
        }
      } else {
        // Decide final state based on pull-up offset and time display height
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
          // Snap pull-up offset: use midpoint of max offset (similar to pull-down using midpoint of height range)
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
        this.timeDisplayState.swipeActive = false;
        this.timeDisplayState.swipeStartedInRenderRect = false;
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
    }
    
    // End the four-finger radius gesture and return to the saved slider value.
    if (e.touches.length < 4) {
      if (this.touchState.radiusAdjustActive) {
        this.touchState.radiusAdjustActive = false;
        this.touchState.anchorTouchIds = [];
        this.touchState.pinchTouchIds = [];
        this.animateTouchSettingBack('radius');
      }
    }
    
    // End the three-finger days gesture and return to the saved slider value.
    if (e.touches.length < 3) {
      if (this.touchState.daysAdjustActive) {
        this.touchState.daysAdjustActive = false;
        this.touchState.anchorTouchId = null;
        this.touchState.daysPinchTouchIds = [];
        this.animateTouchSettingBack('days');
      }
    }
    
    if (e.touches.length < 2) {
      this.touchState.isActive = false;
    }
    if (e.touches.length === 0) {
      const wasMultiTouch = !!this.touchState.wasMultiTouch;
      this.touchState.wasMultiTouch = false;
      
      if (this.mouseState.isDragging && this.mouseState.hasMovedDuringDrag) {
        this.mouseState.wasDragging = true;
      }
      this.mouseState.isDragging = false;
      this.mouseState.hasMovedDuringDrag = false;
      // On release, compute averaged velocity and start inertia (touch)
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
          
          // Add momentum from previous inertia (if any) - same as mouse handler
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
      
      // Handle touch click for time display and detail circle date boxes (mobile devices)
      if (!this.mouseState.wasDragging && !this.mouseState.hasMovedDuringDrag && !wasMultiTouch) {
        // Don't handle tap if we just finished dragging the time display
        if (this.timeDisplayState && this.timeDisplayState.justFinishedDrag) {
          return;
        }
        
        // This was a tap, not a drag - handle as a click
        const changedTouch = e.changedTouches && e.changedTouches[0];
        if (!changedTouch) {
          return;
        }
        const { touchX, touchY, canvasX, canvasY } = this._touchToCanvasPoint(changedTouch);

        if (this.canUseCanvasDoubleTapReset(touchX, touchY, canvasX, canvasY)) {
          if (this.isTouchDoubleTap(touchX, touchY)) {
            this.resetToCurrentTimeFromTap();
            return;
          }
        } else {
          this.clearTouchTapSequence();
        }
        
        // Check if tap is on the time display (only if time display is enabled)
        if (this.state.showTimeDisplay) {
          const canvasWidth = this.canvas.clientWidth;
          const canvasHeight = this.canvas.clientHeight;
          const timeDisplayArea = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
          
          if (touchX >= timeDisplayArea.x && touchX <= timeDisplayArea.x + timeDisplayArea.width &&
              touchY >= timeDisplayArea.y && touchY <= timeDisplayArea.y + timeDisplayArea.height) {
            // Time display tapped - activate Auto Time Align if it's currently off
            this.resetToCurrentTimeFromTap();
            return; // Don't process other clicks
          }
        }

        // If in detail view, also treat taps on the canvas-drawn date boxes like clicks
        if (this.state.detailViewDay !== null && this.canvasClickAreas) {
          if (this.canvasClickAreas.startDateBox) {
            const box = this.canvasClickAreas.startDateBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              // Mobile-friendly: open centered (handled inside openDateTimePicker)
              this.openDateTimePicker(box.event, 'start', box);
              return;
            }
          }
          if (this.canvasClickAreas.endDateBox) {
            const box = this.canvasClickAreas.endDateBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              this.openDateTimePicker(box.event, 'end', box);
              return;
            }
          }
          if (this.canvasClickAreas.calendarBox) {
            const box = this.canvasClickAreas.calendarBox;
            if (touchX >= box.x && touchX <= box.x + box.width &&
                touchY >= box.y && touchY <= box.y + box.height) {
              this.openCalendarPicker(box.event);
              return;
            }
          }
        }
      }
    }
  },

  getTouchDistance(touch1, touch2) {
    const rect = this.canvas.getBoundingClientRect();
    const x1 = touch1.clientX - rect.left;
    const y1 = touch1.clientY - rect.top;
    const x2 = touch2.clientX - rect.left;
    const y2 = touch2.clientY - rect.top;
    
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },

  drawTouchJoystickOverlay() {
    if (!this.touchState || !this.touchState.joystickActive) return;

    const {
      maxTravel,
      axialEnterRadius,
      circularGuideRadius,
      knobRadius,
      dayStepVerticalRatio
    } = this.getTouchJoystickConfig();
    const limited = this.getTouchJoystickTravel(this.touchState.joystickDx, this.touchState.joystickDy, maxTravel);
    const baseX = this.touchState.joystickBaseX;
    const baseY = this.touchState.joystickBaseY;
    const knobX = baseX + limited.x;
    const knobY = baseY + limited.y;
    const joystickMode = this.touchState.joystickMode === 'idle'
      ? this.getTouchJoystickMode(limited.distance)
      : this.touchState.joystickMode;
    const circularActive = joystickMode === 'circular';
    const axialActive = joystickMode === 'axial';
    const {
      centerDotRadius,
      angularAreaFill,
      guideStroke,
      centerDotColor,
      knobFill,
      wedgeFill,
      wedgeActiveFill
    } = this.getTouchJoystickOverlayPalette(circularActive, axialActive);

    this.ctx.save();
    this.ctx.fillStyle = angularAreaFill;
    this.ctx.beginPath();
    this.ctx.arc(baseX, baseY, axialEnterRadius, 0, Math.PI * 2);
    this.ctx.fill();

    if (axialActive && limited.distance > axialEnterRadius) {
      const verticalAlignment = Math.abs(limited.y) / limited.distance;
      const isDaySkipArea = verticalAlignment >= dayStepVerticalRatio;
      const angle = Math.asin(dayStepVerticalRatio);
      
      const trueDistance = Math.sqrt(this.touchState.joystickDx ** 2 + this.touchState.joystickDy ** 2);
      this.ctx.fillStyle = trueDistance > maxTravel ? wedgeActiveFill : wedgeFill;
      
      if (isDaySkipArea) {
        this.ctx.beginPath();
        this.ctx.arc(baseX, baseY, maxTravel, angle, Math.PI - angle);
        this.ctx.arc(baseX, baseY, axialEnterRadius, Math.PI - angle, angle, true);
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(baseX, baseY, maxTravel, Math.PI + angle, 2 * Math.PI - angle);
        this.ctx.arc(baseX, baseY, axialEnterRadius, 2 * Math.PI - angle, Math.PI + angle, true);
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(baseX, baseY, maxTravel, -angle, angle);
        this.ctx.arc(baseX, baseY, axialEnterRadius, angle, -angle, true);
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(baseX, baseY, maxTravel, Math.PI - angle, Math.PI + angle);
        this.ctx.arc(baseX, baseY, axialEnterRadius, Math.PI + angle, Math.PI - angle, true);
        this.ctx.fill();
      }
    }

    this.ctx.lineWidth = 1.0;
    this.ctx.strokeStyle = guideStroke;
    this.ctx.beginPath();
    this.ctx.arc(baseX, baseY, circularGuideRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    const maxSpiralRadius = axialEnterRadius;
    const drawSpiral = (endAngle) => {
      const startAngle = endAngle - Math.PI*2;
      this.ctx.beginPath();
      for (let i = 0; i <= 600; i++) {
        const t = i / 600;
        const currentAngle = startAngle + t * (Math.PI*2);
        // Start from inner ring, end near the boundary
        const r = circularGuideRadius + t * (maxSpiralRadius - circularGuideRadius);
        const x = baseX + r * Math.cos(currentAngle);
        const y = baseY + r * Math.sin(currentAngle);
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    };

    drawSpiral(Math.PI / 4);
    drawSpiral(-Math.PI / 4);
    drawSpiral(-(3 * Math.PI) / 4);
    drawSpiral((3 * Math.PI) / 4);

    this.ctx.lineWidth = centerDotRadius * 2;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = centerDotColor;
    this.ctx.beginPath();
    this.ctx.moveTo(baseX, baseY);
    this.ctx.lineTo(knobX, knobY);
    this.ctx.stroke();

    this.ctx.fillStyle = knobFill;
    this.ctx.beginPath();
    this.ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = centerDotColor;
    this.ctx.beginPath();
    this.ctx.arc(baseX, baseY, centerDotRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  },

setNightOverlayEnabled(enabled) {
  this.state.showNightOverlay = enabled;
  // Show/hide opacity controls
  const nightOverlayOpacityControls = document.getElementById('nightOverlayOpacityControls');
  if (nightOverlayOpacityControls) {
    nightOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
},

getTimeZoneOffsetHoursForZone(date = new Date(), timeZone = null) {
  try {
    const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : null;
    if (!tz || typeof Intl === 'undefined' || !Intl.DateTimeFormat) return null;
    const d = date instanceof Date ? date : new Date(date);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      hour12: false
    }).formatToParts(d);
    const read = (type) => {
      const part = parts.find((p) => p.type === type);
      return part ? parseInt(part.value, 10) : NaN;
    };
    const year = read('year');
    const month = read('month');
    const day = read('day');
    const hour = read('hour');
    const minute = read('minute');
    const second = read('second');
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetHours = (asUtcMs - d.getTime()) / (60 * 60 * 1000);
    return Number.isFinite(offsetHours) ? offsetHours : null;
  } catch (_) {
    return null;
  }
},

getTimezoneOffsetHours(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (this.state && this.state.useLocationTimezone && this.state.locationTimezoneId) {
    const locationOffset = this.getTimeZoneOffsetHoursForZone(d, this.state.locationTimezoneId);
    if (locationOffset !== null) return locationOffset;
  }
  return d.getTimezoneOffset() / -60;
},

setUseLocationTimezone(enabled) {
  this.state.useLocationTimezone = !!enabled;
  this._sunTimesCache = null;
  if (this.autoTimeAlignState.enabled) {
    this.updateRotationToCurrentTime();
  } else {
    this.drawSpiral();
  }
  this.saveSettingsToStorage();
},

setLocationTimeZoneId(timeZoneId) {
  const normalized = (typeof timeZoneId === 'string' && timeZoneId.trim())
    ? timeZoneId.trim()
    : null;
  this.state.locationTimezoneId = normalized;
  this._sunTimesCache = null;
  if (this.state.useLocationTimezone && this.autoTimeAlignState.enabled) {
    this.updateRotationToCurrentTime();
  } else {
    this.drawSpiral();
  }
  this.saveSettingsToStorage();
},

setNightOverlayLocation(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
  LOCATION_COORDS.lat = latNum;
  LOCATION_COORDS.lng = lngNum;
  this.state.nightOverlayLat = latNum;
  this.state.nightOverlayLng = lngNum;
  this._sunTimesCache = null;
  this.drawSpiral();
  this.saveSettingsToStorage();
},

setDayOverlayEnabled(enabled) {
  this.state.showDayOverlay = enabled;
  // Show/hide opacity controls
  const dayOverlayOpacityControls = document.getElementById('dayOverlayOpacityControls');
  if (dayOverlayOpacityControls) {
    dayOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
},

setGradientOverlayEnabled(enabled) {
  this.state.showGradientOverlay = enabled;
  // Show/hide opacity controls
  const gradientOverlayOpacityControls = document.getElementById('gradientOverlayOpacityControls');
  if (gradientOverlayOpacityControls) {
    gradientOverlayOpacityControls.style.display = enabled ? 'block' : 'none';
  }
  this.drawSpiral();
  this.saveSettingsToStorage();
},

setTimeDisplayEnabled(enabled) {
  this.state.showTimeDisplay = enabled;

  if (this.timeDisplayState) {
    if (enabled) {
      this.timeDisplayState.currentHeight = CONFIG.TIME_DISPLAY_HEIGHT;
      this.timeDisplayState.targetHeight = CONFIG.TIME_DISPLAY_HEIGHT;
      this.timeDisplayState.collapsed = false;
    } else if (typeof this.resetTimeDisplayLayoutState === 'function') {
      this.resetTimeDisplayLayoutState();
    }
  }
  
  // On mobile, update the stored state for orientation changes
  if (isMobileDevice()) {
    if (enabled) {
      // User manually enabled time display - store this preference
      this.mobileOrientationState.timeDisplayWasEnabled = true;
    } else {
      // User manually disabled time display - only update stored state if not in landscape
      if (!this.mobileOrientationState.isLandscape) {
        this.mobileOrientationState.timeDisplayWasEnabled = false;
      }
    }
  }
  
  this.drawSpiral();
  this.saveSettingsToStorage();
},

setSegmentEdgesEnabled(enabled) {
  this.state.showSegmentEdges = enabled;
  this.drawSpiral();
  this.saveSettingsToStorage();
},

setArcLinesEnabled(enabled) {
  this.state.showArcLines = enabled;
  this.drawSpiral();
  this.saveSettingsToStorage();
},

getTimeDisplayRenderRect(canvasWidth = this.canvas.clientWidth, canvasHeight = this.canvas.clientHeight) {
  const timeDisplayHeight = this.getTimeDisplayHeight();
  const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const safeAreaBottom = (isIOS && pullUpOffset < 10) ? 34 : 0;

  return {
    x: 0,
    y: canvasHeight - timeDisplayHeight - pullUpOffset - safeAreaBottom,
    width: canvasWidth,
    height: timeDisplayHeight
  };
},

drawTimeDisplay(canvasWidth, canvasHeight) {
  // Helper function to get time span for a segment
  const getSegmentTimeSpan = (segment) => {
    if (!segment) return null;
    
    // Calculate the segment's time based on its position
    // The spiral counts up from outside in, so we need to account for this
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
    const hoursFromReference = segmentId;
    
    // Calculate start time for this segment
    const startTime = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour
    
    return { startTime, endTime };
  };
  
  // Determine what to display
  let displayTime, timeString, dateString;
  
  const isMobile2 = isMobileDevice();
  if (this.mouseState.hoveredSegment && !isMobile2) {
    // Show segment time span when hovering
    const timeSpan = getSegmentTimeSpan(this.mouseState.hoveredSegment);
    if (timeSpan) {
      const formatTime = (date) => this.formatUTCHHMM(date);
      
      timeString = `${formatTime(timeSpan.startTime)} - ${formatTime(timeSpan.endTime)}`;
      
      // Format date
      const weekday = WEEKDAYS_UTC[timeSpan.startTime.getUTCDay()];
      const month = MONTHS_LONG_UTC[timeSpan.startTime.getUTCMonth()];
      const day = timeSpan.startTime.getUTCDate();
      const year = timeSpan.startTime.getUTCFullYear();
      
      dateString = `${weekday}, ${month} ${day}, ${year}`;
    }
  } else if (this.mouseState.selectedSegment) {
    // Show selected segment time span when a segment is clicked
    const timeSpan = getSegmentTimeSpan(this.mouseState.selectedSegment);
    if (timeSpan) {
      const formatTime = (date) => this.formatUTCHHMM(date);
      
      timeString = `${formatTime(timeSpan.startTime)} - ${formatTime(timeSpan.endTime)}`;
      
      // Format date
      const weekday = WEEKDAYS_UTC[timeSpan.startTime.getUTCDay()];
      const month = MONTHS_LONG_UTC[timeSpan.startTime.getUTCMonth()];
      const day = timeSpan.startTime.getUTCDate();
      const year = timeSpan.startTime.getUTCFullYear();
      
      dateString = `${weekday}, ${month} ${day}, ${year}`;
    }
  } else {
    // Show normal time display (current time or spiral time)
    if (this.autoTimeAlignState.enabled) {
      // Use UTC time consistently
      const now = new Date();
      const tzOffsetHours = (typeof this.getTimezoneOffsetHours === 'function')
        ? this.getTimezoneOffsetHours(now)
        : (now.getTimezoneOffset() / -60);
      const baseUtcMs = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
      );
      displayTime = new Date(baseUtcMs + tzOffsetHours * 60 * 60 * 1000);
    } else {
      // Calculate the time corresponding to the current spiral rotation (using UTC)
      const rotationInHours = (this.state.rotation / (2 * Math.PI)) * CONFIG.SEGMENTS_PER_DAY;
      // Create UTC time based on reference time
      const utcTime = this.referenceTime.getTime() + rotationInHours * 60 * 60 * 1000;
      displayTime = new Date(utcTime);
    }
    
    // Format time and date manually using UTC methods to avoid timezone issues
    const formatUTCTime = (date) => {
      const base = this.formatUTCHHMM(date);
      const seconds = this.autoTimeAlignState.enabled ? ':' + date.getUTCSeconds().toString().padStart(2, '0') : '';
      return `${base}${seconds}`;
    };
    
    const formatUTCDate = (date) => this.formatUTCDateLong(date);
    
    timeString = formatUTCTime(displayTime);
    dateString = formatUTCDate(displayTime);
  }
  
  // Ensure timeString and dateString are always defined
  if (!timeString || !dateString) {
    // Fallback to current time if something went wrong
    const now = new Date();
    const formatTime = (date) => this.formatUTCHHMM(date);
    
    const weekday = WEEKDAYS_UTC[now.getUTCDay()];
    const month = MONTHS_LONG_UTC[now.getUTCMonth()];
    const day = now.getUTCDate();
    const year = now.getUTCFullYear();
    
    timeString = formatTime(now);
    dateString = `${weekday}, ${month} ${day}, ${year}`;
  }
  

  
  // Detect standalone mode (PWA installed on home screen)
  // In standalone mode, viewport is full screen and safe area is part of viewport
  // In browser mode, safe area needs to be accounted for differently
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                       (window.navigator && window.navigator.standalone);
  
  // Get safe area bottom for iOS to position time display correctly
  // The safe area is typically ~34px on iPhones, but env() gives us CSS pixels which account for device pixel ratio
  const appElement = document.getElementById('app');
  const appPaddingBottom = appElement ? 
    parseFloat(getComputedStyle(appElement).paddingBottom) || 0 : 0;
  
  // Detect iOS/iPhone device
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  // In standalone mode, canvas fills the full viewport (including safe area)
  // In browser mode, canvas is within #app which may have padding-bottom
  // Position time display at canvas bottom - it should be flush with viewport bottom in standalone
  // But if event list is visible, move time display up to make room for it
  const baseHeight = CONFIG.TIME_DISPLAY_HEIGHT;
  const timeDisplayRect = this.getTimeDisplayRenderRect(canvasWidth, canvasHeight);
  const timeDisplayHeight = timeDisplayRect.height;
  const minHForRender = this.timeDisplayState ? (this.timeDisplayState.collapseHeight || 12) : 12;
  const timeDisplayCollapsed = timeDisplayHeight <= (minHForRender + 0.5);
  const pullUpOffset = (this.timeDisplayState && this.timeDisplayState.pullUpOffset) ? this.timeDisplayState.pullUpOffset : 0;
  const eventListHeight = this.getEventListHeight();
  const timeDisplayY = timeDisplayRect.y;
  const timeDisplayArea = timeDisplayRect;
  
  const isHovering = this.mouseState.hoveredTimeDisplay || false;
  const isClicking = this.mouseState.clickingTimeDisplay || false;
  
  // Draw background with hover/click effects
  this.ctx.save();
  
  // Background color based on state
  let backgroundColor = 'rgba(255, 255, 255, 0.9)'; // Default normal background
  
  if (isClicking) {
    backgroundColor = 'rgba(240, 240, 240, 0.95)'; // Slightly darker when clicking
  } else if (isHovering) {
    backgroundColor = 'rgba(248, 248, 248, 0.95)'; // Slightly lighter when hovering
  }
  
  
  
  this.ctx.fillStyle = backgroundColor;
  
  // Fill the entire bottom area (no side margins)
  // In standalone mode, extend background slightly into safe area for flush appearance
  // But keep text positioning as-is to ensure visibility
  const fillHeight = isStandalone ? timeDisplayHeight : timeDisplayHeight;
  this.ctx.fillRect(0, timeDisplayY, canvasWidth, fillHeight);
  
  // Draw a small grab indicator at the top of the time display (expanded/animating state)
  if (!timeDisplayCollapsed) {
    this.ctx.save();
    const minH = (this.timeDisplayState && this.timeDisplayState.collapseHeight) ? this.timeDisplayState.collapseHeight : 12;
    const baseH = CONFIG.TIME_DISPLAY_HEIGHT;
    const progress = Math.max(0, Math.min(1, (timeDisplayHeight - minH) / Math.max(1, (baseH - minH))));
    // Collapsed center-handle reference
    const collapsedW = 16;
    const collapsedH = 3;
    // Expanded top-handle target
    const expandedW = Math.max(24, Math.min(48, timeDisplayHeight * 0.5));
    const expandedH = Math.max(1, Math.min(2, timeDisplayHeight * 0.12));
    const handleWidth = collapsedW + (expandedW - collapsedW) * progress;
    const handleHeight = collapsedH + (expandedH - collapsedH) * progress;
    const handleX = (canvasWidth - handleWidth) / 2;
    // Distance from the top morphs from half of collapsed height to a small top padding
    const topPadExpanded = 3;
    const topPadCollapsed = (minH / 2);
    const handleTopOffset = topPadCollapsed + (topPadExpanded - topPadCollapsed) * progress;
    const handleY = timeDisplayY + handleTopOffset;
    this.ctx.fillStyle = '#888';
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillRect(handleX, handleY, handleWidth, handleHeight);
    this.ctx.globalAlpha = 1.0;
    this.ctx.restore();
  }
  
  // Draw the border around the entire time display area
  const isMobile = isMobileDevice();
  if (this.mouseState.hoveredSegment && !isMobile) {
    // Check if hovering over the already selected segment
    const isHoveringOverSelected = this.mouseState.selectedSegment && 
      this.mouseState.hoveredSegment.day === this.mouseState.selectedSegment.day && 
      this.mouseState.hoveredSegment.segment === this.mouseState.selectedSegment.segment;
    
    if (isHoveringOverSelected) {
      // Hovering over selected segment - use SELECTED_SEGMENT_COLOR and SELECTED_BORDER_WIDTH
      this.ctx.strokeStyle = CONFIG.SELECTED_SEGMENT_COLOR;
      this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
    } else {
      // Hovering over different segment - use HOVER_SEGMENT_COLOR and HOVER_BORDER_WIDTH
        this.ctx.strokeStyle = CONFIG.getHoverSegmentColor();
      this.ctx.lineWidth = CONFIG.HOVER_BORDER_WIDTH;
    }
  } else if (this.mouseState.selectedSegment) {
    // Selected segment - use SELECTED_SEGMENT_COLOR and SELECTED_BORDER_WIDTH
    this.ctx.strokeStyle = CONFIG.SELECTED_SEGMENT_COLOR;
    this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
  } else if (isClicking) {
    this.ctx.strokeStyle = '#999'; // Darker border when clicking time display
    this.ctx.lineWidth = 1;
  } else if (isHovering) {
    this.ctx.strokeStyle = '#bbb'; // Slightly darker border when hovering time display
    this.ctx.lineWidth = 1;
  } else {
    this.ctx.strokeStyle = '#ccc'; // Normal border
    this.ctx.lineWidth = 1;
  }


  
  // Check if hovered segment has an event and use its color
  if (this.mouseState.hoveredSegment) {
    const eventInfo = this.getEventColorForSegment(this.mouseState.hoveredSegment.day, this.mouseState.hoveredSegment.segment);
    if (eventInfo) {
      this.ctx.strokeStyle = eventInfo.color;
    }
  }
  
  // Check if selected segment has an event and use its color
  if (this.mouseState.selectedSegment && !this.mouseState.hoveredSegment) {
    const eventInfo = this.getEventColorForSegment(this.mouseState.selectedSegment.day, this.mouseState.selectedSegment.segment);
    if (eventInfo) {
      this.ctx.strokeStyle = eventInfo.color;
    }
  }

  // just show the default border
  this.ctx.strokeStyle = '#ccc';
  this.ctx.lineWidth = 1;


  

  
  const isDefaultTimeDisplayPosition = !timeDisplayCollapsed &&
    pullUpOffset < 0.5 &&
    Math.abs(timeDisplayHeight - baseHeight) < 0.5;

  // Draw border on top and bottom of the time display only (inside edge to avoid clipping)
  const halfStrokeWidth = this.ctx.lineWidth / 2;
  // Top border
  this.ctx.beginPath();
  this.ctx.moveTo(halfStrokeWidth, timeDisplayY + halfStrokeWidth);
  this.ctx.lineTo(canvasWidth - halfStrokeWidth, timeDisplayY + halfStrokeWidth);
  this.ctx.stroke();
  // In the default resting position, keep only the top stroke.
  if (!isDefaultTimeDisplayPosition) {
    // Bottom border
    this.ctx.beginPath();
    this.ctx.moveTo(halfStrokeWidth, timeDisplayY + timeDisplayHeight - halfStrokeWidth);
    this.ctx.lineTo(canvasWidth - halfStrokeWidth, timeDisplayY + timeDisplayHeight - halfStrokeWidth);
    this.ctx.stroke();
  }
  
  // If collapsed, draw only a small grab-handle indicator and skip text
  if (timeDisplayCollapsed) {
    // Small chevron to indicate expandable bar
    this.ctx.fillStyle = '#888';
    const cx = canvasWidth / 2;
    const cy = timeDisplayY + timeDisplayHeight / 2;
    const w = 16, h = 3;
    this.ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    this.ctx.restore();
    return;
  }
  
  // Draw text
  this.ctx.fillStyle = '#333';
  this.ctx.textAlign = 'center';
  // Use middle baseline so time+date pair can be centered perfectly within the bar
  this.ctx.textBaseline = 'middle';
  
  // Time (font, with fixed-width centering)
  // Scale font size with canvas width, but only shrink below threshold
  const thresholdWidth = 400; // Fixed size above this width
  let fontSize = 24; // Default size
  if (canvasWidth < thresholdWidth) {
    // Scale down proportionally below threshold
    const scaleFactor = canvasWidth / thresholdWidth;
    fontSize = Math.max(1, scaleFactor * 24); // Scale down from 24px, minimum 1px
  }
  this.ctx.font = getFontString(fontSize);
  
  // Calculate time display center using the current (possibly animating) height
  const timeDisplayCenterY = timeDisplayY + this.getTimeDisplayHeight() / 2;
  const actualCenterY = timeDisplayCenterY;
  
  // Calculate the maximum possible time string width based on format
  let maxTimeString;
  if (this.mouseState.hoveredSegment || this.mouseState.selectedSegment) {
    // For segment time ranges, use the maximum possible range width
    maxTimeString = '23:59 - 00:00';
  } else {
    maxTimeString = this.autoTimeAlignState.enabled ? '23:59:59' : '23:59';
  }
  const maxTimeWidth = this.ctx.measureText(maxTimeString).width;
  const currentTimeWidth = this.ctx.measureText(timeString).width;
  
  // Position text based on the top of the bar (moves at same rate as the box)
  const timeX = canvasWidth / 2 - (maxTimeWidth - currentTimeWidth) / 2;
  const topY = timeDisplayY;
  // Offsets scale with height but have sensible caps
  // Compute centered Y positions with a consistent gap between time and date
  const centerYLive = timeDisplayY + timeDisplayHeight / 2;
  const gap = Math.max(16, Math.min(26, timeDisplayHeight * 0.36)); // balanced spacing
  // Slide text from below screen as the bar expands
  const minH = (this.timeDisplayState && this.timeDisplayState.collapseHeight) ? this.timeDisplayState.collapseHeight : 12;
  const baseH = CONFIG.TIME_DISPLAY_HEIGHT;
  const progress = Math.max(0, Math.min(1, (timeDisplayHeight - minH) / Math.max(1, (baseH - minH))));
  const appearOvershoot = 28; // px extra below-screen shift when nearly collapsed
  const extraBelow = (1 - progress) * appearOvershoot;
  const timeY = centerYLive - gap / 2 + extraBelow;
  this.ctx.fillText(timeString, timeX, timeY);
  
  // Date
  this.ctx.font = getFontString(fontSize);
  const dateY = centerYLive + gap / 2 + extraBelow;
  this.ctx.fillText(dateString, canvasWidth / 2, dateY);
  
  this.ctx.restore();
  
  // Update event list if visible to reflect new display time for proximity scaling
  // But skip updates when auto time align is enabled (to prevent scroll position reset every second)
  // Still update when user manually moves the spiral (checked via flag set before drawSpiral calls)
  if (!this.autoTimeAlignState.enabled || this._shouldUpdateEventList) {
    // Clear the flag after checking
    if (this._shouldUpdateEventList) {
      this._shouldUpdateEventList = false;
    }
    
    // Throttle updates to avoid excessive re-rendering (only check every 100ms)
    const now = performance.now();
    if (!this._lastEventListUpdateTime) this._lastEventListUpdateTime = 0;
    if (now - this._lastEventListUpdateTime > 100) { // Update at most every 100ms
      this._lastEventListUpdateTime = now;
      
      if (typeof window.renderEventList === 'function') {
        // Check if bottom event list is visible
        const bottomEventList = document.getElementById('bottomEventList');
        const isBottomListVisible = bottomEventList && bottomEventList.style.maxHeight && bottomEventList.style.maxHeight !== '0px';
        
        // Check if event panel is open
        const eventInputPanel = document.getElementById('eventInputPanel');
        const isEventPanelVisible = eventInputPanel && eventInputPanel.style.display !== 'none';
        
        // Update event list if either is visible
        if (isBottomListVisible || isEventPanelVisible) {
          window.renderEventList();
        }
      }
    }
  }
},

clampRotationToEventWindow() {
  if (this.state.detailViewDay !== null && this.mouseState.selectedSegment) {
    // Use the same totalVisibleSegments as everywhere else
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segment = this.mouseState.selectedSegment;
    const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY);
    const eventHour = segmentId;
    const maxRotation = ((eventHour - 23.999) / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;
    const minRotation = -1;
    if (this.state.rotation < minRotation) this.state.rotation = minRotation;
    if (this.state.rotation > maxRotation) this.state.rotation = maxRotation;
    
    // Reset scale to original spiral scale when clamping rotation in circle mode
    if (this.state.circleMode && this._originalSpiralScale !== null) {
      this.state.spiralScale = this._originalSpiralScale;
      
      // Update the UI slider
      const scaleSlider = document.getElementById('scaleSlider');
      if (scaleSlider) {
        scaleSlider.value = this.state.spiralScale;
        const scaleVal = document.getElementById('scaleVal');
        if (scaleVal) scaleVal.textContent = this.state.spiralScale.toFixed(2);
      }
    }
  }
  this.drawSpiral();
  },

  drawNightOverlays() {
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.nightOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode night overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for night overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        // Use configurable opacity for night overlay
        const nightOverlayColor = `rgba(0, 0, 0, ${this.state.nightOverlayOpacity})`;
        this.ctx.fillStyle = nightOverlayColor;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode night overlay: use adaptive band drawing
        const segmentAngleSize = overlay.rawEndAngle - overlay.rawStartAngle;
        const timeStartTheta = overlay.rawStartAngle + (1 - overlay.overlayEndFrac) * segmentAngleSize;
        const timeEndTheta = overlay.rawStartAngle + (1 - overlay.overlayStartFrac) * segmentAngleSize;
        const arcStart = Math.max(timeStartTheta, overlay.startTheta);
        const arcEnd = Math.min(timeEndTheta, overlay.endTheta);
        if (arcEnd > arcStart) {
          // Use configurable opacity for night overlay
          const nightOverlayColor = `rgba(0, 0, 0, ${this.state.nightOverlayOpacity})`;
          this.drawSpiralBand(arcStart, arcEnd, overlay.radiusFunction, nightOverlayColor);
        }
      }
    }
  },

  drawGradientOverlays() {
    if (!this.state.showGradientOverlay) return;
    
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.gradientOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode gradient overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for gradient overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        this.ctx.fillStyle = overlay.color;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode gradient overlay: use adaptive band drawing
        this.drawSpiralBand(overlay.startTheta, overlay.endTheta, overlay.radiusFunction, overlay.color);
      }
    }
  },

  drawDayOverlays() {
    // Reset context state to ensure consistent rendering
    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    
    for (const overlay of this.dayOverlays) {
      // Skip overlay if this segment is currently selected
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === overlay.day && 
          this.mouseState.selectedSegment.segment === overlay.segment) {
        continue;
      }
      
      if (overlay.isCircleMode) {
        // Circle mode day overlay
        this.ctx.save();
        this.ctx.beginPath();
        
        // Draw the ring segment path for day overlay
        const startAngle = overlay.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = overlay.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        
        // Outer arc
        this.ctx.arc(0, 0, overlay.outerRadius, startAngle, endAngle, true);
        // Radial line to inner radius
        this.ctx.lineTo(overlay.innerRadius * Math.cos(endAngle), overlay.innerRadius * Math.sin(endAngle));
        // Inner arc (reverse)
        this.ctx.arc(0, 0, overlay.innerRadius, endAngle, startAngle, false);
        // Radial line back to outer radius
        this.ctx.lineTo(overlay.outerRadius * Math.cos(startAngle), overlay.outerRadius * Math.sin(startAngle));
        this.ctx.closePath();
        
        this.ctx.fillStyle = overlay.color;
        this.ctx.fill();
        this.ctx.restore();
      } else {
        // Spiral mode day overlay: use adaptive band drawing
        this.drawSpiralBand(overlay.startTheta, overlay.endTheta, overlay.radiusFunction, overlay.color);
      }
    }
  },

  drawArcLines() {
    if (!this.state.showArcLines) return;
    
    this.ctx.strokeStyle = CONFIG.STROKE_COLOR;
    this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
    
    for (const arcLine of this.arcLines) {
      this.ctx.beginPath();
      
      if (arcLine.isCircleMode) {
        // Circle mode arc lines
        if (arcLine.isInner) {
          // Draw inner arc (counter-clockwise)
          this.ctx.arc(0, 0, arcLine.innerRadius, arcLine.startAngle, arcLine.endAngle, false);
        } else {
          // Draw outer arc (clockwise)
          this.ctx.arc(0, 0, arcLine.outerRadius, arcLine.startAngle, arcLine.endAngle, true);
        }
      } else {
        // Spiral mode arc lines
        if (arcLine.isInner) {
          // Draw inner arc
          let angle = -arcLine.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = arcLine.radiusFunction(arcLine.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          this.ctx.moveTo(x, y);
          
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (arcLine.endTheta - arcLine.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
          for (let i = 1; i <= innerSteps; i++) {
            const t = i / innerSteps;
            const rawAngle = arcLine.startTheta + t * (arcLine.endTheta - arcLine.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = arcLine.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }
        } else {
          // Draw outer arc
          let angle = -arcLine.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = arcLine.radiusFunction(arcLine.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          this.ctx.moveTo(x, y);
          
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (arcLine.endTheta - arcLine.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
          for (let i = 1; i <= innerSteps; i++) {
            const t = i / innerSteps;
            const rawAngle = arcLine.startTheta + t * (arcLine.endTheta - arcLine.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = arcLine.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }
        }
      }
      
      this.ctx.stroke();
    }
  },

  ensureAudioContext() {
    if (!this._audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        this._audioContext = new Ctx({ latencyHint: 'interactive' });
      }
    }
  },

  async loadClickBuffer() {
    try {
      this.ensureAudioContext();
      if (!this._audioContext || this._clickBuffer || this._loadingClickBufferPromise) return;
      // Skip WebAudio fetch when not served over http(s) to avoid file:// CORS errors
      try {
        if (typeof location !== 'undefined') {
          const proto = location.protocol;
          if (proto !== 'http:' && proto !== 'https:') {
            return; // fallback HTMLAudio will still work on file://
          }
        }
      } catch (_) {}
      this._loadingClickBufferPromise = (async () => {
        const response = await fetch('sounds/click.mp3');
        const arrayBuffer = await response.arrayBuffer();
        let audioBuffer;
        if (this._audioContext.decodeAudioData.length === 1) {
          audioBuffer = await this._audioContext.decodeAudioData(arrayBuffer);
        } else {
          audioBuffer = await new Promise((resolve, reject) => {
            this._audioContext.decodeAudioData(arrayBuffer, resolve, reject);
          });
        }
        this._clickBuffer = audioBuffer;
      })().catch(() => {});
      await this._loadingClickBufferPromise;
    } catch (_) {}
  },

  warmAudio() {
    try {
      this.ensureAudioContext();
      if (this._audioContext && this._audioContext.state === 'suspended') {
        this._audioContext.resume().catch(() => {});
      }
      if (!this._clickBuffer && !this._loadingClickBufferPromise) {
        this.loadClickBuffer();
      }
    } catch (_) {}
  },

  installAudioGesturePrimer() {
    const prime = () => {
      this._userHasInteracted = true;
      try { this.warmAudio(); } catch (_) {}
      window.removeEventListener('pointerdown', prime, true);
      window.removeEventListener('keydown', prime, true);
      window.removeEventListener('touchstart', prime, true);
      window.removeEventListener('click', prime, true);
      window.removeEventListener('wheel', prime, true);
      
      this.canvas.removeEventListener('pointerdown', prime, true);
      this.canvas.removeEventListener('touchstart', prime, true);
      this.canvas.removeEventListener('click', prime, true);
      this.canvas.removeEventListener('wheel', prime, true);
    };
    window.addEventListener('pointerdown', prime, true);
    window.addEventListener('keydown', prime, true);
    window.addEventListener('touchstart', prime, true);
    window.addEventListener('click', prime, true);
    window.addEventListener('wheel', prime, true);
    
    this.canvas.addEventListener('pointerdown', prime, true);
    this.canvas.addEventListener('touchstart', prime, true);
    this.canvas.addEventListener('click', prime, true);
    this.canvas.addEventListener('wheel', prime, true);
  },

  playFeedback(volume = 0.1, vibrateMs = 0) {
    // Check if audio feedback is enabled
    if (!this.state.audioFeedbackEnabled) return;
    
    // Require a user gesture for audio/vibration on some platforms
    if (!this._userHasInteracted) return;

    // Haptics
    try {
      if (vibrateMs > 0 && 'vibrate' in navigator) {
        navigator.vibrate(vibrateMs);
      }
    } catch (_) {}

    // Audio
    try {
      // Rate-limit to avoid spamming players on rapid rotations
      try {
        const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const minIntervalMs = 30;
        if (this._lastFeedbackAt && (nowTs - this._lastFeedbackAt) < minIntervalMs) {
          return;
        }
        this._lastFeedbackAt = nowTs;
      } catch (_) {}

      this.warmAudio();
      if (this._audioContext && this._clickBuffer) {
        const ctx = this._audioContext;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const source = ctx.createBufferSource();
        source.buffer = this._clickBuffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain).connect(ctx.destination);
        try { source.start(); } catch (_) {}
        return;
      }
      // Fallback HTMLAudio with a small fixed pool to avoid creating too many players
      if (!this._fallbackPool) {
        this._fallbackPool = [];
        this._fallbackPoolIndex = 0;
        for (let i = 0; i < 4; i++) {
          const el = new Audio('sounds/click.mp3');
          el.preload = 'auto';
          this._fallbackPool.push(el);
        }
      }
      let a = null;
      const n = this._fallbackPool.length;
      for (let k = 0; k < n; k++) {
        const idx = (this._fallbackPoolIndex + k) % n;
        const el = this._fallbackPool[idx];
        if (el.paused || el.ended) {
          a = el;
          this._fallbackPoolIndex = (idx + 1) % n;
          break;
        }
      }
      if (!a) {
        // All players busy; skip this tick to avoid creating more
        return;
      }
      a.volume = Math.max(0, Math.min(1, volume));
      try { a.currentTime = 0; } catch (_) {}
      a.play().catch(() => {});
    } catch (_) {}
  }
});
