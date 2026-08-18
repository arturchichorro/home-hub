import * as z from "zod";
import { cleanShoppingItemName } from "./normalization";

const shoppingItemNameSchema = z
  .string()
  .transform(cleanShoppingItemName)
  .pipe(z.string().min(1).max(100));

export const createShoppingItemRequestSchema = z
  .object({
    name: shoppingItemNameSchema,
  })
  .strict();

export type CreateShoppingItemRequest = z.infer<
  typeof createShoppingItemRequestSchema
>;

export const shoppingItemStatusSchema = z.enum([
  "active",
  "crossed",
  "archived",
]);

export const setShoppingItemStatusRequestSchema = z
  .object({
    status: shoppingItemStatusSchema,
  })
  .strict();

export type SetShoppingItemStatusRequest = z.infer<
  typeof setShoppingItemStatusRequestSchema
>;

export const setShoppingItemStatusMutationSchema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    status: shoppingItemStatusSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type SetShoppingItemStatusMutationInput = z.infer<
  typeof setShoppingItemStatusMutationSchema
>;

export const addShoppingItemMutationSchema = z
  .object({
    itemId: z.uuid(),
    householdId: z.uuid(),
    name: shoppingItemNameSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();

export type AddShoppingItemMutationInput = z.infer<
  typeof addShoppingItemMutationSchema
>;

export const renameShoppingItemMutationSchema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    name: shoppingItemNameSchema,
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict();

export type RenameShoppingItemMutationInput = z.infer<
  typeof renameShoppingItemMutationSchema
>;
