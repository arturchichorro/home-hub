import {
  type CreateRecipeImageUploadResponse,
  createRecipeImageUploadRequestSchema,
  recipeImageContentTypeSchema,
} from "@home-hub/shared/recipe-images";
import type { RecipeCookLog } from "@home-hub/shared/zero/schema";
import { type SubmitEvent, useRef, useState } from "react";
import {
  confirmRecipeImageUpload,
  deleteRecipeImage,
  requestRecipeImageUpload,
  uploadRecipeImageObject,
} from "./image-api";
import { readImageDimensions } from "./read-image-dimensions";

type RecipeImageUploadFormProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  cookLogs: readonly RecipeCookLog[];
  position: number;
  onSessionExpired: () => void;
};

type PendingUpload = {
  imageId: string;
  file: File;
  upload: CreateRecipeImageUploadResponse["upload"];
};

type UploadStage = "idle" | "preparing" | "uploading" | "confirming";

const cookLogDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RecipeImageUploadForm({
  accessToken,
  householdId,
  recipeId,
  cookLogs,
  position,
  onSessionExpired,
}: RecipeImageUploadFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [cookLogId, setCookLogId] = useState("");
  const [pendingUpload, setPendingUpload] = useState<PendingUpload>();
  const [stage, setStage] = useState<UploadStage>("idle");
  const [message, setMessage] = useState<string>();
  const busy = stage !== "idle";

  function handleExpectedFailure(kind: string): boolean {
    if (kind === "unauthorized") {
      onSessionExpired();
      return true;
    }
    if (kind === "forbidden") {
      setMessage("Recipe images are not available for this household.");
      return true;
    }
    if (kind === "not_found") {
      setMessage("The recipe or pending image no longer exists.");
      return true;
    }
    return false;
  }

  function resetForm() {
    setPendingUpload(undefined);
    setSelectedFile(undefined);
    setCookLogId("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadAndConfirm(pending: PendingUpload) {
    try {
      setMessage(undefined);
      setStage("uploading");
      await uploadRecipeImageObject({
        file: pending.file,
        upload: pending.upload,
      });

      setStage("confirming");
      const confirmation = await confirmRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        imageId: pending.imageId,
      });

      if (confirmation.kind === "success") {
        resetForm();
        setMessage("Image uploaded. Waiting for synchronization…");
        return;
      }

      if (handleExpectedFailure(confirmation.kind)) return;

      if (confirmation.kind === "upload_not_found") {
        setMessage("R2 has not received the image yet. Retry the upload.");
        return;
      }

      setMessage(
        "The uploaded object's type or size did not match. Discard it and try again.",
      );
    } catch {
      setMessage(
        "The upload could not be completed. Retry it, or discard it if the URL expired.",
      );
    } finally {
      setStage("idle");
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || busy || pendingUpload) return;

    const parsedContentType = recipeImageContentTypeSchema.safeParse(
      selectedFile.type,
    );
    if (!parsedContentType.success) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    try {
      setStage("preparing");
      setMessage(undefined);
      const dimensions = await readImageDimensions(selectedFile);
      const request = createRecipeImageUploadRequestSchema.safeParse({
        cookLogId: cookLogId || null,
        contentType: parsedContentType.data,
        byteSize: selectedFile.size,
        width: dimensions.width,
        height: dimensions.height,
        position,
      });

      if (!request.success) {
        setMessage(
          "The image must be under 10 MiB and no larger than 16,384 pixels per side.",
        );
        return;
      }

      const result = await requestRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        ...request.data,
      });
      if (result.kind !== "success") {
        handleExpectedFailure(result.kind);
        return;
      }

      const pending = {
        imageId: result.imageId,
        file: selectedFile,
        upload: result.upload,
      };
      setPendingUpload(pending);
      await uploadAndConfirm(pending);
    } catch {
      setMessage("The selected file could not be prepared for upload.");
    } finally {
      setStage("idle");
    }
  }

  async function discardPendingUpload() {
    if (!pendingUpload || busy) return;

    try {
      setStage("preparing");
      setMessage(undefined);
      const result = await deleteRecipeImage({
        accessToken,
        householdId,
        recipeId,
        imageId: pendingUpload.imageId,
      });
      if (result.kind !== "success") {
        handleExpectedFailure(result.kind);
        return;
      }
      resetForm();
      setMessage("Pending image discarded.");
    } catch {
      setMessage("The pending image could not be discarded.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="recipe-image-file">Image</label>
      <input
        ref={fileInput}
        id="recipe-image-file"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        disabled={busy || Boolean(pendingUpload)}
        onChange={(event) => setSelectedFile(event.target.files?.[0])}
      />

      <label htmlFor="recipe-image-cook-log">Cooking log (optional)</label>
      <select
        id="recipe-image-cook-log"
        name="cookLogId"
        value={cookLogId}
        disabled={busy || Boolean(pendingUpload)}
        onChange={(event) => setCookLogId(event.target.value)}
      >
        <option value="">Recipe in general</option>
        {cookLogs.map((cookLog) => (
          <option key={cookLog.id} value={cookLog.id}>
            {cookLogDateFormatter.format(new Date(cookLog.cookedAt))}
            {cookLog.comment ? ` — ${cookLog.comment}` : ""}
          </option>
        ))}
      </select>

      {pendingUpload ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void uploadAndConfirm(pendingUpload)}
          >
            Retry upload
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void discardPendingUpload()}
          >
            Discard pending image
          </button>
        </>
      ) : (
        <button type="submit" disabled={busy || !selectedFile}>
          Upload image
        </button>
      )}

      {stage === "preparing" ? <p>Preparing image…</p> : null}
      {stage === "uploading" ? <p>Uploading image…</p> : null}
      {stage === "confirming" ? <p>Confirming upload…</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
