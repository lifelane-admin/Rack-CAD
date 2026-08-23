import { describe, it, expect } from 'vitest';
import { routeAroundObstacles, ObstacleRect } from '../renderers/cloud-connector-router';
import { resolveRoutePoints } from '../renderers/cloud-connector-renderer';
import type { CloudHandleSide, Point } from '../core/types';

/** True if the axis-aligned segment a->b crosses the *interior* of `rect` (touching an edge
 *  doesn't count — the router is expected to route right up against a rect's boundary, not
 *  necessarily clear it by a visible margin, since ROUTE_PADDING already does that inflation). */
function segmentHitsRect(a: Point, b: Point, rect: ObstacleRect): boolean {
  const x0 = rect.x, x1 = rect.x + rect.width, y0 = rect.y, y1 = rect.y + rect.height;
  if (a.x === b.x) {
    if (!(a.x > x0 && a.x < x1)) return false;
    const yLo = Math.min(a.y, b.y), yHi = Math.max(a.y, b.y);
    return yLo < y1 && yHi > y0;
  }
  if (a.y === b.y) {
    if (!(a.y > y0 && a.y < y1)) return false;
    const xLo = Math.min(a.x, b.x), xHi = Math.max(a.x, b.x);
    return xLo < x1 && xHi > x0;
  }
  return false; // every segment this router produces is axis-aligned
}

function pathHitsAnyRect(pts: Point[], rects: ObstacleRect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (rects.some(r => segmentHitsRect(pts[i], pts[i + 1], r))) return true;
  }
  return false;
}

function pathLength(pts: Point[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
  return total;
}

function assertAxisAligned(pts: Point[]): void {
  for (let i = 0; i < pts.length - 1; i++) {
    expect(pts[i].x === pts[i + 1].x || pts[i].y === pts[i + 1].y).toBe(true);
  }
}

describe('routeAroundObstacles', () => {
  it('with no obstacles, still exits/enters perpendicular to each side and is axis-aligned', () => {
    const from: Point = { x: 0, y: 0 }, to: Point = { x: 100, y: 60 };
    const pts = routeAroundObstacles(from, 'right', to, 'left', []);
    expect(pts).not.toBeNull();
    const route = pts!;
    expect(route[0]).toEqual(from);
    expect(route[route.length - 1]).toEqual(to);
    // First move is perpendicular to fromSide ('right' => +x), last move perpendicular to toSide
    // ('left' => the final approach travels in -x).
    expect(route[1].x).toBeGreaterThan(route[0].x);
    expect(route[1].y).toBe(route[0].y);
    const last = route.length - 1;
    expect(route[last].x).toBeGreaterThan(route[last - 1].x); // approaching 'left' side means still +x
    assertAxisAligned(route);
  });

  it('routes around a single obstacle sitting directly between source and dest', () => {
    const from: Point = { x: 0, y: 50 }, to: Point = { x: 200, y: 50 };
    const obstacle: ObstacleRect = { x: 80, y: 0, width: 40, height: 100 }; // spans the straight y=50 line
    const pts = routeAroundObstacles(from, 'right', to, 'left', [obstacle]);
    expect(pts).not.toBeNull();
    const route = pts!;
    assertAxisAligned(route);
    expect(pathHitsAnyRect(route, [obstacle])).toBe(false);
    expect(route[0]).toEqual(from);
    expect(route[route.length - 1]).toEqual(to);
  });

  it('prefers the route with much shorter clearance when one detour is far cheaper than the other', () => {
    const from: Point = { x: 0, y: 100 }, to: Point = { x: 300, y: 100 };
    // A wide obstacle straddling the direct path...
    const middle: ObstacleRect = { x: 100, y: 80, width: 100, height: 40 };
    // ...plus a second obstacle that makes detouring below much longer than detouring above.
    const below: ObstacleRect = { x: 80, y: 120, width: 140, height: 140 };
    const pts = routeAroundObstacles(from, 'right', to, 'left', [middle, below]);
    expect(pts).not.toBeNull();
    const route = pts!;
    expect(pathHitsAnyRect(route, [middle, below])).toBe(false);
    // The only cheap option is over the top (y < 80's padded edge) — a route that instead cleared
    // the `below` obstacle would be dramatically longer than the straight-line distance (300).
    expect(pathLength(route)).toBeLessThan(400);
    expect(Math.min(...route.map(p => p.y))).toBeLessThan(80);
  });

  it('returns null when the destination is fully enclosed, with no path in or out', () => {
    const from: Point = { x: 0, y: 100 }, to: Point = { x: 200, y: 100 };
    // Four overlapping walls forming a closed frame around `to`'s stub point (176,100) — interior
    // (150-210, 80-120) is left clear (so the point itself isn't flagged "blocked"), but every
    // approach into it crosses a wall.
    const walls: ObstacleRect[] = [
      { x: 150, y: 70, width: 60, height: 10 },  // top
      { x: 150, y: 120, width: 60, height: 10 }, // bottom
      { x: 140, y: 70, width: 10, height: 60 },  // left
      { x: 210, y: 70, width: 10, height: 60 },  // right
    ];
    const pts = routeAroundObstacles(from, 'right', to, 'left', walls);
    expect(pts).toBeNull();
  });
});

describe('resolveRoutePoints with avoidObstacles', () => {
  const from: Point = { x: 0, y: 50 }, to: Point = { x: 200, y: 50 };
  const fromSide: CloudHandleSide = 'right', toSide: CloudHandleSide = 'left';
  const obstacle: ObstacleRect = { x: 80, y: 0, width: 40, height: 100 };

  it('routes around the obstacle when avoidObstacles is set and routing is orthogonal', () => {
    const pts = resolveRoutePoints(from, fromSide, to, toSide, 'orthogonal', undefined, undefined, undefined, undefined, undefined, undefined, true, [obstacle]);
    expect(pathHitsAnyRect(pts, [obstacle])).toBe(false);
  });

  it('falls back to the plain elbow route when no obstacle-avoiding path exists', () => {
    const walls: ObstacleRect[] = [
      { x: 150, y: 70, width: 60, height: 10 },
      { x: 150, y: 120, width: 60, height: 10 },
      { x: 140, y: 70, width: 10, height: 60 },
      { x: 210, y: 70, width: 10, height: 60 },
    ];
    const withAvoid = resolveRoutePoints({ x: 0, y: 100 }, 'right', { x: 200, y: 100 }, 'left', 'orthogonal', undefined, undefined, undefined, undefined, undefined, undefined, true, walls);
    const withoutAvoid = resolveRoutePoints({ x: 0, y: 100 }, 'right', { x: 200, y: 100 }, 'left', 'orthogonal');
    expect(withAvoid).toEqual(withoutAvoid);
  });

  it('manual waypoints still win outright even when avoidObstacles is set', () => {
    const waypoints: Point[] = [{ x: 50, y: 200 }];
    const pts = resolveRoutePoints(from, fromSide, to, toSide, 'orthogonal', undefined, undefined, undefined, undefined, undefined, waypoints, true, [obstacle]);
    expect(pts).toEqual([from, ...waypoints, to]);
  });

  it('is a no-op when avoidObstacles is unset, unchanged from today\'s plain elbow route', () => {
    const withFlagOff = resolveRoutePoints(from, fromSide, to, toSide, 'orthogonal', undefined, undefined, undefined, undefined, undefined, undefined, false, [obstacle]);
    const noObstaclesArgAtAll = resolveRoutePoints(from, fromSide, to, toSide, 'orthogonal');
    expect(withFlagOff).toEqual(noObstaclesArgAtAll);
  });
});
