// Spiral Rendering
Object.assign(SpiralCalendar.prototype, {
  createVisibleEventBoundaryLookup() {
      const visibleEventRanges = [];
      const eventRangeByEvent = new WeakMap();
      for (const event of this.events) {
        const eventCalendar = event.calendar || 'Home';
        if (!this.state.visibleCalendars.includes(eventCalendar)) continue;
        const range = {
          event,
          startMs: new Date(event.start).getTime(),
          endMs: new Date(event.end).getTime()
        };
        visibleEventRanges.push(range);
        eventRangeByEvent.set(event, range);
      }

      const isEventOverlappedAtUtc = (targetEvent, utcMs) => {
        const targetRange = eventRangeByEvent.get(targetEvent);
        if (!targetRange || utcMs < targetRange.startMs || utcMs >= targetRange.endMs) return false;
        for (const otherRange of visibleEventRanges) {
          if (otherRange.event === targetEvent) continue;
          if (otherRange.startMs <= utcMs && otherRange.endMs > utcMs) {
            return true;
          }
        }
        return false;
      };

      const isEventTouchingAtStartUtc = (targetEvent, utcMs) => {
        const targetRange = eventRangeByEvent.get(targetEvent);
        if (!targetRange || targetRange.startMs !== utcMs) return false;
        for (const otherRange of visibleEventRanges) {
          if (otherRange.event === targetEvent) continue;
          if (otherRange.endMs === utcMs) return true;
        }
        return false;
      };

      const isEventTouchingAtEndUtc = (targetEvent, utcMs) => {
        const targetRange = eventRangeByEvent.get(targetEvent);
        if (!targetRange || targetRange.endMs !== utcMs) return false;
        for (const otherRange of visibleEventRanges) {
          if (otherRange.event === targetEvent) continue;
          if (otherRange.startMs === utcMs) return true;
        }
        return false;
      };

      return {
        isEventOverlappedAtUtc,
        isEventTouchingAtStartUtc,
        isEventTouchingAtEndUtc
      };
    },

  drawSegment(startTheta, endTheta, radiusFunction, color, isMidnightSegment = false, isAfterMidnightSegment = false, isHovered = false, drawLeadingEdge = false, isSelected = false, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, day = null, segment = null, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false) {
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      let angle = -startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      let radius = radiusFunction(startTheta);
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
        radius = radiusFunction(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      // Draw radial line outwards (one full turn)
      const outerEnd = endTheta + 2 * Math.PI;
      angle = -outerEnd + CONFIG.INITIAL_ROTATION_OFFSET;
      radius = radiusFunction(outerEnd);
      this.ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
      // Draw outer arc back to start edge
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
        const rawAngle = outerEnd - t * (endTheta - startTheta);
        angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
        radius = radiusFunction(rawAngle);
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        this.ctx.lineTo(x, y);
      }
      if (drawLeadingEdge) {
        this.ctx.closePath();
      }
      // Fill the segment (works for both open and closed paths)
      this.ctx.fillStyle = color;
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
        
        this.ctx.strokeStyle = isEventSubSegment ? color : CONFIG.STROKE_COLOR;
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
          this.highlightedSegments.push({
            startTheta: startTheta,
            endTheta: endTheta,
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
        
        this.highlightedSegments.push({
          startTheta: startTheta,
          endTheta: endTheta,
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

  drawSpiralBand(startTheta, endTheta, radiusFunction, fillStyle, minAvgThicknessPx = 0.6, tolPx = 0.75) {
      if (endTheta <= startTheta) return;
      // For semi-transparent overlays, use higher resolution (lower tolerance) to prevent gaps
      // Check if fillStyle is semi-transparent (contains rgba - overlays use rgba with alpha < 1)
      const isSemiTransparent = typeof fillStyle === 'string' && fillStyle.includes('rgba');
      const effectiveTolPx = isSemiTransparent ? Math.min(tolPx, 0.1) : tolPx; // Higher resolution for overlays
      const thetas = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, effectiveTolPx, 10);
      if (thetas.length < 2) return;
      // Average thickness check to avoid drawing near-zero-width slivers
      let avgThick = 0;
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        avgThick += (outer - inner);
      }
      avgThick /= thetas.length;
      if (avgThick < minAvgThicknessPx) return;

      // Build path
      this.ctx.save();
      this.ctx.beginPath();
      // Inner edge forward
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const r = radiusFunction(th);
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = r * Math.cos(ang), y = r * Math.sin(ang);
        if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
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
      this.ctx.fillStyle = fillStyle;
      this.ctx.fill();
      this.ctx.restore();
  },

    drawEventSpiralSubsegment(eventSegment) {
      const startTheta = eventSegment.timeStartTheta;
      const endTheta = eventSegment.timeEndTheta;
      const color = eventSegment.color;
      const eventSliceStart = eventSegment.eventSliceStart;
      const eventSliceEnd = eventSegment.eventSliceEnd;
      const radiusFunction = eventSegment.originalRadiusFunction;

      // Use adaptive sampling with tighter tolerance (same as overlays) for smooth arcs without gaps
      const thetas = this.adaptiveThetaSamples(startTheta, endTheta, radiusFunction, 0.1, 10);
      // Skip degenerate slivers near center to avoid flicker
      const thicknessPxAt = (th) => {
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        return (outer - inner) * (eventSliceEnd - eventSliceStart);
      };
      // If average thickness is less than ~0.6px, skip drawing
      let avgThick = 0;
      for (let i = 0; i < thetas.length; i++) avgThick += thicknessPxAt(thetas[i]);
      avgThick /= Math.max(1, thetas.length);
      if (avgThick < 0.6) {
        return;
      }

      const edgeSliceStart = (eventSegment.edgeSliceStart !== undefined) ? eventSegment.edgeSliceStart : eventSliceStart;
      const edgeSliceEnd = (eventSegment.edgeSliceEnd !== undefined) ? eventSegment.edgeSliceEnd : eventSliceEnd;
      const samples = [];
      for (let i = 0; i < thetas.length; i++) {
        const th = thetas[i];
        const inner = radiusFunction(th);
        const outer = radiusFunction(th + 2 * Math.PI);
        const h = outer - inner;
        const rInner = inner + eventSliceStart * h;
        const rOuter = inner + eventSliceEnd * h;
        const edgeInner = inner + edgeSliceStart * h;
        const edgeOuter = inner + edgeSliceEnd * h;
        const ang = -th + CONFIG.INITIAL_ROTATION_OFFSET;
        samples.push({ th, ang, rInner, rOuter, edgeInner, edgeOuter });
      }

      // Build path: inner curve forward, connect to outer end, outer curve backward, connect back
      this.ctx.beginPath();
      this.ctx.moveTo(samples[0].rInner * Math.cos(samples[0].ang), samples[0].rInner * Math.sin(samples[0].ang));
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        this.ctx.lineTo(s.rInner * Math.cos(s.ang), s.rInner * Math.sin(s.ang));
      }
      const last = samples[samples.length - 1];
      // connect via short radial edge at the end
      this.ctx.lineTo(last.rOuter * Math.cos(last.ang), last.rOuter * Math.sin(last.ang));
      for (let i = samples.length - 2; i >= 0; i--) {
        const s = samples[i];
        this.ctx.lineTo(s.rOuter * Math.cos(s.ang), s.rOuter * Math.sin(s.ang));
      }
      // close along start radial to ensure no gaps
      const first = samples[0];
      this.ctx.lineTo(first.rInner * Math.cos(first.ang), first.rInner * Math.sin(first.ang));
      this.ctx.closePath();

      // Fill with high resolution sampling (no stroke needed - same method as overlays)
      this.ctx.fillStyle = color;
      this.ctx.fill();
      if (this.state.showEventBoundaryStrokes && this.state.showAllEventBoundaryStrokes && !this.state.showArcLines) {
        this.ctx.save();
        this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
        this.ctx.strokeStyle = '#000';
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rInner * Math.cos(samples[0].ang), samples[0].rInner * Math.sin(samples[0].ang));
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rInner * Math.cos(s.ang), s.rInner * Math.sin(s.ang));
        }
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rOuter * Math.cos(samples[0].ang), samples[0].rOuter * Math.sin(samples[0].ang));
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rOuter * Math.cos(s.ang), s.rOuter * Math.sin(s.ang));
        }
        this.ctx.stroke();
        this.ctx.restore();
      }
      if (this.state.showEventBoundaryStrokes && eventSegment.dividerStroke) {
        this.ctx.save();
        this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineCap = 'square';
        this.ctx.beginPath();
        this.ctx.moveTo(samples[0].rInner * Math.cos(samples[0].ang), samples[0].rInner * Math.sin(samples[0].ang));
        for (let i = 1; i < samples.length; i++) {
          const s = samples[i];
          this.ctx.lineTo(s.rInner * Math.cos(s.ang), s.rInner * Math.sin(s.ang));
        }
        this.ctx.stroke();
        this.ctx.restore();
      }
      const shouldCoverStartEdge = !!eventSegment.coverStartEdge;
      const shouldCoverEndEdge = !!eventSegment.coverEndEdge;
      if (shouldCoverStartEdge || shouldCoverEndEdge) {
        // Keep continuing event pieces visually closed where the layout changes
        // across hour joins or overlap transitions.
        this.ctx.save();
        this.ctx.lineWidth = CONFIG.EVENT_EDGE_STROKE_WIDTH;
        this.ctx.strokeStyle = color;
        if (shouldCoverEndEdge) {
          this.ctx.beginPath();
          this.ctx.moveTo(last.edgeInner * Math.cos(last.ang), last.edgeInner * Math.sin(last.ang));
          this.ctx.lineTo(last.edgeOuter * Math.cos(last.ang), last.edgeOuter * Math.sin(last.ang));
          this.ctx.stroke();
        }
        if (shouldCoverStartEdge) {
          this.ctx.beginPath();
          this.ctx.moveTo(first.edgeInner * Math.cos(first.ang), first.edgeInner * Math.sin(first.ang));
          this.ctx.lineTo(first.edgeOuter * Math.cos(first.ang), first.edgeOuter * Math.sin(first.ang));
          this.ctx.stroke();
        }
        this.ctx.restore();
      }

      // Defer thin black event boundary edges until after all event fills so
      // later slices do not paint over them.
      const shouldDrawStartEdge = !!eventSegment.drawStartEdge;
      const shouldDrawEndEdge = !!eventSegment.drawEndEdge;
      if (this.state.showEventBoundaryStrokes && (shouldDrawStartEdge || shouldDrawEndEdge)) {
        if (shouldDrawEndEdge) {
          this.queuePendingSpiralOverlapEdge(
            last.edgeInner * Math.cos(last.ang),
            last.edgeInner * Math.sin(last.ang),
            last.edgeOuter * Math.cos(last.ang),
            last.edgeOuter * Math.sin(last.ang)
          );
        }
        if (shouldDrawStartEdge) {
          this.queuePendingSpiralOverlapEdge(
            first.edgeInner * Math.cos(first.ang),
            first.edgeInner * Math.sin(first.ang),
            first.edgeOuter * Math.cos(first.ang),
            first.edgeOuter * Math.sin(first.ang)
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
      this.ctx.strokeStyle = '#000';
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
      this.ctx.strokeStyle = isHover ? '#111' : '#555';
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

    drawDetailView(maxRadius) {
      const detailLayout = this.getDetailViewLayout(maxRadius);
      const {
        centerX,
        centerY,
        outerRadius,
        circleRadius,
        baseFontSize,
        smallFontSize,
        titleFontSize,
        titleY,
        dateTimeY,
        descriptionY,
        buttonY
      } = detailLayout;
    
    // Clear previous button info to prevent stale references
    this.deleteButtonInfo = null;
    this.addButtonInfo = null;
    this.canvasClickAreas.prevEventChevron = null;
    this.canvasClickAreas.nextEventChevron = null;
      
      this.ctx.save();
      const detailEventState = this.mouseState.selectedSegment
        ? this.getDetailViewEventState({ ensureDraft: true })
        : null;
      
      // Draw the colored outer ring and white inner circle first (before content)
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        // Determine the color for the outer ring
        const outerRingColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);
        
        // Store the calculated color in the selected segment for use by stroke
        this.mouseState.selectedSegment.calculatedColor = outerRingColor;
        
        // Draw the colored outer circle (full size)
        this.ctx.fillStyle = outerRingColor;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw the white inner circle
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Store the clickable area for the color ring
        this.canvasClickAreas.colorRing = {
          centerX: centerX,
          centerY: centerY,
          outerRadius: outerRadius,
          innerRadius: circleRadius,
          event: detailEventState ? detailEventState.detailEvent : null
        };
      } else {
        // Fallback: draw a simple white circle if no segment is selected
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
      }
      
      // --- DYNAMICALLY UPDATE PERSISTENT INPUTS IF THEY EXIST ---
      const persistentStartInput = document.getElementById('persistentStartDateTime');
      const persistentEndInput = document.getElementById('persistentEndDateTime');
      const persistentColorPicker = document.getElementById('persistentColorPicker');
      if (persistentStartInput && persistentEndInput && persistentColorPicker && 
          !this.editingState.isEditingTitle && !this.editingState.isEditingDescription) {
        const inputLayout = this.getDetailViewInputLayout(detailLayout);
        persistentStartInput.style.left = `${inputLayout.inputLeft}px`;
        persistentStartInput.style.top = `${inputLayout.startInputTop}px`;
        persistentStartInput.style.width = `${inputLayout.inputWidth}px`;
        persistentStartInput.style.height = `${inputLayout.inputHeight}px`;
        persistentStartInput.style.fontSize = `${inputLayout.fontSize}px`;
        persistentEndInput.style.left = `${inputLayout.inputLeft}px`;
        persistentEndInput.style.top = `${inputLayout.endInputTop}px`;
        persistentEndInput.style.width = `${inputLayout.inputWidth}px`;
        persistentEndInput.style.height = `${inputLayout.inputHeight}px`;
        persistentEndInput.style.fontSize = `${inputLayout.fontSize}px`;
        persistentColorPicker.style.left = `${inputLayout.inputLeft}px`;
        persistentColorPicker.style.top = `${inputLayout.colorInputTop}px`;
        persistentColorPicker.style.width = `${inputLayout.inputWidth}px`;
        persistentColorPicker.style.height = `${inputLayout.inputHeight}px`;
      }

      // Draw segment information
      if (this.mouseState.selectedSegment) {
        if (!detailEventState || !detailEventState.detailEvent) {
          this.ctx.restore();
          return;
        }
        const {
          selectedEventCount,
          activeEventIndex,
          detailEvent,
          isDraftEventActive
        } = detailEventState;
        
        // Draw text on top of the circle
        this.ctx.fillStyle = '#000';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const smallLineHeight = smallFontSize;

        // Event counter for real events with multiples
        if (!isDraftEventActive && selectedEventCount > 1) {
          const eventCounterText = `Event ${activeEventIndex + 1} of ${selectedEventCount}`;
          const counterY = titleY - circleRadius * 0.15;
          this.ctx.fillStyle = '#666';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';

          const counterWidth = this.ctx.measureText(eventCounterText).width;
          const chevronSize = Math.max(1, smallFontSize * 1.45);
          const chevronGap = chevronSize * 0.8;
          const prevChevronX = centerX - counterWidth / 2 - chevronGap;
          const nextChevronX = centerX + counterWidth / 2 + chevronGap;

          this.canvasClickAreas.prevEventChevron = this.drawDetailViewChevronButton(
            prevChevronX,
            counterY,
            chevronSize,
            -1,
            this.mouseState.hoveredDetailElement === 'prevEventChevron'
          );
          this.canvasClickAreas.nextEventChevron = this.drawDetailViewChevronButton(
            nextChevronX,
            counterY,
            chevronSize,
            1,
            this.mouseState.hoveredDetailElement === 'nextEventChevron'
          );

          this.ctx.fillText(eventCounterText, centerX, counterY);
        }
          
        // Draw title (fitted) and set click area
        const displayTitle = isDraftEventActive ? (detailEvent.title || 'Click to add title...') : detailEvent.title;
        if (!this.hideTitleWhileEditing) {
          const color = isDraftEventActive && !detailEvent.title ? '#999' : '#000';
          const { width: fittedWidth, height: fittedHeight } = this.drawTitleFitted(displayTitle, centerX, titleY, circleRadius, titleFontSize, color, true);
          this.titleClickArea = {
            x: centerX - fittedWidth / 2,
            y: titleY - fittedHeight / 2,
            width: fittedWidth,
            height: fittedHeight,
            event: detailEvent,
            centerY: titleY
          };
        }

        // Description height and static date/time Y (center)
        const maxWidth = circleRadius * 1.6;
        const actualTextHeight = this.calculateTextHeight(detailEvent.description, maxWidth, smallFontSize);
        this.drawDateTimeAndColorBoxes(detailEvent, centerX, dateTimeY, baseFontSize, circleRadius, buttonY);

        // Description click area (static spacing between title and date boxes for empty)
          this.descClickArea = {
          ...this.buildDescriptionClickArea(centerX, descriptionY, circleRadius, baseFontSize, titleY, titleFontSize, dateTimeY, actualTextHeight, !!detailEvent.description),
          event: detailEvent,
          centerY: descriptionY
        };

        // Draw description or placeholder
          if (!this.hideDescriptionWhileEditing) {
              this.ctx.font = getFontString(smallFontSize);
          if (detailEvent.description) {
            this.ctx.fillStyle = '#000';
            const wrappedText = this.wrapText(detailEvent.description, maxWidth);
              let lineY = descriptionY - (wrappedText.length - 1) * smallLineHeight / 2;
              for (const line of wrappedText) {
                this.ctx.fillText(line, centerX, lineY);
                lineY += smallLineHeight;
              }
            } else {
              this.ctx.fillStyle = '#999';
              this.ctx.fillText('Click to add description...', centerX, descriptionY);
            }
          }
          
        // Click background for description
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.00)';
          this.ctx.fillRect(this.descClickArea.x, this.descClickArea.y, this.descClickArea.width, this.descClickArea.height);
          
        // Buttons: draft => single "Add Event"; real => "+ New" and "Delete"
        if (isDraftEventActive) {
          const buttonWidth = baseFontSize * 5.5;
          const buttonHeight = baseFontSize * 2.5;
          const buttonRadius = buttonHeight / 2;
          const buttonX = centerX - buttonWidth / 2;
          const deleteButtonY = buttonY - buttonHeight / 2;
          this.deleteButtonInfo = {
            x: buttonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: detailEvent,
            isAddButton: true
          };
          // Hover effect for single center button
          const isHoverButton = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: buttonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverButton ? '#43A047' : '#4CAF50';
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
          this.addButtonInfo = {
            x: addButtonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: detailEvent,
            isAddButton: true,
            isAddAnotherButton: true
          };
          // Hover effect for "+ New" or "Done" button
          const isHoverAdd = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: addButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          const buttonText = this._detailViewHasChanges ? 'Done' : '+ New';
          //this.ctx.fillStyle = isHoverAdd ? '#43A047' : '#4CAF50';
          this.ctx.fillStyle = isHoverAdd ? '#666666' : '#888888';
          this.ctx.beginPath();
          this.ctx.roundRect(addButtonX, deleteButtonY, buttonWidth, buttonHeight, buttonRadius);
          this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = getFontString(smallFontSize);
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(buttonText, addButtonX + buttonWidth / 2, deleteButtonY + buttonHeight / 2);
          const deleteButtonX = buttonsStartX + buttonWidth + buttonSpacing;
          this.deleteButtonInfo = {
            x: deleteButtonX,
            y: deleteButtonY,
            width: buttonWidth,
            height: buttonHeight,
            event: detailEvent
          };
          // Hover effect for delete button
          const isHoverDelete = this.mouseState.lastMouseX && this.isPointInRect(this.mouseState.lastMouseX, this.mouseState.lastMouseY, { x: deleteButtonX, y: deleteButtonY, width: buttonWidth, height: buttonHeight });
          this.ctx.fillStyle = isHoverDelete ? '#e53935' : '#ff4444';
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

    createTitleEditor(event, clickX, clickY) {
      // Remove any existing title editor
      const existingEditor = document.getElementById('titleEditor');
      if (existingEditor) {
        existingEditor.remove();
      }
      const detailLayout = this.getDetailViewLayout();
      const { centerX, circleRadius, titleY } = detailLayout;
      // Get the same font size as used in drawDetailView
      let titleFontSize = this.titleClickArea ? this.titleClickArea.height : 16;

      // Apply the same dynamic font sizing logic as in drawDetailView
      let maxTitleWidth = circleRadius * 1.4;
      this.ctx.font = getFontString(titleFontSize, 'bold ');
      let titleMetrics = this.ctx.measureText(event.title);
      
      if (titleMetrics.width > maxTitleWidth) {
        const scaleFactor = maxTitleWidth / titleMetrics.width;
        titleFontSize = Math.max(1, Math.floor(titleFontSize * scaleFactor));
      }

      // Use the same font size and width as the title in the circle
      this.ctx.font = getFontString(titleFontSize, 'bold ');
      const textMetrics = this.ctx.measureText(event.title);
      const textWidth = textMetrics.width;
      const textHeight = titleFontSize;
      const titleX = centerX;
      // Calculate canvas offset and safe area inset
      const canvasRect = this.canvas.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      // Calculate input position to center it exactly where the text was
      const inputLeft = titleX - textWidth / 2;
      // Adjust for text baseline alignment - canvas fillText uses baseline, HTML input uses top edge
      const baselineAdjustment = titleFontSize * 0.8; // Approximate baseline offset
      const inputTop = canvasRect.top + (this.titleClickArea && this.titleClickArea.centerY !== undefined ? this.titleClickArea.centerY - textHeight / 2 : titleY - baselineAdjustment) + safeTop;
      
      // Apply iOS minimum font size only to the HTML input element
      let inputFontSize = titleFontSize;
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        inputFontSize = Math.max(inputFontSize, 16);
      }
      
      // Create input element
      const input = document.createElement('input');
      input.id = 'titleEditor';
      input.type = 'text';
      input.value = event.title;
      input.maxLength = document.getElementById('eventTitle').maxLength; // Use value from form input
      input.style.cssText = `
        position: absolute;
        left: ${inputLeft}px;
        top: ${inputTop}px;
        width: ${textWidth}px;
        height: ${textHeight}px;
        font-size: ${inputFontSize}px;
        font-weight: bold;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 0;
        background: ${document.body.classList.contains('dark-mode') ? 'var(--dark-bg-secondary)' : 'white'};
        color: ${document.body.classList.contains('dark-mode') ? 'var(--dark-text-primary)' : 'black'};
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;
      // iOS: Hide persistent inputs while editing to prevent jump
      function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      }
      let hiddenPersistent = false;
      input.addEventListener('focus', () => {
        if (isIOS()) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = 'none';
          if (persistentEndInput) persistentEndInput.style.display = 'none';
          if (persistentColorPicker) persistentColorPicker.style.display = 'none';
          hiddenPersistent = true;
        }
        this.editingState.isEditingTitle = true;
      });
      input.addEventListener('blur', () => {
        if (isIOS() && hiddenPersistent) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = '';
          if (persistentEndInput) persistentEndInput.style.display = '';
          if (persistentColorPicker) persistentColorPicker.style.display = '';
          hiddenPersistent = false;
          setTimeout(() => this.drawSpiral(), 100); // force redraw after keyboard closes
        }
        this.editingState.isEditingTitle = false;
      });

      // Add to page
      document.body.appendChild(input);
      input.focus();
      input.select();
      
      // Hide the original title text while editing
      this.hideTitleWhileEditing = true;
      this.drawSpiral();

      // Track maximum width to prevent shrinking
      let maxWidth = textWidth;
      
      // Function to resize input based on text content (only expand)
      const resizeInput = () => {
        this.ctx.font = getFontString(titleFontSize, 'bold ');
        const newTextMetrics = this.ctx.measureText(input.value || 'A'); // Use 'A' as minimum width
        const newTextWidth = Math.max(newTextMetrics.width, 20); // Minimum width of 20px
        
        // Only expand, never shrink
        if (newTextWidth > maxWidth) {
          maxWidth = newTextWidth;
        }
        
        // Update input width and position to keep it centered
        const newInputLeft = titleX - maxWidth / 2;
        input.style.width = `${maxWidth}px`;
        input.style.left = `${newInputLeft}px`;
      };

      // Handle save on Enter or blur
      const saveTitle = () => {
        const newTitle = input.value.trim() || 'Untitled Event';
        event.title = newTitle;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._detailViewHasChanges = true;
        input.remove();
        this.hideTitleWhileEditing = false;
        this.drawSpiral();
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Add input event listener for real-time resizing
      input.addEventListener('input', resizeInput);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveTitle();
        } else if (e.key === 'Escape') {
          input.remove();
          this.hideTitleWhileEditing = false;
          this.drawSpiral();
        }
      });

      input.addEventListener('blur', saveTitle);
    },

    createPersistentDateTimeInputs(event, centerX, dateTimeY, baseFontSize, circleRadius) {
      // Create a unique ID for this event (using start time as identifier)
      const eventId = event.start.getTime() + '_' + event.title;
      
      // Check if inputs are already created for this event
      if (this.persistentInputsState.currentEventId === eventId && this.persistentInputsState.inputsCreated) {
        // Inputs already exist for this event, don't recreate them
        return;
      }
      
      // Remove any existing persistent datetime inputs and color picker
      const existingStartInput = document.getElementById('persistentStartDateTime');
      const existingEndInput = document.getElementById('persistentEndDateTime');
      const existingColorPicker = document.getElementById('persistentColorPicker');
      if (existingStartInput) existingStartInput.remove();
      if (existingEndInput) existingEndInput.remove();
      if (existingColorPicker) existingColorPicker.remove();
      
      // Update state tracking
      this.persistentInputsState.currentEventId = eventId;
      this.persistentInputsState.inputsCreated = true;
      this._detailViewHasChanges = false; // Reset changes when opening detail view

      // Format datetime for input
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      // Create start time input
      const startInput = document.createElement('input');
      startInput.id = 'persistentStartDateTime';
      startInput.type = 'datetime-local';
      startInput.value = formatLocalDateTime(new Date(event.start));
      
      const inputWidth = circleRadius * 1.2; // Scale with circle size
      const inputHeight = baseFontSize * 1.2;
      const startInputLeft = centerX - inputWidth / 2;
      const startInputTop = dateTimeY - inputHeight * 0.8;
      
      startInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${startInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.7}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 2px;
        background: white;
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create end time input
      const endInput = document.createElement('input');
      endInput.id = 'persistentEndDateTime';
      endInput.type = 'datetime-local';
      endInput.value = formatLocalDateTime(new Date(event.end));
      
      const endInputTop = dateTimeY + inputHeight * 0.6;
      
      endInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${endInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.7}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        padding: 2px;
        background: white;
        z-index: 1001;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create color picker
      const colorInput = document.createElement('input');
      colorInput.id = 'persistentColorPicker';
      colorInput.type = 'color';
      colorInput.value = event.color;
      
      const colorInputLeft = centerX - inputWidth / 2;
      const colorInputTop = endInputTop + inputHeight + 10;
      
      colorInput.style.cssText = `
        position: absolute;
        left: ${colorInputLeft}px;
        top: ${colorInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        border: 1px solid #ccc;
        border-radius: 3px;
        background: white;
        z-index: 1002;
        cursor: pointer;
        box-sizing: border-box;
      `;

      // Add to page
      document.body.appendChild(startInput);
      document.body.appendChild(endInput);
      document.body.appendChild(colorInput);

      // Handle changes
      const updateEvent = () => {
        if (startInput.value && endInput.value) {
                const newStart = parseDateTimeLocalAsUTC(startInput.value);
      const newEnd = parseDateTimeLocalAsUTC(endInput.value);
          
          // Prevent end date from being earlier than start date
          if (newEnd < newStart) {
            // Auto-adjust end time to be 1 hour after start time
            const adjustedEnd = new Date(newStart);
          adjustedEnd.setUTCHours(newStart.getUTCHours() + 1);
            endInput.value = formatLocalDateTime(adjustedEnd);
            event.start = newStart;
            event.end = adjustedEnd;
          } else {
            event.start = newStart;
            event.end = newEnd;
          }
          
          event.lastModified = Date.now();
          
          // Mark that changes have been made
          this._detailViewHasChanges = true;
          
          this.drawSpiral(); // Redraw to update any event visualization
          // Save events to localStorage
          this.saveEventsToStorage();
          // Update event list to show new icon state (with delay to ensure properties are saved)
          setTimeout(() => renderEventList(), 0);

          // If current selection no longer includes this event, jump to event start
          this._ensureSelectedSegmentContainsEventOrJump(event);
        }
      };

      // Add event listeners
      startInput.addEventListener('change', updateEvent);
      endInput.addEventListener('change', updateEvent);
      colorInput.addEventListener('change', () => {
        event.color = colorInput.value;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._detailViewHasChanges = true;
        this.drawSpiral(); // Redraw to update event visualization
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      });
      
      // Auto-populate end date when start date changes
      startInput.addEventListener('change', () => {
        if (startInput.value) {
        const startDate = parseDateTimeLocalAsUTC(startInput.value);
          const endDate = new Date(startDate);
        endDate.setUTCHours(startDate.getUTCHours() + 1); // Add 1 hour
          endInput.value = formatLocalDateTime(endDate);
          updateEvent(); // Update the event with new end time
        }
      });
    },

    createDateTimeEditor(event, clickX, clickY) {
      // Remove any existing datetime editor
      const existingStartEditor = document.getElementById('startDateTimeEditor');
      const existingEndEditor = document.getElementById('endDateTimeEditor');
      if (existingStartEditor) existingStartEditor.remove();
      if (existingEndEditor) existingEndEditor.remove();

      const detailLayout = this.getDetailViewLayout();
      const { centerX, centerY, circleRadius, baseFontSize } = detailLayout;
      const dateTimeY = centerY - circleRadius * 0.15;
      
      // Create start time input
      const startInput = document.createElement('input');
      startInput.id = 'startDateTimeEditor';
      startInput.type = 'datetime-local';
      
      // Format current start time for input
      const startDate = new Date(event.start);
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hours = pad2(date.getHours());
        const minutes = pad2(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      startInput.value = formatLocalDateTime(startDate);
      
      const inputWidth = 180;
      const inputHeight = baseFontSize * 1.5;
      const startInputLeft = centerX - inputWidth / 2;
      const startInputTop = dateTimeY - inputHeight;
      
      startInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${startInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.8}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 2px;
        background: white;
        z-index: 1000;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Create end time input
      const endInput = document.createElement('input');
      endInput.id = 'endDateTimeEditor';
      endInput.type = 'datetime-local';
      
      const endDate = new Date(event.end);
      endInput.value = formatLocalDateTime(endDate);
      
      const endInputTop = dateTimeY + inputHeight / 4;
      
      endInput.style.cssText = `
        position: absolute;
        left: ${startInputLeft}px;
        top: ${endInputTop}px;
        width: ${inputWidth}px;
        height: ${inputHeight}px;
        font-size: ${baseFontSize * 0.8}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 2px;
        background: white;
        z-index: 1001;
        font-family: inherit;
        text-align: center;
        box-sizing: border-box;
      `;

      // Add to page
      document.body.appendChild(startInput);
      document.body.appendChild(endInput);
      startInput.focus();
      
      // Hide the original date/time text while editing
      this.hideDateTimeWhileEditing = true;
      this.drawSpiral();

      // Handle save function
      const saveDateTimes = () => {
        if (startInput.value && endInput.value) {
        event.start = parseDateTimeLocalAsUTC(startInput.value);
        event.end = parseDateTimeLocalAsUTC(endInput.value);
        event.lastModified = Date.now();
        }
        startInput.remove();
        endInput.remove();
        this.hideDateTimeWhileEditing = false;
        this.drawSpiral();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Handle cancel function
      const cancelEditing = () => {
        startInput.remove();
        endInput.remove();
        this.hideDateTimeWhileEditing = false;
        this.drawSpiral();
      };

      // Add event listeners
      startInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          endInput.focus();
        } else if (e.key === 'Escape') {
          cancelEditing();
        }
      });

      endInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveDateTimes();
        } else if (e.key === 'Escape') {
          cancelEditing();
        }
      });

      startInput.addEventListener('blur', (e) => {
        // Only save if focus didn't move to the end input
        if (e.relatedTarget !== endInput) {
          setTimeout(() => {
            if (document.activeElement !== endInput) {
              saveDateTimes();
            }
          }, 100);
        }
      });

      endInput.addEventListener('blur', (e) => {
        // Only save if focus didn't move to the start input
        if (e.relatedTarget !== startInput) {
          setTimeout(() => {
            if (document.activeElement !== startInput) {
              saveDateTimes();
            }
          }, 100);
        }
      });
    },

    createDescriptionEditor(event, clickX, clickY) {
      // Remove any existing description editor
      const existingEditor = document.getElementById('descEditor');
      if (existingEditor) {
        existingEditor.remove();
      }
      const detailLayout = this.getDetailViewLayout();
      const { centerX, centerY, circleRadius } = detailLayout;
      let smallFontSize = detailLayout.smallFontSize;
      // iOS Safari zooms in when font size is below 16px, so ensure minimum size
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        smallFontSize = Math.max(smallFontSize, 16);
      }
      // Calculate the area where description was drawn
      const descAreaWidth = this.descClickArea ? this.descClickArea.width : 115;
      const descAreaHeight = this.descClickArea ? this.descClickArea.height : 20;
      const descX = centerX;
      const descY = this.descClickArea ? this.descClickArea.y + descAreaHeight / 2 : centerY + smallFontSize * 1.2;
      // Calculate canvas offset and safe area inset
      const canvasRect = this.canvas.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('padding-top')) || 0;
      // Calculate input position to center it over the description area
      const inputLeft = descX - descAreaWidth / 2;
      // Adjust for text baseline alignment - canvas fillText uses baseline, HTML textarea uses top edge
      const baselineAdjustment = smallFontSize * 0.8; // Approximate baseline offset
      const inputTop = canvasRect.top + (this.descClickArea && this.descClickArea.centerY !== undefined ? this.descClickArea.centerY - descAreaHeight / 2 : descY - baselineAdjustment) + safeTop;
      // Create textarea element
      const textarea = document.createElement('textarea');
      textarea.id = 'descEditor';
      textarea.value = event.description || '';
      textarea.maxLength = document.getElementById('eventDescription').maxLength; // Use value from form input
      textarea.placeholder = 'Enter description...';
      // Calculate the same line height as the display text
      const smallLineHeight = smallFontSize;
      textarea.style.cssText = `
        position: absolute;
        left: ${inputLeft}px;
        top: ${inputTop}px;
        width: ${descAreaWidth}px;
        height: ${descAreaHeight}px;
        font-size: ${smallFontSize}px;
        border: 2px solid #4CAF50;
        border-radius: 2px;
        padding: 6px;
        background: ${document.body.classList.contains('dark-mode') ? 'var(--dark-bg-secondary)' : 'white'};
        color: ${document.body.classList.contains('dark-mode') ? 'var(--dark-text-primary)' : 'black'};
        z-index: 1000;
        font-family: inter, sans-serif;
        resize: none;
        box-sizing: border-box;
        line-height: ${smallLineHeight}px;
        text-align: center;
        overflow: hidden;
      `;
      // iOS: Hide persistent inputs while editing to prevent jump
      function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      }
      let hiddenPersistent = false;
      textarea.addEventListener('focus', () => {
        if (isIOS()) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = 'none';
          if (persistentEndInput) persistentEndInput.style.display = 'none';
          if (persistentColorPicker) persistentColorPicker.style.display = 'none';
          hiddenPersistent = true;
        }
        this.editingState.isEditingDescription = true;
      });
      textarea.addEventListener('blur', () => {
        if (isIOS() && hiddenPersistent) {
          const persistentStartInput = document.getElementById('persistentStartDateTime');
          const persistentEndInput = document.getElementById('persistentEndDateTime');
          const persistentColorPicker = document.getElementById('persistentColorPicker');
          if (persistentStartInput) persistentStartInput.style.display = '';
          if (persistentEndInput) persistentEndInput.style.display = '';
          if (persistentColorPicker) persistentColorPicker.style.display = '';
          hiddenPersistent = false;
          setTimeout(() => this.drawSpiral(), 100); // force redraw after keyboard closes
        }
        this.editingState.isEditingDescription = false;
      });

      // Add to page
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      // Hide the original description text while editing
      this.hideDescriptionWhileEditing = true;
      this.drawSpiral();

      // Function to auto-resize textarea based on content and keep it centered
      const resizeTextarea = () => {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = descAreaHeight*5; // Limit maximum height
        const newHeight = Math.min(scrollHeight, maxHeight);
        
        // Calculate how much the height changed
        const heightDifference = newHeight - descAreaHeight;
        
        // Move the textarea up by half the height difference to keep it centered
        const newTop = inputTop - heightDifference / 2;
        
        textarea.style.height = `${newHeight}px`;
        textarea.style.top = `${newTop}px`;
      };

      // Handle save on Enter (with Ctrl) or blur
      const saveDescription = () => {
        const newDescription = textarea.value.trim();
        event.description = newDescription;
        event.lastModified = Date.now();
        // Mark that changes have been made
        this._detailViewHasChanges = true;
        textarea.remove();
        this.hideDescriptionWhileEditing = false;
        this.drawSpiral();
        // Save events to localStorage
        this.saveEventsToStorage();
        // Update event list to show new icon state (with delay to ensure properties are saved)
        setTimeout(() => renderEventList(), 0);
      };

      // Add input event listener for auto-resizing
      textarea.addEventListener('input', resizeTextarea);

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          saveDescription();
        } else if (e.key === 'Escape') {
          textarea.remove();
          this.hideDescriptionWhileEditing = false;
          this.drawSpiral();
        }
      });

      textarea.addEventListener('blur', saveDescription);
      
      // Initial resize
      resizeTextarea();
    },

    drawSpiral() {
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
      const {
        isEventOverlappedAtUtc,
        isEventTouchingAtStartUtc,
        isEventTouchingAtEndUtc
      } = this.createVisibleEventBoundaryLookup();
      
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
      
      // Clear arrays for this frame
      this.midnightLines = [];
      this.monthLines = [];
        this.dayNumbers = [];
      this.hourNumbersInSegments = [];
      this.highlightedSegments = [];
      this.eventSegments = [];
      this.nightOverlays = [];
      this.dayOverlays = [];
      this.gradientOverlays = [];
      this.arcLines = [];
      
      // Clear delete button info if no event is being displayed
      if (this.state.detailViewDay === null) {
        this.deleteButtonInfo = null;
        this.addButtonInfo = null;
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
        
        // Remove persistent datetime inputs and color picker only when closing detail view
        const persistentStartInput = document.getElementById('persistentStartDateTime');
        const persistentEndInput = document.getElementById('persistentEndDateTime');
        const persistentColorPicker = document.getElementById('persistentColorPicker');
        if (persistentStartInput) persistentStartInput.remove();
        if (persistentEndInput) persistentEndInput.remove();
        if (persistentColorPicker) persistentColorPicker.remove();
        
        // Reset persistent inputs state
        this.persistentInputsState.currentEventId = null;
        this.persistentInputsState.inputsCreated = false;
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
        const normalVisibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
        let visibilityRange = normalVisibilityRange;
        if (useStartupDrawIn) {
          const progress = Math.max(0, Math.min(1, startup.progress || 0));
          const collapsedTheta = -this.state.rotation;
          startupHourRevealOriginTheta = collapsedTheta;
          const visibleRotations = Math.max(1, this.state.days - 1);
          const revealStartProgress = Math.max(0, 1 - (1 / visibleRotations));
          const revealProgress = Math.max(0, Math.min(1, (progress - revealStartProgress) / Math.max(0.0001, 1 - revealStartProgress)));
          startupHourRevealCount = Math.max(0, Math.min(24, Math.floor(revealProgress * 24)));
          visibilityRange = {
            min: collapsedTheta + (normalVisibilityRange.min - collapsedTheta) * progress,
            max: collapsedTheta + (normalVisibilityRange.max - collapsedTheta) * progress
          };
        }
        const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
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
          const startTheta = Math.max(rawStartAngle, visibilityRange.min);
          const endTheta = Math.min(rawEndAngle, visibilityRange.max);
          
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
        const startTheta = Math.max(rawStartAngle, visibilityRange.min);
        const endTheta = Math.min(rawEndAngle, visibilityRange.max);
        
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
              
              const startTheta = Math.max(rawStartAngle, shiftedVisibilityRange.min);
              const endTheta = Math.min(rawEndAngle, shiftedVisibilityRange.max);
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
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          // Calculate segment angles
          const rawStartAngle = day * 2 * Math.PI + segment * segmentAngle;
          const rawEndAngle = rawStartAngle + segmentAngle;

          // Clamp to visible range for smooth disappearance
          const startTheta = Math.max(rawStartAngle, visibilityRange.min);
          const endTheta = Math.min(rawEndAngle, visibilityRange.max);
          
          if (endTheta <= startTheta) continue; // segment is fully hidden

          // Get base color for this segment.
          let color;
          
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
          const segmentHourStartMs = this.referenceTime.getTime() + segmentId * 60 * 60 * 1000;
          const segmentHourEndMs = segmentHourStartMs + 60 * 60 * 1000;
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
          
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle);
          }
        }
          
          // --- NIGHT OVERLAY LOGIC FOR SPIRAL MODE ---
          if (day !== null && segment !== null && this.state.showNightOverlay) {
            // Calculate the hour this segment represents relative to the reference time
            const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
            const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
            let segStart = segmentDate.getUTCHours() + segmentDate.getUTCMinutes() / 60;
            let segEnd = segStart + 1;
            
            // Calculate sunrise/sunset times for this segment's date
            const sunTimes = this.getSunTimesForDate(segmentDate);
            let nightStart = sunTimes.sunset;
            let nightEnd = sunTimes.sunrise;
            if (nightEnd <= nightStart) nightEnd += 24;
            
            let segStartNorm = segStart;
            let segEndNorm = segEnd;
            if (segEndNorm < nightStart) {
              segStartNorm += 24;
              segEndNorm += 24;
            }
            
            // Calculate overlap
            const overlapStart = Math.max(segStartNorm, nightStart);
            const overlapEnd = Math.min(segEndNorm, nightEnd);
            const nightMinutes = Math.max(0, overlapEnd - overlapStart);
            const segmentMinutes = segEnd - segStart;
            const nightFraction = nightMinutes / segmentMinutes;
            
            if (nightFraction > 0) {
              const overlayStartFrac = Math.max(0, (overlapStart - segStartNorm) / (segEnd - segStart));
              const overlayEndFrac = Math.min(1, (overlapEnd - segStartNorm) / (segEnd - segStart));
              
              if (overlayEndFrac > overlayStartFrac) {
                // Store night overlay data for drawing after events
                this.nightOverlays.push({
                  startTheta: startTheta,
                  endTheta: endTheta,
                  radiusFunction: radiusFunction,
                  overlayStartFrac: overlayStartFrac,
                  overlayEndFrac: overlayEndFrac,
                  rawStartAngle: rawStartAngle,
                  rawEndAngle: rawEndAngle,
                  segmentAngle: segmentAngle,
                  day: day,
                  segment: segment,
                  isCircleMode: false
                });
              }
            }
          }
          
          // --- DAY OVERLAY LOGIC FOR SPIRAL MODE ---
          if (day !== null && this.state.showDayOverlay) {
            // Calculate the date for this day to get the day of week
            const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
            const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
            const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
            const dayOfWeek = segmentDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            
            // Create gradient from Monday (white) to Sunday (black)
            let brightness;
            if (dayOfWeek === 0) {
              // Sunday - black (0)
              brightness = 0;
            } else if (dayOfWeek === 6) {
              // Saturday - much darker to separate weekend
              brightness = 50;
            } else {
              // Monday (1) to Friday (5) - progressively darker
              brightness = 255 - (dayOfWeek - 1) * 35;
            }
            
            // Use configurable opacity for day overlay
            const dayOverlayColor = `rgba(${brightness}, ${brightness}, ${brightness}, ${this.state.dayOverlayOpacity})`;
            
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
            // Calculate average radius of this segment to determine how far inward it is
            const startRadius = radiusFunction(startTheta);
            const endRadius = radiusFunction(endTheta);
            const avgRadius = (startRadius + endRadius) / 2;
            
            // Get max radius for normalization
            const { maxRadius } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
            
            // Normalize radius: 0 = outermost, 1 = innermost
            // Clamp to valid range in case of edge cases
            const normalizedRadius = Math.max(0, Math.min(1, 1 - (avgRadius / maxRadius)));
            
            // Calculate darkness: 0 (white/no darkening) at outer edge, increasing toward center
            // Use configurable maximum opacity
            const maxDarkness = this.state.gradientOverlayOpacity;
            const darkness = normalizedRadius * maxDarkness;
            
            const gradientOverlayColor = `rgba(0, 0, 0, ${darkness})`;
            
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
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
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
            let includeMonth = false;
            let includeYear = false;
            try {
              const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
              const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
              const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
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
              if (this.state.dayLabelShowWeekday) {
                parts.push(useShortWeekday ? weekdayShort : weekdayFull);
              }
              includeMonth = this.state.dayLabelShowMonth && (!this.state.dayLabelMonthOnFirstOnly || isFirstOfMonth);
              if (includeMonth) {
                parts.push(useShortMonth ? monthShort : monthFull);
              }
              const dayText = this.state.dayLabelUseOrdinal ? this.dayToOrdinal(dayNumber) : String(dayNumber);
              parts.push(dayText);
              if (this.state.dayLabelShowWeekday && parts.length > 1) parts[0] = parts[0] + ',';
              var fullDayLabel = parts.join(' ');
              includeYear = this.state.dayLabelShowYear && (!this.state.dayLabelYearOnFirstOnly || isFirstOfYear);
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
            
            this.dayNumbers.push({
              x: centerRadius * Math.cos(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerTheta + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              isCircleMode: false,
              radiusFunction: radiusFunction,
              centerTheta: centerTheta,
              centerRadius: centerRadius,
              outerEndClipTheta: endTheta < rawEndAngle - 0.0001 ? endTheta : null,
              onlyNumeric: (!this.state.dayLabelShowWeekday && !includeMonth && !includeYear)
            });
            }
          }
          
        // Store event data for drawing after main segments
          const allEvents = this.getAllEventsForSegment(day, segment);
          if (allEvents.length > 0) {
            // Use cached layout for speed
            this.ensureLayoutCache();
            const { eventToLane } = this.layoutCache;
            // Compute lane assignment inside the hour for non-overlapping sharing within same lane
            const { lanes: hourLanes } = this.computeEventLanes(allEvents);

            // Build local overlap groups within the hour: only overlapping events share space
            const n = allEvents.length;
            const uf = createUnionFind(n);
            const overlapsInHour = (a, b) => !(a.endMinute <= b.startMinute || b.endMinute <= a.startMinute);
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                if (overlapsInHour(allEvents[i], allEvents[j])) uf.unite(i, j);
              }
            }
            const groups = new Map();
            for (let i = 0; i < n; i++) {
              const r = uf.find(i);
              if (!groups.has(r)) groups.set(r, []);
              groups.get(r).push(i);
            }

            if (this.state.overlayStackMode) {
              // Stacked overlap mode with gap filling by sub-splitting on change points
              for (const idxList of groups.values()) {
                // Stable order bottom->top by descending coverage within hour, then lane, then start time
                const ordered = idxList.map(i => {
                  const ev = allEvents[i];
                  const laneFromPersistent = eventToLane.get(ev.event);
                  const lane = (laneFromPersistent !== undefined) ? laneFromPersistent : (hourLanes[i] ?? 0);
                  return { idx: i, lane, startUtcMs: ev.startUtcMs || 0, startMin: ev.startMinute };
                }).sort((a, b) => {
                  if (a.lane !== b.lane) return a.lane - b.lane; // stable bottom->top by lane
                  if (a.startUtcMs !== b.startUtcMs) return a.startUtcMs - b.startUtcMs;
                  return a.startMin - b.startMin;
                });

                // Build change boundaries (in minutes within hour)
                const boundarySet = new Set([0, 60]);
                for (const i of idxList) {
                  const ev = allEvents[i];
                  boundarySet.add(Math.max(0, Math.min(60, ev.startMinute)));
                  boundarySet.add(Math.max(0, Math.min(60, ev.endMinute)));
                }
                const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

                for (let s = 0; s < boundaries.length - 1; s++) {
                  const aMin = boundaries[s];
                  const bMin = boundaries[s + 1];
                  if (bMin <= aMin) continue;
                  // Active events in this sub-interval
                  const active = ordered.filter(({ idx }) => {
                    const ev = allEvents[idx];
                    return ev.startMinute < bMin && ev.endMinute > aMin;
                  });
                  if (active.length === 0) continue;
                  const m = active.length;
                  for (let rank = 0; rank < m; rank++) {
                    const i = active[rank].idx;
                    const eventData = allEvents[i];
                    const subStart = aMin / 60;
                    const subEnd = bMin / 60;
                    const subStartUtcMs = segmentHourStartMs + aMin * 60 * 1000;
                    const subEndUtcMs = segmentHourStartMs + bMin * 60 * 1000;
                    const coverChronologicalStartHourJoin = aMin === 0 && eventData.startUtcMs < segmentHourStartMs;
                    const coverChronologicalEndHourJoin = bMin === 60 && eventData.endUtcMs > segmentHourEndMs;
                    const continuesAcrossSubStart = eventData.startUtcMs < subStartUtcMs;
                    const continuesAcrossSubEnd = eventData.endUtcMs > subEndUtcMs;
                    const hasActualEventStartHere = eventData.startUtcMs >= subStartUtcMs && eventData.startUtcMs < subEndUtcMs;
                    const hasActualEventEndHere = eventData.endUtcMs > subStartUtcMs && eventData.endUtcMs <= subEndUtcMs;
                    const eventSliceStart = (rank === 0) ? 0 : (rank / m);
                    const eventSliceEnd = 1;
                    const segmentAngleSize = rawEndAngle - rawStartAngle;
                    let timeStartTheta = rawStartAngle + (1 - subEnd) * segmentAngleSize;
                    let timeEndTheta = rawStartAngle + (1 - subStart) * segmentAngleSize;
                    timeStartTheta = Math.max(timeStartTheta, startTheta);
                    timeEndTheta = Math.min(timeEndTheta, endTheta);
                    if (timeEndTheta > timeStartTheta) {
                      this.eventSegments.push({
                        timeStartTheta,
                        timeEndTheta,
                        eventSliceStart,
                        eventSliceEnd,
                        edgeSliceStart: rank / m,
                        edgeSliceEnd: (rank + 1) / m,
                        dividerStroke: active.length > 1 && eventSliceStart > 0,
                        coverStartEdge: coverChronologicalEndHourJoin || (!hasActualEventEndHere && continuesAcrossSubEnd),
                        coverEndEdge: coverChronologicalStartHourJoin || (!hasActualEventStartHere && continuesAcrossSubStart),
                        drawStartEdge: hasActualEventEndHere && (
                          this.state.showAllEventBoundaryStrokes ||
                          (active.length > 1 && isEventOverlappedAtUtc(eventData.event, subEndUtcMs - 1)) ||
                          isEventTouchingAtEndUtc(eventData.event, subEndUtcMs)
                        ),
                        drawEndEdge: hasActualEventStartHere && (
                          this.state.showAllEventBoundaryStrokes ||
                          (active.length > 1 && isEventOverlappedAtUtc(eventData.event, subStartUtcMs + 1)) ||
                          isEventTouchingAtStartUtc(eventData.event, subStartUtcMs)
                        ),
                        originalRadiusFunction: radiusFunction,
                        color: eventData.color,
                        event: eventData.event,
                        rawStartAngle,
                        rawEndAngle,
                        day,
                        segment
                      });
                    }
                  }
                }
              }
            } else {
              // Uniform-thickness within overlap groups mode (current)
              // Optionally make thickness uniform across the full duration of each event
              // by using the maximum overlap this specific event encounters across all its hours
              const getLaneCountForEvent = (evData) => {
                if (!CONFIG.UNIFORM_EVENT_THICKNESS) {
                  // Fallback to per-hour lane count
                  const { numLanes } = this.computeEventLanes(allEvents);
                  return Math.max(1, numLanes);
                }
                return this.getMaxOverlapForEventAcrossHours(evData.event);
              };

              // Precompute slice positions per event index based on group-local needs
              const eventSliceStartArr = new Array(n).fill(0);
              const eventSliceEndArr = new Array(n).fill(1);
              for (const idxList of groups.values()) {
                let groupRequiredCount = 1;
                for (const i of idxList) {
                  groupRequiredCount = Math.max(groupRequiredCount, getLaneCountForEvent(allEvents[i]));
                }
                const persistentLanes = idxList.map(i => {
                  const pl = eventToLane.get(allEvents[i].event);
                  return (pl !== undefined) ? pl : (hourLanes[i] ?? 0);
                });
                const uniqueSorted = Array.from(new Set(persistentLanes)).sort((a, b) => a - b);
                const laneToCompact = new Map(uniqueSorted.map((lane, i) => [lane, i]));
                const compactLaneCount = uniqueSorted.length;
                const groupLaneCount = Math.max(groupRequiredCount, compactLaneCount);
                for (let k = 0; k < idxList.length; k++) {
                  const i = idxList[k];
                  const compactLane = laneToCompact.get(persistentLanes[k]) || 0;
                  const sliceH = 1 / groupLaneCount;
                  eventSliceStartArr[i] = compactLane * sliceH;
                  eventSliceEndArr[i] = (compactLane + 1) * sliceH;
                }
              }

            for (let i = 0; i < allEvents.length; i++) {
              const eventData = allEvents[i];
              const minuteStart = eventData.startMinute / 60;
              const minuteEnd = eventData.endMinute / 60;
                const eventStartUtcMs = segmentHourStartMs + eventData.startMinute * 60 * 1000;
                const eventEndUtcMs = segmentHourStartMs + eventData.endMinute * 60 * 1000;
                const coverChronologicalStartHourJoin = eventData.startMinute === 0 && eventData.startUtcMs < segmentHourStartMs;
                const coverChronologicalEndHourJoin = eventData.endMinute === 60 && eventData.endUtcMs > segmentHourEndMs;
                const hasActualEventStartHere = eventData.startUtcMs >= eventStartUtcMs && eventData.startUtcMs < eventEndUtcMs;
                const hasActualEventEndHere = eventData.endUtcMs > eventStartUtcMs && eventData.endUtcMs <= eventEndUtcMs;
                const eventSliceStart = eventSliceStartArr[i];
                const eventSliceEnd = eventSliceEndArr[i];
            const segmentAngleSize = rawEndAngle - rawStartAngle;
            let timeStartTheta = rawStartAngle + (1 - minuteEnd) * segmentAngleSize;
            let timeEndTheta = rawStartAngle + (1 - minuteStart) * segmentAngleSize;
            timeStartTheta = Math.max(timeStartTheta, startTheta);
            timeEndTheta = Math.min(timeEndTheta, endTheta);
            if (timeEndTheta > timeStartTheta) {
              this.eventSegments.push({
                    timeStartTheta,
                    timeEndTheta,
                    eventSliceStart,
                    eventSliceEnd,
                edgeSliceStart: eventSliceStart,
                edgeSliceEnd: eventSliceEnd,
                dividerStroke: eventSliceStart > 0,
                coverStartEdge: coverChronologicalEndHourJoin,
                coverEndEdge: coverChronologicalStartHourJoin,
                drawStartEdge: hasActualEventEndHere && (
                  this.state.showAllEventBoundaryStrokes ||
                  ((eventSliceStart > 0 || eventSliceEnd < 1) && isEventOverlappedAtUtc(eventData.event, eventEndUtcMs - 1)) ||
                  isEventTouchingAtEndUtc(eventData.event, eventEndUtcMs)
                ),
                drawEndEdge: hasActualEventStartHere && (
                  this.state.showAllEventBoundaryStrokes ||
                  ((eventSliceStart > 0 || eventSliceEnd < 1) && isEventOverlappedAtUtc(eventData.event, eventStartUtcMs + 1)) ||
                  isEventTouchingAtStartUtc(eventData.event, eventStartUtcMs)
                ),
                originalRadiusFunction: radiusFunction,
                color: eventData.color,
                event: eventData.event,
                    rawStartAngle,
                    rawEndAngle,
                    day,
                    segment
                  });
                }
            }
            }
          }
          
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
      
      // Draw month lines on top of all segments
      this.drawMonthLines();

      // Draw arc lines on top of everything
      this.drawArcLines();
      
      // Draw midnight lines on top of all segments
      this.drawMidnightLines();
      
      // Draw overlays on top of everything
      this.drawGradientOverlays();
      this.drawDayOverlays();
      this.drawNightOverlays();
      
      // Calculate color for selected segment before drawing highlighted segments
      if (this.mouseState.selectedSegment) {
        const segment = this.mouseState.selectedSegment;
        this.mouseState.selectedSegment.calculatedColor = this.calculateSelectedSegmentColor(segment.day, segment.segment);
      }
      
      // Draw highlighted segments on top of everything
      this.drawHighlightedSegments();

      this.ctx.restore();
      
      // Draw tooltip on top of everything (not affected by transforms)
      this.drawTooltip();
      
      // Draw detail view if in detail view (after all other drawing)
      if (this.state.detailViewDay !== null && !this.mouseState.isHandleDragging) {
        this.drawDetailView(maxRadius);
      }
    
    // Draw current time/date display if enabled
    if (this.state.showTimeDisplay) {
      this.drawTimeDisplay(canvasWidth, canvasHeight);
    }

    this.drawTouchJoystickOverlay();
    }
});
