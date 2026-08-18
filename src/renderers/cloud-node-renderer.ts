// Renders a CloudNode (see core/types.ts) — a single AWS/Azure/GCP service icon placed on the
// Cloud Architecture canvas — into the 'cloud-node-layer'. Mirrors image-asset-renderer.ts's
// structure: a full-bounds hit target so clicking near the icon (not just its opaque pixels)
// still selects/drags it, plus a bottom-right resize handle and 4 connection-point handles when
// selected.
import { CloudNode, CloudHandleSide, Point } from '../core/types';
import { createGroup, createCircle, createRect, createSVGElement, createText, setAttributes } from '../utils/svg-helpers';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const HANDLE_SIZE = 12;
const LABEL_GAP = 6;
const CONNECT_HANDLE_R = 6;
const CONNECT_HANDLE_HIT_R = 11;

/** Anything with a world-space box — the only shape connectHandlePositions/nodeEdgeWorldPoint/
 *  nodeCenterWorldPoint/renderConnectHandles actually need. Widened from CloudNode specifically
 *  so a cloud-canvas ImageAsset (same x/y/width/height shape, see image-asset-renderer.ts) can
 *  reuse the exact same connector-endpoint geometry and handle rendering — CloudConnector's own
 *  sourceNodeId/destNodeId are just plain id strings with no type tying them to CloudNode, so
 *  resolveCloudConnectorEndpoints() in app.ts can resolve either kind of id through here. */
interface RectLike { x: number; y: number; width: number; height: number; }

/** Connection points on all 4 sides of a node/image — only rendered while selected (click it
 *  first), not always-on: dragging from one starts a connector regardless of the active tool,
 *  but the dots themselves stay out of the way until you've actually clicked the object. */
export function connectHandlePositions(rect: RectLike): { side: CloudHandleSide; point: Point }[] {
  return [
    { side: 'top', point: { x: rect.width / 2, y: 0 } },
    { side: 'right', point: { x: rect.width, y: rect.height / 2 } },
    { side: 'bottom', point: { x: rect.width / 2, y: rect.height } },
    { side: 'left', point: { x: 0, y: rect.height / 2 } },
  ];
}

/** World-space (not local) position of one of an object's 4 connection points — used by
 *  app.ts's resolveCloudConnectorEndpoints() to resolve where a CloudConnector's line actually
 *  starts/ends. */
export function nodeEdgeWorldPoint(rect: RectLike, side: CloudHandleSide): Point {
  const local = connectHandlePositions(rect).find(h => h.side === side)!.point;
  return { x: rect.x + local.x, y: rect.y + local.y };
}

/** World-space center of an object — the fallback endpoint when no side is known/inferrable yet. */
export function nodeCenterWorldPoint(rect: RectLike): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Draws the 4 connection-point dots (+ their larger invisible hit circles) for `rect` at `id` —
 *  shared by renderCloudNode below and image-asset-renderer.ts's renderImageAsset, so a
 *  cloud-canvas image can be a connector endpoint exactly like a CloudNode, reusing the same
 *  '.cloud-node-connect-handle'/'-hit' classes and 'data-cloud-node-id' attribute app.ts's
 *  mousedown/hover handling already matches on — no separate "image connect handle" class or
 *  handling needed anywhere else. */
export function renderConnectHandles(rect: RectLike, id: string, group: SVGGElement): void {
  for (const { side, point } of connectHandlePositions(rect)) {
    // A larger, invisible hit circle sits behind the visible dot so the actual click/drag target
    // is far more forgiving than the small dot alone — precisely landing on a tiny circle to
    // start or drop a connector was the reported failure mode. Kept as a separate class (not
    // '.cloud-node-connect-handle') so existing "exactly 4 handles" checks, which count/inspect
    // the visible dot only, are unaffected; app.ts's hit-testing matches both classes together.
    const hit = createCircle(point.x, point.y, CONNECT_HANDLE_HIT_R, {
      class: 'cloud-node-connect-handle-hit', 'data-handle-side': side, cursor: 'crosshair',
      fill: 'transparent', stroke: 'none',
    });
    setAttributes(hit, { 'data-cloud-node-id': id });
    group.appendChild(hit);

    const handle = createCircle(point.x, point.y, CONNECT_HANDLE_R, {
      class: 'cloud-node-connect-handle', 'data-handle-side': side, cursor: 'crosshair',
      fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, opacity: 0.85, 'pointer-events': 'none',
    });
    setAttributes(handle, { 'data-cloud-node-id': id });
    group.appendChild(handle);
  }
}

