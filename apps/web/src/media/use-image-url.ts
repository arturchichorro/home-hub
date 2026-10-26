import { useEffect, useState } from "react";
import type { ImageReadResult } from "./create-image-url-cache";
export function createUseImageUrl<Identity>(options: {
  key: (identity: Identity) => string;
  read: (identity: Identity) => { url: string; refreshAt: number } | undefined;
  resolve: (identity: Identity) => Promise<ImageReadResult>;
}) {
  return function useImageUrl(
    identity: Identity | undefined,
    onSessionExpired: () => void,
  ) {
    const key = identity ? options.key(identity) : undefined;
    const cached = identity ? options.read(identity) : undefined;
    const [state, setState] = useState<{
      key: string | undefined;
      url: string | undefined;
      error: boolean;
    }>({ key, url: cached?.url, error: false });
    const matches = state.key === key;
    const url = cached?.url ?? (matches ? state.url : undefined);
    const error = matches && state.error;
    useEffect(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (!identity) return;
      const current = identity;
      const currentKey = options.key(current);
      const schedule = (at: number) => {
        timer = setTimeout(
          () => void load().catch(failed),
          Math.max(0, at - Date.now()),
        );
      };
      const failed = () => {
        if (active) setState({ key: currentKey, url: undefined, error: true });
      };
      async function load() {
        const existing = options.read(current);
        if (existing) {
          if (active) {
            setState({ key: currentKey, url: existing.url, error: false });
            schedule(existing.refreshAt);
          }
          return;
        }
        if (active) setState({ key: currentKey, url: undefined, error: false });
        const result = await options.resolve(current);
        if (!active) return;
        if (result.kind === "success") {
          setState({ key: currentKey, url: result.url, error: false });
          const next = options.read(current);
          if (next) schedule(next.refreshAt);
        } else if (result.kind === "unauthorized") onSessionExpired();
        else failed();
      }
      void load().catch(failed);
      return () => {
        active = false;
        if (timer !== undefined) clearTimeout(timer);
      };
    }, [identity, onSessionExpired]);
    return { url, error, loading: Boolean(identity) && !url && !error };
  };
}
