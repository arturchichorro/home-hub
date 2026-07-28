# Home Hub

Home Hub is a private application for people who share a household. Household members collaborate on:

- a shared shopping list;
- recipes and ordered recipe ingredients;
- recipe images stored outside the application server.

Connected changes should appear immediately and converge across clients. Previously synchronized data should remain readable without connectivity. Long-term offline writes are deliberately out of scope: editing becomes unavailable when the synchronization client determines that it is disconnected.

## Useful commands

### Local database

```sh
docker compose up -d postgres
docker compose exec postgres psql -U home_hub -d home_hub
```

TablePlus connection:

```text
postgres://home_hub:home_hub@127.0.0.1:5432/home_hub
```

After changing the Drizzle schema, generate and inspect the SQL before applying it:

```sh
pnpm db:generate
pnpm db:migrate
```

### Development servers

```sh
pnpm --filter @home-hub/api dev
pnpm --filter @home-hub/web dev
```

### Verification

```sh
pnpm test
pnpm check
pnpm --filter @home-hub/api typecheck
pnpm --filter @home-hub/web typecheck
pnpm --filter @home-hub/web build
```

## Todo

- [ ] separate concerns (db, methods, etc)

## Notes

- household invite revokation is not implemented (but there's a column in household_invites for it, revoked_at)
