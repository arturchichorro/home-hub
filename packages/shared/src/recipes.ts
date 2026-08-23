import * as z from "zod";
import {
  cleanRecipeCookLogComment,
  cleanRecipeDescription,
  cleanRecipeIngredientAmount,
  cleanRecipeIngredientName,
  cleanRecipeIngredientNote,
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

export const updateRecipeMutationSchema = z
  .object({
    householdId: z.uuid(),
    recipeId: z.uuid(),
    title: recipeTitleSchema,
    description: recipeDescriptionSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type UpdateRecipeMutationInput = z.infer<
  typeof updateRecipeMutationSchema
>;

const recipeIngredientNameSchema = z
  .string()
  .transform(cleanRecipeIngredientName)
  .pipe(z.string().min(1).max(150));

const recipeIngredientAmountSchema = z
  .union([z.string(), z.null()])
  .transform((value) =>
    value === null ? null : cleanRecipeIngredientAmount(value),
  )
  .pipe(z.string().max(100).nullable());

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
    position: z.number().int().nonnegative(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type CreateRecipeIngredientMutationInput = z.infer<
  typeof createRecipeIngredientMutationSchema
>;

export const updateRecipeIngredientMutationSchema = z
  .object({
    ingredientId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    amount: recipeIngredientAmountSchema.optional(),
    note: recipeIngredientNoteSchema.optional(),
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => value.amount !== undefined || value.note !== undefined, {
    message: "An ingredient amount or note update is required",
  });

export type UpdateRecipeIngredientMutationInput = z.infer<
  typeof updateRecipeIngredientMutationSchema
>;

export const renameRecipeIngredientMutationSchema = z
  .object({
    ingredientId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    name: recipeIngredientNameSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const createRecipeCookLogMutationSchema = z
  .object({
    cookLogId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    cookedAt: z
      .number()
      .int()
      .nonnegative()
      .refine((value) => value <= Date.now(), {
        message: "Cooking date cannot be in the future",
      }),
    comment: recipeCookLogCommentSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type CreateRecipeCookLogMutationInput = z.infer<
  typeof createRecipeCookLogMutationSchema
>;

export const updateRecipeCookLogMutationSchema = z
  .object({
    cookLogId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
    comment: recipeCookLogCommentSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

const orderedIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Ordered IDs must be unique",
  });

export const deleteRecipeIngredientMutationSchema = z
  .object({
    ingredientId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
  })
  .strict();

export const reorderRecipeIngredientsMutationSchema = z
  .object({
    householdId: z.uuid(),
    recipeId: z.uuid(),
    orderedIngredientIds: orderedIdsSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const deleteRecipeCookLogMutationSchema = z
  .object({
    cookLogId: z.uuid(),
    householdId: z.uuid(),
    recipeId: z.uuid(),
  })
  .strict();

export const reorderRecipeImagesMutationSchema = z
  .object({
    householdId: z.uuid(),
    recipeId: z.uuid(),
    orderedImageIds: orderedIdsSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();
