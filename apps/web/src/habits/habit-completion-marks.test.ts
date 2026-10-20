import { describe, expect, it } from "vitest";
import { completionFade } from "./habit-completion-marks";

describe("completion overflow fade", () => {
  it("only fades the edge with more marks beyond it", () => {
    expect(completionFade(0, 36, 190)).toBe("right");
    expect(completionFade(80, 36, 190)).toBe("both");
    expect(completionFade(154, 36, 190)).toBe("left");
  });
  it("removes fading when marks fit, including after widening the cell", () => {
    expect(completionFade(0, 36, 36)).toBe("none");
    expect(completionFade(0, 250, 250)).toBe("none");
    expect(completionFade(0, 36, 0)).toBe("none");
  });
  it("ignores subpixel rounding at either end", () => {
    expect(completionFade(0.25, 36, 36.25)).toBe("none");
    expect(completionFade(153.75, 36, 190)).toBe("left");
  });
});
