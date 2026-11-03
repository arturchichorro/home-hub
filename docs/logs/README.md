# Logs

Logs is an opt-in, household-shared module for freely named topics and dated,
manually written notes. All current members may create/read/edit/categorize/remove
logs and entries. This sharing applies only to these new manual-log tables;
existing private workout/performance logs and notes are unchanged.

## Interface

The breadcrumb is the page title. A small header `+` inserts a temporary inline
title field: Enter creates/opens the log, Escape cancels. Empty/half-created topics
are not persisted. Titles are unique per household after case/whitespace
normalization; renaming never changes the log's identity or entry history.

The index groups compact rows by colored, user-created category, plus Uncategorized.
Categories/logs sort alphabetically. Search matches log titles or active category
names. Initially show 50 metadata rows, disclose up to 500; refine search beyond
that ceiling. The category catalogue stays synchronized. A category can be renamed,
recolored from preset colors or removed; removal logically uncategorizes its logs,
without removing entries. No nested categories or manual ordering.

Opening a log shows the selected day's seamless multiline editor (Today initially)
and expanded historical notes, newest first. An entry appears only once. Search
note text within that log, jump/backfill to a date, and page Older/Newer through
20-entry windows plus a lookahead. The selected day is independently pinned.
History bodies are not synchronized as one unbounded collection. Dirty editors
pin their own snapshots and block search/date/page changes until resolved.

## Days, editing and conflicts

Exactly **one active shared entry per log/date**, not one per author. Calendar dates
are persisted literally. Today uses each writer's device timezone; server time in
the submitted, validated timezone bounds new entries to today/past. Existing entries
from a member whose date is ahead remain editable. Travel never rebuckets history.

Notes are plain multiline text up to 20,000 characters. Preserve indentation/line
breaks, including while autosaving. New empty editors create nothing. Clearing an
existing note is removal **on blur/edit completion**, never during a typing pause.
Explicit Remove uses confirmation. Store creator, last editor and absolute timestamps;
there is no revision-history UI or archive/restore UI.

Nonempty notes autosave after 600ms; blur or Ctrl/Cmd+Enter saves immediately.
Retain failed/conflicting drafts, caret/DOM identity, navigation/unload and PWA
protections. Editing is unavailable when Zero reports disconnection; this is not
an offline-write or cross-device-draft feature.

Entry writes use a dedicated authenticated HTTP transaction and compare entry ID +
expected revision under a parent-log lock. This also serializes concurrent first
writes. A stale edit/delete returns 409 with the authorized current snapshot;
the client keeps its draft and shows the saved text. Use saved discards only the
local draft; Save my draft explicitly rebases against the reviewed revision. A new
race rejects again rather than silently overwriting. Opaque write IDs make retries
idempotent, without exposing those IDs through Zero. New input during a pending
save is retained and subsequently saved against the acknowledged revision.

Zero remains the live read channel and handles topic/category metadata mutations;
entry bodies have no generic Zero writer. A short authoritative read can reconcile
a delayed replication echo after an HTTP acknowledgement. No SDK patch is used.

## Data, removal and rollout

- `logs`: household, stable ID/title, normalized title, optional category, cached
  last-entry date and timestamps/removal marker.
- `log_categories`: household-enforced category references, active normalized-name
  uniqueness and preset colors.
- `log_entries`: household/log FK, literal day, note, revision, creator/last editor,
  timestamps and `deleted_at`. Partial uniqueness applies only to active dates.
- A trigger maintains last-entry metadata, including manual database restoration.
  Explicit publication excludes private `last_write_id`; user joins expose only
  the existing safe ID/username profile columns.

`deletedAt` hides records while retaining bodies/context. Restore manually in the
database if needed, resolving active title/day collisions first. There is no purge,
trash, automatic note generation, attachments, rich text, actual cross-module item
link, global note-content search, reminders, schedules or scores.

`0052_logs.sql` follows habit links (`0049`), Moodboards (`0050`) and Documents
(`0051`). Their journal indices are sequential, original timestamps increase, and
snapshots form one cumulative lineage; migration SQL is unchanged. Never append
an older pending migration after a newer timestamp is deployed, edit applied
migration SQL or reset a user's replica. Existing households default Logs off;
migration/API/cache must be healthy before the matching web release.

Tests cover real PostgreSQL races, daily uniqueness, deletion/restoration, timezone
boundaries, access revocation, metadata/FKs and cursor search. Browser checks cover
actual two-member conflicts, a race during explicit replacement, retained rejection
and navigation recovery, calendar backfill and bounded history. Disposable testing
must not touch user-owned databases, replicas or demo services.
