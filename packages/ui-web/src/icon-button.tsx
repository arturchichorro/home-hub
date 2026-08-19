import { forwardRef, type ReactNode } from "react";
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

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ variant = "ghost", className, ...props }, ref) {
    const classes = ["size-10! p-0!", className].filter(Boolean).join(" ");

    return (
      <Button
        {...props}
        ref={ref}
        variant={variant}
        size="compact"
        className={classes}
      />
    );
  },
);
