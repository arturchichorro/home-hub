import {
  type TransferHouseholdOwnershipRequest,
  transferHouseholdOwnershipRequestSchema,
} from "@home-hub/shared/households";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  TransferHouseholdOwnershipInput,
  TransferHouseholdOwnershipResult,
} from "../transfer-ownership";

export type TransferHouseholdOwnershipRouteInput = {
  transferHouseholdOwnership: (
    input: TransferHouseholdOwnershipInput,
  ) => Promise<TransferHouseholdOwnershipResult>;
};

export function createTransferHouseholdOwnershipRoute({
  transferHouseholdOwnership,
}: TransferHouseholdOwnershipRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest =
      transferHouseholdOwnershipRequestSchema.safeParse(body);

    if (!parsedHouseholdId.success || !parsedRequest.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: TransferHouseholdOwnershipRequest = parsedRequest.data;
    const result = await transferHouseholdOwnership({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      membershipId: request.membershipId,
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
