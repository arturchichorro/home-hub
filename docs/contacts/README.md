# Contacts

Contacts replaces the old household Logs module. It starts fresh: legacy topics,
categories and notes are deliberately not converted. Operational diagnostics,
recipe cooking history and private training history are unrelated and unchanged.

## Behavior

- Opt-in, household-shared people records, not accounts or permissions.
- A–Z list; search names and detail values. Duplicate names are allowed.
- Profiles have one picture and ordered, repeatable labeled Text, Phone, Email,
  Link and Birthday details. Birthdays use day/month with an optional year; no reminders.
- Phone/email/link actions validate their destination; no country-specific phone rules.
- Archive preserves the profile, pictures and linked history. Restore before profile
  edits, new entries or new links. Existing shared entries remain editable through
  another active contact.
- Entries have a literal today/past date, no title, and text, pictures or both.
  Multiple entries per day are allowed. History sorts by date, creation time and ID
  descending, with bounded paging, note search and a through-date filter.
- One entry can belong to several contacts. Changes appear everywhere. Unlink
  removes only the current contact and requires another person to remain;
  **Delete entry everywhere** is a separate confirmed action. Removing the final
  text/picture cannot silently delete a shared entry.

Inline editors retain invalid, failed and conflicted drafts, offer retry/discard,
and guard navigation, filter/paging changes, unload and app updates. Revision
conflicts show the saved version before an explicit replacement. Focused entries
stay mounted even when an acknowledged edit no longer matches the note filter.

Pictures reuse shared still-image processing, thumbnails, signed private delivery
and the full-screen viewer: JPEG/PNG/WebP, 10 MiB and 16,384 pixels per side. A
replacement portrait is published only after successful processing. A photo-only
entry stays hidden until a picture is confirmed; failed uploads do not create
visible empty history. Re-select a file to retry an upload.

There is no import UI, maintained importer, provider connection or synchronization.
Any later vCard import is a separate inspected-file task, using a temporary script
and normal validation/image processing, with review and explicit execution approval.

## Data and authorization

`contacts` owns names, typed detail arrays, archive state and revisions.
`contact_entries` owns canonical dates/text and tombstones;
`contact_entry_people` links entries to one or more household contacts.
`contact_media` attaches shared `media` assets to a profile or entry.

Household-qualified foreign keys prevent cross-household attachments/links.
Deferred constraints enforce people and published text-or-confirmed-picture
content. Private, unpublished staging permits image-first creation. Zero queries
are bounded, module/membership-qualified and hide staging and tombstones; writes
use authenticated REST with household serialization, expected revisions and retry
IDs. Internal write IDs/hashes are excluded from publication.

## Destructive cutover

Migration `0057_contacts.sql` replaces `logs`, `log_entries`, `log_categories` and
their trigger function, and preserves household module enablement by renaming its
setting. Applied migration history is unchanged, including canonical training 0053.

This is **not** permission to apply it to production. Resolve every device's drafts
and queued writes, approve legacy Logs deletion, stop old writers, take a recoverable
backup and use matching app/Zero versions. See the [deployment procedure](../deployment.md#contacts-replacement-cutover-0057).

Verification includes populated-0056 fail-closed/repeat migration tests, PostgreSQL
authorization/conflict/media tests, editor tests and manual real-component browser
checks at desktop/412px/320px. An official Zero 1.11.3 rehearsal retained the same
replica volume across the cutover and verified the four new tables and removal of
the three legacy tables without manually resetting its cache. These are disposable
fixtures, not a production-data rehearsal or extra CI gates.
