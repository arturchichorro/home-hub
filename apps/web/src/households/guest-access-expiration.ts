import { guestAccessDefaultLifetimeMs } from "@home-hub/shared/guest-access";

const expiresSoonWindowMs = 14 * 24 * 60 * 60 * 1_000;

export function defaultGuestAccessExpiration(now = new Date()) {
  return new Date(now.getTime() + guestAccessDefaultLifetimeMs);
}

export function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localDateTimeInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function guestAccessLinkStatus(
  link: { disabledAt: string | null; expiresAt: string },
  now = new Date(),
) {
  if (link.disabledAt) return "Disabled" as const;
  const remainingMs = Date.parse(link.expiresAt) - now.getTime();
  if (remainingMs <= 0) return "Expired" as const;
  if (remainingMs <= expiresSoonWindowMs) return "Expires soon" as const;
  return "Active" as const;
}

export function formatGuestAccessExpiration(expiresAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}
