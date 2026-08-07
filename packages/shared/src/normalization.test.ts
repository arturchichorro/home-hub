import { describe, expect, it } from "vitest";

import {
  cleanRecipeDescription,
  cleanRecipeTitle,
  cleanShoppingItemName,
  normalizeShoppingItemName,
  normalizeUsername,
} from "./normalization";

describe("recipe text cleaning", () => {
  it("cleans a recipe title as a casing-preserving single line", () => {
    expect(cleanRecipeTitle("  Ｔｏｍａｔｏ   Soup  ")).toBe("Tomato Soup");
  });

  it("trims a description while preserving internal whitespace and lines", () => {
    expect(cleanRecipeDescription("  First line\n\n  Second line  ")).toBe(
      "First line\n\n  Second line",
    );
  });

  it("stores an empty description as null", () => {
    expect(cleanRecipeDescription("  \n  ")).toBeNull();
  });
});

describe("normalizeUsername", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeUsername("  artur  ")).toBe("artur");
  });

  it("lowercases uppercase letters", () => {
    expect(normalizeUsername("Artur")).toBe("artur");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeUsername("artur   chichorro")).toBe("artur chichorro");
  });
});

describe("cleanShoppingItemName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(cleanShoppingItemName("  milk  ")).toBe("milk");
  });

  it("preserves letter case", () => {
    expect(cleanShoppingItemName("Whole Milk")).toBe("Whole Milk");
  });

  it("collapses repeated internal whitespace", () => {
    expect(cleanShoppingItemName("whole   milk")).toBe("whole milk");
  });

  it("applies Unicode NFKC normalization", () => {
    expect(cleanShoppingItemName("ﬁ")).toBe("fi");
    expect(cleanShoppingItemName("ｍｉｌｋ")).toBe("milk");
  });
});

describe("normalizeShoppingItemName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeShoppingItemName("  milk  ")).toBe("milk");
  });

  it("lowercases uppercase letters", () => {
    expect(normalizeShoppingItemName("Whole Milk")).toBe("whole milk");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeShoppingItemName("whole   milk")).toBe("whole milk");
  });

  it("applies Unicode NFKC normalization before lowercasing", () => {
    expect(normalizeShoppingItemName("Ｆｕｌｌ")).toBe("full");
  });
});
