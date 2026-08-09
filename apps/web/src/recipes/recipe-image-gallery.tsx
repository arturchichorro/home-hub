import type { RecipeImage } from "@home-hub/shared/zero/schema";
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

  if (deleted) return <p>Image deleted. Waiting for synchronization…</p>;

  return (
    <li className="recipe-image-card">
      {url ? (
        <img src={url} alt="Recipe" width={image.width} height={image.height} />
      ) : error ? null : (
        <p>Loading image…</p>
      )}
      {image.cookLogId ? <p>Attached to a cooking log.</p> : null}
      <button
        type="button"
        disabled={deleting}
        onClick={() => void removeImage()}
      >
        {deleting ? "Deleting…" : "Delete image"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
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
    return <p>There are no recipe images yet.</p>;
  }

  return (
    <ul className="recipe-image-grid">
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
