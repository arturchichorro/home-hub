import { queries } from "@home-hub/shared/zero/queries";
import { schema } from "@home-hub/shared/zero/schema";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";
import { diagnosticFor } from "../../diagnostics";
import {
  consoleStructuredLogger,
  type StructuredLogger,
} from "../../observability";

export function createZeroQueryRoute(
  logger: StructuredLogger = consoleStructuredLogger,
) {
  return async (c: Context<AuthEnv>) => {
    const userId = c.get("userId");

    const response = await handleQueryRequest({
      request: c.req.raw,
      schema,
      userID: userId,

      handler: (name, args) => {
        try {
          return mustGetQuery(queries, name).fn({ args, ctx: { userId } });
        } catch (error) {
          logger.error({
            event: "zero_query_error",
            requestId: c.get("requestId"),
            level: "error",
            ...diagnosticFor("zero.query", error),
          });

          throw error;
        }
      },
    });

    return c.json(response);
  };
}
