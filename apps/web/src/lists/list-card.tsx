import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { List, ListItem } from "@home-hub/shared/zero/schema";
import { Check } from "@home-hub/ui-web";
import { Link } from "@tanstack/react-router";

export type ListCardData = Pick<List, "id" | "householdId" | "name"> & {
  items: readonly Pick<ListItem, "id" | "name" | "status">[];
};

// Match image-gallery gestures: movement with a mouse, hold before touch drag.
const listPointerSensor = PointerSensor.configure({
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

// Keep Enter available for opening the link; Space starts keyboard reordering.
const listKeyboardSensor = KeyboardSensor.configure({
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

function listSensors(defaults: Sensors): Sensors {
  return [
    ...defaults.filter(
      (sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor,
    ),
    listPointerSensor,
    listKeyboardSensor,
  ];
}

export function ListCardGrid({
  lists,
  disabled,
  onMove,
}: {
  lists: readonly ListCardData[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <DragDropProvider
      sensors={listSensors}
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
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {lists.map((list, index) => (
          <ListCard
            key={list.id}
            list={list}
            index={index}
            disabled={disabled}
          />
        ))}
      </ul>
    </DragDropProvider>
  );
}

export function ListCard({
  list,
  index,
  disabled,
}: {
  list: ListCardData;
  index: number;
  disabled: boolean;
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
      className={`min-w-0 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <Link
        ref={sortable.handleRef}
        to="/households/$householdId/lists/$listId"
        params={{ householdId: list.householdId, listId: list.id }}
        preload="intent"
        draggable={false}
        className="flex h-full w-full min-w-0 touch-pan-y select-none flex-col gap-5 rounded-xl border border-border bg-surface p-4 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring sm:p-5"
      >
        <h2 className="line-clamp-2 wrap-break-word text-xl font-semibold">
          {list.name}
        </h2>
        <ul className="grid gap-3">
          {list.items.map((item) => {
            const crossed = item.status === "crossed";
            return (
              <li key={item.id} className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-xs border-2 border-muted text-muted"
                >
                  {crossed ? <Check className="size-3" /> : null}
                </span>
                <span className="sr-only">
                  {crossed ? "Completed: " : "Active: "}
                </span>
                <span
                  className={`truncate ${crossed ? "text-muted line-through" : "text-foreground"}`}
                >
                  {item.name}
                </span>
              </li>
            );
          })}
        </ul>
      </Link>
    </li>
  );
}
