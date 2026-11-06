import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MediaSession } from "../media/session";
import { readDocument } from "./api";

type Manager = ReturnType<typeof createThumbnailManager>;

const Context = createContext<Manager | undefined>(undefined);

export function createThumbnailManager(
  session: MediaSession,
  householdId: string,
) {
  const cache = new Map<string, { url: string; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const targets = new Map<Element, () => void>();
  const queue: { run: () => void; cancel: () => void }[] = [];
  let active = 0;
  let disposed = false;
  let observer: IntersectionObserver | undefined;
  const pump = () => {
    while (active < 4 && queue.length) {
      active++;
      queue.shift()?.run();
    }
  };

  return {
    watch(element: Element, load: () => void) {
      if (typeof IntersectionObserver === "undefined") {
        load();

        return () => {};
      }

      observer ??= new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              const callback = targets.get(e.target);
              targets.delete(e.target);
              observer?.unobserve(e.target);
              callback?.();
            }
          }
        },
        { rootMargin: "160px" },
      );
      targets.set(element, load);
      observer.observe(element);

      return () => {
        targets.delete(element);
        observer?.unobserve(element);
      };
    },

    resolve(documentId: string, fileId: string) {
      const key = `${documentId}:${fileId}`;
      const cached = cache.get(key);

      if (cached && cached.expires > Date.now()) {
        return Promise.resolve(cached.url);
      }

      const running = pending.get(key);

      if (running) {
        return running;
      }

      const promise = new Promise<string>((resolve, reject) => {
        queue.push({
          cancel: () => reject(Error("Cancelled")),

          run: () => {
            void readDocument(session, householdId, documentId, "inline", true)
              .then((result) => {
                if (disposed || result.fileId !== fileId) {
                  throw Error("File changed");
                }

                if (cache.size >= 200) {
                  const oldest = cache.keys().next().value;

                  if (oldest) {
                    cache.delete(oldest);
                  }
                }

                cache.set(key, {
                  url: result.url,
                  expires: Date.now() + 14 * 60000,
                });
                resolve(result.url);
              })
              .catch(reject)
              .finally(() => {
                if (pending.get(key) === promise) {
                  pending.delete(key);
                }

                active--;
                pump();
              });
          },
        });
      });
      pending.set(key, promise);
      pump();

      return promise;
    },

    activate() {
      disposed = false;
    },

    dispose() {
      disposed = true;
      observer?.disconnect();
      targets.clear();
      cache.clear();
      pending.clear();

      for (const job of queue.splice(0)) {
        job.cancel();
      }
    },
  };
}

export function DocumentThumbnailProvider({
  session,
  householdId,
  children,
}: {
  session: MediaSession;
  householdId: string;
  children: ReactNode;
}) {
  const { accessToken, userId, onSessionExpired } = session;
  const manager = useMemo(
    () =>
      createThumbnailManager(
        { accessToken, userId, onSessionExpired },
        householdId,
      ),
    [accessToken, userId, onSessionExpired, householdId],
  );

  useEffect(() => {
    manager.activate();

    return () => manager.dispose();
  }, [manager]);

  return <Context.Provider value={manager}>{children}</Context.Provider>;
}

export function DocumentThumbnail({
  documentId,
  fileId,
  title,
}: {
  documentId: string;
  fileId: string;
  title: string;
}) {
  const manager = useContext(Context);
  const ref = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<{ key: string; url: string }>();
  const key = `${documentId}:${fileId}`;

  useEffect(() => {
    if (!manager || !ref.current) {
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void manager.resolve(documentId, fileId).then(
        (url) => {
          if (!alive) {
            return;
          }

          setImage({ key, url });
          timer = setTimeout(load, 14 * 60000);
        },
        () => {
          if (alive) {
            setImage(undefined);
          }
        },
      );
    };
    const unwatch = manager.watch(ref.current, load);

    return () => {
      alive = false;
      unwatch();

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [manager, documentId, fileId, key]);

  return (
    <span ref={ref} className="absolute inset-0">
      {image?.key === key ? (
        <img
          src={image.url}
          alt={title}
          width={48}
          height={48}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setImage(undefined)}
        />
      ) : null}
    </span>
  );
}
