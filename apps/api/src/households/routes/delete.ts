import type { Context } from "hono";
import * as z from "zod";
import type { AuthEnv } from "../../auth/bearer-auth";
import type { DeleteHouseholdInput, DeleteHouseholdResult } from "../delete";

export type DeleteHouseholdRouteInput = {
  deleteHousehold: (
    input: DeleteHouseholdInput,
  ) => Promise<DeleteHouseholdResult>;
};

export function createDeleteHouseholdRoute({
  deleteHousehold,
}: DeleteHouseholdRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const parsedHouseholdId = z.uuid().safeParse(c.req.param("householdId"));

    if (!parsedHouseholdId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await deleteHousehold({
      householdId: parsedHouseholdId.data,
      userId: c.get("userId"),
    });

    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (result.kind === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.body(null, 204);
  };
}
