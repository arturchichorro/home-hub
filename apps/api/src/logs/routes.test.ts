import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import { LogEntryError, type LogEntryServices } from "./entries";
import { createLogRoutes } from "./routes";

const secret = "isolated-log-route-secret-32bytes";

const userId = crypto.randomUUID();

const householdId = crypto.randomUUID();

const logId = crypto.randomUUID();

const entryOn = "2026-11-02";

const token = signAccessToken({ userId, jwtId: crypto.randomUUID(), secret });

const services: LogEntryServices = { read: vi.fn(), write: vi.fn() };

const app = new Hono().route(
  "/api/households/:householdId/logs",
  createLogRoutes({ jwtSecret: secret, services }),
);

const body = {
  entryId: crypto.randomUUID(),
  writeId: crypto.randomUUID(),
  expectedVersion: null,
  note: "Note",
  timeZone: "UTC",
};

const request = (data: unknown = body, auth = true) =>
  app.request(
    `/api/households/${householdId}/logs/${logId}/entries/${entryOn}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    },
  );

it("requires bearer authentication and validates dates/note payloads", async () => {
  expect((await request(body, false)).status).toBe(401);
  expect((await request({ ...body, note: "x".repeat(20001) })).status).toBe(
    400,
  );
});

it("takes household/log/date from the path and user identity from authentication", async () => {
  vi.mocked(services.write).mockResolvedValueOnce({ entry: null });
  expect((await request()).status).toBe(200);
  expect(services.write).toHaveBeenLastCalledWith({
    ...body,
    householdId,
    logId,
    entryOn,
    userId,
  });
});

it("returns a scoped conflict snapshot and never serializes database errors", async () => {
  vi.mocked(services.write).mockRejectedValueOnce(
    new LogEntryError(409, "Changed", null),
  );

  const conflict = await request();
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ entry: null });
  vi.mocked(services.write).mockRejectedValueOnce(
    Error("private SQL log note secret"),
  );

  const failure = await request();
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toMatch(/private SQL|secret/u);
});
