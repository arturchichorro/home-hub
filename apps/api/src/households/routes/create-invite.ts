import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  CreateHouseholdInviteInput,
  CreateHouseholdInviteResult,
} from "../create-invite";

export type CreateHouseholdInviteRouteInput = {
  createHouseholdInvite: (
    input: CreateHouseholdInviteInput,
  ) => Promise<CreateHouseholdInviteResult>;
};

export function createHouseholdInviteRoute({
  createHouseholdInvite,
}: CreateHouseholdInviteRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));

    if (!parsedHouseholdId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await createHouseholdInvite({
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

    return c.json({ invite: result.invite }, 201);
  };
}
