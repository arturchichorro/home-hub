import { describe, expect, it } from "vitest";
import { validateRecipesSearch } from "./recipe-search";

describe("validateRecipesSearch", () => {
  it("keeps a valid recipe UUID", () => {
    const recipeId = "7b56bc99-3a7d-4bc2-8ec9-9b04b1876774";

    expect(validateRecipesSearch({ recipeId })).toEqual({ recipeId });
  });

  it.each([undefined, null, 42, "not-a-uuid"])(
    "drops an invalid recipe ID: %s",
    (recipeId) => {
      expect(validateRecipesSearch({ recipeId })).toEqual({});
    },
  );
});
