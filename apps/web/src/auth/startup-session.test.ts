import { describe, expect, it, vi } from "vitest";
import type { Session } from "./api";
import { restoreStartupSession } from "./startup-session";

const session: Session = {
  user: {
    id: "9f8a6942-f721-499d-957d-7bb3ed1158db",
    username: "artur",
    email: "artur@example.com",
  },
  accessToken: "access-token",
};

describe("restoreStartupSession", () => {
  it("opens the offline session immediately when the browser is offline", async () => {
    const restore = vi.fn();

    await expect(
      restoreStartupSession({
        online: false,
        loadOffline: () => session,
        restore,
      }),
    ).resolves.toEqual({ kind: "offline", session });
    expect(restore).not.toHaveBeenCalled();
  });

  it("uses a successfully restored online session", async () => {
    await expect(
      restoreStartupSession({
        online: true,
        restore: async () => session,
      }),
    ).resolves.toEqual({ kind: "online", session });
  });

  it("falls back after a network failure", async () => {
    await expect(
      restoreStartupSession({
        online: true,
        loadOffline: () => session,
        restore: async () => {
          throw new TypeError("Network request failed");
        },
      }),
    ).resolves.toEqual({ kind: "offline", session });
  });

  it("aborts a hanging restoration and falls back", async () => {
    await expect(
      restoreStartupSession({
        online: true,
        loadOffline: () => session,
        timeoutMilliseconds: 1,
        restore: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      }),
    ).resolves.toEqual({ kind: "offline", session });
  });

  it("does not hide an unexpected restoration error", async () => {
    await expect(
      restoreStartupSession({
        online: true,
        loadOffline: () => session,
        restore: async () => {
          throw new Error("Invalid response");
        },
      }),
    ).resolves.toEqual({ kind: "error" });
  });
});
