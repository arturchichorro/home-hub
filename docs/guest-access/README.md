# Guest access

**Status:** planned; not yet implemented

This document specifies accountless access to Home Hub for people who have a
household's QR code. It owns the product behavior, terminology, interface
composition, session model, authorization rules, data changes, and delivery
requirements for Guest access.

The current runtime boundaries remain in [Architecture](../architecture.md),
the current authentication and authorization invariants remain in
[Security and synchronization](../security-and-sync.md), and module-specific
behavior remains in the corresponding module documentation. Those canonical
documents must be updated when this specification is implemented.

## Purpose

People in a shared home should be able to scan a printed QR code and use the
household's shared tools without creating individual Home Hub accounts. The
initial motivation is a QR code displayed in a coliving kitchen that provides
access to Recipes, including recipe creation, editing, reordering, cooking
history, and pictures.

Guest access is scoped to a household rather than to one recipe collection or
one module. A household owner may create multiple Guest access links for the
same household. Each link has one household-wide access level: read or write.

## Terminology

Use the following terms in product copy and documentation:

- A **Guest access link** is an owner-managed permission to enter one
  household without an account. It has a name, read or write access, and an
  active or disabled state.
- A **QR code** is a visual encoding of a Guest access link. Multiple printed
  copies of one QR code remain one Guest access link; they are not independent
  permissions.
- A **Guest session** represents one browser or device that redeemed a Guest
  access link. Sessions are distinct even when they came from the same QR
  code.
- A **guest principal** is the trusted server-side identity derived from an
  active Guest session. An **account principal** is the existing identity
  derived from a signed-in user.

`Grant` or `capability` may be used as implementation and security terminology,
but neither should be the primary user-facing name.

## Product scope

### Guest access link

A Guest access link belongs to exactly one household and contains:

- an owner-defined internal name, such as `Kitchen QR`;
- a household-wide access level of `read` or `write`;
- an active or disabled state;
- one current, unguessable redemption secret;
- creation and update timestamps.

The internal link name helps the owner distinguish multiple QR codes. The
guest interface displays the household name and does not require a separate
public-facing name.

An owner may create multiple active links for one household. For example, a
household may have separate `Kitchen QR` and `Family QR` links even when both
currently provide write access to the same data. Keeping them separate allows
one group to be revoked without affecting the other and preserves a path to
future activity attribution.

Guest access does not create a household member, a synthetic user account, or
a special household type.

### Household and module scope

A Guest access link represents access to the household's shared feature
modules, not to household administration. The household's existing module
settings remain authoritative and are the only per-household module
configuration:

- disabling a module blocks it for account and guest principals;
- enabling a module does not bypass the requirement for its code to support
guest principals;
- there is no second set of guest-specific module toggles;
- a Guest access link cannot override a disabled module.

Guest support for another module is a deliberate code change to that module's
queries, mutations, routes, and navigation. Once a module becomes
guest-capable, every active Guest access link can reach it when it is enabled
for that household. This expansion must be called out during rollout because
existing QR codes will gain access without being reprinted or reconfigured.

Core household administration is never a shared feature module. A guest
principal cannot manage household names, members, invitations, ownership,
module settings, or Guest access links, regardless of whether its link has
write access.

### Read and write access

The access level applies across every guest-capable, enabled module:

- `read` permits synchronized queries and authorized media reads but rejects
  every mutation, upload, deletion, and administrative command;
- `write` permits the same ordinary module operations available to a
  household member, including creation, editing, reordering, uploads, and
  deletion;
- neither level permits household administration.

The interface hides or disables mutation controls for read access, but the API
and Zero mutation handlers enforce the access level independently. Changing a
link from write to read must prevent new writes immediately; authorization
must not rely only on claims captured in an older access token.

### Lifetime, disabling, and regeneration

The printed QR code has no application-level expiry. A Guest session remains
usable until one of the following happens:

- the owner disables its Guest access link;
- the owner regenerates the link's QR code;
- the owner changes or deletes the household in a way that removes access;
- the browser clears or evicts its local cookie;
- the session is explicitly revoked in a future management interface.

Browser limits may eventually evict a persistent cookie; scanning the still
active QR code again restores access.

Disabling a link blocks redemption and revokes all of its current Guest
sessions. Re-enabling it may allow the same printed QR code to create new
sessions, but previously revoked sessions do not become valid again.

Regenerating a link replaces its redemption secret and revokes every current
Guest session transactionally. The previous QR code remains permanently
invalid.

## User experience

### Owner management

Household settings contains an owner-only **Guest access** section. It allows
the owner to:

