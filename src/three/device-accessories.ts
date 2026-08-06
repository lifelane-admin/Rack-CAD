import * as THREE from 'three';
import type { DeviceData, DeviceTemplate } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';

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
  const fz = cfg.depth / 2 + 2; // slightly in front of front face
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
  return leds.map(d => ({ ...d, _fz: fz })) as any;
}

// ── Build LED meshes ──────────────────────────────────────────────────────────

const ledGeo = new THREE.SphereGeometry(1.8, 8, 6);

export function buildLedMeshes(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
  deviceY: number,       // world Y of device center within rack group
): THREE.Mesh[] {
  const fz = cfg.depth / 2 + 2;
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
    m.position.set(def.localX, deviceY + def.localY, fz);
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
  'qsfp28':    0x151e28,
  'power':     0x1a1a1a,
  'c13-power': 0x1a1a1a,
  'c19-power': 0x1a1a1a,
  'usb':       0x0a0a0f,
  'console':   0x0d1018,
  'vga':       0x151015,
};

export function buildPortBezels(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
  deviceY: number,
): THREE.Mesh[] {
  const ports = template.ports;
  if (!ports || ports.length === 0) return [];

  const meshes: THREE.Mesh[] = [];
  const scaleX = cfg.width / DEFAULT_W;
  const scaleY = deviceH / (template.heightUnits * RU_HEIGHT);
  const fz = cfg.depth / 2;                   // front face Z
  const MAX_PORTS = 48;

  for (let i = 0; i < Math.min(ports.length, MAX_PORTS); i++) {
    const port = ports[i];
    const [pw, ph, pd] = PORT_SIZES[port.type] ?? [8, 6, 4];
    const color = PORT_COLORS[port.type] ?? 0x0d1018;

    const localX = -cfg.width / 2 + (port.relativeX / DEFAULT_W) * cfg.width;
    const localY = deviceH / 2 - (port.relativeY / (template.heightUnits * RU_HEIGHT)) * deviceH;

    // Outer bezel (darker surround)
    const bezelGeo = new THREE.BoxGeometry(pw + 3, ph + 3, pd * 0.4);
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, metalness: 0.7, roughness: 0.4 });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.name = 'port-bezel';
    bezel.position.set(localX, deviceY + localY, fz + pd * 0.3);
    meshes.push(bezel);

    // Inner socket hole (very dark recessed box)
    const holeGeo = new THREE.BoxGeometry(pw, ph, pd * 0.8);
    const holeMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.9 });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.name = 'port-hole';
    hole.position.set(localX, deviceY + localY, fz + pd * 0.1);
    meshes.push(hole);
  }

  return meshes;
}

// ── Build logo plaque ─────────────────────────────────────────────────────────

export function buildLogoPlaque(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
  deviceY: number,
): THREE.Mesh | null {
  const label = template.manufacturer ?? template.name;
  if (!label) return null;

  const PW = Math.min(cfg.depth * 0.40, 120);
  const PH = Math.min(deviceH * 0.55, 16);
  const TW = 256, TH = 64;

  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Brushed-metal background
  const g = ctx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#3a4a5a');
  g.addColorStop(0.5, '#4a5a6a');
  g.addColorStop(1, '#2e3e4e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, TH);

  // Edge highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, 0, TW, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, TH - 2, TW, 2);

  // Logo text
  const fontSize = Math.max(14, Math.min(22, TH * 0.38));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  ctx.fillText(label.toUpperCase(), 8, TH / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.4 });

  const geo = new THREE.BoxGeometry(PW, PH, 1.5);
  const plaque = new THREE.Mesh(geo, mat);
  plaque.name = 'logo-plaque';

  // Place on right side panel, rotated to face right (+X direction)
  plaque.rotation.y = -Math.PI / 2;
  plaque.position.set(
    cfg.width / 2 + 1,         // right face of device
    deviceY + deviceH * 0.15,  // slightly above center
    0,                          // rack-group Z center (mid-depth of device)
  );

  return plaque;
}
