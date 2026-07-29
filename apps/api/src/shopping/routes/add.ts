import {
  type CreateShoppingItemRequest,
  createShoppingItemRequestSchema,
} from "@home-hub/shared/shopping";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type { AddShoppingItemInput, AddShoppingItemResult } from "../add";

export type CreateAddShoppingItemRouteInput = {
  addShoppingItem: (
    input: AddShoppingItemInput,
  ) => Promise<AddShoppingItemResult>;
};

export function createAddShoppingItemRoute({
  addShoppingItem,
}: CreateAddShoppingItemRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = await c.req.json().catch(() => undefined);
    const parsedRequest = createShoppingItemRequestSchema.safeParse(body);

    if (!parsedHouseholdId.success || !parsedRequest.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: CreateShoppingItemRequest = parsedRequest.data;
    const result = await addShoppingItem({
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

    return c.json({ item: result.item }, 200);
  };
}
