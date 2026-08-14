# Home Hub tasks

This is the single project backlog and chronological roadmap. Subject documents
in `docs/` describe the current system and should link here instead of keeping
separate task lists or phase plans.

## Working rhythm for every phase

1. Read the relevant official library documentation.
2. State the intended data flow and security boundary.
3. Write the smallest test or manual observation that will prove the behavior.
4. Implement the smallest coherent change yourself.
5. Ask the guiding agent to review and explain problems, not to replace your implementation.
6. Run the checks and inspect the result directly.
7. Summarize what you learned in your own words before continuing.

The learner applies database migrations and creates commits manually. The
guiding agent may inspect generated SQL and database state, but should not run
migration commands or commit changes unless explicitly asked for that specific
action.

## Phase 1: workspace and static web page

- [x] Create the pnpm workspace and root TypeScript configuration
- [x] Create `apps/web` with React and Vite
- [x] Render a static page
- [x] Create `apps/api` with Hono on Node.js
- [x] Expose and verify `GET /api/health`
- [x] Create the initial `packages/database` and `packages/shared` boundaries
- [x] Verify type-checking, development servers, and builds
- [x] Explain the Phase 1 checkpoint in my own words
- [x] Commit Phase 1

## Phase 2: configuration and PostgreSQL

- [x] Add root `.env.example`
- [x] Add validated API runtime configuration
- [x] Use validated config for the API port
- [x] Load local root `.env` for development
- [x] Run PostgreSQL locally with logical replication
- [x] Define the initial Drizzle schema
- [x] Generate, inspect, and apply the first committed SQL migration
- [x] Complete the Phase 2 checkpoint and commit

## Phase 3: normalization

- [x] Implement and test username normalization
- [x] Implement and test item-name normalization
- [x] Complete the Phase 3 checkpoint and commit

## Phase 4: authentication

- [x] Add auth environment configuration
- [x] Add `users.updated_at` and `refresh_tokens`
- [x] Implement and test Argon2id password helpers
- [x] Implement and test access-JWT signing and verification
- [x] Implement and test opaque refresh-token generation and hashing
- [x] Add the exported Drizzle database-client boundary
- [x] Define signup validation and session-cookie policy
- [x] Implement and test signup service logic
- [x] Wire and test `POST /api/auth/signup`
- [x] Define login credentials and failure policy
- [x] Implement signup and login services with Argon2id
- [x] Wire and test `POST /api/auth/login`
- [x] Issue access JWTs from signup and login services
- [x] Implement opaque refresh-token rotation, reuse detection, and revocation
- [x] Wire and test `POST /api/auth/refresh`
- [x] Implement and test current-session logout service
- [x] Wire and test `POST /api/auth/logout`
- [x] Implement and test bearer authentication middleware
- [x] Implement and test `GET /api/auth/me`
- [x] Complete the Phase 4 checkpoint
- [x] Commit Phase 4

## Phase 5: households

- [x] Define and migrate the household and membership schema
- [x] Create households and owner memberships transactionally
- [x] List households for the authenticated user
- [x] Prove rollback behavior
- [x] Complete the Phase 5 checkpoint
- [x] Commit Phase 5

## Phase 6: invites and isolation

- [x] Define and migrate the household-invite schema
- [x] Implement owner-authorized invite creation
- [x] Implement transactional invite acceptance
- [x] Test expiry, single use, and cross-household isolation
- [x] Complete the Phase 6 checkpoint and commit

## Phase 7: online shopping slice

- [x] Define and migrate the shopping-item schema
- [x] Implement authenticated, household-authorized item addition
- [x] Enforce normalization and atomic duplicate-name reactivation
- [x] Verify the add-item HTTP flow against PostgreSQL
- [x] Implement and verify an explicit shopping-item status transition
- [x] Complete the Phase 7 checkpoint
- [x] Commit the Phase 7 work

## Phase 8: read-only Zero synchronization

- [x] Add the Zero schema and self-hosted `zero-cache`
- [x] Add JWT-authenticated named queries and the API query endpoint
- [x] Demonstrate synchronized reads in two browser contexts
- [x] Complete the Phase 8 checkpoint and commit

## Phase 9: optimistic mutation

