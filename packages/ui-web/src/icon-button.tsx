import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

export type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type IconButtonProps = Omit<
  ButtonProps,
  "aria-label" | "children" | "size" | "variant"
> & {
  "aria-label": string;
  children: ReactNode;
  variant?: IconButtonVariant;
};

export function IconButton({
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  const classes = ["size-10! p-0!", className].filter(Boolean).join(" ");

  return (
    <Button {...props} variant={variant} size="compact" className={classes} />
  );
}
