# Workouts

An owner-enabled module, disabled by default. Household members share standalone
workouts; training logs and set values remain private to their author.

- Open a workout from the list; its name appears in the breadcrumb and URL.
  **Log workout** and **+ Add exercise** sit to the right of the title; there is
  no separate Exercises heading.
- Exercise edits autosave after typing pauses or on blur; settings, additions,
  and removals save immediately. There is no save-confirmation button. Workout notes are always
  visible below the exercises. A settings-icon menu configures each exercise's
  load convention and sides; the measure uses the shared Base UI select.
- Reorder workouts like Lists: drag with a mouse, hold to drag on touch, or use
  Space and arrow keys. The household-shared order is persisted optimistically.
- **Log workout** opens an unsaved form. Only **Done**, beside its controls or
  below its note, saves the log, entered sets, and private note together.
  Closing, navigating away, or refreshing before Done discards the form. Nothing
  is stored as a draft, and browsing a workout has no Done shortcut.
- Each user has at most one log per workout per local calendar day. Logging again
  opens today's saved entry; Done updates that same record. Other workouts and
  other authors have independent daily logs. The database enforces uniqueness.
- “Log workout” expands weight/reps/seconds inputs beneath the existing exercise
  rows without replacing the page. Unsaved exercise edits are saved first.
- Unilateral sets explicitly label **Left** and **Right** counts; an empty right
  count uses the left value. These are side counts, not repetitions in reserve.
- Each log has a private free-text note, saved only with Done. History entries
  can be corrected with Done; cancelling leaves the saved record unchanged.
- History contains finished logs only, showing actual exercises, sets,
  reps/seconds, side counts, and weights; matching sets are condensed. Deliberate
  note-only logs say “No sets logged.” Targets and previous values are not
  recorded automatically. Invalid partial rows block Done without losing input.
- A new form captures the workout definition when opened and saves that snapshot
  on Done. Historical edits retain the original snapshot and completion dates;
  they never change the shared workout.
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

`0038_rainy_sunspot.sql` intentionally deletes unfinished logs and their dependent
sets, preserves completed logs/notes/snapshots/sets, and removes the status column,
active-log index, and status checks. Completion dates become required. Back up and
stop the old API/Zero before this contract migration; deploy the new code and
reload clients afterwards. Rollback requires restoring the backup and old code.

`0039_modern_dagger.sql` keeps the most recently completed log per author, workout,
and day (completion time, creation time, then ID break ties), deletes older
same-day duplicates and their sets/notes, and adds the daily unique index. This
cleanup is intentional; back up and apply with the API/Zero stopped as above.
