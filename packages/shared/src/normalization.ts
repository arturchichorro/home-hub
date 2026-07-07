export function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeItemName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
