import {
  createExerciseMediaUploadSchema,
  exerciseMediaReadRequestSchema,
} from "@home-hub/shared/exercise-media";
import { type Context, Hono } from "hono";
import * as z from "zod";
import { type AuthEnv, createBearerAuth } from "../auth/bearer-auth";
import type { ExerciseMediaServices } from "./exercise-media";

export type ExerciseMediaRoutesInput = {
  jwtSecret: string;
  services: ExerciseMediaServices;
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
  if (result.kind === "forbidden") return c.json({ error: "Forbidden" }, 403);
  if (result.kind === "not_found") return c.json({ error: "Not found" }, 404);
  if (result.kind === "upload_not_found")
    return c.json({ error: "Upload not found" }, 409);
  return c.json({ error: "Invalid upload" }, 422);
}
function scope(c: Context<AuthEnv>) {
  const input = z
    .object({ userId: z.uuid(), householdId: z.uuid(), exerciseId: z.uuid() })
    .safeParse({
      userId: c.get("userId"),
      householdId: c.req.param("householdId"),
      exerciseId: c.req.param("exerciseId"),
    });
  return input.success ? input.data : undefined;
}
export function createExerciseMediaRoutes({
  jwtSecret,
  services,
}: ExerciseMediaRoutesInput) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", createBearerAuth(jwtSecret));
  routes.post("/:exerciseId/media/uploads", async (c) => {
    const input = scope(c),
      body = createExerciseMediaUploadSchema.safeParse(
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
  routes.post("/:exerciseId/media/:attachmentId/confirm", async (c) => {
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
  routes.delete("/:exerciseId/media/:attachmentId", async (c) => {
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
    const body = exerciseMediaReadRequestSchema.safeParse(
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
