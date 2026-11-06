import {
  documentFormats,
  documentInitialTitle,
  documentUploadSchema,
} from "@home-hub/shared/documents";
import { Button, IconButton, Plus, Upload } from "@home-hub/ui-web";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
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
  trigger,
}: {
  session: MediaSession;
  householdId: string;
  documentId?: string;
  onWork?: (key: string, busy: boolean) => void;
  onSaved?: () => void;
  trigger?: (props: { choose: () => void; disabled: boolean }) => ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const enabled = useZeroMutationEnabled();
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState<UploadSession>();
  const [uploaded, setUploaded] = useState(false);
  const [started, setStarted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string>();
  const key = `${documentId ?? "new"}:upload`;
  const chooseFile = useCallback(() => input.current?.click(), []);

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
    if (lock.current) {
      return;
    }

    setFile(undefined);
    setPending(undefined);
    setUploaded(false);
    setError(undefined);
    setPercent(0);
    setPhase("");
  }

  async function run(chosen: File) {
    if (lock.current || !enabled) {
      return;
    }

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

      if (!validation.success) {
        throw Error("Choose a supported document up to 50 MiB.");
      }

      let upload = pending;
      let alreadyUploaded = uploaded;

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
          if (mounted.current) {
            setPercent(n);
          }
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
      if (mounted.current) {
        setError(
          e instanceof Error ? e.message : "Unable to upload this document.",
        );
      }
    } finally {
      lock.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div className={documentId ? "" : "contents"}>
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

          if (chosen) {
            void run(chosen);
          }
        }}
      />
      {trigger ? (
        trigger({
          choose: () => input.current?.click(),

          disabled: !enabled || !!file,
        })
      ) : documentId ? (
        <IconButton
          aria-label="Replace document file"
          className="size-7!"
          disabled={!enabled || !!file}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" className="size-4" />
        </IconButton>
      ) : (
        <DocumentUploadHeaderAction
          disabled={!enabled || !!file}
          choose={chooseFile}
        />
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
        <span role="status" className="sr-only">
          Document uploaded.
        </span>
      ) : null}
      {file || busy ? (
        <DocumentWorkGuard dirty={!!file} busy={busy} discard={discard} />
      ) : null}
    </div>
  );
}

// Register only the control in the header; upload/draft state stays on the page.
function DocumentUploadHeaderAction({
  choose,
  disabled,
}: {
  choose: () => void;
  disabled: boolean;
}) {
  const action = useMemo(
    () => (
      <IconButton
        aria-label="Upload document"
        title="Upload document"
        className="size-7!"
        disabled={disabled}
        onClick={choose}
      >
        <Plus aria-hidden="true" className="size-4" />
      </IconButton>
    ),
    [choose, disabled],
  );
  useAppHeaderRightComponent(action);

  return null;
}
