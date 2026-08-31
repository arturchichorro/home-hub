import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { List } from "@home-hub/shared/zero/schema";
import {
  Button,
  ChevronDown,
  GripVertical,
  IconButton,
  InlineAlert,
  Plus,
  StickyNote,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ListNameDialog } from "./list-name-dialog";

function ListCard({
  list,
  index,
  count,
  disabled,
  onMove,
}: {
  list: List;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const sortable = useSortable({
    id: list.id,
    index,
    type: "household-list",
    accept: "household-list",
    disabled,
  });
  return (
    <li
      ref={sortable.ref}
      className={`min-w-0 rounded-lg border border-border bg-surface ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <Link
        to="/households/$householdId/lists/$listId"
        params={{ householdId: list.householdId, listId: list.id }}
        preload="intent"
        className="flex min-h-32 flex-col gap-4 rounded-t-lg p-4 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <StickyNote aria-hidden="true" className="size-6 text-primary" />
        <h2 className="line-clamp-2 break-words font-semibold">{list.name}</h2>
      </Link>
      <div className="flex items-center justify-between border-t border-border px-2 py-1">
        <IconButton
          ref={sortable.handleRef}
          disabled={disabled}
          aria-label={`Reorder ${list.name}`}
          className="cursor-grab touch-none"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </IconButton>
        <div className="flex">
          <IconButton
            disabled={disabled || index === 0}
            aria-label={`Move ${list.name} earlier`}
            onClick={() => onMove(index, index - 1)}
          >
            <ChevronDown aria-hidden="true" className="size-4 rotate-180" />
          </IconButton>
          <IconButton
            disabled={disabled || index === count - 1}
            aria-label={`Move ${list.name} later`}
            onClick={() => onMove(index, index + 1)}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

export function ListsLibrary({ householdId }: { householdId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const enabled = useZeroMutationEnabled();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [lists, result] = useQuery(queries.lists.byHousehold({ householdId }));
  const header = useMemo(
    () => (
      <Button
        variant="ghost"
        className="h-7! px-1.5! font-normal text-muted"
        disabled={!enabled}
        onClick={() => setCreating(true)}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add list
      </Button>
    ),
    [enabled],
  );
  useAppHeaderRightComponent(header);

  async function move(from: number, to: number) {
    if (!enabled || from === to || to < 0 || to >= lists.length) return;
    const reordered = [...lists];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.lists.reorder({
          householdId,
          listId: moved.id,
          orderedListIds: reordered.map((list) => list.id),
          optimisticUpdatedAt: Date.now(),
        }),
      );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error")
        setError("The list order could not be saved.");
    } catch {
      setError("The list order could not be saved.");
    }
  }

  if (result.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load lists.
      </InlineAlert>
    );
  return (
    <section
      aria-label="Lists library"
      aria-busy={result.type !== "complete"}
      className="grid gap-6"
    >
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      {!lists.length && result.type === "complete" ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center">
          <StickyNote aria-hidden="true" className="size-8 text-primary" />
          <h2 className="mt-4 font-semibold">No lists yet</h2>
          <p className="mt-2 text-sm text-muted">
            Shopping, travel, things to do—make a list for anything.
          </p>
          <Button
            className="mt-5"
            disabled={!enabled}
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add your first list
          </Button>
        </div>
      ) : null}
      <DragDropProvider
        onDragEnd={(event) => {
          const source = event.operation.source;
          if (!event.canceled && isSortable(source))
            void move(source.initialIndex, source.index);
        }}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {lists.map((list, index) => (
            <ListCard
              key={list.id}
              list={list}
              index={index}
              count={lists.length}
              disabled={!enabled}
              onMove={(from, to) => void move(from, to)}
            />
          ))}
        </ul>
      </DragDropProvider>
      {creating ? (
        <ListNameDialog
          householdId={householdId}
          onClose={() => setCreating(false)}
          onSaved={(listId) =>
            void navigate({
              to: "/households/$householdId/lists/$listId",
              params: { householdId, listId },
            })
          }
        />
      ) : null}
    </section>
  );
}
