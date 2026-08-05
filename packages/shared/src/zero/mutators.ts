import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
import { setShoppingItemStatusMutationSchema } from "../shopping";
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

export const mutators = defineHomeHubMutators({
  shopping: {
    setStatus: setShoppingItemStatus,
  },
});
