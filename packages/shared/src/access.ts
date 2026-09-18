import type { GuestAccessLevel } from "./guest-access";

export type AccountActor = {
  kind: "account";
  accountId: string;
};

export type GuestActor = {
  kind: "guest";
  guestSessionId: string;
  guestAccessLinkId: string;
};

export type HouseholdAccessScope = {
  householdId: string;
  permission: GuestAccessLevel;
};

export type AccountRequestAccess = { actor: AccountActor };
export type GuestRequestAccess = {
  actor: GuestActor;
  householdScope: HouseholdAccessScope;
};
export type RequestAccess = AccountRequestAccess | GuestRequestAccess;

export function isGuestRequestAccess(
  access: RequestAccess,
): access is GuestRequestAccess {
  return access.actor.kind === "guest";
}
