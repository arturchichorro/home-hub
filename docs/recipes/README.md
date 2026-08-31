# Recipes module

This document is the canonical reference for Recipes product behavior,
interface composition, persisted data, synchronization, and module-specific
security. Cross-cutting runtime boundaries remain in
[Architecture](../architecture.md), shared authorization and synchronization
rules remain in [Security and synchronization](../security-and-sync.md), and
shared visual foundations remain in [Design system](../design-system.md).

## Scope

Recipes provides a household with shared recipes, ordered ingredients, a
history of cooking events, and recipe or cooking-event images. It is a built-in
module with the stable `recipes` key and is enabled by default for new and
existing households.

Disabling Recipes hides its navigation and blocks its queries, mutations,
uploads, and signed image reads. It does not delete recipe data; re-enabling the
module restores access for every current household member.

Recipe ingredients and list items are separate domain records. A future
operation may copy ingredient names into a chosen list and insert or reactivate
its normalized rows, but that cross-module operation is not implemented and
must require both modules to be enabled and authorize access to the target list.

## Interface

### Recipe library

The library lives at `/recipes`. It uses one card column by default, two from
`sm`, and three from `lg`. Cards are compact, borderless image-and-text tiles:
each shows a small fixed-size crop of the recipe's first confirmed image on the
left, with an accent-colored title and at most two muted description lines on
the right. A compact `+ Add recipe` row follows the grid, opens a title-only
creation dialog, and navigates to the new recipe detail page after creation.
Cards have no visible ordering controls: clicking opens a recipe, while dragging
reorders it. Touch uses a short hold before dragging so normal page scrolling
remains available. Existing recipes begin in their previous alphabetical order,
and newly created recipes appear at the top.

### Recipe detail

Addressable detail pages live at `/recipes/$recipeId` and remain one column at
every width. The directly editable accent-colored title and description appear
first, followed by the confirmed-image gallery and independently closable
Ingredients and Cooking history sections.

The title row includes a neutral trash action with a compact confirmation
popover. Deleting a recipe sets its `deleted_at` timestamp and returns to the
recipe library; the recipe and all ingredients, cooking logs, images, and image
objects remain stored.

Title, description, ingredient names, ingredient amounts and notes, and
cooking-log comments use seamless debounced inline editing. Valid changes also
save on blur. Server rejection reverts to the authoritative value and appears
in an error popover without turning the fields into conventional bordered
form controls.

### Images

The gallery stays on one horizontally scrolling row and extends through the
page's right padding while scrolling. Matching trailing space lets the final
image settle back inside the normal page inset at the end of the strip. The row
reveals part of the next image when additional pictures are available. An Add
picture row follows the gallery. Drag handles reorder confirmed images with
pointer, touch, or keyboard input; the first image is the recipe-card cover.
Recipe cards and thumbnails reuse one aspect-preserving derivative and apply
their different crops in CSS.

Every thumbnail opens the same bare modal viewer. The viewer preserves the
stored aspect ratio and shows only close, previous, and next controls. Previous
and next navigation loops across the complete gallery when opened there, or
across one cooking log's images when opened from that entry. The left and right
arrow keys provide the same navigation. Image deletion uses a compact
confirmation popover.

### Ingredients

Ingredients form one divided, reorderable list. Every saved ingredient occupies
one row with a drag handle, editable name, optional free-text amount, optional
muted note, and compact actions. A non-editable Scale icon precedes a saved
amount, and a non-editable ` - ` separator precedes a saved note. Clearing an
amount or note stores `null`. Note editors remain constrained by their row and
scroll internally rather than expanding the list or page.

The row ends with conditional add-amount, add-note, and delete actions. Each add
action is hidden while its value exists; otherwise it reveals and focuses the
corresponding editor. Deletion is immediate. Drag handles support accessible
reordering.

A muted Add ingredient trigger follows the saved ingredients. Activating it
inserts a focused, name-only draft immediately above the trigger inside the
same list. The draft is a UI-only `creating` variant of the normal row,
preassigned the ID used by its eventual optimistic insertion and given a
disabled drag handle until it is saved. The trigger remains visible below an
open draft, and activating it again returns focus to that draft.

Draft names save after the standard debounce, on blur, or on Enter. Submitting
or blurring an empty name dismisses the draft without persisting a record. Only
the compact plus-and-label control receives hover treatment, not the full
trigger row.

### Cooking history

