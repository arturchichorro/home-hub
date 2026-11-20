# Read-only log reader

The local `apps/ops` stdio MCP server exposes exactly one tool, `search_logs`.
It talks directly to the dedicated personal Loki tenant, not the work Grafana
server. Use Node 26 and a `logs:read`-only token; the VPS write token never
belongs in an agent client. The server grants no shell, SQL, writes or deployment
access and exposes no public network listener.

The production loader accepts only an HTTPS `*.grafana.net` origin, without a
path, URL credentials, query, redirects or caller-selected endpoint/tenant.
Filters require services and explicit ISO start/end. Optional event/severity,
controlled operation/error code, request UUID, full Git revision, SQLSTATE,
status and literal substring filters cannot supply arbitrary LogQL.

Bounds: 14-day lookback, six-hour maximum window, 200 results maximum (default
50), 2 MiB decompressed response, ten-second backend timeout, two concurrent reads
and 20 starts/minute per process. Oversized, malformed or unexpected streams
fail closed. Truncation is explicit, never an apparently complete partial result.

Each result includes exact Loki timestamp, stable `citation` and reproducible
query/time/source metadata. Reconstructed fields use the same diagnostic
catalogue, not backend error prose. Report observed facts with these citations;
separate hypotheses from evidence. Missing results can mean rotation, throttling,
retention, UDP/collector downtime or loss—not success.

Audits live under `~/.cache/home-hub/log-query-audit/` by default: query
ID/digest, services/time/limit and outcome/count/truncation. They never contain
tokens, search text or log bodies. The owner-only 0700 directory and 0600 files
are checked; writes are synced before querying/returning results, with four
approximately 1 MiB files and 14-day pruning on access. Unsafe storage or a stale
lock fails closed. Only remove a stale lock after confirming no reader owns it.
These local records are not tamper-proof against their owner.

After setup, `pnpm install --frozen-lockfile` provides the dependencies.
Launch `node --env-file=/absolute/private/log-reader.env
/absolute/home-hub/apps/ops/src/server.ts` directly—not a package-manager command
that may print a banner on MCP stdout. See [Setup](./setup.md) for exact ordering
and your ag-managed client registration. Do not put real tokens in repository
configuration, GitHub Actions, command history or chat.
