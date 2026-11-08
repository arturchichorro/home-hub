# Searchable operational logs

Operational diagnostics, **not** the household [Logs module](../logs/).
Implementation is opt-in and tested with synthetic data. Grafana Cloud provisioning,
production activation and a real production canary require a separate operator action.
No database migration, replica reset, production shell access for agents or new app endpoint.

## Architecture and privacy

Docker `json-file` logs → Alloy on the VPS → dedicated personal Grafana Cloud Loki
stack → local stdio MCP server (`apps/ops`) → bounded `search_logs` tool.

- Collect only `home-hub-production` API, Zero, PostgreSQL and internal Caddy (`web`).
  Shared ingress Caddy belongs to vps-infra and is intentionally not scraped here.
- Alloy reads files read-only, **without a Docker socket**. It is a trusted privileged
  log reader: the Docker directory mount can see other containers' raw files and
  sensitive container configuration. This is not a confidentiality sandbox for the
  collector itself; trust the pinned image/config, retain dropped capabilities and
  read-only mounts. The project/service allowlist drops unrelated data before export.
  Agents never receive that mount, credentials or host access.
- Rebuild every exported line from an allowlist; do not try to make arbitrary error
  messages safe with a secret regex. Keep event/severity, API route **templates**,
  UUID request IDs, status, duration, SQLSTATE, fixed error classes and operation
  phase/exit code. Application failures also carry stable error codes, operation
  names, catalogue-owned messages and validated repository-relative source locations.
  Drop bodies, headers, SQL, private notes/titles, URLs, raw exception messages,
  full stacks/function names and unknown fields. Unknown application exceptions
  retain useful source evidence; uninstrumented vendor messages remain metadata-only.
  Vendor classifiers supplement source diagnostics, not replace them.
- Original Docker/event timestamps survive export. API/web container revision labels
  identify the build source; `deployment_succeeded` records that revision only after
  backend/web readiness and public checks. PostgreSQL/Zero use pinned upstream images,
  not the app SHA; they remain `unknown` rather than being misleadingly retagged or
  restarted every release. Backup events do not claim a running application revision.
- Host preflight and release/backup outcomes are best-effort fixed-schema local events.
  Failures retain their original exit status. CI/Worker failures before the host is
  reached remain in GitHub Actions, not these host logs. No full CI/build output export.

## Source-first diagnostics

The API emits a shared contract (`packages/shared/src/diagnostics.ts`), rather than
requiring Alloy to recognize an exception's prose. For an unfamiliar storage failure:

```json
{
  "errorCode": "HH_UNEXPECTED",
  "operation": "documents.storage_read",
  "diagnosticMessage": "An unexpected application error interrupted this operation.",
  "locations": ["apps/api/src/documents/storage.ts:49:37"]
}
```

Database errors additionally preserve SQLSTATE (`code`); error families distinguish
constraints, retryable transactions and unavailable connections. Request rejections,
readiness, shutdown and Zero query/mutation/commit boundaries have controlled codes.
Deep storage/media boundaries retain their operation even if a service returns a
safe 503. Child-handled errors are logged once; client responses are unchanged.
No raw mutation/query name or arguments are logged; Zero operations identify the
query, mutation or transaction boundary, with owned source locations for detail.

Messages are fixed literals, never interpolated from `error.message`, SQL or input.
Alloy derives them again from the code catalogue; the reader does too. Stack parsing
exports at most three file/line/column locations present in a generated owned-source
inventory; no absolute/home paths, dependency paths, URLs, arbitrary filenames or
function names. Source paths and maximum historical line bounds are retained so
old logs remain readable; use the cited revision to inspect the corresponding code.
These are validated locations, not cryptographic attestation of a stack's origin.

After source/contract changes run `node scripts/generate-diagnostics.mjs` and format
`packages/shared/src/diagnostic-sources.gen.ts`; review the resulting inventory
and Alloy-rule changes together. Keep existing code meanings stable. Revalidate/recreate the
**already authorized** collector and restart MCP readers with updated contracts
when new codes, operations or source files ship; normal app deployment still does
not start the collector. An old contract may omit new details—never relax it to
accept arbitrary message text. No official Zero/PostgreSQL binary is patched.

