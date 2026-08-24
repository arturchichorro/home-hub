import { cleanShoppingItemName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { ErrorPopover, Input } from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const autosaveDelayMs = 600;
const duplicateNameError = "Shopping item name already exists";

type ShoppingItemNameInputProps = {
  focusRequest?: number | undefined;
  householdId: string;
  itemId: string;
  currentName: string;
  crossed?: boolean;
  muted?: boolean;
};

export function ShoppingItemNameInput({
  focusRequest,
  householdId,
  itemId,
  currentName,
  crossed = false,
  muted = false,
}: ShoppingItemNameInputProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const confirmedNameRef = useRef(currentName);
  const draftNameRef = useRef(currentName);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const queuedEmptyNameErrorRef = useRef(false);
  const saveDraftRef = useRef<(showEmptyNameError: boolean) => Promise<void>>(
    async () => undefined,
  );
  const [draftName, setDraftName] = useState(currentName);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (focusRequest !== undefined) inputRef.current?.focus();
  }, [focusRequest]);

  const clearScheduledSave = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const replaceDraft = useCallback((name: string) => {
    draftNameRef.current = name;
    if (mountedRef.current) setDraftName(name);
  }, []);

  const revertDraft = useCallback(() => {
    replaceDraft(confirmedNameRef.current);
  }, [replaceDraft]);

  const saveDraft = useCallback(
    async (showEmptyNameError: boolean) => {
      clearScheduledSave();

      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        queuedEmptyNameErrorRef.current ||= showEmptyNameError;
        return;
      }

      if (!mutationEnabled) {
        revertDraft();
        setError("The change could not be saved.");
        return;
      }

      const submittedName = cleanShoppingItemName(draftNameRef.current);

      if (submittedName.length === 0) {
        if (showEmptyNameError) {
          revertDraft();
          setError("The item name cannot be empty.");
        }
        return;
      }

      if (submittedName === confirmedNameRef.current) {
        replaceDraft(submittedName);
        return;
      }

      saveInFlightRef.current = true;
      setIsSaving(true);
      setError(undefined);

      const mutation = zero.mutate(
        mutators.shopping.rename({
          householdId,
          itemId,
          name: submittedName,
          optimisticUpdatedAt: Date.now(),
        }),
      );

      const clientResult = await mutation.client;
      const result =
        clientResult.type === "error" ? clientResult : await mutation.server;

      if (result.type === "success") {
        confirmedNameRef.current = submittedName;

        if (cleanShoppingItemName(draftNameRef.current) === submittedName) {
          replaceDraft(submittedName);
        }
      } else if (
        cleanShoppingItemName(draftNameRef.current) === submittedName
      ) {
        revertDraft();
        if (mountedRef.current) {
          setError(
            result.error.message === duplicateNameError
              ? "This item is already in the list."
              : "The change could not be saved.",
          );
        }
      }

      saveInFlightRef.current = false;
      if (mountedRef.current) setIsSaving(false);

      if (queuedSaveRef.current) {
        const showQueuedEmptyNameError = queuedEmptyNameErrorRef.current;
        queuedSaveRef.current = false;
        queuedEmptyNameErrorRef.current = false;
        timeoutRef.current = setTimeout(() => {
          void saveDraftRef.current(showQueuedEmptyNameError);
        }, 0);
      }
    },
    [
      clearScheduledSave,
      householdId,
      itemId,
      mutationEnabled,
      replaceDraft,
      revertDraft,
      zero,
    ],
  );

  saveDraftRef.current = saveDraft;

  useEffect(() => {
    if (saveInFlightRef.current) return;

    const previousConfirmedName = confirmedNameRef.current;
    confirmedNameRef.current = currentName;

    if (draftNameRef.current === previousConfirmedName) {
      replaceDraft(currentName);
    }
  }, [currentName, replaceDraft]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  function handleChange(nextName: string) {
    replaceDraft(nextName);
    setError(undefined);
    clearScheduledSave();
    timeoutRef.current = setTimeout(() => {
      void saveDraft(false);
    }, autosaveDelayMs);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveDraft(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearScheduledSave();
      revertDraft();
      setError(undefined);
      event.currentTarget.blur();
    }
  }

  const classes = [
    muted || crossed ? "text-muted" : "text-foreground",
    crossed ? "line-through" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Shopping item name"
        aria-busy={isSaving || undefined}
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? errorId : undefined}
        disabled={!mutationEnabled}
        maxLength={100}
        value={draftName}
        className={classes}
        onBlur={() => void saveDraft(true)}
        onValueChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <ErrorPopover
        anchor={inputRef}
        id={errorId}
        open={error !== undefined}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
    </>
  );
}
