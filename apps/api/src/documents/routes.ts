import { documentUploadSchema } from "@home-hub/shared/documents";
import { Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import { DocumentServiceError, type DocumentServices } from "./service";
export function createDocumentRoutes({
  jwtSecret,
  services,
}: {
  jwtSecret: string;
  services: DocumentServices;
}) {
  const app = new Hono<AuthEnv>();
  app.use("*", createBearerAuth(jwtSecret));
  app.onError((e, c) => {
    if (e instanceof DocumentServiceError)
      return c.json({ error: e.message }, e.status);
    return c.json({ error: "Document action failed. Please retry." }, 503);
  });
  const scope = z.object({ householdId: z.uuid(), userId: z.uuid() });
  app.post("/uploads", async (c) => {
    const s = scope.safeParse({
        householdId: c.req.param("householdId"),
        userId: c.get("userId"),
      }),
      b = documentUploadSchema.safeParse(await c.req.json().catch(() => null));
    if (!s.success || !b.success)
      return c.json({ error: "Invalid document upload" }, 400);
    return c.json(await services.createUpload({ ...s.data, ...b.data }), 201);
  });
  app.post("/uploads/:fileId/confirm", async (c) => {
    const s = scope.extend({ fileId: z.uuid() }).safeParse({
      householdId: c.req.param("householdId"),
      userId: c.get("userId"),
      fileId: c.req.param("fileId"),
    });
    if (!s.success) return c.json({ error: "Invalid request" }, 400);
    return c.json(await services.confirm(s.data));
  });
  app.post("/:documentId/read-url", async (c) => {
    const s = scope.extend({ documentId: z.uuid() }).safeParse({
        householdId: c.req.param("householdId"),
        userId: c.get("userId"),
        documentId: c.req.param("documentId"),
      }),
      b = z
        .object({ disposition: z.enum(["inline", "attachment"]) })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
    if (!s.success || !b.success)
      return c.json({ error: "Invalid request" }, 400);
    return c.json(await services.read({ ...s.data, ...b.data }));
  });
  return app;
}
