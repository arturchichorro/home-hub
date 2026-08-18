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

## Edit shopping item names

- [x] Define and validate an optimistic rename mutation
- [x] Enforce household, module, item, and normalized-name uniqueness boundaries
- [x] Add accessible editing controls for current and archived items
- [x] Verify normalization, authorization, duplicate rejection, and the interface build
- [x] Refine editing to use row-style inputs, debounced saves, and an error popover
- [x] Standardize application inputs on a Base UI-backed `ui-web` primitive
- [x] Complete the shopping-item editing checkpoint and commit

## Refine the shopping and application-shell interface

- [x] Make the top bar sticky and non-wrapping, with compact mobile branding, household trigger, and connection status
- [x] Refine menu triggers and make the household picker content-sized
- [x] Move enabled household modules into a menu beside the household picker
- [x] Present add-item, current, crossed, archive-toggle, and expanded archived rows as one shopping list
- [x] Keep archived items hidden until the archive row is toggled open
- [x] Verify focused responsive, keyboard, accessible-name, and interface-build behavior
- [ ] Update the design-system documentation and complete the UI checkpoint

## Standardize web icons on Lucide

- [x] Adopt `lucide-react` through the shared `ui-web` package
- [x] Replace application, menu, select, and gallery icons with Lucide components
- [x] Verify there are no remaining one-off SVG icons and complete the icon checkpoint

## Deploy to and migrate onto the Raspberry Pi

- [ ] Verify ARM64 images and native dependencies for the complete production stack
- [ ] Validate SSD performance and durability, cooling, power protection, and available capacity
- [ ] Establish reliable HTTPS ingress despite dynamic IP, port-forwarding, or CGNAT constraints
- [ ] Rehearse a full restore and Zero replica rebuild on the Raspberry Pi before cutover
- [ ] Plan a maintenance window, final backup, DNS cutover, and VPS rollback window
- [ ] Migrate PostgreSQL and secrets, rebuild Zero, and switch production traffic
- [ ] Verify the full production journey and monitor stability before retiring the VPS
- [ ] Complete the Raspberry Pi deployment checkpoint and commit
