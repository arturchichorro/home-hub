import { queries } from "@home-hub/shared/zero/queries";
import { ChevronRight, IconButton, PanelLeft } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

type AppBreadcrumbHeaderProps = {
  onOpenSidebar: () => void;
  rightComponent?: ReactNode;
};

type BreadcrumbLocation = {
  householdId?: string;
  module?: "recipes" | "settings" | "lists";
  recipeId?: string;
  listId?: string;
};

export function getBreadcrumbLocation(pathname: string): BreadcrumbLocation {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "households" || !segments[1]) return {};

  const module =
    segments[2] === "recipes" ||
    segments[2] === "settings" ||
    segments[2] === "lists"
      ? segments[2]
      : undefined;

  const location: BreadcrumbLocation = { householdId: segments[1] };
  if (module) location.module = module;
  if (module === "recipes" && segments[3]) location.recipeId = segments[3];
  if (module === "lists" && segments[3]) location.listId = segments[3];
  return location;
}

function BreadcrumbSeparator() {
  return (
    <li aria-hidden="true" className="shrink-0 text-subtle">
      <ChevronRight className="size-4" />
    </li>
  );
}

function BreadcrumbItem({ children }: { children: ReactNode }) {
  return <li className="min-w-0 shrink-0">{children}</li>;
}

function RecipeBreadcrumb({
  householdId,
  recipeId,
}: {
  householdId: string;
  recipeId: string;
}) {
  const [recipe] = useQuery(queries.recipes.detail({ householdId, recipeId }));

  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <span aria-current="page" className="block max-w-64 truncate">
          {recipe?.title ?? "Recipe"}
        </span>
      </BreadcrumbItem>
    </>
  );
}

function ListBreadcrumb({
  householdId,
  listId,
}: {
  householdId: string;
  listId: string;
}) {
  const [list] = useQuery(queries.lists.detail({ householdId, listId }));
  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <span aria-current="page" className="block max-w-64 truncate">
          {list?.name ?? "List"}
        </span>
      </BreadcrumbItem>
    </>
  );
}

export function AppBreadcrumbHeader({
  onOpenSidebar,
  rightComponent,
}: AppBreadcrumbHeaderProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [households] = useQuery(queries.households.mine({}));
  const location = getBreadcrumbLocation(pathname);
  const household = households.find(
    (candidate) => candidate.id === location.householdId,
  );
  const moduleLabel =
    location.module === "recipes"
      ? "Recipes"
      : location.module === "lists"
        ? "Lists"
        : location.module === "settings"
          ? "Settings"
          : undefined;

  return (
    <header className="sticky top-0 z-40 flex h-14 min-w-0 items-center gap-2 border-b border-border bg-canvas px-4 sm:px-6 lg:px-8">
      <IconButton
        aria-label="Open navigation"
        className="shrink-0 lg:hidden"
        onClick={onOpenSidebar}
      >
        <PanelLeft aria-hidden="true" className="size-5" />
      </IconButton>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1.5 text-sm font-medium">
          {location.householdId ? (
            <BreadcrumbItem>
              {location.module === "settings" ? (
                <span className="text-muted">
                  {household?.name ?? "Household"}
                </span>
              ) : (
                <Link
                  to="/households/$householdId/settings"
                  params={{ householdId: location.householdId }}
                  className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {household?.name ?? "Household"}
                </Link>
              )}
            </BreadcrumbItem>
          ) : (
            <BreadcrumbItem>
              <span aria-current="page">Home</span>
            </BreadcrumbItem>
          )}
          {location.householdId && location.module && moduleLabel ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {location.recipeId ? (
                  <Link
                    to="/households/$householdId/recipes"
                    params={{ householdId: location.householdId }}
                    className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    {moduleLabel}
                  </Link>
                ) : location.module === "lists" &&
                  location.listId &&
                  location.householdId ? (
                  <Link
                    to="/households/$householdId/lists"
                    params={{ householdId: location.householdId }}
                    className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Lists
                  </Link>
                ) : (
                  <span aria-current="page">{moduleLabel}</span>
                )}
              </BreadcrumbItem>
            </>
          ) : null}
          {location.householdId && location.recipeId ? (
            <RecipeBreadcrumb
              householdId={location.householdId}
              recipeId={location.recipeId}
            />
          ) : null}
          {location.householdId && location.listId ? (
            <ListBreadcrumb
              householdId={location.householdId}
              listId={location.listId}
            />
          ) : null}
        </ol>
      </nav>
      {rightComponent ? (
        <div className="ml-auto shrink-0">{rightComponent}</div>
      ) : null}
    </header>
  );
}
