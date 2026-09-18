import type { HouseholdAccessScope } from "../access";

export type ZeroAuthContext =
  | { actor: { kind: "account"; accountId: string } }
  | { actor: { kind: "guest" }; householdScope: HouseholdAccessScope };

export function isGuestZeroAuthContext(
  context: ZeroAuthContext,
): context is Extract<ZeroAuthContext, { actor: { kind: "guest" } }> {
  return context.actor.kind === "guest";
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroAuthContext;
  }
}
