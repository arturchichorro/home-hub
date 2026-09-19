import { describe, expect, it } from "vitest";
import { resolveGuestAccessExpiration } from "./expiration";

describe("resolveGuestAccessExpiration", () => {
  const now = new Date("2026-09-19T12:00:00.000Z");

  it("defaults to exactly 90 days from the server time", () => {
    expect(resolveGuestAccessExpiration(undefined, now)).toEqual(
      new Date("2026-12-18T12:00:00.000Z"),
    );
  });

  it("accepts only custom expiration timestamps strictly after server time", () => {
    expect(
      resolveGuestAccessExpiration("2026-09-19T12:00:00.001Z", now),
    ).toEqual(new Date("2026-09-19T12:00:00.001Z"));
    expect(
      resolveGuestAccessExpiration("2026-09-19T12:00:00.000Z", now),
    ).toBeUndefined();
    expect(
      resolveGuestAccessExpiration("2026-09-19T11:59:59.999Z", now),
    ).toBeUndefined();
  });
});
