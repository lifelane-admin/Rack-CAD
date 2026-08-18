// Renders a CloudHierarchy (see core/types.ts) — built from one slash-separated line of text
// (see library/hierarchy-parser.ts) — into the 'cloud-hierarchy-layer'. Mirrors CloudContainer's
// look (a resizable, mostly-transparent dashed-border boundary box with a solid label chip
// straddling its top edge — see cloud-container-renderer.ts) rather than a giant solid-filled
// blob: the breadcrumb ("🔑 Subscription  /  🚩 Region  /  📦 Resource Group  /  🛡️ vNET", each
// label preceded by its own icon) is just the chip's content, sized to fit — the box below it is
// the actual resizable boundary area, like a VPC/Region.
import { CloudHierarchy, CloudProvider } from '../core/types';
import { HierarchyLevelIcon } from '../library/hierarchy-parser';
import { renderFlagIcon } from './flag-icons';
import { DASH_BY_STYLE, DOUBLE_INNER_STYLE, isDoubleLineStyle } from './cloud-connector-renderer';
import { createGroup, createRect, createSVGElement, createText, setAttributes } from '../utils/svg-helpers';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const CHIP_H = 30;
const CHIP_X = 10;
const CHIP_PAD_X = 14;
const ICON_SIZE = 16;
const ICON_TEXT_GAP = 5;
const SEPARATOR = '  /  ';
const HANDLE_SIZE = 12;
const BORDER_WIDTH = 2;
const DEFAULT_DASHARRAY = '7,4';
const DEFAULT_BG_OPACITY = 0.08;
const DEFAULT_BOUNDARY_W = 420;
const DEFAULT_BOUNDARY_H = 220;

const PROVIDER_ACCENT: Record<CloudProvider, string> = {
  aws: '#FF9900',
  azure: '#1f6feb',
  gcp: '#4285F4',
  onprem: '#3fb950',
};

// Rough per-character width for the chip's 12px bold label font / regular separator font — good
// enough for chip sizing without measuring actual rendered text (no layout pass available here).
function textWidth(s: string, bold: boolean): number {
  return s.length * (bold ? 6.8 : 6.2);
}

interface SegmentLayout {
  icon?: HierarchyLevelIcon;
  iconX: number;
  textX: number;
  label: string;
  sepX: number;
}

function layoutSegments(levels: CloudHierarchy['levels'], icons: (HierarchyLevelIcon | undefined)[]): { segments: SegmentLayout[]; chipWidth: number } {
  let cursorX = CHIP_PAD_X;
  const segments: SegmentLayout[] = levels.map((level, i) => {
    const icon = icons[i];
    const iconX = cursorX;
    if (icon) cursorX += ICON_SIZE + ICON_TEXT_GAP;
    const textX = cursorX;
    cursorX += textWidth(level.label, true);
    const sepX = cursorX;
    if (i < levels.length - 1) cursorX += textWidth(SEPARATOR, false);
    return { icon, iconX, textX, label: level.label, sepX };
  });
  return { segments, chipWidth: cursorX + CHIP_PAD_X };
}

/** The chip's auto-fit width at normal content size — the boundary box can never be narrower
 *  than this (plus margin), so the chip never overflows its own box. */
export function getNaturalHierarchySize(hierarchy: CloudHierarchy, icons: (HierarchyLevelIcon | undefined)[]): { width: number; height: number } {
  const { chipWidth } = layoutSegments(hierarchy.levels, icons);
  return { width: Math.max(DEFAULT_BOUNDARY_W, chipWidth + CHIP_X * 2 + 20), height: DEFAULT_BOUNDARY_H };
}

/**
 * Renders one CloudHierarchy into `layer` and returns the created
 * <g data-cloud-hierarchy-id="...">. `icons[i]` (resolved by the caller from
 * hierarchyLevelIcon) draws a small icon immediately before level i's label in the chip — a real
 * manifest SVG for Subscription/Resource Group/VPC/Subnet, or a generic flag marker for Region.
 *
 * hierarchy.width/height size the boundary box (like CloudContainer) — the chip itself always
 * stays its natural content size, never stretched; the box can't shrink narrower than the chip
 * needs.
 */
