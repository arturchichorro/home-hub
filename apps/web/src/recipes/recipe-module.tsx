import { createContext, type ReactNode, useContext } from "react";

export type RecipeModuleMode = "account" | "guest";

type RecipeModuleContextValue = {
  accessToken: string;
  cacheIdentity: string;
  householdId: string;
  mode: RecipeModuleMode;
  navigationHash?: string;
  onSessionExpired: () => void;
};

const RecipeModuleContext = createContext<RecipeModuleContextValue | undefined>(
  undefined,
);

export function RecipeModuleProvider({
  children,
  ...value
}: RecipeModuleContextValue & { children: ReactNode }) {
  return (
    <RecipeModuleContext.Provider value={value}>
      {children}
    </RecipeModuleContext.Provider>
  );
}

export function useRecipeModule() {
  const value = useContext(RecipeModuleContext);
  if (!value) throw new Error("RecipeModuleProvider is missing");
  return value;
}
