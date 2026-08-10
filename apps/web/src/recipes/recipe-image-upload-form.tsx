import {
  type CreateRecipeImageUploadResponse,
  createRecipeImageUploadRequestSchema,
  recipeImageContentTypeSchema,
} from "@home-hub/shared/recipe-images";
import type { RecipeCookLog } from "@home-hub/shared/zero/schema";
import {
  Button,
  Field,
  FieldControl,
  InlineAlert,
  type InlineAlertVariant,
  SelectItem,
  SelectPopup,
  SelectRoot,
  SelectTrigger,
} from "@home-hub/ui-web";
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
type UploadAction = "upload" | "discard";

type UploadFeedback = {
  text: string;
  variant: InlineAlertVariant;
};

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
  const [action, setAction] = useState<UploadAction>();
  const [feedback, setFeedback] = useState<UploadFeedback>();
  const busy = stage !== "idle";

  function handleExpectedFailure(kind: string): boolean {
    if (kind === "unauthorized") {
      onSessionExpired();
      return true;
    }
    if (kind === "forbidden") {
      setFeedback({
        text: "Recipe images are not available for this household.",
        variant: "danger",
      });
      return true;
    }
    if (kind === "not_found") {
      setFeedback({
        text: "The recipe or pending image no longer exists.",
        variant: "danger",
      });
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
      setAction("upload");
      setFeedback(undefined);
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
        setFeedback({
          text: "Image uploaded. Waiting for synchronization…",
          variant: "success",
        });
        return;
      }

      if (handleExpectedFailure(confirmation.kind)) return;

      if (confirmation.kind === "upload_not_found") {
        setFeedback({
          text: "R2 has not received the image yet. Retry the upload.",
          variant: "warning",
        });
        return;
      }

      setFeedback({
        text: "The uploaded object's type or size did not match. Discard it and try again.",
        variant: "danger",
      });
    } catch {
      setFeedback({
        text: "The upload could not be completed. Retry it, or discard it if the URL expired.",
        variant: "danger",
      });
    } finally {
      setStage("idle");
      setAction(undefined);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || busy || pendingUpload) return;

    const parsedContentType = recipeImageContentTypeSchema.safeParse(
      selectedFile.type,
    );
    if (!parsedContentType.success) {
      setFeedback({
        text: "Choose a JPEG, PNG, or WebP image.",
        variant: "danger",
      });
      return;
    }

    try {
      setAction("upload");
      setStage("preparing");
      setFeedback(undefined);
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
        setFeedback({
          text: "The image must be under 10 MiB and no larger than 16,384 pixels per side.",
          variant: "danger",
        });
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
      setFeedback({
        text: "The selected file could not be prepared for upload.",
        variant: "danger",
      });
    } finally {
      setStage("idle");
      setAction(undefined);
    }
  }

  async function discardPendingUpload() {
    if (!pendingUpload || busy) return;

    try {
      setAction("discard");
      setStage("preparing");
      setFeedback(undefined);
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
      setFeedback({
        text: "Pending image discarded.",
        variant: "success",
      });
    } catch {
      setFeedback({
        text: "The pending image could not be discarded.",
        variant: "danger",
      });
    } finally {
      setStage("idle");
      setAction(undefined);
    }
  }

  const selectedCookLog = cookLogs.find((cookLog) => cookLog.id === cookLogId);
  const selectedTargetLabel = selectedCookLog
    ? `${cookLogDateFormatter.format(new Date(selectedCookLog.cookedAt))}${selectedCookLog.comment ? ` — ${selectedCookLog.comment}` : ""}`
    : "Recipe in general";
  const stageMessage = {
    preparing: "Preparing image…",
    uploading: "Uploading image…",
    confirming: "Confirming upload…",
  }[stage as Exclude<UploadStage, "idle">];

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <Field
        label="Image"
        description="JPEG, PNG, or WebP; up to 10 MiB."
        disabled={busy || Boolean(pendingUpload)}
      >
        <FieldControl
          ref={fileInput}
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
          onChange={(event) => setSelectedFile(event.target.files?.[0])}
        />
      </Field>

      <Field
        label="Attach to"
        description="Optionally associate the image with one cooking log."
        disabled={busy || Boolean(pendingUpload)}
      >
        <SelectRoot
          name="cookLogId"
          value={cookLogId || "recipe"}
          disabled={busy || Boolean(pendingUpload)}
          onValueChange={(value) =>
            setCookLogId(value === "recipe" || value === null ? "" : value)
          }
        >
          <SelectTrigger>{selectedTargetLabel}</SelectTrigger>
          <SelectPopup>
            <SelectItem value="recipe">Recipe in general</SelectItem>
            {cookLogs.map((cookLog) => (
              <SelectItem key={cookLog.id} value={cookLog.id}>
                {cookLogDateFormatter.format(new Date(cookLog.cookedAt))}
                {cookLog.comment ? ` — ${cookLog.comment}` : ""}
              </SelectItem>
            ))}
          </SelectPopup>
        </SelectRoot>
      </Field>

      <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
        {pendingUpload ? (
          <>
            <Button
              type="button"
              busy={busy && action === "upload"}
              disabled={busy}
              onClick={() => void uploadAndConfirm(pendingUpload)}
            >
              Retry upload
            </Button>
            <Button
              type="button"
              variant="danger"
              busy={busy && action === "discard"}
              disabled={busy}
              onClick={() => void discardPendingUpload()}
            >
              Discard pending image
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            busy={busy && action === "upload"}
            disabled={busy || !selectedFile}
          >
            Upload image
          </Button>
        )}
      </div>

      {stageMessage ? (
        <InlineAlert role="status" className="md:col-span-2">
          {stageMessage}
        </InlineAlert>
      ) : null}
      {feedback ? (
        <InlineAlert
          role={feedback.variant === "danger" ? "alert" : "status"}
          variant={feedback.variant}
          className="md:col-span-2"
        >
          {feedback.text}
        </InlineAlert>
      ) : null}
    </form>
  );
}
