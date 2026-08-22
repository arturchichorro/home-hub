import { Popover } from "@base-ui/react/popover";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "./button";

type ConfirmationPopoverContentProps =
  | {
      description: ReactNode;
      message?: never;
      title: ReactNode;
    }
  | {
      description?: never;
      message: ReactNode;
      title?: never;
    };

export type ConfirmationPopoverProps = ConfirmationPopoverContentProps & {
  confirmLabel?: string;
  onConfirm: () => void;
  trigger: ReactElement;
};

export function ConfirmationPopover({
  confirmLabel = "Delete",
  description,
  message,
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
          <Popover.Popup
            className={`grid gap-3 rounded-md border border-border bg-raised p-3 text-foreground shadow-raised outline-none ${message === undefined ? "max-w-64" : "w-max max-w-[calc(100vw-2rem)]"}`}
          >
            {message === undefined ? (
              <div>
                <Popover.Title className="text-sm font-semibold">
                  {title}
                </Popover.Title>
                <Popover.Description className="mt-1 text-sm text-muted">
                  {description}
                </Popover.Description>
              </div>
            ) : (
              <Popover.Description className="text-sm text-muted">
                {message}
              </Popover.Description>
            )}
            <div
              className={`flex gap-2 ${message === undefined ? "justify-end" : "justify-center"}`}
            >
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
