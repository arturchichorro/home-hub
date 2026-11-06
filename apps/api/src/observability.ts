import type { Hono } from "hono";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import {
  codeForStatus,
  diagnosticContext,
  diagnosticFor,
  diagnosticLocations,
  operationForError,
  safeErrorType,
} from "./diagnostics";
import { httpOperation } from "./http-operations";

export type StructuredLogRecord = { event: string; [key: string]: unknown };

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

export type ObservabilityEnv = { Variables: { requestStartedAt: number } };

function loggedRoute(c: Parameters<typeof routePath>[0]): string {
  const path = routePath(c, -1);

  return path && path !== "*" ? path : "unmatched";
}

export function serializeUnexpectedError(error: unknown) {
  return {
    name: safeErrorType(error),
    stackFrames: diagnosticLocations(error),
  };
}

export function installApiObservability(
  app: Hono<ObservabilityEnv>,
  { logger }: { logger: StructuredLogger },
) {
  app.use("*", requestId({ limitLength: 64 }));
  app.use("*", async (c, next) =>
    diagnosticContext.run({}, async () => {
      const startedAt = performance.now();
      c.set("requestStartedAt", startedAt);
      await next();

      const route = loggedRoute(c);
      const status = c.res.status;
      const failure =
        status >= 400 ? diagnosticContext.getStore()?.failure : undefined;
      const error = c.error ?? failure?.error;
      const operation =
        (status >= 400 ? operationForError(error) : undefined) ??
        httpOperation(c.req.method, route);
      const diagnostic =
        status >= 400
          ? diagnosticFor(
              operation,
              error,
              operation === "database.readiness"
                ? "HH_DATABASE_FAILURE"
                : error && status >= 500
                  ? "HH_UNEXPECTED"
                  : codeForStatus(status),
            )
          : { operation };
      // Child router error handlers can return 409/503 without reaching onError.
      // Log the final response once, retaining safe source evidence for those too.
      const record = {
        event: "http_request",
        requestId: c.get("requestId"),
        method: c.req.method,
        route,
        status,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...diagnostic,
        ...(error ? { error: serializeUnexpectedError(error) } : {}),
      };

      if (status >= 500) {
        logger.error(record);
      } else {
        logger.info(record);
      }
    }),
  );
  app.onError((_error, c) =>
    c.json(
      { error: "Internal server error", requestId: c.get("requestId") },
      500,
    ),
  );
}
