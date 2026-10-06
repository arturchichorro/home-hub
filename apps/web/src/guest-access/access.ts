import type { GuestAccess } from "@home-hub/shared/zero/context";

export type GuestEntry = { credential: string; guest: GuestAccess };
export function credentialFromFragment(fragment: string) {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return /^hhg_v1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)
    ? value
    : undefined;
}
export async function validateGuestCredential(
  credential: string,
): Promise<GuestEntry | null> {
  const response = await fetch("/api/access", {
    headers: { Authorization: `Bearer ${credential}` },
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("guest" in result))
    return null;
  const guest = result.guest;
  if (
    !guest ||
    typeof guest !== "object" ||
    !("id" in guest) ||
    !("householdId" in guest) ||
    !("access" in guest) ||
    !("expiresAt" in guest) ||
    typeof guest.id !== "string" ||
    typeof guest.householdId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(guest.id) ||
    !/^[a-f0-9-]{36}$/i.test(guest.householdId) ||
    (guest.access !== "read" && guest.access !== "write") ||
    typeof guest.expiresAt !== "number" ||
    !Number.isFinite(guest.expiresAt) ||
    guest.expiresAt <= Date.now()
  )
    return null;
  return {
    credential,
    guest: {
      id: guest.id,
      householdId: guest.householdId,
      access: guest.access,
      expiresAt: guest.expiresAt,
    },
  };
}
export function guestFragmentUrl(
  pathname: string,
  search: string,
  credential: string,
) {
  return `${pathname}${search}#${credential}`;
}
