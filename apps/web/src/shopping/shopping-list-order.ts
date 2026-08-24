type CurrentShoppingItem = {
  createdAt?: number | null | undefined;
  id: string;
  status: "active" | "crossed" | "archived" | null;
};

function newestFirst<T extends CurrentShoppingItem>(left: T, right: T): number {
  const createdAtDifference =
    (right.createdAt ?? Number.NEGATIVE_INFINITY) -
    (left.createdAt ?? Number.NEGATIVE_INFINITY);

  return createdAtDifference || left.id.localeCompare(right.id);
}

export function orderCurrentShoppingItems<T extends CurrentShoppingItem>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((item) => item.status === "active").sort(newestFirst),
    ...items.filter((item) => item.status === "crossed").sort(newestFirst),
  ];
}
