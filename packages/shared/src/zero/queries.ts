import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import { habitsQuerySchema, shiftCalendarDate } from "../habits";
import { listDetailArgsSchema } from "../lists";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubQuery = defineQueryWithType<Schema, ZeroAuthContext>();
const defineHomeHubQueries = defineQueriesWithType<Schema>();

const householdIdArgsSchema = z
  .object({
    householdId: z.uuid(),
  })
  .strict();

const recipeDetailArgsSchema = z
  .object({
    householdId: z.uuid(),
    recipeId: z.uuid(),
  })
  .strict();

const myHouseholds = defineHomeHubQuery(z.object({}).strict(), ({ ctx }) =>
  zql.households
    .where("deletedAt", "IS", null)
    .whereExists("members", (member) => member.where("userId", ctx.userId))
    .related("members", (member) => member.where("userId", ctx.userId))
    .orderBy("name", "asc")
    .orderBy("id", "asc"),
);

const myHouseholdMemberships = defineHomeHubQuery(
  z.object({}).strict(),
  ({ ctx }) =>
    zql.householdMembers
      .where("userId", ctx.userId)
      .whereExists("household", (household) =>
        household.where("deletedAt", "IS", null),
      )
      .related("household")
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);

const householdMembersByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.householdMembers
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household
          .where("deletedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userId", ctx.userId),
          ),
      )
      .related("user")
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc"),
);

const moduleSettingsByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.householdModuleSettings
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household
          .where("deletedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userId", ctx.userId),
          ),
      )
      .orderBy("moduleKey", "asc"),
);

const authorizedLists = (householdId: string, userId: string) =>
  zql.lists
    .where("householdId", householdId)
    .where("deletedAt", "IS", null)
    .whereExists("household", (household) =>
      household
        .where("deletedAt", "IS", null)
        .whereExists("members", (member) => member.where("userId", userId))
        .whereExists("moduleSettings", (setting) =>
          setting.where("moduleKey", "lists").where("enabled", true),
        ),
    );

const listsByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    authorizedLists(args.householdId, ctx.userId)
      .related("items", (item) =>
        item
          .where("status", "IN", ["active", "crossed"])
          .orderBy("status", "asc")
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc")
          .limit(4),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);

const listDetail = defineHomeHubQuery(listDetailArgsSchema, ({ args, ctx }) =>
  authorizedLists(args.householdId, ctx.userId)
    .where("id", args.listId)
    .related("items", (item) =>
      item
        .where("status", "!=", "deleted")
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc"),
    )
    .one(),
);

const authorizedRecipes = (householdId: string, userId: string) =>
  zql.recipes
    .where("householdId", householdId)
    .where("deletedAt", "IS", null)
    .whereExists("household", (household) =>
      household
        .where("deletedAt", "IS", null)
        .whereExists("members", (member) => member.where("userId", userId))
        .whereExists("moduleSettings", (setting) =>
          setting.where("moduleKey", "recipes").where("enabled", true),
        ),
    );

const recipesByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    authorizedRecipes(args.householdId, ctx.userId)
      .related("images", (image) =>
        image
          .where("deletedAt", "IS", null)
          .whereExists("asset", (asset) =>
            asset
              .where("kind", "image")
              .where("confirmedAt", "IS NOT", null)
              .where("deletedAt", "IS", null),
          )
          .related("asset")
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc")
          .limit(1),
      )
      .related("ingredients", (ingredient) =>
        ingredient
          .where("deletedAt", "IS", null)
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc"),
      )
      .related("cookLogs", (cookLog) =>
        cookLog
          .where("deletedAt", "IS", null)
          .orderBy("cookedAt", "desc")
          .orderBy("id", "desc")
          .limit(1),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);

const recipeDetail = defineHomeHubQuery(
  recipeDetailArgsSchema,
  ({ args, ctx }) =>
    authorizedRecipes(args.householdId, ctx.userId)
      .where("id", args.recipeId)
      .related("ingredients", (ingredient) =>
        ingredient
          .where("deletedAt", "IS", null)
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc"),
      )
      .related("cookLogs", (cookLog) =>
        cookLog
          .where("deletedAt", "IS", null)
          .orderBy("cookedAt", "desc")
          .orderBy("id", "desc"),
      )
      .related("images", (image) =>
        image
          .where("deletedAt", "IS", null)
          .whereExists("asset", (asset) =>
            asset
              .where("kind", "image")
              .where("confirmedAt", "IS NOT", null)
              .where("deletedAt", "IS", null),
          )
          .related("asset")
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc"),
      )
      .one(),
);

