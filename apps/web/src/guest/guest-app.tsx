import { Button, LogOut } from "@home-hub/ui-web";
import type { ReactNode } from "react";
import { useState } from "react";
import { AppHeaderRightComponentContext } from "../app-header-right-component";

export function GuestApp({
  access,
  children,
  householdName,
  onLeave,
}: {
  access: "read" | "write";
  children: ReactNode;
  householdName: string;
  onLeave: () => void;
}) {
  const [rightComponent, setRightComponent] = useState<ReactNode>(null);
  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground">
      <AppHeaderRightComponentContext.Provider value={setRightComponent}>
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-canvas px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{householdName}</p>
            <p className="text-xs text-muted">
              Recipes · {access === "write" ? "Can edit" : "View only"}
            </p>
          </div>
          {rightComponent}
          <Button variant="ghost" className="px-2!" onClick={onLeave}>
            <LogOut aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </AppHeaderRightComponentContext.Provider>
    </div>
  );
}
