# Guest access

**Status:** implemented

This document specifies accountless access to Home Hub for people who possess
a household's Guest access link. It replaces the earlier device-session design:
Guest access links are used directly as scoped bearer credentials. There are no
Guest-session rows, Guest cookies, Guest JWTs, redemption flow, refresh flow, or
server-side Guest logout in this version.

The current runtime boundaries remain in [Architecture](../architecture.md),
the current authorization invariants remain in
[Security and synchronization](../security-and-sync.md), and module-specific
behavior remains in the corresponding module documentation. Those canonical
documents must be reconciled when this revision is implemented.

## Purpose

People in a shared home should be able to scan a printed QR code and use the
household's shared tools without creating individual accounts. The initial use
case is a QR code displayed in a coliving kitchen that provides access to
Recipes, including recipe creation, editing, reordering, cooking history, and
pictures.

Guest access is scoped to one household rather than to one recipe collection
or module. A household owner may create multiple Guest access links. Each link
has one household-wide access level, an expiration date, and its own revocable
secret.

## Terminology

- A **Guest access link** is an owner-managed, expiring permission to enter one
  household without an account. It has a name, read or write access, an
  expiration instant, and an active or disabled state.
- A **QR code** is a visual encoding of a Guest access link. Multiple printed
  copies of one QR remain one permission and share one credential.
- A **guest actor** is the anonymous requester authenticated by a valid Guest
  access link. It is not a user, household member, or browser session.
- An **account actor** is an authenticated Home Hub account.
- An **access scope** is the server-derived household and read/write permission
  attached to the current request.

There is no Guest-session concept in this version. `Grant`, `capability`, and
`bearer credential` may be used as implementation or security terminology, but
the product calls the owner-managed object a Guest access link.

## Product model

### Guest access link

A Guest access link belongs to exactly one household and contains:

- an owner-defined internal name, such as `Kitchen QR`;
- a household-wide access level of `read` or `write`;
- one cryptographically random secret;
- a required expiration timestamp;
- an optional disabled timestamp;
- creator, creation, and update metadata.

An owner may create multiple links for one household. Separate `Kitchen QR`
and `Family QR` links can therefore be disabled, regenerated, or extended
independently.

Guest access does not create a household member, synthetic user, special
household type, or device record. Everyone using copies of one QR shares the
same credential and anonymous authority. Individual attribution and
device-specific revocation are intentionally absent.

### Expiration

Every Guest access link has `expiresAt`; expiration is not optional.

- Creating a link without an explicit expiration uses a server-side default
  of exactly 90 days from creation. Product copy may describe this as “about
  three months”.
- The owner may choose another future date and time during creation or edit it
  later. Version one has no configurable maximum lifetime.
- The API accepts only a timestamp strictly in the future when creating or
  updating a link.
- The server stores and compares timestamps in UTC. The interface displays
  them in the viewer's local time zone.
- A link expires at the exact instant `expiresAt <= serverNow`. There is no
  grace period.
- Expiration, manual disabling, household deletion, and module disabling are
  independent checks. A link is usable only when all relevant checks pass.
- Disabling and re-enabling a link does not change its expiration.
- Regenerating the secret does not change its expiration.
- An owner may extend an expired link by setting a future expiration. If the
  link is not disabled, the same printed QR becomes valid again. Regeneration
  remains available when the owner wants existing copies to remain invalid.

The management interface distinguishes `Active`, `Expires soon`, `Expired`,
and `Disabled`. `Expires soon` is presentation only and means the expiration is
within 14 days; it does not alter authorization.

### Disabling and regeneration

Disabling a link rejects its credential immediately. Re-enabling it restores
the same QR only if it has not expired.

Regenerating replaces the stored token hash. The old QR becomes invalid
immediately and permanently. Because there are no device sessions, no session
records need to be revoked. Every device using the old credential fails on its
next server interaction.

### Household and module scope

A Guest access link represents access to the household's shared feature
modules, not household administration. Existing household module settings are
the only module configuration:

