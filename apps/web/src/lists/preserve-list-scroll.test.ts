import { afterEach, expect, it, vi } from "vitest";
import { preserveListScroll } from "./preserve-list-scroll";

function fixture() {
  const listeners = new Map<string, () => void>();
  const frames = new Map<number, FrameRequestCallback>();
  const scroller = {
    scrollTop: 1200,
    scrollLeft: 0,
    scrollHeight: 6000,
    clientHeight: 600,
    parentElement: null,
    getBoundingClientRect: () => ({ top: 0, bottom: 600 }),
  };
  const view = {
    innerHeight: 800,
    getComputedStyle: () => ({ overflowY: "auto" }),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(1, callback);

      return 1;
    }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
    setTimeout,
    clearTimeout,
  };
  const document = {
    defaultView: view,
    scrollingElement: scroller,
    activeElement: {} as unknown,
    addEventListener: vi.fn((name: string, callback: () => void) =>
      listeners.set(name, callback),
    ),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  };
  const toggle = () => ({ focus: vi.fn() });
  const rows = ["anchor", "moved", "next"].map((id, index) => {
    const button = toggle();

    return {
      dataset: { listItemId: id },
      isConnected: true,
      offset: 1300 + index * 56,
      button,
      getBoundingClientRect() {
        return {
          top: this.offset - scroller.scrollTop,
          bottom: this.offset - scroller.scrollTop + 56,
        };
      },
      contains: (element: unknown) => element === button,
      querySelector: () => button,
    };
  });
  document.activeElement = rows[1]?.button;

  const root = {
    ownerDocument: document,
    parentElement: scroller,
    isConnected: true,
    querySelectorAll: () => rows,
    focus: vi.fn(),
  };

  return {
    root: root as unknown as HTMLElement,
    scroller,
    rows,
    listeners,
    frames,
  };
}

afterEach(() => vi.useRealTimers());

it("anchors an unchanged visible neighbor and transfers focus without scrolling", () => {
  vi.useFakeTimers();
  const { root, scroller, rows } = fixture();
  const snapshot = preserveListScroll(root, "moved");
  const anchor = rows[0];

  if (!anchor) {
    throw new Error("Missing fixture row");
  }

  anchor.offset += 56;
  scroller.scrollTop = 0;
  snapshot.restore();

  expect(scroller.scrollTop).toBe(1256);
  expect(anchor.getBoundingClientRect().top).toBe(100);
  expect(rows[2]?.button.focus).toHaveBeenCalledWith({ preventScroll: true });
  snapshot.dispose();
});

it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
  "does not fight a subsequent user %s",
  (event) => {
    vi.useFakeTimers();
    const { root, scroller, listeners } = fixture();
    const snapshot = preserveListScroll(root, "moved");
    listeners.get(event)?.();
    scroller.scrollTop = 2400;
    snapshot.restore();

    expect(scroller.scrollTop).toBe(2400);
    expect(listeners.size).toBe(0);
    snapshot.dispose();
  },
);

it("releases input listeners and pending paint work on disposal", () => {
  vi.useFakeTimers();
  const { root, listeners, frames } = fixture();
  const snapshot = preserveListScroll(root, "moved");
  snapshot.restore();
  expect(frames.size).toBe(1);
  snapshot.dispose();

  expect(frames.size).toBe(0);
  expect(listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
