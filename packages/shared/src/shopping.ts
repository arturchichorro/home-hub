import * as z from "zod";
import { cleanShoppingItemName } from "./normalization";

export const createShoppingItemRequestSchema = z
  .object({
    name: z
      .string()
      .transform(cleanShoppingItemName)
      .pipe(z.string().min(1).max(100)),
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
