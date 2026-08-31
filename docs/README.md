# Home Hub

Home Hub is a private application for people who share a household. Each
household enables the built-in modules it wants to use. Initial modules include:

- a shared shopping list;
- recipes and ordered recipe ingredients;
- recipe images stored outside the application server.

Connected changes should appear immediately and converge across clients. Previously synchronized data should remain readable without connectivity. Long-term offline writes are deliberately out of scope: editing becomes unavailable when the synchronization client determines that it is disconnected.

## Project planning

- [Tasks](./tasks.md) contains committed work in implementation order.
- [Task history](./task-history.md) preserves completed delivery phases.
- [Backlog](./backlog.md) contains optional improvements and possible future modules.
- Subject documents in this directory describe the currently implemented system and accepted decisions.

## Module documentation

- [Recipes](./recipes/) owns Recipes behavior, interface composition, data,
  synchronization, and image security.
- [Lists](./lists/) owns list behavior, interface composition, data,
  and synchronization.

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
pnpm --filter @home-hub/image-delivery dev
```

### Verification

```sh
pnpm test
pnpm check
pnpm typecheck
pnpm --filter @home-hub/web build
```

### Biome

```sh
pnpm biome lint --write path/to/file.ts
```
