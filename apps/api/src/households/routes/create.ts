import {
  type CreateHouseholdRequest,
  createHouseholdRequestSchema,
} from "@home-hub/shared/households";
import type { Context } from "hono";

import type { AuthEnv } from "../../auth/bearer-auth";
import type { CreateHouseholdInput, CreateHouseholdResult } from "../create";

export type CreateHouseholdRouteInput = {
  createHousehold: (
    input: CreateHouseholdInput,
  ) => Promise<CreateHouseholdResult>;
};

export function createHouseholdRoute({
  createHousehold,
}: CreateHouseholdRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = createHouseholdRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const request: CreateHouseholdRequest = parsed.data;
    const result = await createHousehold({
      userId: c.get("userId"),
      name: request.name,
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ household: result.household }, 201);
  };
}
