# Calendar

Opt-in household calendar (`calendar`), disabled by default. Owners enable it in
module settings. Every current member can manage every item; people labels do
not restrict access or send notifications.

## Interface

Monday-first month grid with two title previews and an overflow count per day.
Leading/trailing cells show the adjacent months’ dates and items, with muted day
numbers and previews. Only the weeks needed for the displayed month are shown.
Selecting an adjacent day follows it into its month, using the same draft-save
and keyboard-navigation guards. Reads cover this bounded grid (at most 42 days).
Select a day for its full ordered list. Every name and existing note is always a
seamless input: there is no click-to-edit mode or Done button. A note icon adds an
empty note beside the name, like recipe ingredients. Actions stay visible without
focusing the row. Text, drag handles and actions share a genuine 28px height. Multiline note content remains intact; the compact editor scrolls
rather than rewriting it. There is no item form or editing dialog.
People use a dropdown checklist that stays open for multiple selections.
The calendar icon opens a compact Start/optional End picker. Both dates are
inclusive; End before Start is rejected. Apply (or Enter) saves both endpoints
together, so partially typed dates never move an item. Changing Start leaves End
unchanged. Clearing End or choosing equal endpoints makes the item single-day.
Escape/outside click or the close button cancels an unapplied/failed date edit
without dropping other drafts. A direct trash icon uses the standard confirmation
popover; deleting a span removes it from every day for everyone.

A photo icon adds pictures to a saved item, just like cooking logs: a horizontal
48px thumbnail strip beneath the row opens the shared full-screen viewer, with
previous/next navigation and confirmed picture removal. The month grid is unchanged.
Still JPEG/PNG/WebP uploads use the shared 10 MiB/16,384px limits and reject invalid
or animated content. An untouched unnamed row cannot upload. Uploads/removals block
scope changes, navigation/unload and PWA updates without discarding text drafts.
Pictures stay with the item when its day changes; deleting an item hides its pictures
from the calendar. There is no separate gallery or picture-ordering mode.

Items contain a literal start day and optional inclusive end, a required title
(150 characters), an optional multiline plain-text note (10,000 characters), and
optional current-member labels. One record appears on every covered day; text,
people, pictures and deletion are shared, not copied. Detail rows show a small
date-range label; month previews remain title-only. Duplicate titles, past/future
dates and cross-month/year spans have no additional duration limit. No time
conversion is applied to stored dates, including when the device changes timezone.

Adding a blank inline row creates nothing. The first valid title creates the item;
note/people edits before that remain local. Subsequent edits autosave. Text uses
the existing 600 ms debounce convention, without trimming a focused title/caret.
Text autosaves on debounce/blur; switching days/months flushes every row.
Failures/invalid input keep the same row/draft available with retry/discard.
A single page-level navigation/unload guard protects all unsaved rows together.
Discard removes only unsaved edits, never previously autosaved changes. Drafts
protect navigation, unloading and PWA updates; no persistent draft-storage layer
is added. Cached inspection remains available offline; writes require connectivity.

New items start single-day on the selected day. New items and changed starts
append among items covering their start day. The day list supports the app's
mouse, touch-hold and keyboard ordering gestures. Each item has one shared order:
reordering a span can affect its position on other covered days. Applying dates
keeps the calendar on the viewed day; an item disappears there if it no longer
covers that day. Other row drafts flush before date changes, and remote changes
cannot unmount unsaved rows. Ordering pauses only while drafts or operations are
pending, not simply because an input is focused. There is no archive/restore UI.

## Data and authorization

Migration `0054_medical_colossus.sql` adds `calendar_items` and `calendar_people`,
their indexes/constraints/publication entries, and disabled settings for existing
households. It does not rewrite existing module content or applied migrations.

Migration `0059_glorious_energizer.sql` adds nullable `end_day` with a valid-date
and end-on/after-start constraint. Existing items retain their dates, content,
labels, ordering and tombstones; null means single-day. The existing whole-table
publication includes the new column. No daily copies or occurrence tables exist.
Month queries select ranges overlapping the visible grid, rendering only those
visible days even for very long spans.

Items have a direct household ID, a UUID, start/end/title/note/order, timestamps and a
deletion tombstone. Date/text constraints and household-qualified attachment FKs
are enforced in PostgreSQL. Tombstones prevent stale writes or reused IDs from
reviving deleted items. Reads require a live household, live viewer membership and
enabled module; writes recheck those conditions on the server.

People links reference stable user accounts, deliberately **not membership rows**.
Queries expose a link/profile only while the account currently belongs to that
household. Leaving hides labels and removes access, but preserves associations;
the same account rejoining restores them. Labels are updated per person, so edits
to other fields/people cannot erase hidden associations. Items survive their
creator leaving.

Calendar item/people/order writes take a household-scoped PostgreSQL advisory transaction lock in
the existing server mutation wrapper. This serializes append/move/rebalance
operations. Shared reorder planning preserves unseen additions and rejects stale
foreign/day scopes. Reorders include every item covering the selected day,
regardless of its start. Field patches merge independent text edits; dates are
patched and merged as a pair, with locked current-range validation on the server.
The latest accepted write wins same-field conflicts. Month reads are date-bounded, and the open item
has an independent subscription rather than depending on the month's row list.

Migration `0055_unusual_molecule_man.sql` adds typed `calendar_media` attachments
and their publication entry. Household-qualified item/asset foreign keys prevent
cross-household links. Only confirmed, active image attachments for an active item
synchronize, through an item-scoped subscription rather than the month grid. Photo
API operations authorize current membership, enabled Calendar and active parent,
attachment and asset; confirmation rechecks after processing. Parent-first row locks
serialize uploads with item deletion. Signed delivery and URL caching reuse the
[shared media](../media/) contract, with Calendar-specific identities/caches cleared
on logout. Removing a picture soft-deletes its attachment, not shared asset bytes;
item deletion retains stored attachment/asset records. Physical cleanup is deferred.

No recurrence, reminders, invitations, RSVP, completion states, categories, generic
file attachments, person filters, calendar sync or cross-module integrations.
