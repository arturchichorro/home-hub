import {
  type AcceptHouseholdInviteRequest,
  acceptHouseholdInviteRequestSchema,
} from "@home-hub/shared/households";
import type { Context } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  AcceptHouseholdInviteInput,
  AcceptHouseholdInviteResult,
} from "../accept-invite";

export type AcceptHouseholdInviteRouteInput = {
  acceptHouseholdInvite: (
    input: AcceptHouseholdInviteInput,
  ) => Promise<AcceptHouseholdInviteResult>;
};

export function createAcceptHouseholdInviteRoute({
  acceptHouseholdInvite,
}: AcceptHouseholdInviteRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = acceptHouseholdInviteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: AcceptHouseholdInviteRequest = parsed.data;
    const result = await acceptHouseholdInvite({
      userId: c.get("userId"),
      token: request.token,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "invalid_invite") {
      return c.json({ error: "Invalid invite" }, 400);
    }

    if (result.kind === "already_member") {
      return c.json({ error: "Already a member" }, 409);
    }

    return c.json({ membership: result.membership }, 201);
  };
}
