type CurrentShoppingItem = {
  id: string;
  sortKey: number;
  status: "active" | "crossed" | "archived" | null;
};

function bySortKey<T extends CurrentShoppingItem>(left: T, right: T): number {
  return right.sortKey - left.sortKey || left.id.localeCompare(right.id);
}

export function orderCurrentShoppingItems<T extends CurrentShoppingItem>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((item) => item.status === "active").sort(bySortKey),
    ...items.filter((item) => item.status === "crossed").sort(bySortKey),
  ];
}
