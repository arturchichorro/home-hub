import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  addListItemMutationSchema,
  createListMutationSchema,
  deleteListMutationSchema,
  listItemNameAlreadyExistsError,
  listNameAlreadyExistsError,
  renameListItemMutationSchema,
  renameListMutationSchema,
  reorderListItemsMutationSchema,
  reorderListsMutationSchema,
  setListItemStatusMutationSchema,
} from "../lists";
import { normalizeListItemName, normalizeListName } from "../normalization";
import type { ZeroAuthContext } from "./context";
import { nextListSortKey, planListReorder } from "./list-ordering";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
type Tx = Transaction<Schema>;
type Scope = { householdId: string; listId: string };
const timestamp = (tx: Tx, optimistic: number) =>
  tx.location === "server" ? Date.now() : optimistic;
const scopedLists = (householdId: string) =>
  zql.lists.where("householdId", householdId);
const scopedItems = (scope: Scope) =>
  zql.listItems
    .where("householdId", scope.householdId)
    .where("listId", scope.listId);

async function requireAccess(
  tx: Tx,
  ctx: ZeroAuthContext,
  householdId: string,
) {
  await requireServerHouseholdModuleAccess({
    tx,
    userId: ctx.userId,
    householdId,
    moduleKey: "lists",
  });
}

async function requireList(tx: Tx, ctx: ZeroAuthContext, scope: Scope) {
  await requireAccess(tx, ctx, scope.householdId);
  const list = await tx.run(
    scopedLists(scope.householdId).where("id", scope.listId).one(),
  );
  if (!list) throw new Error("List mutation not allowed");
  return list;
}

async function requireItem(
  tx: Tx,
  ctx: ZeroAuthContext,
  scope: Scope & { itemId: string },
) {
  await requireList(tx, ctx, scope);
  const item = await tx.run(scopedItems(scope).where("id", scope.itemId).one());
  if (!item) throw new Error("List item mutation not allowed");
  return item;
}

// Lists is the sole live writer after the Shopping UI/API cutover.
export const listMutatorDefinitions = {
  create: defineMutator(createListMutationSchema, async ({ tx, ctx, args }) => {
    await requireAccess(tx, ctx, args.householdId);
    const normalizedName = normalizeListName(args.name);
    const duplicate = await tx.run(
      scopedLists(args.householdId)
        .where("normalizedName", normalizedName)
        .one(),
    );
    if (duplicate) throw new Error(listNameAlreadyExistsError);
    const top = await tx.run(
      scopedLists(args.householdId)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.lists.insert({
      id: args.listId,
      householdId: args.householdId,
      name: args.name,
      normalizedName,
      sortKey: nextListSortKey(top?.sortKey),
      createdAt: now,
      updatedAt: now,
    });
  }),
  rename: defineMutator(renameListMutationSchema, async ({ tx, ctx, args }) => {
    await requireList(tx, ctx, args);
    const normalizedName = normalizeListName(args.name);
    const duplicate = await tx.run(
      scopedLists(args.householdId)
        .where("normalizedName", normalizedName)
        .one(),
    );
    if (duplicate && duplicate.id !== args.listId)
      throw new Error(listNameAlreadyExistsError);
    await tx.mutate.lists.update({
      id: args.listId,
      name: args.name,
      normalizedName,
      updatedAt: timestamp(tx, args.optimisticUpdatedAt),
    });
  }),
  delete: defineMutator(deleteListMutationSchema, async ({ tx, ctx, args }) => {
    await requireList(tx, ctx, args);
    // Explicit child deletes also update the optimistic cache; PostgreSQL's FK
    // cascade alone would only remove children on the server.
    const items = await tx.run(scopedItems(args));
    for (const item of items) await tx.mutate.listItems.delete({ id: item.id });
    await tx.mutate.lists.delete({ id: args.listId });
  }),
  reorder: defineMutator(
    reorderListsMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireAccess(tx, ctx, args.householdId);
      const rows = await tx.run(scopedLists(args.householdId));
      const updates = planListReorder(rows, args.orderedListIds, args.listId);
      const updatedAt = timestamp(tx, args.optimisticUpdatedAt);
      for (const update of updates)
        await tx.mutate.lists.update({ ...update, updatedAt });
    },
  ),
  addItem: defineMutator(
    addListItemMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireList(tx, ctx, args);
      const normalizedName = normalizeListItemName(args.name);
      const existing = await tx.run(
        scopedItems(args).where("normalizedName", normalizedName).one(),
      );
      const top = await tx.run(
        scopedItems(args)
          .where("status", "active")
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc")
          .one(),
      );
      const sortKey =
        top && existing?.id === top.id
          ? top.sortKey
          : nextListSortKey(top?.sortKey);
      const now = timestamp(tx, args.optimisticTimestamp);
      if (existing) {
        await tx.mutate.listItems.update({
          id: existing.id,
          status: "active",
          sortKey,
          updatedAt: now,
        });
      } else {
        await tx.mutate.listItems.insert({
          id: args.itemId,
          householdId: args.householdId,
          listId: args.listId,
          name: args.name,
          normalizedName,
          status: "active",
          sortKey,
          createdAt: now,
          updatedAt: now,
        });
      }
    },
  ),
  renameItem: defineMutator(
    renameListItemMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireItem(tx, ctx, args);
      const normalizedName = normalizeListItemName(args.name);
      const duplicate = await tx.run(
        scopedItems(args).where("normalizedName", normalizedName).one(),
      );
      if (duplicate && duplicate.id !== args.itemId)
        throw new Error(listItemNameAlreadyExistsError);
      await tx.mutate.listItems.update({
        id: args.itemId,
        name: args.name,
        normalizedName,
        updatedAt: timestamp(tx, args.optimisticUpdatedAt),
      });
    },
  ),
  setItemStatus: defineMutator(
    setListItemStatusMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireItem(tx, ctx, args);
      await tx.mutate.listItems.update({
        id: args.itemId,
        status: args.status,
        updatedAt: timestamp(tx, args.optimisticUpdatedAt),
      });
    },
  ),
  reorderItems: defineMutator(
    reorderListItemsMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireList(tx, ctx, args);
      const rows = await tx.run(scopedItems(args).where("status", args.status));
      const updates = planListReorder(rows, args.orderedItemIds, args.itemId);
      const updatedAt = timestamp(tx, args.optimisticUpdatedAt);
      for (const update of updates)
        await tx.mutate.listItems.update({ ...update, updatedAt });
    },
  ),
};
