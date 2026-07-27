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

- Shopping provides a shared item catalog and one active shopping list.
- Recipes provides shared recipes and their ingredients.
- French vocabulary provides a simple shared collection for learning words and
  expressions.

Modules own their feature-specific tables, services, API or Zero operations,
and user interface. They are not dynamically installed plugins, and there is
no generic module registry or generic user-defined data model.

All implemented modules are available to all members of a household initially.
There are no per-module roles or permissions.

## Cross-module behavior

Modules remain mostly independent and interact through explicit operations
when the product requires it. For example, adding a recipe's ingredients to the
shopping list is a deliberate operation between Recipes and Shopping through
their shared item catalog.

Do not add a general event system or allow modules to reach arbitrarily into
one another's internals. Introduce a shared concept only after at least two
modules genuinely need the same domain entity.

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
