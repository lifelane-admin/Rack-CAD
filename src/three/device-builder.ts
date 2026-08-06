import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { getDeviceFrontMaterial } from './svg-texture';
import { buildLedMeshes, buildPortBezels, buildLogoPlaque } from './device-accessories';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEFAULT_DEVICE_WIDTH = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
const DEFAULT_DEVICE_DEPTH = 500;

// ── Per-category body texture ─────────────────────────────────────────────────

function makeDeviceBodyMat(color: string, category: string): THREE.MeshStandardMaterial {
  const isLight = category === 'switch' || category === 'router';

  // Boost switch/router to silver-gray; keep servers/storage dark gunmetal
  const baseHex = isLight ? '#7a8c9a' : (color || '#1a1e24');

  const TW = 256, TH = 64;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.MeshStandardMaterial({
      color: isLight ? 0x7a8c9a : 0x1a1e24, metalness: isLight ? 0.45 : 0.35, roughness: 0.55,
    });
  }

  // Base gradient (very subtle, mimics horizontal brushing)
  const g = ctx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, isLight ? '#9aaabb' : '#222830');
  g.addColorStop(0.5, isLight ? '#7a8c9a' : '#181e26');
  g.addColorStop(1, isLight ? '#6a7c8a' : '#141820');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, TH);

  // Brushed-metal micro-lines (horizontal)
  ctx.globalAlpha = 0.05;
  for (let y = 0; y < TH; y += 2) {
    ctx.fillStyle = isLight ? '#ffffff' : '#ffffff';
    ctx.fillRect(0, y, TW, 1);
  }
  ctx.globalAlpha = 1;

  // Top highlight edge
  ctx.fillStyle = isLight ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, 0, TW, 1);
  // Bottom shadow edge
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, TH - 1, TW, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return new THREE.MeshStandardMaterial({
    map: tex, metalness: isLight ? 0.5 : 0.4, roughness: 0.5,
  });
}

function makeDeviceTopMat(color: string, category: string): THREE.MeshStandardMaterial {
  const isLight = category === 'switch' || category === 'router';
  const TW = 256, TH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.MeshStandardMaterial({
      color: isLight ? 0x8a9caa : 0x1e2530, metalness: 0.6, roughness: 0.4,
    });
  }

  // Horizontal brushed grain (top-down view)
  const g = ctx.createLinearGradient(0, 0, TW, 0);
  g.addColorStop(0, isLight ? '#8a9caa' : '#1c2430');
  g.addColorStop(0.5, isLight ? '#aabbcc' : '#242e3e');
  g.addColorStop(1, isLight ? '#8a9caa' : '#1c2430');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, TH);

  // Micro horizontal lines for brushed effect
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < TH; y += 2) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, y, TW, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35 });
}

type EarStyle = 'server' | 'switch' | 'default';

function earStyle(category: string): EarStyle {
  if (category === 'server' || category === 'storage') return 'server';
  if (category === 'switch' || category === 'router' || category === 'firewall') return 'switch';
  return 'default';
}

// Color palette per ear style
const EAR_COLORS = {
  server:  { bg0: '#5a0800', bg1: '#8c1200', bg2: '#6a0a00', shade: '#3a0400', hole: '#1a0200', cross: '#cc3a20' },
  switch:  { bg0: '#8a9caa', bg1: '#aabbcc', bg2: '#9aaabb', shade: '#6a7c8a', hole: '#4a5c6a', cross: '#ccdde8' },
  default: { bg0: '#2e3a4a', bg1: '#3e4e60', bg2: '#3a4a5a', shade: '#1a2230', hole: '#0d1018', cross: '#4a5a6a' },
};

