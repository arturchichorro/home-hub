import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type { LeaveHouseholdInput, LeaveHouseholdResult } from "../leave";

export type LeaveHouseholdRouteInput = {
  leaveHousehold: (input: LeaveHouseholdInput) => Promise<LeaveHouseholdResult>;
};

export function createLeaveHouseholdRoute({
  leaveHousehold,
}: LeaveHouseholdRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));

    if (!parsedHouseholdId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await leaveHousehold({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (result.kind === "owner_must_transfer") {
      return c.json({ error: "Transfer ownership before leaving" }, 409);
    }

    return c.body(null, 204);
  };
}
