import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

type ShoppingListProps = {
  householdId: string;
};

export function ShoppingList({ householdId }: ShoppingListProps) {
  const [items, result] = useQuery(
    queries.shopping.byHousehold({ householdId }),
  );

  if (result.type === "unknown") {
    return <p>Loading shopping list…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load the shopping list.</p>;
  }

  if (items.length === 0) {
    return <p>The shopping list is empty.</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.name} — {item.status}
        </li>
      ))}
    </ul>
  );
}
