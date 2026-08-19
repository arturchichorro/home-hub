import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "./icons";

type BaseRootProps = ComponentProps<typeof BaseCollapsible.Root>;

export type CollapsibleProps = Omit<BaseRootProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
  title: ReactNode;
};

export function Collapsible({
  children,
  className,
  defaultOpen = true,
  title,
  ...props
}: CollapsibleProps) {
  return (
    <BaseCollapsible.Root
      {...props}
      defaultOpen={props.open === undefined ? defaultOpen : undefined}
      className={className}
    >
      <BaseCollapsible.Trigger className="group flex w-full items-center justify-between py-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-5 transition-transform group-data-panel-open:rotate-180"
        />
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel className="overflow-hidden">
        <div className="pt-1 pb-4">{children}</div>
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
