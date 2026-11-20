# Log setup — technical reference

Start with the [essential checklist](./setup.md). This reference contains the
commands for assisted setup; it is not an extra checklist.

**Reviewing this guide does not authorize executing its production steps.**
Nothing has been activated yet. No new application database migration or Zero
replica reset is part of this feature.

## 1. Merge the three code PRs into develop

Merge bottom-up: **[diagnostics #91](https://github.com/arturchichorro/home-hub/pull/91) → [collector #140](https://github.com/arturchichorro/home-hub/pull/140) → [reader #141](https://github.com/arturchichorro/home-hub/pull/141)**.
The upper PRs initially target their predecessor so each diff is reviewable.
Use stack-aware merges (`gh stack merge <PR-number> --yes --squash`), not a
manual merge of an upper PR into its unmerged feature-branch base. After merging
each lower layer, sync/rebase/retarget the remaining stack onto `develop` before
merging the next:

```sh
gh stack sync --remote origin
```

Wait for current-head CI on each layer. Merging these feature PRs into
`develop` does **not** deploy production. Do not merge a release to `main` yet.

## 2. Create a dedicated personal Grafana Cloud Free stack

In your personal Grafana account—not the work stack:

- Choose the Free plan and appropriate EU region. Avoid activating paid add-ons
  or relying on a temporary Pro trial.
- Confirm the actual limits/retention. The public Free offer currently lists
  **50 GB logs/month and 14-day retention**; check the portal before activation.
- In the stack's Logs connection details, copy the tenant/user ID and exact Loki
  HTTPS push endpoint.
- Create two separate **stack-scoped** access-policy tokens:
  - **logs:write only** for Alloy on the VPS.
  - **logs:read only** for the local MCP reader.
- Set an ingestion-usage warning below the quota. A token does not enforce a
  billing ceiling or configure retention.

No Grafana administrator token or new GitHub Actions secret is needed.

## 3. Prepare private credential files

**VPS:** create `/opt/home-hub/.env.observability` owned by `ubuntu`, mode
0600. This filename is already ignored, so preparing it before the release will
not dirty the deployment checkout. Fill it in a private editor, not a shell
command containing the token:

```dotenv
LOKI_WRITE_URL=https://logs-prod-REPLACE.grafana.net/loki/api/v1/push
LOKI_TENANT=REPLACE
LOKI_WRITE_TOKEN=REPLACE_WITH_WRITE_ONLY_TOKEN
ALLOY_GID=REPLACE_WITH_NUMERIC_GROUP_ID_FROM_STEP_4
```

**Your Mac:** create `~/.config/home-hub/` with mode 0700 and
`~/.config/home-hub/log-reader.env` with mode 0600, using
`deploy/observability/reader.env.example`. Its values are:

```dotenv
HOME_HUB_LOKI_URL=https://logs-prod-REPLACE.grafana.net
HOME_HUB_LOKI_TENANT=REPLACE
HOME_HUB_LOKI_READ_TOKEN=REPLACE_WITH_READ_ONLY_TOKEN
```

The read URL is **only the origin**: do not include `/loki/api/v1/push`.
Keep the write token on the VPS and read token on your Mac. Do not send either
through chat, commit them or place them in the MCP JSON itself.

## 4. Prepare the VPS filesystem

Check that host UID 10001 is not an unexpected existing account. Create the
dedicated `home-hub-observability` group if absent, then provision:

```sh
sudo groupadd --system home-hub-observability  # skip if it already exists
getent group home-hub-observability
sudo install -d -o ubuntu -g home-hub-observability -m 2750 /var/log/home-hub
sudo install -d -o root -g root -m 0755 /var/lib/home-hub-observability
sudo install -d -o 10001 -g home-hub-observability -m 0700 /var/lib/home-hub-observability/alloy
```

Put the numeric group ID into `ALLOY_GID`. Alloy runs as UID 10001 with this
group; no root, Docker socket, Docker-directory mount, host networking or public
UDP port. If the host uses user-namespace remapping or a conflicting UID, adapt
and verify ownership before proceeding rather than broadening permissions.

## 5. Approve the first production release/maintenance window

Review a normal release PR from `develop` to `main`. **Merging that release
is the deployment trigger**, unlike step 1.

Arrange maintenance first: resolve device drafts/queues, pause writes, take a
fresh off-host backup and coordinate stopping API/Zero writers before the first
logging-configuration rollout. Existing containers need recreation to adopt the
driver settings, **including a one-time PostgreSQL restart**. Preserve app data,
volumes and the Zero replica.

Use the normal backed-up deployment/lock workflow. The current **0053**
training-cutover guard is preserved; if production has not completed that
cutover, follow [its readiness procedure](../deployment.md#training-schema-cutover-0053)
first. Do not bypass it or bundle unrelated pending migrations into this setup.

Once this separately approved release succeeds, confirm API/Zero/web health and
that `/opt/home-hub` contains the reviewed observability files. Initial UDP
messages before the collector starts can be missed; normal operation is never
blocked waiting for Grafana. The Docker dual cache is bounded and best-effort,
not a guaranteed complete log archive.

## 6. Start the independent collector

On the VPS, from `/opt/home-hub`:

```sh
OBS_ENV=/opt/home-hub/.env.observability
chmod 600 "$OBS_ENV"
docker compose --env-file "$OBS_ENV" -f deploy/observability/compose.yml config --quiet
docker compose --env-file "$OBS_ENV" -f deploy/observability/compose.yml run --rm alloy validate /etc/alloy/config.alloy
docker compose --env-file "$OBS_ENV" -f deploy/observability/compose.yml up -d
curl --fail http://127.0.0.1:12345/-/ready
collector_id=$(docker compose --env-file "$OBS_ENV" -f deploy/observability/compose.yml ps -q alloy)
docker inspect --format 'user={{.Config.User}} privileged={{.HostConfig.Privileged}}' "$collector_id"
docker port "$collector_id"
```

This project is deliberately not started by ordinary app deployments. Confirm
the runtime user is `10001:<your-group-id>` and only loopback ports are bound.
If validation/permissions fail, fix them—do not use root or mount Docker files.

Install safe-event rotation (required because deployment/backup events use a local file):

```sh
sudo install -m 0644 deploy/observability/logrotate.conf /etc/logrotate.d/home-hub-operations
```

## 7. Connect the local read-only MCP reader

On your Mac, update the checkout to the merged code and run
`pnpm install --frozen-lockfile`. Keep Node 26 available; no web build is
needed for the reader itself.

Your agent MCP configuration is managed by **ag**. In
`~/Documents/Personal/agentic/mcp/mcp.json`, add this named server under
`mcpServers` (adjust absolute paths if the checkout moves):

```json
"home-hub-logs": {
  "command": "/opt/homebrew/bin/node",
  "args": [
    "--env-file=/Users/artur/.config/home-hub/log-reader.env",
    "/Users/artur/Documents/Personal/home-hub/apps/ops/src/server.ts"
  ]
}
```

Add `"homehub": ["home-hub-logs"]` under `sets`. Preserve existing servers
and active sets; do not replace your work Grafana server. Check `ag mcp list`
before changing active sets. With your current Pi sets, the command is:

```sh
ag mcp use pi core marketing folio mem homehub
ag mcp sync --dry-run
ag mcp sync
```

If the current Pi set list changed, retain those sets and append `homehub`
instead. Reload/reconnect MCP in Pi (`/reload`, then `/mcp`) or start a new
session. It should expose exactly **search_logs**, not Grafana writes, shell or
SQL. I can do this registration later without seeing the token: it stays in the
private env file. No harness configuration has been edited during this PR work.

## 8. Verify delivery

Collector readiness alone is not acceptance. Generate a UUID on your Mac and
make a safe public health request:

```sh
probe=$(node -e 'console.log(crypto.randomUUID())')
curl --fail --silent --show-error -H "X-Request-ID: $probe" https://home.achichorro.com/api/health
printf '\nRequest ID: %s\n' "$probe"
```

Use the MCP tool to search service `api` for that request ID in the last few
minutes. Verify status 200, operation `http.health`, expected full app revision
and a citation. This tests the actual Docker UDP delivery path.

Inspect projected records: no private content, SQL, tokens, raw exception prose
or absolute paths. Do not deliberately break production. If deploy/backup
diagnostics are needed, verify a real outcome separately through that file path.

If a probe is missing, inspect loopback delivery, permissions, Alloy drop metrics
and bounded local Docker logs. Do not declare success or switch to raw export.
No scheduled test messages or custom alert setup is required.

## Stop or rotate safely

Stop only the `home-hub-observability` Compose project when intentionally off. App services continue normally; UDP records sent
during downtime will not be replayed. Do not use app `down -v`, clear its database
or reset Zero. Preserve the collector's positions directory for host events.

For a suspected leak: stop export first, revoke the affected token, inspect the
scope and replace it with the same minimal permissions. Changing the VPS write
token requires recreating only Alloy; changing the local read token requires
restarting only that MCP reader.