const habitsByHousehold = defineHomeHubQuery(
  habitsQuerySchema,
  ({ args, ctx }) =>
    zql.habits
      .where("householdId", args.householdId)
      .where("status", args.archived ? "archived" : "active")
      .whereExists("household", (household) =>
        household
          .where("deletedAt", "IS", null)
          .whereExists("members", (member) =>
            member.where("userId", ctx.userId),
          )
          .whereExists("moduleSettings", (setting) =>
            setting.where("moduleKey", "habits").where("enabled", true),
          ),
      )
      .related("entries", (entry) =>
        entry
          .where("entryOn", ">=", args.startOn)
          .where("entryOn", "<=", args.endOn)
          .whereExists("membership")
          .orderBy("entryOn", "asc")
          .orderBy("userId", "asc"),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);

// New contracts leave byHousehold available to already-open clients.
const personHabitArgs = z
  .object({
    householdId: z.uuid(),
    personId: z.uuid(),
    startOn: z.iso.date(),
    endOn: z.iso.date(),
    archived: z.boolean(),
  })
  .strict()
  .refine(
    (args) =>
      args.endOn >= args.startOn &&
      args.endOn <= shiftCalendarDate(args.startOn, 30),
    "Invalid calendar period",
  );
const authorizedPersonHabits = (
  householdId: string,
  userId: string,
  personId: string,
) =>
  zql.habits.where("householdId", householdId).whereExists("household", (h) =>
    h
      .where("deletedAt", "IS", null)
      .whereExists("members", (m) => m.where("userId", userId))
      .whereExists("members", (m) => m.where("userId", personId))
      .whereExists("moduleSettings", (s) =>
        s.where("moduleKey", "habits").where("enabled", true),
      ),
  );
const recentPersonHabits = defineHomeHubQuery(
  personHabitArgs.refine(
    (args) => args.endOn <= shiftCalendarDate(args.startOn, 6),
    "Invalid recent window",
  ),
  ({ args, ctx }) =>
    authorizedPersonHabits(args.householdId, ctx.userId, args.personId)
      .where("status", args.archived ? "archived" : "active")
      .related("entries", (e) =>
        e
          .where("userId", args.personId)
          .where("entryOn", ">=", args.startOn)
          .where("entryOn", "<=", args.endOn)
          .whereExists("membership")
          .orderBy("entryOn", "asc"),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);
const personHabitHistory = defineHomeHubQuery(
  personHabitArgs.safeExtend({ habitId: z.uuid() }),
  ({ args, ctx }) =>
    authorizedPersonHabits(args.householdId, ctx.userId, args.personId)
      .where("id", args.habitId)
      .where("status", args.archived ? "archived" : "active")
      .related("entries", (e) =>
        e
          .where("userId", args.personId)
          .where("entryOn", ">=", args.startOn)
          .where("entryOn", "<=", args.endOn)
          .whereExists("membership")
          .orderBy("entryOn", "asc"),
      ),
);

const authorizedWorkouts = (householdId: string, userId: string) =>
  zql.workouts.where("householdId", householdId).whereExists("household", (h) =>
    h
      .where("deletedAt", "IS", null)
      .whereExists("members", (m) => m.where("userId", userId))
      .whereExists("moduleSettings", (s) =>
        s.where("moduleKey", "workouts").where("enabled", true),
      ),
  );
const workoutsByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    authorizedWorkouts(args.householdId, ctx.userId)
      .related("logs", (logs) =>
        logs
          .where("householdId", args.householdId)
          .where("userId", ctx.userId)
          .orderBy("completedOn", "desc")
          .orderBy("id", "desc")
          .limit(1),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);
const workoutDetailArgs = z
  .object({ householdId: z.uuid(), workoutId: z.uuid() })
  .strict();
const workoutDetail = defineHomeHubQuery(workoutDetailArgs, ({ args, ctx }) =>
  authorizedWorkouts(args.householdId, ctx.userId)
    .where("id", args.workoutId)
    .related("exercises", (exercises) =>
      exercises
        .related("exercise")
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc"),
    )
    .one(),
);
const exerciseCatalog = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.exercises
      .where("householdId", args.householdId)
      .where("deletedAt", "IS", null)
      .whereExists("household", (h) =>
        h
          .where("deletedAt", "IS", null)
          .whereExists("members", (m) => m.where("userId", ctx.userId))
          .whereExists("moduleSettings", (s) =>
            s.where("moduleKey", "workouts").where("enabled", true),
          ),
      )
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);
const exerciseMediaQuery = defineHomeHubQuery(
  z.object({ householdId: z.uuid(), exerciseId: z.uuid() }).strict(),
  ({ args, ctx }) =>
    zql.exerciseMedia
      .where("householdId", args.householdId)
      .where("exerciseId", args.exerciseId)
      .where("deletedAt", "IS", null)
      .whereExists("exercise", (exercise) =>
        exercise.where("deletedAt", "IS", null).whereExists("household", (h) =>
          h
            .where("deletedAt", "IS", null)
            .whereExists("members", (m) => m.where("userId", ctx.userId))
            .whereExists("moduleSettings", (s) =>
              s.where("moduleKey", "workouts").where("enabled", true),
            ),
        ),
      )
      .whereExists("asset", (asset) =>
        asset
          .where("kind", "image")
          .where("confirmedAt", "IS NOT", null)
          .where("deletedAt", "IS", null),
      )
      .related("asset")
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);
const workoutLogs = defineHomeHubQuery(workoutDetailArgs, ({ args, ctx }) =>
  zql.workoutLogs
    .where("householdId", args.householdId)
    .where("workoutId", args.workoutId)
    .where("userId", ctx.userId)
    .whereExists("household", (h) =>
      h
        .where("deletedAt", "IS", null)
        .whereExists("members", (m) => m.where("userId", ctx.userId))
        .whereExists("moduleSettings", (s) =>
          s.where("moduleKey", "workouts").where("enabled", true),
        ),
    )
    .related("sets")
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc"),
);

export const queries = defineHomeHubQueries({
  workouts: {
    byHousehold: workoutsByHousehold,
    catalog: exerciseCatalog,
    exerciseMedia: exerciseMediaQuery,
    detail: workoutDetail,
    logs: workoutLogs,
  },
  habits: {
    byHousehold: habitsByHousehold,
    recentForPerson: recentPersonHabits,
    historyForPerson: personHabitHistory,
  },
  householdMemberships: {
    byHousehold: householdMembersByHousehold,
    mine: myHouseholdMemberships,
  },
  lists: {
    byHousehold: listsByHousehold,
    detail: listDetail,
  },
  households: {
    mine: myHouseholds,
  },
  modules: {
    byHousehold: moduleSettingsByHousehold,
  },
  recipes: {
    byHousehold: recipesByHousehold,
    detail: recipeDetail,
  },
});
