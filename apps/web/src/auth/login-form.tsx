import { Button, Field, FieldControl, InlineAlert } from "@home-hub/ui-web";
import { type SubmitEvent, useState } from "react";
import { login, type Session } from "./api";

type LoginFormProps = {
  onAuthenticated: (session: Session) => void;
};

export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });

      if (result.kind === "invalid_credentials") {
        setError("Invalid email or password");
        return;
      }

      onAuthenticated(result.session);
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label="Email">
        <FieldControl
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field label="Password">
        <FieldControl
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}

      <Button type="submit" busy={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
