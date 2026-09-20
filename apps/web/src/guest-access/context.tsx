import { createContext, useContext } from "react";
import type { GuestEntry } from "./access";
export const GuestAccessContext = createContext<GuestEntry | null>(null);
export function useGuestAccess() {
  return useContext(GuestAccessContext);
}
