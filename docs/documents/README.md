# Documents

Documents is an opt-in, household-shared module. Any current member can upload,
view/download, edit, tag, replace or remove documents. Disabling the module hides
access without deleting data.

## Interface

Choose one file to start uploading immediately; no creation form. A confirmed row
gets a filename-derived title. Titles autosave seamlessly; optional plain-text
descriptions use the cooking-log comment pattern beside the title. Failed drafts
retain Retry/Discard, focus and navigation/unload/PWA protections.

Each row displays reusable colored tags and the current file's upload date, with
full timestamp on hover. The tag icon opens assignment/creation; household tags
can be renamed, recolored from an accessible preset palette or soft-deleted.
Names are case/whitespace-normalized and unique within the active catalogue.
Deleting a tag logically unlinks it without deleting documents; assignment IDs
remain for retained context. There is no per-document tag-count limit.

Search titles, descriptions and original filenames; selected tags intersect.
Untagged excludes deleted tags. Sort by title or upload time, newest upload first
by default. Query 50 rows plus a lookahead, progressively disclose up to 999 rows;
refine search beyond that display ceiling. Focused/dirty rows retain identity and
position while saved results move. Only the page and tag catalogue subscribe to
Zero, not individual rows. The household tag catalogue remains fully synchronized.

## Files and privacy

Accept at most **50 MiB**: PDF, JPEG/PNG/still WebP, DOCX/XLSX/PPTX, UTF-8 TXT/CSV
and Markdown (`.md`). Reject legacy/macro Office, animation, SVG/HTML, executable
and archive uploads. Validate signatures/containers rather than trusting MIME or
extension alone; OOXML central-directory bounds and its content-type manifest are
inspected with bounded decompression and without extracting user paths. This is
not a malware scanner or a guarantee that every accepted file is uncorrupted.

PDF/image previews use isolated signed delivery. PDF rendering uses the browser's
native viewer and depends on browser support; Open file/Download remain available.
Office/text/CSV/Markdown are download-only. No external preview service, OCR,
content indexing, folders, custom dates, reminders or batch imports.

Files remain private in the existing R2 bucket. Upload into a staging key, validate
outside database locks (two concurrent confirmations; bounded bytes and storage
request deadlines), then store a SHA-256-versioned verified copy. Recheck active
user/household/member/module/document access before confirmation. Replacement
compares the expected current file under a parent lock: keep the old file until
success; a stale replacement cannot overwrite a newer one. Metadata/tags/row ID
and original creation time remain; current-file upload time advances.

Signed read capabilities bind household/document/file, hash, filename, type,
disposition and expiry; authenticate before storage access. The Worker supports
GET/HEAD/single ranges, uses `nosniff` and private/no-store responses, and forces
non-preview formats to download. Issued URLs can survive access changes until
their 15-minute expiry; new reads require current access. Use the separate file
origin, not the application origin, for delivery.

**Removal is not erasure.** Soft-deleted documents, replaced files and staging/
verified objects remain privately retained. There is no trash/version-history UI,
restore endpoint or automatic purge. Original image downloads here are specific
to Documents; existing Recipes/exercise image-original restrictions are unchanged.

## Data and rollout

- `documents`: title/description, household, current file, upload/creation/update/
  removal timestamps. Composite current-file FK binds household and document ID.
- `document_files`: retained file context/metadata, private object key and private
  expected-current-file precondition. Pending files may precede a document row;
  no document becomes visible until confirmation succeeds.
- `document_tags` and `document_tag_assignments`: household-enforced relationships,
  active normalized-name uniqueness and preset colors.
- Explicit publication exposes file metadata, **not object keys/preconditions**.

`0051_documents.sql` reserves ordering after open habit-link #84 (`0049`) and
moodboard #87 (`0050`), but this branch starts independently from `develop`.
Reconcile journal timestamps/indices and snapshot lineage before merging/releasing
these parallel migrations. Never append an older unapplied migration after a
higher timestamp has been deployed; never rewrite applied migration SQL.

Deploy the backward-compatible Worker first, migrate and make API/cache healthy,
then web. No new storage credentials, dependencies, SDK patches or replica resets
are required. PostgreSQL integration tests run through
`scripts/verify-media-migration.sh` against disposable databases, including current
file races, access revocation, retention, tag/search behavior and household FKs.
