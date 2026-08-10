import { createRouter } from "@tanstack/react-router";
import type { RouterContext } from "./routes/__root";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  context: undefined as unknown as RouterContext,
  scrollRestoration: true,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
