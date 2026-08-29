import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { renderSidePdu, computePduLoad } from '../renderers/pdu-renderer';

const { RACK_INNER_WIDTH, RAIL_WIDTH, RU_HEIGHT } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
const SVG_NS = 'http://www.w3.org/2000/svg';
const SCALE = 10; // 10× pixel density for ultra-crisp, high-definition 2D quality in 3D

interface Entry {
  mat: THREE.MeshStandardMaterial;
  canvas: HTMLCanvasElement;
  templateId: string;
  connHash: string;
}

const cache = new Map<string, Entry>();

function connHash(device: DeviceData): string {
  const portStr = device.ports
    .filter(p => p.connected && p.cableId)
    .map(p => p.id)
    .sort()
    .join(',');
  const cfgStr = JSON.stringify(device.deviceConfig || {});
  return `${portStr}|${device.color || ''}|${cfgStr}`;
}

export function getDeviceFrontMaterial(
  device: DeviceData,
  template: DeviceTemplate,
): THREE.MeshStandardMaterial {
  const hash = connHash(device);
  const cached = cache.get(device.id);

  if (cached && cached.templateId === template.id) {
    if (cached.connHash !== hash) {
      // Port connectivity or device color changed — re-render, same material
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
  ctx.fillStyle = device.color || template.color;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16; // 16× anisotropic filtering for maximum crispness
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.20,
    roughness: 0.45,
  });

  cache.set(device.id, { mat, canvas, templateId: template.id, connHash: hash });

  renderSVGToCanvas(device, template, canvas).then(ok => {
    if (ok) {
      texture.needsUpdate = true;
      mat.needsUpdate = true;
    }
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

export function getSidePdu3DMaterial(
  rack: RackData,
  side: 'left' | 'right',
  pduDevice: DeviceData,
  pduTemplate: DeviceTemplate,
  pduW: number,
  innerHeight: number
): THREE.MeshStandardMaterial {
  const { watts } = computePduLoad(pduDevice.id);
  const cfgHash = `${JSON.stringify(pduDevice.deviceConfig || {})}_w:${watts}`;
  const cacheKey = `pdu-${pduDevice.id}-${side}-${pduW}-${innerHeight}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    if (cached.connHash !== cfgHash) {
      cached.connHash = cfgHash;
      renderPduSVGToCanvas(side, pduDevice, pduTemplate, pduW, innerHeight, cached.canvas).then(ok => {
        if (ok) (cached.mat.map as THREE.CanvasTexture).needsUpdate = true;
      });
    }
    return cached.mat;
  }

  const SCALE_PDU = 4;
  const W = pduW * SCALE_PDU;
  const H = innerHeight * SCALE_PDU;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#16191f';
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.15,
    roughness: 0.45,
    transparent: true,
  });

  cache.set(cacheKey, { mat, canvas, templateId: pduTemplate.id, connHash: cfgHash });

  renderPduSVGToCanvas(side, pduDevice, pduTemplate, pduW, innerHeight, canvas).then(ok => {
    if (ok) texture.needsUpdate = true;
  });

  return mat;
}

async function renderPduSVGToCanvas(
  side: 'left' | 'right',
  pduDevice: DeviceData,
  pduTemplate: DeviceTemplate,
  pduW: number,
  innerHeight: number,
  canvas: HTMLCanvasElement
): Promise<boolean> {
  try {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(pduW));
    svg.setAttribute('height', String(innerHeight));
    svg.setAttribute('viewBox', `0 0 ${pduW} ${innerHeight}`);

    const pduGrp = renderSidePdu(pduTemplate, pduW, innerHeight, side, pduDevice);
    svg.appendChild(pduGrp);

    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = err => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });
    return true;
  } catch (e) {
    console.warn('[svg-texture] render PDU failed:', e);
    return false;
  }
}

function adjustHexColor(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex.length === 3 ? cleanHex.split('').map(c => c + c).join('') : cleanHex, 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

function getVcmSizeLabel(w?: string): string {
  switch (w) {
    case '2-inch': return '2" VCM';
    case '4-inch': return '4" VCM';
    case '6-inch': return '6" VCM';
    case '8-inch': return '8" VCM';
    default: return '4" VCM';
  }
}

export function getVcm3DMaterial(
  rack: RackData,
  side: 'left' | 'right',
  vcmWidth: number,
  totalHeight: number,
  units: number
): THREE.MeshStandardMaterial {
  const color = side === 'left' ? (rack.leftCableManagerColor || rack.rackColor || '#11141a') : (rack.rightCableManagerColor || rack.rackColor || '#11141a');
  const cacheKey = `vcm-${rack.id}-${side}-${color}-${vcmWidth}-${totalHeight}-${units}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached.mat;

  const SCALE_VCM = 4;
  const W = vcmWidth * SCALE_VCM;
  const H = totalHeight * SCALE_VCM;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.15,
    roughness: 0.55,
    transparent: true,
  });

  cache.set(cacheKey, { mat, canvas, templateId: '', connHash: '' });

  renderVcmSVGToCanvas(rack, side, color, vcmWidth, totalHeight, units, canvas).then(ok => {
    if (ok) texture.needsUpdate = true;
  });

  return mat;
}

async function renderVcmSVGToCanvas(
  rack: RackData,
  side: 'left' | 'right',
  color: string,
  vcmWidth: number,
  totalHeight: number,
  units: number,
  canvas: HTMLCanvasElement
): Promise<boolean> {
  try {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(vcmWidth));
    svg.setAttribute('height', String(totalHeight));
    svg.setAttribute('viewBox', `0 0 ${vcmWidth} ${totalHeight}`);

    // Main channel background
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(vcmWidth));
    bgRect.setAttribute('height', String(totalHeight));
    bgRect.setAttribute('fill', color);
    bgRect.setAttribute('stroke', adjustHexColor(color, 25));
    bgRect.setAttribute('stroke-width', '1.2');
    bgRect.setAttribute('rx', '3');
    svg.appendChild(bgRect);

    // Inner RU slits & loops
    const innerY = RACK_CONSTANTS.RACK_PADDING_TOP;
    const innerHeight = units * RU_HEIGHT;
    for (let u = 1; u <= units; u++) {
      const yOffset = innerY + innerHeight - (u * RU_HEIGHT);
      const slit = document.createElementNS(SVG_NS, 'rect');
      slit.setAttribute('x', '2');
      slit.setAttribute('y', String(yOffset + 6));
      slit.setAttribute('width', String(Math.max(8, vcmWidth - 4)));
      slit.setAttribute('height', '12');
      slit.setAttribute('fill', '#08080a');
      slit.setAttribute('stroke', '#21262d');
      slit.setAttribute('stroke-width', '0.6');
      slit.setAttribute('rx', '1');
      svg.appendChild(slit);

      // Silver loop
      const loop = document.createElementNS(SVG_NS, 'path');
      const loopX = side === 'left' ? 3 : (vcmWidth - 3);
      const controlX = side === 'left' ? -2 : (vcmWidth + 2);
      loop.setAttribute('d', `M ${loopX} ${yOffset + 12} Q ${controlX} ${yOffset + 12} ${loopX} ${yOffset + 20}`);
      loop.setAttribute('fill', 'none');
      loop.setAttribute('stroke', '#8b949e');
      loop.setAttribute('stroke-width', '1.2');
      svg.appendChild(loop);
    }

    // Cover centerline
    const centerLine = document.createElementNS(SVG_NS, 'line');
    centerLine.setAttribute('x1', String(vcmWidth / 2));
    centerLine.setAttribute('y1', '10');
    centerLine.setAttribute('x2', String(vcmWidth / 2));
    centerLine.setAttribute('y2', String(totalHeight - 10));
    centerLine.setAttribute('stroke', '#30363d');
    centerLine.setAttribute('stroke-width', '1');
    centerLine.setAttribute('stroke-dasharray', '8,8');
    svg.appendChild(centerLine);

    // Cyan rotated label
    const label = document.createElementNS(SVG_NS, 'text');
    const labelX = vcmWidth / 2 - 2;
    const labelY = totalHeight - 40;
    label.setAttribute('x', String(labelX));
    label.setAttribute('y', String(labelY));
    label.setAttribute('fill', '#58a6ff');
    label.setAttribute('font-size', '4.5');
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('transform', `rotate(-90, ${labelX}, ${labelY})`);
    label.setAttribute('opacity', '0.85');
    const mgrWidthStr = side === 'left' ? rack.leftCableManagerWidth : rack.rightCableManagerWidth;
    label.textContent = `${side.toUpperCase()} ${getVcmSizeLabel(mgrWidthStr)}`;
    svg.appendChild(label);

    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = err => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });
    return true;
  } catch (e) {
    console.warn('[svg-texture] render VCM failed:', e);
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
