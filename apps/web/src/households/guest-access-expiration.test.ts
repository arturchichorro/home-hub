import { describe, expect, it } from "vitest";
import {
  defaultGuestAccessExpiration,
  guestAccessLinkStatus,
  localDateTimeInputToIso,
} from "./guest-access-expiration";

describe("Guest access expiration presentation", () => {
  const now = new Date("2026-09-19T12:00:00.000Z");

  it("defaults creation to exactly 90 days", () => {
    expect(defaultGuestAccessExpiration(now)).toEqual(
      new Date("2026-12-18T12:00:00.000Z"),
    );
  });

  it.each([
    [
      { disabledAt: now.toISOString(), expiresAt: "2027-01-01T00:00:00Z" },
      "Disabled",
    ],
    [{ disabledAt: null, expiresAt: "2026-09-19T12:00:00Z" }, "Expired"],
    [{ disabledAt: null, expiresAt: "2026-10-01T12:00:00Z" }, "Expires soon"],
    [{ disabledAt: null, expiresAt: "2027-01-01T00:00:00Z" }, "Active"],
  ] as const)("derives status from current link state", (link, status) => {
    expect(guestAccessLinkStatus(link, now)).toBe(status);
  });

  it("converts a local date-time control value to an ISO instant", () => {
    expect(localDateTimeInputToIso("2026-12-18T12:00")).toBe(
      new Date(2026, 11, 18, 12).toISOString(),
    );
  });
});
