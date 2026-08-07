export function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanSingleLineText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function cleanShoppingItemName(value: string): string {
  return cleanSingleLineText(value);
}

export function normalizeShoppingItemName(value: string): string {
  return cleanShoppingItemName(value).toLowerCase();
}

export function cleanRecipeTitle(value: string): string {
  return cleanSingleLineText(value);
}

export function cleanRecipeDescription(value: string): string | null {
  const cleaned = value.normalize("NFKC").trim();
  return cleaned.length === 0 ? null : cleaned;
}
