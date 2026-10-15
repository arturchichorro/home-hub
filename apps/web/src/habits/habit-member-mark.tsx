import { X } from "@home-hub/ui-web";

const palette = [
  "blue",
  "sage",
  "lavender",
  "rose",
  "amber",
  "teal",
  "apricot",
  "mauve",
] as const;
function memberHash(userId: string): number {
  let hash = 2166136261;
  for (const character of userId)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
export function habitMemberColor(userId: string): string {
  return `var(--color-member-${palette[memberHash(userId) % palette.length]})`;
}

// Resolve palette collisions consistently for the full roster, not just people
// with completions. The same person keeps their color across habits and periods.
export function habitMemberColors(
  userIds: readonly string[],
): Map<string, string> {
  const colors = new Map<string, string>();
  const available = new Set<string>(
    palette.map((color) => `var(--color-member-${color})`),
  );
  for (const userId of [...new Set(userIds)].sort()) {
    const preferred = habitMemberColor(userId);
    const color = available.has(preferred)
      ? preferred
      : available.values().next().value;
    const fallbackHue = (colors.size * 137.508) % 360;
    colors.set(
      userId,
      color ??
        `oklch(var(--member-marker-lightness) var(--member-marker-chroma) ${fallbackHue})`,
    );
    if (color) available.delete(color);
  }
  return colors;
}

export function HabitMemberMark({ color }: { color: string | undefined }) {
  return (
    <X
      aria-hidden="true"
      className="size-4 shrink-0"
      strokeWidth={2}
      absoluteStrokeWidth
      style={{ color }}
    />
  );
}
