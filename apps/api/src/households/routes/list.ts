import type { Context } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";
import type { ListHouseholdsResult } from "../list";

export type CreateListHouseholdsRouteInput = {
  listHouseholds: (userId: string) => Promise<ListHouseholdsResult>;
};

export function createListHouseholdsRoute({
  listHouseholds,
}: CreateListHouseholdsRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const result = await listHouseholds(c.get("userId"));

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ households: result.households }, 200);
  };
}
