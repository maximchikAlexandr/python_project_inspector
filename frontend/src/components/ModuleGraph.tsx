import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Button, Group } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, GraphNode } from "../api/client";
import {
  computeNodeBrightnessMap,
  lineCategoryTotal,
  type BrightnessCriterion,
  type LineCategoryKey,
} from "../registry/odooProfile";

type SimNode = SimulationNodeDatum & {
  id: string;
  node: GraphNode;
  radius: number;
};

type SimLink = SimulationLinkDatum<SimNode> & {
  edge: GraphEdge;
  reverse: boolean;
  offset: number;
};

type ViewTransform = {
  x: number;
  y: number;
  k: number;
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lineCategories: Set<LineCategoryKey>;
  brightnessCriteria: Set<BrightnessCriterion>;
  selectedModule: string | null;
  onSelectModule: (name: string | null) => void;
};

const WIDTH = 900;
const HEIGHT = 520;

function colorForBrightness(value: number): string {
  const channel = Math.round(80 + value * 175);
  return `rgb(${channel}, ${Math.round(channel * 0.6)}, ${255 - channel})`;
}

function linkEndpointId(value: string | number | SimNode): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value.id;
}

function clientPoint(event: React.MouseEvent | MouseEvent, svg: SVGSVGElement): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
  };
}

export function ModuleGraph({
  nodes,
  edges,
  lineCategories,
  brightnessCriteria,
  selectedModule,
  onSelectModule,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; viewX: number; viewY: number } | null>(
    null,
  );

  const brightnessById = useMemo(
    () => computeNodeBrightnessMap(nodes, brightnessCriteria),
    [brightnessCriteria, nodes],
  );

  const simNodes: SimNode[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.module_name,
        node,
        radius: Math.max(8, Math.sqrt(lineCategoryTotal(node.line_categories, lineCategories)) / 4),
      })),
    [lineCategories, nodes],
  );

  const simLinks: SimLink[] = useMemo(() => {
    const edgeKeys = new Set(edges.map((edge) => `${edge.source}|${edge.target}`));
    return edges.map((edge) => {
      const reverse = edgeKeys.has(`${edge.target}|${edge.source}`);
      const offset = reverse && edge.source > edge.target ? 18 : reverse ? -18 : 0;
      return {
        source: edge.source,
        target: edge.target,
        edge,
        reverse,
        offset,
      };
    });
  }, [edges]);

  useEffect(() => {
    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((node) => node.id)
          .distance((link) => Math.max(40, 120 - link.edge.breakdown.total * 4))
          .strength((link) => Math.min(1, 0.15 + link.edge.breakdown.total * 0.05)),
      )
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .stop();
    for (let step = 0; step < 300; step += 1) {
      simulation.tick();
    }
    setPositions(new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
  }, [simLinks, simNodes]);

  const fitView = useCallback(() => {
    if (!positions.size) {
      setView({ x: 0, y: 0, k: 1 });
      return;
    }
    const xs = [...positions.values()].map((point) => point.x);
    const ys = [...positions.values()].map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 40;
    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const scale = Math.min(
      (WIDTH - padding * 2) / contentWidth,
      (HEIGHT - padding * 2) / contentHeight,
      2,
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setView({
      k: scale,
      x: WIDTH / 2 - centerX * scale,
      y: HEIGHT / 2 - centerY * scale,
    });
  }, [positions]);

  useEffect(() => {
    fitView();
  }, [fitView, nodes, edges]);

  function toGraphPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!svgRef.current) {
      return null;
    }
    const point = clientPoint({ clientX, clientY } as React.MouseEvent, svgRef.current);
    return {
      x: (point.x - view.x) / view.k,
      y: (point.y - view.y) / view.k,
    };
  }

  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const point = clientPoint(event, event.currentTarget);
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    setView((current) => {
      const nextK = Math.min(3, Math.max(0.2, current.k * factor));
      return {
        k: nextK,
        x: point.x - ((point.x - current.x) / current.k) * nextK,
        y: point.y - ((point.y - current.y) / current.k) * nextK,
      };
    });
  }

  function onBackgroundMouseDown(event: React.MouseEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    setPanning({ startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y });
  }

  function onMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (panning) {
      const dx = event.clientX - panning.startX;
      const dy = event.clientY - panning.startY;
      setView((current) => ({ ...current, x: panning.viewX + dx, y: panning.viewY + dy }));
      return;
    }
    if (draggingId) {
      const point = toGraphPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      setPositions((current) => {
        const next = new Map(current);
        next.set(draggingId, point);
        return next;
      });
    }
  }

  function onMouseUp() {
    setPanning(null);
    setDraggingId(null);
  }

  return (
    <div>
      <Group mb="xs">
        <Button size="xs" variant="light" onClick={() => setView((current) => ({ ...current, k: current.k * 1.2 }))}>
          Zoom in
        </Button>
        <Button size="xs" variant="light" onClick={() => setView((current) => ({ ...current, k: current.k / 1.2 }))}>
          Zoom out
        </Button>
        <Button size="xs" variant="light" onClick={fitView}>
          Fit
        </Button>
      </Group>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ border: "1px solid var(--mantine-color-gray-3)", background: "#fafafa", cursor: panning ? "grabbing" : "default" }}
        onClick={() => onSelectModule(null)}
        onWheel={onWheel}
        onMouseDown={onBackgroundMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect
            width={WIDTH}
            height={HEIGHT}
            fill="transparent"
            onMouseDown={(event) => {
              setPanning({
                startX: event.clientX,
                startY: event.clientY,
                viewX: view.x,
                viewY: view.y,
              });
            }}
          />
          {simLinks.map((link) => {
            const sourceId = linkEndpointId(link.source);
            const targetId = linkEndpointId(link.target);
            const source = positions.get(sourceId);
            const target = positions.get(targetId);
            if (!source || !target) {
              return null;
            }
            const thickness = Math.max(1, link.edge.breakdown.total);
            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const length = Math.hypot(dx, dy) || 1;
            const nx = (-dy / length) * link.offset;
            const ny = (dx / length) * link.offset;
            const path = `M ${source.x} ${source.y} Q ${mx + nx} ${my + ny - 20} ${target.x} ${target.y}`;
            return (
              <path
                key={`${sourceId}-${targetId}`}
                d={path}
                fill="none"
                stroke="#666"
                strokeWidth={thickness}
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
            </marker>
          </defs>
          {simNodes.map((simNode) => {
            const pos = positions.get(simNode.id);
            if (!pos) {
              return null;
            }
            const fill = brightnessCriteria.size
              ? colorForBrightness(brightnessById.get(simNode.id) ?? 0)
              : "#adb5bd";
            const stroke = selectedModule === simNode.id ? "#228be6" : "#495057";
            return (
              <g
                key={simNode.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: "grab" }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setDraggingId(simNode.id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectModule(simNode.id);
                }}
              >
                <circle r={simNode.radius} fill={fill} stroke={stroke} strokeWidth={selectedModule === simNode.id ? 3 : 1} />
                <text textAnchor="middle" dy={simNode.radius + 12} fontSize={10} fill="#212529">
                  {simNode.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
