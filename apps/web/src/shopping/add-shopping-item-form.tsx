import { cleanShoppingItemName } from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import {
  Button,
  ErrorPopover,
  InlineAlert,
  Input,
  Plus,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const autosaveDelayMs = 600;

type ShoppingItemDraftNameFormProps = {
  focusRequest: number;
  householdId: string;
  itemId: string;
  onCancel: () => void;
  onSaved: (name: string) => void;
  onServerError: (message: string) => void;
};

export function ShoppingItemDraftNameForm({
  focusRequest,
  householdId,
  itemId,
  onCancel,
  onSaved,
  onServerError,
}: ShoppingItemDraftNameFormProps) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savingRef = useRef(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const errorId = `${itemId}-error`;

  useEffect(() => {
    if (focusRequest >= 0) inputRef.current?.focus();
  }, [focusRequest]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function clearScheduledSave() {
    if (timeoutRef.current === undefined) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }

  async function saveDraft(rawName: string, dismissEmpty: boolean) {
    clearScheduledSave();
    if (savingRef.current) return;

    const submittedName = cleanShoppingItemName(rawName);
    if (submittedName.length === 0) {
      if (dismissEmpty) onCancel();
      return;
    }
    if (!mutationEnabled) {
      setError("Unable to add the shopping item.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    const mutation = zero.mutate(
      mutators.shopping.add({
        itemId,
        householdId,
        name: submittedName,
        optimisticTimestamp: Date.now(),
      }),
    );
    const clientResult = await mutation.client;

    if (clientResult.type === "error") {
      savingRef.current = false;
      setSaving(false);
      setError("Unable to add the shopping item.");
      return;
    }

    onSaved(submittedName);
    const serverResult = await mutation.server;
    if (serverResult.type === "error") {
      onServerError("The shopping item could not be saved.");
    }
  }

  function changeName(value: string) {
    setName(value);
    setError(undefined);
    clearScheduledSave();
    if (cleanShoppingItemName(value).length === 0) return;
    timeoutRef.current = setTimeout(() => {
      void saveDraft(value, false);
    }, autosaveDelayMs);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveDraft(name, true);
  }

  return (
    <form className="min-w-0 flex-1" onSubmit={handleSubmit}>
      <Input
        ref={inputRef}
        appearance="seamless"
        aria-label="Shopping item name"
        aria-busy={saving || undefined}
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? errorId : undefined}
        autoComplete="off"
        disabled={!mutationEnabled}
        maxLength={100}
        placeholder="Item name"
        value={name}
        onBlur={() => void saveDraft(name, true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          clearScheduledSave();
          onCancel();
        }}
        onValueChange={changeName}
      />
      <ErrorPopover
        anchor={inputRef}
        id={errorId}
        open={error !== undefined}
        onDismiss={() => setError(undefined)}
      >
        {error}
      </ErrorPopover>
    </form>
  );
}

type AddShoppingItemTriggerRowProps = {
  draftActive: boolean;
  error?: string | undefined;
  onActivate: () => void;
};

export function AddShoppingItemTriggerRow({
  draftActive,
  error,
  onActivate,
}: AddShoppingItemTriggerRowProps) {
  const mutationEnabled = useZeroMutationEnabled();

  return (
    <li>
      <div className="py-2.5">
        <Button
          type="button"
          variant="ghost"
          disabled={!mutationEnabled}
          className="h-7! px-1.5! font-normal text-muted"
          onClick={onActivate}
          onPointerDown={(event) => {
            if (draftActive) event.preventDefault();
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add item
        </Button>
      </div>
      {error ? (
        <InlineAlert className="m-2 mt-0" role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
    </li>
  );
}
