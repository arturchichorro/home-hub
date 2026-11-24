import type { Diagnostic } from "@home-hub/shared/diagnostics";
import { DrizzleQueryError } from "drizzle-orm";
import { diagnosticFor, errorChain, sqlState } from "../diagnostics";
import type { ZeroDbProvider } from "./db-provider";

function databaseFailure(error: unknown): { code?: string } | undefined {
  const code = sqlState(error);

  return code || errorChain(error).some((e) => e instanceof DrizzleQueryError)
    ? code
      ? { code }
      : {}
    : undefined;
}

// Sanitize before Zero serializes transaction failures, including commit errors.
// Never attach the raw cause: Drizzle errors contain SQL and bound private text.
export function safeMutationProvider(
  provider: ZeroDbProvider,
  report: (failure: { code?: string; diagnostic: Diagnostic }) => void,
): ZeroDbProvider {
  return new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (property !== "transaction") {
        return value;
      }

      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          const failure = databaseFailure(error);

          if (!failure) {
            throw error;
          }

          report({
            ...failure,
            diagnostic: diagnosticFor(
              "zero.transaction",
              error,
              "HH_DATABASE_FAILURE",
            ),
          });

          throw new Error("Unable to save changes. Please retry.");
        }
      };
    },
  });
}
