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
- [ ] Run PostgreSQL locally with logical replication
- [ ] Define the initial Drizzle schema
- [ ] Generate, inspect, and apply the first committed SQL migration
- [ ] Complete the Phase 2 checkpoint and commit

## Phase 3: normalization

- [ ] Implement and test username normalization
- [ ] Implement and test item-name normalization
- [ ] Complete the Phase 3 checkpoint and commit

## Phase 4: authentication

- [ ] Implement signup and login with Argon2id
- [ ] Issue and verify short-lived access JWTs
- [ ] Implement opaque refresh-token rotation, reuse detection, and revocation
- [ ] Implement refresh, logout, bearer authentication, and `/auth/me`
- [ ] Complete the Phase 4 checkpoint and commit

## Phase 5: households

- [ ] Create households and owner memberships transactionally
- [ ] List households for the authenticated user
- [ ] Prove rollback behavior
- [ ] Complete the Phase 5 checkpoint and commit

## Phase 6: invites and isolation

- [ ] Implement secure household invites and transactional acceptance
- [ ] Test expiry, single use, and cross-household isolation
- [ ] Complete the Phase 6 checkpoint and commit

## Phase 7: online shopping slice

- [ ] Implement catalog and shopping operations against PostgreSQL
- [ ] Enforce normalization, tenancy, references, and status transitions
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

- [ ] Complete shopping status and catalog operations
- [ ] Implement recipes and ordered recipe ingredients
- [ ] Test tenancy and basic conflict behavior
- [ ] Complete the Phase 11 checkpoint and commit

## Phase 12: R2 images

- [ ] Implement authorized direct uploads and confirmation
- [ ] Implement signed reads, deletion, type validation, and size limits
- [ ] Complete the Phase 12 checkpoint and commit

## Phase 13: hardening

- [ ] Add readiness, graceful shutdown, and consistent errors
- [ ] Fill important integration-test gaps
- [ ] Reconcile the documentation with the implemented system
- [ ] Decide whether application-shell caching is justified
- [ ] Verify a clean-checkout setup and production builds
- [ ] Complete the final checkpoint and commit
