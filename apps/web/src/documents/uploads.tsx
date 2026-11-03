import {
  documentFormats,
  documentInitialTitle,
  documentUploadSchema,
} from "@home-hub/shared/documents";
import { Button, IconButton, Upload } from "@home-hub/ui-web";
import { useEffect, useRef, useState } from "react";
import type { MediaSession } from "../media/session";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  beginDocumentUpload,
  confirmDocumentUpload,
  type UploadSession,
  uploadDocumentBytes,
} from "./api";
import { DocumentWorkGuard } from "./work-guard";
export function DocumentUpload({
  session,
  householdId,
  documentId,
  onWork,
  onSaved,
}: {
  session: MediaSession;
  householdId: string;
  documentId?: string;
  onWork?: (key: string, busy: boolean) => void;
  onSaved?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    mounted = useRef(true),
    enabled = useZeroMutationEnabled();
  const [file, setFile] = useState<File>(),
    [pending, setPending] = useState<UploadSession>(),
    [uploaded, setUploaded] = useState(false),
    [started, setStarted] = useState(0),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0),
    [phase, setPhase] = useState(""),
    [error, setError] = useState<string>();
  const key = `${documentId ?? "new"}:upload`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onWork?.(key, !!file || busy);
    return () => onWork?.(key, false);
  }, [onWork, key, file, busy]);
  function discard() {
    if (lock.current) return;
    setFile(undefined);
    setPending(undefined);
    setUploaded(false);
    setError(undefined);
    setPercent(0);
    setPhase("");
  }
  async function run(chosen: File) {
    if (lock.current || !enabled) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setFile(chosen);
    try {
      const validation = documentUploadSchema.safeParse({
        filename: chosen.name,
        byteSize: chosen.size,
        ...(documentId ? { documentId } : {}),
      });
      if (!validation.success)
        throw Error("Choose a supported document up to 50 MiB.");
      let upload = pending,
        alreadyUploaded = uploaded;
      if (!upload || (!alreadyUploaded && Date.now() - started > 240000)) {
        setPhase("Preparing");
        upload = await beginDocumentUpload(
          session,
          householdId,
          chosen,
          documentId,
        );
        setPending(upload);
        setStarted(Date.now());
        alreadyUploaded = false;
        setUploaded(false);
      }
      if (!alreadyUploaded) {
        setPhase("Uploading");
        await uploadDocumentBytes(chosen, upload.url, (n) => {
          if (mounted.current) setPercent(n);
        });
        setUploaded(true);
      }
      setPhase("Checking file");
      await confirmDocumentUpload(session, householdId, upload.fileId);
      if (mounted.current) {
        setFile(undefined);
        setPending(undefined);
        setUploaded(false);
        setPhase("Uploaded");
        onSaved?.();
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Unable to upload this document.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={documentId ? "" : "grid gap-2"}>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label={
          documentId ? "Choose replacement file" : "Choose document file"
        }
        accept={Object.keys(documentFormats)
          .map((e) => `.${e}`)
          .join(",")}
        disabled={!enabled || !!file}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen) void run(chosen);
        }}
      />
      {documentId ? (
        <IconButton
          aria-label="Replace document file"
          className="size-7!"
          disabled={!enabled || !!file}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" className="size-4" />
        </IconButton>
      ) : (
        <Button
          disabled={!enabled || !!file}
          onClick={() => input.current?.click()}
        >
          Upload document
        </Button>
      )}
      {file ? (
        <div
          className={
            documentId
              ? "mt-2 max-w-64 text-xs"
              : "border-b border-border py-3 text-sm"
          }
          aria-busy={busy}
        >
          <p className="break-words">{documentInitialTitle(file.name)}</p>
          <p className="text-muted" aria-live="polite">
            {error ?? `${phase}${phase === "Uploading" ? ` ${percent}%` : ""}…`}
          </p>
          {error ? (
            <div className="flex gap-2">
              <Button
                size="compact"
                variant="ghost"
                disabled={!enabled || busy}
                onClick={() => void run(file)}
              >
                Retry
              </Button>
              <Button
                size="compact"
                variant="ghost"
                disabled={busy}
                onClick={discard}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      ) : !documentId && phase === "Uploaded" ? (
        <span role="status" className="text-xs text-muted">
          Document uploaded.
        </span>
      ) : null}
      {file || busy ? (
        <DocumentWorkGuard dirty={!!file} busy={busy} discard={discard} />
      ) : null}
    </div>
  );
}
