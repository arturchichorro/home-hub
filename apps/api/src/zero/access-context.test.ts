import { describe, expect, it } from "vitest";
import { toZeroAuthContext, zeroCacheIdentity } from "./access-context";

const accountAccess = {
  actor: {
    kind: "account" as const,
    accountId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
  },
};
const guestAccess = {
  actor: {
    kind: "guest" as const,
    guestAccessLinkId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  },
  householdScope: {
    householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    permission: "write" as const,
  },
};

describe("Zero access context", () => {
  it("keeps account cache identity unchanged", () => {
    expect(zeroCacheIdentity(accountAccess)).toBe(
      accountAccess.actor.accountId,
    );
    expect(toZeroAuthContext(accountAccess)).toEqual(accountAccess);
  });

  it("partitions Guest caches by non-secret link ID", () => {
    expect(zeroCacheIdentity(guestAccess)).toBe(
      `guest-link:${guestAccess.actor.guestAccessLinkId}`,
    );
  });

  it("exposes scope without manufacturing a Guest user ID", () => {
    expect(toZeroAuthContext(guestAccess)).toEqual({
      actor: { kind: "guest" },
      householdScope: guestAccess.householdScope,
    });
    expect(toZeroAuthContext(guestAccess).actor).not.toHaveProperty("userId");
  });
});
