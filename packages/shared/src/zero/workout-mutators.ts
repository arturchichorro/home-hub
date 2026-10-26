import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import { reorderExerciseMediaSchema } from "../exercise-media";
import { calendarDate } from "../habits";
import { starterWorkouts } from "../workout-seed";
import {
  createWorkoutSchema,
  editWorkoutExercisesSchema,
  importWorkoutsSchema,
  normalizeExerciseName,
  reorderWorkoutsSchema,
  saveWorkoutLogSchema,
  updateCatalogExerciseSchema,
  updateWorkoutLogNoteSchema,
  updateWorkoutSchema,
  type WorkoutExercise,
  workoutLogSnapshotSchema,
} from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { appendSortKey, nextSortKey, planReorder } from "./ordering";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const scopedWorkouts = (householdId: string) =>
  zql.workouts.where("householdId", householdId);
const scopedWorkout = (householdId: string, id: string) =>
  scopedWorkouts(householdId).where("id", id).one();
const scopedExercises = (householdId: string, workoutId: string) =>
  zql.workoutExercises
    .where("householdId", householdId)
    .where("workoutId", workoutId);
const scopedCatalog = (householdId: string) =>
  zql.exercises.where("householdId", householdId);
async function ensureCatalog(
  tx: Transaction<Schema>,
  householdId: string,
  definition: WorkoutExercise,
  proposedId: string,
  now: number,
): Promise<string> {
  const normalizedName = normalizeExerciseName(definition.name);
  const byId = await tx.run(
    scopedCatalog(householdId).where("id", proposedId).one(),
  );
  if (byId && !byId.archived) return byId.id;
  const existing = await tx.run(
    scopedCatalog(householdId).where("normalizedName", normalizedName).one(),
  );
  const fields = {
    name: definition.name,
    normalizedName,
    unit: definition.unit,
    load: definition.load,
    unilateral: definition.unilateral,
    archived: false,
    updatedAt: now,
  };
  if (existing) {
    if (existing.archived)
      await tx.mutate.exercises.update({ id: existing.id, ...fields });
    return existing.id;
  }
  await tx.mutate.exercises.insert({
    id: proposedId,
    householdId,
    ...fields,
    createdAt: now,
  });
  return proposedId;
}
async function patchCatalog(
  tx: Transaction<Schema>,
  householdId: string,
  id: string,
  changes: {
    [Key in "name" | "unit" | "load" | "unilateral"]?:
      | WorkoutExercise[Key]
      | undefined;
  },
  now: number,
) {
  const normalizedName =
    changes.name === undefined
      ? undefined
      : normalizeExerciseName(changes.name);
  if (normalizedName !== undefined) {
    const duplicate = await tx.run(
      scopedCatalog(householdId).where("normalizedName", normalizedName).one(),
    );
    if (duplicate && duplicate.id !== id)
      throw new Error("An exercise with this name already exists");
  }
  await tx.mutate.exercises.update({
    id,
    ...changes,
    ...(normalizedName === undefined ? {} : { normalizedName }),
    updatedAt: now,
  });
}
const ownLog = (
  householdId: string,
  workoutId: string,
  userId: string,
  id: string,
) =>
  zql.workoutLogs
    .where("householdId", householdId)
    .where("workoutId", workoutId)
    .where("userId", userId)
    .where("id", id)
    .one();
async function access(
  tx: Transaction<Schema>,
  householdId: string,
  userId: string,
) {
  await requireServerHouseholdModuleAccess({
    tx,
    householdId,
    userId,
    moduleKey: "workouts",
  });
}
const timestamp = (tx: Transaction<Schema>, optimistic: number) =>
  tx.location === "server" ? Date.now() : optimistic;
