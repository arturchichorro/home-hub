import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, requestClientKey } from "./rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("limits each key and resets the bounded window", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000, 10_000);
    expect(limiter.allow("one", 10_100)).toBe(true);
    expect(limiter.allow("one", 10_200)).toBe(true);
    expect(limiter.allow("one", 10_300)).toBe(false);
    expect(limiter.allow("two", 10_300)).toBe(true);
    expect(limiter.allow("one", 11_000)).toBe(true);
  });

  it("prefers the edge-provided client address", () => {
    expect(
      requestClientKey(
        new Headers({
          "cf-connecting-ip": "192.0.2.1",
          "x-forwarded-for": "192.0.2.2, 192.0.2.3",
        }),
      ),
    ).toBe("192.0.2.1");
  });
});
