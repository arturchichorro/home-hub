import {
  isGuestRequestAccess,
  type RequestAccess,
} from "@home-hub/shared/access";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";

export function toZeroAuthContext(
  requestAccess: RequestAccess,
): ZeroAuthContext {
  return isGuestRequestAccess(requestAccess)
    ? {
        actor: { kind: "guest" },
        householdScope: requestAccess.householdScope,
      }
    : { actor: requestAccess.actor };
}

export function zeroCacheIdentity(requestAccess: RequestAccess): string {
  return requestAccess.actor.kind === "account"
    ? requestAccess.actor.accountId
    : `guest-session:${requestAccess.actor.guestSessionId}`;
}
