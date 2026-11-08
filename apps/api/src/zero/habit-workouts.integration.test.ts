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
  workoutExercises,
  workouts,
} from "@home-hub/database/schema";
import { calendarDate, shiftCalendarDate } from "@home-hub/shared/habits";
import type { SaveTrainingSet } from "@home-hub/shared/training";
import { queries } from "@home-hub/shared/zero/queries";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createZeroDbProvider } from "./db-provider";
import { mutateWithHabitWorkouts } from "./mutate-with-habit-workouts";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))(
  "canonical private training on PostgreSQL",
  () => {
    let client: ReturnType<typeof createDbClient>;
    let householdId: string;
    let userId: string;
    let otherUser: string;
    let catalogId: string;
    let workoutId: string;
    let slotId: string;
    let habitId: string;
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
      await client?.close();
    });

    beforeEach(async () => {
      householdId = randomUUID();
      userId = randomUUID();
      otherUser = randomUUID();
      catalogId = randomUUID();
      workoutId = randomUUID();
      slotId = randomUUID();
      habitId = randomUUID();
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
        .values({ id: householdId, name: "Training fixture" });
      await client.db.insert(householdMembers).values(
        [userId, otherUser].map((id) => ({
          id: randomUUID(),
          householdId,
          userId: id,
          role: "member" as const,
          sortKey: 0,
        })),
      );
      await client.db.insert(householdModuleSettings).values(
        ["workouts", "habits"].map((moduleKey) => ({
          householdId,
          moduleKey,
          enabled: true,
        })),
      );
      await client.db.insert(exercises).values({
        id: catalogId,
        householdId,
        name: "Squat",
        normalizedName: "squat",
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      await client.db.insert(workouts).values({
        id: workoutId,
        householdId,
        title: "Template",
        notes: "Shared note",
      });
      await client.db.insert(workoutExercises).values({
        id: slotId,
        householdId,
        workoutId,
        exerciseId: catalogId,
        sets: 2,
        target: "8-12",
        role: "warmup",
      });
      await client.db
        .insert(habits)
        .values({ id: habitId, householdId, name: "Training" });
    });

    const run = (
      name: string,
      args: Parameters<typeof mutateWithHabitWorkouts>[3],
      author = userId,
    ) =>
      createZeroDbProvider({ db: client.db }).transaction((tx) =>
        mutateWithHabitWorkouts(tx, author, name, args),
      );
    const query = (author = userId) =>
      createZeroDbProvider({ db: client.db }).run(
        queries.training.history.fn({
          ctx: { userId: author },
          args: { includeExercises: true, householdId },
        }),
      );
    const configure = (mode: "any" | "selected" | "none") =>
      run("habits.linkWorkouts", {
        householdId,
        habitId,
        mode,
        workoutIds: mode === "selected" ? [workoutId] : [],
        optimisticTimestamp: Date.now(),
      });
    const completion = async () =>
      (
        await client.db
          .select()
          .from(habitEntries)
          .where(
            and(
              eq(habitEntries.habitId, habitId),
              eq(habitEntries.userId, userId),
              eq(habitEntries.entryOn, today),
            ),
          )
      )[0];
    function args(template = false): SaveTrainingSet {
      const id = randomUUID();

      return {
        householdId,
        workoutId: template ? workoutId : null,
        logId: randomUUID(),
        completedOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
        name: "Private mix",
        note: "Private note",
        sessionExerciseId: id,
        round: 1,
        values: { amount: 0, weightKg: null, rightAmount: null },
        exercises: [
          {
            id,
            catalogExerciseId: catalogId,
            templateExerciseId: template ? slotId : null,
            unit: "reps",
            load: "bodyweight",
            unilateral: false,
            isNew: true,
          },
        ],
      };
    }

    it.each([false, true])(
      "uses the same session/exercise/set model for template=%s and never rewrites shared data",
      async (template) => {
        const input = args(template);
        const shared = await client.db
          .select()
          .from(workouts)
          .where(eq(workouts.id, workoutId));
        const placements = await client.db
          .select()
          .from(workoutExercises)
          .where(eq(workoutExercises.workoutId, workoutId));
        await run("training.saveSet", input);
        const [row] = await query();

        expect(row).toMatchObject({
          id: input.logId,
          workoutId: input.workoutId,
          note: "Private note",
          name: template ? "Template" : "Private mix",
        });
        expect(row?.exercises[0]).toMatchObject({
          id: input.sessionExerciseId,
          name: "Squat",
          role: template ? "warmup" : "workout",
          plannedSets: template ? 2 : null,
        });
        expect(row?.exercises[0]?.sets[0]?.amount).toBe(0);
        expect(
          await client.db
            .select()
            .from(workouts)
            .where(eq(workouts.id, workoutId)),
        ).toEqual(shared);
        expect(
          await client.db
            .select()
            .from(workoutExercises)
            .where(eq(workoutExercises.workoutId, workoutId)),
        ).toEqual(placements);
      },
    );

    it("persists all selected rows in added order when a later exercise is logged first", async () => {
      const input = args();
      const id = randomUUID();
      await client.db.insert(exercises).values({
        id,
        householdId,
        name: "Plank",
        normalizedName: "plank",
        unit: "seconds",
        load: "bodyweight",
        unilateral: false,
      });
      const later = {
        id: randomUUID(),
        catalogExerciseId: id,
        templateExerciseId: null,
        unit: "seconds" as const,
        load: "bodyweight" as const,
        unilateral: false,
        isNew: true,
      };
      input.exercises.push(later);
      input.sessionExerciseId = later.id;
      await run("training.saveSet", input);
      const [row] = await query();

      expect(row?.exercises.map((value) => value.exerciseId)).toEqual([
        catalogId,
        id,
      ]);
      expect(row?.exercises.map((value) => value.sets.length)).toEqual([0, 1]);
      const catalog = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.catalog.fn({ ctx: { userId }, args: { householdId } }),
      );
      expect(
        catalog.find((value) => value.id === catalogId)?.performances,
      ).toEqual([]);
      expect(
        catalog.find((value) => value.id === id)?.performances,
      ).toHaveLength(1);
    });

    it.each([false, true])(
      "converges concurrent daily IDs without losing different rounds: template=%s",
      async (template) => {
        const first = args(template);
        const second = { ...args(template), round: 2 };
        await Promise.all([
          run("training.saveSet", first),
          run("training.saveSet", second),
        ]);
        const rows = await query();

        expect(rows).toHaveLength(1);
        expect(rows[0]?.exercises).toHaveLength(1);
        expect(rows[0]?.exercises[0]?.sets.map((value) => value.round)).toEqual(
          [1, 2],
        );
        await run("training.saveSet", first);
        expect(await query()).toHaveLength(1);
      },
    );

    it("allows repeated catalog movements in different template placements", async () => {
      const secondSlot = randomUUID();
      await client.db.insert(workoutExercises).values({
        id: secondSlot,
        householdId,
        workoutId,
        exerciseId: catalogId,
        sets: 3,
        target: "5",
        role: "stretching",
      });
      const input = args(true);
      input.exercises.push({
        ...input.exercises[0],
        id: randomUUID(),
        catalogExerciseId: catalogId,
        templateExerciseId: secondSlot,
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
        isNew: true,
      });
      await run("training.saveSet", input);
      const [row] = await query();

      expect(
        row?.exercises.map((value) => value.templateExerciseId).sort(),
      ).toEqual([slotId, secondSlot].sort());
      expect(row?.exercises.map((value) => value.role).sort()).toEqual([
        "stretching",
        "warmup",
      ]);
    });

    it("does not create invalid, incomplete, name-only or backdated sessions", async () => {
      const input = args();
      await expect(
        run("training.saveSet", {
          ...input,
          values: { ...input.values, amount: null },
        }),
      ).rejects.toThrow();
      await expect(
        run("training.saveSet", { ...input, round: 11 }),
      ).rejects.toThrow();
      await expect(
        run("training.update", {
          householdId,
          logId: input.logId,
          changes: { name: "Draft" },
        }),
      ).rejects.toThrow();
      await expect(
        run("training.saveSet", {
          ...input,
          completedOn: yesterday,
          optimisticTimestamp: Date.parse(`${yesterday}T12:00:00Z`),
        }),
      ).rejects.toThrow("today");
      expect(await query()).toEqual([]);
    });

    it("enforces author ownership for every mutation and all history/catalog queries", async () => {
      const input = args();
      await run("training.saveSet", input);
      expect(await query(otherUser)).toEqual([]);

      for (const [name, value] of [
        ["training.saveSet", input],
        [
          "training.removeSet",
          {
            householdId,
            logId: input.logId,
            sessionExerciseId: input.sessionExerciseId,
            round: 1,
          },
        ],
        [
          "training.removeExercise",
          {
            householdId,
            logId: input.logId,
            sessionExerciseId: input.sessionExerciseId,
          },
        ],
        [
          "training.update",
          { householdId, logId: input.logId, changes: { note: "Forbidden" } },
        ],
        [
          "training.delete",
          { householdId, logId: input.logId, optimisticTimestamp: Date.now() },
        ],
      ] as const) {
        await expect(run(name, value, otherUser)).rejects.toThrow();
      }

      expect((await query())[0]?.note).toBe("Private note");
    });

    it.each(["membership", "module", "household"])(
      "blocks reads and writes after losing %s access",
      async (reason) => {
        const input = args();
        await run("training.saveSet", input);

        if (reason === "membership") {
          await client.db
            .delete(householdMembers)
            .where(
              and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, userId),
              ),
            );
        } else if (reason === "module") {
          await client.db
            .update(householdModuleSettings)
            .set({ enabled: false })
            .where(
              and(
                eq(householdModuleSettings.householdId, householdId),
                eq(householdModuleSettings.moduleKey, "workouts"),
              ),
            );
        } else {
          await client.db
            .update(households)
            .set({ deletedAt: new Date() })
            .where(eq(households.id, householdId));
        }

        expect(await query()).toEqual([]);
        await expect(run("training.saveSet", input)).rejects.toThrow();
      },
    );

    it("preserves frozen conventions, dates and private notes when correcting a retired catalog exercise", async () => {
      const input = args(true);
      await run("training.saveSet", input);
      await client.db
        .update(trainingSessions)
        .set({ completedOn: yesterday })
        .where(eq(trainingSessions.id, input.logId));
      await client.db
        .update(exercises)
        .set({ name: "Renamed", unit: "seconds", deletedAt: new Date() })
        .where(eq(exercises.id, catalogId));
      const before = (await query())[0];
      await run("training.saveSet", {
        ...input,
        completedOn: yesterday,
        round: 2,
        exercises: input.exercises.map((value) => ({ ...value, isNew: false })),
      });
      await run("training.update", {
        householdId,
        logId: input.logId,
        changes: { note: "Corrected private note" },
      });
      const after = (await query())[0];

      expect(after?.completedOn).toBe(yesterday);
      expect(after?.completedAt).toBe(before?.completedAt);
      expect(after?.exercises[0]?.name).toBe("Squat");
      expect(after?.exercises[0]?.sets.map((value) => value.unit)).toEqual([
        "reps",
        "reps",
      ]);
      expect(after?.note).toBe("Corrected private note");
      await expect(
        run("training.update", {
          householdId,
          logId: input.logId,
          changes: { name: "Rewrite" },
        }),
      ).rejects.toThrow("immutable");
    });

    it("requires complete weighted/unilateral inputs and rejects stale settings", async () => {
      await client.db
        .update(exercises)
        .set({ unilateral: true, load: "single" })
        .where(eq(exercises.id, catalogId));
      const input = args();
      input.exercises = input.exercises.map((value) => ({
        ...value,
        unilateral: true,
        load: "single",
      }));
      await expect(run("training.saveSet", input)).rejects.toThrow();
      input.values = { amount: 0, rightAmount: 0, weightKg: 0 };
      await run("training.saveSet", input);
      const stale = {
        ...input,
        exercises: input.exercises.map((value) => ({
          ...value,
          unit: "seconds" as const,
        })),
      };
      await expect(run("training.saveSet", stale)).rejects.toThrow(
        "settings changed",
      );
      expect((await query())[0]?.exercises[0]?.sets[0]).toMatchObject(
        input.values,
      );
    });

    it("never suggests the selected session itself when legacy occurrence time predates its header", async () => {
      const input = args(true);
      await run("training.saveSet", input);
      await client.db
        .update(trainingSessionExercises)
        .set({ performedAt: new Date(0) })
        .where(eq(trainingSessionExercises.id, input.sessionExerciseId));
      const previous = await createZeroDbProvider({ db: client.db }).run(
        queries.workouts.previousExercises.fn({
          args: {
            householdId,
            exerciseIds: [catalogId],
            beforeAt: Date.now(),
            excludeSessionId: input.logId,
          },
          ctx: { userId },
        }),
      );
      expect(previous).toEqual([]);
    });

    it("corrects a legacy round using its recorded conventions, not the frozen prescription", async () => {
      const input = args(true);
      await run("training.saveSet", input);
      await client.db
        .update(trainingSessionSets)
        .set({
          unit: "seconds",
          load: "single",
          unilateral: true,
          weightKg: 12.5,
          rightAmount: null,
        })
        .where(
          eq(trainingSessionSets.sessionExerciseId, input.sessionExerciseId),
        );
      const corrected = {
        ...input,
        exercises: input.exercises.map((row) => ({
          ...row,
          unit: "seconds" as const,
          load: "single" as const,
          unilateral: true,
        })),
        values: { amount: 14, weightKg: 8, rightAmount: 9 },
      };
      await run("training.saveSet", corrected);
      const round = (await query())[0]?.exercises[0]?.sets[0];

      expect(round).toMatchObject({
        unit: "seconds",
        load: "single",
        unilateral: true,
        amount: 14,
        rightAmount: 9,
        weightKg: 8,
      });
      expect((await query())[0]?.exercises[0]).toMatchObject({
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
      await run("training.saveSet", { ...input, round: 2 });
      expect((await query())[0]?.exercises[0]?.sets[1]).toMatchObject({
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      });
    });

    it("keeps an empty daily entry and uses row tombstones to reject stale resurrection", async () => {
      const input = args();
      await run("training.saveSet", input);
      await run("training.removeSet", {
        householdId,
        logId: input.logId,
        sessionExerciseId: input.sessionExerciseId,
        round: 1,
      });
      expect((await query())[0]).toMatchObject({
        name: input.name,
        note: input.note,
      });
      expect((await query())[0]?.exercises[0]?.sets).toEqual([]);
      await run("training.removeExercise", {
        householdId,
        logId: input.logId,
        sessionExerciseId: input.sessionExerciseId,
      });
      expect((await query())[0]?.exercises).toEqual([]);
      await expect(run("training.saveSet", input)).rejects.toThrow("removed");
      const fresh = { ...args(), logId: input.logId };
      await run("training.saveSet", fresh);
      expect((await query())[0]?.exercises).toHaveLength(1);
    });

    it("deletes only a free session and rejects stale writes while preserving other performances", async () => {
      const free = args();
      const prescribed = args(true);
      await run("training.saveSet", free);
      await run("training.saveSet", prescribed);
      await run("training.delete", {
        householdId,
        logId: free.logId,
        optimisticTimestamp: Date.now(),
      });
      expect((await query()).map((value) => value.id)).toEqual([
        prescribed.logId,
      ]);
      await expect(run("training.saveSet", free)).rejects.toThrow();
      await expect(
        run("training.delete", {
          householdId,
          logId: prescribed.logId,
          optimisticTimestamp: Date.now(),
        }),
      ).rejects.toThrow();
      await expect(
        run("training.removeExercise", {
          householdId,
          logId: prescribed.logId,
          sessionExerciseId: prescribed.sessionExerciseId,
        }),
      ).rejects.toThrow();
      expect((await query())[0]?.exercises[0]?.sets).toHaveLength(1);
    });

    it("counts any training, never free training for a selected template, and preserves other supporting logs", async () => {
      const free = args();
      await configure("selected");
      await run("training.saveSet", free);
      expect(await completion()).toBeUndefined();
      const prescribed = args(true);
      await run("training.saveSet", prescribed);
      expect((await completion())?.workoutCompleted).toBe(true);
      await configure("any");
      await run("training.removeSet", {
        householdId,
        logId: prescribed.logId,
        sessionExerciseId: prescribed.sessionExerciseId,
        round: 1,
      });
      expect((await completion())?.workoutCompleted).toBe(true);
      await run("training.delete", {
        householdId,
        logId: free.logId,
        optimisticTimestamp: Date.now(),
      });
      expect((await completion())?.workoutCompleted).toBe(false);
    });

    it("freezes archived habit completion and preserves manual completion/notes", async () => {
      await configure("any");
      const input = args();
      await run("training.saveSet", input);
      await run("habits.setCompleted", {
        householdId,
        habitId,
        entryOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
        completed: true,
      });
      await run("habits.updateEntryNote", {
        householdId,
        habitId,
        entryOn: today,
        timeZone: "UTC",
        optimisticTimestamp: Date.now(),
        note: "Keep",
      });
      await run("habits.archive", {
        householdId,
        habitId,
        optimisticTimestamp: Date.now(),
      });
      await run("training.delete", {
        householdId,
        logId: input.logId,
        optimisticTimestamp: Date.now(),
      });
      expect(await completion()).toMatchObject({
        completed: true,
        note: "Keep",
        workoutCompleted: true,
      });
    });

    it("rejects foreign occurrence/catalog identities and database author mismatches", async () => {
      const input = args();
      await run("training.saveSet", input);
      const foreign = args();
      await run("training.saveSet", foreign, otherUser);
      await expect(
        run("training.saveSet", {
          ...input,
          sessionExerciseId: foreign.sessionExerciseId,
          exercises: foreign.exercises,
        }),
      ).rejects.toThrow();
      await expect(
        client.db
          .update(trainingSessionExercises)
          .set({ userId: otherUser })
          .where(eq(trainingSessionExercises.id, input.sessionExerciseId)),
      ).rejects.toThrow();
      await expect(
        client.db.insert(trainingSessions).values({
          id: randomUUID(),
          householdId,
          userId,
          name: "Duplicate",
          completedOn: today,
          completedAt: new Date(),
        }),
      ).rejects.toThrow();
    });

    it("bounds all added exercises to forty across multiple writes", async () => {
      const input = args();
      const extra = Array.from({ length: 40 }, (_, index) => ({
        id: randomUUID(),
        householdId,
        name: `Exercise ${index}`,
        normalizedName: `exercise ${index}`,
        unit: "reps",
        load: "bodyweight",
        unilateral: false,
      }));
      await client.db.insert(exercises).values(extra);
      input.exercises.push(
        ...extra.slice(0, 39).map((value) => ({
          id: randomUUID(),
          catalogExerciseId: value.id,
          templateExerciseId: null,
          unit: "reps" as const,
          load: "bodyweight" as const,
          unilateral: false,
          isNew: true,
        })),
      );
      await run("training.saveSet", input);
      const last = extra.at(-1);

      if (!last) {
        throw Error("Missing fixture");
      }

      const item = {
        id: randomUUID(),
        catalogExerciseId: last.id,
        templateExerciseId: null,
        unit: "reps" as const,
        load: "bodyweight" as const,
        unilateral: false,
        isNew: true,
      };
      await expect(
        run("training.saveSet", {
          ...input,
          sessionExerciseId: item.id,
          exercises: [item],
        }),
      ).rejects.toThrow();
      expect((await query())[0]?.exercises).toHaveLength(40);
    });
  },
);
