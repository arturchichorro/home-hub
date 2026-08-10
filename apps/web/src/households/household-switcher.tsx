import { queries } from "@home-hub/shared/zero/queries";
import {
  InlineAlert,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  StatusIndicator,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { CreateHouseholdDialog } from "./create-household-dialog";
import { JoinHouseholdDialog } from "./join-household-dialog";

type HouseholdSwitcherProps = {
  accessToken: string;
  onSessionExpired: () => void;
  selectedHouseholdId?: string | undefined;
  onSelect: (householdId: string | undefined) => void;
};

export function HouseholdSwitcher({
  accessToken,
  onSessionExpired,
  selectedHouseholdId,
  onSelect,
}: HouseholdSwitcherProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [households, result] = useQuery(queries.households.mine({}));

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

  const selectedHousehold = households.find(
    (household) => household.id === selectedHouseholdId,
  );

  return (
    <>
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
          {households.length > 0 ? (
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
          ) : (
            <p className="px-3 py-2 text-sm text-muted">No households yet</p>
          )}
          <MenuSeparator />
          <MenuItem onClick={() => setJoinDialogOpen(true)}>
            Join household…
          </MenuItem>
          <MenuItem onClick={() => setCreateDialogOpen(true)}>
            Create household…
          </MenuItem>
        </MenuPopup>
      </MenuRoot>

      <CreateHouseholdDialog
        accessToken={accessToken}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={onSelect}
        onSessionExpired={onSessionExpired}
      />
      <JoinHouseholdDialog
        accessToken={accessToken}
        open={joinDialogOpen}
        onOpenChange={setJoinDialogOpen}
        onJoined={onSelect}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}
