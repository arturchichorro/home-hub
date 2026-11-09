import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  exercises,
  householdMembers,
  householdModuleSettings,
  households,
  trainingSessionExercises,
  trainingSessionSets,
  trainingSessions,
  users,
  workouts,
} from "@home-hub/database/schema";
import { queries } from "@home-hub/shared/zero/queries";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "../zero/db-provider";
import { createExerciseStatsService } from "./exercise-stats";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))(
  "private exercise statistics on PostgreSQL",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let userId: string;
    let other: string;
    let outsider: string;
    let householdId: string;
    let exerciseId: string;
    let otherExercise: string;
    let workoutId: string;
    const scope = () => ({ userId, householdId, exerciseId });
    const stats = () => createExerciseStatsService({ db: client.db })(scope());
    const query = () => createZeroDbProvider({ db: client.db });
    const history = (author = userId) =>
      query().run(
        queries.training.history.fn({
          args: { householdId, exerciseId },
          ctx: { userId: author },
        }),
      );

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
      [
        userId,
        other,
        outsider,
        householdId,
        exerciseId,
        otherExercise,
        workoutId,
      ] = Array.from({ length: 7 }, () => randomUUID()) as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      await client.db.insert(users).values(
        [userId, other, outsider].map((id) => ({
          id,
          username: id,
          email: `${id}@example.invalid`,
          passwordHash: "fixture",
        })),
      );
      await client.db
        .insert(households)
        .values({ id: householdId, name: "Stats fixture" });
      await client.db.insert(householdMembers).values(
        [userId, other, outsider].map((id, index) => ({
          id: randomUUID(),
          householdId,
          userId: id,
          sortKey: 0,
          role: index === 0 ? ("owner" as const) : ("member" as const),
        })),
      );
      await client.db
        .insert(householdModuleSettings)
        .values({ householdId, moduleKey: "workouts", enabled: true });
      await client.db.insert(exercises).values(
        [exerciseId, otherExercise].map((id) => ({
          id,
          householdId,
          name: id,
          normalizedName: id,
          unit: "reps",
          load: "bodyweight",
          unilateral: false,
        })),
      );
      await client.db.insert(workouts).values({
        id: workoutId,
        householdId,
        title: "Source workout",
        notes: "",
      });
    });

    async function session(
      day: string,
      author = userId,
      template = false,
      deleted = false,
    ) {
      const id = randomUUID();
      await client.db.insert(trainingSessions).values({
        id,
        householdId,
        userId: author,
        workoutId: template ? workoutId : null,
        name: "Frozen session",
        note: "Private session note",
        completedOn: day,
        completedAt: new Date(day),
        deletedAt: deleted ? new Date() : null,
      });
      return id;
    }

    async function occurrence(
      sessionId: string,
      options: {
        author?: string;
        catalog?: string;
        day?: string;
        deleted?: boolean;
        role?: "warmup" | "workout" | "stretching";
        template?: boolean;
      } = {},
    ) {
      const id = randomUUID();
      await client.db.insert(trainingSessionExercises).values({
        id,
        householdId,
        userId: options.author ?? userId,
        sessionId,
        exerciseId: options.catalog ?? exerciseId,
        templateExerciseId: options.template ? randomUUID() : null,
        position: 0,
        name: "Frozen exercise",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
        role: options.role ?? "workout",
        plannedSets: 2,
        target: "8",
        performedOn: options.day ?? "2026-11-09",
        performedAt: new Date("2026-11-09"),
        deletedAt: options.deleted ? new Date() : null,
      });
      return id;
    }

    const set = (
      id: string,
      round: number,
      values: {
        amount: number;
        rightAmount?: number | null;
        weightKg?: number | null;
        unit?: string;
        load?: string;
        unilateral?: boolean;
      },
    ) =>
      client.db.insert(trainingSessionSets).values({
        sessionExerciseId: id,
        round,
        amount: values.amount,
        rightAmount: values.rightAmount ?? null,
        weightKg: values.weightKg ?? null,
        unit: values.unit ?? "reps",
        load: values.load ?? "bodyweight",
        unilateral: values.unilateral ?? false,
      });

    async function populated() {
      const main = await session("2026-11-09", userId, true);
      const a = await occurrence(main, { template: true, role: "warmup" });
      const repeated = await occurrence(main, {
        template: true,
        role: "stretching",
      });
      await set(a, 1, { amount: 10, weightKg: 5.25, load: "per-hand" });
      await set(a, 2, {
        amount: 8,
        rightAmount: 6,
        weightKg: 10,
        load: "single",
        unilateral: true,
      });
      await set(repeated, 1, {
        amount: 30,
        unit: "seconds",
        load: "single",
        unilateral: true,
        weightKg: 0,
      });
      const unrelated = await occurrence(main, {
        catalog: otherExercise,
        template: true,
      });
      await set(unrelated, 1, { amount: 400 });
      const free = await session("2026-11-10");
      const b = await occurrence(free, { day: "2026-11-10" });
      await set(b, 1, {
        amount: 8,
        rightAmount: 6,
        weightKg: 10,
        load: "per-hand",
        unilateral: true,
      });
      await set(b, 2, { amount: 0 });
      await set(b, 3, {
        amount: 5,
        rightAmount: 0,
        weightKg: 0,
        load: "single",
        unilateral: true,
      });
      await set(b, 4, { amount: 3, load: "single" });
      await occurrence(await session("2026-11-11"));
      const theirs = await occurrence(await session("2026-11-09", other), {
        author: other,
      });
      await set(theirs, 1, { amount: 600, weightKg: 999, load: "single" });
      const hidden = await occurrence(
        await session("2026-11-12", userId, false, true),
      );
      await set(hidden, 1, { amount: 600 });
      const removed = await occurrence(await session("2026-11-13"), {
        deleted: true,
      });
      await set(removed, 1, { amount: 600 });
      return { main, free, a, b, repeated };
    }

    it("aggregates actual conventions, both sides, zero, legacy null-right, all roles and repeated slots without leaking other performances", async () => {
      const data = await populated();
      const result = await stats();
      expect(result).toEqual({
        kind: "success",
        stats: {
          sessions: 2,
          sets: 7,
          lastOn: "2026-11-10",
          reps: { total: 46, left: 21, right: 12, sets: 6, unilateralSets: 3 },
          seconds: {
            total: 60,
            left: 30,
            right: 30,
            sets: 1,
            unilateralSets: 1,
          },
          volumeKg: 525,
          unmeasuredSets: 1,
          records: [
            {
              unit: "reps",
              load: "per-hand",
              unilateral: false,
              weightKg: 5.25,
            },
            { unit: "reps", load: "per-hand", unilateral: true, weightKg: 10 },
            { unit: "reps", load: "single", unilateral: true, weightKg: 10 },
            { unit: "seconds", load: "single", unilateral: true, weightKg: 0 },
          ],
        },
      });
      const rows = await history();
      expect(rows.map((row) => row.id)).toEqual([data.free, data.main]);
      expect(
        rows
          .find((row) => row.id === data.main)
          ?.exercises.map((row) => row.id)
          .sort(),
      ).toEqual([data.a, data.repeated].sort());
      expect(
        rows
          .flatMap((row) => row.exercises)
          .every((row) => row.exerciseId === exerciseId),
      ).toBe(true);
      const foreign = await history(other);
      expect(foreign).toHaveLength(1);
      expect(foreign[0]?.userId).toBe(other);
      expect(await history(outsider)).toEqual([]);
    });

    it("recalculates corrections/removals rather than preserving stale counters", async () => {
      const { a, free } = await populated();
      await client.db
        .update(trainingSessionSets)
        .set({ amount: 20 })
        .where(eq(trainingSessionSets.sessionExerciseId, a));
      const updated = await stats();
      expect(updated.kind === "success" && updated.stats.reps.total).toBe(68);
      await client.db
        .update(trainingSessions)
        .set({ deletedAt: new Date() })
        .where(eq(trainingSessions.id, free));
      const removed = await stats();
      expect(removed.kind === "success" && removed.stats.sessions).toBe(1);
      expect((await history()).length).toBe(1);
    });

    it("keeps retirement readable only with the actor's recorded history and never merges a new catalog identity", async () => {
      await populated();
      await client.db
        .update(exercises)
        .set({ deletedAt: new Date() })
        .where(eq(exercises.id, exerciseId));
      expect((await stats()).kind).toBe("success");
      const detail = (author: string) =>
        query().run(
          queries.training.exercise.fn({
            args: { householdId, exerciseId },
            ctx: { userId: author },
          }),
        );
      expect((await detail(userId))?.performances[0]?.name).toBe(
        "Frozen exercise",
      );
      expect(await detail(outsider)).toBeUndefined();
      expect(
        await createExerciseStatsService({ db: client.db })({
          ...scope(),
          userId: outsider,
        }),
      ).toEqual({ kind: "not_found" });
      const empty = await createExerciseStatsService({ db: client.db })({
        ...scope(),
        exerciseId: otherExercise,
      });
      expect(empty.kind).toBe("success");
    });

    it("does not accept a catalog identity from another household", async () => {
      const foreignHousehold = randomUUID();
      const foreignExercise = randomUUID();
      await client.db
        .insert(households)
        .values({ id: foreignHousehold, name: "Other household" });
      await client.db.insert(exercises).values({
        id: foreignExercise,
        householdId: foreignHousehold,
        name: "Other exercise",
        normalizedName: "other exercise",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      expect(
        await createExerciseStatsService({ db: client.db })({
          ...scope(),
          exerciseId: foreignExercise,
        }),
      ).toEqual({ kind: "not_found" });
      expect(
        await query().run(
          queries.training.exercise.fn({
            args: { householdId, exerciseId: foreignExercise },
            ctx: { userId },
          }),
        ),
      ).toBeUndefined();
      expect(
        await query().run(
          queries.training.history.fn({
            args: { householdId, exerciseId: foreignExercise },
            ctx: { userId },
          }),
        ),
      ).toEqual([]);
    });

    it("returns an empty active exercise without inventing volume or records", async () => {
      const result = await stats();
      expect(result.kind === "success" && result.stats).toMatchObject({
        sets: 0,
        sessions: 0,
        volumeKg: null,
        records: [],
        lastOn: null,
      });
    });

    it.each(["membership", "module", "household", "user"] as const)(
      "fails closed after %s access loss in API and Zero",
      async (change) => {
        await populated();
        if (change === "membership") {
          await client.db
            .delete(householdMembers)
            .where(eq(householdMembers.userId, userId));
        }
        if (change === "module") {
          await client.db
            .update(householdModuleSettings)
            .set({ enabled: false })
            .where(eq(householdModuleSettings.householdId, householdId));
        }
        if (change === "household") {
          await client.db
            .update(households)
            .set({ deletedAt: new Date() })
            .where(eq(households.id, householdId));
        }
        const result = await createExerciseStatsService({ db: client.db })({
          ...scope(),
          ...(change === "user" ? { userId: randomUUID() } : {}),
        });
        expect(result.kind).toBe(
          change === "user" ? "unauthorized" : "forbidden",
        );
        if (change !== "user") {
          expect(await history()).toEqual([]);
          expect(
            await query().run(
              queries.training.exercise.fn({
                args: { householdId, exerciseId },
                ctx: { userId },
              }),
            ),
          ).toBeUndefined();
        }
      },
    );

    it("pages matching sessions exclusively without loading unrelated exercises", async () => {
      for (let n = 1; n <= 23; n++) {
        const id = await session(`2025-01-${String(n).padStart(2, "0")}`);
        await set(await occurrence(id), 1, { amount: n });
      }
      const first = await history();
      expect(first).toHaveLength(21);
      const end = first[19];
      if (!end) {
        throw Error("Missing cursor");
      }
      const next = await query().run(
        queries.training.history.fn({
          args: {
            householdId,
            exerciseId,
            cursor: {
              id: end.id,
              completedOn: end.completedOn,
              completedAt: end.completedAt,
            },
          },
          ctx: { userId },
        }),
      );
      expect(next).toHaveLength(3);
      expect(
        next.some((row) => first.slice(0, 20).some((old) => old.id === row.id)),
      ).toBe(false);
    });
  },
);
