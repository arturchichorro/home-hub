import { queries } from "@home-hub/shared/zero/queries";
import {
  BookOpen,
  Button,
  Calendar,
  CookingPot,
  InlineAlert,
  Plus,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { CreateRecipeDialog } from "./create-recipe-dialog";
import { useRecipeImageUrl } from "./use-recipe-image-url";

type RecipeLibraryProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
  userId: string;
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
  userId,
}: RecipeCardImageProps) {
  const imageState = useRecipeImageUrl({
    accessToken,
    householdId,
    imageId: image?.id,
    onSessionExpired,
    recipeId,
    userId,
    variant: "thumbnail",
  });

  if (imageState.url) {
    return (
      <img
        src={imageState.url}
        alt=""
        width={image?.width ?? undefined}
        height={image?.height ?? undefined}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-raised text-subtle">
      <BookOpen
        aria-hidden="true"
        className={imageState.loading ? "size-8 animate-pulse" : "size-8"}
      />
    </div>
  );
}

function formatCookedDate(cookedAt: number): string {
  const date = new Date(cookedAt);
  const includeYear = date.getFullYear() !== new Date().getFullYear();

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: includeYear ? "numeric" : undefined,
  }).format(date);
}

export function RecipeLibrary({
  accessToken,
  householdId,
  onSessionExpired,
  userId,
}: RecipeLibraryProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const headerRightComponent = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        className="h-7! px-1.5! font-normal text-muted"
        onClick={() => setCreating(true)}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add recipe
      </Button>
    ),
    [],
  );
  useAppHeaderRightComponent(headerRightComponent);
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
      aria-label="Recipe library"
      aria-busy={result.type !== "complete"}
      className="flex w-full flex-col gap-6"
    >
      {recipes.length === 0 && result.type === "complete" ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-raised text-primary">
            <BookOpen aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 font-semibold">No recipes yet</h2>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add your first recipe
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-5 lg:gap-x-5">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            to="/households/$householdId/recipes/$recipeId"
            params={{ householdId, recipeId: recipe.id }}
            preload="intent"
            className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <div className="w-full">
              <div className="aspect-3/2 w-full overflow-hidden rounded-md">
                <RecipeCardImage
                  accessToken={accessToken}
                  householdId={householdId}
                  recipeId={recipe.id}
                  image={recipe.images[0]}
                  onSessionExpired={onSessionExpired}
                  userId={userId}
                />
              </div>
            </div>
            <div className="min-w-0 flex flex-col gap-2 mt-2">
              <h2 className="line-clamp-2 text-sm font-semibold sm:text-base">
                {recipe.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <CookingPot aria-hidden="true" className="size-3.5" />
                  {recipe.ingredients.length}{" "}
                  {recipe.ingredients.length === 1
                    ? "ingredient"
                    : "ingredients"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar aria-hidden="true" className="size-3.5" />
                  {recipe.cookLogs[0]
                    ? `Cooked ${formatCookedDate(recipe.cookLogs[0].cookedAt)}`
                    : "Not cooked yet"}
                </span>
              </div>
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
