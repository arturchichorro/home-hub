import { useState } from "react";
import { HouseholdSwitcher } from "./households/household-switcher";
import { HouseholdWorkspace } from "./households/household-workspace";
import { ZeroConnectionStatus } from "./zero/connection-status";

type AppProps = {
  accessToken: string;
  onSessionExpired: () => void;
};

function App({ accessToken, onSessionExpired }: AppProps) {
  const [householdId, setHouseholdId] = useState<string>();

  return (
    <main>
      <ZeroConnectionStatus />

      <HouseholdSwitcher
        selectedHouseholdId={householdId}
        onSelect={setHouseholdId}
      />

      {householdId && (
        <HouseholdWorkspace
          accessToken={accessToken}
          householdId={householdId}
          onLeftHousehold={() => setHouseholdId(undefined)}
          onSessionExpired={onSessionExpired}
        />
      )}
    </main>
  );
}

export default App;
