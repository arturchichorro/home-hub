import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { normalizeListItemName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { ListItem } from "@home-hub/shared/zero/schema";
import {
  Archive,
  Check,
  GripVertical,
  IconButton,
  InlineAlert,
  RotateCcw,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  AddListItemTriggerRow,
  ListItemDraftNameForm,
} from "./add-list-item-form";
import { ListItemNameInput } from "./list-item-name-input";
import { orderCurrentListItems } from "./list-item-order";

type ListItemsProps = {
  householdId: string;
  listId: string;
  items: readonly ListItem[];
};

type ListItemStatus = "active" | "crossed" | "archived";

type DraftListItem = {
  focusRequest: number;
  id: string;
  pendingItemId?: string | undefined;
  savedItemId?: string | undefined;
};

type SavedItemFocus = {
  id: string;
  request: number;
};

type ListItemRowProps = {
  disabled: boolean;
  focusRequest?: number | undefined;
  householdId: string;
  listId: string;
  index: number;
  item: ListItem;
  onSetStatus: (itemId: string, status: ListItemStatus) => void;
};

function ListItemRow({
  disabled,
  focusRequest,
  householdId,
  listId,
  index,
  item,
  onSetStatus,
}: ListItemRowProps) {
  const crossed = item.status === "crossed";
  const toggleLabel = crossed ? "Reactivate" : "Cross";
  const sortable = useSortable({
    id: item.id,
    index,
    type: `list-item-${item.status}`,
    accept: `list-item-${item.status}`,
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
      <ListItemNameInput
        focusRequest={focusRequest}
        householdId={householdId}
        listId={listId}
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

export function ListItems({ householdId, listId, items }: ListItemsProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<DraftListItem>();
  const [creationError, setCreationError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [savedItemFocus, setSavedItemFocus] = useState<SavedItemFocus>();

  const currentItems = orderCurrentListItems(items);
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

  function setStatus(itemId: string, status: ListItemStatus) {
    observeMutation(
      zero.mutate(
        mutators.lists.setItemStatus({
          householdId,
          listId,
          itemId,
          status,
          optimisticUpdatedAt: Date.now(),
        }),
      ),
    );
  }

  function observeMutation(mutation: {
    client: PromiseLike<{ type: string }>;
    server: PromiseLike<{ type: string }>;
  }) {
    setActionError(undefined);
    void Promise.all([mutation.client, mutation.server])
      .then((results) => {
        if (results.some((result) => result.type === "error"))
          setActionError("The change could not be saved.");
      })
      .catch(() => setActionError("The change could not be saved."));
  }

  function resolveDraftItemId(name: string) {
    return (
      items.find((item) => item.normalizedName === normalizeListItemName(name))
        ?.id ?? draft?.id
    );
  }

  return (
    <section aria-label="List" className="grid gap-5">
      {actionError ? (
        <InlineAlert role="alert" variant="danger">
          {actionError}
        </InlineAlert>
      ) : null}
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
          observeMutation(
            zero.mutate(
              mutators.lists.reorderItems({
                householdId,
                listId,
                itemId: moved.id,
                orderedItemIds,
                status: moved.status,
                optimisticUpdatedAt: Date.now(),
              }),
            ),
          );
        }}
      >
        <ul className="divide-y divide-border">
          <AddListItemTriggerRow
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
              <ListItemDraftNameForm
                focusRequest={draft.focusRequest}
                householdId={householdId}
                listId={listId}
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
            <ListItemRow
              key={item.id}
              disabled={!mutationEnabled}
              focusRequest={
                savedItemFocus?.id === item.id
                  ? savedItemFocus.request
                  : undefined
              }
              householdId={householdId}
              listId={listId}
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
                  <ListItemNameInput
                    householdId={householdId}
                    listId={listId}
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
