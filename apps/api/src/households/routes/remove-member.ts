import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  RemoveHouseholdMemberInput,
  RemoveHouseholdMemberResult,
} from "../remove-member";

export type RemoveHouseholdMemberRouteInput = {
  removeHouseholdMember: (
    input: RemoveHouseholdMemberInput,
  ) => Promise<RemoveHouseholdMemberResult>;
};

export function createRemoveHouseholdMemberRoute({
  removeHouseholdMember,
}: RemoveHouseholdMemberRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const parsedMembershipId = z.uuid().safeParse(c.req.param("membershipId"));

    if (!parsedHouseholdId.success || !parsedMembershipId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await removeHouseholdMember({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      membershipId: parsedMembershipId.data,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (result.kind === "invalid_member") {
      return c.json({ error: "Invalid member" }, 404);
    }

    return c.body(null, 204);
  };
}
