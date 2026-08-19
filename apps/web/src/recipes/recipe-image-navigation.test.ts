import { describe, expect, it } from "vitest";
import { getAdjacentRecipeImage } from "./recipe-image-navigation";

const images = [{ id: "first" }, { id: "second" }, { id: "third" }];

describe("getAdjacentRecipeImage", () => {
  it("moves forward and loops from the last image to the first", () => {
    expect(getAdjacentRecipeImage(images, "second", 1)?.id).toBe("third");
    expect(getAdjacentRecipeImage(images, "third", 1)?.id).toBe("first");
  });

  it("moves backward and loops from the first image to the last", () => {
    expect(getAdjacentRecipeImage(images, "second", -1)?.id).toBe("first");
    expect(getAdjacentRecipeImage(images, "first", -1)?.id).toBe("third");
  });

  it("returns no image for an empty collection", () => {
    expect(getAdjacentRecipeImage([], "missing", 1)).toBeUndefined();
  });
});
