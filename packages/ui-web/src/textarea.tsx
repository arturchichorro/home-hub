import { type ComponentProps, forwardRef } from "react";

export type TextareaAppearance = "field" | "inline" | "seamless";

export type TextareaProps = Omit<
  ComponentProps<"textarea">,
  "className" | "ref"
> & {
  appearance?: TextareaAppearance;
  className?: string;
};

const textareaBaseClasses = [
  "min-w-0 outline-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "transition-colors duration-[var(--motion-duration-fast)]",
].join(" ");

const fieldTextareaClasses = [
  "min-h-24 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-foreground",
  "placeholder:text-subtle enabled:hover:border-subtle",
  "focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/30",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/30",
  "read-only:cursor-default read-only:bg-raised",
].join(" ");

const inlineTextareaClasses = [
  "field-sizing-content min-h-10 w-full resize-none rounded-sm border-0 bg-transparent px-1 py-2 text-foreground",
  "placeholder:text-subtle enabled:cursor-text enabled:hover:bg-raised",
  "focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring/40",
  "aria-invalid:ring-2 aria-invalid:ring-danger/40 disabled:cursor-default",
].join(" ");

const seamlessTextareaClasses = [
  "field-sizing-content min-h-10 w-full resize-none border-0 bg-transparent px-1 py-2 text-foreground",
  "placeholder:text-subtle enabled:cursor-text disabled:cursor-default",
].join(" ");

const appearanceClasses: Record<TextareaAppearance, string> = {
  field: fieldTextareaClasses,
  inline: inlineTextareaClasses,
  seamless: seamlessTextareaClasses,
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ appearance = "field", className, ...props }, ref) {
    const classes = [
      textareaBaseClasses,
      appearanceClasses[appearance],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <textarea {...props} ref={ref} className={classes} />;
  },
);
