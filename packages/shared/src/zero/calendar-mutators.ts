import {
  ApplicationError,
  defineMutatorWithType,
  type Transaction,
} from "@rocicorp/zero";
import {
  calendarCreateSchema,
  calendarDatesSchema,
  calendarItemIncludesDay,
  calendarPersonSchema,
  calendarReorderSchema,
  calendarScopeSchema,
  calendarUpdateSchema,
} from "../calendar";
import { calendarHabitSchema } from "../calendar-habits";
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
    .where("day", "<=", day)
    .where(({ and, or, cmp }) =>
      or(
        cmp("endDay", ">=", day),
        and(cmp("endDay", "IS", null), cmp("day", ">=", day)),
      ),
    )
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
  habit: define(calendarHabitSchema, async ({ tx, ctx, args }) => {
    const row = await item(tx, ctx, args);
    const key = { itemId: args.itemId, userId: ctx.userId };
    const previous = await tx.run(
      zql.calendarHabitAttachments
        .where("householdId", args.householdId)
        .where("itemId", args.itemId)
        .where("userId", ctx.userId)
        .one(),
    );
    if (previous?.habitId === args.habitId) {
      return;
    }
    if (previous && !args.confirmArchived) {
      const enabled = await tx.run(
        zql.householdModuleSettings
          .where("householdId", args.householdId)
          .where("moduleKey", "habits")
          .where("enabled", true)
          .one(),
      );
      const oldHabit = await tx.run(
        zql.habits
          .where("householdId", args.householdId)
          .where("id", previous.habitId)
          .one(),
      );
      // With Habits disabled use the same response for every target, so cleanup
      // cannot be used to probe a disabled habit's archive status.
      if (!enabled || oldHabit?.status === "archived") {
        throw new ApplicationError(
          "Confirm removal of this habit attachment.",
          { details: { kind: "confirm_removal" } },
        );
      }
    }
    if (args.habitId === null) {
      await tx.mutate.calendarHabitAttachments.delete(key);
      return;
    }
    await requireServerHouseholdModuleAccess({
      tx,
      userId: ctx.userId,
      householdId: args.householdId,
      moduleKey: "habits",
    });
    if (row.endDay && row.endDay !== row.day) {
      throw Error("Only single-day items can have habit attachments.");
    }
    const habit = await tx.run(
      zql.habits
        .where("householdId", args.householdId)
        .where("id", args.habitId)
        .where("status", "active")
        .one(),
    );
    if (!habit) {
      throw Error("Habit unavailable");
    }
    await tx.mutate.calendarHabitAttachments.upsert({
      ...key,
      householdId: args.householdId,
      habitId: args.habitId,
      timeZone: args.timeZone,
    });
  }),
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
      endDay: args.endDay,
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
    // Validate against the locked current record, including partial/stale clients.
    const dates = calendarDatesSchema.parse({ ...row, ...args.changes });
    if (
      dates.endDay &&
      dates.endDay !== dates.day &&
      (await tx.run(
        zql.calendarHabitAttachments
          .where("householdId", args.householdId)
          .where("itemId", row.id)
          .one(),
      ))
    ) {
      throw new ApplicationError(
        "Remove habit attachments before making this item multi-day.",
        { details: { kind: "habit_attachments" } },
      );
    }
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
    const links = await tx.run(
      zql.calendarHabitAttachments
        .where("householdId", args.householdId)
        .where("itemId", args.itemId),
    );
    for (const link of links) {
      await tx.mutate.calendarHabitAttachments.delete({
        itemId: link.itemId,
        userId: link.userId,
      });
    }
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
    if (!calendarItemIncludesDay(moved, args.day)) {
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
