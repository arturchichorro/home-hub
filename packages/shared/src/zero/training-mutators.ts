import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import * as z from "zod";
import {
  isCompleteExerciseSet,
  logOnlyWorkoutExercise,
} from "../exercise-logs";
import { calendarDate } from "../habits";
import {
  deleteTrainingSessionSchema,
  removeTrainingExerciseSchema,
  removeTrainingSetSchema,
  saveTrainingSetSchema,
  updateTrainingSessionSchema,
} from "../training";
import {
  exerciseCatalogSchema,
  type WorkoutExercise,
  workoutExerciseSchema,
} from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type ExerciseLog, type Schema, zql } from "./schema.gen";

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

const ownLinks = (scope: Scope, userId: string) =>
  zql.trainingSessionExercises
    .where("sessionId", scope.logId)
    .where("householdId", scope.householdId)
    .where("userId", userId);

async function removeOccurrence(
  tx: Transaction<Schema>,
  sessionId: string,
  exerciseId: string,
  occurrenceId: string,
) {
  const sets = await tx.run(
    zql.exerciseLogSets.where("exerciseLogId", occurrenceId),
  );

  for (const set of sets) {
    await tx.mutate.exerciseLogSets.delete({
      exerciseLogId: occurrenceId,
      round: set.round,
    });
  }

  await tx.mutate.trainingSessionExercises.delete({ sessionId, exerciseId });
  await tx.mutate.exerciseLogs.delete({ id: occurrenceId });
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
        proposed.deletedAt !== null)
    ) {
      throw Error("Training session not allowed");
    }

    const existing =
      proposed ??
      (await tx.run(
        zql.trainingSessions
          .where("householdId", args.householdId)
          .where("userId", ctx.userId)
          .where("completedOn", args.completedOn)
          .where("deletedAt", "IS", null)
          .one(),
      ));
    const now =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    if (!existing && calendarDate(now, args.timeZone) !== args.completedOn) {
      throw Error("Invalid training day");
    }

    const sessionId = existing?.id ?? args.logId;
    const scope = { householdId: args.householdId, logId: sessionId };
    const links = await tx.run(ownLinks(scope, ctx.userId));
    const known = new Map(links.map((link) => [link.exerciseId, link]));
    const removed = new Set(
      z.array(z.uuid()).parse(existing?.removedExerciseLogIds ?? []),
    );
    const ids = new Set([
      ...known.keys(),
      ...args.exercises.map((row) => row.exercise.id),
    ]);

    if (ids.size > 40) {
      throw Error("A training session supports at most 40 exercises");
    }

    let position = Math.max(-1, ...links.map((link) => link.position)) + 1;
    const additions = [];
    let current: { definition: WorkoutExercise; id: string } | undefined;

    for (const item of args.exercises) {
      const definition = item.exercise;

      if (removed.has(item.exerciseLogId)) {
        throw Error("This exercise was removed; reopen the log");
      }
      if (definition.id !== definition.catalogExerciseId) {
        throw Error("Invalid training exercise identity");
      }
      const link = known.get(definition.id);
      let occurrence: ExerciseLog | undefined;
      if (link) {
        if (
          link.exerciseLogId !== item.exerciseLogId &&
          (!item.isNew ||
            (await tx.run(
              zql.exerciseLogs.where("id", item.exerciseLogId).one(),
            )))
        ) {
          throw Error("Exercise occurrence changed; reopen the log");
        }
        occurrence = await tx.run(
          zql.exerciseLogs
            .where("id", link.exerciseLogId)
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .one(),
        );
        if (!occurrence || occurrence.exerciseId !== definition.id) {
          throw Error("Exercise occurrence not allowed");
        }
      }
      let frozen: WorkoutExercise;
      if (occurrence) {
        frozen = workoutExerciseSchema.parse(occurrence.snapshot);
      } else {
        if (!item.isNew) {
          throw Error("Training exercises changed; reopen this log");
        }
        const catalog = await tx.run(
          zql.exercises
            .where("id", definition.id)
            .where("householdId", args.householdId)
            .where("deletedAt", "IS", null)
            .one(),
        );
        if (!catalog) {
          throw Error("Exercise no longer available");
        }
        frozen = logOnlyWorkoutExercise(
          exerciseCatalogSchema.parse({
            id: catalog.id,
            name: catalog.name,
            unit: catalog.unit,
            load: catalog.load,
            unilateral: catalog.unilateral,
          }),
        );
        if (
          await tx.run(zql.exerciseLogs.where("id", item.exerciseLogId).one())
        ) {
          throw Error("Exercise occurrence already belongs to another context");
        }
        additions.push({
          definition: frozen,
          id: item.exerciseLogId,
          position: position++,
        });
      }
      if (definition.id === args.exerciseId) {
        if (
          definition.unit !== frozen.unit ||
          definition.load !== frozen.load ||
          definition.unilateral !== frozen.unilateral
        ) {
          throw Error("Exercise settings changed; reopen this log");
        }
        current = {
          definition: frozen,
          id: occurrence?.id ?? item.exerciseLogId,
        };
      }
    }

    if (!current || !isCompleteExerciseSet(current.definition, args.values)) {
      throw Error("Complete every required set value");
    }

    // The first complete set atomically stores all selected exercises in added
    // order. Empty occurrences never count as a past performance/completion.
    if (!existing) {
      await tx.mutate.trainingSessions.insert({
        id: sessionId,
        householdId: args.householdId,
        userId: ctx.userId,
        name: args.name,
        note: args.note,
        removedExerciseLogIds: [],
        completedOn: args.completedOn,
        completedAt: now,
        createdAt: now,
        deletedAt: null,
      });
    }

    for (const addition of additions) {
      const { role: _role, ...snapshot } = addition.definition;
      await tx.mutate.exerciseLogs.insert({
        id: addition.id,
        householdId: args.householdId,
        userId: ctx.userId,
        exerciseId: addition.definition.id,
        performedOn: existing?.completedOn ?? args.completedOn,
        performedAt: existing?.completedAt ?? now,
        snapshot,
      });
      await tx.mutate.trainingSessionExercises.insert({
        sessionId,
        exerciseId: addition.definition.id,
        exerciseLogId: addition.id,
        householdId: args.householdId,
        userId: ctx.userId,
        position: addition.position,
      });
    }

    await tx.mutate.exerciseLogSets.upsert({
      exerciseLogId: current.id,
      round: args.round,
      ...args.values,
      unit: current.definition.unit,
      load: current.definition.load,
      unilateral: current.definition.unilateral,
    });
  }),
  removeSet: define(removeTrainingSetSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    await ownSession(tx, ctx, args);
    const link = await tx.run(
      ownLinks(args, ctx.userId).where("exerciseId", args.exerciseId).one(),
    );
    if (!link) {
      throw Error("Exercise occurrence not allowed");
    }
    await tx.mutate.exerciseLogSets.delete({
      exerciseLogId: link.exerciseLogId,
      round: args.round,
    });
  }),
  removeExercise: define(
    removeTrainingExerciseSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, ctx, args);
      const session = await ownSession(tx, ctx, args);
      const link = await tx.run(
        ownLinks(args, ctx.userId).where("exerciseId", args.exerciseId).one(),
      );
      if (link) {
        await tx.mutate.trainingSessions.update({
          id: args.logId,
          removedExerciseLogIds: [
            ...z.array(z.uuid()).parse(session.removedExerciseLogIds ?? []),
            link.exerciseLogId,
          ],
        });
        await removeOccurrence(
          tx,
          args.logId,
          link.exerciseId,
          link.exerciseLogId,
        );
      }
    },
  ),
  update: define(updateTrainingSessionSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    await ownSession(tx, ctx, args);
    await tx.mutate.trainingSessions.update({
      id: args.logId,
      ...args.changes,
    });
  }),
  delete: define(deleteTrainingSessionSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args);
    await ownSession(tx, ctx, args);
    for (const link of await tx.run(ownLinks(args, ctx.userId))) {
      await removeOccurrence(
        tx,
        args.logId,
        link.exerciseId,
        link.exerciseLogId,
      );
    }
    // A content-free tombstone rejects a stale device's attempts to recreate
    // this deleted log. A new explicit daily log can have a new identity.
    await tx.mutate.trainingSessions.update({
      id: args.logId,
      name: "",
      note: "",
      removedExerciseLogIds: [],
      deletedAt:
        tx.location === "server" ? Date.now() : args.optimisticTimestamp,
    });
  }),
};
