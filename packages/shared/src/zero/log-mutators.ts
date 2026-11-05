import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  logCategorySchema,
  logCreateSchema,
  logDeleteCategorySchema,
  logRenameSchema,
  logScopeSchema,
  logSetCategorySchema,
  normalizedLogTitle,
} from "../logs";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();

type Tx = Transaction<Schema>;

const access = (tx: Tx, ctx: ZeroAuthContext, householdId: string) =>
  requireServerHouseholdModuleAccess({
    tx,
    userId: ctx.userId,
    householdId,
    moduleKey: "logs",
  });

async function parent(
  tx: Tx,
  ctx: ZeroAuthContext,
  args: { householdId: string; logId: string },
) {
  await access(tx, ctx, args.householdId);

  const get = () =>
    tx.run(
      zql.logs
        .where("householdId", args.householdId)
        .where("id", args.logId)
        .where("deletedAt", "IS", null)
        .one(),
    );

  if (!(await get())) {
    throw Error("Log unavailable");
  }

  if (tx.location === "server") {
    await tx.mutate.logs.update({ id: args.logId, updatedAt: Date.now() });

    if (!(await get())) {
      throw Error("Log unavailable");
    }
  }
}

const timestamp = (tx: Tx, n: number) =>
  tx.location === "server" ? Date.now() : n;

export const logMutators = {
  create: define(logCreateSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);

    const normalizedTitle = normalizedLogTitle(args.title);

    if (
      await tx.run(
        zql.logs
          .where("householdId", args.householdId)
          .where("normalizedTitle", normalizedTitle)
          .where("deletedAt", "IS", null)
          .one(),
      )
    ) {
      throw Error("Log title already exists");
    }

    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.logs.insert({
      id: args.logId,
      householdId: args.householdId,
      title: args.title,
      normalizedTitle,
      categoryId: null,
      lastEntryOn: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }),

  rename: define(logRenameSchema, async ({ tx, ctx, args }) => {
    await parent(tx, ctx, args);

    const normalizedTitle = normalizedLogTitle(args.title);
    const other = await tx.run(
      zql.logs
        .where("householdId", args.householdId)
        .where("normalizedTitle", normalizedTitle)
        .where("deletedAt", "IS", null)
        .one(),
    );

    if (other && other.id !== args.logId) {
      throw Error("Log title already exists");
    }

    await tx.mutate.logs.update({
      id: args.logId,
      title: args.title,
      normalizedTitle,
      updatedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),

  delete: define(logScopeSchema, async ({ tx, ctx, args }) => {
    await parent(tx, ctx, args);
    await tx.mutate.logs.update({ id: args.logId, deletedAt: Date.now() });
  }),

  setCategory: define(logSetCategorySchema, async ({ tx, ctx, args }) => {
    await parent(tx, ctx, args);

    if (
      args.categoryId &&
      !(await tx.run(
        zql.logCategories
          .where("id", args.categoryId)
          .where("householdId", args.householdId)
          .where("deletedAt", "IS", null)
          .one(),
      ))
    ) {
      throw Error("Category unavailable");
    }

    await tx.mutate.logs.update({
      id: args.logId,
      categoryId: args.categoryId,
      updatedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),

  saveCategory: define(logCategorySchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);

    const old = await tx.run(
      zql.logCategories.where("id", args.categoryId).one(),
    );

    if (
      old &&
      (old.householdId !== args.householdId || old.deletedAt !== null)
    ) {
      throw Error("Category unavailable");
    }

    const normalizedName = normalizedLogTitle(args.name);
    const duplicate = await tx.run(
      zql.logCategories
        .where("householdId", args.householdId)
        .where("normalizedName", normalizedName)
        .where("deletedAt", "IS", null)
        .one(),
    );

    if (duplicate && duplicate.id !== args.categoryId) {
      throw Error("Category name already exists");
    }

    const now = timestamp(tx, args.optimisticTimestamp);
    const values = {
      name: args.name,
      normalizedName,
      color: args.color,
      updatedAt: now,
    };

    if (old) {
      await tx.mutate.logCategories.update({ id: args.categoryId, ...values });
    } else {
      await tx.mutate.logCategories.insert({
        id: args.categoryId,
        householdId: args.householdId,
        ...values,
        createdAt: now,
        deletedAt: null,
      });
    }
  }),

  deleteCategory: define(logDeleteCategorySchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);

    const old = await tx.run(
      zql.logCategories
        .where("id", args.categoryId)
        .where("householdId", args.householdId)
        .where("deletedAt", "IS", null)
        .one(),
    );

    if (!old) {
      throw Error("Category unavailable");
    }

    await tx.mutate.logCategories.update({
      id: args.categoryId,
      deletedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),
};
