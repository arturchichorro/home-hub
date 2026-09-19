import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { GuestAccessProvider } from "../guest/access";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => {
    if (context.applicationMode !== "guest") throw redirect({ to: "/" });
  },
  component: GuestLayout,
});

function GuestLayout() {
  return (
    <GuestAccessProvider>
      <Outlet />
    </GuestAccessProvider>
  );
}
