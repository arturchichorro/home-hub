import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
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
      .related("household")
      .orderBy("sortKey", "desc")
      .orderBy("id", "asc"),
);

const moduleSettingsByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    zql.householdModuleSettings
      .where("householdId", args.householdId)
      .whereExists("household", (household) =>
        household.whereExists("members", (member) =>
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
      item.orderBy("sortKey", "desc").orderBy("id", "asc"),
    )
    .one(),
);

const authorizedRecipes = (householdId: string, userId: string) =>
  zql.recipes
    .where("householdId", householdId)
    .where("deletedAt", "IS", null)
    .whereExists("household", (household) =>
      household
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
          .where("confirmedAt", "IS NOT", null)
          .orderBy("position", "asc")
          .orderBy("id", "asc")
          .limit(1),
      )
      .related("ingredients", (ingredient) =>
        ingredient.orderBy("position", "asc").orderBy("id", "asc"),
      )
      .related("cookLogs", (cookLog) =>
        cookLog.orderBy("cookedAt", "desc").orderBy("id", "desc").limit(1),
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
        ingredient.orderBy("position", "asc").orderBy("id", "asc"),
      )
      .related("cookLogs", (cookLog) =>
        cookLog.orderBy("cookedAt", "desc").orderBy("id", "desc"),
      )
      .related("images", (image) =>
        image
          .where("confirmedAt", "IS NOT", null)
          .orderBy("position", "asc")
          .orderBy("id", "asc"),
      )
      .one(),
);

export const queries = defineHomeHubQueries({
  householdMemberships: {
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