- [x] Implement one authorized custom shopping mutator
- [x] Verify optimistic behavior, convergence, and forged-ID rejection
- [x] Complete the Phase 9 checkpoint
- [x] Commit the Phase 9 work

## Phase 10: connection-state UX

- [x] Display Zero connection state and gate writes appropriately
- [x] Preserve cached reads and unsaved form text while disconnected
- [x] Complete the Phase 10 checkpoint
- [x] Commit the Phase 10 work

## Phase 11: shopping and recipes

- [x] Complete shopping creation and status operations;
- [x] Implement recipes, ordered recipe ingredients, and cooking logs
- Deferred beyond Phase 11: add the explicit recipe-ingredients-to-shopping operation
- [x] Test tenancy and basic conflict behavior
- [x] Complete and commit the Phase 11 checkpoint

## Phase 12: household lifecycle and management

- [x] Define rules for renaming, ownership transfer, member removal, and leaving
- [x] Add a household switcher with an explicit current-household route or state
- [x] Build owner-only household settings and rename operations
- [x] List members and pending invitations without exposing private account fields
- [x] Implement owner-authorized invitation revocation through the API and web UI
- [x] Implement owner-authorized member removal through the API and web UI
- [x] Implement member-initiated leaving with owner protection
- [x] Implement transactional ownership transfer without allowing an ownerless household
- [x] Test role changes, last-owner protection, cross-household isolation, and active-household fallback
- [x] Complete the Phase 12 checkpoint
- [x] Commit the completed Phase 12 checkpoint

## Phase 13: configurable built-in modules

- [x] Define the shared code-owned module catalogue and stable keys for Shopping and Recipes
- [x] Add and migrate household module settings with explicit defaults
- [x] Backfill Shopping and Recipes as enabled for existing households
- [x] Initialize every new household from the shared module catalogue
- [x] Add owner-only operations to enable or disable a module for the whole household
- [x] Synchronize enabled-module settings so navigation updates for every member
- [x] Enforce enabled-module checks in current API commands, Zero queries, and Zero mutators; require the same checks when uploads and cross-module operations are introduced
- [x] Preserve module data while disabled and restore access when re-enabled
- [x] Test forged access, concurrent toggles, and household isolation; cross-module operations remain unavailable and must enforce both modules when introduced
- [x] Complete the Phase 13 checkpoint
- [x] Commit the completed Phase 13 checkpoint

## Phase 14: R2 images

- [x] Define and migrate pending/confirmed recipe-image metadata with optional cook-log ownership
- [x] Add confirmed image metadata to the Zero publication, generated schema, and authorized recipe queries
- [x] Configure the R2 client and validate its environment without exposing credentials to Vite
- [x] Implement authorized pending-image creation and short-lived presigned direct uploads
- [x] Confirm uploads by verifying R2 object existence, content type, and size
- [x] Implement authorized signed reads and deletion with object/metadata consistency
- [x] Build and verify the recipe-image web flow, including failure and pending states
- [x] Complete the Phase 14 checkpoint
- [x] Commit the completed Phase 14 checkpoint

## Phase 15: design-system definition

- [x] Audit the existing screens, interaction states, and repeated UI patterns
- [x] Define the product's visual principles and accessibility baseline
- [x] Define semantic tokens for color, typography, spacing, radii, shadows, and motion
- [x] Define responsive layout rules and breakpoints
- [x] Document shared token names and how each UI package maps them to its platform
- [x] Document Base UI for web and Expo UI for the future React Native library
- [x] Document component anatomy, variants, states, and usage guidance
- [x] Complete the Phase 15 checkpoint and commit

## Phase 16: Base UI web component library

