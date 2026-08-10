import type { Zero } from "@rocicorp/zero";
import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "./auth/api";
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
  const onSessionExpired = useCallback(() => {
    setZero(undefined);
    setSession(null);
  }, []);
  const [router] = useState(() =>
    createAppRouter({
      session: initialSession,
      zero: undefined,
      onAuthenticated,
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
        onSessionExpired,
        onZeroReady: setZero,
      }}
    />
  );
}
