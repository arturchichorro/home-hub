import { DrizzleQueryError } from "drizzle-orm";
import type { ZeroDbProvider } from "./db-provider";

function databaseFailure(error: unknown): { code?: string } | undefined {
  const seen = new Set<unknown>();
  let found = false;
  let code: string | undefined;
  for (
    let depth = 0;
    depth < 12 && error instanceof Error && !seen.has(error);
    depth++
  ) {
    seen.add(error);
    found ||= error instanceof DrizzleQueryError;
    if (
      "code" in error &&
      typeof error.code === "string" &&
      /^[0-9A-Z]{5}$/.test(error.code)
    ) {
      code = error.code;
      found = true;
    }
    error = error.cause;
  }
  return found ? (code ? { code } : {}) : undefined;
}

// Sanitize before Zero serializes transaction failures, including commit errors.
// Never attach the raw cause: Drizzle errors contain SQL and bound private text.
export function safeMutationProvider(
  provider: ZeroDbProvider,
  report: (failure: { code?: string }) => void,
): ZeroDbProvider {
  return new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "transaction") return value;
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          const failure = databaseFailure(error);
          if (!failure) throw error;
          report(failure);
          throw new Error("Unable to save changes. Please retry.");
        }
      };
    },
  });
}
