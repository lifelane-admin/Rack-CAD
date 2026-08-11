// Renders a CloudConnector (see core/types.ts) — a freeform line between two cloud nodes, or a
// node and a bare point — into the 'cloud-connector-layer'. No ports/bend-points/manual anchors,
// unlike cable-renderer.ts's device cables: a path (straight, or a "smart" right-angle route that
// always exits/enters perpendicular to each side and stays axis-aligned) between two
// already-resolved endpoints (the caller — see app.ts's renderCloudAll() — resolves
// sourceNodeId/destNodeId -> an exact edge point using connectHandlePositions() from
// cloud-node-renderer.ts, or passes through sourcePoint/destPoint as-is for a floating end).
import { CloudConnector, CloudHandleSide, Point } from '../core/types';
import { createCircle, createGroup, createPath, createText, setAttributes } from '../utils/svg-helpers';

const DEFAULT_COLOR = '#8b949e';
const ENDPOINT_HANDLE_R = 5.5;
const CROSSBAR_HANDLE_R = 4.5;

/** How far a route runs straight out of a node before its first bend — long enough to clearly
 *  read as "leaving perpendicular to this side" rather than cutting a diagonal corner. */
const STUB = 24;

const SIDE_VECTOR: Record<CloudHandleSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

function isHorizontal(side: CloudHandleSide): boolean {
  return side === 'left' || side === 'right';
}

/** Best-guess side of the box at `from` that faces `towards` — used whenever a connector doesn't
 *  carry an explicit sourceSide/destSide (e.g. drawn via the Connect tool's node-body click
 *  rather than a specific connection handle), so the route still exits/enters perpendicular to
 *  the nearer side instead of cutting across the icon at an arbitrary angle. */
