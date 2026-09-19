import { describe, expect, it } from "vitest";
import {
  createGuestAccessLinkRequestSchema,
  guestAccessContextResponseSchema,
  guestAccessDefaultLifetimeMs,
  listGuestAccessLinksResponseSchema,
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

  it("defines the default lifetime as exactly 90 days", () => {
    expect(guestAccessDefaultLifetimeMs).toBe(90 * 24 * 60 * 60 * 1_000);
  });

  it("accepts omitted or well-formed expiration timestamps", () => {
    expect(
      createGuestAccessLinkRequestSchema.parse({
        name: "Kitchen QR",
        access: "write",
      }),
    ).toEqual({ name: "Kitchen QR", access: "write" });
    expect(
      createGuestAccessLinkRequestSchema.safeParse({
        name: "Kitchen QR",
        access: "write",
        expiresAt: "2026-12-18T12:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      updateGuestAccessLinkRequestSchema.safeParse({ expiresAt: "tomorrow" })
        .success,
    ).toBe(false);
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

  it("serializes expiration in link summaries and direct Guest context", () => {
    const expiresAt = "2026-12-18T12:00:00.000Z";
    const link = {
      id: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
      householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      name: "Kitchen QR",
      access: "write",
      expiresAt,
      disabledAt: null,
      createdAt: "2026-09-19T12:00:00.000Z",
      updatedAt: "2026-09-19T12:00:00.000Z",
    };

    expect(listGuestAccessLinksResponseSchema.parse({ links: [link] })).toEqual(
      {
        links: [link],
      },
    );
    expect(
      guestAccessContextResponseSchema.parse({
        guestAccessLinkId: link.id,
        access: link.access,
        cacheIdentity: `guest-link:${link.id}`,
        expiresAt,
        enabledModules: ["recipes"],
        household: { id: link.householdId, name: "Our House" },
      }),
    ).toMatchObject({ expiresAt, guestAccessLinkId: link.id });
  });
});
