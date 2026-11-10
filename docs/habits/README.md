# Habits

Habits (`habits`) is an opt-in household module. Any current member may create,
rename, annotate or archive shared habits. Each person records their own daily completions and notes;
every current member can see progress. No joining or targets are required.

## Interface

The overview defaults to **Me**, with the existing person selector and shared ordering.

- Each row has one today-completion control, a habit-name link to detail, an optional
  inline today note, and a **non-interactive last-seven-days preview**, ending today.
  Pending saves show a spinner; manual checks stay one tap/keypress. Training-derived
  checks open detail instead of allowing undo. Existing notes remain visible.
- Quick creation stays name-only. Header options hold archived viewing and explicit
  reorder mode (mouse drag, touch hold, Space/arrows; Escape cancels). Completions
  never reorder rows; archived ordering is fixed.
- Detail opens today's direct day editor and one monthly calendar. Selecting a date
  directly opens its editor; previous/next/current-month controls do not mount extra
  calendars. Authors can correct any past date, even before habit creation.
  Others' entries, future dates and archived entries are read-only.
- Shared descriptions remain intact and editable on active detail pages. Shared
  renaming, workout links and confirmed archiving stay secondary. Archive retains
  history; there is no restore/permanent-delete workflow.
- Daily notes survive unchecking. Failed drafts support retry/discard, retain their
  scope and block person/date/month/reorder/archive-view changes. Navigation/unload
  and PWA guards protect unsaved text. Today refreshes on focus/periodically without
  retargeting a pending editor across midnight.
- Cached Zero history remains inspectable offline, with writes disabled. Statistics
  report unavailable/retry when HTTP access is unavailable.

Only the selected person's seven-day window loads on overview. Detail uses
`habits.detail` for metadata and `habits.historyForPerson` for one selected month.
`habits.recentForPerson` remains bounded to seven dates. The older
`habits.byHousehold` query remains available to existing clients. No per-day
subscriptions, per-row calendars or lifetime-entry download is introduced.

## Derived statistics

Detail shows completed-day totals, last completion, explicit last-7/30-calendar-day
counts, and current/best **weekly activity streaks**. A completed day is manual
**OR** training-derived, counted once; notes/empty entries and future dates do not
count. A week is Monday–Sunday with any completion; an open current week preserves
a run ending last week. Gaps break runs, and historical corrections update totals.
Archived detail omits an active current streak but retains totals, best run and recency.
There are no daily streaks, adherence scores, targets or charts.

`GET /api/households/:householdId/habits/:habitId/stats?personId=…&timeZone=…`
aggregates existing entries in PostgreSQL, returning counts/date labels only with
`no-store`. Reads validate the authenticated viewer, live viewer/selected-person
memberships, live household and enabled Habits module. Server time in the validated
device timezone determines today; stored date labels determine weeks/windows.
The client refreshes on entry, relevant visible completion changes, focus/resume,
date/person changes and explicit retry, with abort/timeout and stale-scope protection.
There are **no new tables, migrations, indexes, persisted counters or publication changes**.

## Optional workout links

The chain action configures **Manual only**, **Any workout**, or **Selected workouts**
(any selected definition qualifies). Linking is shared; each person's own logs count
on their stored local `completed_on` date, only after at least one saved set. Empty
and note-only logs do not count. Existing history is included; changing or removing
links recalculates automatic history for active habits. Archived history stays frozen.

Completion is manual **OR** automatic. Removing the last qualifying set clears only
its automatic contribution, retaining independent manual checks, notes and entry
identity/creation timestamps. A matching workout cannot be manually unchecked. Only
completion is shared as habit activity: raw workout logs, sets and notes stay
author-private. The chooser subscribes only while open, requires both enabled modules,
and retains selections after rejected saves.

## Data and authorization

Three tables, all household-scoped:

- `habits`: UUID `id`, `household_id`, `name`, nullable `note`, `sort_key`,
  `status` (`active | archived`), `workout_mode` (`none | any | selected`),
  and creation/update timestamps.
- `habit_entries`: `household_id`, `habit_id`, `user_id`, `entry_on`, `completed`
  (manual, default false), `workout_completed` (server-derived, default false),
  nullable `note`, and timestamps. Primary key
  `(habit_id, user_id, entry_on)` gives one daily entry without a redundant ID.
  Empty/incomplete entries may remain after clearing; they produce no marks or details.
- `habit_workout_links`: primary key `(habit_id, workout_id)`, with composite
  household/habit and household/workout foreign keys; indexed by household/workout.