- disabling a module blocks it for account and guest actors;
- enabling a module does not make it Guest-capable automatically;
- each module must explicitly implement Guest query, mutation, route, media,
  and navigation authorization;
- there are no Guest-specific module toggles in version one;
- a link cannot override a disabled module.

Recipes is the only Guest-capable module initially. Adding another
Guest-capable module expands every valid link for households where that module
is enabled, so such a change requires an explicit product and security review.

A guest actor can never manage the household name, members, invitations,
ownership, module settings, or Guest access links.

### Read and write access

The link's access level applies to every enabled, Guest-capable module:

- `read` permits authorized synchronized queries and media reads, but rejects
  every mutation, upload, deletion, and administrative command;
- `write` permits ordinary module operations available to a household member,
  including creation, editing, reordering, uploads, and recoverable deletion;
- neither level permits household administration.

The interface reflects read-only access, but API routes and authoritative Zero
mutators enforce it independently. Changes from write to read take effect on
the next server request because permission is loaded from PostgreSQL each time.

## Credential and URL behavior

### QR URL

The public entry point is `https://guest.achichorro.com`. A QR contains at
least 32 cryptographically random bytes encoded as base64url:

```text
https://guest.achichorro.com/join#<secret>
```

The secret remains in the URL fragment. It must never be put in a query
parameter or path segment. A fragment is visible to the browser and browser
JavaScript but is not sent in the initial HTTP request, ordinary proxy access
logs, or the `Referer` header.

The Guest application reads the fragment and explicitly presents it to Home
Hub APIs. Guest navigation preserves the fragment, for example:

```text
https://guest.achichorro.com/recipes#<secret>
https://guest.achichorro.com/recipes/<recipe-id>#<secret>
```

This provides reload, bookmark, and deliberate link-sharing behavior without
cookies or browser storage. The raw secret must not be copied into
`localStorage`, `sessionStorage`, IndexedDB, analytics, application logs, error
reports, or generated cache identifiers.

The URL fragment is intentionally shareable. Anyone who sees the QR, receives
the URL, inspects the address bar, or obtains it through a compromised browser
can exercise the link until it expires, is disabled, or is regenerated. This
is the explicit capability-link product model, not a claim of personal
identity or physical proximity.

### Authentication header

Account and Guest credentials use unambiguous schemes:

```http
Authorization: Bearer <account-jwt>
Authorization: Guest <guest-link-secret>
```

Account-only middleware accepts only `Bearer`. Shared-module and Zero
middleware accepts `Bearer` or `Guest` and resolves both to a trusted
`RequestAccess`. A Guest credential must never be accepted by account,
household-administration, membership, invitation, module-settings, or
Guest-link-management endpoints.

The raw Guest secret is hashed with a Guest-link-specific domain before
lookup. Only the hash is stored. Authorization reloads the link, household,
expiration, disabled state, current permission, and requested module setting
from PostgreSQL for every server request.

Invalid, unknown, disabled, expired, regenerated, and deleted-household links
return the same generic `401 Unauthorized` response. Responses must not reveal
which validation failed.

### Application-boundary authentication

Authentication is mounted by the API application before feature routers:

```text
API application
  |-- account-only routes -> account authentication
  |-- shared module routes -> account-or-Guest authentication -> feature router
  `-- Zero routes          -> account-or-Guest authentication
```

Feature routers such as Recipes do not construct authentication and do not
receive a database, JWT secret, or authentication middleware. Their handlers
consume the already established request-access context and pass it to domain
services.

Conceptually:

```ts
type RequestAccess =
  | { actor: { kind: "account"; accountId: string } }
  | {
      actor: { kind: "guest"; guestAccessLinkId: string };
      householdScope: {
        householdId: string;
        permission: "read" | "write";
      };
    };
