import type { GuestSessionResponse } from "@home-hub/shared/guest-access";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGuestSessionBootstrap,
  loadOfflineGuestSession,
  saveGuestSessionBootstrap,
} from "./session-bootstrap";

const session: GuestSessionResponse = {
  accessToken: "secret-access-token",
  access: "write",
  cacheIdentity: "guest-session:session-id",
  enabledModules: ["recipes"],
  household: {
    id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    name: "Coliving",
  },
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage);
});

afterEach(() => {
  clearGuestSessionBootstrap();
  vi.unstubAllGlobals();
});

describe("Guest session bootstrap", () => {
  it("restores only non-secret cache selection metadata", () => {
    saveGuestSessionBootstrap(session);

    expect(
      localStorage.getItem("home-hub:last-guest-session:v1"),
    ).not.toContain(session.accessToken);
    expect(loadOfflineGuestSession()).toEqual({
      ...session,
      accessToken: "",
    });
  });

  it("discards invalid stored data", () => {
    localStorage.setItem("home-hub:last-guest-session:v1", "not-json");

    expect(loadOfflineGuestSession()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
