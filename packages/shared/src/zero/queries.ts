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

export const queries = defineHomeHubQueries({
  shopping: {
    byHousehold: shoppingItemsByHousehold,
  },
  recipes: {
    byHousehold: recipesByHousehold,
  },
});
