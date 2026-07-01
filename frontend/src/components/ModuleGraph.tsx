import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Text } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, GraphNode } from "../api/client";
import { lineCategoryTotal, textColorForComplexityRatio } from "../registry/odooProfile";
import { formatCodeLines } from "../utils/metricFormat";
import type { GraphDisplayState, GraphForceState } from "./graphSettingsTypes";
import type { LayoutCommandKind, ZoomCommandKind } from "./GraphSettingsPanel";
import type { LayoutNodePosition } from "../domain/layoutCodec";
import { buildModuleGraphViewModel } from "./graphViewModel";
import type { GraphEdgeViewModel } from "./graphSelectors";
import { buildEdgeTooltip, buildNodeTooltip } from "./tooltipViewModel";
import {
  clampZoom,
  computeTargetViewBox,
  edgeCurvePath,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  INITIAL_VIEWBOX,
  MIN_NODE_RADIUS,
  type ViewBox,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "./graphViewPure";

type SimNode = SimulationNodeDatum & {
  id: string;
  node: GraphNode;
  radius: number;
};

type SimLink = SimulationLinkDatum<SimNode> & {
  edge: GraphEdge;
  key: string;
  sourceId: string;
  targetId: string;
  offset: number;
  display: GraphEdgeViewModel["display"];
};

type PositionCache = Map<string, { x: number; y: number; vx?: number; vy?: number }>;
type LayoutMap = Map<string, { x: number; y: number; pinned: boolean }>;
type FadeState = { enabled: boolean; highlight: Set<string>; edgeKeys: Set<string> };

type ModuleGraphProps = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly display: GraphDisplayState;
  readonly force: GraphForceState;
  readonly enabledEdgeKinds: Readonly<Record<string, boolean>>;
  readonly brightnessCriteria: ReadonlySet<string>;
  readonly lineCategories: ReadonlySet<string>;
  readonly selectedModule: string | null;
  readonly onSelectModule: (name: string | null) => void;
  readonly pinned: Readonly<Record<string, boolean>>;
  readonly onTogglePin: (moduleName: string) => void;
  readonly layoutCommand: { readonly kind: LayoutCommandKind; readonly nonce: number } | null;
  readonly onLayoutSnapshot?: (nodes: Readonly<Record<string, LayoutNodePosition>>) => void;
  readonly zoomCommand: { readonly kind: ZoomCommandKind; readonly nonce: number } | null;
  readonly loading?: boolean;
  readonly emptyNotice?: "no_kinds" | "below_threshold" | "no_neighbors" | null;
  readonly initialLayout?: LayoutMap;
};

const CAMERA_LERP = 0.18;
const FADE_OPACITY = 0.2;
const FADE_MS = 150;
const DRAG_CLICK_THRESHOLD = 4;

const EMPTY_NOTICE_TEXT: Record<NonNullable<ModuleGraphProps["emptyNotice"]>, string> = {
  no_kinds: "No relationship kinds selected",
  below_threshold: "All edges below threshold",
  no_neighbors: "No neighbors match focus criteria",
};

function linkEndpointId(value: string | number | SimNode): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value.id;
}

function randomSeed(): { x: number; y: number; vx: number; vy: number } {
  return {
    x: GRAPH_WIDTH / 2 + (Math.random() - 0.5) * 80,
    y: GRAPH_HEIGHT / 2 + (Math.random() - 0.5) * 80,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
  };
}

function computeFadeState({
  enabled,
  hoveredEdgeKey,
  hoveredId,
  links,
}: {
  enabled: boolean;
  hoveredEdgeKey: string | null;
  hoveredId: string | null;
  links: SimLink[];
}): FadeState {
  const highlight = new Set<string>();
  const edgeKeys = new Set<string>();
  if (!enabled) {
    return { enabled, highlight, edgeKeys };
  }
  if (hoveredEdgeKey) {
    edgeKeys.add(hoveredEdgeKey);
    const link = links.find((item) => item.key === hoveredEdgeKey);
    if (link) {
      highlight.add(linkEndpointId(link.source));
      highlight.add(linkEndpointId(link.target));
    }
    return { enabled, highlight, edgeKeys };
  }
  if (hoveredId) {
    highlight.add(hoveredId);
    for (const link of links) {
      const sourceId = linkEndpointId(link.source);
      const targetId = linkEndpointId(link.target);
      if (sourceId === hoveredId) {
        highlight.add(targetId);
      }
      if (targetId === hoveredId) {
        highlight.add(sourceId);
      }
    }
  }
  return { enabled, highlight, edgeKeys };
}

