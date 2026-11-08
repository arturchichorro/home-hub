import { createHash, randomUUID } from "node:crypto";
import {
  diagnosticCodeSchema,
  diagnosticLocationsSchema,
  diagnosticMessages,
  diagnosticOperationSchema,
} from "@home-hub/shared/diagnostics";
import * as z from "zod";

const services = [
  "api",
  "zero-cache",
  "postgres",
  "web",
  "deploy",
  "backup",
] as const;

const events = [
  "operational_log",
  "http_request",
  "mutation_database_error",
  "zero_query_error",
  "zero_mutation_error",
  "server_started",
  "shutdown_started",
  "shutdown_completed",
  "shutdown_failed",
  "postgres_ready",
  "postgres_error",
  "zero_replica_missing_key",
  "deployment_started",
  "deployment_succeeded",
  "deployment_failed",
  "backup_started",
  "backup_succeeded",
  "backup_failed",
  "collector_canary",
] as const;

const severitySchema = z.enum([
  "unknown",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export const searchSchema = z
  .object({
    services: z.array(z.enum(services)).min(1).max(6),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    event: z.enum(events).optional(),
    errorCode: diagnosticCodeSchema.optional(),
    operation: diagnosticOperationSchema.optional(),
    severity: severitySchema.optional(),
    requestId: z.uuid().optional(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    code: z
      .string()
      .regex(/^[0-9A-Z]{5}$/)
      .optional(),
    status: z.number().int().min(100).max(599).optional(),
    contains: z
      .string()
      .min(1)
      .max(80)
      .refine((value) =>
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      )
      .optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export type Search = z.infer<typeof searchSchema>;

// A second allowlist protects tool responses even if a backend stream is misconfigured.
const recordSchema = z
  .object({
    errorCode: diagnosticCodeSchema.optional(),
    operation: diagnosticOperationSchema.optional(),
    locations: diagnosticLocationsSchema.optional(),
    phase: z
      .enum([
        "preflight",
        "build",
        "cutover",
        "migrate",
        "backend",
        "web",
        "health",
        "configuration",
        "dump",
        "archive",
        "upload",
        "verify_upload",
        "unknown",
      ])
      .optional(),
    event: z.enum(events),
    severity: severitySchema.optional(),
    requestId: z.uuid().optional(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
      .optional(),
    route: z
      .string()
      .max(180)
      .regex(/^(unmatched|\/api(?:\/(?:[a-z-]+|:[A-Za-z]+))*)$/)
      .optional(),
    status: z
      .string()
      .regex(/^[1-5][0-9]{2}$/)
      .optional(),
    durationMs: z
      .string()
      .regex(/^[0-9]{1,7}$/)
      .optional(),
    code: z
      .string()
      .regex(/^[0-9A-Z]{5}$/)
      .optional(),
    errorType: z
      .enum([
        "Error",
        "TypeError",
        "RangeError",
        "SyntaxError",
        "DatabaseError",
        "AbortError",
        "TimeoutError",
        "ZodError",
      ])
      .optional(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    exitCode: z
      .string()
      .regex(/^[0-9]{1,3}$/)
      .optional(),
  })
  .refine((record) => !record.errorCode || !!record.operation)
  .transform((record) => ({
    ...record,
    ...(record.errorCode
      ? { diagnosticMessage: diagnosticMessages[record.errorCode] }
      : {}),
  }));

type SafeRecord = z.infer<typeof recordSchema>;

export type AuditRecord = {
  queryId: string;
  phase: "started" | "completed" | "failed";
  queryHash: string;
  services: readonly string[];
  start: string;
  end: string;
  limit: number;
  count?: number;
  truncated?: boolean;
};

export type LogsConfig = { url: string; tenant: string; token: string };

export class LogSearchError extends Error {}

const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export function loadLogsConfig(env: NodeJS.ProcessEnv): LogsConfig {
  const url = new URL(env.HOME_HUB_LOKI_URL ?? "");

  // A trusted operator chooses the stack, never a tool caller. No redirects, URL credentials or queries.
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.grafana\.net$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new LogSearchError(
      "Use the HTTPS Grafana Cloud Loki origin, without a path or credentials.",
    );
  }

  const tenant = env.HOME_HUB_LOKI_TENANT ?? "";
  const token = env.HOME_HUB_LOKI_READ_TOKEN ?? "";

  if (
    !/^[0-9]{1,20}$/.test(tenant) ||
    token.length < 16 ||
    token.length > 2048 ||
    /[\r\n]/.test(token)
  ) {
    throw new LogSearchError("A dedicated logs:read tenant/token is required.");
  }

  return { url: url.origin, tenant, token };
}

export function compileQuery(s: Search): string {
  const selector = `{app="home-hub",environment="production",service=~${JSON.stringify([...new Set(s.services)].sort().join("|"))}${s.revision ? `,revision=${JSON.stringify(s.revision)}` : ""}}`;
  let q = selector;

  if (s.contains) {
    q += ` |= ${JSON.stringify(s.contains)}`;
  }

  q += " | json";

  for (const key of [
    "event",
    "errorCode",
    "operation",
    "severity",
    "requestId",
    "code",
    "status",
  ] as const) {
    if (s[key] !== undefined) {
      q += ` | ${key}=${JSON.stringify(String(s[key]))}`;
    }
  }

  return `${q} | __error__=""`;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) {
    throw new LogSearchError("Empty log backend response.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const item = await reader.read();

      if (item.done) {
        break;
      }

      bytes += item.value.byteLength;

      if (bytes > 2 * 1024 * 1024) {
        throw new LogSearchError(
          "Log response exceeded 2 MiB; narrow the query.",
        );
      }

      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LogSearchError("Invalid log backend response.");
  }
}

const backendSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("streams"),
    result: z
      .array(
        z.object({
          stream: z.record(z.string(), z.string()),
          values: z.array(
            z.tuple([z.string().regex(/^[0-9]{19}$/), z.string().max(4096)]),
          ),
        }),
      )
      .max(201),
  }),
});

export class LogsReader {
  private active = 0;
  private starts: number[] = [];
  private readonly config: LogsConfig;
  private readonly audit: (record: AuditRecord) => Promise<void>;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(
    config: LogsConfig,
    audit: (record: AuditRecord) => Promise<void>,
    fetcher: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.audit = audit;
    this.fetcher = fetcher;
    this.now = now;
  }

  async search(input: unknown) {
    const parsed = searchSchema.safeParse(input);

    if (!parsed.success) {
      throw new LogSearchError("Invalid log filters.");
    }

    const s = parsed.data;
    const start = Date.parse(s.start);
    const end = Date.parse(s.end);
    const now = this.now();

    if (
      start >= end ||
      end > now + 2000 ||
      start < now - 14 * 86400_000 ||
      end - start > 6 * 3600_000
    ) {
      throw new LogSearchError(
        "Use a past window of at most 6 hours within the last 14 days.",
      );
    }

    this.starts = this.starts.filter((t) => t > now - 60_000);

    if (this.active >= 2 || this.starts.length >= 20) {
      throw new LogSearchError("Log query limit reached; retry later.");
    }

    this.starts.push(now);
    this.active++;

    const query = compileQuery(s);
    const queryId = randomUUID();
    const meta = {
      queryId,
      queryHash: digest(query),
      services: s.services,
      start: s.start,
      end: s.end,
      limit: s.limit,
    };

    try {
      await this.audit({ ...meta, phase: "started" }); // Fail closed before contacting the backend.

      const url = new URL("/loki/api/v1/query_range", this.config.url);
      const from = BigInt(start) * 1_000_000n;
      const until = BigInt(end) * 1_000_000n;
      url.search = new URLSearchParams({
        query,
        start: String(from),
        end: String(until),
        limit: String(s.limit + 1),
        direction: "backward",
      }).toString();

      const response = await this.fetcher(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.tenant}:${this.config.token}`).toString("base64")}`,
        },
      });

      if (!response.ok) {
        await response.body?.cancel();

        throw new LogSearchError(
          `Log backend returned HTTP ${response.status}.`,
        );
      }

      const decoded = backendSchema.safeParse(await boundedJson(response));

      if (!decoded.success) {
        throw new LogSearchError(
          "Unexpected log backend response; no entries returned.",
        );
      }

      const entries = [];

      for (const stream of decoded.data.data.result) {
        if (
          stream.stream.app !== "home-hub" ||
          stream.stream.environment !== "production" ||
          !s.services.includes(
            stream.stream.service as (typeof services)[number],
          ) ||
          (s.revision && stream.stream.revision !== s.revision)
        ) {
          throw new LogSearchError(
            "Unexpected log stream; no entries returned.",
          );
        }

        for (const [timestamp, line] of stream.values) {
          if (BigInt(timestamp) < from || BigInt(timestamp) > until) {
            throw new LogSearchError("Unexpected log timestamp.");
          }

          let record: SafeRecord;

          try {
            record = recordSchema.parse(JSON.parse(line));
          } catch {
            throw new LogSearchError(
              "Unexpected log record; no entries returned.",
            );
          }

          const service = stream.stream.service;
          entries.push({
            citation: `loki:${digest(this.config.url + this.config.tenant).slice(0, 12)}:${service}:${timestamp}:${digest(line).slice(0, 20)}`,
            timestamp,
            service,
            revision: /^[a-f0-9]{40}$/.test(stream.stream.revision ?? "")
              ? stream.stream.revision
              : "unknown",
            record,
          });
        }
      }

      if (entries.length > s.limit + 1) {
        throw new LogSearchError("Backend ignored result bounds.");
      }

      entries.sort((a, b) =>
        a.timestamp === b.timestamp
          ? a.citation.localeCompare(b.citation)
          : a.timestamp > b.timestamp
            ? -1
            : 1,
      );

      const truncated = entries.length > s.limit;
      const result = {
        queryId,
        source: {
          backend: new URL(this.config.url).hostname,
          query,
          start: s.start,
          end: s.end,
        },
        entries: entries.slice(0, s.limit),
        truncated,
        truncationReason: truncated ? "result_limit" : null,
        coverage:
          "Collected, privacy-projected logs only. Missing results do not prove health; retention, rotation, throttling or collector outages can create gaps.",
      };
      await this.audit({
        ...meta,
        phase: "completed",
        count: result.entries.length,
        truncated,
      });

      return result;
    } catch (error) {
      try {
        await this.audit({ ...meta, phase: "failed" });
      } catch {
        /* Never expose backend errors or credentials. */
      }

      if (error instanceof LogSearchError) {
        throw error;
      }

      throw new LogSearchError(
        "Log search unavailable (network, timeout or audit failure).",
      );
    } finally {
      this.active--;
    }
  }
}
