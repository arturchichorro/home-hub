import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { IconButton, InlineAlert } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { AddShoppingItemForm } from "./add-shopping-item-form";
import { EditShoppingItemForm } from "./edit-shopping-item-form";

type ShoppingListProps = {
  householdId: string;
};

type ShoppingItemStatus = "active" | "crossed" | "archived";

function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M4 7h16M6 7v12h12V7M9 11h6M5 3h14l1 4H4l1-4Z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

export function ShoppingList({ householdId }: ShoppingListProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const [editingItemId, setEditingItemId] = useState<string>();

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
  const currentItems = items.filter((item) => item.status !== "archived");
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
    <div className="grid gap-10" aria-busy={!queryComplete}>
      <section
        aria-labelledby="shopping-current-heading"
        className="grid gap-5"
      >
        <h2 id="shopping-current-heading" className="text-xl font-semibold">
          Shopping list
        </h2>

        <AddShoppingItemForm householdId={householdId} />

        {queryComplete && currentItems.length === 0 ? (
          <p className="text-sm text-muted">The shopping list is empty.</p>
        ) : currentItems.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {currentItems.map((item) => {
              const crossed = item.status === "crossed";
              const toggleLabel = crossed ? "Reactivate" : "Cross";

              return (
                <li
                  key={item.id}
                  className="flex min-h-14 items-center gap-2 py-2"
                >
                  {editingItemId === item.id ? (
                    <EditShoppingItemForm
                      householdId={householdId}
                      itemId={item.id}
                      currentName={item.name}
                      onCancel={() => setEditingItemId(undefined)}
                      onSaved={() => setEditingItemId(undefined)}
                    />
                  ) : (
                    <>
                      <span
                        className={
                          crossed
                            ? "min-w-0 flex-1 truncate text-muted line-through"
                            : "min-w-0 flex-1 truncate"
                        }
                      >
                        {item.name}
                      </span>
                      <IconButton
                        aria-label={`Edit ${item.name}`}
                        title={`Edit ${item.name}`}
                        disabled={!mutationEnabled}
                        onClick={() => setEditingItemId(item.id)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label={`${toggleLabel} ${item.name}`}
                        title={`${toggleLabel} ${item.name}`}
                        disabled={!mutationEnabled}
                        onClick={() =>
                          setStatus(item.id, crossed ? "active" : "crossed")
                        }
                      >
                        {crossed ? <RestoreIcon /> : <CrossIcon />}
                      </IconButton>
                      <IconButton
                        aria-label={`Archive ${item.name}`}
                        title={`Archive ${item.name}`}
                        disabled={!mutationEnabled}
                        onClick={() => setStatus(item.id, "archived")}
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {archivedItems.length > 0 ? (
        <section
          aria-labelledby="shopping-archived-heading"
          className="grid gap-3"
        >
          <h2 id="shopping-archived-heading" className="text-lg font-semibold">
            Archived
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {archivedItems.map((item) => (
              <li
                key={item.id}
                className="flex min-h-14 items-center gap-2 py-2"
              >
                {editingItemId === item.id ? (
                  <EditShoppingItemForm
                    householdId={householdId}
                    itemId={item.id}
                    currentName={item.name}
                    onCancel={() => setEditingItemId(undefined)}
                    onSaved={() => setEditingItemId(undefined)}
                  />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {item.name}
                    </span>
                    <IconButton
                      aria-label={`Edit ${item.name}`}
                      title={`Edit ${item.name}`}
                      disabled={!mutationEnabled}
                      onClick={() => setEditingItemId(item.id)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      aria-label={`Restore ${item.name}`}
                      title={`Restore ${item.name}`}
                      disabled={!mutationEnabled}
                      onClick={() => setStatus(item.id, "active")}
                    >
                      <RestoreIcon />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
