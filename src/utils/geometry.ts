import { Point } from '../core/types';

export function distance(a: Point, b: Point): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pointInRect(point: Point, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
         point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

export function generateOrthogonalPath(start: Point, end: Point, bendPoints: Point[], bendRadius: number): string {
  const points = [start, ...bendPoints, end];
  if (points.length === 2) {
    // Auto-generate orthogonal route if no bend points
    points.splice(1, 0, { x: start.x + Math.abs(end.x - start.x) / 2, y: start.y });
    points.splice(2, 0, { x: start.x + Math.abs(end.x - start.x) / 2, y: end.y });
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    if (i === points.length - 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }
    
    const next = points[i + 1];
    
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
    
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
    
    if (l1 < 0.5 || l2 < 0.5) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }
    
    const r = Math.min(bendRadius, l1 / 2, l2 / 2);
    
    const px = curr.x - (d1x / l1) * r;
    const py = curr.y - (d1y / l1) * r;
    
    const nx = curr.x + (d2x / l2) * r;
    const ny = curr.y + (d2y / l2) * r;
    
    d += ` L ${px} ${py} Q ${curr.x} ${curr.y} ${nx} ${ny}`;
  }
  
  return d;
}

export function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

