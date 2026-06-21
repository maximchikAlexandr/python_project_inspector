import { useCallback, useEffect, useState } from "react";

import {
  layoutStorageKey,
  tryDeleteLayout,
  tryLoadLayout,
  trySaveLayout,
  type PersistedLayout,
} from "./graphPersistence";

export function useGraphLayoutStore(projectOrRepo: string | null, commitHash: string | null) {
  const [saveDisabled, setSaveDisabled] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const key =
    projectOrRepo && commitHash ? layoutStorageKey(projectOrRepo, commitHash) : null;

  const loadLayout = useCallback((): PersistedLayout | null => {
    if (!key) {
      return null;
    }
    const result = tryLoadLayout(key);
    setSaveDisabled(result.saveDisabled);
    setSaveNotice(
      result.saveDisabled ? "Layout cannot be saved — browser storage is unavailable or full." : null,
    );
    return result.layout;
  }, [key]);

  const saveLayout = useCallback(
    (nodes: PersistedLayout["nodes"]): boolean => {
      if (!key) {
        setSaveNotice("Layout save unavailable — no project identifier.");
        return false;
      }
      const result = trySaveLayout(key, nodes);
      setSaveDisabled(result.saveDisabled);
      setSaveNotice(
        result.saveDisabled ? "Layout cannot be saved — browser storage is unavailable or full." : null,
      );
      return result.ok;
    },
    [key],
  );

  const deleteLayout = useCallback((): boolean => {
    if (!key) {
      return false;
    }
    return tryDeleteLayout(key);
  }, [key]);

  useEffect(() => {
    if (!key) {
      setSaveNotice(projectOrRepo === null ? "Layout save unavailable — no project identifier." : null);
    }
  }, [key, projectOrRepo]);

  return { loadLayout, saveLayout, deleteLayout, saveDisabled, saveNotice, layoutKey: key };
}
