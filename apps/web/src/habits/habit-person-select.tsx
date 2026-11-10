import {
  SelectItem,
  SelectPopup,
  SelectRoot,
  SelectTrigger,
} from "@home-hub/ui-web";
import type { Ref } from "react";
import type { HabitView } from "./use-habit-view";

export function HabitPersonSelect({
  view,
  currentUserId,
  onChange,
  triggerRef,
}: {
  view: HabitView;
  currentUserId: string;
  triggerRef?: Ref<HTMLButtonElement>;
  onChange: (person: string) => void;
}) {
  const items = view.members.map((member) => ({
    value: member.userId,
    label:
      member.userId === currentUserId
        ? "Me"
        : (member.user?.username ?? "Member"),
  }));
  return (
    <SelectRoot
      value={view.personId}
      items={items}
      disabled={view.locked || view.memberResult.type !== "complete"}
      onValueChange={(value) => {
        if (value && !view.locked) {
          onChange(value);
        }
      }}
    >
      <SelectTrigger
        ref={triggerRef}
        aria-label="View activity for"
        className="w-auto! min-w-24"
      />
      <SelectPopup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </SelectRoot>
  );
}
