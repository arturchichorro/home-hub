import {
  householdModuleKeySchema,
  setHouseholdModuleEnabledRequestSchema,
} from "@home-hub/shared/modules";
import type { Context } from "hono";
import * as z from "zod";

import type { AuthEnv } from "../../auth/bearer-auth";
import type {
  SetHouseholdModuleEnabledInput,
  SetHouseholdModuleEnabledResult,
} from "../set-module-enabled";

export type SetHouseholdModuleEnabledRouteInput = {
  setHouseholdModuleEnabled: (
    input: SetHouseholdModuleEnabledInput,
  ) => Promise<SetHouseholdModuleEnabledResult>;
};

export function createSetHouseholdModuleEnabledRoute({
  setHouseholdModuleEnabled,
}: SetHouseholdModuleEnabledRouteInput) {
  return async (c: Context<AuthEnv>) => {
    const householdId = z.uuid().safeParse(c.req.param("householdId"));
    const moduleKey = householdModuleKeySchema.safeParse(
      c.req.param("moduleKey"),
    );
    const body = setHouseholdModuleEnabledRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!householdId.success || !moduleKey.success || !body.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await setHouseholdModuleEnabled({
      userId: c.get("userId"),
      householdId: householdId.data,
      moduleKey: moduleKey.data,
      enabled: body.data.enabled,
    });
    if (result.kind === "unauthorized") {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
    if (result.kind === "module_not_configured") {
      return c.json({ error: "Module not configured" }, 409);
    }
    return c.json({ setting: result.setting }, 200);
  };
}
