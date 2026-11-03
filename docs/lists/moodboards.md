# Moodboards

Moodboards are a second **list type**, not a separate household module. Create a
Checklist or Moodboard in the normal New list dialog; both have the same title,
name editor, navigation, household sharing and library ordering. Existing lists
remain Checklists. Type conversion, captions, external links and mixed checklist
items/media are not part of this version.

## Interface and bounds

- Add multiple still images or video clips. Each local file has progress and a
  retryable error; successful uploads collapse into a compact summary. Failed
  files remain until retry/discard. Pending work guards navigation, unload and
  PWA updates; list deletion is disabled until it is resolved.
- Show media in responsive masonry: two columns on phones, three/four on wider
  screens. Aspect ratios reserve layout space. Media opens from its image surface;
  a separate handle supports mouse drag, touch hold and Space/arrows/Escape.
- Initially query/render 50 pins plus a lookahead; Show more adds 50. The current
  display safety ceiling is 10,000 loaded pins; stored media is not deleted at that
  ceiling. The active viewer has an independent authorized query so new uploads
  do not evict a playing clip from the loaded window.
- Library cards show at most four thumbnails/posters, title and confirmed-media
  count, without autoplay. `lists.library` is the new query; `lists.byHousehold`
  retains its original shape for older clients. No tile subscribes independently
  to Zero; signed read misses batch by user/household, at most 100 per request.
- The viewer keeps a thumbnail while a larger image loads. Videos open paused
  with native playback/seeking controls. No transcoding or external embeds.

## Formats and storage

Still JPEG/PNG/WebP keep the existing 10 MiB / 16,384-pixel limits and reject new
animation. Clips accept MP4 with H.264 and optional AAC, or WebM with VP8/VP9 and
optional Opus/Vorbis: at most **100 MiB, ten minutes and 4096 pixels per side**.
Unsupported codecs, extra tracks, invalid dimensions/duration and processing
failures do not confirm an asset. Browser metadata is only an early UX check.

The API image includes FFmpeg/ffprobe. Video processing uses bounded temporary
files, a two-job concurrency limit, bounded subprocess allocation/threading,
30-second command/storage deadlines and cleanup on exit. It validates the actual
clip, generates WebP posters and remuxes encoded streams without transcoding
(MP4 playback is fast-start). Processing happens outside database locks, then
membership/module/parent/attachment access is rechecked before confirmation.

Originals stay private in R2. Playback copies and posters use a server-owned
SHA-256-versioned prefix; a still-valid original PUT cannot overwrite confirmed
playback. Poster capabilities add a signed version while retaining old image
signatures. Video has a separate, list-context-bound signed capability, verified
before storage access, with GET/HEAD and single byte-range support. Images never
gain an original-download path. Existing issued capabilities can survive removal
or membership revocation until expiry (at most one hour), as with other media.

## Data, authorization and rollout

`lists.kind` defaults to Checklist; `media_count` counts confirmed active pins.
`list_media` has its own UUID, sparse ordering, timestamps and soft deletion, with
composite household/list and household/asset foreign keys. Upload, confirmation,
removal and reorder serialize on the parent. Count updates are in the confirmation/
removal transaction. Checklist-item mutations reject Moodboards. Only active
Moodboards in a live, authorized household with Lists enabled expose media.
Removing a pin or board retains asset bytes and attachment context.

`0050_list_moodboards.sql` expands media validation, adds list types/attachments,
and extends the explicit Zero publication allowlists. Existing images, item rows,
IDs, timestamps and storage keys are preserved; there is no replica reset or SDK
patch. Deploy the backward-compatible Worker, migrate, then make API/cache healthy
before web. FFmpeg is packaged in the API image; no new signing secret is needed.

**Migration coordination:** `0049` belongs to open habit-link PR #84. This feature
starts independently from `develop` and reserves `0050`; reconcile its journal/
snapshot lineage against `0049` before merging/releasing both. Do not deploy a
higher-timestamp migration and then append an older pending migration: Drizzle
can skip it. Renumber/regenerate only unapplied work, never applied migration SQL.

Verification includes the normal unit/type/build checks, disposable PostgreSQL
media/retention/authorization tests, warm Zero schema replication, actual old-client
checklist compatibility and browser uploads, playback/ranges, retry and all three
ordering inputs. Fixture storage/image transformation is isolated; video processing
and delivery handlers run real code, without contacting production R2.
