# Data model

The [Workouts module](./workouts/) documents its shared workout and private
session, frozen occurrence and per-set storage boundaries.

This document owns persisted entities, columns, relationships, constraints,
and schema-level invariants. Authorization, transaction locking, and
synchronization rules are defined in
[Security and synchronization](./security-and-sync.md).

## General rules

- Generate UUIDv4 identifiers in the client for rows created optimistically.
  Use the platform cryptographic UUID generator rather than adding an ID
  library solely for time ordering; explicit timestamps determine display
  order.
- Store timestamps in UTC using PostgreSQL `timestamptz`.
- Give independently addressable household-owned records a direct `household_id`.
  Dependent exercise measurements inherit household/author from their single
  occurrence FK and are accessed through that scoped parent.
- Enforce invariants in PostgreSQL as well as in application code.
- Use forward migrations, preserving existing data and applied migration files.

## Entity relationships

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--o{ household_members : joins
  households ||--o{ household_members : contains
  households ||--o{ household_invites : issues
  households ||--o{ household_module_settings : configures
  households ||--o{ calendar_items : owns
  calendar_items ||--o{ calendar_people : labels
  users ||--o{ calendar_people : identifies
  households ||--o{ lists : owns
  lists ||--o{ list_items : contains
  households ||--o{ habits : owns
  habits ||--o{ habit_entries : records
  users ||--o{ habit_entries : authors
  households ||--o{ workouts : owns
  households ||--o{ exercises : catalogs
  workouts ||--o{ workout_exercises : prescribes
  exercises ||--o{ workout_exercises : references
  workouts |o--o{ training_sessions : sources
  users ||--o{ training_sessions : authors
  training_sessions ||--o{ training_session_exercises : owns
  exercises ||--o{ training_session_exercises : identifies
  training_session_exercises ||--o{ training_session_sets : measures
  households ||--o{ recipes : owns
  recipes ||--o{ recipe_ingredients : contains
  recipes ||--o{ recipe_cook_logs : records
  recipes ||--o{ recipe_media : illustrates
  recipe_cook_logs ||--o{ recipe_media : contextualizes
  media ||--o{ recipe_media : attaches
  exercises ||--o{ exercise_media : illustrates
  media ||--o{ exercise_media : attaches
```

## Tables

### Calendar

See [Calendar](./calendar/) for `calendar_items` and `calendar_people`, date/text
constraints, household-qualified links, tombstones and stable-account labels that
hide/restore across membership changes. These records contain no scheduled times.

### `users`

- `id`
- `username`: normalized, unique
- `email`: normalized, unique
- `password_hash`
- `created_at`, `updated_at`

Username and email normalization happen before uniqueness checks. Username normalization uses trimming, Unicode NFKC normalization, whitespace folding, and case folding. Email normalization uses `trim().toLowerCase()` before validation and uniqueness checks.

### `refresh_tokens`

- `id`
- `token_hash`: SHA-256 hash of an opaque random refresh token, unique
- `user_id`
- `expires_at`
- `revoked_at`, nullable
- `replaced_by_id`, nullable self-reference to `refresh_tokens.id`
- `created_at`, `updated_at`

The raw refresh token is never stored. Short-lived access JWTs are not stored as rows; they expire naturally. Each signup or login starts an independent forward-linked refresh-token chain. Replacements inherit the initial token's expiry. These rows provide rotation, reuse detection, current-session logout, and password-change invalidation.

### `households`

- `id`
- `name`
- `deleted_at`, nullable
- `created_at`, `updated_at`

Household names are trimmed display labels of 1–100 characters and do not need
to be unique.

### `household_members`

- `id`
- `household_id`
- `user_id`
- `role`: `owner | member`
- `sort_key`
- `created_at`, `updated_at`

Use `id` as the primary key and enforce a unique household/user pair.
`sort_key` stores that user's private sidebar order; changing it never changes
the order seen by another member. New and newly joined households are placed at
the top.

Each household has exactly one owner. Enforce at most one owner with a partial
unique index on `household_id` for rows whose role is `owner`; household
creation and ownership-transfer operations must transactionally ensure
that an owner always exists.

Ownership may transfer only to another membership in the same household. The
transaction demotes the current owner and promotes the target member before it
commits. Members may leave and the owner may remove members, but the current
owner membership cannot be removed directly.

### `household_invites`

- `id`
- `household_id`
- `creator_id`
- `token_hash`
- `expires_at`
- `accepted_at`, nullable
- `revoked_at`, nullable
- `created_at`, `updated_at`

Invite tokens are opaque, stored only as hashes, single-use, and expiring. Only
the owner may create them. Initial invites expire after seven days and may be
accepted only by an authenticated user. An existing member cannot consume an
invite. An owner may revoke an unaccepted invitation by setting `revoked_at`.

Enforce a unique `token_hash` and index `household_id`. Invite acceptance locks
the invite and transactionally creates a `member` membership while setting
`accepted_at`.

### `household_module_settings`

- `household_id`
- `module_key`: stable code-owned module identifier
- `enabled`
- `created_at`, `updated_at`

Use `(household_id, module_key)` as the primary key. There is no database-backed
plugin registry: `packages/shared` defines the supported keys and defaults, and
each module addition includes an explicit migration. Household creation inserts
a setting for every implemented module. A new module migration backfills every
existing household with its chosen default; missing settings fail closed.

Lists and Recipes are enabled by default; Habits and Workouts default to disabled.
Deferred modules such as French Vocabulary have no implemented setting yet.
Disabling a module retains all of its rows.
Core household and membership behavior has no module setting and cannot be
disabled.

### Lists module tables

Lists owns `lists` and `list_items`. Their columns, normalization, uniqueness,
ordering, and status-transition rules are documented in the
[Lists module data model](./lists/#data-model). Migration `0017` removed
`shopping_items` and the temporary bridge; neither remains in the current schema.

### Recipes module tables

Recipes owns `recipes`, `recipe_ingredients`, `recipe_cook_logs`, and
`recipe_media` attachments. Their ordering/context is documented in the
[Recipes module data model](./recipes/#data-model). Shared `media` owns the
stored assets independently of any feature; see [Shared media](./media/) for
identity, validation, lifecycle, authorization and the forward migration.
Videos and animated-image uploads remain deferred; no separate video table exists.

### Habits module tables

Habits owns `habits` and `habit_entries`; their fields, natural daily-entry
key and calendar-date constraints are documented in the [Habits module](./habits/).

### Workouts module tables

Shared definitions live in `workouts`, `exercises` and `workout_exercises`.
Private workout and free training share `training_sessions` →
`training_session_exercises` → `training_session_sets`. Headers have an optional
source workout and private name/note/dates; occurrences directly own frozen
prescriptions/roles/order/catalog identity; sets retain their actual measurement
conventions. Composite author/household FKs protect ownership. Row tombstones reject
stale resurrection. There are no active header arrays, role maps or occurrence-link
tables. The five original logging tables are dropped after verified transfer;
superseded archive values remain only in the release backup. `exercise_media` attaches
shared assets to the catalog.
See the [Workouts data model](./workouts/#data-model) and its forward migration.

## Schema invariants

- A household has at most one owner row; application transactions ensure it
  always has exactly one owner.
- A user has at most one membership in a household.
- Active list names are unique within a household; item names are unique within a list.
  Item references cannot cross households; see the [Lists data model](./lists/#data-model).
- Recipes references cannot cross household or recipe boundaries; see the
  [Recipes module data model](./recipes/#data-model).
- Module settings are unique by household and stable module key.

The transactions that preserve these invariants, including their explicit
locking requirements, are documented in
[Security and synchronization](./security-and-sync.md).
