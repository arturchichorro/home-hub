# Testing Guest access locally

Use the top branch of the open Guest stack, including the review cleanup.
The development web server generates Guest links using its current origin,
for example `http://127.0.0.1:5173/join#hhg_v1_…`. Production builds generate
`https://guest.achichorro.com/join#hhg_v1_…`.

Local testing does not require DNS changes, HTTPS, a hosts-file entry, or a
second web application. `/join` and the credential fragment select Guest mode
on either hostname. Zero uses `VITE_ZERO_CACHE_URL` locally; the production
Guest hostname uses same-origin `/zero` through Caddy.

## Prepare the local services

Use the existing root `.env`, following `.env.example`. Keep
`NODE_ENV=development` and `VITE_ZERO_CACHE_URL=http://localhost:4848`.
The API requires its normal database, account, and development image-storage
configuration even when testing Lists only.

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres
```

Migration `0029_milky_anita_blake.sql` must be applied before creating links.
Check the target database in your local `.env` before choosing to migrate:

```sh
# Run this yourself when ready to apply pending migrations to the LOCAL database.
pnpm db:migrate
```

The migration runner applies pending journal entries only. Do not manually
reapply `0027` or `0028`, regenerate the migration history, or reset the database.
No migrations were applied to the local or production database during the
Guest implementation or review cleanup.

```sh
# Reconcile the container configuration, including Guest auth revalidation.
docker compose up -d zero-cache
```

Start each development server in its own terminal:

```sh
pnpm --filter @home-hub/api dev
pnpm --filter @home-hub/web dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173` (or the port Vite reports). Use this origin
consistently: it also matches the documented development R2 CORS rule for
account uploads.

For image testing, additionally start:

```sh
pnpm --filter @home-hub/image-delivery dev
```

The API's `R2_BUCKET` must match the development Worker binding in
`apps/image-delivery/wrangler.jsonc`. The API root `.env` and ignored Worker
`.dev.vars` need the same development `IMAGE_DELIVERY_SIGNING_SECRET`; set
`IMAGE_DELIVERY_BASE_URL=http://127.0.0.1:8787`. This uses the existing remote
Cloudflare development resources, not an entirely offline image emulator.
See [deployment configuration](../deployment.md) for details.

## Exercise both access levels

1. Sign in as a household owner, enable Lists and Recipes, and create some data.
2. In household Settings → Guest access, create a **read** link. Leave expiration
   blank to test the 90-day default. Check copy, QR download, and print preview;
   the printed sheet should contain only the named link card.
3. Open the copied link in a private window. It should enter the existing
   household routes without login, show both enabled modules, hide household
   administration, and disable editing controls. View recipe images too.
4. Navigate between modules and reload a recipe route. The fragment must remain
   present and the same household must reopen. Guest startup requires the API
   to validate the link before opening cached data.
5. Create a separate **write** link and open it in another private browser
   session. Create/edit/reorder list items and recipes, manage ingredients and
   cooking logs, upload an image, and delete test content. Verify updates in
   the owner's window. Recipe-child deletion remains recoverable.
6. Disable Recipes as the owner. Guest Recipes queries and image operations
   must be denied while Lists still works. Re-enable it to continue testing.
7. Permanently disable a link while its Guest window is open. New API and Zero
   writes must fail; the active Zero connection should lose access on its next
   one-second revalidation cycle, allowing for in-flight requests. Reloading
   the link must return to `/join` without opening its cache.
8. Create a short-expiration link and repeat the expiry check. Unknown/malformed
   links also fail without exposing household details. The **Leave** action
   clears the current fragment and memory but does not disable other copies.
9. Confirm normal account login, household settings, and media still work.

In browser Network tools, ordinary Guest API requests use
`Authorization: Bearer hhg_v1_…`. Zero receives the exact same credential.
Guest image GET/PUT requests go through `/api/.../content`; their URLs contain
no secret. Blob URLs displayed by images refer to bytes already downloaded in
memory, not another access credential. Do not copy credentials into logs,
console commands, browser storage, or screenshots intended for sharing.

A phone cannot reach the computer through a `127.0.0.1` QR. The steps above test
in desktop browsers. Phone testing additionally needs reachable web/API/Zero
addresses and corresponding development network configuration.
