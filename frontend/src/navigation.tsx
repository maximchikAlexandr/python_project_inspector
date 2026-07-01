import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppTab = "snapshot" | "dashboard";

export type SnapshotTab = "lines" | "relations" | null;

type PendingSnapshot = {
  commitHash: string;
  tab: SnapshotTab | null;
};

type AppNavigation = {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  pendingSnapshot: PendingSnapshot | null;
  openSnapshot: (commitHash: string, snapshotTab?: SnapshotTab) => void;
  clearPendingSnapshot: () => void;
};

const NavigationContext = createContext<AppNavigation | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<AppTab>("snapshot");
  const [pendingSnapshot, setPendingSnapshot] = useState<PendingSnapshot | null>(null);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      pendingSnapshot,
      openSnapshot: (commitHash: string, snapshotTab?: SnapshotTab) => {
        setPendingSnapshot({ commitHash, tab: snapshotTab ?? null });
        setActiveTab("snapshot");
      },
      clearPendingSnapshot: () => setPendingSnapshot(null),
    }),
    [activeTab, pendingSnapshot],
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
