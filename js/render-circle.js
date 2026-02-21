// Circle Rendering and Labels
Object.assign(SpiralCalendar.prototype, {
  getYearProgressForColor(date = null) {
    const referenceDate = date instanceof Date ? date : new Date();
    const year = referenceDate.getUTCFullYear();
    const yearStartUtc = Date.UTC(year, 0, 1, 0, 0, 0, 0);
    const nextYearStartUtc = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0);
    const daysInYear = Math.max(1, Math.round((nextYearStartUtc - yearStartUtc) / (24 * 60 * 60 * 1000)));
    const dayStartUtc = Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
      0, 0, 0, 0
    );
    const dayIndex = Math.max(0, Math.min(daysInYear - 1, Math.floor((dayStartUtc - yearStartUtc) / (24 * 60 * 60 * 1000))));
    const progress = dayIndex / Math.max(1, daysInYear - 1);
    return {
      dayIndex,
      daysInYear,
      progress
    };
  },

  generateSeasonalColor(date = null) {
    const { progress } = this.getYearProgressForColor(date);
    // Requested mapping: Jan 1 -> 0, Dec 31 -> 255
    const hueByte = Math.round(progress * 255);
    const hue = (hueByte / 255) * 360;
    const saturation = 80;
    const lightness = 60;
    return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
  },

  generateRandomColor(calendarName = null, eventDate = null) {
    const mode = this.state?.colorMode || 'random';
    if (mode === 'single') {
      return this.state.singleColor || '#4CAF50';
    }
    if (mode === 'calendar') {
      // Use calendar color if available, otherwise fallback to random
      if (calendarName && this.state.calendarColors && this.state.calendarColors[calendarName]) {
        return this.state.calendarColors[calendarName];
      }
      // Fallback to random if calendar color not found
      const hue = Math.random() * 360;
      return this.hslToHex(`hsl(${hue}, 70%, 60%)`);
    }
    if (mode === 'colorblind') {
      // Okabe–Ito colorblind-safe qualitative palette (excluding black)
      const palette = [
        '#E69F00', // orange
        '#56B4E9', // sky blue
        '#009E73', // bluish green
        '#F0E442', // yellow
        '#0072B2', // blue
        '#D55E00', // vermillion
        '#CC79A7'  // reddish purple
      ];
      return palette[Math.floor(Math.random() * palette.length)];
    }
    if (mode === 'seasonal') {
      return this.generateSeasonalColor(eventDate);
    }
    if (mode === 'saturation') {
      const hue = Math.random() * 360;
      const saturation = Math.max(0, Math.min(100, Number(this.state?.saturationLevel ?? 80)));
      const lightnessBase = saturation < 15 ? 62 : 58;
      const lightnessRange = saturation < 15 ? 14 : 10;
      const lightness = lightnessBase + Math.random() * lightnessRange;
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    if (mode === 'monoHue') {
      const hue = this.state.baseHue || 200;
      const saturation = 60 + Math.random() * 30; // 60-90%
      const lightness = 60 + Math.random() * 15; // 60-75%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    if (mode === 'pastel') {
      const hue = Math.random() * 360;
      const saturation = 45 + Math.random() * 15; // 45-60%
      const lightness = 75 + Math.random() * 10; // 75-85%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    // default 'random'
    const hue = Math.random() * 360;
    const saturation = 60 + Math.random() * 30; // 60-90% saturation
    const lightness = 70 + Math.random() * 10; // 70-80% lightness
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  },

  generateRandomColorForStorage(calendarName = null, eventDate = null) {
    const mode = this.state?.colorMode || 'random';
    if (mode === 'calendar') {
      // Pleasant random color independent of calendar color
      const hue = Math.random() * 360;
      return this.hslToHex(`hsl(${hue}, 70%, 60%)`);
    }
    const generated = this.generateRandomColor(calendarName, eventDate);
    return generated.startsWith('#') ? generated : this.hslToHex(generated);
  },

  getDisplayColorForEvent(event) {
    try {
      if (this.state && this.state.colorMode === 'seasonal') {
        const eventStart = event && event.start ? new Date(event.start) : new Date();
        const seasonal = this.generateSeasonalColor(eventStart);
        return seasonal.startsWith('#') ? seasonal : this.hslToHex(seasonal);
      }
      if (this.state && this.state.colorMode === 'calendar') {
        const calName = event && ((event.calendar || 'Home').trim());
        const calColor = this.state.calendarColors && this.state.calendarColors[calName];
        if (calColor) {
          return calColor;
        }
      }
      const c = event && event.color ? event.color : '#888888';
      return c.startsWith('#') ? c : this.hslToHex(c);
    } catch (_) {
      return '#888888';
    }
  },

  calculateSelectedSegmentColor(day, segment) {
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
    const segmentColor = this.cache.colors[colorIndex];
    
    const eventInfo = this.getEventColorForSegment(day, segment);
    const virtualEventActive = this.virtualEvent && this.virtualEvent.segmentId === segmentId;
    
    if (virtualEventActive) {
      return this.virtualEvent.color;
    } else if (eventInfo) {
      return eventInfo.color;
    } else if (segmentColor === CONFIG.BLANK_COLOR) {
      // Generate the same random color that would be used for a new event
      const hue = (segmentId * 137.5) % 360;
      const saturation = 60 + (segmentId % 3) * 15; // 60-90% saturation
      const lightness = 70 + (segmentId % 2) * 10; // 70-80% lightness
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    } else {
      return segmentColor;
      }
    },

    drawHighlightedSegments() {
      const isMobile = isMobileDevice();
      for (const segment of this.highlightedSegments) {
        if (isMobile && segment.isHovered) continue; // suppress hover highlight on mobile
        if (segment.isHovered) {
          this.ctx.strokeStyle = CONFIG.getHoverSegmentColor();
          this.ctx.lineWidth = CONFIG.HOVER_BORDER_WIDTH;
        } else if (segment.isSelected) {
          // Use event color for selected segment stroke, or random color for blank segments
          let strokeColor;
          // Prioritize calculated color (includes virtual event color) over existing event color
          if (this.mouseState.selectedSegment && this.mouseState.selectedSegment.calculatedColor) {
            strokeColor = this.mouseState.selectedSegment.calculatedColor;
          } else if (segment.eventInfo && segment.eventInfo.color) {
            strokeColor = segment.eventInfo.color;
          } else if (segment.segmentColor === CONFIG.BLANK_COLOR) {
            // Default to yellow until detail view calculates the color
            strokeColor = CONFIG.SELECTED_SEGMENT_COLOR;
          } else {
            strokeColor = segment.segmentColor;
          }
          this.ctx.strokeStyle = strokeColor;
          this.ctx.lineWidth = CONFIG.SELECTED_BORDER_WIDTH;
        }
        
        if (segment.isCircleMode) {
          // Circle mode highlight
          this.ctx.beginPath();
          
          // Draw the ring segment path
          // Outer arc
          this.ctx.arc(0, 0, segment.outerRadius, segment.startAngle, segment.endAngle, true);
          // Radial line to inner radius
          this.ctx.lineTo(segment.innerRadius * Math.cos(segment.endAngle), segment.innerRadius * Math.sin(segment.endAngle));
          // Inner arc (counter-clockwise)
          this.ctx.arc(0, 0, segment.innerRadius, segment.endAngle, segment.startAngle, false);
          // Radial line back to start
          this.ctx.lineTo(segment.outerRadius * Math.cos(segment.startAngle), segment.outerRadius * Math.sin(segment.startAngle));
          
          this.ctx.closePath();
          this.ctx.stroke();
        } else {
          // Spiral mode highlight
          // Redraw the segment path for highlighting
          let angle = -segment.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          let radius = segment.radiusFunction(segment.startTheta);
          let x = radius * Math.cos(angle);
          let y = radius * Math.sin(angle);
          
          this.ctx.beginPath();
          this.ctx.moveTo(x, y);

          // Draw inner arc from start to end
          const innerSteps = Math.ceil(CONFIG.ARC_RESOLUTION * (segment.endTheta - segment.startTheta) / segment.segmentAngle);
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
            const rawAngle = segment.startTheta + t * (segment.endTheta - segment.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = segment.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }

          // Draw radial line outwards (one full turn)
          const outerEnd = segment.endTheta + 2 * Math.PI;
          angle = -outerEnd + CONFIG.INITIAL_ROTATION_OFFSET;
          radius = segment.radiusFunction(outerEnd);
          this.ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));

          // Draw outer arc back to start edge
        for (let i = 1; i <= innerSteps; i++) {
          const t = i / innerSteps;
            const rawAngle = outerEnd - t * (segment.endTheta - segment.startTheta);
            angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
            radius = segment.radiusFunction(rawAngle);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
            this.ctx.lineTo(x, y);
          }

          // Only close path if we're drawing the leading edge
          if (segment.drawLeadingEdge) {
            this.ctx.closePath();
          }
          
          // Draw the segment outline
          this.ctx.stroke();
          
          // Draw the leading edge only for highlighted segments
          this.ctx.beginPath();
          const leadingAngle = -segment.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
          const innerRadius = segment.radiusFunction(segment.startTheta);
          const outerRadius = segment.radiusFunction(segment.startTheta + 2 * Math.PI);
          
          this.ctx.moveTo(
            innerRadius * Math.cos(leadingAngle),
            innerRadius * Math.sin(leadingAngle)
          );
          this.ctx.lineTo(
            outerRadius * Math.cos(leadingAngle),
            outerRadius * Math.sin(leadingAngle)
          );
          
          this.ctx.stroke();
        }
      }
    },

  drawEventSegments() {
    for (const eventSegment of this.eventSegments) {
      if (eventSegment.isCircleMode) {
        // Circle mode event (no stroke to avoid arc lines on overlaps)
        this.drawCircleSegment(
          eventSegment.innerRadius,
          eventSegment.outerRadius,
          -eventSegment.timeStartTheta,
          -eventSegment.timeEndTheta,
          eventSegment.color,
          false, false, false, false,
          eventSegment.timeStartTheta,
          eventSegment.timeEndTheta,
          false,
          false,
          true, // isEventSubSegment = true
          false, false, false, // isNoonSegment, isSixAMSegment, isSixPMSegment
          null, null // day, segment
        );
      } else {
        // Spiral mode event: custom draw to avoid outer-arc switching glitches
        this.drawEventSpiralSubsegment(eventSegment);
        }
      }
    },

    drawMidnightLines() {
      this.ctx.save();
      
      for (const line of this.midnightLines) {
        // Check if this line type is enabled
        if (line.isNoonLine && !this.state.showNoonLines) {
          continue;
        } else if ((line.isSixAMLine || line.isSixPMLine) && !this.state.showSixAmPmLines) {
          continue;
        } else if (!line.isNoonLine && !line.isSixAMLine && !line.isSixPMLine && !this.state.showMidnightLines) {
          continue;
        }
        
        // Set stroke width based on line type
        if (line.isNoonLine) {
          this.ctx.lineWidth = CONFIG.NOON_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else if (line.isSixAMLine) {
          this.ctx.lineWidth = CONFIG.SIX_AM_PM_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else if (line.isSixPMLine) {
          this.ctx.lineWidth = CONFIG.SIX_AM_PM_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Use same color as midnight
        } else {
          this.ctx.lineWidth = CONFIG.MIDNIGHT_BORDER_WIDTH;
          this.ctx.strokeStyle = CONFIG.MIDNIGHT_SEGMENT_COLOR; // Black for midnight
        }
        
        if (line.isCircleMode) {
          // Circle mode midnight line
          
          if (line.isLeadingEdge) {
            // Leading edge (0:00-1:00 segment)
            this.ctx.beginPath();
            this.ctx.moveTo(line.innerRadius * Math.cos(line.startAngle), line.innerRadius * Math.sin(line.startAngle));
            this.ctx.lineTo(line.outerRadius * Math.cos(line.startAngle), line.outerRadius * Math.sin(line.startAngle));
            this.ctx.stroke();
          } else {
            // Trailing edge (23:00-0:00 segment)
            this.ctx.beginPath();
            this.ctx.moveTo(line.innerRadius * Math.cos(line.endAngle), line.innerRadius * Math.sin(line.endAngle));
            this.ctx.lineTo(line.outerRadius * Math.cos(line.endAngle), line.outerRadius * Math.sin(line.endAngle));
            this.ctx.stroke();
          }
        } else {
          // Spiral mode midnight line
          
          if (line.isLeadingEdge) {
            // Leading edge (0:00-1:00 segment, noon, 6:00 AM, 6:00 PM)
            const leadingAngle = -line.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const innerRadius = line.radiusFunction(line.startTheta);
            const outerRadius = line.radiusFunction(line.startTheta + 2 * Math.PI);
            
            this.ctx.beginPath();
            this.ctx.moveTo(
              innerRadius * Math.cos(leadingAngle),
              innerRadius * Math.sin(leadingAngle)
            );
            this.ctx.lineTo(
              outerRadius * Math.cos(leadingAngle),
              outerRadius * Math.sin(leadingAngle)
            );
            this.ctx.stroke();
          } else {
            // Trailing edge (23:00-0:00 segment)
            const trailingAngle = -line.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const innerRadius = line.radiusFunction(line.endTheta);
            const outerRadius = line.radiusFunction(line.endTheta + 2 * Math.PI);
            
            this.ctx.beginPath();
            this.ctx.moveTo(
              innerRadius * Math.cos(trailingAngle),
              innerRadius * Math.sin(trailingAngle)
            );
            this.ctx.lineTo(
              outerRadius * Math.cos(trailingAngle),
              outerRadius * Math.sin(trailingAngle)
            );
            this.ctx.stroke();
          }
        }
      }
      
      this.ctx.restore();
    },

    drawMonthLines() {
      // Check if month lines are enabled
      if (!this.state.showMonthLines) {
        return;
      }
      this.ctx.save();
      this.ctx.strokeStyle = CONFIG.MONTH_SEGMENT_COLOR;
      
      // Separate spiral and circle mode month lines
      const spiralLines = [];
      const circleLines = [];
      
      for (const line of this.monthLines) {
        if (line.isCircleMode) {
          circleLines.push(line);
        } else {
          spiralLines.push(line);
        }
      }
      
      // Make stroke width scale with radius (distance from center)
      const maxSpiralRadius = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * this.state.spiralScale;
      
      // Draw circle mode month lines as individual arc segments (like spiral mode)
      for (const line of circleLines) {
        // Debug: Check if we have valid data
        if (typeof line.startAngle === 'undefined' || typeof line.endAngle === 'undefined' || 
            typeof line.outerRadius === 'undefined') {
          console.warn('Invalid month line data:', line);
          continue;
        }
        
        // Scale stroke width based on radius position (smaller near center, larger near outside)
        const baseStrokeWidth = CONFIG.MONTH_BORDER_WIDTH;
        const strokeWidthScale = Math.max(0.75, Math.min(2.5, line.outerRadius / maxSpiralRadius));
        const scaledStrokeWidth = baseStrokeWidth * strokeWidthScale;
        this.ctx.lineWidth = scaledStrokeWidth;
        
        // Draw the outer arc segment using the same method as segment drawing
        this.ctx.beginPath();
        this.ctx.arc(0, 0, line.outerRadius, line.startAngle, line.endAngle, true);
        this.ctx.stroke();
      }
      
      // Draw spiral mode month lines with variable stroke width
      for (const line of spiralLines) {
        // Spiral mode: draw the outer arc of the segment with variable stroke width
        const outerStart = line.startTheta + 2 * Math.PI;
        const outerEnd = line.endTheta + 2 * Math.PI;
        
        // Calculate the maximum radius for this line to determine stroke width scaling
        const maxRadius = line.radiusFunction(outerStart);
        const minRadius = line.radiusFunction(outerEnd);
        const avgRadius = (maxRadius + minRadius) / 2;
        
        // Scale stroke width based on radius position (smaller near center, larger near outside)
        // Use a base stroke width and scale it relative to the radius
        const baseStrokeWidth = CONFIG.MONTH_BORDER_WIDTH;
        const maxSpiralRadius = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * this.state.spiralScale;
        const strokeWidthScale = Math.max(0.7, Math.min(2.5, avgRadius / maxSpiralRadius));
        const scaledStrokeWidth = baseStrokeWidth * strokeWidthScale;
        
        this.ctx.lineWidth = scaledStrokeWidth;
        
        // Draw outer arc
        const steps = Math.ceil(CONFIG.ARC_RESOLUTION * (line.endTheta - line.startTheta) / (2 * Math.PI / CONFIG.SEGMENTS_PER_DAY));
        this.ctx.beginPath();
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const rawAngle = outerStart + t * (outerEnd - outerStart);
          const angle = -rawAngle + CONFIG.INITIAL_ROTATION_OFFSET;
          const radius = line.radiusFunction(rawAngle);
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          
          if (i === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        
        this.ctx.stroke();
      }
      
      this.ctx.restore();
    },

    drawHourLabels(maxRadius) {
      if (!this.state.showHourNumbers || this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment) return;
      
      // Fixed distance from outer edge (in pixels) instead of proportional to radius
      const fixedDistance = 20; // pixels from the outer edge
      const labelRadius = maxRadius + fixedDistance;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Calculate dynamic font size based on spiral scale
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const minDimension = Math.min(canvasWidth, canvasHeight);
      const fontSize = Math.max(0, Math.min(26, minDimension * this.state.spiralScale * 0.082));
      
      this.ctx.save();
      this.ctx.font = getFontString(fontSize);
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
      // Determine which hours to show
      const hoursToShow = [];
      for (let hour = 0; hour < CONFIG.SEGMENTS_PER_DAY; hour++) {
        // Check if we should show this hour based on options
        if (this.state.showEverySixthHour) {
          // Only show every 6th hour (0, 6, 12, 18)
          if (hour % 6 === 0) {
            hoursToShow.push(hour);
          }
        } else {
          // Show all hours
          hoursToShow.push(hour);
        }
      }
      
      for (const hour of hoursToShow) {
        // Center angle of the segment (outermost day)
        // Position offset: 0=start, 1=middle, 2=end
        const hourOffset = this.state.hourNumbersPosition * 0.5 - 0.5;
        const angle = ((hour + hourOffset) * segmentAngle) + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);
        // Keep text upright: rotate canvas, draw, then restore
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Apply rotation based on upright option
        if (this.state.hourNumbersUpright) {
          // Keep numbers upright - compensate for spiral rotation
        if (this.state.staticMode) {
            this.ctx.rotate(Math.PI); // Static mode: just flip 180°
        } else {
            // Non-static mode: compensate for current spiral rotation
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          // Normal rotation behavior
          if (this.state.staticMode) {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI + (hour + hourOffset) * segmentAngle);
          } else {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET + (hour + hourOffset) * segmentAngle);
        }
        this.ctx.rotate(Math.PI/2); // make numbers upright
        }
        
        // Determine the display number based on startAtOne option
        let displayNumber = hour;
        if (this.state.hourNumbersStartAtOne) {
          // Shift by 1: where 0 was, show 24; where 1 was, show 1, etc.
          displayNumber = hour === 0 ? 24 : hour;
        }
        
        this.ctx.fillText(displayNumber.toString(), 0, 0);
        this.ctx.restore();
      }
      this.ctx.restore();
    },

    drawHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Kept for direct drawing if needed; primary flow now collects and draws later
      this._renderHourNumberAtComputedPosition(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius, outerRadius);
    },

    collectHourNumberInSegment(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Compute properties as in drawing function, but store for later draw above events
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const actualHour = ((segmentId % CONFIG.SEGMENTS_PER_DAY) + CONFIG.SEGMENTS_PER_DAY) % CONFIG.SEGMENTS_PER_DAY;

      // Calculate the final displayed hour (after position shifting)
      let displayHour = actualHour;
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayHour = (displayHour + 0 + 24) % 24;
        } else {
          displayHour = (displayHour + 1 + 24) % 24;
        }
      }

      // Check "Show only every 6th hour" against the final displayed hour
      let shouldShow = true;
      if (this.state.showEverySixthHour) shouldShow = displayHour % 6 === 0;
      if (!shouldShow) return;

      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      let centerTheta;
      if (this.state.hourNumbersPosition === 1) {
        const positionOffset = this.state.hourNumbersInsideSegment ? -0.5 : 0.5;
        centerTheta = (rawStartAngle + rawEndAngle) / 2 + (positionOffset * segmentAngle);
      } else {
        centerTheta = (rawStartAngle + rawEndAngle) / 2;
      }

      let labelRadius;
      let computedInner = innerRadius;
      let computedOuter = outerRadius;
      if (computedInner === null || computedOuter === null) {
        computedInner = radiusFunction(centerTheta);
        computedOuter = radiusFunction(centerTheta + 2 * Math.PI);
      }
      if (this.state.hourNumbersOutward) {
        if (this.state.hourNumbersInsideSegment) {
          labelRadius = (computedInner + computedOuter) / 2;
        } else {
          const fixedDistance = 20;
          labelRadius = computedOuter + fixedDistance;
        }
      } else {
        labelRadius = (computedInner + computedOuter) / 2;
      }

      // Compute dynamic font size based on segment geometry (similar to day numbers)
      const centerRadius = (computedInner + computedOuter) / 2;
      const radialHeight = computedOuter - computedInner;
      const arcWidth = centerRadius * segmentAngle;
      const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
      const fontSize = Math.max(1, Math.min(24, maxDimension));

      const angle = -centerTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = labelRadius * Math.cos(angle);
      const y = labelRadius * Math.sin(angle);

      this.hourNumbersInSegments.push({
        x, y, centerTheta, actualHour, fontSize
      });
    },

    drawHourNumbersInSegments() {
      for (const item of this.hourNumbersInSegments) {
        const { x, y, centerTheta, actualHour } = item;
        this.ctx.save();
        this.ctx.translate(x, y);

        if (this.state.hourNumbersUpright) {
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          if (this.state.staticMode) {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI - centerTheta);
          } else {
            this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - centerTheta);
          }
          this.ctx.rotate(Math.PI/2);
        }

        let displayNumber = actualHour;
        if (this.state.hourNumbersStartAtOne) {
          displayNumber = actualHour === 0 ? 24 : actualHour;
        }
        if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
          if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
            displayNumber = (displayNumber + 0 + 24) % 24;
          } else {
            displayNumber = (displayNumber + 1 + 24) % 24;
          }
        }
        // Apply start at one functionality to shifted numbers
        if (this.state.hourNumbersStartAtOne && displayNumber === 0) {
          displayNumber = 24;
        }

        this.ctx.fillStyle = CONFIG.LABEL_COLOR;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = getFontString(item.fontSize);
        this.ctx.fillText(displayNumber.toString(), 0, 0);
        this.ctx.restore();
      }
    },

    _renderHourNumberAtComputedPosition(startTheta, endTheta, radiusFunction, segment, day, rawStartAngle, rawEndAngle, innerRadius = null, outerRadius = null) {
      // Calculate the actual hour this segment represents in the spiral
      // The spiral counts up from outside in, so we need to calculate the hour based on position
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const actualHour = ((segmentId % CONFIG.SEGMENTS_PER_DAY) + CONFIG.SEGMENTS_PER_DAY) % CONFIG.SEGMENTS_PER_DAY;
      
      // Determine if this segment should show a number
      // Calculate the final displayed hour (after position shifting) for the 6th hour check
      let displayHour = actualHour;
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayHour = (displayHour + 0 + 24) % 24;
        } else {
          displayHour = (displayHour + 1 + 24) % 24;
        }
      }
      
      let shouldShow = true;
      if (this.state.showEverySixthHour) {
        // Only show every 6th hour (0, 6, 12, 18)
        shouldShow = displayHour % 6 === 0;
      }
      
      if (!shouldShow) return;
      
      // Calculate the center of the segment
      let centerTheta;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Apply position offset for middle position (1), keep others at center
      if (this.state.hourNumbersPosition === 1) {
        // Middle position: shift by half a segment
        // Inside segment numbers: -0.5, Outside segment numbers: +0.5
        const positionOffset = this.state.hourNumbersInsideSegment ? -0.5 : 0.5;
        centerTheta = (rawStartAngle + rawEndAngle) / 2 + (positionOffset * segmentAngle);
      } else {
        // Other positions: always at center (no position offset)
        centerTheta = (rawStartAngle + rawEndAngle) / 2;
      }
      // Position the number in the vertical center of the segment
      // Use provided inner/outer radius for circle mode, or calculate for spiral mode
      let labelRadius;
      if (innerRadius !== null && outerRadius !== null) {
        // Circle mode: use the provided inner and outer radius
        if (this.state.hourNumbersOutward) {
          if (this.state.hourNumbersInsideSegment) {
            // Place numbers in the center of the segment (relative positioning)
            labelRadius = (innerRadius + outerRadius) / 2;
          } else {
            // Place fixed distance outward (fixed positioning)
            const fixedDistance = 20; // pixels from the outer edge
            labelRadius = outerRadius + fixedDistance;
          }
        } else {
          labelRadius = (innerRadius + outerRadius) / 2;
        }
      } else {
        // Spiral mode: calculate both inner and outer radius to find the center
        const innerRadius = radiusFunction(centerTheta);
        const outerRadius = radiusFunction(centerTheta + 2 * Math.PI);
        if (this.state.hourNumbersOutward) {
          if (this.state.hourNumbersInsideSegment) {
            // Place numbers in the center of the segment (relative positioning)
            labelRadius = (innerRadius + outerRadius) / 2;
          } else {
            // Place fixed distance outward (fixed positioning)
            const fixedDistance = 20; // pixels from the outer edge
            labelRadius = outerRadius + fixedDistance;
          }
        } else {
          labelRadius = (innerRadius + outerRadius) / 2; // Vertical center of the segment
        }
      }
      const angle = -centerTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = labelRadius * Math.cos(angle);
      const y = labelRadius * Math.sin(angle);
      
      this.ctx.save();
      this.ctx.translate(x, y);
      
      // Apply rotation based on upright option
      if (this.state.hourNumbersUpright) {
        // Keep numbers upright - compensate for spiral rotation
        if (this.state.staticMode) {
          this.ctx.rotate(Math.PI); // Static mode: just flip 180°
        } else {
          // Non-static mode: compensate for current spiral rotation
          this.ctx.rotate(this.state.rotation);
        }
      } else {
        // Normal rotation behavior
        if (this.state.staticMode) {
          this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - Math.PI - centerTheta);
        } else {
          this.ctx.rotate(-CONFIG.INITIAL_ROTATION_OFFSET - centerTheta);
        }
        this.ctx.rotate(Math.PI/2); // make numbers upright
      }
      
      // Determine the display number based on the actual hour
      let displayNumber = actualHour;
      if (this.state.hourNumbersStartAtOne) {
        // Shift by 1: where 0 was, show 24; where 1 was, show 1, etc.
        displayNumber = actualHour === 0 ? 24 : actualHour;
      }

      // Rename the labels based on position (for both inside and outside segment numbers)
      if (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1) {
        // Position 0 and 1: shift back by 1 hour, wrapping around
        if(this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1){
          displayNumber = (displayNumber + 0 + 24) % 24;
        } else {
          displayNumber = (displayNumber + 1 + 24) % 24;
        }
      }
      // Position 2: no shift (keep original number)
      
      // Apply start at one functionality to shifted numbers
      if (this.state.hourNumbersStartAtOne && displayNumber === 0) {
        displayNumber = 24;
      }

      
      // Calculate dynamic font size based on spiral scale
      const canvasWidth = this.canvas.clientWidth;
      const canvasHeight = this.canvas.clientHeight;
      const minDimension = Math.min(canvasWidth, canvasHeight);
      const fontSize = Math.max(1, Math.min(24, minDimension * this.state.spiralScale * 0.075));
      
      // Set text properties (same as regular hour numbers)
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      this.ctx.font = getFontString(fontSize);
      
      this.ctx.fillText(displayNumber.toString(), 0, 0);
      this.ctx.restore();
    },

    drawDayNumbers() {
      // Only draw if day numbers are enabled
      if (!this.state.showDayNumbers) return;
      
      this.ctx.save();
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
    // 7.5 degrees in radians (used if upright is off)
      const tiltRadians = 7.5 * Math.PI / 180;
    const onlyDayNumber = !this.state.dayLabelShowWeekday && !this.state.dayLabelShowMonth && !this.state.dayLabelShowYear;
    
    // Helper: draw text following the local spiral tangent by placing characters sequentially
    const drawCurvedText = (item) => {
      const text = item.text;
      if (!text) return;
      // Base angle along spiral
      const baseTheta = item.centerTheta !== undefined ? item.centerTheta : (item.centerAngle || 0);
      const labelRadius = item.centerRadius || 0;
      // Start slightly before center so text centers around the stored anchor
      // Estimate half text angular length
      if (!isFinite(labelRadius) || labelRadius < 1) return;
      this.ctx.save();
      const fontPx = Math.max(1, Math.floor(item.fontSize || 0));
      this.ctx.font = getFontString(fontPx);
      // Precompute kerning-aware per-character advances using cumulative widths
      const advances = [];
      let prevWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const sub = text.slice(0, i + 1);
        const w = this.ctx.measureText(sub).width;
        const adv = Math.max(0.5, w - prevWidth);
        advances.push(adv);
        prevWidth = w;
      }
      const totalWidth = prevWidth;
      if (!isFinite(totalWidth) || totalWidth < 0.5) { this.ctx.restore(); return; }
      // Left-align: begin at anchor and advance along path, with a small pre-offset so text starts earlier
      let theta = baseTheta;
      // Helper to compute arc-length-based theta delta for a given width using mid-curve
      const midR = (t) => {
        if (!item.radiusFunction || item.isCircleMode) return labelRadius;
        const rin = item.radiusFunction(t);
        const rout = item.radiusFunction(t + 2 * Math.PI);
        return (rin + rout) / 2;
      };
      const stepByArc = (thetaStart, targetWidth) => {
        let r0 = item.radiusFunction && !item.isCircleMode ? midR(thetaStart) : labelRadius;
        if (!isFinite(r0) || r0 < 1) r0 = 1;
        let dTheta = Math.max(1e-5, targetWidth / r0);
        let thetaEnd = thetaStart - dTheta;
        let r1 = item.radiusFunction && !item.isCircleMode ? midR(thetaEnd) : labelRadius;
        const x0 = r0 * Math.cos(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
        const y0 = r0 * Math.sin(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
        const x1 = r1 * Math.cos(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
        const y1 = r1 * Math.sin(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
        let ds = Math.hypot(x1 - x0, y1 - y0);
        if (ds > 0.0001) {
          dTheta = dTheta * (targetWidth / ds);
          thetaEnd = thetaStart - dTheta;
        }
        if (!isFinite(dTheta) || dTheta <= 0) dTheta = 1e-4;
        dTheta = Math.min(dTheta, 0.5);
        return dTheta;
      };
      // Pre-advance backward (opposite of reading direction) to start earlier
      const preOffsetPx = fontPx * 0.85; // tweakable leading offset
      const preDTheta = stepByArc(theta, preOffsetPx);
      theta = theta + preDTheta;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const chWidth = advances[i];
        // Half-advance to center glyph on its path position
        const halfAdvance = chWidth * 0.5;
        const dThetaHalf = stepByArc(theta, halfAdvance);
        const thetaMid = theta - dThetaHalf;
        // Position and orientation at mid point
        const rMid = item.radiusFunction && !item.isCircleMode ? midR(thetaMid) : labelRadius;
        const angleMid = -thetaMid + CONFIG.INITIAL_ROTATION_OFFSET;
        const x = rMid * Math.cos(angleMid);
        const y = rMid * Math.sin(angleMid);
        // Tangent from a tiny forward difference around mid
        const eps = Math.max(1e-5, dThetaHalf * 0.5);
        const r2 = item.radiusFunction && !item.isCircleMode ? midR(thetaMid - eps) : labelRadius;
        const angle2 = -(thetaMid - eps) + CONFIG.INITIAL_ROTATION_OFFSET;
        const x2 = r2 * Math.cos(angle2);
        const y2 = r2 * Math.sin(angle2);
        const tangentAngle = Math.atan2(y2 - y, x2 - x);
        this.ctx.save();
        this.ctx.translate(x, y);
        // Upright vs tangent orientation
        if (this.state.dayNumbersUpright) {
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          // Rotate to the actual tangent direction in canvas space
          this.ctx.rotate(tangentAngle);
        }
        this.ctx.fillText(ch, 0, 0);
        this.ctx.restore();
        // Advance remaining half to end of glyph
        const dThetaHalf2 = stepByArc(thetaMid, halfAdvance);
        theta = thetaMid - dThetaHalf2;
      }
      this.ctx.restore();
    };
      
      for (const dayNum of this.dayNumbers) {
      // If only the numeric day is shown, render centered like before (non-curved)
      if (onlyDayNumber || dayNum.onlyNumeric) {
        const drawCentered = () => {
        this.ctx.save();
        this.ctx.translate(dayNum.x, dayNum.y);
        this.ctx.font = getFontString(dayNum.fontSize);
        if (this.state.dayNumbersUpright) {
          if (this.state.staticMode) {
              this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          this.ctx.rotate(tiltRadians);
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          }
        }
          this.ctx.fillText(dayNum.text, 0, 0);
          this.ctx.restore();
        };
        drawCentered();
        continue;
      }

      // Otherwise, curved rendering
      drawCurvedText(dayNum);
      }
      
      this.ctx.restore();
    },

    drawTooltip() {
      // Only draw tooltip if enabled and on desktop, not mobile
      if (!this.state.showTooltip || !this.mouseState.hoveredEvent || isMobileDevice()) return;
      
      // Don't show tooltip if event detail window is open
      if (this.state.detailMode !== null) return;
      
      const { segment, events } = this.mouseState.hoveredEvent;
      const { x, y } = this.mouseState.tooltipPosition;
      
      // Calculate segment time
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (segment.day * CONFIG.SEGMENTS_PER_DAY + segment.segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Format time
      const timeStr = this.formatUTCHHMM(segmentDate);
      const dateStr = this.formatUTCDateShort(segmentDate);
      
      // Prepare tooltip content
      const lines = [`${dateStr} ${timeStr}`];
      if (events.length > 0) {
          lines.push(''); // Empty line separator
          events.forEach(eventData => {
          lines.push(`• ${eventData.event.title}`);
        });
      } else {
        //lines.push('No events');
      }
      
      // Calculate tooltip dimensions
      const padding = 8;
      const lineHeight = 12;
      const maxWidth = 200;
      
      this.ctx.save();
      this.ctx.font = getFontString(12);
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      
      // Measure text to calculate tooltip size with clipping
      const textMetrics = lines.map(line => this.ctx.measureText(line));
      const maxTextWidth = Math.max(...textMetrics.map(m => m.width));
      const tooltipWidth = Math.min(maxWidth, Math.max(120, maxTextWidth + padding * 2)); // Min width 120px
      const tooltipHeight = lines.length * lineHeight + padding * 2;
      
      // Position tooltip above cursor with some offset
      const tooltipX = x + 5;
      const tooltipY = y - tooltipHeight - 5;
      
      // Draw tooltip background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
       
      // Draw tooltip text with clipping
      this.ctx.fillStyle = '#ffffff';
      const textAreaWidth = tooltipWidth - padding * 2;
      
      lines.forEach((line, index) => {
        const textY = tooltipY + padding + index * lineHeight;
        const textX = tooltipX + padding;
        
        // Clip text if it's too long
        const metrics = this.ctx.measureText(line);
        if (metrics.width <= textAreaWidth) {
          this.ctx.fillText(line, textX, textY);
        } else {
          // Find the longest text that fits
          let truncatedLine = line;
          while (this.ctx.measureText(truncatedLine + '...').width > textAreaWidth && truncatedLine.length > 0) {
            truncatedLine = truncatedLine.slice(0, -1);
          }
          this.ctx.fillText(truncatedLine + '...', textX, textY);
        }
      });
      
      this.ctx.restore();
    },

    drawCircleModeSegments(maxRadius) {
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      
      // Use the same visibility logic as spiral mode
      const { thetaMax } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
      const visibilityRange = this.calculateVisibilityRange(this.state.rotation, thetaMax);
      
      // Create radius function using the same logic as spiral mode
      const radiusFunction = this.createRadiusFunction(maxRadius, thetaMax, this.state.radiusExponent, this.state.rotation);
      
      // Calculate which days (rings) fall within the visible angular range
      const startDay = Math.floor(visibilityRange.min / (2 * Math.PI)) - 1;
      const endDay = Math.ceil(visibilityRange.max / (2 * Math.PI)) + 1;
      
      // First pass: collect all visible segments with their radii for hour number filtering
      const segmentsWithRadii = [];
      
      for (let day = startDay; day < endDay; day++) {
        const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
        const innerRadius = radiusFunction(day * 2 * Math.PI);
        
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
          const dayStartAngle = day * 2 * Math.PI;
          const segmentStartAngle = dayStartAngle + segment * segmentAngle;
          const segmentEndAngle = segmentStartAngle + segmentAngle;
          
          // Check if this segment is within the visible range
          const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
          const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
          
          if (segmentEnd <= segmentStart) continue; // segment is fully hidden
          
          // Calculate radius for this segment (use outer radius for circle mode)
          const segmentRadius = outerRadius;
          
          // Store segment info for hour number filtering
          segmentsWithRadii.push({
            day, segment, segmentStart, segmentEnd, segmentRadius, innerRadius, outerRadius
          });
        }
      }
      
      // Sort by radius (descending), then by spiral position for consistent revealing order
      segmentsWithRadii.sort((a, b) => {
        if (Math.abs(a.segmentRadius - b.segmentRadius) > 0.001) {
          return b.segmentRadius - a.segmentRadius; // Sort by radius first (outermost first)
        }
        // For segments with same radius (same ring), sort by spiral position
        const aPosition = a.day * CONFIG.SEGMENTS_PER_DAY + a.segment;
        const bPosition = b.day * CONFIG.SEGMENTS_PER_DAY + b.segment;
        return bPosition - aPosition; // Sort by inverted spiral progression for correct revealing order
      });
      
      // Calculate visibility for each segment and create a priority list
      const segmentsWithVisibility = segmentsWithRadii.map(segment => {
        const segmentStartAngle = segment.day * 2 * Math.PI + segment.segment * segmentAngle;
        const segmentEndAngle = segmentStartAngle + segmentAngle;
        const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
        const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
        
        const visibility = segmentEnd > segmentStart ? (segmentEnd - segmentStart) / (segmentEndAngle - segmentStartAngle) : 0;
        
        return {
          ...segment,
          visibility,
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
      
      // Take segments based on position-adjusted threshold, up to 24 total
      const segmentsToShowNumbers = [];
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
          // 0 position: Different thresholds based on positioning
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
      
      const segmentsToShowNumbersSet = new Set(segmentsToShowNumbers.map(s => s.segmentKey));
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        // For each ring, use spiral's segment radii for the corresponding day
        const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
        const innerRadius = radiusFunction(day * 2 * Math.PI);
        
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
            const dayStartAngle = day * 2 * Math.PI;
            const segmentStartAngle = dayStartAngle + segment * segmentAngle;
            const segmentEndAngle = segmentStartAngle + segmentAngle;
            
            // Check if this segment is within the visible range (same as spiral mode)
            const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
            const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
            
            if (segmentEnd <= segmentStart) continue; // segment is fully hidden
          
          // Get base color for this segment.
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
          const color = this.cache.colors[colorIndex];
          const isMidnightSegment = segment === 23;
          const isAfterMidnightSegment = segment === 0;
          
          // Check if this is a noon segment (segment 12 of each day)
          const isNoonSegment = segment === 12;
          
          // Check if this is a 6:00 segment (segment 6 of each day)
          const isSixAMSegment = segment === 6;
          
          // Check if this is an 18:00 segment (segment 18 of each day)
          const isSixPMSegment = segment === 18;
          
          const isFirstDayOfMonth = this.isFirstDayOfMonth(day, segment);
          const isHovered = this.mouseState.hoveredSegment &&
                           this.mouseState.hoveredSegment.day === day &&
                           this.mouseState.hoveredSegment.segment === segment;
          const isSelected = this.mouseState.selectedSegment &&
                            this.mouseState.selectedSegment.day === day &&
                            this.mouseState.selectedSegment.segment === segment;
          
        


          
          // Store day number info if this is the first hour of a day
          const isFirstHourOfDay = this.isFirstHourOfDay(day, segment);
          if (isFirstHourOfDay && segmentStartAngle !== null && segmentEndAngle !== null) {
            // Determine if this is one of the outermost visible day rings (up to 2 days)
            const currentDayTheta = day * 2 * Math.PI;
            const outermostDayTheta = Math.floor(visibilityRange.max / (2 * Math.PI)) * 2 * Math.PI;
            const secondOutermostDayTheta = outermostDayTheta - 2 * Math.PI;
            const isOutermostDay = Math.abs(currentDayTheta - outermostDayTheta) < 0.1;
            const isSecondOutermostDay = Math.abs(currentDayTheta - secondOutermostDayTheta) < 0.1;
            const isOutermostTwoDays = isOutermostDay || isSecondOutermostDay;

            // Skip day number if hiding outermost due to inside hour numbers
            const skipForHourOverlap = (this.state.hideDayWhenHourInside && this.state.hourNumbersInsideSegment && this.state.showHourNumbers && isOutermostTwoDays);
            if (!skipForHourOverlap && segmentStart === segmentStartAngle && segmentEnd === segmentEndAngle) {
            const dayNumber = this.getDayNumber(day, segment);
            const centerAngle = (segmentStart + segmentEnd) / 2;
            const centerRadius = (innerRadius + outerRadius) / 2;
            // Build weekday + day label (e.g., Mon 28)
            // Defaults in case of errors (circle mode)
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
            
            // Calculate font size based on segment dimensions in circle mode
            const segmentAngleSize = segmentEnd - segmentStart;
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            const fontSize = Math.max(1, Math.min(24, maxDimension));
            
            this.dayNumbers.push({
              x: centerRadius * Math.cos(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              isCircleMode: true,
              centerAngle: centerAngle,
              centerRadius: centerRadius,
              onlyNumeric: (!this.state.dayLabelShowWeekday && !includeMonth && !includeYear)
            });
            }
          }
        // Draw as a ring segment with inner and outer radius
        this.drawCircleSegment(innerRadius, outerRadius, -segmentStart, -segmentEnd, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, segmentStartAngle, segmentEndAngle, isFirstDayOfMonth, true, false, isNoonSegment, isSixAMSegment, isSixPMSegment, day, segment);
        
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(segmentStart, segmentEnd, radiusFunction, segment, day, segmentStartAngle, segmentEndAngle, innerRadius, outerRadius);
          }
        }
          
        // Store event data for drawing after main segments (circle mode)
          const allEvents = this.getAllEventsForSegment(day, segment);
          if (allEvents.length > 0) {
            // Use cached layout for speed
            this.ensureLayoutCache();
            const { eventToLane, eventToComponent, componentLaneCount } = this.layoutCache;
            // Compute lane assignment inside the hour for non-overlapping sharing within same lane
            const { lanes: hourLanes, numLanes: hourLaneCount } = this.computeEventLanes(allEvents);

            const getLaneCountForEvent = (evData) => {
              if (!CONFIG.UNIFORM_EVENT_THICKNESS) return Math.max(1, hourLaneCount);
              return this.getMaxOverlapForEventAcrossHours(evData.event);
            };

            // Build local overlap groups within the hour (circle mode)
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
              // Stacked overlap mode with gap filling by sub-splitting on change points (circle)
              for (const idxList of groups.values()) {
                // Order bottom->top by descending coverage within hour, then lane, then start time
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

                // Build change boundaries (0..60 minutes)
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
                    const eventSliceStart = (rank === 0) ? 0 : (rank / m);
                    const eventSliceEnd = 1;
                    const totalRadialHeight = outerRadius - innerRadius;
                    const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
                    const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
                    const segmentAngleSize = segmentEndAngle - segmentStartAngle;
                    let timeStartAngle = segmentStartAngle + (1 - subEnd) * segmentAngleSize;
                    let timeEndAngle = segmentStartAngle + (1 - subStart) * segmentAngleSize;
                    timeStartAngle = Math.max(timeStartAngle, segmentStart);
                    timeEndAngle = Math.min(timeEndAngle, segmentEnd);
                    if (timeEndAngle > timeStartAngle) {
                      this.eventSegments.push({
                        timeStartTheta: timeStartAngle,
                        timeEndTheta: timeEndAngle,
                        eventSliceStart,
                        eventSliceEnd,
                        innerRadius: sliceInnerRadius,
                        outerRadius: sliceOuterRadius,
                        color: eventData.color,
                        event: eventData.event,
                        rawStartAngle: segmentStartAngle,
                        rawEndAngle: segmentEndAngle,
                        day: day,
                        segment: segment,
                        isCircleMode: true
                      });
                    }
                  }
                }
              }
            } else {
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
              
                // Group-local slice for this event (circle mode)
                const eventSliceStart = eventSliceStartArr[i];
                const eventSliceEnd = eventSliceEndArr[i];
              
              // Calculate the radial slice for this event
              const totalRadialHeight = outerRadius - innerRadius;
              const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
              const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
              
            // Use the full segment's angular range for partial event overlay
            const segmentAngleSize = segmentEndAngle - segmentStartAngle;
            let timeStartAngle = segmentStartAngle + (1 - minuteEnd) * segmentAngleSize;
            let timeEndAngle = segmentStartAngle + (1 - minuteStart) * segmentAngleSize;
            // Clamp event arc to visible segment range
            timeStartAngle = Math.max(timeStartAngle, segmentStart);
            timeEndAngle = Math.min(timeEndAngle, segmentEnd);
            if (timeEndAngle > timeStartAngle) {
              // Store event for drawing later (circle mode)
              this.eventSegments.push({
                timeStartTheta: timeStartAngle,
                timeEndTheta: timeEndAngle,
                eventSliceStart: eventSliceStart,
                eventSliceEnd: eventSliceEnd,
                innerRadius: sliceInnerRadius,
                outerRadius: sliceOuterRadius,
                color: eventData.color,
                event: eventData.event,
                rawStartAngle: segmentStartAngle,
                rawEndAngle: segmentEndAngle,
                day: day,
                segment: segment,
                isCircleMode: true
              });
              }
            }
          }
        }

        {
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
          let overlayStartFrac = 0.0;
          let overlayEndFrac = 0.0;
          if (nightFraction > 0 && this.state.showNightOverlay) {
            overlayStartFrac = Math.max(0, (overlapStart - segStartNorm) / (segEnd - segStart));
            overlayEndFrac = Math.min(1, (overlapEnd - segStartNorm) / (segEnd - segStart));
            // Use the full segment's angular range for partial overlay
            const segmentAngleSize = segmentEndAngle - segmentStartAngle;
            let timeStartAngle = segmentStartAngle + (1 - overlayEndFrac) * segmentAngleSize;
            let timeEndAngle = segmentStartAngle + (1 - overlayStartFrac) * segmentAngleSize;
            // Clamp overlay to visible segment range (same as main segments)
            timeStartAngle = Math.max(timeStartAngle, segmentStart);
            timeEndAngle = Math.min(timeEndAngle, segmentEnd);
            if (timeEndAngle > timeStartAngle) {
              // Store night overlay data for drawing after events (circle mode)
              this.nightOverlays.push({
                innerRadius: innerRadius,
                outerRadius: outerRadius,
                startTheta: -timeStartAngle,
                endTheta: -timeEndAngle,
                timeStartAngle: timeStartAngle,
                timeEndAngle: timeEndAngle,
                isCircleMode: true,
                day: day,
                segment: segment
              });
            }
          }
        }

        // --- WEEKDAY GRADIENT OVERLAY LOGIC FOR CIRCLE MODE ---
        if (this.state.showDayOverlay) {
          // Calculate the date for this day to get the day of week
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
          const dayOfWeek = segmentDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          
          // Create gradient from Monday (white) to Sunday (black)
          // Monday = 1, Sunday = 0, so we need to adjust the calculation
          let brightness;
          if (dayOfWeek === 0) {
            // Sunday - black (0)
            brightness = 0;
          } else if (dayOfWeek === 6) {
            // Saturday - much darker to separate weekend
            brightness = 50;
          } else {
            // Monday (1) to Friday (5) - progressively darker
            // Monday = 255, Tuesday = 220, Wednesday = 185, Thursday = 150, Friday = 115
            brightness = 255 - (dayOfWeek - 1) * 35;
          }
          
          // Use configurable opacity for day overlay
          const dayOverlayColor = `rgba(${brightness}, ${brightness}, ${brightness}, ${this.state.dayOverlayOpacity})`;
          
          // Store day overlay data for drawing after events (circle mode)
          this.dayOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -segmentStart,
            endTheta: -segmentEnd,
            segmentStartAngle: segmentStartAngle,
            segmentEndAngle: segmentEndAngle,
            color: dayOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        // --- GRADIENT OVERLAY LOGIC FOR CIRCLE MODE ---
        if (this.state.showGradientOverlay) {
          // In circle mode, use day index to determine darkness (later days = more inward = darker)
          // Normalize by total days visible
          const normalizedDay = day / (this.state.days - 1);
          
          // Calculate darkness: 0 (white/no darkening) at outer edge, increasing toward center
          // Use configurable maximum opacity
          const maxDarkness = this.state.gradientOverlayOpacity;
          const darkness = normalizedDay * maxDarkness;
          
          const gradientOverlayColor = `rgba(0, 0, 0, ${darkness})`;
          
          // Store gradient overlay data for drawing after events (circle mode)
          this.gradientOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -segmentStart,
            endTheta: -segmentEnd,
            segmentStartAngle: segmentStartAngle,
            segmentEndAngle: segmentEndAngle,
            color: gradientOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        }
      }
    },

  drawCircleSegment(innerRadius, outerRadius, startTheta, endTheta, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false, day = null, segment = null) {
      this.ctx.save();
      this.ctx.beginPath();
      
      // Draw the ring segment path
      const startAngle = startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const endAngle = endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      
      // Outer arc
      this.ctx.arc(0, 0, outerRadius, startAngle, endAngle, true);
      // Radial line to inner radius
      this.ctx.lineTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
      // Inner arc (counter-clockwise)
      this.ctx.arc(0, 0, innerRadius, endAngle, startAngle, false);
      // Radial line back to start
      this.ctx.lineTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
      
      this.ctx.closePath();
      this.ctx.fillStyle = color;
      this.ctx.fill();
    
    // Draw straight edge lines (radial lines)
    // Always draw for event sub-segments; for normal segments respect showSegmentEdges
    if (isEventSubSegment || (drawStroke && this.state.showSegmentEdges)) {
      this.ctx.beginPath();
      // Radial line from inner to outer radius at start angle
      this.ctx.moveTo(innerRadius * Math.cos(startAngle), innerRadius * Math.sin(startAngle));
      this.ctx.lineTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
      // Radial line from inner to outer radius at end angle
      this.ctx.moveTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
      this.ctx.lineTo(outerRadius * Math.cos(endAngle), outerRadius * Math.sin(endAngle));
      this.ctx.strokeStyle = isEventSubSegment ? color : CONFIG.STROKE_COLOR;
      
      this.ctx.lineWidth = isEventSubSegment ? CONFIG.EVENT_EDGE_STROKE_WIDTH : CONFIG.STROKE_WIDTH/5;
      this.ctx.stroke();
    }
    
                // Store arc line data for circle mode (to avoid gaps with event-colored edge lines)
        if (drawStroke && this.state.showArcLines) {
          // Store outer arc data
          this.arcLines.push({
            startAngle: startAngle,
            endAngle: endAngle,
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            isCircleMode: true,
            isInner: false
          });
          
          // Store inner arc data - skip for event sub-segments
          if (!isEventSubSegment) {
            this.arcLines.push({
              startAngle: endAngle,
              endAngle: startAngle,
              innerRadius: innerRadius,
              outerRadius: outerRadius,
              isCircleMode: true,
              isInner: true
            });
          }
        }
      // Store highlights for drawing later
      if (isHovered) {
        this.highlightedSegments.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isHovered: true,
          isSelected: false,
          isCircleMode: true
        });
      }
      if (isSelected) {
        // Get event info for this segment
        const eventInfo = day !== null && segment !== null ? this.getEventColorForSegment(day, segment) : null;
        
        this.highlightedSegments.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isHovered: false,
          isSelected: true,
          isCircleMode: true,
          eventInfo: eventInfo,
          segmentColor: color,
          day: day,
          segment: segment
        });
      }
      
      // Store midnight line info for circle mode (only when segment is fully visible)
      if (isMidnightSegment && rawStartAngle !== null && rawEndAngle !== null && 
          Math.abs(startTheta - (-rawStartAngle)) < 0.001 && Math.abs(endTheta - (-rawEndAngle)) < 0.001) {
        // Midnight segment (23:00-0:00) - trailing edge
        this.midnightLines.push({
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: false
        });
      }
      
      if (isAfterMidnightSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // After midnight segment (0:00-1:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true
        });
      }

      // Store noon line info for circle mode (when segment is at least partially visible)
      if (isNoonSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // Noon segment (12:00-13:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isNoonLine: true
        });
      }

      // Store 6:00 AM line info for circle mode (when segment is at least partially visible)
      if (isSixAMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 6:00 AM segment (6:00-7:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isSixAMLine: true
        });
      }

      // Store 18:00 (6:00 PM) line info for circle mode (when segment is at least partially visible)
      if (isSixPMSegment && rawStartAngle !== null && rawEndAngle !== null) {
        // 18:00 segment (18:00-19:00) - leading edge
        this.midnightLines.push({
          startAngle: startAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true,
          isLeadingEdge: true,
          isSixPMLine: true
        });
      }
      
      // Store month line info for circle mode (when segment represents 1st day of month and is at least partially visible)
      if (isFirstDayOfMonth && rawStartAngle !== null && rawEndAngle !== null) {
        // For month boundaries in circle mode, draw the outer arc with thicker line
        // Store the month line as long as the segment is at least partially visible
        this.monthLines.push({
          startAngle: startAngle,
          endAngle: endAngle,
          innerRadius: innerRadius,
          outerRadius: outerRadius,
          isCircleMode: true
        });
      }
      
      this.ctx.restore();
    }
});
