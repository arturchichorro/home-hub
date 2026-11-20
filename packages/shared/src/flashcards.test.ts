import { describe, expect, it } from "vitest";
import {
  createFlashcardSchema,
  flashcardChanges,
  flashcardFieldsSchema,
  practiceSnapshot,
  reorderFlashcardsSchema,
  updateFlashcardSchema,
} from "./flashcards";
import { createListMutationSchema } from "./lists";

const base = {
  householdId: crypto.randomUUID(),
  listId: crypto.randomUUID(),
  cardId: crypto.randomUUID(),
  optimisticTimestamp: 1,
};
const fields = { front: "  Ｂonjour\n monde  ", back: "Hello\n\tworld " };

describe("flashcard contracts", () => {
  it("preserves Unicode, whitespace and multiline text exactly", () => {
    expect(flashcardFieldsSchema.parse(fields)).toEqual(fields);
    expect(createFlashcardSchema.parse({ ...base, ...fields })).toEqual({
      ...base,
      ...fields,
    });
  });
  it.each(["", " \n\t", "\u00a0\u2003\ufeff", "a".repeat(10001)])(
    "rejects blank or oversized side %j",
    (front) => {
      expect(
        flashcardFieldsSchema.safeParse({ ...fields, front }).success,
      ).toBe(false);
      expect(
        flashcardFieldsSchema.safeParse({ ...fields, back: front }).success,
      ).toBe(false);
    },
  );
  it("accepts the third Lists type and rejects extra state or cross-scope supplied fields", () => {
    expect(
      createListMutationSchema.safeParse({
        householdId: base.householdId,
        listId: base.listId,
        name: "French",
        kind: "flashcards",
        optimisticTimestamp: 1,
      }).success,
    ).toBe(true);
    expect(
      createFlashcardSchema.safeParse({ ...base, ...fields, score: 1 }).success,
    ).toBe(false);
    expect(
      createFlashcardSchema.safeParse({ ...base, ...fields, sortKey: 1 })
        .success,
    ).toBe(false);
  });
  it("patches fields independently and rejects empty/invalid patches", () => {
    expect(flashcardChanges({ ...fields, back: "Changed" }, fields)).toEqual({
      back: "Changed",
    });
    expect(
      updateFlashcardSchema.safeParse({ ...base, changes: { front: "" } })
        .success,
    ).toBe(false);
    expect(
      updateFlashcardSchema.safeParse({ ...base, changes: {} }).success,
    ).toBe(false);
    expect(
      updateFlashcardSchema.safeParse({ ...base, changes: { back: "Changed" } })
        .success,
    ).toBe(true);
  });
  it("requires a unique in-scope order containing the moved card", () => {
    for (const orderedIds of [[], [base.listId], [base.cardId, base.cardId]]) {
      expect(
        reorderFlashcardsSchema.safeParse({ ...base, orderedIds }).success,
      ).toBe(false);
    }
    expect(
      reorderFlashcardsSchema.safeParse({ ...base, orderedIds: [base.cardId] })
        .success,
    ).toBe(true);
  });
  it("copies only practice text/identity and never mutates the shared rows", () => {
    const rows = [
      { id: "a", ...fields, sortKey: 5 },
      { id: "b", front: "Two", back: "Answer" },
    ];
    const snapshot = practiceSnapshot(rows, false);
    expect(snapshot).toEqual([
      { id: "a", ...fields },
      { id: "b", front: "Two", back: "Answer" },
    ]);
    const first = rows[0];
    if (!first) {
      throw Error("Missing fixture");
    }
    first.front = "Edited remotely";
    expect(snapshot[0]?.front).toBe(fields.front);
    expect(snapshot[0]).not.toHaveProperty("sortKey");
  });
  it("shuffles a copy without losing or duplicating cards", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      front: String(index),
      back: "Answer",
    }));
    const snapshot = practiceSnapshot(rows, true, () => 0);
    expect(snapshot.map((row) => row.id)).not.toEqual(
      rows.map((row) => row.id),
    );
    expect(snapshot.map((row) => row.id).sort()).toEqual(
      rows.map((row) => row.id).sort(),
    );
    expect(rows.map((row) => row.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });
});
