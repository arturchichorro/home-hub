import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
} from "react";

type SetRightComponent = Dispatch<SetStateAction<ReactNode>>;

export const AppHeaderRightComponentContext =
  createContext<SetRightComponent | null>(null);

export function useAppHeaderRightComponent(rightComponent: ReactNode) {
  const setRightComponent = useContext(AppHeaderRightComponentContext);

  if (!setRightComponent) {
    throw new Error(
      "useAppHeaderRightComponent must be used within the app layout.",
    );
  }

  useEffect(() => {
    setRightComponent(rightComponent);

    return () => {
      setRightComponent((current) =>
        current === rightComponent ? null : current,
      );
    };
  }, [rightComponent, setRightComponent]);
}
