import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZeroAuthContext } from "./context";
import { legacyShoppingMutators } from "./legacy-shopping-mutators";
import { mutators as activeMutators } from "./mutators";

const mutators = { ...activeMutators, ...legacyShoppingMutators };

import type { Schema } from "./schema.gen";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const recipeId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const ingredientId = "5944cb0d-931a-4723-b981-77eacb122314";
const cookLogId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
const imageId = "b5b8a5ea-89cb-4c31-a93d-33049ab11c73";
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

const renameArgs = {
  householdId,
  itemId,
  name: "Oat Milk",
  optimisticUpdatedAt,
};

const createRecipeArgs = {
  recipeId,
  householdId,
  title: "Tomato Soup",
  description: "A simple soup.",
  optimisticTimestamp: optimisticUpdatedAt,
};

const updateRecipeArgs = {
  householdId,
  recipeId,
  title: "Roasted Tomato Soup",
  description: "Even better the next day.",
  optimisticUpdatedAt,
};

const addRecipeIngredientArgs = {
  ingredientId,
  householdId,
  recipeId,
  name: "Fresh Basil",
  position: 0,
  optimisticTimestamp: optimisticUpdatedAt,
};

const updateRecipeIngredientArgs = {
  ingredientId,
  householdId,
  recipeId,
  amount: "1 1/2 cups",
  note: "Add after blending.",
  optimisticUpdatedAt,
};

const renameRecipeIngredientArgs = {
  ingredientId,
  householdId,
  recipeId,
  name: "Thai Basil",
  optimisticUpdatedAt,
};

const addRecipeCookLogArgs = {
  cookLogId,
  householdId,
  recipeId,
  cookedAt: 1_785_999_000_000,
  comment: "Made it less spicy.",
  optimisticTimestamp: optimisticUpdatedAt,
};

const updateRecipeCookLogArgs = {
  cookLogId,
  householdId,
  recipeId,
  comment: "Even better the next day.",
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
  const insert = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const recipeInsert = vi.fn(async () => undefined);
  const recipeUpdate = vi.fn(async () => undefined);
  const ingredientInsert = vi.fn(async () => undefined);
  const ingredientUpdate = vi.fn(async () => undefined);
  const ingredientDelete = vi.fn(async () => undefined);
  const cookLogInsert = vi.fn(async () => undefined);
  const cookLogUpdate = vi.fn(async () => undefined);
  const cookLogDelete = vi.fn(async () => undefined);
  const imageUpdate = vi.fn(async () => undefined);

  const transaction = {
    clientID: "client-id",
    location,
    mutate: {
      recipeCookLogs: {
        delete: cookLogDelete,
        insert: cookLogInsert,
        update: cookLogUpdate,
      },
      recipeImages: { update: imageUpdate },
      recipeIngredients: {
        delete: ingredientDelete,
        insert: ingredientInsert,
        update: ingredientUpdate,
      },
      recipes: { insert: recipeInsert, update: recipeUpdate },
      shoppingItems: { insert, update },
    },
    mutationID: 1,
    reason: location === "server" ? "authoritative" : "optimistic",
    run,
  } as unknown as Transaction<Schema>;

  return {
    cookLogInsert,
    cookLogUpdate,
    cookLogDelete,
    imageUpdate,
    ingredientDelete,
    ingredientInsert,
    ingredientUpdate,
    insert,
    queries,
    recipeInsert,
    recipeUpdate,
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
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        { id: itemId, householdId },
      ],
    });

    await mutators.shopping.setStatus.fn({
      args: setStatusArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(3);
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
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an item outside the supplied household", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        undefined,
      ],
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

  it("applies later authoritative status updates after earlier ones", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_786_000_001_000)
      .mockReturnValueOnce(1_786_000_002_000);
    const { queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        { id: itemId, householdId },
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        { id: itemId, householdId },
      ],
    });

    await mutators.shopping.setStatus.fn({
      args: setStatusArgs,
      ctx,
      tx: transaction,
    });
    await mutators.shopping.setStatus.fn({
      args: { ...setStatusArgs, status: "active" },
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(6);
    expect(update).toHaveBeenNthCalledWith(1, {
      id: itemId,
      status: "crossed",
      updatedAt: 1_786_000_001_000,
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      id: itemId,
      status: "active",
      updatedAt: 1_786_000_002_000,
    });
  });
});

