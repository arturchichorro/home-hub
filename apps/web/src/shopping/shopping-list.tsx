import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { normalizeShoppingItemName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { ShoppingItem } from "@home-hub/shared/zero/schema";
import {
  Archive,
  Check,
  GripVertical,
  IconButton,
  InlineAlert,
  RotateCcw,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
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
  pendingItemId?: string | undefined;
  savedItemId?: string | undefined;
};

type SavedItemFocus = {
  id: string;
  request: number;
};

type ShoppingItemRowProps = {
  disabled: boolean;
  focusRequest?: number | undefined;
  householdId: string;
  index: number;
  item: ShoppingItem;
  onSetStatus: (itemId: string, status: ShoppingItemStatus) => void;
};

function ShoppingItemRow({
  disabled,
  focusRequest,
  householdId,
  index,
  item,
  onSetStatus,
}: ShoppingItemRowProps) {
  const crossed = item.status === "crossed";
  const toggleLabel = crossed ? "Reactivate" : "Cross";
  const sortable = useSortable({
    id: item.id,
    index,
    type: `shopping-item-${item.status}`,
    accept: `shopping-item-${item.status}`,
    disabled,
  });

  return (
    <li
      ref={sortable.ref}
      className={`flex min-h-14 items-center gap-2 py-2 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <IconButton
        ref={sortable.handleRef}
        aria-label={`Reorder ${item.name}`}
        className="size-7! cursor-grab touch-none"
        disabled={disabled}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </IconButton>
      <ShoppingItemNameInput
        focusRequest={focusRequest}
        householdId={householdId}
        itemId={item.id}
        currentName={item.name}
        crossed={crossed}
      />
      <IconButton
        aria-label={`${toggleLabel} ${item.name}`}
        title={`${toggleLabel} ${item.name}`}
        disabled={disabled}
        onClick={() => onSetStatus(item.id, crossed ? "active" : "crossed")}
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
        disabled={disabled}
        onClick={() => onSetStatus(item.id, "archived")}
      >
        <Archive aria-hidden="true" className="size-4" />
      </IconButton>
    </li>
  );
}

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

  const queryComplete = result.type === "complete";
  const currentItems = orderCurrentShoppingItems(items);
  const draftItemId = draft?.pendingItemId ?? draft?.savedItemId ?? draft?.id;
  const savedItem = currentItems.find((item) => item.id === draft?.savedItemId);
  const draftIsPersisted =
    savedItem?.status === "active" && currentItems[0]?.id === savedItem.id;
  const visibleCurrentItems = draftItemId
    ? currentItems.filter((item) => item.id !== draftItemId)
    : currentItems;
  const archivedItems = items.filter((item) => item.status === "archived");

  useLayoutEffect(() => {
    if (!draftIsPersisted) return;
    setDraft((current) =>
      current?.savedItemId === draft?.savedItemId ? undefined : current,
    );
  }, [draft?.savedItemId, draftIsPersisted]);

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load the shopping list.
      </InlineAlert>
    );
  }

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

  function resolveDraftItemId(name: string) {
    return (
      items.find(
        (item) => item.normalizedName === normalizeShoppingItemName(name),
      )?.id ?? draft?.id
    );
  }

  return (
    <section
      aria-label="Shopping list"
      aria-busy={!queryComplete}
      className="grid gap-5"
    >
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled || !mutationEnabled) return;
          const { source } = event.operation;
          if (!isSortable(source) || source.initialIndex === source.index) {
            return;
          }

          const reordered = [...visibleCurrentItems];
          const [moved] = reordered.splice(source.initialIndex, 1);
          if (
            !moved ||
            (moved.status !== "active" && moved.status !== "crossed")
          ) {
            return;
          }
          reordered.splice(source.index, 0, moved);
          const orderedItemIds = reordered
            .filter((item) => item.status === moved.status)
            .map((item) => item.id);
          zero.mutate(
            mutators.shopping.reorder({
              householdId,
              itemId: moved.id,
              orderedItemIds,
              status: moved.status,
              optimisticUpdatedAt: Date.now(),
            }),
          );
        }}
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
            <li
              key={draft.id}
              className="flex min-h-14 items-center gap-2 py-2"
            >
              <IconButton
                aria-label="Reordering is available after the item is saved"
                className="size-7! cursor-default"
                disabled
              >
                <GripVertical aria-hidden="true" className="size-4" />
              </IconButton>
              <ShoppingItemDraftNameForm
                focusRequest={draft.focusRequest}
                householdId={householdId}
                itemId={draft.id}
                onCancel={() => setDraft(undefined)}
                onSaveFailed={() => {
                  setDraft((current) =>
                    current?.id === draft.id
                      ? { ...current, pendingItemId: undefined }
                      : current,
                  );
                }}
                onSaveStarted={(name) => {
                  const pendingItemId = resolveDraftItemId(name);
                  flushSync(() => {
                    setDraft((current) =>
                      current?.id === draft.id
                        ? { ...current, pendingItemId }
                        : current,
                    );
                  });
                }}
                onServerError={setCreationError}
                onSaved={(name) => {
                  const savedItemId = resolveDraftItemId(name) ?? draft.id;
                  setSavedItemFocus((current) => ({
                    id: savedItemId,
                    request: (current?.request ?? -1) + 1,
                  }));
                  setDraft((current) =>
                    current?.id === draft.id
                      ? { ...current, pendingItemId: savedItemId, savedItemId }
                      : current,
                  );
                }}
              />
            </li>
          ) : null}

          {visibleCurrentItems.map((item, index) => (
            <ShoppingItemRow
              key={item.id}
              disabled={!mutationEnabled}
              focusRequest={
                savedItemFocus?.id === item.id
                  ? savedItemFocus.request
                  : undefined
              }
              householdId={householdId}
              index={index}
              item={item}
              onSetStatus={setStatus}
            />
          ))}

          <li className="flex min-h-14 items-center py-2">
            <IconButton
              aria-label={
                showArchived ? "Hide archived items" : "Show archived items"
              }
              aria-pressed={showArchived}
              title={
                showArchived ? "Hide archived items" : "Show archived items"
              }
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
                  <IconButton
                    aria-label={`Reordering archived item ${item.name} is unavailable`}
                    className="size-7! cursor-default"
                    disabled
                  >
                    <GripVertical aria-hidden="true" className="size-4" />
                  </IconButton>
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
      </DragDropProvider>
    </section>
  );
}
