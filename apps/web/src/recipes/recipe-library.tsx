import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type {
  Recipe,
  RecipeCookLog,
  RecipeImage,
  RecipeIngredient,
} from "@home-hub/shared/zero/schema";
import {
  BookOpen,
  Button,
  Calendar,
  CookingPot,
  InlineAlert,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
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

type RecipeCardData = Pick<Recipe, "householdId" | "id" | "title"> & {
  cookLogs: readonly Pick<RecipeCookLog, "cookedAt" | "id">[];
  images: readonly Pick<RecipeImage, "height" | "id" | "width">[];
  ingredients: readonly Pick<RecipeIngredient, "id">[];
};

const recipePointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === "mouse") {
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    }
    if (event.pointerType === "touch") {
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 }),
      ];
    }
    return [
      new PointerActivationConstraints.Delay({ value: 200, tolerance: 10 }),
      new PointerActivationConstraints.Distance({ value: 5 }),
    ];
  },
});

const recipeKeyboardSensor = KeyboardSensor.configure({
  keyboardCodes: {
    start: ["Space"],
    cancel: ["Escape"],
    end: ["Space", "Enter", "Tab"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
  },
});

function recipeSensors(defaults: Sensors): Sensors {
  return [
    ...defaults.filter(
      (sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor,
    ),
    recipePointerSensor,
    recipeKeyboardSensor,
  ];
}

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

function RecipeCard({
  accessToken,
  disabled,
  householdId,
  index,
  onSessionExpired,
  recipe,
  userId,
}: RecipeLibraryProps & {
  disabled: boolean;
  index: number;
  recipe: RecipeCardData;
}) {
  const sortable = useSortable({
    id: recipe.id,
    index,
    type: "household-recipe",
    accept: "household-recipe",
    disabled,
  });

  return (
    <div
      ref={sortable.ref}
      className={`min-w-0 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <Link
        ref={sortable.handleRef}
        to="/households/$householdId/recipes/$recipeId"
        params={{ householdId, recipeId: recipe.id }}
        preload="intent"
        draggable={false}
        className="block min-w-0 touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
              {recipe.ingredients.length === 1 ? "ingredient" : "ingredients"}
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
    </div>
  );
}

function RecipeCardGrid({
  accessToken,
  disabled,
  householdId,
  onMove,
  onSessionExpired,
  recipes,
  userId,
}: RecipeLibraryProps & {
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  recipes: readonly RecipeCardData[];
}) {
  return (
    <DragDropProvider
      sensors={recipeSensors}
      onDragEnd={(event) => {
        const source = event.operation.source;
        if (
          !disabled &&
          !event.canceled &&
          isSortable(source) &&
          source.initialIndex !== source.index
        ) {
          onMove(source.initialIndex, source.index);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-5 lg:gap-x-5">
        {recipes.map((recipe, index) => (
          <RecipeCard
            key={recipe.id}
            accessToken={accessToken}
            disabled={disabled}
            householdId={householdId}
            index={index}
            onSessionExpired={onSessionExpired}
            recipe={recipe}
            userId={userId}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

export function RecipeLibrary({
  accessToken,
  householdId,
  onSessionExpired,
  userId,
}: RecipeLibraryProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const enabled = useZeroMutationEnabled();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
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

  async function move(from: number, to: number) {
    if (!enabled || from === to || to < 0 || to >= recipes.length) return;
    const reordered = [...recipes];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.recipes.reorder({
          householdId,
          recipeId: moved.id,
          orderedRecipeIds: reordered.map((recipe) => recipe.id),
          optimisticUpdatedAt: Date.now(),
        }),
      );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error")
        setError("The recipe order could not be saved.");
    } catch {
      setError("The recipe order could not be saved.");
    }
  }

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
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
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

      <RecipeCardGrid
        accessToken={accessToken}
        disabled={!enabled}
        householdId={householdId}
        onMove={(from, to) => void move(from, to)}
        onSessionExpired={onSessionExpired}
        recipes={recipes}
        userId={userId}
      />

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
