import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { RecipeIngredient } from "@home-hub/shared/zero/schema";
import {
  GripVertical,
  IconButton,
  Scale,
  StickyNote,
  Trash2,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  RecipeIngredientAmountInput,
  RecipeIngredientNoteInput,
} from "./recipe-ingredient-detail-inputs";
import { RecipeIngredientNameInput } from "./recipe-ingredient-name-input";

type RecipeIngredientListProps = {
  householdId: string;
  ingredients: readonly RecipeIngredient[];
  recipeId: string;
};

type RecipeIngredientRowProps = {
  disabled: boolean;
  householdId: string;
  index: number;
  ingredient: RecipeIngredient;
  onDelete: (ingredientId: string) => void;
  recipeId: string;
};

function RecipeIngredientRow({
  disabled,
  householdId,
  index,
  ingredient,
  onDelete,
  recipeId,
}: RecipeIngredientRowProps) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
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
      <RecipeIngredientNameInput
        currentName={ingredient.name}
        householdId={householdId}
        ingredientId={ingredient.id}
        recipeId={recipeId}
      />
      {ingredient.amount !== null || editingAmount ? (
        <div className="flex h-7 shrink-0 items-center gap-1">
          <Scale aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
          <RecipeIngredientAmountInput
            currentAmount={ingredient.amount}
            focusOnMount={editingAmount && ingredient.amount === null}
            householdId={householdId}
            ingredientId={ingredient.id}
            recipeId={recipeId}
            onBlur={() => setEditingAmount(false)}
            onFocus={() => setEditingAmount(true)}
          />
        </div>
      ) : null}
      {ingredient.note !== null || editingNote ? (
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1">
          <span
            aria-hidden="true"
            className="h-7 shrink-0 text-xs leading-7 text-muted"
          >
            -
          </span>
          <RecipeIngredientNoteInput
            currentNote={ingredient.note}
            focusOnMount={editingNote && ingredient.note === null}
            householdId={householdId}
            ingredientId={ingredient.id}
            recipeId={recipeId}
            onBlur={() => setEditingNote(false)}
            onFocus={() => setEditingNote(true)}
          />
        </div>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {ingredient.amount === null && !editingAmount ? (
          <IconButton
            type="button"
            aria-label={`Add amount to ${ingredient.name}`}
            className="size-7!"
            disabled={disabled}
            onClick={() => setEditingAmount(true)}
          >
            <Scale aria-hidden="true" className="size-4" />
          </IconButton>
        ) : null}
        {ingredient.note === null && !editingNote ? (
          <IconButton
            type="button"
            aria-label={`Add note to ${ingredient.name}`}
            className="size-7!"
            disabled={disabled}
            onClick={() => setEditingNote(true)}
          >
            <StickyNote aria-hidden="true" className="size-4" />
          </IconButton>
        ) : null}
        <IconButton
          type="button"
          aria-label={`Delete ${ingredient.name}`}
          className="size-7!"
          disabled={disabled}
          onClick={() => onDelete(ingredient.id)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
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
      <ol className="divide-y divide-border">
        {ingredients.map((ingredient, index) => (
          <RecipeIngredientRow
            key={ingredient.id}
            disabled={!mutationEnabled}
            householdId={householdId}
            index={index}
            ingredient={ingredient}
            onDelete={deleteIngredient}
            recipeId={recipeId}
          />
        ))}
      </ol>
    </DragDropProvider>
  );
}
