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
- While logging, the small **+ Add exercise** picker selects an existing catalog
  movement for this log only. It excludes current workout/log exercises and cannot
  create or edit catalog entries. Additions start as guarded local drafts; their
  first complete set saves a private session occurrence. Reopening the log
  restores them, including normal history/previous-value hints, but the workout
  template and future logs stay unchanged. A log supports at most 40 exercises
  including its original workout.
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
  retain the original base title/exercises and completion dates; log-only additions
  have their own frozen occurrence definitions.
- Add the supplied A/B/C starter workouts. **Add exercise** searches the household
  catalog or creates a new movement. The searchable catalog is listed below the
  workouts. Name, measure, load convention and sides are shared across workouts;
  sets, target ranges and exercise roles belong to each workout. Each placement
  has a simple role selector: **Warm-up**, **Workout** (default), or **Stretching**.
  The same catalog movement can have different roles in different workouts (or
  slots); classification does not group, reorder, or split performance history.
  Roles freeze directly on session exercise rows. Reopening/correcting a log keeps
  its recorded role; pre-classification history migrates as Workout.
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

## Free-form training

**Log session** on Workouts opens or resumes your one free-form session for the
current local day; **Add workout** stays separate. Pick existing catalog
movements with **+**. Names default to “Free training”; names and notes are private.
Selections/text remain guarded drafts until a first complete set atomically saves
the session and all selected exercises in their added order. Autosave, previous
values, retry/discard and navigation/unload/PWA protections match workout logging.
Limits remain 40 exercises and ten sets. Older sessions stay editable without
changing their dates; backdated creation and exercise reordering are not offered.

The History icon opens a newest-first private timeline of workouts and free
training, paged twenty sessions at a time. Each entry shows its frozen title/name,
original date, actual exercises/sets and private note. Only today’s note edits
inline; past notes and all set summaries are read-only here. The explicit source
log action still permits deliberate historical corrections in the original logger;
there is no global age lock. Destructive actions stay in that logger. Retained
note drafts guard navigation, paging, unload and PWA updates, including midnight.

Free-form exercises and whole sessions can be removed explicitly, with
confirmation for recorded data. Removing the last set/exercise keeps an empty
entry with its name/notes until deletion; it does not count as completed training.
Saved free-form sets support **any workout** habits, never selected-template
habits. Removing them preserves completion supported by another log; archived
habit completion stays frozen. Deletion clears the session's text/occurrences/sets,
not catalog entries or other logs. Session/exercise row tombstones, with text and
measurements cleared, prevent stale devices from recreating removed data.

## Exercise details and lifetime statistics

Compact detail actions in the catalog, workout rows and recorded history open an
exercise page without replacing existing inline editing. Active pages reuse the
shared name/measure/load/side editor and gallery (upload, preview, removal and
ordering). Those edits never rewrite frozen performances. Removed catalog entries
remain readable through your own recorded history, with catalog/media editing
removed and existing retired-gallery restrictions unchanged.

Private exercise history groups actual sets by session, preserving repeated slots,
roles and original occurrence dates. It returns only the selected exercise, not
other movements or the session’s note. Pages contain twenty sessions plus a
lookahead; the source-log action opens the original logger for corrections.

Lifetime statistics are author/household/catalog-ID scoped across workout and free
training, including all roles. Distinct sessions and actual set rows count once;
drafts, unperformed prescriptions and deleted sessions/occurrences do not count.
Reps and seconds remain separate. Unilateral totals sum both sides and expose a
left/right breakdown; historical null right amounts retain their left-equals-right
meaning, while explicit zero remains zero.

External-load volume uses rep-based loaded sets only:
`kg × (2 for per-hand, otherwise 1) × (left + right for unilateral, otherwise amount)`.
Single load is the entered total load; per-hand means two equal weights even when
reps are per side. Body mass and timed holds are excluded. Missing historical
weights produce an explicitly partial/not-recorded result rather than invented
volume. Heaviest kilograms stay separate by recorded measure/load/side convention,
not one estimated strength score.

The summary is compact, with side/load records under Stats details; no charts or
date filters. Statistics refresh on entry/resume, visible performance changes and
acknowledged catalog changes, with retry and stale-response protection. This is
not a second-by-second dashboard.

No schema, publication, index or migration change is needed: bounded Zero queries
read canonical sessions/occurrences/sets, and the authenticated
`GET /api/households/:householdId/workouts/exercises/:exerciseId/stats` endpoint
aggregates lifetime values in PostgreSQL. It never downloads lifetime sets into the
browser or maintains duplicate counters. Responses are not cacheable.

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
- `workout_exercises`: catalog references, workout-specific sets/targets/role, ordering
  and timestamps. Composite household foreign keys protect both parent links.
  The primary key remains `(workout_id, id)`; removing a slot does not delete the
  movement or its history.
- `training_sessions`: private headers for both workout and free training. Optional
  `workout_id` records the source; name/title, note, original local day/timestamps and
  a deletion tombstone live here. Partial unique indexes permit one active session
  per author/household/workout/day and one free session per author/household/day.
- `training_session_exercises`: occurrences directly owned by a required session,
  with composite household/author FKs, catalog identity, optional historical template
  placement ID, position, frozen name/measure/load/sides/role/prescription, original
  performance dates and row tombstones. Repeated template movements keep separate
  occurrences; free selections are unique. Unperformed prescribed slots remain rows.
- `training_session_sets`: actual amount/right amount/weight and recorded unit/load/
  sides, keyed by `(session_exercise_id, round)`. Access goes through the scoped
  occurrence/session. Existing-round corrections retain that round's conventions,
  even when they differ from its prescription; new rounds use the frozen definition.

