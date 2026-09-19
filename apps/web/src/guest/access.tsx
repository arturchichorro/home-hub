import type { GuestAccessContextResponse } from "@home-hub/shared/guest-access";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getGuestAccessContext, zeroGuestAuthorization } from "./api";
import { guestCredentialFromHash } from "./credential";

type GuestAccessState = {
  loading: boolean;
  credential: string | null;
  context: GuestAccessContextResponse | null;
  clear: () => void;
  refreshAuthorization: () => Promise<
    { kind: "success"; accessToken: string } | { kind: "unauthorized" }
  >;
};

const GuestAccessContext = createContext<GuestAccessState | undefined>(
  undefined,
);

export function GuestAccessProvider({ children }: { children: ReactNode }) {
  const initialCredential = useMemo(
    () => guestCredentialFromHash(window.location.hash) ?? null,
    [],
  );
  const [credential, setCredential] = useState<string | null>(
    initialCredential,
  );
  const [context, setContext] = useState<GuestAccessContextResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(initialCredential !== null);

  const clear = useCallback(() => {
    setCredential(null);
    setContext(null);
  }, []);

  const refreshAuthorization = useCallback(async () => {
    if (!credential) return { kind: "unauthorized" as const };
    const result = await getGuestAccessContext(credential);
    if (result.kind === "success") {
      setContext(result.context);
      return {
        kind: "success" as const,
        accessToken: zeroGuestAuthorization(credential),
      };
    }
    clear();
    return { kind: "unauthorized" as const };
  }, [clear, credential]);

  useEffect(() => {
    if (!initialCredential) return;
    let active = true;
    void getGuestAccessContext(initialCredential)
      .then((result) => {
        if (!active) return;
        if (result.kind === "success") setContext(result.context);
        else setCredential(null);
      })
      .catch(() => {
        if (active) setCredential(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCredential]);

  useEffect(() => {
    if (!context) return;
    let timer: number | undefined;
    const scheduleExpiration = () => {
      const delay = Date.parse(context.expiresAt) - Date.now();
      if (delay <= 0) {
        clear();
        return;
      }
      timer = window.setTimeout(
        scheduleExpiration,
        Math.min(delay, 2_147_483_647),
      );
    };
    scheduleExpiration();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [clear, context]);

  return (
    <GuestAccessContext.Provider
      value={{
        loading,
        credential,
        context,
        clear,
        refreshAuthorization,
      }}
    >
      {children}
    </GuestAccessContext.Provider>
  );
}

export function useGuestAccess() {
  const value = useContext(GuestAccessContext);
  if (!value) throw new Error("GuestAccessProvider is missing");
  return value;
}
