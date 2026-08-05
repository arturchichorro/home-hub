import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZeroAuthContext } from "./context";
import { mutators } from "./mutators";
import type { Schema } from "./schema.gen";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const optimisticUpdatedAt = 1_786_000_000_000;

const args = {
  householdId,
  itemId,
  status: "crossed" as const,
  optimisticUpdatedAt,
};

const ctx: ZeroAuthContext = { userId };

afterEach(() => {
  vi.restoreAllMocks();
});

function createFakeTransaction({
  location,
  results,
}: {
  location: "client" | "server";
  results: unknown[];
}) {
  const queries: unknown[] = [];
  const pendingResults = [...results];
  const run = vi.fn(async (query: unknown) => {
    queries.push(query);
    return pendingResults.shift();
  });
  const update = vi.fn(async () => undefined);

  const transaction = {
    clientID: "client-id",
    location,
    mutate: {
      shoppingItems: { update },
    },
    mutationID: 1,
    reason: location === "server" ? "authoritative" : "optimistic",
    run,
  } as unknown as Transaction<Schema>;

  return { queries, transaction, update };
}

describe("shopping.setStatus mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.shopping.setStatus.mutatorName).toBe("shopping.setStatus");
  });

  it("optimistically updates a cached item using the client timestamp", async () => {
    const { queries, transaction, update } = createFakeTransaction({
      location: "client",
      results: [{ id: itemId, householdId }],
    });

    await mutators.shopping.setStatus.fn({ args, ctx, tx: transaction });

    expect(queries).toHaveLength(1);
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      status: "crossed",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("authorizes membership and uses the server timestamp", async () => {
    const authoritativeUpdatedAt = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeUpdatedAt);
    const { queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, { id: itemId, householdId }],
    });

    await mutators.shopping.setStatus.fn({ args, ctx, tx: transaction });

    expect(queries).toHaveLength(2);
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      status: "crossed",
      updatedAt: authoritativeUpdatedAt,
    });
  });

  it("rejects a server mutation before looking up the item when membership is missing", async () => {
    const { queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.shopping.setStatus.fn({ args, ctx, tx: transaction }),
    ).rejects.toThrow("Shopping item status change not allowed");

    expect(queries).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an item outside the supplied household", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await expect(
      mutators.shopping.setStatus.fn({ args, ctx, tx: transaction }),
    ).rejects.toThrow("Shopping item status change not allowed");

    expect(update).not.toHaveBeenCalled();
  });
});
