import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { restoreSession } from "./auth/api.ts";
import { Root } from "./root.tsx";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

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

  try {
    const initialSession = await restoreSession();

    root.render(
      <StrictMode>
        <Root initialSession={initialSession} />
      </StrictMode>,
    );
  } catch {
    root.render(
      <StrictMode>
        <main>
          <h1>Home Hub</h1>
          <p>Unable to restore your session.</p>
        </main>
      </StrictMode>,
    );
  }
}

void start();
