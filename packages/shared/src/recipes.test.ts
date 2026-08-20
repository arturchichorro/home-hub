import { describe, expect, it } from "vitest";

import {
  createRecipeCookLogMutationSchema,
  createRecipeIngredientMutationSchema,
  createRecipeMutationSchema,
  reorderRecipeImagesMutationSchema,
  reorderRecipeIngredientsMutationSchema,
  updateRecipeIngredientMutationSchema,
  updateRecipeMutationSchema,
} from "./recipes";

const input = {
  recipeId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  title: "Tomato Soup",
  description: "A simple soup.",
  optimisticTimestamp: 1_786_000_000_000,
};

describe("createRecipeMutationSchema", () => {
  it("accepts a complete input and cleans its text", () => {
    expect(
      createRecipeMutationSchema.parse({
        ...input,
        title: "  Ｔｏｍａｔｏ   Soup  ",
        description: "  A simple soup.  ",
      }),
    ).toEqual(input);
  });

  it.each([null, "  \n  "])(
    "normalizes description %j to null",
    (description) => {
      expect(
        createRecipeMutationSchema.parse({ ...input, description }).description,
      ).toBeNull();
    },
  );

  it.each(["recipeId", "householdId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        createRecipeMutationSchema.safeParse({
          ...input,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it.each(["   ", "a".repeat(151)])("rejects the invalid title %j", (title) => {
    expect(
      createRecipeMutationSchema.safeParse({ ...input, title }).success,
    ).toBe(false);
  });

  it("rejects a description longer than 5,000 characters", () => {
    expect(
      createRecipeMutationSchema.safeParse({
        ...input,
        description: "a".repeat(5_001),
      }).success,
    ).toBe(false);
  });

  it.each([-1, 1.5])(
    "rejects the invalid optimistic timestamp %s",
    (optimisticTimestamp) => {
      expect(
        createRecipeMutationSchema.safeParse({
          ...input,
          optimisticTimestamp,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects extra properties", () => {
    expect(
      createRecipeMutationSchema.safeParse({
        ...input,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});

describe("updateRecipeMutationSchema", () => {
  const updateInput = {
    householdId: input.householdId,
    recipeId: input.recipeId,
    title: input.title,
    description: input.description,
    optimisticUpdatedAt: input.optimisticTimestamp,
  };

  it("accepts a complete input and cleans its text", () => {
    expect(
      updateRecipeMutationSchema.parse({
        ...updateInput,
        title: "  Tomato   Soup  ",
        description: "  A simple soup.  ",
      }),
    ).toEqual(updateInput);
  });

  it("normalizes an empty description to null", () => {
    expect(
      updateRecipeMutationSchema.parse({
        ...updateInput,
        description: "  \n  ",
      }).description,
    ).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(
      updateRecipeMutationSchema.safeParse({
        ...updateInput,
        title: "   ",
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      updateRecipeMutationSchema.safeParse({
        ...updateInput,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});

const ingredientInput = {
  ingredientId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  householdId: input.householdId,
  recipeId: input.recipeId,
  name: "Fresh Basil",
  position: 0,
  optimisticTimestamp: input.optimisticTimestamp,
};

describe("createRecipeIngredientMutationSchema", () => {
  it("accepts a complete input and cleans its text", () => {
    expect(
      createRecipeIngredientMutationSchema.parse({
        ...ingredientInput,
        name: "  Ｆｒｅｓｈ   Basil  ",
      }),
    ).toEqual(ingredientInput);
  });

  it.each(["ingredientId", "householdId", "recipeId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        createRecipeIngredientMutationSchema.safeParse({
          ...ingredientInput,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["name", "   "],
    ["name", "a".repeat(151)],
  ] as const)("rejects an invalid %s", (field, value) => {
    expect(
      createRecipeIngredientMutationSchema.safeParse({
        ...ingredientInput,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["position", -1],
    ["position", 1.5],
    ["optimisticTimestamp", -1],
    ["optimisticTimestamp", 1.5],
  ] as const)("rejects an invalid %s", (field, value) => {
    expect(
      createRecipeIngredientMutationSchema.safeParse({
        ...ingredientInput,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      createRecipeIngredientMutationSchema.safeParse({
        ...ingredientInput,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});

const updateIngredientInput = {
  ingredientId: ingredientInput.ingredientId,
  householdId: ingredientInput.householdId,
  recipeId: ingredientInput.recipeId,
  amount: "1 1/2 cups",
  note: "Add after blending.",
  optimisticUpdatedAt: input.optimisticTimestamp,
};

describe("updateRecipeIngredientMutationSchema", () => {
  it("cleans optional amount and note text", () => {
    expect(
      updateRecipeIngredientMutationSchema.parse({
        ...updateIngredientInput,
        amount: "  1   1/2   cups  ",
        note: "  Add after blending.  ",
      }),
    ).toEqual(updateIngredientInput);
  });

  it.each(["amount", "note"] as const)(
    "normalizes an empty %s to null",
    (field) => {
      expect(
        updateRecipeIngredientMutationSchema.parse({
          ...updateIngredientInput,
          [field]: "  \n  ",
        })[field],
      ).toBeNull();
    },
  );

  it.each(["ingredientId", "householdId", "recipeId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        updateRecipeIngredientMutationSchema.safeParse({
          ...updateIngredientInput,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["amount", "a".repeat(101)],
    ["note", "a".repeat(501)],
    ["optimisticUpdatedAt", -1],
    ["optimisticUpdatedAt", 1.5],
  ] as const)("rejects an invalid %s", (field, value) => {
    expect(
      updateRecipeIngredientMutationSchema.safeParse({
        ...updateIngredientInput,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      updateRecipeIngredientMutationSchema.safeParse({
        ...updateIngredientInput,
        name: "Fresh Basil",
      }).success,
    ).toBe(false);
  });
});

const cookLogInput = {
  cookLogId: "5944cb0d-931a-4723-b981-77eacb122314",
  householdId: input.householdId,
  recipeId: input.recipeId,
  cookedAt: 1_785_999_000_000,
  comment: "Made it less spicy.",
  optimisticTimestamp: input.optimisticTimestamp,
};

describe("createRecipeCookLogMutationSchema", () => {
  it("accepts a complete input and cleans its comment", () => {
    expect(
      createRecipeCookLogMutationSchema.parse({
        ...cookLogInput,
        comment: "  Made it less spicy.  ",
      }),
    ).toEqual(cookLogInput);
  });

  it.each([null, "  \n  "])("normalizes comment %j to null", (comment) => {
    expect(
      createRecipeCookLogMutationSchema.parse({
        ...cookLogInput,
        comment,
      }).comment,
    ).toBeNull();
  });

  it.each(["cookLogId", "householdId", "recipeId"] as const)(
    "rejects an invalid %s",
    (field) => {
      expect(
        createRecipeCookLogMutationSchema.safeParse({
          ...cookLogInput,
          [field]: "not-a-uuid",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a comment longer than 1,000 characters", () => {
    expect(
      createRecipeCookLogMutationSchema.safeParse({
        ...cookLogInput,
        comment: "a".repeat(1_001),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["cookedAt", -1],
    ["cookedAt", 1.5],
    ["optimisticTimestamp", -1],
    ["optimisticTimestamp", 1.5],
  ] as const)("rejects an invalid %s", (field, value) => {
    expect(
      createRecipeCookLogMutationSchema.safeParse({
        ...cookLogInput,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      createRecipeCookLogMutationSchema.safeParse({
        ...cookLogInput,
        userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      }).success,
    ).toBe(false);
  });
});

describe.each([
  [
    "ingredients",
    reorderRecipeIngredientsMutationSchema,
    "orderedIngredientIds",
  ],
  ["images", reorderRecipeImagesMutationSchema, "orderedImageIds"],
] as const)("reorder recipe %s schema", (_name, schema, orderedIdsKey) => {
  const entityId = "5944cb0d-931a-4723-b981-77eacb122314";

  it("accepts a unique ordered ID list", () => {
    expect(
      schema.safeParse({
        householdId: input.householdId,
        recipeId: input.recipeId,
        [orderedIdsKey]: [entityId],
        optimisticUpdatedAt: input.optimisticTimestamp,
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate IDs", () => {
    expect(
      schema.safeParse({
        householdId: input.householdId,
        recipeId: input.recipeId,
        [orderedIdsKey]: [entityId, entityId],
        optimisticUpdatedAt: input.optimisticTimestamp,
      }).success,
    ).toBe(false);
  });
});
