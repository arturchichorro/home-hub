import type { GuestSessionResponse } from "@home-hub/shared/guest-access";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { refreshGuestSession } from "./api";

type GuestSessionState = {
  loading: boolean;
  session: GuestSessionResponse | null;
  setSession: (session: GuestSessionResponse | null) => void;
};

const GuestSessionContext = createContext<GuestSessionState | undefined>(
  undefined,
);

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setStoredSession] = useState<GuestSessionResponse | null>(
    null,
  );
  const setSession = useCallback((next: GuestSessionResponse | null) => {
    setStoredSession(next);
  }, []);

  useEffect(() => {
    let active = true;
    void refreshGuestSession()
      .then((result) => {
        if (active)
          setStoredSession(result.kind === "success" ? result.session : null);
      })
      .catch(() => {
        if (active) setStoredSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <GuestSessionContext.Provider value={{ loading, session, setSession }}>
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  const value = useContext(GuestSessionContext);
  if (!value) throw new Error("GuestSessionProvider is missing");
  return value;
}
