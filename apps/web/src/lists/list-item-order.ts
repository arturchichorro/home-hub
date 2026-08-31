type CurrentListItem = {
  id: string;
  sortKey: number;
  status: "active" | "crossed" | "archived" | null;
};

function bySortKey<T extends CurrentListItem>(left: T, right: T): number {
  return right.sortKey - left.sortKey || left.id.localeCompare(right.id);
}

export function orderCurrentListItems<T extends CurrentListItem>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((item) => item.status === "active").sort(bySortKey),
    ...items.filter((item) => item.status === "crossed").sort(bySortKey),
  ];
}
