import { householdModuleCatalog } from "@home-hub/shared/modules";
import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert, Switch } from "@home-hub/ui-web";
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

  if (result.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load module settings.
      </InlineAlert>
    );

  async function toggle(moduleKey: "lists" | "recipes", enabled: boolean) {
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
    <div className="grid gap-3" aria-busy={result.type !== "complete"}>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      <ul className="divide-y divide-border">
        {householdModuleCatalog.map((module) => {
          const setting = settings.find(
            ({ moduleKey }) => moduleKey === module.key,
          );
          return (
            <li key={module.key} className="py-3">
              <Switch
                label={module.label}
                checked={setting?.enabled ?? false}
                disabled={!setting || pendingKey !== undefined}
                onCheckedChange={(enabled) => void toggle(module.key, enabled)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
