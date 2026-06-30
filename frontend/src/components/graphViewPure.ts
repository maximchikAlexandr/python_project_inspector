

export const GRAPH_WIDTH = 1600;
export const GRAPH_HEIGHT = 860;
const MIN_EDGE_STROKE = 0.9;
const MAX_EDGE_STROKE = 3;
const CAMERA_PADDING = 140;
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.18;
export const INITIAL_VIEWBOX = `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`;
export const MIN_NODE_RADIUS = 34;

export type ViewBox = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export function edgeStrokeWidth(points: number, scale = 1): number {
  const base = MIN_EDGE_STROKE + Math.min(MAX_EDGE_STROKE - MIN_EDGE_STROKE, Math.max(points, 0) / 18);
  return base * scale;
}

export function edgeCurvePath(
  source: { x: number; y: number; radius: number },
  target: { x: number; y: number; radius: number },
  offset: number,
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;
  const startX = source.x + ux * (source.radius + 1.5);
  const startY = source.y + uy * (source.radius + 1.5);
  const endX = target.x - ux * (target.radius + 4);
  const endY = target.y - uy * (target.radius + 4);
  const cx = (startX + endX) / 2 + nx * offset;
  const cy = (startY + endY) / 2 + ny * offset;
  return `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
}

export function clampZoom(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function computeTargetViewBox(
  positions: Map<string, { x: number; y: number; radius: number }>,
  zoomScale: number,
  manualPanX: number,
  manualPanY: number,
): ViewBox {
  if (!positions.size) {
    return { x: 0, y: 0, w: GRAPH_WIDTH, h: GRAPH_HEIGHT };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = MIN_NODE_RADIUS;
  for (const point of positions.values()) {
    minX = Math.min(minX, point.x - point.radius);
    maxX = Math.max(maxX, point.x + point.radius);
    minY = Math.min(minY, point.y - point.radius);
    maxY = Math.max(maxY, point.y + point.radius);
    maxRadius = Math.max(maxRadius, point.radius);
  }
  const padding = maxRadius + CAMERA_PADDING;
  let targetX = minX - padding;
  let targetY = minY - padding;
  let targetW = Math.max(GRAPH_WIDTH, maxX - minX + padding * 2);
  let targetH = Math.max(GRAPH_HEIGHT, maxY - minY + padding * 2);
  if (targetW === GRAPH_WIDTH) {
    targetX = (minX + maxX) / 2 - targetW / 2;
  }
  if (targetH === GRAPH_HEIGHT) {
    targetY = (minY + maxY) / 2 - targetH / 2;
  }
  const centerX = targetX + targetW / 2;
  const centerY = targetY + targetH / 2;
  targetW /= zoomScale;
  targetH /= zoomScale;
  targetX = centerX - targetW / 2 + manualPanX;
  targetY = centerY - targetH / 2 + manualPanY;
  return { x: targetX, y: targetY, w: targetW, h: targetH };
}
