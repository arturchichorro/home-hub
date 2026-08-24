import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AppBreadcrumbHeader } from "./app-breadcrumb-header";
import { AppHeaderRightComponentContext } from "./app-header-right-component";
import { AppSidebar } from "./app-sidebar";

type AppProps = {
  accessToken: string;
  children?: ReactNode;
  onLoggedOut: () => void;
  onSessionExpired: () => void;
  username: string;
};

function App({
  accessToken,
  children,
  onLoggedOut,
  onSessionExpired,
  username,
}: AppProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [headerRightComponent, setHeaderRightComponent] =
    useState<ReactNode>(null);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktopQuery.matches) setMobileSidebarOpen(false);
    };

    closeOnDesktop();
    desktopQuery.addEventListener("change", closeOnDesktop);
    return () => desktopQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="min-h-svh bg-canvas font-sans text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <AppSidebar
        accessToken={accessToken}
        mobileOpen={mobileSidebarOpen}
        username={username}
        onMobileOpenChange={setMobileSidebarOpen}
        onLoggedOut={onLoggedOut}
        onSessionExpired={onSessionExpired}
      />

      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <AppHeaderRightComponentContext.Provider
          value={setHeaderRightComponent}
        >
          <AppBreadcrumbHeader
            rightComponent={headerRightComponent}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
          <main className="w-full px-4 pt-6 pb-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </AppHeaderRightComponentContext.Provider>
      </div>
    </div>
  );
}

export default App;
