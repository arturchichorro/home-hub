import {
  createRecipeImageUploadRequestSchema,
  recipeImageContentTypeSchema,
} from "@home-hub/shared/recipe-images";
import {
  IconButton,
  InlineAlert,
  type InlineAlertVariant,
  Plus,
} from "@home-hub/ui-web";
import { type ChangeEvent, useRef, useState } from "react";
import {
  confirmRecipeImageUpload,
  requestRecipeImageUpload,
  uploadRecipeImageObject,
} from "./image-api";
import { readImageDimensions } from "./read-image-dimensions";

type RecipeImageUploadFormProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  position: number;
  onSessionExpired: () => void;
};

type UploadFeedback = {
  text: string;
  variant: InlineAlertVariant;
};

export function RecipeImageUploadForm({
  accessToken,
  householdId,
  recipeId,
  position,
  onSessionExpired,
}: RecipeImageUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>();

  function chooseImage() {
    const input = fileInputRef.current;
    if (!input || busy) return;

    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;

    setBusy(true);
    setFeedback(undefined);

    try {
      const contentType = recipeImageContentTypeSchema.safeParse(file.type);
      if (!contentType.success) {
        setFeedback({
          text: "Choose a JPEG, PNG, or WebP image.",
          variant: "danger",
        });
        return;
      }

      const dimensions = await readImageDimensions(file);
      const request = createRecipeImageUploadRequestSchema.safeParse({
        cookLogId: null,
        contentType: contentType.data,
        byteSize: file.size,
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

      const pending = await requestRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        ...request.data,
      });

      if (pending.kind === "unauthorized") {
        onSessionExpired();
        return;
      }
      if (pending.kind !== "success") {
        setFeedback({
          text: "The image could not be prepared for upload.",
          variant: "danger",
        });
        return;
      }

      await uploadRecipeImageObject({ file, upload: pending.upload });
      const confirmation = await confirmRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        imageId: pending.imageId,
      });

      if (confirmation.kind === "unauthorized") {
        onSessionExpired();
      } else if (confirmation.kind === "success") {
        setFeedback({
          text: "Image uploaded. Waiting for synchronization…",
          variant: "success",
        });
      } else {
        setFeedback({
          text: "The image could not be confirmed. Choose it again to retry.",
          variant: "danger",
        });
      }
    } catch {
      setFeedback({
        text: "The image could not be uploaded. Choose it again to retry.",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        onChange={(event) => void uploadImage(event)}
      />
      {feedback ? (
        <InlineAlert
          className="w-64"
          role={feedback.variant === "danger" ? "alert" : "status"}
          variant={feedback.variant}
        >
          {feedback.text}
        </InlineAlert>
      ) : null}
      <IconButton
        type="button"
        aria-label="Add recipe image"
        aria-busy={busy || undefined}
        busy={busy}
        disabled={busy}
        className="size-8! rounded-full bg-raised shadow-md"
        onClick={chooseImage}
      >
        <Plus aria-hidden="true" />
      </IconButton>
    </div>
  );
}
