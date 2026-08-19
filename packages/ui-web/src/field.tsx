import { Field as BaseField } from "@base-ui/react/field";
import { type ComponentProps, forwardRef, type ReactNode } from "react";
import { Input, type InputProps } from "./input";
import { Textarea, type TextareaProps } from "./textarea";

type BaseFieldRootProps = ComponentProps<typeof BaseField.Root>;

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

export type FieldControlProps = Omit<InputProps, "appearance" | "className"> & {
  className?: string;
};

export const FieldControl = forwardRef<HTMLInputElement, FieldControlProps>(
  function FieldControl({ className, ...props }, ref) {
    return (
      <Input
        {...props}
        ref={ref}
        appearance="field"
        className={className ?? ""}
      />
    );
  },
);

export type FieldTextareaProps = Omit<
  TextareaProps,
  "appearance" | "className"
> & { className?: string };

export function FieldTextarea({ className, ...props }: FieldTextareaProps) {
  return (
    <BaseField.Control
      render={
        <Textarea {...props} appearance="field" className={className ?? ""} />
      }
    />
  );
}
