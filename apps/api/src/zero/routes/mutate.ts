import type { Database } from "@home-hub/database";
import { mutators } from "@home-hub/shared/zero/mutators";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import { lockCurrentGuestPrincipal } from "../../authorization/module-access";
import type { PrincipalEnv } from "../../authorization/principal";
import type { ZeroDbProvider } from "../db-provider";

export type CreateZeroMutateRouteInput = {
  dbProvider: ZeroDbProvider;
  principalDatabase?: Database;
};

export function createZeroMutateRoute({
  dbProvider,
  principalDatabase,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<PrincipalEnv>) => {
    let principal = c.get("principal");
    let releaseGuestLock: (() => Promise<Response>) | undefined;
    if (principal.kind === "guest") {
      const guestPrincipal = principal;
      if (!principalDatabase) {
        c.header("WWW-Authenticate", "Bearer");
        return c.json({ error: "Unauthorized" }, 401);
      }
      releaseGuestLock = () =>
        principalDatabase.transaction(async (tx) => {
          const current = await lockCurrentGuestPrincipal(tx, guestPrincipal);
          if (!current) {
            c.header("WWW-Authenticate", "Bearer");
            return c.json({ error: "Unauthorized" }, 401);
          }
          principal = current;
          return processMutation();
        });
    }

    const processMutation = async () => {
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

    return releaseGuestLock ? releaseGuestLock() : processMutation();
  };
}
