// Obstacle-avoiding orthogonal router for CloudConnector (see core/types.ts's `avoidObstacles`
// field). Used instead of cloud-connector-renderer.ts's plain autoRoutePoints() elbow when a
// connector opts in — computes a right-angle path from source to dest that steps around other
// cloud nodes/containers/hierarchies rather than cutting straight through them, in the style of
// Lucidchart/draw.io orthogonal connectors.
//
// Algorithm: coordinate-compressed grid + Dijkstra with a turn penalty. An optimal orthogonal
// path around axis-aligned rectangular obstacles only ever needs to bend at X/Y coordinates that
// come from the obstacles' own (padded) edges, or the two path endpoints — so instead of a dense
// pixel grid, the search space is just the sparse grid formed by those coordinates: at most
// `2*obstacles.length + 2` distinct X's and the same for Y, i.e. O(N²) grid nodes for N
// obstacles. Dijkstra (not BFS) because grid spacing is non-uniform so edges have different
// lengths; the turn penalty biases the result toward long straight runs with a few bends rather
// than the raw shortest-hop path, which is what makes it read as an intentional route instead of
// a maze solve.
import { CloudHandleSide, Point } from '../core/types';

export interface ObstacleRect { x: number; y: number; width: number; height: number; }

/** How far a route runs straight out of a node before the obstacle-avoiding search takes over —
 *  matches cloud-connector-renderer.ts's own STUB, so a routed connector's perpendicular
 *  exit/entry reads identically to the plain elbow route's. */
const STUB = 24;
/** How far obstacle rects are inflated before being treated as blocked — keeps the route from
 *  hugging a node's edge so tightly it looks like it's grazing it. */
const ROUTE_PADDING = 12;
/** Cost added to a grid edge whenever the path changes direction — biases Dijkstra toward fewer,
 *  longer straight runs instead of the raw shortest-hop path (which tends to zigzag along
 *  obstacle edges). */
const TURN_PENALTY = 48;
/** Defensive cap on total grid nodes (xs.length * ys.length) — with the tens-of-nodes diagrams
 *  this app handles this is never approached, but guards against pathological inputs (hundreds of
 *  obstacles) blowing up search time. */
const MAX_GRID_NODES = 20000;

const SIDE_VECTOR: Record<CloudHandleSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

