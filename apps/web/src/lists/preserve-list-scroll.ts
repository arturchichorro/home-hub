// Preserve a neighboring row, not the row that is about to move to another
// status group. This also supports a list inside a scrolling panel.
export function preserveListScroll(root: HTMLElement, itemId: string) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const scrollers: { element: HTMLElement; top: number; left: number }[] = [];

  for (
    let element = root.parentElement;
    element;
    element = element.parentElement
  ) {
    const overflow = view?.getComputedStyle(element).overflowY;

    if (
      element === document.scrollingElement ||
      ((overflow === "auto" || overflow === "scroll") &&
        element.scrollHeight > element.clientHeight)
    ) {
      scrollers.push({
        element,
        top: element.scrollTop,
        left: element.scrollLeft,
      });
    }
  }

  const bounds = scrollers[0]?.element.getBoundingClientRect();
  const top =
    scrollers[0]?.element === document.scrollingElement
      ? 0
      : Math.max(0, bounds?.top ?? 0);
  const bottom = Math.min(
    view?.innerHeight ?? Infinity,
    bounds?.bottom ?? Infinity,
  );
  const rows = [...root.querySelectorAll<HTMLElement>("[data-list-item-id]")];
  const anchor = rows.find((row) => {
    const box = row.getBoundingClientRect();

    return (
      row.dataset.listItemId !== itemId && box.bottom > top && box.top < bottom
    );
  });
  const anchorTop = anchor?.getBoundingClientRect().top;
  const movedIndex = rows.findIndex((row) => row.dataset.listItemId === itemId);
  const moved = rows[movedIndex];

  if (moved?.contains(document.activeElement)) {
    const neighbor = rows[movedIndex + 1] ?? rows[movedIndex - 1];
    const focus = neighbor?.querySelector<HTMLElement>(
      "[data-list-status-toggle]",
    );

    if (focus) {
      focus.focus({ preventScroll: true });
    } else {
      root.focus({ preventScroll: true });
    }
  }

  let active = true;
  let frame: number | undefined;
  const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

  function dispose() {
    active = false;

    if (frame !== undefined) {
      view?.cancelAnimationFrame(frame);
    }

    for (const input of inputs) {
      document.removeEventListener(input, dispose, true);
    }

    view?.clearTimeout(timeout);
  }

  function apply() {
    if (!active || !root.isConnected) {
      return;
    }

    for (const snapshot of scrollers) {
      snapshot.element.scrollTop = snapshot.top;
      snapshot.element.scrollLeft = snapshot.left;
    }

    if (anchor?.isConnected && anchorTop !== undefined && scrollers[0]) {
      scrollers[0].element.scrollTop +=
        anchor.getBoundingClientRect().top - anchorTop;
    }
  }

  const timeout = view?.setTimeout(dispose, 10_000);

  for (const input of inputs) {
    document.addEventListener(input, dispose, { capture: true, passive: true });
  }

  return {
    dispose,
    restore() {
      if (!active) {
        return;
      }

      apply();

      if (frame !== undefined) {
        view?.cancelAnimationFrame(frame);
      }

      frame = view?.requestAnimationFrame(apply);
    },
  };
}
