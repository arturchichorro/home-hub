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
        className="aspect-4/3 w-full object-cover"
      />
    );
  }

  return (
    <div className="flex aspect-4/3 items-center justify-center bg-raised text-subtle">
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
    >
      <h2 id="recipe-library-heading" className="mb-5 text-xl font-semibold">
        Recipes
      </h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            to="/households/$householdId/recipes/$recipeId"
            params={{ householdId, recipeId: recipe.id }}
            preload="intent"
            className="group min-h-72 overflow-hidden rounded-lg border border-border bg-surface outline-none transition-colors hover:border-subtle focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <RecipeCardImage
              accessToken={accessToken}
              householdId={householdId}
              recipeId={recipe.id}
              image={recipe.images[0]}
              onSessionExpired={onSessionExpired}
            />
            <div className="grid gap-1 px-4 py-4">
              <h3 className="font-semibold text-foreground group-hover:text-primary">
                {recipe.title}
              </h3>
              <p className="line-clamp-2 text-sm text-muted">
                {recipe.description || "No description yet."}
              </p>
            </div>
          </Link>
        ))}

        <Button
          aria-label="Create recipe"
          title="Create recipe"
          variant="secondary"
          className="h-full! min-h-72 w-full rounded-lg! border border-dashed border-border bg-surface hover:border-subtle"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="size-8" />
        </Button>
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
