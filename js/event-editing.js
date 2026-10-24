// Apply validated edits while retaining the event objects held by the UI.
Object.assign(SpiralCalendar.prototype, {
  isActiveEvent(event) {
    return !!event && (this.events.includes(event) || this.draftEvent === event);
  },

  invalidateEventViews() {
    this._eventsVersion++;
    this.layoutCache = null;
  },

  persistEditedEvent(event) {
    // Drafts belong to the open detail view until the user presses Add.
    if (!this.events.includes(event)) return Promise.resolve(false);
    const saved = this.saveEventsToStorage();
    this.requestEventListRender();
    return saved;
  },

  editEvent(event, change, { persist = true, redraw = true } = {}) {
    if (!this.isActiveEvent(event)) return false;
    const candidate = { ...event, start: new Date(event.start), end: new Date(event.end) };
    let changed;
    try {
      if (typeof change === 'function') {
        if (change(candidate) === false) return false;
      } else {
        Object.assign(candidate, change);
      }
      if (candidate.persistentUID !== event.persistentUID) throw new Error('An edit cannot change the event UID.');
      const draftTitle = candidate.title;
      this.normalizeRuntimeEvent(candidate);
      if (event.isDraft && draftTitle === '') candidate.title = '';
      const before = this.serializeEventTime(event);
      const after = this.serializeEventTime(candidate);
      changed = SpiralEventModel.fingerprint(before) !== SpiralEventModel.fingerprint(after)
        || event.title !== candidate.title || event.color !== candidate.color || event.colorSeed !== candidate.colorSeed;
    } catch (error) {
      this.recordStudyValidationFailure?.('event_edit', error, event);
      alert(error.message);
      return false;
    }

    // The candidate is complete and valid before anything in memory changes.
    candidate.lastModified = changed ? Date.now() : event.lastModified;
    Object.assign(event, candidate);
    for (const key of ['allDay', 'startDate', 'endDate']) {
      if (!(key in candidate)) delete event[key];
    }
    if (!changed) return true;
    this._detailViewHasChanges = true;
    this.invalidateEventViews();
    if (persist) this.persistEditedEvent(event);
    if (redraw) this.drawSpiral();
    return true;
  },

  addCalendarEvent(event) {
    let candidate;
    try {
      candidate = this.normalizeRuntimeEvent(this.serializeEventTime(event));
      SpiralEventModel.validateUnique([...this.events, candidate]);
    } catch (error) {
      this.recordStudyValidationFailure?.('event_add', error, event);
      alert(error.message); return false;
    }
    this.events.push(candidate);
    this.invalidateEventViews();
    this.saveEventsToStorage();
    this.requestEventListRender();
    return candidate;
  },

  addDraftEvent(event = this.draftEvent) {
    if (!event?.isDraft || event !== this.draftEvent) return false;
    this.finishEventColorPreview?.(event);
    this.finishActiveDetailTextEditor({ redraw: false });
    const added = this.addCalendarEvent(event);
    if (added) this.draftEvent = null;
    return added;
  },

  deleteCalendarEvent(event) {
    const index = this.events.indexOf(event);
    if (index < 0) return false;
    this.events.splice(index, 1);
    this.invalidateEventViews();
    this.saveEventsToStorage();
    this.requestEventListRender();
    return true;
  },

  finishEventHandleDrag({ cancelled = false } = {}) {
    const drag = this.handleDragState;
    if (drag && (drag.touchMoved || drag.event.start - drag.originalStart || drag.event.end - drag.originalEnd)) {
      this.recordStudyAction?.(cancelled ? 'handle_drag_cancelled' : 'handle_drag_completed', {
        eventId: drag.event.persistentUID || null,
        handle: this.mouseState.draggingHandle,
        before: { start: drag.originalStart.toISOString(), end: drag.originalEnd.toISOString() },
        after: { start: drag.event.start.toISOString(), end: drag.event.end.toISOString() },
        result: cancelled ? 'interrupted_at_current_value' : 'completed'
      }, { source: 'event_handle', inputMethod: drag.touchIdentifier != null ? 'touch' : this._studyMouseInputMethod || 'mouse' });
    }
    if (drag && (drag.touchMoved || drag.event.start - drag.originalStart || drag.event.end - drag.originalEnd)) {
      this._eventClickSequence = null;
    }
    this.mouseState.wasDragging = true;
    this.mouseState.isHandleDragging = false;
    this.mouseState.draggingHandle = null;
    this.mouseState.hoveredHandle = null;
    this.handleDragState = null;
    if (this._originalCircleModeDuringHandleDrag) {
      this.state.circleMode = true;
      this._originalCircleModeDuringHandleDrag = false;
    }
    if (drag && (drag.event.start - drag.originalStart || drag.event.end - drag.originalEnd)) {
      this.persistEditedEvent(drag.event);
    }
    this.refreshCanvasCursor();
    this.drawSpiral();
  }
});
