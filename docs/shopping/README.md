# Shopping module

This document is the canonical reference for Shopping product behavior,
interface composition, persisted data, synchronization, and module-specific
security. Cross-cutting runtime boundaries remain in
[Architecture](../architecture.md), shared authorization and synchronization
rules remain in [Security and synchronization](../security-and-sync.md), and
shared visual foundations remain in [Design system](../design-system.md).

## Scope

Shopping provides one shared shopping list per household. It is a built-in
module with the stable `shopping` key and is enabled by default for new and
existing households. Multiple shopping lists are deliberately outside the
current product scope.

Disabling Shopping hides its navigation and blocks its queries and mutations.
It does not delete shopping items; re-enabling the module restores access for
every current household member.

Shopping items and recipe ingredients are separate domain records. A future
explicit integration may copy recipe ingredient names into Shopping and insert
or reactivate normalized shopping rows, but that operation is not implemented
and must require both modules to be enabled.

## Interface

Shopping is presented as one divided list. Its first row is a borderless
add-item input with a plus action. Active items follow in creation order, then
crossed items in creation order. Each current item row keeps its flexible,
wrapping name separate from a fixed action area containing active/crossed and
archive controls.

A persistent archive-icon row follows the current items. Archived rows remain
hidden until this row is toggled open, then appear directly below it with a
restore action. Normal list behavior changes item status rather than deleting
records.

Item names are directly editable for current and archived items. Editing uses
a row-style seamless input, debounced saves, blur saves, and an error popover.
Server rejection restores the authoritative value. The screen also represents
loading, synchronization-error, mutation-disabled, and optimistic states.
Mutation controls are unavailable whenever the shared connection policy
disallows writes.

## Data model

Shopping owns the `shopping_items` table:

- `id`
- `household_id`
- `name`
- `normalized_name`
- `status`: `active | crossed | archived`
- `created_at`, `updated_at`

Every synchronized item has a direct `household_id` and a client-generated
UUIDv4 identifier so optimistic and concurrent edits address a stable record.

Store `name` as a display value after Unicode NFKC normalization, whitespace
folding, and trimming while preserving casing. It must contain 1–100 characters
after cleaning. Derive `normalized_name` by lowercasing that display value, and
enforce uniqueness on `(household_id, normalized_name)`.

Use explicit status transitions rather than deletion for ordinary list
behavior. Any status may transition to any other valid status, and setting the
current status again is an idempotent no-op. Re-adding a crossed or archived
name reactivates the existing canonical row instead of inserting a duplicate.

## Synchronization and authorization

Named Shopping queries constrain results through current household membership
and an enabled Shopping module setting. Publication through Zero is only a
coarse allowlist; named query authorization still determines which rows a
client may synchronize.

Creation, renaming, and status changes use validated custom Zero mutators. The
optimistic client run presents the intended value immediately. The
authoritative server run verifies the authenticated user, current household
membership, enabled Shopping setting, and item ownership inside the database
transaction. Client timestamps are replaced with server time, PostgreSQL
remains authoritative, and foreign item IDs are indistinguishable from missing
IDs.

Name normalization runs before uniqueness checks. Concurrent attempts to add
the same normalized name converge on the canonical row: an existing crossed or
archived row is reactivated rather than duplicated. Explicit target-status
mutations are idempotent, so replaying a transition that has already taken
effect is safe. Other scalar conflicts use the last write accepted by
PostgreSQL.

Writes follow the shared [connectivity policy](../security-and-sync.md#connectivity-policy):
cached list data remains visible while disconnected, but mutation controls are
disabled, unsaved input stays in component state, and no custom long-term
offline queue is introduced.
