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
  const fz = DEVICE_FACE_Z + 0.45; // flush with front face plate
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
  ports: PortData[],
  cfg: { width: number; depth: number },
  deviceH: number,
  deviceY: number,
  heightUnits: number,
): THREE.Mesh[] {
  if (!ports || ports.length === 0) return [];

  const meshes: THREE.Mesh[] = [];
  const scaleX = cfg.width / DEFAULT_W;
  const scaleY = deviceH / (heightUnits * RU_HEIGHT);
  const fz = DEVICE_FACE_Z + 0.4;                   // front face Z
  const MAX_PORTS = 120; // Allow more ports to accommodate ear ports comfortably

  // Shared materials for accessories
  const metalBezelMat = new THREE.MeshStandardMaterial({ color: 0x9aa8b5, metalness: 0.95, roughness: 0.2 });
  const darkPlasticBezelMat = new THREE.MeshStandardMaterial({ color: 0x181e26, metalness: 0.4, roughness: 0.6 });
  const goldPinMat = new THREE.MeshStandardMaterial({
    color: 0xe5c158,
    metalness: 0.95,
    roughness: 0.1,
    emissive: 0xe5c158,
    emissiveIntensity: 0.15
  });
  const blueLatchMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, roughness: 0.4 });
  const usbTongueMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, roughness: 0.5 });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.85 });

  for (let i = 0; i < Math.min(ports.length, MAX_PORTS); i++) {
    const port = ports[i];
    const localX = -cfg.width / 2 + (port.relativeX / DEFAULT_W) * cfg.width;
    const localY = deviceH / 2 - (port.relativeY / (heightUnits * RU_HEIGHT)) * deviceH;

    // Skip ear-mounted ports — their sockets, screws, and labels are drawn directly on the ear plate texture
    if (port.id.includes('-ear-') || port.relativeX < 24 || port.relativeX > DEFAULT_W - 24) {
      continue;
    }

    const defaultSizes = PORT_SIZES[port.type] ?? [8, 6, 4];
    const pw = port.portW ?? defaultSizes[0];
    const ph = port.portH ?? defaultSizes[1];
    const pd = defaultSizes[2];
    const color = PORT_COLORS[port.type] ?? 0x0d1018;

    const holeMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.9 });

    if (port.type === 'rj45') {
      // 1. Recessed Front Bezel Faceplate of the RJ45 Jack (recessed behind the faceplate cutout)
      const frameD = 0.3;
      const frameZ = fz - frameD / 2; // fz - 0.15
      const silverBezelMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.9, roughness: 0.25 });

      // Frame Left Column
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, ph, frameD), silverBezelMat);
      fLeft.position.set(localX - pw / 2 + 0.4, deviceY + localY, frameZ);
      meshes.push(fLeft);

      // Frame Right Column
      const fRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, ph, frameD), silverBezelMat);
      fRight.position.set(localX + pw / 2 - 0.4, deviceY + localY, frameZ);
      meshes.push(fRight);

      // Frame Top Bar
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(pw - 1.6, 0.4, frameD), silverBezelMat);
      fTop.position.set(localX, deviceY + localY + ph / 2 - 0.2, frameZ);
      meshes.push(fTop);

      // Frame Left Step Shoulder (bottom-left)
      const fLeftShoulder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.8, frameD), silverBezelMat);
      fLeftShoulder.position.set(localX - pw / 2 + 1.4, deviceY + localY - ph / 2 + 1.4, frameZ);
      meshes.push(fLeftShoulder);

      // Frame Right Step Shoulder (bottom-right)
      const fRightShoulder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.8, frameD), silverBezelMat);
      fRightShoulder.position.set(localX + pw / 2 - 1.4, deviceY + localY - ph / 2 + 1.4, frameZ);
      meshes.push(fRightShoulder);

      // Frame Bottom Thin Bar
      const fBot = new THREE.Mesh(new THREE.BoxGeometry(pw - 4.0, 0.2, frameD), silverBezelMat);
      fBot.position.set(localX, deviceY + localY - ph / 2 + 0.1, frameZ);
      meshes.push(fBot);

      // Small ground spring tabs on the left and right inner edges of the bezel
      const fLeftTab = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.4), silverBezelMat);
      fLeftTab.position.set(localX - pw / 2 + 0.8, deviceY + localY, fz - 0.1);
      meshes.push(fLeftTab);

      const fRightTab = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.4), silverBezelMat);
      fRightTab.position.set(localX + pw / 2 - 0.8, deviceY + localY, fz - 0.1);
      meshes.push(fRightTab);

      // Built-in small status LEDs on the bottom corners (amber left, green right)
      const ledW = 1.0;
      const ledH = 1.4;
      const ledD = 0.2;
      const ledY = deviceY + localY - ph / 2 + 1.4;

      const leftLedMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff8800,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.2
      });
      const leftLed = new THREE.Mesh(new THREE.BoxGeometry(ledW, ledH, ledD), leftLedMat);
      leftLed.name = 'port-led-left';
      leftLed.position.set(localX - pw / 2 + 1.4, ledY, fz - 0.1);
      meshes.push(leftLed);

      const rightLedMat = new THREE.MeshStandardMaterial({
        color: 0x55ff55,
        emissive: 0x22ff22,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.2
      });
      const rightLed = new THREE.Mesh(new THREE.BoxGeometry(ledW, ledH, ledD), rightLedMat);
      rightLed.name = 'port-led-right';
      rightLed.position.set(localX + pw / 2 - 1.4, ledY, fz - 0.1);
      meshes.push(rightLed);

      // 2. Full 3D Silver-Metallic Shield Casing (wraps the port module on top, bottom, left, and right sides)
      const outerShieldMat = new THREE.MeshStandardMaterial({ color: 0xa0a5b0, metalness: 0.9, roughness: 0.25 });
      const shellT = 0.15;
      const cageD = 4.0;
      const cageZ = fz - cageD / 2; // fz - 2.0

      // Outer Left Casing Plate
      const cLeft = new THREE.Mesh(new THREE.BoxGeometry(shellT, ph, cageD), outerShieldMat);
      cLeft.position.set(localX - pw / 2 + shellT / 2, deviceY + localY, cageZ);
      meshes.push(cLeft);

      // Outer Right Casing Plate
      const cRight = new THREE.Mesh(new THREE.BoxGeometry(shellT, ph, cageD), outerShieldMat);
      cRight.position.set(localX + pw / 2 - shellT / 2, deviceY + localY, cageZ);
      meshes.push(cRight);

      // Outer Top Casing Plate
      const cTop = new THREE.Mesh(new THREE.BoxGeometry(pw, shellT, cageD), outerShieldMat);
      cTop.position.set(localX, deviceY + localY + ph / 2 - shellT / 2, cageZ);
      meshes.push(cTop);

      // Outer Bottom Casing Plate
      const cBot = new THREE.Mesh(new THREE.BoxGeometry(pw, shellT, cageD), outerShieldMat);
      cBot.position.set(localX, deviceY + localY - ph / 2 + shellT / 2, cageZ);
      meshes.push(cBot);

      // 3. Hollow Inner Cavity Lining (Stepped dark metallic lining matching the inverted RJ45 socket profile)
      const innerWallMat = new THREE.MeshStandardMaterial({ color: 0x383e46, metalness: 0.8, roughness: 0.45 });
      const wallThick = 0.1;

      // Inner Left Wall
      const wLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThick, ph - 2 * shellT, cageD), innerWallMat);
      wLeft.position.set(localX - pw / 2 + shellT + wallThick / 2, deviceY + localY, cageZ);
      meshes.push(wLeft);

      // Inner Right Wall
      const wRight = new THREE.Mesh(new THREE.BoxGeometry(wallThick, ph - 2 * shellT, cageD), innerWallMat);
      wRight.position.set(localX + pw / 2 - shellT - wallThick / 2, deviceY + localY, cageZ);
      meshes.push(wRight);

      // Inner Top Ceiling (flat top ceiling)
      const wTopCeil = new THREE.Mesh(new THREE.BoxGeometry(pw - 2 * shellT - 2 * wallThick, wallThick, cageD), innerWallMat);
      wTopCeil.position.set(localX, deviceY + localY + ph / 2 - shellT - wallThick / 2, cageZ);
      meshes.push(wTopCeil);

      // Low floor (middle stepped clip chamber)
      const wLowFloor = new THREE.Mesh(new THREE.BoxGeometry(pw - 3.8, wallThick, cageD), innerWallMat);
      wLowFloor.position.set(localX, deviceY + localY - ph / 2 + 0.15, cageZ);
      meshes.push(wLowFloor);

      // Left stepped floor
      const wLeftStepFloor = new THREE.Mesh(new THREE.BoxGeometry(2.95, wallThick, cageD), innerWallMat);
      wLeftStepFloor.position.set(localX - 3.375, deviceY + localY - ph / 2 + 2.8, cageZ);
      meshes.push(wLeftStepFloor);

      // Right stepped floor
      const wRightStepFloor = new THREE.Mesh(new THREE.BoxGeometry(2.95, wallThick, cageD), innerWallMat);
      wRightStepFloor.position.set(localX + 3.375, deviceY + localY - ph / 2 + 2.8, cageZ);
      meshes.push(wRightStepFloor);

      // Left vertical step divider
      const wLeftStepVert = new THREE.Mesh(new THREE.BoxGeometry(wallThick, 2.65, cageD), innerWallMat);
      wLeftStepVert.position.set(localX - 1.9, deviceY + localY - ph / 2 + 1.475, cageZ);
      meshes.push(wLeftStepVert);

      // Right vertical step divider
      const wRightStepVert = new THREE.Mesh(new THREE.BoxGeometry(wallThick, 2.65, cageD), innerWallMat);
      wRightStepVert.position.set(localX + 1.9, deviceY + localY - ph / 2 + 1.475, cageZ);
      meshes.push(wRightStepVert);

      // Dark plastic backplate at the rear face of the hollow cavity
      const backplate = new THREE.Mesh(new THREE.BoxGeometry(pw - 2 * shellT, ph - 2 * shellT, 0.1), darkPlasticBezelMat);
      backplate.name = 'port-backplate';
      backplate.position.set(localX, deviceY + localY, fz - 3.95);
      meshes.push(backplate);

      // 4. Bent spring copper contacts (8 individual pins hanging from the top wall)
      const copperPinMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.9, roughness: 0.25 });
      const pinW = 0.3;
      const pinSpacing = 0.95;
      const startX = -3.325;

      const horizGeo = new THREE.BoxGeometry(pinW, 0.25, 1.2);
      const slantGeo = new THREE.BoxGeometry(pinW, 0.25, 1.6);
      slantGeo.rotateX(0.55); // Slant down-forward (for top-hanging pins)
      const vertGeo = new THREE.BoxGeometry(pinW, 1.2, 0.25);

      for (let pIdx = 0; pIdx < 8; pIdx++) {
        const px = localX + startX + pIdx * pinSpacing;

        // A. Horizontal top-back segment
        const pHoriz = new THREE.Mesh(horizGeo, copperPinMat);
        pHoriz.name = `port-pin-h-${pIdx}`;
        pHoriz.position.set(px, deviceY + localY + ph / 2 - 1.5, fz - 3.1);
        meshes.push(pHoriz);

        // B. Slanted middle segment
        const pSlant = new THREE.Mesh(slantGeo, copperPinMat);
        pSlant.name = `port-pin-s-${pIdx}`;
        pSlant.position.set(px, deviceY + localY + ph / 2 - 2.3, fz - 1.9);
        meshes.push(pSlant);

        // C. Vertical front hook segment
        const pVert = new THREE.Mesh(vertGeo, copperPinMat);
        pVert.name = `port-pin-v-${pIdx}`;
        pVert.position.set(px, deviceY + localY + ph / 2 - 3.2, fz - 1.2);
        meshes.push(pVert);
      }

    } else if (port.type === 'sfp' || port.type === 'sfp-plus' || port.type === 'qsfp28') {
      // 1. SFP metallic hollow collar
      const wallT = 1.0;

      const leftGeo = new THREE.BoxGeometry(wallT, ph + 2, 3);
      const left = new THREE.Mesh(leftGeo, metalBezelMat);
      left.position.set(localX - pw / 2 - wallT / 2, deviceY + localY, fz + 1.5);
      meshes.push(left);

      const rightGeo = new THREE.BoxGeometry(wallT, ph + 2, 3);
      const right = new THREE.Mesh(rightGeo, metalBezelMat);
      right.position.set(localX + pw / 2 + wallT / 2, deviceY + localY, fz + 1.5);
      meshes.push(right);

      const topGeo = new THREE.BoxGeometry(pw, wallT, 3);
      const top = new THREE.Mesh(topGeo, metalBezelMat);
      top.position.set(localX, deviceY + localY + ph / 2 + wallT / 2, fz + 1.5);
      meshes.push(top);

      const botGeo = new THREE.BoxGeometry(pw, wallT, 3);
      const bot = new THREE.Mesh(botGeo, metalBezelMat);
      bot.position.set(localX, deviceY + localY - ph / 2 - wallT / 2, fz + 1.5);
      meshes.push(bot);

      // 2. Recessed inner cavity
      const holeGeo = new THREE.BoxGeometry(pw, ph, 4);
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.name = 'port-hole';
      hole.position.set(localX, deviceY + localY, fz - 0.5);
      meshes.push(hole);

      // 3. Pull-tab tab latch
      const latchGeo = new THREE.BoxGeometry(pw - 3, 1.0, 1.5);
      const latch = new THREE.Mesh(latchGeo, blueLatchMat);
      latch.name = 'port-latch';
      latch.position.set(localX, deviceY + localY - ph / 2 + 0.7, fz + 1.8);
      meshes.push(latch);

    } else if (port.type === 'usb') {
      // 1. Outer collar (dark plastic)
      const bezelGeo = new THREE.BoxGeometry(pw + 1.5, ph + 1.5, 1.5);
      const bezel = new THREE.Mesh(bezelGeo, darkPlasticBezelMat);
      bezel.name = 'port-bezel';
      bezel.position.set(localX, deviceY + localY, fz + 0.75);
      meshes.push(bezel);

      // 2. Inner cavity
      const holeGeo = new THREE.BoxGeometry(pw, ph, 3);
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.name = 'port-hole';
      hole.position.set(localX, deviceY + localY, fz - 1.4);
      meshes.push(hole);

      // 3. USB 3.0 Blue tongue
      const tongueGeo = new THREE.BoxGeometry(pw - 1.2, 0.8, 1.8);
      const tongue = new THREE.Mesh(tongueGeo, usbTongueMat);
      tongue.name = 'port-tongue';
      tongue.position.set(localX, deviceY + localY - ph / 2 + 1.0, fz - 0.5);
      meshes.push(tongue);

    } else {
      // Fallback for other ports (Power, VGA, Console, etc.)
      const bezelGeo = new THREE.BoxGeometry(pw + 2.5, ph + 2.5, pd * 0.4);
      const bezel = new THREE.Mesh(bezelGeo, darkPlasticBezelMat);
      bezel.name = 'port-bezel';
      bezel.position.set(localX, deviceY + localY, fz + pd * 0.3);
      meshes.push(bezel);

      const holeGeo = new THREE.BoxGeometry(pw, ph, pd * 0.8);
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.name = 'port-hole';
      hole.position.set(localX, deviceY + localY, fz - 0.5);
      meshes.push(hole);
    }
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
    DEVICE_FACE_Z - cfg.depth / 2, // align with shifted side of device
  );

  return plaque;
}

