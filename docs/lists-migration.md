# Shopping to Lists migration checkpoint

The learner has applied migrations `0015` and `0016` locally. The Lists UI and
API cutover are implemented; no further migration is needed for this UI batch.
The applied migration files are unchanged.

## Temporary compatibility

Production applies migrations before replacing the old API. Migration `0016`
therefore locks writes to the source tables while it copies existing data and
installs forward-mirroring triggers. Drizzle's migration transaction holds those
locks until commit, so a successful old write cannot fall between the snapshot
and trigger installation. Ordinary reads remain available; concurrent writes may
wait. A failed migration rolls back its data changes and trigger installation.

- Every existing household gets one Shopping list, including empty households.
- Item IDs, names, statuses, ordering, and timestamps are preserved.
- Shopping's enabled/disabled setting is copied to Lists without removing the
  original setting. Missing settings remain missing, preserving denied access.
- Subsequent Shopping inserts, updates, and deletes mirror into the new tables
  in the same transaction. Errors are not swallowed: both sides roll back.
- The old household-creation path inserts a Shopping module setting; its trigger
  creates the new list and mapping. A future household created with only a Lists
  setting starts with no lists, as agreed.
- A migration-owned `shopping_list_migration_links` table holds stable IDs so
  renaming or reordering a list cannot redirect subsequent Shopping writes.
  It is intentionally absent from the application schema and Zero publication.
- A missing mapping or missing update target fails explicitly. A deleted list is
  not silently recreated by an item edit. Item IDs/households cannot be changed.

This is a one-way deployment bridge, not a permanent dual-write architecture.
Shopping remains authoritative only until cutover. Do not expose concurrent Shopping
and Lists writers, manually edit mirrored rows, or use `TRUNCATE` on source
tables: row triggers cover the application's INSERT/UPDATE/DELETE operations,
not administrative truncation. No authorization bypass or public access is added.

## Implementation and checks

Use the normal test suite, type checks, and existing CI migration-history check.
There is no separate rehearsal script or manual concurrency-check requirement.
The learner still applies local migrations and creates commits manually.

The Zero schema and publication include Lists and list items. Queries check
household membership and enabled Lists access; detail items follow the composite
household/list relationship. The library orders lists by descending sort key.

List mutation definitions support create, rename, delete, reorder, and the
existing item add/reactivate, rename, status, and reorder behavior. They check
household/module access on the server and scope each child lookup to its list.
Normalized names are unique per household for lists and per list for items.
Deletion explicitly removes children for optimistic client updates as well as
the database cascade. Ordering normally changes one row; exhausted gaps trigger
rebalancing, preserving rows a stale client may not yet have seen.

The Lists mutation definitions are now registered in the live API. Shopping
queries, mutation names, and REST endpoints are no longer exposed. The module
catalogue, sidebar, default navigation, and settings use `lists`. Existing old
browser tabs must reload; their pending Shopping mutations are not accepted.
Legacy services and mutators remain unmounted for their existing test coverage
until cleanup. No new application path writes to Shopping tables/settings.

Once old writers are retired, a later reviewed cleanup migration must drop both
mirror triggers, their functions, and `shopping_list_migration_links`, followed
by the retired Shopping tables/settings/type and synchronization configuration.
Do not remove the bridge in a pre-deployment migration while old writers are
still running. After Lists accepts writes, the old Shopping tables are no longer
an up-to-date rollback source; application rollback needs a separate plan.
