import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CommitRow, FileSnapshot, GraphEdge, GraphNode } from "../api/client";
import { layoutNodesToMap, pinnedFromLayout, type LayoutNodePosition } from "../domain/layoutCodec";
import { commitPositionLabel } from "../transforms/snapshotTransforms";
import type {
  LayoutCommandKind,
  TimelapseAction,
  ZoomCommandKind,
} from "./GraphSettingsPanel";
import { applyGraphFilters, maxEffectiveEdgeScore } from "./graphSelectors";
import { useGraphLayoutStore } from "./useGraphLayoutStore";
import { useGraphSettings } from "./useGraphSettings";
import { graphBreakdownKindMeta } from "../registry/odooProfile";

type LayoutNodeMap = Map<string, LayoutNodePosition>;

type Args = {
  readonly commits: readonly CommitRow[];
  readonly selectedCommit: string | null;
  readonly setSelectedCommit: (commit: string | null | ((current: string | null) => string | null)) => void;
  readonly graphNodes: readonly GraphNode[];
  readonly graphEdges: readonly GraphEdge[];
  readonly selectedModule: string | null;
  readonly setSelectedModule: (moduleName: string | null) => void;
  readonly setSelectedFile: (file: FileSnapshot | null) => void;
  readonly setHoveredFile: (file: FileSnapshot | null) => void;
  readonly projectKey: string | null;
  readonly loadingGraph: boolean;
  readonly setFocusNotice: (notice: string | null) => void;
};

function nextTimelapseState({
  action,
  commits,
  selectedCommit,
  playing,
  speed,
}: {
  readonly action: TimelapseAction;
  readonly commits: readonly CommitRow[];
  readonly selectedCommit: string | null;
  readonly playing: boolean;
  readonly speed: number;
}): { readonly playing: boolean; readonly speed: number; readonly selectedCommit: string | null } {
  if (action.kind === "play") {
    return { playing: true, speed, selectedCommit };
  }
  if (action.kind === "pause") {
    return { playing: false, speed, selectedCommit };
  }
  if (action.kind === "speed") {
    return { playing, speed: action.speed, selectedCommit };
  }
  const index = commits.findIndex((row) => row.commit_hash === selectedCommit);
  if (action.kind === "prev" && index > 0) {
    return { playing, speed, selectedCommit: commits[index - 1].commit_hash };
  }
  if (action.kind === "next" && index >= 0 && index < commits.length - 1) {
    return { playing, speed, selectedCommit: commits[index + 1].commit_hash };
  }
  if (action.kind === "next" && index >= commits.length - 1) {
    return { playing: false, speed, selectedCommit };
  }
  return { playing, speed, selectedCommit };
}

