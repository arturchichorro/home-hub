# Essential setup: let an agent read Home Hub logs

**Nothing has been activated. This checklist is not permission to deploy.**
The running pieces are one small collector on the VPS and one MCP process on your
Mac. Grafana stores/searches the logs; you do not run a log database on the VPS.

## 1. Merge the code into develop — not main yet

Review and merge the stack bottom-up:
[diagnostics #91](https://github.com/arturchichorro/home-hub/pull/91) →
[collector #140](https://github.com/arturchichorro/home-hub/pull/140) →
[reader #141](https://github.com/arturchichorro/home-hub/pull/141).
Use stack-aware merges and sync the remaining PRs after each lower merge.
This does **not** deploy. Wait for current-head CI.

## 2. Create the personal Grafana stack and two tokens

In your **personal**, not work, Grafana account, create a Free stack in the EU.
Check the actual Free quota/retention and avoid paid add-ons/trial dependence.

Create two stack-scoped tokens:
- **logs:write** → private file on the VPS: `/opt/home-hub/.env.observability`.
- **logs:read** → private file on your Mac: `~/.config/home-hub/log-reader.env`.

Use the [credential examples and exact keys](./setup-reference.md#3-prepare-private-credential-files).
Files must be owner-only (0600); the Mac config directory is 0700.
Do not put tokens in Git, chat or MCP JSON. **No new GitHub Actions secret.**

## 3. Prepare and approve the first production rollout

I can handle the technical work once you have prepared the private files and
explicitly approve it: create the dedicated collector group/directories, install
host-event log rotation, and validate the configuration.

Then approve maintenance and the normal `develop → main` release.
**Merging to main triggers deployment.** The first logging-driver change needs
container recreation, including a **PostgreSQL restart**: resolve drafts/queues,
pause writes, back up and coordinate stopping API/Zero writers first.

No new feature migration or Zero reset is needed. Preserve the existing 0053
training-cutover safeguards and application volumes. See the
[release procedure](./setup-reference.md#5-approve-the-first-production-releasemaintenance-window).

## 4. Start the collector and register the MCP tool

After the approved release, I can start the independent collector and add
`home-hub-logs` to your ag-managed MCP configuration, preserving existing servers.
It reads the private Mac env file; you do not need to share the token with me.

[Collector commands](./setup-reference.md#6-start-the-independent-collector) ·
[MCP registration](./setup-reference.md#7-connect-the-local-read-only-mcp-reader)

**Skip canary timers and custom alerts initially.** Keep the existing privacy
filters, limits, separate tokens and local log rotation. The optional monitoring
code stays available but does not need to run.

## 5. Confirm the agent can find a fresh request

Make a safe health request with a new request UUID, then ask the agent to find
it using `search_logs`. Confirm status 200, operation `http.health`, expected
revision and a citation. [Exact probe](./setup-reference.md#8-verify-delivery-optionally-add-monitoring).

That is the essential acceptance check—collector readiness alone is not enough.
Afterwards, ask: “Check errors from the last hour and explain likely fixes,
with log citations.” No deliberate production failure test is needed.

**Limit:** missing results do not prove health. UDP logs missed during collector
downtime are not replayed. To stop collection, stop only its independent Compose
project; never delete app volumes or reset Zero.

For capacity and warning signs, see [VPS load](./capacity.md).
