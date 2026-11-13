import {
  Button,
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
  UserPlus,
} from "@home-hub/ui-web";
import { useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";

export function CalendarPeoplePicker({
  members,
  selected,
  disabled,
  onChange,
}: {
  members: readonly {
    userId: string;
    user?: { username: string } | undefined;
  }[];
  selected: readonly string[];
  disabled: boolean;
  onChange: (people: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  useBlockAppUpdate(open);
  const names = members
    .filter((m) => selected.includes(m.userId))
    .map((m) => m.user?.username ?? "Member")
    .join(", ");
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="compact"
            className="size-7! p-0!"
            aria-label="Calendar item people"
            title={names || "People"}
          >
            <UserPlus aria-hidden="true" className="size-4" />
          </Button>
        }
      />
      <PopoverPopup aria-label="Calendar item people" className="w-60!">
        <fieldset disabled={disabled} className="grid gap-1">
          <legend className="mb-2 text-xs font-medium text-muted">
            People
          </legend>
          {members.map((member) => (
            <label
              key={member.userId}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-1 text-sm hover:bg-surface"
            >
              <input
                type="checkbox"
                checked={selected.includes(member.userId)}
                onChange={(event) =>
                  onChange(
                    (event.target.checked
                      ? [...selected, member.userId]
                      : selected.filter((id) => id !== member.userId)
                    ).sort(),
                  )
                }
              />
              <span className="min-w-0 break-words">
                {member.user?.username ?? "Member"}
              </span>
            </label>
          ))}
        </fieldset>
      </PopoverPopup>
    </PopoverRoot>
  );
}
