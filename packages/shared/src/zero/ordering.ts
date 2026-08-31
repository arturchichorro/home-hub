const gap = 1024;
const maxSortKey = 2_147_483_647;
const minSortKey = -2_147_483_648;

type OrderedRow = { id: string; sortKey: number };

export function nextSortKey(topSortKey = 0): number {
  const next = topSortKey + gap;
  if (next > maxSortKey) throw new Error("Ordering requires rebalancing");
  return next;
}

export function planReorder(
  rows: readonly OrderedRow[],
  orderedIds: readonly string[],
  movedId: string,
): OrderedRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!orderedIds.includes(movedId) || orderedIds.some((id) => !byId.has(id))) {
    throw new Error("Reorder not allowed");
  }
  const index = orderedIds.indexOf(movedId);
  const previousId = orderedIds[index - 1];
  const nextId = orderedIds[index + 1];
  const previous = previousId ? byId.get(previousId) : undefined;
  const next = nextId ? byId.get(nextId) : undefined;
  const sortKey =
    previous && next
      ? Math.floor((previous.sortKey + next.sortKey) / 2)
      : previous
        ? previous.sortKey - gap
        : next
          ? next.sortKey + gap
          : 0;
  if (
    sortKey >= minSortKey &&
    sortKey <= maxSortKey &&
    (!previous || sortKey < previous.sortKey) &&
    (!next || sortKey > next.sortKey)
  ) {
    return [{ id: movedId, sortKey }];
  }
  // A stale client may omit rows added since its last sync. Rebalance the full
  // current scope, moving only the requested row and retaining all other rows.
  const remaining = [...rows]
    .filter((row) => row.id !== movedId)
    .sort((a, b) => b.sortKey - a.sortKey || a.id.localeCompare(b.id));
  const position = next
    ? remaining.findIndex((row) => row.id === next.id)
    : previous
      ? remaining.findIndex((row) => row.id === previous.id) + 1
      : 0;
  const moved = byId.get(movedId);
  if (!moved) throw new Error("Reorder not allowed");
  remaining.splice(position, 0, moved);
  if (remaining.length * gap > maxSortKey)
    throw new Error("Too many rows to reorder");
  return remaining.map((row, i) => ({
    id: row.id,
    sortKey: (remaining.length - i) * gap,
  }));
}
