import {
  type RenameHouseholdRequest,
  renameHouseholdRequestSchema,
} from "@home-hub/shared/households";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type { RenameHouseholdInput, RenameHouseholdResult } from "../rename";

export type RenameHouseholdRouteInput = {
  renameHousehold: (
    input: RenameHouseholdInput,
  ) => Promise<RenameHouseholdResult>;
};

export function createRenameHouseholdRoute({
  renameHousehold,
}: RenameHouseholdRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest = renameHouseholdRequestSchema.safeParse(body);

    if (!parsedHouseholdId.success || !parsedRequest.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: RenameHouseholdRequest = parsedRequest.data;
    const result = await renameHousehold({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      name: request.name,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ household: result.household }, 200);
  };
}
