import { Button } from "@home-hub/ui-web";
import type { Zero } from "@rocicorp/zero";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Outlet,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ApplicationState } from "../application-state";
import type { Session } from "../auth/api";

export type RouterContext = {
  session: Session | null;
  zero: Zero | undefined;
  onAuthenticated: (session: Session) => void;
  onSessionExpired: () => void;
  onZeroReady: (zero: Zero) => void;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RootErrorBoundary,
  notFoundComponent: RootNotFoundBoundary,
});

function RootErrorBoundary({ reset }: ErrorComponentProps) {
  const navigate = useNavigate();
  const router = useRouter();

  return (
    <ApplicationState
      title="Something went wrong"
      description="Home Hub ran into an unexpected problem."
      role="alert"
      actions={
        <>
          <Button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Try again
          </Button>
          <Button
            variant="secondary"
            onClick={() => void navigate({ to: "/" })}
          >
            Go home
          </Button>
        </>
      }
    />
  );
}

function RootNotFoundBoundary() {
  const navigate = useNavigate();

  return (
    <ApplicationState
      title="Page not found"
      description="The page you requested does not exist or may have moved."
      actions={
        <Button onClick={() => void navigate({ to: "/" })}>Go home</Button>
      }
    />
  );
}
