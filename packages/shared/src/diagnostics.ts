import * as z from "zod";
import { diagnosticSources } from "./diagnostic-sources.gen.ts";

// Messages are code-owned, never interpolated from exceptions or request values.
export const diagnosticMessages = {
  HH_MUTATION_REJECTED:
    "A mutation did not complete. Inspect the operation, SQLSTATE and source locations.",
  HH_UNEXPECTED: "An unexpected application error interrupted this operation.",
  HH_DATABASE_CONSTRAINT:
    "A database integrity constraint rejected the operation.",
  HH_DATABASE_RETRY:
    "A database transaction failed with a retryable concurrency error.",
  HH_DATABASE_UNAVAILABLE:
    "The database connection was unavailable or interrupted.",
  HH_DATABASE_FAILURE:
    "A database operation failed. Inspect SQLSTATE and source locations.",
  HH_DEPENDENCY_TIMEOUT: "An upstream operation exceeded its deadline.",
  HH_DEPENDENCY_UNAVAILABLE:
    "An upstream connection was unavailable or interrupted.",
  HH_REQUEST_INVALID: "Request validation rejected the supplied input.",
  HH_AUTH_REQUIRED: "The operation requires an authenticated session.",
  HH_ACCESS_DENIED: "The operation was denied by its access policy.",
  HH_NOT_FOUND: "The requested resource or route was not available.",
  HH_CONFLICT: "The operation conflicted with the current saved state.",
  HH_SERVICE_UNAVAILABLE:
    "The service could not complete the operation at this time.",
  HH_REQUEST_REJECTED: "The server rejected the request.",
  HH_SHUTDOWN_FAILED: "Graceful shutdown did not complete successfully.",
} as const;

export const diagnosticOperations = [
  "http.request",
  "http.health",
  "database.readiness",
  "server.shutdown",
  "auth.signup",
  "auth.login",
  "auth.refresh",
  "auth.logout",
  "auth.me",
  "households.create",
  "households.list",
  "households.manage",
  "zero.query",
  "zero.mutate",
  "zero.transaction",
  "documents.create_upload",
  "documents.confirm_upload",
  "documents.read_file",
  "documents.storage_read",
  "documents.storage_write",
  "documents.storage_sign",
  "logs.read_entry",
  "logs.write_entry",
  "recipes.media_upload",
  "recipes.media_confirm",
  "recipes.media_read",
  "recipes.media_remove",
  "lists.media_upload",
  "lists.media_confirm",
  "lists.media_read",
  "lists.media_remove",
  "workouts.media_upload",
  "workouts.media_confirm",
  "workouts.media_read",
  "workouts.media_remove",
  "media.inspect_object",
  "media.process_image",
  "media.process_video",
] as const;

export type DiagnosticOperation = (typeof diagnosticOperations)[number];

export type DiagnosticCode = keyof typeof diagnosticMessages;

export const diagnosticCodeSchema = z.enum(
  Object.keys(diagnosticMessages) as [DiagnosticCode, ...DiagnosticCode[]],
);

export const diagnosticOperationSchema = z.enum(diagnosticOperations);

export function isDiagnosticLocation(value: string): boolean {
  const m = /^([^:\r\n]+):([1-9][0-9]{0,6}):([1-9][0-9]{0,3})$/.exec(value);

  if (!m) {
    return false;
  }

  const source = m[1] as keyof typeof diagnosticSources;
  const limit = diagnosticSources[source];

  return (
    Object.hasOwn(diagnosticSources, source) &&
    typeof limit === "number" &&
    Number(m[2]) <= limit &&
    Number(m[3]) <= 4096
  );
}

export const diagnosticLocationsSchema = z
  .array(z.string().max(160).refine(isDiagnosticLocation))
  .max(3);

export const diagnosticFieldsSchema = z
  .object({
    errorCode: diagnosticCodeSchema,
    operation: diagnosticOperationSchema,
    diagnosticMessage: z.string(),
    locations: diagnosticLocationsSchema,
  })
  .refine((d) => d.diagnosticMessage === diagnosticMessages[d.errorCode]);

export type Diagnostic = z.infer<typeof diagnosticFieldsSchema>;
