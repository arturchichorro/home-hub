import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  createFlashcardSchema,
  flashcardFieldsSchema,
  flashcardScopeSchema,
  reorderFlashcardsSchema,
  updateFlashcardSchema,
} from "../flashcards";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { nextSortKey, planReorder } from "./ordering";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
type Tx = Transaction<Schema>;
type Scope = { householdId: string; listId: string };

const cards = (scope: Scope) =>
  zql.listFlashcards
    .where("householdId", scope.householdId)
    .where("listId", scope.listId)
    .where("deletedAt", "IS", null);
const timestamp = (tx: Tx, optimistic: number) =>
  tx.location === "server" ? Date.now() : optimistic;

async function deck(tx: Tx, ctx: ZeroAuthContext, scope: Scope) {
  const authorize = () =>
    requireServerHouseholdModuleAccess({
      tx,
      userId: ctx.userId,
      householdId: scope.householdId,
      moduleKey: "lists",
    });
  await authorize();
  const find = () =>
    tx.run(
      zql.lists
        .where("id", scope.listId)
        .where("householdId", scope.householdId)
        .where("deletedAt", "IS", null)
        .where("kind", "flashcards")
        .one(),
    );

  if (!(await find())) {
    throw Error("Flashcard deck unavailable");
  }

  // Lock the common parent before allocating order or touching children.
  // Re-read after waiting so concurrent deck deletion cannot leave a live write.
  if (tx.location === "server") {
    await tx.mutate.lists.update({ id: scope.listId, updatedAt: Date.now() });
    await authorize();
  }

  if (!(await find())) {
    throw Error("Flashcard deck unavailable");
  }
}

async function card(tx: Tx, scope: Scope & { cardId: string }) {
  const row = await tx.run(cards(scope).where("id", scope.cardId).one());

  if (!row) {
    throw Error("Flashcard unavailable");
  }

  return row;
}

export const flashcardMutators = {
  createFlashcard: define(createFlashcardSchema, async ({ tx, ctx, args }) => {
    await deck(tx, ctx, args);

    if (await tx.run(zql.listFlashcards.where("id", args.cardId).one())) {
      throw Error("Flashcard ID already used");
    }

    const top = await tx.run(
      cards(args).orderBy("sortKey", "desc").orderBy("id", "asc").one(),
    );
    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.listFlashcards.insert({
      id: args.cardId,
      householdId: args.householdId,
      listId: args.listId,
      front: args.front,
      back: args.back,
      sortKey: nextSortKey(top?.sortKey),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }),
  updateFlashcard: define(updateFlashcardSchema, async ({ tx, ctx, args }) => {
    await deck(tx, ctx, args);
    const row = await card(tx, args);
    flashcardFieldsSchema.parse({
      front: args.changes.front ?? row.front,
      back: args.changes.back ?? row.back,
    });
    await tx.mutate.listFlashcards.update({
      id: row.id,
      ...args.changes,
      updatedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),
  deleteFlashcard: define(flashcardScopeSchema, async ({ tx, ctx, args }) => {
    await deck(tx, ctx, args);
    const row = await card(tx, args);
    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.listFlashcards.update({
      id: row.id,
      deletedAt: now,
      updatedAt: now,
    });
  }),
  reorderFlashcards: define(
    reorderFlashcardsSchema,
    async ({ tx, ctx, args }) => {
      await deck(tx, ctx, args);
      await card(tx, args);
      const rows = await tx.run(cards(args));

      for (const update of planReorder(rows, args.orderedIds, args.cardId)) {
        await tx.mutate.listFlashcards.update({
          ...update,
          updatedAt: timestamp(tx, args.optimisticTimestamp),
        });
      }
    },
  ),
};
