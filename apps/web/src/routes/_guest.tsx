import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { GuestSessionProvider } from "../guest/session";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => {
    if (context.applicationMode !== "guest") throw redirect({ to: "/" });
  },
  component: GuestLayout,
});

function GuestLayout() {
  return (
    <GuestSessionProvider>
      <Outlet />
    </GuestSessionProvider>
  );
}
