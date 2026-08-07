import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
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
    .whereExists("members", (member) => member.where("userId", ctx.userId))
    .related("members", (member) => member.where("userId", ctx.userId))
    .orderBy("name", "asc")
    .orderBy("id", "asc"),
);

const shoppingItemsByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.shoppingItems
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household.whereExists("members", (member) =>
          member.where("userId", ctx.userId),
        ),
      )
      .orderBy("createdAt", "asc"),
);

const recipesByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.recipes
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household.whereExists("members", (member) =>
          member.where("userId", ctx.userId),
        ),
      )
      .orderBy("title", "asc")
      .orderBy("id", "asc"),
);

const recipeDetail = defineHomeHubQuery(
  recipeDetailArgsSchema,
  ({ args, ctx }) =>
    zql.recipes
      .where("householdId", args.householdId)
      .where("id", args.recipeId)
      .whereExists("household", (household) =>
        household.whereExists("members", (member) =>
          member.where("userId", ctx.userId),
        ),
      )
      .related("ingredients", (ingredient) =>
        ingredient.orderBy("position", "asc").orderBy("id", "asc"),
      )
      .related("cookLogs", (cookLog) =>
        cookLog.orderBy("cookedAt", "desc").orderBy("id", "desc"),
      )
      .one(),
);

export const queries = defineHomeHubQueries({
  households: {
    mine: myHouseholds,
  },
  shopping: {
    byHousehold: shoppingItemsByHousehold,
  },
  recipes: {
    byHousehold: recipesByHousehold,
    detail: recipeDetail,
  },
});
