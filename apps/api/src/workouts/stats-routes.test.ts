import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import type { ExerciseStatsService } from "./exercise-stats";
import { createExerciseStatsRoutes } from "./stats-routes";

const secret = "exercise-stats-test";
const userId = randomUUID();
const householdId = randomUUID();
const exerciseId = randomUUID();
const prefix = `/api/households/${householdId}/workouts/exercises`;
function harness() {
  const stats = vi.fn<ExerciseStatsService>(async () => ({
    kind: "forbidden",
  }));
  const app = new Hono();
  app.route(
    "/api/households/:householdId/workouts/exercises",
    createExerciseStatsRoutes({ jwtSecret: secret, stats }),
  );
  const headers = {
    Authorization: `Bearer ${signAccessToken({ userId, jwtId: randomUUID(), secret })}`,
  };
  return { app, stats, headers };
}
it("requires authentication and validates scope before calling the service", async () => {
  const { app, stats, headers } = harness();
  expect((await app.request(`${prefix}/${exerciseId}/stats`)).status).toBe(401);
  expect(
    (await app.request(`${prefix}/invalid/stats`, { headers })).status,
  ).toBe(400);
  expect(stats).not.toHaveBeenCalled();
});
it.each([
  ["unauthorized", 401],
  ["forbidden", 403],
  ["not_found", 404],
] as const)(
  "maps %s without returning private content",
  async (kind, status) => {
    const { app, stats, headers } = harness();
    stats.mockResolvedValue({ kind });
    const response = await app.request(
      `${prefix}/${exerciseId}/stats?userId=${randomUUID()}`,
      { headers },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(stats).toHaveBeenCalledWith({ householdId, exerciseId, userId });
  },
);
it("returns statistics without cacheable private responses", async () => {
  const { app, stats, headers } = harness();
  const measure = { total: 0, left: 0, right: 0, sets: 0, unilateralSets: 0 };
  const data = {
    sessions: 0,
    sets: 0,
    lastOn: null,
    reps: measure,
    seconds: measure,
    volumeKg: null,
    unmeasuredSets: 0,
    records: [],
  };
  stats.mockResolvedValue({ kind: "success", stats: data });
  const response = await app.request(`${prefix}/${exerciseId}/stats`, {
    headers,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(data);
});