```

The household scope belongs to the request's trusted authorization context,
not to the guest actor's identity. Client-supplied actor kinds, link IDs,
household IDs, and permissions are untrusted.

### Leaving Guest access

There is no Guest logout API. “Leave Guest access” removes the fragment from
the address bar, clears in-memory Guest state and signed-image URL metadata,
and navigates to the Guest entry screen. It cannot invalidate other copies of
the same QR; only owner disablement, expiration, or regeneration can do that.

## User experience

### Owner management

Household settings contains an owner-only **Guest access** section that lets
the owner:

- list Guest access links with access level, expiration, and status;
- create a link with a name, read/write access, and expiration defaulting to
  90 days;
- display, copy, download, or print the QR when its secret is issued;
- show the expiration date on the printable QR card;
- rename a link;
- change read/write access;
- extend or shorten its expiration;
- disable or re-enable it;
- regenerate its QR after explicit confirmation.

Raw secrets are not stored in plaintext. Creation and regeneration are the
only times the API returns the complete link. If the owner loses the QR,
regeneration creates a new one. Extending expiration does not require
reprinting because it preserves the credential.

Guest access management is online-only and restricted to the current
household owner.

### Guest entry and shell

Opening a Guest URL validates the credential online and loads a small Guest
context containing the link's non-secret ID, household ID and name, current
permission, expiration, and enabled Guest-capable modules. This is an ordinary
authenticated read, not redemption; it creates no session or cookie.

The guest shell shows:

- the household name;
- the expiration date;
- navigation for enabled, Guest-capable modules;
- shared module content;
- a local “Leave Guest access” action.

An unavailable or expired link shows one generic unavailable-link screen.
When the client reaches its known expiration time, it stops presenting the
shared interface locally; the server remains authoritative.

Guest access does not create separate Guest versions of Recipes. Thin account
and Guest route adapters render the same `RecipeLibrary`, `RecipeDetail`,
editors, galleries, and dialogs with explicit access and navigation inputs.
Small route-level composition differences are acceptable; feature interface
implementations must not be duplicated.

## Zero synchronization

Guest module screens continue to use Zero. Because Zero Cache forwards auth
using `Bearer`, the client gives Zero an internal `guest-v1.<secret>` envelope.
Only the Zero application boundary unwraps that envelope into the same direct
Guest credential resolution used by shared module routes; it is never accepted
by account-only routes.

After validation, the server uses a stable namespaced identity such as
`guest-link:<link-id>` for Zero and browser-cache partitioning. The client must
never use the raw secret as a cache identifier. Account actors retain current
membership checks; guest actors use the link and household scope described
above. There is no synthetic Guest `userId`.

Changing access, expiration, disabled state, module settings, household state,
or token hash takes effect on the next query or mutation. Authoritative
mutations re-check current state inside their transaction. A validly issued
signed image URL may remain usable until its own short expiry.

If connectivity is lost while an already validated Guest application is open,
Zero-cached rows may remain visible and mutation controls become read-only.
An offline hard reload does not reopen Guest access in version one because the
application cannot validate the link or recover its non-secret cache identity
without contacting the API. The raw credential is never persisted merely to
support offline startup.

## Recipe authorization and recoverable deletion

Recipes queries, mutators, image authorization, and entity lookups must all
require:

- a current account membership or valid Guest link;
- the operation's household to match the resolved household scope;
- Recipes to be enabled and explicitly Guest-capable;
- write permission for mutations, uploads, reorder operations, and deletions;
- every referenced recipe, ingredient, cooking log, and image to be active and
  scoped to the same household.

Foreign identifiers are indistinguishable from missing identifiers. The R2
upload CORS allowlist includes `https://guest.achichorro.com`. No R2
credentials, object keys, originals, or arbitrary transformations become
public.

Write-capable guests receive ordinary recoverable deletion. `recipes`,
`recipe_ingredients`, `recipe_cook_logs`, and confirmed `recipe_images` use
soft deletion. Active queries, reorder calculations, mutation checks, upload
authorization, and image reads consistently ignore deleted rows. Confirmed
objects remain private in R2 for manual recovery until a separate retention
policy is implemented.

## Persisted data

