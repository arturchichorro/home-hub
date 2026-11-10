import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { signAccessToken } from "../auth/access-token";
import { createHabitStatsRoutes } from "./routes";
import type { HabitStatsService } from "./stats";

const secret = "habit-stats-fixture";
const userId = randomUUID();
const personId = randomUUID();
const householdId = randomUUID();
const habitId = randomUUID();
const path = `/api/households/${householdId}/habits/${habitId}/stats`;
const query = `?personId=${personId}&timeZone=Europe%2FLisbon`;
function harness() {
  const stats = vi.fn<HabitStatsService>(async () => ({ kind: "forbidden" }));
  const app = new Hono();
  app.route(
    "/api/households/:householdId/habits",
    createHabitStatsRoutes({ jwtSecret: secret, stats }),
  );
  return {
    app,
    stats,
    headers: {
      Authorization: `Bearer ${signAccessToken({ userId, jwtId: randomUUID(), secret })}`,
    },
  };
}
it("authenticates and validates person/timezone/path, rejecting forged report dates", async () => {
  const { app, stats, headers } = harness();
  expect((await app.request(path + query)).status).toBe(401);
  for (const suffix of [
    "",
    "?personId=invalid&timeZone=UTC",
    `?personId=${personId}&timeZone=invalid`,
    `${query}&today=2099-01-01`,
    `${query}&userId=${randomUUID()}`,
  ]) {
    expect((await app.request(path + suffix, { headers })).status).toBe(400);
  }
  expect(
    (await app.request(path.replace(habitId, "invalid") + query, { headers }))
      .status,
  ).toBe(400);
  expect(stats).not.toHaveBeenCalled();
});
it.each([
  ["unauthorized", 401],
  ["forbidden", 403],
  ["not_found", 404],
] as const)("maps %s safely", async (kind, status) => {
  const { app, stats, headers } = harness();
  stats.mockResolvedValue({ kind });
  const response = await app.request(path + query, { headers });
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(stats).toHaveBeenCalledWith({
    userId,
    personId,
    householdId,
    habitId,
    timeZone: "Europe/Lisbon",
  });
});
it("returns only derived counts, without cacheable notes or entry history", async () => {
  const { app, stats, headers } = harness();
  const data = {
    asOf: "2027-01-10",
    completedDays: 0,
    lastOn: null,
    currentWeeks: 0,
    bestWeeks: 0,
    last7: 0,
    last30: 0,
  };
  stats.mockResolvedValue({ kind: "success", stats: data });
  const response = await app.request(path + query, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(data);
});
