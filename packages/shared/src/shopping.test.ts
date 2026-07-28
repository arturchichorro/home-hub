import { describe, expect, it } from "vitest";

import { createShoppingItemRequestSchema } from "./shopping";

describe("createShoppingItemRequestSchema", () => {
  it("returns a cleaned display name", () => {
    expect(
      createShoppingItemRequestSchema.parse({ name: "  Whole   Milk  " }),
    ).toEqual({ name: "Whole Milk" });
  });

  it("accepts a raw value longer than 100 characters when cleaning reduces it to at most 100", () => {
    const name = `  ${"a".repeat(100)}  `;
    expect(name.length).toBeGreaterThan(100);
    expect(createShoppingItemRequestSchema.parse({ name })).toEqual({
      name: "a".repeat(100),
    });
  });

  it("rejects whitespace-only input", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({ name: "   " }).success,
    ).toBe(false);
  });

  it("rejects a cleaned name of 101 characters", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({
        name: "a".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      createShoppingItemRequestSchema.safeParse({
        name: "milk",
        unexpected: "value",
      }).success,
    ).toBe(false);
  });
});
