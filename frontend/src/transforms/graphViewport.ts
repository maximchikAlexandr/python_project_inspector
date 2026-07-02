export const VIEWPORT_PADDING_RATIO_MIN = 0.3;
export const VIEWPORT_PADDING_RATIO_MAX = 0.5;

export type Position = { readonly x: number; readonly y: number; readonly radius?: number };

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export function anyNodeVisible(positions: ReadonlyMap<string, Position>, viewport: Rect): boolean {
  for (const pos of positions.values()) {
    if (nodeIntersectsRect(pos, viewport)) {
      return true;
    }
  }
  return false;
}

function nodeIntersectsRect(pos: Position, rect: Rect): boolean {
  const r = pos.radius ?? 0;
  return (
    pos.x + r >= rect.x &&
    pos.x - r <= rect.x + rect.w &&
    pos.y + r >= rect.y &&
    pos.y - r <= rect.y + rect.h
  );
}

export function paddedViewportBounds(
  graphBounds: Rect,
  viewport: Rect,
  ratio: number = VIEWPORT_PADDING_RATIO_MIN,
): Rect {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const padX = viewport.w * clampedRatio;
  const padY = viewport.h * clampedRatio;
  return {
    x: graphBounds.x - padX,
    y: graphBounds.y - padY,
    w: graphBounds.w + padX * 2,
    h: graphBounds.h + padY * 2,
  };
}

export function clampPanToBounds(
  pan: { x: number; y: number },
  graphBounds: Rect,
  viewport: Rect,
  ratio: number = VIEWPORT_PADDING_RATIO_MIN,
): { x: number; y: number } {
  const padded = paddedViewportBounds(graphBounds, viewport, ratio);
  const maxX = padded.x + padded.w - viewport.w;
  const minX = padded.x;
  const maxY = padded.y + padded.h - viewport.h;
  const minY = padded.y;
  return {
    x: Math.max(minX, Math.min(maxX, pan.x)),
    y: Math.max(minY, Math.min(maxY, pan.y)),
  };
}

export function viewportCenter(viewport: Rect): { x: number; y: number } {
  return { x: viewport.x + viewport.w / 2, y: viewport.y + viewport.h / 2 };
}