/**
 * Renders one CloudNode into `layer` and returns the created <g data-cloud-node-id="...">.
 * `showHandles` (defaults to `selected`) controls the 4 connection dots independently of
 * selection chrome: while a connector is actively being drawn/re-dragged, app.ts also passes
 * `true` for whichever node is currently under the cursor — even if it isn't selected — so the
 * node you're about to drop onto always has a visible, precise target instead of requiring you
 * to have pre-selected it (which, for a destination node you're dragging *toward*, you never
 * would have). A highlighted outline accompanies handles shown this way, distinct from the
 * dashed selection outline, so "valid drop target" reads differently from "selected".
 */
export function renderCloudNode(node: CloudNode, iconPath: string, layer: SVGGElement, selected: boolean, showHandles: boolean = selected): SVGGElement {
  const group = createGroup(undefined, 'cloud-node');
  setAttributes(group, {
    'data-cloud-node-id': node.id,
    transform: `translate(${node.x}, ${node.y})`,
    cursor: node.locked ? 'default' : 'move',
  });

  group.appendChild(createRect(0, 0, node.width, node.height, {
    fill: 'transparent', stroke: 'none', class: 'cloud-node-hit',
  }));

  const img = createSVGElement('image', {
    x: 0, y: 0, width: node.width, height: node.height, preserveAspectRatio: 'xMidYMid meet',
  }) as SVGImageElement;
  img.setAttribute('href', iconPath);
  img.setAttributeNS(XLINK_NS, 'xlink:href', iconPath);
  // Some browsers natively drag SVG <image> elements out (as an OS-level image drag) on a
  // mousedown-drag, which hijacks any custom drag gesture that happens to start on top of a node
  // icon — the select/move drag, connector drag, and the export-area rectangle tool all rely on
  // ordinary mousemove/mouseup instead, so native image drag must never engage here.
  img.setAttribute('draggable', 'false');
  group.appendChild(img);

  if (node.label) {
    group.appendChild(createText(node.width / 2, node.height + LABEL_GAP + 10, node.label, {
      'text-anchor': 'middle', 'font-size': 11, 'font-family': 'Inter, sans-serif', fill: '#c9d1d9',
    }));
  }

  if (selected) {
    group.appendChild(createRect(-4, -4, node.width + 8, node.height + 8, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': 1.5, 'stroke-dasharray': '4,3',
      'pointer-events': 'none',
    }));
  } else if (showHandles) {
    // Drop-target highlight — a solid (not dashed) green outline, so hovering a connect target
    // mid-drag reads visually distinct from "this is selected".
    group.appendChild(createRect(-4, -4, node.width + 8, node.height + 8, {
      fill: 'none', stroke: '#3fb950', 'stroke-width': 2, 'pointer-events': 'none',
    }));
  }

  if (showHandles) {
    renderConnectHandles(node, node.id, group);
  }

  if (selected && !node.locked) {
    const handle = createRect(
      node.width - HANDLE_SIZE / 2, node.height - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE,
      { fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, rx: 2, ry: 2, cursor: 'nwse-resize', class: 'cloud-node-resize-handle' }
    );
    setAttributes(handle, { 'data-cloud-node-id': node.id });
    group.appendChild(handle);
  }

  layer.appendChild(group);
  return group;
}
