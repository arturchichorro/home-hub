# Lists migration and cleanup

Migrations `0015` and `0016` have been applied locally and in production. The
user confirmed that the deployed Lists module works. The previous module's
writers are retired, so cleanup migration `0017_retire-shopping.sql` is ready
for the next deployment. It has not been applied as part of preparing this change.

## Schema selection

Migration `0015` explicitly creates and references its objects in `public`.
Production's default search path previously selected Zero's `home_hub` schema
because it matches the database role, causing the original foreign key to fail.
Databases that already applied it successfully in `public` need no rerun or
migration-history reset.

Application and migration connections explicitly set `search_path=public`
through a shared connection-URL helper. This protects unqualified runtime
queries and future generated migrations. Zero's internal schema and upstream
connection settings are unchanged. The existing CI migration-history check
creates an empty `home_hub` schema first to reproduce the production collision.

## Cleanup migration

Migration `0016` copied existing items into one named Shopping list per household,
preserving IDs, statuses, order, timestamps, and module enablement. Its temporary
forward-mirroring triggers bridged the original deployment, which migrates before
replacing the API. Lists is now the only writer; those source records are stale.

Migration `0017` removes, in order:

1. Both mirroring triggers and their functions. This must happen first: deleting
   a legacy module setting while its trigger exists would delete the Lists setting.
2. Only module settings with `module_key = 'shopping'`.
3. `shopping_items` from the Zero publication.
4. `shopping_list_migration_links`, `shopping_items`, and `shopping_item_status`.

The migration never writes to `lists` or `list_items`. Names, current items,
ordering, and Lists enablement remain unchanged, including any list named
Shopping. It does not use `CASCADE`; unexpected dependencies fail visibly.
Drizzle applies the migration transactionally.

The application no longer exports legacy services, validators, mutators, table
definitions, or module-key exceptions. The generated Zero schema excludes the
retired table. Historical migrations and migration snapshots remain intact for
existing database history and fresh installations. Tests may still mention
Shopping to verify that the retired interfaces are rejected, or as a list name.

## Applying the change

Apply the generated migration locally with `pnpm db:migrate`, then commit and
merge the change to `main`. The normal deployment takes an off-host backup,
applies migration `0017`, and replaces the API/web images. No manual table drops,
environment changes, or Zero data-volume deletion are needed. Reload existing
browser tabs after deployment to use the updated client schema.

Do not deploy this cleanup directly over the pre-Lists application. This
production instance has already completed that prerequisite. Once applied,
recovering the retired source tables requires a backup; do not roll back to the
pre-Lists application. Current Lists data is not removed by cleanup.

Use the normal test suite, type checks, and existing CI migration-history check,
which also asserts that retired database objects are absent. There is no
separate rehearsal script. The learner applies local migrations and commits.
