import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starterWorkoutPlan } from "../workout-seed";
import { workoutSnapshotSchema } from "../workouts";
import { mutators } from "./mutators";
import { queries } from "./queries";
import type { Schema } from "./schema.gen";

const householdId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  other = crypto.randomUUID(),
  planId = crypto.randomUUID(),
  cycleId = crypto.randomUUID(),
  sessionId = crypto.randomUUID();
const now = Date.parse("2026-10-25T23:30:00Z");
const ctx = { userId },
  scope = { householdId, optimisticTimestamp: 1234 };
type Row = Record<string, unknown>;
type Condition =
  | { type: "and"; conditions: Condition[] }
  | {
      type: "simple";
      op: string;
      left: { name: string };
      right: { value: unknown };
    }
  | {
      type: "correlatedSubquery";
      related: {
        correlation: { parentField: string[]; childField: string[] };
        subquery: { table: string; where?: Condition };
      };
    };
function matches(
  row: Row,
  condition: Condition | undefined,
  data: Record<string, Row[]>,
): boolean {
  if (!condition) return true;
  if (condition.type === "and")
    return condition.conditions.every((c) => matches(row, c, data));
  if (condition.type === "correlatedSubquery") {
    const { correlation, subquery } = condition.related;
    return (data[subquery.table] ?? []).some(
      (r) =>
        correlation.parentField.every(
          (field, i) => row[field] === r[correlation.childField[i] ?? ""],
        ) && matches(r, subquery.where, data),
    );
  }
  if (condition.op === "IS" && condition.right.value === null)
    return row[condition.left.name] == null;
  if (condition.op === "=")
    return row[condition.left.name] === condition.right.value;
  throw new Error(`Unsupported operator ${condition.op}`);
}
function setup(location: "server" | "client" = "server") {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const data: Record<string, Row[]> = {
    households: [{ id: householdId, deletedAt: null }],
    householdMembers: [{ householdId, userId }],
    householdModuleSettings: [
      { householdId, moduleKey: "workouts", enabled: true },
    ],
    workoutPlans: [
      {
        id: planId,
        householdId,
        title: "Starter",
        definition: structuredClone(starterWorkoutPlan),
      },
    ],
    workoutCycles: [
      {
        id: cycleId,
        householdId,
        userId,
        planId,
        createdAt: 1,
        startedOn: "2026-10-01",
      },
    ],
    workoutSessions: [],
    workoutSets: [],
  };
  const writes = vi.fn();
  const sameKey = (table: string, a: Row, b: Row) =>
    table === "workoutSets"
      ? a.sessionId === b.sessionId &&
        a.exerciseId === b.exerciseId &&
        a.round === b.round
      : a.id === b.id;
  const crud = (table: string) => ({
    insert: async (row: Row) => {
      writes(table, "insert", row);
      data[table]?.push(structuredClone(row));
    },
    update: async (row: Row) => {
      writes(table, "update", row);
      const found = data[table]?.find((r) => sameKey(table, r, row));
      if (found) Object.assign(found, structuredClone(row));
    },
    upsert: async (row: Row) => {
      writes(table, "upsert", row);
      const found = data[table]?.find((r) => sameKey(table, r, row));
      if (found) Object.assign(found, structuredClone(row));
      else data[table]?.push(structuredClone(row));
    },
  });
  const tx = {
    location,
    mutate: Object.fromEntries(
      ["workoutPlans", "workoutCycles", "workoutSessions", "workoutSets"].map(
        (t) => [t, crud(t)],
      ),
    ),
    run: async (query: unknown) => {
      const { ast, format } = query as {
        ast: { table: string; where?: Condition; orderBy?: [string, string][] };
        format: { singular: boolean };
      };
      const rows = (data[ast.table] ?? [])
        .filter((r) => matches(r, ast.where, data))
        .map((r) =>
          ast.table === "workoutSessions"
            ? {
                ...r,
                sets: (data.workoutSets ?? []).filter(
                  (s) => s.sessionId === r.id,
                ),
              }
            : r,
        );
      for (const [field, direction] of [...(ast.orderBy ?? [])].reverse())
        rows.sort((a, b) => {
          const av = a[field] as string | number,
            bv = b[field] as string | number;
          return (
            (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1)
          );
        });
      return format.singular ? rows[0] : rows;
    },
  } as unknown as Transaction<Schema>;
  const start = (lowEnergy = false, id = sessionId) =>
    mutators.workouts.startSession.fn({
      tx,
      ctx,
      args: {
        ...scope,
        cycleId,
        sessionId: id,
        lowEnergy,
        timeZone: "Europe/Brussels",
      },
    });
  const action = (action: "complete" | "abandon" | "note", id = sessionId) =>
    mutators.workouts.sessionAction.fn({
      tx,
      ctx,
      args: {
        ...scope,
        sessionId: id,
        action,
        note: "Morning",
        timeZone: "Europe/Brussels",
      },
    });
  async function logAll() {
    const snapshot = workoutSnapshotSchema.parse(
      data.workoutSessions?.find((r) => r.id === sessionId)?.snapshot,
    );
    for (const exercise of snapshot.workout.exercises)
      for (
        let round = 1;
        round <= (data.workoutSessions?.[0]?.lowEnergy ? 1 : exercise.sets);
        round++
      )
        await mutators.workouts.saveSet.fn({
          tx,
          ctx,
          args: {
            ...scope,
            sessionId,
            exerciseId: exercise.id,
            round,
            values: {
              weightKg: exercise.load === "bodyweight" ? null : 8,
              amount: exercise.min,
              rightAmount: null,
              rir: 3,
              goodForm: true,
              note: "",
              skipped: false,
            },
          },
        });
  }
  return { tx, data, writes, start, action, logAll };
}
afterEach(() => vi.restoreAllMocks());
describe("workout mutations", () => {
  it("snapshots the authoritative plan, resumes only one session, completes, and rotates A→B", async () => {
    const { data, start, action, logAll } = setup();
    await start();
    expect(data.workoutSessions?.[0]).toMatchObject({
      userId,
      status: "active",
      createdAt: now,
      workoutId: starterWorkoutPlan.workouts[0]?.id,
    });
    await expect(start(false, other)).rejects.toThrow("not allowed");
    await expect(action("complete")).rejects.toThrow("Log each");
    await logAll();
    await action("complete");
    expect(data.workoutSessions?.[0]).toMatchObject({
      status: "completed",
      completedOn: "2026-10-26",
      completedAt: now,
    });
    await start(false, other);
    expect(data.workoutSessions?.[1]?.workoutId).toBe(
      starterWorkoutPlan.workouts[1]?.id,
    );
  });
  it("counts one-round low-energy sessions and keeps abandonment out of rotation", async () => {
    const { data, start, action, logAll } = setup();
    await start(true);
    await logAll();
    expect(data.workoutSets).toHaveLength(6);
    await action("complete");
    await start(false, other);
    await action("abandon", other);
    const third = crypto.randomUUID();
    await start(true, third);
    expect(data.workoutSessions?.[2]?.workoutId).toBe(
      starterWorkoutPlan.workouts[1]?.id,
    );
  });
  it("preserves snapshots across plan edits and allows own completed set corrections", async () => {
    const { tx, data, start, action, logAll } = setup();
    await start();
    await logAll();
    await action("complete");
    const definition = structuredClone(starterWorkoutPlan);
    if (definition.workouts[0]) definition.workouts[0].name = "Changed";
    await mutators.workouts.savePlan.fn({
      tx,
      ctx,
      args: { ...scope, planId, create: false, title: "Changed", definition },
    });
    expect(
      workoutSnapshotSchema.parse(data.workoutSessions?.[0]?.snapshot).workout
        .name,
    ).toBe("Workout A");
    const exercise = starterWorkoutPlan.workouts[0]?.exercises[0];
    if (!exercise) throw new Error("seed");
    await mutators.workouts.saveSet.fn({
      tx,
      ctx,
      args: {
        ...scope,
        sessionId,
        exerciseId: exercise.id,
        round: 1,
        values: {
          weightKg: 9,
          amount: 10,
          rightAmount: null,
          rir: 3,
          goodForm: true,
          note: "Corrected",
          skipped: false,
        },
      },
    });
    expect(data.workoutSets).toHaveLength(12);
    expect(data.workoutSets?.[0]?.values).toMatchObject({
      weightKg: 9,
      note: "Corrected",
    });
  });
  it.each([
    "foreign user",
    "foreign household",
    "abandoned",
    "foreign exercise",
    "excess round",
  ])("rejects set writes for %s", async (reason) => {
    const { tx, data, start, writes, action } = setup();
    await start(true);
    if (reason === "foreign user" && data.workoutSessions?.[0])
      data.workoutSessions[0].userId = other;
    if (reason === "foreign household" && data.workoutSessions?.[0])
      data.workoutSessions[0].householdId = other;
    if (reason === "abandoned") await action("abandon");
    writes.mockClear();
    await expect(
      mutators.workouts.saveSet.fn({
        tx,
        ctx,
        args: {
          ...scope,
          sessionId,
          exerciseId:
            reason === "foreign exercise"
              ? other
              : (starterWorkoutPlan.workouts[0]?.exercises[0]?.id ?? ""),
          round: reason === "excess round" ? 2 : 1,
          values: {
            weightKg: 8,
            amount: 10,
            rightAmount: null,
            rir: 3,
            goodForm: true,
            note: "",
            skipped: false,
          },
        },
      }),
    ).rejects.toThrow("not allowed");
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["foreign user", "foreign household"])(
    "rejects session actions for %s",
    async (reason) => {
      const { tx, data, start, writes } = setup();
      await start();
      const session = data.workoutSessions?.[0];
      if (!session) throw new Error("session");
      session[reason === "foreign user" ? "userId" : "householdId"] = other;
      writes.mockClear();
      for (const action of ["note", "complete", "abandon"] as const)
        await expect(
          mutators.workouts.sessionAction.fn({
            tx,
            ctx,
            args: { ...scope, sessionId, action, note: "", timeZone: "UTC" },
          }),
        ).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it.each(["disabled", "missing module", "not member", "deleted household"])(
    "blocks all mutations when %s",
    async (reason) => {
      const { tx, data, start, action, writes } = setup();
      await start();
      writes.mockClear();
      if (reason === "disabled" && data.householdModuleSettings?.[0])
        data.householdModuleSettings[0].enabled = false;
      if (reason === "missing module") data.householdModuleSettings = [];
      if (reason === "not member") data.householdMembers = [];
      if (reason === "deleted household" && data.households?.[0])
        data.households[0].deletedAt = now;
      const requests = [
        () => start(),
        () => action("note"),
        () =>
          mutators.workouts.startCycle.fn({
            tx,
            ctx,
            args: { ...scope, cycleId: other, planId, timeZone: "UTC" },
          }),
        () =>
          mutators.workouts.savePlan.fn({
            tx,
            ctx,
            args: {
              ...scope,
              planId,
              create: false,
              title: "Changed",
              definition: starterWorkoutPlan,
            },
          }),
        () =>
          mutators.workouts.saveSet.fn({
            tx,
            ctx,
            args: {
              ...scope,
              sessionId,
              exerciseId: other,
              round: 1,
              values: {
                weightKg: 1,
                amount: 10,
                rightAmount: null,
                rir: 3,
                goodForm: true,
                note: "",
                skipped: false,
              },
            },
          }),
      ];
      for (const request of requests)
        await expect(request()).rejects.toThrow("not allowed");
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("uses optimistic time on the client and authoritative time on the server", async () => {
    const { data, start } = setup("client");
    await start();
    expect(data.workoutSessions?.[0]?.createdAt).toBe(1234);
  });
  it("starts new cycles only for scoped plans and only without active sessions", async () => {
    const { tx, data, start, action } = setup();
    await start();
    const request = {
      tx,
      ctx,
      args: { ...scope, cycleId: other, planId, timeZone: "Europe/Brussels" },
    };
    await expect(mutators.workouts.startCycle.fn(request)).rejects.toThrow(
      "not allowed",
    );
    await action("abandon");
    await mutators.workouts.startCycle.fn(request);
    expect(data.workoutCycles?.[1]).toMatchObject({
      userId,
      startedOn: "2026-10-26",
      createdAt: now,
    });
    await expect(
      mutators.workouts.startCycle.fn({
        ...request,
        args: { ...request.args, planId: crypto.randomUUID() },
      }),
    ).rejects.toThrow("not allowed");
  });
});
describe("private workout queries", () => {
  it("shares plans but never synchronizes another person's cycles, sessions, or sets", async () => {
    const { data, tx, start, logAll } = setup();
    await start();
    await logAll();
    const ownSession = data.workoutSessions?.[0];
    data.workoutSessions?.push({ ...ownSession, id: other, userId: other });
    data.workoutSets?.push({
      sessionId: other,
      exerciseId: other,
      round: 1,
      values: { note: "SECRET" },
    });
    data.workoutCycles?.push({ id: other, householdId, userId: other });
    const run = (q: unknown) => tx.run(q as Parameters<typeof tx.run>[0]);
    const plans = await run(
      queries.workouts.plans.fn({ args: { householdId }, ctx }),
    );
    expect(plans).toHaveLength(1);
    const sessions = await run(
      queries.workouts.sessions.fn({ args: { householdId }, ctx }),
    );
    expect(sessions).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toContain("SECRET");
    expect(
      await run(queries.workouts.cycles.fn({ args: { householdId }, ctx })),
    ).toHaveLength(1);
    for (const reason of ["module", "membership", "household"]) {
      if (reason === "module") data.householdModuleSettings = [];
      if (reason === "membership") data.householdMembers = [];
      if (reason === "household" && data.households?.[0])
        data.households[0].deletedAt = now;
      for (const query of [
        queries.workouts.plans,
        queries.workouts.sessions,
        queries.workouts.cycles,
      ])
        expect(
          await run(query.fn({ args: { householdId }, ctx })),
        ).toHaveLength(0);
    }
  });
});
