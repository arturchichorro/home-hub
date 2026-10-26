import {
  createRecipeImageUploadRequestSchema,
  recipeImageContentTypeSchema,
} from "@home-hub/shared/recipe-images";
import {
  Button,
  ErrorPopover,
  IconButton,
  ImagePlus,
  Plus,
} from "@home-hub/ui-web";
import { type ChangeEvent, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  confirmRecipeImageUpload,
  requestRecipeImageUpload,
  uploadRecipeImageObject,
} from "./image-api";
import { readImageDimensions } from "./read-image-dimensions";

type RecipeImageUploadFormProps = {
  accessToken: string;
  appearance?: "primary" | "row" | "subtle";
  cookLogId?: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

export function RecipeImageUploadForm({
  accessToken,
  appearance = "primary",
  cookLogId,
  householdId,
  recipeId,
  onSessionExpired,
}: RecipeImageUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const mutationEnabled = useZeroMutationEnabled();

  function chooseImage() {
    const input = fileInputRef.current;
    if (!input || busy || !mutationEnabled) return;

    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy || !mutationEnabled) return;

    setBusy(true);
    setError(undefined);

    try {
      const contentType = recipeImageContentTypeSchema.safeParse(file.type);
      if (!contentType.success) {
        setError("Choose a still JPEG, PNG or WebP image.");
        return;
      }

      const dimensions = await readImageDimensions(file);
      const request = createRecipeImageUploadRequestSchema.safeParse({
        cookLogId: cookLogId ?? null,
        contentType: contentType.data,
        byteSize: file.size,
        width: dimensions.width,
        height: dimensions.height,
      });

      if (!request.success) {
        setError("Choose an image up to 10 MiB and 16,384 pixels per side.");
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
        setError("Unable to upload this picture. Try again.");
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
      } else if (confirmation.kind === "invalid_upload") {
        setError(
          "This image is invalid or animated. Choose a still JPEG, PNG or WebP image.",
        );
      } else if (confirmation.kind !== "success") {
        setError("Unable to upload this picture. Try again.");
      }
    } catch {
      setError("Unable to upload this picture. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        appearance === "row" ? undefined : "flex flex-col items-end gap-2"
      }
    >
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        onChange={(event) => void uploadImage(event)}
      />
      <ErrorPopover
        anchor={buttonRef}
        open={Boolean(error)}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
      {appearance === "row" ? (
        <div className="p-2.5">
          <Button
            ref={buttonRef}
            type="button"
            variant="ghost"
            aria-busy={busy || undefined}
            busy={busy}
            disabled={busy || !mutationEnabled}
            className="h-7! px-1.5! ml-2 font-normal text-muted"
            onClick={chooseImage}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add picture
          </Button>
        </div>
      ) : (
        <IconButton
          ref={buttonRef}
          type="button"
          aria-label={
            cookLogId ? "Add image to cooking log" : "Add recipe image"
          }
          aria-busy={busy || undefined}
          busy={busy}
          disabled={busy || !mutationEnabled}
          variant={appearance === "subtle" ? "ghost" : "primary"}
          className={
            appearance === "subtle"
              ? "size-6!"
              : "size-8! rounded-full shadow-md"
          }
          onClick={chooseImage}
        >
          <ImagePlus aria-hidden="true" className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
