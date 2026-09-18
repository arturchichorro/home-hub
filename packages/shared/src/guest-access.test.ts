import { describe, expect, it } from "vitest";
import {
  createGuestAccessLinkRequestSchema,
  updateGuestAccessLinkRequestSchema,
} from "./guest-access";

describe("Guest access contracts", () => {
  it("normalizes link names and accepts household-wide access levels", () => {
    expect(
      createGuestAccessLinkRequestSchema.parse({
        name: "  Kitchen QR  ",
        access: "write",
      }),
    ).toEqual({ name: "Kitchen QR", access: "write" });
  });

  it.each(["", "x".repeat(101)])("rejects invalid names", (name) => {
    expect(
      createGuestAccessLinkRequestSchema.safeParse({ name, access: "read" })
        .success,
    ).toBe(false);
  });

  it("requires at least one update and rejects unknown properties", () => {
    expect(updateGuestAccessLinkRequestSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      updateGuestAccessLinkRequestSchema.safeParse({
        enabled: false,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      updateGuestAccessLinkRequestSchema.parse({ access: "read" }),
    ).toEqual({ access: "read" });
  });
});
