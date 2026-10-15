# Habits

Habits (`habits`) is an opt-in household module. Any current member may create,
rename or archive shared habits. Each person records their own daily completions;
every current member can see progress. No joining, targets or streaks are required.

## Interface and calendar

- Quick add asks only for a name (Unicode NFKC, folded whitespace, 1–100 characters).
  Active names are seamless inline inputs using the existing shared editor:
  debounced saves, blur/Enter canonicalization, Escape reversion and anchored
  error feedback on rejection. Archived names stay read-only text.
- Show the current month, navigate months or return to today. Week view has been
  removed. Month navigation stops at the current device-local month, including
  after clock/timezone changes. Each day box is shared by all household members, with colored vector
  completion marks and per-person monthly totals.
- The shared seven-column Monday–Sunday calendar
  per habit, arranged in a responsive grid. Calendars stay capped at 24rem wide
  with compact 3.5rem day cells, centered top-line dates and blank padding
  outside the selected month. Each day's cell
  contains a crisp vector X for each completing member, using a muted palette
  consistently across habits and periods (palette collisions are resolved per roster).
  Hover or focus a completed day to see the names (200 ms hover delay); empty
  days have no tooltip. Selecting a day toggles only your completion.
  Monthly totals form a colored member legend. Read-only days remain focusable
  so their completion details are available to keyboard users.
- Drag a habit using its dedicated grip to reorder it; keyboard dragging is also
  supported. The order is shared across household members and persists across
  month navigation. Archived habits retain their order but cannot be reordered.
  New habits appear first. Reordering is unavailable offline or during pending writes.
- Today uses bold foreground text, without a colored circle.
- A square sets or clears your completion. Any past date since habit creation
  can be corrected. Future dates and archived habits are not editable.
- Use the current device timezone with no setup or stored timezone. Completion
  dates are stable calendar labels, not timestamps. Travel never moves existing
  Xs; members may disagree about today near midnight. Refresh today on focus
  and periodically while the screen remains open.
- Archive stops tracking for everyone immediately and retains read-only history
  in the archive view. No restore or permanent deletion in v1.
- Follow the existing connected-write/read-only-offline policy. Preserve drafts
  and show server rejection rather than silently discarding errors.

## Data and authorization

Two tables, both household-scoped:

- `habits`: UUID `id`, `household_id`, `name`, `sort_key`, `created_on`, nullable `archived_at`,
  and creation/update timestamps.
- `habit_completions`: `household_id`, `habit_id`, `user_id`, `completed_on`, and
  timestamps. Primary key `(habit_id, user_id, completed_on)` makes repeated
  inserts idempotent without a redundant completion ID.

Calendar dates use canonical `YYYY-MM-DD` text, constrained as real dates in
PostgreSQL and validated by shared Zod contracts, to preserve string semantics
through Zero. The completion's composite household/habit foreign key prevents
cross-household references. The user reference remains valid after leaving a
household, so records are retained without preventing membership removal.

`habits.byHousehold` checks current household membership, a non-deleted household,
and enabled Habits settings. It separates active/archived habits and loads only
completions in the requested month, restricted to current members. Profile
names come from the existing safe member query.

Custom mutators are `habits.create`, `rename`, `archive`, `reorder` and `setCompleted`.
Reordering uses the existing sparse integer sort keys and full-scope rebalance
helper, scoped to active habits in the household. Foreign and archived order IDs
are rejected. Stale orders may omit concurrently created habits without deleting them.
Server execution checks household/module access and scopes habit lookups by
household. Completion ownership is derived solely from authenticated context,
never a client-supplied user ID. Archive is idempotent; setting completion uses
Zero's insert-on-existing-key no-op; clearing deletes only the actor's key.

Creation dates and the future-date limit use authoritative server time with the
validated device timezone supplied by the client. This is a trusted household
calendar, not a tamper-proof activity record. Counts are derived from completions.

## Migration and rollout

Migration `0029` creates both tables, backfills disabled Habits settings for
existing households, and adds explicit column lists to `home_hub_zero`.
New households receive the disabled setting through the shared module catalogue.
Migration `0030` adds shared habit ordering, preserves the old newest-first order
(including deterministic ID tie-breaking), and republishes the new sort key.
Apply it locally before testing reordering; it was verified on both fresh and
populated disposable databases, without migrating the normal local database.

This is additive; the old application remains compatible with the new tables.
Apply the migration before running the new app, then enable Habits in household
settings. The usual Zero schema-change/rebuild behavior applies. Do not roll
back by dropping tables after people have started tracking.

The implementation was verified with the full migration history and an upgrade
from `0028` in disposable PostgreSQL databases; the normal local database was
not migrated. CI runs `scripts/verify-habits-schema.sql` after migrations to check
publication, backfill, composite tenancy, date validation and idempotent keys.

Deferred: goals, streaks, schedules, reminders, quantities and participation history.
