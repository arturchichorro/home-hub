import { Panel } from "@home-hub/ui-web";
import type { ReactNode } from "react";

type ApplicationStateProps = {
  actions: ReactNode;
  description: string;
  role?: "alert" | "status";
  title: string;
};

export function ApplicationState({
  actions,
  description,
  role,
  title,
}: ApplicationStateProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-10 font-sans text-foreground">
      <div className="w-full max-w-md">
        <h1 className="mb-5 text-center text-2xl font-semibold">Home Hub</h1>
        <Panel
          title={title}
          description={description}
          variant="raised"
          role={role}
        >
          <div className="flex flex-wrap gap-3">{actions}</div>
        </Panel>
      </div>
    </main>
  );
}