There are no active header exercise arrays, role maps, independent occurrence links,
or parallel workout/free-session stores. Form snapshots are projections, not persisted
copies. Both paths use `training.*` mutations and one paged history query. Shared
templates/catalog data never change as a side effect of private logging.

The migration transfers and verifies current records, then drops all five original
logging tables. No archive schema, adapters or dual-write targets remain. The
superseded `workout_log_sets` archive is not replayed into current measurements;
its obsolete versions survive only in the pre-release backup.

Exercise autosaves send field-level patches and explicit additions/deletions,
never a replacement array. Unrelated concurrent edits and unseen additions are
preserved. Mutations serialize through the parent workout before checking the
current row count/order and applying changes atomically. Shared catalog updates
patch only changed fields; settings edits do not overwrite concurrent renames.

Set mutations serialize per household/author before resolving the daily session
and occurrence. Concurrent devices converge without overwriting other rows;
historical corrections retain original definitions/dates.

For statistics, join measurements to occurrences (no workout join), filter by
author and measurement unit, and group by catalog ID rather than name:

```sql
SELECT sum(s.amount) AS reps
FROM training_session_sets s
JOIN training_session_exercises e ON e.id = s.session_exercise_id
JOIN training_sessions t ON t.id = e.session_id
WHERE t.household_id = $1 AND t.user_id = $2
  AND t.deleted_at IS NULL AND e.deleted_at IS NULL
  AND e.exercise_id = $3 AND s.unit = 'reps';
```

Unilateral totals may count both sides using
`amount + coalesce(right_amount, amount)`; do not mix reps with seconds.

## Bounded views and editing failures

The catalog initially mounts 50 rows; Show more appends another 50 while keeping
focused/new rows mounted. Search covers the full catalog, and gallery metadata
uses one authorized shared subscription. This bounds initial rendering, not all
catalog data transfer. The normal definition-only picker subscribes on open;
logging keeps that catalog subscription active so optimistic log-only set writes
can validate the selected catalog identity after the picker closes.

Private workout history uses 20-entry pages plus a lookahead and an exclusive
`(completedOn, completedAt, id)` cursor. Current-day and selected logs stay pinned
independently, so paging does not replace the active logger. Dirty history notes
block paging. Rejected text stays editable with Retry/Discard and navigation/unload
protection. Invalid set fields explain integer/range rules without clearing input;
zero and decimal kilograms remain valid. See [Maintenance](../maintenance.md).

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

These are forward-upgrade notes for installations below the named migrations,
not instructions to replay completed cutovers. Preserve applied SQL, historical
identities; consult release/deployment state before acting. The 0053 cutover
explicitly drops the original tables after verification and a fresh backup.

`0053_unified_training.sql` replaces the unmerged additive free-training migration.
It migrates every existing header, occurrence and current set, normalizes frozen
prescriptions/roles (including unperformed slots), preserves existing IDs/dates/notes/
measurements, then drops all five original tables after in-transaction transfer
checks. Superseded archive values remain only in the release backup. Ambiguous
snapshots, orphan rows or inconsistent ownership abort the transaction.

This is a coordinated breaking cutover, not a rolling upgrade. Resolve drafts and
acknowledge queued writes on **every device/profile and in every module**; pause
users, stop old API/Zero writers and take a fresh PostgreSQL/replica backup. Apply
the migration, verify counts/values/publication, then start matching API/official
Zero/web. Compose selects a fresh derived replica file while retaining the old
file; the browser selects a new Zero storage key without deleting its old database.
Neither can recover unacknowledged old-device edits automatically. No PostgreSQL
reset, SDK patch, compatibility adapter or dual writes are used.

The deploy preflight now gates on `0053`, not the historical `0046` cutoff. Its
acknowledgement covers stopped writers/fresh backup, **not** browser-draft readiness.
Follow [Training schema cutover](../deployment.md#training-schema-cutover-0053).
An environment that applied the superseded unmerged `0053` needs separate inspection;
do not overwrite its ledger or reset application data.

`0047_chemical_hemingway.sql` adds the placement role (Workout by default) and its
three-value constraint. `0048_lively_maestro.sql` adds the independent historical
`exercise_roles` JSON map, defaulting old logs to an empty map. These additions
leave strict definition snapshots and original measurements/dates untouched.
Deploy matching migration/API/cache before web; old snapshots display Workout,
and older clients can still create/correct logs without parsing new JSON keys.

`0046_tense_miss_america.sql` backfills stable RFC-compliant occurrence IDs and
links from every historical slot with sets. It checks the exact measurement copy,
preserves log IDs, dates, notes, snapshots, deleted slots and note-only entries,
and retains the old set table. New tables have primary keys before publication.
Follow the [coordinated autosave cutover](../deployment.md#exercise-log-autosave-cutover-0046);
old bulk writes must stop before the backfill. The isolated `0046` rehearsal
resumed an existing official Zero 1.8 replica and backfilled the new tables without
a reset. This is historical compatibility evidence, not a recommendation to
downgrade the current official Zero 1.11.3 stack. No SDK patch is required.
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
local verification required no replica rebuild. The standalone
`scripts/verify-exercise-catalog-migration.sh <container>` fixture currently needs
its whole-row comparisons updated for the additive role columns in `0047`–`0048`;
see [Backlog](../backlog.md). Do not confuse that stale assertion with lost history
or bypass the fidelity checks. Historical scripts remain manual; normal integration
tests cover the populated canonical training upgrade and fail-closed cases.

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
remain unchanged. This one-time old-schema recovery is not a routine replica-reset
instruction for later additive migrations.
