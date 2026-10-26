# Shared media foundation

## Goal and scope

Separate stored media from the features that use it. Use **one `media` table for
images and videos—no separate `images` or `videos` table**. Different processing
paths do not require different asset tables.

This phase migrates existing recipe images and keeps uploads, galleries, covers,
cooking-log pictures, ordering and delivery working unchanged. **Do not implement
video uploads/playback, animated-image playback, exercise attachments, a media
library/reuse picker, transcoding jobs, streaming infrastructure or cleanup jobs.**
Planning only; no implementation, push or deployment yet.

## Recommended model

**`media` — the stored asset**
- `id`, `household_id`, `kind` (`image` or `video`)
- Server-controlled `object_key`, content type, byte size, width and height
- Nullable `duration_ms` for video; nullable `animated` for image animation
- Confirmation/lifecycle state and timestamps
- No recipe, cooking-log or exercise identifiers

Existing recipe assets migrate as `kind = image`. GIF and animated WebP belong to
that same image kind; MIME type identifies the format. Unknown/uninspected
animation metadata stays null rather than falsely claiming the asset is static.
Do not fetch/reprocess every original just to populate future-facing fields.

**`recipe_media` — the recipe attachment, replacing `recipe_images`**
- Existing attachment `id`, plus `media_id` referencing `media`
- `household_id`, `recipe_id`, optional `cook_log_id`
- Recipe-specific `sort_key`, soft-deletion state and timestamps

Use household-scoped foreign keys for the asset and recipe/cooking-log context.
Preserve existing attachment IDs; backfill asset IDs from the same UUIDs. Asset
identity and attachment identity remain separate. A future recipe gallery can
order images and videos together without another attachment table.

Later, `exercise_media` can reference the catalog and `media`. Prefer typed
attachment tables over an unchecked `entity_type/entity_id` pair: real foreign
keys prevent orphaned/cross-household references. Multiple attachments to one
asset within a household are structurally supported, but reuse is not exposed yet.

## Formats and processing: deliberately incremental

- Keep today's JPEG, PNG and static WebP path and limits. Do not enable video/GIF
  uploads merely because the new schema can describe them.
- Audit animation handling, particularly WebP's already-allowed MIME type. Until
  a supported animation-preserving delivery path exists, detect and reject new
  animated uploads explicitly rather than silently flattening them. Do not trust
  the browser's claimed animation flag. Preserve existing stored originals and
  legacy image behavior; do not delete or automatically rewrite old animations.
- Later, add video validation, limits, playback and poster generation as a
  separate feature. Streaming/transcoding is not automatically required.
- Later, enable GIF/animated WebP deliberately. A still preview may be useful, but
  the opened media must preserve animation. Choose that delivery policy then.

## Security and lifecycle

- Authorize through the **attachment's feature**, not merely asset ID/household
  membership. Preserve Recipes-module and active-parent checks; future private
  features must enforce their own ownership rules.
- Synchronize confirmed metadata only through authorized attachments. Never
  publish object keys/credentials through Zero or expose private uploads through
  an unrestricted household-wide media query.
- Keep validation, confirmation retries and image derivative generation. External
  storage/Worker requests stay outside database-locking transactions, with
  authorization rechecked before confirmation. Unsupported kinds/formats fail
  closed; a video must never accidentally enter the image-transform pipeline.
- Removing a recipe picture soft-deletes its attachment, not an asset used
  elsewhere. Deleting a cooking log still leaves its pictures in the recipe
  gallery; deleting a recipe retains its underlying data.
- Preserve retention behavior; no physical R2/reference-count cleanup now. Some
  recipe docs describe an older hard-delete flow; follow the current soft-delete
  implementation and correct those docs.

## Implementation sequence

1. **Separate contracts and storage.** Introduce shared media metadata,
   validation and storage services; retain the existing image-processing path.
   Keep recipe-scoped API routes as authorization/compatibility adapters.
2. **Make delivery feature-neutral.** Add versioned capabilities binding asset,
   household, attachment context, storage locator, variant and expiry. Locators
   are server-issued and signed; arbitrary keys/transforms remain forbidden.
   Verify capabilities before edge-cache access. Only image delivery is enabled.
3. **Keep storage compatible.** Keep existing buckets, original/derivative keys
   and originals—no R2 copy/move. New uploads may use a generic media prefix;
   the Worker supports both layouts. Preserve legacy recipe URLs/signatures,
   processing requests and the legacy `card` variant during rollout.
4. **Migrate Recipes.** Add `media`, backfill every existing asset, and convert
   `recipe_images` to `recipe_media`. Verify IDs, keys, states, dimensions, order
   and cooking-log relationships before removing duplicated columns. Adapt Zero
   relations and recipe view models without changing the image UX/API contracts.
5. **Verify and roll out.** Deploy the backward-compatible Worker first. Back up
   PostgreSQL, stop API/Zero for the schema contract, migrate, deploy matching
   API/web code, rebuild Zero's disposable replica if required, restart and reload
   clients. Never delete PostgreSQL volumes. Retire legacy delivery only after
   old callers/cached capabilities expire; reads currently last one hour.

A Git revert alone is not a safe rollback after the schema contract/new writes;
prepare database-backup restoration or an explicit reverse-migration procedure.

## Acceptance checks

- Preserve pending, confirmed and soft-deleted images and all recipe/log links;
  no R2 relocation, accidental resurrection or lossy reprocessing.
- Existing photos/cached URLs and new supported image uploads work; confirmation
  retries, lazy derivative repair, batch reads, covers, ordering and viewer work.
- Test animated WebP detection and explicit rejection of unsupported new media;
  unknown legacy animation metadata is not silently relabelled as static.
- Foreign IDs, revoked membership, disabled modules, deleted parents, unconfirmed
  assets and tampered/expired capabilities fail closed, including cache hits.
- Detaching media cannot damage another attachment's asset; recipe/log deletion
  retains today's visible behavior.
- Test the real Zero transition/rebuild and actual web/API Docker builds, not just
  SQL and full-checkout builds. No exercise or video UI ships in this phase.

## Decisions to approve

1. One `media` table and typed `*_media` attachments; no format-specific tables.
2. Implement the foundation and recipe-image migration now; defer video and
   animation support until their validation/delivery behavior is implemented.
3. Preserve R2 objects, compatibility, authorization and soft-deletion behavior;
   no reuse UI, background processing infrastructure or physical cleanup yet.
