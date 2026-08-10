export type RecipesSearch = {
  recipeId?: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRecipesSearch(
  search: Record<string, unknown>,
): RecipesSearch {
  const recipeId = search.recipeId;
  return typeof recipeId === "string" && uuidPattern.test(recipeId)
    ? { recipeId }
    : {};
}
