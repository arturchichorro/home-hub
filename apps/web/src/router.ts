import { createRouter } from "@tanstack/react-router";
import { guestLocationRewrite } from "./guest-access/location-rewrite";
import type { RouterContext } from "./routes/__root";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    ...(context.guestAccess
      ? { rewrite: guestLocationRewrite(context.guestAccess.credential) }
      : {}),
    scrollRestoration: true,
    defaultPreload: "intent",

    defaultPreloadStaleTime: 0,
    defaultPreloadGcTime: 0,
  });
}

type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