// ── Build server accessories (drive bays, grilles, and displays) ─────────────

export function buildServerAccessories(
  template: DeviceTemplate,
  cfg: { width: number; depth: number },
  deviceH: number,
  deviceY: number,
): THREE.Mesh[] {
  const cat = template.category;
  if (cat !== 'server' && cat !== 'storage') return [];

  const meshes: THREE.Mesh[] = [];
  const fz = DEVICE_FACE_Z + 0.4; // front face Z
  const H = template.heightUnits * RU_HEIGHT;
  const chH = H - 4;
  const chY = 2;

  const toLocalX = (x: number) => -cfg.width / 2 + (x / DEFAULT_W) * cfg.width;
  const toLocalY = (y: number) => deviceH / 2 - (y / H) * deviceH;
  const scaleX = (w: number) => (w / DEFAULT_W) * cfg.width;
  const scaleY = (h: number) => (h / H) * deviceH;

  // 1. Drive Bays
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

    // Bezel
    const bayGeo = new THREE.BoxGeometry(w3D, h3D, 2.5);
    const bay = new THREE.Mesh(bayGeo, bayMat);
    bay.name = 'server-drive-bay';
    bay.position.set(lx, deviceY + ly, fz + 1.25);
    meshes.push(bay);

    // Recessed latch
    const latchW = w3D * 0.75;
    const latchH = h3D * 0.25;
    const latchGeo = new THREE.BoxGeometry(latchW, latchH, 1.0);
    const latch = new THREE.Mesh(latchGeo, latchMat);
    latch.name = 'server-drive-latch';
    latch.position.set(lx, deviceY + ly - h3D * 0.1, fz + 2.5);
    meshes.push(latch);

    // Tiny status LED
    const ledGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.name = 'server-drive-led';
    led.position.set(lx - w3D * 0.35, deviceY + ly + h3D * 0.25, fz + 2.6);
    meshes.push(led);
  }

  // 2. Ventilation Grille
  const grillX = bayStartX + bayCount * (bayW + 3) + 6;
  const grillW = DEFAULT_W - grillX - 90;
  if (grillW > 20) {
    const gw3D = scaleX(grillW);
    const gh3D = scaleY(chH - 8);
    const lx = toLocalX(grillX + grillW / 2);
    const ly = toLocalY(chY + 4 + (chH - 8) / 2);

    // Black background recess
    const bgGeo = new THREE.BoxGeometry(gw3D, gh3D, 1);
    const bgMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.95 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.name = 'server-grille-bg';
    bg.position.set(lx, deviceY + ly, fz - 0.5);
    meshes.push(bg);

    // Grille slats
    const slatCount = Math.floor(grillW / 6);
    const slatW3D = scaleX(1.5);
    const slatGeo = new THREE.BoxGeometry(slatW3D, gh3D, 1.5);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x1d2127, metalness: 0.8, roughness: 0.3 });
    for (let s = 0; s < slatCount; s++) {
      const sx = grillX + 3 + s * 6;
      const slx = toLocalX(sx);
      const slat = new THREE.Mesh(slatGeo, slatMat);
      slat.name = 'server-grille-slat';
      slat.position.set(slx, deviceY + ly, fz + 0.75);
      meshes.push(slat);
    }
  }

  // 3. LCD screen
  const lcdX = grillX + grillW + 4;
  const lcdW = 40;
  const lcdH = Math.min(chH - 8, 16);
  const lw3D = scaleX(lcdW);
  const lh3D = scaleY(lcdH);
  const lx = toLocalX(lcdX + lcdW / 2);
  const ly = toLocalY(chY + 4 + lcdH / 2);

  // LCD Bezel
  const lcdBezelGeo = new THREE.BoxGeometry(lw3D + 2, lh3D + 2, 1.5);
  const lcdBezelMat = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.3, roughness: 0.6 });
  const lcdBezel = new THREE.Mesh(lcdBezelGeo, lcdBezelMat);
  lcdBezel.name = 'server-lcd-bezel';
  lcdBezel.position.set(lx, deviceY + ly, fz + 0.75);
  meshes.push(lcdBezel);

  // LCD Screen (glowing)
  const lcdScreenGeo = new THREE.BoxGeometry(lw3D, lh3D, 0.8);
  const lcdScreenMat = new THREE.MeshStandardMaterial({
    color: 0x00a8ff,
    emissive: 0x00a8ff,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });
  const lcdScreen = new THREE.Mesh(lcdScreenGeo, lcdScreenMat);
  lcdScreen.name = 'server-lcd-screen';
  lcdScreen.position.set(lx, deviceY + ly, fz + 1.3);
  meshes.push(lcdScreen);

  return meshes;
}
