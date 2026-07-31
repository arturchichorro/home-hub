import { queries } from "@home-hub/shared/zero/queries";
import { schema } from "@home-hub/shared/zero/schema";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";

export function createZeroQueryRoute() {
  return async (c: Context<AuthEnv>) => {
    const userId = c.get("userId");

    const response = await handleQueryRequest({
      request: c.req.raw,
      schema,
      userID: userId,
      handler: (name, args) =>
        mustGetQuery(queries, name).fn({
          args,
          ctx: { userId },
        }),
    });

    return c.json(response);
  };
}
