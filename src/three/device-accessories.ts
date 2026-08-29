import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, PortData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { RACK_DEPTH, DEVICE_FACE_Z } from './rack-builder';

const { RACK_INNER_WIDTH, RAIL_WIDTH, RU_HEIGHT } = RACK_CONSTANTS;
const DEFAULT_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350

interface LedDef {
  localX: number;   // device-local X (from device center)
  localY: number;   // device-local Y (from device center)
  color: number;    // hex emissive color
  minIntensity: number;
  maxIntensity: number;
  speed: number;    // rad/s
  phase: number;    // initial phase offset
}

// ── LED definitions by category ──────────────────────────────────────────────

function ledDefs(template: DeviceTemplate, cfg: { width: number; depth: number }, deviceH: number): LedDef[] {
  const hw = cfg.width / 2;
  const hh = deviceH / 2;
  const fz = DEVICE_FACE_Z + 1.5; // slightly in front of front face
  const cat = template.category;

  const leds: LedDef[] = [];

  // Power LED — top-left area (like real 1U servers/switches)
  leds.push({
    localX: -hw + 14,
    localY: hh - 5,
    color: 0x00ff44,
    minIntensity: 0.6,
    maxIntensity: 1.0,
    speed: 1.2,
    phase: 0,
  });

  if (cat === 'server' || cat === 'storage') {
    // Amber activity LED below power
    leds.push({
      localX: -hw + 14,
      localY: hh - 12,
      color: 0xff8800,
      minIntensity: 0.0,
      maxIntensity: 1.2,
      speed: 8.0,            // fast blink = activity
      phase: Math.random() * Math.PI * 2,
    });
    // HDD activity LED
    leds.push({
      localX: -hw + 22,
      localY: hh - 5,
      color: 0xff6600,
      minIntensity: 0.0,
      maxIntensity: 1.0,
      speed: 14.0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  if (cat === 'switch' || cat === 'router' || cat === 'firewall') {
    // Status LEDs along the right edge
    for (let i = 0; i < 3; i++) {
      leds.push({
        localX: hw - 12 - i * 7,
        localY: 0,
        color: i === 0 ? 0x00ff44 : i === 1 ? 0xff8800 : 0x0088ff,
        minIntensity: 0.3,
        maxIntensity: 1.1,
        speed: 0.8 + i * 2.5,
        phase: (i * Math.PI * 2) / 3,
      });
    }
  }

  if (cat === 'ups' || cat === 'pdu') {
    // Load indicator LEDs (green/amber/red row)
    const colors = [0x00ff44, 0xffcc00, 0xff2200];
    for (let i = 0; i < 3; i++) {
      leds.push({
        localX: hw - 20 - i * 8,
        localY: 0,
        color: colors[i],
        minIntensity: i === 0 ? 0.7 : 0.1,
        maxIntensity: i === 0 ? 1.0 : 0.3,
        speed: 0.5 + i * 0.3,
        phase: i * 0.8,
      });
    }
  }

  // Attach Z to each def as userData at build time
  return leds.map(d => ({ ...d })) as any;
}

// ── Build LED meshes ──────────────────────────────────────────────────────────

const ledGeo = new THREE.SphereGeometry(1.8, 8, 6);

export function buildLedMeshes(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
): THREE.Mesh[] {
  const fz = cfg.depth / 2 + 0.45; // flush with front face plate in local space
  const meshes: THREE.Mesh[] = [];

  for (const def of ledDefs(template, cfg, deviceH)) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: def.minIntensity,
      roughness: 0.2,
      metalness: 0.0,
    });
    const m = new THREE.Mesh(ledGeo, mat);
    m.name = 'led';
    m.position.set(def.localX, def.localY, fz);
    m.userData = {
      minI:  def.minIntensity,
      maxI:  def.maxIntensity,
      speed: def.speed,
      phase: def.phase,
    };
    meshes.push(m);
  }
  return meshes;
}

// ── Build port bezel meshes ───────────────────────────────────────────────────

const PORT_SIZES: Record<string, [number, number, number]> = {
  'rj45':      [10, 7, 6],
  'sfp':       [11, 8, 8],
  'sfp-plus':  [11, 8, 8],
  'qsfp28':    [14, 10, 8],
  'power':     [12, 10, 5],
  'c13-power': [14, 10, 5],
  'c19-power': [16, 12, 5],
  'usb':       [8, 4, 3],
  'console':   [9, 6, 4],
  'vga':       [14, 8, 4],
};

const PORT_COLORS: Record<string, number> = {
  'rj45':      0x0a0e14,
  'sfp':       0x101820,
  'sfp-plus':  0x101820,
  'qsfp28':    0x101820,
  'power':     0x1a0505,
  'c13-power': 0x1a0505,
  'c19-power': 0x140404,
  'usb':       0x0a0c10,
  'console':   0x0e141a,
  'vga':       0x0a1020,
};

export function buildPortBezels(
  _ports: PortData[],
  _cfg: { width: number; depth: number },
  _deviceH: number,
  _heightUnits: number,
): THREE.Mesh[] {
  // Ultra-crisp vector ports, bezels, gold contacts, and LED halos are drawn directly on the 10x front SVG texture
  return [];
}

// ── Build logo badge ─────────────────────────────────────────────────────────