Entry dates use canonical `YYYY-MM-DD` text, constrained as real dates in
PostgreSQL and validated by shared Zod contracts, to preserve string semantics
through Zero. The entry's composite household/habit foreign key prevents
cross-household references. The user reference remains valid after leaving a
household, so records are retained without preventing membership removal.

All habit queries require current viewer membership, a non-deleted household and
enabled Habits settings. Person-scoped queries also require the selected person
to be a current member, filter entries to that person, and retain the entry
membership check. Recent queries allow at most seven dates; history queries allow
at most 31 dates and constrain the root to one habit. Active/archive status is
explicit. Profile names come from the existing safe member query.

Custom mutators are `habits.create`, `rename`, `updateNote`, `archive`, `reorder`,
`setCompleted`, `updateEntryNote` and `linkWorkouts`.
Workout set writes/removals and link changes refresh the derived flag in the same
server transaction. A household-scoped transaction advisory lock serializes these
writers with archiving, preventing link/set races; manual fields use partial upserts
and never accept client-supplied derived flags.
Reordering uses the existing sparse integer sort keys and full-scope rebalance
helper, scoped to active habits in the household. Foreign and archived order IDs
are rejected. Stale orders may omit concurrently created habits without deleting them.
Server execution checks household/module access and scopes habit lookups by
household. Daily-entry ownership is derived solely from authenticated context,
never a client-supplied user ID. Archive is idempotent. Note and completion updates
use partial upserts on the actor's natural key, preserving the other field even
on concurrent creation. Clearing completion stores false rather than deleting notes.

The future-date limit uses authoritative server time with the
validated device timezone supplied by the client. This is a trusted household
calendar, not a tamper-proof activity record.

## Migration and rollout

`0049` adds optional workout linking, defaulting existing habits to manual-only and
all derived flags to false. It extends the existing **explicit** Zero publication
column lists and publishes the new composite-primary-key junction. Apply migration
and updated API/Zero before serving the new web client. No archive rewrite, replica
reset, SDK patch or dependency change is required. Supported application mutations
maintain derived flags; direct out-of-band SQL imports must explicitly recalculate
or re-save the link settings.

Migration `0029` creates both tables, backfills disabled Habits settings for
existing households, and adds explicit column lists to `home_hub_zero`.
New households receive the disabled setting through the shared module catalogue.
Migration `0030` adds shared habit ordering, preserves the old newest-first order
(including deterministic ID tie-breaking), and republishes the new sort key.
Apply it locally before testing reordering; it was verified on both fresh and
populated disposable databases, without migrating the normal local database.

Migrations `0029`–`0030` are additive. Enable Habits in household settings after
migrating. Breaking migrations `0031` and `0033` require a maintenance cutover rather
than the earlier additive rollout. Never roll back by dropping completion data.

### Status simplification (0031)

Migration `0031` replaces the archive timestamp with `active | archived` status,
backfills existing archived habits, drops `created_on` and `archived_at`, and
updates indexes and the Zero publication. Habits, completion records and ordering
are preserved. Creation requires only a name; backdating is unrestricted except
that future dates remain blocked.

This is a breaking schema change, not compatible with the old API/Zero schema.
Cut over deliberately: stop the old API and Zero, take a database backup, apply
the migration, restart with the new API/Zero schema, and reload browser clients.
Allow Zero to rebuild its replica if required. Do not use the normal rolling
deployment without this maintenance step. Rollback requires restoring the
pre-migration backup before starting the old version; the removed timestamps
cannot be recovered from the new status. No automatic rollback is provided.

The implementation was verified with the full migration history and an upgrade
from both `0028` and `0030` in disposable PostgreSQL databases; the normal local database was
not migrated. `scripts/verify-habits-schema.sql` remains available for manual
publication, backfill, composite tenancy, date validation and idempotent-key checks.

### Notes (0032–0033)

`0032` adds the shared habit note and publishes it. `0033` renames the existing
completion table and date column to daily entries, marks every existing row
completed, adds a nullable daily note and default-false completion flag, renames
constraints/indexes, and updates the explicit Zero publication. No third table
or streak counter is introduced; existing dates, owners and timestamps survive.

`0033` is incompatible with the old API/Zero schema: stop API/Zero, back up, migrate,
restart the updated API/Zero schema, and reload clients, rebuilding Zero replicas
if required. Rollback requires the backup. Fresh and populated upgrades are verified
in disposable PostgreSQL only; the normal local database is not migrated.

Deferred: goals, daily streaks, schedules, reminders, quantities and participation history.
Weekly activity streaks are derived on detail; no streak counters are persisted.
