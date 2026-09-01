import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionBootstrap,
  loadOfflineSession,
  saveSessionBootstrap,
} from "./session-bootstrap";

const user = {
  id: "9f8a6942-f721-499d-957d-7bb3ed1158db",
  username: "artur",
  email: "artur@example.com",
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("offline session bootstrap", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores only the last known identity without persisting a token", () => {
    saveSessionBootstrap(user);

    expect(loadOfflineSession()).toEqual({ user, accessToken: "" });
    expect(localStorage.length).toBe(1);
  });

  it("clears invalid stored identities", () => {
    localStorage.setItem("home-hub:last-user:v1", JSON.stringify({ id: 1 }));

    expect(loadOfflineSession()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("clears the identity on logout", () => {
    saveSessionBootstrap(user);
    clearSessionBootstrap();

    expect(loadOfflineSession()).toBeNull();
  });
});
