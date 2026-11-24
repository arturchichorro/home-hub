import { afterEach, expect, it, vi } from "vitest";
import { consoleStructuredLogger } from "./observability";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("emits only a validated build revision, not caller metadata or environment prose", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("HOME_HUB_REVISION", "a".repeat(40));
  consoleStructuredLogger.info({
    event: "server_started",
    revision: "private",
  });
  expect(JSON.parse(String(info.mock.calls[0]?.[0])).revision).toBe(
    "a".repeat(40),
  );
  vi.stubEnv("HOME_HUB_REVISION", "PRIVATE_SECRET");
  consoleStructuredLogger.info({ event: "server_started" });
  expect(JSON.parse(String(info.mock.calls[1]?.[0])).revision).toBe("unknown");
  expect(JSON.stringify(info.mock.calls)).not.toContain("PRIVATE");
});
