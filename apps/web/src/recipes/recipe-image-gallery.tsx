import type { RecipeImage } from "@home-hub/shared/zero/schema";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useEffect, useState } from "react";
import { createRecipeImageReadUrl, deleteRecipeImage } from "./image-api";

type RecipeImageGalleryProps = {
  accessToken: string;
  householdId: string;
  recipeId: string;
  images: readonly RecipeImage[];
  onSessionExpired: () => void;
};

type RecipeImageCardProps = Omit<RecipeImageGalleryProps, "images"> & {
  image: RecipeImage;
};

function RecipeImageCard({
  accessToken,
  householdId,
  recipeId,
  image,
  onSessionExpired,
}: RecipeImageCardProps) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(undefined);
    setError(undefined);

    void createRecipeImageReadUrl({
      accessToken,
      householdId,
      recipeId,
      imageId: image.id,
    })
      .then((result) => {
        if (!active) return;
        if (result.kind === "success") {
          setUrl(result.url);
        } else if (result.kind === "unauthorized") {
          onSessionExpired();
        } else {
          setError("This image is not currently available.");
        }
      })
      .catch(() => {
        if (active) setError("The image could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [accessToken, householdId, image.id, onSessionExpired, recipeId]);

  async function removeImage() {
    if (deleting) return;

    try {
      setDeleting(true);
      setError(undefined);
      const result = await deleteRecipeImage({
        accessToken,
        householdId,
        recipeId,
        imageId: image.id,
      });
      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }
      if (result.kind === "forbidden") {
        setError("You cannot delete this image.");
        return;
      }
      setDeleted(true);
    } catch {
      setError("The image could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <li>
        <InlineAlert role="status" variant="success">
          Image deleted. Waiting for synchronization…
        </InlineAlert>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface">
      {url ? (
        <img
          src={url}
          alt="Uploaded view of the recipe"
          width={image.width}
          height={image.height}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      ) : error ? null : (
        <div className="flex aspect-video items-center justify-center bg-raised px-4">
          <p className="text-sm text-muted">Loading image…</p>
        </div>
      )}
      <div className="grid gap-3 p-4">
        {image.cookLogId ? (
          <p className="text-sm text-muted">Attached to a cooking log.</p>
        ) : (
          <p className="text-sm text-muted">Recipe photo</p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            size="compact"
            variant="danger"
            busy={deleting}
            onClick={() => void removeImage()}
          >
            Delete image
          </Button>
        </div>
        {error ? (
          <InlineAlert role="alert" variant="danger">
            {error}
          </InlineAlert>
        ) : null}
      </div>
    </li>
  );
}

export function RecipeImageGallery({
  accessToken,
  householdId,
  recipeId,
  images,
  onSessionExpired,
}: RecipeImageGalleryProps) {
  if (images.length === 0) {
    return (
      <p className="text-sm text-muted">There are no recipe images yet.</p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {images.map((image) => (
        <RecipeImageCard
          key={image.id}
          accessToken={accessToken}
          householdId={householdId}
          recipeId={recipeId}
          image={image}
          onSessionExpired={onSessionExpired}
        />
      ))}
    </ul>
  );
}
