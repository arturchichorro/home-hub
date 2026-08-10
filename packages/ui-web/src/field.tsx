import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";

type BaseFieldRootProps = ComponentProps<typeof BaseField.Root>;
type BaseFieldControlProps = ComponentProps<typeof BaseField.Control>;

const fieldControlClasses = [
  "w-full rounded-md border border-border bg-surface text-base text-foreground outline-none",
  "placeholder:text-subtle enabled:hover:border-subtle",
  "focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/30",
  "data-invalid:border-danger data-invalid:focus-visible:ring-danger/30",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "read-only:cursor-default read-only:bg-raised",
  "transition-colors duration-[var(--motion-duration-fast)]",
].join(" ");

export type FieldProps = Omit<BaseFieldRootProps, "children" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  busy?: boolean;
  children: ReactNode;
  className?: string;
};

export function Field({
  label,
  description,
  error,
  busy = false,
  disabled = false,
  invalid = error !== undefined && error !== null,
  children,
  className,
  ...props
}: FieldProps) {
  const classes = ["grid gap-1.5", className].filter(Boolean).join(" ");

  return (
    <BaseField.Root
      {...props}
      disabled={disabled || busy}
      invalid={invalid}
      aria-busy={busy || undefined}
      className={classes}
    >
      <BaseField.Label className="text-sm font-medium text-foreground data-disabled:text-subtle">
        {label}
      </BaseField.Label>
      {children}
      {description ? (
        <BaseField.Description className="text-sm text-muted data-disabled:text-subtle">
          {description}
        </BaseField.Description>
      ) : null}
      {error !== undefined && error !== null ? (
        <BaseField.Error match className="text-sm text-danger">
          {error}
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}

export type FieldControlProps = Omit<BaseFieldControlProps, "className"> & {
  className?: string;
};

export function FieldControl({ className, ...props }: FieldControlProps) {
  const classes = [fieldControlClasses, "h-10 px-3", className]
    .filter(Boolean)
    .join(" ");

  return <BaseField.Control {...props} className={classes} />;
}

export type FieldTextareaProps = Omit<
  ComponentProps<"textarea">,
  "className"
> & {
  className?: string;
};

export function FieldTextarea({ className, ...props }: FieldTextareaProps) {
  const classes = [
    fieldControlClasses,
    "min-h-24 resize-y px-3 py-2",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseField.Control render={<textarea {...props} className={classes} />} />
  );
}