- list the household's Guest access links;
- create a link with an internal name and read or write access;
- display, copy, download, or print its QR code when the secret is issued;
- rename a link;
- change its read or write access;
- disable or re-enable it;
- regenerate its QR code after an explicit confirmation.

Raw redemption secrets are not stored in plaintext. Creation and regeneration
are therefore the only times the API returns the complete link. The interface
must tell the owner to print, download, or copy it then. If the owner later
loses it, regeneration produces a new QR code and invalidates the old one.

Guest access management remains available only to the current household
owner. It is an online-only operation.

### QR redemption

The public entry point is `https://guest.achichorro.com`. A QR code contains a
static link with a cryptographically random secret of at least 32 bytes. The
secret must be encoded without ambiguous characters and must be impractical to
enumerate or guess.

Prefer placing the secret in the URL fragment, for example:

```text
https://guest.achichorro.com/join#<secret>
```

Fragments are not sent in the initial HTTP request or in the `Referer` header.
The client reads the fragment, exchanges the secret through a request body,
and immediately removes it from the visible URL and browser history with
`history.replaceState`. Redemption secrets must never be placed in analytics,
application logs, error reports, or persisted browser storage.

Successful redemption:

1. validates the hashed secret and the active link;
2. creates a distinct Guest session for that browser;
3. sets a host-only `Secure`, `HttpOnly`, `SameSite=Lax` session cookie on
   `guest.achichorro.com`;
4. issues the short-lived bearer token required by the web client and Zero;
5. redirects to the clean guest application URL.

An invalid, disabled, or regenerated link shows a generic unavailable-link
screen. It must not reveal whether the household exists or which validation
failed.

### Guest shell and shared module interfaces

Guest access does not introduce separate guest versions of Recipes or other
modules. The web application has two shells which compose the same module
interfaces:

```text
Authenticated shell --+
                      +-- Shared module interfaces
Guest shell ----------+      |-- Recipes
                             `-- future guest-capable modules
```

The authenticated shell continues to own account controls, household
switching, household settings, membership management, and Guest access
management.

The guest shell contains only:

- the household name;
- navigation for enabled, guest-capable modules;
- the shared module content;
- an action to leave or clear Guest access.

Feature components consume a normalized access context instead of branching
on `isGuest` throughout the component tree. At minimum that context supplies:

```ts
type ModuleAccessContext = {
  householdId: string;
  accessToken: string;
  cacheIdentity: string;
  canWrite: boolean;
  onSessionExpired: () => void;
};
```

The exact type may evolve during implementation, but module components should
normally depend on capabilities such as `canWrite`, not on the principal kind.
Authentication-specific behavior belongs in the application shells and
session providers.

Read-only behavior combines with the existing connectivity policy. A control
may mutate only when both the current access context permits writes and Zero's
connection state permits writes.

Thin authenticated and guest route files may render the same feature
components. This small routing duplication is acceptable; feature interface
implementations, editors, galleries, and lists must not be copied.

### Multiple links and devices

Every redemption creates a separate Guest session even when two devices scan
the same QR code. The first version does not show guest identities or an
activity log, but session separation must leave room for future session
listing, selective revocation, device labels, and optional authorship.

The first version may keep one current Guest session per browser profile.
Scanning a different household's QR code may replace the active Guest session;
remembering and switching among multiple guest households is deferred.

## Authentication and authorization

### Principal model

Trusted server context becomes a discriminated principal rather than an
unconditional `userId`:

```ts
type AccessPrincipal =
  | { kind: "account"; userId: string }
  | {
      kind: "guest";
      guestSessionId: string;
      guestAccessLinkId: string;
      householdId: string;
      access: "read" | "write";
    };
