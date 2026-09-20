export type GuestLink = {
  id: string;
  householdId: string;
  name: string;
  access: "read" | "write";
  expiresAt: string;
  disabledAt: string | null;
  createdAt: string;
};
export type CreatedGuestLink = { link: GuestLink; credential: string };
export class GuestLinkRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Guest link request failed");
    this.status = status;
  }
}
async function request(
  householdId: string,
  accessToken: string,
  suffix = "",
  init: RequestInit = {},
) {
  const response = await fetch(
    `/api/households/${encodeURIComponent(householdId)}/guest-access-links${suffix}`,
    {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) throw new GuestLinkRequestError(response.status);
  return response;
}
export async function listGuestLinks(householdId: string, accessToken: string) {
  const response = await request(householdId, accessToken);
  return ((await response.json()) as { links: GuestLink[] }).links;
}
export async function createGuestLink(
  householdId: string,
  accessToken: string,
  input: { name: string; access: "read" | "write"; expiresAt?: string },
) {
  const response = await request(householdId, accessToken, "", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await response.json()) as CreatedGuestLink;
}
export async function disableGuestLink(
  householdId: string,
  accessToken: string,
  linkId: string,
) {
  await request(householdId, accessToken, `/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
  });
}
export function guestLinkStatus(
  link: Pick<GuestLink, "disabledAt" | "expiresAt">,
  now = Date.now(),
) {
  return link.disabledAt
    ? "Disabled"
    : Date.parse(link.expiresAt) <= now
      ? "Expired"
      : "Active";
}
export function guestLinkUrl(
  credential: string,
  origin = import.meta.env.DEV
    ? window.location.origin
    : "https://guest.achichorro.com",
) {
  return `${origin}/join#${credential}`;
}
