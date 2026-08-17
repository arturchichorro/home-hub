# Home Hub backlog

This document contains optional future improvements and modules in approximate
implementation order. The order expresses current preference or dependency,
not a commitment or schedule. Work may be reordered whenever priorities change.

When an item becomes active, move it to [Tasks](./tasks.md), define a concrete
completion sequence, and update the relevant subject documents if its product
scope or technical decisions have become accepted.

## Improvements

### 1. Edit shopping items

- [ ] Define which shopping-item fields can be edited
- [ ] Implement the authorized operation and interface
- [ ] Verify household isolation, normalization, and concurrent edits

### 2. Add recipe ingredients to Shopping

- [ ] Define how ingredient names and quantities map to shopping items
- [ ] Require both Recipes and Shopping to be enabled
- [ ] Implement an explicit authorized cross-module operation
- [ ] Verify duplicate-name reactivation, household isolation, and partial-failure behavior

### 3. Publish safe member profiles through Zero

- [ ] Define the minimal non-private user fields household members may see
- [ ] Add the safe projection to the Zero publication and authorized queries
- [ ] Replace the temporary member-loading behavior that causes interface flashing
- [ ] Verify that private account fields and users from other households remain inaccessible

### 4. Adopt a shared icon library

- [ ] Choose a library that fits the web UI and licensing requirements
- [ ] Replace one-off inline SVG icons
- [ ] Verify accessible names, sizing, and visual consistency

### 5. Improve internal separation of concerns

- [ ] Identify concrete places where database access, domain behavior, and transport code are coupled
- [ ] Refactor one boundary at a time without introducing generic abstractions prematurely
- [ ] Keep authorization and transaction requirements explicit and covered by tests

### 6. Add module-specific documentation

- [ ] Define a small documentation template for module scope, data, operations, and security rules
- [ ] Document Shopping and Recipes from the implemented behavior
- [ ] Require the same documentation when a future module becomes active

## Future modules and capabilities

### 1. French Vocabulary

- [ ] Define the smallest useful household vocabulary model and module-owned operations
- [ ] Register French Vocabulary in the built-in module catalogue, disabled by default
- [ ] Backfill disabled settings for existing households and set the new-household default
- [ ] Apply established household membership, module-enabled, and synchronization checks
- [ ] Build the vocabulary interface from the shared UI primitives
- [ ] Verify disabling with data retention, re-enabling, and household isolation
- [ ] Document what this module teaches us about adding future modules

### 2. Personal lists

- [ ] Decide whether personal todos and wish lists belong in one module or separate modules
- [ ] Define user-owned authorization and synchronization boundaries outside household scope

### 3. Multiple household lists

This is currently a deliberate non-goal in [Product](./product.md). Reconsider
that decision before treating this as implementation work.

- [ ] Define the concrete need for multiple household lists
- [ ] Decide whether shopping lists, wish lists, and todo lists share a domain model
- [ ] Update the accepted product scope before moving this item to `tasks.md`

### 4. Goals

- [ ] Define whether goals are personal, household-owned, or both
- [ ] Define the smallest useful workflow before designing the data model

### 5. Household finance

- [ ] Define the product boundary, privacy model, and threat model
- [ ] Decide whether financial information can safely use the existing household permission model
