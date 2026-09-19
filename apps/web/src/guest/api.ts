import {
  type GuestAccessContextResponse,
  guestAccessContextResponseSchema,
} from "@home-hub/shared/guest-access";

export type GuestAccessContextResult =
  | { kind: "success"; context: GuestAccessContextResponse }
  | { kind: "unavailable" };

export function guestAuthorization(credential: string) {
  return `Guest ${credential}`;
}

export async function getGuestAccessContext(
  credential: string,
): Promise<GuestAccessContextResult> {
  const response = await fetch("/api/guest/context", {
    headers: { Authorization: guestAuthorization(credential) },
  });
  if (response.status === 401) return { kind: "unavailable" };
  if (!response.ok) throw new Error("Guest access context request failed");
  return {
    kind: "success",
    context: guestAccessContextResponseSchema.parse(await response.json()),
  };
}
