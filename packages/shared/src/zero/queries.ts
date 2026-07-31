import { defineQueriesWithType, defineQueryWithType } from "@rocicorp/zero";
import * as z from "zod";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubQuery = defineQueryWithType<Schema, ZeroAuthContext>();
const defineHomeHubQueries = defineQueriesWithType<Schema>();

const shoppingItemsByHouseholdArgsSchema = z
  .object({
    householdId: z.uuid(),
  })
  .strict();

const shoppingItemsByHousehold = defineHomeHubQuery(
  shoppingItemsByHouseholdArgsSchema,
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

export const queries = defineHomeHubQueries({
  shopping: {
    byHousehold: shoppingItemsByHousehold,
  },
});
