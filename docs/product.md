# Product

## Purpose

Home Hub is a private application for groups of people who share a household.
A user may belong to multiple households, and a household may contain any
number of members.

The household is the collaboration and authorization boundary. Data belonging
to one household must never be visible or mutable through membership in
another household.

## Built-in modules

Home Hub is organized into small built-in modules:

- Shopping provides one shared shopping list.
- Recipes provides shared recipes and their ingredients.
- French vocabulary provides a simple shared collection for learning words and
  expressions.

Modules own their feature-specific tables, services, API or Zero operations,
and user interface. They are not dynamically installed plugins, and there is
no generic module registry or generic user-defined data model.

The modules share one documented visual language and a small set of accessible,
platform-specific UI primitives. The web library builds on Base UI; the future
native library builds on Expo UI. Those foundations standardize
presentation and interaction without pretending web and native rendering or
accessibility behavior is identical, owning module behavior, or becoming a
generic domain abstraction.

All implemented modules are available to all members of a household initially.
There are no per-module roles or permissions.

## Cross-module behavior

Modules remain mostly independent and interact through explicit operations
when the product requires it. For example, adding a recipe's ingredients to the
shopping list is a deliberate operation that copies the ingredient names into
Shopping and inserts or reactivates the corresponding shopping rows.

Do not add a general event system or allow modules to reach arbitrarily into
one another's internals. Shopping items and recipe ingredients are separate
domain records. Introduce a shared entity only when concrete behavior requires
shared identity or metadata rather than merely copying values.

## Initial household rules

- Household names do not need to be unique.
- Each household has exactly one owner.
- Other household users are members.
- A future administrator role may be considered if a real permission need
  appears, but it is not part of the initial model.
- Membership and ownership changes are online-only API operations.

## Deliberate non-goals

- dynamically installed or third-party modules;
- per-module membership and permissions;
- a generic schema for arbitrary household data;
- multiple shopping lists;
- artificial limits on the number of household members;
- long-term offline writes.
