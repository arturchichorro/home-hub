import type { GuestAccessLevel } from "./guest-access";

export type AccountPrincipal = {
  kind: "account";
  userId: string;
};

export type GuestPrincipal = {
  kind: "guest";
  guestSessionId: string;
  guestAccessLinkId: string;
  householdId: string;
  access: GuestAccessLevel;
};

export type AccessPrincipal = AccountPrincipal | GuestPrincipal;
