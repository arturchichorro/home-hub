import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  ListHouseholdMembersInput,
  ListHouseholdMembersResult,
} from "../list-members";

export type ListHouseholdMembersRouteInput = {
  listHouseholdMembers: (
    input: ListHouseholdMembersInput,
  ) => Promise<ListHouseholdMembersResult>;
};

export function createListHouseholdMembersRoute({
  listHouseholdMembers,
}: ListHouseholdMembersRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));

    if (!parsedHouseholdId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await listHouseholdMembers({
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

    return c.json({ members: result.members }, 200);
  };
}
