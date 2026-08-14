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

Caddy is the only public application entry point. It:

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
access.

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

Schema migrations are never coupled to normal service startup. The `migrate`
service is an explicitly invoked tool: review the generated SQL, run that
service manually, and only then start or update the application services.

`scripts/backup-production-postgres.sh` creates a PostgreSQL custom-format
dump containing every database schema, validates the archive before upload,
and copies it to the dedicated private R2 backup bucket. Its temporary local
dump is removed on every exit. R2 credentials live only in the untracked,
owner-readable `.env.backup` file on the production host.

The `home-hub-backup.timer` systemd timer invokes that script every Sunday at
03:15 UTC with up to 15 minutes of randomized delay. A persistent timer runs a
missed backup after the host next starts. Backup outcomes are recorded in the
system journal under `home-hub-backup.service`.

Do not treat the VPS as a disposable rehearsal: it remains the rollback target
while the Raspberry Pi is being proven.

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
