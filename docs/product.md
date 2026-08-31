# Product

This document owns product scope and behavior. See
[Security and synchronization](./security-and-sync.md) for the authoritative
permission rules and [Architecture](./architecture.md) for implementation
boundaries.

## Purpose

Home Hub is a private application for groups of people who share a household.
A user may belong to multiple households, and a household may contain any
number of members.

The household is the collaboration and authorization boundary. Data belonging
to one household must never be visible or mutable through membership in
another household.

## Built-in modules

Home Hub is organized into small built-in modules:

- [Lists](./lists/) provides multiple named, manually ordered shared lists.
- [Recipes](./recipes/) provides shared recipes, their ingredients, cooking
  history, and images.
- French Vocabulary is a deferred module for learning words and expressions.
- Further built-in modules, such as household finance, may be added when their
  product boundaries are understood.

Modules own their feature-specific tables, services, API or Zero operations,
and user interface. They are not dynamically installed plugins, and there is
no generic user-defined data model. A small code-owned catalogue gives each
implemented module a stable key and explicit default state.

The modules share one documented visual language and a small set of accessible,
platform-specific UI primitives. The web library builds on Base UI; the future
native library builds on Expo UI. Those foundations standardize
presentation and interaction without pretending web and native rendering or
accessibility behavior is identical, owning module behavior, or becoming a
generic domain abstraction.

Each household owner chooses which implemented modules are enabled for that
household. The setting applies equally to every member; there are no per-module
roles or per-member module permissions. Core household selection and management
are always available and are not configurable modules.

Disabling a module hides its navigation and blocks its server-side queries,
mutations, uploads, and integrations. It does not delete the module's data.
Re-enabling it restores access. Lists and Recipes are enabled by default to
preserve the initial product, while later modules default to disabled unless a
specific product decision says otherwise.

## Cross-module behavior

Modules remain mostly independent and interact through explicit operations
when the product requires it. For example, adding a recipe's ingredients to the
selected list would be a deliberate operation that copies ingredient names into
Lists and inserts or reactivates the corresponding items. This is not implemented yet.

Do not add a general event system or allow modules to reach arbitrarily into
one another's internals. List items and recipe ingredients are separate
domain records. Introduce a shared entity only when concrete behavior requires
shared identity or metadata rather than merely copying values.

## Household behavior

- Household names do not need to be unique.
- Each household has exactly one owner.
- Other household users are members.
- Owners may rename the household, revoke invitations, remove members, transfer
  ownership, and configure modules.
- Members may leave a household.
- No operation may leave a household without exactly one owner.
- A future administrator role may be considered if a real permission need
  appears, but it is not part of the initial model.
- Membership, ownership, module configuration, and destructive household
  changes are online-only API operations.

The exact authorization, privacy, and transaction-locking requirements for
these operations are defined in
[Security and synchronization](./security-and-sync.md#household-management-and-module-configuration).

## Deliberate non-goals

- dynamically installed or third-party modules;
- per-member module permissions;
- a generic schema for arbitrary household data;
- artificial limits on the number of household members;
- long-term offline writes.
