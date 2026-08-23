import type { Zero } from "@rocicorp/zero";
import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession, type Session } from "./auth/api";
import { createAppRouter } from "./router";

type RootProps = {
  initialSession: Session | null;
};

export function Root({ initialSession }: RootProps) {
  const [session, setSession] = useState(initialSession);
  const [zero, setZero] = useState<Zero>();
  const onAuthenticated = useCallback((nextSession: Session) => {
    setZero(undefined);
    setSession(nextSession);
  }, []);
  const onAccessTokenRefreshed = useCallback((accessToken: string) => {
    setSession((currentSession) =>
      currentSession && currentSession.accessToken !== accessToken
        ? { ...currentSession, accessToken }
        : currentSession,
    );
  }, []);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onLoggedOut = useCallback(() => {
    setZero(undefined);
    setSession(null);
  }, []);
  const onSessionExpired = useCallback(() => {
    const expiredSession = sessionRef.current;
    if (!expiredSession) return;

    void refreshSession(expiredSession)
      .then((refreshedSession) => {
        if (sessionRef.current !== expiredSession) return;
        if (!refreshedSession) setZero(undefined);
        setSession(refreshedSession);
      })
      .catch(() => {
        // Keep the current session during transient refresh failures. Zero and
        // subsequent authenticated requests will retry the refresh flow.
      });
  }, []);
  const [router] = useState(() =>
    createAppRouter({
      session: initialSession,
      zero: undefined,
      onAuthenticated,
      onAccessTokenRefreshed,
      onLoggedOut,
      onSessionExpired,
      onZeroReady: setZero,
    }),
  );
  const previousContext = useRef({ session, zero });

  useEffect(() => {
    if (
      previousContext.current.session === session &&
      previousContext.current.zero === zero
    ) {
      return;
    }

    previousContext.current = { session, zero };
    void router.invalidate();
  }, [router, session, zero]);

  return (
    <RouterProvider
      router={router}
      context={{
        session,
        zero,
        onAuthenticated,
        onAccessTokenRefreshed,
        onLoggedOut,
        onSessionExpired,
        onZeroReady: setZero,
      }}
    />
  );
}
