# Habits

Habits (`habits`) is an opt-in household module. Any current member may create,
rename, annotate or archive shared habits. Each person records their own daily completions and notes;
every current member can see progress. No joining, targets or streaks are required.

## Interface and calendar

Keep visible copy minimal. Do not add explanatory prompts or duplicate connection
status unless explicitly requested. Keep labels, concise states and actual errors. Add/archive navigation uses the
same compact ghost actions in the application header as Lists and Recipes.

- Quick add asks only for a name (Unicode NFKC, folded whitespace, 1–100 characters).
  Active names are seamless inline inputs using the existing shared editor:
  debounced saves, blur/Enter canonicalization, Escape reversion and anchored
  error feedback on rejection. Archived names stay read-only text.
- Habit-level notes are shared. Each daily-input tile also has a personal note for
  that habit/person/day, household-readable but author-editable. Both reuse the
  ingredient StickyNote affordance and seamless debounced textarea, with no new
  dialogs or explanatory copy. Notes are optional (NFKC, trimmed, up to 500 characters).
  Daily notes do not require completion and survive unchecking; archived notes are read-only.
- Above month navigation, a horizontally scrolling daily-input strip shows each
  active habit name above one today square, in the shared habit order. Clicking
  toggles your completion using the same pending state and neutral fill as the
  calendar. The strip stays on today even while browsing older months and is
  hidden in the archive view. No heading or explanatory copy is displayed.
- Show the current month, navigate months or return to today. Week view has been
  removed. Month navigation stops at the current device-local month, including
  after clock/timezone changes. Each day box is shared by all household members, with colored vector
  completion marks. There is no summary text below each calendar.
- The shared seven-column Monday–Sunday calendar
  per habit, arranged in a responsive grid with flexible columns (20rem minimum
  where space permits). Calendars fill their column width while retaining compact
  3.5rem day heights, centered top-line dates and blank padding
  outside the selected month. Each day's cell
  contains a crisp vector X for each completing member in a fixed-height,
  horizontally scrollable line without a visible scrollbar, using a muted palette.
  Tightly spaced marks let the next X peek in. A subtle fade marks only the edges
  with more content beyond them; it updates on scrolling/resizing. No count badge.
  Colors are assigned
  consistently across habits and periods (palette collisions are resolved per roster).
  Hover or focus a day with completions or notes to see names and notes (200 ms
  hover delay); truly empty days have no tooltip. Note-only entries never show an X
  or completion fill. Selecting a day toggles only your completion. Read-only days
  remain focusable so their details are available to keyboard users.
- Drag a habit using its dedicated grip to reorder it; keyboard dragging is also
  supported. The order is shared across household members and persists across
  month navigation. Archived habits retain their order but cannot be reordered.
  New habits appear first. Reordering is unavailable offline or while another reorder is pending. Saving a
  day never disables or dims the reorder handles.
- Today uses bold foreground text, without a colored circle. Days completed by
  the current user also have a subtle neutral fill, without a border or change in cell size.
- A square sets or clears your completion. Any past date can be checked or corrected,
  including dates before the habit was created. Future dates and archived habits are not editable.
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

`habits.byHousehold` checks current household membership, a non-deleted household,
and enabled Habits settings. It separates active/archived habits and loads only
entries in the requested month, restricted to current members. The daily strip
queries the current month independently of the browsed calendar. Profile
names come from the existing safe member query.

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
