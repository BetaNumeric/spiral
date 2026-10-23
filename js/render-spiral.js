// Spiral Rendering
Object.assign(SpiralCalendar.prototype, {
  drawSegment(startTheta, endTheta, radiusFunction, color, isMidnightSegment = false, isAfterMidnightSegment = false, isHovered = false, drawLeadingEdge = false, isSelected = false, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, day = null, segment = null, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false) {
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      const radialFillOverlap = (!isEventSubSegment && drawStroke && !this.state.showArcLines)
        ? Math.max(0.5, CONFIG.STROKE_WIDTH * 0.5)
        : 0;
      const getInnerFillRadius = (theta) => Math.max(0, radiusFunction(theta) - radialFillOverlap);
      const getOuterFillRadius = (theta) => Math.max(0, radiusFunction(theta) + radialFillOverlap);
      
      let angle = -startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      let radius = getInnerFillRadius(startTheta);
      let x = radius * Math.cos(angle);
      let y = radius * Math.sin(angle);
      
    // Draw the full segment path for fill
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (endTheta - startTheta) / segmentAngle);
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
        const rawAngle = startTheta + t * (endTheta - startTheta);
        angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
        radius = getInnerFillRadius(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      // Draw radial line outwards (one full turn)
      const outerEnd = endTheta + 2 * Math.PI;
      angle = -outerEnd + CONFIG.INITIAL_ROTATION_OFFSET;
      radius = getOuterFillRadius(outerEnd);
      this.ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
      // Draw outer arc back to start edge
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
        const rawAngle = outerEnd - t * (endTheta - startTheta);
        angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
        radius = getOuterFillRadius(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      if (drawLeadingEdge) {
        this.ctx.closePath();
      }
      // Fill the segment (works for both open and closed paths)
      this.ctx.fillStyle = !isEventSubSegment && color === CONFIG.BLANK_COLOR
        ? getCanvasTheme(this.state.darkMode).clock : color;
      this.ctx.fill();
      


    // Draw straight edge lines (radial lines)
    // Always draw for event sub-segments; for normal segments respect showSegmentEdges
    if (isEventSubSegment || (drawStroke && this.state.showSegmentEdges)) {
        this.ctx.beginPath();
        // Draw start radial line
        let angle = -startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        let innerRadius = radiusFunction(startTheta);
        let outerRadius = radiusFunction(startTheta + 2 * Math.PI);
        let x1 = innerRadius * Math.cos(angle);
        let y1 = innerRadius * Math.sin(angle);
        let x2 = outerRadius * Math.cos(angle);
        let y2 = outerRadius * Math.sin(angle);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        
        // Draw end radial line
        angle = -endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        innerRadius = radiusFunction(endTheta);
        outerRadius = radiusFunction(endTheta + 2 * Math.PI);
        x1 = innerRadius * Math.cos(angle);
        y1 = innerRadius * Math.sin(angle);
        x2 = outerRadius * Math.cos(angle);
        y2 = outerRadius * Math.sin(angle);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        
        this.ctx.strokeStyle = isEventSubSegment ? color : getCanvasTheme(this.state.darkMode).stroke;
        this.ctx.lineWidth = isEventSubSegment ? CONFIG.EVENT_EDGE_STROKE_WIDTH : CONFIG.STROKE_WIDTH;
        
        this.ctx.stroke();
      }

          // Store arc line data for drawing later (to avoid gaps with event-colored edge lines)
      if (drawStroke && this.state.showArcLines) {
        // Store inner arc data - skip for event sub-segments
        if (!isEventSubSegment) {
          this.arcLines.push({
            startTheta: startTheta,
            endTheta: endTheta,
            radiusFunction: radiusFunction,
            isInner: true
          });
        }
        
        // Store outer arc data - ensure it's drawn for all segments including outermost
        this.arcLines.push({
          startTheta: startTheta + 2 * Math.PI,
          endTheta: endTheta + 2 * Math.PI,
          radiusFunction: radiusFunction,
          isInner: false
        });
      }

    // Handle hover and selection effects
        if (isHovered) {
          const highlight = this.getClockSegmentThetaRange(this.mouseState.hoveredSegment, rawStartAngle ?? startTheta, rawEndAngle ?? endTheta);
        this.highlightedSegments.push({
            startTheta: Math.max(startTheta, highlight.startTheta),
            endTheta: Math.min(endTheta, highlight.endTheta),
            radiusFunction: radiusFunction,
            isHovered: true,
            isSelected: false,
            drawLeadingEdge: drawLeadingEdge,
            segmentAngle: segmentAngle
          });
      }
      
      // Store midnight line info for drawing later (only when segment is fully visible)
      if (isMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && startTheta === rawStartAngle && endTheta === rawEndAngle) {
        // Midnight segment (23:00-0:00) - trailing edge
        this.midnightLines.push({
          endTheta: endTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: false
        });
      }
      
      if (isAfterMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && startTheta === rawStartAngle && endTheta === rawEndAngle) {
        // After midnight segment (0:00-1:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true
        });
      }

      // Store noon line info for drawing later (when segment is at least partially visible)
      if (isNoonSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // Noon segment (12:00-13:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isNoonLine: true
        });
      }

      // Store 6:00 AM line info for drawing later (when segment is at least partially visible)
      if (isSixAMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 6:00 AM segment (6:00-7:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isSixAMLine: true
        });
      }

      // Store 18:00 (6:00 PM) line info for drawing later (when segment is at least partially visible)
      if (isSixPMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 18:00 segment (18:00-19:00) - leading edge
        this.midnightLines.push({
          startTheta: startTheta,
          radiusFunction: radiusFunction,
          isLeadingEdge: true,
          isSixPMLine: true
        });
      }

      // Store month line info for drawing later (when segment represents 1st day of month and is at least partially visible)
      if (isFirstDayOfMonth && rawStartAngle !== null && rawEndAngle !== null) {
        // For month boundaries, we want to draw the outer arc of all segments of the 1st day
        // Store the month line as long as the segment is at least partially visible
        this.monthLines.push({
          startTheta: startTheta,
          endTheta: endTheta,
          radiusFunction: radiusFunction
        });
      }

      // Store selected highlight for drawing later
      if (isSelected) {
        // Get event info for this segment
        const eventInfo = day !== null && segment !== null ? this.getEventColorForSegment(day, segment) : null;
        
        const highlight = this.getClockSegmentThetaRange(this.mouseState.selectedSegment, rawStartAngle ?? startTheta, rawEndAngle ?? endTheta);
        this.highlightedSegments.push({
          startTheta: Math.max(startTheta, highlight.startTheta),
          endTheta: Math.min(endTheta, highlight.endTheta),
          radiusFunction: radiusFunction,
          isHovered: false,
          isSelected: true,
          drawLeadingEdge: drawLeadingEdge,
          segmentAngle: segmentAngle,
          eventInfo: eventInfo,
          segmentColor: color,
          day: day,
          segment: segment
        });
      }
    },

  getSteppedGradientOverlayOpacity(day, segment, radiusFunction, maxRadius, hourStep = 6) {
      const safeMaxRadius = Math.max(1e-6, maxRadius);
      const stepSize = Math.max(1, Math.min(CONFIG.SEGMENTS_PER_DAY, hourStep));
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      const blockStartSegment = Math.floor(segment / stepSize) * stepSize;
      const blockCenterTheta = day * 2 * Math.PI + (blockStartSegment + stepSize * 0.5) * segmentAngle;
      const innerRadius = radiusFunction(blockCenterTheta);
      const outerRadius = radiusFunction(blockCenterTheta + 2 * Math.PI);
      const avgRadius = (innerRadius + outerRadius) / 2;
      const normalizedRadius = Math.max(0, Math.min(1, 1 - (avgRadius / safeMaxRadius)));
      return normalizedRadius * this.state.gradientOverlayOpacity;
  },

  adaptiveThetaSamples(startTheta, endTheta, radiusFunction, tolPx = 0.75, maxDepth = 10) {
      // Convert a theta to outer Cartesian point (use outer curve for curvature test)
      const thetaToOuterPoint = (th) => {
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
      };

      const samples = [startTheta];
      const stack = [{ th0: startTheta, th1: endTheta, depth: 0,
        p0: thetaToOuterPoint(startTheta), p1: thetaToOuterPoint(endTheta) }];

      // Distance from point P to segment AB
      const pointToSegDist = (px, py, ax, ay, bx, by) => {
        const abx = bx - ax, aby = by - ay;
        const apx = px - ax, apy = py - ay;
        const abLen2 = abx * abx + aby * aby;
        const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
        const qx = ax + t * abx, qy = ay + t * aby;
        const dx = px - qx, dy = py - qy;
        return Math.hypot(dx, dy);
      };

      while (stack.length) {
        const { th0, th1, depth, p0, p1 } = stack.pop();
        const thMid = 0.5 * (th0 + th1);
        const pm = thetaToOuterPoint(thMid);
        const err = pointToSegDist(pm.x, pm.y, p0.x, p0.y, p1.x, p1.y);
        if (err > tolPx && depth < maxDepth) {
          // Subdivide
          const pMid0 = thetaToOuterPoint(0.5 * (th0 + thMid)); // hint not used
          // Push second half then first half so that first half is processed first (stack LIFO)
          stack.push({ th0: thMid, th1, depth: depth + 1, p0: pm, p1 });
          stack.push({ th0, th1: thMid, depth: depth + 1, p0, p1: pm });
        } else {
          // Accept segment end
          samples.push(th1);
        }
      }
      // Ensure strict monotonic increase and dedupe
      samples.sort((a, b) => a - b);
      const dedup = [];
      for (let i = 0; i < samples.length; i++) {
        if (i === 0 || Math.abs(samples[i] - samples[i - 1]) > 1e-9) dedup.push(samples[i]);
      }
      return dedup;
  },

  traceSpiralBandPath(startTheta, endTheta, radiusFunction, minAvgThicknessPx = 0.6, tolPx = 0.75) {
      if (endTheta <= startTheta) return false;
      const thetas = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, tolPx, 10);
      if (thetas.length < 2) return false;

      // Average thickness check to avoid drawing near-zero-width slivers
      let avgThick = 0;
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        avgThick += (outer - inner);
      }
      avgThick /= thetas.length;
      if (avgThick < minAvgThicknessPx) return false;

      // Inner edge forward
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const r = radiusFunction(th);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = r * Math.cos(ang);
        const y = r * Math.sin(ang);
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }

      // Connect to outer edge at the end
      {
        const th = thetas[thetas.length - 1];
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }

      // Outer edge backward
      for (let i = thetas.length - 2; i >= 0; i--) {
        const th = thetas[i];
        const r = radiusFunction(th + 2 * Math.PI);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }

      // Close along the start radial
      {
        const th = thetas[0];
        const r = radiusFunction(th);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        this.ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }
      this.ctx.closePath();
      return true;
  },

  drawSpiralBand(startTheta, endTheta, radiusFunction, fillStyle, minAvgThicknessPx = 0.6, tolPx = 0.75) {
      if (endTheta <= startTheta) return;
      // Semi-transparent bands need tighter sampling, but the main seam reduction
      // comes from combining fills where possible before they reach this helper.
      const isSemiTransparent = typeof fillStyle === 'string' && fillStyle.includes('rgba');
      const effectiveTolPx = isSemiTransparent ? Math.min(tolPx, 0.1) : tolPx;

      this.ctx.save();
      this.ctx.beginPath();
      if (!this.traceSpiralBandPath(startTheta, endTheta, radiusFunction, minAvgThicknessPx, effectiveTolPx)) {
        this.ctx.restore();
        return;
      }
      this.ctx.fillStyle = fillStyle;
      this.ctx.fill();
      this.ctx.restore();
  },

    getEventSpiralSamples(startTheta, endTheta, radiusFunction) {
      const cache = this._eventSpiralSamples;
      let starts = cache?.get(radiusFunction);
      if (cache && !starts) cache.set(radiusFunction, starts = new Map());
      let ends = starts?.get(startTheta);
      if (starts && !ends) starts.set(startTheta, ends = new Map());
      if (ends?.has(endTheta)) return ends.get(endTheta);
      const samples = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, 0.1, 10).map(th => {
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        return { th, ang, inner: radiusFunction(th), outer: radiusFunction(th + 2 * Math.PI),
          cos: Math.cos(ang), sin: Math.sin(ang) };
      });
      ends?.set(endTheta, samples);
      return samples;
    },

    drawEventSpiralSubsegment(eventSegment, lineCap = this.ctx.lineCap) {
      const startTheta = eventSegment.timeStartTheta;
      const endTheta = eventSegment.timeEndTheta;
      const color = eventSegment.color;
      const eventSliceStart = eventSegment.eventSliceStart;
      const eventSliceEnd = eventSegment.eventSliceEnd;
      const radiusFunction = eventSegment.originalRadiusFunction;

      // Overlapping pieces share the same curve samples for this frame.
      const curve = this.getEventSpiralSamples(startTheta, endTheta, radiusFunction);
      // If average thickness is less than ~0.6px, skip drawing
      let avgThick = 0;
      for (const point of curve) avgThick += (point.outer - point.inner) * (eventSliceEnd - eventSliceStart);
      avgThick /= Math.max(1, curve.length);
      if (avgThick < 0.6) {
        return;
      }

      const edgeSliceStart = (eventSegment.edgeSliceStart !== undefined) ? eventSegment.edgeSliceStart : eventSliceStart;
      const edgeSliceEnd = (eventSegment.edgeSliceEnd !== undefined) ? eventSegment.edgeSliceEnd : eventSliceEnd;
      const samples = [];
      for (const { th, ang, inner, outer, cos, sin } of curve) {
        const { inner: rInner, outer: rOuter } = SpiralGeometry.radialRange(inner, outer, eventSliceStart, eventSliceEnd);
        const { inner: edgeInner, outer: edgeOuter } = SpiralGeometry.radialRange(inner, outer, edgeSliceStart, edgeSliceEnd);
        samples.push({ th, ang, cos, sin, rInner, rOuter, edgeInner, edgeOuter });
      }

      // Build path: inner curve forward, connect to outer end, outer curve backward, connect back
      this.ctx.beginPath();
      this.ctx.moveTo(samples[0].rInner * samples[0].cos, samples[0].rInner * samples[0].sin);
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        this.ctx.lineTo(s.rInner * s.cos, s.rInner * s.sin);
      }
      const last = samples[samples.length - 1];
      // connect via short radial edge at the end
      this.ctx.lineTo(last.rOuter * last.cos, last.rOuter * last.sin);
      for (let i = samples.length - 2; i >= 0; i--) {
        const s = samples[i];
        this.ctx.lineTo(s.rOuter * s.cos, s.rOuter * s.sin);
      }
      // close along start radial to ensure no gaps
      const first = samples[0];
      this.ctx.lineTo(first.rInner * first.cos, first.rInner * first.sin);
      this.ctx.closePath();

      // Fill with high resolution sampling (no stroke needed - same method as overlays)
      this.ctx.fillStyle = color;
      this.ctx.fill();
      this.ctx.lineCap = lineCap;
      if (this.state.showEventBoundaryStrokes && this.state.showAllEventBoundaryStrokes && !this.state.showArcLines) {
        this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
        this.ctx.strokeStyle = getCanvasTheme(this.state.darkMode).eventSeparator;
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rInner * samples[0].cos, samples[0].rInner * samples[0].sin);
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rInner * s.cos, s.rInner * s.sin);
        }
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rOuter * samples[0].cos, samples[0].rOuter * samples[0].sin);
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rOuter * s.cos, s.rOuter * s.sin);
        }
        this.ctx.stroke();
      }
      if (this.state.showEventBoundaryStrokes && eventSegment.dividerStroke) {
        this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
        this.ctx.strokeStyle = getCanvasTheme(this.state.darkMode).eventSeparator;
        this.ctx.lineCap = 'square';
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rInner * samples[0].cos, samples[0].rInner * samples[0].sin);
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rInner * s.cos, s.rInner * s.sin);
        }
        this.ctx.stroke();
      }
      const shouldCoverStartEdge = !!eventSegment.coverStartEdge;
      const shouldCoverEndEdge = !!eventSegment.coverEndEdge;
      if (shouldCoverStartEdge || shouldCoverEndEdge) {
        // Keep continuing event pieces visually closed where the layout changes
        // across hour joins or overlap transitions.
        this.ctx.lineCap = lineCap;
        this.ctx.lineWidth = CONFIG.EVENT_EDGE_STROKE_WIDTH;
        this.ctx.strokeStyle = color;
        if (shouldCoverEndEdge) {
          this.ctx.beginPath();
          this.ctx.moveTo(last.edgeInner * last.cos, last.edgeInner * last.sin);
          this.ctx.lineTo(last.edgeOuter * last.cos, last.edgeOuter * last.sin);
          this.ctx.stroke();
        }
        if (shouldCoverStartEdge) {
          this.ctx.beginPath();
          this.ctx.moveTo(first.edgeInner * first.cos, first.edgeInner * first.sin);
          this.ctx.lineTo(first.edgeOuter * first.cos, first.edgeOuter * first.sin);
          this.ctx.stroke();
        }
      }

      // Defer thin black event boundary edges until after all event fills so
      // later slices do not paint over them.
      const shouldDrawStartEdge = !!eventSegment.drawStartEdge;
      const shouldDrawEndEdge = !!eventSegment.drawEndEdge;
      if (this.state.showEventBoundaryStrokes && (shouldDrawStartEdge || shouldDrawEndEdge)) {
        if (shouldDrawEndEdge) {
          this.queuePendingSpiralOverlapEdge(
            last.edgeInner * last.cos,
            last.edgeInner * last.sin,
            last.edgeOuter * last.cos,
            last.edgeOuter * last.sin
          );
        }
        if (shouldDrawStartEdge) {
          this.queuePendingSpiralOverlapEdge(
            first.edgeInner * first.cos,
            first.edgeInner * first.sin,
            first.edgeOuter * first.cos,
            first.edgeOuter * first.sin
          );
        }
      }
    },

    queuePendingSpiralOverlapEdge(x1, y1, x2, y2) {
      this._pendingSpiralOverlapEdges = this._pendingSpiralOverlapEdges || [];
      this._pendingSpiralOverlapEdgeKeys = this._pendingSpiralOverlapEdgeKeys || new Set();
      const key = [x1, y1, x2, y2].map(v => Math.round(v * 1000) / 1000).join(':');
      if (this._pendingSpiralOverlapEdgeKeys.has(key)) return;
      this._pendingSpiralOverlapEdgeKeys.add(key);
      this._pendingSpiralOverlapEdges.push({ x1, y1, x2, y2 });
    },

    drawPendingSpiralOverlapEdges() {
      if (!this.state.showEventBoundaryStrokes) {
        this._pendingSpiralOverlapEdges = [];
        this._pendingSpiralOverlapEdgeKeys = null;
        return;
      }
      if (!this._pendingSpiralOverlapEdges || this._pendingSpiralOverlapEdges.length === 0) return;
      this.ctx.save();
      this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
      this.ctx.strokeStyle = getCanvasTheme(this.state.darkMode).eventSeparator;
      this.ctx.lineCap = 'square';
      for (const edge of this._pendingSpiralOverlapEdges) {
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const length = Math.hypot(dx, dy) || 1;
        const extend = Math.max(0.75, CONFIG.STROKE_WIDTH * 0.75);
        const ux = dx / length;
        const uy = dy / length;
        this.ctx.beginPath();
        this.ctx.moveTo(edge.x1 - ux * extend, edge.y1 - uy * extend);
        this.ctx.lineTo(edge.x2 + ux * extend, edge.y2 + uy * extend);
        this.ctx.stroke();
      }
      this.ctx.restore();
      this._pendingSpiralOverlapEdges = [];
      this._pendingSpiralOverlapEdgeKeys = null;
    },

    drawDetailViewChevronButton(centerX, centerY, size, direction, isHover) {
      const hitRadius = size * 0.75;
      const strokeWidth = Math.max(0.1, size * 0.05);
      const halfHeight = size * 0.2;
      const halfWidth = size * 0.12;

      this.ctx.save();
      const theme = getCanvasTheme(this.state.darkMode);
      this.ctx.strokeStyle = isHover ? theme.chevronHover : theme.chevron;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      if (direction < 0) {
        this.ctx.moveTo(centerX + halfWidth, centerY - halfHeight);
        this.ctx.lineTo(centerX - halfWidth, centerY);
        this.ctx.lineTo(centerX + halfWidth, centerY + halfHeight);
      } else {
        this.ctx.moveTo(centerX - halfWidth, centerY - halfHeight);
        this.ctx.lineTo(centerX + halfWidth, centerY);
        this.ctx.lineTo(centerX - halfWidth, centerY + halfHeight);
      }
      this.ctx.stroke();
      this.ctx.restore();

      return {
        x: centerX - hitRadius,
        y: centerY - hitRadius,
        width: hitRadius * 2,
        height: hitRadius * 2
      };
    },

    drawDetailView(maxRadius, options = {}) {
      const detailLayout = this.getDetailViewLayout(maxRadius);
      const {
        centerX,
        centerY,
        outerRadius,
        circleRadius,
        baseFontSize,
        smallFontSize,
        titleFontSize,
        edgePadding,
        counterY,
        titleY,
        dateTimeY,
        descriptionTop,
        descriptionBottom,
        descriptionY,
        maxDescriptionHeight,
        buttonY
      } = detailLayout;
      const entranceProgress = Number.isFinite(options.entranceProgress)
        ? Math.max(0, Math.min(1, options.entranceProgress))
        : 1;
      const isPreview = !!options.preview && entranceProgress < 0.999;
      const allowInteraction = !isPreview;
      const panelScale = isPreview ? Math.max(0.001, entranceProgress) : 1;

      // Clear previous button info to prevent stale references
      this.deleteButtonInfo = null;
      this.addButtonInfo = null;
      this.canvasClickAreas.closeDetailButton = null;
      this.canvasClickAreas.prevEventChevron = null;
      this.canvasClickAreas.nextEventChevron = null;
      this.canvasClickAreas.colorRing = null;
      this.canvasClickAreas.startDateBox = null;
      this.canvasClickAreas.endDateBox = null;
      this.canvasClickAreas.calendarBox = null;
      this.titleClickArea = null;
      this.descClickArea = null;

      this.ctx.save();
      if (isPreview) {
        this.ctx.translate(centerX, centerY);
        this.ctx.scale(panelScale, panelScale);
        this.ctx.translate(-centerX, -centerY);
      }

      const detailEventState = this.mouseState.selectedSegment
        ? this.getDetailViewEventState({ ensureDraft: true })
        : null;

      // Draw the colored outer ring and inner surface first (before content)
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        const outerRingColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);

        this.mouseState.selectedSegment.calculatedColor = outerRingColor;

        this.ctx.fillStyle = outerRingColor;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        this.ctx.fill();

        this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).surface;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
        this.ctx.fill();

        if (allowInteraction) {
          this.canvasClickAreas.colorRing = {
            centerX: centerX,
            centerY: centerY,
            outerRadius: outerRadius,
            innerRadius: circleRadius,
            event: detailEventState ? detailEventState.detailEvent : null
          };
        }
      } else {
        this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).surface;
        this.ctx.strokeStyle = getCanvasTheme(this.state.darkMode).stroke;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
      }

      if (this.mouseState.selectedSegment) {
        if (!detailEventState || !detailEventState.detailEvent) {
          this.ctx.restore();
          return;
        }

        const {
          selectedEventCount,
          activeEventIndex,
          detailEvent,
          isDraftEventActive,
          selectedSegment: detailSelectedSegment
        } = detailEventState;

        this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).text;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const smallLineHeight = smallFontSize;

        if (allowInteraction && this.state.detailViewCloseButtonEnabled !== false) {
          const closeGlyphSize = Math.max(12, smallFontSize);
          const closeMidRadius = (outerRadius + circleRadius) / 2;
          const segmentAngle = (2 * Math.PI) / CONFIG.SEGMENTS_PER_DAY;
          const canvasRotation = this.state.staticMode ? Math.PI : -this.state.rotation;
          const alignCloseButtonToSegment =
            !!this.state.detailViewCloseButtonAlignToSegment &&
            Number.isFinite(detailSelectedSegment?.segment);
          const closeArcStart = alignCloseButtonToSegment
            ? canvasRotation + CONFIG.INITIAL_ROTATION_OFFSET - ((detailSelectedSegment.segment + 1) * segmentAngle)
            : -Math.PI / 2 - segmentAngle / 2;
          const closeArcEnd = alignCloseButtonToSegment
            ? canvasRotation + CONFIG.INITIAL_ROTATION_OFFSET - (detailSelectedSegment.segment * segmentAngle)
            : -Math.PI / 2 + segmentAngle / 2;
          const closeCenterAngle = (closeArcStart + closeArcEnd) / 2;
          const closeCenterX = centerX + Math.cos(closeCenterAngle) * closeMidRadius;
          const closeCenterY = centerY + Math.sin(closeCenterAngle) * closeMidRadius;
          const closeArea = {
            hitType: 'ringSector',
            centerX,
            centerY,
            innerRadius: circleRadius,
            outerRadius,
            startAngle: closeArcStart,
            endAngle: closeArcEnd
          };
          const isHoverClose = this.mouseState.hoveredDetailElement === 'closeButton';

          this.canvasClickAreas.closeDetailButton = closeArea;

          this.ctx.fillStyle = isHoverClose ? 'rgba(0, 0, 0, 0.24)' : 'rgba(0, 0, 0, 0.14)';
          this.ctx.beginPath();
          this.ctx.arc(centerX, centerY, outerRadius, closeArcStart, closeArcEnd);
          this.ctx.arc(centerX, centerY, circleRadius, closeArcEnd, closeArcStart, true);
          this.ctx.closePath();
          this.ctx.fill();

          const closeCrossHalfSize = closeGlyphSize * 0.28;
          this.ctx.strokeStyle = this.state.darkMode ? getContrastingCanvasText(detailSelectedSegment.calculatedColor) :
            (isHoverClose ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.88)');
          this.ctx.save();
          this.ctx.translate(closeCenterX, closeCenterY);
          this.ctx.rotate(closeCenterAngle + Math.PI / 2);
          this.ctx.lineWidth = Math.max(1.4, closeGlyphSize * 0.12);
          this.ctx.lineCap = 'round';
          this.ctx.beginPath();
          this.ctx.moveTo(-closeCrossHalfSize, -closeCrossHalfSize);
          this.ctx.lineTo(closeCrossHalfSize, closeCrossHalfSize);
          this.ctx.moveTo(closeCrossHalfSize, -closeCrossHalfSize);
          this.ctx.lineTo(-closeCrossHalfSize, closeCrossHalfSize);
          this.ctx.stroke();
          this.ctx.restore();
        }

        if (!isDraftEventActive && selectedEventCount > 1) {
          const selectedInterval = detailEventState.activeDisplayInterval;
          const offsetLabel = selectedInterval?.offsetMs != null && this.getEventProjection(detailEvent).intervals.length > 1
            ? ` (${this.formatEventOffset(selectedInterval.offsetMs)})` : '';
          const eventsInHour = [...new Set(detailEventState.segmentEventEntries.map(entry => entry.event))];
          const counter = eventsInHour.length === 1 ? `Part ${activeEventIndex + 1} of ${selectedEventCount}`
            : `Event ${eventsInHour.indexOf(detailEvent) + 1} of ${eventsInHour.length}`;
          const eventCounterText = `${counter}${offsetLabel}`;
          this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).muted;
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';

          const counterWidth = this.ctx.measureText(eventCounterText).width;
          const chevronSize = Math.max(1, smallFontSize * 1.45);
          const chevronGap = chevronSize * 0.8;
          const prevChevronX = centerX - counterWidth / 2 - chevronGap;
          const nextChevronX = centerX + counterWidth / 2 + chevronGap;
          const prevChevronArea = this.drawDetailViewChevronButton(
            prevChevronX,
            counterY,
            chevronSize,
            -1,
            allowInteraction && this.mouseState.hoveredDetailElement === 'prevEventChevron'
          );
          const nextChevronArea = this.drawDetailViewChevronButton(
            nextChevronX,
            counterY,
            chevronSize,
            1,
            allowInteraction && this.mouseState.hoveredDetailElement === 'nextEventChevron'
          );

          if (allowInteraction) {
            this.canvasClickAreas.prevEventChevron = prevChevronArea;
            this.canvasClickAreas.nextEventChevron = nextChevronArea;
          }

          this.ctx.fillText(eventCounterText, centerX, counterY);
        }

        const displayTitle = isDraftEventActive ? (detailEvent.title || 'Click to add title...') : detailEvent.title;
        const color = isDraftEventActive && !detailEvent.title
          ? getCanvasTheme(this.state.darkMode).placeholder : getCanvasTheme(this.state.darkMode).text;
        const { width: fittedWidth, height: fittedHeight, fontSizeUsed, maxTitleWidth } = this.measureTitleFitted(displayTitle, circleRadius, titleFontSize, true);
        const titleBoxWidth = Math.min(maxTitleWidth, fittedWidth) + baseFontSize * 0.9;
        const titleBoxHeight = Math.max(fontSizeUsed * 1.7, baseFontSize * 1.7);
        if (allowInteraction) {
          this.titleClickArea = {
            x: centerX - titleBoxWidth / 2,
            y: titleY - titleBoxHeight / 2,
            width: titleBoxWidth,
            height: titleBoxHeight,
            event: detailEvent,
            centerY: titleY,
            fontSizeUsed,
            textWidth: fittedWidth,
            textHeight: fittedHeight,
            maxTextWidth: maxTitleWidth
          };
        }
        if (!this.hideTitleWhileEditing) {
          this.drawTitleFitted(displayTitle, centerX, titleY, circleRadius, titleFontSize, color, true);
        }

        const maxWidth = circleRadius * 1.6;
        this.drawDateTimeAndColorBoxes(detailEvent, centerX, dateTimeY, baseFontSize, circleRadius, buttonY, {
          interactive: allowInteraction
        });

        if (allowInteraction) {
          this.descClickArea = {
            ...this.buildDescriptionClickArea(centerX, descriptionTop, descriptionBottom, circleRadius),
            event: detailEvent,
            centerY: descriptionY
          };
        }

        if (!this.hideDescriptionWhileEditing) {
          this.ctx.font = getFontString(smallFontSize);
          if (detailEvent.description) {
            this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).text;
            const wrappedText = this.wrapText(detailEvent.description, maxWidth);
            const maxDescriptionLines = Math.max(1, Math.floor(maxDescriptionHeight / smallLineHeight));
            const visibleLines = wrappedText.slice(0, maxDescriptionLines);
            if (wrappedText.length > maxDescriptionLines && visibleLines.length > 0) {
              let lastLine = visibleLines[visibleLines.length - 1];
              while (lastLine.length > 1 && this.ctx.measureText(`${lastLine}...`).width > maxWidth) {
                lastLine = lastLine.slice(0, -1);
              }
              visibleLines[visibleLines.length - 1] = `${lastLine}...`;
            }
            const renderedTextHeight = visibleLines.length * smallLineHeight;
            let lineY = descriptionY - renderedTextHeight / 2 + smallLineHeight / 2;
            for (const line of visibleLines) {
              this.ctx.fillText(line, centerX, lineY);
              lineY += smallLineHeight;
            }
          } else {
            this.ctx.fillStyle = getCanvasTheme(this.state.darkMode).placeholder;
            this.ctx.fillText('Click to add description...', centerX, descriptionY);
          }
        }

        if (allowInteraction && this.descClickArea) {
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.00)';
          this.ctx.fillRect(this.descClickArea.x, this.descClickArea.y, this.descClickArea.width, this.descClickArea.height);
          this.updateActiveTitleEditorLayout(detailLayout);
          this.updateActiveDescriptionEditorLayout(detailLayout);
        }

        if (isDraftEventActive) {
          const buttonWidth = baseFontSize * 5.5;
          const buttonHeight = baseFontSize * 2.5;
          const buttonRadius = buttonHeight / 2;
          const buttonX = centerX - buttonWidth / 2;
          const deleteButtonY = buttonY - buttonHeight / 2;
          if (allowInteraction) {
            this.deleteButtonInfo = {
              x: buttonX,
              y: deleteButtonY,
              width: buttonWidth,
              height: buttonHeight,
              event: detailEvent,
              isAddButton: true
            };
          }
          const isHoverButton = allowInteraction &&
            this.mouseState.lastMouseX &&
            this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: buttonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverButton ? getCanvasTheme(this.state.darkMode).addHover : getCanvasTheme(this.state.darkMode).add;
          this.ctx.beginPath();
          this.ctx.roundRect(buttonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('Add Event', centerX, deleteButtonY + buttonHeight / 2);
        } else {
          const buttonWidth = baseFontSize * 4.5;
          const buttonHeight = baseFontSize * 2.2;
          const buttonRadius = buttonHeight / 2;
          const buttonSpacing = baseFontSize * 0.4;
          const totalButtonWidth = (buttonWidth * 2) + buttonSpacing;
          const buttonsStartX = centerX - totalButtonWidth / 2;
          const deleteButtonY = buttonY - buttonHeight / 2;
          const addButtonX = buttonsStartX;
          if (allowInteraction) {
            this.addButtonInfo = {
              x: addButtonX,
              y: deleteButtonY,
              width: buttonWidth,
              height: buttonHeight,
              event: detailEvent,
              isAddButton: true,
              isAddAnotherButton: true
            };
          }
          const isHoverAdd = allowInteraction &&
            this.mouseState.lastMouseX &&
            this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: addButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          const buttonText = this._detailViewHasChanges ? 'Done' : '+ New';
          this.ctx.fillStyle = isHoverAdd ? getCanvasTheme(this.state.darkMode).neutralHover : getCanvasTheme(this.state.darkMode).neutral;
          this.ctx.beginPath();
          this.ctx.roundRect(addButtonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(buttonText, addButtonX + buttonWidth / 2, deleteButtonY + buttonHeight / 2);

          const deleteButtonX = buttonsStartX + buttonWidth + buttonSpacing;
          if (allowInteraction) {
            this.deleteButtonInfo = {
              x: deleteButtonX,
              y: deleteButtonY,
              width: buttonWidth,
              height: buttonHeight,
              event: detailEvent
            };
          }
          const isHoverDelete = allowInteraction &&
            this.mouseState.lastMouseX &&
            this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: deleteButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverDelete ? getCanvasTheme(this.state.darkMode).dangerHover : getCanvasTheme(this.state.darkMode).danger;
          this.ctx.beginPath();
          this.ctx.roundRect(deleteButtonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('Delete', deleteButtonX + buttonWidth / 2, deleteButtonY + buttonHeight / 2);
        }
      }

      this.ctx.restore();
    },

    drawSpiral() {
      // Resolve the device zone once per frame, then refresh it on the next draw.
      const previousZone = this._renderTimeZone;
      this._renderTimeZone = this.getCalendarTimeZone();
      try {
        this.drawSpiralFrame();
      } finally {
        this._renderTimeZone = previousZone;
      }
    },

    drawSpiralFrame() {
      this.refreshStoredEventsIfIdle();
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const startup = this.startupAnimationState;
      const renderCircleMode = this.getRenderCircleMode();
      const useStartupDrawIn = !!(startup && startup.active && !renderCircleMode);
      let startupHourRevealCount = 24;
      let startupHourRevealOriginTheta = -this.state.rotation;
      const startupRevealedHourSegmentKeys = (startup && Array.isArray(startup.revealedHourSegmentKeys))
        ? startup.revealedHourSegmentKeys
        : null;
      const eventBoundaryLookup = this.createVisibleEventBoundaryLookup();
      
      // Clear and prepare canvas
      this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

              // Rotation milestone feedback (every full 360° / 2π radians)
        {
          const turns = this.state.rotation / (2 * Math.PI); //360°
          const quarter_turns = this.state.rotation / (Math.PI / 2); // 90°
          const segments = this.state.rotation / (Math.PI / 12); // 15
          if (this._lastRotationTurns === undefined) {
            this._lastRotationTurns = turns;
            this._lastRotationQuarterTurns = quarter_turns;
            this._lastRotationSegments = segments;
          } else {
            let crossings = 0;
            if (turns > this._lastRotationTurns) {
              crossings = Math.floor(turns) - Math.floor(this._lastRotationTurns);
            } else if (turns < this._lastRotationTurns) {
              crossings = Math.abs(Math.ceil(turns) - Math.ceil(this._lastRotationTurns));
            }
            
            // Check for 90° quarter turn crossings
            let quarterTurnCrossings = 0;
            if (quarter_turns > this._lastRotationQuarterTurns) {
              quarterTurnCrossings = Math.floor(quarter_turns) - Math.floor(this._lastRotationQuarterTurns);
            } else if (quarter_turns < this._lastRotationQuarterTurns) {
              quarterTurnCrossings = Math.abs(Math.ceil(quarter_turns) - Math.ceil(this._lastRotationQuarterTurns));
            }
            
            // Check for 15° segment crossings (hour boundaries)
            let segmentCrossings = 0;
            if (segments > this._lastRotationSegments) {
              segmentCrossings = Math.floor(segments) - Math.floor(this._lastRotationSegments);
            } else if (segments < this._lastRotationSegments) {
              segmentCrossings = Math.abs(Math.ceil(segments) - Math.ceil(this._lastRotationSegments));
            }
            
            if (crossings > 0) {
              for (let i = 0; i < crossings; i++) {
                this.playFeedback(0.15, 30);
              }
            }
            
            // Trigger feedback for quarter turn crossings (medium) - but only if not at a 360° boundary
            if (quarterTurnCrossings > 0 && crossings === 0) {
              // Limit quarter turn feedback to prevent overwhelming during large rotations
              const maxQuarterTurnFeedback = Math.min(quarterTurnCrossings, 2);
              for (let i = 0; i < maxQuarterTurnFeedback; i++) {
                this.playFeedback(0.04, 20);
              }
            }
            
            // Trigger feedback for segment crossings (subtle) - but only if not at a 360° boundary
            if (segmentCrossings > 0 && crossings === 0) {
              // Limit subtle feedback to prevent overwhelming during large rotations
              const maxSubtleFeedback = Math.min(segmentCrossings, 3);
              for (let i = 0; i < maxSubtleFeedback; i++) {
                this.playFeedback(0.015, 15);
              }
            }
            
            this._lastRotationTurns = turns;
            this._lastRotationQuarterTurns = quarter_turns;
            this._lastRotationSegments = segments;
          }
        }
      
      // Clear arrays for this frame to avoid GC pressure
      this.midnightLines.length = 0;
      this.monthLines.length = 0;
      this.dayNumbers.length = 0;
      this.hourNumbersInSegments.length = 0;
      this.highlightedSegments.length = 0;
      this.eventSegments.length = 0;
      this._clockLabelSlices = null;
      this.repeatedHourSegments = [];
      this.nightOverlays.length = 0;
      this.dayOverlays.length = 0;
      this.gradientOverlays.length = 0;
      this.arcLines.length = 0;
      
      // Clear delete button info if no event is being displayed
      if (this.state.detailViewDay === null) {
        this.deleteButtonInfo = null;
        this.addButtonInfo = null;
        this.canvasClickAreas.closeDetailButton = null;
        this.titleClickArea = null;
        this.dateTimeClickArea = null;
        this.descClickArea = null;
        this.canvasClickAreas.startDateBox = null;
        this.canvasClickAreas.endDateBox = null;
        this.canvasClickAreas.calendarBox = null;
        this.canvasClickAreas.colorBox = null;
        this.canvasClickAreas.colorRing = null;
        this.canvasClickAreas.prevEventChevron = null;
        this.canvasClickAreas.nextEventChevron = null;
        

      }
      
      this.ctx.save();

      // Calculate transforms and set up coordinate system (without scaling)
      const { thetaMax, maxRadius } = this.calculateTransforms(canvasWidth, canvasHeight);
    // Move spiral center up if time display is enabled
    const { centerX, centerY } = this.calculateCenter(canvasWidth, canvasHeight);
    this.ctx.translate(centerX, centerY);
      
      if (renderCircleMode) {
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // 180° turn in static mode
        } else {
          this.ctx.rotate(-this.state.rotation); // <-- add this!
        }
        this.drawCircleModeSegments(maxRadius);
      } else {
        // Spiral mode: apply rotation to canvas
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // 180° turn in static mode
        } else {
          this.ctx.rotate(-this.state.rotation);
        }
        
        // Set up drawing parameters for spiral mode
        const normalVisibilityRange = this.getRenderVisibilityRange(thetaMax);
        let visibilityRange = normalVisibilityRange;
        if (useStartupDrawIn) {
          const progress = Math.max(0, Math.min(1, startup.progress || 0));
          // Reveal from the actual inner boundary outward so the center does
          // not start with a temporary hole that fills in later.
          const growthStartTheta = normalVisibilityRange.min;
          const visibleRotations = Math.max(1, this.state.days - 1);
          const revealStartProgress = Math.max(0, 1 - (1 / visibleRotations));
          const revealProgress = Math.max(0, Math.min(1, (progress - revealStartProgress) / Math.max(0.0001, 1 - revealStartProgress)));
          startupHourRevealCount = Math.max(0, Math.min(24, Math.floor(revealProgress * 24)));
          visibilityRange = {
            min: growthStartTheta,
            max: growthStartTheta + (normalVisibilityRange.max - growthStartTheta) * progress
          };
          startupHourRevealOriginTheta = visibilityRange.max;
        }
        const detailDayNormalization = (!useStartupDrawIn && this.mouseState.isHandleDragging)
          ? this.getDetailViewOutermostDayNormalization(thetaMax, visibilityRange)
          : null;
        const displayVisibilityMax = detailDayNormalization
          ? detailDayNormalization.normalizedMax
          : visibilityRange.max;
        const getSegmentThetaRange = (rawStartAngle, rawEndAngle, range = visibilityRange) => {
          let startTheta = Math.max(rawStartAngle, range.min);
          let endTheta = Math.min(rawEndAngle, range.max);
          if (
            detailDayNormalization &&
            rawStartAngle >= detailDayNormalization.outerDayStart - 0.0001 &&
            rawEndAngle <= detailDayNormalization.outerDayEnd + 0.0001
          ) {
            if (detailDayNormalization.fillOutermostDay) {
              startTheta = rawStartAngle;
              endTheta = rawEndAngle;
            } else {
              endTheta = startTheta;
            }
          }
          return { startTheta, endTheta };
        };
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
      // Draw all segments within the visible range
      // Calculate which segments fall within the visible angular range
      const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
      const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
      
      let isFirstVisibleSegment = true;
      
      // First pass: collect all segments with their radii for hour number filtering
      const segmentsWithRadii = [];
      
      for (let day = startDay; day < endDay; day++) {
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          // Calculate segment angles
          const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;

          // Clamp to visible range for smooth disappearance
          const { startTheta, endTheta } = getSegmentThetaRange(rawStartAngle, rawEndAngle);
          
          if (endTheta <= startTheta) continue; // segment is fully hidden
          
          // Calculate radius for this segment
          const segmentCenterAngle = (startTheta + endTheta) / 2;
          const segmentRadius = radiusFunction(segmentCenterAngle + Math.PI);
          
          // Store segment info for hour number filtering
          segmentsWithRadii.push({
            day, segment, startTheta, endTheta, segmentRadius
          });
        }
      }
      
      // Sort by radius (descending) and take the top 24 for hour numbers
      segmentsWithRadii.sort((a, b) => b.segmentRadius - a.segmentRadius);
      
      // Calculate visibility for each segment and create a priority list
      const segmentsWithVisibility = segmentsWithRadii.map(segment => {
        const rawStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
        const rawEndAngle = rawStartAngle + segmentAngle;
        const { startTheta, endTheta } = getSegmentThetaRange(rawStartAngle, rawEndAngle);
        
        const visibility = endTheta > startTheta ? (endTheta - startTheta) / (rawEndAngle - rawStartAngle) : 0;
        
        return {
          ...segment,
          visibility,
          rawStartAngle,
          rawEndAngle,
          segmentKey: `${segment.day}-${segment.segment}`
        };
      });
      
      // Sort by radius first, then by visibility (descending)
      segmentsWithVisibility.sort((a, b) => {
        if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
          return b.segmentRadius - a.segmentRadius; // Sort by radius first
        }
        return b.visibility - a.visibility; // Then by visibility
      });
      
      const segmentsToShowNumbers = [];
      if (useStartupDrawIn) {
        const startupMinVisibility = this.state.hourNumbersInsideSegment ? 0.45 : 0.25;
        const wrapAngleDistance = (theta) => {
          let delta = theta - startupHourRevealOriginTheta;
          while (delta <= -Math.PI) delta += 2 * Math.PI;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          return Math.abs(delta);
        };

        const startupCandidates = segmentsWithVisibility
          .filter((segment) => segment.visibility >= startupMinVisibility)
          .sort((a, b) => {
            if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
              return b.segmentRadius - a.segmentRadius;
            }
            const aCenter = (a.rawStartAngle + a.rawEndAngle) / 2;
            const bCenter = (b.rawStartAngle + b.rawEndAngle) / 2;
            const distanceDelta = wrapAngleDistance(aCenter) - wrapAngleDistance(bCenter);
            if (Math.abs(distanceDelta) > 0.0001) {
              return distanceDelta;
            }
            if (a.day !== b.day) return a.day - b.day;
            return a.segment - b.segment;
          });

        if (startupRevealedHourSegmentKeys) {
          for (const candidate of startupCandidates) {
            if (startupRevealedHourSegmentKeys.length >= startupHourRevealCount) break;
            if (!startupRevealedHourSegmentKeys.includes(candidate.segmentKey)) {
              startupRevealedHourSegmentKeys.push(candidate.segmentKey);
            }
          }

          const revealedSet = new Set(startupRevealedHourSegmentKeys.slice(0, startupHourRevealCount));
          for (const segment of segmentsWithVisibility) {
            if (revealedSet.has(segment.segmentKey)) {
              segmentsToShowNumbers.push(segment);
            }
          }
        } else {
          segmentsToShowNumbers.push(...startupCandidates.slice(0, startupHourRevealCount));
        }
      } else {
        // Take segments based on position-adjusted threshold, up to 24 total
        for (const segment of segmentsWithVisibility) {
          if (segmentsToShowNumbers.length >= 24) break;
          
          let shouldShow = false;
          if (this.state.hourNumbersPosition === 2 || this.state.hourNumbersPosition === 0) {
            // +0.5 position: Different thresholds based on positioning
            if (this.state.hourNumbersInsideSegment) {
              // Inside segment center: 66% threshold (two thirds)
              shouldShow = segment.visibility >= 0.66;
            } else {
              // Outside segment: 33% threshold (one third)
              shouldShow = segment.visibility >= 0.33;
            }
          } else if (this.state.hourNumbersPosition === 1) {
            if (this.state.hourNumbersInsideSegment) {
              // Inside segment center: 17% threshold (two thirds minus 0.5)
              shouldShow = segment.visibility >= 0.17;
            } else {
              // Outside segment: 83% threshold with shifted visibility range
              const rawStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
              const rawEndAngle = rawStartAngle + segmentAngle;
              
              // Shift visibility range by half a segment for middle position
              const shiftedVisibilityRange = {
                min: visibilityRange.min - (segmentAngle * 0.5),
                max: visibilityRange.max - (segmentAngle * 0.5)
              };
              
              const { startTheta, endTheta } = getSegmentThetaRange(rawStartAngle, rawEndAngle, shiftedVisibilityRange);
              const shiftedVisibility = endTheta > startTheta ? (endTheta - startTheta) / (rawEndAngle - rawStartAngle) : 0;
              
              shouldShow = shiftedVisibility >= 0.17;
            }
          }
   
          if (shouldShow) {
            segmentsToShowNumbers.push(segment);
          }
        }
        
        // If we don't have 24 segments at threshold, fill with the most visible remaining segments
        if (segmentsToShowNumbers.length < 24) {
          for (const segment of segmentsWithVisibility) {
            if (segmentsToShowNumbers.length >= 24) break;
            if (!segmentsToShowNumbers.some(s => s.segmentKey === segment.segmentKey) && segment.visibility > 0) {
              segmentsToShowNumbers.push(segment);
            }
          }
        }
      }
      
      const segmentsToShowNumbersSet = new Set(segmentsToShowNumbers.map(s => s.segmentKey));
      
      // Cache for daily data to avoid redundant Date creations and SunCalc operations per segment
      const dailyDataCache = new Map();
      const getDailyData = (segmentId) => {
        // segmentId 0 is referenceTime directly. Each block of 24 is a single UTC day.
        const dayOffset = Math.floor(segmentId / 24);
        if (dailyDataCache.has(dayOffset)) return dailyDataCache.get(dayOffset);
        
        const segmentDate = new Date(this.referenceTime.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const sunTimes = this.getSunTimesForDate(segmentDate);
        
        const dayOfWeek = segmentDate.getUTCDay();
        let brightness;
        if (dayOfWeek === 0) brightness = 0;
        else if (dayOfWeek === 6) brightness = 50;
        else brightness = 255 - (dayOfWeek - 1) * 35;
        
        const dayOverlayColor = getCanvasWeekdayOverlay(brightness, this.state.dayOverlayOpacity, this.state.darkMode);
        
        const data = { sunTimes, dayOverlayColor, segmentDateBase: segmentDate };
        dailyDataCache.set(dayOffset, data);
        return data;
      };
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          // Calculate segment angles
          const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;

          // Clamp to visible range for smooth disappearance
          const { startTheta, endTheta } = getSegmentThetaRange(rawStartAngle, rawEndAngle);
          
          if (endTheta <= startTheta) continue; // segment is fully hidden

          // Get base color for this segment.
          let color;
          
          const segmentId = this.getSegmentId(day, segment);
          const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
          color = this.cache.colors[colorIndex];

          // Check if this is a midnight segment (segment 23 of each day) or the segment after midnight (segment 0 of next day)
          const isMidnightSegment = segment === 23;
          const isAfterMidnightSegment = segment === 0;
          
          // Check if this is a noon segment (segment 12 of each day)
          const isNoonSegment = segment === 12;
          
          // Check if this is a 6:00 segment (segment 6 of each day)
          const isSixAMSegment = segment === 6;
          
          // Check if this is an 18:00 segment (segment 18 of each day)
          const isSixPMSegment = segment === 18;
          
          // Check if this is a month boundary segment
          const isFirstDayOfMonth = this.isFirstDayOfMonth(day, segment);
          
          // Check if this segment is currently hovered
          const isHovered = this.mouseState.hoveredSegment && 
                           this.mouseState.hoveredSegment.day === day && 
                           this.mouseState.hoveredSegment.segment === segment;
          // Check if this segment is currently selected
          const isSelected = this.mouseState.selectedSegment && 
                            this.mouseState.selectedSegment.day === day && 
                            this.mouseState.selectedSegment.segment === segment;
          // Draw the segment - only draw leading edge for the first visible segment
          this.drawSegment(startTheta, endTheta, radiusFunction, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isFirstVisibleSegment, isSelected, rawStartAngle, rawEndAngle, isFirstDayOfMonth, day, segment, true, false, isNoonSegment, isSixAMSegment, isSixPMSegment);
          this.collectRepeatedHourSegment(day, segment, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction);
          
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle);
          }
        }
          
          if (this.state.showNightOverlay) {
            this.collectNightOverlaysForSegment({ day, segment, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction }, getDailyData(segmentId).sunTimes);
          }

          // --- DAY OVERLAY LOGIC FOR SPIRAL MODE ---
          if (day !== null && this.state.showDayOverlay) {
            // Use cached day overlay color
            const dailyData = getDailyData(segmentId);
            const dayOverlayColor = dailyData.dayOverlayColor;
            
            // Store day overlay data for drawing after events
            this.dayOverlays.push({
              startTheta: startTheta,
              endTheta: endTheta,
              radiusFunction: radiusFunction,
              color: dayOverlayColor,
              day: day,
              segment: segment,
              isCircleMode: false
            });
          }
          
          // --- GRADIENT OVERLAY LOGIC FOR SPIRAL MODE ---
          if (this.state.showGradientOverlay) {
            const { maxRadius } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
            const darkness = this.getSteppedGradientOverlayOpacity(day, segment, radiusFunction, maxRadius, 6);
            
            const gradientOverlayColor = `rgba(${getCanvasTheme(this.state.darkMode).shadeRgb}, ${darkness})`;
            
            // Store gradient overlay data for drawing after events
            this.gradientOverlays.push({
              startTheta: startTheta,
              endTheta: endTheta,
              radiusFunction: radiusFunction,
              color: gradientOverlayColor,
              day: day,
              segment: segment,
              isCircleMode: false
            });
          }
          
          // Store day number info if this is the first hour of a day
          const isFirstHourOfDay = this.isFirstHourOfDay(day, segment);
          if (isFirstHourOfDay && rawStartAngle !== null && rawEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(displayVisibilityMax / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip day number if hiding outermost due to inside hour numbers
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForHourOverlap) {
            const dayNumber = this.getDayNumber(day, segment);
            const centerTheta = (rawStartAngle + rawEndAngle) / 2;
            const centerRadius = radiusFunction(centerTheta + Math.PI); // Middle of segment (between inner and outer)
            // Build weekday + day label (e.g., Mon 28)
            // Defaults in case of errors
            let showWeekday = false;
            let includeMonth = false;
            let includeYear = false;
            let segmentDateMs = null;
            try {
              const segmentId = this.getSegmentId(day, segment);
              const segmentDate = this.getSegmentDate(segmentId);
              segmentDateMs = segmentDate.getTime();
              const weekdayFull = WEEKDAYS_UTC[segmentDate.getUTCDay()];
              const weekdayShort = weekdayFull.slice(0, 3);
              const monthFull = MONTHS_LONG_UTC[segmentDate.getUTCMonth()];
              const monthShort = MONTHS_SHORT_UTC[segmentDate.getUTCMonth()];
              const year = segmentDate.getUTCFullYear();
              const parts = [];
              const useShortWeekday = !!this.state.dayLabelUseShortNames;
              const useShortMonth = !!this.state.dayLabelUseShortMonth;
              const useShortYear = !!this.state.dayLabelUseShortYear;
              const isFirstOfMonth = segmentDate.getUTCDate() === 1;
              const isFirstOfYear = isFirstOfMonth && segmentDate.getUTCMonth() === 0;
              showWeekday = !!this.state.dayLabelShowWeekday || (isOutermostDay && !!this.state.dayLabelWeekdayOnOutermost);
              const showMonth = !!this.state.dayLabelShowMonth || (isOutermostDay && !!this.state.dayLabelMonthOnOutermost);
              const showYear = !!this.state.dayLabelShowYear || (isOutermostDay && !!this.state.dayLabelYearOnOutermost);
              if (showWeekday) {
                parts.push(useShortWeekday ? weekdayShort : weekdayFull);
              }
              includeMonth = showMonth && (
                (isOutermostDay && !!this.state.dayLabelMonthOnOutermost) ||
                !this.state.dayLabelMonthOnFirstOnly ||
                isFirstOfMonth
              );
              if (includeMonth) {
                parts.push(useShortMonth ? monthShort : monthFull);
              }
              const dayText = this.state.dayLabelUseOrdinal ? this.dayToOrdinal(dayNumber) : String(dayNumber);
              parts.push(dayText);
              if (showWeekday && parts.length > 1) parts[0] = parts[0] + ',';
              var fullDayLabel = parts.join(' ');
              includeYear = showYear && (
                (isOutermostDay && !!this.state.dayLabelYearOnOutermost) ||
                !this.state.dayLabelYearOnFirstOnly ||
                isFirstOfYear
              );
              if (includeYear) {
                const yearText = useShortYear ? String(year).slice(2) : String(year);
                fullDayLabel += `, ${yearText}`;
              }
            } catch (_) {
              var fullDayLabel = dayNumber.toString();
            }
            
            // Calculate font size based on segment dimensions
            const segmentAngleSize = rawEndAngle - rawStartAngle;
            const innerRadius = radiusFunction(centerTheta);
            const outerRadius = radiusFunction(centerTheta + 2 * Math.PI);
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            const fontSize = Math.max(1, Math.min(24, maxDimension));
            let transitionFontSize = null;
            if (this.isModeTransitionGeometryMorphActive()) {
              const circleInnerRadius = radiusFunction(day * 2 * Math.PI);
              const circleOuterRadius = radiusFunction((day + 1) * 2 * Math.PI);
              const circleCenterRadius = (circleInnerRadius + circleOuterRadius) / 2;
              const circleSegmentAngleSize = Math.max(0, endTheta - startTheta);
              const circleRadialHeight = circleOuterRadius - circleInnerRadius;
              const circleArcWidth = circleCenterRadius * circleSegmentAngleSize;
              const circleMaxDimension = Math.min(circleRadialHeight, circleArcWidth) * 0.4;
              transitionFontSize = Math.max(1, Math.min(24, circleMaxDimension));
            }
            
            this.dayNumbers.push({
              day: day,
              segment,
              dayNumber: dayNumber,
              segmentDateMs: segmentDateMs,
              x: centerRadius * Math.cos(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              transitionFontSize: transitionFontSize,
              isCircleMode: false,
              radiusFunction: radiusFunction,
              centerTheta: centerTheta,
              centerRadius: centerRadius,
              outerEndClipTheta: endTheta < rawEndAngle - 0.0001 ? endTheta : null,
              onlyNumeric: (!showWeekday && !includeMonth && !includeYear)
            });
            }
          }
          
          this.collectEventSegments({ day, segment, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction }, eventBoundaryLookup);

          // After drawing the first visible segment, set flag to false
          if (isFirstVisibleSegment) {
            isFirstVisibleSegment = false;
          }
        }
      }
      }

      // Draw hour labels outside the spiral
      this._startupHourRevealCount = useStartupDrawIn ? startupHourRevealCount : null;
      if (this.state.showHourNumbers) {
        this.drawHourLabels(maxRadius);
      }

      // Draw event segments after main segments
      this.drawEventSegments();
      // Draw handles for selected event (start/end indicators)
      this.drawSelectedEventHandles();

      // Draw hour numbers inside segments above events
      if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
        this.drawHourNumbersInSegments();
      }
      this._startupHourRevealCount = null;
      this.drawDayNumbers();
      
      const detailPreviewActive = this.isDetailViewPreviewActive();
      const detailOverlayActive = ((this.state.detailViewDay !== null && this.mouseState.selectedSegment) || detailPreviewActive) &&
        !this.mouseState.isHandleDragging;

      // Draw month lines on top of all segments
      this.drawMonthLines();

      // Draw arc lines on top of everything
      this.drawArcLines();
      
      this.drawMidnightLines();
      
      // Draw overlays on top of everything
      this.ctx.save();
      try {
        this.clipSelectedEventOverlays();
        this.drawGradientOverlays();
        this.drawDayOverlays();
        this.drawNightOverlays();
      } finally {
        this.ctx.restore();
      }
      
      // Calculate color for selected segment before drawing highlighted segments
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        this.mouseState.selectedSegment.calculatedColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);
      }
      
      // Draw highlighted segments on top of everything.
      this.drawHighlightedSegments();
      this.drawRepeatedHourSegments();

      this.ctx.restore();
      
      // Draw tooltip on top of everything (not affected by transforms)
      this.drawTooltip();
      
      // Draw detail view if in detail view, or preview it during the opening morph.
      if (detailOverlayActive) {
        const previewActive = detailPreviewActive;
        this.drawDetailView(maxRadius, {
          preview: previewActive,
          entranceProgress: previewActive ? this.getDetailViewPreviewProgress() : 1
        });
      }
    
    // Draw current time/date display if enabled
    if (this.state.showTimeDisplay) {
      this.drawTimeDisplay(canvasWidth, canvasHeight);
    }

    this.drawTouchJoystickOverlay();
    }
});
