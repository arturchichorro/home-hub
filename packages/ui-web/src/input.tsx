import { Input as BaseInput } from "@base-ui/react/input";
import { type ComponentProps, forwardRef } from "react";

export type InputAppearance = "field" | "inline";

export type InputProps = Omit<
  ComponentProps<typeof BaseInput>,
  "className" | "ref"
> & {
  appearance?: InputAppearance;
  className?: string;
};

const inputBaseClasses = [
  "min-w-0 text-base outline-none",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "transition-colors duration-[var(--motion-duration-fast)]",
].join(" ");

const fieldInputClasses = [
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-foreground",
  "placeholder:text-subtle enabled:hover:border-subtle",
  "focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/30",
  "data-invalid:border-danger data-invalid:focus-visible:ring-danger/30",
  "read-only:cursor-default read-only:bg-raised",
].join(" ");

const inlineInputClasses = [
  "h-10 flex-1 rounded-sm border-0 bg-transparent px-1",
  "enabled:cursor-text enabled:hover:bg-raised",
  "focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring/40",
  "aria-invalid:ring-2 aria-invalid:ring-danger/40",
  "disabled:cursor-default",
].join(" ");

const appearanceClasses: Record<InputAppearance, string> = {
  field: fieldInputClasses,
  inline: inlineInputClasses,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { appearance = "field", className, ...props },
  ref,
) {
  const classes = [inputBaseClasses, appearanceClasses[appearance], className]
    .filter(Boolean)
    .join(" ");

  return <BaseInput {...props} ref={ref} className={classes} />;
});
