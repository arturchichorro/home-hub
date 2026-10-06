import {
  type GuestAccess,
  guestAccessResponseSchema,
} from "@home-hub/shared/zero/context";

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
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Guest access is unavailable");
  const result = guestAccessResponseSchema.safeParse(await response.json());
  if (!result.success || result.data.guest.expiresAt <= Date.now()) return null;
  return { credential, guest: result.data.guest };
}
