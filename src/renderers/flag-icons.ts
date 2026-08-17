// A single generic pennant-flag glyph for the CloudHierarchy Region pill icon (see
// cloud-hierarchy-renderer.ts) — a plain "flag" marker, not a national flag. (Earlier version of
// this file tried to resolve the region's typed name/code to a country flag — turned out to be
// solving the wrong problem; "flag icon" meant a generic pin/flag marker, same for every region.)
import { createGroup, createLine, createPath, setAttributes } from '../utils/svg-helpers';

/** Renders a small white pennant-flag-on-a-pole glyph at (x,y), fit to a wxh box. Same icon for
 *  every region — it's a generic marker, not tied to the region's name. */
export function renderFlagIcon(x: number, y: number, w: number, h: number): SVGElement {
  const g = createGroup(undefined, 'flag-icon');
  setAttributes(g, { transform: `translate(${x}, ${y})` });

  const poleX = w * 0.16;
  g.appendChild(createLine(poleX, h * 0.05, poleX, h * 0.95, { stroke: '#FFFFFF', 'stroke-width': Math.max(1, w * 0.09), 'stroke-linecap': 'round' }));
  g.appendChild(createPath(
    `M ${poleX} ${h * 0.08} L ${w * 0.95} ${h * 0.3} L ${poleX} ${h * 0.52} Z`,
    { fill: '#FFFFFF' },
  ));

  return g;
}
