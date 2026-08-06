import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZeroAuthContext } from "./context";
import { mutators } from "./mutators";
import type { Schema } from "./schema.gen";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const optimisticUpdatedAt = 1_786_000_000_000;

const setStatusArgs = {
  householdId,
  itemId,
  status: "crossed" as const,
  optimisticUpdatedAt,
};

const addArgs = {
  householdId,
  itemId,
  name: "Whole Milk",
  optimisticTimestamp: optimisticUpdatedAt,
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
  const insert = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);

  const transaction = {
    clientID: "client-id",
    location,
    mutate: {
      shoppingItems: { insert, update },
    },
    mutationID: 1,
    reason: location === "server" ? "authoritative" : "optimistic",
    run,
  } as unknown as Transaction<Schema>;

  return { insert, queries, transaction, update };
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

    await mutators.shopping.setStatus.fn({
      args: setStatusArgs,
      ctx,
      tx: transaction,
    });

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

    await mutators.shopping.setStatus.fn({
      args: setStatusArgs,
      ctx,
      tx: transaction,
    });

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
      mutators.shopping.setStatus.fn({
        args: setStatusArgs,
        ctx,
        tx: transaction,
      }),
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
      mutators.shopping.setStatus.fn({
        args: setStatusArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Shopping item status change not allowed");

    expect(update).not.toHaveBeenCalled();
  });
});

describe("shopping.add mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.shopping.add.mutatorName).toBe("shopping.add");
  });

  it("optimistically inserts a normalized active item", async () => {
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "client",
      results: [undefined],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(1);
    expect(insert).toHaveBeenCalledWith({
      id: itemId,
      householdId,
      name: "Whole Milk",
      normalizedName: "whole milk",
      status: "active",
      createdAt: optimisticUpdatedAt,
      updatedAt: optimisticUpdatedAt,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reactivates the existing canonical item instead of inserting the proposed ID", async () => {
    const existingItemId = "9c090146-f84a-4d11-9ca3-629ac70ffc15";
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        {
          id: existingItemId,
          householdId,
          name: "WHOLE MILK",
          normalizedName: "whole milk",
          status: "crossed",
        },
      ],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(1);
    expect(update).toHaveBeenCalledWith({
      id: existingItemId,
      status: "active",
      updatedAt: optimisticUpdatedAt,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a server mutation before looking up or writing an item when membership is missing", async () => {
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction }),
    ).rejects.toThrow("Shopping item addition not allowed");

    expect(queries).toHaveLength(1);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("authorizes membership and uses server time for a new item", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { insert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(2);
    expect(insert).toHaveBeenCalledWith({
      id: itemId,
      householdId,
      name: "Whole Milk",
      normalizedName: "whole milk",
      status: "active",
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});
