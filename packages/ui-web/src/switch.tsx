import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { type ComponentProps, type ReactNode, useId } from "react";

type BaseSwitchRootProps = ComponentProps<typeof BaseSwitch.Root>;

export type SwitchProps = Omit<
  BaseSwitchRootProps,
  "children" | "className"
> & {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function Switch({
  label,
  description,
  className,
  ...props
}: SwitchProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const classes = [
    "flex min-w-0 cursor-pointer items-center justify-between gap-4",
    "has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label htmlFor={id} className={classes}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-sm text-muted">{description}</span>
        ) : null}
      </span>
      <BaseSwitch.Root
        {...props}
        id={id}
        className="inline-flex h-6 w-11 shrink-0 rounded-full border border-border bg-border p-0.5 outline-none transition-colors duration-[var(--motion-duration-fast)] data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <BaseSwitch.Thumb className="size-5 rounded-full bg-on-primary shadow-sm transition-transform duration-[var(--motion-duration-fast)] data-checked:translate-x-5" />
      </BaseSwitch.Root>
    </label>
  );
}
