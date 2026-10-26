# Shared media

## Model and current scope

`media` owns stored assets: UUID, household, kind, private object key, MIME type,
byte size, layout dimensions, optional duration/animation metadata, confirmation,
soft-deletion state and timestamps. There are **no separate image/video tables**.

`recipe_media` owns attachment UUIDs, household/recipe, optional cooking-log context,
asset reference, recipe ordering, deletion state and timestamps. Composite foreign
keys prohibit cross-household assets and cross-recipe cooking-log references.
Attachment identity is independent of asset identity. The existing recipe image
API/view models continue to identify attachments, including ordering and URL caches.

Future features add typed `*_media` attachment tables; there is no polymorphic
owner-ID field or generic household-wide media library. Multiple attachments can
reference one asset, but no reuse/linking API or picker is exposed yet. A future
reuse API must authorize both the source asset's existing attachment and the target.

Uploads currently support still JPEG/PNG/WebP, at most 10 MiB, with browser-supplied
layout dimensions of 1–16,384 pixels. These dimensions are not trusted security
metadata. Video is reserved in the kind model; current database content-type
constraints and upload validation deliberately reject videos and GIF. Enabling them
requires a separate validation/delivery feature, not another asset table.

Animated GIF/WebP remain images. New animated WebP/APNG uploads are rejected by
container inspection in the Worker before transformations; actual image decoding
still happens through Cloudflare Images. Unsupported or invalid uploads remain
unconfirmed, and the recipe upload button shows a dismissible error popover.
Legacy assets retain unknown (`NULL`) animation metadata and existing display
behavior; originals are neither rewritten nor falsely classified as static.

## Storage, delivery and authorization

New originals use `households/{householdId}/media/{mediaId}`. Migrated originals
keep `households/{householdId}/recipes/{storageRecipeId}/{mediaId}`, with the same
`/derivatives/{thumbnail|viewer}.webp` suffixes. Original bytes/buckets never move.
The historical `RECIPE_IMAGES` Worker binding name remains for compatibility;
it is not a separate image-only bucket.

The generic API storage/signing helpers live in `apps/api/src/media`. Recipe
routes remain feature-specific authorization adapters. Authorization requires an
active user, household membership, enabled Recipes and an active recipe attachment
and image asset. Storage provenance does not grant access: a legacy asset linked
elsewhere is authorized through its current attachment, not its source recipe.

V2 read/processing capabilities authenticate household, asset, module, parent,
attachment, storage layout and expiry; reads also bind a fixed variant, processing
binds expected MIME type/byte size. Read and processing signatures have separate
purposes. The Worker supports only bounded known storage layouts, verifies before
cache lookup, and partitions cached bytes by asset/storage identity and transform.
Capabilities last one hour for reads and five minutes for processing. No original
read/download or arbitrary transform is exposed.

Upload confirmation inspects R2 metadata, then the Worker reads a bounded snapshot,
rejects unsupported animation/type/size, decodes and stores both derivatives. Only
then does a reauthorized transaction mark the asset confirmed and non-animated.
R2/Worker calls happen outside locking transactions. Retry failures leave pending
metadata; repeated successful confirmation is idempotent.

Zero publishes asset metadata but **not object keys**. Only named feature queries
through authorized attachments synchronize confirmed assets; legacy CRUD is disabled.
Recipe removal soft-deletes an attachment without deleting its asset/bytes.
Deleted cooking-log pictures stay in the recipe gallery. Recipe deletion retains
attachments/assets. Physical cleanup and reference-count deletion are deferred;
any future cleanup must respect retained references, including soft-deleted parents.

## Migration and rollout

`0043_cute_deadpool.sql` copies all recipe assets, including pending uploads and
tombstones, into `media` and their links into `recipe_media`. Initial asset and
attachment UUIDs match old image UUIDs. It checks complete copied records before
retiring `recipe_images` and replacing the publication entries. Earlier migrations
remain unchanged. Legacy Worker URLs/signatures/processing and the `card` variant
continue working during cutover; old uploads can finish through the existing routes.

**This is a coordinated contract migration, not a routine rolling deployment.**
An old API/Zero/client schema must not run against the contracted tables.

1. Build and test matching images; deploy the backward-compatible Worker first.
   Keep the existing signing secret, buckets, legacy routes and transforms.
2. Block writes/enter maintenance; stop API and Zero. Take a PostgreSQL backup and
   archive the Zero volume. This also accommodates the earlier catalog PK change
   in `0042` when upgrading directly from production.
3. Apply pending migrations; verify counts, IDs, state, keys and publication columns.
4. With Zero stopped, move its `/data/replica.db*` files into a timestamped backup
   directory outside that glob. Preserve upstream PostgreSQL and all its volumes.
   Starting with a fresh disposable replica avoids replaying incompatible history.
5. Start matching API, Zero and web. Verify Zero/bootstrap health, hard-reload clients,
   and smoke-test existing photos, a new still-image upload, ordering and deletion
   before reopening writes. Point local development at the matching new Worker too.
6. Keep legacy delivery until old callers and their cached capabilities have expired
   (reads last up to one hour). No legacy-removal change ships in this phase.

The routine `deploy-production.sh` does not perform this one-time maintenance or
replica archival: coordinate it before permitting the release to deploy normally.
A Git revert is insufficient after contraction. Before reopening writes, rollback
can restore the database backup and previous API/web with a rebuilt disposable
Zero replica; the backward-compatible Worker can remain. After new writes, a
restore loses those writes and needs explicit reconciliation/approval. A reverse
migration must also account for new generic object keys and reused attachments.

## Verification

`scripts/verify-media-migration.sh <postgres-container>` creates/discards isolated
PostgreSQL databases and exercises empty and populated full migration histories,
all copied metadata/state, foreign-key boundaries, reuse, detachment and publication
privacy. Set `DATABASE_URL` to that container's host-accessible connection URL to
also run four real PostgreSQL service tests; they are otherwise opt-in. CI runs both.
The script never migrates the application database. Unit tests cover capability
binding, animation rejection, stream bounds, cache isolation and legacy delivery.
Production web/API Docker builds and the Worker dry-run bundle must also pass.
