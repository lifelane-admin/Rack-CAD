// Renders a CloudContainer (see core/types.ts) — a background boundary box representing a
// VPC/Subnet/Resource-Group/AZ/Region — into the 'cloud-container-layer'. Decorative only in
// this phase: does not track or move nodes visually inside it. Generic rect styling (border
// treatment varies by `kind`, see BORDER_STYLE_BY_KIND) with a provider-accent color, not each
// vendor's pixel-exact official boundary conventions.
import { CloudContainer, CloudProvider } from '../core/types';
import { createGroup, createRect, createSVGElement, createText, setAttributes } from '../utils/svg-helpers';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const HANDLE_SIZE = 12;
const ICON_SIZE = 16;

const PROVIDER_ACCENT: Record<CloudProvider, string> = {
  aws: '#FF9900',
  azure: '#0078D4',
  gcp: '#4285F4',
};
const GENERIC_ACCENT = '#8b949e';

/** Border treatment per boundary kind — a lightweight nod to real diagramming convention (outer
 *  boundaries read as more solid/heavier, inner ones as lighter/dashed) without attempting each
 *  vendor's exact official line spec. */
const BORDER_STYLE_BY_KIND: Record<CloudContainer['kind'], { dasharray?: string; width: number }> = {
  account: { dasharray: '14,4', width: 2.5 },  // long-dash, heaviest — outermost org/billing boundary
  region: { width: 2.5 },                     // solid, heaviest — outermost geographic boundary
  vpc: { width: 2 },                          // solid
  'resource-group': { dasharray: '10,3,2,3', width: 1.5 }, // dash-dot
  az: { dasharray: '2,3', width: 1.5 },        // dotted
  subnet: { dasharray: '6,4', width: 1.5 },    // dashed
  generic: { dasharray: '6,4', width: 1.5 },   // dashed (unchanged default)
};

function accentColor(container: CloudContainer): string {
  if (container.color) return container.color;
  if (container.provider) return PROVIDER_ACCENT[container.provider];
  return GENERIC_ACCENT;
}

/**
 * Renders one CloudContainer into `layer` and returns the created
 * <g data-cloud-container-id="...">. `iconPath` (resolved by the caller from
 * container.iconId via cloud-icon-catalog.ts, same pattern as renderCloudNode) draws a small
 * icon next to the label chip when the container was created from a boundary-type palette icon
 * (e.g. dropping Azure's "Virtual Networks").
 */
export function renderCloudContainer(container: CloudContainer, layer: SVGGElement, selected: boolean, iconPath?: string): SVGGElement {
  const group = createGroup(undefined, 'cloud-container');
  const accent = accentColor(container);
  const border = BORDER_STYLE_BY_KIND[container.kind] ?? BORDER_STYLE_BY_KIND.generic;
  setAttributes(group, {
    'data-cloud-container-id': container.id,
    transform: `translate(${container.x}, ${container.y})`,
    cursor: container.locked ? 'default' : 'move',
  });

  const rectAttrs: Record<string, string | number> = {
    fill: `${accent}14`, stroke: accent, 'stroke-width': border.width, rx: 8, ry: 8,
  };
  if (border.dasharray) rectAttrs['stroke-dasharray'] = border.dasharray;
  group.appendChild(createRect(0, 0, container.width, container.height, rectAttrs));

  if (container.label) {
    const hasIcon = !!iconPath;
    const chipW = Math.min(Math.max(container.label.length * 6.5 + (hasIcon ? ICON_SIZE + 24 : 16), 40), container.width - 8);
    group.appendChild(createRect(8, -10, chipW, 20, { fill: accent, rx: 4, ry: 4 }));
    if (hasIcon) {
      const img = createSVGElement('image', { x: 12, y: -8, width: ICON_SIZE, height: ICON_SIZE }) as SVGImageElement;
      img.setAttribute('href', iconPath!);
      img.setAttributeNS(XLINK_NS, 'xlink:href', iconPath!);
      group.appendChild(img);
    }
    group.appendChild(createText(8 + chipW / 2 + (hasIcon ? ICON_SIZE / 2 : 0), 4, container.label, {
      'text-anchor': 'middle', 'font-size': 11, 'font-family': 'Inter, sans-serif', fill: '#0d1117', 'font-weight': 600,
    }));
  }

  if (selected) {
    group.appendChild(createRect(-4, -4, container.width + 8, container.height + 8, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': 1.5, 'stroke-dasharray': '4,3',
      'pointer-events': 'none',
    }));

    if (!container.locked) {
      const handle = createRect(
        container.width - HANDLE_SIZE / 2, container.height - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE,
        { fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, rx: 2, ry: 2, cursor: 'nwse-resize', class: 'cloud-container-resize-handle' }
      );
      setAttributes(handle, { 'data-cloud-container-id': container.id });
      group.appendChild(handle);
    }
  }

  layer.appendChild(group);
  return group;
}
