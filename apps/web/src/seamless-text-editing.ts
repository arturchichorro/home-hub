type DraftsMatch<T> = (left: T, right: T) => boolean;

export function draftMatchesSaveSnapshot<T>(
  currentDraft: T,
  submittedDraft: T,
  draftsMatch: DraftsMatch<T> = Object.is,
): boolean {
  return draftsMatch(currentDraft, submittedDraft);
}

export function shouldCanonicalizeVisibleDraft<T>(
  canonicalizeVisibleDraft: boolean,
  currentDraft: T,
  submittedDraft: T,
  draftsMatch?: DraftsMatch<T>,
): boolean {
  return (
    canonicalizeVisibleDraft &&
    draftMatchesSaveSnapshot(currentDraft, submittedDraft, draftsMatch)
  );
}

export function canDebounceCreateTextDraft(
  rawValue: string,
  normalizedValue: string,
): boolean {
  return normalizedValue.length > 0 && !/\s$/u.test(rawValue);
}
