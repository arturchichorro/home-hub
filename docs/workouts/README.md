# Workouts

An owner-enabled module, disabled by default. Household members share standalone
workouts; training logs and set values remain private to their author.

- Open a workout from the list; its name appears in the breadcrumb and URL.
  **Log workout** and **+ Add exercise** sit to the right of the title; there is
  no separate Exercises heading.
- Exercise edits autosave after typing pauses or on blur; settings, additions,
  and removals save immediately. There is no save-confirmation button. Shared
  workout notes sit below the exercises in a collapsed Base UI accordion from
  `ui-web`. A settings-icon menu configures each exercise's
  load convention and sides; the measure uses the shared Base UI select.
- Reorder workouts like Lists: drag with a mouse, hold to drag on touch, or use
  Space and arrow keys. The household-shared order is persisted optimistically.
- **Log workout** opens an unsaved form. The **checkmark** (Save log) saves the
  log and entered sets; **X** cancels. Both are matching neutral icon buttons,
  right-aligned beside the title and below the sets.
  Navigating away or refreshing before saving also discards the form. Nothing
  is stored as a draft, and browsing a workout has no completion shortcut.
- Each user has at most one log per workout per local calendar day. Logging again
  opens today's saved entry; saving updates that same record. Other workouts and
  other authors have independent daily logs. The database enforces uniqueness.
- Logging expands weight/reps/seconds inputs beneath the existing exercise rows
  without replacing the page. Unsaved exercise edits are saved first.
- Unilateral sets explicitly label **Left** and **Right** counts; an empty right
  count uses the left value. These are side counts, not repetitions in reserve.
- Private log notes display inline beside the history date, like cooking-log
  comments, with seamless editing and autosave on pause, blur, or Enter. When
  absent, the same right-hand message icon adds and focuses the note input.
  Private notes are not accordions and update independently of set corrections.
- History contains finished logs only, showing actual exercises, sets,
  reps/seconds, side counts, and weights; matching sets are condensed. Deliberate
  note-only logs say “No sets logged.” Targets and previous values are not
  recorded automatically. Invalid partial rows block saving without losing input.
- Logs capture only the workout title and exercise definitions, never shared
  workout notes. The Notes section always shows the current shared notes, even
  when opening history. Private log notes remain separate. Historical edits
  retain the original title/exercises and completion dates.
- Add the supplied A/B/C starter workouts.

There are no plans, cycles, scheduling, timers, progression suggestions, or
configured weight increments. Membership, module availability, and private-log
ownership are enforced in Zero queries and mutations.

## Data model

- `workouts`: household-shared title, notes, ordering and timestamps.
- `workout_exercises`: typed exercise rows with name, sets, target, unit, sides,
  load convention, ordering and timestamps. A composite household/workout foreign
  key prevents cross-household references. The primary key is `(workout_id, id)`:
  existing starter exercise IDs are reused across workouts and remain unchanged.
- `workout_logs`: private daily records, notes and immutable title/exercise
  snapshots. Historical definitions remain JSON so later edits/deletions never
  rewrite logged workouts.
- `workout_log_sets`: recorded values belonging to a log. Its exercise ID refers
  to the immutable snapshot, deliberately not to the deletable editable row.

Exercise autosaves send field-level patches and explicit additions/deletions,
never a replacement array. Unrelated concurrent edits and unseen additions are
preserved. Mutations serialize through the parent workout before checking the
current row count/order and applying changes atomically.

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

`0040_remove-workout-log-snapshot-notes.sql` removes the copied notes key from
existing log snapshots. Private log notes, titles, exercise definitions, dates,
and set values remain unchanged. Apply before deploying the matching snapshot
schema and reload clients; earlier migrations are unchanged.

`0041_far_the_fallen.sql` copies editable JSON exercises into
`workout_exercises`, preserving IDs, definitions, array order and timestamps,
including reused IDs across workouts. It verifies the exact copy before dropping
`workouts.exercises` and publishes the new table to Zero. Existing log snapshots,
private notes and recorded sets are untouched. Back up, stop API/Zero, apply the
migration, deploy matching code, restart and reload clients. Rollback requires
the backup and previous code; earlier migrations are unchanged.
