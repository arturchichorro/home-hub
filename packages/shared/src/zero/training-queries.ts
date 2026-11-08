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
      (includeExercises ? rows : rows.where("id", "IN", []))
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
    const source = sessions(
      args.householdId,
      ctx.userId,
      args.includeExercises ?? false,
    );
    const query = args.workoutId
      ? source.where("workoutId", args.workoutId)
      : source;

    return (
      args.cursor ? query.start(args.cursor, { inclusive: false }) : query
    ).limit(trainingHistoryPageSize + 1);
  }),
};