```

The structure shown is conceptual. Mutable fields such as household, access
level, active state, and enabled modules must be re-established from
PostgreSQL at authorization time rather than trusted indefinitely from a JWT.

Existing account access continues to require current household membership.
Guest access requires all of the following:

- the Guest session exists and is not revoked;
- its Guest access link exists and is active;
- the link belongs to the household addressed by the operation;
- the requested module is enabled for the household;
- the module operation explicitly supports guest principals;
- a mutation additionally requires the link's current access level to be
  `write`;
- every referenced entity belongs to that same household and remains active.

Foreign household and entity identifiers remain indistinguishable from
missing identifiers. Client-supplied household IDs, access modes, principal
kinds, link IDs, and session IDs are untrusted.

### Guest sessions and bearer tokens

The raw QR secret is used only to create a Guest session. Subsequent requests
use that session; they do not repeatedly transmit the QR secret.

Store only cryptographic hashes of QR and Guest-session secrets. Use separate
domain separation or signing configuration from recipe-image capabilities and
account passwords. Guest session cookies are inaccessible to browser
JavaScript. The browser keeps short-lived access JWTs in memory and refreshes
them through the guest cookie, following the same broad separation used by
account sessions.

Guest access JWTs must be unambiguously distinguishable from account JWTs and
must not be accepted as account identities. They contain only stable identity
claims needed to locate and validate the Guest session. They do not contain a
trusted household access level or enabled-module list.

Guest-session refresh must preserve immediate revocation. A disabled or
regenerated link, revoked session, deleted household, or otherwise invalid
session receives a generic `401`, clears the cookie, and closes the guest
client.

CSRF protection relies on the narrow guest-cookie path, host-only cookie,
`SameSite=Lax`, and the rule that the cookie only obtains an in-memory bearer
token. State-changing module operations require that bearer token and do not
authenticate directly from the cookie.

### Zero synchronization

Guest module screens continue to use Zero rather than introducing a parallel
REST data layer. Each Guest session supplies a stable, namespaced Zero
`userID` and browser cache identity that cannot collide with account user IDs.

Named queries and custom mutators accept trusted principal context. Account
principals retain the current membership checks. Guest principals use the
Guest-session and Guest-access-link checks above. Recipe query shapes and
optimistic mutations remain shared after authorization is established.

The client must not send an account `userId` as the authority for guest
operations. Existing web properties named `userId` but used only as local
cache namespaces, including recipe-image URL caches, should be generalized to
`cacheIdentity` or another principal-neutral name.

Changing a link's access level, disabling a module, disabling or regenerating
the link, and revoking the session must take effect without clearing a Zero
cache manually. Cached rows may remain visible under the established offline
read policy, but server queries, mutations, uploads, and newly signed media
reads fail closed. A server `401` terminates the session and clears its local
bootstrap data.

### Recipe images

The existing direct-to-R2 upload and signed derivative-read design remains in
place. Image routes authorize an account or guest principal through the same
recipe and household boundary. Guest reads require read access; uploads and
deletions require write access.

The R2 upload CORS allowlist must include
`https://guest.achichorro.com`. No R2 credentials, object keys, originals, or
arbitrary transformations become public through Guest access.

Signed derivative capabilities remain short-lived. A link or session revoked
after a URL was issued cannot retract bytes already delivered and may leave
the issued derivative URL usable until its existing expiry, currently at most
one hour. This bounded window is accepted consistently with account access.

## Persisted data

Names are illustrative and should be finalized with the migration.

### `household_guest_access_links`

- `id`
- `household_id`
- `name`
- `access`: `read` or `write`
- `token_hash`
- `disabled_at`, nullable
- `created_by_user_id`
- `created_at`, `updated_at`

Requirements:

- token hashes are unique;
- names need not be unique within a household;
- the creator is historical metadata and does not replace the owner check;
- only the current household owner may create or manage a link;
- regeneration replaces `token_hash` and revokes sessions in one transaction;
- disabling revokes sessions in one transaction;
- changing `access` is serialized with authorization-sensitive management
  changes.

### `household_guest_sessions`

- `id`
- `guest_access_link_id`
- `token_hash`
- `revoked_at`, nullable
- `created_at`, `updated_at`

Token hashes are unique. Session identity is stable for Zero and future audit
work even if the opaque cookie token rotates. There is no user identity,
display name, device fingerprint, or authorship field in the first version.

The first version does not need an owner-facing session list or selective
session revocation.

## Recoverable Recipes deletion

Write-capable guests receive the full ordinary Recipes interface, including
destructive actions. To keep account and guest behavior identical and make
mistakes recoverable, every confirmed Recipes entity becomes soft-deletable.

The existing `recipes.deleted_at` behavior remains. Add `deleted_at` to:

- `recipe_ingredients`;
- `recipe_cook_logs`;
- `recipe_images`.

All active queries, mutations, reorder calculations, image upload checks,
image read authorization, and uniqueness assumptions must consistently ignore
soft-deleted rows where appropriate. Deleted child identifiers cannot be
mutated or used to authorize new uploads.

Deleting a confirmed image marks its row deleted and retains the original and
stored derivatives in private R2. Deleting a cooking entry retains its image
relationships so manually restoring the entry restores its context; its
images remain available in the recipe's general gallery while the cooking
entry is deleted. Abandoned, never-confirmed uploads may still be removed by a
separate cleanup policy because they are not established user content.

There is no recycle-bin or restoration interface in the first version.
Recovery is a deliberate manual PostgreSQL operation performed by the owner.
Deleted data and confirmed image objects are retained indefinitely until a
separate retention and purge feature is designed.

