import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import type { ExerciseMediaServices } from "./exercise-media";
import { createExerciseMediaRoutes } from "./routes";

const secret = "exercise-media-test-jwt";
const householdId = randomUUID(),
  exerciseId = randomUUID(),
  attachmentId = randomUUID(),
  userId = randomUUID();
const prefix = `/api/households/${householdId}/workouts/exercises`;
function harness() {
  const services = {
    createUpload: vi.fn<ExerciseMediaServices["createUpload"]>(async () => ({
      kind: "forbidden",
    })),
    confirmUpload: vi.fn<ExerciseMediaServices["confirmUpload"]>(async () => ({
      kind: "forbidden",
    })),
    deleteAttachment: vi.fn<ExerciseMediaServices["deleteAttachment"]>(
      async () => ({ kind: "forbidden" }),
    ),
    readUrls: vi.fn<ExerciseMediaServices["readUrls"]>(async () => ({
      kind: "forbidden",
    })),
  };
  const app = new Hono();
  app.route(
    "/api/households/:householdId/workouts/exercises",
    createExerciseMediaRoutes({ jwtSecret: secret, services }),
  );
  const headers = {
    Authorization: `Bearer ${signAccessToken({ userId, jwtId: randomUUID(), secret })}`,
    "Content-Type": "application/json",
  };
  return { app, services, headers };
}
const upload = {
  contentType: "image/png",
  byteSize: 42,
  width: 640,
  height: 480,
};
describe("exercise media routes", () => {
  it.each([
    ["POST", `/${exerciseId}/media/uploads`],
    ["POST", `/${exerciseId}/media/${attachmentId}/confirm`],
    ["DELETE", `/${exerciseId}/media/${attachmentId}`],
    ["POST", "/media/read-urls"],
  ])("requires authentication for %s %s", async (method, path) => {
    const { app, services } = harness();
    expect((await app.request(prefix + path, { method })).status).toBe(401);
    expect(
      Object.values(services).every((fn) => fn.mock.calls.length === 0),
    ).toBe(true);
  });
  it.each([
    { ...upload, contentType: "video/mp4" },
    { ...upload, contentType: "image/gif" },
    { ...upload, objectKey: "arbitrary/key" },
    { ...upload, byteSize: 0 },
    { ...upload, byteSize: 10485761 },
  ])("rejects invalid or premature media uploads: %o", async (body) => {
    const { app, services, headers } = harness();
    expect(
      (
        await app.request(`${prefix}/${exerciseId}/media/uploads`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
    expect(services.createUpload).not.toHaveBeenCalled();
  });
  it("returns upload contracts with server-scoped identity", async () => {
    const { app, services, headers } = harness();
    const response = {
      attachmentId,
      upload: {
        url: "https://upload.example/object",
        expiresInSeconds: 300,
        requiredHeaders: { "Content-Type": "image/png" as const },
      },
    };
    services.createUpload.mockResolvedValue({ kind: "success", ...response });
    const result = await app.request(`${prefix}/${exerciseId}/media/uploads`, {
      method: "POST",
      headers,
      body: JSON.stringify(upload),
    });
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual(response);
    expect(services.createUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      exerciseId,
      ...upload,
    });
  });
  it.each([
    ["unauthorized", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["upload_not_found", 409],
    ["invalid_upload", 422],
  ] as const)("maps confirmation %s to %s", async (kind, status) => {
    const { app, services, headers } = harness();
    services.confirmUpload.mockResolvedValue({ kind });
    const result = await app.request(
      `${prefix}/${exerciseId}/media/${attachmentId}/confirm`,
      { method: "POST", headers },
    );
    expect(result.status).toBe(status);
    expect(services.confirmUpload).toHaveBeenCalledWith({
      userId,
      householdId,
      exerciseId,
      attachmentId,
    });
  });
  it("confirms and deletes attachments", async () => {
    const { app, services, headers } = harness();
    const confirmedAt = new Date();
    services.confirmUpload.mockResolvedValue({
      kind: "success",
      attachment: { id: attachmentId, confirmedAt },
    });
    services.deleteAttachment.mockResolvedValue({ kind: "success" });
    const response = await app.request(
      `${prefix}/${exerciseId}/media/${attachmentId}/confirm`,
      { method: "POST", headers },
    );
    expect(await response.json()).toEqual({
      attachment: { id: attachmentId, confirmedAt: confirmedAt.toISOString() },
    });
    expect(
      (
        await app.request(`${prefix}/${exerciseId}/media/${attachmentId}`, {
          method: "DELETE",
          headers,
        })
      ).status,
    ).toBe(204);
  });
  it("validates bounded read batches and preserves omitted unauthorized entries", async () => {
    const { app, services, headers } = harness();
    services.readUrls.mockResolvedValue({ kind: "success", reads: [] });
    const request = { exerciseId, attachmentId, variant: "viewer" };
    expect(
      (
        await app.request(`${prefix}/media/read-urls`, {
          method: "POST",
          headers,
          body: JSON.stringify({ requests: [request] }),
        })
      ).status,
    ).toBe(200);
    expect(services.readUrls).toHaveBeenCalledWith({
      userId,
      householdId,
      requests: [request],
    });
    for (const requests of [
      [],
      Array(101).fill(request),
      [{ ...request, variant: "original" }],
    ]) {
      expect(
        (
          await app.request(`${prefix}/media/read-urls`, {
            method: "POST",
            headers,
            body: JSON.stringify({ requests }),
          })
        ).status,
      ).toBe(400);
    }
  });
});
