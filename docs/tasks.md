# Home Hub tasks

This document contains committed project work in implementation order. Optional
improvements and possible modules belong in [Backlog](./backlog.md) until they
become active commitments.

Completed phases are preserved in [Task history](./task-history.md).

Subject documents in `docs/` describe the current system. Update them as part
of a task whenever the implemented behavior or an accepted decision changes.

## Working rhythm

1. Read the relevant official library documentation.
2. State the intended data flow and security boundary.
3. Write the smallest test or manual observation that will prove the behavior.
4. Implement the smallest coherent change.
5. Ask the guiding agent to review and explain problems, not to replace the implementation.
6. Run the checks and inspect the result directly.
7. Summarize what was learned before continuing.

The learner generates, reviews, and applies local database migrations and
creates commits manually. The guiding agent may inspect generated SQL and
database state, but should not run local or production migration commands or
commit changes unless explicitly asked for that specific action. CI rehearses
the committed migration history on a disposable database, and the production
deployment applies tested forward migrations after an off-host backup.

## Work in review

The following work is in review, not completed delivery. Review status is not
authorization to merge, deploy or activate production services:

- Operational diagnostics stack: #91 (application diagnostics), #140 (non-root loopback collection) and #141 (bounded read-only MCP). Refreshed against current `develop`; see the [ordered setup guide](./operations/setup.md). No Cloud credentials or production activation performed.
- Guest access prototype stack [#35](https://github.com/arturchichorro/home-hub/pull/35), [#36](https://github.com/arturchichorro/home-hub/pull/36), [#38](https://github.com/arturchichorro/home-hub/pull/38), [#39](https://github.com/arturchichorro/home-hub/pull/39): requires reconciliation with current `develop` and current module/privacy rules before integration. The earlier foundation was reverted; the prototype does not establish current Guest support.

Habits day boxes and optional workout-linked completion are integrated into
`develop`; see [Task history](./task-history.md#recent-completed-deliveries).
When a review item merges, remove its pending entry and update the corresponding
subject/history. Guest Access remains excluded from this integration.

## Flashcards in Lists

Promoted from Backlog. The approved household-shared, text-only deck design is
implemented on `feat/list-flashcards`, pending review/integration. See
[Flashcards](./lists/flashcards.md) for behavior, data and verification. No spaced
repetition or progress storage; this status is not migration/merge/deploy approval.

- [x] Add the typed card schema, reviewed additive migration and authorized synchronization
- [x] Integrate the third list type, protected inline editing and manual practice
- [x] Verify permissions, data preservation, drafts and desktop/mobile interactions
- [ ] Review the implementation before any separately authorized commit, migration or release

## Deploy to and migrate onto the Raspberry Pi

- [ ] Verify ARM64 images and native dependencies for the complete production stack
- [ ] Validate SSD performance and durability, cooling, power protection, and available capacity
- [ ] Establish reliable HTTPS ingress despite dynamic IP, port-forwarding, or CGNAT constraints
- [ ] Rehearse a full restore and Zero replica rebuild on the Raspberry Pi before cutover
- [ ] Plan a maintenance window, final backup, DNS cutover, and VPS rollback window
- [ ] Migrate PostgreSQL and secrets, rebuild Zero, and switch production traffic
- [ ] Verify the full production journey and monitor stability before retiring the VPS
- [ ] Complete the Raspberry Pi deployment checkpoint and commit