## Bounds and loss

| Boundary              | Limit                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cloud                 | Free plan only; current public offer: 50 GB/month, 14-day retention, no card                                                         |
| Export                | Two priority buckets, 1 line/sec + burst 20 each; max exported line 2 KiB; roughly 11 GB/31 days of line payload plus bounded labels |
| Raw local Docker logs | 3 × 10 MB per service, non-blocking 1 MB buffer; rotation independent of Alloy                                                       |
| Host events           | Daily logrotate, maxsize 1 MB checked by logrotate, seven rotated files; not a hard instantaneous size cap                           |
| Alloy                 | 256 MiB RAM, 0.25 CPU, 64 PIDs, 16 MiB temporary space; batches 64 KiB, timeout 5 sec, three retries; no disk WAL                    |
| Search                | Past 14 days, max six-hour window, max 200 entries (default 50), 2 MiB decompressed response, 10 sec backend timeout                 |
| Gateway               | Two concurrent reads, 20 starts/minute per process; no raw LogQL, SQL, endpoint/tenant selection or writes                           |
| Query audit           | Owner-only, synced before query/return, four ~1 MiB files; inactive files pruned after 14 days on access                             |

[Pricing](https://grafana.com/pricing/) was checked on 4 November 2026. Recheck the
actual plan, region, quotas and retention **before activation**. Do not rely on a
Pro trial allowance or enable paid/add-on billing. Use a dedicated personal stack,
not the existing work Grafana connection. The rate cap provides ample Free-tier
headroom, not a claim that Grafana billing/retention can be controlled by a token.

Routine traffic cannot consume the separate error/outcome/canary budget.
This is bounded diagnostic telemetry, **not a durable audit trail**. Rotation,
throttling, crashes, collector downtime and upstream rejection can lose events;
new collection cannot recover previously deleted logs. Preserve Alloy's positions
volume; replay reads current Docker files up to 24 hours old, not an archive of
all rotated files. This conservative replay window avoids importing stale batches
beyond a stack's ingestion-age limit; it is separate from 14-day Cloud retention.
A blank query never establishes health. The gateway reports result truncation
explicitly and refuses oversized/malformed responses instead of returning an
apparently complete partial result. Backend failure cannot block the application.

## Deliberate activation (not performed by this PR)

1. Choose/confirm a personal **Free** Grafana Cloud stack and appropriate EU data
   region. Confirm 14-day retention, ingestion quota and Free-plan status in its UI.
2. Create separate stack-scoped access policies: **`logs:write` only** for Alloy,
   **`logs:read` only** for the agent gateway. No Grafana admin/editor, database,
   alert-management, SSH, R2 or deployment credentials. Verify policy scopes in the
   UI; the gateway cannot determine a token's granted scopes from its value.
3. Copy `deploy/observability/cloud.env.example` to ignored `cloud.env`, fill in
   the stack's HTTPS Loki push URL/tenant/write token, and `chmod 600` it. Never put
   the write token in an agent client. Validate the endpoint is the stack's HTTPS
   `*.grafana.net/loki/api/v1/push` URL before launching.
4. Provision `/var/log/home-hub` with owner `ubuntu:root`, mode `2750` (setgid).
   Event files are `0640 ubuntu:root`: the capability-dropped UID/GID 0 collector
   can read them without broadening access to other users. Install
   `deploy/observability/logrotate.conf` in `/etc/logrotate.d/home-hub-operations`.
   Run logrotate hourly if a tighter bound than the distribution's daily check is
   needed. Install/enable the supplied `home-hub-log-canary.service` and `.timer`.
5. Release the app's logging configuration through the normal backed-up deployment.
   Existing containers must be recreated to adopt driver options. Expect a **one-time
   PostgreSQL restart** for logging/prefix configuration; do not reset its volume or
   Zero's replica. Merely starting Alloy cannot reconfigure existing Docker drivers.
6. Validate/start the **separate** collector project, never through the app deploy:

   ```sh
   docker compose --env-file deploy/observability/cloud.env \
     -f deploy/observability/compose.yml config --quiet
   docker compose --env-file deploy/observability/cloud.env \
     -f deploy/observability/compose.yml run --rm alloy \
     validate /etc/alloy/config.alloy
   docker compose --env-file deploy/observability/cloud.env \
     -f deploy/observability/compose.yml up -d
   curl --fail http://127.0.0.1:12345/-/ready
   ```

7. Watch Alloy's loopback `/metrics`: `loki_write_sent_entries_total`,
   `loki_write_dropped_entries_total` and `loki_process_dropped_lines_total`.
   Readiness alone does **not** prove delivery. Query a fresh `collector_canary`
   through the agent tool and cite it. Configure a Grafana absence alert for no
   canary in ten minutes and an ingestion-usage warning below the Free quota.
   Stop collection on unexpected privacy, usage or delivery behavior; never raise
   limits or switch to raw messages to diagnose a failure.

Stopping/removing this collector project leaves application services and their
volumes alone. Do not run `down -v` against the application or delete positions
as routine recovery. Disable the canary timer separately when intentionally off.

## Agent connection and evidence

After `pnpm install`, configure a **separate** MCP stdio server with Node 26 and
absolute `apps/ops/src/server.ts` path. Use `node` directly, not a package-manager
command that might print a banner on the protocol's stdout. Pass only the three
variables from `reader.env.example` into that server process. HTTPS Grafana Cloud
origins only; redirects, URL credentials, paths/query parameters and other hosts
are rejected. Tokens never appear in tool results or audit records.

```json
{
  "command": "node",
  "args": ["/absolute/path/home-hub/apps/ops/src/server.ts"],
  "env": {
    "HOME_HUB_LOKI_URL": "https://logs-prod-REPLACE.grafana.net",
    "HOME_HUB_LOKI_TENANT": "REPLACE",
    "HOME_HUB_LOKI_READ_TOKEN": "REPLACE_WITH_READ_ONLY_TOKEN"
  }
}
```

The gateway writes owner-only audits under `~/.cache/home-hub/log-query-audit/`:
query ID/digest, time range, services, limit, outcome/count/truncation, **not search
text or log bodies**. Unavailable/unsafe audit storage fails closed. A stale lock
also fails closed; remove it only after confirming no gateway uses that path.
Local audits are bounded operational evidence, not tamper-proof against their owner.
Do not give agents a generic HTTP tool pre-authenticated with this token.

`search_logs` requires services and explicit ISO start/end. Optional filters:
event, severity, stable errorCode, operation, UUID requestId, 40-character revision,
SQLSTATE code, HTTP status and literal
contains; no regex or arbitrary query. Each entry includes exact nanoseconds and
a stable `citation`; `source` contains backend hostname and reproducible bounded
LogQL/time range. Include those references when reporting facts.

Investigate: **observed failure → cited facts → working control → hypotheses and
contradictions → next discriminating check → verification of the original signal**.
For example, contrast a failed API request's request ID/status/SQLSTATE with a
successful request and the release outcome. If the next check needs unavailable
private detail, state that gap; do not invent a cause or request production writes.

## Verification

`pnpm test` covers the SDK tool allowlist, credential isolation, query escaping,
time/count/byte/concurrency/rate bounds, stream validation, truncation and private
fail-closed audit storage. `bash scripts/verify-operational-logs.sh` runs real pinned
Alloy/Loki with synthetic files and mocked external deployment/backup effects, then
uses the actual MCP protocol to find/cite a known canary. It inspects **raw Loki
storage**, proving secrets/private content were removed before export, not merely
hidden from the agent. The fixture uses temporary containers/tmpfs and fake keys;
it never mounts real Docker log directories, app databases or production secrets.
CI runs the normal unit tests; the Alloy/Loki pipeline stays a manual verification,
not a deployment gate. Cloud acceptance still requires step 7 above after approved activation.
