import { type SQL, sql } from "drizzle-orm";

type Executor = { execute: (query: SQL) => PromiseLike<unknown> };

export async function lockHabitWorkoutCompletion(
  db: Executor,
  householdId: string,
) {
  // Consistent order: household completion lock, then author/workout lock.
  // Config backfills and set writes must not miss each other's uncommitted data.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`habit-workout:${householdId}`}, 0))`,
  );
}

export async function refreshHabitWorkoutCompletion(
  db: Executor,
  scope: {
    householdId: string;
    habitId?: string;
    userId?: string;
    entryOn?: string;
  },
) {
  const habit = scope.habitId ? sql`and h.id=${scope.habitId}::uuid` : sql``;
  const logPerson = scope.userId
    ? sql`and l.user_id=${scope.userId}::uuid`
    : sql``;
  const logDay = scope.entryOn
    ? sql`and l.completed_on=${scope.entryOn}`
    : sql``;
  const entryPerson = scope.userId
    ? sql`and e.user_id=${scope.userId}::uuid`
    : sql``;
  const entryDay = scope.entryOn ? sql`and e.entry_on=${scope.entryOn}` : sql``;
  // Only the derived bit is written. Manual checks, notes and existing rows survive
  // unlinking, log removal and concurrent edits. Archived habits stay frozen.
  await db.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT h.household_id, h.id AS habit_id, l.user_id, l.completed_on AS entry_on
      FROM habits h JOIN workout_logs l ON l.household_id=h.household_id
      WHERE h.household_id=${scope.householdId}::uuid AND h.status='active'
        AND h.workout_mode IN ('any', 'selected')
        ${habit} ${logPerson} ${logDay}
        AND (h.workout_mode='any' OR (h.workout_mode='selected' AND EXISTS (
          SELECT 1 FROM habit_workout_links hw
          WHERE hw.household_id=h.household_id AND hw.habit_id=h.id AND hw.workout_id=l.workout_id
        )))
        AND EXISTS (
          SELECT 1 FROM workout_log_exercises w
          JOIN exercise_logs x ON x.id=w.exercise_log_id AND x.household_id=l.household_id AND x.user_id=l.user_id
          JOIN exercise_log_sets s ON s.exercise_log_id=x.id
          WHERE w.workout_log_id=l.id AND w.household_id=l.household_id AND w.user_id=l.user_id
        )
      GROUP BY h.household_id, h.id, l.user_id, l.completed_on
    ), cleared AS (
      UPDATE habit_entries e SET workout_completed=false, updated_at=now()
      FROM habits h
      WHERE h.id=e.habit_id AND h.household_id=e.household_id
        AND h.household_id=${scope.householdId}::uuid AND h.status='active'
        ${habit} ${entryPerson} ${entryDay}
        AND e.workout_completed AND NOT EXISTS (
          SELECT 1 FROM eligible q WHERE q.habit_id=e.habit_id AND q.user_id=e.user_id AND q.entry_on=e.entry_on
        )
      RETURNING e.habit_id
    )
    INSERT INTO habit_entries(household_id,habit_id,user_id,entry_on,completed,workout_completed)
      SELECT household_id,habit_id,user_id,entry_on,false,true FROM eligible
    ON CONFLICT(habit_id,user_id,entry_on) DO UPDATE
      SET workout_completed=true,updated_at=now()
      WHERE habit_entries.workout_completed IS DISTINCT FROM true
  `);
}
