import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { HouseholdMemberList } from "./household-member-list";
import { LeaveHouseholdControl } from "./leave-household-control";
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

  if (result.type === "unknown") {
    return <p>Loading household settings…</p>;
  }

  if (result.type === "error") {
    return <p role="alert">Unable to load household settings.</p>;
  }

  const household = households.find(
    (candidate) => candidate.id === householdId,
  );

  if (!household) {
    return null;
  }

  const membership = household.members[0];
  const isOwner = membership?.role === "owner";

  return (
    <>
      <h3>Members</h3>
      <HouseholdMemberList
        accessToken={accessToken}
        householdId={household.id}
        onSessionExpired={onSessionExpired}
        canRemoveMembers={isOwner}
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
