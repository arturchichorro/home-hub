import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  exercises,
  habitEntries,
  habits,
  householdMembers,
  householdModuleSettings,
  households,
  trainingSessionExercises,
  trainingSessionSets,
  trainingSessions,
  users,
} from "@home-hub/database/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportStatistics } from "./export";

const url = process.env.TEST_DATABASE_URL;
const now = new Date("2027-01-10T12:00:00Z");

describe.runIf(Boolean(url))("operator statistics export on PostgreSQL", () => {
  let client: ReturnType<typeof createDbClient>;
  let h: string;
  let user: string;
  let peer: string;
  let former: string;
  let habit: string;
  let exercise: string;

  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Owned disposable database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    h = randomUUID();
    user = randomUUID();
    peer = randomUUID();
    former = randomUUID();
    habit = randomUUID();
    exercise = randomUUID();
    await client.db.insert(users).values(
      [user, peer, former].map((id) => ({
        id,
        username: id,
        email: id + "@secret.invalid",
        passwordHash: "TOP_SECRET_PASSWORD",
      })),
    );
    await client.db
      .insert(households)
      .values({ id: h, name: "Export household" });
    await client.db.insert(householdMembers).values(
      [user, peer].map((userId) => ({
        id: randomUUID(),
        householdId: h,
        userId,
        role: "member" as const,
        sortKey: 0,
      })),
    );
    await client.db.insert(householdModuleSettings).values(
      ["habits", "workouts"].map((moduleKey) => ({
        householdId: h,
        moduleKey,
        enabled: true,
      })),
    );
    await client.db.insert(habits).values({
      id: habit,
      householdId: h,
      name: "Read",
      note: "TOP_SECRET_HABIT_NOTE",
    });
    await client.db.insert(exercises).values({
      id: exercise,
      householdId: h,
      name: "Squat",
      normalizedName: "squat",
      unit: "reps",
      load: "single",
      unilateral: false,
    });
  });

  async function collect(
    overrides: Partial<Parameters<typeof exportStatistics>[1]> = {},
  ) {
    let json = "";
    await exportStatistics(
      client.db,
      { householdId: h, ...overrides },
      async (chunk) => {
        json += chunk;
      },
      { now },
    );
    return JSON.parse(json);
  }
  const entry = (
    entryOn: string,
    completed = true,
    workoutCompleted = false,
    author = user,
  ) =>
    client.db.insert(habitEntries).values({
      householdId: h,
      habitId: habit,
      userId: author,
      entryOn,
      completed,
      workoutCompleted,
      note: "TOP_SECRET_DAILY_NOTE",
    });
  async function performance(day: string, author = user, deleted = false) {
    const sessionId = randomUUID();
    const id = randomUUID();
    await client.db.insert(trainingSessions).values({
      id: sessionId,
      householdId: h,
      userId: author,
      name: "Private session",
      note: "TOP_SECRET_SESSION_NOTE",
      completedOn: day,
      completedAt: new Date(day),
      deletedAt: deleted ? now : null,
    });
    await client.db.insert(trainingSessionExercises).values({
      id,
      householdId: h,
      userId: author,
      sessionId,
      exerciseId: exercise,
      position: 0,
      name: "Frozen squat",
      unit: "reps",
      load: "single",
      unilateral: false,
      role: "warmup",
      performedOn: day,
      performedAt: new Date(day),
    });
    return { id, sessionId };
  }
  const set = (
    id: string,
    round: number,
    values: Partial<typeof trainingSessionSets.$inferInsert> = {},
  ) =>
    client.db.insert(trainingSessionSets).values({
      sessionExerciseId: id,
      round,
      amount: 8,
      weightKg: null,
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
      ...values,
    });

  it("exports current members and archived habits, counts manual OR workout once, and excludes notes/secrets", async () => {
    await entry("2026-12-28");
    await entry("2027-01-04", false, true);
    await entry("2027-01-10", true, true);
    await entry("2027-01-09", false, false);
    await entry("2027-01-11");
    await entry("2027-01-10", true, false, former);
    await client.db
      .update(habits)
      .set({ status: "archived" })
      .where(eq(habits.id, habit));
    const report = await collect();
    expect(report.habits.items).toHaveLength(2);
    const item = report.habits.items.find(
      (item: { person: { id: string } }) => item.person.id === user,
    );
    expect(item.habit).toMatchObject({ name: "Read", status: "archived" });
    expect(item.records).toHaveLength(4);
    expect(item.statistics).toEqual({
      completedDays: 3,
      lastOn: "2027-01-10",
      last7: 2,
      last30: 3,
      endingWeeks: 2,
      bestWeeks: 2,
    });
    expect(
      report.habits.items.find(
        (item: { person: { id: string } }) => item.person.id === peer,
      ).statistics.completedDays,
    ).toBe(0);
    expect(report.training).toEqual({ status: "not_requested" });
    expect(JSON.stringify(report)).not.toContain("TOP_SECRET");
    expect(JSON.stringify(report)).not.toContain("secret.invalid");
    expect(JSON.stringify(report)).not.toContain(former);
  });

  it("clips all date-range metrics and open weekly streaks to inclusive boundaries", async () => {
    await entry("2026-12-28");
    await entry("2027-01-03");
    await entry("2027-01-04");
    await entry("2027-01-10");
    const report = await collect({ from: "2027-01-03", to: "2027-01-04" });
    const item = report.habits.items.find(
      (item: { person: { id: string } }) => item.person.id === user,
    );
    expect(item.records.map((row: { entryOn: string }) => row.entryOn)).toEqual(
      ["2027-01-03", "2027-01-04"],
    );
    expect(item.statistics).toMatchObject({
      completedDays: 2,
      last7: 2,
      last30: 2,
      endingWeeks: 2,
      bestWeeks: 2,
    });
    expect(report.period).toEqual({
      mode: "range",
      from: "2027-01-03",
      to: "2027-01-04",
      timeZone: "UTC",
    });
  });

  it("exports exact actual-set conventions and private author scope, never deleted/empty/future performances", async () => {
    const first = await performance("2027-01-04");
    await set(first.id, 1, { amount: 10, weightKg: 5.25, load: "per-hand" });
    await set(first.id, 2, {
      amount: 8,
      rightAmount: 6,
      weightKg: 10,
      load: "single",
      unilateral: true,
    });
    await set(first.id, 3, {
      amount: 30,
      weightKg: 8,
      unit: "seconds",
      load: "single",
      unilateral: true,
    });
    await set(first.id, 4, { amount: 5, load: "single" });
    await set(first.id, 5, {
      amount: 0,
      rightAmount: 0,
      weightKg: 0,
      load: "per-hand",
      unilateral: true,
    });
    const second = await performance("2027-01-10");
    await set(second.id, 1);
    await set((await performance("2027-01-10", peer)).id, 1, { amount: 599 });
    await set((await performance("2027-01-10", user, true)).id, 1, {
      amount: 599,
    });
    await set((await performance("2027-01-11")).id, 1, { amount: 599 });
    await performance("2027-01-09");
    await client.db
      .update(exercises)
      .set({ deletedAt: now })
      .where(eq(exercises.id, exercise));
    const report = await collect({ trainingUser: user });
    expect(report.training.author).toEqual({ id: user, username: user });
    expect(report.training.exercises).toHaveLength(1);
    const row = report.training.exercises[0];
    expect(row.exercise.retired).toBe(true);
    expect(row.performances).toHaveLength(2);
    expect(row.performances[0]).toMatchObject({
      name: "Frozen squat",
      role: "warmup",
    });
    expect(row.statistics).toMatchObject({
      sessions: 2,
      sets: 6,
      lastOn: "2027-01-10",
      reps: { total: 37, left: 8, right: 6, sets: 5, unilateralSets: 2 },
      seconds: { total: 60, left: 30, right: 30, sets: 1 },
      volumeKg: 245,
      unmeasuredSets: 1,
    });
    expect(row.statistics.records).toHaveLength(4);
    expect(row.statistics.records).toContainEqual({
      unit: "reps",
      load: "per-hand",
      unilateral: true,
      weightKg: 0,
    });
    expect(JSON.stringify(report)).not.toContain("TOP_SECRET");
    const range = await collect({
      trainingUser: user,
      from: "2027-01-10",
      to: "2027-01-10",
    });
    expect(range.training.exercises[0].statistics).toMatchObject({
      sessions: 1,
      sets: 1,
      reps: { total: 8 },
      volumeKg: null,
      records: [],
    });
  });

  it("distinguishes disabled, unrequested and genuinely empty sections", async () => {
    expect((await collect({ trainingUser: user })).training).toMatchObject({
      status: "included",
      exercises: [],
    });
    await client.db
      .update(householdModuleSettings)
      .set({ enabled: false })
      .where(eq(householdModuleSettings.householdId, h));
    const report = await collect({ trainingUser: user });
    expect(report.habits).toEqual({ status: "disabled" });
    expect(report.training).toEqual({ status: "disabled" });
  });

  it("requires a live household and an explicitly selected current member, including when modules are disabled", async () => {
    await expect(collect({ trainingUser: former })).rejects.toThrow(
      "current household member",
    );
    await expect(collect({ householdId: randomUUID() })).rejects.toThrow(
      "Household unavailable",
    );
    await client.db
      .update(households)
      .set({ deletedAt: now })
      .where(eq(households.id, h));
    await expect(collect()).rejects.toThrow("Household unavailable");
  });

  it("uses one repeatable-read, read-only snapshot across streaming and concurrent edits", async () => {
    await entry("2027-01-04");
    const spy = vi.spyOn(client.db, "transaction");
    let text = "";
    let changed = false;
    try {
      await exportStatistics(
        client.db,
        { householdId: h },
        async (chunk) => {
          text += chunk;
          if (!changed) {
            changed = true;
            await client.db
              .update(habits)
              .set({ name: "Renamed later" })
              .where(eq(habits.id, habit));
            await entry("2027-01-05");
          }
        },
        { now },
      );
      expect(spy.mock.calls[0]?.[1]).toEqual({
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    } finally {
      spy.mockRestore();
    }
    const report = JSON.parse(text);
    const item = report.habits.items.find(
      (item: { person: { id: string } }) => item.person.id === user,
    );
    expect(item.habit.name).toBe("Read");
    expect(item.statistics.completedDays).toBe(1);
    expect(
      (await collect()).habits.items.find(
        (item: { person: { id: string } }) => item.person.id === user,
      ).statistics.completedDays,
    ).toBe(2);
  });

  it("counts repeated placements once per session and excludes occurrence tombstones", async () => {
    const first = await performance("2027-01-04");
    await set(first.id, 1);
    const repeated = randomUUID();
    await client.db.insert(trainingSessionExercises).values({
      id: repeated,
      householdId: h,
      userId: user,
      sessionId: first.sessionId,
      exerciseId: exercise,
      position: 1,
      templateExerciseId: randomUUID(),
      name: "Repeated frozen squat",
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
      role: "stretching",
      performedOn: "2027-01-04",
      performedAt: now,
    });
    await set(repeated, 1);
    const hidden = await performance("2027-01-05");
    await set(hidden.id, 1, { amount: 500 });
    await client.db
      .update(trainingSessionExercises)
      .set({ deletedAt: now })
      .where(eq(trainingSessionExercises.id, hidden.id));
    const report = await collect({ trainingUser: user });
    expect(report.training.exercises[0].performances).toHaveLength(2);
    expect(report.training.exercises[0].statistics).toMatchObject({
      sessions: 1,
      sets: 2,
      reps: { total: 16 },
    });
  });

  it("batches more than 500 supporting rows without truncation", async () => {
    await client.db.execute(
      sql`INSERT INTO habit_entries(household_id,habit_id,user_id,entry_on,completed) SELECT ${h}::uuid,${habit}::uuid,${user}::uuid,('2020-01-01'::date+i)::text,true FROM generate_series(0,1099) i`,
    );
    const item = (await collect()).habits.items.find(
      (item: { person: { id: string } }) => item.person.id === user,
    );
    expect(item.records).toHaveLength(1100);
    expect(item.statistics.completedDays).toBe(1100);
  });

  it("honours requested timezone, rejects invalid/future ranges, and fails rather than truncate on timeout", async () => {
    let text = "";
    await exportStatistics(
      client.db,
      { householdId: h, timeZone: "America/Los_Angeles" },
      async (chunk) => {
        text += chunk;
      },
      { now: new Date("2027-01-10T00:30:00Z") },
    );
    expect(JSON.parse(text).period.to).toBe("2027-01-09");
    await expect(collect({ to: "2027-01-11" })).rejects.toThrow(
      "Invalid report period",
    );
    await expect(
      collect({ from: "2027-01-10", to: "2027-01-09" }),
    ).rejects.toThrow("Invalid report period");
    await expect(collect({ from: "2027-02-30" })).rejects.toThrow();
    await expect(
      exportStatistics(client.db, { householdId: h }, async () => {}, {
        now,
        timeoutMs: 0.001,
      }),
    ).rejects.toThrow();
    const rows = await client.db
      .select()
      .from(habitEntries)
      .where(
        and(eq(habitEntries.householdId, h), eq(habitEntries.habitId, habit)),
      );
    expect(rows).toEqual([]);
  });
});
