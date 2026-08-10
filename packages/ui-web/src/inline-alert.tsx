import type { ComponentProps, ReactNode } from "react";

export type InlineAlertVariant = "info" | "success" | "warning" | "danger";

export type InlineAlertProps = Omit<
  ComponentProps<"div">,
  "children" | "role" | "title"
> & {
  children: ReactNode;
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: InlineAlertVariant;
  role?: "status" | "alert";
};

const variantClasses: Record<InlineAlertVariant, string> = {
  info: "border-focus-ring/40 bg-focus-ring/10",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  danger: "border-danger/40 bg-danger/10",
};

const accentClasses: Record<InlineAlertVariant, string> = {
  info: "text-focus-ring",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function InlineAlert({
  children,
  title,
  icon,
  action,
  variant = "info",
  role,
  className,
  ...props
}: InlineAlertProps) {
  const classes = [
    "flex items-start gap-3 rounded-md border px-4 py-3",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div {...props} role={role} className={classes}>
      {icon ? (
        <span aria-hidden="true" className={accentClasses[variant]}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title !== undefined ? (
          <p className={`font-medium ${accentClasses[variant]}`}>{title}</p>
        ) : null}
        <div
          className={
            title !== undefined
              ? "mt-1 text-sm text-foreground"
              : "text-sm text-foreground"
          }
        >
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
