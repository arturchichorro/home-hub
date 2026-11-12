# Calendar

Opt-in household calendar (`calendar`), disabled by default. Owners enable it in
module settings. Every current member can manage every item; people labels do
not restrict access or send notifications.

## Interface

Monday-first month grid with two title previews and an overflow count per day.
Select a day for its full ordered list. Names edit seamlessly in the row; a note
icon reveals/focuses an inline note. There is no item form or editing dialog.
The row actions menu reveals a compact date control or inline people toggles;
Done flushes the row and restores its read-first presentation.
Items contain one literal day, a required title (150 characters), an optional
multiline plain-text note (10,000 characters), and optional current-member labels.
Duplicate titles and past/future dates are allowed. No time conversion is applied
to stored dates, including when the device changes timezone.

Adding a blank inline row creates nothing. The first valid title creates the item;
note/people edits before that remain local. Subsequent edits autosave. Text uses
the existing 600 ms debounce convention, without trimming a focused title/caret.
Done and switching items/days/months flush edits; failures/invalid input keep
the same row/draft available with retry/discard.
Discard removes only unsaved edits, never previously autosaved changes. Drafts
protect navigation, unloading and PWA updates; no persistent draft-storage layer
is added. Cached inspection remains available offline; writes require connectivity.

New/moved items append to their destination day. The day list supports the app's
mouse, touch-hold and keyboard ordering gestures. Moving across months follows the
accepted date without remounting the pinned inline editor, including while the
new month loads. Ordering is unavailable while a row is being edited. Delete requires confirmation;
there is no archive/trash/restore UI.

## Data and authorization

Migration `0054_medical_colossus.sql` adds `calendar_items` and `calendar_people`,
their indexes/constraints/publication entries, and disabled settings for existing
households. It does not rewrite existing module content or applied migrations.

Items have a direct household ID, a UUID, date/title/note/order, timestamps and a
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

Calendar writes take a household-scoped PostgreSQL advisory transaction lock in
the existing server mutation wrapper. This serializes append/move/rebalance
operations. Shared reorder planning preserves unseen additions and rejects stale
foreign/day scopes. Field patches merge independent edits; the latest accepted
write wins same-field conflicts. Month reads are date-bounded, and the open item
has an independent subscription rather than depending on the month's row list.

No recurrence, reminders, invitations, RSVP, completion states, categories,
attachments, person filters, calendar sync or cross-module integrations.