Cooking history is ordered newest first and begins with a date-only add row.
An entry with a comment displays it as seamless inline-editable text. An entry
without one shows a comment action on the right instead of empty placeholder
text; activating it reveals and focuses the comment editor. Each entry also has
compact linked image thumbnails, a smaller low-emphasis image-upload control,
and a confirmed delete action. Deleting a cooking log preserves its pictures
by detaching them from the log and leaving them in the general recipe gallery.

The Recipes interface must represent loading, empty, synchronization-error,
mutation-disabled, optimistic, upload-progress, upload-failure, and destructive
confirmation states. Mutation controls are unavailable whenever the shared
connection policy disallows writes.

## Data model

Every synchronized row has a direct `household_id`. Recipe ingredient,
cooking-log, and image rows use independent client-generated UUIDv4 identifiers
so optimistic and concurrent edits address stable records. References are
constrained so they cannot cross household or recipe boundaries.

### `recipes`

- `id`
- `household_id`
- `title`
- `description`
- `sort_key`
- `deleted_at`
- `created_at`, `updated_at`

Recipe titles do not need to be unique within a household. Normalize titles
with Unicode NFKC, fold whitespace, trim, preserve casing, and require 1–150
characters. Store `description` as nullable text, trim its boundaries while
preserving internal spaces and line breaks, limit it to 5,000 characters, and
store an empty description as `null`.

### `recipe_ingredients`

- `id`
- `household_id`
- `recipe_id`
- `name`
- `amount`: nullable text
- `note`: nullable text
- `position`: integer
- `created_at`, `updated_at`

Amount remains text so combined measurements such as `12g`, `1 ½ cups`, `2–3`,
and `to taste` remain representable without a separate unit input. Position
must be nonnegative. Positions are indexed but not unique; equal positions are
ordered by row ID for deterministic display. Reordering renumbers the visible
ingredient collection from zero.

### `recipe_cook_logs`

- `id`
- `household_id`
- `recipe_id`
- `cooked_at`: timestamp with time zone
- `comment`: nullable text
- `created_at`, `updated_at`

Each row represents one cooking event. Multiple events may have the same
`cooked_at` value. Logs do not attribute who cooked or recorded the event.
Deleting a cooking log first clears its images' `cook_log_id`, preserving those
images as general recipe pictures.

### `recipe_images`

- `id`
- `household_id`
- `recipe_id`
- `cook_log_id`, nullable
- `object_key`
- `content_type`
- `byte_size`
- `width`, `height`: display dimensions supplied by the browser
- `position`: integer
- `confirmed_at`, nullable
- `created_at`, `updated_at`

Every image belongs to one recipe and may optionally provide context for one
cooking log from that recipe. Cooking-log images remain part of the recipe's
overall image collection. The optional cooking-log relationship includes the
household and recipe IDs so it cannot cross either boundary. Reordering
renumbers confirmed images from zero; the lowest position is the recipe cover.

Object keys are server-controlled, unique, and independent of public
hostnames. Pending metadata exists before an upload is authorized;
`confirmed_at` remains null until the API verifies the R2 object, content type,
and size. Only confirmed images are readable or synchronized. Position must be
nonnegative. Width and height are untrusted layout metadata constrained to
1–16,384 pixels.

## Synchronization and authorization

Named Recipes queries constrain results through current household membership,
an enabled Recipes module setting, and `deleted_at IS NULL`. The Zero publication is only a coarse
allowlist: it omits recipe-image object keys, and query authorization still
determines which rows a client may synchronize.

Recipe, ingredient, cooking-log, and confirmed-image metadata changes use
validated custom Zero mutators where implemented. Their optimistic client run
provides immediate feedback; their authoritative server run verifies the
authenticated user, current household membership, the enabled Recipes setting,
and every referenced active recipe-scoped row inside the transaction. Deleted
recipes cannot receive metadata or image mutations. Foreign IDs are
indistinguishable from missing IDs. Scalar conflicts use the last write
accepted by PostgreSQL, while independently created rows survive through their
stable IDs.

