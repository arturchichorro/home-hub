import type { Database } from "@home-hub/database";
import { exercises, households } from "@home-hub/database/schema";
import { exerciseStatsSchema } from "@home-hub/shared/exercise-stats";
import { and, eq, isNull, sql } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";

export function createExerciseStatsService({ db }: { db: Database }) {
  return async (input: {
    userId: string;
    householdId: string;
    exerciseId: string;
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
      if (!household) {
        return { kind: "forbidden" as const };
      }
      if (
        !(await findHouseholdMembershipForShare(tx, input)) ||
        !(await findEnabledHouseholdModuleForShare(tx, {
          householdId: input.householdId,
          moduleKey: "workouts",
        }))
      ) {
        return { kind: "forbidden" as const };
      }
      const [exercise] = await tx
        .select({ deletedAt: exercises.deletedAt })
        .from(exercises)
        .where(
          and(
            eq(exercises.id, input.exerciseId),
            eq(exercises.householdId, input.householdId),
          ),
        )
        .limit(1)
        .for("share");
      if (!exercise) {
        return { kind: "not_found" as const };
      }

      // One statement gives a consistent view of all totals and records. Never fetch lifetime rows.
      const result = await tx.execute(sql`
      WITH scoped AS (
        SELECT s.*, e.session_id, e.performed_on
        FROM training_session_sets s
        JOIN training_session_exercises e ON e.id=s.session_exercise_id
        JOIN training_sessions t ON t.id=e.session_id AND t.household_id=e.household_id AND t.user_id=e.user_id
        WHERE e.household_id=${input.householdId}::uuid AND e.user_id=${input.userId}::uuid
          AND e.exercise_id=${input.exerciseId}::uuid AND e.deleted_at IS NULL AND t.deleted_at IS NULL
      ), records AS (
        SELECT unit, load, unilateral, max(weight_kg) AS "weightKg"
        FROM scoped WHERE weight_kg IS NOT NULL AND load <> 'bodyweight'
        GROUP BY unit, load, unilateral ORDER BY unit, load, unilateral
      )
      SELECT jsonb_build_object(
        'sessions', count(DISTINCT session_id), 'sets', count(*), 'lastOn', max(performed_on),
        'reps', jsonb_build_object(
          'total', coalesce(sum(amount + CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END) FILTER (WHERE unit='reps'),0),
          'left', coalesce(sum(amount) FILTER (WHERE unit='reps' AND unilateral),0),
          'right', coalesce(sum(coalesce(right_amount,amount)) FILTER (WHERE unit='reps' AND unilateral),0),
          'sets', count(*) FILTER (WHERE unit='reps'),
          'unilateralSets', count(*) FILTER (WHERE unit='reps' AND unilateral)),
        'seconds', jsonb_build_object(
          'total', coalesce(sum(amount + CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END) FILTER (WHERE unit='seconds'),0),
          'left', coalesce(sum(amount) FILTER (WHERE unit='seconds' AND unilateral),0),
          'right', coalesce(sum(coalesce(right_amount,amount)) FILTER (WHERE unit='seconds' AND unilateral),0),
          'sets', count(*) FILTER (WHERE unit='seconds'),
          'unilateralSets', count(*) FILTER (WHERE unit='seconds' AND unilateral)),
        'volumeKg', sum(weight_kg * CASE WHEN load='per-hand' THEN 2 ELSE 1 END *
          (amount + CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END))
          FILTER (WHERE unit='reps' AND load <> 'bodyweight' AND weight_kg IS NOT NULL),
        'unmeasuredSets', count(*) FILTER (WHERE unit='reps' AND load <> 'bodyweight' AND weight_kg IS NULL),
        'records', coalesce((SELECT jsonb_agg(to_jsonb(records)) FROM records),'[]'::jsonb)
      ) AS stats FROM scoped
    `);
      const stats = exerciseStatsSchema.parse(result.rows[0]?.stats);
      if (exercise.deletedAt && stats.sets === 0) {
        return { kind: "not_found" as const };
      }
      return { kind: "success" as const, stats };
    });
}

export type ExerciseStatsService = ReturnType<
  typeof createExerciseStatsService
>;
