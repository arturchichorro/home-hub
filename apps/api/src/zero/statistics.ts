import type { DatabaseTransaction } from "@home-hub/database";
import { sql } from "drizzle-orm";

type Executor = Pick<DatabaseTransaction, "execute">;

// Canonical aggregate SQL is shared with migration 0059's populated backfill.
// Calls stay inside the source mutation's transaction and authorization scope.
export async function refreshExerciseStatistics(
  db: Executor,
  householdId: string,
  userId: string,
) {
  await db.execute(
    sql`select public.refresh_exercise_statistics(${householdId}::uuid,${userId}::uuid)`,
  );
}

export async function refreshHabitWeeklyStatistics(
  db: Executor,
  householdId: string,
  userId: string | undefined,
  habitIds: readonly string[],
) {
  if (habitIds.length === 0) {
    return;
  }

  const ids = sql.join(
    habitIds.map((id) => sql`${id}::uuid`),
    sql`,`,
  );

  await db.execute(sql`select public.refresh_habit_weekly_statistics(
    ${householdId}::uuid,${userId ?? null}::uuid,ARRAY[${ids}]::uuid[]
  )`);
}
