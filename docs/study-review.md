# Study measurement notes

For the participant workflow, see [Running a facilitated study](study.md).
For schema and tool details, see
[Study recording and analysis](development.md#study-recording-and-analysis).

## Measurement choices

Spiral supports a facilitator using a shared test device. Recordings live in a
local session archive; a saved test calendar/settings baseline provides the
starting condition for each participant. Regular JSON exports provide an
independent backup.

The recorder separates the study phase from automatically numbered task attempts. Task
outcomes and assistance are optional and marked explicitly: a reading task can succeed
without editing an event, and event editing alone does not establish success.
Task target IDs and expected-result descriptions document the protocol without
automatically grading it.

Elapsed session/phase time includes interruptions. Task time excludes recorded
pauses, background periods, and recovery gaps, while retaining quiet reading and
thinking. Incomplete snapshots remain identifiable and do not gain duration when
analyzed later.

Actions describe meaningful interactions and context rather than every pointer
movement or animation frame. Actor and input-method fields help separate
participant activity, facilitator controls, and system events. Stable event,
session, task, and attempt IDs connect records to the starting fixture and
questionnaire responses.

Analysis validates records, reports malformed or incomplete data, and combines
duplicate session exports by revision. Raw records remain the basis for future
metrics. Summary charts are descriptive; more actions, navigation, or edits do
not independently establish better engagement or worse usability.

## Limits and study preparation

- Use a controlled synthetic calendar. Titles, locations/settings, answers, and
  notes may identify people; description hashes are not anonymization.
- Keep questionnaire versions and external response references with the study
  protocol. Spiral does not administer or automatically score questionnaires.
- Legacy recordings may lack task attempts, actor labels, or interruptions.
  Their phase times and action totals are not equivalent to current task metrics.
- A local browser archive is not remote synchronization or an independent backup.
  Export regularly and check the downloaded data before clearing a device.
- Pilot two consecutive participants, a reload/recovery, a background pause, a
  second recording tab, duplicate import, a reading task, and an immediate
  stop after a setting change. Verify outcomes and timing in both the browser
  report and exported task CSV before starting the study.
