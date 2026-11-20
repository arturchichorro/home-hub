# VPS load: what this adds

No production capacity measurement has been taken for this change. Local
synthetic tests are an initial sanity check, not a VPS sizing benchmark.

| Component                | Where         | Expected / configured cost                                                       |
| ------------------------ | ------------- | -------------------------------------------------------------------------------- |
| Alloy collector          | VPS           | About 60–65 MiB RAM observed locally; capped at 256 MiB and 0.25 CPU core        |
| Local log caches         | VPS           | Roughly 30 MB per logged app container, plus bounded collector/rotated host logs |
| Log storage and searches | Grafana Cloud | No Loki database or search engine on your VPS                                    |
| Agent MCP reader         | Your Mac      | Starts with the agent; queries Cloud, not your VPS                               |

The 256 MiB is a ceiling, not reserved RAM. The CPU cap is one quarter of one
core, not 25% of an arbitrary multi-core VPS. These limits cover Alloy only:
app log creation and Docker's logging/cache work still consume host resources.
Cloud export limits are applied after receiving/parsing; a huge incoming error
storm can still saturate the collector and lose logs despite low export volume.

## When to worry

For a lightly used household app, this should be a modest addition **if the VPS
has spare capacity**. It cannot be translated into an honest user-count limit:
queries, media processing, PostgreSQL/Zero activity and other hosted apps matter
more than a simple number of accounts.

Before activation, inspect available RAM, swap activity and CPU during typical
use and peak jobs/builds. Rough operational guidelines, not hard failure points:

- Around **1 GiB available RAM** before adding this is comfortable initial
  headroom; it is not a guarantee for the whole app.
- Below roughly **512 MiB available**, sustained swap activity, OOM kills or
  host CPU already around **80%+**: investigate/measure before adding it.
- After activation, repeated Alloy restarts, memory near its ceiling, sustained
  CPU at its cap or rising dropped logs indicate collection pressure.
- Slower app requests, database waits, disk pressure or swap indicate whole-host
  pressure—even if Alloy looks healthy. Do not simply raise its limits.

For an authorized inspection: `free -h`, `vmstat 1 10`, `df -h` and a
scoped `docker stats --no-stream` are useful. Use Linux **available** memory,
not just “free” memory; normal filesystem cache is reclaimable. A short snapshot
can miss build/backup/media peaks.

Start with the current limits and compare before/after under representative
use. If the VPS is tight, stop the independent collector and preserve the app;
then decide whether to optimize other workloads, resize, or move collection.
There are no scheduled test messages or custom alerts in this setup.
