// Renders a free-form TextLabel annotation (see core/types.ts) into the canvas's `label-layer`.
// Uses plain SVG <text>/<tspan> — this codebase never uses foreignObject/contentEditable
// anywhere, and plain SVG text serializes/rasterizes reliably through the existing
// exportSVG()->PNG/JPEG/PDF pipeline (utils/export.ts) with zero extra work.
import { TextLabel, Point } from '../core/types';
import { createGroup, createRect, createCircle, createPath, createSVGElement, setAttributes } from '../utils/svg-helpers';

const LINE_HEIGHT_FACTOR = 1.3;  // spacing BETWEEN lines (dy step) — kept generous for legibility
// The background/hit box's own height uses a tighter factor than LINE_HEIGHT_FACTOR: 1.3x
// per line is line-to-line breathing room, not how tall one line of text actually is, and using
// it for the box made a single-line label's background noticeably taller than the text — this
// is just enough for ascenders/descenders on the first line.
const TEXT_BOX_LINE_FACTOR = 1.05;
// Exported so the Text Tool panel (backgroundPaddingX/Y controls) can show/reset to the same
// default this renderer falls back to when a label hasn't set its own padding — 0 by default
// (box hugs the text exactly), left entirely to the user to grow via the panel's Box W/Box H.
export const DEFAULT_PADDING_X = 0;
export const DEFAULT_PADDING_Y = 0;
export const DEFAULT_POINTER_LINE_COLOR = '#3b82f6';
// getBBox() only reflects real layout and isn't reliably available in the jsdom test
// environment (see utils/export.ts's own note on this) — estimate width from character count
// instead of measuring, same "analytically-known extents" approach used there.
const AVG_CHAR_WIDTH_FACTOR = 0.56;

function estimateLineWidth(line: string, fontSize: number, bold: boolean): number {
  const factor = bold ? AVG_CHAR_WIDTH_FACTOR + 0.05 : AVG_CHAR_WIDTH_FACTOR;
  return Math.max(line.length, 1) * fontSize * factor;
}

interface BoxConnector {
  point: Point;
  axis: 'horizontal' | 'vertical';
}

/**
 * Picks which box edge (left/right/top/bottom) faces the device, and returns that edge's
 * midpoint in world coordinates plus which axis the box's own connecting segment should run
 * along (a horizontal-facing edge gets a final horizontal run into the box, and vice versa).
 */
function boxEdgeConnector(boxWorldX: number, boxWorldY: number, width: number, height: number, deviceWorld: Point): BoxConnector {
  const centerX = boxWorldX + width / 2;
  const centerY = boxWorldY + height / 2;
  const dx = centerX - deviceWorld.x;
  const dy = centerY - deviceWorld.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const point = dx >= 0 ? { x: boxWorldX, y: centerY } : { x: boxWorldX + width, y: centerY };
    return { point, axis: 'horizontal' };
  }
  const point = dy >= 0 ? { x: centerX, y: boxWorldY } : { x: centerX, y: boxWorldY + height };
  return { point, axis: 'vertical' };
}

function elbowPathData(device: Point, boxConn: BoxConnector): string {
  // Diagonal for most of the run, then a short straight segment into the box — matches the
  // classic rack-diagram callout look this feature was requested to replicate.
  const knee = boxConn.axis === 'horizontal'
    ? { x: device.x + (boxConn.point.x - device.x) * 0.7, y: boxConn.point.y }
    : { x: boxConn.point.x, y: device.y + (boxConn.point.y - device.y) * 0.7 };
  return `M ${device.x} ${device.y} L ${knee.x} ${knee.y} L ${boxConn.point.x} ${boxConn.point.y}`;
}

function flexiblePathData(device: Point, anchors: Point[], boxConn: BoxConnector): string {
  const pts = [device, ...anchors, boxConn.point];
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Draws the leader-line connector (+ device-end dot, + draggable via-point handles when the
 * label is selected in 'flexible' style) as its own un-rotated, world-coordinate group appended
 * before the label's own group — so it renders underneath the box and is unaffected by the
 * label's own rotation (rotating the callout box shouldn't also swing the line off the device).
 */
function renderPointerConnector(label: TextLabel, deviceWorld: Point, boxWorldX: number, boxWorldY: number, width: number, height: number, selected: boolean, layer: SVGGElement): void {
  const boxConn = boxEdgeConnector(boxWorldX, boxWorldY, width, height, deviceWorld);
  const isFlexible = label.pointerStyle === 'flexible';
  const pathData = isFlexible
    ? flexiblePathData(deviceWorld, label.pointerAnchorPoints ?? [], boxConn)
    : elbowPathData(deviceWorld, boxConn);
  const lineColor = label.pointerLineColor || DEFAULT_POINTER_LINE_COLOR;

  const connGroup = createGroup(undefined, 'label-pointer');
  setAttributes(connGroup, { 'data-text-id': label.id });

  connGroup.appendChild(createPath(pathData, {
    fill: 'none', stroke: lineColor, 'stroke-width': 1.5, 'pointer-events': 'none',
  }));
  connGroup.appendChild(createCircle(deviceWorld.x, deviceWorld.y, 3, {
    fill: lineColor, 'pointer-events': 'none',
  }));

  // Draggable starting-point handle — a larger invisible hit target over the visible dot above,
  // only interactive when selected (matches the flexible via-point handles below), so the line's
  // device-end attachment point can be repositioned after the fact instead of being locked in
  // to wherever the label was first clicked.
  if (selected && !label.locked) {
    const startHandle = createCircle(deviceWorld.x, deviceWorld.y, 8, {
      fill: 'transparent', stroke: 'none', cursor: 'move', class: 'label-pointer-device-handle',
    });
    setAttributes(startHandle, { 'data-text-id': label.id });
    connGroup.appendChild(startHandle);
  }

  if (selected && isFlexible) {
    (label.pointerAnchorPoints ?? []).forEach((pt, idx) => {
      const handle = createCircle(pt.x, pt.y, 5, {
        fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, cursor: 'move', class: 'label-pointer-anchor-handle',
      });
      setAttributes(handle, { 'data-text-id': label.id, 'data-anchor-index': String(idx) });
      connGroup.appendChild(handle);
    });
  }

  layer.appendChild(connGroup);
}

