import { useState } from "react";
import App from "./App";
import type { Session } from "./auth/api";
import { HomeHubZeroProvider } from "./zero/provider";

type RootProps = {
  initialSession: Session | null;
};

export function Root({ initialSession }: RootProps) {
  const [session] = useState(initialSession);

  if (!session) {
    return (
      <main>
        <h1>Home Hub</h1>
        <p>You are not signed in.</p>
      </main>
    );
  }

  return (
    <HomeHubZeroProvider
      userId={session.user.id}
      accessToken={session.accessToken}
    >
      <App />
    </HomeHubZeroProvider>
  );
}
