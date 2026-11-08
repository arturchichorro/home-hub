import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import { calendarDate } from "../habits";
import {
  deleteTrainingSessionSchema,
  isCompleteExerciseSet,
  removeTrainingExerciseSchema,
  removeTrainingSetSchema,
  saveTrainingSetSchema,
  updateTrainingSessionSchema,
} from "../training";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, type TrainingSessionExercise, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
type Scope = { householdId: string; logId: string };

async function access(
  tx: Transaction<Schema>,
  ctx: ZeroAuthContext,
  scope: Scope,
) {
  await requireServerHouseholdModuleAccess({
    tx,
    householdId: scope.householdId,
    userId: ctx.userId,
    moduleKey: "workouts",
  });
}

async function ownSession(
  tx: Transaction<Schema>,
  ctx: ZeroAuthContext,
  scope: Scope,
) {
  const row = await tx.run(zql.trainingSessions.where("id", scope.logId).one());

  if (
    !row ||
    row.householdId !== scope.householdId ||
    row.userId !== ctx.userId ||
    row.deletedAt !== null
  ) {
    throw Error("Training session not allowed");
  }

  return row;
}

async function ownExercise(
  tx: Transaction<Schema>,
  ctx: ZeroAuthContext,
  scope: Scope,
  id: string,
) {
  const row = await tx.run(zql.trainingSessionExercises.where("id", id).one());

  if (
    !row ||
    row.sessionId !== scope.logId ||
    row.householdId !== scope.householdId ||
    row.userId !== ctx.userId ||
    row.deletedAt !== null
  ) {
    throw Error("Training exercise not allowed");
  }

  return row;
}

async function retireExercise(
  tx: Transaction<Schema>,
  row: TrainingSessionExercise,
) {
  for (const set of await tx.run(
    zql.trainingSessionSets.where("sessionExerciseId", row.id),
  )) {
    await tx.mutate.trainingSessionSets.delete({
      sessionExerciseId: row.id,
      round: set.round,
    });
  }

  await tx.mutate.trainingSessionExercises.update({
    id: row.id,
    deletedAt: Date.now(),
    name: "",
    unit: "reps",
    load: "bodyweight",
    unilateral: false,
    role: "workout",
    plannedSets: null,
    target: null,
  });
}

