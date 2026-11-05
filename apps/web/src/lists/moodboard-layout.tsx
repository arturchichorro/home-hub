import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { MoodboardPin } from "./moodboard-preview";

export function moodboardColumnCount(width: number) {
  return Math.min(4, Math.max(2, Math.floor((width + 12) / 232)));
}

// Contiguous groups retain down-column reading/ordering. Unlike CSS column
// balancing, explicit columns cannot silently leave the last track empty.
export function moodboardColumns<T extends Pick<MoodboardPin, "asset">>(
  pins: readonly T[],
  count: number,
): { id: string; pins: T[] }[] {
  const columns: { id: string; pins: T[] }[] = [];
  const heights = pins.map((pin) => {
    const width = pin.asset?.width;
    const height = pin.asset?.height;

    return width && height ? height / width : 1;
  });
  let remainingHeight = heights.reduce((sum, height) => sum + height, 0);
  let index = 0;
  const total = Math.min(count, pins.length);

  for (let column = 0; column < total; column++) {
    const remainingColumns = total - column;
    const target = remainingHeight / remainingColumns;
    const endLimit = pins.length - remainingColumns + 1;
    const start = index;
    let height = 0;

    while (index < endLimit) {
      const next = heights[index] ?? 1;

      if (
        index > start &&
        Math.abs(height - target) < Math.abs(height + next - target)
      ) {
        break;
      }

      height += next;
      index++;
    }

    columns.push({ id: `column-${column}`, pins: pins.slice(start, index) });
    remainingHeight -= height;
  }

  return columns;
}

export function MoodboardLayout({
  pins,
  children,
}: {
  pins: readonly MoodboardPin[];
  children: (pin: MoodboardPin, index: number) => ReactNode;
}) {
  const container = useRef<HTMLElement>(null);
  const [count, setCount] = useState(2);

  useLayoutEffect(() => {
    const element = container.current;

    if (!element) {
      return;
    }

    const measure = () => setCount(moodboardColumnCount(element.clientWidth));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const columns = moodboardColumns(pins, count);
  let index = 0;

  return (
    <section
      ref={container}
      aria-label="Moodboard media"
      className="grid min-w-0 max-w-full items-start gap-3"
      style={{
        gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))`,
      }}
    >
      {columns.map((column) => (
        <ul key={column.id} className="min-w-0">
          {column.pins.map((pin) => children(pin, index++))}
        </ul>
      ))}
    </section>
  );
}
