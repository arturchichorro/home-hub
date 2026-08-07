import * as z from "zod";
import {
  cleanRecipeCookLogComment,
  cleanRecipeDescription,
  cleanRecipeIngredientName,
  cleanRecipeIngredientNote,
  cleanRecipeIngredientQuantity,
  cleanRecipeIngredientUnit,
  cleanRecipeTitle,
} from "./normalization";

const recipeTitleSchema = z
  .string()
  .transform(cleanRecipeTitle)
  .pipe(z.string().min(1).max(150));

const recipeDescriptionSchema = z
  .union([z.string(), z.null()])
  .transform((value) => (value === null ? null : cleanRecipeDescription(value)))
  .pipe(z.string().max(5_000).nullable());

export const createRecipeMutationSchema = z
  .object({
    recipeId: z.uuid(),
    householdId: z.uuid(),
    title: recipeTitleSchema,
    description: recipeDescriptionSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type CreateRecipeMutationInput = z.infer<
  typeof createRecipeMutationSchema
>;

const recipeIngredientNameSchema = z
  .string()
  .transform(cleanRecipeIngredientName)
  .pipe(z.string().min(1).max(150));

const recipeIngredientQuantitySchema = z
  .union([z.string(), z.null()])
  .transform((value) =>
    value === null ? null : cleanRecipeIngredientQuantity(value),
  )
  .pipe(z.string().max(50).nullable());

const recipeIngredientUnitSchema = z
  .union([z.string(), z.null()])
  .transform((value) =>
    value === null ? null : cleanRecipeIngredientUnit(value),
  )
  .pipe(z.string().max(50).nullable());

const recipeIngredientNoteSchema = z
  .union([z.string(), z.null()])
  .transform((value) =>
    value === null ? null : cleanRecipeIngredientNote(value),
  )
  .pipe(z.string().max(500).nullable());

const recipeCookLogCommentSchema = z
  .union([z.string(), z.null()])
  .transform((value) =>
    value === null ? null : cleanRecipeCookLogComment(value),
  )
  .pipe(z.string().max(1_000).nullable());

export const createRecipeIngredientMutationSchema = z
  .object({
    ingredientId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    name: recipeIngredientNameSchema,
    quantity: recipeIngredientQuantitySchema,
    unit: recipeIngredientUnitSchema,
    note: recipeIngredientNoteSchema,
    position: z.number().int().nonnegative(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type CreateRecipeIngredientMutationInput = z.infer<
  typeof createRecipeIngredientMutationSchema
>;

export const createRecipeCookLogMutationSchema = z
  .object({
    cookLogId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    cookedAt: z.number().int().nonnegative(),
    comment: recipeCookLogCommentSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type CreateRecipeCookLogMutationInput = z.infer<
  typeof createRecipeCookLogMutationSchema
>;
