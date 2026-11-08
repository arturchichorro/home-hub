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
const scope = z.object({ householdId: z.uuid() }).strict();
const headers = (householdId: string, userId: string) =>
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
    .orderBy("completedOn", "desc")
    .orderBy("completedAt", "desc")
    .orderBy("id", "desc");

const sessions = (householdId: string, userId: string) =>
  headers(householdId, userId).related("loggedExercises", (links) =>
    links
      .where("householdId", householdId)
      .where("userId", userId)
      .orderBy("position", "asc")
      .orderBy("exerciseId", "asc")
      .related("occurrence", (p) =>
        p
          .where("householdId", householdId)
          .where("userId", userId)
          .related("sets", (sets) => sets.orderBy("round", "asc")),
      ),
  );

export const trainingQueries = {
  session: define(
    scope
      .extend({
        completedOn: calendarDateSchema.optional(),
        logId: z.uuid().optional(),
      })
      .refine(
        (value) => Boolean(value.completedOn) !== Boolean(value.logId),
        "Choose a log or a day",
      ),
    ({ args, ctx }) => {
      const query = sessions(args.householdId, ctx.userId);
      if (args.logId) {
        return query.where("id", args.logId).limit(1);
      }
      if (args.completedOn) {
        return query.where("completedOn", args.completedOn).limit(1);
      }
      throw Error("Choose a training log or a day");
    },
  ),
  history: define(trainingHistoryArgsSchema, ({ args, ctx }) => {
    const query = headers(args.householdId, ctx.userId);
    const cursor = args.cursor;
    return (
      cursor
        ? query.start(
            {
              completedOn: cursor.completedOn,
              completedAt: cursor.completedAt,
              id: cursor.id,
            },
            { inclusive: cursor.kind === "workout" },
          )
        : query
    ).limit(trainingHistoryPageSize + 1);
  }),
  // A new query name keeps all previously registered workout-history shapes intact.
  workouts: define(trainingHistoryArgsSchema, ({ args, ctx }) => {
    const query = zql.workoutLogs
      .where("householdId", args.householdId)
      .where("userId", ctx.userId)
      .whereExists("household", (h) =>
        h
          .where("deletedAt", "IS", null)
          .whereExists("members", (m) => m.where("userId", ctx.userId))
          .whereExists("moduleSettings", (s) =>
            s.where("moduleKey", "workouts").where("enabled", true),
          ),
      )
      .orderBy("completedOn", "desc")
      .orderBy("completedAt", "desc")
      .orderBy("id", "desc");
    const cursor = args.cursor;
    return (
      cursor
        ? query.start(
            {
              completedOn: cursor.completedOn,
              completedAt: cursor.completedAt,
              id: cursor.id,
            },
            { inclusive: false },
          )
        : query
    ).limit(trainingHistoryPageSize + 1);
  }),
};
