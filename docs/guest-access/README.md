# Guest access

**Status:** implemented in the Guest-access PR stack; production rollout follows review and merge.

This document specifies accountless access to a household through a QR code.
The first version deliberately uses one small model: an expiring Guest access
link is the credential, and Guest mode is the existing household application
without household administration.

## Product behavior

A household owner can create multiple Guest access links. Each link:

- belongs to exactly one household;
- has a name chosen when it is created;
- grants either read or write access;
- has an expiration chosen when it is created, defaulting to exactly 90 days;
- has one unguessable secret; and
- can be permanently disabled.

The name, access level, expiration, and secret cannot be changed after
creation. A disabled or expired link cannot be restored. The owner creates a
new link when a replacement is needed.

Everyone using copies of one QR code shares one credential. Guest access does
not create a user, household member, browser session, device record, identity,
or authorship record.

### Scope

A valid Guest access link grants access to every module enabled for its
household. The same access level applies to all of them:

- `read` permits viewing module data and media;
- `write` permits the ordinary module operations available to a household
  member, including creation, editing, reordering, uploads, and recoverable
  deletion.

Lists and Recipes must both support Guest access in the first release. A new
module is not complete until its queries, mutations, APIs, media operations,
and interface work for Guest access. Disabling a module for the household
blocks it for members and Guests without deleting its data.

Household administration is not a module and is never available to Guests.
Guests cannot manage:

- the household name;
- members, invitations, or ownership;
- module settings; or
- Guest access links.

## Owner interface

Household settings contains an owner-only **Guest access** section. It allows
the owner to:

- list links with their name, access level, expiration, and status;
- create a named read or write link;
- choose its initial expiration, with 90 days as the default;
- display, copy, download, or print its QR code when it is created; and
- permanently disable an active link.

The complete secret is returned only when the link is created because only
its hash is stored. If the owner loses the QR code, or if the link expires or
is disabled, the owner creates another link.

## Guest interface

Guest mode uses the existing household application, routes, and module
components. It is not a separate Recipes application and does not have
separate Guest versions of Lists or Recipes.

After a QR code is opened, the application validates the credential, learns
the associated household and access level from the server, and opens that
household's normal application routes, for example:

```text
/households/:householdId/lists
/households/:householdId/recipes
```

The application shell adapts to the current kind of access:

- a member can switch households and use household settings;
- a Guest is fixed to the link's household;
- the Guest sidebar shows every enabled module;
- account and household-administration controls are hidden; and
- the shell shows that access is temporary and provides a Leave action.

`/join` is the only Guest-specific application route. Module routes and
interfaces are shared. Read-only interfaces hide or disable mutation controls,
but the server remains authoritative.

Leaving removes the credential from memory and the address bar and returns to
the Guest entry screen. It does not disable the link for other people.

## Credential

The QR code contains a URL such as:

```text
https://guest.achichorro.com/join#hhg_v1_<random-secret>
```

The random part contains at least 32 bytes of cryptographically secure random
data encoded as base64url. The `hhg_v1_` prefix identifies the credential
format; it is not a separate wrapper used only by one transport.

The fragment is available to the application but is not sent in the initial
HTTP request or ordinary `Referer` headers. The application keeps the
credential in the fragment and memory so that reloads, bookmarks, and
intentional sharing work. It must not copy the credential into cookies,
`localStorage`, `sessionStorage`, IndexedDB, analytics, logs, error reports, or
cache identifiers.

Anyone who obtains the QR code or URL has its access until it expires or is
disabled. This is the intended product model.

## Authentication and authorization

Account and Guest requests use the same HTTP authentication format:

```http
Authorization: Bearer <credential>
```

An account credential is the existing account JWT. A Guest credential begins
with `hhg_v1_`. Ordinary APIs and Zero receive exactly the same credential;
there is no `Guest` authorization scheme, Guest JWT, exchange step, session
cookie, refresh flow, or Zero-specific credential envelope.

Authentication happens once at the API application boundary. It establishes
whether the request comes from an account user or a Guest access link. Feature
routers consume that established result and do not construct authentication
middleware or receive authentication configuration.

For every Guest request, the server uses the credential hash to load the link
and derives its household, access level, expiration, and disabled state from
PostgreSQL. Client-provided household IDs and permissions are never trusted.
An active link is valid only when:

- its hash matches the presented credential;
- it has not expired;
- it has not been disabled;
- its household has not been deleted; and
- the requested module is enabled for that household.

