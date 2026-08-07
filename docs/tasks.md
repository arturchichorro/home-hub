# Home Hub tasks

This is a lightweight implementation checklist. The documents in `docs/` remain
the source of truth and should evolve when decisions change or implementation
teaches us something new.

## Phase 1: workspace and static web page

- [x] Create the pnpm workspace and root TypeScript configuration
- [x] Create `apps/web` with React and Vite
- [x] Render a static page
- [x] Create `apps/api` with Hono on Node.js
- [x] Expose and verify `GET /health`
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
- [x] Wire and test `POST /auth/signup`
- [x] Define login credentials and failure policy
- [x] Implement signup and login services with Argon2id
- [x] Wire and test `POST /auth/login`
- [x] Issue access JWTs from signup and login services
- [x] Implement opaque refresh-token rotation, reuse detection, and revocation
- [x] Wire and test `POST /auth/refresh`
- [x] Implement and test current-session logout service
- [x] Wire and test `POST /auth/logout`
- [x] Implement and test bearer authentication middleware
- [x] Implement and test `GET /auth/me`
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
- [ ] Implement recipes, ordered recipe ingredients, and cooking logs
- [ ] Add the explicit recipe-ingredients-to-shopping operation (deferred)
- [ ] Test tenancy and basic conflict behavior
- [ ] Complete the Phase 11 checkpoint and commit

## Phase 12: household lifecycle and management

- [ ] Define rules for renaming, ownership transfer, member removal, leaving, and household deletion or archival
- [ ] Add a household switcher with an explicit current-household route or state
- [ ] Build owner-only household settings and rename operations
- [ ] List members and pending invitations without exposing private account fields
- [ ] Implement invitation revocation, member removal, and member-initiated leaving
- [ ] Implement transactional ownership transfer without allowing an ownerless household
- [ ] Implement the documented household deletion or archival policy with explicit confirmation
- [ ] Test role changes, last-owner protection, cross-household isolation, and active-household fallback
- [ ] Complete the Phase 12 checkpoint and commit

## Phase 13: configurable built-in modules

- [ ] Define the shared code-owned module catalogue and stable keys for Shopping and Recipes
- [ ] Add and migrate household module settings with explicit defaults
- [ ] Backfill Shopping and Recipes as enabled for existing households
- [ ] Add owner-only operations to enable or disable a module for the whole household
- [ ] Synchronize enabled-module settings so navigation updates for every member
- [ ] Enforce enabled-module checks in API commands, Zero queries, Zero mutators, uploads, and cross-module operations
- [ ] Preserve module data while disabled and restore access when re-enabled
- [ ] Test forged access, concurrent toggles, cross-module operations, and household isolation
- [ ] Complete the Phase 13 checkpoint and commit

## Phase 14: R2 images

- [ ] Implement authorized direct uploads and confirmation
- [ ] Implement signed reads, deletion, type validation, and size limits
- [ ] Complete the Phase 14 checkpoint and commit

## Phase 15: design-system definition

- [ ] Audit the existing screens, interaction states, and repeated UI patterns
- [ ] Define the product's visual principles and accessibility baseline
- [ ] Define semantic tokens for color, typography, spacing, radii, shadows, and motion
- [ ] Define responsive layout rules and breakpoints
- [ ] Document shared token names and how each UI package maps them to its platform
- [ ] Document Base UI for web and Expo UI for the future React Native library
- [ ] Document component anatomy, variants, states, and usage guidance
- [ ] Complete the Phase 15 checkpoint and commit

## Phase 16: Base UI web component library

- [ ] Create the internal `@home-hub/ui-web` package for React DOM components
- [ ] Install Base UI as the unstyled accessible behavioral foundation for `ui-web`
- [ ] Implement web design tokens as CSS variables owned by `ui-web`
- [ ] Configure Tailwind to consume the `ui-web` semantic CSS variables
- [ ] Implement the first reusable primitives for buttons, fields, panels, alerts, and status indicators
- [ ] Add a lightweight development gallery for visual and interaction-state review
- [ ] Adopt the primitives in authentication, household selection, connection state, and Shopping
- [ ] Verify keyboard navigation, visible focus, labels, error states, disabled states, and responsive layout
- [ ] Reserve `@home-hub/ui-native`, built on Expo UI, for a future native implementation of the same documented design language
- [ ] Complete the Phase 16 checkpoint and commit

## Phase 17: production readiness and hardening

- [ ] Add readiness, graceful shutdown, and consistent errors
- [ ] Fill important integration-test gaps
- [ ] Reconcile the documentation with the implemented system
- [ ] Verify PostgreSQL restore and Zero replica rebuild procedures
- [ ] Decide whether application-shell caching is justified
- [ ] Verify a clean-checkout setup and production builds
- [ ] Complete the Phase 17 checkpoint and commit

## Phase 18: deploy to an online VPS

- [ ] Confirm the VPS, ARM architecture, operating system, domain, and public routing
- [ ] Build the production images and Caddy/Docker Compose configuration
- [ ] Configure production secrets, firewall rules, TLS, and private service networking
- [ ] Configure automated encrypted PostgreSQL backups outside the VPS
- [ ] Deploy the web application, API, `zero-cache`, PostgreSQL, and Caddy
- [ ] Verify authentication, synchronization, R2 access, health checks, restart behavior, and rollback
- [ ] Complete a production restore rehearsal and document routine operations
- [ ] Complete the Phase 18 checkpoint and commit

## Phase 19: deploy to and migrate onto the Raspberry Pi

- [ ] Verify ARM64 images and native dependencies for the complete production stack
- [ ] Validate SSD performance and durability, cooling, power protection, and available capacity
- [ ] Establish reliable HTTPS ingress despite dynamic IP, port-forwarding, or CGNAT constraints
- [ ] Rehearse a full restore and Zero replica rebuild on the Raspberry Pi before cutover
- [ ] Plan a maintenance window, final backup, DNS cutover, and VPS rollback window
- [ ] Migrate PostgreSQL and secrets, rebuild Zero, and switch production traffic
- [ ] Verify the full production journey and monitor stability before retiring the VPS
- [ ] Complete the Phase 19 checkpoint and commit

## Phase 20: French vocabulary as the first post-deployment module

- [ ] Define the smallest useful household vocabulary model and module-owned operations
- [ ] Register French Vocabulary in the built-in module catalogue, disabled by default
- [ ] Backfill disabled settings for existing households and set the new-household default
- [ ] Apply established household membership, module-enabled, and synchronization checks
- [ ] Build the vocabulary interface from the shared UI primitives
- [ ] Verify enabling, disabling with data retention, re-enabling, and household isolation
- [ ] Document the checklist for adding future modules such as household finance
- [ ] Complete the Phase 20 final checkpoint and commit
