import { zeroCacheIdentity } from "@home-hub/shared/zero/context";
import { mutators } from "@home-hub/shared/zero/mutators";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
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
    const principal = c.get("principal");
    const userId = zeroCacheIdentity(principal);

    const response = await handleMutateRequest({
      dbProvider,
      request: c.req.raw,
      userID: userId,
      handler: (transact) =>
        transact(async (tx, name, args) => {
          const mutator = mustGetMutator(mutators, name);

          return mutator.fn({
            tx,
            args,
            ctx: principal,
          });
        }),
    });

    return c.json(response);
  };
}
