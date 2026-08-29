import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { RACK_DEPTH, DEVICE_FACE_Z } from './rack-builder';
import { getDeviceFrontMaterial } from './svg-texture';
import { buildLedMeshes, buildPortBezels, buildLogoPlaque, buildServerAccessories } from './device-accessories';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEFAULT_DEVICE_WIDTH = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
const DEFAULT_DEVICE_DEPTH = 500;

// ── Per-category body texture ─────────────────────────────────────────────────

function makeDeviceBodyMat(color: string, category: string): THREE.MeshStandardMaterial {
  const isLight = category === 'switch' || category === 'router';

  // Boost switch/router to silver-gray; keep servers/storage dark gunmetal
  const baseHex = isLight ? '#7a8c9a' : (color || '#1a1e24');

  return new THREE.MeshStandardMaterial({
    color: isLight ? 0x7a8c9a : 0x1a1e24,
    metalness: isLight ? 0.35 : 0.25,
    roughness: 0.55,
  });
}

function makeDeviceTopMat(color: string, category: string): THREE.MeshStandardMaterial {
  const isLight = category === 'switch' || category === 'router';
  return new THREE.MeshStandardMaterial({
    color: isLight ? 0x8a9caa : 0x1e2530,
    metalness: isLight ? 0.35 : 0.25,
    roughness: 0.55,
  });
}

type EarStyle = 'server' | 'switch' | 'default';

function earStyle(category: string): EarStyle {
  if (category === 'server' || category === 'storage') return 'server';
  if (category === 'switch' || category === 'router' || category === 'firewall') return 'switch';
  return 'default';
}

// Color palette per ear style (standardized to silver-gray metal to match 2D layout)
const EAR_COLORS = {
  server:  { bg0: '#3a3a3f', bg1: '#88888f', bg2: '#505055', shade: '#202025', hole: '#0c0c10', cross: '#88888f' },
  switch:  { bg0: '#3a3a3f', bg1: '#88888f', bg2: '#505055', shade: '#202025', hole: '#0c0c10', cross: '#88888f' },
  default: { bg0: '#3a3a3f', bg1: '#88888f', bg2: '#505055', shade: '#202025', hole: '#0c0c10', cross: '#88888f' },
};

import type { PortData } from '../core/types';

