import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export type TooltipProps = {
  content: ReactNode;
  disabled?: boolean;
  trigger: ReactElement;
};

export function Tooltip({ content, disabled = false, trigger }: TooltipProps) {
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={trigger} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side="bottom" sideOffset={6} className="z-50">
          <BaseTooltip.Popup className="max-w-64 rounded-md border border-border bg-raised px-3 py-2 text-sm text-foreground shadow-raised outline-none transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
