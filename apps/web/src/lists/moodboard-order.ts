// Keep current query rows authoritative: a preview never revives deleted pins,
// drops new uploads, or retains stale asset metadata.
export function applyMoodboardOrder<T extends { id: string }>(
  pins: readonly T[],
  order: readonly string[] | undefined,
): readonly T[] {
  if (!order) {
    return pins;
  }

  const remaining = new Map(pins.map((pin) => [pin.id, pin]));
  const result: T[] = [];

  for (const id of order) {
    const pin = remaining.get(id);

    if (pin) {
      result.push(pin);
      remaining.delete(id);
    }
  }

  return [...result, ...remaining.values()];
}

export function moveMoodboardPin(
  order: readonly string[],
  sourceId: string,
  targetId: string,
): readonly string[] {
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);

  if (from < 0 || to < 0 || from === to) {
    return order;
  }

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);

  return next;
}
