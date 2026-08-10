import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AuthPage } from "../auth/auth-page";
import { SignupForm } from "../auth/signup-form";

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: "/" });
  },
  component: SignupRoute,
});

function SignupRoute() {
  const { onAuthenticated } = Route.useRouteContext();

  return (
    <AuthPage
      title="Create account"
      description="Use the server access code to join Home Hub."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm onAuthenticated={onAuthenticated} />
    </AuthPage>
  );
}
