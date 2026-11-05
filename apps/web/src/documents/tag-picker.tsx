import { type DocumentColor, documentColors } from "@home-hub/shared/documents";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { Schema } from "@home-hub/shared/zero/schema";
import {
  Button,
  ConfirmationPopover,
  IconButton,
  Input,
  Pencil,
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
  Tags,
  Trash2,
} from "@home-hub/ui-web";
import type { Row } from "@rocicorp/zero";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { DocumentWorkGuard } from "./work-guard";

export type DocumentTag = Row<Schema["tables"]["documentTags"]>;

export const tagClasses: Record<string, string> = {
  slate: "bg-slate-400/15 text-slate-200",
  red: "bg-red-400/15 text-red-200",
  orange: "bg-orange-400/15 text-orange-200",
  amber: "bg-amber-400/15 text-amber-200",
  green: "bg-green-400/15 text-green-200",
  teal: "bg-teal-400/15 text-teal-200",
  blue: "bg-blue-400/15 text-blue-200",
  violet: "bg-violet-400/15 text-violet-200",
};

type Command = () => ReturnType<ReturnType<typeof useZero>["mutate"]>;

export function DocumentTagPicker({
  householdId,
  documentId,
  tags,
  selected = [],
  onWork,
}: {
  householdId: string;
  documentId?: string;
  tags: readonly DocumentTag[];
  selected?: readonly string[];
  onWork?: (key: string, busy: boolean) => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<DocumentColor>(
    documentColors[tags.length % documentColors.length] ?? "slate",
  );
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<() => Promise<void>>();
  const dirty = !!name || !!editing || !!retry;
  const key = `${documentId ?? "catalogue"}:tags`;

  useEffect(() => {
    onWork?.(key, open || dirty || busy);

    return () => onWork?.(key, false);
  }, [onWork, key, open, dirty, busy]);

  function reset() {
    setName("");
    setEditing(undefined);
    setError(undefined);
    setRetry(undefined);
    setColor(documentColors[tags.length % documentColors.length] ?? "slate");
  }

  async function commit(
    command: Command,
    done: () => void | Promise<void> = () => {},
  ) {
    if (busy || !enabled) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      const outcome = await acknowledgeMutation(command());

      if (outcome.type !== "success") {
        throw Error();
      }

      await done();
      setRetry(undefined);
    } catch {
      setError(
        "The tag change could not be saved. A name may already exist, or access may have changed.",
      );
      setRetry(() => () => commit(command, done));
    } finally {
      setBusy(false);
    }
  }

  const usable = enabled && !busy && !retry;

  return (
    <>
      <PopoverRoot
        open={open}
        onOpenChange={(value) => {
          setOpen(value);

          if (value && !dirty) {
            setColor(
              documentColors[tags.length % documentColors.length] ?? "slate",
            );
          }
        }}
      >
        <PopoverTrigger
          render={
            <IconButton
              aria-label={
                documentId ? "Edit document tags" : "Manage household tags"
              }
              className="size-7!"
              disabled={!enabled}
            >
              <Tags aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
        <PopoverPopup>
          <p className="mb-2 text-sm font-medium">
            {documentId ? "Document tags" : "Household tags"}
          </p>
          <ul className="grid gap-1">
            {tags.map((tag) => (
              <li key={tag.id} className="flex min-w-0 items-center gap-2 py-1">
                {documentId ? (
                  <input
                    type="checkbox"
                    aria-label={tag.name}
                    checked={selected.includes(tag.id)}
                    disabled={!usable}
                    onChange={(e) => {
                      const assigned = e.target.checked;
                      void commit(() =>
                        zero.mutate(
                          mutators.documents.assignTag({
                            householdId,
                            documentId,
                            tagId: tag.id,
                            assigned,
                          }),
                        ),
                      );
                    }}
                  />
                ) : null}
                <span
                  className={`min-w-0 flex-1 break-words rounded-sm px-2 py-0.5 text-sm ${tagClasses[tag.color]}`}
                >
                  {tag.name}
                </span>
                <IconButton
                  aria-label={`Edit tag ${tag.name}`}
                  className="size-7!"
                  disabled={!usable || dirty}
                  onClick={() => {
                    setEditing(tag.id);
                    setName(tag.name);
                    setColor(tag.color);
                  }}
                >
                  <Pencil aria-hidden="true" className="size-3" />
                </IconButton>
                <ConfirmationPopover
                  message={`Delete “${tag.name}” from every document? Documents and files remain.`}
                  trigger={
                    <IconButton
                      aria-label={`Delete tag ${tag.name}`}
                      className="size-7!"
                      disabled={!usable || dirty}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </IconButton>
                  }
                  onConfirm={() =>
                    commit(() =>
                      zero.mutate(
                        mutators.documents.deleteTag({
                          householdId,
                          tagId: tag.id,
                          optimisticTimestamp: Date.now(),
                        }),
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <form
            className="mt-3 grid gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();

              if (!name.trim() || !usable) {
                return;
              }

              const tagId = editing ?? crypto.randomUUID();
              const newTag = !editing;
              void commit(
                () =>
                  zero.mutate(
                    mutators.documents.saveTag({
                      householdId,
                      tagId,
                      name,
                      color,
                      optimisticTimestamp: Date.now(),
                    }),
                  ),
                async () => {
                  if (newTag && documentId) {
                    const outcome = await acknowledgeMutation(
                      zero.mutate(
                        mutators.documents.assignTag({
                          householdId,
                          documentId,
                          tagId,
                          assigned: true,
                        }),
                      ),
                    );

                    if (outcome.type !== "success") {
                      throw Error();
                    }
                  }

                  reset();
                },
              );
            }}
          >
            <Input
              aria-label={editing ? "Tag name" : "New tag name"}
              placeholder="New tag"
              maxLength={50}
              value={name}
              disabled={!enabled || busy}
              onChange={(e) => {
                setName(e.target.value);
                setRetry(undefined);
                setError(undefined);
              }}
            />
            <fieldset className="flex flex-wrap gap-1" aria-label="Tag color">
              {documentColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  disabled={!enabled || busy}
                  className={`size-7 rounded-sm border ${color === c ? "border-foreground" : "border-transparent"} ${tagClasses[c]}`}
                  onClick={() => {
                    setColor(c);
                    setRetry(undefined);
                    setError(undefined);
                  }}
                >
                  <span aria-hidden="true">●</span>
                </button>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button
                size="compact"
                type="submit"
                disabled={!usable || !name.trim()}
              >
                {editing ? "Save tag" : "Create tag"}
              </Button>
              {dirty ? (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={busy}
                  onClick={reset}
                >
                  Discard
                </Button>
              ) : null}
            </div>
          </form>
          {error ? (
            <div className="mt-2 text-sm" role="alert">
              <p>{error}</p>
              <Button
                size="compact"
                variant="ghost"
                disabled={busy || !enabled}
                onClick={() => void retry?.()}
              >
                Retry
              </Button>
              <Button
                size="compact"
                variant="ghost"
                disabled={busy}
                onClick={reset}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </PopoverPopup>
      </PopoverRoot>
      {dirty || busy ? (
        <DocumentWorkGuard dirty={dirty} busy={busy} discard={reset} />
      ) : null}
    </>
  );
}
