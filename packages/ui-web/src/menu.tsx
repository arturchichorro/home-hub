import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps } from "react";
import { Button } from "./button";

export const MenuRoot = BaseMenu.Root;
export const MenuRadioGroup = BaseMenu.RadioGroup;

type BaseMenuTriggerProps = ComponentProps<typeof BaseMenu.Trigger>;

export type MenuTriggerProps = Omit<
  BaseMenuTriggerProps,
  "className" | "render"
> & {
  className?: string;
};

export function MenuTrigger({ className, ...props }: MenuTriggerProps) {
  return (
    <BaseMenu.Trigger
      {...props}
      render={<Button className={className ?? ""} variant="secondary" />}
    />
  );
}

type BaseMenuPopupProps = ComponentProps<typeof BaseMenu.Popup>;
type BaseMenuPositionerProps = ComponentProps<typeof BaseMenu.Positioner>;

export type MenuPopupProps = Omit<BaseMenuPopupProps, "className"> & {
  align?: BaseMenuPositionerProps["align"];
  side?: BaseMenuPositionerProps["side"];
  sideOffset?: BaseMenuPositionerProps["sideOffset"];
  className?: string;
};

export function MenuPopup({
  align = "start",
  side = "bottom",
  sideOffset = 8,
  className,
  ...props
}: MenuPopupProps) {
  const classes = [
    "min-w-48 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-raised p-1 text-foreground shadow-raised outline-none",
    "transition-[opacity,transform] duration-[var(--motion-duration-fast)]",
    "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <BaseMenu.Popup {...props} className={classes} />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export type MenuItemVariant = "default" | "danger";

type BaseMenuItemProps = ComponentProps<typeof BaseMenu.Item>;

export type MenuItemProps = Omit<BaseMenuItemProps, "className"> & {
  variant?: MenuItemVariant;
  className?: string;
};

const itemVariantClasses: Record<MenuItemVariant, string> = {
  default: "text-foreground data-highlighted:bg-surface",
  danger: "text-danger data-highlighted:bg-danger/10",
};

export function MenuItem({
  variant = "default",
  className,
  ...props
}: MenuItemProps) {
  const classes = [
    "flex min-h-9 cursor-default select-none items-center rounded-sm px-3 py-2 text-sm outline-none",
    "data-disabled:opacity-50",
    itemVariantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <BaseMenu.Item {...props} className={classes} />;
}

type BaseMenuRadioItemProps = ComponentProps<typeof BaseMenu.RadioItem>;

export type MenuRadioItemProps = Omit<BaseMenuRadioItemProps, "className"> & {
  className?: string;
};

export function MenuRadioItem({
  closeOnClick = true,
  className,
  children,
  ...props
}: MenuRadioItemProps) {
  const classes = [
    "grid min-h-9 cursor-default grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-3 py-2 text-sm text-foreground outline-none",
    "data-checked:bg-surface data-highlighted:bg-surface data-disabled:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseMenu.RadioItem
      {...props}
      closeOnClick={closeOnClick}
      className={classes}
    >
      <BaseMenu.RadioItemIndicator
        aria-hidden="true"
        keepMounted
        className="flex size-4 items-center justify-center text-primary data-unchecked:invisible"
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
      </BaseMenu.RadioItemIndicator>
      <span className="min-w-0 truncate">{children}</span>
    </BaseMenu.RadioItem>
  );
}

type BaseMenuSeparatorProps = ComponentProps<typeof BaseMenu.Separator>;

export type MenuSeparatorProps = Omit<BaseMenuSeparatorProps, "className"> & {
  className?: string;
};

export function MenuSeparator({ className, ...props }: MenuSeparatorProps) {
  const classes = ["my-1 h-px bg-border", className].filter(Boolean).join(" ");

  return <BaseMenu.Separator {...props} className={classes} />;
}