### `household_guest_access_links`

- `id`
- `household_id`
- `name`
- `access`: `read` or `write`
- `token_hash`, unique
- `expires_at`, non-null
- `disabled_at`, nullable
- `created_by_user_id`
- `created_at`, `updated_at`

There is no `household_guest_sessions` table in this design.

The creator is historical metadata and does not replace the current-owner
check. Names need not be unique within a household. Access, expiration,
disablement, and regeneration updates are serialized with authorization so a
concurrent request cannot commit using stale authority after the management
change commits.

## Routing and deployment

`guest.achichorro.com` serves the same compiled React application as the
account hostname. Application mode is selected from trusted deployment
configuration or hostname, not inferred from arbitrary URL paths.

Caddy must serve the SPA, proxy API and Zero traffic, retain static-asset
caching, and ensure authorization headers are redacted from logs. The fragment
never reaches Caddy. No cross-origin Guest cookie rules are required because
there is no Guest cookie.

The direct-to-R2 upload CORS policy includes the Guest origin. Production DNS,
TLS, health checks, deployment verification, and environment examples include
the Guest hostname.

## Security and abuse boundaries

The credential is intentionally usable by anyone who possesses it, from any
location, until it expires, is disabled, or is regenerated. A write link can be
scripted to perform the same ordinary module writes allowed through the UI;
this is inherent to granting write access and is not prevented by wrapping the
link in a device session.

The design mitigates accidental exposure by:

- using a 256-bit unguessable secret;
- storing only a domain-separated hash;
- carrying the secret in a fragment rather than a query or path;
- never persisting the raw secret outside the visible Guest URL;
- separating `Bearer` account credentials from `Guest` credentials;
- allowing immediate disablement and regeneration;
- expiring links by default after 90 days;
- authorizing every operation against current database state;
- enforcing household, module, entity, and read/write boundaries server-side;
- retaining image type and size limits;
- never accepting Guest credentials for administration.

The version-one API does not implement a process-local Guest redemption or
upload rate limiter. High-entropy credentials are not practically protected by
such a limiter, and generic flooding belongs at Cloudflare or Caddy. A future
product-level write or storage quota should be designed from explicit abuse
requirements rather than treated as authentication.

The first version does not attempt personal identity, attribution, proximity,
home-Wi-Fi enforcement, device fingerprinting, per-device revocation,
moderation, or approval queues.

## Implementation plan

Implement this revision in the following reviewable commits. Complete and
verify each step before starting the next.

### Step 1: Align persistence and shared contracts

- Add required `expires_at` to Guest access links and backfill existing rows
  with migration time plus 90 days.
- Add expiration to link summaries, create/update requests, and the new direct
  Guest-context response.
- Define the server-side 90-day default and future-timestamp validation.
- Update database, contract, migration, and serialization tests.

### Step 2: Simplify link management

- Update owner services and routes to create, list, edit, disable, extend, and
  regenerate expiring links.
- Preserve expiration during disablement and regeneration.
- Remove transactional session revocation because sessions no longer exist.
- Test default expiration, custom expiration, expiry edits, disable/re-enable,
  regeneration, ownership, and generic failures.

### Step 3: Establish application-boundary Guest authentication

- Add strict parsing for `Bearer <account-jwt>` and `Guest <link-secret>`.
- Resolve Guest credentials by hash and load current link, expiration,
  household, permission, and household state.
- Mount account-or-Guest authentication before Recipe and Zero routers in the
  application composition layer.
- Keep account-only middleware on all administrative routes.
- Remove authentication construction and middleware injection from feature
  route factories and their unit tests.
- Test credential-scheme separation and prove Guest credentials fail on every
  administrative surface.

### Step 4: Remove the device-session system

- Delete Guest redeem, refresh, and logout endpoints and services.
- Delete the Guest-session table, relations, and response contracts together
  with their final consumers.
- Delete Guest cookies, Guest JWT issuance, Guest JWT subject handling, session
  token hashing, and session bootstrap code.
