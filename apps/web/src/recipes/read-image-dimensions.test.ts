import { afterEach, describe, expect, it, vi } from "vitest";
import { readImageDimensions } from "./read-image-dimensions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readImageDimensions", () => {
  it("reads decoded dimensions and releases the bitmap", async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({
      width: 800,
      height: 600,
      close,
    }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const file = new File(["image"], "recipe.webp", {
      type: "image/webp",
    });

    await expect(readImageDimensions(file)).resolves.toEqual({
      width: 800,
      height: 600,
    });
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(close).toHaveBeenCalledOnce();
  });
});
