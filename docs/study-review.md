# Study recording and analysis review

Reviewed against app version 1.42.54 for a study using a shared test device and a facilitator. This is a review and proposed implementation sequence; the application behavior has not been changed by this review.

The existing recorder is a useful foundation, but its storage and measurements need work before collecting study data. The calendar itself does not need to be rebuilt. Browser and command-line analysis already share a module, and the recorder has stable session IDs, participant IDs, timestamped entries, phase changes, and event-change descriptions to build on.

## Confirmed issues

### 1. Sessions can be lost without a visible warning

`startStudySession()` replaces the current session and writes it to the single `spiralCalendarStudySessionDraft` key. Starting participant P02 after P01 removes P01's local session unless someone exported it separately. Starting again for the same participant also replaces the previous recording; Stop/Start is not Pause/Resume.

Other confirmed problems:

- Two recording tabs restore independent copies of the same session and overwrite each other's interactions when saving.
- Storage-write failures only produce a console warning. Recording can look healthy while nothing is being saved.
- `loadStudySessionDraft()` deletes recordings with a different schema version.
- Every entry serializes and writes the entire session synchronously, sometimes more than once per action. Increasing the logging volume would increase the work done on the participant's interaction path.

**First priority:** keep a session archive keyed by session ID, separate the active recording from completed sessions, show save health, and allow only one recording tab. Preserve unsupported/corrupt records for recovery. Prefer an IndexedDB event journal with bounded write batches and explicit finalization over repeatedly rewriting one large localStorage object. Keep exports available as an independent backup.

Source: [study-session.js](../js/study-session.js), especially `startStudySession`, `appendStudyInteraction`, `saveStudySessionDraft`, and `loadStudySessionDraft`.

### 2. There is a Task phase, but no individual task or attempt model

The available phases are Explore, Task, and Debrief. There are no task IDs, task start/end markers, attempt numbers, success criteria, outcomes, assistance markers, or facilitator notes. Multiple tasks performed in the Task phase cannot be separated reliably afterwards. Reading tasks can succeed without changing an event, so successful edits are not a substitute for task outcomes.

**Add:** versioned task definitions and explicit attempts with start/end, outcome, assistance, and optional answers/notes. Initially the facilitator can mark success, partial success, failure, skip, or abandonment. Automatic grading can be added for tasks with precise event-state criteria.

### 3. Session time is not equivalent to time spent doing the tasks

Elapsed offsets use the device wall clock. There are no pause/resume or page-visibility markers. A recording recovered an hour later includes that hour in the session and current phase. Importing a raw recording still marked `isRecording: true` makes its analyzed duration keep growing with the analysis computer's current time.

**Add:** monotonic elapsed timing within each page lifetime; explicit pause, resume, background, recovery, and interruption records; and a fixed endpoint for incomplete exported recordings. Report total elapsed time and paused/background intervals separately. Do not automatically subtract quiet reading or thinking time as though it were a break.

Sources: `buildStudyInteraction`, `restoreStudySessionDraft`, `summarizeStudySession` in [study-session.js](../js/study-session.js); `getDurationMs` and `deriveMetrics` in [study-analysis-core.mjs](../tools/study-analysis-core.mjs).

### 4. Several important participant actions are missing or ambiguous

The current log records panel openings, detail-hour openings/switches/closures, orientation, and persisted event/settings differences. It is not a log of all clicks or all meaningful actions.

- Selecting or cycling between overlapping events in the same hour has no dedicated action record. Detail records identify a selected index, not the selected event's permanent ID.
- Navigation is captured only indirectly in some settings snapshots. It does not describe the gesture, input method, date range traversed, or deliberate navigation versus automatic movement.
- Event searches, calendar filtering, discarded drafts, cancelled editors, and validation failures lack dedicated records.
- Automatic color changes can later appear as event edits when event snapshots are compared. I reproduced a color-only change increasing the event-update count.
- Settings logging is tied to debounced persistence. A setting changed just before Stop can appear in final settings without any corresponding interaction. Pending changes can also cross a phase boundary.

**Change the measurement boundary:** record meaningful committed actions directly where they happen, and keep state snapshots as supporting context. Distinguish participant, facilitator, and system actions. Keep persistence success/failure separate from the user's attempted action. Record one gesture summary, rather than every animation frame or pointer movement.

Sources: [study-session.js](../js/study-session.js), [detail-view-state.js](../js/detail-view-state.js), [event-storage-ui.js](../js/event-storage-ui.js), and [state-storage-sync.js](../js/state-storage-sync.js).

### 5. Exports do not fully describe what the participant saw

The recorder captures an initial event snapshot internally, but does not retain/export it as an immutable starting dataset. Unchanged pre-existing events are therefore absent from the normal study export. Initial settings omit relevant context including scale, time-zone ID, visible calendars, and the color-animation option. Event descriptors omit all-day date fields.

Detail-hour descriptors also use wall-coordinate Dates serialized with `Z`, and ignore the repeated-hour occurrence. The two occurrences of 02:00 on October 25 produce identical study descriptors. This is ambiguous and does not match the canonical-instant approach used by calendar events.

Exports use the currently running app version, rather than exclusively the version stored when the session started. Recovered sessions spanning an app update need both versions and an explicit transition record.

