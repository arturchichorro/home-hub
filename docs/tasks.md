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
- [ ] Complete the Phase 7 checkpoint and commit

## Phase 8: read-only Zero synchronization

- [ ] Add the Zero schema and self-hosted `zero-cache`
- [ ] Add JWT-authenticated named queries and the API query endpoint
- [ ] Demonstrate synchronized reads in two browser contexts
- [ ] Complete the Phase 8 checkpoint and commit

## Phase 9: optimistic mutation

- [ ] Implement one authorized custom shopping mutator
- [ ] Verify optimistic behavior, convergence, and forged-ID rejection
- [ ] Complete the Phase 9 checkpoint and commit

## Phase 10: connection-state UX

- [ ] Display Zero connection state and gate writes appropriately
- [ ] Preserve cached reads and unsaved form text while disconnected
- [ ] Complete the Phase 10 checkpoint and commit

## Phase 11: shopping and recipes

- [ ] Complete shopping status and item-editing operations
- [ ] Implement recipes and ordered recipe ingredients
- [ ] Add the explicit recipe-ingredients-to-shopping operation
- [ ] Test tenancy and basic conflict behavior
- [ ] Complete the Phase 11 checkpoint and commit

## Phase 12: R2 images

- [ ] Implement authorized direct uploads and confirmation
- [ ] Implement signed reads, deletion, type validation, and size limits
- [ ] Complete the Phase 13 checkpoint and commit

## Phase 13: hardening

- [ ] Add readiness, graceful shutdown, and consistent errors
- [ ] Fill important integration-test gaps
- [ ] Reconcile the documentation with the implemented system
- [ ] Build and rehearse the Caddy/Docker Compose production deployment
- [ ] Verify PostgreSQL restore and Zero replica rebuild procedures
- [ ] Decide whether application-shell caching is justified
- [ ] Verify a clean-checkout setup and production builds
- [ ] Complete the final checkpoint and commit

## Phase 14: French vocabulary

- [ ] Define the smallest useful shared vocabulary model
- [ ] Apply established household authorization and synchronization patterns
- [ ] Complete the Phase 12 checkpoint and commit
