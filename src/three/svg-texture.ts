import * as THREE from 'three';
import type { DeviceData, DeviceTemplate } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { renderFrontPanel } from '../renderers/panel-renderer';

const { RACK_INNER_WIDTH, RAIL_WIDTH, RU_HEIGHT } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
const SVG_NS = 'http://www.w3.org/2000/svg';
const SCALE = 8; // 8× pixel density for crisp, high-resolution rendering in 3D

interface Entry {
  mat: THREE.MeshStandardMaterial;
  canvas: HTMLCanvasElement;
  templateId: string;
  connHash: string;
}

const cache = new Map<string, Entry>();

function connHash(device: DeviceData): string {
  return device.ports
    .filter(p => p.connected && p.cableId)
    .map(p => p.id)
    .sort()
    .join(',');
}

export function getDeviceFrontMaterial(
  device: DeviceData,
  template: DeviceTemplate,
): THREE.MeshStandardMaterial {
  const hash = connHash(device);
  const cached = cache.get(device.id);

  if (cached && cached.templateId === template.id) {
    if (cached.connHash !== hash) {
      // Port connectivity changed — re-render, same material
      cached.connHash = hash;
      renderSVGToCanvas(device, template, cached.canvas).then(ok => {
        if (ok) (cached.mat.map as THREE.CanvasTexture).needsUpdate = true;
      });
    }
    return cached.mat;
  }

  // New device or template changed → fresh canvas + material
  const W = DEVICE_W * SCALE;
  const H = Math.max(template.heightUnits * RU_HEIGHT * SCALE, 4);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  // Immediate solid-colour placeholder while SVG loads
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = template.color;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // Enable anisotropic filtering for maximum crispness
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.12,
    roughness: 0.50,
    transparent: true,
    alphaTest: 0.15
  });

  cache.set(device.id, { mat, canvas, templateId: template.id, connHash: hash });

  renderSVGToCanvas(device, template, canvas).then(ok => {
    if (ok) texture.needsUpdate = true;
  });

  return mat;
}

async function renderSVGToCanvas(
  device: DeviceData,
  template: DeviceTemplate,
  canvas: HTMLCanvasElement,
): Promise<boolean> {
  try {
    const W = DEVICE_W;
    const H = template.heightUnits * RU_HEIGHT;

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const connectedPortIds = new Set(
      device.ports.filter(p => p.connected && p.cableId).map(p => p.id),
    );

    const panel = renderFrontPanel(
      template.category,
      template,
      device,
      W,
      H,
      new Set(),
      connectedPortIds,
    );
    svg.appendChild(panel);

    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Punch transparent holes in the front panel texture at port positions
        if (device.ports && device.ports.length > 0) {
          const localPortSizes: Record<string, [number, number]> = {
            'rj45':      [10, 7],
            'sfp':       [11, 8],
            'sfp-plus':  [11, 8],
            'qsfp28':    [14, 10],
            'power':     [12, 10],
            'c13-power': [14, 10],
            'c19-power': [16, 12],
            'usb':       [8, 4],
            'console':   [9, 6],
            'vga':       [14, 8],
          };
          for (const port of device.ports) {
            if (port.id.includes('-ear-')) continue;
            const cx = (port.relativeX / W) * canvas.width;
            const cy = (port.relativeY / H) * canvas.height;
            const pSize = localPortSizes[port.type] || [8, 6];
            // Clear a slightly smaller rectangle (0.4 margin) so the jack bezel is tucked nicely behind the cutout
            const pw = ((port.portW ?? pSize[0]) - 0.4) * SCALE;
            const ph = ((port.portH ?? pSize[1]) - 0.4) * SCALE;
            ctx.clearRect(cx - pw / 2, cy - ph / 2, pw, ph);
          }
        }

        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = err => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });

    return true;
  } catch (e) {
    console.warn('[svg-texture] render failed:', e);
    return false;
  }
}

export function disposeSVGTextures(): void {
  for (const { mat } of cache.values()) {
    mat.map?.dispose();
    mat.dispose();
  }
  cache.clear();
}