export function renderCloudHierarchy(hierarchy: CloudHierarchy, layer: SVGGElement, selected: boolean, icons: (HierarchyLevelIcon | undefined)[]): SVGGElement {
  // Three independently-colorable elements: the boundary box's own border/tint ("Border Color"),
  // the label chip on top of it ("Ribbon Color"), and the chip's own text ("Text Color") —
  // ribbonColor falls back to the border color (and that in turn to the provider accent) so an
  // untouched hierarchy still reads as one solid color; textColor falls back to the original
  // hardcoded white.
  const lineColor = hierarchy.color ?? PROVIDER_ACCENT[hierarchy.provider];
  const ribbonColor = hierarchy.ribbonColor ?? lineColor;
  const textColor = hierarchy.textColor ?? '#FFFFFF';

  const group = createGroup(undefined, 'cloud-hierarchy');
  setAttributes(group, {
    'data-cloud-hierarchy-id': hierarchy.id,
    transform: `translate(${hierarchy.x}, ${hierarchy.y})`,
    cursor: hierarchy.locked ? 'default' : 'move',
  });

  const { segments, chipWidth } = layoutSegments(hierarchy.levels, icons);
  const minW = Math.max(DEFAULT_BOUNDARY_W, chipWidth + CHIP_X * 2 + 20);
  const boundaryW = Math.max(minW, hierarchy.width ?? DEFAULT_BOUNDARY_W);
  const boundaryH = Math.max(DEFAULT_BOUNDARY_H, hierarchy.height ?? DEFAULT_BOUNDARY_H);

  // Boundary box — mostly-transparent tinted fill + dashed border, exactly like CloudContainer,
  // including the same line-style catalog (solid/dashed/dotted/double-family/...) and a
  // color/opacity override independent of the provider accent.
  const isDouble = isDoubleLineStyle(hierarchy.style);
  const dasharray = hierarchy.style
    ? (isDouble ? DASH_BY_STYLE[DOUBLE_INNER_STYLE[hierarchy.style]] : DASH_BY_STYLE[hierarchy.style])
    : DEFAULT_DASHARRAY;

  const boxAttrs: Record<string, string | number> = {
    fill: lineColor, 'fill-opacity': hierarchy.backgroundOpacity ?? DEFAULT_BG_OPACITY,
    stroke: lineColor, 'stroke-width': BORDER_WIDTH, rx: 10, ry: 10,
    // Purely decorative — see CloudContainer's identical treatment (cloud-container-renderer.ts)
    // for why the tinted interior is click-through and a separate invisible border-hit rect
    // below is the real interaction target: lets a marquee-select drag start from inside a
    // hierarchy's boundary box instead of always grabbing/moving it.
    'pointer-events': 'none',
  };
  if (dasharray) boxAttrs['stroke-dasharray'] = dasharray;
  group.appendChild(createRect(0, 0, boundaryW, boundaryH, boxAttrs));

  group.appendChild(createRect(0, 0, boundaryW, boundaryH, {
    fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(BORDER_WIDTH + 10, 14), rx: 10, ry: 10,
    'pointer-events': 'stroke', class: 'cloud-hierarchy-border-hit',
  }));

  if (isDouble) {
    const inset = BORDER_WIDTH + 3;
    group.appendChild(createRect(inset, inset, Math.max(0, boundaryW - inset * 2), Math.max(0, boundaryH - inset * 2), {
      fill: 'none', stroke: lineColor, 'stroke-width': BORDER_WIDTH, rx: 6, ry: 6,
      ...(dasharray ? { 'stroke-dasharray': dasharray } : {}),
    }));
  }

  // Label chip ("ribbon") — straddles the box's top edge, sized to fit its content only (never
  // stretched to the box's width), colored independently of the boundary box's own border/tint.
  group.appendChild(createRect(CHIP_X, -CHIP_H / 2, chipWidth, CHIP_H, { fill: ribbonColor, rx: CHIP_H / 2, ry: CHIP_H / 2 }));

  segments.forEach((seg, i) => {
    const iconX = CHIP_X + seg.iconX;
    if (seg.icon?.type === 'image') {
      const img = createSVGElement('image', {
        x: iconX, y: -ICON_SIZE / 2, width: ICON_SIZE, height: ICON_SIZE,
      }) as SVGImageElement;
      img.setAttribute('href', seg.icon.path);
      img.setAttributeNS(XLINK_NS, 'xlink:href', seg.icon.path);
      group.appendChild(img);
    } else if (seg.icon?.type === 'flag') {
      group.appendChild(renderFlagIcon(iconX, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE));
    }

    group.appendChild(createText(CHIP_X + seg.textX, 4, seg.label, {
      fill: textColor, 'font-size': 12, 'font-family': 'Inter, sans-serif', 'font-weight': 700,
    }));

    if (i < segments.length - 1) {
      // Dimmed via fill-opacity rather than a hardcoded rgba(255,255,255,...) so the separator
      // stays a lighter variant of whatever textColor was actually chosen, not always white.
      group.appendChild(createText(CHIP_X + seg.sepX, 4, SEPARATOR, {
        fill: textColor, 'fill-opacity': 0.55, 'font-size': 12, 'font-family': 'Inter, sans-serif', 'font-weight': 400,
      }));
    }
  });

  if (selected) {
    group.appendChild(createRect(-4, -CHIP_H / 2 - 4, boundaryW + 8, boundaryH + CHIP_H / 2 + 8, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': 1.5, 'stroke-dasharray': '4,3',
      'pointer-events': 'none',
    }));
    if (!hierarchy.locked) {
      const handle = createRect(boundaryW - HANDLE_SIZE / 2, boundaryH - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE, {
        fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, rx: 2, ry: 2,
        cursor: 'nwse-resize', class: 'cloud-hierarchy-resize-handle',
      });
      setAttributes(handle, { 'data-cloud-hierarchy-id': hierarchy.id });
      group.appendChild(handle);
    }
  }

  layer.appendChild(group);
  return group;
}
