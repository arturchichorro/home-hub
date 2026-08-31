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

## Add an image delivery pipeline

- [x] Define pre-generated thumbnail and viewer WebP variants; one-hour signed edge capabilities; fail-closed processing; deletion of all stored objects; and lazy repair for existing images, while retaining inaccessible originals in private R2
- [x] Implement the agreed image processing and delivery pipeline while retaining original uploads
- [ ] Verify upload, processing, authorized display, original access, deletion, cleanup, and existing-image migration behavior
- [ ] Complete the image delivery pipeline checkpoint and commit

## Replace Shopping with named Lists

Checkpoint details and rollout constraints: [Lists migration](./lists-migration.md).

- [x] Define orderable household Lists and per-list items, retaining the Shopping schema during transition
- [x] Write the initial backfill and temporary transactional Shopping-to-Lists bridge
- [x] Apply migrations locally
- [x] Add authorized Zero queries and mutations for Lists and list items
- [x] Replace Shopping navigation with the Lists library and list detail routes, preserving item UX and adding list ordering
- [x] Check the signed-in Lists flow in the app (confirmed in production)
- [x] Verify production cutover and retire old writers
- [x] Remove legacy application code and prepare the compatibility cleanup migration
- [ ] Apply cleanup migration `0017` locally and deploy it to production
- [ ] Complete the Lists concept checkpoint and commit

## Deploy to and migrate onto the Raspberry Pi

- [ ] Verify ARM64 images and native dependencies for the complete production stack
- [ ] Validate SSD performance and durability, cooling, power protection, and available capacity
- [ ] Establish reliable HTTPS ingress despite dynamic IP, port-forwarding, or CGNAT constraints
- [ ] Rehearse a full restore and Zero replica rebuild on the Raspberry Pi before cutover
- [ ] Plan a maintenance window, final backup, DNS cutover, and VPS rollback window
- [ ] Migrate PostgreSQL and secrets, rebuild Zero, and switch production traffic
- [ ] Verify the full production journey and monitor stability before retiring the VPS
- [ ] Complete the Raspberry Pi deployment checkpoint and commit
