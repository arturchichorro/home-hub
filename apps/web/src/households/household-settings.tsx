import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { HouseholdMemberList } from "./household-member-list";
import { LeaveHouseholdControl } from "./leave-household-control";
import { ModuleSettings } from "./module-settings";
import { PendingInviteList } from "./pending-invite-list";
import { RenameHouseholdForm } from "./rename-household-form";

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

  if (result.type === "unknown") {
    return <p>Loading household settings…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load household settings.</p>;
  }

  if (!household) {
    return null;
  }

  const isOwner =
    membership?.role === "owner" &&
    locallyTransferredHouseholdId !== household.id;

  return (
    <>
      <h3>Members</h3>
      <HouseholdMemberList
        accessToken={accessToken}
        householdId={household.id}
        onSessionExpired={onSessionExpired}
        canManageMembers={isOwner}
        onOwnershipTransferred={() =>
          setLocallyTransferredHouseholdId(household.id)
        }
      />

      <h3>Membership</h3>
      <LeaveHouseholdControl
        accessToken={accessToken}
        householdId={household.id}
        isOwner={isOwner}
        onLeftHousehold={onLeftHousehold}
        onSessionExpired={onSessionExpired}
      />

      {isOwner ? (
        <>
          <h3>Owner settings</h3>
          <RenameHouseholdForm
            key={household.id}
            accessToken={accessToken}
            householdId={household.id}
            currentName={household.name}
            onSessionExpired={onSessionExpired}
          />

          <h3>Modules</h3>
          <ModuleSettings
            accessToken={accessToken}
            householdId={household.id}
            onSessionExpired={onSessionExpired}
          />

          <h3>Pending invitations</h3>
          <PendingInviteList
            accessToken={accessToken}
            householdId={household.id}
            onSessionExpired={onSessionExpired}
          />
        </>
      ) : null}
    </>
  );
}
