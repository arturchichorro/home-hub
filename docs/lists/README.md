# Lists module

Lists provides named, manually ordered lists per household. Its stable module
key is `lists`. Lists and Recipes are enabled by default; new households start
with no lists. Previously migrated households retain their lists, items, and
module settings; see [migration notes](../lists-migration.md).

## Interface

The sidebar opens `/households/:householdId/lists`, a responsive card library
similar to Recipes. Each card shows only its title and the first four current
items, with active items first and checked, struck-through completed items after
them. Archived items are excluded; item order matches the detail screen. Status
indicators are read-only previews, not toggle controls. The library query fetches
at most four items per list.

Cards use one compact fixed height rather than scaling to square tiles, so they
stay aligned without adding large empty areas on wide screens.

Clicking anywhere on a card opens the list; dragging the card reorders it, with
no separate handles or arrow buttons. Touch uses a short hold to begin dragging,
allowing normal vertical scrolling before activation. Keyboard drag controls
remain available on the focused card. New lists appear at the top. Each card opens
`/households/:householdId/lists/:listId`, with a named breadcrumb, a seamless
inline name editor, and confirmed deletion of the list and all its items. Name
edits debounce, save on blur or Enter, revert with Escape, and roll back with an
anchored error when validation or persistence fails.

The actual item-list interactions are preserved: add-item drafts, debounced
inline editing, active items followed by crossed items, drag ordering within
each status, and an archive toggle with restore controls. Re-adding a name
reactivates its existing item in that list. Ordinary item actions change status
rather than hard-delete records. Connection state disables mutations as before.

## Data model

`lists` stores `id`, `household_id`, display and normalized names, `sort_key`,
and timestamps. Normalized names are unique per household. `list_items` adds
`list_id` and `active | crossed | archived` status to the same fields; item names
are unique within a list. Names use Unicode NFKC, collapsed whitespace, trimming,
and a 1–100-character limit. Normalized names are lowercase display names.

Both tables use descending integer sort keys with UUID tie-breakers. Reordering
usually updates one key; exhausted gaps cause rebalancing. The composite item
foreign key `(household_id, list_id)` prevents attaching an item to a list in a
different household. Deleting a list cascades to its items.

## Synchronization and authorization

Named Zero queries `lists.byHousehold` and `lists.detail` check current household
membership and enabled Lists settings. The detail query joins items using both
household ID and list ID. Publishing a table does not bypass these checks.

The live `lists` mutators are create, rename, delete, reorder, addItem, renameItem,
setItemStatus, and reorderItems. Each server execution checks membership and
enabled-module access. Parent and child lookups are scoped to the requested
household/list, and item reordering is scoped to status. PostgreSQL uniqueness
and foreign keys remain the final constraints. Client changes are optimistic;
the server supplies authoritative timestamps. List deletion explicitly deletes
cached children as well as relying on the database cascade.

The application schema and Zero publication contain only the current domain
tables. Migration `0017` removes the retired module's source tables, settings,
and temporary mirroring bridge without changing live Lists data.

Recipe ingredients and list items remain separate records. Any future operation
to copy ingredients must choose a target list and authorize both modules.
