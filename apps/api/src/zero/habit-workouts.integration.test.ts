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
  users,
  workoutExercises,
  workoutLogExercises,
  workoutLogs,
  workouts,
} from "@home-hub/database/schema";
import { logOnlyWorkoutExercise } from "@home-hub/shared/exercise-logs";
import { calendarDate, shiftCalendarDate } from "@home-hub/shared/habits";
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
