import { Button as BaseButton } from "@base-ui/react/button";
import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "default" | "compact";

export type ButtonProps = Omit<
  BaseButton.Props,
  "className" | "nativeButton" | "render"
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:brightness-90",
  secondary: "bg-raised text-foreground hover:bg-border active:brightness-90",
  ghost:
    "bg-transparent text-muted hover:bg-raised hover:text-foreground active:brightness-90",
  danger: "bg-danger text-on-primary hover:brightness-110 active:brightness-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 text-sm",
  compact: "h-8 px-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "default",
      busy = false,
      disabled = false,
      focusableWhenDisabled,
      type = "button",
      className,
      children,
      ...props
    },
    ref,
  ) {
    const classes = [
      "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium outline-none select-none",
      "transition-colors duration-[var(--motion-duration-fast)]",
      "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      variantClasses[variant],
      sizeClasses[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <BaseButton
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || busy}
        focusableWhenDisabled={busy || focusableWhenDisabled}
        aria-busy={busy || undefined}
        className={classes}
      >
        <span
          className={
            busy
              ? "inline-flex items-center gap-2 opacity-0"
              : "inline-flex items-center gap-2"
          }
        >
          {children}
        </span>
        {busy ? (
          <span
            aria-hidden="true"
            className="absolute size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          />
        ) : null}
      </BaseButton>
    );
  },
);
