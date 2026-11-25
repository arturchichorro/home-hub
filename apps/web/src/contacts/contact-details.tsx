import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  type ContactDetail,
  detailHref,
  detailLabels,
  detailTypes,
} from "@home-hub/shared/contacts";
import {
  Button,
  GripVertical,
  IconButton,
  Input,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { workoutOrderingSensors } from "../workouts/workout-list";

function Birthday({
  value,
  label,
  disabled,
  change,
}: {
  value: string;
  label: string;
  disabled: boolean;
  change: (s: string) => void;
}) {
  const parts = value.startsWith("--")
    ? ["", ...value.slice(2).split("-")]
    : value.split("-");
  const [year = "", month = "", day = ""] = parts;
  const update = (part: number, v: string) => {
    const next = [year, month, day];
    next[part] = v;
    change((next[0] || "--") + (next[0] ? "-" : "") + next[1] + "-" + next[2]);
  };
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      <Input
        appearance="seamless"
        className="h-7! w-14! flex-none!"
        inputMode="numeric"
        aria-label={label + " day"}
        placeholder="Day"
        maxLength={2}
        disabled={disabled}
        value={day}
        onValueChange={(v) => update(2, v)}
        onBlur={() => {
          if (day) {
            update(2, day.padStart(2, "0"));
          }
        }}
      />
      <Input
        appearance="seamless"
        className="h-7! w-14! flex-none!"
        inputMode="numeric"
        aria-label={label + " month"}
        placeholder="Month"
        maxLength={2}
        disabled={disabled}
        value={month}
        onValueChange={(v) => update(1, v)}
        onBlur={() => {
          if (month) {
            update(1, month.padStart(2, "0"));
          }
        }}
      />
      <Input
        appearance="seamless"
        className="h-7! w-24! flex-none!"
        inputMode="numeric"
        aria-label={label + " year (optional)"}
        placeholder="Year (opt.)"
        maxLength={4}
        disabled={disabled}
        value={year}
        onValueChange={(v) => update(0, v)}
      />
    </div>
  );
}

function Detail({
  row,
  index,
  disabled,
  change,
  remove,
}: {
  row: ContactDetail;
  index: number;
  disabled: boolean;
  change: (r: ContactDetail) => void;
  remove: () => void;
}) {
  const sortable = useSortable({
    id: row.id,
    index,
    type: "contact-detail",
    accept: "contact-detail",
    disabled,
  });
  const href = detailHref(row);
  return (
    <li
      ref={sortable.ref}
      className="flex min-w-0 items-start gap-1 border-b border-border py-2"
    >
      <IconButton
        ref={sortable.handleRef}
        className="size-7! shrink-0 touch-none"
        aria-label={"Reorder " + row.label}
        disabled={disabled}
      >
        <GripVertical className="size-4" />
      </IconButton>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 gap-1">
          <select
            aria-label={"Type for " + row.label}
            value={row.type}
            disabled={disabled}
            className="h-7 w-24 shrink-0 bg-transparent text-xs text-muted"
            onChange={(e) => {
              const type = e.target.value as ContactDetail["type"];
              change({
                ...row,
                type,
                label:
                  row.label === detailLabels[row.type]
                    ? detailLabels[type]
                    : row.label,
              });
            }}
          >
            {detailTypes.map((type) => (
              <option key={type} value={type}>
                {detailLabels[type]}
              </option>
            ))}
          </select>
          <Input
            appearance="seamless"
            aria-label="Detail label"
            className="h-7! min-w-0 text-xs text-muted"
            maxLength={100}
            value={row.label}
            disabled={disabled}
            onValueChange={(label) => change({ ...row, label })}
          />
        </div>
        {row.type === "birthday" ? (
          <Birthday
            value={row.value}
            label={row.label}
            disabled={disabled}
            change={(value) => change({ ...row, value })}
          />
        ) : row.type === "text" ? (
          <Textarea
            appearance="seamless"
            aria-label={"Value for " + row.label}
            className="min-h-7! min-w-0 py-0! text-sm"
            rows={1}
            maxLength={5000}
            disabled={disabled}
            value={row.value}
            onChange={(e) => change({ ...row, value: e.target.value })}
          />
        ) : (
          <Input
            appearance="seamless"
            className="h-7! min-w-0"
            aria-label={"Value for " + row.label}
            type={
              row.type === "phone"
                ? "tel"
                : row.type === "email"
                  ? "email"
                  : "url"
            }
            maxLength={5000}
            disabled={disabled}
            value={row.value}
            onValueChange={(value) => change({ ...row, value })}
          />
        )}
      </div>
      {href ? (
        <a
          href={href}
          target={row.type === "link" ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="shrink-0 px-1 text-xs leading-7 text-muted underline"
          aria-label={"Open " + row.label}
        >
          {row.type === "phone"
            ? "Call"
            : row.type === "email"
              ? "Email"
              : "Open"}
        </a>
      ) : null}
      <IconButton
        className="size-7! shrink-0"
        aria-label={"Remove " + row.label}
        disabled={disabled}
        onClick={remove}
      >
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

export function ContactDetails({
  rows,
  disabled,
  change,
}: {
  rows: ContactDetail[];
  disabled: boolean;
  change: (r: ContactDetail[]) => void;
}) {
  return (
    <div className="min-w-0">
      <DragDropProvider
        sensors={workoutOrderingSensors}
        onDragEnd={(event) => {
          const source = event.operation.source;
          if (disabled || event.canceled || !isSortable(source)) {
            return;
          }
          const result = [...rows];
          const from = result.findIndex((r) => r.id === source.id);
          if (from < 0) {
            return;
          }
          const [moved] = result.splice(from, 1);
          if (moved) {
            result.splice(source.index, 0, moved);
            change(result);
          }
        }}
      >
        <ul>
          {rows.map((row, index) => (
            <Detail
              key={row.id}
              row={row}
              index={index}
              disabled={disabled}
              change={(next) =>
                change(rows.map((r) => (r.id === row.id ? next : r)))
              }
              remove={() => change(rows.filter((r) => r.id !== row.id))}
            />
          ))}
        </ul>
      </DragDropProvider>
      <fieldset
        className="flex min-w-0 flex-wrap gap-1 pt-2"
        aria-label="Add contact detail"
      >
        {detailTypes.map((type) => (
          <Button
            key={type}
            size="compact"
            variant="ghost"
            disabled={disabled || rows.length >= 100}
            onClick={() =>
              change([
                ...rows,
                {
                  id: crypto.randomUUID(),
                  type,
                  label: detailLabels[type],
                  value: "",
                },
              ])
            }
          >
            + {detailLabels[type]}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