export function useSnapshotGraphExplorer({
  commits,
  selectedCommit,
  setSelectedCommit,
  graphNodes,
  graphEdges,
  selectedModule,
  setSelectedModule,
  setSelectedFile,
  setHoveredFile,
  projectKey,
  loadingGraph,
  setFocusNotice,
}: Args) {
  const {
    settings,
    setFilter,
    setDisplay,
    setForce,
    setSectionsExpanded,
    resetForces,
    resetAll,
    saveNotice,
  } = useGraphSettings();
  const focusModuleRef = useRef(settings.filter.focusModule);
  focusModuleRef.current = settings.filter.focusModule;
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches,
  );
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const [initialLayout, setInitialLayout] = useState<LayoutNodeMap | undefined>();
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const [timelapsePlaying, setTimelapsePlaying] = useState(false);
  const [timelapseSpeed, setTimelapseSpeed] = useState(1000);
  const [layoutCommand, setLayoutCommand] = useState<{
    kind: LayoutCommandKind;
    nonce: number;
  } | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{ kind: ZoomCommandKind; nonce: number } | null>(null);
  const layoutNonce = useRef(0);
  const zoomNonce = useRef(0);

  const { loadLayout, saveLayout, deleteLayout, saveNotice: layoutSaveNotice } = useGraphLayoutStore(
    projectKey,
    selectedCommit,
  );

  const filterResult = useMemo(
    () => applyGraphFilters(graphNodes, graphEdges, settings.filter, selectedModule),
    [graphEdges, graphNodes, selectedModule, settings.filter],
  );

  const emptyNotice = useMemo(() => {
    if (filterResult.noKindsSelected) {
      return "no_kinds" as const;
    }
    if (filterResult.allEdgesBelowThreshold) {
      return "below_threshold" as const;
    }
    if (filterResult.noNeighborsMatch) {
      return "no_neighbors" as const;
    }
    return null;
  }, [filterResult]);

  const edgeKindMeta = useMemo(() => graphBreakdownKindMeta(graphEdges), [graphEdges]);

  const maxEffectiveScore = useMemo(
    () => maxEffectiveEdgeScore(graphEdges, settings.filter.enabledEdgeKinds),
    [graphEdges, settings.filter.enabledEdgeKinds],
  );

  const commitLabel = useMemo(
    () => commitPositionLabel(commits, selectedCommit),
    [commits, selectedCommit],
  );

  const panelSaveNotice = saveNotice ?? layoutSaveNotice ?? layoutNotice;

  const resetLayoutState = useCallback(() => {
    setLayoutNotice(null);
    setInitialLayout(undefined);
    setPinned({});
  }, []);

  const applySavedLayout = useCallback((): boolean => {
    const layout = loadLayout();
    if (!layout?.nodes || Object.keys(layout.nodes).length === 0) {
      setLayoutNotice("No saved layout for this commit.");
      return false;
    }
    setLayoutNotice(null);
    setInitialLayout(layoutNodesToMap(layout.nodes));
    setPinned(pinnedFromLayout(layout.nodes));
    return true;
  }, [loadLayout]);

  useEffect(() => {
    const focusModule = settings.filter.focusModule;
    if (!focusModule || loadingGraph || graphNodes.length === 0) {
      return;
    }
    if (graphNodes.some((node) => node.module_name === focusModule)) {
      return;
    }
    setFilter({ focusEnabled: false, focusModule: null });
    setSelectedModule(null);
    setFocusNotice(`Focused module "${focusModule}" is not present at this commit. Focus cleared.`);
  }, [graphNodes, loadingGraph, setFilter, setFocusNotice, setSelectedModule, settings.filter.focusModule]);

  useEffect(() => {
    if (!timelapsePlaying || !selectedCommit || commits.length < 2) {
      return;
    }
    const index = commits.findIndex((row) => row.commit_hash === selectedCommit);
    if (index < 0 || index >= commits.length - 1) {
      setTimelapsePlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setSelectedCommit((current) => {
        const currentIndex = commits.findIndex((row) => row.commit_hash === current);
        if (currentIndex < 0 || currentIndex >= commits.length - 1) {
          setTimelapsePlaying(false);
          return current;
        }
        return commits[currentIndex + 1].commit_hash;
      });
    }, timelapseSpeed);
    return () => window.clearInterval(timer);
  }, [commits, selectedCommit, setSelectedCommit, timelapsePlaying, timelapseSpeed]);

  const onSelectModule = useCallback(
    (name: string | null) => {
      setSelectedModule(name);
      setSelectedFile(null);
      setHoveredFile(null);
      setFilter({ focusModule: name });
    },
    [setFilter, setHoveredFile, setSelectedFile, setSelectedModule],
  );

  const onClearFocus = useCallback(() => {
    setFilter({ focusEnabled: false, focusModule: null });
    setFocusNotice(null);
  }, [setFilter, setFocusNotice]);

  const onTogglePin = useCallback((moduleName: string) => {
    setPinned((current) => ({ ...current, [moduleName]: !current[moduleName] }));
  }, []);

  const onPinSelected = useCallback(() => {
    if (selectedModule) {
      onTogglePin(selectedModule);
    }
  }, [onTogglePin, selectedModule]);

  const onZoom = useCallback((kind: ZoomCommandKind) => {
    zoomNonce.current += 1;
    setZoomCommand({ kind, nonce: zoomNonce.current });
  }, []);

  const onLayout = useCallback(
    (kind: LayoutCommandKind) => {
      if (kind === "load" && !applySavedLayout()) {
        return;
      }
      layoutNonce.current += 1;
      setLayoutCommand({ kind, nonce: layoutNonce.current });
      if (kind === "reset") {
        deleteLayout();
        setInitialLayout(undefined);
        setPinned({});
      }
      if (kind === "save") {
        setLayoutNotice(null);
      }
      if (kind === "unpinAll") {
        setPinned({});
      }
    },
    [applySavedLayout, deleteLayout],
  );

  const onLayoutSnapshot = useCallback(
    (nodes: Readonly<Record<string, LayoutNodePosition>>) => {
      if (saveLayout(nodes)) {
        setInitialLayout(layoutNodesToMap(nodes));
      }
    },
    [saveLayout],
  );

  const onTimelapse = useCallback(
    (action: TimelapseAction) => {
      const next = nextTimelapseState({
        action,
        commits,
        selectedCommit,
        playing: timelapsePlaying,
        speed: timelapseSpeed,
      });
      setTimelapsePlaying(next.playing);
      setTimelapseSpeed(next.speed);
      if (next.selectedCommit !== selectedCommit) {
        setSelectedCommit(next.selectedCommit);
      }
    },
    [commits, selectedCommit, setSelectedCommit, timelapsePlaying, timelapseSpeed],
  );

  const onResetAll = useCallback(() => {
    resetAll();
    setSelectedModule(null);
  }, [resetAll, setSelectedModule]);

  return {
    settings,
    setFilter,
    setDisplay,
    setForce,
    setSectionsExpanded,
    resetForces,
    focusModuleRef,
    filterResult,
    emptyNotice,
    edgeKindMeta,
    maxEffectiveScore,
    selectedCommitDisabled: timelapsePlaying,
    graphPanelProps: {
      settings,
      setDisplay,
      setFilter,
      setForce,
      setSectionsExpanded,
      resetForces,
      onResetAll,
      onZoom,
      onLayout,
      onClearFocus,
      onPinSelected,
      panelCollapsed,
      onToggleCollapsed: () => setPanelCollapsed((value) => !value),
      panelSaveNotice,
      commitLabel,
      timelapse: { playing: timelapsePlaying, speed: timelapseSpeed },
      onTimelapse,
      pinned,
      onTogglePin,
      layoutCommand,
      onLayoutSnapshot,
      zoomCommand,
      initialLayout,
    },
    onSelectModule,
    resetLayoutState,
  };
}
