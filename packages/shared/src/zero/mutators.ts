import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
import { normalizeShoppingItemName } from "../normalization";
import {
  addShoppingItemMutationSchema,
  setShoppingItemStatusMutationSchema,
} from "../shopping";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
const defineHomeHubMutators = defineMutatorsWithType<Schema>();

const setShoppingItemStatus = defineHomeHubMutator(
  setShoppingItemStatusMutationSchema,
  async ({ args, ctx, tx }) => {
    if (tx.location === "server") {
      const membership = await tx.run(
        zql.householdMembers
          .where("householdId", args.householdId)
          .where("userId", ctx.userId)
          .one(),
      );

      if (!membership) {
        throw new Error("Shopping item status change not allowed");
      }
    }

    const item = await tx.run(
      zql.shoppingItems
        .where("id", args.itemId)
        .where("householdId", args.householdId)
        .one(),
    );

    if (!item) {
      throw new Error("Shopping item status change not allowed");
    }

    await tx.mutate.shoppingItems.update({
      id: args.itemId,
      status: args.status,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

const addShoppingItem = defineHomeHubMutator(
  addShoppingItemMutationSchema,
  async ({ args, ctx, tx }) => {
    if (tx.location === "server") {
      const membership = await tx.run(
        zql.householdMembers
          .where("householdId", args.householdId)
          .where("userId", ctx.userId)
          .one(),
      );

      if (!membership) {
        throw new Error("Shopping item addition not allowed");
      }
    }

    const normalizedName = normalizeShoppingItemName(args.name);

    const item = await tx.run(
      zql.shoppingItems
        .where("normalizedName", normalizedName)
        .where("householdId", args.householdId)
        .one(),
    );

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    if (!item) {
      await tx.mutate.shoppingItems.insert({
        id: args.itemId,
        householdId: args.householdId,
        name: args.name,
        normalizedName,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      await tx.mutate.shoppingItems.update({
        id: item.id,
        status: "active",
        updatedAt: timestamp,
      });
    }
  },
);

export const mutators = defineHomeHubMutators({
  shopping: {
    add: addShoppingItem,
    setStatus: setShoppingItemStatus,
  },
});
