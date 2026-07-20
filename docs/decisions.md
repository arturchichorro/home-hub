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

Signup is gated by a server-side `SIGNUP_ACCESS_CODE` until household invites exist. Missing or empty `SIGNUP_ACCESS_CODE` means signup is disabled. The code is not stored in PostgreSQL, is not returned to clients, and is not a replacement for account passwords. Its comparison is timing-safe; a disabled signup or an invalid code receives the same generic `403` response.

Signup normalizes usernames using the shared username rule and requires a normalized length of 3–32 characters. It normalizes email addresses by trimming and lowercasing before the database uniqueness check. Passwords are never normalized; they must be 12–128 characters. Refresh tokens expire after 30 days. Web refresh cookies use `HttpOnly`, `SameSite=Lax`, `Path=/auth`, and `Secure` only in production.

Login accepts normalized email and password only; usernames remain display identities rather than alternate login identifiers. An unknown email and an incorrect password receive the same generic `401` response so the API does not reveal whether an email has an account.

## Argon2id for passwords

Passwords require a deliberately expensive password-hashing algorithm rather than ordinary encryption or a fast general-purpose hash. Argon2id is the selected algorithm.

JWT and Argon2id solve different problems: Argon2id protects the password at rest, while JWT proves the identity of a client after successful login.

## R2 direct uploads

The API should authorize uploads, not proxy image bytes. Presigned direct uploads keep the API stateless and avoid filesystem storage.

## Plain UI first

Install Tailwind for basic layout, but use native forms and simple components. Do not add shadcn/ui, a design system, or a form library until a concrete interaction requires one.

## Testing without browser automation initially

Use Vitest for pure domain behavior and service/API integration. Verify the two-client and disconnected journeys manually while learning the system. Browser automation can be reconsidered later when the workflow has stabilized and repeated manual regression becomes costly.

## Defer the service worker

Zero’s cached application data and an offline-loadable application shell are separate concerns. First understand and verify Zero cache behavior. Add a service worker only later if reloading the compiled app without network access remains a product requirement.
