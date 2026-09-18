const guestApplicationOrigin =
  import.meta.env.VITE_GUEST_APP_ORIGIN ?? "https://guest.achichorro.com";

export function guestJoinUrl(token: string): string {
  const url = new URL("/join", guestApplicationOrigin);
  url.hash = token;
  return url.href;
}
