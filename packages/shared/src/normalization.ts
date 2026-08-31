export function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanSingleLineText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function cleanNullableSingleLineText(value: string): string | null {
  const cleaned = cleanSingleLineText(value);
  return cleaned.length === 0 ? null : cleaned;
}

function cleanNullableMultilineText(value: string): string | null {
  const cleaned = value.normalize("NFKC").trim();
  return cleaned.length === 0 ? null : cleaned;
}

export function cleanShoppingItemName(value: string): string {
  return cleanSingleLineText(value);
}

export function cleanListName(value: string): string {
  return cleanSingleLineText(value);
}

export function normalizeListName(value: string): string {
  return cleanListName(value).toLowerCase();
}

export function cleanListItemName(value: string): string {
  return cleanSingleLineText(value);
}

export function normalizeListItemName(value: string): string {
  return cleanListItemName(value).toLowerCase();
}

export function normalizeShoppingItemName(value: string): string {
  return cleanShoppingItemName(value).toLowerCase();
}

export function cleanRecipeTitle(value: string): string {
  return cleanSingleLineText(value);
}

export function cleanRecipeDescription(value: string): string | null {
  return cleanNullableMultilineText(value);
}

export function cleanRecipeIngredientName(value: string): string {
  return cleanSingleLineText(value);
}

export function cleanRecipeIngredientAmount(value: string): string | null {
  return cleanNullableSingleLineText(value);
}

export function cleanRecipeIngredientNote(value: string): string | null {
  return cleanNullableMultilineText(value);
}

export function cleanRecipeCookLogComment(value: string): string | null {
  return cleanNullableMultilineText(value);
}