Account-only household-administration endpoints reject Guest access. Shared
module queries, APIs, media operations, and Zero mutations authorize the
current account membership or Guest link before accessing household data.
Write authorization is checked inside the same database transaction as a
mutation when concurrent disabling could otherwise permit a late write.

Invalid, expired, and disabled credentials return the same generic
unauthorized response.

## Zero and browser caching

Zero uses the same Bearer credential and shared module authorization as other
requests. Its client context may identify the household being opened, but the
server verifies that household against current database state.

Guest mode uses the application's normal Zero cache behavior and a stable,
non-secret cache identity derived from the Guest link ID. The raw credential
must never be a cache identity.

Expiration or disabling prevents the application from reopening Guest mode
and prevents further server operations. As with other offline-capable web
applications, data already downloaded may remain in the browser's local
storage until the browser clears it. Version one does not attempt remote or
secure erasure of browser caches, and the application does not expose a Guest
cache without first validating the credential.

## Data model

The feature requires one table:

```text
household_guest_access_links
  id uuid primary key
  household_id uuid references households(id)
  name text
  access read | write
  token_hash text unique
  expires_at timestamptz
  disabled_at timestamptz nullable
  created_by_user_id uuid references users(id)
  created_at timestamptz
```

There is no Guest-session table. The link has no `updated_at` because its
configuration is immutable after creation.

The implementation must introduce one migration that creates this final
schema directly. It must not preserve abandoned create-session,
add-expiration, or drop-session migrations from earlier prototypes.

## Delivery plan

Implementation is delivered as a small stack of reviewable pull requests,
each based on the previous one. Foundation PR #34 is merged; the remaining
PRs stay open for review:

1. **Guest-link foundation**
   - Add the final table and one migration.
   - Add credential generation, hashing, validation, and owner-only create,
     list, and disable APIs.
2. **Unified authorization**
   - Resolve account JWTs and prefixed Guest credentials through one Bearer
     authentication boundary.
   - Authorize Lists, Recipes, recipe images, and Zero using current database
     state.
3. **Shared household application**
   - Add `/join` and the Guest access provider.
   - Adapt the existing household shell and sidebar.
   - Reuse the existing household, Lists, and Recipes routes and components.
4. **QR management and deployment**
   - Add the owner interface for creating, displaying, and disabling links.
   - Serve the same web application at `guest.achichorro.com`.
   - Update canonical product, architecture, deployment, module, and security
     documentation to reflect the implemented behavior.

Recoverable deletion work that is not already part of a module belongs in a
separate prerequisite change. It must not be hidden inside the Guest-access
implementation.

## Acceptance criteria

- An owner can create multiple fixed, expiring read or write links and can
  permanently disable them.
- The raw secret is returned only at creation and only its hash is stored.
- A QR opens the existing household application without an account.
- Guests can use Lists and Recipes according to the link's access level.
- Every module enabled for the household appears in Guest navigation and is
  protected server-side.
- Guests cannot access household administration.
- Members and Guests use the same module routes and feature components.
- APIs and Zero use the same Bearer credential without a special envelope.
- Expired, disabled, malformed, and unknown credentials fail generically.
- There are no Guest users, sessions, cookies, JWTs, refresh endpoints,
  regeneration flows, editing flows, or module-specific sharing settings.

## Deferred work

- Guest identities, authorship, and activity history;
- per-device sessions or selective device revocation;
- renaming or otherwise editing links;
- regeneration or re-enabling disabled links;
- changing a link's access level or expiration;
- Guest-specific module selection;
- remote deletion of cached browser data; and
- native Guest access.

## Implementation and verification notes

The final table is migration `0029_milky_anita_blake`; no migration was applied
to the local or production database during implementation. It stays outside
Zero's schema/publication, with an explicit CI exclusion assertion.

Owner APIs are `POST`/`GET /api/households/:householdId/guest-access-links` and
`DELETE /api/households/:householdId/guest-access-links/:linkId`. The creation
response alone includes the credential. `/api/access` validates entry and
returns database-derived link scope; it does not exchange credentials.

Guest image URLs resolve to authenticated API content endpoints. Zero uses
the raw same credential and `guest-link:<id>` as its non-secret cache identity.
Active Zero streams revalidate every second; new API and mutation requests
check current authorization immediately. Existing downloaded/offline data is
not remotely erased. QR encoding, display, copy, download, and printing happen
in the owner's browser, without an external QR service.
