import { afterEach, describe, expect, it, vi } from "vitest";
import { readDocument } from "./api";
import { createThumbnailManager } from "./thumbnail";

vi.mock("./api", () => ({ readDocument: vi.fn() }));

const session = {
  userId: "user",
  accessToken: "token",
  onSessionExpired: vi.fn(),
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("document thumbnail scheduling", () => {
  it("deduplicates by file identity and caches only matching replacements", async () => {
    vi.mocked(readDocument).mockResolvedValueOnce({
      url: "https://files/thumb",
      contentType: "image/png",
      filename: "x.png",
      fileId: "one",
    });

    const manager = createThumbnailManager(session, "home");
    const a = manager.resolve("doc", "one");
    const b = manager.resolve("doc", "one");
    expect(a).toBe(b);
    await expect(a).resolves.toContain("/thumb");
    await manager.resolve("doc", "one");
    expect(readDocument).toHaveBeenCalledTimes(1);
    expect(readDocument).toHaveBeenCalledWith(
      session,
      "home",
      "doc",
      "inline",
      true,
    );
    vi.mocked(readDocument).mockResolvedValueOnce({
      url: "https://files/new",
      contentType: "image/png",
      filename: "x.png",
      fileId: "three",
    });
    await expect(manager.resolve("doc", "two")).rejects.toThrow("File changed");
    manager.dispose();
  });
  it("bounds concurrency and rejects queued work on scope disposal", async () => {
    const waiting: {
      id: string;
      resolve: (data: Awaited<ReturnType<typeof readDocument>>) => void;
    }[] = [];
    vi.mocked(readDocument).mockImplementation(
      (_s, _h, id) => new Promise((resolve) => waiting.push({ id, resolve })),
    );

    const manager = createThumbnailManager(session, "home");
    const jobs = Array.from({ length: 7 }, (_, i) =>
      manager.resolve(`doc${i}`, `file${i}`),
    );
    const finished = Promise.allSettled(jobs);
    expect(readDocument).toHaveBeenCalledTimes(4);
    manager.dispose();

    for (const job of waiting) {
      job.resolve({
        url: "https://files/x",
        contentType: "image/png",
        filename: "x.png",
        fileId: `file${job.id.slice(3)}`,
      });
    }

    expect((await finished).every((r) => r.status === "rejected")).toBe(true);
  });
  it("shares one visibility observer for image rows", () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    const ctor = vi.fn();

    class Observer {
      constructor() {
        ctor();
      }

      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }

    vi.stubGlobal("IntersectionObserver", Observer);

    const manager = createThumbnailManager(session, "home");
    const stop = manager.watch({} as Element, () => {});
    manager.watch({} as Element, () => {});
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(2);
    stop();
    expect(unobserve).toHaveBeenCalledTimes(1);
    manager.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