function buildSimNodes({
  nodes,
  previous,
  cache,
  initialLayout,
  pinned,
  radii,
  seed,
}: {
  nodes: readonly GraphNode[];
  previous: Map<string, SimNode>;
  cache: PositionCache;
  initialLayout?: LayoutMap;
  pinned: Readonly<Record<string, boolean>>;
  radii: ReadonlyMap<string, number>;
  seed: () => { x: number; y: number; vx: number; vy: number };
}): SimNode[] {
  return nodes.map((node) => {
    const id = node.module_name;
    const prev = previous.get(id);
    const cached = cache.get(id);
    const saved = initialLayout?.get(id);
    const seeded = seed();
    const x = prev?.x ?? cached?.x ?? saved?.x ?? seeded.x;
    const y = prev?.y ?? cached?.y ?? saved?.y ?? seeded.y;
    const isPinned = !!pinned[id] || !!saved?.pinned;
    return {
      id,
      node,
      radius: radii.get(id) ?? MIN_NODE_RADIUS,
      x,
      y,
      vx: prev?.vx ?? cached?.vx ?? seeded.vx,
      vy: prev?.vy ?? cached?.vy ?? seeded.vy,
      fx: isPinned ? x : null,
      fy: isPinned ? y : null,
    };
  });
}

export function ModuleGraph({
  nodes,
  edges,
  display,
  force,
  enabledEdgeKinds,
  lineCategories,
  selectedModule,
  onSelectModule,
  pinned,
  onTogglePin,
  layoutCommand,
  onLayoutSnapshot,
  zoomCommand,
  loading = false,
  emptyNotice = null,
  initialLayout,
}: ModuleGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const linkPathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const nodeGroupRefs = useRef<Map<string, SVGGElement>>(new Map());
  const positionsRef = useRef<Map<string, { x: number; y: number; radius: number }>>(new Map());
  const positionCacheRef = useRef<PositionCache>(new Map());
  const processedLayoutNonceRef = useRef(0);
  const labelFadeThresholdRef = useRef(display.labelFadeThreshold);
  labelFadeThresholdRef.current = display.labelFadeThreshold;
  const viewBoxRef = useRef<ViewBox>({ x: 0, y: 0, w: GRAPH_WIDTH, h: GRAPH_HEIGHT });
  const radiusByIdRef = useRef<ReadonlyMap<string, number>>(new Map());
  const zoomScaleRef = useRef(1);
  const manualPanRef = useRef({ x: 0, y: 0 });
  const fadeRef = useRef({ enabled: false, highlight: new Set<string>(), edgeKeys: new Set<string>() });
  const nodePointerRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  const vm = useMemo(
    () => buildModuleGraphViewModel(nodes, edges, display, enabledEdgeKinds, lineCategories, selectedModule, hoveredId, display.labelFadeThreshold > 0 ? zoomScale : 1),
    [nodes, edges, display, enabledEdgeKinds, lineCategories, selectedModule, hoveredId, zoomScale],
  );

  useEffect(() => {
    radiusByIdRef.current = vm.nodeRadiiById;
  }, [vm.nodeRadiiById]);

  const simLinks: SimLink[] = useMemo(
    () =>
      vm.edgeViews.map((view) => ({
        source: view.sourceId,
        target: view.targetId,
        edge: view.edge,
        key: view.key,
        sourceId: view.sourceId,
        targetId: view.targetId,
        offset: view.offset,
        display: view.display,
      })),
    [vm.edgeViews],
  );

  useEffect(() => {
    simLinksRef.current = simLinks;
  }, [simLinks]);

  const nodeSignature = useMemo(() => nodes.map((node) => node.module_name).join(","), [nodes]);

  const applyFadeOpacity = useCallback(() => {
    const { enabled, highlight, edgeKeys } = fadeRef.current;
    const active = enabled && (highlight.size > 0 || edgeKeys.size > 0);
    const transition = active ? `opacity ${FADE_MS}ms ease` : "";
    for (const [id, group] of nodeGroupRefs.current) {
      group.style.opacity = String(!active || highlight.has(id) ? 1 : FADE_OPACITY);
      group.style.transition = transition;
    }
    for (const link of simLinksRef.current) {
      const sourceId = linkEndpointId(link.source);
      const targetId = linkEndpointId(link.target);
      const pathEl = linkPathRefs.current.get(link.key);
      if (!pathEl) {
        continue;
      }
      const lit = !active || edgeKeys.has(link.key) || highlight.has(sourceId) || highlight.has(targetId);
      pathEl.style.opacity = String(lit ? 1 : FADE_OPACITY);
      pathEl.style.transition = transition;
    }
  }, []);

  useEffect(() => {
    fadeRef.current = computeFadeState({
      enabled: display.fadeNonNeighbors,
      hoveredEdgeKey,
      hoveredId,
      links: simLinksRef.current,
    });
    applyFadeOpacity();
  }, [applyFadeOpacity, display.fadeNonNeighbors, hoveredEdgeKey, hoveredId]);

  const syncGraphDom = useCallback((layoutNodes: SimNode[]) => {
    const positions = new Map(
      layoutNodes.map((node) => [
        node.id,
        { x: node.x ?? 0, y: node.y ?? 0, radius: node.radius },
      ]),
    );
    positionsRef.current = positions;
    for (const node of layoutNodes) {
      positionCacheRef.current.set(node.id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        vx: node.vx,
        vy: node.vy,
      });
    }
    for (const link of simLinksRef.current) {
      const sourceId = linkEndpointId(link.source);
      const targetId = linkEndpointId(link.target);
      const pathEl = linkPathRefs.current.get(link.key);
      const source = positions.get(sourceId);
      const target = positions.get(targetId);
      if (!pathEl || !source || !target) {
        continue;
      }
      const sourceRadius = source.radius || radiusByIdRef.current.get(sourceId) || MIN_NODE_RADIUS;
      const targetRadius = target.radius || radiusByIdRef.current.get(targetId) || MIN_NODE_RADIUS;
      pathEl.setAttribute(
        "d",
        edgeCurvePath(
          { x: source.x, y: source.y, radius: sourceRadius },
          { x: target.x, y: target.y, radius: targetRadius },
          link.offset,
        ),
      );
    }
    for (const node of layoutNodes) {
      const group = nodeGroupRefs.current.get(node.id);
      if (group) {
        group.setAttribute("transform", `translate(${node.x ?? 0}, ${node.y ?? 0})`);
      }
    }
    if (fadeRef.current.enabled) {
      applyFadeOpacity();
    }
  }, [applyFadeOpacity]);

  const buildLinkForce = useCallback(
    () =>
      forceLink<SimNode, SimLink>(simLinksRef.current)
        .id((node) => node.id)
        .distance((link) =>
          Math.max(40, force.linkDistance - Math.min(18, (link.edge.breakdown?.total ?? 0) * 0.9)),
        )
        .strength((link) => Math.min(1, force.linkStrength + (link.edge.breakdown?.total ?? 0) * 0.05)),
    [force.linkDistance, force.linkStrength],
  );

  const applyInitialLayout = useCallback(() => {
    if (!initialLayout?.size) {
      return;
    }
    const layoutNodes = nodesRef.current;
    for (const node of layoutNodes) {
      const pos = initialLayout.get(node.id);
      if (!pos) {
        continue;
      }
      node.x = pos.x;
      node.y = pos.y;
      if (pos.pinned || pinned[node.id]) {
        node.fx = pos.x;
        node.fy = pos.y;
      }
    }
    simulationRef.current?.alpha(0.3).restart();
    syncGraphDom(layoutNodes);
  }, [initialLayout, pinned, syncGraphDom]);

  useEffect(() => {
    const prevById = new Map(nodesRef.current.map((node) => [node.id, node]));
    const layoutNodes = buildSimNodes({
      nodes,
      previous: prevById,
      cache: positionCacheRef.current,
      initialLayout,
      pinned,
      radii: radiusByIdRef.current,
      seed: randomSeed,
    });
    nodesRef.current = layoutNodes;
    simulationRef.current?.stop();
    const simulation = forceSimulation(layoutNodes)
      .force("link", buildLinkForce())
      .force("charge", forceManyBody().strength(force.repelStrength))
      .force("center", forceCenter(GRAPH_WIDTH / 2, GRAPH_HEIGHT / 2).strength(force.centerStrength))
      .force(
        "collide",
        forceCollide<SimNode>().radius((node) => node.radius + force.collidePadding),
      )
      .velocityDecay(force.velocityDecay)
      .alphaDecay(0.015)
      .alphaMin(0.001)
      .alphaTarget(0.02);
    simulation.on("tick", () => syncGraphDom(layoutNodes));
    simulationRef.current = simulation;
    syncGraphDom(layoutNodes);
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [buildLinkForce, force.centerStrength, force.collidePadding, force.repelStrength, force.velocityDecay, nodeSignature, syncGraphDom]);

  useEffect(() => {
    const simulation = simulationRef.current;
    const layoutNodes = nodesRef.current;
    if (!simulation || !layoutNodes.length) {
      return;
    }
    for (const node of layoutNodes) {
      node.radius = radiusByIdRef.current.get(node.id) ?? MIN_NODE_RADIUS;
      if (pinned[node.id]) {
        node.fx = node.x ?? node.fx ?? null;
        node.fy = node.y ?? node.fy ?? null;
      }
    }
    simulation
      .force("collide", forceCollide<SimNode>().radius((node) => node.radius + force.collidePadding))
      .alpha(0.15)
      .restart();
    syncGraphDom(layoutNodes);
  }, [force.collidePadding, vm.nodeRadiiById, pinned, syncGraphDom]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }
    simulation
      .force("link", buildLinkForce())
      .force("charge", forceManyBody().strength(force.repelStrength))
      .force("center", forceCenter(GRAPH_WIDTH / 2, GRAPH_HEIGHT / 2).strength(force.centerStrength))
      .force(
        "collide",
        forceCollide<SimNode>().radius((node) => node.radius + force.collidePadding),
      )
      .velocityDecay(force.velocityDecay)
      .alpha(0.3)
      .restart();
  }, [buildLinkForce, force, simLinks]);

  useEffect(() => {
    for (const node of nodesRef.current) {
      if (pinned[node.id]) {
        node.fx = node.x ?? node.fx ?? null;
        node.fy = node.y ?? node.fy ?? null;
      } else if (!draggingId || draggingId !== node.id) {
        node.fx = null;
        node.fy = null;
      }
    }
  }, [draggingId, pinned]);

  useEffect(() => {
    if (!layoutCommand) {
      return;
    }
    if (processedLayoutNonceRef.current === layoutCommand.nonce) {
      return;
    }
    processedLayoutNonceRef.current = layoutCommand.nonce;
    const layoutNodes = nodesRef.current;
    const simulation = simulationRef.current;
    if (layoutCommand.kind === "restart") {
      simulation?.alpha(1).restart();
      return;
    }
    if (layoutCommand.kind === "reset") {
      for (const node of layoutNodes) {
        const seed = randomSeed();
        node.x = seed.x;
        node.y = seed.y;
        node.vx = seed.vx;
        node.vy = seed.vy;
        node.fx = null;
        node.fy = null;
      }
      simulation?.alpha(1).restart();
      syncGraphDom(layoutNodes);
      return;
    }
    if (layoutCommand.kind === "save") {
      if (onLayoutSnapshot) {
        const snapshot: Record<string, { x: number; y: number; pinned: boolean }> = {};
        for (const node of layoutNodes) {
          snapshot[node.id] = {
            x: Math.round(node.x ?? 0),
            y: Math.round(node.y ?? 0),
            pinned: !!pinned[node.id],
          };
        }
        onLayoutSnapshot(snapshot);
      }
      return;
    }
    if (layoutCommand.kind === "load") {
      applyInitialLayout();
      return;
    }
    if (layoutCommand.kind === "unpinAll") {
      for (const node of layoutNodes) {
        node.fx = null;
        node.fy = null;
      }
    }
  }, [applyInitialLayout, layoutCommand, onLayoutSnapshot, pinned, syncGraphDom]);

  useEffect(() => {
    if (!zoomCommand) {
      return;
    }
    if (zoomCommand.kind === "in") {
      zoomScaleRef.current = clampZoom(zoomScaleRef.current * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    } else if (zoomCommand.kind === "out") {
      zoomScaleRef.current = clampZoom(zoomScaleRef.current / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    } else {
      manualPanRef.current = { x: 0, y: 0 };
      zoomScaleRef.current = 1;
    }
    setZoomScale(zoomScaleRef.current);
  }, [zoomCommand]);

  useEffect(() => {
    let active = true;
    let raf = 0;
    const loop = () => {
      if (!active) {
        return;
      }
      const target = computeTargetViewBox(
        positionsRef.current,
        zoomScaleRef.current,
        manualPanRef.current.x,
        manualPanRef.current.y,
      );
      const current = viewBoxRef.current;
      const viewBox = {
        x: current.x + (target.x - current.x) * CAMERA_LERP,
        y: current.y + (target.y - current.y) * CAMERA_LERP,
        w: current.w + (target.w - current.w) * CAMERA_LERP,
        h: current.h + (target.h - current.h) * CAMERA_LERP,
      };
      viewBoxRef.current = viewBox;
      svgRef.current?.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
      const effectiveZoom = viewBox.w > 0 ? GRAPH_WIDTH / viewBox.w : 1;
      if (labelFadeThresholdRef.current > 0) {
        setZoomScale((current) => (Math.abs(current - effectiveZoom) > 0.02 ? effectiveZoom : current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const clientToWorld = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const rect = svg.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return { x: vb.x + nx * vb.w, y: vb.y + ny * vb.h };
  }, []);

  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const screenWidth = svg.clientWidth || GRAPH_WIDTH;
    const screenHeight = svg.clientHeight || GRAPH_HEIGHT;
    const vb = viewBoxRef.current;
    manualPanRef.current = {
      x: manualPanRef.current.x + event.deltaX * (vb.w / screenWidth),
      y: manualPanRef.current.y + event.deltaY * (vb.h / screenHeight),
    };
    const effectiveZoom = vb.w > 0 ? GRAPH_WIDTH / vb.w : 1;
    setZoomScale(effectiveZoom);
  }

  function onBackgroundMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      panX: manualPanRef.current.x,
      panY: manualPanRef.current.y,
    });
  }

  function onMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (panning && svg) {
      const vb = viewBoxRef.current;
      const screenWidth = svg.clientWidth || GRAPH_WIDTH;
      const screenHeight = svg.clientHeight || GRAPH_HEIGHT;
      manualPanRef.current = {
        x: panning.panX - (event.clientX - panning.startX) * (vb.w / screenWidth),
        y: panning.panY - (event.clientY - panning.startY) * (vb.h / screenHeight),
      };
      return;
    }
    if (draggingId) {
      const point = clientToWorld(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      const pointer = nodePointerRef.current;
      if (pointer?.id === draggingId) {
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        if (Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD) {
          pointer.moved = true;
        }
      }
      const node = nodesRef.current.find((item) => item.id === draggingId);
      if (node) {
        node.fx = point.x;
        node.fy = point.y;
        simulationRef.current?.alpha(0.3).restart();
      }
    }
  }

  function onMouseUp() {
    if (draggingId) {
      const node = nodesRef.current.find((item) => item.id === draggingId);
      if (node) {
        if (pinned[node.id]) {
          node.fx = node.x ?? node.fx ?? null;
          node.fy = node.y ?? node.fy ?? null;
        } else {
          node.fx = null;
          node.fy = null;
          simulationRef.current?.alphaTarget(0.02).alpha(0.3).restart();
        }
      }
    }
    window.setTimeout(() => {
      if (nodePointerRef.current?.moved) {
        nodePointerRef.current = null;
      }
    }, 0);
    setPanning(null);
    setDraggingId(null);
  }

  const hideCanvas = emptyNotice === "no_kinds";
  const bannerNotice = emptyNotice && emptyNotice !== "no_kinds" ? EMPTY_NOTICE_TEXT[emptyNotice] : null;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ border: "1px solid var(--mantine-color-gray-3)", background: "#fafafa", overflow: "auto" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={INITIAL_VIEWBOX}
          style={{
            minWidth: 900,
            height: GRAPH_HEIGHT,
            display: "block",
            cursor: panning ? "grabbing" : "default",
            visibility: hideCanvas ? "hidden" : "visible",
          }}
          onClick={() => onSelectModule(null)}
          onWheel={onWheel}
          onMouseDown={onBackgroundMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
            </marker>
          </defs>
          <rect
            x={0}
            y={0}
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            fill="transparent"
            onMouseDown={(event) => {
              event.stopPropagation();
              setPanning({
                startX: event.clientX,
                startY: event.clientY,
                panX: manualPanRef.current.x,
                panY: manualPanRef.current.y,
              });
            }}
          />
          {simLinks.map((link) => {
            return (
              <g key={link.key}>
                <path
                  id={`edge-${link.key}`}
                  ref={(element) => {
                    if (element) {
                      linkPathRefs.current.set(link.key, element);
                    } else {
                      linkPathRefs.current.delete(link.key);
                    }
                  }}
                  d=""
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth={link.display.thickness}
                  markerEnd={display.showArrows ? "url(#arrow)" : undefined}
                  onMouseEnter={() => setHoveredEdgeKey(link.key)}
                  onMouseLeave={() => setHoveredEdgeKey((current) => (current === link.key ? null : current))}
                >
                  <title>{buildEdgeTooltip(link.edge)}</title>
                </path>
                {link.display.label ? (
                  <text fontSize={9} fill="#374151" pointerEvents="none">
                    <textPath href={`#edge-${link.key}`} startOffset="50%" textAnchor="middle">
                      {link.display.label}
                    </textPath>
                  </text>
                ) : null}
              </g>
            );
          })}
          {nodes.map((node) => {
            const id = node.module_name;
            const model = vm.nodeDisplayById.get(id)!;
            const visible = lineCategoryTotal(node.line_categories, lineCategories);
            const complexityRatio = 0;
            const isSelected = selectedModule === id;
            const isPinned = !!pinned[id];
            return (
              <g
                key={id}
                ref={(element) => {
                  if (element) {
                    nodeGroupRefs.current.set(id, element);
                    const layoutNode = nodesRef.current.find((item) => item.id === id);
                    if (layoutNode?.x != null && layoutNode?.y != null) {
                      element.setAttribute("transform", `translate(${layoutNode.x}, ${layoutNode.y})`);
                    }
                  } else {
                    nodeGroupRefs.current.delete(id);
                  }
                }}
                style={{ cursor: "grab" }}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId((current) => (current === id ? null : current))}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  nodePointerRef.current = {
                    id,
                    startX: event.clientX,
                    startY: event.clientY,
                    moved: false,
                  };
                  setDraggingId(id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (nodePointerRef.current?.id === id && nodePointerRef.current.moved) {
                    nodePointerRef.current = null;
                    return;
                  }
                  nodePointerRef.current = null;
                  onSelectModule(isSelected ? null : id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onTogglePin(id);
                }}
              >
                <title>{buildNodeTooltip(node, visible)}</title>
                <circle
                  r={model.radius}
                  fill={model.fill}
                  stroke={model.stroke}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                {!display.showNodeBadges && lineCategories.size > 0 ? (
                  <text
                    textAnchor="middle"
                    dy={4}
                    fontSize={Math.max(8, Math.min(12, model.radius * 0.45))}
                    fill={textColorForComplexityRatio(complexityRatio)}
                  >
                    {formatCodeLines(visible)}
                  </text>
                ) : null}
                {isPinned ? (
                  <circle r={5} cx={model.radius * 0.65} cy={-model.radius * 0.65} fill="#dc2626" stroke="#fff" strokeWidth={1} />
                ) : null}
                {model.label ? (
                  <text textAnchor="middle" dy={-(model.radius + 10)} fontSize={11} fill="#111827">
                    {model.label}
                  </text>
                ) : null}
                {model.badges ? (
                  <text textAnchor="middle" dy={model.radius + 14} fontSize={9} fill="#374151">
                    {`${model.badges.in}↓ ${model.badges.out}↑ · ${model.badges.files}f · ${model.badges.methods}m`}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {emptyNotice === "no_kinds" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fafafa",
          }}
        >
          <Text size="sm" c="dimmed">
            {EMPTY_NOTICE_TEXT.no_kinds}
          </Text>
        </div>
      ) : null}
      {bannerNotice ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "6px 12px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid var(--mantine-color-gray-3)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <Text size="sm" c="dimmed">
            {bannerNotice}
          </Text>
        </div>
      ) : null}
      {loading ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.72)",
          }}
        >
          <Text size="sm" c="dimmed">
            Loading graph…
          </Text>
        </div>
      ) : null}
    </div>
  );
}
