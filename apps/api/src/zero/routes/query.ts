import { queries } from "@home-hub/shared/zero/queries";
import { schema } from "@home-hub/shared/zero/schema";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import type { RequestAccessEnv } from "../../authorization/request-access";
import { toZeroAuthContext, zeroCacheIdentity } from "../access-context";

export function createZeroQueryRoute() {
  return async (c: Context<RequestAccessEnv>) => {
    const requestAccess = c.get("requestAccess");
    const ctx = toZeroAuthContext(requestAccess);

    const response = await handleQueryRequest({
      request: c.req.raw,
      schema,
      userID: zeroCacheIdentity(requestAccess),
      handler: (name, args) =>
        mustGetQuery(queries, name).fn({
          args,
          ctx,
        }),
    });

    return c.json(response);
  };
}
