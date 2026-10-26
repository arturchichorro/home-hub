import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type { ComponentProps } from "react";
export const ComboboxRoot = BaseCombobox.Root;
export const ComboboxTrigger = BaseCombobox.Trigger;
export const ComboboxList = BaseCombobox.List;
export function ComboboxInput(
  props: ComponentProps<typeof BaseCombobox.Input>,
) {
  return (
    <BaseCombobox.Input
      {...props}
      className="h-9 w-full min-w-0 rounded-sm border border-border bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    />
  );
}
export function ComboboxPopup({ children }: { children: React.ReactNode }) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner sideOffset={8} align="end" className="z-50">
        <BaseCombobox.Popup className="grid max-h-[min(24rem,var(--available-height))] w-72 max-w-(--available-width) gap-1 overflow-y-auto rounded-md border border-border bg-raised p-1 text-foreground shadow-raised outline-none">
          {children}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}
export function ComboboxItem({
  children,
  ...props
}: ComponentProps<typeof BaseCombobox.Item>) {
  return (
    <BaseCombobox.Item
      {...props}
      className="flex min-h-9 cursor-default items-center rounded-sm px-3 py-2 text-sm outline-none data-selected:bg-surface data-highlighted:bg-surface"
    >
      {children}
    </BaseCombobox.Item>
  );
}