Writes follow the shared [connectivity policy](../security-and-sync.md#connectivity-policy):
cached data remains visible while disconnected, but mutation controls are
disabled and no custom long-term offline queue is introduced.

## Image storage and security

Recipe image bytes travel directly between the browser and Cloudflare R2 using
short-lived presigned URLs. PostgreSQL stores metadata; the API never writes
uploaded image bytes to its filesystem.

Every confirmed upload remains in private R2 in its original content type and
quality as the canonical source. Cloudflare Images generates two optimized
WebP derivatives during upload confirmation, and the Worker stores them in R2
for immediate display. Derivative generation never replaces the original.
There is initially no user-facing read or download operation for the original
bytes. A possible future original-access policy is independent of the
retention policy.

Current derivative reads use an aspect-preserving `thumbnail` constrained to
768 pixels wide for recipe cards and detail thumbnails, and a `viewer`
constrained to 1,920 pixels wide without enlargement. The legacy 640×427
`card` variant remains valid only for rollout compatibility. Derivatives use
WebP quality 82. A one-hour server-authorized delivery capability preserves
household and Recipes-module access. Clients cannot supply arbitrary
transformation parameters or obtain the private source object URL.

The upload flow is:

1. The authenticated browser requests permission for a specific recipe, image
   ID, optional cooking log, content type, and size.
2. The API verifies household membership, the enabled Recipes setting, recipe
   ownership, and any cooking-log relationship.
3. The API constructs
   `households/{householdId}/recipes/{recipeId}/{imageId}` and creates pending
   metadata in PostgreSQL.
4. The API returns a short-lived presigned `PUT` URL bound to an allowed content
   type.
5. The browser uploads directly to R2.
6. The browser confirms completion, and the API verifies the object's type and
   size.
7. The API sends the Worker a five-minute HMAC-authenticated processing request.
   The Worker generates and stores `thumbnail.webp` and `viewer.webp` at
   deterministic keys. Retrying safely overwrites those same keys.
8. The API confirms the metadata only after both derivative writes succeed.

Only confirmed metadata may synchronize or receive a signed derivative read
URL.
Abandoned pending rows and possible objects are cleanup candidates. Support
JPEG, PNG, and WebP initially, with a 10 MiB maximum. Treat presigned URLs as
bearer credentials, never log them, and never expose R2 credentials through a
`VITE_` environment variable.

The web client caches signed derivative read URLs and in-flight requests by
user, household, recipe, image, and display variant. Unexpired URL metadata is
persisted in browser storage so reloads reuse the exact URL and browser HTTP
cache; entries refresh shortly before expiry, are cleared on logout, and are
invalidated when an image is deleted. Simultaneous misses are authorized in
household-wide batches of at most 100 requests.

The derivative read flow is:

1. The authenticated browser requests one or more fixed display variants from
   the API, omitting URLs that remain valid in its persistent cache.
2. The API verifies the active user, household membership, enabled Recipes
   setting, and confirmed recipe-scoped image under shared locks.
3. Outside the transaction, the API returns one-hour HMAC-signed Worker URLs
   containing only the variant and route-scoped IDs.
4. The Worker validates the method, fixed variant, IDs, expiry, and signature
   before consulting the edge cache.
5. On an edge-cache miss, the Worker reads the pre-generated derivative from
   its deterministic private R2 key and puts the response in edge cache. If an
   older image lacks that derivative, the Worker generates and stores it once
   as a lazy repair.
6. The browser receives the derivative with a private cache policy capped by
   the capability's remaining lifetime. The thumbnail appears immediately in
   the viewer and crossfades to the full viewer derivative when ready.

Invalid, expired, or changed capabilities fail closed. A missing original
returns `404`; a transformation or storage failure returns a generic `500` and
never falls back to exposing the original. Existing confirmed images require
no eager data migration because missing derivatives are repaired lazily.

Image deletion is idempotent. A short transaction authorizes and reads
metadata, the original and both derivatives are deleted from R2 without
database locks held, and a second
transaction reauthorizes and locks the row before hard-deleting its metadata.
If R2 deletion fails, metadata remains. If the database step fails after R2
deletion, retrying can finish cleanup. A transactional outbox may replace this
recovery policy if background jobs are introduced.

Deleting an image does not synchronously purge its content-addressed edge-cache
entry. The API stops issuing capabilities as soon as metadata is deleted, an
already-issued URL stops working after at most one hour because the Worker
authorizes before reading cache, and image UUIDs are never reused. The orphaned
cache entry then expires or is evicted without making the deleted image
reachable.

The R2 bucket permits `PUT` from
`https://home.achichorro.com` and `http://127.0.0.1:5173`, with
`Content-Type` allowed and `ETag` exposed. This restricted CORS policy does not
make the bucket public; each upload still requires a valid presigned URL.
Derivative reads go through the delivery Worker and do not require browser
CORS access to the original object.
