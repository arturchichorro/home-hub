import {
  createRecipeImageUploadRequestSchema,
  recipeImageContentTypeSchema,
} from "@home-hub/shared/recipe-images";
import { IconButton, ImagePlus, Plus } from "@home-hub/ui-web";
import { type ChangeEvent, useRef, useState } from "react";
import {
  confirmRecipeImageUpload,
  requestRecipeImageUpload,
  uploadRecipeImageObject,
} from "./image-api";
import { readImageDimensions } from "./read-image-dimensions";

type RecipeImageUploadFormProps = {
  accessToken: string;
  appearance?: "primary" | "subtle";
  cookLogId?: string;
  householdId: string;
  recipeId: string;
  position: number;
  onSessionExpired: () => void;
};

export function RecipeImageUploadForm({
  accessToken,
  appearance = "primary",
  cookLogId,
  householdId,
  recipeId,
  position,
  onSessionExpired,
}: RecipeImageUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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

    try {
      const contentType = recipeImageContentTypeSchema.safeParse(file.type);
      if (!contentType.success) return;

      const dimensions = await readImageDimensions(file);
      const request = createRecipeImageUploadRequestSchema.safeParse({
        cookLogId: cookLogId ?? null,
        contentType: contentType.data,
        byteSize: file.size,
        width: dimensions.width,
        height: dimensions.height,
        position,
      });

      if (!request.success) return;

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
      if (pending.kind !== "success") return;

      await uploadRecipeImageObject({ file, upload: pending.upload });
      const confirmation = await confirmRecipeImageUpload({
        accessToken,
        householdId,
        recipeId,
        imageId: pending.imageId,
      });

      if (confirmation.kind === "unauthorized") {
        onSessionExpired();
      }
    } catch {
      // Keep image uploads unobtrusive; the user can choose the image again.
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
      <IconButton
        type="button"
        aria-label={cookLogId ? "Add image to cooking log" : "Add recipe image"}
        aria-busy={busy || undefined}
        busy={busy}
        disabled={busy}
        variant={appearance === "subtle" ? "ghost" : "primary"}
        className={
          appearance === "subtle" ? "size-6!" : "size-8! rounded-full shadow-md"
        }
        onClick={chooseImage}
      >
        {cookLogId ? (
          <ImagePlus aria-hidden="true" className="size-4" />
        ) : (
          <Plus aria-hidden="true" />
        )}
      </IconButton>
    </div>
  );
}
