import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { RenameHouseholdForm } from "./rename-household-form";

type HouseholdSettingsProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

export function HouseholdSettings({
  accessToken,
  householdId,
  onSessionExpired,
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

  if (membership?.role !== "owner") {
    return <p>Only the household owner can change these settings.</p>;
  }

  return (
    <RenameHouseholdForm
      key={household.id}
      accessToken={accessToken}
      householdId={household.id}
      currentName={household.name}
      onSessionExpired={onSessionExpired}
    />
  );
}
