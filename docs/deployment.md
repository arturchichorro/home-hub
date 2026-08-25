# Deployment

This document owns deployment and recovery procedures. The runtime topology is
defined in [Architecture](./architecture.md#production-topology), production
security requirements in
[Security and synchronization](./security-and-sync.md#production-network-and-recovery-boundary),
and remaining work in [Tasks](./tasks.md).

## Deployment sequence

Production is introduced in two deliberate stages:

1. deploy and operate the application on an online VPS;
2. validate a Raspberry Pi as a production host, then migrate with a tested
   rollback path.

The first production deployment is an OVHcloud VPS-1 in Gravelines, France,
running Ubuntu Server 26.04 LTS on AMD64. It runs a single Docker Compose
project containing:

- Caddy;
- the compiled React/Vite application;
- the Hono Node API;
- one self-hosted `zero-cache`;
- PostgreSQL.

Cloudflare R2 remains external and stores recipe image bytes.

The VPS includes OVHcloud's standard daily backup retained for 24 hours. The
optional manual snapshot service is useful before risky maintenance, but
neither replaces the off-provider PostgreSQL backups required below.

## Public routing

Caddy is the only public entry point to services running on the VPS. It:

- listens on ports 80 and 443;
- obtains and renews HTTPS certificates;
- serves the compiled SPA and falls back to `index.html` for client routes;
- proxies public API traffic to Hono;
- proxies Zero HTTP and WebSocket traffic to `zero-cache`.

PostgreSQL and direct container ports are not published to the internet. The
application uses one public origin, `https://home.achichorro.com`. Caddy serves
the SPA at that origin, proxies `/api/*` to Hono, and proxies `/zero/*` HTTP and
WebSocket traffic to `zero-cache`. Production configuration must keep the
`/api/auth` refresh-cookie path, Zero callback URLs, and
`VITE_ZERO_CACHE_URL` aligned with this routing. The browser uses the same
origin for the SPA and API, so production does not require cross-origin API
access. Direct recipe-image uploads use the separate R2 origin. Display reads
use the authorization Worker at `https://images.home.achichorro.com`; the
module-specific R2 CORS policy is documented in
[Recipes image storage and security](./recipes/#image-storage-and-security).
The private backup bucket does not use this browser CORS policy.

## Cloudflare image delivery Worker

`apps/image-delivery` owns the independently deployed Worker that reads private
recipe originals through an R2 binding and transforms them through an Images
binding. Its development configuration targets `home-hub-dev`; its production
environment targets `home-hub-production` and the custom domain
`images.home.achichorro.com`. Confirm those bucket names against the actual
Cloudflare account before deployment.

Generate one independent high-entropy signing secret of at least 32 bytes. Put
the same value in the API's untracked `IMAGE_DELIVERY_SIGNING_SECRET` production
environment variable and in the Worker's encrypted production secret. Do not
reuse `API_JWT_SECRET`, an R2 credential, or a Zero password. Set
`IMAGE_DELIVERY_BASE_URL=https://images.home.achichorro.com` for the production
API.

Initial Cloudflare setup is deliberate and manual:

```bash
pnpm --filter @home-hub/image-delivery exec wrangler login
pnpm --filter @home-hub/image-delivery exec wrangler secret put \
  IMAGE_DELIVERY_SIGNING_SECRET --env production
pnpm --filter @home-hub/image-delivery deploy:production
```

The Cloudflare account must have Images transformations available, the custom
domain must be in the account's zone, and the deploying identity must be able
to deploy Workers and bind the production R2 bucket. `wrangler deploy --dry-run
--env production` validates bundling without changing Cloudflare resources.

For local development, put the same development-only secret in the root `.env`
and the ignored `apps/image-delivery/.dev.vars`, start the Worker with `pnpm
--filter @home-hub/image-delivery dev`, and keep
`IMAGE_DELIVERY_BASE_URL=http://127.0.0.1:8787`. Remote Worker development reads
the configured development R2 bucket, so never point it at production.

Deploy a backward-compatible Worker before releasing an API version that emits
its capability URLs. The VPS deployment script does not deploy Cloudflare
resources. Roll back the Worker by deploying the previously verified revision;
the five-minute capability format must remain supported across the API/Worker
rollout window.

## Persistent state

PostgreSQL is authoritative for application rows and Zero's PostgreSQL-backed
metadata. Use a named volume on SSD storage and back up the complete database,
including all schemas.

`zero-cache` keeps a SQLite replica on fast local storage. A named volume avoids
unnecessary rebuilds during ordinary container restarts, but the replica is
disposable: if it is missing, Zero resynchronizes it from PostgreSQL.

The API exposes `/api/health` as a process liveness check and `/api/ready` as a
readiness check backed by a lightweight PostgreSQL query. Route public health
monitoring to the appropriate endpoint: liveness must not fail merely because
PostgreSQL is temporarily unavailable, while readiness must return `503` until
the API can use its required database. On `SIGINT` or `SIGTERM`, the API stops
accepting connections, allows active requests a bounded drain period, and then
closes its PostgreSQL pool.

R2 objects are independent of the VPS. PostgreSQL stores only their metadata,
so a database backup does not contain image bytes.

## Backup requirements

- Create automated PostgreSQL backups outside the VPS in a dedicated private
  Cloudflare R2 bucket. R2 provides automatic AES-256 encryption at rest and
  TLS in transit; client-managed backup encryption keys are intentionally
  deferred until the application's threat model justifies their recovery cost.
- Back up every PostgreSQL schema, including Zero-owned schemas.
- Test restoration periodically; an untested backup is not a recovery plan.
- Keep production environment secrets encrypted and separate from Git and
  database dumps.
- Define an independent retention policy for R2 objects.
- Do not treat a Docker volume or same-host VPS snapshot as the only backup.

## Online VPS

The VPS is the first real production environment. Before launch, define the
domain and routing, production secrets, host firewall, off-host encrypted
backups, restore and rollback procedures, and routine upgrade process. Verify
the application after both container restarts and a host reboot.

`compose.production.yml` owns the production stack. Only its `web` service
publishes host ports; PostgreSQL, the API, and `zero-cache` remain reachable
only inside the Compose network. Runtime secrets come from an untracked
`.env.production` file based on `.env.production.example` and are passed only
to the services that require them.

### Production database inspection

PostgreSQL additionally binds its container port to `127.0.0.1:5432` on the
VPS for administrative access. It must never bind to `0.0.0.0`, and port 5432
must not be allowed through UFW. TablePlus connects to database host
`127.0.0.1`, port `5432`, database and user `home_hub`, using the production
PostgreSQL password, with its SSH tunnel pointed at the VPS as user `ubuntu`
and authenticated by the dedicated VPS private key. The tunnel encrypts the
connection and keeps PostgreSQL unavailable from the public internet.

Schema migrations are never coupled to normal service startup. The `migrate`
service remains an explicitly invoked, one-shot tool. The production deployment
script invokes it after CI has rehearsed the migration history and after an
off-host backup has succeeded, but ordinary container restarts never migrate
the database.

### Manual release and rollback

Before a manual release, record the currently deployed Git revision and create
an off-host PostgreSQL backup. Pull with `git pull --ff-only`, build the release
images, apply the already reviewed and tested forward migrations through the
one-shot `migrate` service, and recreate the application services. Finish by
checking API readiness, Zero keepalive, and one authenticated synchronization
flow.

A routine rollback is a **code-only rollback** to the recorded Git revision:
check out that revision, rebuild the `api` and `web` images, recreate those two
services, and repeat the health and application checks. This is safe only when
the older application remains compatible with the current database schema.
Database migrations are not automatically reversed.

If a release contains a backward-incompatible migration, restoring PostgreSQL
is a separate disaster-recovery decision. It requires a maintenance window and
explicit acceptance that writes made after the selected backup may be lost.
Never perform or automate a production database restore as part of an ordinary
application rollback.

### Automatic code deployment

`scripts/deploy-production.sh` is the sole command authorized for the
dedicated GitHub Actions deployment key. It serializes deployments with a host
lock, requires a clean `main` checkout and a fast-forward update, creates an
off-host PostgreSQL backup, pulls the verified revision, builds all release
images, applies pending forward migrations with the one-shot `migrate` service,
starts the new services, waits for container health, and verifies the public
web, API readiness, and Zero keepalive routes. A migration failure stops the
deployment before the new application containers are started. The script never
reverses a migration or restores a database backup automatically.

Destructive or backward-incompatible migrations are not routine deployments.
They require an explicit staged compatibility plan, a reviewed rollback and
restore decision, and deliberate operator involvement.

The GitHub repository uses `develop` as its default integration branch and
protected `main` as its production branch. CI runs on pushes and pull requests.
The deployment job runs only after verification succeeds for a push to `main`,
and only that job can read the `production` environment's SSH material. The
VPS accepts that key only with `restrict` and a forced command pointing to the
deployment script.

### CI and deployment troubleshooting

Run the CI checks locally in the same order before investigating a runner-only
failure:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm test

pnpm --filter @home-hub/database zero:generate
pnpm exec biome format --write packages/shared/src/zero/schema.gen.ts
git diff --exit-code -- packages/shared/src/zero/schema.gen.ts

pnpm db:generate
git status --short -- packages/database/drizzle

VITE_ZERO_CACHE_URL=https://home.achichorro.com/zero \
  pnpm --filter @home-hub/web build
```

Zero generation is expected to print warnings about database defaults; the
check fails only when formatted generated output differs. Drizzle generation
must report that there is nothing to migrate and leave its directory clean. CI
then applies the complete migration history to a disposable PostgreSQL 17
database. Running that final rehearsal locally requires a disposable database;
do not point it at production.

If `verify` fails, inspect its first failing step; production deployment will
not start. If `Deploy production` fails, use the stage that failed to narrow
the investigation:

- SSH setup or connection: verify the environment secret and variable names,
  the pinned host fingerprint, and the restricted public key without printing
  private key material.
- Migration rehearsal failure: correct the committed migration chain before
  merging; no production deployment has started.
- Production migration failure: inspect the migration output and database state
  before retrying. Do not automatically restore the backup or reverse SQL.
- Backup failure: run the backup script directly on the VPS and inspect
  `home-hub-backup.service` in the system journal.
- Build, startup, or health failure: inspect Compose state and bounded service
  logs, then call the public readiness routes directly.

Useful production diagnostics are:

```bash
cd /opt/home-hub
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml \
  logs --tail=200 api zero-cache web postgres
curl -i https://home.achichorro.com/api/ready
curl -i https://home.achichorro.com/zero/keepalive
sudo journalctl -u home-hub-backup.service -n 50 --no-pager
```

Do not print environment files, private keys, database URLs, or GitHub secrets
while investigating. Do not repeatedly retry a failed deployment until its
cause is understood. A failed code deployment never authorizes an automatic
database restore or migration rollback.

`scripts/backup-production-postgres.sh` creates a PostgreSQL custom-format
dump containing every database schema, validates the archive before upload,
and copies it to the dedicated private R2 backup bucket. Its temporary local
dump is removed on every exit. R2 credentials live only in the untracked,
owner-readable `.env.backup` file on the production host.

The `home-hub-backup.timer` systemd timer invokes that script every Sunday at
03:15 UTC with up to 15 minutes of randomized delay. A persistent timer runs a
missed backup after the host next starts. Backup outcomes are recorded in the
system journal under `home-hub-backup.service`.

Objects below the backup bucket's `postgres/` prefix have a 30-day deletion
lock and expire after 90 days. The lock applies to existing and new backups and
takes precedence over lifecycle deletion. At the current weekly frequency,
the bucket retains roughly thirteen PostgreSQL recovery points.

`scripts/verify-production-backup.sh` downloads the newest backup by default,
restores it into a network-isolated PostgreSQL 17 container with temporary
storage, and verifies application tables, Drizzle migration history, and the
Zero publication. It never connects to the production PostgreSQL service and
removes the downloaded dump and disposable database on every exit. Pass a
specific object path below `postgres/` to rehearse an older recovery point.

### Restore rehearsal record

On 14 August 2026,
`postgres/2026/08/home-hub-20260814T124559Z.dump` restored successfully into
the isolated PostgreSQL 17 verifier. The restored database contained 11 public
application tables, 13 applied Drizzle migrations, and 8 tables in the
`home_hub_zero` publication. Production PostgreSQL was not contacted during
the rehearsal.

### Restart rehearsal record

On 14 August 2026, the complete VPS was rebooted. PostgreSQL, the API,
`zero-cache`, and Caddy returned healthy through their restart policies; the
backup timer returned to its waiting state; public API readiness and Zero
keepalive returned `200`; and existing application rows and R2 images remained
available.

## Moving to the Raspberry Pi

The future Raspberry Pi 16 GB with SSD can use the same topology if it passes an
operational compatibility check:

1. Verify Linux ARM64 images for Caddy, PostgreSQL, `zero-cache`, and the API,
   including native Argon2id support.
2. Verify SSD latency, capacity, durability, and power-loss protection are
   adequate for PostgreSQL and the Zero SQLite replica.
3. Provide reliable inbound HTTPS through DNS and the home network; account for
   dynamic addressing, port forwarding, or CGNAT.
4. Restore a recent backup on the Pi and rebuild Zero as a rehearsal before the
   production cutover.
5. Define a maintenance window, DNS plan, acceptable downtime, and conditions
   for switching traffic back to the VPS.
6. Stop writes or perform a controlled final backup.
7. Restore the complete PostgreSQL database and production secrets.
8. Start `zero-cache` and allow its replica to rebuild before serving clients.
9. Repoint DNS and verify API health, Zero synchronization, authentication, and
   R2 access.
10. Keep the VPS intact for the documented rollback window and retire it only
    after the Pi has demonstrated stable operation.

The Zero replica does not need to be copied for correctness, although preserving
or backing it up may reduce migration downtime. PostgreSQL and R2 remain the
durable data sources.
