import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type { ComponentProps } from "react";
import { ChevronDown } from "./icons";

export const AccordionRoot = BaseAccordion.Root;
export const AccordionItem = BaseAccordion.Item;
export const AccordionHeader = BaseAccordion.Header;
export type AccordionTriggerProps = Omit<
  ComponentProps<typeof BaseAccordion.Trigger>,
  "className"
> & { className?: string };
export function AccordionTrigger({
  children,
  className,
  ...props
}: AccordionTriggerProps) {
  return (
    <BaseAccordion.Trigger
      {...props}
      className={[
        "group flex w-full items-center justify-between gap-2 py-2 text-sm font-medium text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      <ChevronDown
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180"
      />
    </BaseAccordion.Trigger>
  );
}
export type AccordionPanelProps = Omit<
  ComponentProps<typeof BaseAccordion.Panel>,
  "className"
> & { className?: string };
export function AccordionPanel({
  children,
  className,
  keepMounted = true,
  ...props
}: AccordionPanelProps) {
  return (
    <BaseAccordion.Panel
      {...props}
      keepMounted={keepMounted}
      className={["min-w-0 overflow-hidden", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </BaseAccordion.Panel>
  );
}
