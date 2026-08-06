# Architecture decisions

## pnpm workspaces without an orchestrator

The repository is small enough for pnpm recursion and filters. Turborepo or Nx would add configuration before there is a scheduling or caching problem to solve.

## React and Vite as a client-rendered application

The product has no search-engine or server-rendering requirement. A browser-rendered SPA keeps the rendering model and deployment boundary easy to understand. Do not add SSR, React Server Components, or a full-stack React framework.

## TanStack Router only for routing

Use TanStack Router for typed client routes without adopting TanStack Start or its server runtime.

## Zero as the only synchronized client data layer

Zero provides reactive cached reads, optimistic custom mutators, query-driven synchronization, and convergence. Adding TanStack DB, PowerSync, or a custom cache would make ownership ambiguous.

Use Zero directly in feature code while learning it. Introduce small helpers only after repeated patterns become visible.

## PostgreSQL and Drizzle

The domain has relational invariants and transactional authorization requirements. PostgreSQL provides constraints and transactions; Drizzle provides typed queries while keeping SQL migrations visible and reviewable.

## Households and built-in modules

The household is the collaboration and authorization boundary. Users may
belong to multiple households, households have no product-level member limit,
and household names are not unique.

Each household has exactly one owner. `household_members` has its own stable
primary key and separately enforces uniqueness on `(household_id, user_id)`.
The initial roles are only `owner` and `member`.

Shopping, Recipes, and French Vocabulary are built-in modules. They remain
mostly encapsulated, all are available to every household member, and
cross-module behavior is expressed through narrow operations such as adding a
recipe's ingredients to the shopping list. Do not add a generic module table,
plugin system, event bus, or per-module permissions without a concrete need.

Shopping and Recipes do not share a canonical `items` table. Shopping rows own
their names and normalized names; recipe ingredient rows own their ingredient
names. Adding recipe ingredients to the shopping list copies those names and
inserts or reactivates the corresponding normalized shopping rows. A shared
catalog would be reconsidered only if the product later needs shared item
identity or metadata across modules.

A shopping item's display name is Unicode NFKC-normalized, whitespace-folded,
trimmed, and limited to 1–100 characters while preserving casing. Its separate
normalized name is lowercased for per-household uniqueness and duplicate
reactivation.

## Household invitations

Only the household owner may create invitations. An invitation is a bearer
credential rather than an email-bound record: generate 32 random bytes, return
the raw base64url token only when creating the invite, and store only its
SHA-256 hash. Invite revocation is deferred; the nullable `revoked_at` column is
reserved for that possible future behavior.

Invitations expire after seven days and require an already-authenticated
account for acceptance. `SIGNUP_ACCESS_CODE` remains the account-enrollment gate
for now. Unknown, expired, revoked, and previously accepted tokens receive the
same generic invalid-invite response.

Acceptance locks the invite and transactionally creates a `member` membership
while setting `accepted_at`, so concurrent acceptance has at most one winner.
An existing household member receives a conflict response without consuming
the invitation. The initial model does not store `accepted_by_user_id`; the
created membership records who joined.

## Hono on Node.js for explicit HTTP boundaries

Hono handles authentication, online commands, Zero endpoints, health checks, and R2 signing. It is small, uses Web-standard `Request` and `Response` objects, and runs on Node.js through `@hono/node-server`. This makes the boundary easy to learn and matches Zero's server APIs without adapting Express request objects into Fetch requests.

Use Hono directly rather than a generated application architecture. Routes should parse transport concerns and delegate to ordinary transactional service functions. Choosing Hono does not imply deploying to an edge runtime; PostgreSQL access and Argon2id remain in the Node.js API process.

## Zod for runtime validation

TypeScript types disappear at runtime. Zod schemas validate untrusted HTTP bodies and mutation arguments and can provide inferred TypeScript types without parallel interfaces.

## JWT access tokens with rotating refresh tokens

After password verification, the API issues a short-lived signed JWT access token. API and Zero requests send it as `Authorization: Bearer <token>`. This works consistently for the browser and a future native client.

Implement the JWT signing and verification path directly with Node's standard `crypto` APIs rather than adding a JWT library. This is for learning and must remain deliberately narrow: support only the chosen algorithm, verify the algorithm/header explicitly, verify issuer, audience, expiry, and required claims, and use constant-time signature comparison. Do not implement cryptographic primitives manually.

A long-lived JWT would be difficult to revoke, so continuity uses a separate high-entropy opaque refresh token. Only its SHA-256 hash is stored. Refresh tokens rotate whenever used and can be revoked on logout, password change, or suspected reuse.

The web client keeps its access token in memory and its refresh token in an `HttpOnly`, `SameSite=Lax`, `Path=/auth` cookie named `home_hub_refresh`, using `Secure` in production only. A native client keeps the refresh token in platform secure storage. Neither client stores passwords.

Each signup or login creates an independent session represented by a forward-linked refresh-token chain. Rotation happens transactionally while the presented token row is locked. The replacement inherits the original session expiry, so refreshing does not extend the session beyond 30 days. Reusing a rotated token revokes the active descendants in that chain without revoking independent sessions on other devices.

