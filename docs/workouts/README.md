# Workouts

Owner-enabled, disabled by default. Any household member can create/edit shared plans.
Cycles, sessions, notes, and performance are private to their authenticated owner:
all queries and mutations enforce membership, a live household, enabled Workouts,
and owner identity for personal data. No member/owner role grants access to another
person's training logs.

## Training flow

Add the supplied six-week A/B/C program or build a plan, then start a personal cycle.
The dashboard shows Monday–Sunday attendance (three sessions is a goal, not a cap),
six seven-day cycle weeks, and the next workout. Completed sessions alone advance
rotation; skipped days and abandoned sessions never create catch-up workouts.
After six weeks, review the program and optionally start a new cycle; history remains.

One resumable active session per person/household is enforced by a database unique
index. Start in normal or low-energy mode (one round per pair, which counts).
The session screen follows pair/round order with quiet divided rows, seamless
kg/reps inputs, named icon actions, and optional technique/reserve/skip details.
Warm-up, mobility, progression guidance, and the rest timer expand on demand.
The dashboard uses the app-header add action and the same icon-led sections as
Recipes; the plan editor uses seamless titles, compact targets, and row actions.
Save each set explicitly with its checkmark or Enter; values remain drafts until
saved. Shared plan edits remain a draft until the plan checkmark is pressed.
Session notes reuse the existing debounced seamless editor (blur to normalize,
Escape to revert), with anchored error feedback. A skipped set needs
a reason (for example symptoms or replacing accessories with wrist rehab).
Completion requires all prescribed sets to be logged or explicitly skipped.
Abandoning retains logs but does not advance rotation. Completed logs are editable.

Log kg per hand, a single dumbbell's kg, or bodyweight as configured, plus reps or
seconds, optional separate right-side amounts (blank means same as left), reps in
reserve, symptom-free good-form confirmation, and notes. Progression suggestions
require every prescribed set at the ceiling, both sides, consistent load, explicit
form confirmation, and at least two reps in reserve. Skipped/incomplete sets never
qualify. Suggestions never change the next load automatically; increments are
optional and must remain manageable. Timed/bodyweight exercises suggest variations.

## Storage and synchronization

Four module-owned tables: shared `workout_plans`, private `workout_cycles` and
`workout_sessions`, and `workout_sets` keyed by session/exercise/round.
Plans contain bounded validated structured JSON rather than a generic exercise
catalogue. Sessions snapshot the workout and instructions server-side at start;
later edits cannot rewrite history. Per-set writes merge independently. Concurrent
edits to the same set or shared plan use the last accepted write.

Identity always comes from trusted Zero context, never mutation arguments.
Composite foreign keys bind cycles to household plans and sessions to their
owner's cycle. Sets are synchronized only through authorized private sessions;
there is no public sets query. All four tables join the existing Zero publication.
Module disablement retains data but denies reads and writes. Disconnected editing
is disabled; no additional offline queue is introduced.

Migration `0034_slimy_darwin.sql` adds tables/publication entries and backfills
disabled module settings. It is additive; apply before serving the new code.
CI runs `scripts/verify-workouts-schema.sql` for publication, tenant/owner foreign
keys, single-active-session, completion, and set-key invariants, alongside runtime
validation, mutation/query authorization, progression, and rendered-screen tests.
