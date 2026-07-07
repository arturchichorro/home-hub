import { describe, expect, it } from "vitest";

import { normalizeItemName, normalizeUsername } from "./normalization";

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

describe("normalizeItemName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeItemName("  milk  ")).toBe("milk");
  });

  it("lowercases uppercase letters", () => {
    expect(normalizeItemName("Whole Milk")).toBe("whole milk");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeItemName("whole   milk")).toBe("whole milk");
  });
});
