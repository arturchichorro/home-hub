import { randomUUID } from "node:crypto";
import { createDbClient } from "@home-hub/database/client";
import {
  exerciseLogSets,
  exerciseLogs,
  exercises,
  habitEntries,
  habits,
  habitWorkoutLinks,
  householdMembers,
  householdModuleSettings,
  households,
  trainingSessionExercises,
  trainingSessions,
  users,
  workoutExercises,
  workoutLogExercises,
  workoutLogs,
  workouts,
} from "@home-hub/database/schema";
import { logOnlyWorkoutExercise } from "@home-hub/shared/exercise-logs";
import { calendarDate, shiftCalendarDate } from "@home-hub/shared/habits";
import {
  compareTrainingHistory,
  type SaveTrainingSet,
  type TrainingHistoryCursor,
  trainingHistoryPageSize,
} from "@home-hub/shared/training";
import { workoutLogSnapshotSchema } from "@home-hub/shared/workouts";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))(
  "workout-linked habits on PostgreSQL",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let householdId: string;
    let userId: string;
    let otherUser: string;
    let habitId: string;
    let exerciseId: string;
    let workoutIds: string[];
    let slotIds: string[];
    const today = calendarDate(Date.now(), "UTC");
    const yesterday = shiftCalendarDate(today, -1);
    beforeAll(() => {
      if (
        !databaseUrl ||
        !new URL(databaseUrl).pathname.startsWith("/home_hub_test_")
      ) {
        throw Error("Disposable home_hub_test_ database required");
      }

      client = createDbClient(databaseUrl);
    });
    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });
    beforeEach(async () => {
      householdId = randomUUID();
      userId = randomUUID();
      otherUser = randomUUID();
      habitId = randomUUID();
      exerciseId = randomUUID();
      workoutIds = Array.from({ length: 3 }, () => randomUUID());
      slotIds = Array.from({ length: 3 }, () => randomUUID());
      await client.db.insert(users).values(
        [userId, otherUser].map((id) => ({
          id,
          username: id,
          email: `${id}@example.invalid`,
          passwordHash: "fixture",
        })),
      );
      await client.db
        .insert(households)
        .values({ id: householdId, name: "Linked habit fixture" });
      await client.db.insert(householdMembers).values(
        [userId, otherUser].map((id) => ({
          id: randomUUID(),
          userId: id,
          householdId,
          role: "member" as const,
          sortKey: 0,
        })),
      );
      await client.db.insert(householdModuleSettings).values(
        ["habits", "workouts"].map((moduleKey) => ({
          householdId,
          moduleKey,
          enabled: true,
        })),
      );
      await client.db
        .insert(habits)
        .values({ id: habitId, householdId, name: "Workout habit" });
      await client.db.insert(exercises).values({
        id: exerciseId,
        householdId,
        name: "Squat",
        normalizedName: "squat",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      await client.db
        .insert(workouts)
        .values(workoutIds.map((id) => ({ id, householdId, title: id })));
      await client.db.insert(workoutExercises).values(
        workoutIds.map((workoutId, i) => ({
          id: slotIds[i] as string,
          householdId,
          workoutId,
          exerciseId,
          sets: 2,
          target: "10",
        })),
      );
    });

    const run = (
      name: string,
      args: Parameters<typeof mutateWithHabitWorkouts>[3],
      author = userId,
    ) =>
      createZeroDbProvider({ db: client.db }).transaction((tx) =>
        mutateWithHabitWorkouts(tx, author, name, args),
      );
    const configure = (mode: "none" | "any" | "selected", ids: string[] = []) =>
      run("habits.linkWorkouts", {
        householdId,
        habitId,
        mode,
        workoutIds: ids,
        optimisticTimestamp: Date.now(),
      });

    async function save(
      index: number,
      author = userId,
      day = today,
      round = 1,
    ) {
      const workoutId = workoutIds[index] as string;
      const slot = slotIds[index] as string;
      const args = {
        householdId,
        workoutId,
        logId: randomUUID(),
        workoutExerciseId: slot,
        exerciseLogId: randomUUID(),
        round,
        snapshot: {
          title: workoutId,
          exercises: [
            {
              id: slot,
              catalogExerciseId: exerciseId,
              name: "Squat",
              unit: "reps",
              load: "bodyweight",
              unilateral: false,
              sets: 2,
              target: "10",
            },
          ],
        },
        completedOn: day,
        timeZone: "UTC",
        optimisticTimestamp: Date.parse(`${day}T12:00:00Z`),
        values: { amount: 0, weightKg: null, rightAmount: null },
      };
      await run("workouts.saveSet", args, author);

      return args;
    }

    const remove = (args: Awaited<ReturnType<typeof save>>, author = userId) =>
      run(
        "workouts.removeSet",
        {
          householdId,
          workoutId: args.workoutId,
          logId: args.logId,
          workoutExerciseId: args.workoutExerciseId,
          round: args.round,
          completedOn: args.completedOn,
        },
        author,
      );
    const entry = async (author = userId, day = today) =>
      (
        await client.db
          .select()
          .from(habitEntries)
          .where(
            and(
              eq(habitEntries.habitId, habitId),
              eq(habitEntries.userId, author),
              eq(habitEntries.entryOn, day),
            ),
          )
      )[0];

    const extraCatalog = async () => {
      const catalog = {
        id: randomUUID(),
        name: "Extra plank",
        unit: "seconds" as const,
        load: "bodyweight" as const,
        unilateral: false,
      };
      await client.db
        .insert(exercises)
        .values({ ...catalog, householdId, normalizedName: "extra plank" });

      return logOnlyWorkoutExercise(catalog);
    };

    const firstFreeExercise = (args: SaveTrainingSet) => {
      const exercise = args.exercises[0];
      if (!exercise) {
        throw Error("Training fixture requires an exercise");
      }
      return exercise;
    };
    const freeArgs = (): SaveTrainingSet => {
      const exercise = logOnlyWorkoutExercise({
        id: exerciseId,
        name: "Squat",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      return {
        householdId,
        logId: randomUUID(),
        completedOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
        name: "Private free name",
        note: "Private free note",
        exercises: [{ exercise, exerciseLogId: randomUUID(), isNew: true }],
        exerciseId,
        round: 1,
        values: { amount: 0, rightAmount: null, weightKg: null },
      };
    };
    const sessions = () =>
      client.db
        .select()
        .from(trainingSessions)
        .where(eq(trainingSessions.householdId, householdId));
    const sessionLinks = () =>
      client.db
        .select()
        .from(trainingSessionExercises)
        .where(eq(trainingSessionExercises.householdId, householdId));
    const queryTraining = (author = userId, logId?: string) =>
      createZeroDbProvider({ db: client.db }).run(
        queries.training.session.fn({
          ctx: { userId: author },
          args: {
            householdId,
            ...(logId ? { logId } : { completedOn: today }),
          },
        }),
      );
    const deleteFree = (logId: string) =>
      run("training.delete", {
        householdId,
        logId,
        optimisticTimestamp: Date.now(),
      });

    it("stores a genuine workout-less session on its first complete set, preserving selected order and all template records", async () => {
      const normal = await save(0);
      const beforeLogs = await client.db
        .select()
        .from(workoutLogs)
        .where(eq(workoutLogs.householdId, householdId));
      const beforeSlots = await client.db
        .select()
        .from(workoutExercises)
        .where(eq(workoutExercises.householdId, householdId));
      const beforeWorkouts = await client.db
        .select()
        .from(workouts)
        .where(eq(workouts.householdId, householdId));
      const beforeNormalSets = await client.db
        .select()
        .from(exerciseLogSets)
        .where(eq(exerciseLogSets.exerciseLogId, normal.exerciseLogId));
      const args = freeArgs();
      const extra = await extraCatalog();
      args.exercises.push({
        exercise: extra,
        exerciseLogId: randomUUID(),
        isNew: true,
      });
      args.exerciseId = extra.id;
      args.values.amount = 30;
      await run("training.saveSet", args);
      const [row] = await queryTraining();
      expect(row).toMatchObject({
        id: args.logId,
        name: args.name,
        note: args.note,
        completedOn: today,
      });
      expect(row?.loggedExercises.map((link) => link.exerciseId)).toEqual([
        exerciseId,
        extra.id,
      ]);
      expect(
        row?.loggedExercises.map((link) => link.occurrence?.sets.length),
      ).toEqual([0, 1]);
      expect(
        await client.db
          .select()
          .from(workoutLogs)
          .where(eq(workoutLogs.householdId, householdId)),
      ).toEqual(beforeLogs);
      expect(
        await client.db
          .select()
          .from(workoutExercises)
          .where(eq(workoutExercises.householdId, householdId)),
      ).toEqual(beforeSlots);
      expect(
        await client.db
          .select()
          .from(workouts)
          .where(eq(workouts.householdId, householdId)),
      ).toEqual(beforeWorkouts);
      expect(
        await client.db
          .select()
          .from(exerciseLogSets)
          .where(eq(exerciseLogSets.exerciseLogId, normal.exerciseLogId)),
      ).toEqual(beforeNormalSets);
      const catalog = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
      );
      expect(
        catalog.find((item) => item.id === extra.id)?.performances[0]?.sets[0]
          ?.amount,
      ).toBe(30);
    });

    it("does not persist invalid, incomplete or name-only sessions, or create backdated sessions from forged client times", async () => {
      const args = freeArgs();
      await expect(
        run("training.saveSet", {
          ...args,
          values: { ...args.values, amount: null },
        }),
      ).rejects.toThrow();
      await expect(
        run("training.update", {
          householdId,
          logId: args.logId,
          changes: { name: "Only a draft" },
        }),
      ).rejects.toThrow();
      await expect(
        run("training.saveSet", {
          ...args,
          completedOn: yesterday,
          optimisticTimestamp: Date.parse(yesterday + "T12:00:00Z"),
        }),
      ).rejects.toThrow("Invalid training day");
      await expect(
        run("training.saveSet", { ...args, round: 11 }),
      ).rejects.toThrow();
      expect(await sessions()).toEqual([]);
      expect(await sessionLinks()).toEqual([]);
      expect(
        await client.db
          .select()
          .from(exerciseLogs)
          .where(eq(exerciseLogs.householdId, householdId)),
      ).toEqual([]);
    });

    it("converges concurrent daily identities without duplicate headers, occurrences or lost sets", async () => {
      const first = freeArgs();
      const second = { ...freeArgs(), round: 2 };
      await Promise.all([
        run("training.saveSet", first),
        run("training.saveSet", second),
      ]);
      const rows = await queryTraining();
      expect(rows).toHaveLength(1);
      expect(await sessionLinks()).toHaveLength(1);
      expect(
        rows[0]?.loggedExercises[0]?.occurrence?.sets.map((set) => set.round),
      ).toEqual([1, 2]);
      await run("training.saveSet", first);
      expect(await sessions()).toHaveLength(1);
      expect(await sessionLinks()).toHaveLength(1);
    });

    it("keeps names, notes and performances author-private and enforces author, membership, module and household scope", async () => {
      const args = freeArgs();
      await run("training.saveSet", args);
      expect(await queryTraining(otherUser)).toEqual([]);
      for (const [name, payload] of [
        ["training.saveSet", args],
        [
          "training.removeSet",
          { householdId, logId: args.logId, exerciseId, round: 1 },
        ],
        [
          "training.removeExercise",
          { householdId, logId: args.logId, exerciseId },
        ],
        [
          "training.update",
          { householdId, logId: args.logId, changes: { name: "Foreign edit" } },
        ],
        [
          "training.delete",
          { householdId, logId: args.logId, optimisticTimestamp: Date.now() },
        ],
      ] as const) {
        await expect(run(name, payload, otherUser)).rejects.toThrow();
      }
      await expect(
        run("training.saveSet", { ...freeArgs(), householdId: randomUUID() }),
      ).rejects.toThrow();
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: false })
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, "workouts"),
          ),
        );
      expect(await queryTraining()).toEqual([]);
      await expect(run("training.saveSet", args)).rejects.toThrow();
      await client.db
        .update(householdModuleSettings)
        .set({ enabled: true })
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, "workouts"),
          ),
        );
      await client.db
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        );
      expect(await queryTraining()).toEqual([]);
      await expect(
        run("training.update", {
          householdId,
          logId: args.logId,
          changes: { note: "Not allowed" },
        }),
      ).rejects.toThrow();
      expect((await sessions())[0]).toMatchObject({
        name: args.name,
        note: args.note,
        deletedAt: null,
      });
    });

    it("rejects occurrence reuse from another context and foreign or changed catalog definitions without touching existing data", async () => {
      const normal = await save(0);
      const args = freeArgs();
      firstFreeExercise(args).exerciseLogId = normal.exerciseLogId;
      await expect(run("training.saveSet", args)).rejects.toThrow(
        "already belongs",
      );
      const changed = freeArgs();
      firstFreeExercise(changed).exercise.unit = "seconds";
      await expect(run("training.saveSet", changed)).rejects.toThrow(
        "settings changed",
      );
      const unknown = freeArgs();
      firstFreeExercise(unknown).exercise.id = randomUUID();
      firstFreeExercise(unknown).exercise.catalogExerciseId =
        firstFreeExercise(unknown).exercise.id;
      unknown.exerciseId = firstFreeExercise(unknown).exercise.id;
      await expect(run("training.saveSet", unknown)).rejects.toThrow(
        "no longer available",
      );
      expect(await sessions()).toEqual([]);
      expect(
        await client.db
          .select()
          .from(exerciseLogSets)
          .where(eq(exerciseLogSets.exerciseLogId, normal.exerciseLogId)),
      ).toHaveLength(1);
    });

    it("freezes canonical definitions, supports retired-catalog corrections and preserves historical dates during private text edits", async () => {
      const args = freeArgs();
      await run("training.saveSet", args);
      const oldTime = new Date(yesterday + "T12:00:00Z");
      await client.db
        .update(trainingSessions)
        .set({ completedOn: yesterday, completedAt: oldTime })
        .where(eq(trainingSessions.id, args.logId));
      await client.db
        .update(exerciseLogs)
        .set({ performedOn: yesterday, performedAt: oldTime })
        .where(eq(exerciseLogs.id, firstFreeExercise(args).exerciseLogId));
      await client.db
        .update(exercises)
        .set({
          name: "Retired renamed",
          unit: "seconds",
          deletedAt: new Date(),
        })
        .where(eq(exercises.id, exerciseId));
      const before = (await queryTraining(userId, args.logId))[0];
      await run("training.saveSet", {
        ...args,
        completedOn: yesterday,
        round: 2,
        exercises: args.exercises.map((item) => ({ ...item, isNew: false })),
      });
      await run("training.update", {
        householdId,
        logId: args.logId,
        changes: { name: "Changed private name" },
      });
      const [after] = await queryTraining(userId, args.logId);
      expect(after?.completedOn).toBe(yesterday);
      expect(after?.completedAt).toBe(before?.completedAt);
      expect(after?.note).toBe(args.note);
      expect(after?.loggedExercises[0]?.occurrence?.snapshot).toEqual(
        before?.loggedExercises[0]?.occurrence?.snapshot,
      );
      expect(
        after?.loggedExercises[0]?.occurrence?.sets.map((set) => set.unit),
      ).toEqual(["reps", "reps"]);
    });

    it("retains an empty daily entry after the last set or exercise, and counts only nonempty sets for any-workout habits", async () => {
      await configure("any");
      const args = freeArgs();
      await run("training.saveSet", args);
      expect((await entry())?.workoutCompleted).toBe(true);
      await run("training.removeSet", {
        householdId,
        logId: args.logId,
        exerciseId,
        round: 1,
      });
      expect((await entry())?.workoutCompleted).toBe(false);
      expect((await sessions())[0]).toMatchObject({
        name: args.name,
        note: args.note,
        deletedAt: null,
      });
      await run("training.saveSet", args);
      await run("training.removeExercise", {
        householdId,
        logId: args.logId,
        exerciseId,
      });
      expect(await sessionLinks()).toEqual([]);
      expect((await entry())?.workoutCompleted).toBe(false);
      expect((await sessions())[0]).toMatchObject({
        name: args.name,
        note: args.note,
      });
      await expect(run("training.saveSet", args)).rejects.toThrow("removed");
      const fresh = freeArgs();
      fresh.logId = args.logId;
      await run("training.saveSet", fresh);
      expect((await entry())?.workoutCompleted).toBe(true);
      expect((await queryTraining())[0]?.loggedExercises).toHaveLength(1);
    });

    it("never counts free training for a selected-workout habit and never clears completion supported by another log", async () => {
      await configure("selected", [workoutIds[0] as string]);
      const args = freeArgs();
      await run("training.saveSet", args);
      expect(await entry()).toBeUndefined();
      const normal = await save(0);
      expect((await entry())?.workoutCompleted).toBe(true);
      await deleteFree(args.logId);
      expect((await entry())?.workoutCompleted).toBe(true);
      await remove(normal);
      expect((await entry())?.workoutCompleted).toBe(false);
      await configure("any");
      const next = freeArgs();
      await run("training.saveSet", next);
      const another = await save(1);
      await deleteFree(next.logId);
      expect((await entry())?.workoutCompleted).toBe(true);
      await remove(another);
      expect((await entry())?.workoutCompleted).toBe(false);
    });

    it("freezes archived completion and deletes only the selected session's data, rejecting stale writes without resurrection", async () => {
      await configure("any");
      const normal = await save(0);
      const before = await client.db
        .select()
        .from(exerciseLogs)
        .where(eq(exerciseLogs.id, normal.exerciseLogId));
      const args = freeArgs();
      await run("training.saveSet", args);
      await run("habits.archive", {
        householdId,
        habitId,
        optimisticTimestamp: Date.now(),
      });
      await deleteFree(args.logId);
      expect((await entry())?.workoutCompleted).toBe(true);
      expect(await queryTraining()).toEqual([]);
      expect(await sessionLinks()).toEqual([]);
      expect((await sessions())[0]).toMatchObject({
        name: "",
        note: "",
        deletedAt: expect.any(Date),
      });
      expect(
        await client.db
          .select()
          .from(exerciseLogs)
          .where(eq(exerciseLogs.id, normal.exerciseLogId)),
      ).toEqual(before);
      expect(
        await client.db
          .select()
          .from(exerciseLogSets)
          .where(eq(exerciseLogSets.exerciseLogId, normal.exerciseLogId)),
      ).toHaveLength(1);
      await expect(run("training.saveSet", args)).rejects.toThrow(
        "not allowed",
      );
      await expect(
        run("training.update", {
          householdId,
          logId: args.logId,
          changes: { note: "Stale note" },
        }),
      ).rejects.toThrow("not allowed");
      const next = freeArgs();
      await run("training.saveSet", next);
      expect(await queryTraining()).toHaveLength(1);
      expect(await sessions()).toHaveLength(2);
    });

    it("bounds a session to forty exercises across concurrent device additions and keeps new additions in payload order", async () => {
      const args = freeArgs();
      const definitions = Array.from({ length: 39 }, (_, index) => ({
        id: randomUUID(),
        name: `Exercise ${index}`,
        unit: "reps" as const,
        load: "bodyweight" as const,
        unilateral: false,
      }));
      await client.db.insert(exercises).values(
        definitions.map((definition) => ({
          ...definition,
          householdId,
          normalizedName: definition.name.toLowerCase(),
        })),
      );
      args.exercises.push(
        ...definitions.map((definition) => ({
          exercise: logOnlyWorkoutExercise(definition),
          exerciseLogId: randomUUID(),
          isNew: true,
        })),
      );
      await run("training.saveSet", args);
      expect(await sessionLinks()).toHaveLength(40);
      const extra = await extraCatalog();
      const attempt = {
        ...freeArgs(),
        exercises: [
          { exercise: extra, exerciseLogId: randomUUID(), isNew: true },
        ],
        exerciseId: extra.id,
      };
      await expect(run("training.saveSet", attempt)).rejects.toThrow(
        "at most 40",
      );
      expect(await sessionLinks()).toHaveLength(40);
      const [row] = await queryTraining();
      expect(row?.loggedExercises.map((link) => link.exerciseId)).toEqual(
        args.exercises.map((item) => item.exercise.id),
      );
    });

    it("freezes a free-only archived habit before deleting the last supporting performance", async () => {
      await configure("any");
      const args = freeArgs();
      await run("training.saveSet", args);
      await run("habits.archive", {
        householdId,
        habitId,
        optimisticTimestamp: Date.now(),
      });
      await deleteFree(args.logId);
      expect((await entry())?.workoutCompleted).toBe(true);
    });

    it("enforces database daily uniqueness and author-bound occurrence foreign keys independently of application checks", async () => {
      const args = freeArgs();
      await run("training.saveSet", args);
      await expect(
        client.db.insert(trainingSessions).values({
          id: randomUUID(),
          householdId,
          userId,
          completedOn: today,
          completedAt: new Date(),
        }),
      ).rejects.toThrow();
      const other = await save(0, otherUser);
      const additional = await extraCatalog();
      await expect(
        client.db.insert(trainingSessionExercises).values({
          householdId,
          userId,
          sessionId: args.logId,
          exerciseId: additional.id,
          exerciseLogId: other.exerciseLogId,
          position: 2,
        }),
      ).rejects.toThrow();
      const own = await save(1, otherUser);
      await expect(
        client.db.insert(trainingSessionExercises).values({
          householdId,
          userId: otherUser,
          sessionId: args.logId,
          exerciseId: additional.id,
          exerciseLogId: own.exerciseLogId,
          position: 2,
        }),
      ).rejects.toThrow();
      expect(await sessionLinks()).toHaveLength(1);
    });

    it("pages both private history sources without gaps, including identical cross-table UUID and timestamp ties", async () => {
      const ids = Array.from({ length: 26 }, () => randomUUID());
      const timestamp = new Date();
      await client.db.insert(workoutLogs).values(
        ids.map((id, index) => ({
          id,
          householdId,
          userId,
          workoutId: workoutIds[0] as string,
          completedOn: shiftCalendarDate(today, -index),
          completedAt: timestamp,
          snapshot: { title: "Historical template", exercises: [] },
        })),
      );
      await client.db.insert(trainingSessions).values(
        ids.map((id, index) => ({
          id,
          householdId,
          userId,
          completedOn: shiftCalendarDate(today, -index),
          completedAt: timestamp,
          name: "Old private session",
        })),
      );
      const provider = createZeroDbProvider({ db: client.db });
      let cursor: TrainingHistoryCursor | undefined;
      const seen: string[] = [];
      for (let page = 0; page < 4; page++) {
        const [free, normal] = await Promise.all([
          provider.run(
            queries.training.history.fn({
              ctx: { userId },
              args: { householdId, cursor },
            }),
          ),
          provider.run(
            queries.training.workouts.fn({
              ctx: { userId },
              args: { householdId, cursor },
            }),
          ),
        ]);
        expect(free.length).toBeLessThanOrEqual(trainingHistoryPageSize + 1);
        expect(normal.length).toBeLessThanOrEqual(trainingHistoryPageSize + 1);
        const merged = [
          ...free.map((log) => ({ log, kind: "free" as const })),
          ...normal.map((log) => ({ log, kind: "workout" as const })),
        ]
          .sort(compareTrainingHistory)
          .slice(0, trainingHistoryPageSize);
        seen.push(...merged.map((item) => `${item.kind}:${item.log.id}`));
        const last = merged.at(-1);
        if (!last) {
          break;
        }
        cursor = {
          kind: last.kind,
          id: last.log.id,
          completedAt: last.log.completedAt,
          completedOn: last.log.completedOn,
        };
      }
      expect(seen).toEqual(
        ids.flatMap((id) => [`workout:${id}`, `free:${id}`]),
      );
      expect(new Set(seen).size).toBe(52);
      expect(
        await provider.run(
          queries.training.history.fn({
            ctx: { userId: otherUser },
            args: { householdId },
          }),
        ),
      ).toEqual([]);
      expect(
        await provider.run(
          queries.training.workouts.fn({
            ctx: { userId: otherUser },
            args: { householdId },
          }),
        ),
      ).toEqual([]);
    });

    it("records a log-only exercise in private history without changing its template or frozen snapshot", async () => {
      await configure("any");
      const original = await save(0);
      const extra = await extraCatalog();
      const before = await client.db
        .select()
        .from(workoutLogs)
        .where(eq(workoutLogs.id, original.logId));
      const slots = await client.db
        .select()
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, original.workoutId));
      const definition = await client.db
        .select()
        .from(workouts)
        .where(eq(workouts.id, original.workoutId));
      await run("workouts.saveSet", {
        ...original,
        logId: randomUUID(),
        workoutExerciseId: extra.id,
        exerciseLogId: randomUUID(),
        logOnlyExercise: extra,
        values: { amount: 30, weightKg: null, rightAmount: null },
      });
      expect(
        await client.db
          .select()
          .from(workoutLogs)
          .where(eq(workoutLogs.id, original.logId)),
      ).toEqual(before);
      expect(
        await client.db
          .select()
          .from(workoutExercises)
          .where(eq(workoutExercises.workoutId, original.workoutId)),
      ).toEqual(slots);
      expect(
        await client.db
          .select()
          .from(workouts)
          .where(eq(workouts.id, original.workoutId)),
      ).toEqual(definition);
      const history = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.historyPage.fn({
          ctx: { userId },
          args: { householdId, workoutId: original.workoutId },
        }),
      );
      expect(history[0]?.loggedExercises).toHaveLength(2);
      const added = history[0]?.loggedExercises.find(
        (row) => row.workoutExerciseId === extra.id,
      );
      expect(added?.occurrence?.snapshot).toMatchObject({
        name: extra.name,
        catalogExerciseId: extra.id,
      });
      expect(added?.occurrence?.sets).toMatchObject([
        { amount: 30, unit: "seconds" },
      ]);
      const otherHistory = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.historyPage.fn({
          ctx: { userId: otherUser },
          args: { householdId, workoutId: original.workoutId },
        }),
      );
      expect(otherHistory).toEqual([]);
      const otherCatalog = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.catalog.fn({
          ctx: { userId: otherUser },
          args: { householdId },
        }),
      );
      expect(
        otherCatalog.find((row) => row.id === extra.id)?.performances,
      ).toEqual([]);
      const ownCatalog = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
      );
      expect(
        ownCatalog.find((row) => row.id === extra.id)?.performances,
      ).toHaveLength(1);
      expect((await entry())?.workoutCompleted).toBe(true);
      const tomorrow = shiftCalendarDate(today, 1);
      const next = await save(0, userId, tomorrow);
      const nextLogs = await client.db
        .select()
        .from(workoutLogs)
        .where(
          and(
            eq(workoutLogs.householdId, householdId),
            eq(workoutLogs.completedOn, tomorrow),
          ),
        );
      expect(
        workoutLogSnapshotSchema.parse(nextLogs[0]?.snapshot).exercises,
      ).toHaveLength(1);
      expect(
        await client.db
          .select()
          .from(workoutLogExercises)
          .where(eq(workoutLogExercises.workoutLogId, next.logId)),
      ).toHaveLength(1);
    });

    it("serializes concurrent devices into one daily grouping and one log-only occurrence", async () => {
      const extra = await extraCatalog();
      const workoutId = workoutIds[0] as string;
      const base = {
        householdId,
        workoutId,
        snapshot: {
          title: workoutId,
          exercises: [
            {
              id: slotIds[0] as string,
              catalogExerciseId: exerciseId,
              name: "Squat",
              unit: "reps",
              load: "bodyweight",
              unilateral: false,
              sets: 2,
              target: "10",
            },
          ],
        },
        workoutExerciseId: extra.id,
        logOnlyExercise: extra,
        completedOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.parse(`${today}T12:00:00Z`),
        values: { amount: 30, weightKg: null, rightAmount: null },
      };
      await Promise.all(
        [1, 2].map((round) =>
          run("workouts.saveSet", {
            ...base,
            logId: randomUUID(),
            exerciseLogId: randomUUID(),
            round,
          }),
        ),
      );
      const logs = await client.db
        .select()
        .from(workoutLogs)
        .where(eq(workoutLogs.householdId, householdId));
      expect(logs).toHaveLength(1);
      const links = await client.db
        .select()
        .from(workoutLogExercises)
        .where(eq(workoutLogExercises.householdId, householdId));
      expect(links).toHaveLength(1);
      expect(links[0]?.workoutExerciseId).toBe(extra.id);
      const occurrences = await client.db
        .select()
        .from(exerciseLogs)
        .where(eq(exerciseLogs.householdId, householdId));
      expect(occurrences).toHaveLength(1);
      const sets = await client.db
        .select()
        .from(exerciseLogSets)
        .where(eq(exerciseLogSets.exerciseLogId, occurrences[0]?.id ?? ""));
      expect(sets.map((row) => row.round).sort()).toEqual([1, 2]);
    });

    it("rejects catalog retirement and template duplicates without creating empty workout activity", async () => {
      const extra = await extraCatalog();
      await client.db
        .update(exercises)
        .set({ deletedAt: new Date() })
        .where(eq(exercises.id, extra.id));
      const workoutId = workoutIds[0] as string;
      const base = {
        householdId,
        workoutId,
        logId: randomUUID(),
        exerciseLogId: randomUUID(),
        snapshot: {
          title: workoutId,
          exercises: [
            {
              id: slotIds[0] as string,
              catalogExerciseId: exerciseId,
              name: "Squat",
              unit: "reps",
              load: "bodyweight",
              unilateral: false,
              sets: 2,
              target: "10",
            },
          ],
        },
        completedOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.parse(`${today}T12:00:00Z`),
        round: 1,
        values: { amount: 10, weightKg: null, rightAmount: null },
      };
      await expect(
        run("workouts.saveSet", {
          ...base,
          workoutExerciseId: extra.id,
          logOnlyExercise: extra,
        }),
      ).rejects.toThrow();
      const duplicate = logOnlyWorkoutExercise({
        id: exerciseId,
        name: "Squat",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      await expect(
        run("workouts.saveSet", {
          ...base,
          workoutExerciseId: duplicate.id,
          logOnlyExercise: duplicate,
        }),
      ).rejects.toThrow();
      expect(
        await client.db
          .select()
          .from(workoutLogs)
          .where(eq(workoutLogs.householdId, householdId)),
      ).toEqual([]);
      expect(
        await client.db
          .select()
          .from(exerciseLogs)
          .where(eq(exerciseLogs.householdId, householdId)),
      ).toEqual([]);
    });

    it("publishes both derived columns and the junction for warm Zero replicas", async () => {
      const result = await client.db.execute(
        sql`SELECT tablename, attnames FROM pg_publication_tables WHERE pubname = 'home_hub_zero'`,
      );
      expect(
        result.rows.find((row) => row.tablename === "habits")?.attnames,
      ).toContain("workout_mode");
      expect(
        result.rows.find((row) => row.tablename === "habit_entries")?.attnames,
      ).toContain("workout_completed");
      expect(
        result.rows.some((row) => row.tablename === "habit_workout_links"),
      ).toBe(true);
    });
    it("backfills existing history, ignores note-only logs, and separates people/local dates", async () => {
      await save(0, userId, yesterday);
      await client.db.insert(workoutLogs).values({
        id: randomUUID(),
        householdId,
        userId,
        workoutId: workoutIds[1] as string,
        completedOn: today,
        completedAt: new Date(),
        snapshot: { title: "Only a note", exercises: [] },
        note: "Private workout note",
      });
      await configure("any");
      expect((await entry(userId, yesterday))?.workoutCompleted).toBe(true);
      expect(await entry()).toBeUndefined();
      await save(1, otherUser);
      expect((await entry(otherUser))?.workoutCompleted).toBe(true);
      expect(await entry()).toBeUndefined();

      const rows = await createZeroDbProvider({ db: client.db }).transaction(
        (tx) =>
          tx.run(
            queries.habits.recentForPerson.fn({
              args: {
                householdId,
                personId: otherUser,
                startOn: yesterday,
                endOn: today,
                archived: false,
              },
              ctx: { userId },
            }),
          ),
      );
      expect(JSON.stringify(rows)).not.toContain("Private workout note");
      expect(rows[0]?.entries[0]?.workoutCompleted).toBe(true);
    });
    it("matches any selected workout, and only clears after the last qualifying set", async () => {
      await configure("selected", workoutIds.slice(0, 2));
      await save(2);
      expect(await entry()).toBeUndefined();

      const a = await save(0);
      const b = await save(1);
      const a2 = await save(0, userId, today, 2);
      expect((await entry())?.workoutCompleted).toBe(true);
      await remove(a);
      await remove(b);
      expect((await entry())?.workoutCompleted).toBe(true);
      await remove(a2);
      expect((await entry())?.workoutCompleted).toBe(false);
    });
    it("preserves manual completion and notes through unlinking, history changes and removal", async () => {
      await configure("any");

      const a = await save(0);
      const scope = {
        householdId,
        habitId,
        entryOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
      };
      await run("habits.setCompleted", { ...scope, completed: true });
      await run("habits.updateEntryNote", { ...scope, note: "Keep this note" });
      await remove(a);
      expect(await entry()).toMatchObject({
        completed: true,
        workoutCompleted: false,
        note: "Keep this note",
      });
      await save(1);
      await configure("selected", [workoutIds[2] as string]);
      expect(await entry()).toMatchObject({
        completed: true,
        workoutCompleted: false,
        note: "Keep this note",
      });
      await configure("any");
      await run("habits.setCompleted", { ...scope, completed: false });
      expect(await entry()).toMatchObject({
        completed: false,
        workoutCompleted: true,
      });
      await configure("none");
      expect(await entry()).toMatchObject({
        completed: false,
        workoutCompleted: false,
        note: "Keep this note",
      });
    });
    it("serializes configuration and concurrent writers, freezes archives, and rejects foreign selections", async () => {
      await Promise.all([save(0), configure("any")]);
      expect((await entry())?.workoutCompleted).toBe(true);

      const foreignHousehold = randomUUID();
      const foreignWorkout = randomUUID();
      await client.db
        .insert(households)
        .values({ id: foreignHousehold, name: "Foreign" });
      await client.db.insert(workouts).values({
        id: foreignWorkout,
        householdId: foreignHousehold,
        title: "Foreign workout",
      });
      await expect(configure("selected", [foreignWorkout])).rejects.toThrow(
        "not allowed",
      );
      expect((await entry())?.workoutCompleted).toBe(true);
      expect(
        await client.db
          .select()
          .from(habitWorkoutLinks)
          .where(eq(habitWorkoutLinks.habitId, habitId)),
      ).toEqual([]);
      await run("habits.archive", {
        householdId,
        habitId,
        optimisticTimestamp: Date.now(),
      });

      const a = await save(0);
      await remove(a);
      expect((await entry())?.workoutCompleted).toBe(true);
    });
  },
);
