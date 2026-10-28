export const catalogPageSize = 40;

// Keep focused/dirty editors mounted if a live insertion or reorder moves them
// across a page boundary. Everything else stays bounded to one page.
export function catalogWindow<T extends { id: string }>(
  entries: readonly T[],
  requestedPage: number,
  pinned: ReadonlySet<string>,
) {
  const pages = Math.max(1, Math.ceil(entries.length / catalogPageSize));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const keep = entries.filter((e) => pinned.has(e.id));
  const candidates = entries
    .slice(page * catalogPageSize, (page + 1) * catalogPageSize)
    .filter((e) => !pinned.has(e.id));
  const visible = new Set(
    [
      ...keep,
      ...candidates.slice(0, Math.max(0, catalogPageSize - keep.length)),
    ].map((e) => e.id),
  );
  return { page, pages, entries: entries.filter((e) => visible.has(e.id)) };
}

export function moveCatalogEntry(
  ids: readonly string[],
  id: string,
  to: number,
) {
  const from = ids.indexOf(id);
  if (from < 0 || to < 0 || to >= ids.length || from === to) return undefined;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
