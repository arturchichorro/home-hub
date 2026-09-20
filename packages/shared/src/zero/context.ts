import * as z from "zod";

// Scope loaded from PostgreSQL by the Bearer boundary, not a Guest identity.
const guestAccessSchema = z.object({
  id: z.uuid(),
  householdId: z.uuid(),
  access: z.enum(["read", "write"]),
  expiresAt: z.number().finite(),
});
export const guestAccessResponseSchema = z.object({ guest: guestAccessSchema });
export type GuestAccess = z.infer<typeof guestAccessSchema>;

// The same request principal is used by ordinary APIs and Zero.
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
