# Opt-in operational log collection

This is operational diagnostics, not the household Logs module. It adds no
database migration or replica reset and is never started by normal app deployment.

## Boundary

Docker sends Home Hub API/Zero/PostgreSQL/internal-web logs via loopback UDP
1514 to non-root Alloy (UID 10001, dedicated host group). There is no Docker
socket, Docker-directory mount, host networking, privileged container or public
listener. The collector has only read-only config/safe host-event files and its
own writable positions directory. It still receives raw Home Hub messages:
trust the pinned image/config; it is not a sandbox against a malicious collector.

Alloy rebuilds records from allowlists before HTTPS export to a dedicated personal
Grafana Cloud Free Loki stack. Bodies, headers, SQL, exception prose, full stacks,
absolute paths, URLs and unknown fields are discarded. Codes/messages/source
locations use the [application contract](./diagnostics.md). API records carry a
validated full Git revision in JSON; short syslog tags avoid Docker's 32-character
MSGID limit. Web/Zero/PostgreSQL remain revision `unknown`, never misleadingly
retagged with an app revision. Deployment outcomes carry the successful app SHA.

## Bounds and loss

- Three **global** priority buckets: normal, critical and canary; each 1 line/sec,
  burst 20, max 2 KiB projected records. Error floods cannot spend the canary budget.
  Worst-case line payload is about 16.5 GB/31 days, plus labels; this is not a
  billing guarantee. The timer normally emits one canary/minute.
- Alloy: 256 MiB, 0.25 CPU, 64 PIDs, read-only root, no capabilities; bounded batches,
  three retries, no disk WAL. Stopping it does not block the application.
- Docker uses non-blocking delivery and an explicit 3 × 10 MB dual logging cache,
  available through `docker logs`. This cache is best-effort, not an archive;
  Docker documents that remote-driver write failures can also lose cache entries.
- UDP messages sent while Alloy is down are **not replayed** into Cloud. Normal
  app logging is lossy diagnostics, not a durable audit trail.
- Safe host deploy/backup/canary events remain in rotated local files (daily,
  maxsize 1 MB on logrotate runs, seven rotations). Their positions persist;
  file replay is bounded to 24 hours. Original syslog timestamps have Docker's
  microsecond precision; host events use their original UTC timestamp.
- Free Cloud currently advertises 50 GB/month and 14-day retention. Recheck the
  actual Free plan/region/usage before activation; do not activate paid billing.

## Operator prerequisites

Use a dedicated personal stack, not the work Grafana connection. Create a
stack-scoped `logs:write` token for the VPS; the agent uses a different
`logs:read` token locally. No new GitHub Actions secret is required.

After these files reach the production checkout, provision only the new paths:

```sh
sudo groupadd --system home-hub-observability  # only if absent
getent group home-hub-observability
sudo install -d -o ubuntu -g home-hub-observability -m 2750 /var/log/home-hub
sudo install -d -o root -g root -m 0755 /var/lib/home-hub-observability
sudo install -d -o 10001 -g home-hub-observability -m 0700 /var/lib/home-hub-observability/alloy
```

Copy `deploy/observability/cloud.env.example` to ignored `cloud.env` with mode
0600. Fill the exact HTTPS Grafana `*.grafana.net/loki/api/v1/push` URL, tenant,
write-only token and numeric group ID. Do not paste secrets into chat or Git.
Ensure `config.alloy` is readable by UID 10001 (0644, contains no secrets).

Install the provided logrotate file and canary systemd service/timer. Logging
driver/prefix changes require one-time recreation of app containers **including
PostgreSQL** in a separately approved, backed-up maintenance window. Preserve
the current 0053 cutover guard, application volumes and Zero replica.

Then validate/start only the independent collector project:

```sh
docker compose --env-file deploy/observability/cloud.env -f deploy/observability/compose.yml config --quiet
docker compose --env-file deploy/observability/cloud.env -f deploy/observability/compose.yml run --rm alloy validate /etc/alloy/config.alloy
docker compose --env-file deploy/observability/cloud.env -f deploy/observability/compose.yml up -d
curl --fail http://127.0.0.1:12345/-/ready
```

Readiness is not delivery. Acceptance must find both a fresh canary **and** a
safe application health-request UUID in Cloud: they test independent file and UDP
inputs. Alert on no canary for ten minutes, export drops and usage below the Free
quota. Stop collection on privacy/usage/delivery surprises; never fall back to
raw logs. Stopping this Compose project leaves app services/volumes alone;
disable its canary timer separately. Do not delete positions or use app `down -v`.

## Manual verification

`bash scripts/verify-operational-logs.sh` uses owned disposable Alloy/Loki,
fake credentials and synthetic data. It verifies real Docker syslog delivery,
non-root operation, raw Loki privacy, source evidence, preserved deployment/backup
exit codes, rate limiting and a canary surviving normal/error floods. On Docker
Desktop, the daemon driver probe uses the receiver's isolated container IP;
production Linux uses the configured loopback port and needs its own acceptance
probe. This manual runner is not a feature-specific CI/deployment gate.
