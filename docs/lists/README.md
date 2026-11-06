# Lists module

Lists provides named, manually ordered lists per household. Its stable module
key is `lists`. Each list is a Checklist or [Moodboard](./moodboards.md), with a
normal editable title; existing lists remain Checklists. Lists and Recipes are enabled by default; new households start
with no lists. Previously migrated households retain their lists, items, and
module settings.

## Interface

The sidebar opens `/households/:householdId/lists`, a responsive card library
similar to Recipes. Checklist previews fill their grid-row height, including extra
space beside taller Moodboard mosaics. They show active items first and crossed
items after them; archived items are excluded. A clipped preview reserves its last
row for `…`, with at least two items hidden. Status indicators remain read-only.
The versioned `lists.libraryPreview` query fetches at most 22 current items per
list (up to 20 preview rows plus lookahead); both older library query shapes stay
unchanged. Moodboard cards show up to four thumbnails/posters without counts or
autoplay; see [Moodboards](./moodboards.md).

New list creation uses two labeled, keyboard-accessible icon radio choices for
Checklist and Moodboard, rather than a select. Cards align by grid row; previews
do not force every card to a square or grow to fit the complete item history.

Clicking anywhere on a card opens the list; dragging the card reorders it, with
no separate handles or arrow buttons. Touch uses a short hold to begin dragging,
allowing normal vertical scrolling before activation. Keyboard drag controls
remain available on the focused card. New lists appear at the top. Each card opens
`/households/:householdId/lists/:listId`, with a named breadcrumb, a seamless
inline name editor, and confirmed deletion from a trash-icon action. Name
edits debounce, save on blur or Enter, and revert with Escape. Rejected text
remains available with an anchored error and explicit Retry/Discard; it does not
silently revert to the server value. Dirty drafts protect navigation and unload.
Debounced saves normalize
the persisted name without rewriting the live draft under the user's cursor;
blur and Enter normalize the visible value as the editing boundary.

Deleting sets the list's nullable `deleted_at` timestamp. Library and detail
queries exclude deleted lists, while their items remain stored. All list and
item mutations scope their parent lookup to non-deleted lists. Active list names
remain unique per household; names belonging only to deleted lists may be reused.

The actual item-list interactions are preserved: add-item drafts, debounced
inline editing, active items followed by crossed items, drag ordering within
each status, and an archive toggle with restore and immediate delete controls.
Deleting an archived item sets its status to `deleted`; detail queries omit that
status entirely. Re-adding a name reactivates its existing item in that list.
Ordinary item actions change status rather than hard-delete records. Connection
state disables mutations as before. Status changes preserve a neighboring visible
row in the document or scrolling panel, rather than following the moved item to
the top. Focus advances to a neighboring action with `preventScroll`; subsequent
user input cancels pending scroll restoration.
Creation drafts ending in whitespace wait for more typing or an explicit blur or
submission before transitioning to a saved row.

## Data model

`lists` stores `id`, `household_id`, display and normalized names, `kind`
(`checklist | moodboard`, Checklist by default), `media_count`, `sort_key`,
`deleted_at`, and timestamps. Active normalized names are unique per household.
`list_items` adds
`list_id` and `active | crossed | archived | deleted` status to the same fields;
item names are unique within a list. Names use Unicode NFKC, collapsed whitespace,
trimming, and a 1–100-character limit. Normalized names are lowercase display
names.

Both tables use descending integer sort keys with UUID tie-breakers. Reordering
usually updates one key; exhausted gaps cause rebalancing. The composite item
foreign key `(household_id, list_id)` prevents attaching an item to a list in a
different household. The foreign key cascades on a physical database deletion;
the application soft-deletes lists and retains their items.

## Synchronization and authorization

Named Zero queries `lists.library` and `lists.detail` check current household
membership and enabled Lists settings. The legacy `lists.byHousehold` query
retains its checklist-only relationship shape for older clients. The detail query joins items using both
household ID and list ID. Publishing a table does not bypass these checks.

The live `lists` mutators are create, rename, delete, reorder, addItem, renameItem,
setItemStatus, and reorderItems. Each server execution checks membership and
enabled-module access. Parent and child lookups are scoped to the requested
household/list, and item reordering is scoped to status. PostgreSQL uniqueness
and foreign keys remain the final constraints. Client changes are optimistic;
the server supplies authoritative timestamps. List deletion updates only the
parent tombstone; authorized queries stop exposing that list and its children.

The application schema and Zero publication contain only the current domain
tables. Migration `0017` removes the retired module's source tables, settings,
and temporary mirroring bridge without changing live Lists data.

Moodboards add typed `list_media` attachments to shared assets, plus dedicated
media queries, upload/read/removal APIs and the `lists.reorderMedia` mutation.
They do not accept checklist items or change list type after creation.

Recipe ingredients and list items remain separate records. Any future operation
to copy ingredients must choose a target list and authorize both modules.
