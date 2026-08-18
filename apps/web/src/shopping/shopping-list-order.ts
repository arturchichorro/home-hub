type CurrentShoppingItem = {
  status: "active" | "crossed" | "archived" | null;
};

export function orderCurrentShoppingItems<T extends CurrentShoppingItem>(
  items: readonly T[],
): T[] {
  return [
    ...items.filter((item) => item.status === "active"),
    ...items.filter((item) => item.status === "crossed"),
  ];
}
