import { useEffect, useState } from "react";
import { createRecipeImageReadUrl } from "./image-api";

type UseRecipeImageUrlOptions = {
  accessToken: string;
  householdId: string;
  imageId: string | undefined;
  onSessionExpired: () => void;
  recipeId: string;
};

type RecipeImageUrlState = {
  error: boolean;
  loading: boolean;
  url: string | undefined;
};

export function useRecipeImageUrl({
  accessToken,
  householdId,
  imageId,
  onSessionExpired,
  recipeId,
}: UseRecipeImageUrlOptions): RecipeImageUrlState {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(undefined);
    setError(false);

    if (!imageId) return () => undefined;

    void createRecipeImageReadUrl({
      accessToken,
      householdId,
      recipeId,
      imageId,
    })
      .then((result) => {
        if (!active) return;

        if (result.kind === "success") {
          setUrl(result.url);
        } else if (result.kind === "unauthorized") {
          onSessionExpired();
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [accessToken, householdId, imageId, onSessionExpired, recipeId]);

  return {
    error,
    loading: Boolean(imageId) && !url && !error,
    url,
  };
}
