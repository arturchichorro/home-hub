import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { mutators } from "@home-hub/shared/zero/mutators";
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
  ListTodo,
  Settings,
  UserPlus,
  X,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AccountMenu } from "./auth/account-menu";
import { CreateHouseholdDialog } from "./households/create-household-dialog";
import { JoinHouseholdDialog } from "./households/join-household-dialog";
import { ZeroConnectionStatus } from "./zero/connection-status";
import { useZeroMutationEnabled } from "./zero/use-zero-mutation-enabled";

type AppSidebarProps = {
  accessToken: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
  username: string;
};

type SidebarNavigationProps = Omit<
  AppSidebarProps,
  "mobileOpen" | "onMobileOpenChange"
> & {
  closeControl?: ReactNode;
  mobile: boolean;
  onCreateHousehold: () => void;
  onJoinHousehold: () => void;
  onNavigate?: () => void;
};

type HouseholdNavigationGroupProps = {
  disabled: boolean;
  householdId: string;
  householdName: string;
  index: number;
  onNavigate?: (() => void) | undefined;
};

type ModuleDefinition = {
  key: "recipes" | "settings" | "lists";
  label: string;
  Icon: typeof BookOpen;
  to:
    | "/households/$householdId/recipes"
    | "/households/$householdId/settings"
    | "/households/$householdId/lists";
};

const moduleDefinitions: readonly ModuleDefinition[] = [
  {
    key: "lists",
    label: "Lists",
    Icon: ListTodo,
    to: "/households/$householdId/lists",
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

const householdPointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === "mouse") {
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    }
    if (event.pointerType === "touch") {
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 }),
      ];
    }
    return [
      new PointerActivationConstraints.Delay({ value: 200, tolerance: 10 }),
      new PointerActivationConstraints.Distance({ value: 5 }),
    ];
  },
});

const householdKeyboardSensor = KeyboardSensor.configure({
  keyboardCodes: {
    start: ["Space"],
    cancel: ["Escape"],
    end: ["Space", "Enter", "Tab"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
  },
});

function householdSensors(defaults: Sensors): Sensors {
  return [
    ...defaults.filter(
      (sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor,
    ),
    householdPointerSensor,
    householdKeyboardSensor,
  ];
}

export function moduleIsActive(
  pathname: string,
  householdId: string,
  key: ModuleDefinition["key"],
): boolean {
  const householdPath = `/households/${householdId}`;

  const modulePath = `${householdPath}/${key}`;
  return (
    pathname === modulePath ||
    (key !== "settings" && pathname.startsWith(`${modulePath}/`))
  );
}

function HouseholdNavigationGroup({
  disabled,
  householdId,
  householdName,
  index,
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
  const sortable = useSortable({
    id: householdId,
    index,
    type: "user-household",
    accept: "user-household",
    disabled,
  });
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
      ref={sortable.ref}
      open={open}
      className="group/household"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        ref={sortable.handleRef}
        data-base-ui-swipe-ignore
        draggable={false}
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
  const zero = useZero();
  const navigate = useNavigate();
  const mutationEnabled = useZeroMutationEnabled();
  const [memberships, result] = useQuery(queries.householdMemberships.mine({}));

  function moveHousehold(from: number, to: number) {
    if (!mutationEnabled || from === to || to < 0 || to >= memberships.length)
      return;
    const reordered = [...memberships];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    zero.mutate(
      mutators.householdMemberships.reorder({
        householdId: moved.householdId,
        orderedHouseholdIds: reordered.map(
          (membership) => membership.householdId,
        ),
        optimisticUpdatedAt: Date.now(),
      }),
    );
  }

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
        {memberships.length === 0 && result.type === "complete" ? (
          <p className="px-2 py-3 text-sm text-muted">No households yet</p>
        ) : null}
        <DragDropProvider
          sensors={householdSensors}
          onDragEnd={(event) => {
            const source = event.operation.source;
            if (
              !event.canceled &&
              isSortable(source) &&
              source.initialIndex !== source.index
            ) {
              moveHousehold(source.initialIndex, source.index);
            }
          }}
        >
          <div className="grid gap-1">
            {memberships.map((membership, index) =>
              membership.household ? (
                <HouseholdNavigationGroup
                  key={membership.id}
                  disabled={!mutationEnabled}
                  householdId={membership.household.id}
                  householdName={membership.household.name}
                  index={index}
                  onNavigate={onNavigate}
                />
              ) : null,
            )}
          </div>
        </DragDropProvider>
      </nav>

      <div className="grid gap-1 border-t border-border py-2">
        <Button
          variant="ghost"
          disabled={!mutationEnabled}
          className="h-9! w-full justify-start! px-2! font-normal"
          onClick={onJoinHousehold}
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Join household
        </Button>
        <Button
          variant="ghost"
          disabled={!mutationEnabled}
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
  mobileOpen,
  onMobileOpenChange,
  onLoggedOut,
  onSessionExpired,
  username,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

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
        onOpenChange={onMobileOpenChange}
        swipeDirection="left"
      >
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
                    onMobileOpenChange(false);
                    setCreateDialogOpen(true);
                  }}
                  onJoinHousehold={() => {
                    onMobileOpenChange(false);
                    setJoinDialogOpen(true);
                  }}
                  onLoggedOut={onLoggedOut}
                  onNavigate={() => onMobileOpenChange(false)}
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
