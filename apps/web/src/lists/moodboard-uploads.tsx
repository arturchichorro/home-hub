import { createListMediaUploadSchema } from "@home-hub/shared/list-media";
import { maxVideoDurationMs } from "@home-hub/shared/media";
import {
  Button,
  DialogPopup,
  DialogRoot,
  IconButton,
  InlineAlert,
  Plus,
} from "@home-hub/ui-web";
import { useBlocker } from "@tanstack/react-router";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { readImageDimensions } from "../media/read-image-dimensions";
import type { MediaSession } from "../media/session";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { confirmListImage, requestListImageUpload } from "./list-media-api";

type Job = {
  id: string;
  file: File;
  status: string;
  progress: number;
  error?: string | undefined;
  attachmentId?: string;
  uploaded?: boolean;
  running?: boolean;
  done?: boolean;
};
function videoDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const element = document.createElement("video"),
      url = URL.createObjectURL(file);
    element.preload = "metadata";
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
    timer = setTimeout(() => {
      finish();
      reject(Error("Unable to read this video."));
    }, 10000);
    element.onerror = () => {
      finish();
      reject(Error("This video cannot be opened by your browser."));
    };
    element.onloadedmetadata = () => {
      const dimensions = {
          width: element.videoWidth,
          height: element.videoHeight,
        },
        duration = element.duration;
      finish();
      if (
        !Number.isFinite(duration) ||
        duration * 1000 > maxVideoDurationMs ||
        duration <= 0
      )
        reject(Error("Choose a video up to 10 minutes."));
      else resolve(dimensions);
    };
    element.src = url;
  });
}
function put(
  file: File,
  upload: { url: string; requiredHeaders: Record<string, string> },
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(),
      abort = () => xhr.abort();
    xhr.open("PUT", upload.url);
    for (const [k, v] of Object.entries(upload.requiredHeaders))
      xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.timeout = 300000;
    const fail = () =>
      reject(Error("Upload interrupted. Your file is still here; retry."));
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = fail;
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : fail();
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      reject(Error("Cancelled"));
      return;
    }
    xhr.send(file);
  });
}
function UploadHeaderAction({
  input,
  disabled,
}: {
  input: RefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  const action = useMemo(
    () => (
      <IconButton
        aria-label="Add images or videos"
        title="Add images or videos"
        className="size-7!"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Plus className="size-4" aria-hidden="true" />
      </IconButton>
    ),
    [input, disabled],
  );
  useAppHeaderRightComponent(action);
  return null;
}
export function MoodboardUploads({
  householdId,
  listId,
  session,
  onBusy,
}: {
  householdId: string;
  listId: string;
  session: MediaSession;
  onBusy: (busy: boolean) => void;
}) {
  const cancelled = useRef(new Set<string>()),
    chain = useRef(Promise.resolve());
  const [jobs, setJobs] = useState<Job[]>([]),
    ref = useRef<HTMLInputElement>(null),
    active = useRef(new Map<string, AbortController>()),
    mounted = useRef(true);
  const enabled = useZeroMutationEnabled(),
    dirty = jobs.some((j) => !j.done);
  useBlockAppUpdate(dirty);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });
  useEffect(() => {
    onBusy(dirty);
    return () => onBusy(false);
  }, [dirty, onBusy]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of active.current.values()) controller.abort();
    };
  }, []);
  function update(id: string, patch: Partial<Job>) {
    if (mounted.current)
      setJobs((rows) =>
        rows.map((j) => (j.id === id ? { ...j, ...patch } : j)),
      );
  }
  const sessionRef = useRef(session),
    enabledRef = useRef(enabled);
  sessionRef.current = session;
  enabledRef.current = enabled;
  async function upload(job: Job) {
    if (cancelled.current.has(job.id) || active.current.has(job.id)) return;
    if (!enabledRef.current) {
      update(job.id, {
        running: false,
        status: "Failed",
        error: "Reconnect, then retry this file.",
      });
      return;
    }
    const controller = new AbortController();
    active.current.set(job.id, controller);
    update(job.id, { running: true, error: undefined });
    try {
      let attachmentId = job.attachmentId;
      if (!job.uploaded) {
        const dimensions = job.file.type.startsWith("video/")
          ? await videoDimensions(job.file)
          : await readImageDimensions(job.file);
        const metadata = createListMediaUploadSchema.safeParse({
          contentType: job.file.type,
          byteSize: job.file.size,
          ...dimensions,
        });
        if (!metadata.success)
          throw Error(
            "Choose JPEG/PNG/WebP up to 10 MiB, or MP4/WebM up to 100 MiB (maximum 4096 pixels per video side).",
          );
        const pending = await requestListImageUpload({
          ...sessionRef.current,
          householdId,
          listId,
          ...metadata.data,
        });
        if (pending.kind === "unauthorized") {
          session.onSessionExpired();
          throw Error("Sign in again before retrying.");
        }
        if (pending.kind !== "success")
          throw Error("This moodboard is unavailable.");
        attachmentId = pending.attachmentId;
        update(job.id, { attachmentId, status: "Uploading" });
        await put(job.file, pending.upload, controller.signal, (progress) =>
          update(job.id, { progress }),
        );
        update(job.id, { uploaded: true });
      }
      if (controller.signal.aborted) return;
      update(job.id, { status: "Processing" });
      const result = await confirmListImage({
        ...sessionRef.current,
        householdId,
        listId,
        attachmentId: attachmentId as string,
      });
      if (result.kind === "unauthorized") session.onSessionExpired();
      if (result.kind === "invalid_upload")
        throw Error(
          "Unsupported or invalid media. Videos need H.264/AAC MP4 or VP8/VP9 WebM, up to 10 minutes; animated images are not supported.",
        );
      if (result.kind !== "success")
        throw Error("Unable to confirm this upload. Retry shortly.");
      update(job.id, {
        done: true,
        status: "Added",
        running: false,
        progress: 100,
      });
    } catch (error) {
      update(job.id, {
        running: false,
        status: "Failed",
        error:
          error instanceof Error
            ? error.message
            : "Unable to add media. Retry.",
      });
    } finally {
      active.current.delete(job.id);
    }
  }
  function discard() {
    for (const job of jobs) cancelled.current.add(job.id);
    for (const c of active.current.values()) c.abort();
    setJobs([]);
  }
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <UploadHeaderAction input={ref} disabled={!enabled} />
      <input
        ref={ref}
        className="sr-only"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          const batch = files.map((file) => ({
            id: crypto.randomUUID(),
            file,
            status: "Queued",
            progress: 0,
          }));
          setJobs((rows) => [...rows, ...batch]);
          chain.current = chain.current.then(async () => {
            for (const job of batch) {
              if (!mounted.current) break;
              await upload(job);
            }
          });
        }}
      />
      {jobs.some((job) => job.done) && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span role="status">
            {jobs.filter((job) => job.done).length} added
          </span>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => setJobs((rows) => rows.filter((job) => !job.done))}
          >
            Dismiss
          </Button>
        </div>
      )}
      {jobs.some((job) => !job.done) && (
        <ul
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2"
          aria-label="Media uploads"
        >
          {jobs
            .filter((job) => !job.done)
            .map((job) => (
              <li
                key={job.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-md border border-border p-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{job.file.name}</span>
                  <span role="status" className="shrink-0 text-xs text-muted">
                    {job.status}
                    {job.status === "Uploading" ? ` ${job.progress}%` : ""}
                  </span>
                </div>
                {job.error && (
                  <InlineAlert variant="danger" role="alert">
                    {job.error}
                  </InlineAlert>
                )}
                {!job.running && (
                  <div className="flex gap-2">
                    {job.error && (
                      <Button
                        size="compact"
                        disabled={!enabled}
                        onClick={() => void upload(job)}
                      >
                        Retry
                      </Button>
                    )}
                    <Button
                      size="compact"
                      variant="ghost"
                      onClick={() => {
                        cancelled.current.add(job.id);
                        setJobs((rows) => rows.filter((j) => j.id !== job.id));
                      }}
                    >
                      {job.done ? "Dismiss" : "Discard"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}
      <DialogRoot
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <DialogPopup
          title="Leave this moodboard?"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => blocker.status === "blocked" && blocker.reset()}
              >
                Keep editing
              </Button>
              <Button
                variant="danger"
                disabled={jobs.some((job) => job.running)}
                onClick={() => {
                  discard();
                  if (blocker.status === "blocked") blocker.proceed();
                }}
              >
                Discard uploads and leave
              </Button>
            </>
          }
        >
          <p>
            Unfinished or failed uploads are kept here until you retry or
            discard them. Wait for an active upload to finish before leaving.
            Leaving loses the selected local files.
          </p>
        </DialogPopup>
      </DialogRoot>
    </div>
  );
}
