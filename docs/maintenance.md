# Editing and workout maintenance

- Shared text editing lives in `apps/web/src/editing/`; image dimensions live in `apps/web/src/media/`. Text fields retain failed drafts with Retry/Discard. Required empty-name validation and Escape still restore the confirmed value. Dirty text blocks navigation/unload; history paging is disabled while a history note is dirty.
- Keep the workout row controller separate: it owns complete/incomplete sets, per-row acknowledgements, retry, original snapshots and explicit removal. Invalid numeric fields explain integer/range rules without clearing input. Decimal kilograms and zero remain valid.
- `zero/acknowledge-mutation.ts` only awaits client/server outcomes and preserves typed errors. Feature-specific validation, pending state, write gating and update protection remain with callers. Forms intentionally acting between client and server acknowledgement keep their staged flow.
- API mutation transactions sanitize database errors **before** Zero serializes them. Diagnostics contain a correlation ID and safe SQLSTATE, never bound parameters or raw error causes. Expected authorization/reload failures keep their contracts. Transport HTTP 200 is not proof of mutation success.
- Catalog galleries share one authorized metadata subscription. Initially mount 50 catalog rows; “Show more exercises” appends 50 without evicting existing rows. Focused/new rows remain pinned. Search covers the full catalog. Sparse reorder payloads contain the moved row and immediate visible neighbors, including in catalogs exceeding the request-size cap. No virtualization or SDK patches are used.
- The exercise picker loads definitions only when opened, never private performance relations. Selection/creation waits for complete data.
- Workout history displays 20 entries plus a bounded lookahead, with exclusive `(completedOn, completedAt, id)` cursors. “Load older history” and “Newer history” change pages. Selected and current-day logs have independent author-scoped subscriptions, so historical editing and today's logging do not depend on the visible page. Legacy readers remain compatible.
- `workouts.saveLog` remains an explicit rejection, not an archive writer. Applied migrations, historical archive tables and populated migration fixtures must remain intact.

## Local verification, 2 November 2026

Official Zero 1.11.3, Node 26, PostgreSQL 17, Chrome 156 on an M2 Pro; disposable synthetic households, production-mode builds. Three samples per timing cell; these are loopback observations, not production latency guarantees.

| Oversized case                      | Audited release | Follow-ups |
| ----------------------------------- | --------------: | ---------: |
| Catalog content ready               |        2,164 ms |     723 ms |
| Catalog gallery controls ready      |        6,004 ms |     727 ms |
| Catalog initial DOM elements        |          27,692 |      3,494 |
| Catalog query registrations         |             608 |          9 |
| Catalog SPA revisit                 |          928 ms |     102 ms |
| Workout detail decoded WS payload   |         2.24 MB |    0.32 MB |
| Workout detail initial DOM elements |           2,863 |      1,116 |

The catalog now initially displays 50 of 600 exercises, not all 600; all remain searchable/loadable. The full definition/performance catalog is still synchronized, so this is not a claim of bounded catalog data transfer. Everyday catalog content timing was 380 → 449 ms, while gallery readiness improved 868 → 451 ms; no general everyday speedup is claimed from three local samples.

Browser checks covered failed draft retry/discard/navigation protection, author privacy, historical date/snapshot fidelity, logger DOM preservation across paging, integer validation, lazy picker selection, progressive disclosure, full-catalog search and keyboard reorder/cancel. Local signing used the real API with fixture image bytes, not production R2. Evidence is under `~/.cache/home-hub/audit-followups/2026-11-02/`.
