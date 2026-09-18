import {
  type GuestSessionResponse,
  guestSessionResponseSchema,
} from "@home-hub/shared/guest-access";

const storageKey = "home-hub:last-guest-session:v1";
const bootstrapSchema = guestSessionResponseSchema.omit({ accessToken: true });

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function clearGuestSessionBootstrap() {
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // Storage can become unavailable after the application has started.
  }
}

export function saveGuestSessionBootstrap(session: GuestSessionResponse) {
  try {
    const { accessToken: _accessToken, ...bootstrap } = session;
    storage()?.setItem(storageKey, JSON.stringify(bootstrap));
  } catch {
    // An online Guest session must continue when storage is unavailable.
  }
}

export function loadOfflineGuestSession(): GuestSessionResponse | null {
  try {
    const value = storage()?.getItem(storageKey);
    if (!value) return null;
    const parsed = bootstrapSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      clearGuestSessionBootstrap();
      return null;
    }
    return { ...parsed.data, accessToken: "" };
  } catch {
    clearGuestSessionBootstrap();
    return null;
  }
}
