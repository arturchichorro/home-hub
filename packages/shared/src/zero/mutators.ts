import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
import { normalizeShoppingItemName } from "../normalization";
import {
  createRecipeIngredientMutationSchema,
  createRecipeMutationSchema,
} from "../recipes";
import {
  addShoppingItemMutationSchema,
  setShoppingItemStatusMutationSchema,
} from "../shopping";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdMembership } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
const defineHomeHubMutators = defineMutatorsWithType<Schema>();

const setShoppingItemStatus = defineHomeHubMutator(
  setShoppingItemStatusMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdMembership({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
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
    await requireServerHouseholdMembership({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
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

const createRecipe = defineHomeHubMutator(
  createRecipeMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdMembership({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
    });

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    await tx.mutate.recipes.insert({
      id: args.recipeId,
      householdId: args.householdId,
      title: args.title,
      description: args.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
);

const addRecipeIngredient = defineHomeHubMutator(
  createRecipeIngredientMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdMembership({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
    });

    const recipe = await tx.run(
      zql.recipes
        .where("id", args.recipeId)
        .where("householdId", args.householdId)
        .one(),
    );

    if (!recipe) {
      throw new Error("Recipe ingredient addition not allowed");
    }

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    await tx.mutate.recipeIngredients.insert({
      id: args.ingredientId,
      householdId: args.householdId,
      recipeId: args.recipeId,
      name: args.name,
      quantity: args.quantity,
      unit: args.unit,
      note: args.note,
      position: args.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
);

export const mutators = defineHomeHubMutators({
  shopping: {
    add: addShoppingItem,
    setStatus: setShoppingItemStatus,
  },
  recipes: {
    create: createRecipe,
    addIngredient: addRecipeIngredient,
  },
});
