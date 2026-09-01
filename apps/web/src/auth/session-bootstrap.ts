import { type AuthUser, authUserSchema } from "@home-hub/shared/auth";
import type { Session } from "./api";

const storageKey = "home-hub:last-user:v1";

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function clearSessionBootstrap() {
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // Storage can become unavailable after the application has started.
  }
}

export function saveSessionBootstrap(user: AuthUser) {
  try {
    storage()?.setItem(storageKey, JSON.stringify(user));
  } catch {
    // An online session must continue to work when storage is unavailable.
  }
}

export function loadOfflineSession(): Session | null {
  try {
    const value = storage()?.getItem(storageKey);
    if (!value) return null;

    const user = authUserSchema.safeParse(JSON.parse(value));
    if (!user.success) {
      clearSessionBootstrap();
      return null;
    }

    return { user: user.data, accessToken: "" };
  } catch {
    clearSessionBootstrap();
    return null;
  }
}
