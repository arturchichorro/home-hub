import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

type AppProps = {
  accessToken: string;
  children?: ReactNode;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
  username: string;
};

function App({
  accessToken,
  children,
  onLoggedOut,
  onSessionExpired,
  username,
}: AppProps) {
  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <AppSidebar
        accessToken={accessToken}
        username={username}
        onLoggedOut={onLoggedOut}
        onSessionExpired={onSessionExpired}
      />

      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default App;
