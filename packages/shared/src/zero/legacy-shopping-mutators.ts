import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
import { normalizeShoppingItemName } from "../normalization";
import {
  addShoppingItemMutationSchema,
  renameShoppingItemMutationSchema,
  reorderShoppingItemsMutationSchema,
  setShoppingItemStatusMutationSchema,
  shoppingItemNameAlreadyExistsError,
} from "../shopping";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
const shoppingSortKeyGap = 1024;
const maxShoppingSortKey = 2_147_483_647;
const minShoppingSortKey = -2_147_483_648;

const setShoppingItemStatus = defineHomeHubMutator(
  setShoppingItemStatusMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "shopping",
    });

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
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "shopping",
    });

    const normalizedName = normalizeShoppingItemName(args.name);

    const item = await tx.run(
      zql.shoppingItems
        .where("normalizedName", normalizedName)
        .where("householdId", args.householdId)
        .one(),
    );

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    const topActiveItem = await tx.run(
      zql.shoppingItems
        .where("householdId", args.householdId)
        .where("status", "active")
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    const sortKey =
      topActiveItem && item && topActiveItem.id === item.id
        ? topActiveItem.sortKey
        : (topActiveItem?.sortKey ?? 0) + shoppingSortKeyGap;
    if (sortKey > maxShoppingSortKey) {
      throw new Error("Shopping item ordering requires rebalancing");
    }

    if (item) {
      await tx.mutate.shoppingItems.update({
        id: item.id,
        status: "active",
        sortKey,
        updatedAt: timestamp,
      });
    } else {
      await tx.mutate.shoppingItems.insert({
        id: args.itemId,
        householdId: args.householdId,
        name: args.name,
        normalizedName,
        status: "active",
        sortKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  },
);

const reorderShoppingItems = defineHomeHubMutator(
  reorderShoppingItemsMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "shopping",
    });

    const movedIndex = args.orderedItemIds.indexOf(args.itemId);
    const previousItemId = args.orderedItemIds[movedIndex - 1];
    const nextItemId = args.orderedItemIds[movedIndex + 1];
    const loadScopedItem = (itemId: string | undefined) =>
      itemId
        ? tx.run(
            zql.shoppingItems
              .where("id", itemId)
              .where("householdId", args.householdId)
              .where("status", args.status)
              .one(),
          )
        : Promise.resolve(undefined);
    const [movedItem, previousItem, nextItem] = await Promise.all([
      loadScopedItem(args.itemId),
      loadScopedItem(previousItemId),
      loadScopedItem(nextItemId),
    ]);

    if (
      !movedItem ||
      (previousItemId && !previousItem) ||
      (nextItemId && !nextItem)
    ) {
      throw new Error("Shopping item reorder not allowed");
    }

    let sortKey: number;
    if (previousItem && nextItem) {
      sortKey = Math.floor((previousItem.sortKey + nextItem.sortKey) / 2);
    } else if (previousItem) {
      sortKey = previousItem.sortKey - shoppingSortKeyGap;
    } else if (nextItem) {
      sortKey = nextItem.sortKey + shoppingSortKeyGap;
    } else {
      sortKey = 0;
    }

    const hasUsableGap =
      sortKey >= minShoppingSortKey &&
      sortKey <= maxShoppingSortKey &&
      (!previousItem || sortKey < previousItem.sortKey) &&
      (!nextItem || sortKey > nextItem.sortKey);
    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticUpdatedAt;

    if (hasUsableGap) {
      await tx.mutate.shoppingItems.update({
        id: args.itemId,
        sortKey,
        updatedAt: timestamp,
      });
      return;
    }

    for (const [index, itemId] of args.orderedItemIds.entries()) {
      const item =
        itemId === movedItem.id ? movedItem : await loadScopedItem(itemId);
      if (!item) throw new Error("Shopping item reorder not allowed");
      await tx.mutate.shoppingItems.update({
        id: itemId,
        sortKey: (args.orderedItemIds.length - index) * shoppingSortKeyGap,
        updatedAt: timestamp,
      });
    }
  },
);

const renameShoppingItem = defineHomeHubMutator(
  renameShoppingItemMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "shopping",
    });

    const item = await tx.run(
      zql.shoppingItems
        .where("id", args.itemId)
        .where("householdId", args.householdId)
        .one(),
    );

    if (!item) {
      throw new Error("Shopping item rename not allowed");
    }

    const normalizedName = normalizeShoppingItemName(args.name);
    const itemWithName = await tx.run(
      zql.shoppingItems
        .where("normalizedName", normalizedName)
        .where("householdId", args.householdId)
        .one(),
    );

    if (itemWithName && itemWithName.id !== args.itemId) {
      throw new Error(shoppingItemNameAlreadyExistsError);
    }

    await tx.mutate.shoppingItems.update({
      id: args.itemId,
      name: args.name,
      normalizedName,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

// Retained only for legacy unit coverage until the Shopping code is deleted.
export const legacyShoppingMutators = defineMutatorsWithType<Schema>()({
  shopping: {
    add: addShoppingItem,
    rename: renameShoppingItem,
    reorder: reorderShoppingItems,
    setStatus: setShoppingItemStatus,
  },
});
