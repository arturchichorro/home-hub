import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect } from "react";

type HouseholdSwitcherProps = {
  selectedHouseholdId?: string | undefined;
  onSelect: (householdId: string | undefined) => void;
};

export function HouseholdSwitcher({
  selectedHouseholdId,
  onSelect,
}: HouseholdSwitcherProps) {
  const [households, result] = useQuery(queries.households.mine({}));
  const queryComplete = result.type !== "unknown" && result.type !== "error";

  useEffect(() => {
    if (!queryComplete || !selectedHouseholdId) {
      return;
    }

    const selectionStillAvailable = households.some(
      (household) => household.id === selectedHouseholdId,
    );

    if (!selectionStillAvailable) {
      onSelect(undefined);
    }
  }, [households, onSelect, queryComplete, selectedHouseholdId]);

  if (result.type === "unknown") {
    return <p>Loading households…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load households.</p>;
  }

  if (households.length === 0) {
    return <p>You do not belong to a household yet.</p>;
  }

  return (
    <div>
      <label htmlFor="household-switcher">Household</label>
      <select
        id="household-switcher"
        name="householdId"
        value={selectedHouseholdId ?? ""}
        onChange={(event) => onSelect(event.target.value || undefined)}
      >
        <option value="">Choose a household</option>
        {households.map((household) => {
          const membership = household.members[0];

          return (
            <option key={household.id} value={household.id}>
              {household.name}
              {membership ? ` (${membership.role})` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
