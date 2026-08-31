import { describe, expect, it } from "vitest";

import {
  cleanListItemName,
  cleanRecipeCookLogComment,
  cleanRecipeDescription,
  cleanRecipeIngredientAmount,
  cleanRecipeIngredientName,
  cleanRecipeIngredientNote,
  cleanRecipeTitle,
  normalizeListItemName,
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

  it("cleans ingredient name and amount as single-line fields", () => {
    expect(cleanRecipeIngredientName("  Ｆｒｅｓｈ   Basil  ")).toBe(
      "Fresh Basil",
    );
    expect(cleanRecipeIngredientAmount("  1   1/2   cups  ")).toBe(
      "1 1/2 cups",
    );
  });

  it("preserves lines in ingredient notes", () => {
    expect(cleanRecipeIngredientNote("  First line\n\nSecond line  ")).toBe(
      "First line\n\nSecond line",
    );
  });

  it("stores empty optional ingredient text as null", () => {
    expect(cleanRecipeIngredientAmount("  \n  ")).toBeNull();
    expect(cleanRecipeIngredientNote("  \n  ")).toBeNull();
  });

  it("cleans a cooking-log comment while preserving its lines", () => {
    expect(cleanRecipeCookLogComment("  First try\n\nLess salt  ")).toBe(
      "First try\n\nLess salt",
    );
    expect(cleanRecipeCookLogComment("  \n  ")).toBeNull();
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

describe("cleanListItemName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(cleanListItemName("  milk  ")).toBe("milk");
  });

  it("preserves letter case", () => {
    expect(cleanListItemName("Whole Milk")).toBe("Whole Milk");
  });

  it("collapses repeated internal whitespace", () => {
    expect(cleanListItemName("whole   milk")).toBe("whole milk");
  });

  it("applies Unicode NFKC normalization", () => {
    expect(cleanListItemName("ﬁ")).toBe("fi");
    expect(cleanListItemName("ｍｉｌｋ")).toBe("milk");
  });
});

describe("normalizeListItemName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeListItemName("  milk  ")).toBe("milk");
  });

  it("lowercases uppercase letters", () => {
    expect(normalizeListItemName("Whole Milk")).toBe("whole milk");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeListItemName("whole   milk")).toBe("whole milk");
  });

  it("applies Unicode NFKC normalization before lowercasing", () => {
    expect(normalizeListItemName("Ｆｕｌｌ")).toBe("full");
  });
});
