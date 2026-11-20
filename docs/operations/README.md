# Operational diagnostics

This is searchable production diagnostics, not the household Logs module.
It grants no agent SSH, SQL, Docker, deployment or administrator tool.

Read the [essential setup checklist](./setup.md) first. [Technical commands](./setup-reference.md) and [VPS load
expectations](./capacity.md) are separate references. Merging to `develop` is not
deployment; provisioning Cloud and production activation remain separate owner
actions. No Cloud credentials, production services or agent configuration were
changed while implementing this stack.

The three review layers are:

1. [Application diagnostics](./diagnostics.md): safe error codes, operations and
   owned-source locations; no collection or Cloud dependency.
2. [Non-root collection](./collection.md): loopback UDP, pre-export allowlists,
   bounded local cache, normal/error rate limits and host outcome events.
3. [Read-only agent access](./reader.md): bounded, cited and locally audited
   searches using a separate tenant-scoped read token.

`bash scripts/verify-operational-logs.sh` manually tests real pinned Alloy/Loki,
actual source-emitted failures and Docker syslog, simultaneous normal/error
floods, plus the real MCP protocol. It uses disposable owned resources/fake
credentials, never real logs or production access. The normal test suite covers
diagnostics, query bounds, token isolation and private fail-closed audits.

This is lossy troubleshooting telemetry, not a durable audit trail. An empty
search does not establish health. See the collection document for UDP/cache
loss, retention, permissions and resource bounds.
