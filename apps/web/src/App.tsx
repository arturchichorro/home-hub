import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HouseholdSwitcher } from "./households/household-switcher";
import { ZeroConnectionStatus } from "./zero/connection-status";

type AppProps = {
  children?: ReactNode;
  householdId?: string;
  username: string;
};

function App({ children, householdId, username }: AppProps) {
  const navigate = useNavigate();

  function selectHousehold(nextHouseholdId: string | undefined) {
    if (nextHouseholdId) {
      void navigate({
        to: "/households/$householdId",
        params: { householdId: nextHouseholdId },
      });
      return;
    }

    void navigate({ to: "/" });
  }

  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
          <p className="shrink-0 text-lg font-semibold">Home Hub</p>
          <HouseholdSwitcher
            selectedHouseholdId={householdId}
            onSelect={selectHousehold}
          />
          <div className="ml-auto flex min-w-0 items-center gap-4">
            <ZeroConnectionStatus />
            <span className="max-w-40 truncate text-sm font-medium">
              {username}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

export default App;
