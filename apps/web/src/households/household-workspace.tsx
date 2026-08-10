import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Link, Outlet } from "@tanstack/react-router";
import type { ComponentType } from "react";

type HouseholdWorkspaceProps = {
  householdId: string;
};

type ModuleIconProps = {
  className?: string;
};

type ModuleDefinition = {
  key: "shopping" | "recipes" | "household";
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

const navigationLinkClasses =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-none border-b-2 px-4 text-sm font-medium outline-none transition-colors duration-[var(--motion-duration-fast)] focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export function HouseholdWorkspace({ householdId }: HouseholdWorkspaceProps) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load household modules.
      </InlineAlert>
    );
  }

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

  return (
    <div className="grid gap-8">
      <nav
        aria-label="Household modules"
        className="flex flex-wrap justify-center gap-2 border-b border-border"
      >
        {availableModules.map(({ key, label, to, Icon }) => (
          <Link
            key={key}
            to={to}
            params={{ householdId }}
            preload="render"
            activeOptions={{ exact: true, includeSearch: false }}
            className={navigationLinkClasses}
            activeProps={{ className: "border-primary text-primary" }}
            inactiveProps={{
              className:
                "border-transparent text-muted hover:bg-raised hover:text-foreground",
            }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
