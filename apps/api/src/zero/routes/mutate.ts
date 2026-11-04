import type { Diagnostic } from "@home-hub/shared/diagnostics";
import { handleMutateRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import type { AuthEnv } from "../../auth/bearer-auth";
import { diagnosticFor } from "../../diagnostics";
import {
  consoleStructuredLogger,
  type StructuredLogger,
} from "../../observability";
import type { ZeroDbProvider } from "../db-provider";
import { mutateWithHabitWorkouts } from "../mutate-with-habit-workouts";
import { safeMutationProvider } from "../safe-mutation-provider";

export type CreateZeroMutateRouteInput = {
  dbProvider: ZeroDbProvider;
  logger?: StructuredLogger;
};
export function createZeroMutateRoute({
  dbProvider,
  logger = consoleStructuredLogger,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const userId = c.get("userId");
    const reported = new Set<string>();
    const report = (
      diagnostic: Diagnostic & { code?: string },
      event: string,
    ) => {
      const key = JSON.stringify([
        diagnostic.errorCode,
        diagnostic.code,
        diagnostic.locations,
      ]);
      if (reported.has(key)) return;
      reported.add(key);
      logger.error({
        event,
        requestId: c.get("requestId"),
        level: "error",
        ...diagnostic,
      });
    };
    const response = await handleMutateRequest({
      dbProvider: safeMutationProvider(dbProvider, ({ code, diagnostic }) => {
        report(
          { ...diagnostic, ...(code ? { code } : {}) },
          "mutation_database_error",
        );
      }),
      request: c.req.raw,
      userID: userId,
      handler: (transact) =>
        transact(async (tx, name, args) => {
          try {
            return await mutateWithHabitWorkouts(tx, userId, name, args);
          } catch (error) {
            const diagnostic = diagnosticFor(
              "zero.mutate",
              error,
              "HH_MUTATION_REJECTED",
            );
            report(
              diagnostic,
              diagnostic.code
                ? "mutation_database_error"
                : "zero_mutation_error",
            );
            throw error;
          }
        }),
    });
    return c.json(response);
  };
}
