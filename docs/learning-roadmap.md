# Learning-oriented implementation roadmap

This sequence optimizes for understanding. Complete one phase, explain it in your own words, and commit it before beginning the next.

## Phase 1: workspace and static web page

Learn pnpm workspace linking, TypeScript project boundaries, Vite’s development server, Hono's Node.js adapter, and the difference between source code and build output.

Create only the root workspace, `apps/web`, `apps/api`, `packages/database`, and `packages/shared`. Reserve `apps/mobile` for the future rather than creating it now. Render a static React page and expose a Hono `/health` route through `@hono/node-server`.

Checkpoint: explain which process serves each port and why the browser cannot import server-only code.

## Phase 2: configuration and PostgreSQL

Create one root `.env.example`, runtime configuration validation, a development PostgreSQL container with logical replication, the Drizzle schema, and the first SQL migration.

Checkpoint: inspect the migration and database directly. Explain the difference between a TypeScript schema, a SQL migration, and the running database schema.

## Phase 3: normalization as a pure domain rule

Implement username and item-name normalization in `packages/shared`, with focused unit tests before connecting it to HTTP or PostgreSQL.

Checkpoint: explain why normalization must happen before uniqueness checks and why PostgreSQL still needs a unique constraint.

## Phase 4: signup, login, JWTs, and refresh-token rotation

Implement Argon2id password hashing, short-lived JWT access tokens, opaque rotating refresh tokens, refresh-token hashing, the web refresh cookie, bearer authentication middleware, refresh, logout, and `/auth/me`.

Checkpoint: trace the password, access JWT, and refresh token through the system. Explain why Argon2id remains necessary, why access tokens are short-lived, how refresh rotation detects reuse, and which values are stored in PostgreSQL or accessible to browser JavaScript.

## Phase 5: first transactional business operation

Implement household creation so the household and owner membership are inserted in one transaction. Add household listing scoped to the authenticated user.

Checkpoint: force the second insert to fail and verify the household insert rolls back.

## Phase 6: invites and cross-household isolation

Implement hashed, expiring, single-use invites and transactional acceptance. Write service/API tests proving expiration and that a non-member cannot inspect or modify another household.

Checkpoint: explain why authentication middleware alone cannot enforce household tenancy.

## Phase 7: one online shopping vertical slice

Before Zero, implement the item and shopping service operations against PostgreSQL. Exercise catalog normalization, same-household references, status changes, and duplicate-name behavior.

Checkpoint: demonstrate one complete request from validated JSON through a transaction to a database constraint.

## Phase 8: understand Zero with read-only synchronization

Add the Zero schema, self-hosted `zero-cache`, pass the current access JWT to Zero, add one named household-authorized shopping query, and implement the API query endpoint. Do not add mutations yet.

Checkpoint: use two browser contexts to show the same server-written shopping data. Inspect the query transformation and explain where authorization is applied.

## Phase 9: one custom optimistic mutator

Implement a single shopping mutation on the client and server. Validate arguments, bind the verified user ID in Zero’s request handler, check membership transactionally, and verify the item belongs to the household.

Checkpoint: slow the network and observe the optimistic result followed by authoritative convergence. Attempt a forged household ID and confirm server rejection.

## Phase 10: connection-state UX

Display Zero’s connection state. Disable writes in `disconnected`, `error`, and `needs-auth`, while retaining form text and cached reads. Do not add a second queue.

Checkpoint: describe the difference between `connecting` and `disconnected`, and test a reload after data has synchronized.

## Phase 11: complete shopping and recipes

Expand the proven patterns to shopping status transitions, catalog editing, recipes, and ordered recipe ingredient rows. Keep mutations small and explicit.

Checkpoint: test referenced-row tenancy and simple last-write conflict behavior.

## Phase 12: simple French vocabulary module

Apply the established household authorization and synchronization patterns to
a small shared French vocabulary collection. Keep its schema and interactions
independent from Shopping and Recipes.

Checkpoint: explain which parts reuse household infrastructure and which parts
remain owned by the Vocabulary module.

## Phase 13: R2 images

Implement upload authorization, direct browser upload, confirmation, signed reads, deletion, content-type validation, and size limits.

Checkpoint: use browser network tools to prove image bytes go directly to R2 and credentials never reach the browser.

## Phase 14: hardening and optional shell caching

Add readiness checks, graceful shutdown, consistent error envelopes, missing integration tests, and documentation corrections. Only then decide whether an offline-loadable application shell justifies adding a service worker.

Checkpoint: run formatting, linting, type-checking, tests, and production builds from a clean checkout, then follow the setup documentation exactly.

## Working rhythm for every phase

1. Read the relevant official library documentation.
2. State the intended data flow and security boundary.
3. Write the smallest test or manual observation that will prove the behavior.
4. Implement the smallest coherent change yourself.
5. Ask the guiding agent to review and explain problems, not to replace your implementation.
6. Run the checks and inspect the result directly.
7. Summarize what you learned in your own words before continuing.

The learner applies database migrations and creates commits manually. The guiding agent may inspect generated SQL and database state, but should not run migration commands or commit changes unless explicitly asked for that specific action.
