import { queries } from "@home-hub/shared/zero/queries";
import {
  BookOpen,
  LayoutGrid,
  type LucideIcon,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
  ShoppingBasket,
  Users,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

type HouseholdWorkspaceProps = {
  householdId: string;
};

type ModuleKey = "shopping" | "recipes" | "household";

type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  to:
    | "/households/$householdId/shopping"
    | "/households/$householdId/recipes"
    | "/households/$householdId/settings";
  Icon: LucideIcon;
};

const householdModuleDefinition: ModuleDefinition = {
  key: "household",
  label: "Household",
  to: "/households/$householdId/settings",
  Icon: Users,
};

const moduleDefinitions: readonly ModuleDefinition[] = [
  {
    key: "shopping",
    label: "Shopping",
    to: "/households/$householdId/shopping",
    Icon: ShoppingBasket,
  },
  {
    key: "recipes",
    label: "Recipes",
    to: "/households/$householdId/recipes",
    Icon: BookOpen,
  },
  householdModuleDefinition,
];

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
        <LayoutGrid aria-hidden="true" className="size-5" />
      </MenuTrigger>
      <MenuPopup>
        <MenuRadioGroup
          value={getCurrentModule(pathname)}
          onValueChange={selectModule}
        >
          {availableModules.map(({ key, label, Icon }) => (
            <MenuRadioItem key={key} value={key}>
              <span className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-5 text-muted" />
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
