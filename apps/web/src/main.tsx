import { Button } from "@home-hub/ui-web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  credentialFromFragment,
  type GuestEntry,
  validateGuestCredential,
} from "./guest-access/access";
import "./index.css";
import { ApplicationState } from "./application-state.tsx";
import {
  clearSessionBootstrap,
  saveSessionBootstrap,
} from "./auth/session-bootstrap.ts";
import { restoreStartupSession } from "./auth/startup-session.ts";
import { Root } from "./root.tsx";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

function renderApplication(
  initialSession: Parameters<typeof Root>[0]["initialSession"],
  initialGuest: GuestEntry | null = null,
) {
  root.render(
    <StrictMode>
      <Root initialSession={initialSession} initialGuest={initialGuest} />
    </StrictMode>,
  );
}

function renderUnavailable(title: string, description: string) {
  root.render(
    <StrictMode>
      <ApplicationState
        title={title}
        description={description}
        role="alert"
        actions={
          <Button onClick={() => window.location.reload()}>Try again</Button>
        }
      />
    </StrictMode>,
  );
}

async function start() {
  if (import.meta.env.DEV && window.location.pathname === "/dev/ui") {
    const { UiGallery } = await import("./dev/ui-gallery");

    root.render(
      <StrictMode>
        <UiGallery />
      </StrictMode>,
    );
    return;
  }

  // Validate before opening Zero's persistent cache. Guest entry never restores
  // an account session, even when this browser has a member's refresh cookie.
  if (
    window.location.hash.startsWith("#hhg_") ||
    window.location.pathname === "/join" ||
    window.location.hostname === "guest.achichorro.com"
  ) {
    const credential = credentialFromFragment(window.location.hash);
    let entry: GuestEntry | null = null;
    try {
      entry = credential ? await validateGuestCredential(credential) : null;
    } catch {
      renderUnavailable(
        "Guest access is unavailable",
        "Connect to the internet and try again to validate this link.",
      );
      return;
    }
    if (!entry) window.history.replaceState(null, "", "/join");
    renderApplication(null, entry);
    return;
  }
  const result = await restoreStartupSession();

  if (result.kind === "online") {
    if (result.session) saveSessionBootstrap(result.session.user);
    else clearSessionBootstrap();
    renderApplication(result.session);
    return;
  }

  if (result.kind === "offline" && result.session) {
    renderApplication(result.session);
    return;
  }

  if (result.kind === "offline") {
    renderUnavailable(
      "Home Hub is offline",
      "Connect once to sign in and synchronize your household data.",
    );
    return;
  }

  renderUnavailable(
    "Unable to restore your session",
    "Check your connection and try again.",
  );
}

void start();
