import { Button, Field, FieldControl, InlineAlert } from "@home-hub/ui-web";
import { type SubmitEvent, useState } from "react";
import { type Session, signup } from "./api";

type SignupFormProps = {
  onAuthenticated: (session: Session) => void;
};

export function SignupForm({ onAuthenticated }: SignupFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = await signup({ username, email, password, accessCode });

      if (result.kind === "forbidden") {
        setError("Sign up is unavailable or the access code is incorrect.");
        return;
      }

      if (result.kind === "conflict") {
        setError("That username or email is already in use.");
        return;
      }

      onAuthenticated(result.session);
    } catch {
      setError(
        "Unable to create your account. Please check the form and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label="Username">
        <FieldControl
          name="username"
          autoComplete="username"
          minLength={3}
          maxLength={32}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

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

      <Field label="Password" description="Use at least 12 characters.">
        <FieldControl
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field label="Sign-up access code">
        <FieldControl
          name="accessCode"
          type="password"
          autoComplete="off"
          required
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
        />
      </Field>

      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}

      <Button type="submit" busy={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
