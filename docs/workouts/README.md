# Workouts

An owner-enabled module, disabled by default. Household members share standalone
workouts; training logs and set values remain private to their author.

- Open a workout from the list; its name appears in the breadcrumb and URL.
- Edit its name, always-visible notes under the title, and exercises using seamless
  controls. Exercise measure/load choices use the shared Base UI selects.
- Reorder workouts like Lists: drag with a mouse, hold to drag on touch, or use
  Space and arrow keys. The household-shared order is persisted optimistically.
- Press **Done** to record completion, with or without set entries.
- Optionally log weight and reps/seconds per set, resume an unfinished log, or
  review and correct previous entries. Logs snapshot the workout at creation.
- Add the supplied A/B/C starter workouts.

There are no plans, cycles, scheduling, timers, progression suggestions, or
configured weight increments. Data lives in `workouts`, `workout_logs`, and
`workout_log_sets`; membership, module availability, and private-log ownership
are enforced in Zero queries and mutations.

## Upgrade

`0034_slimy_darwin.sql` is unchanged. Apply the forward migration
`0035_thin_runaways.sql` while API and Zero are stopped, then restart on the new
code and reload clients. It expands existing plans into standalone workouts,
including workouts removed from a plan but retained in history. It preserves
log IDs, authors, dates, status, snapshots, and set values. Former instruction
fields and legacy session/set annotations are consolidated into snapshot notes.
After verifying the copy, it removes the superseded plan/cycle/session tables
and updates the Zero publication. Back up before this contract migration;
rollback requires restoring the backup and previous code.

`0036_fat_ender_wiggin.sql` adds ordering keys and an index, preserving the previous
alphabetical order within each household. New workouts go first; starter import
keeps A/B/C order. Earlier migrations remain unchanged.
