import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

export type ErrorPopoverProps = {
  anchor: Popover.Positioner.Props["anchor"];
  children: ReactNode;
  id?: string;
  open: boolean;
  onDismiss?: () => void;
};

export function ErrorPopover({
  anchor,
  children,
  id,
  open,
  onDismiss,
}: ErrorPopoverProps) {
  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss?.();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup
            id={id}
            role="alert"
            initialFocus={false}
            finalFocus={false}
            className="max-w-72 rounded-md bg-danger px-3 py-2 text-sm font-medium text-on-primary shadow-lg outline-none transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
