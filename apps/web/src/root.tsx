import { Panel } from "@home-hub/ui-web";
import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import type { Session } from "./auth/api";
import { LoginForm } from "./auth/login-form";
import { createAppRouter } from "./router";
import { HomeHubZeroProvider } from "./zero/provider";

type RootProps = {
  initialSession: Session | null;
};

type AuthenticatedRootProps = {
  session: Session;
  onSessionExpired: () => void;
};

function AuthenticatedRoot({
  session,
  onSessionExpired,
}: AuthenticatedRootProps) {
  const [router] = useState(() =>
    createAppRouter({ session, onSessionExpired }),
  );

  return (
    <HomeHubZeroProvider
      userId={session.user.id}
      accessToken={session.accessToken}
    >
      <RouterProvider router={router} context={{ session, onSessionExpired }} />
    </HomeHubZeroProvider>
  );
}

export function Root({ initialSession }: RootProps) {
  const [session, setSession] = useState(initialSession);

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-10 font-sans text-foreground">
        <div className="w-full max-w-md">
          <h1 className="mb-5 text-center text-2xl font-semibold">Home Hub</h1>
          <Panel
            title="Sign in"
            description="Sign in to access your households."
            variant="raised"
          >
            <LoginForm onAuthenticated={setSession} />
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <AuthenticatedRoot
      session={session}
      onSessionExpired={() => setSession(null)}
    />
  );
}
