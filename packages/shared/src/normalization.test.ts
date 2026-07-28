import { describe, expect, it } from "vitest";

import {
  cleanShoppingItemName,
  normalizeShoppingItemName,
  normalizeUsername,
} from "./normalization";

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
