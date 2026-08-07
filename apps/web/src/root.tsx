import { useState } from "react";
import App from "./App";
import type { Session } from "./auth/api";
import { LoginForm } from "./auth/login-form";
import { HomeHubZeroProvider } from "./zero/provider";

type RootProps = {
  initialSession: Session | null;
};

export function Root({ initialSession }: RootProps) {
  const [session, setSession] = useState(initialSession);

  if (!session) {
    return (
      <main>
        <p>You are not signed in.</p>
        <LoginForm onAuthenticated={setSession} />
      </main>
    );
  }

  return (
    <HomeHubZeroProvider
      userId={session.user.id}
      accessToken={session.accessToken}
    >
      <App
        accessToken={session.accessToken}
        onSessionExpired={() => setSession(null)}
      />
    </HomeHubZeroProvider>
  );
}