- [x] Create the internal `@home-hub/ui-web` package for React DOM components
- [x] Install Base UI as the unstyled accessible behavioral foundation for `ui-web`
- [x] Implement web design tokens as CSS variables owned by `ui-web`
- [x] Configure Tailwind to consume the `ui-web` semantic CSS variables
- [x] Implement the first reusable primitives for buttons, fields, panels, alerts, and status indicators
- [x] Add a lightweight development gallery for visual and interaction-state review
- [x] Adopt the primitives in authentication, household selection, connection state, and Shopping
- [x] Add addressable login and signup routes behind a shared authentication layout
- [x] Protect the authenticated route tree and create Zero only for authenticated sessions
- [x] Keep the authenticated Zero client stable across navigation and expose it to TanStack Router loaders for query preloading
- [x] Move household fallback navigation into an index route and scope enabled-module redirects to their module routes
- [x] Refresh the in-memory access JWT through a deduplicated request when Zero enters `needs-auth`
- [x] Add the account menu and complete refresh-session logout from the web app
- [x] Add household creation to the selector and navigate into the new household
- [x] Add invite-token household joining to the selector and navigate after acceptance
- [x] Add owner invite creation with one-time token display and clipboard sharing
- [x] Verify keyboard navigation, visible focus, labels, error states, disabled states, and responsive layout
- [x] Reserve `@home-hub/ui-native`, built on Expo UI, for a future native implementation of the same documented design language
- [x] Complete the Phase 16 checkpoint and commit

## Phase 17: production readiness and hardening

- [x] Add readiness and graceful shutdown
- [x] Export stable database and transaction types from `@home-hub/database`
- [x] Extract focused API authorization helpers while preserving explicit lock modes
- [x] Group API dependencies by feature and separate infrastructure dependencies
- [x] Add structured API request logging and a central safe error handler
- [x] Add root application error and not-found boundaries
- [x] Reconcile the documentation with the implemented system and establish canonical sources
- [x] Verify a clean-checkout setup and production builds
- [x] Complete the Phase 17 checkpoint and commit

## Phase 18: deploy to an online VPS

- [x] Confirm the VPS, CPU architecture, operating system, domain, and public routing
- [x] Build the production images and Caddy/Docker Compose configuration
- [x] Configure production secrets, firewall rules, TLS, and private service networking
- [ ] Configure automated encrypted PostgreSQL backups outside the VPS
- [x] Deploy the web application, API, `zero-cache`, PostgreSQL, and Caddy
- [ ] Verify authentication, synchronization, R2 access, health checks, restart behavior, and rollback
- [ ] Configure loopback-only PostgreSQL access through an SSH tunnel for TablePlus
- [ ] Complete a production restore rehearsal and document routine operations
- [ ] Complete the Phase 18 checkpoint and commit

## Phase 19: continuous integration after initial deployment

- [ ] Add a CI workflow that starts from a clean, frozen dependency installation
- [ ] Run formatting and linting checks
- [ ] Run type-checking for every application and package
- [ ] Run the complete test suite
- [ ] Regenerate the Zero schema and fail if committed generated output differs
- [ ] Verify migration files and Drizzle metadata are consistent with the declared database schema
- [ ] Build the production web application
- [ ] Make sure that pushing to main on github triggers a redeploy, and move most of development to a develop branch. Focused prs from develop -> main will be used to trigger redeploys
- [ ] Document how to investigate failures while keeping the equivalent local verification commands available
- [ ] Complete the Phase 19 checkpoint and commit

## Phase 20: deploy to and migrate onto the Raspberry Pi

- [ ] Verify ARM64 images and native dependencies for the complete production stack
- [ ] Validate SSD performance and durability, cooling, power protection, and available capacity
- [ ] Establish reliable HTTPS ingress despite dynamic IP, port-forwarding, or CGNAT constraints
- [ ] Rehearse a full restore and Zero replica rebuild on the Raspberry Pi before cutover
- [ ] Plan a maintenance window, final backup, DNS cutover, and VPS rollback window
- [ ] Migrate PostgreSQL and secrets, rebuild Zero, and switch production traffic
- [ ] Verify the full production journey and monitor stability before retiring the VPS
- [ ] Complete the Phase 20 checkpoint and commit

## Phase 21: French vocabulary as the first post-deployment module

- [ ] Define the smallest useful household vocabulary model and module-owned operations
- [ ] Register French Vocabulary in the built-in module catalogue, disabled by default
- [ ] Backfill disabled settings for existing households and set the new-household default
- [ ] Apply established household membership, module-enabled, and synchronization checks
- [ ] Build the vocabulary interface from the shared UI primitives
- [ ] Verify enabling, disabling with data retention, re-enabling, and household isolation
- [ ] Document the checklist for adding future modules such as household finance
- [ ] Complete the Phase 21 final checkpoint and commit
