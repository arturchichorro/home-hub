import type { Transaction } from "@rocicorp/zero";
import { expect, it, vi } from "vitest";
import { contactMutators } from "./contact-mutators";
import type { Schema } from "./schema.gen";

const householdId = "10000000-0000-4000-8000-000000000001";
const contactId = "10000000-0000-4000-8000-000000000002";
const entryId = "10000000-0000-4000-8000-000000000003";
const writeId = "10000000-0000-4000-8000-000000000004";
const ctx = { userId: contactId };
const fields = { name: "Alice", archived: false, details: [] };
const args = {
  householdId,
  contactId,
  writeId,
  fields,
  expectedVersion: null,
  optimisticTimestamp: 10,
};

function fixture(results: unknown[], location = "client") {
  const insert = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const tx = {
    location,
    run: vi.fn(async () => results.shift()),
    mutate: Object.fromEntries(
      ["contacts", "contactEntries", "contactEntryPeople"].map((table) => [
        table,
        { insert, update, delete: remove },
      ]),
    ),
  } as unknown as Transaction<Schema>;
  return { tx, insert, update, remove };
}

it("creates an optimistic profile immediately with deterministic replay timestamps", async () => {
  const f = fixture([undefined]);
  await contactMutators.profile.fn({ tx: f.tx, ctx, args });
  expect(f.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      id: contactId,
      name: "Alice",
      version: 1,
      createdAt: 10,
      updatedAt: 10,
    }),
  );
});

it("leaves stale local revisions untouched and lets the server decide the queued mutation", async () => {
  const f = fixture([{ id: contactId, householdId, version: 3 }]);
  await expect(
    contactMutators.profile.fn({
      tx: f.tx,
      ctx,
      args: { ...args, expectedVersion: 1 },
    }),
  ).resolves.toBeUndefined();
  expect(f.update).not.toHaveBeenCalled();
  expect(f.insert).not.toHaveBeenCalled();
});

it("creates image-first staging and links optimistically without publishing an empty history entry", async () => {
  const f = fixture([
    undefined,
    [],
    { id: contactId, householdId, archived: false },
    [],
  ]);
  await contactMutators.entry.fn({
    tx: f.tx,
    ctx,
    args: {
      householdId,
      entryId,
      writeId,
      expectedVersion: null,
      optimisticTimestamp: 10,
      timeZone: "UTC",
      action: "prepare-photo",
      fields: { entryOn: "2026-01-01", note: "", contactIds: [contactId] },
    },
  });
  expect(f.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      id: entryId,
      published: false,
      createdBy: contactId,
      version: 1,
    }),
  );
  expect(f.insert).toHaveBeenCalledWith({ householdId, entryId, contactId });
});

it("cannot accidentally execute an optimistic implementation on the server", async () => {
  const f = fixture([], "server");
  await expect(
    contactMutators.profile.fn({ tx: f.tx, ctx, args }),
  ).rejects.toThrow("server transaction implementation");
  expect(f.insert).not.toHaveBeenCalled();
});
