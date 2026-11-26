import { expect, it } from "vitest";
import { isCreatedInvitePending } from "./invitation-state";

const invite = { id: "new", expiresAt: "2026-11-26T12:00:00Z" };
const now = Date.parse("2026-11-26T11:00:00Z");
const status = { id: "new", acceptedAt: null, revokedAt: null };

it("keeps a new token available during metadata replication lag", () => {
  expect(isCreatedInvitePending(invite, undefined, true, now)).toBe(true);
  expect(
    isCreatedInvitePending(
      invite,
      { ...status, id: "previous", acceptedAt: 0 },
      true,
      now,
    ),
  ).toBe(true);
  expect(isCreatedInvitePending(invite, status, true, now)).toBe(true);
});

it("clears consumed, revoked, expired and former-owner tokens", () => {
  expect(
    isCreatedInvitePending(invite, { ...status, acceptedAt: 0 }, true, now),
  ).toBe(false);
  expect(
    isCreatedInvitePending(invite, { ...status, revokedAt: now }, true, now),
  ).toBe(false);
  expect(
    isCreatedInvitePending(invite, status, true, Date.parse(invite.expiresAt)),
  ).toBe(false);
  expect(isCreatedInvitePending(invite, undefined, false, now)).toBe(false);
});
