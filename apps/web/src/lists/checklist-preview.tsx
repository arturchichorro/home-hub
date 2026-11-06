import { listPreviewMaxRows } from "@home-hub/shared/lists";
import { Check } from "@home-hub/ui-web";
import { useLayoutEffect, useRef, useState } from "react";
import type { ListCardData } from "./list-card";

export function checklistPreviewRows(height: number, rowHeight = 24, gap = 12) {
  // Match h-6 rows and gap-3 below; keep an ordinary checklist at four rows.
  return Math.min(
    listPreviewMaxRows,
    Math.max(4, Math.floor((height + gap) / (rowHeight + gap))),
  );
}

export function checklistPreviewWindow<T>(
  items: readonly T[],
  capacity: number,
) {
  const clipped = items.length > capacity;
  const visible = items.slice(0, clipped ? capacity - 1 : capacity);

  return { visible, clipped };
}

export function ChecklistPreview({ items }: { items: ListCardData["items"] }) {
  const container = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(4);

  useLayoutEffect(() => {
    const element = container.current;

    if (!element) {
      return;
    }

    const measure = () => {
      const rem =
        Number.parseFloat(
          getComputedStyle(element.ownerDocument.documentElement).fontSize,
        ) || 16;
      setCapacity(
        checklistPreviewRows(element.clientHeight, rem * 1.5, rem * 0.75),
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const { visible, clipped } = checklistPreviewWindow(items, capacity);

  return (
    <div
      ref={container}
      className="relative min-h-33 min-w-0 flex-1"
      data-checklist-preview
    >
      <ul className="absolute inset-0 grid content-start gap-3">
        {visible.map((item) => {
          const crossed = item.status === "crossed";

          return (
            <li key={item.id} className="flex h-6 min-w-0 items-center gap-3">
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
        {clipped && (
          <li
            className="flex h-6 items-center text-muted"
            aria-label="More items in this list"
          >
            <span aria-hidden="true">…</span>
          </li>
        )}
      </ul>
    </div>
  );
}
