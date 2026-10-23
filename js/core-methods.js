// Core Helpers and Layout Methods
Object.assign(SpiralCalendar.prototype, {
    getSchedulerState() {
      return this.renderSchedulerState || (this.renderSchedulerState = {
        renderFrameId: null,
        eventListFrameId: null,
        eventListOptions: null,
        settingsSaveTimerId: null
      });
    },

    requestRender(options = {}) {
      const immediate = options.immediate === true;
      const scheduler = this.getSchedulerState();

      if (immediate || typeof requestAnimationFrame !== 'function') {
        if (scheduler.renderFrameId && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(scheduler.renderFrameId);
        }
        scheduler.renderFrameId = null;
        this.drawSpiral();
        return;
      }

      if (scheduler.renderFrameId) return;
      scheduler.renderFrameId = requestAnimationFrame(() => {
        scheduler.renderFrameId = null;
        this.drawSpiral();
      });
    },

    requestEventListRender(options = {}) {
      const scheduler = this.getSchedulerState();
      const { immediate, ...renderOptions } = options;
      const previousOptions = scheduler.eventListOptions || {};
      scheduler.eventListOptions = {
        ...previousOptions,
        ...renderOptions,
        reset: !!(previousOptions.reset || renderOptions.reset),
        loadTop: !!(previousOptions.loadTop || renderOptions.loadTop),
        loadBottom: !!(previousOptions.loadBottom || renderOptions.loadBottom)
      };

      const render = () => {
        scheduler.eventListFrameId = null;
        const mergedOptions = scheduler.eventListOptions || {};
        scheduler.eventListOptions = null;
        if (typeof window !== 'undefined' && typeof window.renderEventList === 'function') {
          window.renderEventList(mergedOptions);
        }
      };

      if (immediate === true || typeof requestAnimationFrame !== 'function') {
        if (scheduler.eventListFrameId && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(scheduler.eventListFrameId);
        }
        render();
        return;
      }

      if (scheduler.eventListFrameId) return;
      scheduler.eventListFrameId = requestAnimationFrame(render);
    },

    requestSettingsSave(options = {}) {
      const scheduler = this.getSchedulerState();
      const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 250;

      if (options.immediate === true || typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
        this.flushSettingsSave();
        return;
      }

      if (scheduler.settingsSaveTimerId !== null) return;
      scheduler.settingsSaveTimerId = window.setTimeout(() => {
        scheduler.settingsSaveTimerId = null;
        this.saveSettingsToStorage();
      }, delayMs);
    },

    flushSettingsSave() {
      const scheduler = this.getSchedulerState();
      if (scheduler.settingsSaveTimerId !== null) {
        if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(scheduler.settingsSaveTimerId);
        }
        scheduler.settingsSaveTimerId = null;
      }
      this.saveSettingsToStorage();
    },

    getTotalVisibleSegments(days = this.state.days) {
      const safeDays = Number.isFinite(Number(days)) ? Number(days) : 0;
      return (safeDays - 1) * CONFIG.SEGMENTS_PER_DAY;
    },

    getSegmentId(day, segment, days = this.state.days) {
      return this.getTotalVisibleSegments(days) - (day * CONFIG.SEGMENTS_PER_DAY + segment) - 1;
    },

    getDayBoundarySegmentId(day, days = this.state.days) {
      return this.getTotalVisibleSegments(days) - day * CONFIG.SEGMENTS_PER_DAY;
    },

    getSegmentPositionFromId(segmentId, days = this.state.days) {
      const id = Number(segmentId);
      if (!Number.isFinite(id)) return null;
      const totalVisibleSegments = this.getTotalVisibleSegments(days);
      if (id < 0 || id >= totalVisibleSegments) return null;
      const absolutePosition = totalVisibleSegments - id - 1;
      return {
        day: Math.floor(absolutePosition / CONFIG.SEGMENTS_PER_DAY),
        segment: absolutePosition % CONFIG.SEGMENTS_PER_DAY
      };
    },

    getSegmentStartMs(segmentId) {
      return this.referenceTime.getTime() + segmentId * 60 * 60 * 1000;
    },

    getSegmentDate(segmentId) {
      return new Date(this.getSegmentStartMs(segmentId));
    },

    getSegmentHourRange(day, segment) {
      const segmentId = this.getSegmentId(day, segment);
      const startMs = this.getSegmentStartMs(segmentId);
      return {
        segmentId,
        startMs,
        endMs: startMs + 60 * 60 * 1000
      };
    },

    getSegmentIdForDate(value) {
      const timeMs = this.getEventDateMs(value);
      if (!Number.isFinite(timeMs)) return null;
      const diffHours = (timeMs - this.referenceTime.getTime()) / (60 * 60 * 1000);
      if (!Number.isFinite(diffHours)) return null;
      return Math.floor(diffHours);
    },

    syncSelectedSegmentToCurrentDays() {
      if (!this.mouseState || this.mouseState.selectedSegmentId === null) return;
      const position = this.getSegmentPositionFromId(this.mouseState.selectedSegmentId);
      if (position) {
        this.mouseState.selectedSegment = { ...this.mouseState.selectedSegment, ...position };
      } else {
        this.mouseState.selectedSegment = null;
        this.mouseState.selectedSegmentId = null;
      }
    },

    getEventDateMs(value) {
      if (value instanceof Date) return value.getTime();
      return new Date(value).getTime();
    },

    getEventDisplayStartMs(event) {
      const timestamps = this.getEventProjection(event);
      return timestamps ? timestamps.layoutStartMs : NaN;
    },

    getEventDisplayEndMs(event) {
      const timestamps = this.getEventProjection(event);
      return timestamps ? timestamps.layoutEndMs : NaN;
    },

    getEventStartNavigationTarget(event) {
      const startMs = this.getEventDisplayStartMs(event);
      if (!Number.isFinite(startMs)) return null;
      const eventStart = new Date(startMs);
      const segmentId = this.getSegmentIdForDate(eventStart);
      if (segmentId === null) return null;

      const absolutePosition = this.getTotalVisibleSegments() - segmentId - 1;
      const day = Math.floor(absolutePosition / CONFIG.SEGMENTS_PER_DAY);
      const segment = (CONFIG.SEGMENTS_PER_DAY - 1) - eventStart.getUTCHours();
      const diffHours = (startMs - this.referenceTime.getTime()) / (60 * 60 * 1000);

      return { eventStart, segmentId, day, segment, diffHours };
    },

    findEventDayForSegment(event, preferredDay, segment) {
      const searchNear = (startDay, endDay) => {
        for (let day = startDay; day <= endDay; day++) {
          const list = this.getAllEventsForSegment(day, segment);
          if (list.find(eventInfo => eventInfo.event === event)) return day;
        }
        return -1;
      };

      const searchRange = 2;
      const startDay = Math.max(0, preferredDay - searchRange);
      const endDay = Math.min(this.state.days - 1, preferredDay + searchRange);
      const nearbyDay = searchNear(startDay, endDay);
      if (nearbyDay !== -1) return nearbyDay;
      return searchNear(0, this.state.days - 1);
    },

    openEventAtStart(event) {
      try {
        const target = this.getEventStartNavigationTarget(event);
        if (!target) return false;

        let day = target.day;
        const segment = target.segment;
        this.state.rotation = (target.diffHours / CONFIG.SEGMENTS_PER_DAY) * 2 * Math.PI;

        const foundDay = this.findEventDayForSegment(event, day, segment);
        if (foundDay !== -1) day = foundDay;

        const selection = { day, segment, clockOffsetMs: this.getEventProjection(event).intervals[0].offsetMs };
        this.openDetailViewForSegment(selection, { preserveDraft: true });
        const allEvents = this.getEventsForClockSegment(selection);
        const eventIndex = allEvents.findIndex(eventInfo => eventInfo.event === event);
        this.mouseState.selectedEventIndex = eventIndex >= 0 ? eventIndex : 0;

        if (this.autoTimeAlignState && this.autoTimeAlignState.enabled) {
          this.stopAutoTimeAlign();
        }

        this.requestRender();
        return true;
      } catch (_) {
        try { this.requestRender(); } catch (_) {}
        return false;
      }
    },

    startStartupAnimation() {
      if (!this.startupAnimationState || this.startupAnimationState.started) return;

      const startup = this.startupAnimationState;
      startup.started = true;

      const prefersReducedMotion = typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion || this.state.circleMode) {
        startup.active = false;
        startup.progress = 1;
        startup.revealedHourSegmentKeys = [];
        this.drawSpiral();
        return;
      }

      const durationMs = 1200;
      const startTs = performance.now();

      const step = (now) => {
        const progress = Math.max(0, Math.min(1, (now - startTs) / durationMs));
        startup.progress = progress;
        this.drawSpiral();

        if (progress < 1) {
          startup.animationId = requestAnimationFrame(step);
        } else {
          startup.animationId = null;
          startup.active = false;
          startup.progress = 1;
          startup.revealedHourSegmentKeys = [];
          this.drawSpiral();
        }
      };

      startup.progress = 0;
      startup.revealedHourSegmentKeys = [];
      startup.animationId = requestAnimationFrame(step);
    },

    getActiveLayoutDraft() {
      return this.draftEvent && this.draftEvent.segmentId === this.mouseState?.selectedSegmentId
        ? this.draftEvent : null;
    },

    ensureLayoutCache() {
      const index = this.getEventIntervalIndex();
      const draft = this.getActiveLayoutDraft();
      const draftProjection = draft ? this.getEventProjection(draft) : null;
      if (this.layoutCache?.index === index && this.layoutCache.draft === draft &&
          this.layoutCache.draftProjection === draftProjection) return;
      this.layoutCache = { index, draft, draftProjection,
        ...this.computeEventOverlapLayout(index, draft, draftProjection) };
    },

    init() {
      this.setupCache();
      this.generateColors();
      
      // Load settings before setting up event handlers
      this.loadSettingsFromStorage();
      this.applyUrlSettingsOverrides();
      this.referenceTime = SpiralTime.dayStart(SpiralTime.instantToWall(new Date(), this.getCalendarTimeZone()));
      
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
    
    this.startStartupAnimation();
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
      const segmentDate = this.getSegmentDate(this.getSegmentId(day, segment));
      
    // Check if this date is the 1st day of the month (using UTC)
    return segmentDate.getUTCDate() === 1;
    },

    isFirstHourOfDay(day, segment) {
      const segmentDate = this.getSegmentDate(this.getSegmentId(day, segment));
      
      // Check if the hour is 0 (first hour of the day) (using UTC)
      return segmentDate.getUTCHours() === 0;
    },

    getDayNumber(day, segment) {
      const segmentDate = this.getSegmentDate(this.getSegmentId(day, segment));
      
      // Return day number (1-31) (using UTC)
      return segmentDate.getUTCDate();
    },

    getVisibleEvents() {
      const currentCalendarsKey = JSON.stringify(this.state.visibleCalendars);
      if (this._visibleEventsCacheVersion !== this._eventsVersion || 
          this._visibleCalendarsCacheKey !== currentCalendarsKey) {
        
        const visibleCalendarsSet = new Set(this.state.visibleCalendars);
        
        this._visibleEventsCache = this.events.filter(ev => {
          const cal = ev.calendar || 'Home';
          return visibleCalendarsSet.has(cal);
        });
        
        this._visibleEventsCacheVersion = this._eventsVersion;
        this._visibleCalendarsCacheKey = currentCalendarsKey;
      }
      return this._visibleEventsCache;
    },

    getAllEventsForSegment(day, segment) {
      const { startMs: segmentStartMs, endMs: segmentEndMs } = this.getSegmentHourRange(day, segment);
      const intervals = this.getEventIntervalIndex().query(segmentStartMs, segmentEndMs);
      const draft = this.getActiveLayoutDraft();
      if (draft) {
        const event = draft;
        const projection = this.getEventProjection(event);
        for (const displayInterval of projection.intervals) intervals.push({ event, projection, displayInterval });
      }
      const entries = [];
      for (const { event, projection, displayInterval: interval } of intervals) {
        const from = Math.max(interval.layoutStartMs, segmentStartMs);
        const to = Math.min(interval.layoutEndMs, segmentEndMs);
        if (from >= to) continue;
        entries.push({ event, displayInterval: interval, color: this.getDisplayColorForEvent(event),
          startMinute: (from - segmentStartMs) / 60000,
          endMinute: (to - segmentStartMs) / 60000,
          startLayoutMs: interval.layoutStartMs, endLayoutMs: interval.layoutEndMs,
          totalDurationMinutes: (projection.endInstantMs - projection.startInstantMs) / 60000,
          startUtcMs: interval.startInstantMs, endUtcMs: interval.endInstantMs });
      }
      return entries;
    },

    getHourStartUtc(date) {
      const d = new Date(date);
      d.setUTCMinutes(0, 0, 0);
      return d;
    },

    getEventsForClockSegment(segment) {
      const entries = this.getAllEventsForSegment(segment.day, segment.segment);
      const { startMs } = this.getSegmentHourRange(segment.day, segment.segment);
      const layout = SpiralEventProjection.repeatedHour(startMs, this.getCalendarTimeZone());
      const part = layout?.parts.find(part => part.offsetMs === segment.clockOffsetMs);
      const from = part ? startMs + part.startFraction * SpiralTime.HOUR : startMs;
      const to = part ? startMs + part.endFraction * SpiralTime.HOUR : startMs + SpiralTime.HOUR;
      this.ensureLayoutCache();
      const lanes = this.layoutCache.eventToLane;
      return entries.filter(entry => entry.startLayoutMs < to && entry.endLayoutMs > from)
        .sort((a, b) => lanes.get(a.displayInterval) - lanes.get(b.displayInterval) ||
          a.startLayoutMs - b.startLayoutMs || a.endLayoutMs - b.endLayoutMs ||
          (a.event.persistentUID < b.event.persistentUID ? -1 : a.event.persistentUID > b.event.persistentUID ? 1 : 0));
    },

    getMaxOverlapForEventAcrossHours(targetEvent) {
      const index = this.getEventIntervalIndex();
      let maximum = 1;
      for (const target of this.getEventProjection(targetEvent).intervals) {
        const points = [];
        for (const { displayInterval: interval } of index.query(target.layoutStartMs, target.layoutEndMs)) {
          const from = Math.max(target.layoutStartMs, interval.layoutStartMs);
          const to = Math.min(target.layoutEndMs, interval.layoutEndMs);
          if (from < to) points.push({ t: from, delta: 1 }, { t: to, delta: -1 });
        }
        points.sort((a, b) => a.t - b.t || a.delta - b.delta);
        let active = 0;
        for (const point of points) { active += point.delta; maximum = Math.max(maximum, active); }
      }
      return maximum;
    },

    computeEventOverlapLayout(index = this.getEventIntervalIndex(), draft = this.getActiveLayoutDraft(),
      draftProjection = draft ? this.getEventProjection(draft) : null) {
      // Layout whole events, independent of the viewport. Display envelopes keep
      // all-day dates in the viewing zone and join an event's DST pieces.
      const records = new Map();
      const include = (event, projection) => {
        if (records.has(event)) return;
        const startMs = Math.min(...projection.intervals.map(part => part.layoutStartMs));
        const endMs = Math.max(...projection.intervals.map(part => part.layoutEndMs));
        if (endMs > startMs) records.set(event, { event, projection, startMs, endMs });
      };
      for (const { event, projection } of index.entries) include(event, projection);
      if (draft) include(draft, draftProjection);
      const ordered = [...records.values()].sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs ||
        (a.event.persistentUID < b.event.persistentUID ? -1 : a.event.persistentUID > b.event.persistentUID ? 1 : 0));

      // Two small heaps release ended lanes and reuse the innermost free lane.
      const push = (heap, value, before) => {
        let child = heap.length;
        heap.push(value);
        while (child > 0) {
          const parent = (child - 1) >>> 1;
          if (!before(value, heap[parent])) break;
          heap[child] = heap[parent];
          child = parent;
        }
        heap[child] = value;
      };
      const pop = (heap, before) => {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
          let parent = 0;
          while (parent * 2 + 1 < heap.length) {
            let child = parent * 2 + 1;
            if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
            if (!before(heap[child], last)) break;
            heap[parent] = heap[child];
            parent = child;
          }
          heap[parent] = last;
        }
        return first;
      };
      const endsFirst = (a, b) => a.endMs < b.endMs || a.endMs === b.endMs && a.lane < b.lane;
      const innerFirst = (a, b) => a < b;
      const active = [], free = [];
      const eventToLane = new Map(), eventToComponent = new Map(), componentLaneCount = new Map();
      let component = -1, laneCount = 0, numLanes = 0;
      for (const record of ordered) {
        while (active.length && active[0].endMs <= record.startMs) {
          push(free, pop(active, endsFirst).lane, innerFirst);
        }
        if (!active.length) {
          component++;
          laneCount = 0;
          free.length = 0;
        }
        const lane = free.length ? pop(free, innerFirst) : laneCount++;
        push(active, { endMs: record.endMs, lane }, endsFirst);
        for (const key of [record.event, ...record.projection.intervals]) {
          eventToLane.set(key, lane);
          eventToComponent.set(key, component);
        }
        componentLaneCount.set(component, laneCount);
        numLanes = Math.max(numLanes, laneCount);
      }
      return { eventToLane, eventToComponent, componentLaneCount, numLanes };
    },

    getEventColorForSegment(day, segment) {
      const selection = this.mouseState.selectedSegment;
      const events = selection?.day === day && selection.segment === segment
        ? this.getEventsForClockSegment(selection) : this.getAllEventsForSegment(day, segment);
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
        color: this.getDisplayColorForEvent(events[eventIndex].event),
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

    // Store the current time display state
    this.mobileOrientationState.timeDisplayWasEnabled = this.state.showTimeDisplay;

    if (screen && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
      this.mobileOrientationState.orientationChangeHandler = () => {
        this.handleMobileOrientationChange();
      };
      screen.orientation.addEventListener('change', this.mobileOrientationState.orientationChangeHandler);
    } else {
      this.mobileOrientationState.orientationChangeHandler = null;
    }

    this.mobileOrientationState.orientationResizeHandler = () => {
      this.handleMobileOrientationChange();
    };
    window.addEventListener('resize', this.mobileOrientationState.orientationResizeHandler);

    this.mobileOrientationState.isLandscape = null;
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
    themeColorMeta.content = getCanvasTheme(this.state.darkMode).page;
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

  getCurrentMobileLandscapeState() {
    const viewport = window.visualViewport;
    const width = viewport && Number.isFinite(viewport.width) ? viewport.width : window.innerWidth;
    const height = viewport && Number.isFinite(viewport.height) ? viewport.height : window.innerHeight;
    return width > height;
  },

  getDisplayTime() {
    if (this.autoTimeAlignState.enabled) {
      return SpiralTime.instantToWall(new Date(), this.getCalendarTimeZone());
    } else {
      // Calculate the time corresponding to the current spiral rotation (using UTC)
      // Same logic as drawTimeDisplay
      const rotationInHours = (this.state.rotation / (2 * Math.PI)) * CONFIG.SEGMENTS_PER_DAY;
      // Create UTC time based on reference time
      const utcTime = this.referenceTime.getTime() + rotationInHours * 60 * 60 * 1000;
      return new Date(SpiralEventProjection.clockTime(utcTime, this.getCalendarTimeZone()).wallMs);
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
    const durationMs = 1800;
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

  syncBottomEventListPosition() {
    const bottomEventList = document.getElementById('bottomEventList');
    if (!bottomEventList || !this.canvas) return;

    const canvasHeight = this.canvas.clientHeight;
    const pullUpOffset = this.timeDisplayState ? (this.timeDisplayState.pullUpOffset || 0) : 0;
    const maxHeight = parseFloat(bottomEventList.style.maxHeight || '0');
    const isVisible = Number.isFinite(maxHeight) && maxHeight > 0.5;

    bottomEventList.style.bottom = 'auto';
    bottomEventList.style.top = `${canvasHeight - pullUpOffset}px`;
    bottomEventList.style.borderTopWidth = isVisible ? '1px' : '0px';
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
          window.renderEventList({ reset: !wasVisible });
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
      this.syncBottomEventListPosition();
      
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
      this.syncBottomEventListPosition();
      // Clear stored height so time display returns to bottom
      this.timeDisplayState.eventListCurrentHeight = 0;
      this.timeDisplayState.eventListContentHeight = 0;
      
      // Restore previous calendar visibility if it was filtered
      if (this._previousVisibleCalendars !== null) {
        this.state.visibleCalendars = [...this._previousVisibleCalendars];
        this._previousVisibleCalendars = null;
        this.requestSettingsSave();
        // Rebuild calendar dropdown menu to update checkboxes
        if (typeof this.buildCalendarMenu === 'function') {
          this.buildCalendarMenu();
        }
        // Re-render event list and spiral
        this.requestEventListRender();
        this.requestRender();
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
    this.mobileOrientationState.isLandscape = null;
    this.handleMobileOrientationChange();
  },

  resetTimeDisplayLayoutState() {
    if (!this.timeDisplayState) return;

    this.timeDisplayState.currentHeight = CONFIG.TIME_DISPLAY_HEIGHT;
    this.timeDisplayState.targetHeight = CONFIG.TIME_DISPLAY_HEIGHT;
    this.timeDisplayState.collapsed = false;
    this.timeDisplayState.swipeActive = false;
    this.timeDisplayState.swipeStartedInRenderRect = false;
    this.timeDisplayState.swipeStartY = 0;
    this.timeDisplayState.swipeLastY = 0;
    this.timeDisplayState.swipeStartHeight = CONFIG.TIME_DISPLAY_HEIGHT;
    this.timeDisplayState.swipeStartPullUpOffset = 0;
    this.timeDisplayState.mouseActive = false;
    this.timeDisplayState.mouseStartedInRenderRect = false;
    this.timeDisplayState.mouseStartY = 0;
    this.timeDisplayState.mouseLastY = 0;
    this.timeDisplayState.mouseStartHeight = CONFIG.TIME_DISPLAY_HEIGHT;
    this.timeDisplayState.mouseStartPullUpOffset = 0;
    this.timeDisplayState.justFinishedDrag = false;
    this.timeDisplayState.pullUpOffset = 0;

    this.hideBottomEventList();
  },

  handleMobileOrientationChange() {
    if (!isMobileDevice()) return;

    const isLandscape = this.getCurrentMobileLandscapeState();
    if (this.mobileOrientationState.isLandscape === isLandscape) {
      return;
    }

    this.mobileOrientationState.isLandscape = isLandscape;
    const timeDisplayToggle = document.getElementById('timeDisplayToggle');

    if (isLandscape) {
      if (this.state.showTimeDisplay) {
        this.mobileOrientationState.timeDisplayWasEnabled = true;
      }
      this.resetTimeDisplayLayoutState();
      if (this.state.showTimeDisplay) {
        this.setTimeDisplayEnabled(false);
      } else {
        this.drawSpiral();
      }
    } else {
      this.resetTimeDisplayLayoutState();
      if (this.mobileOrientationState.timeDisplayWasEnabled) {
        this.setTimeDisplayEnabled(true);
      } else {
        this.drawSpiral();
      }
    }

    if (timeDisplayToggle) {
      timeDisplayToggle.checked = this.state.showTimeDisplay;
    }

    if (typeof this.recordStudyOrientationChange === 'function') {
      this.recordStudyOrientationChange(isLandscape);
    }

    if (typeof this.scheduleViewportResize === 'function') {
      this.scheduleViewportResize();
    }
  }
});
