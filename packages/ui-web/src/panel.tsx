import type { ComponentProps, ReactNode } from "react";

export type PanelVariant = "default" | "raised";

export type PanelProps = Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: PanelVariant;
};

const variantClasses: Record<PanelVariant, string> = {
  default: "border-border bg-surface",
  raised: "border-border bg-raised shadow-raised",
};

export function Panel({
  title,
  description,
  actions,
  footer,
  variant = "default",
  className,
  children,
  ...props
}: PanelProps) {
  const classes = [
    "overflow-hidden rounded-lg border",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const hasHeader = title !== undefined || description !== undefined || actions;

  return (
    <section {...props} className={classes}>
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title !== undefined ? (
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            ) : null}
            {description !== undefined ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className="px-5 py-4">{children}</div>
      {footer !== undefined ? (
        <footer className="border-t border-border px-5 py-4">{footer}</footer>
      ) : null}
    </section>
  );
}
