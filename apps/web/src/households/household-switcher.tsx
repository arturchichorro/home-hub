import { queries } from "@home-hub/shared/zero/queries";
import {
  InlineAlert,
  MenuChevron,
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

function HouseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </svg>
  );
}

export function HouseholdSwitcher({
  accessToken,
  onSessionExpired,
  selectedHouseholdId,
  onSelect,
}: HouseholdSwitcherProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [households, result] = useQuery(queries.households.mine({}));

  if (result.type === "unknown" && households.length === 0) {
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
          className="size-10! min-w-0 p-0! sm:h-10! sm:w-auto! sm:max-w-full sm:justify-between! sm:px-4!"
        >
          <span className="sm:hidden">
            <HouseIcon />
          </span>
          <span className="hidden truncate sm:inline">
            {selectedHousehold?.name ?? "Choose household"}
          </span>
          <MenuChevron className="hidden sm:block" />
        </MenuTrigger>
        <MenuPopup className="w-max min-w-(--anchor-width)! max-w-[calc(100vw-2rem)]">
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
