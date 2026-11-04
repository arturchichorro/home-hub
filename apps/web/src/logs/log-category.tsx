import { logColors } from "@home-hub/shared/logs";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { LogCategory } from "@home-hub/shared/zero/schema";
import {
  Button,
  DialogPopup,
  DialogRoot,
  InlineAlert,
  Input,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { TextDraftGuard } from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
export const categoryColors: Record<string, string> = {
  slate: "text-slate-200 bg-slate-400/15",
  red: "text-red-200 bg-red-400/15",
  orange: "text-orange-200 bg-orange-400/15",
  amber: "text-amber-200 bg-amber-400/15",
  green: "text-green-200 bg-green-400/15",
  teal: "text-teal-200 bg-teal-400/15",
  blue: "text-blue-200 bg-blue-400/15",
  violet: "text-violet-200 bg-violet-400/15",
};
type Color = LogCategory["color"];
export function LogCategoryDialog({
  householdId,
  initial,
  onClose,
}: {
  householdId: string;
  initial: LogCategory | undefined;
  onClose: () => void;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled();
  const [name, setName] = useState(initial?.name ?? ""),
    [color, setColor] = useState<Color>(
      initial?.color ??
        logColors[Math.floor(Math.random() * logColors.length)] ??
        "slate",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [removing, setRemoving] = useState(false);
  const dirty =
    name !== (initial?.name ?? "") || (!!initial && color !== initial.color);
  useBlockAppUpdate(dirty || busy);
  async function save() {
    if (!enabled || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acknowledgeMutation(
        zero.mutate(
          mutators.logs.saveCategory({
            householdId,
            categoryId: initial?.id ?? crypto.randomUUID(),
            name,
            color,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (r.type !== "success") throw Error();
      onClose();
    } catch {
      setError("Unable to save this category. Its name may already exist.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!initial || !enabled || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acknowledgeMutation(
        zero.mutate(
          mutators.logs.deleteCategory({
            householdId,
            categoryId: initial.id,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (r.type !== "success") throw Error();
      onClose();
    } catch {
      setError("Unable to remove this category.");
    } finally {
      setBusy(false);
    }
  }
  const discard = () => {
    setName(initial?.name ?? "");
    setColor(initial?.color ?? "slate");
    setError(undefined);
  };
  return (
    <>
      <DialogRoot
        open
        onOpenChange={(open) => {
          if (!open && !busy && !dirty) onClose();
        }}
      >
        <DialogPopup
          title={
            removing
              ? "Remove category?"
              : initial
                ? "Edit category"
                : "New category"
          }
          actions={
            removing ? (
              <>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setRemoving(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={!enabled || busy}
                  onClick={() => void remove()}
                >
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    discard();
                    onClose();
                  }}
                >
                  Cancel
                </Button>
                {initial ? (
                  <Button
                    variant="ghost"
                    disabled={busy || dirty}
                    onClick={() => setRemoving(true)}
                  >
                    Remove
                  </Button>
                ) : null}
                <Button
                  disabled={!enabled || busy || !name.trim()}
                  onClick={() => void save()}
                >
                  Save
                </Button>
              </>
            )
          }
        >
          {removing ? (
            <p className="text-sm">
              Its logs will become uncategorized. Their entries remain.
            </p>
          ) : (
            <div className="grid gap-3">
              <Input
                aria-label="Category name"
                placeholder="Category name"
                autoFocus
                maxLength={100}
                value={name}
                disabled={!enabled || busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <fieldset
                className="flex flex-wrap gap-2"
                aria-label="Category color"
              >
                {logColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={c === color}
                    disabled={!enabled || busy}
                    className={`size-8 rounded-sm border ${color === c ? "border-foreground" : "border-transparent"} ${categoryColors[c]}`}
                    onClick={() => setColor(c)}
                  >
                    <span aria-hidden="true">●</span>
                  </button>
                ))}
              </fieldset>
            </div>
          )}
          {error ? (
            <InlineAlert variant="danger" role="alert">
              {error}
            </InlineAlert>
          ) : null}
        </DialogPopup>
      </DialogRoot>
      {dirty ? (
        <TextDraftGuard
          editor={{
            hasChanges: dirty,
            isSaving: busy,
            error,
            retry: () => void save(),
            discard,
          }}
        />
      ) : null}
    </>
  );
}
export function LogCategoryChooser({
  householdId,
  logId,
  current,
  categories,
  onClose,
}: {
  householdId: string;
  logId: string;
  current: string | null;
  categories: readonly LogCategory[];
  onClose: () => void;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled(),
    [value, setValue] = useState(current ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  useBlockAppUpdate(value !== (current ?? "") || busy);
  async function save() {
    if (!enabled || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acknowledgeMutation(
        zero.mutate(
          mutators.logs.setCategory({
            householdId,
            logId,
            categoryId: value || null,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (r.type !== "success") throw Error();
      onClose();
    } catch {
      setError("Unable to change the category.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogRoot
        open
        onOpenChange={(open) => {
          if (!open && !busy && value === (current ?? "")) onClose();
        }}
      >
        <DialogPopup
          title="Log category"
          actions={
            <>
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!enabled || busy} onClick={() => void save()}>
                Save
              </Button>
            </>
          }
        >
          <select
            aria-label="Log category"
            className="w-full rounded-sm border border-border bg-surface p-2 text-sm"
            disabled={!enabled || busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {value && !categories.some((c) => c.id === value) ? (
              <option value={value} disabled>
                Removed category — choose another
              </option>
            ) : null}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error ? (
            <InlineAlert variant="danger" role="alert">
              {error}
            </InlineAlert>
          ) : null}
        </DialogPopup>
      </DialogRoot>
      {value !== (current ?? "") ? (
        <TextDraftGuard
          editor={{
            hasChanges: true,
            isSaving: busy,
            error,
            retry: () => void save(),
            discard: () => setValue(current ?? ""),
          }}
        />
      ) : null}
    </>
  );
}
