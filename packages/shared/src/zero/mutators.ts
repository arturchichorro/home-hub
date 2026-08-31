import { defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero";
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
import type { ZeroAuthContext } from "./context";
import { listMutatorDefinitions } from "./list-mutators";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineHomeHubMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
const defineHomeHubMutators = defineMutatorsWithType<Schema>();
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

    const update: {
      id: string;
      amount?: string | null;
      note?: string | null;
      updatedAt: number;
    } = {
      id: args.ingredientId,
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticUpdatedAt,
    };
    if (args.amount !== undefined) update.amount = args.amount;
    if (args.note !== undefined) update.note = args.note;

    await tx.mutate.recipeIngredients.update(update);
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

    if (args.cookedAt > Date.now()) {
      throw new Error("Recipe cooking log date cannot be in the future");
    }

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
  lists: listMutatorDefinitions,
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
