import type { Database } from "@home-hub/database";
import { isGuestRequestAccess } from "@home-hub/shared/access";
import { mutators } from "@home-hub/shared/zero/mutators";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import type { Context } from "hono";
import { lockCurrentGuestAccess } from "../../authorization/module-access";
import type { RequestAccessEnv } from "../../authorization/request-access";
import { toZeroAuthContext, zeroCacheIdentity } from "../access-context";
import type { ZeroDbProvider } from "../db-provider";

export type CreateZeroMutateRouteInput = {
  dbProvider: ZeroDbProvider;
  authorizationDatabase: Database;
};

export function createZeroMutateRoute({
  dbProvider,
  authorizationDatabase,
}: CreateZeroMutateRouteInput) {
  return async (c: Context<RequestAccessEnv>) => {
    let requestAccess = c.get("requestAccess");
    let releaseGuestLock: (() => Promise<Response>) | undefined;
    if (isGuestRequestAccess(requestAccess)) {
      const guestAccess = requestAccess;
      releaseGuestLock = () =>
        authorizationDatabase.transaction(async (tx) => {
          const current = await lockCurrentGuestAccess(tx, guestAccess);
          if (!current) {
            c.header("WWW-Authenticate", "Bearer");
            return c.json({ error: "Unauthorized" }, 401);
          }
          requestAccess = current;
          return processMutation();
        });
    }

    const processMutation = async () => {
      const userID = zeroCacheIdentity(requestAccess);
      const context = toZeroAuthContext(requestAccess);

      const response = await handleMutateRequest({
        dbProvider,
        request: c.req.raw,
        userID,
        handler: (transact) =>
          transact(async (tx, name, args) => {
            const mutator = mustGetMutator(mutators, name);

            return mutator.fn({
              tx,
              args,
              ctx: context,
            });
          }),
      });

      return c.json(response);
    };

    return releaseGuestLock ? releaseGuestLock() : processMutation();
  };
}