function makeBracketFaceMat(
  earW: number,
  earH: number,
  category: string,
  ports: PortData[],
  isLeft: boolean,
  heightUnits: number
): THREE.MeshStandardMaterial {
  const style = earStyle(category);
  const c = EAR_COLORS[style];
  const W = 256;
  const H = Math.max(Math.round(earH * 8), 64);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const fallbackColor = 0x9aaabb;
  if (!ctx) return new THREE.MeshStandardMaterial({ color: fallbackColor, metalness: 0.75, roughness: 0.35 });

  // Clear canvas for transparency support
  ctx.clearRect(0, 0, W, H);

  // Brushed gradient background
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0,    c.bg0);
  grad.addColorStop(0.35, c.bg1);
  grad.addColorStop(0.65, c.bg2);
  grad.addColorStop(1,    c.bg0);

  // Rounded plate outline
  ctx.beginPath();
  const radius = 10;
  ctx.roundRect(2, 2, W - 4, H - 4, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // Dark sheet-metal border
  ctx.strokeStyle = '#1b1d22';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // 3D inner bevel highlight
  ctx.beginPath();
  ctx.roundRect(5, 5, W - 10, H - 10, Math.max(0.5, radius - 3));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Filter ports for ear ports on this side
  const sidePorts = ports.filter(p => p.id.includes('-ear-') && p.id.includes(isLeft ? '-left-' : '-right-'));

  if (sidePorts.length === 0) {
    // Mounting slot (elongated oval in center)
    const slotH = Math.min(H * 0.45, 90);
    const slotW = W * 0.35;
    const slotX = W / 2;
    const slotY = H / 2;
    ctx.beginPath();
    ctx.ellipse(slotX, slotY, slotW / 2, slotH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.shade;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(slotX, slotY, slotW / 2 - 4, slotH / 2 - 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.hole;
    ctx.fill();

    // Screw holes at top and bottom
    const screwY = [H * 0.14, H * 0.86];
    for (const sy of screwY) {
      ctx.beginPath();
      ctx.arc(W / 2, sy, W * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = c.shade;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W / 2, sy, W * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = c.hole;
      ctx.fill();
      // Phillips cross
      ctx.strokeStyle = c.cross;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - W * 0.10, sy); ctx.lineTo(W / 2 + W * 0.10, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2, sy - W * 0.10); ctx.lineTo(W / 2, sy + W * 0.10);
      ctx.stroke();
    }
  } else {
    // Draw background shadows/holes and ultra-crisp high-contrast labels for dynamic ear ports
    const H_total = heightUnits * RU_HEIGHT;
    const labelFont = '900 24px "Arial Black", Arial, sans-serif';
    ctx.font = labelFont;
    ctx.textBaseline = 'middle';

    for (const port of sidePorts) {
      // Calculate canvas Y position based on port's relativeY
      const canvasY = (port.relativeY / H_total) * H;

      const isPowerPort = port.type === 'power';
      let leftVal = 'PW';
      let rightVal = 'Res';
      if (!isPowerPort) {
        const nameMatch = port.name.match(/S(\d+)-P(\d+)/);
        if (nameMatch) {
          leftVal = `S${nameMatch[1]}`;
          rightVal = `P${nameMatch[2]}`;
        } else if (port.name.includes('Res')) {
          leftVal = '';
          rightVal = 'Res';
        }
      }

      // Draw recessed socket housing
      const r_outer = 18;
      const r_inner = 13;

      // Outer metallic bezel ring
      ctx.beginPath();
      ctx.arc(W / 2, canvasY, r_outer, 0, Math.PI * 2);
      ctx.fillStyle = isPowerPort ? '#7a2214' : '#1f2937';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isPowerPort ? '#cc3322' : '#4b5563';
      ctx.stroke();

      // Inner socket cavity
      ctx.beginPath();
      ctx.arc(W / 2, canvasY, r_inner, 0, Math.PI * 2);
      ctx.fillStyle = isPowerPort ? (port.connected ? '#e53935' : '#1a0505') : (port.connected ? '#00e676' : '#0a0d14');
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#05070a';
      ctx.stroke();

      // Center gold contact / power indicator pin
      ctx.beginPath();
      ctx.arc(W / 2, canvasY, isPowerPort ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isPowerPort ? '#ff5252' : (port.connected ? '#ffffff' : '#ffd54f');
      ctx.fill();

      // Draw Slot / PW label on the left with high contrast outline badge
      if (leftVal) {
        ctx.textAlign = 'right';
        const lx = W / 2 - r_outer - 10;
        ctx.font = labelFont;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(leftVal, lx, canvasY);
        ctx.fillStyle = isPowerPort ? '#ffb74d' : '#00e5ff';
        ctx.fillText(leftVal, lx, canvasY);
      }

      // Draw Port / Res label on the right with high contrast outline badge
      if (rightVal) {
        ctx.textAlign = 'left';
        const rx = W / 2 + r_outer + 10;
        ctx.font = labelFont;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(rightVal, rx, canvasY);
        ctx.fillStyle = isPowerPort ? '#ff5252' : '#ffffff';
        ctx.fillText(rightVal, rx, canvasY);
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, 0, W, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  return new THREE.MeshStandardMaterial({
    map: tex,
    metalness: 0.85,
    roughness:  0.2,
    transparent: true,
  });
}

function makeEarSideMat(category: string): THREE.MeshStandardMaterial {
  const sideColor = category === 'server' || category === 'storage' ? 0x222428 : 0x2e3034;
  return new THREE.MeshStandardMaterial({ color: sideColor, metalness: 0.85, roughness: 0.25 });
}

export interface DeviceMeshResult {
  group: THREE.Group;
  mesh: THREE.Mesh;
  earMeshes: THREE.Mesh[];
  ledMeshes: THREE.Mesh[];
  portMeshes: THREE.Mesh[];
}

function resolve3D(device: DeviceData, template: DeviceTemplate) {
  return {
    depth: device.device3D?.depth ?? template.default3D?.depth ?? DEFAULT_DEVICE_DEPTH,
    width: device.device3D?.width ?? template.default3D?.width ?? DEFAULT_DEVICE_WIDTH,
    frontPanelImage: device.frontPanelImage ?? template.frontPanelImage,
  };
}

export function buildDeviceMesh(
  device: DeviceData,
  template: DeviceTemplate,
  rack: RackData,
  materials: MaterialManager
): DeviceMeshResult {
  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const deviceH = template.heightUnits * RU_HEIGHT;
  const cfg = resolve3D(device, template);

  const group = new THREE.Group();
  group.name = `device-group-${device.id}`;
  group.userData = { type: 'device', id: device.id };

  const geo = new THREE.BoxGeometry(cfg.width, deviceH, cfg.depth);
  const sideMat = makeDeviceBodyMat(template.color, template.category);
  const topMat  = makeDeviceTopMat(template.color, template.category);
  const frontMat = cfg.frontPanelImage
    ? materials.getTextured(cfg.frontPanelImage)
    : getDeviceFrontMaterial(device, template);

  // BoxGeometry face order: 0=+X, 1=-X, 2=+Y(top), 3=-Y(bot), 4=+Z(front), 5=-Z(back)
  const deviceMat = [sideMat, sideMat, topMat, sideMat, frontMat, sideMat];

  const mesh = new THREE.Mesh(geo, deviceMat);
  mesh.name = `device-${device.id}`;
  mesh.position.set(0, 0, 0);
  mesh.userData = { type: 'device', id: device.id };
  group.add(mesh);

  const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
  const zOffset = DEVICE_FACE_Z - cfg.depth / 2;
  const deviceY = -totalH / 2 + deviceYFromBottom;
  group.position.set(0, deviceY, zOffset);

  // Mounting ear blades — realistic 2.5mm sheet metal bracket flange flush against the vertical rail face
  const earMeshes: THREE.Mesh[] = [];
  const earW = (RACK_INNER_WIDTH - cfg.width) / 2;
  if (earW > 0) {
    const earDepth = 2.5;
    const earZ = cfg.depth / 2 + earDepth / 2;

    const earSideMat  = makeEarSideMat(template.category);
    const leftEarFrontMat = makeBracketFaceMat(earW, deviceH, template.category, device.ports || [], true, template.heightUnits);
    const rightEarFrontMat = makeBracketFaceMat(earW, deviceH, template.category, device.ports || [], false, template.heightUnits);

    // BoxGeometry face order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
    const leftEarMats  = [earSideMat, earSideMat, earSideMat, earSideMat, leftEarFrontMat, earSideMat];
    const rightEarMats = [earSideMat, earSideMat, earSideMat, earSideMat, rightEarFrontMat, earSideMat];

    const leftEar = new THREE.Mesh(new THREE.BoxGeometry(earW, deviceH, earDepth), leftEarMats);
    leftEar.name = `ear-left-${device.id}`;
    leftEar.position.set(-(cfg.width / 2 + earW / 2), 0, earZ);
    leftEar.userData = { type: 'device', id: device.id };
    group.add(leftEar);
    earMeshes.push(leftEar);

    const rightEar = new THREE.Mesh(new THREE.BoxGeometry(earW, deviceH, earDepth), rightEarMats);
    rightEar.name = `ear-right-${device.id}`;
    rightEar.position.set(cfg.width / 2 + earW / 2, 0, earZ);
    rightEar.userData = { type: 'device', id: device.id };
    group.add(rightEar);
    earMeshes.push(rightEar);
  }

  // Build generic interactive indicator LEDs only when there is NO custom front panel image
  const ledMeshes = cfg.frontPanelImage ? [] : buildLedMeshes(template, cfg, deviceH);
  for (const led of ledMeshes) {
    led.userData = { ...led.userData, type: 'device', id: device.id };
    group.add(led);
  }

  const portMeshes: THREE.Mesh[] = [];

  return { group, mesh, earMeshes, ledMeshes, portMeshes };
}
