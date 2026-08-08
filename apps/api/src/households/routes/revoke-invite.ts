import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  RevokeHouseholdInviteInput,
  RevokeHouseholdInviteResult,
} from "../revoke-invite";

export type RevokeHouseholdInviteRouteInput = {
  revokeHouseholdInvite: (
    input: RevokeHouseholdInviteInput,
  ) => Promise<RevokeHouseholdInviteResult>;
};

export function createRevokeHouseholdInviteRoute({
  revokeHouseholdInvite,
}: RevokeHouseholdInviteRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const parsedInviteId = z.uuid().safeParse(c.req.param("inviteId"));

    if (!parsedHouseholdId.success || !parsedInviteId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await revokeHouseholdInvite({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      inviteId: parsedInviteId.data,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (result.kind === "invalid_invite") {
      return c.json({ error: "Invalid invite" }, 404);
    }

    return c.body(null, 204);
  };
}
