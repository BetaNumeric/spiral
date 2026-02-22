// Core Helpers and Layout Methods
Object.assign(SpiralCalendar.prototype, {
    ensureLayoutCache() {
      const windowStartMs = this.referenceTime.getTime();
      const windowEndMs = this.referenceTime.getTime() + this.state.days * 24 * 60 * 60 * 1000;
      const needRebuild = !this.layoutCache ||
        this.layoutCache.windowStartMs !== windowStartMs ||
        this.layoutCache.windowEndMs !== windowEndMs ||
        this.layoutCache.eventsVersion !== this._eventsVersion;
      if (!needRebuild) return;

      const { eventToLane } = this.computePersistentEventLanesForWindow();
      const { eventToComponent, componentLaneCount } = this.computeEventComponentsForWindow(eventToLane);
      this.layoutCache = {
        windowStartMs,
        windowEndMs,
        eventsVersion: this._eventsVersion,
        eventToLane,
        eventToComponent,
        componentLaneCount,
      };
    },

    init() {
      this.setupCache();
      this.generateColors();
      
      // Load settings before setting up event handlers
      this.loadSettingsFromStorage();
      
      this.setupEventHandlers();
      this.setupCanvas();
      // Prime audio after first user gesture to satisfy autoplay policies
      this.installAudioGesturePrimer();
      // Setup mobile orientation detection for time display
      this.setupMobileOrientationDetection();
    
    // Initialize Auto Time Align if enabled by default
    if (this.autoTimeAlignState.enabled) {
      this.startAutoTimeAlign();
    }
    
    // Load saved events from localStorage
    this.loadEventsFromStorage();
    
    // Sync all UI controls with loaded settings
    this.syncAllUIControls();
    
    // Start animation if it was enabled in saved settings
    if (this.animationState.isAnimating) {
      this.startAnimation();
    }
    },

    setupCache() {
      this.cache.maxDays = +document.getElementById('daysSlider').max;
      // Add buffer segments for smooth rotation revealing
      this.cache.totalSegments = (this.cache.maxDays + 1) * CONFIG.SEGMENTS_PER_DAY;
    },

    wrapText(text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      for (const word of words) {
        // Check if the word itself is longer than maxWidth
        const wordMetrics = this.ctx.measureText(word);
        if (wordMetrics.width > maxWidth) {
          // If current line has content, push it first
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          
          // Break the long word into characters
          let charLine = '';
          for (const char of word) {
            const testCharLine = charLine + char;
            const charMetrics = this.ctx.measureText(testCharLine);
            
            if (charMetrics.width > maxWidth) {
              if (charLine) {
                lines.push(charLine);
                charLine = char;
              } else {
                // Single character is too wide, clip it
                lines.push(char);
                charLine = '';
              }
            } else {
              charLine = testCharLine;
            }
          }
          
          if (charLine) {
            currentLine = charLine;
          }
        } else {
          // Normal word processing
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = this.ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && currentLine !== '') {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines;
    },

    hslToHex(hsl) {
      // Parse HSL values
      const match = hsl.match(/hsl\(([^,]+),\s*([^,]+)%,\s*([^)]+)%\)/);
      if (!match) return '#ff6b6b'; // fallback
      
      const h = parseFloat(match[1]);
      const s = parseFloat(match[2]);
      const l = parseFloat(match[3]);
      
      // Convert HSL to RGB
      const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l / 100 - c / 2;
      
      let r, g, b;
      if (h >= 0 && h < 60) {
        [r, g, b] = [c, x, 0];
      } else if (h >= 60 && h < 120) {
        [r, g, b] = [x, c, 0];
      } else if (h >= 120 && h < 180) {
        [r, g, b] = [0, c, x];
      } else if (h >= 180 && h < 240) {
        [r, g, b] = [0, x, c];
      } else if (h >= 240 && h < 300) {
        [r, g, b] = [x, 0, c];
      } else {
        [r, g, b] = [c, 0, x];
      }
      
      // Convert to hex
      const toHex = (n) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },

    isFirstDayOfMonth(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
    // Check if this date is the 1st day of the month (using UTC)
    return segmentDate.getUTCDate() === 1;
    },

    isFirstHourOfDay(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Check if the hour is 0 (first hour of the day) (using UTC)
      return segmentDate.getUTCHours() === 0;
    },

    getDayNumber(day, segment) {
      // Calculate the date this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      // Return day number (1-31) (using UTC)
      return segmentDate.getUTCDate();
    },

    getAllEventsForSegment(day, segment) {
      // Calculate the date/time this segment represents
      const totalVisibleSegments = (this.state.days - 1) * CONFIG.SEGMENTS_PER_DAY;
      const segmentId = totalVisibleSegments - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
      const hoursFromReference = segmentId;
      
      const segmentDate = new Date(this.referenceTime.getTime() + hoursFromReference * 60 * 60 * 1000);
      
      const segmentHourStart = new Date(segmentDate);
    segmentHourStart.setUTCMinutes(0, 0, 0);
      const segmentHourEnd = new Date(segmentHourStart);
    segmentHourEnd.setUTCHours(segmentHourStart.getUTCHours() + 1);
      
      const overlappingEvents = [];
      
      // Check each event to see if this segment falls within it and passes calendar filter
      for (const event of this.events) {
        // Ensure event has a calendar tag; default to 'Home' for legacy
        const eventCalendar = event.calendar || 'Home';
        if (!this.state.visibleCalendars.includes(eventCalendar)) continue;
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        // Check if there's any overlap between the segment hour and the event
        if (eventStart < segmentHourEnd && eventEnd > segmentHourStart) {
          // Calculate the start and end minutes within this hour segment
          const overlapStart = eventStart > segmentHourStart ? eventStart : segmentHourStart;
          const overlapEnd = eventEnd < segmentHourEnd ? eventEnd : segmentHourEnd;
          
        const startMinute = overlapStart.getUTCMinutes();
        const endMinute = overlapEnd.getUTCMinutes();
          
          // If the event spans the entire next hour, end minute should be 60
          let actualEndMinute = endMinute;
          if (overlapEnd.getTime() === segmentHourEnd.getTime()) {
            actualEndMinute = 60;
          }
          
          overlappingEvents.push({
            event: event,
            color: this.getDisplayColorForEvent(event),
            startMinute: startMinute,
            endMinute: actualEndMinute,
            // Global properties for consistent ordering across segments
            totalDurationMinutes: Math.max(0, Math.round((eventEnd.getTime() - eventStart.getTime()) / (60 * 1000))),
            startUtcMs: eventStart.getTime(),
            endUtcMs: eventEnd.getTime()
          });
        }
      }
      
      return overlappingEvents;
    },

    getHourStartUtc(date) {
      const d = new Date(date);
      d.setUTCMinutes(0, 0, 0);
      return d;
    },

    getMaxOverlapForEventAcrossHours(targetEvent) {
      if (!this.events || this.events.length === 0) return 1;
      const start = new Date(targetEvent.start);
      const end = new Date(targetEvent.end);
      if (!(start < end)) return 1;

      let hourCursor = this.getHourStartUtc(start);
      const endHour = this.getHourStartUtc(end);
      let maxOverlap = 1;
      const oneHourMs = 60 * 60 * 1000;

      // Iterate hour by hour including the last hour containing 'end' if it is exactly on hour
      while (hourCursor <= endHour) {
        const hourStart = new Date(hourCursor);
        const hourEnd = new Date(hourCursor.getTime() + oneHourMs);
        let overlapCount = 0;
        for (const ev of this.events) {
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          if (evStart < hourEnd && evEnd > hourStart) {
            overlapCount++;
          }
        }
        if (overlapCount > maxOverlap) maxOverlap = overlapCount;
        hourCursor = new Date(hourCursor.getTime() + oneHourMs);
      }
      return Math.max(1, maxOverlap);
    },

    computeEventLanes(events) {
      if (!events || events.length === 0) {
        return { lanes: [], numLanes: 0 };
      }

      // Sort for stable, cross-hour ordering of the same events:
      // 1) by totalDurationMinutes descending (longer events get stable priority)
      // 2) by event global start time (earlier starts first)
      // 3) by in-hour startMinute to keep a natural order within ties
      const indexed = events.map((ev, idx) => ({ ev, idx }));
      indexed.sort((a, b) => {
        const adur = a.ev.totalDurationMinutes || 0;
        const bdur = b.ev.totalDurationMinutes || 0;
        if (bdur !== adur) return bdur - adur;
        const aStart = a.ev.startUtcMs || 0;
        const bStart = b.ev.startUtcMs || 0;
        if (aStart !== bStart) return aStart - bStart;
        if (a.ev.startMinute !== b.ev.startMinute) return a.ev.startMinute - b.ev.startMinute;
        // Final tie-breaker: earlier end inside hour first
        return a.ev.endMinute - b.ev.endMinute;
      });

      const laneEndMinutes = []; // laneEndMinutes[lane] = last end minute in that lane
      const laneByOriginalIndex = new Array(events.length).fill(0);

      for (const item of indexed) {
        const start = item.ev.startMinute;
        const end = item.ev.endMinute;
        let assignedLane = -1;

        // Find first lane whose last event ends at or before this start (no overlap)
        for (let lane = 0; lane < laneEndMinutes.length; lane++) {
          if (start >= laneEndMinutes[lane]) {
            assignedLane = lane;
            laneEndMinutes[lane] = end;
            break;
          }
        }

        // If none fit, open a new lane
        if (assignedLane === -1) {
          assignedLane = laneEndMinutes.length;
          laneEndMinutes.push(end);
        }

        laneByOriginalIndex[item.idx] = assignedLane;
      }

      return { lanes: laneByOriginalIndex, numLanes: laneEndMinutes.length };
    },

    computePersistentEventLanesForWindow() {
      const windowStart = this.visibleWindowStart();
      const windowEnd = this.visibleWindowEnd();

      // Build list of effective intervals within the window
      const intervals = [];
      for (const ev of this.events) {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        if (!(evStart < windowEnd && evEnd > windowStart)) continue; // no overlap with window
        const start = evStart > windowStart ? evStart : windowStart;
        const end = evEnd < windowEnd ? evEnd : windowEnd;
        if (start >= end) continue;
        const totalDurationMinutes = Math.max(0, Math.round((evEnd.getTime() - evStart.getTime()) / (60 * 1000)));
        intervals.push({ event: ev, start, end, startMs: start.getTime(), endMs: end.getTime(), totalDurationMinutes, globalStartMs: evStart.getTime() });
      }

      // Sweep line: create points, ends before starts at same time
      const points = [];
      for (const it of intervals) {
        points.push({ t: it.startMs, type: 'start', it });
        points.push({ t: it.endMs, type: 'end', it });
      }
      points.sort((a, b) => {
        if (a.t !== b.t) return a.t - b.t;
        if (a.type !== b.type) return a.type === 'end' ? -1 : 1; // end before start
        if (a.type === 'start') {
          // longer events first, then earlier global start
          if (b.it.totalDurationMinutes !== a.it.totalDurationMinutes) return b.it.totalDurationMinutes - a.it.totalDurationMinutes;
          return a.it.globalStartMs - b.it.globalStartMs;
        } else {
          // ends: earlier ends first
          return a.it.endMs - b.it.endMs;
        }
      });

      const eventToLane = new Map();
      const freeLanes = [];
      let maxLaneIndex = -1;

      for (const p of points) {
        const ev = p.it.event;
        if (p.type === 'end') {
          const lane = eventToLane.get(ev);
          if (lane !== undefined) freeLanes.push(lane);
        } else {
          // assign lane
          let lane;
          if (freeLanes.length > 0) {
            // use smallest available lane index
            freeLanes.sort((x, y) => x - y);
            lane = freeLanes.shift();
          } else {
            lane = ++maxLaneIndex;
          }
          eventToLane.set(ev, lane);
        }
      }

      return { eventToLane, numLanes: Math.max(0, maxLaneIndex + 1) };
    },

    computeEventComponentsForWindow(eventToLane) {
      const windowStart = this.visibleWindowStart();
      const windowEnd = this.visibleWindowEnd();

      // Collect window-overlapping events and give them indices
      const nodes = [];
      const eventIndex = new Map();
      for (const ev of this.events) {
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        if (s < windowEnd && e > windowStart) {
          eventIndex.set(ev, nodes.length);
          nodes.push(ev);
        }
      }
      const n = nodes.length;
      if (n === 0) return { eventToComponent: new Map(), componentLaneCount: new Map() };

      // Disjoint set
      const { parent, find, unite } = createUnionFind(n);

      // Build co-occurrence by iterating each hour segment in window
      const totalHours = this.state.days * CONFIG.SEGMENTS_PER_DAY;
      for (let h = 0; h < totalHours; h++) {
        const hourStart = new Date(windowStart.getTime() + h * 60 * 60 * 1000);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        // Gather events in this hour
        const present = [];
        for (const ev of nodes) {
          const s = new Date(ev.start);
          const e = new Date(ev.end);
          if (s < hourEnd && e > hourStart) present.push(ev);
        }
        if (present.length > 1) {
          const baseIdx = eventIndex.get(present[0]);
          for (let i = 1; i < present.length; i++) {
            const idx = eventIndex.get(present[i]);
            unite(baseIdx, idx);
          }
        }
      }

      // Aggregate per-component metrics
      const compEvents = new Map(); // root -> events[]
      for (const ev of nodes) {
        const idx = eventIndex.get(ev);
        const root = find(idx);
        if (!compEvents.has(root)) compEvents.set(root, []);
        compEvents.get(root).push(ev);
      }

      const componentLaneCount = new Map();
      const eventToComponent = new Map();
      for (const [root, evs] of compEvents.entries()) {
        let required = 1;
        let maxLaneIdx = -1;
        for (const ev of evs) {
          required = Math.max(required, this.getMaxOverlapForEventAcrossHours(ev));
          const ln = eventToLane.get(ev);
          if (ln !== undefined) maxLaneIdx = Math.max(maxLaneIdx, ln);
        }
        const compCount = Math.max(required, maxLaneIdx + 1);
        componentLaneCount.set(root, compCount);
        for (const ev of evs) eventToComponent.set(ev, root);
      }

      return { eventToComponent, componentLaneCount };
    },

    getEventColorForSegment(day, segment) {
      const events = this.getAllEventsForSegment(day, segment);
      if (events.length === 0) return null;
      
      // Use selected event index only for the currently selected segment
      let eventIndex = 0;
      if (this.mouseState.selectedSegment && 
          this.mouseState.selectedSegment.day === day && 
          this.mouseState.selectedSegment.segment === segment) {
        const selectedIndex = this.mouseState.selectedEventIndex;
        eventIndex = selectedIndex < events.length ? selectedIndex : 0;
      }
      
      return {
        color: events[eventIndex].color,
        startMinute: events[eventIndex].startMinute,
        endMinute: events[eventIndex].endMinute
      };
    },

    generateColors() {
      // All segments now use blank color by default - events will override this
      this.cache.colors = Array.from({ length: this.cache.totalSegments }, () => CONFIG.BLANK_COLOR);
    },

  setupMobileOrientationDetection() {
    // Only setup on mobile devices
    if (!isMobileDevice()) return;
    
    // Check if screen orientation API is available
    if (!screen || !screen.orientation) {
      this.setupMobileOrientationFallback();
      return;
    }
    
    // Store the current time display state
    this.mobileOrientationState.timeDisplayWasEnabled = this.state.showTimeDisplay;
    
    // Create orientation change handler
    this.mobileOrientationState.orientationChangeHandler = () => {
      this.handleMobileOrientationChange();
    };
    
    // Add event listener
    screen.orientation.addEventListener('change', this.mobileOrientationState.orientationChangeHandler);
    
    // Check initial orientation
    this.handleMobileOrientationChange();
  },

  updateThemeColor() {
    // Update theme-color meta tag based on dark mode
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = this.state.darkMode ? '#000000' : '#ffffff';
  },

  getTimeDisplayHeight() {
    if (!this.state.showTimeDisplay) return 0;
    if (this.timeDisplayState && typeof this.timeDisplayState.currentHeight === 'number') {
      return this.timeDisplayState.currentHeight;
    }
    if (this.timeDisplayState && this.timeDisplayState.collapsed) {
      return this.timeDisplayState.collapseHeight || 12;
    }
    return CONFIG.TIME_DISPLAY_HEIGHT;
  },

  getDisplayTime() {
    if (this.autoTimeAlignState.enabled) {
      // Use UTC time consistently (same logic as drawTimeDisplay)
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
      return new Date(baseUtcMs + tzOffsetHours * 60 * 60 * 1000);
    } else {
      // Calculate the time corresponding to the current spiral rotation (using UTC)
      // Same logic as drawTimeDisplay
      const rotationInHours = (this.state.rotation / (2 * Math.PI)) * CONFIG.SEGMENTS_PER_DAY;
      // Create UTC time based on reference time
      const utcTime = this.referenceTime.getTime() + rotationInHours * 60 * 60 * 1000;
      return new Date(utcTime);
    }
  },

  setTimeDisplayCollapsed(collapsed) {
    if (!this.timeDisplayState) return;
    const base = CONFIG.TIME_DISPLAY_HEIGHT;
    const minH = this.timeDisplayState.collapseHeight || 12;
    this.timeDisplayState.collapsed = !!collapsed;
    this.timeDisplayState.targetHeight = collapsed ? minH : base;
    if (typeof this.timeDisplayState.currentHeight !== 'number') {
      this.timeDisplayState.currentHeight = collapsed ? base : minH;
    }
    if (this.timeDisplayState.animId) cancelAnimationFrame(this.timeDisplayState.animId);
    const durationMs = 180;
    const startH = this.timeDisplayState.currentHeight;
    const endH = this.timeDisplayState.targetHeight;
    const startTs = performance.now();
    const ease = (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOutQuad
    const step = () => {
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - startTs) / durationMs));
      const p = ease(t);
      this.timeDisplayState.currentHeight = startH + (endH - startH) * p;
      this.drawSpiral();
      if (t < 1) {
        this.timeDisplayState.animId = requestAnimationFrame(step);
      } else {
        this.timeDisplayState.animId = null;
        this.timeDisplayState.currentHeight = endH;
      }
    };
    this.timeDisplayState.animId = requestAnimationFrame(step);
  },

  getEventListMaxHeight() {
    if (!this.timeDisplayState) {
      return Math.floor(this.canvas.clientHeight / 3);
    }
    if (this.timeDisplayState.eventListMaxHeight === 0 || !this.timeDisplayState.eventListMaxHeight) {
      // Calculate as 1/3 of screen height
      this.timeDisplayState.eventListMaxHeight = Math.floor(this.canvas.clientHeight / 3);
    }
    return this.timeDisplayState.eventListMaxHeight;
  },

  updateBottomEventList(skipRender = false) {
    const threshold = this.timeDisplayState.eventListThreshold || 20;
    const currentOffset = this.timeDisplayState.pullUpOffset || 0;
    if (currentOffset >= threshold) {
      // Calculate maximum allowed height based on available space
      const canvasHeight = this.canvas.clientHeight;
      const timeDisplayBottom = canvasHeight - currentOffset;
      const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
      const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
      const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
      const maxAllowedHeight = Math.min(this.getEventListMaxHeight(), maxScreenHeight, availableSpace);
      
      // Get actual content height if available
      const contentHeight = this.timeDisplayState.eventListContentHeight || 0;
      // Limit to actual content height or max allowed, whichever is smaller
      const eventListHeight = contentHeight > 0 ? 
        Math.min(maxAllowedHeight, Math.max(currentOffset, contentHeight)) : 
        Math.min(maxAllowedHeight, currentOffset);
      this.showBottomEventList(eventListHeight, skipRender);
    } else {
      this.hideBottomEventList();
    }
  },

  showBottomEventList(height, skipRender = false) {
    const bottomEventList = document.getElementById('bottomEventList');
    const bottomEventListItems = document.getElementById('bottomEventListItems');
    if (bottomEventList && bottomEventListItems) {
      // Only render event list if:
      // 1. Not skipping (e.g., drag ended), OR
      // 2. List is not yet visible (first time appearing) - render once even during drag to get content height
      const wasVisible = bottomEventList.style.maxHeight && bottomEventList.style.maxHeight !== '0px';
      const isEmpty = bottomEventListItems.children.length === 0;
      if (!skipRender || (!wasVisible || isEmpty)) {
        // Ensure event list is rendered first to get accurate content height
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
      }
      
      // Get actual content height (scrollHeight gives us the full content height)
      const actualContentHeight = bottomEventListItems.scrollHeight;
      
      // Calculate maximum allowed height based on available space
      const canvasHeight = this.canvas.clientHeight;
      const pullUpOffset = this.timeDisplayState.pullUpOffset || 0;
      const timeDisplayHeight = this.getTimeDisplayHeight();
      const timeDisplayBottom = canvasHeight - pullUpOffset;
      
      // Limit expansion to max 60% of screen height, or whatever space is available above time display
      // Leave some margin at the top (at least 10% of screen height)
      const maxScreenHeight = canvasHeight * 0.6; // Max 60% of screen
      const minTopMargin = canvasHeight * 0.1; // At least 10% margin from top
      const availableSpace = Math.max(0, timeDisplayBottom - minTopMargin);
      const maxAllowedHeight = Math.min(maxScreenHeight, availableSpace);
      
      // Use the smaller of: requested height, actual content height, or max allowed height
      const displayHeight = Math.min(height, actualContentHeight + 10, maxAllowedHeight); // +10 for padding
      
      bottomEventList.style.maxHeight = displayHeight + 'px';
      
      // Position directly below time display
      // List top edge should be at: canvasHeight - pullUpOffset
      bottomEventList.style.bottom = 'auto';
      bottomEventList.style.top = (canvasHeight - pullUpOffset) + 'px';
      
      // Enable scrolling if content exceeds display height
      if (actualContentHeight > displayHeight) {
        bottomEventListItems.style.overflowY = 'auto';
      } else {
        bottomEventListItems.style.overflowY = 'visible';
      }
      
      // Store current height so time display can adjust its position
      this.timeDisplayState.eventListCurrentHeight = displayHeight;
      // Store actual content height to limit pull-up expansion
      this.timeDisplayState.eventListContentHeight = actualContentHeight;
    }
  },

  hideBottomEventList() {
    const bottomEventList = document.getElementById('bottomEventList');
    if (bottomEventList) {
      bottomEventList.style.maxHeight = '0px';
      // Position top edge at time display bottom
      const canvasHeight = this.canvas.clientHeight;
      const pullUpOffset = this.timeDisplayState.pullUpOffset || 0;
      bottomEventList.style.bottom = 'auto';
      bottomEventList.style.top = (canvasHeight - pullUpOffset) + 'px';
      // Clear stored height so time display returns to bottom
      this.timeDisplayState.eventListCurrentHeight = 0;
      this.timeDisplayState.eventListContentHeight = 0;
      
      // Restore previous calendar visibility if it was filtered
      if (this._previousVisibleCalendars !== null) {
        this.state.visibleCalendars = [...this._previousVisibleCalendars];
        this._previousVisibleCalendars = null;
        this.saveSettingsToStorage();
        // Rebuild calendar dropdown menu to update checkboxes
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        // Re-render event list and spiral
        if (typeof window.renderEventList === 'function') {
          window.renderEventList();
        }
        this.drawSpiral();
      }
    }
  },

  getEventListHeight() {
    return this.timeDisplayState ? (this.timeDisplayState.eventListCurrentHeight || 0) : 0;
  },

  setupMobileOrientationFallback() {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    
    const resizeHandler = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      // Only trigger if dimensions actually changed significantly
      if (Math.abs(currentWidth - lastWidth) > 50 || Math.abs(currentHeight - lastHeight) > 50) {
        const wasLandscape = lastWidth > lastHeight;
        const isLandscape = currentWidth > currentHeight;
        
        if (wasLandscape !== isLandscape) {
          this.mobileOrientationState.isLandscape = isLandscape;
          this.handleMobileOrientationChange();
        }
        
        lastWidth = currentWidth;
        lastHeight = currentHeight;
      }
    };
    
    window.addEventListener('resize', resizeHandler);
    
    // Store handler for cleanup
    this.mobileOrientationState.orientationChangeHandler = resizeHandler;
    
    // Check initial orientation
    this.mobileOrientationState.isLandscape = window.innerWidth > window.innerHeight;
    this.handleMobileOrientationChange();
  },

  handleMobileOrientationChange() {
    if (!isMobileDevice()) return;
    
    let isLandscape = false;
    
    // Determine current orientation
    if (screen && screen.orientation) {
      // Use screen orientation API if available
      const angle = screen.orientation.angle;
      isLandscape = angle === 90 || angle === 270;
    } else {
      // Fallback to window dimensions
      isLandscape = window.innerWidth > window.innerHeight;
    }
    
    // Only act if orientation actually changed
    if (this.mobileOrientationState.isLandscape !== isLandscape) {
      this.mobileOrientationState.isLandscape = isLandscape;
      
      if (isLandscape) {
        // Entering landscape mode - turn off time display
        if (this.state.showTimeDisplay) {
          this.mobileOrientationState.timeDisplayWasEnabled = true;
          this.setTimeDisplayEnabled(false);
          timeDisplayToggle.checked = this.state.showTimeDisplay;
        }
      } else {
        // Entering portrait mode - restore time display if it was enabled
        if (this.mobileOrientationState.timeDisplayWasEnabled) {
          this.setTimeDisplayEnabled(true);
          timeDisplayToggle.checked = this.state.showTimeDisplay;
        }
      }
    }
    }
});
