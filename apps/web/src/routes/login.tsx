import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AuthPage } from "../auth/auth-page";
import { LoginForm } from "../auth/login-form";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: "/" });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { onAuthenticated } = Route.useRouteContext();

  return (
    <AuthPage
      title="Sign in"
      description="Sign in to access your households."
      footer={
        <>
          Need an account?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <LoginForm onAuthenticated={onAuthenticated} />
    </AuthPage>
  );
}
