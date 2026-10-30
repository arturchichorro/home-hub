import {
  removeExerciseSetSchema,
  saveExerciseSetSchema,
} from "@home-hub/shared/exercise-logs";
import { mutators } from "@home-hub/shared/zero/mutators";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import type { AuthEnv } from "../../auth/bearer-auth";
import type { ZeroDbProvider } from "../db-provider";

export type CreateZeroMutateRouteInput = {
  dbProvider: ZeroDbProvider;
};

export function createZeroMutateRoute({
  dbProvider,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const userId = c.get("userId");

    const response = await handleMutateRequest({
      dbProvider,
      request: c.req.raw,
      userID: userId,
      handler: (transact) =>
        transact(async (tx, name, args) => {
          const mutator = mustGetMutator(mutators, name);
          if (name === "workouts.saveSet" || name === "workouts.removeSet") {
            const scope = (
              name === "workouts.saveSet"
                ? saveExerciseSetSchema
                : removeExerciseSetSchema
            ).parse(args);
            // Serialize daily-header creation and row writes for this author only,
            // without announcing private logging through shared updated_at fields.
            const key = [userId, scope.householdId, scope.workoutId].join(":");
            await tx.dbTransaction.wrappedTransaction.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
            );
          }

          return mutator.fn({
            tx,
            args,
            ctx: { userId },
          });
        }),
    });

    return c.json(response);
  };
}
