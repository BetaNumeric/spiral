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

  isValidHexColor(value) {
    return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
  },

  normalizeEventColorHex(value, fallback = '#888888') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    if (this.isValidHexColor(raw)) {
      return raw;
    }
    if (/^hsl/i.test(raw)) {
      try {
        return this.hslToHex(raw);
      } catch (_) {}
    }
    return fallback;
  },

  hashEventColorSeed(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  createEventColorSeed() {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  },

  generateEventColorSeedFromEvent(eventOrSource = null) {
    if (eventOrSource && typeof eventOrSource === 'object') {
      const event = eventOrSource;
      const startIso = event.start instanceof Date
        ? event.start.toISOString()
        : String(event.start || '');
      const endIso = event.end instanceof Date
        ? event.end.toISOString()
        : String(event.end || '');
      const base = event.persistentUID || [
        event.calendar || 'Home',
        event.title || '',
        event.description || '',
        startIso,
        endIso
      ].join('|');
      return this.hashEventColorSeed(base);
    }
    if (eventOrSource !== null && eventOrSource !== undefined) {
      return this.hashEventColorSeed(eventOrSource);
    }
    return this.createEventColorSeed();
  },

  normalizeEventColorSeed(seed, fallbackSource = null) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return seed >>> 0;
    }
    if (typeof seed === 'string') {
      const trimmed = seed.trim();
      if (trimmed) {
        const numericSeed = Number(trimmed);
        if (Number.isFinite(numericSeed)) {
          return numericSeed >>> 0;
        }
        return this.hashEventColorSeed(trimmed);
      }
    }
    return this.generateEventColorSeedFromEvent(fallbackSource);
  },

  getSeededUnitValue(seed, salt = 0) {
    let value = (this.normalizeEventColorSeed(seed) ^ (salt >>> 0) ^ 0x9e3779b9) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    value = (value ^ (value >>> 16)) >>> 0;
    return value / 4294967296;
  },

  getSeededPaletteProfile(seed, fallbackSource = null) {
    const normalizedSeed = this.normalizeEventColorSeed(seed, fallbackSource);
    const hue = this.getSeededUnitValue(normalizedSeed, 1) * 360;
    const saturationUnit = this.getSeededUnitValue(normalizedSeed, 2);
    const lightnessUnit = this.getSeededUnitValue(normalizedSeed, 3);
    return {
      seed: normalizedSeed,
      hue,
      saturationUnit,
      lightnessUnit,
      randomSaturation: 60 + saturationUnit * 30,
      randomLightness: 70 + lightnessUnit * 10
    };
  },

  generatePaletteColorFromSeed(seed, calendarName = null, eventDate = null) {
    const mode = this.state?.colorMode || 'random';
    const paletteProfile = this.getSeededPaletteProfile(
      seed,
      `${calendarName || 'Home'}|${eventDate instanceof Date ? eventDate.toISOString() : String(eventDate || '')}`
    );
    if (mode === 'single') {
      return this.normalizeEventColorHex(this.state.singleColor || '#4CAF50', '#4CAF50');
    }
    if (mode === 'calendar') {
      // Use calendar color if available, otherwise fallback to random
      if (calendarName && this.state.calendarColors && this.state.calendarColors[calendarName]) {
        return this.normalizeEventColorHex(this.state.calendarColors[calendarName], '#888888');
      }
      // Fallback to random if calendar color not found
      return this.hslToHex(`hsl(${paletteProfile.hue}, ${paletteProfile.randomSaturation}%, ${paletteProfile.randomLightness}%)`);
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
      return palette[Math.floor(paletteProfile.saturationUnit * palette.length) % palette.length];
    }
    if (mode === 'seasonal') {
      return this.normalizeEventColorHex(this.generateSeasonalColor(eventDate), '#888888');
    }
    if (mode === 'saturation') {
      const saturation = Math.max(0, Math.min(100, Number(this.state?.saturationLevel ?? 80)));
      const lightnessBase = saturation < 15 ? 62 : 58;
      const lightnessRange = saturation < 15 ? 14 : 10;
      const lightness = lightnessBase + paletteProfile.lightnessUnit * lightnessRange;
      return this.hslToHex(`hsl(${paletteProfile.hue}, ${saturation}%, ${lightness}%)`);
    }
    if (mode === 'monoHue') {
      const hue = this.state.baseHue || 200;
      const saturation = 60 + paletteProfile.saturationUnit * 30; // 60-90%
      const lightness = 60 + paletteProfile.lightnessUnit * 15; // 60-75%
      return this.hslToHex(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    if (mode === 'pastel') {
      const saturation = 45 + paletteProfile.saturationUnit * 15; // 45-60%
      const lightness = 75 + paletteProfile.lightnessUnit * 10; // 75-85%
      return this.hslToHex(`hsl(${paletteProfile.hue}, ${saturation}%, ${lightness}%)`);
    }
    // default 'random'
    return this.hslToHex(`hsl(${paletteProfile.hue}, ${paletteProfile.randomSaturation}%, ${paletteProfile.randomLightness}%)`);
  },

  ensureEventColorMetadata(event) {
    if (!event || typeof event !== 'object') return event;

    event.colorIsCustom = event.colorIsCustom === true;
    event.colorSeed = this.normalizeEventColorSeed(event.colorSeed, event);
    const autoColor = this.generatePaletteColorFromSeed(
      event.colorSeed,
      event.calendar || 'Home',
      event.start instanceof Date ? event.start : new Date(event.start || Date.now())
    );

    if (event.colorIsCustom) {
      event.color = this.normalizeEventColorHex(event.color, autoColor);
      return event;
    }

    event.color = autoColor;
    return event;
  },

  createEventColorState(options = {}) {
    const event = options.event && typeof options.event === 'object' ? options.event : null;
    const calendarName = options.calendarName || event?.calendar || 'Home';
    const eventDate = options.eventDate || event?.start || new Date();
    const seedSource = event || `${calendarName}|${eventDate instanceof Date ? eventDate.toISOString() : String(eventDate || '')}|${Date.now()}|${Math.random()}`;
    const colorSeed = this.normalizeEventColorSeed(options.colorSeed, seedSource);
    const manualColor = this.normalizeEventColorHex(options.customColor, '');

    if (manualColor) {
      return {
        color: manualColor,
        colorSeed,
        colorIsCustom: true
      };
    }

    return {
      color: this.generatePaletteColorFromSeed(colorSeed, calendarName, eventDate),
      colorSeed,
      colorIsCustom: false
    };
  },

  syncEventAutoColor(event) {
    if (!event || typeof event !== 'object') {
      return '#888888';
    }

    this.ensureEventColorMetadata(event);
    return event.color;
  },

  refreshAutoEventColors(options = {}) {
    const events = Array.isArray(options.events) ? options.events : (this.events || []);
    let updatedCount = 0;
    for (const event of events) {
      const previousColor = event ? event.color : null;
      const nextColor = this.syncEventAutoColor(event);
      if (event && previousColor !== nextColor) {
        updatedCount++;
      }
    }
    if (options.includeDraft && this.draftEvent) {
      const previousColor = this.draftEvent.color;
      const nextColor = this.syncEventAutoColor(this.draftEvent);
      if (previousColor !== nextColor) {
        updatedCount++;
      }
    }
    return { updatedCount };
  },

  setEventCustomColor(event, color) {
    if (!event || typeof event !== 'object') {
      return '#888888';
    }

    const fallbackAutoColor = this.generatePaletteColorFromSeed(
      this.normalizeEventColorSeed(event.colorSeed, event),
      event.calendar || 'Home',
      event.start instanceof Date ? event.start : new Date(event.start || Date.now())
    );
    event.colorSeed = this.normalizeEventColorSeed(event.colorSeed, event);
    event.color = this.normalizeEventColorHex(color, fallbackAutoColor);
    event.colorIsCustom = true;
    return event.color;
  },

  generateRandomColor(calendarName = null, eventDate = null) {
    return this.generatePaletteColorFromSeed(this.createEventColorSeed(), calendarName, eventDate);
  },

  generateRandomColorForStorage(calendarName = null, eventDate = null, colorSeed = null) {
    return this.generatePaletteColorFromSeed(
      colorSeed === null || colorSeed === undefined ? this.createEventColorSeed() : colorSeed,
      calendarName,
      eventDate
    );
  },

  getDisplayColorForEvent(event) {
    let finalColor = '#888888';
    try {
      if (event) {
        this.ensureEventColorMetadata(event);
        finalColor = this.normalizeEventColorHex(event.color, '#888888');
      }
    } catch (_) {
    }

    if (event && event.isDraft) {
      if (typeof finalColor === 'string' && finalColor.startsWith('#')) {
        let r_fg = 0, g_fg = 0, b_fg = 0;
        if (finalColor.length === 7) {
          r_fg = parseInt(finalColor.substring(1, 3), 16);
          g_fg = parseInt(finalColor.substring(3, 5), 16);
          b_fg = parseInt(finalColor.substring(5, 7), 16);
        } else if (finalColor.length === 4) {
          r_fg = parseInt(finalColor[1] + finalColor[1], 16);
          g_fg = parseInt(finalColor[2] + finalColor[2], 16);
          b_fg = parseInt(finalColor[3] + finalColor[3], 16);
        }
        
        // Blend with white (the true canvas background, since dark mode uses CSS invert filter)
        // to simulate 50% opacity without actually being transparent.
        // This prevents overlapping segments from showing a darker seam.
        const r_bg = 255;
        const g_bg = 255;
        const b_bg = 255;
        
        const alpha = 0.5; // 50% transparency simulation
        const r_out = Math.round(r_fg * alpha + r_bg * (1 - alpha));
        const g_out = Math.round(g_fg * alpha + g_bg * (1 - alpha));
        const b_out = Math.round(b_fg * alpha + b_bg * (1 - alpha));
        
        return '#' + 
          r_out.toString(16).padStart(2, '0') + 
          g_out.toString(16).padStart(2, '0') + 
          b_out.toString(16).padStart(2, '0');
      }
    }
    return finalColor;
  },

  calculateSelectedSegmentColor(day, segment) {
    const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
    const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    const colorIndex = ((segmentId % this.cache.colors.length) + this.cache.colors.length) % this.cache.colors.length;
    const segmentColor = this.cache.colors[colorIndex];
    
    const eventInfo = this.getEventColorForSegment(day, segment);
    const draftEventActive = this.draftEvent && this.draftEvent.segmentId === segmentId;
    
    if (draftEventActive) {
      return this.draftEvent.color;
    } else if (eventInfo) {
      return eventInfo.color;
    } else if (segmentColor === CONFIG.BLANK_COLOR) {
      // Generate the same random color that would be used for a new event
      const absId = Math.abs(segmentId);
      const hue = (absId * 137.5) % 360;
      const saturation = 60 + (absId % 3) * 15; // 60-90% saturation
      const lightness = 70 + (absId % 2) * 10; // 70-80% lightness
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    } else {
      return segmentColor;
      }
    },

    drawHighlightedSegments() {
      const isMobile = isMobileDevice();
      this.ctx.save();
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
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

          if (segment.isSelected) {
            // Re-stroke both radial edges explicitly so the selected outline
            // stays complete even when the seam-aligned edge gets visually
            // softened by neighboring fills.
            this.ctx.beginPath();
            this.ctx.moveTo(
              segment.innerRadius * Math.cos(segment.startAngle),
              segment.innerRadius * Math.sin(segment.startAngle)
            );
            this.ctx.lineTo(
              segment.outerRadius * Math.cos(segment.startAngle),
              segment.outerRadius * Math.sin(segment.startAngle)
            );
            this.ctx.moveTo(
              segment.innerRadius * Math.cos(segment.endAngle),
              segment.innerRadius * Math.sin(segment.endAngle)
            );
            this.ctx.lineTo(
              segment.outerRadius * Math.cos(segment.endAngle),
              segment.outerRadius * Math.sin(segment.endAngle)
            );
            this.ctx.stroke();
          }
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

          if (segment.isSelected) {
            this.ctx.beginPath();

            const startAngle = -segment.startTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const startInnerRadius = segment.radiusFunction(segment.startTheta);
            const startOuterRadius = segment.radiusFunction(segment.startTheta + 2 * Math.PI);
            this.ctx.moveTo(
              startInnerRadius * Math.cos(startAngle),
              startInnerRadius * Math.sin(startAngle)
            );
            this.ctx.lineTo(
              startOuterRadius * Math.cos(startAngle),
              startOuterRadius * Math.sin(startAngle)
            );

            const endAngle = -segment.endTheta + CONFIG.INITIAL_ROTATION_OFFSET;
            const endInnerRadius = segment.radiusFunction(segment.endTheta);
            const endOuterRadius = segment.radiusFunction(segment.endTheta + 2 * Math.PI);
            this.ctx.moveTo(
              endInnerRadius * Math.cos(endAngle),
              endInnerRadius * Math.sin(endAngle)
            );
            this.ctx.lineTo(
              endOuterRadius * Math.cos(endAngle),
              endOuterRadius * Math.sin(endAngle)
            );

            this.ctx.stroke();
          }
          
          // If the outline path stayed open, draw the start radial edge
          // explicitly so the highlighted segment still reads as a closed band.
          if (!segment.drawLeadingEdge) {
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
      }
      this.ctx.restore();
    },

  drawEventSegments() {
    this._pendingSpiralOverlapEdges = [];
    this._pendingSpiralOverlapEdgeKeys = new Set();
    for (const eventSegment of this.eventSegments) {
      if (eventSegment.isCircleMode) {
        // Circle mode event fill; seam and divider edges are drawn separately.
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
          null, null, // day, segment
          null,
          null,
          true
        );
        const startAngle = -eventSegment.timeStartTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        const endAngle = -eventSegment.timeEndTheta + CONFIG.INITIAL_ROTATION_OFFSET;
        if (this.state.showEventBoundaryStrokes && this.state.showAllEventBoundaryStrokes && !this.state.showArcLines) {
          this.ctx.save();
          this.ctx.strokeStyle = '#000';
          this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, eventSegment.innerRadius, startAngle, endAngle, true);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(0, 0, eventSegment.outerRadius, startAngle, endAngle, true);
          this.ctx.stroke();
          this.ctx.restore();
        }
        if (eventSegment.coverStartEdge) {
          this.drawCircleRadialEdge(startAngle, eventSegment.edgeInnerRadius, eventSegment.edgeOuterRadius, eventSegment.color, CONFIG.EVENT_EDGE_STROKE_WIDTH);
        }
        if (eventSegment.coverEndEdge) {
          this.drawCircleRadialEdge(endAngle, eventSegment.edgeInnerRadius, eventSegment.edgeOuterRadius, eventSegment.color, CONFIG.EVENT_EDGE_STROKE_WIDTH);
        }
        if (this.state.showEventBoundaryStrokes && eventSegment.drawStartEdge) {
          this.queuePendingSpiralOverlapEdge(
            eventSegment.edgeInnerRadius * Math.cos(startAngle),
            eventSegment.edgeInnerRadius * Math.sin(startAngle),
            eventSegment.edgeOuterRadius * Math.cos(startAngle),
            eventSegment.edgeOuterRadius * Math.sin(startAngle)
          );
        }
        if (this.state.showEventBoundaryStrokes && eventSegment.drawEndEdge) {
          this.queuePendingSpiralOverlapEdge(
            eventSegment.edgeInnerRadius * Math.cos(endAngle),
            eventSegment.edgeInnerRadius * Math.sin(endAngle),
            eventSegment.edgeOuterRadius * Math.cos(endAngle),
            eventSegment.edgeOuterRadius * Math.sin(endAngle)
          );
        }
        if (this.state.showEventBoundaryStrokes && eventSegment.dividerStroke) {
          this.ctx.save();
          this.ctx.strokeStyle = '#000';
          this.ctx.lineWidth = CONFIG.STROKE_WIDTH;
          this.ctx.lineCap = 'square';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, eventSegment.innerRadius, startAngle, endAngle, true);
          this.ctx.stroke();
          this.ctx.restore();
        }
      } else {
        // Spiral mode event: custom draw to avoid outer-arc switching glitches
        this.drawEventSpiralSubsegment(eventSegment);
        }
    }
    this.drawPendingSpiralOverlapEdges();
    },

    drawCircleRadialEdge(angle, innerRadius, outerRadius, color, lineWidth) {
      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(innerRadius * Math.cos(angle), innerRadius * Math.sin(angle));
      this.ctx.lineTo(outerRadius * Math.cos(angle), outerRadius * Math.sin(angle));
      this.ctx.stroke();
      this.ctx.restore();
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
      
      const fontSize = Math.max(1, Math.min(26, maxRadius * 0.082));
      const fixedDistance = this.getOutsideHourNumberOffset(fontSize);
      const labelRadius = maxRadius + fixedDistance;
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;

      this.ctx.save();
      this.ctx.font = getFontString(fontSize);
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = CONFIG.LABEL_COLOR;
      
      const hoursToShow = [];
      for (let hour = 0; hour < CONFIG.SEGMENTS_PER_DAY; hour++) {
        if (this.shouldShowHourNumber(hour, { includePositionShift: false })) {
          hoursToShow.push(hour);
        }
      }

      const revealCount = Number.isFinite(this._startupHourRevealCount)
        ? Math.max(0, Math.min(hoursToShow.length, this._startupHourRevealCount))
        : hoursToShow.length;
      if (revealCount === 0) {
        this.ctx.restore();
        return;
      }
      
      for (const hour of hoursToShow.slice(0, revealCount)) {
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
        
        const displayNumber = this.getHourNumberDisplayValue(hour, { includePositionShift: false });
        this.ctx.fillText(displayNumber.toString(), 0, 0);
        this.ctx.restore();
      }
      this.ctx.restore();
    },

    getOutsideHourNumberFontSize() {
      const { maxRadius } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
      return Math.max(1, Math.min(26, maxRadius * 0.082));
    },

    getOutsideHourNumberOffset(fontSize = null) {
      const renderedFontSize = Number.isFinite(fontSize) ? fontSize : this.getOutsideHourNumberFontSize();
      return Math.max(8, Math.min(20, renderedFontSize * 0.8));
    },

    getHourNumberDisplayValue(hour, options = {}) {
      const includePositionShift = options.includePositionShift !== false;
      let displayNumber = this.state.hourNumbersStartAtOne
        ? (hour === 0 ? 24 : hour)
        : hour;

      if (includePositionShift && (this.state.hourNumbersPosition === 0 || this.state.hourNumbersPosition === 1)) {
        if (this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment && this.state.hourNumbersPosition === 1) {
          displayNumber = (displayNumber + 24) % 24;
        } else {
          displayNumber = (displayNumber + 1 + 24) % 24;
        }
      }

      if (this.state.hourNumbersStartAtOne && displayNumber === 0) {
        displayNumber = 24;
      }

      return displayNumber;
    },

    shouldShowHourNumber(hour, options = {}) {
      if (!this.state.showEverySixthHour) return true;
      return this.getHourNumberDisplayValue(hour, options) % 6 === 0;
    },

    getHourNumberCenterTheta(rawStartAngle, rawEndAngle) {
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      if (this.state.hourNumbersPosition === 1) {
        const positionOffset = this.state.hourNumbersInsideSegment ? -0.5 : 0.5;
        return (rawStartAngle + rawEndAngle) / 2 + (positionOffset * segmentAngle);
      }
      return (rawStartAngle + rawEndAngle) / 2;
    },

    resolveHourNumberBounds(centerTheta, radiusFunction, innerRadius = null, outerRadius = null) {
      if (innerRadius !== null && outerRadius !== null) {
        return { computedInner: innerRadius, computedOuter: outerRadius };
      }
      return {
        computedInner: radiusFunction(centerTheta),
        computedOuter: radiusFunction(centerTheta + 2 * Math.PI)
      };
    },

    getInsideHourNumberFontSize(computedInner, computedOuter, segmentAngle) {
      const centerRadius = (computedInner + computedOuter) / 2;
      const radialHeight = computedOuter - computedInner;
      const arcWidth = centerRadius * segmentAngle;
      const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
      return Math.max(1, Math.min(24, maxDimension));
    },

    getHourNumberFontSize(computedInner, computedOuter, segmentAngle) {
      if (this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment) {
        return this.getOutsideHourNumberFontSize();
      }
      return this.getInsideHourNumberFontSize(computedInner, computedOuter, segmentAngle);
    },

    getHourNumberLabelRadius(computedInner, computedOuter, fontSize) {
      if (this.state.hourNumbersOutward && !this.state.hourNumbersInsideSegment) {
        return computedOuter + this.getOutsideHourNumberOffset(fontSize);
      }
      return (computedInner + computedOuter) / 2;
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

      if (!this.shouldShowHourNumber(actualHour)) return;

      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      const centerTheta = this.getHourNumberCenterTheta(rawStartAngle, rawEndAngle);
      const { computedInner, computedOuter } = this.resolveHourNumberBounds(centerTheta, radiusFunction, innerRadius, outerRadius);
      const fontSize = this.getHourNumberFontSize(computedInner, computedOuter, segmentAngle);
      const labelRadius = this.getHourNumberLabelRadius(computedInner, computedOuter, fontSize);
      const displayNumber = this.getHourNumberDisplayValue(actualHour);

      const angle = -centerTheta + CONFIG.INITIAL_ROTATION_OFFSET;
      const x = labelRadius * Math.cos(angle);
      const y = labelRadius * Math.sin(angle);

      this.hourNumbersInSegments.push({
        x, y, centerTheta, displayNumber, fontSize
      });
    },

    drawHourNumbersInSegments() {
      for (const item of this.hourNumbersInSegments) {
        const { x, y, centerTheta, displayNumber } = item;
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
      
      const segmentAngle = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      if (!this.shouldShowHourNumber(actualHour)) return;

      const centerTheta = this.getHourNumberCenterTheta(rawStartAngle, rawEndAngle);
      const { computedInner, computedOuter } = this.resolveHourNumberBounds(centerTheta, radiusFunction, innerRadius, outerRadius);
      const fontSize = this.getHourNumberFontSize(computedInner, computedOuter, segmentAngle);
      const labelRadius = this.getHourNumberLabelRadius(computedInner, computedOuter, fontSize);
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
      
      const displayNumber = this.getHourNumberDisplayValue(actualHour);
      
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
    const buildDayLabelState = (item, applyOutermostOverrides = false) => {
      const fallbackText = item.text || String(item.dayNumber ?? '');
      if (!Number.isFinite(item.segmentDateMs)) {
        return {
          text: fallbackText,
          onlyNumeric: !!item.onlyNumeric
        };
      }

      const segmentDate = new Date(item.segmentDateMs);
      const weekdayFull = WEEKDAYS_UTC[segmentDate.getUTCDay()];
      const weekdayShort = weekdayFull.slice(0, 3);
      const monthFull = MONTHS_LONG_UTC[segmentDate.getUTCMonth()];
      const monthShort = MONTHS_SHORT_UTC[segmentDate.getUTCMonth()];
      const year = segmentDate.getUTCFullYear();
      const useShortWeekday = !!this.state.dayLabelUseShortNames;
      const useShortMonth = !!this.state.dayLabelUseShortMonth;
      const useShortYear = !!this.state.dayLabelUseShortYear;
      const isFirstOfMonth = segmentDate.getUTCDate() === 1;
      const isFirstOfYear = isFirstOfMonth && segmentDate.getUTCMonth() === 0;
      const showWeekday = !!this.state.dayLabelShowWeekday || (applyOutermostOverrides && !!this.state.dayLabelWeekdayOnOutermost);
      const showMonth = !!this.state.dayLabelShowMonth || (applyOutermostOverrides && !!this.state.dayLabelMonthOnOutermost);
      const showYear = !!this.state.dayLabelShowYear || (applyOutermostOverrides && !!this.state.dayLabelYearOnOutermost);

      let includeMonth = showMonth && (
        (applyOutermostOverrides && !!this.state.dayLabelMonthOnOutermost) ||
        !this.state.dayLabelMonthOnFirstOnly ||
        isFirstOfMonth
      );
      let includeYear = showYear && (
        (applyOutermostOverrides && !!this.state.dayLabelYearOnOutermost) ||
        !this.state.dayLabelYearOnFirstOnly ||
        isFirstOfYear
      );

      const parts = [];
      if (showWeekday) {
        parts.push(useShortWeekday ? weekdayShort : weekdayFull);
      }
      if (includeMonth) {
        parts.push(useShortMonth ? monthShort : monthFull);
      }

      const dayText = this.state.dayLabelUseOrdinal ? this.dayToOrdinal(item.dayNumber) : String(item.dayNumber);
      parts.push(dayText);
      if (showWeekday && parts.length > 1) {
        parts[0] = parts[0] + ',';
      }

      let text = parts.join(' ');
      if (includeYear) {
        const yearText = useShortYear ? String(year).slice(2) : String(year);
        text += `, ${yearText}`;
      }

      return {
        text,
        onlyNumeric: (!showWeekday && !includeMonth && !includeYear)
      };
    };
    const getRenderedFontSize = (item) => {
      const baseSize = Math.max(1, Number(item.fontSize) || 0);
      if (!Number.isFinite(item.transitionFontSize) || !this.isModeTransitionGeometryMorphActive()) {
        return baseSize;
      }
      const progress = this.getModeMorphProgress();
      return baseSize + (item.transitionFontSize - baseSize) * progress;
    };
    const measureTextAdvances = (text, fontPx) => {
      this.ctx.save();
      this.ctx.font = getFontString(fontPx);
      const advances = [];
      let prevWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const sub = text.slice(0, i + 1);
        const w = this.ctx.measureText(sub).width;
        const adv = Math.max(0.5, w - prevWidth);
        advances.push(adv);
        prevWidth = w;
      }
      this.ctx.restore();
      return {
        advances,
        totalWidth: prevWidth
      };
    };
    const getOuterEndClipTheta = (item) => {
      return Number.isFinite(item.outerEndClipTheta)
        ? item.outerEndClipTheta
        : null;
    };
    const getMidRadius = (item, theta) => {
      if (!item.radiusFunction || item.isCircleMode) return item.centerRadius || 0;
      const innerRadius = item.radiusFunction(theta);
      const outerRadius = item.radiusFunction(theta + 2 * Math.PI);
      return (innerRadius + outerRadius) / 2;
    };
    const stepByArc = (item, thetaStart, targetWidth) => {
      let startRadius = getMidRadius(item, thetaStart);
      if (!isFinite(startRadius) || startRadius < 1) startRadius = 1;
      let dTheta = Math.max(1e-5, targetWidth / startRadius);
      let thetaEnd = thetaStart - dTheta;
      const endRadius = getMidRadius(item, thetaEnd);
      const startX = startRadius * Math.cos(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
      const startY = startRadius * Math.sin(-thetaStart + CONFIG.INITIAL_ROTATION_OFFSET);
      const endX = endRadius * Math.cos(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
      const endY = endRadius * Math.sin(-thetaEnd + CONFIG.INITIAL_ROTATION_OFFSET);
      const ds = Math.hypot(endX - startX, endY - startY);
      if (ds > 0.0001) {
        dTheta = dTheta * (targetWidth / ds);
      }
      if (!isFinite(dTheta) || dTheta <= 0) dTheta = 1e-4;
      return Math.min(dTheta, 0.5);
    };
    const canRenderDayLabel = (item, labelState) => {
      const outerEndClipTheta = getOuterEndClipTheta(item);
      if (outerEndClipTheta === null) {
        return true;
      }

      const fontPx = getRenderedFontSize(item);
      if (labelState.onlyNumeric) {
        const { totalWidth } = measureTextAdvances(labelState.text, fontPx);
        const radius = Math.max(1, item.centerRadius || 1);
        const approxHalfThetaSpan = (totalWidth * 0.5) / radius;
        const centerTheta = Number.isFinite(item.centerTheta) ? item.centerTheta : 0;
        const textOuterTheta = centerTheta + approxHalfThetaSpan;
        return outerEndClipTheta >= textOuterTheta - 1e-5;
      }

      const text = labelState.text;
      const baseTheta = item.centerTheta !== undefined ? item.centerTheta : (item.centerAngle || 0);
      const labelRadius = item.centerRadius || 0;
      if (!text || !isFinite(labelRadius) || labelRadius < 1) return false;
      const { advances } = measureTextAdvances(text, fontPx);
      if (!advances.length) return false;

      let theta = baseTheta;
      theta += stepByArc(item, theta, fontPx * 0.85);
      const firstCharWidth = advances[0];
      const firstHalfAdvance = firstCharWidth * 0.5;
      const firstDThetaHalf = stepByArc(item, theta, firstHalfAdvance);
      const firstThetaMid = theta - firstDThetaHalf;
      const firstDThetaHalf2 = stepByArc(item, firstThetaMid, firstHalfAdvance);
      const firstThetaNext = firstThetaMid - firstDThetaHalf2;
      const firstCharMaxTheta = Math.max(theta, firstThetaNext);
      return outerEndClipTheta >= firstCharMaxTheta - 1e-5;
    };
    const hasOutermostDayLabelOverride = !!(
      this.state.dayLabelWeekdayOnOutermost ||
      this.state.dayLabelMonthOnOutermost ||
      this.state.dayLabelYearOnOutermost
    );
    let effectiveOutermostDay = null;
    if (hasOutermostDayLabelOverride) {
      const sortedDayNumbers = this.dayNumbers
        .filter((dayNum) => Number.isFinite(dayNum.day))
        .slice()
        .sort((a, b) => b.day - a.day);
      for (const dayNum of sortedDayNumbers) {
        const candidateLabel = buildDayLabelState(dayNum, true);
        if (canRenderDayLabel(dayNum, candidateLabel)) {
          effectiveOutermostDay = dayNum.day;
          break;
        }
      }
    }
    for (const dayNum of this.dayNumbers) {
      const labelState = buildDayLabelState(dayNum, effectiveOutermostDay !== null && dayNum.day === effectiveOutermostDay);
      dayNum.text = labelState.text;
      dayNum.onlyNumeric = labelState.onlyNumeric;
    }
    const onlyDayNumber = this.dayNumbers.length > 0 && this.dayNumbers.every((dayNum) => dayNum.onlyNumeric);
    
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
      const fontPx = getRenderedFontSize(item);
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
      const outerEndClipTheta = Number.isFinite(item.outerEndClipTheta)
        ? item.outerEndClipTheta
        : null;
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
      if (outerEndClipTheta !== null && text.length > 0) {
        const firstCharWidth = advances[0];
        const firstHalfAdvance = firstCharWidth * 0.5;
        const firstDThetaHalf = stepByArc(theta, firstHalfAdvance);
        const firstThetaMid = theta - firstDThetaHalf;
        const firstDThetaHalf2 = stepByArc(firstThetaMid, firstHalfAdvance);
        const firstThetaNext = firstThetaMid - firstDThetaHalf2;
        const firstCharMaxTheta = Math.max(theta, firstThetaNext);
        if (outerEndClipTheta < firstCharMaxTheta - 1e-5) {
          this.ctx.restore();
          return;
        }
      }
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
        if (this.state.dayNumbersUpright) {
          if (this.state.staticMode) {
            this.ctx.rotate(Math.PI);
          } else {
            this.ctx.rotate(this.state.rotation);
          }
        } else {
          this.ctx.rotate(tangentAngle);
        }
        this.ctx.fillText(ch, 0, 0);
        this.ctx.restore();
        const dThetaHalf2 = stepByArc(thetaMid, halfAdvance);
        theta = thetaMid - dThetaHalf2;
      }
      this.ctx.restore();
    };
      
      for (const dayNum of this.dayNumbers) {
      // If only the numeric day is shown, render centered like before (non-curved)
      if (onlyDayNumber || dayNum.onlyNumeric) {
        const drawCentered = () => {
        const renderedFontSize = getRenderedFontSize(dayNum);
        this.ctx.save();
        this.ctx.translate(dayNum.x, dayNum.y);
        this.ctx.font = getFontString(renderedFontSize);
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
        const outerEndClipTheta = Number.isFinite(dayNum.outerEndClipTheta)
          ? dayNum.outerEndClipTheta
          : null;
        if (outerEndClipTheta !== null) {
          const renderedFontSize = getRenderedFontSize(dayNum);
          this.ctx.save();
          this.ctx.font = getFontString(renderedFontSize);
          const textWidth = this.ctx.measureText(dayNum.text).width;
          this.ctx.restore();
          const radius = Math.max(1, dayNum.centerRadius || 1);
          const approxHalfThetaSpan = (textWidth * 0.5) / radius;
          const centerTheta = Number.isFinite(dayNum.centerTheta) ? dayNum.centerTheta : 0;
          const textOuterTheta = centerTheta + approxHalfThetaSpan;
          if (outerEndClipTheta < textOuterTheta - 1e-5) {
            continue;
          }
        }
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
      if (this.state.detailViewDay !== null) return;
      
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
      const {
        isEventOverlappedAtUtc,
        isEventTouchingAtStartUtc,
        isEventTouchingAtEndUtc
      } = this.createVisibleEventBoundaryLookup();
      
      // Use the same visibility logic as spiral mode
      const { thetaMax } = this.calculateTransforms(this.canvas.clientWidth, this.canvas.clientHeight);
      const visibilityRange = this.getRenderVisibilityRange(thetaMax);
      
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
      
      // Cache for daily data (circle mode)
      const dailyDataCache = new Map();
      const getDailyData = (segmentId) => {
        const dayOffset = Math.floor(segmentId / 24);
        if (dailyDataCache.has(dayOffset)) return dailyDataCache.get(dayOffset);
        
        const segmentDate = new Date(this.referenceTime.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const sunTimes = this.getSunTimesForDate(segmentDate);
        
        const dayOfWeek = segmentDate.getUTCDay();
        let brightness;
        if (dayOfWeek === 0) brightness = 0;
        else if (dayOfWeek === 6) brightness = 50;
        else brightness = 255 - (dayOfWeek - 1) * 35;
        
        const dayOverlayColor = `rgba(${brightness}, ${brightness}, ${brightness}, ${this.state.dayOverlayOpacity})`;
        
        const data = { sunTimes, dayOverlayColor, segmentDateBase: segmentDate };
        dailyDataCache.set(dayOffset, data);
        return data;
      };
      
      // Second pass: draw segments
      for (let day = startDay; day < endDay; day++) {
        // For each ring, use spiral's segment radii for the corresponding day
        const outerRadius = radiusFunction((day + 1) * 2 * Math.PI);
        const innerRadius = radiusFunction(day * 2 * Math.PI);
        
        for (let segment = 0; segment < CONFIG.SEGMENTS_PER_DAY; segment++) {
            const dayStartAngle = day * 2 * Math.PI;
            const segmentStartAngle = dayStartAngle + segment * segmentAngle;
            const segmentEndAngle = segmentStartAngle + segmentAngle;
            const circleSegmentStartAngle = segment * segmentAngle;
            const circleSegmentEndAngle = circleSegmentStartAngle + segmentAngle;
             
            // Check if this segment is within the visible range (same as spiral mode)
            const segmentStart = Math.max(segmentStartAngle, visibilityRange.min);
            const segmentEnd = Math.min(segmentEndAngle, visibilityRange.max);
             
            if (segmentEnd <= segmentStart) continue; // segment is fully hidden
            const visibleStartOffset = segmentStart - segmentStartAngle;
            const visibleEndOffset = segmentEnd - segmentStartAngle;
            const circleSegmentStart = circleSegmentStartAngle + visibleStartOffset;
            const circleSegmentEnd = circleSegmentStartAngle + visibleEndOffset;
          
          // Get base color for this segment.
          const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const segmentHourStartMs = this.referenceTime.getTime() + segmentId * 60 * 60 * 1000;
          const segmentHourEndMs = segmentHourStartMs + 60 * 60 * 1000;
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
            if (!skipForHourOverlap) {
            const dayNumber = this.getDayNumber(day, segment);
            const centerAngle = (circleSegmentStartAngle + circleSegmentEndAngle) / 2;
            const centerRadius = (innerRadius + outerRadius) / 2;
            // Build weekday + day label (e.g., Mon 28)
            // Defaults in case of errors (circle mode)
            let showWeekday = false;
            let includeMonth = false;
            let includeYear = false;
            let segmentDateMs = null;
            try {
              const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
              const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
              const segmentDate = new Date(this.referenceTime.getTime() + segmentId * 60 * 60 * 1000);
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
            
            // Calculate font size based on segment dimensions in circle mode
            const segmentAngleSize = circleSegmentEndAngle - circleSegmentStartAngle;
            const radialHeight = outerRadius - innerRadius;
            const arcWidth = centerRadius * segmentAngleSize;
            
            // Use smaller dimension, with some padding
            const maxDimension = Math.min(radialHeight, arcWidth) * 0.4;
            const fontSize = Math.max(1, Math.min(24, maxDimension));
            
            this.dayNumbers.push({
              day: day,
              dayNumber: dayNumber,
              segmentDateMs: segmentDateMs,
              x: centerRadius * Math.cos(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              y: centerRadius * Math.sin(-centerAngle + CONFIG.INITIAL_ROTATION_OFFSET),
              text: fullDayLabel,
              fontSize: fontSize,
              isCircleMode: true,
              centerTheta: centerAngle,
              centerAngle: centerAngle,
              centerRadius: centerRadius,
              outerEndClipTheta: circleSegmentEnd < circleSegmentEndAngle - 0.0001 ? circleSegmentEnd : null,
              onlyNumeric: (!showWeekday && !includeMonth && !includeYear)
            });
            }
          }
        // Draw as a ring segment with inner and outer radius
        this.drawCircleSegment(innerRadius, outerRadius, -circleSegmentStart, -circleSegmentEnd, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, circleSegmentStartAngle, circleSegmentEndAngle, isFirstDayOfMonth, true, false, isNoonSegment, isSixAMSegment, isSixPMSegment, day, segment);
        
        // Draw hour numbers inside outermost segments if enabled
        if (this.state.showHourNumbers && (this.state.hourNumbersOutward || this.state.hourNumbersInsideSegment)) {
          // Check if this segment should show numbers
          const segmentKey = `${day}-${segment}`;
          if (segmentsToShowNumbersSet.has(segmentKey)) {
            this.collectHourNumberInSegment(circleSegmentStart, circleSegmentEnd, radiusFunction, segment, day, circleSegmentStartAngle, circleSegmentEndAngle, innerRadius, outerRadius);
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
              const componentId = eventToComponent ? eventToComponent.get(evData.event) : undefined;
              const componentCount = componentId !== undefined && componentLaneCount
                ? componentLaneCount.get(componentId)
                : null;
              if (Number.isFinite(componentCount) && componentCount > 0) {
                return componentCount;
              }
              return this.getMaxOverlapForEventAcrossHours(evData.event);
            };

            // Build local overlap groups within the hour (circle mode)
            const n = allEvents.length;
            const parent = new Int32Array(n);
            for (let i = 0; i < n; i++) parent[i] = i;
            
            const find = (i) => {
              let root = i;
              while (root !== parent[root]) root = parent[root];
              let curr = i;
              while (curr !== root) {
                const nxt = parent[curr];
                parent[curr] = root;
                curr = nxt;
              }
              return root;
            };

            for (let i = 0; i < n; i++) {
              const a = allEvents[i];
              for (let j = i + 1; j < n; j++) {
                const b = allEvents[j];
                if (!(a.endMinute <= b.startMinute || b.endMinute <= a.startMinute)) {
                  const rootI = find(i);
                  const rootJ = find(j);
                  if (rootI !== rootJ) parent[rootI] = rootJ;
                }
              }
            }
            const groups = new Map();
            for (let i = 0; i < n; i++) {
              const r = find(i);
              let list = groups.get(r);
              if (!list) {
                list = [];
                groups.set(r, list);
              }
              list.push(i);
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
                    const totalRadialHeight = outerRadius - innerRadius;
                    const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
                    const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
                    const edgeInnerRadius = innerRadius + ((rank / m) * totalRadialHeight);
                    const edgeOuterRadius = innerRadius + (((rank + 1) / m) * totalRadialHeight);
                    const segmentAngleSize = circleSegmentEndAngle - circleSegmentStartAngle;
                    const rawTimeStartAngle = circleSegmentStartAngle + (1 - subEnd) * segmentAngleSize;
                    const rawTimeEndAngle = circleSegmentStartAngle + (1 - subStart) * segmentAngleSize;
                    const canDrawStartEdge = rawTimeStartAngle >= circleSegmentStart && rawTimeStartAngle <= circleSegmentEnd;
                    const canDrawEndEdge = rawTimeEndAngle >= circleSegmentStart && rawTimeEndAngle <= circleSegmentEnd;
                    let timeStartAngle = Math.max(rawTimeStartAngle, circleSegmentStart);
                    let timeEndAngle = Math.min(rawTimeEndAngle, circleSegmentEnd);
                    if (timeEndAngle > timeStartAngle) {
                      this.eventSegments.push({
                        timeStartTheta: timeStartAngle,
                        timeEndTheta: timeEndAngle,
                        eventSliceStart,
                        eventSliceEnd,
                        dividerStroke: active.length > 1 && eventSliceStart > 0,
                        coverStartEdge: (coverChronologicalEndHourJoin || (!hasActualEventEndHere && continuesAcrossSubEnd)) && canDrawStartEdge,
                        coverEndEdge: (coverChronologicalStartHourJoin || (!hasActualEventStartHere && continuesAcrossSubStart)) && canDrawEndEdge,
                        drawStartEdge: canDrawStartEdge && hasActualEventEndHere && (
                          this.state.showAllEventBoundaryStrokes ||
                          (active.length > 1 && isEventOverlappedAtUtc(eventData.event, subEndUtcMs - 1)) ||
                          isEventTouchingAtEndUtc(eventData.event, subEndUtcMs)
                        ),
                        drawEndEdge: canDrawEndEdge && hasActualEventStartHere && (
                          this.state.showAllEventBoundaryStrokes ||
                          (active.length > 1 && isEventOverlappedAtUtc(eventData.event, subStartUtcMs + 1)) ||
                          isEventTouchingAtStartUtc(eventData.event, subStartUtcMs)
                        ),
                        edgeInnerRadius,
                        edgeOuterRadius,
                        innerRadius: sliceInnerRadius,
                        outerRadius: sliceOuterRadius,
                        color: eventData.color,
                        event: eventData.event,
                        rawStartAngle: circleSegmentStartAngle,
                        rawEndAngle: circleSegmentEndAngle,
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
                const maxPersistentLane = persistentLanes.reduce((maxLane, lane) => Math.max(maxLane, lane), 0);
                const groupLaneCount = Math.max(groupRequiredCount, maxPersistentLane + 1);
                for (let k = 0; k < idxList.length; k++) {
                  const i = idxList[k];
                  const persistentLane = persistentLanes[k];
                  const sliceH = 1 / groupLaneCount;
                  eventSliceStartArr[i] = persistentLane * sliceH;
                  eventSliceEndArr[i] = (persistentLane + 1) * sliceH;
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
              
                // Group-local slice for this event (circle mode)
                const eventSliceStart = eventSliceStartArr[i];
                const eventSliceEnd = eventSliceEndArr[i];
              
              // Calculate the radial slice for this event
              const totalRadialHeight = outerRadius - innerRadius;
              const sliceInnerRadius = innerRadius + (eventSliceStart * totalRadialHeight);
              const sliceOuterRadius = innerRadius + (eventSliceEnd * totalRadialHeight);
              const edgeInnerRadius = sliceInnerRadius;
              const edgeOuterRadius = sliceOuterRadius;
              
            // Use the full segment's angular range for partial event overlay
            const segmentAngleSize = circleSegmentEndAngle - circleSegmentStartAngle;
            const rawTimeStartAngle = circleSegmentStartAngle + (1 - minuteEnd) * segmentAngleSize;
            const rawTimeEndAngle = circleSegmentStartAngle + (1 - minuteStart) * segmentAngleSize;
            const canDrawStartEdge = rawTimeStartAngle >= circleSegmentStart && rawTimeStartAngle <= circleSegmentEnd;
            const canDrawEndEdge = rawTimeEndAngle >= circleSegmentStart && rawTimeEndAngle <= circleSegmentEnd;
            let timeStartAngle = rawTimeStartAngle;
            let timeEndAngle = rawTimeEndAngle;
            // Clamp event arc to visible segment range
            timeStartAngle = Math.max(timeStartAngle, circleSegmentStart);
            timeEndAngle = Math.min(timeEndAngle, circleSegmentEnd);
            if (timeEndAngle > timeStartAngle) {
              // Store event for drawing later (circle mode)
              this.eventSegments.push({
                timeStartTheta: timeStartAngle,
                timeEndTheta: timeEndAngle,
                eventSliceStart: eventSliceStart,
                eventSliceEnd: eventSliceEnd,
                dividerStroke: eventSliceStart > 0,
                coverStartEdge: coverChronologicalEndHourJoin && canDrawStartEdge,
                coverEndEdge: coverChronologicalStartHourJoin && canDrawEndEdge,
                drawStartEdge: canDrawStartEdge && hasActualEventEndHere && (
                  this.state.showAllEventBoundaryStrokes ||
                  ((eventSliceStart > 0 || eventSliceEnd < 1) && isEventOverlappedAtUtc(eventData.event, eventEndUtcMs - 1)) ||
                  isEventTouchingAtEndUtc(eventData.event, eventEndUtcMs)
                ),
                drawEndEdge: canDrawEndEdge && hasActualEventStartHere && (
                  this.state.showAllEventBoundaryStrokes ||
                  ((eventSliceStart > 0 || eventSliceEnd < 1) && isEventOverlappedAtUtc(eventData.event, eventStartUtcMs + 1)) ||
                  isEventTouchingAtStartUtc(eventData.event, eventStartUtcMs)
                ),
                edgeInnerRadius: edgeInnerRadius,
                edgeOuterRadius: edgeOuterRadius,
                innerRadius: sliceInnerRadius,
                outerRadius: sliceOuterRadius,
                color: eventData.color,
                event: eventData.event,
                rawStartAngle: circleSegmentStartAngle,
                rawEndAngle: circleSegmentEndAngle,
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
          const dailyData = getDailyData(segmentId);
          
          let segStart = ((segmentId % 24) + 24) % 24;
          let segEnd = segStart + 1;
          
          // Calculate sunrise/sunset times for this segment's date using cache
          const sunTimes = dailyData.sunTimes;
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
            const segmentAngleSize = circleSegmentEndAngle - circleSegmentStartAngle;
            let timeStartAngle = circleSegmentStartAngle + (1 - overlayEndFrac) * segmentAngleSize;
            let timeEndAngle = circleSegmentStartAngle + (1 - overlayStartFrac) * segmentAngleSize;
            // Clamp overlay to visible segment range (same as main segments)
            timeStartAngle = Math.max(timeStartAngle, circleSegmentStart);
            timeEndAngle = Math.min(timeEndAngle, circleSegmentEnd);
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
          const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
          const dailyData = getDailyData(segmentId);
          const dayOverlayColor = dailyData.dayOverlayColor;
          
          // Store day overlay data for drawing after events (circle mode)
          this.dayOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -circleSegmentStart,
            endTheta: -circleSegmentEnd,
            segmentStartAngle: circleSegmentStartAngle,
            segmentEndAngle: circleSegmentEndAngle,
            color: dayOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        // --- GRADIENT OVERLAY LOGIC FOR CIRCLE MODE ---
        if (this.state.showGradientOverlay) {
          const circleRadiusFunction = (theta) => (theta >= (day + 1) * 2 * Math.PI ? outerRadius : innerRadius);
          const darkness = this.getSteppedGradientOverlayOpacity(day, segment, circleRadiusFunction, maxRadius, 6);
          
          const gradientOverlayColor = `rgba(0, 0, 0, ${darkness})`;
          
          // Store gradient overlay data for drawing after events (circle mode)
          this.gradientOverlays.push({
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            startTheta: -circleSegmentStart,
            endTheta: -circleSegmentEnd,
            segmentStartAngle: circleSegmentStartAngle,
            segmentEndAngle: circleSegmentEndAngle,
            color: gradientOverlayColor,
            isCircleMode: true,
            day: day,
            segment: segment
          });
        }

        }
      }
    },

  drawCircleSegment(innerRadius, outerRadius, startTheta, endTheta, color, isMidnightSegment, isAfterMidnightSegment, isHovered, isSelected, rawStartAngle = null, rawEndAngle = null, isFirstDayOfMonth = false, drawStroke = true, isEventSubSegment = false, isNoonSegment = false, isSixAMSegment = false, isSixPMSegment = false, day = null, segment = null, eventStrokeColor = null, eventStrokeWidth = null, suppressEventEdges = false) {
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
    if ((!isEventSubSegment && drawStroke && this.state.showSegmentEdges) || (isEventSubSegment && !suppressEventEdges)) {
      this.ctx.beginPath();
      // Radial line from inner to outer radius at start angle
      this.ctx.moveTo(innerRadius * Math.cos(startAngle), innerRadius * Math.sin(startAngle));
      this.ctx.lineTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
      // Radial line from inner to outer radius at end angle
      this.ctx.moveTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
      this.ctx.lineTo(outerRadius * Math.cos(endAngle), outerRadius * Math.sin(endAngle));
      this.ctx.strokeStyle = (isEventSubSegment && eventStrokeColor) ? eventStrokeColor : (isEventSubSegment ? color : CONFIG.STROKE_COLOR);
      
      this.ctx.lineWidth = (isEventSubSegment && eventStrokeWidth !== null && eventStrokeWidth !== undefined)
        ? eventStrokeWidth
        : (isEventSubSegment ? CONFIG.EVENT_EDGE_STROKE_WIDTH : CONFIG.STROKE_WIDTH);
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