describe("recipes.update mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.update.mutatorName).toBe("recipes.update");
  });

  it("optimistically updates a cached household recipe", async () => {
    const { queries, recipeUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: recipeId, householdId }],
    });

    await mutators.recipes.update.fn({
      args: updateRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(1);
    expect(recipeUpdate).toHaveBeenCalledWith({
      id: recipeId,
      title: "Roasted Tomato Soup",
      description: "Even better the next day.",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a server mutation before looking up the recipe when membership is missing", async () => {
    const { queries, recipeUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.recipes.update.fn({
        args: updateRecipeArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(recipeUpdate).not.toHaveBeenCalled();
  });

  it("rejects a recipe outside the supplied household", async () => {
    const { queries, recipeUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.update.fn({
        args: updateRecipeArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe update not allowed");

    expect(queries).toHaveLength(3);
    expect(recipeUpdate).not.toHaveBeenCalled();
  });

  it("authorizes the recipe and uses the server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { queries, recipeUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        { id: recipeId, householdId },
      ],
    });

    await mutators.recipes.update.fn({
      args: updateRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(3);
    expect(recipeUpdate).toHaveBeenCalledWith({
      id: recipeId,
      title: "Roasted Tomato Soup",
      description: "Even better the next day.",
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("shopping.add mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.shopping.add.mutatorName).toBe("shopping.add");
  });

  it("optimistically inserts a normalized active item", async () => {
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "client",
      results: [undefined, undefined],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(2);
    expect(insert).toHaveBeenCalledWith({
      id: itemId,
      householdId,
      name: "Whole Milk",
      normalizedName: "whole milk",
      status: "active",
      sortKey: 1024,
      createdAt: optimisticUpdatedAt,
      updatedAt: optimisticUpdatedAt,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reactivates an existing item and moves it above active items", async () => {
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
        { id: "top-active", sortKey: 4096 },
      ],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(2);
    expect(update).toHaveBeenCalledWith({
      id: existingItemId,
      status: "active",
      sortKey: 5120,
      updatedAt: optimisticUpdatedAt,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps an existing top active item in place", async () => {
    const existingItemId = "9c090146-f84a-4d11-9ca3-629ac70ffc15";
    const { transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        {
          id: existingItemId,
          householdId,
          name: "WHOLE MILK",
          normalizedName: "whole milk",
          status: "active",
          sortKey: 4096,
        },
        { id: existingItemId, sortKey: 4096 },
      ],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: existingItemId, sortKey: 4096 }),
    );
  });

  it("rejects a server mutation before looking up or writing an item when membership is missing", async () => {
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction }),
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a server mutation when the shopping module is not enabled", async () => {
    const { insert, queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await expect(
      mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction }),
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(2);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("authorizes membership and uses server time for a new item", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { insert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        undefined,
        undefined,
      ],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(queries).toHaveLength(4);
    expect(insert).toHaveBeenCalledWith({
      id: itemId,
      householdId,
      name: "Whole Milk",
      normalizedName: "whole milk",
      status: "active",
      sortKey: 1024,
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });

  it("places a new item above the current active item", async () => {
    const { insert, transaction } = createFakeTransaction({
      location: "client",
      results: [undefined, { id: "existing", sortKey: 4096 }],
    });

    await mutators.shopping.add.fn({ args: addArgs, ctx, tx: transaction });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ sortKey: 5120 }),
    );
  });
});

describe("shopping.reorder mutator", () => {
  const secondItemId = "9c090146-f84a-4d11-9ca3-629ac70ffc15";
  const thirdItemId = "f9dc3f8c-7ed8-4836-a877-7881bb1d6dd6";
  const reorderArgs = {
    householdId,
    itemId,
    orderedItemIds: [secondItemId, itemId, thirdItemId],
    status: "active" as const,
    optimisticUpdatedAt,
  };

  it("is registered with a stable name", () => {
    expect(mutators.shopping.reorder.mutatorName).toBe("shopping.reorder");
  });

  it("updates only the moved item when a gap is available", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        { id: itemId, householdId, status: "active", sortKey: 0 },
        { id: secondItemId, householdId, status: "active", sortKey: 3072 },
        { id: thirdItemId, householdId, status: "active", sortKey: 1024 },
      ],
    });

    await mutators.shopping.reorder.fn({
      args: reorderArgs,
      ctx,
      tx: transaction,
    });

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      sortKey: 2048,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rebalances the status group when adjacent keys have no gap", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        { id: itemId, householdId, status: "active", sortKey: 0 },
        { id: secondItemId, householdId, status: "active", sortKey: 2048 },
        { id: thirdItemId, householdId, status: "active", sortKey: 2047 },
        { id: secondItemId, householdId, status: "active", sortKey: 2048 },
        { id: thirdItemId, householdId, status: "active", sortKey: 2047 },
      ],
    });

    await mutators.shopping.reorder.fn({
      args: reorderArgs,
      ctx,
      tx: transaction,
    });

    expect(update).toHaveBeenNthCalledWith(1, {
      id: secondItemId,
      sortKey: 3072,
      updatedAt: optimisticUpdatedAt,
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      id: itemId,
      sortKey: 2048,
      updatedAt: optimisticUpdatedAt,
    });
    expect(update).toHaveBeenNthCalledWith(3, {
      id: thirdItemId,
      sortKey: 1024,
      updatedAt: optimisticUpdatedAt,
    });
  });
});

