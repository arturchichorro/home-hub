export type GuestAccess = {
  id: string;
  householdId: string;
  access: "read" | "write";
  expiresAt: number;
};
export type ZeroAuthContext =
  | { userId: string; guest?: never }
  | { guest: GuestAccess; userId?: never };
export function zeroCacheIdentity(ctx: ZeroAuthContext) {
  return ctx.guest ? `guest-link:${ctx.guest.id}` : ctx.userId;
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroAuthContext;
  }
}
