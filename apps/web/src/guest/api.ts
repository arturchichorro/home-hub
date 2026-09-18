import {
  type GuestSessionResponse,
  guestSessionResponseSchema,
  redeemGuestAccessRequestSchema,
} from "@home-hub/shared/guest-access";

export type GuestSessionResult =
  | { kind: "success"; session: GuestSessionResponse }
  | { kind: "unavailable" };

async function readGuestSession(
  response: Response,
): Promise<GuestSessionResult> {
  if (response.status === 401) return { kind: "unavailable" };
  if (!response.ok) throw new Error("Guest session request failed");
  return {
    kind: "success",
    session: guestSessionResponseSchema.parse(await response.json()),
  };
}

export async function redeemGuestAccess(
  token: string,
): Promise<GuestSessionResult> {
  const request = redeemGuestAccessRequestSchema.parse({ token });
  return readGuestSession(
    await fetch("/api/guest/redeem", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

export async function refreshGuestSession(): Promise<GuestSessionResult> {
  return readGuestSession(
    await fetch("/api/guest/refresh", {
      method: "POST",
      credentials: "same-origin",
    }),
  );
}

export async function refreshGuestAccessToken() {
  const result = await refreshGuestSession();
  return result.kind === "success"
    ? { kind: "success" as const, accessToken: result.session.accessToken }
    : { kind: "unauthorized" as const };
}

export async function logoutGuestAccess(): Promise<void> {
  const response = await fetch("/api/guest/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Failed to leave guest access");
}
