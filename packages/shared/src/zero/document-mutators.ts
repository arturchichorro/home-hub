import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  documentDeleteTagSchema,
  documentScopeSchema,
  documentTagAssignmentSchema,
  documentTagSchema,
  documentTextMutationSchema,
  normalizeDocumentTag,
} from "../documents";
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
    moduleKey: "documents",
  });

async function row(
  tx: Tx,
  ctx: ZeroAuthContext,
  args: { householdId: string; documentId: string },
) {
  await access(tx, ctx, args.householdId);

  const get = () =>
    tx.run(
      zql.documents
        .where("householdId", args.householdId)
        .where("id", args.documentId)
        .where("deletedAt", "IS", null)
        .one(),
    );

  if (!(await get())) {
    throw Error("Document unavailable");
  }

  // Acquire the same row lock as file confirmation; then recheck deletion.
  if (tx.location === "server") {
    await tx.mutate.documents.update({
      id: args.documentId,
      updatedAt: Date.now(),
    });

    if (!(await get())) {
      throw Error("Document unavailable");
    }
  }
}

async function tag(tx: Tx, args: { householdId: string; tagId: string }) {
  const t = await tx.run(
    zql.documentTags
      .where("householdId", args.householdId)
      .where("id", args.tagId)
      .where("deletedAt", "IS", null)
      .one(),
  );

  if (!t) {
    throw Error("Tag unavailable");
  }

  return t;
}

export const documentMutators = {
  update: define(documentTextMutationSchema, async ({ tx, ctx, args }) => {
    await row(tx, ctx, args);
    await tx.mutate.documents.update({
      id: args.documentId,
      [args.field]:
        args.value.trim() || (args.field === "description" ? null : ""),
      updatedAt:
        tx.location === "server" ? Date.now() : args.optimisticTimestamp,
    });
  }),

  delete: define(documentScopeSchema, async ({ tx, ctx, args }) => {
    await row(tx, ctx, args);
    await tx.mutate.documents.update({
      id: args.documentId,
      deletedAt: Date.now(),
    });
  }),

  saveTag: define(documentTagSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);

    const existing = await tx.run(
      zql.documentTags.where("id", args.tagId).one(),
    );

    if (
      existing &&
      (existing.householdId !== args.householdId || existing.deletedAt !== null)
    ) {
      throw Error("Tag unavailable");
    }

    const normalizedName = normalizeDocumentTag(args.name);
    const duplicate = await tx.run(
      zql.documentTags
        .where("householdId", args.householdId)
        .where("normalizedName", normalizedName)
        .where("deletedAt", "IS", null)
        .one(),
    );

    if (duplicate && duplicate.id !== args.tagId) {
      throw Error("Tag name already exists");
    }

    const now =
      tx.location === "server" ? Date.now() : args.optimisticTimestamp;
    const values = {
      name: args.name.trim().replace(/\s+/gu, " "),
      normalizedName,
      color: args.color,
      updatedAt: now,
    };

    if (existing) {
      await tx.mutate.documentTags.update({ id: args.tagId, ...values });
    } else {
      await tx.mutate.documentTags.insert({
        id: args.tagId,
        householdId: args.householdId,
        ...values,
        createdAt: now,
        deletedAt: null,
      });
    }
  }),

  deleteTag: define(documentDeleteTagSchema, async ({ tx, ctx, args }) => {
    await access(tx, ctx, args.householdId);
    await tag(tx, args);
    // Keep assignment identity; active-tag filters unlink it from every document.
    await tx.mutate.documentTags.update({
      id: args.tagId,
      deletedAt:
        tx.location === "server" ? Date.now() : args.optimisticTimestamp,
    });
  }),

  assignTag: define(documentTagAssignmentSchema, async ({ tx, ctx, args }) => {
    await row(tx, ctx, args);
    await tag(tx, args);

    if (args.assigned) {
      await tx.mutate.documentTagAssignments.upsert({
        householdId: args.householdId,
        documentId: args.documentId,
        tagId: args.tagId,
      });
    } else {
      await tx.mutate.documentTagAssignments.delete({
        documentId: args.documentId,
        tagId: args.tagId,
      });
    }
  }),
};
