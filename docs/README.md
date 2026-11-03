# Home Hub

Home Hub is a private application for people who share a household. Each
household enables the built-in modules it wants to use. Implemented modules include:

- named, orderable shared lists;
- recipes and ordered recipe ingredients;
- recipe images stored outside the application server;
- opt-in [Habits](./habits/) with a today-first list, personal daily completions and on-demand monthly history;
- opt-in [Workouts](./workouts/) with a shared exercise catalog, reference pictures and author-private autosaved sets/history.

Connected changes should appear immediately and converge across clients. Previously synchronized data should remain readable without connectivity. Long-term offline writes are deliberately out of scope: editing becomes unavailable when the synchronization client determines that it is disconnected.

## Project planning

- [Tasks](./tasks.md) tracks remaining commitments and clearly labels unmerged review work.
- [Task history](./task-history.md) preserves completed delivery phases.
- [Backlog](./backlog.md) contains optional improvements and possible future modules.
- Subject documents describe the system on `develop` and accepted decisions, not pending PR behavior or a guarantee of what is deployed. Release/deployment state is separate.

## Module documentation

- [Recipes](./recipes/) owns Recipes behavior, interface composition, data,
  synchronization, and image security.
- [Lists](./lists/) owns list behavior, interface composition, data,
  and synchronization.

- [Habits](./habits/) owns shared habits, personal completion tracking, calendar views,
  data and authorization.

- [Logs](./logs/) owns opt-in shared topics, colored categories, daily manual notes,
  conflict-safe editing and retained history.

- [Documents](./documents/) owns opt-in household file rows, reusable colored tags,
  private upload/download, replacement and retention.

- [Workouts](./workouts/) owns shared definitions/catalog/media and private logging/history.
- [Shared media](./media/) owns reusable asset storage, delivery and attachment security.
- [Maintenance](./maintenance.md) records editing boundaries, bounded views and measured audit follow-ups.

## Feature specifications and historical plans

- [Guest access](./guest-access/) specifies accountless, household-scoped
  access through revocable QR codes while reusing the existing module
  interfaces. The prototype review stack is not part of `develop`; see [Tasks](./tasks.md#work-in-review).
- [Shared media foundation plan](./plans/shared-media.md) is a completed historical design, not pending implementation.

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
