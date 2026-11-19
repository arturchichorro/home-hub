import { useSortable } from "@dnd-kit/react/sortable";
import {
  type FlashcardFields,
  flashcardChanges,
  flashcardFieldsSchema,
  flashcardTextLimit,
} from "@home-hub/shared/flashcards";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  ConfirmationPopover,
  GripVertical,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TextDraftActions } from "../editing/text-draft-actions";
import { useTextRecordEditor } from "../editing/use-text-record-editor";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";

export type FlashcardControl = {
  flush: () => Promise<boolean>;
  discard: () => void;
  snapshot: () => {
    value: FlashcardFields;
    saved: boolean;
    hasChanges: boolean;
    isSaving: boolean;
  };
};

export function FlashcardRow({
  householdId,
  listId,
  cardId,
  initial,
  current,
  persisted,
  enabled,
  blocked,
  orderDisabled,
  index,
  autoFocus,
  controls,
  onActivity,
  onRemoved,
}: {
  householdId: string;
  listId: string;
  cardId: string;
  initial: FlashcardFields;
  current: FlashcardFields | undefined;
  persisted: boolean;
  enabled: boolean;
  blocked: boolean;
  orderDisabled: boolean;
  index: number;
  autoFocus: boolean;
  controls: Ref<FlashcardControl>;
  onActivity: (dirty: boolean, saving: boolean) => void;
  onRemoved: () => void;
}) {
  const zero = useZero();
  const [observed, setObserved] = useState(persisted);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const front = useRef<HTMLTextAreaElement>(null);
  const unavailable = observed && !current;
  const sortable = useSortable({
    id: cardId,
    index,
    type: `flashcards:${householdId}:${listId}`,
    accept: `flashcards:${householdId}:${listId}`,
    disabled: orderDisabled || !enabled,
  });
  useBlockAppUpdate(deleting || confirming);
  useEffect(() => {
    if (autoFocus) {
      front.current?.focus();
    }
  }, [autoFocus]);

  const editor = useTextRecordEditor({
    initial,
    persisted,
    current: current ? { front: current.front, back: current.back } : undefined,
    enabled: enabled && !unavailable,
    prepare: (value) => {
      const parsed = flashcardFieldsSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    },
    invalidError:
      "Both Front and Back need text, up to 10,000 characters each. Your draft is still here.",
    save: async (next, previous) => {
      const base = {
        householdId,
        listId,
        cardId,
        optimisticTimestamp: Date.now(),
      };
      const mutation = previous
        ? mutators.lists.updateFlashcard({
            ...base,
            changes: flashcardChanges(next, previous),
          })
        : mutators.lists.createFlashcard({ ...base, ...next });
      const result = await acknowledgeMutation(zero.mutate(mutation));

      if (result.type === "error") {
        throw Error("Save failed");
      }
    },
  });
  useEffect(() => {
    // Optimistic creation is not proof of persistence: a rejected create must
    // remain retryable rather than looking like a remotely deleted card.
    if (current && editor.saved) {
      setObserved(true);
    }
  }, [current, editor.saved]);

  const readonly = !enabled || unavailable || blocked || deleting;
  useImperativeHandle(controls, () => ({
    flush: async () => !deletingRef.current && editor.flush(),
    discard: editor.discard,
    snapshot: () => ({
      ...editor.snapshot(),
      hasChanges: editor.snapshot().hasChanges || deletingRef.current,
      isSaving: editor.snapshot().isSaving || deletingRef.current,
    }),
  }));
  useLayoutEffect(() => {
    onActivity(editor.hasChanges || deleting, editor.isSaving || deleting);
  }, [onActivity, editor.hasChanges, editor.isSaving, deleting]);

  async function remove() {
    if (readonly || deletingRef.current) {
      return;
    }

    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(false);
    try {
      // A debounce can start after the confirmation opens. Finish that request
      // before deleting, rather than silently ignoring the confirmed action.
      if (editor.snapshot().isSaving) {
        await editor.flush();
      }
      if (!editor.snapshot().saved) {
        onRemoved();
        return;
      }
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.lists.deleteFlashcard({
            householdId,
            listId,
            cardId,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );

      if (result.type === "error") {
        throw Error("Delete failed");
      }
      onRemoved();
    } catch {
      setDeleteError(true);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <li
      ref={sortable.ref}
      data-flashcard={cardId}
      aria-label={`Flashcard ${index + 1}`}
      className="flex min-w-0 items-start gap-1 py-2"
    >
      <Button
        ref={sortable.handleRef}
        size="compact"
        variant="ghost"
        className="size-7! shrink-0 touch-none p-0!"
        aria-label={`Reorder card ${index + 1}`}
        disabled={orderDisabled || !editor.saved || unavailable}
      >
        <GripVertical aria-hidden="true" className="size-4 text-muted" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {(["front", "back"] as const).map((side) => (
            <Textarea
              key={side}
              ref={side === "front" ? front : undefined}
              appearance="seamless"
              aria-label={side === "front" ? "Front" : "Back"}
              placeholder={side === "front" ? "Front" : "Back"}
              rows={2}
              required
              maxLength={flashcardTextLimit}
              readOnly={readonly}
              value={editor.value[side]}
              className="field-sizing-content min-h-14! max-h-64 min-w-0 overflow-y-auto px-1! text-sm whitespace-pre-wrap"
              onChange={(event) =>
                editor.change({ [side]: event.target.value })
              }
              onBlur={() => {
                if (
                  !editor.error &&
                  flashcardFieldsSchema.safeParse(editor.snapshot().value)
                    .success
                ) {
                  void editor.flush();
                }
              }}
            />
          ))}
        </div>
        {unavailable && (
          <p role="alert" className="text-sm text-danger">
            This card is no longer available. Any unsaved draft remains here.
          </p>
        )}
        {editor.error && (
          <p role="alert" className="text-sm text-danger">
            {editor.error}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-danger">
            Unable to delete this card. Try again.
          </p>
        )}
        <TextDraftActions editor={editor} />
        <span role="status" className="sr-only">
          {editor.isSaving
            ? "Saving card"
            : editor.hasChanges
              ? "Unsaved card"
              : editor.saved
                ? "Saved card"
                : "New card"}
        </span>
      </div>
      <ConfirmationPopover
        message="Delete this card for everyone in the household?"
        onOpenChange={setConfirming}
        trigger={
          <Button
            size="compact"
            variant="ghost"
            className="size-7! shrink-0 p-0!"
            aria-label={editor.saved ? "Delete card" : "Discard new card"}
            disabled={readonly || editor.isSaving}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        }
        onConfirm={() => void remove()}
      />
    </li>
  );
}
