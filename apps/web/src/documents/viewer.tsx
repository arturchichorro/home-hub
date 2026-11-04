import {
  Button,
  DialogPopup,
  DialogRoot,
  IconButton,
  X,
} from "@home-hub/ui-web";
import { useEffect, useState } from "react";
import type { MediaSession } from "../media/session";
import { useBlockAppUpdate } from "../updates/activity";
import { readDocument } from "./api";
export function DocumentViewer({
  householdId,
  documentId,
  title,
  session,
  onClose,
}: {
  householdId: string;
  documentId: string;
  title: string;
  session: MediaSession;
  onClose: () => void;
}) {
  const [file, setFile] = useState<Awaited<ReturnType<typeof readDocument>>>(),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useBlockAppUpdate(true);
  const { accessToken, onSessionExpired, userId } = session;
  useEffect(() => {
    void attempt;
    let alive = true;
    setError(false);
    setFile(undefined);
    void readDocument(
      { accessToken, onSessionExpired, userId },
      householdId,
      documentId,
      "inline",
    ).then(
      (f) => {
        if (alive) setFile(f);
      },
      () => {
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [accessToken, onSessionExpired, userId, householdId, documentId, attempt]);
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        title={title}
        size="large"
        appearance="bare"
        className="rounded-sm border border-border bg-canvas p-4"
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </h2>
          <IconButton aria-label="Close document preview" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
        {error ? (
          <div role="alert">
            <p>Unable to preview this file.</p>
            <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Retry preview
            </Button>
          </div>
        ) : !file ? (
          <p className="text-sm text-muted">Loading document…</p>
        ) : (
          <>
            <div className="grid min-h-40 place-items-center">
              {file.contentType.startsWith("image/") ? (
                <img
                  src={file.url}
                  alt={title}
                  className="max-h-[75dvh] max-w-full object-contain"
                  onError={() => setError(true)}
                />
              ) : file.contentType === "application/pdf" ? (
                <iframe
                  title={title}
                  src={file.url}
                  className="h-[70dvh] w-full border-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <p>This file is available as a download.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Open file
              </a>
              <Button
                size="compact"
                variant="ghost"
                onClick={() =>
                  void downloadDocument(session, householdId, documentId).catch(
                    () => setError(true),
                  )
                }
              >
                Download
              </Button>
            </div>
          </>
        )}
      </DialogPopup>
    </DialogRoot>
  );
}
export async function downloadDocument(
  session: MediaSession,
  householdId: string,
  documentId: string,
) {
  const file = await readDocument(
    session,
    householdId,
    documentId,
    "attachment",
  );
  const a = document.createElement("a");
  a.href = file.url;
  a.download = file.filename;
  a.rel = "noreferrer";
  document.body.append(a);
  a.click();
  a.remove();
}
