# Architecture decisions

This document records durable choices, the alternatives that were rejected,
and superseded direction. It does not duplicate the current system description
in [Architecture](./architecture.md) or the invariants in
[Security and synchronization](./security-and-sync.md). Decisions are current
unless their status says otherwise.

## pnpm workspaces without an orchestrator

**Status:** accepted

Use pnpm workspaces and recursive or filtered package scripts. The repository
does not yet have a scheduling or build-cache problem that justifies Turborepo
or Nx.

**Alternatives:** Turborepo; Nx; a non-workspace repository.

## Client-rendered React with typed routing

**Status:** accepted

Build the web application as a React/Vite SPA and use TanStack Router for typed
client routes. There is no current SEO or server-rendering requirement.

**Alternatives:** server-side rendering; React Server Components; TanStack
Start; another full-stack React framework.

## Zero is the synchronized client data layer

**Status:** accepted

Use Zero directly for reactive cached reads, optimistic custom mutators, and
convergence. Do not hide it behind a generic repository or add a second client
cache or offline mutation queue.

**Alternatives:** PowerSync; TanStack DB; Redux persistence; a custom sync and
queue layer.

## PostgreSQL and Drizzle own persisted state

**Status:** accepted

PostgreSQL is authoritative and enforces relational constraints. Drizzle
provides typed access while committed SQL migrations keep schema changes
reviewable. Migrations are inspected and applied deliberately rather than at
API startup.

**Alternatives:** a document database; an ORM that hides generated migrations;
automatic startup migrations.

## Household tenancy with code-owned modules

**Status:** accepted

The household is the collaboration and authorization boundary. Application
code owns a small catalogue of stable module keys; household settings enable
or disable modules for all members while retaining their data. Cross-module
behavior uses explicit operations rather than a plugin runtime, shared event
bus, or generic entity model.

The current rules and lock requirements are maintained in
[Security and synchronization](./security-and-sync.md#household-management-and-module-configuration).

**Alternatives:** per-member module permissions; dynamically installed
plugins; a generic user-defined schema; a shared catalog for shopping items and
recipe ingredients.

## Hono on Node.js with Zod at trust boundaries

**Status:** accepted

Run Hono through its Node.js adapter. Thin routes handle transport concerns and
delegate to focused services. Zod validates untrusted HTTP and Zero inputs at
runtime.

**Alternatives:** Express; an edge runtime; generated application layers;
TypeScript-only validation.

## Short-lived JWT access with rotating refresh sessions

**Status:** accepted

Use short-lived signed access JWTs, kept in browser memory, and opaque rotating
refresh tokens stored as hashes. The web refresh token is restricted to an
HttpOnly cookie. Argon2id remains responsible for password hashing. The
complete authentication and rotation rules are in
[Security and synchronization](./security-and-sync.md#passwords-and-jwt-authentication).

`SIGNUP_ACCESS_CODE` remains a separate account-enrollment gate even though
household invitations are implemented; invitations require an authenticated
account and grant household membership.

**Alternatives:** long-lived JWTs; browser local storage; server-side access
token sessions; invitations as account-creation credentials.

## R2 direct image transfer

**Status:** accepted for original uploads; display reads superseded by edge-generated derivatives

The API authorizes original recipe-image uploads and issues short-lived
presigned `PUT` URLs. Original bytes move directly from clients to R2;
PostgreSQL stores metadata and server-controlled object keys. Display reads use
the separately accepted edge-generated derivative path below. See
[Recipes image storage and security](./recipes/#image-storage-and-security).

**Alternatives:** proxying image bytes through the API; storing uploads on the
application host; persisting public or signed URLs.

## R2 originals with edge-generated display derivatives

**Status:** accepted

Retain every confirmed original recipe-image upload in private Cloudflare R2
as the canonical source. Display optimized derivatives generated on demand by
Cloudflare Images and cached at the edge; do not replace or discard the
original after transformation. The application does not initially expose an
original-image read or download operation to any user. Original retention
exists for future reprocessing, recovery, and a possible later access policy.

Derivative delivery must preserve the existing household authorization
boundary through short-lived, server-authorized access. Expose only a small,
code-owned set of display variants rather than accepting arbitrary transform
parameters. Exact variants, delivery-token design, and failure behavior remain
requirements to settle before implementation.

**Alternatives:** pre-generating WebP objects in R2; processing images on the
application host; converting in the browser; moving canonical storage to
Cloudflare Images; exposing original downloads to household members or owners.

## Platform-specific internal UI libraries

**Status:** accepted

`@home-hub/ui-web` owns React DOM primitives, semantic CSS variables, and
Tailwind styling on top of Base UI. A future `@home-hub/ui-native` may implement
the same documented design language on Expo UI while retaining native platform
behavior. There is no separate token package until demonstrated drift warrants
one.

**Alternatives:** one cross-platform rendering library; shadcn/ui; a second
overlapping primitive library; speculative Storybook adoption.

## Portable single-node production deployment

**Status:** accepted; supersedes deploying first to a Raspberry Pi

Deploy first to one online VPS using Caddy and Docker Compose, then consider a
Raspberry Pi migration only after ARM64, storage, power, network ingress,
restore, and rollback rehearsals succeed. The topology stays portable because
durable state remains in PostgreSQL and R2. Operational detail belongs in
[Deployment](./deployment.md).

**Alternatives:** Raspberry Pi as the first production host; Kubernetes; a
managed application platform; multiple hosts from the outset.

## Focused tests before browser automation

**Status:** accepted

Use Vitest for domain, service, API, and component behavior, with manual browser
verification for multi-client and connectivity journeys. Reconsider browser
automation when repeated manual regression becomes costly.

**Alternatives:** end-to-end browser automation from the start; relying only on
manual testing.

## Application-shell caching remains deferred

**Status:** accepted

Zero's cached synchronized data and an offline-loadable application shell are
separate concerns. Do not add a service worker unless offline reload becomes a
concrete requirement; if added, cache compiled static assets only, never API
responses or authenticated data.

**Alternatives:** install a PWA service worker by default; custom caching of API
or synchronized data.

## Git-versioned living documentation

**Status:** accepted

Keep one current document for each stable subject, committed work in
[Tasks](./tasks.md), completed delivery phases in
[Task history](./task-history.md), and optional future work in
[Backlog](./backlog.md). Update current documents when choices change, identify
superseded decisions here, and rely on Git history rather than copied `v2`
documents or manual document versions.

**Alternatives:** versioned document copies; duplicated roadmaps; splitting
documents based only on line count.

## Public repository with a protected production branch

**Status:** accepted

Keep the GitHub repository public. Use `develop` as the default integration
branch and require a verified pull request before merging it into protected
`main`. A successful push to `main` deploys through a GitHub `production`
environment and a dedicated SSH key that is restricted on the VPS to the
deployment script. CI rehearses the full committed migration history against a
disposable PostgreSQL database. Production deployment creates an off-host
backup and then applies pending forward migrations before starting the new
application version. It never automatically rolls migrations back or restores
a backup; destructive changes require an explicit staged plan.

Repository history was checked before the visibility change and contained no
production environment files, credentials, or private keys. Public Actions
logs must never print secrets, and security must not depend on hiding the
source code or infrastructure design.

**Alternatives:** pay for private-repository ruleset enforcement; allow direct
pushes to `main`; keep deployment entirely manual.
