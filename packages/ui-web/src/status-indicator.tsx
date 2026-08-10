import type { ComponentProps, ReactNode } from "react";

export type StatusIndicatorVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger";
export type StatusIndicatorSize = "compact" | "default";

export type StatusIndicatorProps = Omit<
  ComponentProps<"span">,
  "children" | "role"
> & {
  label: ReactNode;
  variant?: StatusIndicatorVariant;
  size?: StatusIndicatorSize;
  live?: boolean;
};

const variantClasses: Record<StatusIndicatorVariant, string> = {
  neutral: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const sizeClasses: Record<StatusIndicatorSize, string> = {
  compact: "gap-1.5 text-xs",
  default: "gap-2 text-sm",
};

const dotSizeClasses: Record<StatusIndicatorSize, string> = {
  compact: "size-1.5",
  default: "size-2",
};

export function StatusIndicator({
  label,
  variant = "neutral",
  size = "default",
  live = false,
  className,
  ...props
}: StatusIndicatorProps) {
  const classes = [
    "inline-flex items-center font-medium",
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      {...props}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-atomic={live || undefined}
      className={classes}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full bg-current ${dotSizeClasses[size]}`}
      />
      <span>{label}</span>
    </span>
  );
}
