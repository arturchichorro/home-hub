import {
  contactScopeSchema,
  contactWriteSchema,
  entryScopeSchema,
  entryWriteSchema,
} from "@home-hub/shared/contacts";
import { Hono } from "hono";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import { ContactsError, type ContactsServices } from "./records";

export function createContactsRoutes({
  jwtSecret,
  services,
}: {
  jwtSecret: string;
  services: ContactsServices;
}) {
  const app = new Hono<AuthEnv>();
  app.use("*", createBearerAuth(jwtSecret));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof ContactsError) {
      return c.json(
        { error: error.message, record: error.record },
        error.status,
      );
    }
    return c.json({ error: "Contacts unavailable. Please retry." }, 503);
  });
  app.get("/profiles/:contactId", async (c) => {
    const parsed = contactScopeSchema.safeParse({
      householdId: c.req.param("householdId"),
      contactId: c.req.param("contactId"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }
    return c.json({
      record: await services.readProfile({
        ...parsed.data,
        userId: c.get("userId"),
      }),
    });
  });
  app.put("/profiles/:contactId", async (c) => {
    const parsed = contactWriteSchema.safeParse({
      ...(await c.req.json().catch(() => ({}))),
      householdId: c.req.param("householdId"),
      contactId: c.req.param("contactId"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid contact details" }, 400);
    }
    return c.json({
      record: await services.writeProfile({
        ...parsed.data,
        userId: c.get("userId"),
      }),
    });
  });
  app.get("/entries/:entryId", async (c) => {
    const parsed = entryScopeSchema.safeParse({
      householdId: c.req.param("householdId"),
      entryId: c.req.param("entryId"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }
    return c.json({
      record: await services.readEntry({
        ...parsed.data,
        userId: c.get("userId"),
      }),
    });
  });
  app.put("/entries/:entryId", async (c) => {
    const parsed = entryWriteSchema.safeParse({
      ...(await c.req.json().catch(() => ({}))),
      householdId: c.req.param("householdId"),
      entryId: c.req.param("entryId"),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid entry" }, 400);
    }
    return c.json({
      record: await services.writeEntry({
        ...parsed.data,
        userId: c.get("userId"),
      }),
    });
  });
  return app;
}