type Dir = 0 | 1 | 2 | 3; // +x, -x, +y, -y
const DIR_DELTA: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function isStrictlyInside(x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

function sortedUnique(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

class MinHeap<T> {
  private items: { key: number; value: T }[] = [];
  push(key: number, value: T): void {
    this.items.push({ key, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].key <= this.items[i].key) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = i * 2 + 2;
        let smallest = i;
        if (l < this.items.length && this.items[l].key < this.items[smallest].key) smallest = l;
        if (r < this.items.length && this.items[r].key < this.items[smallest].key) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }
  get size(): number { return this.items.length; }
}

/** Merges runs of 3+ collinear points down to their two endpoints (generalizes
 *  cloud-connector-renderer.ts's exact-duplicate-only dedupe()). */
function simplifyCollinear(pts: Point[]): Point[] {
  if (pts.length < 3) return pts.slice();
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1], curr = pts[i], next = pts[i + 1];
    const collinear = (prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y);
    if (!collinear) out.push(curr);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Returns a simplified orthogonal point list `[from, p1, ...bends, pEnd, to]` routed around
 *  `obstacles`, or `null` when no path exists between the source/dest stubs (e.g. the destination
 *  is fully enclosed) — callers should fall back to the plain elbow route (autoRoutePoints) in
 *  that case, never treat `null` as an error. Requires both `fromSide`/`toSide` to be known (an
 *  obstacle-avoiding route needs a perpendicular exit/entry direction to anchor its stubs to);
 *  returns `null` immediately if either is missing. */
export function routeAroundObstacles(
  from: Point, fromSide: CloudHandleSide,
  to: Point, toSide: CloudHandleSide,
  obstacles: ObstacleRect[]
): Point[] | null {
  const v1 = SIDE_VECTOR[fromSide];
  const v2 = SIDE_VECTOR[toSide];
  const p1: Point = { x: from.x + v1.x * STUB, y: from.y + v1.y * STUB };
  const pEnd: Point = { x: to.x + v2.x * STUB, y: to.y + v2.y * STUB };

  const inflated = obstacles.map(o => ({
    x0: o.x - ROUTE_PADDING, x1: o.x + o.width + ROUTE_PADDING,
    y0: o.y - ROUTE_PADDING, y1: o.y + o.height + ROUTE_PADDING,
  }));

  const xs = sortedUnique([...inflated.flatMap(r => [r.x0, r.x1]), p1.x, pEnd.x]);
  const ys = sortedUnique([...inflated.flatMap(r => [r.y0, r.y1]), p1.y, pEnd.y]);
  if (xs.length * ys.length > MAX_GRID_NODES) return null;

  const ix = new Map(xs.map((x, i) => [x, i]));
  const iy = new Map(ys.map((y, i) => [y, i]));
  const startI = ix.get(p1.x), startJ = iy.get(p1.y);
  const goalI = ix.get(pEnd.x), goalJ = iy.get(pEnd.y);
  if (startI === undefined || startJ === undefined || goalI === undefined || goalJ === undefined) return null;

  const pointBlocked = (i: number, j: number): boolean =>
    inflated.some(r => isStrictlyInside(xs[i], ys[j], r));
  const edgeBlocked = (i: number, j: number, dir: Dir): boolean => {
    const [dx, dy] = DIR_DELTA[dir];
    const mx = (xs[i] + xs[i + dx]) / 2, my = (ys[j] + ys[j + dy]) / 2;
    return inflated.some(r => isStrictlyInside(mx, my, r));
  };

  // Dijkstra over states (i, j, incomingDir) so the turn penalty can see whether a move continues
  // straight or bends. `-1` as the incoming dir for the start state means "no direction yet, no
  // turn penalty on the very first move".
  const dist = new Map<string, number>();
  const prev = new Map<string, { i: number; j: number; dir: Dir | -1 }>();
  const key = (i: number, j: number, dir: Dir | -1) => `${i},${j},${dir}`;

  const heap = new MinHeap<{ i: number; j: number; dir: Dir | -1 }>();
  const startKey = key(startI, startJ, -1);
  dist.set(startKey, 0);
  heap.push(0, { i: startI, j: startJ, dir: -1 });

  let goalState: { i: number; j: number; dir: Dir | -1 } | null = null;
  while (heap.size > 0) {
    const state = heap.pop()!;
    const d = dist.get(key(state.i, state.j, state.dir));
    if (d === undefined) continue;
    if (state.i === goalI && state.j === goalJ) { goalState = state; break; }
    if (pointBlocked(state.i, state.j) && !(state.i === startI && state.j === startJ)) continue;

    for (let dir = 0 as Dir; dir < 4; dir++) {
      const [dx, dy] = DIR_DELTA[dir];
      const ni: number = state.i + dx;
      const nj: number = state.j + dy;
      if (ni < 0 || ni >= xs.length || nj < 0 || nj >= ys.length) continue;
      if (edgeBlocked(state.i, state.j, dir)) continue;
      if (pointBlocked(ni, nj) && !(ni === goalI && nj === goalJ)) continue;
      const segLen = Math.abs(xs[ni] - xs[state.i]) + Math.abs(ys[nj] - ys[state.j]);
      const turnCost = state.dir !== -1 && state.dir !== dir ? TURN_PENALTY : 0;
      const nd = d + segLen + turnCost;
      const nKey = key(ni, nj, dir);
      if (dist.get(nKey) === undefined || nd < dist.get(nKey)!) {
        dist.set(nKey, nd);
        prev.set(nKey, { i: state.i, j: state.j, dir: state.dir });
        heap.push(nd, { i: ni, j: nj, dir });
      }
    }
  }

  if (!goalState) return null;

  const path: Point[] = [];
  let curKey = key(goalState.i, goalState.j, goalState.dir);
  let cur: { i: number; j: number; dir: Dir | -1 } | undefined = goalState;
  while (cur) {
    path.push({ x: xs[cur.i], y: ys[cur.j] });
    const p: { i: number; j: number; dir: Dir | -1 } | undefined = prev.get(curKey);
    if (!p) break;
    curKey = key(p.i, p.j, p.dir);
    cur = p;
  }
  path.reverse();

  return simplifyCollinear([from, ...path, to]);
}
