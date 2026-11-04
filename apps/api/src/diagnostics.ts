import { AsyncLocalStorage } from "node:async_hooks";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticOperation,
  diagnosticMessages,
  isDiagnosticLocation,
} from "@home-hub/shared/diagnostics";
import { ZodError } from "zod";

export type DiagnosticContext = {
  failure?: { operation: DiagnosticOperation; error: unknown };
};
export const diagnosticContext = new AsyncLocalStorage<DiagnosticContext>();
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const errorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "DatabaseError",
  "AbortError",
  "TimeoutError",
  "ZodError",
]);
function field(value: unknown, key: string): unknown {
  try {
    return value instanceof Error ? Reflect.get(value, key) : undefined;
  } catch {
    return undefined;
  }
}
export function errorChain(error: unknown): Error[] {
  const chain: Error[] = [],
    seen = new Set<unknown>();
  while (error instanceof Error && chain.length < 12 && !seen.has(error)) {
    chain.push(error);
    seen.add(error);
    error = field(error, "cause");
  }
  return chain;
}
export function safeErrorType(error: unknown): string {
  const name = field(error, "name");
  return typeof name === "string" && errorNames.has(name) ? name : "Error";
}
export function diagnosticLocations(error: unknown): string[] {
  const locations = new Set<string>();
  for (const cause of errorChain(error)) {
    const stack = field(cause, "stack");
    if (typeof stack !== "string") continue;
    for (const frame of stack.slice(0, 16384).split("\n").slice(1, 31)) {
      // V8 locations only; never export function names, absolute paths, queries,
      // eval origins, dependency paths, or arbitrary basename-shaped strings.
      const m =
        /^\s+at (?:[^()\r\n]* \()?((?:file:\/\/\/|\/)[^()\r\n]+):([1-9][0-9]{0,6}):([1-9][0-9]{0,3})\)?$/.exec(
          frame,
        );
      if (!m) continue;
      try {
        let path = m[1] ?? "";
        if (path.startsWith("file:")) {
          const url = new URL(path);
          if (url.search || url.hash || url.host) continue;
          path = fileURLToPath(url);
        }
        const location = `${relative(repositoryRoot, path).replaceAll("\\", "/")}:${m[2]}:${m[3]}`;
        if (isDiagnosticLocation(location)) locations.add(location);
      } catch {
        /* A malformed location is not diagnostic evidence. */
      }
      if (locations.size === 3) return [...locations];
    }
  }
  return [...locations];
}
const sqlStatePattern =
  /^(?:00|01|02|03|08|09|0A|0B|0F|0L|0P|0Z|20|21|22|23|24|25|26|27|28|2B|2D|2F|34|38|39|3B|3D|3F|40|42|44|53|54|55|57|58|F0|HV|P0|XX)[0-9A-Z]{3}$/;
export function sqlState(error: unknown): string | undefined {
  for (const cause of errorChain(error)) {
    const code = field(cause, "code");
    if (typeof code === "string" && sqlStatePattern.test(code)) return code;
  }
  return undefined;
}
export function diagnosticFor(
  operation: DiagnosticOperation,
  error?: unknown,
  fallback: DiagnosticCode = "HH_UNEXPECTED",
): Diagnostic & { code?: string } {
  let errorCode = fallback;
  const code = sqlState(error);
  if (code) {
    errorCode = code.startsWith("23")
      ? "HH_DATABASE_CONSTRAINT"
      : ["40001", "40P01"].includes(code)
        ? "HH_DATABASE_RETRY"
        : code.startsWith("08") || ["57P01", "57P02", "57P03"].includes(code)
          ? "HH_DATABASE_UNAVAILABLE"
          : "HH_DATABASE_FAILURE";
  } else {
    for (const cause of errorChain(error)) {
      if (cause instanceof ZodError) {
        errorCode = "HH_REQUEST_INVALID";
        break;
      }
      const systemCode = field(cause, "code");
      if (
        typeof systemCode === "string" &&
        [
          "ECONNREFUSED",
          "ECONNRESET",
          "EPIPE",
          "ENOTFOUND",
          "EAI_AGAIN",
        ].includes(systemCode)
      ) {
        errorCode =
          operation === "database.readiness" || operation === "zero.transaction"
            ? "HH_DATABASE_UNAVAILABLE"
            : "HH_DEPENDENCY_UNAVAILABLE";
        break;
      }
      if (
        systemCode === "ETIMEDOUT" ||
        field(cause, "name") === "TimeoutError"
      ) {
        errorCode = "HH_DEPENDENCY_TIMEOUT";
        break;
      }
    }
  }
  return {
    errorCode,
    operation,
    diagnosticMessage: diagnosticMessages[errorCode],
    locations: diagnosticLocations(error),
    ...(code ? { code } : {}),
  };
}
export function codeForStatus(status: number): DiagnosticCode {
  if (status === 400 || status === 422) return "HH_REQUEST_INVALID";
  if (status === 401) return "HH_AUTH_REQUIRED";
  if (status === 403) return "HH_ACCESS_DENIED";
  if (status === 404) return "HH_NOT_FOUND";
  if (status === 409) return "HH_CONFLICT";
  return status >= 500 ? "HH_SERVICE_UNAVAILABLE" : "HH_REQUEST_REJECTED";
}

// Records the deepest failed operation even when a service translates it into a
// safe HTTP error. Do not replace exceptions or change existing response semantics.
export function instrumentOperation<Args extends unknown[], Result>(
  operation: DiagnosticOperation,
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args) => withDiagnosticOperation(operation, () => run(...args));
}
export async function withDiagnosticOperation<T>(
  operation: DiagnosticOperation,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const context = diagnosticContext.getStore();
    if (context && !context.failure) context.failure = { operation, error };
    throw error;
  }
}
