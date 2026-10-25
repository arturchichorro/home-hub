# Workouts

An owner-enabled module, disabled by default. Household members share standalone
workouts; training logs and set values remain private to their author.

- Open a workout from the list; its name appears in the breadcrumb and URL.
- Exercise edits autosave after typing pauses or on blur; settings, additions,
  and removals save immediately. There is no save-confirmation button. Workout notes are always
  visible below the exercises. A settings-icon menu configures each exercise's
  load convention and sides; the measure uses the shared Base UI select.
- Reorder workouts like Lists: drag with a mouse, hold to drag on touch, or use
  Space and arrow keys. The household-shared order is persisted optimistically.
- Press **Done** beside the open log controls or below its note to record
  completion, with or without set entries. The page-header shortcut also remains.
- “Log workout” expands weight/reps/seconds inputs beneath the existing exercise
  rows without replacing the page. Unsaved exercise edits are saved first.
- Unilateral sets explicitly label **Left** and **Right** counts; an empty right
  count uses the left value. These are side counts, not repetitions in reserve.
- Each log has a private, autosaving free-text note. Completing or closing a log
  preserves its latest note draft; notes can also be edited later in history.
- Unfinished logs are labelled **Draft**: saved entries not yet marked Done.
  Resume a draft or review/correct previous entries. Each history row shows the
  recorded exercises, sets, reps/seconds, side counts, and weights directly;
  matching sets are condensed. Empty logs say “No sets logged.” Logs snapshot the
  workout at creation; editing a log never changes the shared workout.
- Add the supplied A/B/C starter workouts.

There are no plans, cycles, scheduling, timers, progression suggestions, or
configured weight increments. Data lives in `workouts`, `workout_logs`, and
`workout_log_sets`; membership, module availability, and private-log ownership
are enforced in Zero queries and mutations.

## Upgrade

`0034_slimy_darwin.sql` is unchanged. Apply the forward migration
`0035_thin_runaways.sql` while API and Zero are stopped, then restart on the new
code and reload clients. It expands existing plans into standalone workouts,
including workouts removed from a plan but retained in history. It preserves
log IDs, authors, dates, status, snapshots, and set values. Former instruction
fields and legacy session/set annotations are consolidated into snapshot notes.
After verifying the copy, it removes the superseded plan/cycle/session tables
and updates the Zero publication. Back up before this contract migration;
rollback requires restoring the backup and previous code.

`0036_fat_ender_wiggin.sql` adds ordering keys and an index, preserving the previous
alphabetical order within each household. New workouts go first; starter import
keeps A/B/C order. Earlier migrations remain unchanged.

`0037_freezing_lyja.sql` adds the private log note with an empty-string default.
Existing rows, snapshots, and set values are unchanged; the column is included
in the existing all-column Zero publication.
