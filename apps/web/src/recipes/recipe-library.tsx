import { queries } from "@home-hub/shared/zero/queries";
import { BookOpen, Button, InlineAlert, Plus } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CreateRecipeDialog } from "./create-recipe-dialog";
import { useRecipeImageUrl } from "./use-recipe-image-url";

type RecipeLibraryProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

type RecipeCardImageProps = RecipeLibraryProps & {
  image:
    | {
        id: string;
        height: number | null;
        width: number | null;
      }
    | undefined;
  recipeId: string;
};

function RecipeCardImage({
  accessToken,
  householdId,
  image,
  onSessionExpired,
  recipeId,
}: RecipeCardImageProps) {
  const imageState = useRecipeImageUrl({
    accessToken,
    householdId,
    imageId: image?.id,
    onSessionExpired,
    recipeId,
  });

  if (imageState.url) {
    return (
      <img
        src={imageState.url}
        alt=""
        width={image?.width ?? undefined}
        height={image?.height ?? undefined}
        loading="lazy"
        className="size-24 shrink-0 rounded-lg object-cover transition-opacity group-hover:opacity-90"
      />
    );
  }

  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-raised text-subtle">
      <BookOpen
        aria-hidden="true"
        className={imageState.loading ? "size-8 animate-pulse" : "size-8"}
      />
    </div>
  );
}

export function RecipeLibrary({
  accessToken,
  householdId,
  onSessionExpired,
}: RecipeLibraryProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [recipes, result] = useQuery(
    queries.recipes.byHousehold({ householdId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load recipes.
      </InlineAlert>
    );
  }

  return (
    <section
      aria-labelledby="recipe-library-heading"
      aria-busy={result.type !== "complete"}
      className="flex flex-col gap-4"
    >
      <div>
        <Button
          type="button"
          variant="ghost"
          className="h-7! px-1.5! ml-2 font-normal text-muted"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add recipe
        </Button>
      </div>
      <div className="flex flex-col gap-x-4 gap-y-6">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            to="/households/$householdId/recipes/$recipeId"
            params={{ householdId, recipeId: recipe.id }}
            preload="intent"
            className="group flex min-w-0 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <RecipeCardImage
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipe.id}
              image={recipe.images[0]}
              onSessionExpired={onSessionExpired}
            />
            <div className="min-w-0 py-1">
              <h3 className="truncate font-semibold">{recipe.title}</h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                {recipe.description || "No description yet."}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <CreateRecipeDialog
        householdId={householdId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(recipeId) =>
          void navigate({
            to: "/households/$householdId/recipes/$recipeId",
            params: { householdId, recipeId },
          })
        }
      />
    </section>
  );
}
