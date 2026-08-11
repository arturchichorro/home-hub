import type { Server } from "node:http";
import {
  type StructuredLogger,
  serializeUnexpectedError,
} from "./observability";

const defaultShutdownTimeoutMilliseconds = 10_000;

type ShutdownSignal = "SIGINT" | "SIGTERM";

type CreateGracefulShutdownInput = {
  closeInfrastructure: () => Promise<void>;
  closeServer: () => Promise<void>;
  logger: StructuredLogger;
};

export function closeHttpServer(
  server: Server,
  timeoutMilliseconds = defaultShutdownTimeoutMilliseconds,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.closeAllConnections();
    }, timeoutMilliseconds);
    timeout.unref();

    server.close((error) => {
      clearTimeout(timeout);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createGracefulShutdown({
  closeInfrastructure,
  closeServer,
  logger,
}: CreateGracefulShutdownInput) {
  let shutdownPromise: Promise<void> | undefined;

  return function shutdown(signal: ShutdownSignal): Promise<void> {
    if (shutdownPromise) return shutdownPromise;

    logger.info({ event: "shutdown_started", signal });

    shutdownPromise = (async () => {
      try {
        try {
          await closeServer();
        } finally {
          await closeInfrastructure();
        }
        logger.info({ event: "shutdown_completed", signal });
      } catch (error) {
        logger.error({
          event: "shutdown_failed",
          signal,
          error: serializeUnexpectedError(
            error instanceof Error ? error : new Error("Unknown error"),
          ),
        });
        throw error;
      }
    })();

    return shutdownPromise;
  };
}
