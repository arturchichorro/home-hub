# Home Hub backlog

Optional improvements and possible future modules, in preference order rather
than a delivery schedule. Move active work to [Tasks](./tasks.md); keep completed
work in [Task history](./task-history.md). Items below are reconciled with the
implemented system, not with unmerged feature branches.

## Improvements still open

- [ ] Rethink the household invitation flow.
- [ ] Add user profile pictures using Base UI Avatar.
- [ ] Assign household members to individual list items.
- [ ] Attach an already-uploaded recipe image to a cooking log; shared assets exist, but there is no reuse picker/API.
- [ ] Add recipe ratings, such as overall rating and ease of cooking.
- [ ] Add household-specific module ordering.
- [ ] Open the last visited household/module on app start, or select the first available household/module; the root route still renders the shell without choosing one.
- [ ] Copy recipe ingredients into a chosen list, authorizing both modules.
- [ ] Show local image previews before upload/processing confirmation; current uploads show progress and only publish confirmed assets.
- [ ] Further simplify database/domain/transport boundaries where a concrete feature needs it; the shared media, text-editing and acknowledgement extractions are already implemented.
- [ ] Update the standalone catalog-migration preservation fixture for the role columns added in `0047`–`0048`; its whole-row comparisons already fail before `0049`. Keep checking original history and new-column defaults separately, rather than weakening fidelity checks.

## Future modules and capabilities

- [ ] Documents: categorized copies of important documents.
- [ ] French Vocabulary / flashcards.
- [ ] General goals and category-based logs outside the implemented Workouts scope.
- [ ] Household finance.
- [ ] Friend list with timestamped notes.
- [ ] Places visited, with a map.
- [ ] Moodboards / masonry inspiration collections, possibly within Lists.

Accountless household/Recipes access is covered by the [Guest access specification](./guest-access/)
and the review work in [Tasks](./tasks.md#work-in-review), not a second public-access backlog entry.
