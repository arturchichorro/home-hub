import { handleMutateRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import type { AuthEnv } from "../../auth/bearer-auth";
import { consoleStructuredLogger } from "../../observability";
import type { ZeroDbProvider } from "../db-provider";
import { mutateWithHabitWorkouts } from "../mutate-with-habit-workouts";
import { safeMutationProvider } from "../safe-mutation-provider";

export type CreateZeroMutateRouteInput = { dbProvider: ZeroDbProvider };
export function createZeroMutateRoute({
  dbProvider,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const userId = c.get("userId");
    const response = await handleMutateRequest({
      dbProvider: safeMutationProvider(dbProvider, ({ code }) => {
        consoleStructuredLogger.error({
          event: "mutation_database_error",
          requestId: c.get("requestId"),
          code,
        });
      }),
      request: c.req.raw,
      userID: userId,
      handler: (transact) =>
        transact((tx, name, args) =>
          mutateWithHabitWorkouts(tx, userId, name, args),
        ),
    });
    return c.json(response);
  };
}