## Web routing and deployment

`guest.achichorro.com` serves the same compiled React application as
`home.achichorro.com`. A distinct workspace application or shared feature
package is not introduced merely for Guest access.

Caddy must:

- obtain and renew TLS for the guest hostname;
- serve the existing SPA and navigation fallback;
- proxy guest API requests and Zero HTTP/WebSocket traffic on the guest
  origin;
- prevent redemption secrets from appearing in access logs;
- retain the current static-asset caching behavior.

Using the same origin for the guest SPA, guest-session endpoints, and Zero
proxy avoids broad cross-origin credential rules. Guest cookies remain
host-only and are never sent to `home.achichorro.com`.

The web application selects the appropriate root shell from the trusted
deployment hostname. Host selection controls presentation and session
bootstrap only; the API principal and authorization checks remain the security
boundary.

Production DNS, Caddy configuration, environment examples, health checks, and
deployment verification must include the guest hostname before release.

## Security and abuse boundaries

A Guest access link is a bearer credential. Anyone who can see, photograph,
or receive the QR code may redeem it from anywhere on the internet. This is
intentional for the coliving use case.

The design mitigates accidental exposure without pretending to identify the
guest:

- use an unguessable secret rather than a human-sized code;
- store only token hashes;
- keep the secret out of request URLs, logs, referrers, and browser storage;
- exchange it for a device-specific session;
- allow immediate household-owner disablement and regeneration;
- authorize every read and write at the household and entity boundary;
- enforce read-only access on the server;
- rate-limit redemption attempts and image-upload authorization;
- retain existing image type and size limits;
- never expose household administration through a guest principal.

The first version accepts that a person may intentionally share the QR code,
that guests are anonymous, and that all devices using one link share its
read/write level. It does not attempt proximity checks, home-Wi-Fi checks,
device fingerprinting, per-person attribution, moderation, or approval queues.

## Delivery outline

Implementation should proceed in reviewable phases:

1. Add soft deletion to confirmed Recipe child entities and update all Recipe
   queries, mutators, image services, and tests.
2. Add Guest access link and Guest session tables, contracts, owner-only
   management services, and transactional disable/regeneration behavior.
3. Introduce the discriminated server principal and adapt Recipes queries,
   mutations, and image authorization without weakening account membership
   checks.
4. Add redemption, guest-cookie refresh, logout, and guest bearer-token
   handling.
5. Generalize the web access context and Zero cache identity, then compose the
   existing Recipes components under the guest shell.
6. Add Household settings management, QR rendering, copying, download, and
   printing.
7. Add the guest hostname, same-origin API and Zero proxying, R2 CORS entry,
   production configuration, and release verification.
8. Update the canonical architecture, security, data-model, deployment,
   product, and Recipes documents to describe the implemented system.

## Acceptance criteria

The feature is complete when all of the following hold:

- an owner can create multiple read or write Guest access links for a
  household;
- the creation and regeneration result can be copied, downloaded, and printed
  as a working QR code;
- two devices scanning one QR code receive distinct Guest sessions;
- reloading the guest site restores its session without an account login;
- a guest sees the household name and the same Recipes interfaces used by an
  account member, inside the reduced guest shell;
- a write guest can perform every ordinary Recipes operation, including image
  upload and recoverable deletion;
- a read guest cannot mutate through either the interface or crafted API and
  Zero requests;
- a guest cannot read or mutate another household by changing route, query,
  mutation, recipe, image, link, or session identifiers;
- a guest cannot access household settings, membership, invitations,
  ownership, module configuration, or Guest access management;
- disabling Recipes blocks its guest queries, mutations, uploads, and newly
  signed image reads;
- disabling or regenerating a Guest access link revokes every existing Guest
  session, and the previous QR fails after regeneration;
- changing a link from write to read blocks subsequent writes without waiting
  for a long-lived token to expire;
- raw QR and Guest-session secrets are absent from PostgreSQL, application and
  proxy logs, browser storage, and error reports;
- deleting established Recipe content removes it from active views without
  physically deleting its database record or confirmed image objects;
- authenticated account behavior and household membership isolation continue
  to pass their existing tests;
- the same production web build works at both the account and guest hostnames.

## Deferred work

- named guest identities and authorship;
- owner-visible activity history;
- listing and selectively revoking Guest sessions;
- remembering and switching between multiple guest households in one browser;
- per-link module selection or per-module access levels;
- expiry dates and scheduled access windows;
- one-time or limited-use links;
- guest-specific moderation or approval workflows;
- recycle-bin and restoration interfaces;
- automated retention and permanent purge;
- local-network or physical-proximity restrictions.
