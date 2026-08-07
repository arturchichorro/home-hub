import { describe, expect, it } from "vitest";

import { createRecipeMutationSchema } from "./recipes";

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