function makeBracketFaceMat(earW: number, earH: number, category: string): THREE.MeshStandardMaterial {
  const style = earStyle(category);
  const c = EAR_COLORS[style];
  const W = Math.max(Math.round(earW * 4), 8);
  const H = Math.max(Math.round(earH * 4), 8);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const fallbackColor = style === 'server' ? 0x7a1200 : style === 'switch' ? 0x9aaabb : 0x3a4a5c;
  if (!ctx) return new THREE.MeshStandardMaterial({ color: fallbackColor, metalness: 0.75, roughness: 0.35 });

  // Brushed gradient background
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0,    c.bg0);
  grad.addColorStop(0.35, c.bg1);
  grad.addColorStop(0.65, c.bg2);
  grad.addColorStop(1,    c.bg0);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Mounting slot (elongated oval in center)
  const slotH = Math.min(H * 0.45, 40);
  const slotW = W * 0.3;
  const slotX = W / 2;
  const slotY = H / 2;
  ctx.beginPath();
  ctx.ellipse(slotX, slotY, slotW / 2, slotH / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = c.shade;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(slotX, slotY, slotW / 2 - 2, slotH / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = c.hole;
  ctx.fill();

  // Screw holes at top and bottom
  const screwY = [H * 0.12, H * 0.88];
  for (const sy of screwY) {
    ctx.beginPath();
    ctx.arc(W / 2, sy, W * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = c.shade;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2, sy, W * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = c.hole;
    ctx.fill();
    // Phillips cross
    ctx.strokeStyle = c.cross;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - W * 0.11, sy); ctx.lineTo(W / 2 + W * 0.11, sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, sy - W * 0.11); ctx.lineTo(W / 2, sy + W * 0.11);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, 0, W, 1);

  const tex = new THREE.CanvasTexture(canvas);
  const isServer = style === 'server';
  const isSwitch = style === 'switch';
  return new THREE.MeshStandardMaterial({
    map: tex,
    metalness: isServer ? 0.4 : isSwitch ? 0.55 : 0.75,
    roughness:  isServer ? 0.55 : isSwitch ? 0.4 : 0.35,
  });
}

function makeEarSideMat(category: string): THREE.MeshStandardMaterial {
  const style = earStyle(category);
  if (style === 'server') {
    return new THREE.MeshStandardMaterial({ color: 0x8c1200, metalness: 0.4, roughness: 0.55 });
  }
  if (style === 'switch') {
    return new THREE.MeshStandardMaterial({ color: 0x8a9caa, metalness: 0.55, roughness: 0.4 });
  }
  return new THREE.MeshStandardMaterial({ color: 0x3a4a5c, metalness: 0.7, roughness: 0.45 });
}

export interface DeviceMeshResult {
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
  const deviceH = template.heightUnits * RU_HEIGHT - 1;
  const cfg = resolve3D(device, template);

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

  const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
  mesh.position.set(0, -totalH / 2 + deviceYFromBottom, 0);

  const deviceY = -totalH / 2 + deviceYFromBottom;

  // Mounting ear blades — always present; width is the bracket flange covering the gap to the rail
  const earMeshes: THREE.Mesh[] = [];
  const earW = (DEFAULT_DEVICE_WIDTH - cfg.width) / 2;
  if (earW > 0) {
    // Ears align flush with device front face, extend back ~20% of device depth
    const earDepth = Math.min(cfg.depth * 0.20, 80);
    // Z offset so ear front face is flush with device front face
    const earZ = (cfg.depth - earDepth) / 2;

    const earSideMat  = makeEarSideMat(template.category);
    const earFrontMat = makeBracketFaceMat(earW, deviceH, template.category);

    // BoxGeometry face order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
    const leftEarMats  = [earSideMat, earSideMat, earSideMat, earSideMat, earFrontMat, earSideMat];
    const rightEarMats = [earSideMat, earSideMat, earSideMat, earSideMat, earFrontMat, earSideMat];

    const leftEar = new THREE.Mesh(new THREE.BoxGeometry(earW, deviceH, earDepth), leftEarMats);
    leftEar.name = `ear-left-${device.id}`;
    leftEar.position.set(-(cfg.width / 2 + earW / 2), deviceY, earZ);
    earMeshes.push(leftEar);

    const rightEar = new THREE.Mesh(new THREE.BoxGeometry(earW, deviceH, earDepth), rightEarMats);
    rightEar.name = `ear-right-${device.id}`;
    rightEar.position.set(cfg.width / 2 + earW / 2, deviceY, earZ);
    earMeshes.push(rightEar);
  }

  const ledMeshes = buildLedMeshes(template, cfg, deviceH, deviceY);
  const portMeshes = buildPortBezels(template, cfg, deviceH, deviceY);
  const logoPlaque = buildLogoPlaque(template, cfg, deviceH, deviceY);
  if (logoPlaque) portMeshes.push(logoPlaque);

  return { mesh, earMeshes, ledMeshes, portMeshes };
}
