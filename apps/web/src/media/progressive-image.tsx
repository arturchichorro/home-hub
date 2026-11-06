import { useCallback, useEffect, useRef, useState } from "react";

// Both derivatives occupy one fixed, viewport-fitted frame. A transparent overlay
// fades IN over an opaque fallback; fading both layers would expose the backdrop.
export function ProgressiveImage({
  thumbnailUrl,
  viewerUrl,
  alt,
  error,
  onViewerLoad,
}: {
  thumbnailUrl: string | undefined;
  viewerUrl: string | undefined;
  alt: string;
  error: boolean;
  onViewerLoad?: (url: string) => void;
}) {
  const [layers, setLayers] = useState<{
    current?: string;
    previous?: string;
    settled?: string;
    hideThumbnail?: boolean;
  }>({});
  const [failed, setFailed] = useState<string>();
  const [failedThumbnail, setFailedThumbnail] = useState<string>();
  const mounted = useRef(true);
  const latest = useRef(viewerUrl);
  const callback = useRef(onViewerLoad);
  const frames = useRef(new Set<number>());
  const notified = useRef<string | undefined>(undefined);
  latest.current = viewerUrl;
  callback.current = onViewerLoad;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      for (const id of frames.current) {
        cancelAnimationFrame(id);
      }

      frames.current.clear();
    };
  }, []);

  const finish = useCallback((url: string) => {
    if (!mounted.current) {
      return;
    }

    setLayers((current) =>
      current.current === url && (current.previous || current.settled !== url)
        ? { current: url, settled: url, hideThumbnail: true }
        : current,
    );

    if (latest.current === url && notified.current !== url) {
      notified.current = url;
      callback.current?.(url);
    }
  }, []);

  useEffect(() => {
    if (!layers.current) {
      return;
    }

    // Transition events do not fire for reduced motion, or in every hidden tab.
    const url = layers.current;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = setTimeout(() => finish(url), reducedMotion ? 0 : 250);

    return () => clearTimeout(timer);
  }, [layers.current, finish]);

  function nextFrame(run: () => void) {
    const id = requestAnimationFrame(() => {
      frames.current.delete(id);
      run();
    });
    frames.current.add(id);
  }

  async function decoded(node: HTMLImageElement, url: string) {
    try {
      await node.decode();

      if (!mounted.current || latest.current !== url || !node.isConnected) {
        return;
      }

      // Cached images can decode before the first paint. Give opacity:0 a paint
      // before switching to opacity:1, rather than flashing the final layer in.
      nextFrame(() =>
        nextFrame(() => {
          if (!mounted.current || latest.current !== url || !node.isConnected) {
            return;
          }

          setLayers((current) =>
            current.current === url
              ? current
              : {
                  current: url,
                  hideThumbnail: !!current.hideThumbnail,
                  ...(current.current ? { previous: current.current } : {}),
                },
          );
        }),
      );
    } catch {
      if (mounted.current && latest.current === url) {
        setFailed(url);
      }
    }
  }

  const urls = [
    ...new Set(
      [layers.previous, layers.current, viewerUrl].filter(
        (url): url is string => !!url,
      ),
    ),
  ];
  const hasThumbnail = thumbnailUrl && failedThumbnail !== thumbnailUrl;
  const available = hasThumbnail || layers.current;

  return (
    <div
      className="relative mx-auto h-[90svh] w-full"
      role="img"
      aria-label={alt}
    >
      {hasThumbnail && (
        <img
          src={thumbnailUrl}
          alt=""
          draggable={false}
          className={`absolute inset-0 size-full object-contain ${layers.hideThumbnail ? "invisible" : ""}`}
          onError={() => setFailedThumbnail(thumbnailUrl)}
        />
      )}
      {urls.map((url) => (
        <img
          key={url}
          src={url}
          decoding="async"
          alt=""
          draggable={false}
          className={`absolute inset-0 size-full object-contain transition-opacity duration-200 ease-out motion-reduce:transition-none ${url === layers.current || url === layers.previous ? "opacity-100" : "opacity-0"}`}
          onLoad={(event) => {
            if (url === latest.current && url !== layers.current) {
              void decoded(event.currentTarget, url);
            }
          }}
          onError={() => {
            if (mounted.current && latest.current === url) {
              setFailed(url);
            }
          }}
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && url === layers.current) {
              finish(url);
            }
          }}
        />
      ))}
      {!available && (error || (failed === viewerUrl && !!viewerUrl)) ? (
        <p
          role="alert"
          className="absolute inset-0 grid place-items-center text-muted"
        >
          This image is not currently available.
        </p>
      ) : !thumbnailUrl && !viewerUrl ? (
        <span className="sr-only">Loading image</span>
      ) : null}
    </div>
  );
}
