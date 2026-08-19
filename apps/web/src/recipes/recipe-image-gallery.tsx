import type { RecipeImage } from "@home-hub/shared/zero/schema";
import {
  DialogClose,
  DialogPopup,
  DialogRoot,
  InlineAlert,
} from "@home-hub/ui-web";
import type { ReactNode } from "react";
import { useRecipeImageUrl } from "./use-recipe-image-url";

type RecipeImageContext = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  onSessionExpired: () => void;
};

type RecipeImageThumbnailProps = RecipeImageContext & {
  image: RecipeImage;
  className?: string;
  onOpen: (image: RecipeImage) => void;
};

export function RecipeImageThumbnail({
  accessToken,
  householdId,
  recipeId,
  image,
  className,
  onSessionExpired,
  onOpen,
}: RecipeImageThumbnailProps) {
  const { url, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image.id,
    onSessionExpired,
  });
  const classes = [
    "aspect-square overflow-hidden rounded-lg bg-raised",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes}>
      {url ? (
        <button
          type="button"
          className="size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-focus-ring"
          aria-label="Open recipe image"
          onClick={() => onOpen(image)}
        >
          <img
            src={url}
            alt=""
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            loading="lazy"
            className="size-full object-cover"
          />
        </button>
      ) : error ? (
        <p className="grid size-full place-items-center p-3 text-center text-xs text-muted">
          Image unavailable
        </p>
      ) : (
        <div className="grid size-full animate-pulse place-items-center bg-raised">
          <span className="sr-only">Loading image</span>
        </div>
      )}
    </li>
  );
}

type RecipeImageGalleryProps = RecipeImageContext & {
  addControl: ReactNode;
  images: readonly RecipeImage[];
  onOpen: (image: RecipeImage) => void;
};

export function RecipeImageGallery({
  accessToken,
  householdId,
  recipeId,
  addControl,
  images,
  onSessionExpired,
  onOpen,
}: RecipeImageGalleryProps) {
  return (
    <div className="relative min-h-28">
      <ul className="grid auto-cols-[calc((100%-1.5rem)/3)] grid-flow-col gap-3 overflow-x-auto">
        {images.map((image) => (
          <RecipeImageThumbnail
            key={image.id}
            accessToken={accessToken}
            householdId={householdId}
            recipeId={recipeId}
            image={image}
            onSessionExpired={onSessionExpired}
            onOpen={onOpen}
          />
        ))}
      </ul>
      <div className="absolute right-2 bottom-2">{addControl}</div>
    </div>
  );
}

type RecipeImageViewerProps = RecipeImageContext & {
  image: RecipeImage | undefined;
  onOpenChange: (open: boolean) => void;
};

export function RecipeImageViewer({
  accessToken,
  householdId,
  recipeId,
  image,
  onSessionExpired,
  onOpenChange,
}: RecipeImageViewerProps) {
  const { url, error } = useRecipeImageUrl({
    accessToken,
    householdId,
    recipeId,
    imageId: image?.id,
    onSessionExpired,
  });

  return (
    <DialogRoot open={image !== undefined} onOpenChange={onOpenChange}>
      <DialogPopup
        title="Recipe photo"
        size="large"
        actions={<DialogClose>Close</DialogClose>}
      >
        {url ? (
          <img
            src={url}
            alt="Recipe"
            width={image?.width ?? undefined}
            height={image?.height ?? undefined}
            className="max-h-[75vh] w-full rounded-md object-contain"
          />
        ) : error ? (
          <InlineAlert role="alert" variant="danger">
            This image is not currently available.
          </InlineAlert>
        ) : (
          <div className="aspect-video animate-pulse rounded-md bg-surface" />
        )}
      </DialogPopup>
    </DialogRoot>
  );
}
