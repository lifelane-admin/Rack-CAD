// Renders a user-uploaded ImageAsset (see core/types.ts) into the canvas's `label-layer`,
// alongside text labels. Uses a plain SVG <image> referencing the asset's data URL — PNG/GIF/
// WEBP/SVG alpha transparency is preserved automatically since it's the real uploaded bytes.
import { ImageAsset } from '../core/types';
import { createGroup, createRect, createSVGElement, setAttributes } from '../utils/svg-helpers';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const HANDLE_SIZE = 12;

/**
 * Renders one ImageAsset into `layer` and returns the created <g data-image-id="...">.
 * `selected` draws a dashed outline plus a bottom-right resize handle; callers (app.ts
 * renderAll) recompute this on every render from the current selection.
 */
export function renderImageAsset(asset: ImageAsset, layer: SVGGElement, selected: boolean): SVGGElement {
  const group = createGroup(undefined, 'image-asset');
  const cx = asset.width / 2;
  const cy = asset.height / 2;
  setAttributes(group, {
    'data-image-id': asset.id,
    transform: `translate(${asset.x}, ${asset.y}) rotate(${asset.rotation || 0}, ${cx}, ${cy})`,
    cursor: asset.locked ? 'default' : 'move',
  });

  // Full-bounds hit target so clicking a transparent region of the image (common for logos)
  // still selects/drags it — <image> elements otherwise only hit-test their opaque pixels
  // in some renderers.
  group.appendChild(createRect(0, 0, asset.width, asset.height, {
    fill: 'transparent', stroke: 'none', class: 'image-asset-hit',
  }));

  const img = createSVGElement('image', {
    x: 0, y: 0, width: asset.width, height: asset.height,
    opacity: asset.opacity ?? 1, preserveAspectRatio: 'none',
  }) as SVGImageElement;
  img.setAttribute('href', asset.src);
  img.setAttributeNS(XLINK_NS, 'xlink:href', asset.src);
  group.appendChild(img);

  if (selected) {
    group.appendChild(createRect(-4, -4, asset.width + 8, asset.height + 8, {
      fill: 'none', stroke: '#58a6ff', 'stroke-width': 1.5, 'stroke-dasharray': '4,3',
      'pointer-events': 'none',
    }));

    if (!asset.locked) {
      const handle = createRect(
        asset.width - HANDLE_SIZE / 2, asset.height - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE,
        { fill: '#58a6ff', stroke: '#0d1117', 'stroke-width': 1, rx: 2, ry: 2, cursor: 'nwse-resize', class: 'image-resize-handle' }
      );
      setAttributes(handle, { 'data-image-id': asset.id });
      group.appendChild(handle);
    }
  }

  layer.appendChild(group);
  return group;
}
