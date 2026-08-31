import * as z from "zod";
import { cleanListItemName, cleanListName } from "./normalization";

export const listNameSchema = z
  .string()
  .transform(cleanListName)
  .pipe(z.string().min(1).max(100));
export const listItemNameSchema = z
  .string()
  .transform(cleanListItemName)
  .pipe(z.string().min(1).max(100));
export const listItemStatusSchema = z.enum(["active", "crossed", "archived"]);
export const listNameAlreadyExistsError = "List name already exists";
export const listItemNameAlreadyExistsError = "List item name already exists";

const timestamp = z.number().int().nonnegative();
const scope = { householdId: z.uuid(), listId: z.uuid() };
const itemScope = { ...scope, itemId: z.uuid() };
const orderedIds = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Ordered IDs must be unique",
  });

export const listDetailArgsSchema = z.object(scope).strict();
export const createListMutationSchema = z
  .object({
    ...scope,
    name: listNameSchema,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const renameListMutationSchema = z
  .object({
    ...scope,
    name: listNameSchema,
    optimisticUpdatedAt: timestamp,
  })
  .strict();
export const deleteListMutationSchema = z.object(scope).strict();
export const reorderListsMutationSchema = z
  .object({
    ...scope,
    orderedListIds: orderedIds,
    optimisticUpdatedAt: timestamp,
  })
  .strict()
  .refine((args) => args.orderedListIds.includes(args.listId), {
    message: "Ordered IDs must contain the moved list",
    path: ["orderedListIds"],
  });
export const addListItemMutationSchema = z
  .object({
    ...itemScope,
    name: listItemNameSchema,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const renameListItemMutationSchema = z
  .object({
    ...itemScope,
    name: listItemNameSchema,
    optimisticUpdatedAt: timestamp,
  })
  .strict();
export const setListItemStatusMutationSchema = z
  .object({
    ...itemScope,
    status: listItemStatusSchema,
    optimisticUpdatedAt: timestamp,
  })
  .strict();
export const reorderListItemsMutationSchema = z
  .object({
    ...itemScope,
    status: listItemStatusSchema,
    orderedItemIds: orderedIds,
    optimisticUpdatedAt: timestamp,
  })
  .strict()
  .refine((args) => args.orderedItemIds.includes(args.itemId), {
    message: "Ordered IDs must contain the moved item",
    path: ["orderedItemIds"],
  });

export type CreateListMutationInput = z.infer<typeof createListMutationSchema>;
export type RenameListMutationInput = z.infer<typeof renameListMutationSchema>;
export type DeleteListMutationInput = z.infer<typeof deleteListMutationSchema>;
export type ReorderListsMutationInput = z.infer<
  typeof reorderListsMutationSchema
>;
export type AddListItemMutationInput = z.infer<
  typeof addListItemMutationSchema
>;
export type RenameListItemMutationInput = z.infer<
  typeof renameListItemMutationSchema
>;
export type SetListItemStatusMutationInput = z.infer<
  typeof setListItemStatusMutationSchema
>;
export type ReorderListItemsMutationInput = z.infer<
  typeof reorderListItemsMutationSchema
>;
