import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
import { normalizeShoppingItemName } from "../normalization";
import {
  createRecipeCookLogMutationSchema,
  createRecipeIngredientMutationSchema,
  createRecipeMutationSchema,
  deleteRecipeCookLogMutationSchema,
  deleteRecipeIngredientMutationSchema,
  renameRecipeIngredientMutationSchema,
  reorderRecipeImagesMutationSchema,
  reorderRecipeIngredientsMutationSchema,
  updateRecipeCookLogMutationSchema,
  updateRecipeIngredientMutationSchema,
  updateRecipeMutationSchema,
} from "../recipes";
import {
  addShoppingItemMutationSchema,
  renameShoppingItemMutationSchema,
  setShoppingItemStatusMutationSchema,
} from "../shopping";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
const defineHomeHubMutators = defineMutatorsWithType<Schema>();

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
      throw new Error("Shopping item name already exists");
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

const createRecipe = defineHomeHubMutator(
  createRecipeMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
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

const updateRecipe = defineHomeHubMutator(
  updateRecipeMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const recipe = await tx.run(
      zql.recipes
        .where("id", args.recipeId)
        .where("householdId", args.householdId)
        .one(),
    );

    if (!recipe) {
      throw new Error("Recipe update not allowed");
    }

    await tx.mutate.recipes.update({
      id: args.recipeId,
      title: args.title,
      description: args.description,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

const addRecipeIngredient = defineHomeHubMutator(
  createRecipeIngredientMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
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
      amount: null,
      note: null,
      position: args.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
);

const updateRecipeIngredient = defineHomeHubMutator(
  updateRecipeIngredientMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const ingredient = await tx.run(
      zql.recipeIngredients
        .where("id", args.ingredientId)
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .one(),
    );
    if (!ingredient) throw new Error("Recipe ingredient update not allowed");

    await tx.mutate.recipeIngredients.update({
      id: args.ingredientId,
      amount: args.amount,
      note: args.note,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

const renameRecipeIngredient = defineHomeHubMutator(
  renameRecipeIngredientMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const ingredient = await tx.run(
      zql.recipeIngredients
        .where("id", args.ingredientId)
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .one(),
    );
    if (!ingredient) throw new Error("Recipe ingredient rename not allowed");

    await tx.mutate.recipeIngredients.update({
      id: args.ingredientId,
      name: args.name,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

const addRecipeCookLog = defineHomeHubMutator(
  createRecipeCookLogMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const recipe = await tx.run(
      zql.recipes
        .where("id", args.recipeId)
        .where("householdId", args.householdId)
        .one(),
    );

    if (!recipe) {
      throw new Error("Recipe cooking log addition not allowed");
    }

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;

    await tx.mutate.recipeCookLogs.insert({
      id: args.cookLogId,
      householdId: args.householdId,
      recipeId: args.recipeId,
      comment: args.comment,
      cookedAt: args.cookedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },
);

const updateRecipeCookLog = defineHomeHubMutator(
  updateRecipeCookLogMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const cookLog = await tx.run(
      zql.recipeCookLogs
        .where("id", args.cookLogId)
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .one(),
    );
    if (!cookLog) throw new Error("Recipe cooking log update not allowed");

    await tx.mutate.recipeCookLogs.update({
      id: args.cookLogId,
      comment: args.comment,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    });
  },
);

const deleteRecipeIngredient = defineHomeHubMutator(
  deleteRecipeIngredientMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const ingredient = await tx.run(
      zql.recipeIngredients
        .where("id", args.ingredientId)
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .one(),
    );
    if (!ingredient) throw new Error("Recipe ingredient deletion not allowed");

    await tx.mutate.recipeIngredients.delete({ id: args.ingredientId });
  },
);

const reorderRecipeIngredients = defineHomeHubMutator(
  reorderRecipeIngredientsMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticUpdatedAt;
    for (const [
      position,
      ingredientId,
    ] of args.orderedIngredientIds.entries()) {
      const ingredient = await tx.run(
        zql.recipeIngredients
          .where("id", ingredientId)
          .where("householdId", args.householdId)
          .where("recipeId", args.recipeId)
          .one(),
      );
      if (!ingredient) throw new Error("Recipe ingredient reorder not allowed");
      await tx.mutate.recipeIngredients.update({
        id: ingredientId,
        position,
        updatedAt: timestamp,
      });
    }
  },
);

const deleteRecipeCookLog = defineHomeHubMutator(
  deleteRecipeCookLogMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const cookLog = await tx.run(
      zql.recipeCookLogs
        .where("id", args.cookLogId)
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .one(),
    );
    if (!cookLog) throw new Error("Recipe cooking log deletion not allowed");

    const images = await tx.run(
      zql.recipeImages
        .where("householdId", args.householdId)
        .where("recipeId", args.recipeId)
        .where("cookLogId", args.cookLogId),
    );
    for (const image of images) {
      await tx.mutate.recipeImages.update({ id: image.id, cookLogId: null });
    }
    await tx.mutate.recipeCookLogs.delete({ id: args.cookLogId });
  },
);

const reorderRecipeImages = defineHomeHubMutator(
  reorderRecipeImagesMutationSchema,
  async ({ args, ctx, tx }) => {
    await requireServerHouseholdModuleAccess({
      tx,
      householdId: args.householdId,
      userId: ctx.userId,
      moduleKey: "recipes",
    });

    const timestamp =
      tx.location === "server" ? Date.now() : args.optimisticUpdatedAt;
    for (const [position, imageId] of args.orderedImageIds.entries()) {
      const image = await tx.run(
        zql.recipeImages
          .where("id", imageId)
          .where("householdId", args.householdId)
          .where("recipeId", args.recipeId)
          .one(),
      );
      if (!image) throw new Error("Recipe image reorder not allowed");
      await tx.mutate.recipeImages.update({
        id: imageId,
        position,
        updatedAt: timestamp,
      });
    }
  },
);

export const mutators = defineHomeHubMutators({
  shopping: {
    add: addShoppingItem,
    rename: renameShoppingItem,
    setStatus: setShoppingItemStatus,
  },
  recipes: {
    create: createRecipe,
    update: updateRecipe,
    addIngredient: addRecipeIngredient,
    updateIngredient: updateRecipeIngredient,
    renameIngredient: renameRecipeIngredient,
    deleteIngredient: deleteRecipeIngredient,
    reorderIngredients: reorderRecipeIngredients,
    addCookLog: addRecipeCookLog,
    updateCookLog: updateRecipeCookLog,
    deleteCookLog: deleteRecipeCookLog,
    reorderImages: reorderRecipeImages,
  },
});
