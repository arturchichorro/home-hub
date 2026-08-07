import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZeroAuthContext } from "./context";
import { mutators } from "./mutators";
import type { Schema } from "./schema.gen";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const recipeId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const ingredientId = "5944cb0d-931a-4723-b981-77eacb122314";
const cookLogId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
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

const createRecipeArgs = {
  recipeId,
  householdId,
  title: "Tomato Soup",
  description: "A simple soup.",
  optimisticTimestamp: optimisticUpdatedAt,
};

const addRecipeIngredientArgs = {
  ingredientId,
  householdId,
  recipeId,
  name: "Fresh Basil",
  quantity: "1 1/2",
  unit: "cups",
  note: "Add after blending.",
  position: 0,
  optimisticTimestamp: optimisticUpdatedAt,
};

const addRecipeCookLogArgs = {
  cookLogId,
  householdId,
  recipeId,
  cookedAt: 1_785_999_000_000,
  comment: "Made it less spicy.",
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
  const recipeInsert = vi.fn(async () => undefined);
  const ingredientInsert = vi.fn(async () => undefined);
  const cookLogInsert = vi.fn(async () => undefined);

  const transaction = {
    clientID: "client-id",
    location,
    mutate: {
      recipeCookLogs: { insert: cookLogInsert },
      recipeIngredients: { insert: ingredientInsert },
      recipes: { insert: recipeInsert },
      shoppingItems: { insert, update },
    },
    mutationID: 1,
    reason: location === "server" ? "authoritative" : "optimistic",
    run,
  } as unknown as Transaction<Schema>;

  return {
    cookLogInsert,
    ingredientInsert,
    insert,
    queries,
    recipeInsert,
    transaction,
    update,
  };
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
    ).rejects.toThrow("Household mutation not allowed");

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
    ).rejects.toThrow("Household mutation not allowed");

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

describe("recipes.create mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.create.mutatorName).toBe("recipes.create");
  });

  it("optimistically inserts a recipe using the client timestamp", async () => {
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "client",
      results: [],
    });

    await mutators.recipes.create.fn({
      args: createRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(0);
    expect(recipeInsert).toHaveBeenCalledWith({
      id: recipeId,
      householdId,
      title: "Tomato Soup",
      description: "A simple soup.",
      createdAt: optimisticUpdatedAt,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a server mutation without household membership", async () => {
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.recipes.create.fn({
        args: createRecipeArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(recipeInsert).not.toHaveBeenCalled();
  });

  it("authorizes membership and uses the server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }],
    });

    await mutators.recipes.create.fn({
      args: createRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(1);
    expect(recipeInsert).toHaveBeenCalledWith({
      id: recipeId,
      householdId,
      title: "Tomato Soup",
      description: "A simple soup.",
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("recipes.addIngredient mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.addIngredient.mutatorName).toBe(
      "recipes.addIngredient",
    );
  });

  it("optimistically inserts an ingredient for a cached household recipe", async () => {
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: recipeId, householdId }],
    });

    await mutators.recipes.addIngredient.fn({
      args: addRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(1);
    expect(ingredientInsert).toHaveBeenCalledWith({
      id: ingredientId,
      householdId,
      recipeId,
      name: "Fresh Basil",
      quantity: "1 1/2",
      unit: "cups",
      note: "Add after blending.",
      position: 0,
      createdAt: optimisticUpdatedAt,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a server mutation before looking up the recipe when membership is missing", async () => {
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.recipes.addIngredient.fn({
        args: addRecipeIngredientArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(ingredientInsert).not.toHaveBeenCalled();
  });

  it("rejects a recipe outside the supplied household", async () => {
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await expect(
      mutators.recipes.addIngredient.fn({
        args: addRecipeIngredientArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe ingredient addition not allowed");

    expect(queries).toHaveLength(2);
    expect(ingredientInsert).not.toHaveBeenCalled();
  });

  it("authorizes the referenced recipe and uses the server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, { id: recipeId, householdId }],
    });

    await mutators.recipes.addIngredient.fn({
      args: addRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(2);
    expect(ingredientInsert).toHaveBeenCalledWith({
      id: ingredientId,
      householdId,
      recipeId,
      name: "Fresh Basil",
      quantity: "1 1/2",
      unit: "cups",
      note: "Add after blending.",
      position: 0,
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("recipes.addCookLog mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.addCookLog.mutatorName).toBe("recipes.addCookLog");
  });

  it("optimistically records cooking for a cached household recipe", async () => {
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: recipeId, householdId }],
    });

    await mutators.recipes.addCookLog.fn({
      args: addRecipeCookLogArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(1);
    expect(cookLogInsert).toHaveBeenCalledWith({
      id: cookLogId,
      householdId,
      recipeId,
      cookedAt: addRecipeCookLogArgs.cookedAt,
      comment: "Made it less spicy.",
      createdAt: optimisticUpdatedAt,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a server mutation before looking up the recipe when membership is missing", async () => {
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.recipes.addCookLog.fn({
        args: addRecipeCookLogArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(cookLogInsert).not.toHaveBeenCalled();
  });

  it("rejects a recipe outside the supplied household", async () => {
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await expect(
      mutators.recipes.addCookLog.fn({
        args: addRecipeCookLogArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe cooking log addition not allowed");

    expect(queries).toHaveLength(2);
    expect(cookLogInsert).not.toHaveBeenCalled();
  });

  it("uses server metadata time without replacing when cooking happened", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, { id: recipeId, householdId }],
    });

    await mutators.recipes.addCookLog.fn({
      args: addRecipeCookLogArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(2);
    expect(cookLogInsert).toHaveBeenCalledWith({
      id: cookLogId,
      householdId,
      recipeId,
      cookedAt: addRecipeCookLogArgs.cookedAt,
      comment: "Made it less spicy.",
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});
