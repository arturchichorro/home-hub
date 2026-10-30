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
- Workout rows show your latest day with saved sets on the right, including weekday
  (and year for older logs). Never-logged rows stay blank; other members' logs
  remain private. The stored local day is shown without timezone conversion.
- Reorder workouts like Lists: drag with a mouse, hold to drag on touch, or use
  Space and arrow keys. The household-shared order is persisted optimistically.
- **Log workout** opens inline logging. Complete sets autosave after a 600 ms
  typing pause, on leaving the row, or on Enter. There is no Save/Done/checkmark:
  **X** closes logging, and saving never closes it or replaces focused inputs.
  Incomplete/failed edits stay local with clear status and retry. Close/navigation
  asks before discarding them; unload and PWA updates are guarded.
- Each author has at most one grouping per workout/local day; logging again opens
  it. Separate workouts on the same day have separate exercise occurrences.
  A grouping is created with the first complete set, not merely by browsing.
- **Add set** appears after the displayed sets are complete, up to ten rounds.
  Extra sets belong only to that day's occurrence, persist when reopened, and do
  not change the workout prescription. Remove recorded sets explicitly with
  confirmation; clearing one input never deletes the stored set.
- Logging expands weight/reps/seconds inputs beneath the existing exercise rows
  without replacing the page. Unsaved exercise edits are saved first.
- New unilateral entries require both **Left** and **Right** counts explicitly.
  Loaded exercises also require weight; zero is valid. Bodyweight needs no weight.
  Previous values are hints, never recorded defaults. Historical blank-right
  entries still display their original left-equals-right meaning.
- Private log notes display inline beside the history date, like cooking-log
  comments, with seamless editing and autosave on pause, blur, or Enter. When
  absent, the same right-hand message icon adds and focuses the note input.
  Private notes are not accordions and update independently of set corrections.
- History appears as actual sets save; there is no finish-workout step. It shows
  recorded exercises, sets, reps/seconds, sides and weights, condensing matching
  sets. Existing note-only groupings remain visible as “No sets logged.” A partial
  row does not prevent complete rows from saving.
- Logs capture only the workout title and exercise definitions, never shared
  workout notes. The Notes section always shows the current shared notes, even
  when opening history. Private log notes remain separate. Historical edits
  retain the original title/exercises and completion dates.
- Add the supplied A/B/C starter workouts. **Add exercise** searches the household
  catalog or creates a new movement. The searchable catalog is listed below the
  workouts. Name, measure, load convention and sides are shared across workouts;
  sets and target ranges belong to each workout.
- Catalog rows show **Your last**: the latest nonempty, author-private exercise
  occurrence across workouts, with date and actual sets/counts/weights. Historical
  corrections retain their original date and measurement conventions; they do
  not become today's latest activity.
- The catalog's **+** focuses a new inline entry; names autosave on pause, blur,
  or Enter. Its settings menu edits measure, load and sides, including before
  naming a new movement. Escape discards unsaved text; blank entries are not
  stored. Duplicate names are rejected without merging or losing the draft.
  Standalone creation does not add a workout slot. Drag catalog handles with a
  mouse, hold on touch, or use Space and arrow keys to set a shared order;
  ordering within each workout remains independent.
- Delete a catalog exercise with its trash button and small confirmation popover.
  It disappears from the catalog/picker and all current workout slots. Completed
  logs, measurements, private notes and stored media remain intact. There is no
  archive or restore flow; reusing its name creates a fresh ID without old photos.

- Exercise pictures appear as compact inline strips like cooking-log photos, in
  the catalog and every workout using that movement. Uploads, deletion and picture
  ordering are shared, not per-slot or private log attachments. Reorder by mouse
  drag, touch hold, or Space and arrow keys; failed saves roll back with an error. The viewer supports navigation;
  while logging, reference pictures remain viewable but shared media editing is
  hidden. Opening the viewer never saves or replaces the in-memory log form.
  Still JPEG/PNG/WebP use the existing shared-media pipeline; video and animation
  support remains deferred.

There are no plans, cycles, scheduling, timers, progression suggestions, or
configured weight increments. Membership, module availability, and private-log
ownership are enforced in Zero queries and mutations.

## Data model

- `workouts`: household-shared title, notes, ordering and timestamps.
- `exercises`: household-shared movement catalog: stable ID, name/normalized name,
  measure, load convention, sides, ordering, deletion and timestamps. Active names
  are unique within a household after case/whitespace normalization. Catalog renames/settings edits
  apply to all linked workouts.
- `exercise_media`: catalog-to-`media` attachments, independent UUIDs, ordering,
  soft deletion and timestamps. Composite foreign keys keep assets/exercises in
  one household. Removing a slot or renaming a movement retains its pictures;
  deleting a picture unlinks the shared attachment without deleting asset bytes.
- `workout_exercises`: catalog references, workout-specific sets/targets, ordering
  and timestamps. Composite household foreign keys protect both parent links.
  The primary key remains `(workout_id, id)`; removing a slot does not delete the
  movement or its history.
- `workout_logs`: author-private daily grouping, notes and immutable title/exercise
  snapshot. One grouping per household/author/workout/local day.
