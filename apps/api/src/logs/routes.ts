import {
  logEntryScopeSchema,
  logEntryWriteSchema,
} from "@home-hub/shared/logs";
import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import { LogEntryError, type LogEntryServices } from "./entries";

export function createLogRoutes({
  jwtSecret,
  services,
}: {
  jwtSecret: string;
  services: LogEntryServices;
}) {
  const app = new Hono<AuthEnv>();
  app.use("*", createBearerAuth(jwtSecret));
  app.onError((e, c) => {
    if (e instanceof LogEntryError) {
      return c.json(
        { error: e.message, ...(e.status === 409 ? { entry: e.entry } : {}) },
        e.status,
      );
    }

    return c.json({ error: "The note could not be saved. Please retry." }, 503);
  });
  app.get("/:logId/entries/:entryOn", async (c) => {
    const s = logEntryScopeSchema.safeParse({
      householdId: c.req.param("householdId"),
      logId: c.req.param("logId"),
      entryOn: c.req.param("entryOn"),
    });

    if (!s.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    return c.json(await services.read({ ...s.data, userId: c.get("userId") }));
  });
  app.put("/:logId/entries/:entryOn", async (c) => {
    const s = logEntryWriteSchema.safeParse({
      ...(await c.req.json().catch(() => ({}))),
      householdId: c.req.param("householdId"),
      logId: c.req.param("logId"),
      entryOn: c.req.param("entryOn"),
    });

    if (!s.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    return c.json(await services.write({ ...s.data, userId: c.get("userId") }));
  });

  return app;
}
