import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { RecipeIngredient } from "@home-hub/shared/zero/schema";
import { GripVertical, IconButton, X } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

type RecipeIngredientListProps = {
  householdId: string;
  ingredients: readonly RecipeIngredient[];
  recipeId: string;
};

type RecipeIngredientRowProps = {
  disabled: boolean;
  index: number;
  ingredient: RecipeIngredient;
  onDelete: (ingredientId: string) => void;
};

function RecipeIngredientRow({
  disabled,
  index,
  ingredient,
  onDelete,
}: RecipeIngredientRowProps) {
  const sortable = useSortable({
    id: ingredient.id,
    index,
    type: "recipe-ingredient",
    accept: "recipe-ingredient",
    disabled,
  });

  return (
    <li
      ref={sortable.ref}
      className={`flex items-center gap-1 p-2 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <IconButton
        ref={sortable.handleRef}
        aria-label={`Reorder ${ingredient.name}`}
        className="size-7! touch-none cursor-grab"
        disabled={disabled}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </IconButton>
      <span className="min-w-0 flex-1">{ingredient.name}</span>
      <span className="text-sm text-muted">{ingredient.amount}</span>
      <IconButton
        aria-label={`Delete ${ingredient.name}`}
        className="size-7!"
        disabled={disabled}
        onClick={() => onDelete(ingredient.id)}
      >
        <X aria-hidden="true" className="size-4" />
      </IconButton>
    </li>
  );
}

export function RecipeIngredientList({
  householdId,
  ingredients,
  recipeId,
}: RecipeIngredientListProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();

  function deleteIngredient(ingredientId: string) {
    if (!mutationEnabled) return;
    zero.mutate(
      mutators.recipes.deleteIngredient({
        householdId,
        recipeId,
        ingredientId,
      }),
    );
  }

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled || !mutationEnabled) return;
        const { source } = event.operation;
        if (!isSortable(source) || source.initialIndex === source.index) return;

        const reordered = [...ingredients];
        const [moved] = reordered.splice(source.initialIndex, 1);
        if (!moved) return;
        reordered.splice(source.index, 0, moved);
        zero.mutate(
          mutators.recipes.reorderIngredients({
            householdId,
            recipeId,
            orderedIngredientIds: reordered.map((ingredient) => ingredient.id),
            optimisticUpdatedAt: Date.now(),
          }),
        );
      }}
    >
      <ol className="divide-y border-t divide-border border-border">
        {ingredients.map((ingredient, index) => (
          <RecipeIngredientRow
            key={ingredient.id}
            disabled={!mutationEnabled}
            index={index}
            ingredient={ingredient}
            onDelete={deleteIngredient}
          />
        ))}
      </ol>
    </DragDropProvider>
  );
}
