export function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function cleanShoppingItemName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeShoppingItemName(value: string): string {
  return cleanShoppingItemName(value).toLowerCase();
}
