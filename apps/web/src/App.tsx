import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AccountMenu } from "./auth/account-menu";
import { HouseholdSwitcher } from "./households/household-switcher";
import { HouseholdModuleMenu } from "./households/household-workspace";
import { ZeroConnectionStatus } from "./zero/connection-status";

type AppProps = {
  accessToken: string;
  children?: ReactNode;
  householdId?: string;
  onSessionExpired: () => void;
  username: string;
};

function App({
  accessToken,
  children,
  householdId,
  onSessionExpired,
  username,
}: AppProps) {
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
      <header className="sticky top-0 z-40 border-b border-border bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
          <p className="shrink-0 text-lg font-semibold">
            <span className="sm:hidden" aria-hidden="true">
              HH
            </span>
            <span className="sr-only sm:not-sr-only">Home Hub</span>
          </p>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <HouseholdSwitcher
              accessToken={accessToken}
              selectedHouseholdId={householdId}
              onSelect={selectHousehold}
              onSessionExpired={onSessionExpired}
            />
            {householdId ? (
              <HouseholdModuleMenu householdId={householdId} />
            ) : null}
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
            <ZeroConnectionStatus />
            <AccountMenu username={username} onLoggedOut={onSessionExpired} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default App;
