# Home Hub

Home Hub is a private application for people who share a household. Each
household enables the built-in modules it wants to use. Initial modules include:

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

### Biome

```sh
pnpm biome lint --write path/to/file.ts
```

## Todo

- [ ] separate concerns (db, methods, etc)
- [ ] criar cenas de docs separadas por features (uma para shopping items, outra para recipes, outra para learn french, etc)
- [ ] adicionar quantidades a shopping list items
- [ ] adicionar feature de transformar recipes em cenas que posso adicionar à shopping list
- [ ] move away de random ass inline svg icons, usar uma icon library
- [ ] fix flashing de household_members ao adicionar uma versão segura de users à publication de zero
- [ ] tem de ser possível editar um shopping item

## Ideias
- [ ] personal scoped todo list / wish list / wtv -> sem ser household scoped
- [ ] household shopping list -> transformar em várias listas, emq dá para adicionar listas diferentes na mesma household (tp wishlist / shopping list / todo list)
- [ ] goals module

## Notes

- Household invitation revocation is planned as part of the household
  management phase; the schema already contains `household_invites.revoked_at`.
