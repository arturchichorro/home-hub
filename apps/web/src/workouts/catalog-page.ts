export const catalogBatchSize = 50;

// Append-only disclosure, not virtualization: never evict an editing/draft row.
export function catalogPage<T extends { id: string }>(
  entries: readonly T[],
  count: number,
  pinnedId?: string,
  draftId?: string,
): T[] {
  return entries.filter(
    (entry, index) =>
      index < count || entry.id === pinnedId || entry.id === draftId,
  );
}

// Sparse ordering needs only the moved row and its immediate visible neighbors.
// Keep payloads bounded even after loading a catalog beyond the mutation cap.
export function reorderNeighborhood(
  ids: readonly string[],
  movedId: string,
): string[] {
  const index = ids.indexOf(movedId);

  return index < 0 ? [] : ids.slice(Math.max(0, index - 1), index + 2);
}
