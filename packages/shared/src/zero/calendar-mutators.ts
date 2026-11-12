import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  calendarCreateSchema,
  calendarPersonSchema,
  calendarReorderSchema,
  calendarScopeSchema,
  calendarUpdateSchema,
} from "../calendar";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { appendSortKey, planReorder } from "./ordering";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
type Tx = Transaction<Schema>;
const access = (tx: Tx, ctx: ZeroAuthContext, householdId: string) =>
  requireServerHouseholdModuleAccess({
    tx,
    userId: ctx.userId,
    householdId,
    moduleKey: "calendar",
  });
const now = (tx: Tx, stamp: number) =>
  tx.location === "server" ? Date.now() : stamp;
const scope = (householdId: string, day: string) =>
  zql.calendarItems
    .where("householdId", householdId)
    .where("day", day)
    .where("deletedAt", "IS", null);

async function item(
  tx: Tx,
  ctx: ZeroAuthContext,
  args: { householdId: string; itemId: string },
) {
  await access(tx, ctx, args.householdId);
  const get = () =>
    tx.run(
      zql.calendarItems
        .where("householdId", args.householdId)
        .where("id", args.itemId)
        .where("deletedAt", "IS", null)
        .one(),
    );
  if (!(await get())) {
    throw Error("Calendar item unavailable");
  }
  // Serialize edits against deletion/moves, then re-read the authoritative row.
  if (tx.location === "server") {
    await tx.mutate.calendarItems.update({
      id: args.itemId,
      updatedAt: Date.now(),
    });
  }
  const row = await get();
  if (!row) {
    throw Error("Calendar item unavailable");
  }
  return row;
}

async function bottom(tx: Tx, householdId: string, day: string) {
  const row = await tx.run(
    scope(householdId, day)
      .orderBy("sortKey", "asc")
      .orderBy("id", "asc")
      .one(),
  );
  return appendSortKey(row?.sortKey);
}

export const calendarMutators = {
  create: define(calendarCreateSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);
    // Never reuse an existing ID, including a deletion tombstone.
    if (await tx.run(zql.calendarItems.where("id", args.itemId).one())) {
      throw Error("Calendar item already exists");
    }
    const stamp = now(tx, args.optimisticTimestamp);
    await tx.mutate.calendarItems.insert({
      id: args.itemId,
      householdId: args.householdId,
      day: args.day,
      title: args.title,
      note: args.note,
      sortKey: await bottom(tx, args.householdId, args.day),
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    });
  }),
  update: define(calendarUpdateSchema, async ({ tx, ctx, args }) => {
    const row = await item(tx, ctx, args);
    const moved =
      args.changes.day !== undefined && args.changes.day !== row.day;
    await tx.mutate.calendarItems.update({
      id: row.id,
      ...args.changes,
      ...(moved
        ? {
            sortKey: await bottom(
              tx,
              args.householdId,
              args.changes.day ?? row.day,
            ),
          }
        : {}),
      updatedAt: now(tx, args.optimisticTimestamp),
    });
  }),
  delete: define(calendarScopeSchema, async ({ tx, ctx, args }) => {
    await item(tx, ctx, args);
    await tx.mutate.calendarItems.update({
      id: args.itemId,
      deletedAt: now(tx, args.optimisticTimestamp),
    });
  }),
  person: define(calendarPersonSchema, async ({ tx, ctx, args }) => {
    await item(tx, ctx, args);
    if (
      !(await tx.run(
        zql.householdMembers
          .where("householdId", args.householdId)
          .where("userId", args.userId)
          .one(),
      ))
    ) {
      throw Error("Household member unavailable");
    }
    const key = { itemId: args.itemId, userId: args.userId };
    if (args.selected) {
      await tx.mutate.calendarPeople.upsert({
        ...key,
        householdId: args.householdId,
      });
    } else {
      await tx.mutate.calendarPeople.delete(key);
    }
  }),
  reorder: define(calendarReorderSchema, async ({ tx, ctx, args }) => {
    const moved = await item(tx, ctx, args);
    if (moved.day !== args.day) {
      throw Error("Calendar item moved");
    }
    const rows = await tx.run(
      scope(args.householdId, args.day)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc"),
    );
    for (const update of planReorder(rows, args.orderedIds, args.itemId)) {
      await tx.mutate.calendarItems.update(update);
    }
  }),
};
