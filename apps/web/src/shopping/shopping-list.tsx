import { normalizeShoppingItemName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Archive,
  Check,
  IconButton,
  InlineAlert,
  RotateCcw,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  AddShoppingItemTriggerRow,
  ShoppingItemDraftNameForm,
} from "./add-shopping-item-form";
import { ShoppingItemNameInput } from "./shopping-item-name-input";
import { orderCurrentShoppingItems } from "./shopping-list-order";

type ShoppingListProps = {
  householdId: string;
};

type ShoppingItemStatus = "active" | "crossed" | "archived";

type DraftShoppingItem = {
  focusRequest: number;
  id: string;
};

type SavedItemFocus = {
  id: string;
  request: number;
};

export function ShoppingList({ householdId }: ShoppingListProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<DraftShoppingItem>();
  const [creationError, setCreationError] = useState<string>();
  const [savedItemFocus, setSavedItemFocus] = useState<SavedItemFocus>();

  const [items, result] = useQuery(
    queries.shopping.byHousehold({ householdId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load the shopping list.
      </InlineAlert>
    );
  }

  const queryComplete = result.type === "complete";
  const currentItems = orderCurrentShoppingItems(items);
  const archivedItems = items.filter((item) => item.status === "archived");

  function setStatus(itemId: string, status: ShoppingItemStatus) {
    zero.mutate(
      mutators.shopping.setStatus({
        householdId,
        itemId,
        status,
        optimisticUpdatedAt: Date.now(),
      }),
    );
  }

  return (
    <section
      aria-label="Shopping list"
      aria-busy={!queryComplete}
      className="grid gap-5"
    >
      <ul className="divide-y divide-border">
        <AddShoppingItemTriggerRow
          draftActive={draft !== undefined}
          error={creationError}
          onActivate={() => {
            setCreationError(undefined);
            setDraft((current) =>
              current
                ? { ...current, focusRequest: current.focusRequest + 1 }
                : { focusRequest: 0, id: crypto.randomUUID() },
            );
          }}
        />

        {draft ? (
          <li className="flex min-h-14 items-center gap-2 py-2">
            <ShoppingItemDraftNameForm
              focusRequest={draft.focusRequest}
              householdId={householdId}
              itemId={draft.id}
              onCancel={() => setDraft(undefined)}
              onServerError={setCreationError}
              onSaved={(name) => {
                const existingItem = items.find(
                  (item) =>
                    item.normalizedName === normalizeShoppingItemName(name),
                );
                const savedItemId = existingItem?.id ?? draft.id;
                setSavedItemFocus((current) => ({
                  id: savedItemId,
                  request: (current?.request ?? -1) + 1,
                }));
                setDraft(undefined);
              }}
            />
          </li>
        ) : null}

        {currentItems.map((item) => {
          const crossed = item.status === "crossed";
          const toggleLabel = crossed ? "Reactivate" : "Cross";

          return (
            <li key={item.id} className="flex min-h-14 items-center gap-2 py-2">
              <ShoppingItemNameInput
                focusRequest={
                  savedItemFocus?.id === item.id
                    ? savedItemFocus.request
                    : undefined
                }
                householdId={householdId}
                itemId={item.id}
                currentName={item.name}
                crossed={crossed}
              />
              <IconButton
                aria-label={`${toggleLabel} ${item.name}`}
                title={`${toggleLabel} ${item.name}`}
                disabled={!mutationEnabled}
                onClick={() =>
                  setStatus(item.id, crossed ? "active" : "crossed")
                }
              >
                {crossed ? (
                  <RotateCcw aria-hidden="true" className="size-4" />
                ) : (
                  <Check aria-hidden="true" className="size-4" />
                )}
              </IconButton>
              <IconButton
                aria-label={`Archive ${item.name}`}
                title={`Archive ${item.name}`}
                disabled={!mutationEnabled}
                onClick={() => setStatus(item.id, "archived")}
              >
                <Archive aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          );
        })}

        <li className="flex min-h-14 items-center py-2">
          <IconButton
            aria-label={
              showArchived ? "Hide archived items" : "Show archived items"
            }
            aria-pressed={showArchived}
            title={showArchived ? "Hide archived items" : "Show archived items"}
            disabled={archivedItems.length === 0}
            onClick={() => setShowArchived((visible) => !visible)}
          >
            <Archive aria-hidden="true" className="size-4" />
          </IconButton>
        </li>

        {showArchived
          ? archivedItems.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-center gap-2 py-2"
              >
                <ShoppingItemNameInput
                  householdId={householdId}
                  itemId={item.id}
                  currentName={item.name}
                  muted
                />
                <IconButton
                  aria-label={`Restore ${item.name}`}
                  title={`Restore ${item.name}`}
                  disabled={!mutationEnabled}
                  onClick={() => setStatus(item.id, "active")}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                </IconButton>
              </li>
            ))
          : null}
      </ul>
    </section>
  );
}
