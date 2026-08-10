import { Select as BaseSelect } from "@base-ui/react/select";
import type { ComponentProps } from "react";

export const SelectRoot = BaseSelect.Root;

type BaseSelectTriggerProps = ComponentProps<typeof BaseSelect.Trigger>;
type BaseSelectValueProps = ComponentProps<typeof BaseSelect.Value>;

export type SelectTriggerProps = Omit<
  BaseSelectTriggerProps,
  "children" | "className"
> & {
  children?: BaseSelectValueProps["children"];
  placeholder?: BaseSelectValueProps["placeholder"];
  className?: string;
};

export function SelectTrigger({
  children,
  placeholder,
  className,
  ...props
}: SelectTriggerProps) {
  const classes = [
    "flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-left text-sm text-foreground outline-none",
    "hover:border-subtle focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/30",
    "data-invalid:border-danger data-invalid:focus-visible:ring-danger/30",
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    "transition-colors duration-[var(--motion-duration-fast)]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseSelect.Trigger {...props} className={classes}>
      <BaseSelect.Value placeholder={placeholder} className="min-w-0 truncate">
        {children}
      </BaseSelect.Value>
      <BaseSelect.Icon className="shrink-0 text-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

type BaseSelectPopupProps = ComponentProps<typeof BaseSelect.Popup>;
type BaseSelectPositionerProps = ComponentProps<typeof BaseSelect.Positioner>;

export type SelectPopupProps = Omit<BaseSelectPopupProps, "className"> & {
  align?: BaseSelectPositionerProps["align"];
  side?: BaseSelectPositionerProps["side"];
  sideOffset?: BaseSelectPositionerProps["sideOffset"];
  className?: string;
};

export function SelectPopup({
  align = "start",
  side = "bottom",
  sideOffset = 8,
  className,
  children,
  ...props
}: SelectPopupProps) {
  const classes = [
    "max-h-[min(24rem,var(--available-height))] min-w-(--anchor-width) overflow-y-auto rounded-md border border-border bg-raised p-1 text-foreground shadow-raised outline-none",
    "transition-[opacity,transform] duration-[var(--motion-duration-fast)]",
    "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <BaseSelect.Popup {...props} className={classes}>
          <BaseSelect.List>{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

type BaseSelectItemProps = ComponentProps<typeof BaseSelect.Item>;

export type SelectItemProps = Omit<
  BaseSelectItemProps,
  "children" | "className"
> & {
  children: BaseSelectItemProps["children"];
  className?: string;
};

export function SelectItem({ children, className, ...props }: SelectItemProps) {
  const classes = [
    "grid min-h-9 cursor-default grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-3 py-2 text-sm text-foreground outline-none",
    "data-selected:bg-surface data-highlighted:bg-surface data-disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseSelect.Item {...props} className={classes}>
      <BaseSelect.ItemIndicator
        aria-hidden="true"
        keepMounted
        className="invisible flex size-4 items-center justify-center text-primary data-selected:visible"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m3 8 3 3 7-7" />
        </svg>
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className="min-w-0 truncate">
        {children}
      </BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
