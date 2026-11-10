import type { Database } from "@home-hub/database";
import { habits, households } from "@home-hub/database/schema";
import { habitStatsSchema } from "@home-hub/shared/habit-stats";
import { calendarDate } from "@home-hub/shared/habits";
import { and, eq, isNull, sql } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";

export function createHabitStatsService({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}) {
  return async (input: {
    userId: string;
    householdId: string;
    habitId: string;
    personId: string;
    timeZone: string;
  }) =>
    db.transaction(async (tx) => {
      if (!(await findActiveUser(tx, input.userId))) {
        return { kind: "unauthorized" as const };
      }

      const [household] = await tx
        .select({ id: households.id })
        .from(households)
        .where(
          and(
            eq(households.id, input.householdId),
            isNull(households.deletedAt),
          ),
        )
        .limit(1)
        .for("share");
      if (
        !household ||
        !(await findHouseholdMembershipForShare(tx, input)) ||
        !(await findHouseholdMembershipForShare(tx, {
          householdId: input.householdId,
          userId: input.personId,
        })) ||
        !(await findEnabledHouseholdModuleForShare(tx, {
          householdId: input.householdId,
          moduleKey: "habits",
        }))
      ) {
        return { kind: "forbidden" as const };
      }

      const [habit] = await tx
        .select({ id: habits.id })
        .from(habits)
        .where(
          and(
            eq(habits.householdId, input.householdId),
            eq(habits.id, input.habitId),
          ),
        )
        .limit(1)
        .for("share");
      if (!habit) {
        return { kind: "not_found" as const };
      }

      const today = calendarDate(now(), input.timeZone);

      // Date labels, not instants: Monday-based weeks cross years/DST without shifting entries.
      // Subtracting ordinal weeks groups consecutive active weeks into runs.
      const result = await tx.execute(sql`
      WITH days AS (
        SELECT entry_on::date AS day
        FROM habit_entries
        WHERE household_id=${input.householdId}::uuid AND habit_id=${input.habitId}::uuid
          AND user_id=${input.personId}::uuid AND (completed OR workout_completed)
          AND entry_on<=${today}
      ), weeks AS (
        SELECT DISTINCT date_trunc('week',day)::date AS week FROM days
      ), numbered AS (
        SELECT week, week - (row_number() OVER (ORDER BY week)::int * 7) AS run FROM weeks
      ), runs AS (
        SELECT max(week) AS ending, count(*) AS length FROM numbered GROUP BY run
      )
      SELECT jsonb_build_object(
        'asOf', ${today}::text,
        'completedDays', count(*),
        'lastOn', max(day)::text,
        'last7', count(*) FILTER (WHERE day>=${today}::date-6),
        'last30', count(*) FILTER (WHERE day>=${today}::date-29),
        'currentWeeks', coalesce((SELECT max(length) FROM runs
          WHERE ending IN (date_trunc('week',${today}::date)::date, date_trunc('week',${today}::date)::date-7)),0),
        'bestWeeks', coalesce((SELECT max(length) FROM runs),0)
      ) AS stats FROM days
    `);

      return {
        kind: "success" as const,
        stats: habitStatsSchema.parse(result.rows[0]?.stats),
      };
    });
}

export type HabitStatsService = ReturnType<typeof createHabitStatsService>;
