import { Images, ListTodo } from "@home-hub/ui-web";
import { useId } from "react";

type ListKind = "checklist" | "moodboard";

export function ListKindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ListKind;
  onChange: (kind: ListKind) => void;
  disabled?: boolean;
}) {
  const name = useId();

  return (
    <fieldset disabled={disabled} className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Type</legend>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["checklist", "Checklist", ListTodo],
            ["moodboard", "Moodboard", Images],
          ] as const
        ).map(([kind, label, Icon]) => (
          <label key={kind} className="min-w-0 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={kind}
              checked={value === kind}
              onChange={() => onChange(kind)}
              className="peer sr-only"
            />
            <span className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:cursor-default peer-disabled:opacity-50">
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
