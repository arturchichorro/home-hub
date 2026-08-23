import { queries } from "@home-hub/shared/zero/queries";
import {
  BookOpen,
  Button,
  ChevronDown,
  Drawer,
  House,
  HousePlus,
  IconButton,
  InlineAlert,
  PanelLeft,
  Settings,
  ShoppingBasket,
  UserPlus,
  X,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { AccountMenu } from "./auth/account-menu";
import { CreateHouseholdDialog } from "./households/create-household-dialog";
import { JoinHouseholdDialog } from "./households/join-household-dialog";
import { ZeroConnectionStatus } from "./zero/connection-status";

type AppSidebarProps = {
  accessToken: string;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
  username: string;
};

type SidebarNavigationProps = AppSidebarProps & {
  closeControl?: ReactNode;
  mobile: boolean;
  onCreateHousehold: () => void;
  onJoinHousehold: () => void;
  onNavigate?: () => void;
};

type HouseholdNavigationGroupProps = {
  householdId: string;
  householdName: string;
  onNavigate?: (() => void) | undefined;
};

type ModuleDefinition = {
  key: "recipes" | "settings" | "shopping";
  label: string;
  Icon: typeof BookOpen;
  to:
    | "/households/$householdId/recipes"
    | "/households/$householdId/settings"
    | "/households/$householdId/shopping";
};

const moduleDefinitions: readonly ModuleDefinition[] = [
  {
    key: "shopping",
    label: "Shopping",
    Icon: ShoppingBasket,
    to: "/households/$householdId/shopping",
  },
  {
    key: "recipes",
    label: "Recipes",
    Icon: BookOpen,
    to: "/households/$householdId/recipes",
  },
  {
    key: "settings",
    label: "Settings",
    Icon: Settings,
    to: "/households/$householdId/settings",
  },
];

function moduleIsActive(
  pathname: string,
  householdId: string,
  key: ModuleDefinition["key"],
): boolean {
  const householdPath = `/households/${householdId}`;

  if (key === "recipes") return pathname.startsWith(`${householdPath}/recipes`);
  return pathname === `${householdPath}/${key}`;
}

function HouseholdNavigationGroup({
  householdId,
  householdName,
  onNavigate,
}: HouseholdNavigationGroupProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  const enabledModuleKeys = new Set(
    settings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.moduleKey),
  );
  const modules =
    result.type === "unknown"
      ? moduleDefinitions
      : moduleDefinitions.filter(
          ({ key }) => key === "settings" || enabledModuleKeys.has(key),
        );
  const householdPath = `/households/${householdId}`;
  const householdSelected =
    pathname === householdPath || pathname.startsWith(`${householdPath}/`);

  return (
    <details
      open={open}
      className="group/household"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={`flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden ${householdSelected ? "text-foreground" : "text-muted"}`}
      >
        <House aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{householdName}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 -rotate-90 transition-transform group-open/household:rotate-0"
        />
      </summary>
      <div className="ml-4 border-l border-border py-1 pl-3">
        {result.type === "error" ? (
          <p className="px-2 py-1 text-xs text-danger">Modules unavailable</p>
        ) : null}
        {modules.map(({ key, label, Icon, to }) => {
          const active = moduleIsActive(pathname, householdId, key);

          return (
            <button
              key={key}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-focus-ring ${active ? "bg-raised text-foreground" : "text-muted"}`}
              onClick={() => {
                void navigate({ to, params: { householdId } });
                onNavigate?.();
              }}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}

function SidebarNavigation({
  closeControl,
  mobile,
  onCreateHousehold,
  onJoinHousehold,
  onLoggedOut,
  onNavigate,
  username,
}: SidebarNavigationProps) {
  const navigate = useNavigate();
  const [households, result] = useQuery(queries.households.mine({}));

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface p-3 text-foreground">
      <div className="flex items-start gap-2 px-2 py-2">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => {
            void navigate({ to: "/" });
            onNavigate?.();
          }}
        >
          <span className="flex items-center gap-2 text-lg font-semibold text-primary">
            Home Hub
            {mobile ? <ZeroConnectionStatus compact /> : null}
          </span>
          {!mobile ? (
            <span className="mt-0.5 block">
              <ZeroConnectionStatus />
            </span>
          ) : null}
        </button>
        {closeControl}
      </div>

      <nav
        aria-label="Households"
        className="min-h-0 flex-1 overflow-y-auto py-3"
      >
        {result.type === "error" ? (
          <InlineAlert role="alert" variant="danger">
            Unable to load households.
          </InlineAlert>
        ) : null}
        {households.length === 0 && result.type === "complete" ? (
          <p className="px-2 py-3 text-sm text-muted">No households yet</p>
        ) : null}
        <div className="grid gap-1">
          {households.map((household) => (
            <HouseholdNavigationGroup
              key={household.id}
              householdId={household.id}
              householdName={household.name}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <div className="grid gap-1 border-t border-border py-2">
        <Button
          variant="ghost"
          className="h-9! w-full justify-start! px-2! font-normal"
          onClick={onJoinHousehold}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Join household
        </Button>
        <Button
          variant="ghost"
          className="h-9! w-full justify-start! px-2! font-normal"
          onClick={onCreateHousehold}
        >
          <HousePlus aria-hidden="true" className="size-4" />
          Create household
        </Button>
      </div>

      <div className="border-t border-border pt-2">
        <AccountMenu
          username={username}
          onLoggedOut={onLoggedOut}
          triggerClassName="w-full min-w-0 justify-between! px-3!"
        />
      </div>
    </div>
  );
}

export function AppSidebar({
  accessToken,
  onLoggedOut,
  onSessionExpired,
  username,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktopQuery.matches) setMobileOpen(false);
    };

    closeOnDesktop();
    desktopQuery.addEventListener("change", closeOnDesktop);
    return () => desktopQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  function selectHousehold(householdId: string) {
    void navigate({
      to: "/households/$householdId",
      params: { householdId },
    });
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-svh min-h-0 border-r border-border lg:col-start-1 lg:row-start-1 lg:block">
        <SidebarNavigation
          accessToken={accessToken}
          mobile={false}
          onCreateHousehold={() => setCreateDialogOpen(true)}
          onJoinHousehold={() => setJoinDialogOpen(true)}
          onLoggedOut={onLoggedOut}
          onSessionExpired={onSessionExpired}
          username={username}
        />
      </aside>

      <Drawer.Root
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        swipeDirection="left"
      >
        <Drawer.Trigger
          render={
            <IconButton
              aria-label="Open navigation"
              variant="secondary"
              className="fixed! z-40 border border-border bg-surface shadow-raised lg:hidden"
              style={{
                bottom: "max(0.75rem, env(safe-area-inset-bottom))",
                left: "max(0.75rem, env(safe-area-inset-left))",
              }}
            >
              <PanelLeft aria-hidden="true" className="size-5" />
            </IconButton>
          }
        />
        <Drawer.SwipeArea className="fixed inset-y-0 left-0 z-30 w-5 lg:hidden" />
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/50 opacity-100 transition-opacity duration-[var(--motion-duration-normal)] data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 lg:hidden">
            <Drawer.Popup className="pointer-events-auto fixed inset-y-0 left-0 w-[min(86vw,18rem)] bg-surface shadow-raised outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[var(--motion-duration-normal)] ease-[var(--ease-standard)] data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)] data-swiping:transition-none">
              <Drawer.Title className="sr-only">Navigation</Drawer.Title>
              <Drawer.Content className="h-full">
                <SidebarNavigation
                  accessToken={accessToken}
                  closeControl={
                    <Drawer.Close
                      render={
                        <IconButton aria-label="Close navigation">
                          <X aria-hidden="true" className="size-5" />
                        </IconButton>
                      }
                    />
                  }
                  mobile
                  onCreateHousehold={() => {
                    setMobileOpen(false);
                    setCreateDialogOpen(true);
                  }}
                  onJoinHousehold={() => {
                    setMobileOpen(false);
                    setJoinDialogOpen(true);
                  }}
                  onLoggedOut={onLoggedOut}
                  onNavigate={() => setMobileOpen(false)}
                  onSessionExpired={onSessionExpired}
                  username={username}
                />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      <CreateHouseholdDialog
        accessToken={accessToken}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={selectHousehold}
        onSessionExpired={onSessionExpired}
      />
      <JoinHouseholdDialog
        accessToken={accessToken}
        open={joinDialogOpen}
        onOpenChange={setJoinDialogOpen}
        onJoined={selectHousehold}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}
