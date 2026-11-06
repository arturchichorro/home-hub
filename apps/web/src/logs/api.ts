import {
  type LogEntrySnapshot,
  type LogEntryWrite,
  logEntryResponseSchema,
} from "@home-hub/shared/logs";
import type { MediaSession } from "../media/session";

export class LogConflict extends Error {
  readonly entry: LogEntrySnapshot | null;

  constructor(entry: LogEntrySnapshot | null) {
    super("This entry changed elsewhere.");
    this.entry = entry;
  }
}

async function request(
  session: MediaSession,
  scope: { householdId: string; logId: string; entryOn: string },
  body?: LogEntryWrite,
) {
  const response = await fetch(
    `/api/households/${encodeURIComponent(scope.householdId)}/logs/${encodeURIComponent(scope.logId)}/entries/${encodeURIComponent(scope.entryOn)}`,
    {
      method: body ? "PUT" : "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );

  if (response.status === 401) {
    session.onSessionExpired();

    throw Error("Session expired.");
  }

  if (response.status === 409) {
    const data = logEntryResponseSchema.parse(await response.json());

    throw new LogConflict(data.entry);
  }

  if (!response.ok) {
    throw Error(
      response.status === 403 || response.status === 404
        ? "This log is no longer available."
        : "The note could not be saved. Please retry.",
    );
  }

  return logEntryResponseSchema.parse(await response.json()).entry;
}

export const writeLogEntry = (session: MediaSession, input: LogEntryWrite) =>
  request(session, input, input);

export const readLogEntry = (
  session: MediaSession,
  scope: { householdId: string; logId: string; entryOn: string },
) => request(session, scope);
