// Detail selection, draft lifetime, and opening/closing state.
Object.assign(SpiralCalendar.prototype, {
  openDetailViewForSegment(segment, options = {}) {
    if (!segment) return null;

    this.finishActiveDetailTextEditor({ redraw: false });

    this.cancelDetailViewAutoZoomAnimation();
    const interruptingClosingTransition = !!(
      this.isModeTransitionActive() &&
      this.modeTransitionState &&
      !this.modeTransitionState.targetCircleMode
    );
    if (interruptingClosingTransition) {
      this.cancelModeTransition();
    }
    const openingFromClosed = this.state.detailViewDay === null;
    const nextSegment = { ...segment };
    const selectionVersion = this._detailViewSelectionVersion = (this._detailViewSelectionVersion || 0) + 1;
    if (!options.preserveDraft && this.mouseState.selectedSegment?.clockOffsetMs !== nextSegment.clockOffsetMs) this.draftEvent = null;
    const shouldAutoSwitchToCircle = this.state.detailViewAutoCircleMode !== false && !this.state.circleMode;
    const shouldAnimate = options.animateTransition !== false &&
      openingFromClosed &&
      !this.state.circleMode &&
      !this.isModeTransitionActive();
    const shouldAutoZoomInward = options.autoZoomInward !== false && openingFromClosed;

    if (openingFromClosed) {
      this._detailViewAutoCircleActive = shouldAutoSwitchToCircle;
      this._detailViewOpeningRotation = this.state.rotation;
    }

    this.mouseState.selectedSegment = nextSegment;
    this.mouseState.selectedSegmentId = this.getSelectedSegmentId(nextSegment);
    if (typeof options.selectedEventIndex === 'number') {
      this.mouseState.selectedEventIndex = options.selectedEventIndex;
    }

    const applyDetailViewState = () => {
      const selected = this.mouseState.selectedSegment;
      if (this._detailViewSelectionVersion !== selectionVersion || !selected ||
          selected.day !== nextSegment.day || selected.segment !== nextSegment.segment ||
          selected.clockOffsetMs !== nextSegment.clockOffsetMs) {
        return;
      }
      this.state.detailViewDay = nextSegment.day;
      this._detailViewHasChanges = false;
      this.mouseState.hoveredDetailElement = null;
      if (typeof this.recordStudyDetailViewOpened === 'function') {
        this.recordStudyDetailViewOpened(nextSegment);
      }
      if (shouldAutoZoomInward) {
        this.startDetailViewAutoZoomAnimation(nextSegment);
      }
    };

    if (shouldAnimate) {
      this.startModeTransition(true, {
        fromProgress: 0,
        persistScaleState: false,
        alignVisibilityToMidnight: true,
        detailViewPreview: true,
        morphGeometry: shouldAutoSwitchToCircle,
        onComplete: applyDetailViewState
      });
    } else {
      applyDetailViewState();
    }

    return nextSegment;
  },

  closeDetailView(options = {}) {
    this.finishEventColorPreview?.(this.draftEvent);
    this._detailViewSelectionVersion = (this._detailViewSelectionVersion || 0) + 1;
    this.finishActiveDetailTextEditor({ redraw: false });
    this._cleanupRepeatedTimeChooser?.();
    this._cleanupExtendedDateTimeEditor?.();
    const {
      clearSelection = false,
      clearDraft = false,
      animateTransition = true
    } = options;

    this.cancelDetailViewAutoZoomAnimation();

    const wasDetailViewOpen = this.state.detailViewDay !== null;
    const wasAutoCircleActive = !!this._detailViewAutoCircleActive;
    const closingSegment = wasDetailViewOpen && this.mouseState.selectedSegment
      ? this.getStudySegmentDescriptor(this.mouseState.selectedSegment)
      : null;

    if (wasDetailViewOpen && typeof this.recordStudyDetailViewClosed === 'function') {
      this.recordStudyDetailViewClosed({
        segment: closingSegment,
        clearSelection,
        clearDraft,
        hadChanges: !!this._detailViewHasChanges
      });
    }

    if (clearDraft) {
      this.draftEvent = null;
    }

    const shouldAnimateSpiralEdgeReset = !!(
      animateTransition !== false &&
      wasDetailViewOpen &&
      !wasAutoCircleActive &&
      !this.state.circleMode &&
      this.mouseState.selectedSegment &&
      !this.mouseState.isHandleDragging &&
      !this.isModeTransitionActive()
    );

    this.state.detailViewDay = null;
    this._detailViewAutoCircleActive = false;
    this._detailViewHasChanges = false;
    this.mouseState.hoveredDetailElement = null;
    if (this.canvasClickAreas) {
      this.canvasClickAreas.closeDetailButton = null;
      this.canvasClickAreas.prevEventChevron = null;
      this.canvasClickAreas.nextEventChevron = null;
    }

    const finalizeClose = () => {
      if (this.state.detailViewDay !== null) {
        if (this.canvas && typeof this.refreshCanvasCursor === 'function') {
          this.refreshCanvasCursor(true);
        }
        if (typeof this.drawSpiral === 'function') {
          this.drawSpiral();
        }
        return;
      }

      const returnRotation = Number.isFinite(this._detailViewOpeningRotation)
        ? this._detailViewOpeningRotation
        : null;
      this._detailViewOpeningRotation = null;
      if (clearSelection) {
        this.mouseState.selectedSegment = null;
        this.mouseState.selectedSegmentId = null;
      }
      if (this.canvas) {
        if (typeof this.refreshCanvasCursor === 'function') {
          this.refreshCanvasCursor(true);
        } else {
          this.canvas.style.cursor = 'default';
        }
      }
      if (Number.isFinite(returnRotation)) {
        const didAnimateReturn = animateTransition !== false &&
          this.animateDetailViewAutoZoomRotation(returnRotation, {
            shouldContinue: () => this.state.detailViewDay === null
          });
        if (!didAnimateReturn) {
          this.state.rotation = returnRotation;
          this._shouldUpdateEventList = true;
        }
      }
      if (typeof this.drawSpiral === 'function') {
        this.drawSpiral();
      }
    };

    if (shouldAnimateSpiralEdgeReset) {
      this.startModeTransition(false, {
        fromProgress: 1,
        persistScaleState: false,
        restoreScale: false,
        alignVisibilityToMidnight: true,
        morphGeometry: false,
        onComplete: finalizeClose
      });
      return;
    }

    finalizeClose();
  },

  cycleDetailViewEvent(direction = 1) {
    this._eventClickSequence = null;
    this.finishActiveDetailTextEditor({ redraw: false });
    const detailEventState = this.getDetailViewEventState();
    if (!detailEventState || detailEventState.selectedEventCount < 2) {
      return false;
    }

    const eventCount = detailEventState.selectedEventCount;
    const normalizedDirection = direction < 0 ? -1 : 1;
    const nextIndex = (detailEventState.activeEventIndex + normalizedDirection + eventCount) % eventCount;
    this.mouseState.selectedEventIndex = nextIndex;
    return true;
  },

  navigateDetailViewEvent(direction = 1) {
    const detail = this.getDetailViewEventState();
    if (!detail?.activePersistedEvent || detail.isDraftEventActive) return false;
    this.finishActiveDetailTextEditor({ redraw: false });
    const events = this.getVisibleEvents().slice()
      .sort((a, b) => this.getEventDateMs(a.start) - this.getEventDateMs(b.start));
    const index = events.indexOf(detail.activePersistedEvent);
    if (index < 0) return false;
    const next = events[index + (direction < 0 ? -1 : 1)];
    return next ? this.openEventAtStart(next) : false;
  },

  _getSelectedEventForHandleEditing() {
    if (this.state.detailViewDay === null) return null;
    const detailEventState = this.getDetailViewEventState();
    if (!detailEventState || !detailEventState.detailEvent) return null;
    return detailEventState.detailEvent;
  },

  getSelectedSegmentId(segment = this.mouseState.selectedSegment) {
    if (!segment) return null;
    return this.getSegmentId(segment.day, segment.segment);
  },

  createDraftEventForSegmentId(segmentId, selection = {}) {
    if (segmentId === null || segmentId === undefined) return null;
    const segmentDate = this.getSegmentDate(segmentId);
    let segmentStart = new Date(segmentDate);
    segmentStart.setUTCMinutes(0, 0, 0);
    const zone = this.getCalendarTimeZone();
    const part = SpiralEventProjection.repeatedHour(segmentStart.getTime(), zone)?.parts
      .find(part => part.offsetMs === selection.clockOffsetMs);
    if (part) segmentStart = new Date(part.startWallMs);
    segmentStart = SpiralTime.instantToWall(SpiralTime.wallToInstant(segmentStart, zone), zone);
    const choices = SpiralTime.possibleInstants(segmentStart, zone);
    const occurrence = part ? choices.findIndex(instant => segmentStart - instant === part.offsetMs) : undefined;
    const range = this.getDefaultEventRange(segmentStart, { occurrence });
    const candidateColors = [];
    const colorState = this.createEventColorState({
      calendarName: 'Home',
      eventDate: segmentStart,
      initialRange: range,
      candidateColors
    });

    const draft = {
      title: '',
      description: '',
      ...range,
      timeModel: 'instant-v1',
      ...colorState,
      calendar: 'Home',
      isDraft: true,
      autoEnd: true,
      segmentId
    };
    this.normalizeRuntimeEvent(draft);
    draft.title = '';
    this.startDraftEventColorPreview(draft, candidateColors);
    return draft;
  },

  getDetailViewEventState(options = {}) {
    const { ensureDraft = false } = options;
    const selectedSegment = this.mouseState.selectedSegment;
    const selectedSegmentId = this.getSelectedSegmentId(selectedSegment);
    if (!selectedSegment || selectedSegmentId === null) return null;

    const segmentEventEntries = this.getEventsForClockSegment(selectedSegment);
    const selectedEventCount = segmentEventEntries.length;
    const activeEventIndex = Math.min(
      this.mouseState.selectedEventIndex || 0,
      Math.max(0, selectedEventCount - 1)
    );
    const activePersistedEvent = segmentEventEntries[activeEventIndex]?.event || null;

    if (ensureDraft && !activePersistedEvent && (!this.draftEvent || this.draftEvent.segmentId !== selectedSegmentId)) {
      this.draftEvent = this.createDraftEventForSegmentId(selectedSegmentId, selectedSegment);
    }

    const draftEvent = this.draftEvent && this.draftEvent.segmentId === selectedSegmentId
      ? this.draftEvent
      : null;
    const isDraftEventActive = !!draftEvent && (!activePersistedEvent || draftEvent.segmentId === selectedSegmentId);
    const detailEvent = isDraftEventActive ? draftEvent : activePersistedEvent;

    return {
      selectedSegment,
      selectedSegmentId,
      segmentEventEntries,
      selectedEventCount,
      activeEventIndex,
      activePersistedEvent,
      activeDisplayInterval: segmentEventEntries[activeEventIndex]?.displayInterval || null,
      draftEvent,
      isDraftEventActive,
      detailEvent
    };
  },

});