- Remove the process-local rate limiter introduced for redemption and uploads.
- Add one authenticated Guest-context read that returns only non-secret shell
  metadata after validating the current link.
- Confirm no removed credential can still authenticate through compatibility
  fallbacks.

### Step 5: Adapt Zero and transactional authorization

- Pass the direct Guest credential as Zero auth.
- Use `guest-link:<link-id>` as the stable server and browser cache identity.
- Keep Guest context free of synthetic account IDs.
- Re-check expiration, disablement, current permission, module enablement, and
  entity scope for authoritative mutations and image operations.
- Add concurrency tests for expiration/disablement or permission changes racing
  writes.

### Step 6: Implement fragment-preserving Guest routing

- Read the credential from `window.location.hash` without persisting it.
- Preserve the fragment across Guest library/detail navigation and reloads.
- Validate online before entering the Guest shell.
- Implement local Leave by removing the fragment and clearing in-memory and
  signed-image cache state.
- Remove Guest offline bootstrap; retain read-only behavior only when an
  already open client becomes disconnected.
- Test joining, deep links, refreshes, deliberate URL sharing, invalid links,
  expiration while open, and Leave.

### Step 7: Keep one Recipes interface

- Keep account and Guest shells separate but compose the same Recipes feature
  components through thin, explicit route adapters.
- Pass normalized household, credential, cache identity, permission, and
  navigation inputs without a parallel Guest implementation.
- Keep Recipe feature routers and components unaware of credential parsing.
- Verify read-only presentation and server enforcement independently.

### Step 8: Add expiration management and QR presentation

- Default creation controls to 90 days and allow a future custom expiration.
- Show local-time expiration and Active/Expires soon/Expired/Disabled status.
- Allow owners to edit expiration independently of disablement and
  regeneration.
- Include the expiration date on the printable QR card.
- Ensure regenerated QR output uses the configured Guest application origin.

### Step 9: Remove obsolete architecture and verify release boundaries

- Delete dead session schema, services, routes, tests, configuration, and
  terminology.
- Update architecture, security, data-model, deployment, product, and Recipes
  documentation to match this specification.
- Verify migration generation, formatting, every workspace typecheck and test,
  the production web build, account behavior, Guest hostname routing, Zero,
  R2 CORS, and production health checks.

## Acceptance criteria

- An owner can create multiple read or write Guest access links per household.
- A new link defaults to expiring exactly 90 days after server-side creation.
- Owners can choose or edit a future expiration and see it on the QR printout.
- Expired links fail every Guest-context, Zero, Recipe, image-read, and image-
  write request with the generic unauthorized response.
- Extending an otherwise active expired link makes the same QR usable again;
  regenerating makes every previous copy permanently invalid.
- Reloading or bookmarking a Guest URL works while its fragment credential is
  valid, without a cookie, stored token, account, or Guest session.
- The raw secret is absent from PostgreSQL, query strings, HTTP paths, proxy
  logs, application logs, browser storage, cache identifiers, and error reports.
- Account-only endpoints reject Guest credentials regardless of link access.
- A Guest is confined to its resolved household, enabled Guest-capable modules,
  current read/write permission, and active entity boundaries.
- Read links cannot mutate through crafted API or Zero requests.
- Write links can use the ordinary Recipes interface, including images and
  recoverable deletion.
- Account and Guest routes render the same Recipes feature implementation.
- Disconnection makes an open Guest client read-only; an offline hard reload
  does not reopen Guest access.
- The same production web build works at account and Guest hostnames.

## Deferred work

- named Guest identities and authorship;
- activity history and attribution;
- per-device sessions, device labels, and selective device revocation;
- per-link module selection or per-module access levels;
- scheduled start times or recurring access windows;
- one-time or limited-use links;
- storage or write quotas based on explicit abuse requirements;
- Guest-specific moderation or approval workflows;
- recycle-bin and self-service restoration;
- automated retention and permanent purge;
- local-network or physical-proximity restrictions.
