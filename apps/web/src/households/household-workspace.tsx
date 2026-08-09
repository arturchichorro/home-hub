import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { RecipeList } from "../recipes/recipe-list";
import { ShoppingList } from "../shopping/shopping-list";
import { HouseholdSettings } from "./household-settings";

type HouseholdWorkspaceProps = {
  accessToken: string;
  householdId: string;
  onLeftHousehold: () => void;
  onSessionExpired: () => void;
};

export function HouseholdWorkspace({
  accessToken,
  householdId,
  onLeftHousehold,
  onSessionExpired,
}: HouseholdWorkspaceProps) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  const management = (
    <section>
      <h2>Household management</h2>
      <HouseholdSettings
        accessToken={accessToken}
        householdId={householdId}
        onLeftHousehold={onLeftHousehold}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );

  if (result.type === "unknown") {
    return (
      <>
        {management}
        <p>Loading household modules…</p>
      </>
    );
  }

  if (result.type === "error") {
    return (
      <>
        {management}
        <p role="alert">Unable to load household modules.</p>
      </>
    );
  }

  const enabledModuleKeys = new Set(
    settings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.moduleKey),
  );

  return (
    <>
      {management}
      {enabledModuleKeys.has("shopping") ? (
        <section>
          <h2>Shopping List</h2>
          <ShoppingList householdId={householdId} />
        </section>
      ) : null}
      {enabledModuleKeys.has("recipes") ? (
        <section>
          <h2>Recipes</h2>
          <RecipeList
            accessToken={accessToken}
            householdId={householdId}
            onSessionExpired={onSessionExpired}
          />
        </section>
      ) : null}
    </>
  );
}
