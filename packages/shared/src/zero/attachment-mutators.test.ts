import type { Transaction } from "@rocicorp/zero";
import { expect, it, vi } from "vitest";
import { attachmentMutators } from "./attachment-mutators";
import type { Schema } from "./schema.gen";

const id = "10000000-0000-4000-8000-000000000001";
const base = {
  householdId: id,
  parentId: id,
  attachmentId: id,
  optimisticTimestamp: 10,
};
const ctx = { userId: id };

function fixture(results: unknown[]) {
  const update = vi.fn(async () => undefined);
  const tx = {
    location: "client",
    run: vi.fn(async () => results.shift()),
    mutate: Object.fromEntries(
      [
        "recipeMedia",
        "calendarMedia",
        "listMedia",
        "exerciseMedia",
        "contactMedia",
      ].map((name) => [name, { update }]),
    ),
  } as unknown as Transaction<Schema>;
  return { tx, update };
}

it.each([
  "recipe",
  "calendar",
  "moodboard",
  "exercise",
  "contact-profile",
] as const)(
  "optimistically unlinks %s metadata without touching stored media",
  async (kind) => {
    const { tx, update } = fixture([{ id }]);
    await attachmentMutators.remove.fn({ tx, ctx, args: { ...base, kind } });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id, deletedAt: 10, updatedAt: 10 }),
    );
  },
);

it("keeps a contact entry's final picture visible until the server rejects/authorizes the action", async () => {
  const { tx, update } = fixture([{ id, published: true }, { note: "" }, []]);
  await attachmentMutators.remove.fn({
    tx,
    ctx,
    args: { ...base, kind: "contact-entry" },
  });
  expect(update).not.toHaveBeenCalled();
});

it("optimistically removes a picture when entry text remains", async () => {
  const { tx, update } = fixture([
    { id, published: true },
    { note: "Caption" },
    [],
  ]);
  await attachmentMutators.remove.fn({
    tx,
    ctx,
    args: { ...base, kind: "contact-entry" },
  });
  expect(update).toHaveBeenCalledWith({
    id,
    deletedAt: 10,
    updatedAt: 10,
    published: false,
  });
});

it("leaves an uncached or already removed attachment alone during client replay", async () => {
  const { tx, update } = fixture([undefined]);
  await attachmentMutators.remove.fn({
    tx,
    ctx,
    args: { ...base, kind: "recipe" },
  });
  expect(update).not.toHaveBeenCalled();
});
