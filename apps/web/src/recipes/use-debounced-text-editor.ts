import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const autosaveDelayMs = 600;

type UseDebouncedTextEditorOptions = {
  currentValue: string;
  emptyError?: string;
  failureError: string;
  mutationEnabled: boolean;
  normalize: (value: string) => string;
  required?: boolean;
  save: (value: string) => Promise<boolean>;
};

export function useDebouncedTextEditor({
  currentValue,
  emptyError,
  failureError,
  mutationEnabled,
  normalize,
  required = false,
  save,
}: UseDebouncedTextEditorOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const confirmedValueRef = useRef(currentValue);
  const draftValueRef = useRef(currentValue);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const queuedValidationRef = useRef(false);
  const normalizeRef = useRef(normalize);
  const saveMutationRef = useRef(save);
  const saveDraftRef = useRef<(validateRequired: boolean) => Promise<void>>(
    async () => undefined,
  );
  const [draftValue, setDraftValue] = useState(currentValue);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const errorId = useId();

  normalizeRef.current = normalize;
  saveMutationRef.current = save;

  const clearScheduledSave = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const replaceDraft = useCallback((value: string) => {
    draftValueRef.current = value;
    if (mountedRef.current) setDraftValue(value);
  }, []);

  const revertDraft = useCallback(() => {
    replaceDraft(confirmedValueRef.current);
  }, [replaceDraft]);

  const saveDraft = useCallback(
    async (validateRequired: boolean) => {
      clearScheduledSave();

      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        queuedValidationRef.current ||= validateRequired;
        return;
      }

      if (!mutationEnabled) {
        revertDraft();
        setError(failureError);
        return;
      }

      const submittedValue = normalizeRef.current(draftValueRef.current);
      if (required && submittedValue.length === 0) {
        if (validateRequired) {
          revertDraft();
          setError(emptyError ?? failureError);
        }
        return;
      }

      if (submittedValue === confirmedValueRef.current) {
        replaceDraft(submittedValue);
        return;
      }

      saveInFlightRef.current = true;
      setIsSaving(true);
      setError(undefined);
      const success = await saveMutationRef.current(submittedValue);

      if (success) {
        confirmedValueRef.current = submittedValue;
        if (normalizeRef.current(draftValueRef.current) === submittedValue) {
          replaceDraft(submittedValue);
        }
      } else if (
        normalizeRef.current(draftValueRef.current) === submittedValue
      ) {
        revertDraft();
        if (mountedRef.current) setError(failureError);
      }

      saveInFlightRef.current = false;
      if (mountedRef.current) setIsSaving(false);

      if (queuedSaveRef.current) {
        const validateQueued = queuedValidationRef.current;
        queuedSaveRef.current = false;
        queuedValidationRef.current = false;
        timeoutRef.current = setTimeout(() => {
          void saveDraftRef.current(validateQueued);
        }, 0);
      }
    },
    [
      clearScheduledSave,
      emptyError,
      failureError,
      mutationEnabled,
      replaceDraft,
      required,
      revertDraft,
    ],
  );

  saveDraftRef.current = saveDraft;

  useEffect(() => {
    if (saveInFlightRef.current) return;
    const nextValue = normalizeRef.current(currentValue);
    const previousConfirmedValue = confirmedValueRef.current;
    confirmedValueRef.current = nextValue;
    if (draftValueRef.current === previousConfirmedValue) {
      replaceDraft(nextValue);
    }
  }, [currentValue, replaceDraft]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  function changeValue(value: string) {
    replaceDraft(value);
    setError(undefined);
    clearScheduledSave();
    timeoutRef.current = setTimeout(() => {
      void saveDraft(false);
    }, autosaveDelayMs);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    saveOnEnter: boolean,
  ) {
    if (saveOnEnter && event.key === "Enter") {
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

  return {
    changeValue,
    error,
    errorId,
    handleBlur: () => void saveDraft(true),
    handleKeyDown,
    isSaving,
    dismissError: () => setError(undefined),
    value: draftValue,
  };
}
