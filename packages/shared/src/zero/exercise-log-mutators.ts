import { defineMutatorWithType } from "@rocicorp/zero";
import {
  isCompleteExerciseSet,
  logOnlyWorkoutExercise,
  removeExerciseSetSchema,
  saveExerciseSetSchema,
} from "../exercise-logs";
import { calendarDate } from "../habits";
import {
  exerciseCatalogSchema,
  workoutExerciseRoleSchema,
  workoutExerciseRolesSnapshotSchema,
  workoutExerciseSchema,
  workoutLogSnapshotSchema,
  workoutSnapshotWithoutRoles,
} from "../workouts";
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

    if (!workout) {
      throw Error("Workout logging not allowed");
    }

    const proposed = await tx.run(
      zql.workoutLogs.where("id", args.logId).one(),
    );

    if (
      proposed &&
      (proposed.userId !== ctx.userId ||
        proposed.householdId !== args.householdId ||
        proposed.workoutId !== args.workoutId)
    ) {
      throw Error("Workout log not allowed");
    }

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

    if (
      !existing &&
      snapshot.exercises.some((exercise) => exercise.role === undefined)
    ) {
      // Old clients do not send roles. Capture current placements for a new log,
      // never reinterpret or rewrite an existing historical snapshot.
      const placements = await tx.run(
        zql.workoutExercises
          .where("householdId", args.householdId)
          .where("workoutId", args.workoutId),
      );
      const roles = new Map(placements.map((slot) => [slot.id, slot.role]));
      snapshot.exercises = snapshot.exercises.map((exercise) => ({
        ...exercise,
        role:
          exercise.role ??
          workoutExerciseRoleSchema.parse(roles.get(exercise.id) ?? "workout"),
      }));
    }

    if (existing) {
      const roles = workoutExerciseRolesSnapshotSchema.parse(
        existing.exerciseRoles ?? {},
      );
      snapshot.exercises = snapshot.exercises.map((exercise) => ({
        ...exercise,
        role: roles[exercise.id] ?? "workout",
      }));
    }

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

    if (link && !occurrence) {
      throw Error("Exercise log not allowed");
    }

    const definition = snapshot.exercises.find(
      (e) => e.id === args.workoutExerciseId,
    );
    const logOnly = !definition;

    if (!definition && !occurrence && !args.logOnlyExercise) {
      throw Error("Unknown historical exercise");
    }

    if (
      args.logOnlyExercise &&
      (!logOnly ||
        args.logOnlyExercise.id !== args.workoutExerciseId ||
        args.logOnlyExercise.catalogExerciseId !==
          (occurrence?.exerciseId ?? args.workoutExerciseId))
    ) {
      throw Error("Invalid log-only exercise identity");
    }

    let historical = workoutExerciseSchema.parse(
      occurrence?.snapshot ?? definition ?? args.logOnlyExercise,
    );

    const slot = await tx.run(
      zql.workoutExercises
        .where("householdId", args.householdId)
        .where("workoutId", args.workoutId)
        .where("id", args.workoutExerciseId)
        .one(),
    );

    if (
      !existing &&
      !logOnly &&
      (!slot ||
        (historical.catalogExerciseId &&
          historical.catalogExerciseId !== slot.exerciseId))
    ) {
      throw Error("Workout exercise not allowed");
    }

    const exerciseId =
      occurrence?.exerciseId ??
      historical.catalogExerciseId ??
      slot?.exerciseId;

    if (!exerciseId) {
      throw Error("Missing catalog identity");
    }

    let extraPosition = snapshot.exercises.length;

    // Recorded occurrences already have an authorized, frozen definition. A
    // retired catalog entry may no longer be present in the client's replica.
    if (!occurrence) {
      const exercise = await tx.run(
        zql.exercises
          .where("id", exerciseId)
          .where("householdId", args.householdId)
          .one(),
      );

      if (
        !exercise ||
        ((!existing || logOnly) && exercise.deletedAt !== null)
      ) {
        throw Error("Exercise no longer available");
      }

      if (logOnly) {
        const placement = await tx.run(
          zql.workoutExercises
            .where("householdId", args.householdId)
            .where("workoutId", args.workoutId)
            .where("exerciseId", exerciseId)
            .one(),
        );
        const links = await tx.run(
          zql.workoutLogExercises
            .where("workoutLogId", logId)
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .related("occurrence", (row) =>
              row
                .where("householdId", args.householdId)
                .where("userId", ctx.userId),
            ),
        );

        if (
          placement ||
          snapshot.exercises.some(
            (row) => row.catalogExerciseId === exerciseId,
          ) ||
          links.some((row) => row.occurrence?.exerciseId === exerciseId)
        ) {
          throw Error("Exercise already belongs to this workout log");
        }

        const ids = new Set([
          ...snapshot.exercises.map((row) => row.id),
          ...links.map((row) => row.workoutExerciseId),
        ]);

        if (ids.size >= 40) {
          throw Error("A workout log supports at most 40 exercises");
        }

        extraPosition = Math.max(
          extraPosition,
          ...links.map((row) => row.position + 1),
        );
        historical = logOnlyWorkoutExercise(
          exerciseCatalogSchema.parse({
            id: exercise.id,
            name: exercise.name,
            unit: exercise.unit,
            load: exercise.load,
            unilateral: exercise.unilateral,
          }),
        );
      }
    }

    const submitted =
      args.logOnlyExercise ??
      args.snapshot.exercises.find((row) => row.id === args.workoutExerciseId);

    if (
      !submitted ||
      submitted.unit !== historical.unit ||
      submitted.load !== historical.load ||
      submitted.unilateral !== historical.unilateral
    ) {
      throw Error(
        "Exercise logging settings changed; reopen logging before continuing",
      );
    }

    if (!isCompleteExerciseSet(historical, args.values)) {
      throw Error("Complete every required set value");
    }

    if (
      !existing &&
      calendarDate(args.optimisticTimestamp, args.timeZone) !== args.completedOn
    ) {
      throw Error("Invalid logging day");
    }

    if (
      !occurrence &&
      (await tx.run(zql.exerciseLogs.where("id", args.exerciseLogId).one()))
    ) {
      throw Error("Exercise occurrence already belongs to another context");
    }

    if (!existing) {
      await tx.mutate.workoutLogs.insert({
        id: logId,
        householdId: args.householdId,
        userId: ctx.userId,
        workoutId: args.workoutId,
        snapshot: workoutSnapshotWithoutRoles(snapshot),
        exerciseRoles: Object.fromEntries(
          snapshot.exercises.map((exercise) => [
            exercise.id,
            exercise.role ?? "workout",
          ]),
        ),
        note: "",
        completedOn: args.completedOn,
        completedAt: args.optimisticTimestamp,
        createdAt:
          tx.location === "server" ? Date.now() : args.optimisticTimestamp,
      });
    }

    const exerciseLogId = occurrence?.id ?? args.exerciseLogId;
    const { role: _role, ...historicalDefinition } = historical;

    if (!occurrence) {
      await tx.mutate.exerciseLogs.insert({
        id: exerciseLogId,
        householdId: args.householdId,
        userId: ctx.userId,
        exerciseId,
        performedOn: existing?.completedOn ?? args.completedOn,
        performedAt: existing?.completedAt ?? args.optimisticTimestamp,
        snapshot: { ...historicalDefinition, catalogExerciseId: exerciseId },
      });
      await tx.mutate.workoutLogExercises.insert({
        workoutLogId: logId,
        workoutExerciseId: args.workoutExerciseId,
        exerciseLogId,
        householdId: args.householdId,
        userId: ctx.userId,

        position: logOnly
          ? extraPosition
          : snapshot.exercises.findIndex(
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

    const proposed = await tx.run(
      zql.workoutLogs.where("id", args.logId).one(),
    );

    if (
      proposed &&
      (proposed.householdId !== args.householdId ||
        proposed.workoutId !== args.workoutId ||
        proposed.userId !== ctx.userId)
    ) {
      throw Error("Workout log not allowed");
    }

    const log =
      proposed ??
      (args.completedOn
        ? await tx.run(
            zql.workoutLogs
              .where("householdId", args.householdId)
              .where("workoutId", args.workoutId)
              .where("userId", ctx.userId)
              .where("completedOn", args.completedOn)
              .one(),
          )
        : undefined);

    if (!log) {
      throw Error("Workout log not allowed");
    }

    const link = await tx.run(
      zql.workoutLogExercises
        .where("workoutLogId", log.id)
        .where("workoutExerciseId", args.workoutExerciseId)
        .where("householdId", args.householdId)
        .where("userId", ctx.userId)
        .one(),
    );

    if (link) {
      await tx.mutate.exerciseLogSets.delete({
        exerciseLogId: link.exerciseLogId,
        round: args.round,
      });
    }
  }),
};
