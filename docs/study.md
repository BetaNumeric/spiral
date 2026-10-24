# Running a short study

Study Session records Explore, Tasks, and Debrief on a shared phone. Controls stay
inside **Settings → Study Session**. Starting or switching a mode closes Settings
and collapses the study controls, leaving the normal calendar for the participant.

## Before the first participant

Prepare the calendar and starting view. Under **Facilitator tools**, choose
**Save starting calendar** if you want to restore the same setup between people.
Use a test calendar: recordings include event titles, times, and view settings.
Event description text is omitted.

## Each participant

1. Open **Study Session** and tap **Start exploring**. Participant codes are filled
   automatically (`P01`, `P02`, …); you can change the code if needed.
2. Give the participant a short time to explore. When ready, open Study Session
   and tap **Tasks**. This starts **Task 1** automatically.
3. Give the next instruction and tap **Next task** between tasks. Tasks are numbered
   automatically, so use the same order for each participant. Instructions can stay
   on your own task sheet; there is no task setup form.
4. Tap **Debrief** after the last task. Interaction recording continues while you
   discuss the app and let the participant keep using it.
5. Tap **Finish study**. The session is saved separately and the next participant
   code is ready. Restore the starting calendar before the next person if needed.

The participant can switch modes themselves, or hand the phone to the facilitator
at these boundaries. There are no study prompts or controls over the calendar.

## Control the study from a laptop

The optional [connection service](study-remote-server.md) lets one facilitator
control several phones separately. Open `facilitator.html` at the service address
and create a connection. On each phone, scan its QR code, or open **Facilitator
tools → Remote facilitator** and enter the connection code. Pair once before
participants begin; a pairing code can connect multiple phones.

Select a phone on the laptop to start a participant, switch phases, move to the
next task, pause, or finish. The dashboard also accepts notes, help markers, and
optional task results. It shows phase/task timing, save status, and recent actions.
Participant codes are assigned across connected phones. Remote phase changes keep
the participant's open calendar panels in place.

Wait for the dashboard's confirmation from the phone before treating a command as complete.
If the connection drops, local recording continues. Unconfirmed commands are not
automatically resent. After a phone reload, resume its recovered recording locally
before using remote controls again. The dashboard shows activity rather than a
live screen mirror; full recordings are still exported from each phone.

The app and dashboard can stay on GitHub Pages: enter the separate HTTPS service
address on the facilitator page and allow the GitHub Pages origin on the relay.
The QR carries both the code and service address; confirm it once on each phone.
The [service guide](study-remote-server.md#keep-the-app-on-github-pages) includes
the commands. Keep using the same app address to preserve its browser storage.

## Optional facilitator tools

- **Pause / Resume** for interruptions.
- **Task result** and **Log help given** for an active task. Switching tasks ends
  the attempt as **Not rated** unless you explicitly choose a result; it does not
  infer success from an edit or click.
- **Note** for an observation or answer. Add it during the task to associate it
  with that attempt.
- **Export session**, **Export all sessions**, and **Open Study Analysis** for
  backups and review.

Recordings stay in this browser. Export a backup regularly; clearing browser data
also clears the archive. Restoring the starting calendar preserves recordings.

## Interruptions and analysis

Hiding the app pauses recording; returning resumes a background pause. A manual
pause stays paused. After a reload, resume or finish the recovered session.
Recorded pauses and recovery gaps are excluded from task time. Reading and
thinking remain included. Explore and Debrief interactions are recorded too.

If saving fails, keep the tab open, export the session as a backup, and retry.
If another tab changed the recording, keep the backup and reload to recover the
saved version. Archive exports retain conflicting local copies separately in
`recoverySnapshots`; they do not replace saved recordings in analysis.

Study Analysis reads saved sessions or imported JSON and counts duplicate exports
once. It shows phase timelines and task durations, with optional results and
assistance. Keep the raw JSON alongside your task sheet and debrief notes for
later analysis. Try one short pilot through all three modes before the study.

For storage/schema details and command-line analysis, see the
[development guide](development.md#study-recording-and-analysis).