- `exercise_logs`: independent author-private occurrences, catalog identity,
  original local day/time and historical exercise definition. No workout FK.
- `exercise_log_sets`: numeric amount/right amount/weight and original unit/load/
  sides, keyed by `(exercise_log_id, round)`. Their single occurrence FK determines
  author and household; access always goes through that authorized parent.
- `workout_log_exercises`: ordered links from a daily grouping and historical slot
  to its occurrence. Composite foreign keys prohibit cross-household/author links;
  deleting a current slot does not delete its occurrence.
- `workout_log_sets`: untouched pre-cutover archive, not the current source of truth.
  The API rejects the retired bulk writer. New writes target one occurrence/round;
  they never replace all sets or modify the prescription.

Exercise autosaves send field-level patches and explicit additions/deletions,
never a replacement array. Unrelated concurrent edits and unseen additions are
preserved. Mutations serialize through the parent workout before checking the
current row count/order and applying changes atomically. Shared catalog updates
patch only changed fields; settings edits do not overwrite concurrent renames.

Set mutations serialize per household/author/workout before resolving the daily
group and occurrence. Concurrent devices converge on one grouping without
overwriting other rows; historical corrections retain original snapshots/dates.

For statistics, join measurements to occurrences (no workout join), filter by
author and measurement unit, and group by catalog ID rather than name:

```sql
SELECT sum(s.amount) AS reps
FROM exercise_log_sets s
JOIN exercise_logs l ON l.id = s.exercise_log_id
WHERE l.household_id = $1 AND l.user_id = $2
  AND l.exercise_id = $3 AND s.unit = 'reps';
```

Unilateral totals may count both sides using
`amount + coalesce(right_amount, amount)`; do not mix reps with seconds.

## Exercise-media authorization

`workouts.exerciseMedia` synchronizes confirmed, non-deleted image metadata only
through a non-deleted catalog entry and an authorized household with
Workouts enabled. Historical-only tombstones remain hidden. API routes under
`/api/households/:householdId/workouts/exercises` authorize upload/confirmation,
batched derivative reads and soft removal. Confirmation rechecks access after
external processing; read/processing capabilities bind the Workouts module, catalog
ID and attachment ID. Object keys stay out of Zero. Media changes never modify
private log notes, sets or snapshots.

## Upgrade

`0046_tense_miss_america.sql` backfills stable RFC-compliant occurrence IDs and
links from every historical slot with sets. It checks the exact measurement copy,
preserves log IDs, dates, notes, snapshots, deleted slots and note-only entries,
and retains the old set table. New tables have primary keys before publication.
Follow the [coordinated autosave cutover](../deployment.md#exercise-log-autosave-cutover-0046);
old bulk writes must stop before the backfill. Official Zero 1.8 resumed its
existing replica and backfilled the new tables in an isolated rehearsal: no
replica reset, PostgreSQL reset, dependency patch or Zero upgrade is required.
Run `scripts/verify-exercise-logging-migration.sh <postgres-container>` for
disposable fidelity, publication, UUID and author-FK checks.


`0045_fearless_absorbing_man.sql` adds catalog `sort_key` and `deleted_at`, maps
legacy historical-only flags to tombstones, then removes `archived`. Initial
ordering preserves the existing alphabetical order. Active-only name uniqueness
allows fresh IDs to reuse deleted names; no snapshots, sets, links or media are
rewritten by the migration. Catalog mutations serialize through the household
before updating exercises/slots, preserving concurrent additions and deletions.
Back up PostgreSQL and Zero, stop API/Zero, apply this forward migration, restart
matching services and reload clients. Primary keys remain intact throughout;
local verification required no replica rebuild. Production is not migrated by
this local change. Run `scripts/verify-exercise-catalog-migration.sh <container>`
for disposable migration/history/uniqueness checks.

`0044_faulty_the_anarchist.sql` adds `exercise_media` and its Zero publication entry.
It is additive: no existing exercise, asset, recipe or log data is rewritten, and
no new Worker deployment, bucket or secret is needed. Back up and migrate the local
DB before loading the matching client; Zero can replicate the new table without
rebuilding its replica. The existing shared-media/older catalog contract upgrades
below still need their documented coordinated cutover when upgrading from older
production revisions.


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

`0042_dazzling_saracen.sql` merges matching names within each household into the
catalog and links existing slots to it. When live definitions disagree, the most
recently edited current definition supplies shared settings; historical settings
remain unchanged. Original IDs, prescriptions, ordering, notes, timestamps and
numeric values are preserved. Snapshots gain catalog IDs; set measurements move
out of JSON into typed columns. Historical-only movements remain hidden from the
shared catalog, preventing private snapshot names from being exposed.

The migration verifies value copies and aborts on unresolved historical sets.
It updates publication/replica identity around the primary-key change. Back up
and stop API/Zero before applying. Rebuild Zero's disposable SQLite replica before
restarting: an existing replica otherwise replays the intermediate keyless table
and can crash with “Cannot replicate table without a PRIMARY KEY or UNIQUE INDEX”.
Back up the replica first; do not remove PostgreSQL/application data or its volumes.
Then deploy matching code, restart Zero/API, and reload clients. Earlier migrations
remain unchanged. This change is local-only until explicitly committed/deployed.
