import type { Transaction } from "@rocicorp/zero";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZeroAuthContext } from "./context";
import { mutators } from "./mutators";

import type { Schema } from "./schema.gen";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const ingredientId = "5944cb0d-931a-4723-b981-77eacb122314";
const cookLogId = "e467b00a-5f80-4c13-aa5b-d2e59996dd82";
const imageId = "b5b8a5ea-89cb-4c31-a93d-33049ab11c73";
const optimisticUpdatedAt = 1_786_000_000_000;

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

const deleteRecipeArgs = {
  householdId,
  recipeId,
  optimisticDeletedAt: optimisticUpdatedAt,
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
  const recipeInsert = vi.fn(async () => undefined);
  const recipeUpdate = vi.fn(async () => undefined);
  const ingredientInsert = vi.fn(async () => undefined);
  const ingredientUpdate = vi.fn(async () => undefined);
  const ingredientDelete = vi.fn(async () => undefined);
  const cookLogInsert = vi.fn(async () => undefined);
  const cookLogUpdate = vi.fn(async () => undefined);
  const cookLogDelete = vi.fn(async () => undefined);
  const imageUpdate = vi.fn(async () => undefined);
  const householdMemberUpdate = vi.fn(async () => undefined);

  const transaction = {
    clientID: "client-id",
    location,
    mutate: {
      householdMembers: { update: householdMemberUpdate },
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
    householdMemberUpdate,
    ingredientDelete,
    ingredientInsert,
    ingredientUpdate,
    queries,
    recipeInsert,
    recipeUpdate,
    transaction,
  };
}

describe("householdMemberships.reorder mutator", () => {
  it("updates only the current user's moved membership", async () => {
    const { householdMemberUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [
        [
          {
            id: ingredientId,
            householdId,
            userId,
            sortKey: 2048,
          },
          {
            id: cookLogId,
            householdId: recipeId,
            userId,
            sortKey: 1024,
          },
        ],
      ],
    });

    await mutators.householdMemberships.reorder.fn({
      args: {
        householdId,
        orderedHouseholdIds: [recipeId, householdId],
        optimisticUpdatedAt,
      },
      ctx,
      tx: transaction,
    });

    expect(householdMemberUpdate).toHaveBeenCalledOnce();
    expect(householdMemberUpdate).toHaveBeenCalledWith({
      id: ingredientId,
      sortKey: 0,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects a household outside the current user's memberships", async () => {
    const { householdMemberUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [[{ id: ingredientId, householdId, userId, sortKey: 1024 }]],
    });

    await expect(
      mutators.householdMemberships.reorder.fn({
        args: {
          householdId,
          orderedHouseholdIds: [householdId, recipeId],
          optimisticUpdatedAt,
        },
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Reorder not allowed");
    expect(householdMemberUpdate).not.toHaveBeenCalled();
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

describe("recipes.create mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.create.mutatorName).toBe("recipes.create");
  });

  it("optimistically inserts a recipe using the client timestamp", async () => {
    const { queries, recipeInsert, transaction } = createFakeTransaction({
      location: "client",
      results: [undefined],
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
      sortKey: 1024,
      deletedAt: null,
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
        undefined,
      ],
    });

    await mutators.recipes.create.fn({
      args: createRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(queries).toHaveLength(3);
    expect(recipeInsert).toHaveBeenCalledWith({
      id: recipeId,
      householdId,
      title: "Tomato Soup",
      description: "A simple soup.",
      sortKey: 1024,
      deletedAt: null,
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
    });
  });
});

describe("recipes.reorder mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.reorder.mutatorName).toBe("recipes.reorder");
  });

  it("optimistically moves a recipe without rewriting every row", async () => {
    const { recipeUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [
        [
          { id: recipeId, sortKey: 2048 },
          { id: imageId, sortKey: 1024 },
        ],
      ],
    });

    await mutators.recipes.reorder.fn({
      args: {
        householdId,
        recipeId,
        orderedRecipeIds: [imageId, recipeId],
        optimisticUpdatedAt,
      },
      ctx,
      tx: transaction,
    });

    expect(recipeUpdate).toHaveBeenCalledOnce();
    expect(recipeUpdate).toHaveBeenCalledWith({
      id: recipeId,
      sortKey: 0,
      updatedAt: optimisticUpdatedAt,
    });
  });

  it("rejects an out-of-household recipe ID", async () => {
    const { recipeUpdate, transaction } = createFakeTransaction({
      location: "client",
      results: [[{ id: recipeId, sortKey: 1024 }]],
    });

    await expect(
      mutators.recipes.reorder.fn({
        args: {
          householdId,
          recipeId,
          orderedRecipeIds: [recipeId, imageId],
          optimisticUpdatedAt,
        },
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Reorder not allowed");
    expect(recipeUpdate).not.toHaveBeenCalled();
  });
});

describe("recipes.delete mutator", () => {
  it("is registered with a stable name", () => {
    expect(mutators.recipes.delete.mutatorName).toBe("recipes.delete");
  });

  it("optimistically soft-deletes a cached recipe", async () => {
    const { ingredientDelete, cookLogDelete, recipeUpdate, transaction } =
      createFakeTransaction({
        location: "client",
        results: [{ id: recipeId, householdId }],
      });

    await mutators.recipes.delete.fn({
      args: deleteRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(recipeUpdate).toHaveBeenCalledWith({
      id: recipeId,
      deletedAt: optimisticUpdatedAt,
    });
    expect(ingredientDelete).not.toHaveBeenCalled();
    expect(cookLogDelete).not.toHaveBeenCalled();
  });

  it("uses the authoritative server timestamp", async () => {
    const authoritativeTimestamp = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeTimestamp);
    const { recipeUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        { id: recipeId, householdId },
      ],
    });

    await mutators.recipes.delete.fn({
      args: deleteRecipeArgs,
      ctx,
      tx: transaction,
    });

    expect(recipeUpdate).toHaveBeenCalledWith({
      id: recipeId,
      deletedAt: authoritativeTimestamp,
    });
  });

  it("rejects an unavailable recipe", async () => {
    const { recipeUpdate, transaction } = createFakeTransaction({
      location: "server",
      results: [
        { id: "membership-id" },
        { householdId, moduleKey: "recipes", enabled: true },
        undefined,
      ],
    });

    await expect(
      mutators.recipes.delete.fn({
        args: deleteRecipeArgs,
        ctx,
        tx: transaction,
      }),
    ).rejects.toThrow("Recipe deletion not allowed");
    expect(recipeUpdate).not.toHaveBeenCalled();
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
