# Lists module

Lists replaces the single Shopping module with named, manually ordered lists
per household. Its stable module key is `lists`. Lists and Recipes are enabled
by default; new households start with no lists. Migrated households retain a
Shopping list with their existing items, even if it is empty. Existing disabled
Shopping settings become disabled Lists settings.

## Interface

The sidebar opens `/households/:householdId/lists`, a responsive card library
similar to Recipes. Members can create lists and change their order using drag
handles or earlier/later buttons. New lists appear at the top. Each card opens
`/households/:householdId/lists/:listId`, with a named breadcrumb, rename control,
and confirmed deletion of the list and all its items. There is no `/shopping`
route or redirect.

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

Old Shopping query/mutation names and REST routes are no longer exposed. The
legacy tables and migration bridge remain until a later cleanup migration;
see [migration notes](../lists-migration.md). Do not run an old Shopping API
against data that is already being edited through Lists.

Recipe ingredients and list items remain separate records. Any future operation
to copy ingredients must choose a target list and authorize both modules.