/**
 * Renders one TextLabel into `layer` and returns the created <g data-text-id="...">.
 * `selected` draws a dashed selection outline; callers (app.ts renderAll) recompute this on
 * every render from the current selection, same as every other renderer in this app.
 * `deviceAnchorWorld` is passed by app.ts (via stateManager.getDeviceWorldOrigin) whenever the
 * label has a live pointerDeviceId — null/omitted renders as a plain floating label.
 */
export function renderTextLabel(label: TextLabel, layer: SVGGElement, selected: boolean, deviceAnchorWorld: Point | null = null): SVGGElement {
  const group = createGroup(undefined, 'text-label');
  setAttributes(group, {
    'data-text-id': label.id,
    transform: `translate(${label.x}, ${label.y}) rotate(${label.rotation || 0})`,
    cursor: label.locked ? 'default' : 'move',
  });

  const lines = (label.text || '').split('\n');
  const fontSize = label.fontSize || 10;
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  // First line sized tightly to its own text; any additional lines add the full (more generous)
  // line-to-line spacing — see TEXT_BOX_LINE_FACTOR's comment above for why these differ.
  const totalHeight = fontSize * TEXT_BOX_LINE_FACTOR + (lines.length - 1) * lineHeight;
  const isBold = label.fontWeight === 'bold';
  const maxWidth = Math.max(...lines.map(l => estimateLineWidth(l, fontSize, isBold)), fontSize);
  const paddingX = label.backgroundPaddingX ?? DEFAULT_PADDING_X;
  const paddingY = label.backgroundPaddingY ?? DEFAULT_PADDING_Y;

  let anchorX = 0;
  let textAnchor: 'start' | 'middle' | 'end' = 'start';
  let bgLeft = 0;
  if (label.align === 'center') {
    anchorX = 0;
    textAnchor = 'middle';
    bgLeft = -maxWidth / 2;
  } else if (label.align === 'right') {
    anchorX = 0;
    textAnchor = 'end';
    bgLeft = -maxWidth;
  } else {
    anchorX = 0;
    textAnchor = 'start';
    bgLeft = 0;
  }

  const bgRect = { x: bgLeft - paddingX, y: -paddingY, width: maxWidth + paddingX * 2, height: totalHeight + paddingY * 2 };

  if (deviceAnchorWorld) {
    renderPointerConnector(label, deviceAnchorWorld, label.x + bgRect.x, label.y + bgRect.y, bgRect.width, bgRect.height, selected, layer);
  }

  // Background fill — only drawn when a background color is actually set.
  if (label.backgroundColor) {
    group.appendChild(createRect(bgRect.x, bgRect.y, bgRect.width, bgRect.height, {
      fill: label.backgroundColor, rx: 3, ry: 3,
    }));
  }

  // Oversized invisible hit-rect so short/empty labels stay easy to click and drag, matching
  // how port hit targets in this app are deliberately larger than their visible footprint.
  group.appendChild(createRect(bgRect.x - 4, bgRect.y - 4, bgRect.width + 8, bgRect.height + 8, {
    fill: 'transparent', stroke: 'none', class: 'text-label-hit',
  }));

  const textEl = createSVGElement('text', {
    x: anchorX,
    y: fontSize * 0.9,
    'font-family': label.fontFamily || 'Inter, sans-serif',
    'font-size': fontSize,
    'font-weight': label.fontWeight || 'normal',
    'font-style': label.fontStyle || 'normal',
    'text-decoration': label.underline ? 'underline' : 'none',
    fill: label.color || '#e6ecf2',
    'text-anchor': textAnchor,
    'pointer-events': 'none',
  }) as SVGTextElement;

  lines.forEach((line, i) => {
    const tspan = createSVGElement('tspan', { x: anchorX, dy: i === 0 ? 0 : lineHeight }) as SVGTSpanElement;
    // A tspan with no text content collapses in some renderers — keep an explicit space so
    // blank lines still occupy their line height.
    tspan.textContent = line.length > 0 ? line : ' ';
    textEl.appendChild(tspan);
  });
  group.appendChild(textEl);

  if (selected) {
    group.appendChild(createRect(bgRect.x - 5, bgRect.y - 5, bgRect.width + 10, bgRect.height + 10, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': 1.5, 'stroke-dasharray': '4,3', rx: 4, ry: 4,
      'pointer-events': 'none',
    }));
  }

  layer.appendChild(group);
  return group;
}
