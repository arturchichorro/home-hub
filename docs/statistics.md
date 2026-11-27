# Operator statistics export

Statistics are deliberately **not an app feature**. There are no summary tables,
mutation-time aggregates, statistics endpoints, polling, jobs or automatic AI
integration. This manual operator tool reads canonical records only when invoked.

## Usage

After deploying the matching API image, run over SSH from the installed checkout.
Use an existing private output directory (for example, create one with
`mkdir -m 700 ~/home-hub-exports`); keep exports outside web-served directories:

```sh
./scripts/export-statistics.sh --household-id <uuid-from-app-url> \
  --out ~/home-hub-exports/statistics.json
```

Optionally include **one current household member's** private training, selected
by exact username, and/or choose an inclusive period:

```sh
./scripts/export-statistics.sh --household-id <uuid> \
  --training-user <username> --from 2026-01-01 --to 2026-10-31 \
  --time-zone Europe/Lisbon --out ./statistics-2026.json
```

Omit dates for a lifetime snapshot through today. `--from` defaults to no lower
bound; `--to` defaults to today in `--time-zone` (UTC by default). Reversed,
invalid or future end dates fail. Stored activity date labels are never shifted.

The wrapper uses the existing production Compose configuration, runs one disposable
API-image process without dependencies, mounts only the requested output directory,
and runs as the operator's UID/GID. It does not start the API server or run migrations.
The destination directory must already exist; output is owned by the operator.
`HOME_HUB_APP_DIR` defaults to `/opt/home-hub`; the existing
`HOME_HUB_PRODUCTION_ENV_FILE` and `HOME_HUB_COMPOSE_FILE` overrides also apply.
For direct/local execution, the API CLI needs only `DATABASE_URL`:

```sh
# From apps/api; target an explicitly selected database.
node --import tsx src/statistics/cli.ts --household-id <uuid> --out /private/report.json
```

## Scope and JSON

One versioned JSON file contains:

- `schemaVersion`, `generatedAt`, household identity, effective `period` and
  interpretation notes.
- `habits`: current members' active/archived habits. Each item has habit/person
  identity, stored dates and manual/workout/calendar completion flags, and statistics. Missing dates remain
  unrecorded, not fabricated failures.
- `training`: only the explicitly selected current member. Each exercise has its
  identity, supporting performances/sets and statistics. Retired catalog entries
  are included when they have actuals. Deleted sessions/occurrences and empty
  prescriptions are excluded.
- Section statuses: `included`, `disabled`, or (for enabled training without an
  author selection) `not_requested`. Missing module settings fail closed as
  disabled, rather than appearing as genuine empty data.

Habit completion is manual **OR** workout-derived **OR** calendar-eligible, counted once.
`calendarCompleted` is evaluated against the single report generation instant,
using canonical eligibility deadlines (not the report timezone or a refresh job).
Calendar-disabled source links still count; private mappings/timezones are not exported. Weekly streaks
are Monday–Sunday activity weeks **within the period**; partial boundary weeks
count. `endingWeeks` preserves an open end week when the preceding week was
active. `bestWeeks` is the longest run within the period. `last7`/`last30` end
at the report end and are clipped to the selected period.

Exercise counts include all recorded roles, keeping exercise identities separate.
Sessions count once even with repeated placements. Reps/time remain separate;
unilateral totals sum sides. A historical null right amount means equal to left,
while explicit zero remains zero. External-load volume uses loaded rep sets only:
weight × (2 for per-hand, otherwise 1) × (left + right for unilateral, otherwise amount).
Bodyweight and timed holds contribute no load volume. Missing weight is reported
as unmeasured, not zero. Heaviest weights stay separated by recorded unit/load/side
convention. Frozen names and actual conventions are retained.

Readable usernames/habit/exercise names are included. Notes, emails, password
hashes, tokens, invitation secrets, files and signed URLs are never selected.
This is **not a backup** and is not guaranteed anonymous.

## Safety and cost

This is privileged server tooling, not a household-owner permission in the app.
Files stay local; inspect them before giving them to an AI. No automatic upload,
scheduling or retention is provided.

- One repeatable-read, read-only transaction gives all sections the same snapshot.
- Supporting rows stream through 500-row cursors. Calculations retain only the
  current group and small counters, not lifetime histories in memory.
- Connection timeout is 10 seconds, SQL statements have a 30-second timeout,
  and a 120-second export budget is checked between batches/records.
- Work consumes database CPU/I/O only on demand. Large exports can time out;
  there is no silent truncation. Avoid running alongside schema migrations.
- Require a fresh output path. A private `0600` staging file is published
  atomically only after successful export/transaction completion. Existing files,
  directories, symlinks and concurrent creations are never replaced.
- Normal failures remove staging output and print only a generic error, never SQL
  or exported data. A hard process kill may leave a private hidden staging file,
  but never a partially published report.

## Schema cleanup audit

The unmerged statistics-table proposal was removed, including its migration,
generated snapshot/schema entries, functions, queries and refresh hooks. It was
applied only to removed disposable fixtures, not a persistent database.

A fresh replay through migration `0058` has **36 application tables**, all used:
authentication (2), household/module management (4), Calendar (3), Habits (3),
Lists/Flashcards/Moodboards (4), Recipes (4), shared media (1),
Workouts/canonical training (7), Documents (4), and Contacts (4).

No unused public enum remains. The single application-owned public function,
`check_contact_entry_people`, backs live Contacts constraint triggers. Existing
constraints/indexes and the explicit publication serve current records/queries;
no structure was dropped merely because a UI does not expose it. Auth records
and Zero/Drizzle internal schemas are necessary infrastructure, not dead tables.

Canonical migration `0053` already drops the five legacy training tables;
Contacts `0057` drops the three obsolete Logs tables and their trigger function.
Those migrations and their data-loss/backup safeguards are unchanged. This audit
covers declared schema, runtime references and a disposable migrated catalog,
not uninspected production drift. No new database migration is required.
