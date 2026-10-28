# Habits

Habits (`habits`) is an opt-in household module. Any current member may create,
rename, annotate or archive shared habits. Each person records their own daily completions and notes;
every current member can see progress. No joining, targets or streaks are required.

## Interface

Habits is a phone-first, today-first list. It defaults to **Me**; a person selector
shows another current member's activity read-only. Definitions and ordering remain
shared. No targets, schedules, amounts, streaks or scores are introduced: each
person decides when a daily completion makes sense.

- Each compact row contains a seamless name, today's neutral filled/unfilled
  toggle, a daily-note action, history disclosure and six previous dates.
  Completions never move rows. Narrow screens use a second line for recent dates
  rather than shrinking touch targets or forcing horizontal page scrolling.
- Today's completion is one tap. Its optional note opens inline and autosaves.
  Note-bearing dates have a subtle marker, including note-only dates.
- History starts collapsed. Expand one habit at a time to mount one monthly
  calendar, with previous/next/current-month navigation. No future months.
- Hover/focus previews a historical note. Selecting a historical date inspects
  it first, without toggling completion. The selected day's details offer explicit
  completion and note editing for the author; other members' records are read-only.
  Touch does not require hover. All actual past dates, even before creation, remain
  editable; future dates and archived records are read-only.
- Daily notes survive unchecking. Rejected/pending drafts remain mounted and block
  person, history/date/month and archive-view changes until saved or explicitly
  reverted with Escape. Existing PWA update guards protect these drafts too.
  Today refreshes on focus and periodically, but does not change editor identity
  while a draft is pending.
- Keep name-only quick add, seamless debounced naming, optional shared habit notes,
  and confirmation before archiving. Shared notes and archive live in the expanded
  habit's secondary actions. Archive stops tracking for everyone and retains
  read-only history; no restore or permanent-delete UI.
- Ordering is shared and supports mouse drag, touch hold and Space/arrow keys;
  Escape cancels. Daily saves do not disable ordering. Archived ordering is fixed.
- Use stable calendar-date labels and the current device timezone, not timestamps
  that shift recorded days during travel. Authoritative server validation still
  rejects future writes.
- Offline cached data stays inspectable, with writes disabled and no duplicate
  connection copy. Keep loading, authorization and rejected-save states explicit.

Only the selected person's seven-day window is queried for the list. An expanded
habit additionally loads its own selected month. No calendar is mounted per row,
no day subscribes independently, and there are no per-cell ResizeObservers or
member-overflow marks. Date formatters are reused.

The new named queries are `habits.recentForPerson` and
`habits.historyForPerson`. The old `habits.byHousehold` contract remains available
for already-open clients. This redesign requires no database migration.

## Data and authorization

Two tables, both household-scoped:

- `habits`: UUID `id`, `household_id`, `name`, nullable `note`, `sort_key`,
  `status` (`active | archived`), and creation/update timestamps.
- `habit_entries`: `household_id`, `habit_id`, `user_id`, `entry_on`, `completed`
  (default false), nullable `note`, and timestamps. Primary key
  `(habit_id, user_id, entry_on)` gives one daily entry without a redundant ID.
  Empty/incomplete entries may remain after clearing; they produce no marks or details.

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
`setCompleted` and `updateEntryNote`.
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

Deferred: goals, streaks, schedules, reminders, quantities and participation history.
Consecutive-day streaks can later be derived from `completed = true` entries, with
history beyond the displayed month; note-only entries do not count. No streak UI
or persisted counters are part of the notes change.
