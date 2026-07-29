import {
  type SetShoppingItemStatusRequest,
  setShoppingItemStatusRequestSchema,
} from "@home-hub/shared/shopping";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  SetShoppingItemStatusInput,
  SetShoppingItemStatusResult,
} from "../set-status";

export type CreateSetShoppingItemStatusRouteInput = {
  setShoppingItemStatus: (
    input: SetShoppingItemStatusInput,
  ) => Promise<SetShoppingItemStatusResult>;
};

export function createSetShoppingItemStatusRoute({
  setShoppingItemStatus,
}: CreateSetShoppingItemStatusRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const parsedItemId = z.uuid().safeParse(c.req.param("itemId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest = setShoppingItemStatusRequestSchema.safeParse(body);

    if (
      !parsedHouseholdId.success ||
      !parsedItemId.success ||
      !parsedRequest.success
    ) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: SetShoppingItemStatusRequest = parsedRequest.data;
    const result = await setShoppingItemStatus({
      userId: c.get("userId"),
      householdId: parsedHouseholdId.data,
      itemId: parsedItemId.data,
      status: request.status,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (result.kind === "not_found") {
      return c.json({ error: "Shopping item not found" }, 404);
    }

    return c.json({ item: result.item }, 200);
  };
}
