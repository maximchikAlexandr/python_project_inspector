import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppTab = "snapshot" | "dashboard" | "tables";

type AppNavigation = {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  selectedCommit: string | null;
  setSelectedCommit: (
    commit: string | null | ((current: string | null) => string | null),
  ) => void;
};

const NavigationContext = createContext<AppNavigation | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<AppTab>("snapshot");
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  const value = useMemo(
    () => ({ activeTab, setActiveTab, selectedCommit, setSelectedCommit }),
    [activeTab, selectedCommit],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useAppNavigation(): AppNavigation {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useAppNavigation must be used within NavigationProvider");
  }
  return context;
}
