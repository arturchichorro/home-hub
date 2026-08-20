import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { RecipeIngredient } from "@home-hub/shared/zero/schema";
import {
  Button,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuRoot,
  ContextMenuTrigger,
  GripVertical,
  IconButton,
  InlineAlert,
  Input,
  Scale,
  Textarea,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
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
  onUpdate: (
    ingredientId: string,
    amount: string,
    note: string,
  ) => Promise<boolean>;
  recipeId: string;
};

function RecipeIngredientRow({
  disabled,
  householdId,
  index,
  ingredient,
  onDelete,
  onUpdate,
  recipeId,
}: RecipeIngredientRowProps) {
  const amountInputId = `ingredient-${ingredient.id}-amount`;
  const noteInputId = `ingredient-${ingredient.id}-note`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [amount, setAmount] = useState(ingredient.amount ?? "");
  const [note, setNote] = useState(ingredient.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const sortable = useSortable({
    id: ingredient.id,
    index,
    type: "recipe-ingredient",
    accept: "recipe-ingredient",
    disabled,
  });

  function handleOpenChange(open: boolean) {
    if (open) {
      setAmount(ingredient.amount ?? "");
      setNote(ingredient.note ?? "");
      setError(undefined);
    }
    setMenuOpen(open);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(undefined);
    const updated = await onUpdate(ingredient.id, amount, note);
    setSaving(false);
    if (updated) {
      setMenuOpen(false);
    } else {
      setError("The ingredient could not be updated.");
    }
  }

  return (
    <ContextMenuRoot
      disabled={disabled}
      open={menuOpen}
      onOpenChange={handleOpenChange}
    >
      <ContextMenuTrigger
        render={
          <li
            ref={sortable.ref}
            className={`flex items-center gap-1 p-2 ${sortable.isDragging ? "opacity-60" : ""}`}
          />
        }
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
        {ingredient.amount ? (
          <span className="flex h-7 shrink-0 items-center gap-1 text-xs text-muted">
            <Scale aria-hidden="true" className="size-3.5" />
            {ingredient.amount}
          </span>
        ) : null}
        {ingredient.note ? (
          <span className="h-7 min-w-0 flex-1 truncate text-xs leading-7 text-muted">
            - {ingredient.note}
          </span>
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuPopup
        aria-label={`Edit ${ingredient.name}`}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
            event.key !== "Escape" &&
            event.key !== "Tab"
          ) {
            event.preventBaseUIHandler();
          }
        }}
      >
        <form className="grid gap-3 p-2" onSubmit={handleSubmit}>
          <label
            htmlFor={amountInputId}
            className="grid gap-1 text-xs text-muted"
          >
            Amount
            <Input
              id={amountInputId}
              aria-label="Ingredient amount"
              autoComplete="off"
              maxLength={100}
              placeholder="For example, 200 g"
              value={amount}
              onValueChange={setAmount}
            />
          </label>
          <label
            htmlFor={noteInputId}
            className="grid gap-1 text-xs text-muted"
          >
            Note
            <Textarea
              id={noteInputId}
              aria-label="Ingredient note"
              className="field-sizing-content min-h-10! resize-none! text-sm"
              maxLength={500}
              placeholder="Optional note"
              rows={1}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? (
            <InlineAlert role="alert" variant="danger">
              {error}
            </InlineAlert>
          ) : null}
          <Button
            type="submit"
            busy={saving}
            disabled={disabled || saving}
            size="compact"
            className="justify-self-end"
          >
            Save
          </Button>
        </form>
        <ContextMenuItem
          disabled={disabled}
          variant="danger"
          onClick={() => onDelete(ingredient.id)}
        >
          Delete ingredient
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenuRoot>
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

  async function updateIngredient(
    ingredientId: string,
    amount: string,
    note: string,
  ) {
    if (!mutationEnabled) return false;
    const mutation = zero.mutate(
      mutators.recipes.updateIngredient({
        householdId,
        recipeId,
        ingredientId,
        amount,
        note,
        optimisticUpdatedAt: Date.now(),
      }),
    );
    const clientResult = await mutation.client;
    if (clientResult.type === "error") return false;
    void mutation.server;
    return true;
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
            onUpdate={updateIngredient}
            recipeId={recipeId}
          />
        ))}
      </ol>
    </DragDropProvider>
  );
}
