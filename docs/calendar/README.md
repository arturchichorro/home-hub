# Calendar

Opt-in household calendar (`calendar`), disabled by default. Owners enable it in
module settings. Every current member can manage every item; people labels do
not restrict access or send notifications.

## Interface

Monday-first month grid with two title previews and an overflow count per day.
Select a day for its full ordered list. Every name and existing note is always a
seamless input: there is no click-to-edit mode or Done button. A note icon adds an
empty note beside the name, like recipe ingredients. Actions stay visible without
focusing the row. Text, drag handles and actions share a genuine 28px height. Multiline note content remains intact; the compact editor scrolls
rather than rewriting it. There is no item form or editing dialog.
People use a dropdown checklist that stays open for multiple selections.
The calendar icon opens a compact, dismissible date picker. It closes after a
successful move, on Escape/outside click, or with its close button. Choose a day
then press Move (or Enter), so partially typed dates never move an item mid-entry.
Closing cancels an unapplied/failed date choice without dropping other drafts. The actions
menu retains confirmed deletion.
Items contain one literal day, a required title (150 characters), an optional
multiline plain-text note (10,000 characters), and optional current-member labels.
Duplicate titles and past/future dates are allowed. No time conversion is applied
to stored dates, including when the device changes timezone.

Adding a blank inline row creates nothing. The first valid title creates the item;
note/people edits before that remain local. Subsequent edits autosave. Text uses
the existing 600 ms debounce convention, without trimming a focused title/caret.
Text autosaves on debounce/blur; switching days/months flushes every row.
Failures/invalid input keep the same row/draft available with retry/discard.
A single page-level navigation/unload guard protects all unsaved rows together.
Discard removes only unsaved edits, never previously autosaved changes. Drafts
protect navigation, unloading and PWA updates; no persistent draft-storage layer
is added. Cached inspection remains available offline; writes require connectivity.

New/moved items append to their destination day. The day list supports the app's
mouse, touch-hold and keyboard ordering gestures. Moving across months follows the
accepted date without remounting the pinned inline editor, including while the
new month loads. Other row drafts flush before a date move, and remote changes
cannot unmount unsaved rows. Ordering pauses only while drafts or operations are
pending, not simply because an input is focused. Delete requires confirmation;
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
