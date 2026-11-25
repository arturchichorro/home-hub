import { defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import { calendarDateSchema } from "../habits";
import {
  trainingHistoryArgsSchema,
  trainingHistoryPageSize,
} from "../training";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const define = defineQueryWithType<Schema, ZeroAuthContext>();
const sessions = (
  householdId: string,
  userId: string,
  includeExercises = true,
  exerciseId?: string,
) =>
  zql.trainingSessions
    .where("householdId", householdId)
    .where("userId", userId)
    .where("deletedAt", "IS", null)
    .whereExists("household", (h) =>
      h
        .where("deletedAt", "IS", null)
        .whereExists("members", (m) => m.where("userId", userId))
        .whereExists("moduleSettings", (s) =>
          s.where("moduleKey", "workouts").where("enabled", true),
        ),
    )
    .related("exercises", (rows) =>
      (exerciseId
        ? rows.where("exerciseId", exerciseId).whereExists("sets")
        : includeExercises
          ? rows
          : rows.where("id", "IN", [])
      )
        .where("householdId", householdId)
        .where("userId", userId)
        .where("deletedAt", "IS", null)
        .orderBy("position", "asc")
        .orderBy("id", "asc")
        .related("sets", (sets) => sets.orderBy("round", "asc")),
    )
    .orderBy("completedOn", "desc")
    .orderBy("completedAt", "desc")
    .orderBy("id", "desc");

export const trainingQueries = {
  exercise: define(
    z.object({ householdId: z.uuid(), exerciseId: z.uuid() }).strict(),
    ({ args, ctx }) =>
      zql.exercises
        .where("householdId", args.householdId)
        .where("id", args.exerciseId)
        .whereExists("household", (h) =>
          h
            .where("deletedAt", "IS", null)
            .whereExists("members", (m) => m.where("userId", ctx.userId))
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "workouts").where("enabled", true),
            ),
        )
        .where(({ or, cmp, exists }) =>
          or(
            cmp("deletedAt", "IS", null),
            exists("performances", (p) =>
              p
                .where("householdId", args.householdId)
                .where("userId", ctx.userId)
                .where("deletedAt", "IS", null)
                .whereExists("sets")
                .whereExists("session", (t) =>
                  t.where("deletedAt", "IS", null),
                ),
            ),
          ),
        )
        .related("performances", (p) =>
          p
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .where("deletedAt", "IS", null)
            .whereExists("sets")
            .whereExists("session", (t) => t.where("deletedAt", "IS", null))
            .orderBy("performedOn", "desc")
            .orderBy("performedAt", "desc")
            .orderBy("id", "desc")
            .limit(1),
        )
        .one(),
  ),

  session: define(
    z
      .object({
        householdId: z.uuid(),
        workoutId: z.uuid().nullable().optional(),
        logId: z.uuid().optional(),
        completedOn: calendarDateSchema.optional(),
      })
      .strict()
      .refine(
        (value) => Boolean(value.logId) !== Boolean(value.completedOn),
        "Choose a log or day",
      ),
    ({ args, ctx }) => {
      const source = sessions(args.householdId, ctx.userId);
      const query = args.workoutId
        ? source.where("workoutId", args.workoutId)
        : source.where("workoutId", "IS", null);

      if (args.logId) {
        return query.where("id", args.logId).limit(1);
      }

      if (args.completedOn) {
        return query.where("completedOn", args.completedOn).limit(1);
      }

      throw Error("Choose a log or day");
    },
  ),
  history: define(trainingHistoryArgsSchema, ({ args, ctx }) => {
    const exerciseId = args.exerciseId;
    const source = sessions(
      args.householdId,
      ctx.userId,
      args.includeExercises ?? false,
      exerciseId,
    );
    const byWorkout = args.workoutId
      ? source.where("workoutId", args.workoutId)
      : source;
    const query = exerciseId
      ? byWorkout.whereExists("exercises", (e) =>
          e
            .where("householdId", args.householdId)
            .where("userId", ctx.userId)
            .where("exerciseId", exerciseId)
            .where("deletedAt", "IS", null)
            .whereExists("sets"),
        )
      : byWorkout;

    return (
      args.cursor ? query.start(args.cursor, { inclusive: false }) : query
    ).limit(trainingHistoryPageSize + 1);
  }),
};