export const workoutMutatorDefinitions = {
  reorderExerciseMedia: define(
    reorderExerciseMediaSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      const parent = () =>
        tx.run(
          scopedCatalog(args.householdId)
            .where("id", args.exerciseId)
            .where("archived", false)
            .one(),
        );
      if (!(await parent()))
        throw new Error("Exercise media reorder not allowed");
      const readRows = () =>
        tx.run(
          zql.exerciseMedia
            .where("householdId", args.householdId)
            .where("exerciseId", args.exerciseId)
            .where("deletedAt", "IS", null)
            .related("asset"),
        );
      const validate = (rows: Awaited<ReturnType<typeof readRows>>) => {
        const visible = new Set(
          rows
            .filter(
              (row) =>
                row.asset?.kind === "image" &&
                row.asset.confirmedAt !== null &&
                row.asset.deletedAt === null,
            )
            .map((row) => row.id),
        );
        if (
          !visible.has(args.attachmentId) ||
          args.orderedAttachmentIds.some((id) => !visible.has(id))
        )
          throw new Error("Exercise media reorder not allowed");
      };
      validate(await readRows());
      const now = timestamp(tx, args.optimisticTimestamp);
      // Match upload's parent lock, then re-read: pending/concurrent additions must
      // survive gap rebalancing, and deleted/archived records must not be reordered.
      await tx.mutate.exercises.update({ id: args.exerciseId, updatedAt: now });
      if (!(await parent()))
        throw new Error("Exercise media reorder not allowed");
      const rows = await readRows();
      validate(rows);
      for (const update of planReorder(
        rows,
        args.orderedAttachmentIds,
        args.attachmentId,
      )) {
        await tx.mutate.exerciseMedia.update({ ...update, updatedAt: now });
      }
    },
  ),
  reorder: define(reorderWorkoutsSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const rows = await tx.run(scopedWorkouts(args.householdId));
    const updates = planReorder(
      rows.map((row) => ({ id: row.id, sortKey: row.sortKey ?? 0 })),
      args.orderedWorkoutIds,
      args.workoutId,
    );
    for (const update of updates)
      await tx.mutate.workouts.update({
        ...update,
        updatedAt: timestamp(tx, args.optimisticTimestamp),
      });
  }),
  create: define(createWorkoutSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const now = timestamp(tx, args.optimisticTimestamp);
    const top = await tx.run(
      scopedWorkouts(args.householdId)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    await tx.mutate.workouts.insert({
      id: args.workoutId,
      householdId: args.householdId,
      title: args.title,
      sortKey: nextSortKey(top?.sortKey ?? 0),
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
  }),
  update: define(updateWorkoutSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    if (!(await tx.run(scopedWorkout(args.householdId, args.workoutId))))
      throw new Error("Workout update not allowed");
    await tx.mutate.workouts.update({
      id: args.workoutId,
      ...args.changes,
      updatedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),
  updateExercise: define(
    updateCatalogExerciseSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      const row = await tx.run(
        scopedCatalog(args.householdId)
          .where("id", args.exerciseId)
          .where("archived", false)
          .one(),
      );
      if (!row) throw new Error("Exercise update not allowed");
      await patchCatalog(
        tx,
        args.householdId,
        row.id,
        args.changes,
        timestamp(tx, args.optimisticTimestamp),
      );
    },
  ),
  editExercises: define(
    editWorkoutExercisesSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      if (!(await tx.run(scopedWorkout(args.householdId, args.workoutId))))
        throw new Error("Exercise update not allowed");
      const validate = (rows: readonly { id: string }[]) => {
        const ids = new Set(rows.map((row) => row.id));
        if (
          args.creates.some((row) => ids.has(row.id)) ||
          args.updates.some((row) => !ids.has(row.exerciseId)) ||
          args.deletes.some((id) => !ids.has(id)) ||
          rows.length + args.creates.length - args.deletes.length > 40
        )
          throw new Error("Exercise update not allowed");
      };
      let rows = await tx.run(
        scopedExercises(args.householdId, args.workoutId),
      );
      validate(rows);
      const now = timestamp(tx, args.optimisticTimestamp);
      await tx.mutate.workouts.update({ id: args.workoutId, updatedAt: now });
      rows = await tx.run(scopedExercises(args.householdId, args.workoutId));
      validate(rows);
      let bottom = rows.length
        ? Math.min(...rows.map((row) => row.sortKey ?? 0))
        : 1024;
      for (const id of args.deletes)
        await tx.mutate.workoutExercises.delete({
          workoutId: args.workoutId,
          id,
        });
      for (const update of args.updates) {
        const row = rows.find((row) => row.id === update.exerciseId);
        if (!row) throw new Error("Exercise update not allowed");
        const { sets, target, catalogExerciseId, ...shared } = update.changes;
        const exerciseId = catalogExerciseId ?? row.exerciseId;
        const catalog = await tx.run(
          scopedCatalog(args.householdId)
            .where("id", exerciseId)
            .where("archived", false)
            .one(),
        );
        if (!catalog) throw new Error("Exercise update not allowed");
        if (Object.keys(shared).length) {
          await patchCatalog(tx, args.householdId, catalog.id, shared, now);
        }
        if (
          sets !== undefined ||
          target !== undefined ||
          catalogExerciseId !== undefined
        )
          await tx.mutate.workoutExercises.update({
            workoutId: args.workoutId,
            id: row.id,
            exerciseId,
            ...(sets === undefined ? {} : { sets }),
            ...(target === undefined ? {} : { target }),
            updatedAt: now,
          });
      }
      for (const definition of args.creates) {
        const exerciseId = await ensureCatalog(
          tx,
          args.householdId,
          definition,
          definition.catalogExerciseId ?? definition.id,
          now,
        );
        bottom = appendSortKey(bottom);
        await tx.mutate.workoutExercises.insert({
          id: definition.id,
          householdId: args.householdId,
          workoutId: args.workoutId,
          exerciseId,
          sets: definition.sets,
          target: definition.target,
          sortKey: bottom,
          createdAt: now,
          updatedAt: now,
        });
      }
    },
  ),
  importStarters: define(importWorkoutsSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const now = timestamp(tx, args.optimisticTimestamp);
    const unique = [
      ...new Map(
        starterWorkouts
          .flatMap((w) => w.exercises)
          .map((e) => [normalizeExerciseName(e.name), e]),
      ).values(),
    ];
    if (args.catalogExerciseIds.length !== unique.length)
      throw new Error("Missing exercise IDs");
    const catalogIds = new Map<string, string>();
    for (const [index, definition] of unique.entries()) {
      const proposed = args.catalogExerciseIds[index];
      if (!proposed) throw new Error("Missing exercise ID");
      catalogIds.set(
        normalizeExerciseName(definition.name),
        await ensureCatalog(tx, args.householdId, definition, proposed, now),
      );
    }
    const top = await tx.run(
      scopedWorkouts(args.householdId)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    let sortKey = top?.sortKey ?? 0;
    for (const [index, content] of [...starterWorkouts.entries()].reverse()) {
      sortKey = nextSortKey(sortKey);
      const id = args.workoutIds[index];
      if (!id) throw new Error("Missing workout ID");
      await tx.mutate.workouts.insert({
        id,
        householdId: args.householdId,
        title: content.title,
        notes: content.notes,
        sortKey,
        createdAt: now,
        updatedAt: now,
      });
      for (const [exerciseIndex, definition] of content.exercises.entries()) {
        const exerciseId = catalogIds.get(
          normalizeExerciseName(definition.name),
        );
        if (!exerciseId) throw new Error("Missing catalog exercise");
        await tx.mutate.workoutExercises.insert({
          id: definition.id,
          householdId: args.householdId,
          workoutId: id,
          exerciseId,
          sets: definition.sets,
          target: definition.target,
          sortKey: (content.exercises.length - exerciseIndex) * 1024,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }),
  updateLogNote: define(
    updateWorkoutLogNoteSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      const log = await tx.run(
        ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
      );
      if (!log) throw new Error("Workout log note update not allowed");
      await tx.mutate.workoutLogs.update({ id: log.id, note: args.note });
    },
  ),
  saveLog: define(saveWorkoutLogSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    if (!(await tx.run(scopedWorkout(args.householdId, args.workoutId))))
      throw new Error("Workout logging not allowed");
    const now = timestamp(tx, args.optimisticTimestamp),
      completedOn = calendarDate(now, args.timeZone);
    const existing =
      (await tx.run(
        ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
      )) ??
      (await tx.run(
        zql.workoutLogs
          .where("householdId", args.householdId)
          .where("workoutId", args.workoutId)
          .where("userId", ctx.userId)
          .where("completedOn", completedOn)
          .one(),
      ));
    const logId = existing?.id ?? args.logId;
    const snapshot = workoutLogSnapshotSchema.parse(
      existing?.snapshot ?? args.snapshot,
    );
    const catalog = await tx.run(scopedCatalog(args.householdId));
    const links = await tx.run(
      scopedExercises(args.householdId, args.workoutId),
    );
    snapshot.exercises = snapshot.exercises.map((definition) => {
      const link = links.find((row) => row.id === definition.id);
      const entry = definition.catalogExerciseId
        ? catalog.find((row) => row.id === definition.catalogExerciseId)
        : (catalog.find((row) => row.id === link?.exerciseId) ??
          catalog.find(
            (row) =>
              row.normalizedName === normalizeExerciseName(definition.name),
          ));
      if (!entry || (!existing && entry.archived))
        throw new Error("Workout catalog exercise not allowed");
      return { ...definition, catalogExerciseId: entry.id };
    });
    for (const set of args.sets) {
      const exercise = snapshot.exercises.find(
        (e) => e.id === set.workoutExerciseId,
      );
      if (
        !exercise ||
        set.round > exercise.sets ||
        (!exercise.unilateral && set.values.rightAmount !== null) ||
        (exercise.load === "bodyweight" && set.values.weightKg !== null)
      )
        throw new Error("Workout set update not allowed");
    }
    if (existing) {
      if (args.note !== undefined)
        await tx.mutate.workoutLogs.update({
          id: existing.id,
          note: args.note,
        });
      const oldSets = await tx.run(
        zql.workoutLogSets.where("logId", existing.id),
      );
      for (const set of oldSets)
        await tx.mutate.workoutLogSets.delete({
          logId: set.logId,
          workoutExerciseId: set.workoutExerciseId,
          round: set.round,
        });
    } else {
      await tx.mutate.workoutLogs.insert({
        id: logId,
        householdId: args.householdId,
        workoutId: args.workoutId,
        userId: ctx.userId,
        note: args.note ?? "",
        snapshot,
        createdAt: now,
        completedAt: now,
        completedOn,
      });
    }
    for (const set of args.sets) {
      const exercise = snapshot.exercises.find(
        (e) => e.id === set.workoutExerciseId,
      );
      if (!exercise?.catalogExerciseId)
        throw new Error("Missing catalog exercise");
      await tx.mutate.workoutLogSets.insert({
        logId,
        householdId: args.householdId,
        workoutExerciseId: set.workoutExerciseId,
        exerciseId: exercise.catalogExerciseId,
        round: set.round,
        ...set.values,
        unit: exercise.unit,
        load: exercise.load,
        unilateral: exercise.unilateral,
      });
    }
  }),
};
