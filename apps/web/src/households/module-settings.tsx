import { householdModuleCatalog } from "@home-hub/shared/modules";
import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { setHouseholdModuleEnabled } from "./api";

type ModuleSettingsProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

export function ModuleSettings({
  accessToken,
  householdId,
  onSessionExpired,
}: ModuleSettingsProps) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  const [pendingKey, setPendingKey] = useState<string>();
  const [error, setError] = useState<string>();

  if (result.type === "unknown") return <p>Loading module settings…</p>;
  if (result.type === "error")
    return <p role="alert">Unable to load module settings.</p>;

  async function toggle(moduleKey: "shopping" | "recipes", enabled: boolean) {
    setPendingKey(moduleKey);
    setError(undefined);
    try {
      const command = await setHouseholdModuleEnabled({
        accessToken,
        householdId,
        moduleKey,
        enabled,
      });
      if (command.kind === "unauthorized") return onSessionExpired();
      if (command.kind === "forbidden")
        setError("You are no longer allowed to configure modules.");
      if (command.kind === "module_not_configured")
        setError("This module is not configured for the household.");
    } catch {
      setError("Unable to update the module setting.");
    } finally {
      setPendingKey(undefined);
    }
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      {householdModuleCatalog.map((module) => {
        const setting = settings.find(
          ({ moduleKey }) => moduleKey === module.key,
        );
        return (
          <label key={module.key}>
            <input
              type="checkbox"
              checked={setting?.enabled ?? false}
              disabled={!setting || pendingKey !== undefined}
              onChange={(event) =>
                void toggle(module.key, event.target.checked)
              }
            />
            {module.label}
          </label>
        );
      })}
    </>
  );
}
