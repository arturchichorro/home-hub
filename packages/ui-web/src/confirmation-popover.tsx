import { Popover } from "@base-ui/react/popover";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "./button";

export type ConfirmationPopoverProps = {
  confirmLabel?: string;
  description: ReactNode;
  onConfirm: () => void;
  title: ReactNode;
  trigger: ReactElement;
};

export function ConfirmationPopover({
  confirmLabel = "Delete",
  description,
  onConfirm,
  title,
  trigger,
}: ConfirmationPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          side="top"
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup className="grid max-w-64 gap-3 rounded-md border border-border bg-raised p-3 text-foreground shadow-raised outline-none">
            <div>
              <Popover.Title className="text-sm font-semibold">
                {title}
              </Popover.Title>
              <Popover.Description className="mt-1 text-sm text-muted">
                {description}
              </Popover.Description>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="compact"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="compact"
                variant="danger"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
