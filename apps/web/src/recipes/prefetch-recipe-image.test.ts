import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldPrefetchRecipeImages } from "./prefetch-recipe-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recipe image prefetch policy", () => {
  it("prefetches only when a suitable network is known", () => {
    vi.stubGlobal("navigator", {});
    expect(shouldPrefetchRecipeImages()).toBe(false);

    vi.stubGlobal("navigator", { connection: { effectiveType: "4g" } });
    expect(shouldPrefetchRecipeImages()).toBe(true);

    vi.stubGlobal("navigator", {
      connection: { effectiveType: "4g", saveData: true },
    });
    expect(shouldPrefetchRecipeImages()).toBe(false);

    vi.stubGlobal("navigator", { connection: { effectiveType: "2g" } });
    expect(shouldPrefetchRecipeImages()).toBe(false);
  });
});
