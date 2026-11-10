import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  habitEntries,
  habits,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "../zero/db-provider";
import { createHabitStatsService } from "./stats";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))(
  "household-visible habit statistics on PostgreSQL",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let userId: string;
    let personId: string;
    let outsider: string;
    let householdId: string;
    let habitId: string;
    const scope = () => ({
      userId,
      personId,
      householdId,
      habitId,
      timeZone: "UTC",
    });
    const stats = (now = "2027-01-10T12:00:00Z", overrides = {}) =>
      createHabitStatsService({ db: client.db, now: () => new Date(now) })({
        ...scope(),
        ...overrides,
      });

    beforeAll(() => {
      if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
        throw Error("Disposable home_hub_test_ database required");
      }
      client = createDbClient(url);
    });
    afterAll(async () => {
      await client?.close();
    });
    beforeEach(async () => {
      userId = randomUUID();
      personId = randomUUID();
      outsider = randomUUID();
      householdId = randomUUID();
      habitId = randomUUID();
      await client.db.insert(users).values(
        [userId, personId, outsider].map((id) => ({
          id,
          username: id,
          email: `${id}@example.invalid`,
          passwordHash: "fixture",
        })),
      );
      await client.db
        .insert(households)
        .values({ id: householdId, name: "Fixture" });
      await client.db.insert(householdMembers).values(
        [userId, personId].map((id) => ({
          id: randomUUID(),
          householdId,
          userId: id,
          role: "member" as const,
          sortKey: 0,
        })),
      );
      await client.db
        .insert(householdModuleSettings)
        .values({ householdId, moduleKey: "habits", enabled: true });
      await client.db.insert(habits).values({
        id: habitId,
        householdId,
        name: "Read",
        note: "Stored shared instructions",
      });
    });
    const entry = (
      entryOn: string,
      completed = true,
      workoutCompleted = false,
      author?: string,
    ) =>
      client.db.insert(habitEntries).values({
        householdId,
        habitId,
        userId: author ?? personId,
        entryOn,
        completed,
        workoutCompleted,
        note: "Retained daily note",
      });

    it("returns empty totals without downloading notes or fabricating streaks", async () => {
      expect(await stats()).toEqual({
        kind: "success",
        stats: {
          asOf: "2027-01-10",
          completedDays: 0,
          lastOn: null,
          currentWeeks: 0,
          bestWeeks: 0,
          last7: 0,
          last30: 0,
        },
      });
    });
    it("counts manual OR training once, excludes notes/empty/future days and separates people/habits", async () => {
      await entry("2026-12-28");
      await entry("2027-01-04", false, true);
      await entry("2027-01-10", true, true);
      await entry("2027-01-09", false, false);
      await entry("2027-01-11");
      await entry("2026-12-14", true, false, userId);
      expect(await stats()).toEqual({
        kind: "success",
        stats: {
          asOf: "2027-01-10",
          completedDays: 3,
          lastOn: "2027-01-10",
          currentWeeks: 2,
          bestWeeks: 2,
          last7: 2,
          last30: 3,
        },
      });
      expect((await stats(undefined, { personId: userId })).kind).toBe(
        "success",
      );
      const otherHabit = randomUUID();
      await client.db
        .insert(habits)
        .values({ id: otherHabit, householdId, name: "Other" });
      expect(await stats(undefined, { habitId: otherHabit })).toMatchObject({
        stats: { completedDays: 0 },
      });
    });
    it("uses Monday–Sunday activity weeks across years and lets the current week stay open", async () => {
      await entry("2026-12-21");
      await entry("2026-12-27");
      await entry("2027-01-03");
      expect(await stats()).toMatchObject({
        stats: { currentWeeks: 2, bestWeeks: 2 },
      });
      expect(await stats("2027-01-11T00:00:00Z")).toMatchObject({
        stats: { currentWeeks: 0, bestWeeks: 2 },
      });
      await entry("2027-01-10");
      expect(await stats()).toMatchObject({
        stats: { currentWeeks: 3, bestWeeks: 3 },
      });
      await entry("2027-01-25");
      expect(await stats("2027-01-25T12:00:00Z")).toMatchObject({
        stats: { currentWeeks: 1, bestWeeks: 3 },
      });
    });
    it("uses inclusive seven/thirty-calendar-day windows and reflects historical corrections", async () => {
      for (const day of [
        "2026-12-11",
        "2026-12-12",
        "2027-01-03",
        "2027-01-04",
        "2027-01-10",
      ]) {
        await entry(day);
      }
      expect(await stats()).toMatchObject({
        stats: { completedDays: 5, last7: 2, last30: 4 },
      });
      await client.db
        .update(habitEntries)
        .set({ completed: false })
        .where(
          and(
            eq(habitEntries.habitId, habitId),
            eq(habitEntries.entryOn, "2027-01-10"),
          ),
        );
      expect(await stats()).toMatchObject({
        stats: { completedDays: 4, last7: 1, last30: 3, lastOn: "2027-01-04" },
      });
    });
    it.each(["2026-03-08T07:30:00Z", "2026-11-01T06:30:00Z"])(
      "uses stored date labels across DST (%s)",
      async (now) => {
        const day = now.slice(0, 10);
        await entry(day);
        expect(
          await stats(now, { timeZone: "America/New_York" }),
        ).toMatchObject({ stats: { asOf: day, last7: 1, currentWeeks: 1 } });
      },
    );
    it("derives today on the server in the requested timezone rather than accepting a forged date", async () => {
      await entry("2027-01-10");
      expect(
        await stats("2027-01-10T00:30:00Z", {
          timeZone: "America/Los_Angeles",
        }),
      ).toMatchObject({ stats: { asOf: "2027-01-09", completedDays: 0 } });
      expect(
        await stats("2027-01-10T00:30:00Z", { timeZone: "Pacific/Kiritimati" }),
      ).toMatchObject({ stats: { asOf: "2027-01-10", completedDays: 1 } });
    });
    it("retains archived history/statistics and exposes authorized metadata without a lifetime entries query", async () => {
      await entry("2027-01-04");
      await client.db
        .update(habits)
        .set({ status: "archived" })
        .where(eq(habits.id, habitId));
      expect(await stats()).toMatchObject({
        stats: { completedDays: 1, bestWeeks: 1, lastOn: "2027-01-04" },
      });
      const provider = createZeroDbProvider({ db: client.db });
      expect(
        await provider.run(
          queries.habits.detail.fn({
            args: { householdId, habitId },
            ctx: { userId },
          }),
        ),
      ).toMatchObject({
        status: "archived",
        note: "Stored shared instructions",
      });
      expect(
        await provider.run(
          queries.habits.detail.fn({
            args: { householdId, habitId },
            ctx: { userId: outsider },
          }),
        ),
      ).toBeUndefined();
    });
    it.each(["viewer", "person", "module", "household"])(
      "checks live %s access",
      async (kind) => {
        if (kind === "viewer" || kind === "person") {
          await client.db
            .delete(householdMembers)
            .where(
              and(
                eq(householdMembers.householdId, householdId),
                eq(
                  householdMembers.userId,
                  kind === "viewer" ? userId : personId,
                ),
              ),
            );
        } else if (kind === "module") {
          await client.db
            .update(householdModuleSettings)
            .set({ enabled: false })
            .where(eq(householdModuleSettings.householdId, householdId));
        } else {
          await client.db
            .update(households)
            .set({ deletedAt: new Date() })
            .where(eq(households.id, householdId));
        }
        expect(await stats()).toEqual({ kind: "forbidden" });
      },
    );
    it("rejects outsider viewers/targets and wrong-household habit IDs", async () => {
      expect(await stats(undefined, { userId: randomUUID() })).toEqual({
        kind: "unauthorized",
      });
      expect(await stats(undefined, { userId: outsider })).toEqual({
        kind: "forbidden",
      });
      expect(await stats(undefined, { personId: outsider })).toEqual({
        kind: "forbidden",
      });
      expect(await stats(undefined, { habitId: randomUUID() })).toEqual({
        kind: "not_found",
      });
    });
  },
);
