// Shared time-to-angle geometry and event layout for both canvas views.
(function (global) {
  'use strict';

  const TURN = 2 * Math.PI;
  const angleAtFraction = (rawStart, rawEnd, fraction) => rawStart + (1 - fraction) * (rawEnd - rawStart);
  const fractionAtAngle = (rawStart, rawEnd, angle) => Math.max(0, Math.min(1, 1 - (angle - rawStart) / (rawEnd - rawStart)));
  const unwrapAngle = (angle, origin) => origin + ((angle - origin) % TURN + TURN) % TURN;

  function rangeAtFractions(rawStart, rawEnd, from, to, visibleStart = rawStart, visibleEnd = rawEnd) {
    const rawTimeStart = angleAtFraction(rawStart, rawEnd, to);
    const rawTimeEnd = angleAtFraction(rawStart, rawEnd, from);
    const startTheta = Math.max(rawTimeStart, visibleStart);
    const endTheta = Math.min(rawTimeEnd, visibleEnd);
    if (!(endTheta > startTheta)) return null;
    return { startTheta, endTheta,
      canDrawStartEdge: rawTimeStart >= visibleStart && rawTimeStart <= visibleEnd,
      canDrawEndEdge: rawTimeEnd >= visibleStart && rawTimeEnd <= visibleEnd };
  }

  function radialRange(inner, outer, from = 0, to = 1) {
    const height = outer - inner;
    return { inner: inner + from * height, outer: inner + to * height };
  }

  function eventBoundsAtAngle(slice, angle) {
    if (slice.isCircleMode) return { inner: slice.innerRadius, outer: slice.outerRadius };
    const radius = slice.originalRadiusFunction;
    return radialRange(radius(angle), radius(angle + TURN), slice.eventSliceStart ?? 0, slice.eventSliceEnd ?? 1);
  }

  function overlapGroups(events) {
    const ordered = events.map((event, index) => ({ index, start: event.startMinute, end: event.endMinute }))
      .sort((a, b) => a.start - b.start || a.index - b.index);
    const groups = [];
    let group = null, end = -Infinity;
    for (const entry of ordered) {
      if (!group || entry.start >= end) {
        group = [];
        groups.push(group);
        end = -Infinity;
      }
      group.push(entry.index);
      end = Math.max(end, entry.end);
    }
    for (const indices of groups) indices.sort((a, b) => a - b);
    return groups.sort((a, b) => a[0] - b[0]);
  }

  global.SpiralGeometry = Object.freeze({ angleAtFraction, fractionAtAngle, unwrapAngle,
    rangeAtFractions, radialRange, eventBoundsAtAngle });

  Object.assign(SpiralCalendar.prototype, {
    collectRepeatedHourSegment(day, segment, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction, innerRadius = null, outerRadius = null) {
      const hourMs = this.getSegmentHourRange(day, segment).startMs;
      const layout = SpiralEventProjection.repeatedHour(hourMs, this.getCalendarTimeZone());
      if (layout) this.repeatedHourSegments.push({ layout, day, segment, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction, innerRadius, outerRadius });
    },

    drawRepeatedHourSegments() {
      this.ctx.save();
      this.ctx.strokeStyle = getCanvasTheme(this.state.darkMode).divider;
      this.ctx.lineWidth = 1;
      for (const entry of this.repeatedHourSegments) {
        if (!this.state.showSegmentEdges && this.getAllEventsForSegment(entry.day, entry.segment).length === 0) continue;
        const { layout, startTheta, endTheta, rawStartAngle, rawEndAngle, radiusFunction } = entry;
        const bounds = theta => entry.innerRadius === null
          ? [radiusFunction(theta), radiusFunction(theta + 2 * Math.PI)] : [entry.innerRadius, entry.outerRadius];
        for (const part of layout.parts.slice(0, -1)) {
          const theta = angleAtFraction(rawStartAngle, rawEndAngle, part.endFraction);
          if (theta < startTheta || theta > endTheta) continue;
          const [inner, outer] = bounds(theta);
          const angle = -theta + CONFIG.INITIAL_ROTATION_OFFSET;
          this.ctx.beginPath();
          this.ctx.moveTo(inner * Math.cos(angle), inner * Math.sin(angle));
          this.ctx.lineTo(outer * Math.cos(angle), outer * Math.sin(angle));
          this.ctx.stroke();
        }
      }
      this.ctx.restore();
    },

    createVisibleEventBoundaryLookup() {
      return this.getEventIntervalIndex().boundaryLookup;
    },

    annotateSegmentClock(segment) {
      if (!segment || !Number.isFinite(segment.angle)) return segment;
      const { startMs } = this.getSegmentHourRange(segment.day, segment.segment);
      const layout = SpiralEventProjection.repeatedHour(startMs, this.getCalendarTimeZone());
      if (!layout) return segment;
      const step = 2 * Math.PI / CONFIG.SEGMENTS_PER_DAY;
      const origin = segment.day * 2 * Math.PI + segment.segment * step;
      const angle = unwrapAngle(segment.angle, origin);
      const fraction = Math.min(1 - 1 / SpiralTime.HOUR, fractionAtAngle(origin, origin + step, angle));
      const clock = SpiralEventProjection.clockTime(startMs + fraction * SpiralTime.HOUR, this.getCalendarTimeZone());
      return { ...segment, clockOffsetMs: clock.offsetMs, clockOccurrence: clock.occurrence };
    },

    getClockSegmentThetaRange(selection, rawStart, rawEnd) {
      if (!selection) return { startTheta: rawStart, endTheta: rawEnd };
      const hour = this.getSegmentHourRange(selection.day, selection.segment).startMs;
      const part = SpiralEventProjection.repeatedHour(hour, this.getCalendarTimeZone())?.parts.find(part => part.offsetMs === selection.clockOffsetMs);
      return part ? { startTheta: angleAtFraction(rawStart, rawEnd, part.endFraction),
        endTheta: angleAtFraction(rawStart, rawEnd, part.startFraction) } : { startTheta: rawStart, endTheta: rawEnd };
    },

    findEventEntryAtSegmentPoint(segment) {
      if (!Number.isFinite(segment.angle) || !Number.isFinite(segment.radius)) return null;
      const entries = this.getEventsForClockSegment(segment);
      for (let index = this.eventSegments.length - 1; index >= 0; index--) {
        const slice = this.eventSegments[index];
        const origin = slice.rawStartAngle ?? slice.timeStartTheta;
        const angle = slice.isCircleMode ? unwrapAngle(segment.angle, origin) : segment.angle;
        if (slice.day !== segment.day || slice.segment !== segment.segment
          || angle < slice.timeStartTheta || angle > slice.timeEndTheta) continue;
        const { inner, outer } = eventBoundsAtAngle(slice, angle);
        if (segment.radius < inner || segment.radius > outer) continue;
        const hit = entries.findIndex(entry => entry.event === slice.event && entry.displayInterval === slice.displayInterval);
        if (hit >= 0) return hit;
      }
      return null;
    },

    getEventLayoutSlices(events) {
      if (events.length === 0) return [];
      this.ensureLayoutCache();
      const { eventToLane, eventToComponent, componentLaneCount } = this.layoutCache;
      const { lanes: hourLanes, numLanes: hourLaneCount } = this.computeEventLanes(events);
      const laneAt = i => eventToLane.get(events[i].displayInterval) ?? hourLanes[i] ?? 0;
      const laneCountFor = entry => {
        if (!CONFIG.UNIFORM_EVENT_THICKNESS) return Math.max(1, hourLaneCount);
        const component = eventToComponent?.get(entry.displayInterval);
        const count = component !== undefined ? componentLaneCount?.get(component) : undefined;
        return Number.isFinite(count) && count > 0 ? count : this.getMaxOverlapForEventAcrossHours(entry.event);
      };
      const slices = [];
      if (this.state.overlayStackMode) {
        for (const indices of overlapGroups(events)) {
          const ordered = indices.map(i => ({ i, lane: laneAt(i), entry: events[i] }))
            .sort((a, b) => a.lane - b.lane || (a.entry.startUtcMs || 0) - (b.entry.startUtcMs || 0)
              || a.entry.startMinute - b.entry.startMinute);
          const boundaries = new Set([0, 60]);
          for (const i of indices) {
            boundaries.add(Math.max(0, Math.min(60, events[i].startMinute)));
            boundaries.add(Math.max(0, Math.min(60, events[i].endMinute)));
          }
          const minutes = Array.from(boundaries).sort((a, b) => a - b);
          for (let i = 0; i < minutes.length - 1; i++) {
            const startMinute = minutes[i], endMinute = minutes[i + 1];
            const active = ordered.filter(({ entry }) => entry.startMinute < endMinute && entry.endMinute > startMinute);
            for (let rank = 0; rank < active.length; rank++) {
              slices.push({ entry: active[rank].entry, startMinute, endMinute,
                eventSliceStart: rank / active.length, eventSliceEnd: 1,
                edgeSliceStart: rank / active.length, edgeSliceEnd: (rank + 1) / active.length,
                overlapping: active.length > 1 });
            }
          }
        }
      } else {
        const starts = new Array(events.length).fill(0), ends = new Array(events.length).fill(1);
        for (const indices of overlapGroups(events)) {
          const lanes = indices.map(laneAt);
          let count = 1;
          for (let i = 0; i < indices.length; i++) count = Math.max(count, laneCountFor(events[indices[i]]), lanes[i] + 1);
          const height = 1 / count;
          for (let i = 0; i < indices.length; i++) {
            starts[indices[i]] = lanes[i] * height;
            ends[indices[i]] = (lanes[i] + 1) * height;
          }
        }
        for (let i = 0; i < events.length; i++) {
          slices.push({ entry: events[i], startMinute: events[i].startMinute, endMinute: events[i].endMinute,
            eventSliceStart: starts[i], eventSliceEnd: ends[i], edgeSliceStart: starts[i], edgeSliceEnd: ends[i],
            overlapping: starts[i] > 0 || ends[i] < 1 });
        }
      }
      return slices;
    },

    collectEventSegments(geometry, boundaryLookup) {
      const { day, segment, rawStartAngle, rawEndAngle, startTheta, endTheta, radiusFunction,
        innerRadius = null, outerRadius = null } = geometry;
      const circle = innerRadius !== null;
      const stacked = !!this.state.overlayStackMode;
      const { startMs: hourStart, endMs: hourEnd } = this.getSegmentHourRange(day, segment);
      const { isEventOverlappedAtLayout, isEventTouchingAtStartLayout, isEventTouchingAtEndLayout } = boundaryLookup;
      for (const slice of this.getEventLayoutSlices(this.getAllEventsForSegment(day, segment))) {
        const { entry, startMinute, endMinute, eventSliceStart, eventSliceEnd, edgeSliceStart, edgeSliceEnd } = slice;
        const range = rangeAtFractions(rawStartAngle, rawEndAngle, startMinute / 60, endMinute / 60, startTheta, endTheta);
        if (!range) continue;
        const from = hourStart + startMinute * 60000, to = hourStart + endMinute * 60000;
        const startsHere = entry.startLayoutMs >= from && entry.startLayoutMs < to;
        const endsHere = entry.endLayoutMs > from && entry.endLayoutMs <= to;
        const continuesBefore = startMinute === 0 && entry.startLayoutMs < hourStart;
        const continuesAfter = endMinute === 60 && entry.endLayoutMs > hourEnd;
        // Circle strokes attach to original event boundaries; spiral caps also close clipped paths.
        const canStart = !circle || range.canDrawStartEdge, canEnd = !circle || range.canDrawEndEdge;
        const result = {
          timeStartTheta: range.startTheta, timeEndTheta: range.endTheta,
          eventSliceStart, eventSliceEnd,
          dividerStroke: slice.overlapping && eventSliceStart > 0,
          coverStartEdge: canStart && (continuesAfter || (stacked && !endsHere && entry.endLayoutMs > to)),
          coverEndEdge: canEnd && (continuesBefore || (stacked && !startsHere && entry.startLayoutMs < from)),
          drawStartEdge: canStart && endsHere && (this.state.showAllEventBoundaryStrokes ||
            (slice.overlapping && isEventOverlappedAtLayout(entry.event, to - 1)) || isEventTouchingAtEndLayout(entry.event, to)),
          drawEndEdge: canEnd && startsHere && (this.state.showAllEventBoundaryStrokes ||
            (slice.overlapping && isEventOverlappedAtLayout(entry.event, from + 1)) || isEventTouchingAtStartLayout(entry.event, from)),
          color: entry.color, event: entry.event, displayInterval: entry.displayInterval,
          rawStartAngle, rawEndAngle, day, segment
        };
        if (circle) {
          const fill = radialRange(innerRadius, outerRadius, eventSliceStart, eventSliceEnd);
          const edge = radialRange(innerRadius, outerRadius, edgeSliceStart, edgeSliceEnd);
          Object.assign(result, { innerRadius: fill.inner, outerRadius: fill.outer,
            edgeInnerRadius: edge.inner, edgeOuterRadius: edge.outer, isCircleMode: true });
        } else {
          Object.assign(result, { edgeSliceStart, edgeSliceEnd, originalRadiusFunction: radiusFunction });
        }
        this.eventSegments.push(result);
      }
    },

    collectNightOverlaysForSegment(geometry, sunTimes) {
      if (!this.state.showNightOverlay) return;
      const { day, segment, rawStartAngle, rawEndAngle, startTheta, endTheta, radiusFunction,
        innerRadius = null, outerRadius = null } = geometry;
      const { segmentId, startMs: hourStart } = this.getSegmentHourRange(day, segment);
      const hour = ((segmentId % 24) + 24) % 24;
      const nightStart = sunTimes.sunset;
      const nightEnd = sunTimes.sunrise <= nightStart ? sunTimes.sunrise + 24 : sunTimes.sunrise;
      const normalizedHour = hour + 1 < nightStart ? hour + 24 : hour;
      const from = Math.max(0, Math.max(normalizedHour, nightStart) - normalizedHour);
      const to = Math.min(1, Math.min(normalizedHour + 1, nightEnd) - normalizedHour);
      if (!(to > from)) return;
      const zone = this.getCalendarTimeZone();
      for (const range of SpiralEventProjection.layoutRanges(hourStart + from * SpiralTime.HOUR, hourStart + to * SpiralTime.HOUR, zone)) {
        const overlayStartFrac = (range.startMs - hourStart) / SpiralTime.HOUR;
        const overlayEndFrac = (range.endMs - hourStart) / SpiralTime.HOUR;
        const selection = { day, segment, clockOffsetMs: SpiralEventProjection.clockTime(range.startMs, zone).offsetMs };
        if (innerRadius !== null) {
          const angles = rangeAtFractions(rawStartAngle, rawEndAngle, overlayStartFrac, overlayEndFrac, startTheta, endTheta);
          if (!angles) continue;
          this.nightOverlays.push({ ...selection, innerRadius, outerRadius,
            startTheta: -angles.startTheta, endTheta: -angles.endTheta,
            timeStartAngle: angles.startTheta, timeEndAngle: angles.endTheta, isCircleMode: true });
        } else {
          this.nightOverlays.push({ ...selection, startTheta, endTheta, radiusFunction, overlayStartFrac, overlayEndFrac,
            rawStartAngle, rawEndAngle, segmentAngle: TURN / CONFIG.SEGMENTS_PER_DAY, isCircleMode: false });
        }
      }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