**Add:** study/protocol/condition version, a known fixture ID and immutable initial dataset or fixture manifest, initial calendar/view state, display reference time, zone ID, and app build. Use canonical instants plus explicit wall time/offset/occurrence for selected calendar targets. Snapshot the effective view at action/task boundaries, not on every rendered frame.

### 6. Analysis can double-count data or accept unusable imports

The analysis page concatenates the local session with imported sessions. Importing an export of that same local session results in two analyzed sessions and doubled totals. Import replacement also does not distinguish a newer recording from an older export of the same session.

The shared analyzer accepts a truthy invalid start date, and accepts malformed interaction rows. I reproduced a session containing a null interaction being accepted and then crashing report rendering. Unknown phases are silently treated as Explore. There are no dedicated recorder/analyzer tests in the current test suite.

**Add:** validation with clear per-file diagnostics; session-ID deduplication in the shared analysis layer; explicit handling of incomplete sessions; revision/completeness checks when combining exports; and recording/analysis regression tests. Preserve original imported JSON alongside normalized data.

Sources: `render` and `importFiles` in [study-analysis-page.js](../js/study-analysis-page.js); `normalizeRawSession`, `analyzeSessions`, and `renderTimelines` in [study-analysis-core.mjs](../tools/study-analysis-core.mjs).

## Data worth collecting

| Level | Useful fields |
| --- | --- |
| Study/session | Study and protocol version, pseudonymous participant ID, session ID, condition, app build, device/viewport, time zone, fixture ID, initial view, start/end, interruptions, recording/save health |
| Task attempt | Task ID/version, attempt ID, target event IDs or expected state, start/end, outcome, assistance, optional response, facilitator notes, dataset/view state at task boundaries |
| Action | Sequence number, UTC timestamp, monotonic elapsed offset, phase, task/attempt IDs, actor, action type, mouse/touch/pen/keyboard input, source control, target event ID, result/cancellation/error, relevant before/after values |
| Calendar context | Displayed date range, scale/view mode, visible calendars, selected event and repeated-hour occurrence, start/end view for a navigation gesture |
| Questionnaire | Participant/session/task IDs as appropriate, question and questionnaire version, response or an external response reference |

Examples of action types: navigation completed, event selected, overlap cycle, search submitted/result selected, filter changed, draft started/discarded, event created/edited/deleted, handle drag completed/cancelled, editor cancelled, validation failed, and setting changed. Preserve raw structured records so new metrics can be calculated later.

More logging is useful when it provides context or records an otherwise invisible attempt. Unbounded pointer-move logs are less useful as a default. For a study of interaction precision, optionally capture targeted hit/miss and gesture-coordinate data separately.

The current recorder includes event titles and location coordinates. Description hashes are useful for change detection but are not an anonymization guarantee. A known synthetic study calendar lets event IDs and controlled labels provide meaning without collecting participants' personal calendar contents.

## Suggested facilitator workflow

1. Load the agreed fixture, view settings, and condition. Record their versions. Starting each participant from the same setup should preserve all archived study sessions.
2. Enter a pseudonymous participant ID and start Explore.
3. Start each named task. Mark its outcome, help, and notes explicitly; allow another attempt where the protocol calls for one.
4. Enter Debrief and link questionnaire responses using the same participant/session ID. Questions can remain in the facilitator's existing questionnaire tool.
5. Stop and finalize the session, verify it is saved, and export it. Use session IDs/timestamps in export names.
6. Archive the session and reset the test calendar for the next participant. Do not use a global data-delete operation as participant reset.

A server is not necessary for this shared-device setup. A local archive plus regular exports is sufficient as an initial design. Keep facilitator controls compact so they do not dominate the participant's calendar.

## Implementation order

1. **Protect recordings:** archive, single-writer behavior, visible storage failures, safe recovery, finalization/export, and tests for loss/reload/multiple participants.
2. **Measure the study:** task/attempt controls, timing/interruption handling, semantic action hooks, immutable fixture/view context, and questionnaire/notes linkage.
3. **Make analysis trustworthy:** validation, deduplication, incomplete-session flags, participant/task/condition tables and timelines, and tidy CSV exports. Keep one shared metric definition for exports and reports.

Useful derived measures include task success and assisted-success rates, task duration with interruptions identified, attempts, cancelled/failed actions, selection cycles, navigation effort, first use of features, and exploration choices. Interpret counts alongside task outcomes: more clicks or edits alone do not establish better usability. The current Top Findings are descriptive activity summaries.

Pilot the complete record → stop → recover/export → import → analyze workflow before the study. In particular, test two consecutive participants, a reload, two tabs, failed storage, repeated import, stop immediately after a setting change, and a task that involves reading rather than editing.

## Verification performed

The findings above were checked against the actual recorder and shared analyzer functions in isolated Node/VM fixtures. Reproductions confirmed session replacement, schema deletion, unreported save failure, cross-tab overwrite, missing stop-time settings changes, recovery time inflation, ambiguous repeated-hour descriptors, color-only edit counts, duplicate analysis sessions, growing active-import duration, and malformed-import report failure. These checks used isolated in-memory storage; no participant data was accessed or changed.