export const trainingMutators = {
  saveSet: define(saveTrainingSetSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    const proposed = await tx.run(
      zql.trainingSessions.where("id", args.logId).one(),
    );

    if (
      proposed &&
      (proposed.householdId !== args.householdId ||
        proposed.userId !== ctx.userId ||
        proposed.workoutId !== args.workoutId ||
        proposed.deletedAt !== null)
    ) {
      throw Error("Training session not allowed");
    }

    const daily = zql.trainingSessions
      .where("householdId", args.householdId)
      .where("userId", ctx.userId)
      .where("deletedAt", "IS", null)
      .where("completedOn", args.completedOn);
    const existing =
      proposed ??
      (await tx.run(
        (args.workoutId
          ? daily.where("workoutId", args.workoutId)
          : daily.where("workoutId", "IS", null)
        ).one(),
      ));
    const now =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    if (!existing && calendarDate(now, args.timeZone) !== args.completedOn) {
      throw Error("Only today's training can be created");
    }

    const workout = args.workoutId
      ? await tx.run(
          zql.workouts
            .where("id", args.workoutId)
            .where("householdId", args.householdId)
            .one(),
        )
      : undefined;

    if (args.workoutId && !workout) {
      throw Error("Workout not available");
    }

    const placements = workout
      ? await tx.run(
          zql.workoutExercises
            .where("householdId", args.householdId)
            .where("workoutId", workout.id)
            .orderBy("sortKey", "desc")
            .orderBy("id", "asc"),
        )
      : [];
    const suppliedSlots = args.exercises.flatMap((row) =>
      row.templateExerciseId ? [row.templateExerciseId] : [],
    );

    if (
      !existing &&
      (placements.length !== suppliedSlots.length ||
        placements.some((row) => !suppliedSlots.includes(row.id)))
    ) {
      throw Error("Workout changed; reopen logging");
    }

    const sessionId = existing?.id ?? args.logId;
    const rows = existing
      ? await tx.run(
          zql.trainingSessionExercises
            .where("sessionId", sessionId)
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .where("deletedAt", "IS", null),
        )
      : [];
    const key = (row: {
      templateExerciseId: string | null;
      exerciseId: string;
    }) => row.templateExerciseId ?? row.exerciseId;
    const known = new Map(rows.map((row) => [key(row), row]));
    const additions: TrainingSessionExercise[] = [];
    let current: TrainingSessionExercise | undefined;
    let position = Math.max(-1, ...rows.map((row) => row.position)) + 1;

    for (const item of args.exercises) {
      const identity = item.templateExerciseId ?? item.catalogExerciseId;
      const prior = await tx.run(
        zql.trainingSessionExercises.where("id", item.id).one(),
      );

      if (
        prior &&
        (prior.deletedAt !== null ||
          prior.sessionId !== sessionId ||
          prior.householdId !== args.householdId ||
          prior.userId !== ctx.userId ||
          prior.exerciseId !== item.catalogExerciseId)
      ) {
        throw Error(
          "Exercise identity belongs to a different or removed occurrence",
        );
      }

      let row = known.get(identity);

      if (row && row.id !== item.id && (!item.isNew || prior)) {
        throw Error("Exercise changed; reopen logging");
      }

      if (!row) {
        if (!item.isNew) {
          throw Error("Exercise removed; reopen logging");
        }

        if (existing && item.templateExerciseId) {
          throw Error("Historical prescriptions cannot be extended");
        }

        if (
          !item.templateExerciseId &&
          ([...known.values()].some(
            (value) => value.exerciseId === item.catalogExerciseId,
          ) ||
            placements.some(
              (value) => value.exerciseId === item.catalogExerciseId,
            ))
        ) {
          throw Error("Exercise already selected");
        }

        const catalog = await tx.run(
          zql.exercises
            .where("id", item.catalogExerciseId)
            .where("householdId", args.householdId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        const placement = placements.find(
          (value) => value.id === item.templateExerciseId,
        );

        if (
          !catalog ||
          (item.templateExerciseId && placement?.exerciseId !== catalog.id)
        ) {
          throw Error("Exercise no longer available");
        }

        row = {
          id: item.id,
          sessionId,
          householdId: args.householdId,
          userId: ctx.userId,
          exerciseId: catalog.id,
          templateExerciseId: item.templateExerciseId,
          position: position++,
          name: catalog.name,
          unit: catalog.unit,
          load: catalog.load,
          unilateral: catalog.unilateral,
          role: placement?.role ?? "workout",
          plannedSets: placement?.sets ?? null,
          target: placement?.target ?? null,
          performedOn: existing?.completedOn ?? args.completedOn,
          performedAt: existing?.completedAt ?? now,
          deletedAt: null,
        };
        additions.push(row);
        known.set(identity, row);
      }

      if (item.id === args.sessionExerciseId) {
        current = row;
      }
    }

    if (known.size > 40 || !current) {
      throw Error("Invalid training exercise selection");
    }

    const recorded = await tx.run(
      zql.trainingSessionSets
        .where("sessionExerciseId", current.id)
        .where("round", args.round)
        .one(),
    );
    const measurement = recorded ?? current;
    const submitted = args.exercises.find(
      (item) => item.id === args.sessionExerciseId,
    );

    if (
      !submitted ||
      submitted.unit !== measurement.unit ||
      submitted.load !== measurement.load ||
      submitted.unilateral !== measurement.unilateral
    ) {
      throw Error("Exercise settings changed; reopen logging");
    }

    if (!isCompleteExerciseSet(measurement, args.values)) {
      throw Error("Incomplete training set");
    }

    if (!existing) {
      await tx.mutate.trainingSessions.insert({
        id: sessionId,
        householdId: args.householdId,
        userId: ctx.userId,
        workoutId: args.workoutId,
        name: workout?.title ?? args.name,
        note: args.note,
        completedOn: args.completedOn,
        completedAt: now,
        createdAt: now,
        deletedAt: null,
      });
    }

    for (const row of additions) {
      await tx.mutate.trainingSessionExercises.insert(row);
    }

    await tx.mutate.trainingSessionSets.upsert({
      sessionExerciseId: current.id,
      round: args.round,
      ...args.values,
      unit: measurement.unit,
      load: measurement.load,
      unilateral: measurement.unilateral,
    });
  }),

  removeSet: define(removeTrainingSetSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    await ownSession(tx, ctx, args);
    await ownExercise(tx, ctx, args, args.sessionExerciseId);
    await tx.mutate.trainingSessionSets.delete({
      sessionExerciseId: args.sessionExerciseId,
      round: args.round,
    });
  }),

  removeExercise: define(
    removeTrainingExerciseSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, ctx, args);
      const session = await ownSession(tx, ctx, args);

      if (session.workoutId !== null) {
        throw Error("Only free training exercises can be removed");
      }

      await retireExercise(
        tx,
        await ownExercise(tx, ctx, args, args.sessionExerciseId),
      );
    },
  ),

  update: define(updateTrainingSessionSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    const session = await ownSession(tx, ctx, args);

    if (session.workoutId !== null && args.changes.name !== undefined) {
      throw Error("A recorded workout title is immutable");
    }

    await tx.mutate.trainingSessions.update({
      id: args.logId,
      ...args.changes,
    });
  }),

  delete: define(deleteTrainingSessionSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    const session = await ownSession(tx, ctx, args);

    if (session.workoutId !== null) {
      throw Error("Only free training sessions can be deleted");
    }

    for (const row of await tx.run(
      zql.trainingSessionExercises
        .where("sessionId", args.logId)
        .where("householdId", args.householdId)
        .where("userId", ctx.userId)
        .where("deletedAt", "IS", null),
    )) {
      await retireExercise(tx, row);
    }

    await tx.mutate.trainingSessions.update({
      id: args.logId,
      name: "",
      note: "",
      deletedAt:
        tx.location === "server" ? Date.now() : args.optimisticTimestamp,
    });
  }),
};
