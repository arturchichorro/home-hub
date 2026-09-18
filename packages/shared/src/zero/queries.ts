import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import { listDetailArgsSchema } from "../lists";
import { isGuestZeroAuthContext, type ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubQuery = defineQueryWithType<Schema, ZeroAuthContext>();
const defineHomeHubQueries = defineQueriesWithType<Schema>();
const noAccountId = "00000000-0000-0000-0000-000000000000";
const accountId = (ctx: ZeroAuthContext) =>
  ctx.actor.kind === "account" ? ctx.actor.accountId : noAccountId;

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
    .whereExists("members", (member) => member.where("userId", accountId(ctx)))
    .related("members", (member) => member.where("userId", accountId(ctx)))
    .orderBy("name", "asc")
    .orderBy("id", "asc"),
);

const myHouseholdMemberships = defineHomeHubQuery(
  z.object({}).strict(),
  ({ ctx }) =>
    zql.householdMembers
      .where("userId", accountId(ctx))
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
            member.where("userId", accountId(ctx)),
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
            member.where("userId", accountId(ctx)),
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
    authorizedLists(args.householdId, accountId(ctx))
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
  authorizedLists(args.householdId, accountId(ctx))
    .where("id", args.listId)
    .related("items", (item) =>
      item
        .where("status", "!=", "deleted")
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc"),
    )
    .one(),
);

const authorizedRecipes = (householdId: string, ctx: ZeroAuthContext) => {
  const recipes = zql.recipes
    .where("householdId", householdId)
    .where("deletedAt", "IS", null);
  if (
    isGuestZeroAuthContext(ctx) &&
    ctx.householdScope.householdId !== householdId
  ) {
    return recipes.where("id", "=", "00000000-0000-0000-0000-000000000000");
  }
  return recipes.whereExists("household", (household) => {
    let authorizedHousehold = household.where("deletedAt", "IS", null);
    if (!isGuestZeroAuthContext(ctx)) {
      authorizedHousehold = authorizedHousehold.whereExists(
        "members",
        (member) => member.where("userId", ctx.actor.accountId),
      );
    }
    return authorizedHousehold.whereExists("moduleSettings", (setting) =>
      setting.where("moduleKey", "recipes").where("enabled", true),
    );
  });
};

const recipesByHousehold = defineHomeHubQuery(
  householdIdArgsSchema,
  ({ args, ctx }) =>
    authorizedRecipes(args.householdId, ctx)
      .related("images", (image) =>
        image
          .where("confirmedAt", "IS NOT", null)
          .where("deletedAt", "IS", null)
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
    authorizedRecipes(args.householdId, ctx)
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
          .where("confirmedAt", "IS NOT", null)
          .where("deletedAt", "IS", null)
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc"),
      )
      .one(),
);

export const queries = defineHomeHubQueries({
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
