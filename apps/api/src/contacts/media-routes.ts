import {
  contactMediaReadRequestSchema,
  createContactMediaUploadSchema,
} from "@home-hub/shared/contact-media";
import { type Context, Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import type { ContactMediaServices } from "./media";
import { ContactsError } from "./records";

export type ContactMediaRoutesInput = {
  jwtSecret: string;
  services: ContactMediaServices;
};

function rejection(
  c: Context<AuthEnv>,
  result: {
    kind:
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "invalid_upload"
      | "upload_not_found";
  },
) {
  if (result.kind === "unauthorized") {
    c.header("WWW-Authenticate", "Bearer");

    return c.json({ error: "Unauthorized" }, 401);
  }

  if (result.kind === "forbidden") {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (result.kind === "not_found") {
    return c.json({ error: "Not found" }, 404);
  }

  if (result.kind === "upload_not_found") {
    return c.json({ error: "Upload not found" }, 409);
  }

  return c.json({ error: "Invalid upload" }, 422);
}

function scope(c: Context<AuthEnv>) {
  const input = z
    .object({ userId: z.uuid(), householdId: z.uuid(), itemId: z.uuid() })
    .safeParse({
      userId: c.get("userId"),
      householdId: c.req.param("householdId"),
      itemId: c.req.param("itemId"),
    });

  return input.success ? input.data : undefined;
}

export function createContactMediaRoutes({
  jwtSecret,
  services,
}: ContactMediaRoutesInput) {
  const routes = new Hono<AuthEnv>();
  routes.onError((error, c) => {
    if (error instanceof ContactsError) {
      return c.json({ error: error.message }, error.status);
    }
    return c.json(
      { error: "Unable to update this picture. Please retry." },
      503,
    );
  });
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  routes.use("*", createBearerAuth(jwtSecret));
  routes.post("/:itemId/media/uploads", async (c) => {
    const input = scope(c);
    const body = createContactMediaUploadSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );

    if (!input || !body.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await services.createUpload({ ...input, ...body.data });

    return c.json(
      { attachmentId: result.attachmentId, upload: result.upload },
      201,
    );
  });
  routes.post("/:itemId/media/:attachmentId/confirm", async (c) => {
    const input = scope(c);
    const attachmentId = z.uuid().safeParse(c.req.param("attachmentId"));

    if (!input || !attachmentId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await services.confirmUpload({
      ...input,
      attachmentId: attachmentId.data,
    });

    if (result.kind !== "success") {
      return rejection(c, result);
    }

    return c.json({ attachment: result.attachment }, 200);
  });
  routes.delete("/:itemId/media/:attachmentId", async (c) => {
    const input = scope(c);
    const attachmentId = z.uuid().safeParse(c.req.param("attachmentId"));

    if (!input || !attachmentId.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    await services.deleteAttachment({
      ...input,
      attachmentId: attachmentId.data,
    });

    return c.body(null, 204);
  });
  routes.post("/media/read-urls", async (c) => {
    const householdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = contactMediaReadRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );

    if (!householdId.success || !body.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const result = await services.readUrls({
      userId: c.get("userId"),
      householdId: householdId.data,
      requests: body.data.requests,
    });

    return c.json({ reads: result.reads }, 200);
  });

  return routes;
}
