import {
  createListMediaUploadSchema,
  listMediaReadRequestSchema,
} from "@home-hub/shared/list-media";
import { type Context, Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import { VideoProcessingBusyError } from "../media/process-video";
import type { ListMediaServices } from "./media";

export type ListMediaRoutesInput = {
  jwtSecret: string;
  services: ListMediaServices;
};
function rejection(
  c: Context<AuthEnv>,
  result: {
    kind:
      | "busy"
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "invalid_upload"
      | "upload_not_found";
  },
) {
  if (result.kind === "busy") {
    c.header("Retry-After", "5");
    return c.json({ error: "Video processing busy. Retry shortly." }, 503);
  }
  if (result.kind === "unauthorized") {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
  if (result.kind === "not_found") return c.json({ error: "Not found" }, 404);
  if (result.kind === "upload_not_found")
    return c.json({ error: "Upload not found" }, 409);
  return c.json({ error: "Invalid upload" }, 422);
}
function scope(c: Context<AuthEnv>) {
  const input = z
    .object({ userId: z.uuid(), householdId: z.uuid(), listId: z.uuid() })
    .safeParse({
      userId: c.get("userId"),
      householdId: c.req.param("householdId"),
      listId: c.req.param("listId"),
    });
  return input.success ? input.data : undefined;
}
export function createListMediaRoutes({
  jwtSecret,
  services,
}: ListMediaRoutesInput) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", createBearerAuth(jwtSecret));
  routes.use("*", async (c, next) => {
    try {
      await next();
    } catch (error) {
      if (error instanceof VideoProcessingBusyError)
        return c.json({ error: "Video processing busy. Retry shortly." }, 503);
      throw error;
    }
  });
  routes.post("/:listId/media/uploads", async (c) => {
    const input = scope(c),
      body = createListMediaUploadSchema.safeParse(
        await c.req.json().catch(() => undefined),
      );
    if (!input || !body.success)
      return c.json({ error: "Invalid request" }, 400);
    const result = await services.createUpload({ ...input, ...body.data });
    if (result.kind !== "success") return rejection(c, result);
    return c.json(
      { attachmentId: result.attachmentId, upload: result.upload },
      201,
    );
  });
  routes.post("/:listId/media/:attachmentId/confirm", async (c) => {
    const input = scope(c),
      attachmentId = z.uuid().safeParse(c.req.param("attachmentId"));
    if (!input || !attachmentId.success)
      return c.json({ error: "Invalid request" }, 400);
    const result = await services.confirmUpload({
      ...input,
      attachmentId: attachmentId.data,
    });
    if (result.kind !== "success") return rejection(c, result);
    return c.json({ attachment: result.attachment }, 200);
  });
  routes.delete("/:listId/media/:attachmentId", async (c) => {
    const input = scope(c),
      attachmentId = z.uuid().safeParse(c.req.param("attachmentId"));
    if (!input || !attachmentId.success)
      return c.json({ error: "Invalid request" }, 400);
    const result = await services.deleteAttachment({
      ...input,
      attachmentId: attachmentId.data,
    });
    if (result.kind !== "success") return rejection(c, result);
    return c.body(null, 204);
  });
  routes.post("/media/read-urls", async (c) => {
    const householdId = z.uuid().safeParse(c.req.param("householdId"));
    const body = listMediaReadRequestSchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!householdId.success || !body.success)
      return c.json({ error: "Invalid request" }, 400);
    const result = await services.readUrls({
      userId: c.get("userId"),
      householdId: householdId.data,
      requests: body.data.requests,
    });
    if (result.kind !== "success") return rejection(c, result);
    return c.json({ reads: result.reads }, 200);
  });
  return routes;
}
