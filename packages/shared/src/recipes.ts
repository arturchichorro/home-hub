import * as z from "zod";
import { cleanRecipeDescription, cleanRecipeTitle } from "./normalization";

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
