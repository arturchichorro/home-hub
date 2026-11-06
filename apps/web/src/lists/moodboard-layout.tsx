import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { applyMoodboardOrder } from "./moodboard-order";
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
  deferDomOrder = false,
  children,
}: {
  pins: readonly MoodboardPin[];
  deferDomOrder?: boolean;
  children: (
    pin: MoodboardPin,
    index: number,
    style: CSSProperties,
  ) => ReactNode;
}) {
  const container = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);
  const previousWidth = useRef(0);
  const focusedBeforeMove = useRef<
    { element: HTMLElement; order: readonly string[] } | undefined
  >(undefined);
  const order = useMemo(() => pins.map((pin) => pin.id), [pins]);
  const [domOrder, setDomOrder] = useState(order);
  const animate = width > 0 && previousWidth.current === width;

  useLayoutEffect(() => {
    const pending = focusedBeforeMove.current;

    if (!pending || pending.order !== domOrder) {
      return;
    }

    focusedBeforeMove.current = undefined;
    const focused = pending.element;

    if (
      focused.isConnected &&
      (document.activeElement === document.body ||
        document.activeElement === document.documentElement)
    ) {
      focused.focus({ preventScroll: true });
    }
  }, [domOrder]);

  useLayoutEffect(() => {
    const element = container.current;

    if (
      !element ||
      deferDomOrder ||
      (order.length === domOrder.length &&
        order.every((id, index) => id === domOrder[index]))
    ) {
      return;
    }

    let canceled = false;

    function commitOrder() {
      if (canceled || !element) {
        return;
      }

      const focused = element.ownerDocument.activeElement;
      focusedBeforeMove.current =
        focused instanceof HTMLElement && element.contains(focused)
          ? { element: focused, order }
          : undefined;
      setDomOrder(order);
    }

    // React's insertBefore cancels CSS transitions even within the same parent.
    // Move slots first; reconcile semantic DOM order only once they have settled.
    // Observe the actual animations, not a timer: reversals, reduced motion and
    // responsive changes can shorten or cancel a transition.
    const transitions = Array.from(element.children)
      .flatMap((child) => child.getAnimations())
      .filter(
        (animation) =>
          "transitionProperty" in animation &&
          animation.transitionProperty === "translate" &&
          animation.playState === "running",
      );

    if (transitions.length) {
      void Promise.allSettled(
        transitions.map((animation) => animation.finished),
      ).then(commitOrder);
    } else {
      commitOrder();
    }

    return () => {
      canceled = true;
    };
  }, [order, domOrder, deferDomOrder]);

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
  const indices = new Map(order.map((id, index) => [id, index]));

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
      {/* Visual order can advance while DOM order waits for transitions. The
          sortable index must still describe the current visual slot. */}
      {applyMoodboardOrder(pins, domOrder).map((pin) =>
        children(pin, indices.get(pin.id) ?? 0, positions.get(pin.id) ?? {}),
      )}
    </ul>
  );
}
