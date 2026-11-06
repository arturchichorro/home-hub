import { Component, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppHeaderRightComponentContext } from "../../src/app-header-right-component";
import { Moodboard } from "../../src/lists/moodboard";
import { MediaSessionProvider } from "../../src/media/session";
import { control } from "./adapters";
import "./style.css";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    control.errors.push(String(error));
  }

  render() {
    return this.state.failed ? (
      <p role="alert">Moodboard crashed</p>
    ) : (
      this.props.children
    );
  }
}

function Fixture() {
  const [header, setHeader] = useState<ReactNode>();

  return (
    <Boundary>
      <MediaSessionProvider
        value={{
          userId: "fixture",
          accessToken: "fixture",
          onSessionExpired() {},
        }}
      >
        <AppHeaderRightComponentContext.Provider value={setHeader}>
          <div className="min-h-svh bg-canvas text-foreground">
            <header className="flex h-14 items-center justify-end px-4">
              {header}
            </header>
            <main className="px-4">
              <Moodboard
                householdId="household"
                listId="list"
                onBusy={() => {}}
              />
            </main>
          </div>
        </AppHeaderRightComponentContext.Provider>
      </MediaSessionProvider>
    </Boundary>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing fixture root");
}

createRoot(root).render(<Fixture />);
