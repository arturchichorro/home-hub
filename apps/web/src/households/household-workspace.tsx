import { queries } from "@home-hub/shared/zero/queries";
import {
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ComponentType } from "react";

type HouseholdWorkspaceProps = {
  householdId: string;
};

type ModuleIconProps = {
  className?: string;
};

type ModuleKey = "shopping" | "recipes" | "household";

type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  to:
    | "/households/$householdId/shopping"
    | "/households/$householdId/recipes"
    | "/households/$householdId/settings";
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

const householdModuleDefinition: ModuleDefinition = {
  key: "household",
  label: "Household",
  to: "/households/$householdId/settings",
  Icon: HouseholdIcon,
};

const moduleDefinitions: readonly ModuleDefinition[] = [
  {
    key: "shopping",
    label: "Shopping",
    to: "/households/$householdId/shopping",
    Icon: ShoppingIcon,
  },
  {
    key: "recipes",
    label: "Recipes",
    to: "/households/$householdId/recipes",
    Icon: RecipesIcon,
  },
  householdModuleDefinition,
];

function ModulesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

function getCurrentModule(pathname: string): ModuleKey {
  if (pathname.endsWith("/shopping")) return "shopping";
  if (pathname.endsWith("/recipes")) return "recipes";
  return "household";
}

export function HouseholdModuleMenu({ householdId }: HouseholdWorkspaceProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  const queryComplete = result.type === "complete";
  const enabledModuleKeys = new Set(
    settings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.moduleKey),
  );
  const availableModules = queryComplete
    ? moduleDefinitions.filter(
        ({ key }) => key === "household" || enabledModuleKeys.has(key),
      )
    : moduleDefinitions;

  function selectModule(key: string) {
    const module = availableModules.find((candidate) => candidate.key === key);
    if (!module) return;

    void navigate({ to: module.to, params: { householdId } });
  }

  return (
    <MenuRoot>
      <MenuTrigger
        aria-label="Choose household module"
        className="size-10! p-0!"
        disabled={result.type === "error"}
        title={
          result.type === "error"
            ? "Household modules are unavailable"
            : "Choose household module"
        }
      >
        <ModulesIcon />
      </MenuTrigger>
      <MenuPopup>
        <MenuRadioGroup
          value={getCurrentModule(pathname)}
          onValueChange={selectModule}
        >
          {availableModules.map(({ key, label, Icon }) => (
            <MenuRadioItem key={key} value={key}>
              <span className="flex items-center gap-2">
                <Icon className="size-5 text-muted" />
                {label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}

export function HouseholdWorkspace(_props: HouseholdWorkspaceProps) {
  return <Outlet />;
}
