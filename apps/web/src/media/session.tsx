import { createContext, type ReactNode, useContext } from "react";
export type MediaSession = {
  accessToken: string;
  userId: string;
  onSessionExpired: () => void;
};
const Context = createContext<MediaSession | undefined>(undefined);
export function MediaSessionProvider({
  value,
  children,
}: {
  value: MediaSession;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMediaSession() {
  return useContext(Context);
}
