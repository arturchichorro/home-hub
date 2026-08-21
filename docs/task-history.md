# Home Hub task history

This document records completed delivery phases. It is a historical reference,
not an active backlog. Current commitments belong in [Tasks](./tasks.md), while
optional future work belongs in [Backlog](./backlog.md).

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

- [x] Complete shopping creation and status operations
- [x] Implement recipes, ordered recipe ingredients, and cooking logs
- [x] Test tenancy and basic conflict behavior
- [x] Complete and commit the Phase 11 checkpoint

Recipe-ingredients-to-shopping was deferred from this phase and now lives in
the backlog.

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
- [x] Configure automated encrypted PostgreSQL backups outside the VPS
- [x] Deploy the web application, API, `zero-cache`, PostgreSQL, and Caddy
- [x] Verify authentication, synchronization, R2 access, health checks, and restart behavior; document code rollback
- [x] Complete a production restore rehearsal and document routine operations
- [x] Configure loopback-only PostgreSQL access through an SSH tunnel for TablePlus
- [x] Complete the Phase 18 checkpoint and commit

## Phase 19: continuous integration after initial deployment

- [x] Add a CI workflow that starts from a clean, frozen dependency installation
- [x] Run formatting and linting checks
- [x] Run type-checking for every application and package
- [x] Run the complete test suite
- [x] Regenerate the Zero schema and fail if committed generated output differs
- [x] Verify migration files and Drizzle metadata are consistent with the declared database schema
- [x] Build the production web application
- [x] Make pushing to `main` trigger a redeploy and use `develop` as the default integration branch
- [x] Use focused pull requests from `develop` to `main` to trigger production deployments
- [x] Document how to investigate failures while keeping the equivalent local verification commands available
- [x] Rehearse the full migration history in CI and apply tested forward migrations automatically after a production backup
- [x] Complete the Phase 19 checkpoint and commit

## Edit shopping item names

- [x] Define and validate an optimistic rename mutation
- [x] Enforce household, module, item, and normalized-name uniqueness boundaries
- [x] Add accessible editing controls for current and archived items
- [x] Verify normalization, authorization, duplicate rejection, and the interface build
- [x] Refine editing to use row-style inputs, debounced saves, and an error popover
- [x] Standardize application inputs on a Base UI-backed `ui-web` primitive
- [x] Complete the shopping-item editing checkpoint and commit

## Refine the shopping and application-shell interface

- [x] Make the top bar sticky and non-wrapping, with compact mobile branding, household trigger, and connection status
- [x] Refine menu triggers and make the household picker content-sized
- [x] Move enabled household modules into a menu beside the household picker
- [x] Present add-item, current, crossed, archive-toggle, and expanded archived rows as one shopping list
- [x] Keep archived items hidden until the archive row is toggled open
- [x] Verify focused responsive, keyboard, accessible-name, and interface-build behavior
- [x] Update the design-system documentation and complete the UI checkpoint

## Standardize web icons on Lucide

- [x] Adopt `lucide-react` through the shared `ui-web` package
- [x] Replace application, menu, select, and gallery icons with Lucide components
- [x] Verify there are no remaining one-off SVG icons and complete the icon checkpoint

## Simplify recipe ingredient amounts

- [x] Replace the separate optional quantity and unit fields with one optional amount field
- [x] Preserve existing ingredient measurements by joining quantity and unit during migration
- [x] Update the ingredient add row and list to use the single amount field
- [x] Verify normalization, optimistic insertion, authorization, migration SQL, and workspace checks
- [x] Update the system documentation and complete the ingredient-amount checkpoint

## Simplify recipe ingredient entry

- [x] Create ingredients from their required name only
- [x] Add a scoped optimistic mutation for optional amount and note updates
- [x] Add a Base UI-backed context menu editor to every ingredient row
- [x] Preserve immediate deletion and accessible drag-and-drop reordering
- [x] Verify validation, authorization, optimistic updates, UI primitives, and workspace checks
- [x] Update the design-system documentation and complete the ingredient-entry checkpoint

## Edit recipe ingredient names and cooking-log comments

- [x] Add separate, validated optimistic mutations for ingredient names and cooking-log comments
- [x] Enforce household, recipe, ingredient, and cooking-log ownership boundaries
- [x] Add debounced inline editors with blur saves, reversion, and error popovers
- [x] Give every directly editable recipe field a seamless appearance with no hover or focus restyling
- [x] Keep ingredient rows to one line and move immediate deletion into their context menu
- [x] Keep ingredient metadata editing, deletion, reordering, and image actions unchanged
- [x] Verify normalization, authorization, optimistic updates, and interface type safety
- [x] Update the design-system documentation and complete the inline-editing checkpoint

## Expose recipe ingredient actions inline

- [x] Replace the ingredient context menu with conditional amount, note, and delete icon actions
- [x] Reveal and focus empty amount and note editors without dismissing them during the initial debounce
- [x] Save amount and note independently, normalizing cleared values to `null`
- [x] Verify patch validation, authorization, nullable updates, types, tests, and formatting
- [x] Update the design-system documentation and complete the inline-actions checkpoint

## Progressively reveal recipe ingredient creation

- [x] Move ingredient creation below the existing ingredient list
- [x] Replace the persistent input with a muted Add ingredient trigger row
- [x] Reveal and focus an ingredient-name draft row when activated
- [x] Keep the trigger and draft inside the divided list with a disabled draft drag handle and compact hover target
- [x] Keep the Add ingredient trigger below an open draft and save valid drafts on debounce, blur, or Enter
- [x] Model creation as a stable UI-only ingredient row keyed by its eventual record ID
- [x] Keep repeated Add ingredient activation focused on the existing blank draft
- [x] Preserve name-input focus while an autosaved draft transitions to its saved row
- [x] Dismiss empty submissions without creating an ingredient record
- [x] Verify creation, empty-submission, type, test, and formatting behavior
- [x] Update the design-system documentation and complete the creation-row checkpoint

## Add module-specific documentation for Shopping and Recipes

- [x] Create `docs/recipes` and consolidate Recipes product, interface, data, synchronization, and image-security documentation
- [x] Replace extracted Recipes detail in cross-cutting documents with links to the module reference
- [x] Create `docs/shopping` and consolidate Shopping product, interface, data, and synchronization documentation
- [x] Replace extracted Shopping detail in cross-cutting documents with links to the module reference
- [x] Update the documentation index and complete the module-documentation checkpoint
