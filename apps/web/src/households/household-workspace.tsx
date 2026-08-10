import { queries } from "@home-hub/shared/zero/queries";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { type ComponentType, type ReactNode, useState } from "react";
import { RecipeList } from "../recipes/recipe-list";
import { ShoppingList } from "../shopping/shopping-list";
import { HouseholdSettings } from "./household-settings";

type HouseholdWorkspaceProps = {
  accessToken: string;
  householdId: string;
  onLeftHousehold: () => void;
  onSessionExpired: () => void;
};

type WorkspaceModule = "shopping" | "recipes" | "household";

type ModuleIconProps = {
  className?: string;
};

type ModuleDefinition = {
  key: WorkspaceModule;
  label: string;
  Icon: ComponentType<ModuleIconProps>;
};

function ShoppingIcon({ className }: ModuleIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M5 9h14l-1.5 10h-11L5 9Z" />
      <path d="m9 9 3-5 3 5M9 13v2M15 13v2" />
    </svg>
  );
}

function RecipesIcon({ className }: ModuleIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z" />
    </svg>
  );
}

function HouseholdIcon({ className }: ModuleIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 15a4 4 0 0 1 6.5 3" />
    </svg>
  );
}

const moduleDefinitions: readonly ModuleDefinition[] = [
  { key: "shopping", label: "Shopping", Icon: ShoppingIcon },
  { key: "recipes", label: "Recipes", Icon: RecipesIcon },
  { key: "household", label: "Household", Icon: HouseholdIcon },
];

type ModuleNavigationProps = {
  modules: readonly ModuleDefinition[];
  selectedModule: WorkspaceModule;
  onSelect: (module: WorkspaceModule) => void;
};

function ModuleNavigation({
  modules,
  selectedModule,
  onSelect,
}: ModuleNavigationProps) {
  return (
    <nav
      aria-label="Household modules"
      className="flex flex-wrap justify-center gap-2 border-b border-border"
    >
      {modules.map(({ key, label, Icon }) => {
        const selected = key === selectedModule;

        return (
          <Button
            key={key}
            variant="ghost"
            aria-pressed={selected}
            className={
              selected
                ? "rounded-none border-b-2 border-primary text-primary!"
                : "rounded-none border-b-2 border-transparent"
            }
            onClick={() => onSelect(key)}
          >
            <Icon className="size-5" />
            {label}
          </Button>
        );
      })}
    </nav>
  );
}

export function HouseholdWorkspace({
  accessToken,
  householdId,
  onLeftHousehold,
  onSessionExpired,
}: HouseholdWorkspaceProps) {
  const [selection, setSelection] = useState<{
    householdId: string;
    module: WorkspaceModule;
  }>();
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  const management = (
    <section
      aria-labelledby="household-management-heading"
      className="grid gap-6"
    >
      <h2 id="household-management-heading" className="text-xl font-semibold">
        Household management
      </h2>
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
      <div className="grid gap-8">
        {management}
        <InlineAlert>Loading household modules…</InlineAlert>
      </div>
    );
  }

  if (result.type === "error") {
    return (
      <div className="grid gap-8">
        {management}
        <InlineAlert role="alert" variant="danger">
          Unable to load household modules.
        </InlineAlert>
      </div>
    );
  }

  const enabledModuleKeys = new Set(
    settings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.moduleKey),
  );
  const availableModules = moduleDefinitions.filter(
    ({ key }) => key === "household" || enabledModuleKeys.has(key),
  );
  const explicitlySelectedModule =
    selection?.householdId === householdId ? selection.module : undefined;
  const selectedModule =
    explicitlySelectedModule !== undefined &&
    availableModules.some(({ key }) => key === explicitlySelectedModule)
      ? explicitlySelectedModule
      : (availableModules[0]?.key ?? "household");

  let content: ReactNode;
  if (selectedModule === "shopping") {
    content = <ShoppingList householdId={householdId} />;
  } else if (selectedModule === "recipes") {
    content = (
      <section aria-labelledby="recipes-heading">
        <h2 id="recipes-heading" className="sr-only">
          Recipes
        </h2>
        <RecipeList
          accessToken={accessToken}
          householdId={householdId}
          onSessionExpired={onSessionExpired}
        />
      </section>
    );
  } else {
    content = management;
  }

  return (
    <div className="grid gap-8">
      <ModuleNavigation
        modules={availableModules}
        selectedModule={selectedModule}
        onSelect={(module) => setSelection({ householdId, module })}
      />
      {content}
    </div>
  );
}
