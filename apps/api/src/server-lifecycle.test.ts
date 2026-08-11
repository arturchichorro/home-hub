import { describe, expect, it, vi } from "vitest";
import type { StructuredLogger, StructuredLogRecord } from "./observability";
import { createGracefulShutdown } from "./server-lifecycle";

function createMemoryLogger() {
  const infoRecords: StructuredLogRecord[] = [];
  const errorRecords: StructuredLogRecord[] = [];

  return {
    logger: {
      info: (record) => infoRecords.push(record),
      error: (record) => errorRecords.push(record),
    } satisfies StructuredLogger,
    infoRecords,
    errorRecords,
  };
}

describe("graceful shutdown", () => {
  it("stops the server before closing infrastructure", async () => {
    const order: string[] = [];
    const { logger, infoRecords, errorRecords } = createMemoryLogger();
    const shutdown = createGracefulShutdown({
      closeServer: async () => {
        order.push("server");
      },
      closeInfrastructure: async () => {
        order.push("infrastructure");
      },
      logger,
    });

    await shutdown("SIGTERM");

    expect(order).toEqual(["server", "infrastructure"]);
    expect(infoRecords).toEqual([
      { event: "shutdown_started", signal: "SIGTERM" },
      { event: "shutdown_completed", signal: "SIGTERM" },
    ]);
    expect(errorRecords).toEqual([]);
  });

  it("shares one shutdown operation across repeated signals", async () => {
    const { logger } = createMemoryLogger();
    const closeServer = vi.fn(async () => undefined);
    const closeInfrastructure = vi.fn(async () => undefined);
    const shutdown = createGracefulShutdown({
      closeServer,
      closeInfrastructure,
      logger,
    });

    const firstShutdown = shutdown("SIGINT");
    const secondShutdown = shutdown("SIGTERM");

    expect(firstShutdown).toBe(secondShutdown);
    await firstShutdown;
    expect(closeServer).toHaveBeenCalledOnce();
    expect(closeInfrastructure).toHaveBeenCalledOnce();
  });

  it("logs a safe failure and rejects shutdown", async () => {
    const secret = "postgres://user:secret@database/home_hub";
    const { logger, infoRecords, errorRecords } = createMemoryLogger();
    const closeInfrastructure = vi.fn(async () => undefined);
    const shutdown = createGracefulShutdown({
      closeServer: async () => {
        throw new Error(secret);
      },
      closeInfrastructure,
      logger,
    });

    await expect(shutdown("SIGTERM")).rejects.toThrow(secret);
    expect(closeInfrastructure).toHaveBeenCalledOnce();
    expect(infoRecords).toEqual([
      { event: "shutdown_started", signal: "SIGTERM" },
    ]);
    expect(errorRecords).toHaveLength(1);
    expect(errorRecords[0]).toEqual(
      expect.objectContaining({
        event: "shutdown_failed",
        signal: "SIGTERM",
        error: expect.objectContaining({ name: "Error" }),
      }),
    );
    expect(JSON.stringify(errorRecords)).not.toContain(secret);
  });
});