export function buildLogoPlaque(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
): THREE.Mesh | null {
  const label = template.manufacturer ?? template.name;
  if (!label) return null;

  const PW = 36;
  const PH = Math.min(18, deviceH - 6);
  if (PH < 6) return null;

  const TW = 128;
  const TH = 64;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, TH);
  grad.addColorStop(0, '#2a303c');
  grad.addColorStop(1, '#181c24');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TW, TH);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, 0, TW, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, TH - 2, TW, 2);

  const fontSize = Math.max(14, Math.min(22, TH * 0.38));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  ctx.fillText(label.toUpperCase(), 12, TH / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.4, roughness: 0.3 });

  const geo = new THREE.BoxGeometry(PW, PH, 1.5);
  const plaque = new THREE.Mesh(geo, mat);
  plaque.name = 'logo-plaque';

  plaque.rotation.y = -Math.PI / 2;
  plaque.position.set(
    cfg.width / 2 + 1,
    deviceH * 0.15,
    0,
  );

  return plaque;
}

// ── Build server accessories (drive bays, grilles, and displays) ─────────────

export function buildServerAccessories(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
): THREE.Mesh[] {
  const cat = template.category;
  if (cat !== 'server' && cat !== 'storage') return [];

  const meshes: THREE.Mesh[] = [];
  const fz = cfg.depth / 2 + 0.4;
  const H = template.heightUnits * RU_HEIGHT;
  const chH = H - 4;
  const chY = 2;

  const toLocalX = (x: number) => -cfg.width / 2 + (x / DEFAULT_W) * cfg.width;
  const toLocalY = (y: number) => deviceH / 2 - (y / H) * deviceH;
  const scaleX = (w: number) => (w / DEFAULT_W) * cfg.width;
  const scaleY = (h: number) => (h / H) * deviceH;

  const bayW = 32, bayH = Math.min(22, chH - 8);
  const bayCount = template.id.includes('4u') ? 8 : template.id.includes('hd') ? 6 : 4;
  const bayStartX = 12;

  const bayMat = new THREE.MeshStandardMaterial({ color: 0x24292e, metalness: 0.6, roughness: 0.4 });
  const latchMat = new THREE.MeshStandardMaterial({ color: 0x111113, metalness: 0.1, roughness: 0.8 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 0.8 });

  for (let b = 0; b < bayCount; b++) {
    const bx = bayStartX + b * (bayW + 3);
    const by = chY + 4;

    const w3D = scaleX(bayW);
    const h3D = scaleY(bayH);
    const lx = toLocalX(bx + bayW / 2);
    const ly = toLocalY(by + bayH / 2);

    const bayGeo = new THREE.BoxGeometry(w3D, h3D, 2.5);
    const bay = new THREE.Mesh(bayGeo, bayMat);
    bay.name = 'server-drive-bay';
    bay.position.set(lx, ly, fz + 1.25);
    meshes.push(bay);

    const latchW = w3D * 0.75;
    const latchH = h3D * 0.25;
    const latchGeo = new THREE.BoxGeometry(latchW, latchH, 1.0);
    const latch = new THREE.Mesh(latchGeo, latchMat);
    latch.name = 'server-drive-latch';
    latch.position.set(lx, ly - h3D * 0.1, fz + 2.5);
    meshes.push(latch);

    const ledGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.name = 'server-drive-led';
    led.position.set(lx - w3D * 0.35, ly + h3D * 0.25, fz + 2.6);
    meshes.push(led);
  }

  const grillX = bayStartX + bayCount * (bayW + 3) + 6;
  const grillW = DEFAULT_W - grillX - 90;
  if (grillW > 20) {
    const gw3D = scaleX(grillW);
    const gh3D = scaleY(chH - 8);
    const lx = toLocalX(grillX + grillW / 2);
    const ly = toLocalY(chY + 4 + (chH - 8) / 2);

    const bgGeo = new THREE.BoxGeometry(gw3D, gh3D, 1);
    const bgMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.95 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.name = 'server-grille-bg';
    bg.position.set(lx, ly, fz - 0.5);
    meshes.push(bg);

    const slatCount = Math.floor(grillW / 6);
    const slatW3D = scaleX(1.5);
    const slatGeo = new THREE.BoxGeometry(slatW3D, gh3D, 1.5);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x1d2127, metalness: 0.8, roughness: 0.3 });
    for (let s = 0; s < slatCount; s++) {
      const sx = grillX + 3 + s * 6;
      const slx = toLocalX(sx);
      const slat = new THREE.Mesh(slatGeo, slatMat);
      slat.name = 'server-grille-slat';
      slat.position.set(slx, ly, fz + 0.75);
      meshes.push(slat);
    }
  }

  const lcdX = grillX + grillW + 4;
  const lcdW = 40;
  const lcdH = Math.min(chH - 8, 16);
  const lw3D = scaleX(lcdW);
  const lh3D = scaleY(lcdH);
  const lx = toLocalX(lcdX + lcdW / 2);
  const ly = toLocalY(chY + 4 + lcdH / 2);

  const lcdBezelGeo = new THREE.BoxGeometry(lw3D + 2, lh3D + 2, 1.5);
  const lcdBezelMat = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.3, roughness: 0.6 });
  const lcdBezel = new THREE.Mesh(lcdBezelGeo, lcdBezelMat);
  lcdBezel.name = 'server-lcd-bezel';
  lcdBezel.position.set(lx, ly, fz + 0.75);
  meshes.push(lcdBezel);

  const lcdScreenGeo = new THREE.BoxGeometry(lw3D, lh3D, 0.8);
  const lcdScreenMat = new THREE.MeshStandardMaterial({
    color: 0x00a8ff,
    emissive: 0x00a8ff,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });
  const lcdScreen = new THREE.Mesh(lcdScreenGeo, lcdScreenMat);
  lcdScreen.name = 'server-lcd-screen';
  lcdScreen.position.set(lx, ly, fz + 1.3);
  meshes.push(lcdScreen);

  return meshes;
}
