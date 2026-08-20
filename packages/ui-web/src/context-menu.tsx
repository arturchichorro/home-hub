import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type { ComponentProps } from "react";

export const ContextMenuRoot = BaseContextMenu.Root;

type BaseContextMenuTriggerProps = ComponentProps<
  typeof BaseContextMenu.Trigger
>;

export type ContextMenuTriggerProps = BaseContextMenuTriggerProps;

export function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  return <BaseContextMenu.Trigger {...props} />;
}

type BaseContextMenuPopupProps = ComponentProps<typeof BaseContextMenu.Popup>;

export type ContextMenuPopupProps = Omit<
  BaseContextMenuPopupProps,
  "className"
> & {
  className?: string;
};

export function ContextMenuPopup({
  className,
  ...props
}: ContextMenuPopupProps) {
  const classes = [
    "min-w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-raised p-1 text-foreground shadow-raised outline-none",
    "transition-[opacity,transform] duration-[var(--motion-duration-fast)]",
    "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner className="z-50 outline-none">
        <BaseContextMenu.Popup {...props} className={classes} />
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
}
