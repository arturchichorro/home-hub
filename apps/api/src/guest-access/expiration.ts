import { guestAccessDefaultLifetimeMs } from "@home-hub/shared/guest-access";

export function resolveGuestAccessExpiration(
  expiresAt: string | undefined,
  now: Date,
) {
  const resolved =
    expiresAt === undefined
      ? new Date(now.getTime() + guestAccessDefaultLifetimeMs)
      : new Date(expiresAt);
  return resolved.getTime() > now.getTime() ? resolved : undefined;
}
