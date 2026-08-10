import type { Zero } from "@rocicorp/zero";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
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
});
