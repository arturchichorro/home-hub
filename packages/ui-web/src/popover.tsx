import { Popover } from "@base-ui/react/popover";
import type { ComponentProps } from "react";

export const PopoverRoot = Popover.Root;

export const PopoverTrigger = Popover.Trigger;

export function PopoverPopup({
  children,
  className,
  ...props
}: ComponentProps<typeof Popover.Popup>) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={8} collisionPadding={12} className="z-50">
        <Popover.Popup
          {...props}
          className={`max-h-[min(32rem,80dvh)] w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-sm border border-border bg-raised p-3 text-foreground shadow-raised outline-none ${className ?? ""}`}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}
