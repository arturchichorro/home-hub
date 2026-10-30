import { defineMutatorWithType } from "@rocicorp/zero";
import {
  isCompleteExerciseSet,
  removeExerciseSetSchema,
  saveExerciseSetSchema,
} from "../exercise-logs";
import { calendarDate } from "../habits";
import { workoutExerciseSchema, workoutLogSnapshotSchema } from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
export const exerciseLogMutators = {
  saveSet: define(saveExerciseSetSchema, async ({ tx, ctx, args }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "workouts",
    });
    const workout = await tx.run(
      zql.workouts
        .where("id", args.workoutId)
        .where("householdId", args.householdId)
        .one(),
    );
    if (!workout) throw Error("Workout logging not allowed");
    const proposed = await tx.run(
      zql.workoutLogs.where("id", args.logId).one(),
    );
    if (
      proposed &&
      (proposed.userId !== ctx.userId ||
        proposed.householdId !== args.householdId ||
        proposed.workoutId !== args.workoutId)
    )
      throw Error("Workout log not allowed");
    const existing =
      proposed ??
      (await tx.run(
        zql.workoutLogs
          .where("householdId", args.householdId)
          .where("workoutId", args.workoutId)
          .where("userId", ctx.userId)
          .where("completedOn", args.completedOn)
          .one(),
      ));
    const snapshot = workoutLogSnapshotSchema.parse(
      existing?.snapshot ?? args.snapshot,
    );
    const definition = snapshot.exercises.find(
      (e) => e.id === args.workoutExerciseId,
    );
    if (!definition) throw Error("Unknown historical exercise");
    const logId = existing?.id ?? args.logId;
    const link = await tx.run(
      zql.workoutLogExercises
        .where("workoutLogId", logId)
        .where("workoutExerciseId", args.workoutExerciseId)
        .where("householdId", args.householdId)
        .where("userId", ctx.userId)
        .one(),
    );
    const occurrence = link
      ? await tx.run(
          zql.exerciseLogs
            .where("id", link.exerciseLogId)
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .one(),
        )
      : undefined;
    if (link && !occurrence) throw Error("Exercise log not allowed");
    const historical = workoutExerciseSchema.parse(
      occurrence?.snapshot ?? definition,
    );
    if (!isCompleteExerciseSet(historical, args.values))
      throw Error("Complete every required set value");
    const slot = await tx.run(
      zql.workoutExercises
        .where("householdId", args.householdId)
        .where("workoutId", args.workoutId)
        .where("id", args.workoutExerciseId)
        .one(),
    );
    if (
      !existing &&
      (!slot ||
        (historical.catalogExerciseId &&
          historical.catalogExerciseId !== slot.exerciseId))
    )
      throw Error("Workout exercise not allowed");
    const exerciseId =
      occurrence?.exerciseId ??
      historical.catalogExerciseId ??
      slot?.exerciseId;
    if (!exerciseId) throw Error("Missing catalog identity");
    const exercise = await tx.run(
      zql.exercises
        .where("id", exerciseId)
        .where("householdId", args.householdId)
        .one(),
    );
    if (!exercise || (!existing && exercise.deletedAt !== null))
      throw Error("Exercise no longer available");
    if (
      !existing &&
      calendarDate(args.optimisticTimestamp, args.timeZone) !== args.completedOn
    )
      throw Error("Invalid logging day");
    if (
      !occurrence &&
      (await tx.run(zql.exerciseLogs.where("id", args.exerciseLogId).one()))
    )
      throw Error("Exercise occurrence already belongs to another context");
    if (!existing)
      await tx.mutate.workoutLogs.insert({
        id: logId,
        householdId: args.householdId,
        userId: ctx.userId,
        workoutId: args.workoutId,
        snapshot,
        note: "",
        completedOn: args.completedOn,
        completedAt: args.optimisticTimestamp,
        createdAt:
          tx.location === "server" ? Date.now() : args.optimisticTimestamp,
      });
    const exerciseLogId = occurrence?.id ?? args.exerciseLogId;
    if (!occurrence) {
      await tx.mutate.exerciseLogs.insert({
        id: exerciseLogId,
        householdId: args.householdId,
        userId: ctx.userId,
        exerciseId,
        performedOn: existing?.completedOn ?? args.completedOn,
        performedAt: existing?.completedAt ?? args.optimisticTimestamp,
        snapshot: { ...historical, catalogExerciseId: exerciseId },
      });
      await tx.mutate.workoutLogExercises.insert({
        workoutLogId: logId,
        workoutExerciseId: args.workoutExerciseId,
        exerciseLogId,
        householdId: args.householdId,
        userId: ctx.userId,
        position: snapshot.exercises.findIndex(
          (e) => e.id === args.workoutExerciseId,
        ),
      });
    }
    await tx.mutate.exerciseLogSets.upsert({
      exerciseLogId,
      round: args.round,
      ...args.values,
      unit: historical.unit,
      load: historical.load,
      unilateral: historical.unilateral,
    });
  }),
  removeSet: define(removeExerciseSetSchema, async ({ tx, ctx, args }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "workouts",
    });
    const log = await tx.run(
      zql.workoutLogs
        .where("id", args.logId)
        .where("householdId", args.householdId)
        .where("workoutId", args.workoutId)
        .where("userId", ctx.userId)
        .one(),
    );
    if (!log) throw Error("Workout log not allowed");
    const link = await tx.run(
      zql.workoutLogExercises
        .where("workoutLogId", log.id)
        .where("workoutExerciseId", args.workoutExerciseId)
        .where("householdId", args.householdId)
        .where("userId", ctx.userId)
        .one(),
    );
    if (link)
      await tx.mutate.exerciseLogSets.delete({
        exerciseLogId: link.exerciseLogId,
        round: args.round,
      });
  }),
};
