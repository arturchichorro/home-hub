import { useState } from "react";
import { HouseholdSwitcher } from "./households/household-switcher";
import { HouseholdWorkspace } from "./households/household-workspace";
import { ZeroConnectionStatus } from "./zero/connection-status";

type AppProps = {
  accessToken: string;
  username: string;
  onSessionExpired: () => void;
};

function App({ accessToken, username, onSessionExpired }: AppProps) {
  const [householdId, setHouseholdId] = useState<string>();

  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
          <p className="shrink-0 text-lg font-semibold">Home Hub</p>
          <HouseholdSwitcher
            selectedHouseholdId={householdId}
            onSelect={setHouseholdId}
          />
          <div className="ml-auto flex min-w-0 items-center gap-4">
            <ZeroConnectionStatus />
            <span className="max-w-40 truncate text-sm font-medium">
              {username}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {householdId && (
          <HouseholdWorkspace
            accessToken={accessToken}
            householdId={householdId}
            onLeftHousehold={() => setHouseholdId(undefined)}
            onSessionExpired={onSessionExpired}
          />
        )}
      </main>
    </div>
  );
}

export default App;
