import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  children: (
    pin: MoodboardPin,
    index: number,
    style: CSSProperties,
  ) => ReactNode;
}) {
  const container = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);
  const previousWidth = useRef(0);
  const animate = width > 0 && previousWidth.current === width;

  useLayoutEffect(() => {
    previousWidth.current = width;
  }, [width]);

  useLayoutEffect(() => {
    const element = container.current;

    if (!element) {
      return;
    }

    const measure = () => setWidth(element.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const columns = moodboardColumns(pins, moodboardColumnCount(width));
  const tileWidth = Math.max(
    0,
    (width - Math.max(0, columns.length - 1) * 12) /
      Math.max(1, columns.length),
  );
  const positions = new Map<string, CSSProperties>();

  let height = 0;

  for (const [columnIndex, column] of columns.entries()) {
    let top = 0;

    for (const pin of column.pins) {
      const ratio =
        pin.asset?.width && pin.asset?.height
          ? pin.asset.height / pin.asset.width
          : 1;
      const tileHeight = tileWidth * ratio;
      positions.set(pin.id, {
        position: "absolute",
        left: 0,
        top: 0,
        translate: `${columnIndex * (tileWidth + 12)}px ${top}px`,
        // Native transitions interpolate interrupted moves. Do not animate the
        // initial measurement or a responsive width/breakpoint change.
        transitionDuration: animate ? "250ms" : "0ms",
        width: tileWidth,
        height: tileHeight,
      });
      top += tileHeight + 12;
    }

    height = Math.max(height, top);
  }

  return (
    <ul
      ref={container}
      aria-label="Moodboard media"
      className="relative min-w-0 max-w-full"
      style={{ height }}
    >
      {/* One stable parent lets React reconcile every pin without fighting the
          sortable plugin when a pin crosses a visual column boundary. */}
      {pins.map((pin, index) =>
        children(pin, index, positions.get(pin.id) ?? {}),
      )}
    </ul>
  );
}
