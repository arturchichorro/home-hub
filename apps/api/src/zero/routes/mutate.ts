import { mutators } from "@home-hub/shared/zero/mutators";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import type { PrincipalEnv } from "../../authorization/principal";
import type { ZeroDbProvider } from "../db-provider";

export type CreateZeroMutateRouteInput = {
  dbProvider: ZeroDbProvider;
};

export function createZeroMutateRoute({
  dbProvider,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<PrincipalEnv>) => {
    const principal = c.get("principal");
    const ctx =
      principal.kind === "account"
        ? { userId: principal.userId }
        : {
            userId: `guest:${principal.guestSessionId}`,
            guest: {
              householdId: principal.householdId,
              access: principal.access,
            },
          };

    const response = await handleMutateRequest({
      dbProvider,
      request: c.req.raw,
      userID: ctx.userId,
      handler: (transact) =>
        transact(async (tx, name, args) => {
          const mutator = mustGetMutator(mutators, name);

          return mutator.fn({
            tx,
            args,
            ctx,
          });
        }),
    });

    return c.json(response);
  };
}
