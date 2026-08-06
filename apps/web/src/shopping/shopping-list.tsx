import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";

type ShoppingListProps = {
  householdId: string;
};

export function ShoppingList({ householdId }: ShoppingListProps) {
  const zero = useZero();

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
      {items.map((item) => {
        const nextStatus = item.status === "active" ? "crossed" : "active";

        return (
          <li key={item.id}>
            {item.name} — {item.status}{" "}
            <button
              type="button"
              onClick={() => {
                zero.mutate(
                  mutators.shopping.setStatus({
                    householdId,
                    itemId: item.id,
                    status: nextStatus,
                    optimisticUpdatedAt: Date.now(),
                  }),
                );
              }}
            >
              {nextStatus === "crossed" ? "Cross" : "Reactivate"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
