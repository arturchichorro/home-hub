import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { Session } from "../auth/api";

export type RouterContext = {
  session: Session | null;
  onAuthenticated: (session: Session) => void;
  onSessionExpired: () => void;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});
