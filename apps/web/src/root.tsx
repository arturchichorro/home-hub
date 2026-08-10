import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Session } from "./auth/api";
import { createAppRouter } from "./router";

type RootProps = {
  initialSession: Session | null;
};

export function Root({ initialSession }: RootProps) {
  const [session, setSession] = useState(initialSession);
  const [router] = useState(() =>
    createAppRouter({
      session: initialSession,
      onAuthenticated: setSession,
      onSessionExpired: () => setSession(null),
    }),
  );
  const previousSession = useRef(session);

  useEffect(() => {
    if (previousSession.current === session) return;

    previousSession.current = session;
    void router.invalidate();
  }, [router, session]);

  return (
    <RouterProvider
      router={router}
      context={{
        session,
        onAuthenticated: setSession,
        onSessionExpired: () => setSession(null),
      }}
    />
  );
}
