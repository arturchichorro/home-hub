import type { Hono } from "hono";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";

export type StructuredLogRecord = {
  event: string;
  [key: string]: unknown;
};

export type StructuredLogger = {
  info: (record: StructuredLogRecord) => void;
  error: (record: StructuredLogRecord) => void;
};

export const consoleStructuredLogger: StructuredLogger = {
  info(record) {
    console.info(JSON.stringify(record));
  },
  error(record) {
    console.error(JSON.stringify(record));
  },
};

export type ObservabilityEnv = {
  Variables: {
    requestStartedAt: number;
  };
};

function loggedRoute(c: Parameters<typeof routePath>[0]): string {
  const path = routePath(c, -1);
  return path && path !== "*" ? path : "unmatched";
}

function durationSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function safeErrorName(error: Error): string {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
}

function safeStackFrames(error: Error): string[] {
  return (error.stack?.split("\n").slice(1) ?? [])
    .map((line) => {
      const trimmed = line.trim();
      const location = trimmed.match(/([^/\\()\s]+:\d+:\d+)\)?$/)?.[1];

      if (!location) return undefined;

      const functionName = trimmed.match(
        /^at ([A-Za-z0-9_.<>[\] -]+?)(?: \(| [^ ]|$)/,
      )?.[1];

      return functionName ? `${functionName} (${location})` : location;
    })
    .filter((frame): frame is string => frame !== undefined)
    .slice(0, 10);
}

export function serializeUnexpectedError(error: Error) {
  return {
    name: safeErrorName(error),
    stackFrames: safeStackFrames(error),
  };
}

export function installApiObservability(
  app: Hono<ObservabilityEnv>,
  { logger }: { logger: StructuredLogger },
) {
  app.use("*", requestId({ limitLength: 64 }));
  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    c.set("requestStartedAt", startedAt);

    await next();

    if (!c.error) {
      logger.info({
        event: "http_request",
        requestId: c.get("requestId"),
        method: c.req.method,
        route: loggedRoute(c),
        status: c.res.status,
        durationMs: durationSince(startedAt),
      });
    }
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId");

    logger.error({
      event: "http_request",
      requestId,
      method: c.req.method,
      route: loggedRoute(c),
      status: 500,
      durationMs: durationSince(c.get("requestStartedAt")),
      error: serializeUnexpectedError(error),
    });

    return c.json({ error: "Internal server error", requestId }, 500);
  });
}
