import { queries } from "@home-hub/shared/zero/queries";
import {
  InlineAlert,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
  StatusIndicator,
} from "@home-hub/ui-web";
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
    return <StatusIndicator label="Loading households…" />;
  }

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load households.
      </InlineAlert>
    );
  }

  if (households.length === 0) {
    return <InlineAlert>You do not belong to a household yet.</InlineAlert>;
  }

  const selectedHousehold = households.find(
    (household) => household.id === selectedHouseholdId,
  );

  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={
          selectedHousehold
            ? `Switch household. Current household: ${selectedHousehold.name}`
            : "Choose household"
        }
        className="min-w-52 justify-between!"
      >
        {selectedHousehold?.name ?? "Choose household"}
        <span aria-hidden="true">⌄</span>
      </MenuTrigger>
      <MenuPopup className="w-(--anchor-width)">
        <MenuRadioGroup
          value={selectedHouseholdId ?? ""}
          onValueChange={onSelect}
        >
          {households.map((household) => {
            const membership = household.members[0];

            return (
              <MenuRadioItem key={household.id} value={household.id}>
                <span className="flex min-w-0 items-center justify-between gap-4">
                  <span className="truncate">{household.name}</span>
                  {membership ? (
                    <span className="shrink-0 text-xs text-muted">
                      {membership.role === "owner" ? "Owner" : "Member"}
                    </span>
                  ) : null}
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}
