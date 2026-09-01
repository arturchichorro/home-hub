import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { HouseholdMemberList } from "./household-member-list";
import { HouseholdNameInput } from "./household-name-input";
import { LeaveHouseholdControl } from "./leave-household-control";
import { ModuleSettings } from "./module-settings";
import { PendingInviteList } from "./pending-invite-list";

type HouseholdSettingsProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
  onLeftHousehold: () => void;
};

export function HouseholdSettings({
  accessToken,
  householdId,
  onSessionExpired,
  onLeftHousehold,
}: HouseholdSettingsProps) {
  const [households, result] = useQuery(queries.households.mine({}));
  const [locallyTransferredHouseholdId, setLocallyTransferredHouseholdId] =
    useState<string>();
  const household = households.find(
    (candidate) => candidate.id === householdId,
  );
  const membership = household?.members[0];

  useEffect(() => {
    if (membership?.role !== "owner") {
      setLocallyTransferredHouseholdId(undefined);
    }
  }, [membership?.role]);

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load household settings.
      </InlineAlert>
    );
  }

  if (!household) {
    return null;
  }

  const isOwner =
    membership?.role === "owner" &&
    locallyTransferredHouseholdId !== household.id;

  return (
    <div className="grid gap-8" aria-busy={result.type !== "complete"}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        {isOwner ? (
          <HouseholdNameInput
            accessToken={accessToken}
            currentName={household.name}
            householdId={household.id}
            onSessionExpired={onSessionExpired}
          />
        ) : (
          <h2 className="flex h-10 min-w-0 flex-1 items-center truncate px-1 text-2xl font-semibold text-primary">
            {household.name}
          </h2>
        )}
        <LeaveHouseholdControl
          accessToken={accessToken}
          householdId={household.id}
          isOwner={isOwner}
          onLeftHousehold={onLeftHousehold}
          onSessionExpired={onSessionExpired}
        />
      </div>

      <section className="grid gap-4">
        <h3 className="text-lg font-semibold">Members</h3>
        <div className="grid">
          <HouseholdMemberList
            key={household.id}
            accessToken={accessToken}
            householdId={household.id}
            onSessionExpired={onSessionExpired}
            canManageMembers={isOwner}
            onOwnershipTransferred={() =>
              setLocallyTransferredHouseholdId(household.id)
            }
          />
          {isOwner ? (
            <PendingInviteList
              accessToken={accessToken}
              householdId={household.id}
              onSessionExpired={onSessionExpired}
            />
          ) : null}
        </div>
      </section>

      {isOwner ? (
        <section className="grid gap-4 border-t border-border pt-6">
          <h3 className="text-lg font-semibold">Modules</h3>
          <ModuleSettings
            accessToken={accessToken}
            householdId={household.id}
            onSessionExpired={onSessionExpired}
          />
        </section>
      ) : null}
    </div>
  );
}
