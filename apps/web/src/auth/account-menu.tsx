import {
  InlineAlert,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "@home-hub/ui-web";
import { useState } from "react";
import { logout } from "./api";

type AccountMenuProps = {
  onLoggedOut: () => void;
  username: string;
};

export function AccountMenu({ onLoggedOut, username }: AccountMenuProps) {
  const [error, setError] = useState<string>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setError(undefined);
    setIsLoggingOut(true);

    try {
      await logout();
      onLoggedOut();
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <MenuRoot>
      <MenuTrigger className="max-w-48">
        <span className="truncate">{username}</span>
        <span aria-hidden="true">⌄</span>
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem
          closeOnClick={false}
          disabled={isLoggingOut}
          variant="danger"
          onClick={() => void handleLogout()}
        >
          {isLoggingOut ? "Logging out…" : "Log out"}
        </MenuItem>
        {error ? (
          <InlineAlert className="mt-1" role="alert" variant="danger">
            {error}
          </InlineAlert>
        ) : null}
      </MenuPopup>
    </MenuRoot>
  );
}
