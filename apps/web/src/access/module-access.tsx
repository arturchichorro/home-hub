import { createContext, type ReactNode, useContext } from "react";

type ModuleAccess = {
  canWrite: boolean;
};

const ModuleAccessContext = createContext<ModuleAccess>({ canWrite: true });

export function ModuleAccessProvider({
  canWrite,
  children,
}: ModuleAccess & { children: ReactNode }) {
  return (
    <ModuleAccessContext.Provider value={{ canWrite }}>
      {children}
    </ModuleAccessContext.Provider>
  );
}

export function useModuleAccess() {
  return useContext(ModuleAccessContext);
}