export function inferBestSide(from: Point, towards: Point): CloudHandleSide {
  const dx = towards.x - from.x;
  const dy = towards.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function dedupe(pts: Point[]): Point[] {
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** Auto-computed route point list, optionally with a manual `crossbarOffset` override (see
 *  CloudConnector.crossbarOffset). 'orthogonal' stubs straight out from the source side, straight
 *  into the dest side, and joins the two stubs with a single bend on whichever axis the source
 *  side determines — the common simple auto-route look in official cloud architecture diagrams,
 *  not true obstacle-avoiding pathfinding. Falls back to a single generic elbow when a side is
 *  missing (e.g. a floating, non-node endpoint). 'straight' ignores sides entirely and returns
 *  just the two endpoints.
 *
 *  `crossbarOffset` only applies when there's a genuine free interior coordinate to move — both
 *  sides known and the same orientation (both left/right or both top/bottom), or no sides known
 *  at all (the `!fromSide` branch). A single known side has no free coordinate: the interior
 *  bend's non-stub coordinate is pinned directly to the dest point, and moving it would make the
 *  final segment diagonal instead of axis-aligned — see crossbarHandleFor()'s matching exclusion. */
function autoRoutePoints(
  from: Point, fromSide: CloudHandleSide | undefined,
  to: Point, toSide: CloudHandleSide | undefined,
  routing: CloudConnector['routing'],
  crossbarOffset?: number
): Point[] {
  if (routing !== 'orthogonal') return [from, to];

  if (!fromSide) {
    const midX = crossbarOffset ?? (from.x + to.x) / 2;
    return dedupe([from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]);
  }

  const v1 = SIDE_VECTOR[fromSide];
  const p1 = { x: from.x + v1.x * STUB, y: from.y + v1.y * STUB };

  if (!toSide) {
    const bend = isHorizontal(fromSide) ? { x: to.x, y: p1.y } : { x: p1.x, y: to.y };
    return dedupe([from, p1, bend, to]);
  }

  const v2 = SIDE_VECTOR[toSide];
  const sameOrientation = isHorizontal(fromSide) === isHorizontal(toSide);
  const p2 = sameOrientation && crossbarOffset !== undefined
    ? (isHorizontal(fromSide) ? { x: crossbarOffset, y: to.y } : { x: to.x, y: crossbarOffset })
    : { x: to.x + v2.x * STUB, y: to.y + v2.y * STUB };
  const bend = isHorizontal(fromSide) ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y };
  return dedupe([from, p1, bend, p2, to]);
}

/** Final route point list — auto-computed from the two endpoints/sides, plus the connector's
 *  `crossbarOffset` manual override when one applies. 'orthogonal' routing keeps every segment
 *  horizontal or vertical. */
export function resolveRoutePoints(
  from: Point, fromSide: CloudHandleSide | undefined,
  to: Point, toSide: CloudHandleSide | undefined,
  routing: CloudConnector['routing'],
  crossbarOffset?: number
): Point[] {
  return autoRoutePoints(from, fromSide, to, toSide, routing, crossbarOffset);
}

/** The draggable "crossbar" segment of an orthogonal route — the one interior segment whose line
 *  position is a free coordinate (see autoRoutePoints' doc comment for exactly which side
 *  combinations qualify). Returns the segment's two endpoints and which world-space axis dragging
 *  its midpoint should move. `null` when this route has no such free segment (perpendicular
 *  sides, or only one side known) or routing isn't 'orthogonal'. */
export function crossbarHandleFor(
  pts: Point[], fromSide: CloudHandleSide | undefined, toSide: CloudHandleSide | undefined,
  routing: CloudConnector['routing']
): { a: Point; b: Point; axis: 'x' | 'y' } | null {
  if (routing !== 'orthogonal') return null;
  if (!fromSide) {
    return pts.length === 4 ? { a: pts[1], b: pts[2], axis: 'x' } : null;
  }
  if (!toSide || isHorizontal(fromSide) !== isHorizontal(toSide)) return null;
  if (pts.length !== 5) return null;
  return { a: pts[2], b: pts[3], axis: isHorizontal(fromSide) ? 'x' : 'y' };
}

function sub(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function len(v: Point): number { return Math.hypot(v.x, v.y); }
function norm(v: Point): Point { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; }

/** Converts a point list into an SVG path `d`. Sharp corners by default; with `rounded`, each
 *  interior corner gets a small quadratic-Bezier arc instead of a hard turn (the radius shrinks
 *  automatically on short segments so it never overshoots past a neighboring corner). */
function pointsToPathD(pts: Point[], rounded: boolean, radius = 10): string {
  if (pts.length < 3 || !rounded) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], curr = pts[i], next = pts[i + 1];
    const inVec = norm(sub(curr, prev));
    const outVec = norm(sub(next, curr));
    const r = Math.min(radius, len(sub(curr, prev)) / 2, len(sub(next, curr)) / 2);
    const p1 = { x: curr.x - inVec.x * r, y: curr.y - inVec.y * r };
    const p2 = { x: curr.x + outVec.x * r, y: curr.y + outVec.y * r };
    d += ` L ${p1.x} ${p1.y} Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function pathMidpoint(pts: Point[]): Point {
  return pts[Math.floor(pts.length / 2)];
}

/** Dash pattern per line style — omitted entries (solid, double, and the *carrier* dash used by
 *  every double-family style, looked up via DOUBLE_INNER_STYLE below) render a plain solid
 *  stroke. Exported so the properties-panel picker can render a real, in-sync preview swatch
 *  instead of a hand-maintained duplicate of these patterns. */
export const DASH_BY_STYLE: Record<string, string> = {
  dashed: '8,5',
  dotted: '2,3',
  'dash-dot': '10,3,2,3',
  'long-dash': '16,6',
};

/** For each double-family style, which single-line style's dash pattern each of the two parallel
 *  strokes uses ('double' itself has no entry — both strokes are solid). Exported alongside
 *  DASH_BY_STYLE so the properties-panel preview swatch looks this up the same way the renderer
 *  does, rather than re-deriving it — the exact bug that left 'double-long-dash'/'double-dash-dot'
 *  out of the picker the first time this map only lived here. */
export const DOUBLE_INNER_STYLE: Record<string, string> = {
  'double-dashed': 'dashed',
  'double-dotted': 'dotted',
  'double-dash-dot': 'dash-dot',
  'double-long-dash': 'long-dash',
};

export function isDoubleLineStyle(style: string | undefined): boolean {
  return style === 'double' || (!!style && style in DOUBLE_INNER_STYLE);
}

/** The full picker catalog for CloudConnector.style, in display order — single source of truth
 *  for both validation and the properties-panel line-style picker's option list. */
export const CLOUD_CONNECTOR_LINE_STYLES: { value: NonNullable<CloudConnector['style']>; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dash-dot', label: 'Dash-Dot' },
  { value: 'long-dash', label: 'Long Dash' },
  { value: 'double', label: 'Double' },
  { value: 'double-dashed', label: 'Double Dashed' },
  { value: 'double-dotted', label: 'Double Dotted' },
  { value: 'double-dash-dot', label: 'Double Dash-Dot' },
  { value: 'double-long-dash', label: 'Double Long Dash' },
];

/** Offsets every point of a polyline perpendicular to its local direction by `dist` (signed —
 *  opposite signs offset to opposite sides), producing the second parallel line for a
 *  'double'-family stroke. Segments are assumed either collinear or meeting at a right angle (true
 *  for every route this renderer produces — 'straight' is a single segment, 'orthogonal' only
 *  turns 90°): at a vertex between two collinear segments the shared normal is reused as-is; at a
 *  real corner the two segments' normals are summed, which for perpendicular axes lands exactly on
 *  the correct corner point with no extra miter geometry needed. */
function offsetPolyline(pts: Point[], dist: number): Point[] {
  if (pts.length < 2 || dist === 0) return pts;
  const normals: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dir = norm(sub(pts[i + 1], pts[i]));
    normals.push({ x: -dir.y, y: dir.x });
  }
  return pts.map((p, i) => {
    const nBefore = i > 0 ? normals[i - 1] : normals[0];
    const nAfter = i < normals.length ? normals[i] : normals[normals.length - 1];
    const collinear = nBefore.x * nAfter.x + nBefore.y * nAfter.y > 0.99;
    const n = collinear ? nBefore : { x: nBefore.x + nAfter.x, y: nBefore.y + nAfter.y };
    return { x: p.x + n.x * dist, y: p.y + n.y * dist };
  });
}

/**
 * Renders one CloudConnector between already-resolved `from`/`to` edge points (with their
 * corresponding sides, when known) into `layer` and returns the created
 * <g data-cloud-connector-id="...">. When selected, also includes draggable endpoint handles
 * (class "cloud-connector-endpoint-handle", carrying data-cloud-connector-id +
 * data-end="source"|"dest") at the two line tips, so either end can be re-dragged onto a
 * different node (or empty canvas) after the connector already exists, plus — when the route has
 * one (see crossbarHandleFor()) — a small dot handle (class "cloud-connector-crossbar-handle",
 * carrying data-cloud-connector-id + data-axis="x"|"y") at the midpoint of the route's one free
 * interior segment, letting that horizontal or vertical line be dragged directly rather than only
 * re-aiming the two tips.
 */
export function renderCloudConnector(
  connector: CloudConnector,
  from: Point, to: Point,
  layer: SVGGElement, selected: boolean,
  fromSide?: CloudHandleSide, toSide?: CloudHandleSide
): SVGGElement {
  const group = createGroup(undefined, 'cloud-connector');
  setAttributes(group, { 'data-cloud-connector-id': connector.id, cursor: 'pointer' });

  const color = connector.color || DEFAULT_COLOR;
  const width = connector.width ?? 2;
  const pts = resolveRoutePoints(from, fromSide, to, toSide, connector.routing, connector.crossbarOffset);
  const d = pointsToPathD(pts, !!connector.roundedCorners);
  const labelPoint = pathMidpoint(pts);

  if (selected) {
    group.appendChild(createPath(d, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': width + 3, 'stroke-linecap': 'round', opacity: 0.4, 'pointer-events': 'none',
    }));
  }

  // Wide, invisible hit path — a plain thin stroke is hard to click precisely.
  group.appendChild(createPath(d, { fill: 'none', stroke: 'transparent', 'stroke-width': 12, class: 'cloud-connector-hit' }));

  const startArrow = connector.startArrow ?? 'none';
  const endArrow = connector.endArrow ?? 'arrow';

  if (isDoubleLineStyle(connector.style)) {
    const dash = DASH_BY_STYLE[DOUBLE_INNER_STYLE[connector.style!]];
    const linePathAttrs: Record<string, string | number> = {
      fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    };
    if (dash) linePathAttrs['stroke-dasharray'] = dash;
    const half = width / 2 + 2;
    group.appendChild(createPath(pointsToPathD(offsetPolyline(pts, half), !!connector.roundedCorners), linePathAttrs));
    group.appendChild(createPath(pointsToPathD(offsetPolyline(pts, -half), !!connector.roundedCorners), linePathAttrs));
    // Hosts the arrow markers at the true centerline tip — a path's markers render from its own
    // geometry independent of its own stroke paint, so 'none' here doesn't hide them.
    if (startArrow !== 'none' || endArrow !== 'none') {
      const markerAttrs: Record<string, string | number> = { fill: 'none', stroke: 'none' };
      if (startArrow !== 'none') markerAttrs['marker-start'] = `url(#cloud-arrow-${startArrow})`;
      if (endArrow !== 'none') markerAttrs['marker-end'] = `url(#cloud-arrow-${endArrow})`;
      group.appendChild(createPath(d, markerAttrs));
    }
  } else {
    const pathAttrs: Record<string, string | number> = {
      fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    };
    const dash = connector.style ? DASH_BY_STYLE[connector.style] : undefined;
    if (dash) pathAttrs['stroke-dasharray'] = dash;
    if (startArrow !== 'none') pathAttrs['marker-start'] = `url(#cloud-arrow-${startArrow})`;
    if (endArrow !== 'none') pathAttrs['marker-end'] = `url(#cloud-arrow-${endArrow})`;
    group.appendChild(createPath(d, pathAttrs));
  }

  if (connector.label) {
    group.appendChild(createText(labelPoint.x, labelPoint.y - 6, connector.label, {
      'text-anchor': 'middle', 'font-size': 10, 'font-family': 'Inter, sans-serif', fill: '#c9d1d9',
    }));
  }

  if (selected) {
    const sourceHandle = createCircle(from.x, from.y, ENDPOINT_HANDLE_R, {
      class: 'cloud-connector-endpoint-handle', fill: '#3fb950', stroke: '#0d1117', 'stroke-width': 1.5, cursor: 'grab',
    });
    setAttributes(sourceHandle, { 'data-cloud-connector-id': connector.id, 'data-end': 'source' });
    group.appendChild(sourceHandle);

    const destHandle = createCircle(to.x, to.y, ENDPOINT_HANDLE_R, {
      class: 'cloud-connector-endpoint-handle', fill: '#f85149', stroke: '#0d1117', 'stroke-width': 1.5, cursor: 'grab',
    });
    setAttributes(destHandle, { 'data-cloud-connector-id': connector.id, 'data-end': 'dest' });
    group.appendChild(destHandle);

    const crossbar = crossbarHandleFor(pts, fromSide, toSide, connector.routing);
    if (crossbar) {
      const mid = { x: (crossbar.a.x + crossbar.b.x) / 2, y: (crossbar.a.y + crossbar.b.y) / 2 };
      const crossbarHandle = createCircle(mid.x, mid.y, CROSSBAR_HANDLE_R, {
        class: 'cloud-connector-crossbar-handle', fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1.5,
        cursor: crossbar.axis === 'x' ? 'ew-resize' : 'ns-resize',
      });
      setAttributes(crossbarHandle, { 'data-cloud-connector-id': connector.id, 'data-axis': crossbar.axis });
      group.appendChild(crossbarHandle);
    }
  }

  layer.appendChild(group);
  return group;
}
