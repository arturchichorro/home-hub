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

Implement username and shopping-item-name normalization in `packages/shared`,
with focused unit tests before connecting it to HTTP or PostgreSQL.

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

Before Zero, implement shopping-list operations against PostgreSQL. Exercise
shopping-item normalization, household authorization, explicit status changes,
and duplicate-name reactivation.

Checkpoint: demonstrate one complete request from validated JSON through a transaction to a database constraint.

## Phase 8: understand Zero with read-only synchronization

Add the Zero schema, self-hosted `zero-cache`, pass the current access JWT to Zero, add one named household-authorized shopping query, and implement the API query endpoint. Do not add mutations yet.

Checkpoint: use two browser contexts to show the same server-written shopping data. Inspect the query transformation and explain where authorization is applied.

## Phase 9: one custom optimistic mutator

Implement a single shopping mutation on the client and server. Validate
arguments, bind the verified user ID in Zero’s request handler, check
membership transactionally, and ensure any targeted shopping row belongs to
the household.

Checkpoint: slow the network and observe the optimistic result followed by authoritative convergence. Attempt a forged household ID and confirm server rejection.

## Phase 10: connection-state UX

Display Zero’s connection state. Disable writes in `disconnected`, `error`, and `needs-auth`, while retaining form text and cached reads. Do not add a second queue.

Checkpoint: describe the difference between `connecting` and `disconnected`, and test a reload after data has synchronized.

## Phase 11: complete shopping and recipes

Expand the proven patterns to shopping creation and status transitions,
recipes, ordered recipe ingredient rows, and recipe cooking logs.
Shopping-item renaming and the explicit operation that adds recipe ingredients
to Shopping are deferred. Keep mutations small and explicit.

Checkpoint: test referenced-row tenancy and simple last-write conflict behavior.

## Phase 12: R2 images

Implement upload authorization, direct browser upload, confirmation, signed reads, deletion, content-type validation, and size limits.

Checkpoint: use browser network tools to prove image bytes go directly to R2 and credentials never reach the browser.

## Phase 13: define the design system

Audit the existing authentication, household, connection-state, Shopping, and
Recipes interfaces before choosing abstractions. Define the product's visual
principles, accessibility baseline, and semantic tokens for color, typography,
spacing, radii, shadows, and motion. Define responsive layout rules and
breakpoints alongside them. Document the anatomy, variants, states, and intended
use of the first components. Document stable semantic token names and how each
platform-specific UI package maps the shared design intent to its own styling,
interaction, and accessibility behavior. Do not create a separate token
package.

Keep this phase primarily documentary: it should establish coherent rules and
show representative interface examples before reusable components constrain
the implementation.

Checkpoint: explain how a semantic token differs from a raw value, show how a
documented token maps to web CSS and a future native value, and walk through the
keyboard, focus, error, loading, disabled, empty, and disconnected states of
one form.

## Phase 14: implement the Base UI web component library

Create the internal `@home-hub/ui-web` package on top of `@base-ui/react`. Base
UI supplies unstyled web behavior, composition, focus management, keyboard
interaction, and ARIA foundations; `ui-web` owns the product styling, component
API, and CSS-variable tokens. Configure Tailwind to consume those variables.
Start with only the React DOM primitives already required by the application:
buttons, form fields, panels, inline alerts, and status indicators. Add a
lightweight development gallery that renders their variants and interaction
states without introducing Storybook or another application framework.

Adopt those primitives in authentication, household selection, connection
state, and Shopping. Keep feature-specific composition in each feature folder;
do not turn the UI package into a second domain layer. Reserve
`@home-hub/ui-native` for a future mobile phase. It should follow the same
documented design language and component vocabulary while wrapping Expo UI's
SwiftUI and Jetpack Compose components behind a Home Hub-owned API.

When native implementation begins, confirm the Expo UI API available in the
chosen Expo SDK and the exact component coverage the application needs. Prefer
Expo UI's universal components for shared controls, use its platform-specific
components when the native convention is intentional, and fill genuine gaps
with ordinary React Native components rather than adding a second primitive
library by default. Verify important behavior with VoiceOver and TalkBack on
real devices.

Checkpoint: review the gallery and migrated screens at narrow and wide widths,
then navigate them using only a keyboard and verify visible focus, labels,
errors, loading, disabled, and disconnected states.

## Phase 15: simple French vocabulary module

Apply the established household authorization and synchronization patterns to
a small shared French vocabulary collection. Keep its schema and interactions
independent from Shopping and Recipes, and build its interface from the shared
UI primitives rather than creating feature-local substitutes.

Checkpoint: explain which parts reuse household infrastructure and UI
foundations and which parts remain owned by the Vocabulary module.

## Phase 16: production readiness and optional shell caching

Add readiness checks, graceful shutdown, consistent error envelopes, missing
integration tests, accessibility checks for the shared UI primitives, and
documentation corrections. Rehearse PostgreSQL backup and restore and Zero
replica rebuild locally. Only then decide whether an offline-loadable
application shell justifies adding a service worker.

Checkpoint: run formatting, linting, type-checking, tests, and production
builds from a clean checkout, follow the setup documentation exactly, and
complete a restore rehearsal.

## Phase 17: deploy to an online VPS

Provision the first production host on an online VPS. Build the production
images and Caddy/Docker Compose topology, choose the domain and routing, keep
database and internal service ports private, configure TLS and secrets, and
send automated encrypted PostgreSQL backups outside the VPS. Deploy the web
application, API, `zero-cache`, PostgreSQL, and Caddy as one understandable
single-host system.

Checkpoint: verify authentication, synchronized reads and writes, R2 access,
health checks, container and host restarts, backup restoration, and the written
rollback procedure against the real VPS.

## Phase 18: deploy to and migrate onto the Raspberry Pi

Treat the Raspberry Pi as a deliberate second production host, not as an
untested replacement. Verify every ARM64 image and native dependency, SSD and
power characteristics, cooling, capacity, and reliable inbound HTTPS through
the home network. Restore a recent production backup and rebuild Zero on the Pi
before scheduling the final cutover.

During the migration, take a controlled final backup, transfer production
secrets securely, restore PostgreSQL, allow Zero to rebuild, switch DNS, and
verify the full user journey. Keep the VPS available for a documented rollback
window until the Pi has demonstrated stable operation.

Checkpoint: perform the cutover and a rollback rehearsal, confirm backup and
restore automation on the Pi, and record the operational differences between
the hosted VPS and the home-hosted system.

## Working rhythm for every phase

1. Read the relevant official library documentation.
2. State the intended data flow and security boundary.
3. Write the smallest test or manual observation that will prove the behavior.
4. Implement the smallest coherent change yourself.
5. Ask the guiding agent to review and explain problems, not to replace your implementation.
6. Run the checks and inspect the result directly.
7. Summarize what you learned in your own words before continuing.

The learner applies database migrations and creates commits manually. The guiding agent may inspect generated SQL and database state, but should not run migration commands or commit changes unless explicitly asked for that specific action.