Logout revokes the current session only. A password change, or a future explicit “log out everywhere” operation, revokes every refresh-token session belonging to the user. The refresh endpoint returns a new access token in JSON and sends the replacement refresh token only through the web cookie.

Signup is gated by a server-side `SIGNUP_ACCESS_CODE` until household invites exist. Missing or empty `SIGNUP_ACCESS_CODE` means signup is disabled. The code is not stored in PostgreSQL, is not returned to clients, and is not a replacement for account passwords. Its comparison is timing-safe; a disabled signup or an invalid code receives the same generic `403` response.

Signup normalizes usernames using the shared username rule and requires a normalized length of 3–32 characters. It normalizes email addresses by trimming and lowercasing before the database uniqueness check. Passwords are never normalized; they must be 12–128 characters. Refresh tokens expire after 30 days. Web refresh cookies use `HttpOnly`, `SameSite=Lax`, `Path=/auth`, and `Secure` only in production.

Login accepts normalized email and password only; usernames remain display identities rather than alternate login identifiers. An unknown email and an incorrect password receive the same generic `401` response so the API does not reveal whether an email has an account.

Protected API routes verify the access JWT and place its `sub` claim into a typed request context as the trusted user ID. Endpoints still query PostgreSQL for mutable account and authorization state. If a structurally valid access token refers to a user that no longer exists, treat it as `401 Unauthorized` rather than revealing account lifecycle through `404`.

## Argon2id for passwords

Passwords require a deliberately expensive password-hashing algorithm rather than ordinary encryption or a fast general-purpose hash. Argon2id is the selected algorithm.

JWT and Argon2id solve different problems: Argon2id protects the password at rest, while JWT proves the identity of a client after successful login.

## R2 direct uploads

The API should authorize uploads, not proxy image bytes. Presigned direct uploads keep the API stateless and avoid filesystem storage.

## Portable single-node production deployment

The initial production target is one OVHcloud VPS in Brussels. Caddy, the Hono
API, self-hosted `zero-cache`, and PostgreSQL run through Docker Compose on the
same Linux host. Caddy serves the compiled React/Vite SPA, terminates HTTPS,
and proxies API and Zero WebSocket traffic. Only Caddy is publicly exposed;
service-to-service connections remain on the Compose network.

Confirm Docker Engine and Compose compatibility for the exact Brussels product
before purchase. If that offering cannot run the workload, use another
European location or provider without changing the topology.

This deliberately favors a small, understandable deployment over an
orchestrator or managed platform. The application remains portable by keeping
state in PostgreSQL and R2, configuration in environment variables, and
infrastructure in ordinary container images and Compose configuration.

The Raspberry Pi 16 GB with SSD is the planned second production host rather
than a separate architecture. Deploy and operate the system on the VPS first,
then migrate only after verifying ARM64 support for every container and native
Node dependency, adequate SSD I/O for PostgreSQL and Zero's SQLite replica, and
reliable HTTPS ingress from the home network. Keep the VPS available during a
documented rollback window.

## Platform-aware UI libraries, with Base UI on the web

The initial plain UI was intentional while the application established its
data, authorization, and synchronization boundaries. The implemented screens
now provide enough concrete interaction states to define a small design system
before adding French Vocabulary.

Reusable React DOM primitives live in `@home-hub/ui-web`, which is built on the
unstyled `@base-ui/react` components. Base UI provides the web interaction,
composition, keyboard, focus, and ARIA foundation. `ui-web` owns the product's
component API, CSS-variable tokens, and Tailwind styling.

A future `@home-hub/ui-native` package will implement equivalent components
with React Native primitives. Base UI targets browsers and relies on web
platform behavior, so it is not a suitable foundation for the native package.
Sharing documented visual intent, semantic token names, and component
vocabulary is valuable; forcing HTML, CSS, ARIA, and native controls through a
single universal implementation is not.

There is no separate design-token library. The design-system documentation is
the shared specification, and each UI package owns its platform representation
of those values. If maintaining the two representations becomes a demonstrated
source of drift, automation can be reconsidered without requiring a public
token package.

Feature-specific composition remains inside its application. These internal
packages create explicit platform boundaries and make the future mobile path
visible, even while the web application is their first consumer.

Begin with buttons, form fields, panels, inline alerts, and status indicators,
plus the states the existing application actually needs. Use native HTML
semantics and accessible interaction behavior. Do not add shadcn/ui, a form
library, Storybook, or a large catalogue of speculative components. Do not
create `@home-hub/ui-native` until React Native work begins. Reconsider the
other choices only when repeated needs justify their cost.

## Testing without browser automation initially

Use Vitest for pure domain behavior and service/API integration. Verify the two-client and disconnected journeys manually while learning the system. Browser automation can be reconsidered later when the workflow has stabilized and repeated manual regression becomes costly.

## Defer the service worker

Zero’s cached application data and an offline-loadable application shell are separate concerns. First understand and verify Zero cache behavior. Add a service worker only later if reloading the compiled app without network access remains a product requirement.

## Git-versioned living documentation

The files in `docs/` describe the current system and change alongside relevant
implementation decisions. Git history and commit diffs provide document
versioning; do not create copied `v2` documents or maintain manual version
numbers. When an important decision is reversed, update the current documents
and record what the new decision supersedes.
