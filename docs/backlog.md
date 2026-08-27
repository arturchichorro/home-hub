# Home Hub backlog

This document is a lightweight list of optional future improvements, modules,
and ideas. The order expresses current preference, not a commitment or schedule.

Keep each idea to a single bullet. When an item becomes active, move it to
[Tasks](./tasks.md), follow its working rhythm, and define the requirements
together before implementation begins.

## Improvements

- [ ] While typing (e.g. recipe description), input keeps being trimmed (on debounce) which removes spaces the user just typed
- [ ] Add ordering to recipes (to order recipe list)
- [ ] Add ordering to households in the sidebar
- [ ] Add user profile pictures and use base ui's Avatar
- [ ] After having multiple lists, add the possibility to assign people to a list item (e.g. todo list, go to commune, Artur)
- [ ] Allow to append already uploaded recipe image to a cook log
- [ ] Add recipe ratings table, could be used to say "overall 5*", "ease to cook 3*", etc; could add to the ui
- [ ] Open last opened household on app start (through local storage or something)
- [ ] Add recipe ingredients to Shopping
- [ ] Publish safe member profiles through Zero to prevent interface flashing
- [ ] In any page of the app, we could display where we are (e.g. "Germoir 83 > Recipes > Carbonara" or "Germoir 83 > Lists > Shopping") something like that
- [ ] Add user comments to cook logs (recipes)
- [ ] Check and fix flashing of pictures (maybe increase signing duration?)
- [ ] Improve separation between database access, domain behavior, and transport code
= [ ] Make upload be faster by displaying user uploaded picture optimistically, until we get confirmation
- [ ] Include image wrangler deployment in the deploy script as well

## Future modules and capabilities

- [ ] Multiple household lists, after reconsidering the current product non-goal - UI inspired by Gkeep
- [ ] French Vocabulary
- [ ] Goals / sport logs / logs in general (log things by category I guess)
- [ ] Household finance
- [ ] Friend list with timestamped notes
- [ ] Module de lugares onde já fui (mapa)
- [ ] Turn home hub web into a PWA

## Ideia

- [ ] Open a part of the app to the public with limited operations (like a no log in public recipes page) and see what happens
- [ ] Open the recipes part to the people in the house, require no log in
