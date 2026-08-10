import { Panel } from "@home-hub/ui-web";
import type { ReactNode } from "react";

type AuthPageProps = {
  children: ReactNode;
  description: string;
  footer: ReactNode;
  title: string;
};

export function AuthPage({
  children,
  description,
  footer,
  title,
}: AuthPageProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-10 font-sans text-foreground">
      <div className="w-full max-w-md">
        <h1 className="mb-5 text-center text-2xl font-semibold">Home Hub</h1>
        <Panel title={title} description={description} variant="raised">
          <div className="grid gap-5">
            {children}
            <div className="text-center text-sm text-muted">{footer}</div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
