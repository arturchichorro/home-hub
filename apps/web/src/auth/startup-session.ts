import { restoreSession, type Session } from "./api";
import { loadOfflineSession } from "./session-bootstrap";

const sessionRestoreTimeoutMilliseconds = 8_000;

type StartupSessionResult =
  | { kind: "online"; session: Session | null }
  | { kind: "offline"; session: Session | null }
  | { kind: "error" };

type StartupSessionDependencies = {
  loadOffline?: () => Session | null;
  online?: boolean;
  restore?: (options: { signal: AbortSignal }) => Promise<Session | null>;
  timeoutMilliseconds?: number;
};

function isConnectionFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export async function restoreStartupSession({
  loadOffline = loadOfflineSession,
  online = navigator.onLine,
  restore = restoreSession,
  timeoutMilliseconds = sessionRestoreTimeoutMilliseconds,
}: StartupSessionDependencies = {}): Promise<StartupSessionResult> {
  if (!online) return { kind: "offline", session: loadOffline() };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    return {
      kind: "online",
      session: await restore({ signal: controller.signal }),
    };
  } catch (error) {
    return isConnectionFailure(error)
      ? { kind: "offline", session: loadOffline() }
      : { kind: "error" };
  } finally {
    clearTimeout(timeout);
  }
}
