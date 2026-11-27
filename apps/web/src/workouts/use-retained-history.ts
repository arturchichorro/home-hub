import { useState } from "react";

// Keep only the displayed page and its unsaved note baselines. In particular,
// never pin an optimistic note echo as if it were the confirmed saved value.
export class RetainedHistory<T extends { id: string }> {
  private previous: readonly T[] = [];
  private pins = new Map<string, T>();

  update(rows: readonly T[], dirty: ReadonlySet<string>): T[] {
    for (const id of this.pins.keys()) {
      if (!dirty.has(id)) {
        this.pins.delete(id);
      }
    }
    for (const row of [...this.previous, ...rows]) {
      if (dirty.has(row.id) && !this.pins.has(row.id)) {
        this.pins.set(row.id, { ...row });
      }
    }
    this.previous = rows.map((row) => ({ ...row }));
    const visible = new Set(rows.map((row) => row.id));

    return [
      ...rows,
      ...[...this.pins.values()].filter((row) => !visible.has(row.id)),
    ];
  }
}

export function useRetainedHistory<T extends { id: string }>(
  rows: readonly T[],
  dirty: ReadonlySet<string>,
) {
  const [history] = useState(() => new RetainedHistory<T>());

  return history.update(rows, dirty);
}
