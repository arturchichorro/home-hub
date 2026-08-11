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

The first production deployment is one OVHcloud VPS in Brussels. It runs a
single Docker Compose project containing:

- Caddy;
- the compiled React/Vite application;
- the Hono Node API;
- one self-hosted `zero-cache`;
- PostgreSQL.

Cloudflare R2 remains external and stores recipe image bytes.

This is the target architecture, not the currently deployed environment.
Before purchasing the host, confirm that the selected Brussels VPS offering
supports installing Docker Engine and running this Compose workload. If it
does not, choose another European location or provider without changing the
application topology.

## Public routing

Caddy is the only public application entry point. It:

- listens on ports 80 and 443;
- obtains and renews HTTPS certificates;
- serves the compiled SPA and falls back to `index.html` for client routes;
- proxies public API traffic to Hono;
- proxies Zero HTTP and WebSocket traffic to `zero-cache`.

PostgreSQL and direct container ports are not published to the internet. The
exact domain and path layout remains undecided. Choose it together with the
refresh-cookie path, allowed web origin, CORS configuration, and Zero cache
URL.

## Persistent state

PostgreSQL is authoritative for application rows and Zero's PostgreSQL-backed
metadata. Use a named volume on SSD storage and back up the complete database,
including all schemas.

`zero-cache` keeps a SQLite replica on fast local storage. A named volume avoids
unnecessary rebuilds during ordinary container restarts, but the replica is
disposable: if it is missing, Zero resynchronizes it from PostgreSQL.

R2 objects are independent of the VPS. PostgreSQL stores only their metadata,
so a database backup does not contain image bytes.

## Backup requirements

- Create automated, encrypted PostgreSQL backups outside the VPS.
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
