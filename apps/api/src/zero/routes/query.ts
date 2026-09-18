import { queries } from "@home-hub/shared/zero/queries";
import { schema } from "@home-hub/shared/zero/schema";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import type { PrincipalEnv } from "../../authorization/principal";

function zeroContext(c: Context<PrincipalEnv>) {
  const principal = c.get("principal");
  return principal.kind === "account"
    ? { userId: principal.userId }
    : {
        userId: `guest:${principal.guestSessionId}`,
        guest: {
          householdId: principal.householdId,
          access: principal.access,
        },
      };
}

export function createZeroQueryRoute() {
  return async (c: Context<PrincipalEnv>) => {
    const ctx = zeroContext(c);

    const response = await handleQueryRequest({
      request: c.req.raw,
      schema,
      userID: ctx.userId,
      handler: (name, args) =>
        mustGetQuery(queries, name).fn({
          args,
          ctx,
        }),
    });

    return c.json(response);
  };
}
