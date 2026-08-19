import {
  cleanRecipeDescription,
  cleanRecipeTitle,
} from "@home-hub/shared/normalization";
import { mutators } from "@home-hub/shared/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const autosaveDelayMs = 600;

type RecipeDraft = {
  title: string;
  description: string;
};

type UseRecipeDetailsEditorOptions = {
  householdId: string;
  recipeId: string;
  currentTitle: string;
  currentDescription: string | null;
};

function cleanDraft(draft: RecipeDraft): RecipeDraft {
  return {
    title: cleanRecipeTitle(draft.title),
    description: cleanRecipeDescription(draft.description) ?? "",
  };
}

function draftsMatch(left: RecipeDraft, right: RecipeDraft) {
  return left.title === right.title && left.description === right.description;
}

export function useRecipeDetailsEditor({
  householdId,
  recipeId,
  currentTitle,
  currentDescription,
}: UseRecipeDetailsEditorOptions) {
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const initialDraft = {
    title: currentTitle,
    description: currentDescription ?? "",
  };
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const confirmedDraftRef = useRef(initialDraft);
  const draftRef = useRef(initialDraft);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const queuedValidationRef = useRef(false);
  const saveDraftRef = useRef<(validateTitle: boolean) => Promise<void>>(
    async () => undefined,
  );
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string>();
  const [errorField, setErrorField] = useState<keyof RecipeDraft>("title");
  const [isSaving, setIsSaving] = useState(false);
  const errorId = useId();

  const clearScheduledSave = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const replaceDraft = useCallback((nextDraft: RecipeDraft) => {
    draftRef.current = nextDraft;
    if (mountedRef.current) setDraft(nextDraft);
  }, []);

  const revertDraft = useCallback(() => {
    replaceDraft(confirmedDraftRef.current);
  }, [replaceDraft]);

  const saveDraft = useCallback(
    async (validateTitle: boolean) => {
      clearScheduledSave();

      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        queuedValidationRef.current ||= validateTitle;
        return;
      }

      if (!mutationEnabled) {
        revertDraft();
        setError("The changes could not be saved.");
        return;
      }

      const submittedDraft = cleanDraft(draftRef.current);

      if (submittedDraft.title.length === 0) {
        if (validateTitle) {
          revertDraft();
          setErrorField("title");
          setError("The recipe title cannot be empty.");
        }
        return;
      }

      if (draftsMatch(submittedDraft, confirmedDraftRef.current)) {
        replaceDraft(submittedDraft);
        return;
      }

      saveInFlightRef.current = true;
      setIsSaving(true);
      setError(undefined);

      const mutation = zero.mutate(
        mutators.recipes.update({
          householdId,
          recipeId,
          title: submittedDraft.title,
          description: submittedDraft.description,
          optimisticUpdatedAt: Date.now(),
        }),
      );
      const clientResult = await mutation.client;
      const result =
        clientResult.type === "error" ? clientResult : await mutation.server;

      if (result.type === "success") {
        confirmedDraftRef.current = submittedDraft;
        if (draftsMatch(cleanDraft(draftRef.current), submittedDraft)) {
          replaceDraft(submittedDraft);
        }
      } else if (draftsMatch(cleanDraft(draftRef.current), submittedDraft)) {
        revertDraft();
        if (mountedRef.current) setError("The changes could not be saved.");
      }

      saveInFlightRef.current = false;
      if (mountedRef.current) setIsSaving(false);

      if (queuedSaveRef.current) {
        const validateQueuedTitle = queuedValidationRef.current;
        queuedSaveRef.current = false;
        queuedValidationRef.current = false;
        timeoutRef.current = setTimeout(() => {
          void saveDraftRef.current(validateQueuedTitle);
        }, 0);
      }
    },
    [
      clearScheduledSave,
      householdId,
      mutationEnabled,
      recipeId,
      replaceDraft,
      revertDraft,
      zero,
    ],
  );

  saveDraftRef.current = saveDraft;

  useEffect(() => {
    if (saveInFlightRef.current) return;

    const previousConfirmedDraft = confirmedDraftRef.current;
    const nextConfirmedDraft = {
      title: currentTitle,
      description: currentDescription ?? "",
    };
    confirmedDraftRef.current = nextConfirmedDraft;

    if (draftsMatch(draftRef.current, previousConfirmedDraft)) {
      replaceDraft(nextConfirmedDraft);
    }
  }, [currentDescription, currentTitle, replaceDraft]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  function changeDraft(field: keyof RecipeDraft, value: string) {
    replaceDraft({ ...draftRef.current, [field]: value });
    setErrorField(field);
    setError(undefined);
    clearScheduledSave();
    timeoutRef.current = setTimeout(() => {
      void saveDraft(false);
    }, autosaveDelayMs);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveDraft(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearScheduledSave();
      revertDraft();
      setError(undefined);
      event.currentTarget.blur();
    }
  }

  function handleDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      clearScheduledSave();
      revertDraft();
      setError(undefined);
      event.currentTarget.blur();
    }
  }

  return {
    titleProps: {
      ref: titleRef,
      "aria-busy": isSaving || undefined,
      "aria-invalid": error && errorField === "title" ? true : undefined,
      "aria-errormessage":
        error && errorField === "title" ? errorId : undefined,
      disabled: !mutationEnabled,
      value: draft.title,
      onBlur: () => void saveDraft(true),
      onKeyDown: handleTitleKeyDown,
      onValueChange: (value: string) => changeDraft("title", value),
    },
    descriptionProps: {
      ref: descriptionRef,
      "aria-busy": isSaving || undefined,
      "aria-invalid": error && errorField === "description" ? true : undefined,
      "aria-errormessage":
        error && errorField === "description" ? errorId : undefined,
      disabled: !mutationEnabled,
      value: draft.description,
      onBlur: () => void saveDraft(true),
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
        changeDraft("description", event.target.value),
      onKeyDown: handleDescriptionKeyDown,
    },
    error,
    errorPopoverProps: {
      anchor: errorField === "title" ? titleRef : descriptionRef,
      id: errorId,
      open: error !== undefined,
      onDismiss: () => setError(undefined),
    },
  };
}
