import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ImageViewer } from "./image-viewer";

const controls = vi.hoisted(() => ({
  buttons: new Map<string, { onClick?: () => void; disabled?: boolean }>(),
  keydown: undefined as
    | undefined
    | ((e: { key: string; preventDefault: () => void }) => void),
}));
vi.mock("@home-hub/ui-web", () => ({
  DialogRoot: ({ children }: { children: ReactNode }) => children,
  DialogPopup: ({
    children,
    appearance,
    title,
    onKeyDown,
  }: {
    children: ReactNode;
    appearance: string;
    title: string;
    onKeyDown: typeof controls.keydown;
  }) => {
    controls.keydown = onKeyDown;
    return (
      <div role="dialog" data-appearance={appearance} aria-label={title}>
        {children}
      </div>
    );
  },
  DialogClose: ({
    children,
    ...props
  }: {
    children: ReactNode;
    disabled?: boolean;
    "aria-label": string;
  }) => {
    controls.buttons.set(props["aria-label"], props);
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
  IconButton: ({
    children,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label": string;
  }) => {
    controls.buttons.set(props["aria-label"], props);
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
  ConfirmationPopover: ({ trigger }: { trigger: ReactNode }) => trigger,
  InlineAlert: ({ children }: { children: ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Trash2: () => null,
  X: () => null,
}));
const images = [
  { id: "a", width: 4000, height: 6000 },
  { id: "b", width: 6000, height: 4000 },
];
beforeEach(() => controls.buttons.clear());
const props = {
  image: images[0],
  images,
  thumbnailUrl: "https://example.invalid/thumb",
  viewerUrl: "https://example.invalid/viewer",
  error: false,
  alt: "Moodboard image",
  canDelete: true,
  deleting: false,
  deleteDescription: "Remove this picture from the moodboard.",
  actionError: undefined,
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onOpenChange: vi.fn(),
};
it("renders the bare Recipes-style viewer, with image-fit and icon controls rather than a framed media dialog", () => {
  const html = renderToStaticMarkup(<ImageViewer {...props} />);
  expect(html).toContain('data-appearance="bare"');
  expect(html).toContain("max-h-[90vh] w-full object-contain");
  for (const label of [
    "Close image preview",
    "Delete picture",
    "Previous image",
    "Next image",
  ])
    expect(controls.buttons.has(label)).toBe(true);
  expect(html).not.toContain("Media 1 of");
});
it("wraps keyboard and icon navigation through the same loaded image set", () => {
  const select = vi.fn();
  renderToStaticMarkup(<ImageViewer {...props} onSelect={select} />);
  controls.buttons.get("Previous image")?.onClick?.();
  expect(select).toHaveBeenLastCalledWith(images[1]);
  controls.keydown?.({ key: "ArrowRight", preventDefault: vi.fn() });
  expect(select).toHaveBeenLastCalledWith(images[1]);
});
it("prevents navigation and disables controls during an in-flight removal", () => {
  const select = vi.fn();
  renderToStaticMarkup(<ImageViewer {...props} deleting onSelect={select} />);
  controls.keydown?.({ key: "ArrowRight", preventDefault: vi.fn() });
  expect(select).not.toHaveBeenCalled();
  for (const label of [
    "Close image preview",
    "Delete picture",
    "Previous image",
    "Next image",
  ])
    expect(controls.buttons.get(label)?.disabled).toBe(true);
});
