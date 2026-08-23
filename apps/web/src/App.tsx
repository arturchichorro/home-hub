import type { ReactNode } from "react";
import { AppHeader } from "./app-header";

type AppProps = {
  accessToken: string;
  children?: ReactNode;
  householdId?: string;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
  username: string;
};

function App({
  accessToken,
  children,
  householdId,
  onLoggedOut,
  onSessionExpired,
  username,
}: AppProps) {
  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground">
      <AppHeader
        accessToken={accessToken}
        householdId={householdId}
        username={username}
        onLoggedOut={onLoggedOut}
        onSessionExpired={onSessionExpired}
      />

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default App;
