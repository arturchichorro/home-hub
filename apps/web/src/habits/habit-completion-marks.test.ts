import { describe, expect, it } from "vitest";
import { hiddenMarksToRight } from "./habit-completion-marks";

describe("hidden completion count", () => {
  it("counts fully and partially hidden marks", () => {
    expect(hiddenMarksToRight([16, 36, 56, 76, 96], 40)).toBe(3);
    expect(hiddenMarksToRight([16, 36, 56], 32)).toBe(2);
  });
  it("decreases as the strip scrolls and clears at the end", () => {
    expect(hiddenMarksToRight([16, 36, 56, 76], 36)).toBe(2);
    expect(hiddenMarksToRight([-4, 16, 36, 56], 36)).toBe(1);
    expect(hiddenMarksToRight([-24, -4, 16, 36], 36)).toBe(0);
  });
  it("updates when the viewport widens and tolerates subpixel rounding", () => {
    expect(hiddenMarksToRight([16, 36, 56, 76], 80)).toBe(0);
    expect(hiddenMarksToRight([36.25], 36)).toBe(0);
    expect(hiddenMarksToRight([], 36)).toBe(0);
  });
});