describe("shopping.rename mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.shopping.rename.mutatorName).toBe("shopping.rename");
  });

  it("optimistically updates the display and normalized names", async () => {
    const { queries, transaction, update } = createFakeTransaction({
      location: "client",
      results: [{ id: itemId, householdId, name: "Milk" }, undefined],
    });

    await mutators.shopping.rename.fn({
      args: renameArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(2);
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      name: "Oat Milk",
      normalizedName: "oat milk",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("allows display-name changes that keep the same normalized name", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        { id: itemId, householdId, name: "OAT MILK" },
        { id: itemId, householdId, normalizedName: "oat milk" },
      ],
    });

    await mutators.shopping.rename.fn({
      args: renameArgs,
      ctx,
      tx: transaction,
    });

    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects a name already used by another household item", async () => {
    const otherItemId = "9c090146-f84a-4d11-9ca3-629ac70ffc15";
    const { transaction, update } = createFakeTransaction({
      location: "client",
      results: [
        { id: itemId, householdId, name: "Milk" },
        { id: otherItemId, householdId, normalizedName: "oat milk" },
      ],
    });

    await expect(
      mutators.shopping.rename.fn({
        args: renameArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Shopping item name already exists");

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an item outside the supplied household", async () => {
    const { transaction, update } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.shopping.rename.fn({
        args: renameArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Shopping item rename not allowed");

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a server rename before item lookup when membership is missing", async () => {
    const { queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [undefined],
    });

    await expect(
      mutators.shopping.rename.fn({
        args: renameArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("authorizes server access and uses the authoritative timestamp", async () => {
    const authoritativeUpdatedAt = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeUpdatedAt);
    const { queries, transaction, update } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "shopping", enabled: true },
        { id: itemId, householdId, name: "Milk" },
        undefined,
      ],
    });

    await mutators.shopping.rename.fn({
      args: renameArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(4);
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      name: "Oat Milk",
      normalizedName: "oat milk",
      updatedAt: authoritativeUpdatedAt,
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
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(recipeInsert).not.toHaveBeenCalled();
  });

  it("rejects a server mutation when the recipes module is not enabled", async () => {
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "server",
      results: [{ id: "membership-id" }, undefined],
    });

    await expect(
      mutators.recipes.create.fn({
        args: createRecipeArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(2);
    expect(recipeInsert).not.toHaveBeenCalled();
  });

  it("authorizes membership and uses the server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
      ],
    });

    await mutators.recipes.create.fn({
      args: createRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(2);
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
      amount: null,
      note: null,
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
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(ingredientInsert).not.toHaveBeenCalled();
  });

  it("rejects a recipe outside the supplied household", async () => {
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.addIngredient.fn({
        args: addRecipeIngredientArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe ingredient addition not allowed");

    expect(queries).toHaveLength(3);
    expect(ingredientInsert).not.toHaveBeenCalled();
  });

  it("authorizes the referenced recipe and uses the server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { ingredientInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        { id: recipeId, householdId },
      ],
    });

    await mutators.recipes.addIngredient.fn({
      args: addRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(3);
    expect(ingredientInsert).toHaveBeenCalledWith({
      id: ingredientId,
      householdId,
      recipeId,
      name: "Fresh Basil",
      amount: null,
      note: null,
      position: 0,
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("recipes.updateIngredient mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.updateIngredient.mutatorName).toBe(
      "recipes.updateIngredient",
    );
  });

  it("optimistically updates amount and note for a scoped ingredient", async () => {
    const { ingredientUpdate, queries, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: ingredientId, householdId, recipeId }],
    });

    await mutators.recipes.updateIngredient.fn({
      args: updateRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(1);
    expect(ingredientUpdate).toHaveBeenCalledWith({
      id: ingredientId,
      amount: "1 1/2 cups",
      note: "Add after blending.",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it.each([
    ["amount", { amount: null }],
    ["note", { note: null }],
  ] as const)("clears only the supplied %s", async (_field, patch) => {
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: ingredientId, householdId, recipeId }],
    });

    await mutators.recipes.updateIngredient.fn({
      args: {
        ingredientId,
        householdId,
        recipeId,
        ...patch,
        optimisticUpdatedAt,
      },
      ctx,
      tx: transaction,
    });

    expect(ingredientUpdate).toHaveBeenCalledWith({
      id: ingredientId,
      ...patch,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects an ingredient outside the supplied recipe", async () => {
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.updateIngredient.fn({
        args: updateRecipeIngredientArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe ingredient update not allowed");
    expect(ingredientUpdate).not.toHaveBeenCalled();
  });

  it("uses the authoritative server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        { id: ingredientId, householdId, recipeId },
      ],
    });

    await mutators.recipes.updateIngredient.fn({
      args: updateRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(ingredientUpdate).toHaveBeenCalledWith({
      id: ingredientId,
      amount: "1 1/2 cups",
      note: "Add after blending.",
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("recipes.renameIngredient mutator", () => {
  it("optimistically renames only the scoped ingredient", async () => {
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: ingredientId, householdId, recipeId }],
    });

    await mutators.recipes.renameIngredient.fn({
      args: renameRecipeIngredientArgs,
      ctx,
      tx: transaction,
    });

    expect(ingredientUpdate).toHaveBeenCalledWith({
      id: ingredientId,
      name: "Thai Basil",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects an ingredient outside the supplied recipe", async () => {
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.renameIngredient.fn({
        args: renameRecipeIngredientArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe ingredient rename not allowed");
    expect(ingredientUpdate).not.toHaveBeenCalled();
  });
});

describe("recipes.addCookLog mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.addCookLog.mutatorName).toBe("recipes.addCookLog");
  });

  it("rejects a cooking date in the future", async () => {
    vi.spyOn(Date, "now").mockReturnValue(optimisticUpdatedAt);
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "client",
      results: [],
    });

    await expect(
      mutators.recipes.addCookLog.fn({
        args: {
          ...addRecipeCookLogArgs,
          cookedAt: optimisticUpdatedAt + 1,
        },
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Cooking date cannot be in the future");

    expect(queries).toHaveLength(0);
    expect(cookLogInsert).not.toHaveBeenCalled();
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
    ).rejects.toThrow("Household module mutation not allowed");

    expect(queries).toHaveLength(1);
    expect(cookLogInsert).not.toHaveBeenCalled();
  });

  it("rejects a recipe outside the supplied household", async () => {
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.addCookLog.fn({
        args: addRecipeCookLogArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe cooking log addition not allowed");

    expect(queries).toHaveLength(3);
    expect(cookLogInsert).not.toHaveBeenCalled();
  });

  it("uses server metadata time without replacing when cooking happened", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { cookLogInsert, queries, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        { id: recipeId, householdId },
      ],
    });

    await mutators.recipes.addCookLog.fn({
      args: addRecipeCookLogArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(3);
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

describe("recipes.updateCookLog mutator", () => {
  it("optimistically updates only the scoped cooking log comment", async () => {
    const { cookLogUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: cookLogId, householdId, recipeId }],
    });

    await mutators.recipes.updateCookLog.fn({
      args: updateRecipeCookLogArgs,
      ctx,
      tx: transaction,
    });

    expect(cookLogUpdate).toHaveBeenCalledWith({
      id: cookLogId,
      comment: "Even better the next day.",
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a cooking log outside the supplied recipe", async () => {
    const { cookLogUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.updateCookLog.fn({
        args: updateRecipeCookLogArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe cooking log update not allowed");
    expect(cookLogUpdate).not.toHaveBeenCalled();
  });
});

describe("recipe organization mutators", () => {
  it("optimistically deletes only a scoped ingredient", async () => {
    const { ingredientDelete, transaction } = createFakeTransaction({
      location: "client",
      results: [{ id: ingredientId, householdId, recipeId }],
    });

    await mutators.recipes.deleteIngredient.fn({
      args: { householdId, recipeId, ingredientId },
      ctx,
      tx: transaction,
    });

    expect(ingredientDelete).toHaveBeenCalledWith({ id: ingredientId });
  });

  it("rejects ingredient deletion outside the recipe", async () => {
    const { ingredientDelete, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.deleteIngredient.fn({
        args: { householdId, recipeId, ingredientId },
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe ingredient deletion not allowed");
    expect(ingredientDelete).not.toHaveBeenCalled();
  });

  it("optimistically reorders scoped ingredients", async () => {
    const secondIngredientId = "4a7bb0d3-e2d9-4907-98b8-9865473785b0";
    const { ingredientUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [
        { id: secondIngredientId, householdId, recipeId },
        { id: ingredientId, householdId, recipeId },
      ],
    });

    await mutators.recipes.reorderIngredients.fn({
      args: {
        householdId,
        recipeId,
        orderedIngredientIds: [secondIngredientId, ingredientId],
        optimisticUpdatedAt,
      },
      ctx,
      tx: transaction,
    });

    expect(ingredientUpdate).toHaveBeenNthCalledWith(1, {
      id: secondIngredientId,
      position: 0,
      updatedAt: optimisticUpdatedAt,
    });
    expect(ingredientUpdate).toHaveBeenNthCalledWith(2, {
      id: ingredientId,
      position: 1,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("preserves cooking-log pictures before optimistically deleting the log", async () => {
    const { cookLogDelete, imageUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [
        { id: cookLogId, householdId, recipeId },
        [{ id: imageId, cookLogId }],
      ],
    });

    await mutators.recipes.deleteCookLog.fn({
      args: { householdId, recipeId, cookLogId },
      ctx,
      tx: transaction,
    });

    expect(imageUpdate).toHaveBeenCalledWith({ id: imageId, cookLogId: null });
    expect(cookLogDelete).toHaveBeenCalledWith({ id: cookLogId });
  });

  it("optimistically reorders scoped images", async () => {
    const secondImageId = "aed36f2e-cdf5-434a-85dc-35e3f3d783cc";
    const { imageUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [
        { id: secondImageId, householdId, recipeId },
        { id: imageId, householdId, recipeId },
      ],
    });

    await mutators.recipes.reorderImages.fn({
      args: {
        householdId,
        recipeId,
        orderedImageIds: [secondImageId, imageId],
        optimisticUpdatedAt,
      },
      ctx,
      tx: transaction,
    });

    expect(imageUpdate).toHaveBeenNthCalledWith(1, {
      id: secondImageId,
      position: 0,
      updatedAt: optimisticUpdatedAt,
    });
    expect(imageUpdate).toHaveBeenNthCalledWith(2, {
      id: imageId,
      position: 1,
      updatedAt: optimisticUpdatedAt,
    });
  });
});
