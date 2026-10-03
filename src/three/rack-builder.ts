import * as THREE from 'three';
import type { RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { buildRackInternals } from './rack-internals';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';
import { getSidePdu3DMaterial, getVcm3DMaterial } from './svg-texture';

const { RU_HEIGHT, RACK_OUTER_WIDTH, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

export const RACK_DEPTH = 600;

// ── Rack shell color presets ────────────────────────────────────────────────
// "Black" and "Matte Black" are deliberately different finishes (glossier/more metallic vs.
// flat/high-roughness), not just the same color — matches how those are actually distinct SKUs
// on real rack enclosures.
export type RackColorKey = 'white' | 'grey' | 'ivory' | 'black' | 'matte-black';

export const RACK_COLOR_PRESETS: Record<RackColorKey, { label: string; color: string; roughness: number; metalness: number }> = {
  white:         { label: 'White',       color: '#d4d4d0', roughness: 0.65, metalness: 0.15 },
  grey:          { label: 'Grey',        color: '#6e747d', roughness: 0.55, metalness: 0.25 },
  ivory:         { label: 'Ivory',       color: '#ded8c8', roughness: 0.65, metalness: 0.12 },
  black:         { label: 'Black',       color: '#242830', roughness: 0.45, metalness: 0.35 },
  'matte-black': { label: 'Matte Black', color: '#1c2026', roughness: 0.70, metalness: 0.20 },
};

const DEFAULT_RACK_COLOR: RackColorKey = 'black';

/** Additively lighten (positive amt) or darken (negative amt) a hex color, clamped to 0-255. */
function shade(hex: string, amt: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ── Shared geometry ───────────────────────────────────────────────────────────

const FAN_SIZE  = 120;   // 120mm fan
const FAN_DEPTH = 28;    // fan assembly thickness
// Visual sheet-metal thickness of the top cap mesh itself — deliberately much thinner than
// RACK_PADDING_TOP (which stays the overall top headroom/allowance used elsewhere for totalH,
// vent header, U-label, and fan placement — a shared 2D/3D constant, not just this mesh's depth).
export const TOP_PLATE_THICKNESS = 2; // ~1mm real-world scale

export const FRONT_RAIL_RECESS = 28;
export const DEVICE_FACE_Z = RACK_DEPTH / 2 - FRONT_RAIL_RECESS; // 272

// Fan positions in rack-group local space (X, Z)
const FAN_POSITIONS: [number, number][] = [
  [-90, -100],
  [ 90, -100],
  [-90,  100],
  [ 90,  100],
];

/** Top panel with an actual through-cut circular hole above each of the 4 fans — a solid lid
 *  (even a "vent" texture with no real geometry holes) sat directly over/inside the fan
 *  assemblies (which are recessed FAN_DEPTH into the panel's thickness), sealing them in and
 *  hiding the spinning blades. Built via Shape+holes / ExtrudeGeometry (no CSG needed). */
function buildTopCapGeometry(): THREE.BufferGeometry {
  const hw = RACK_OUTER_WIDTH / 2;
  const hd = RACK_DEPTH / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.lineTo(-hw, -hd);

  // Round holes matching the 120mm fan spec exactly (radius = FAN_SIZE / 2). This is smaller
  // than the fan housing's square footprint at the corners (diagonal ~85 vs radius 60), so the
  // fan assembly is mounted flush against the panel's UNDERSIDE (see FAN_POSITIONS loop below)
  // rather than embedded inside the panel's own thickness — real vented rack lids work the same
  // way. That keeps the housing's square corners entirely below the panel, with zero vertical
  // overlap against the solid (uncut) material regardless of the hole being round-not-square.
  const FAN_HOLE_R = FAN_SIZE / 2;
  for (const [fx, fz] of FAN_POSITIONS) {
    const hole = new THREE.Path();
    hole.absarc(fx, fz, FAN_HOLE_R, 0, Math.PI * 2, false);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: TOP_PLATE_THICKNESS,
    bevelEnabled: false,
    curveSegments: 24,
  });
  // Shape lives in the XY plane, extruded along Z — rotate so the flat face is horizontal
  // (rack-local XZ) and the extrusion runs along Y (the panel's thickness), then re-center
  // vertically so this drops into a position.set(...) call the same way a centered box would.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -TOP_PLATE_THICKNESS / 2, 0);
  return geo;
}

// ── Canvas material factories ─────────────────────────────────────────────────

function makeBodyMat(color: string, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, transparent: false, opacity: 1 });
}

function drawHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  // Pointy-topped regular hexagon matching reference image (vertical left/right sides, top/bottom peaks)
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function makePerforatedMat(panelW: number, panelH: number, style = 'perforated'): THREE.MeshStandardMaterial {
  const isWireMesh = style.includes('mesh') || style.includes('wire');
  const isHoneycomb = style.includes('honeycomb') || style.includes('hexa');

  // Canvas size configured to tile seamlessly
  const TW = 1024, TH = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x141820, metalness: 0.35, roughness: 0.55 });

  let unitMM = 70; // physical millimeter size of one 1024x1024 texture tile

  if (isWireMesh) {
    // Heavy duty welded wire mesh grid with steel wire crosshatch and square transparent cutouts
    unitMM = 40;
    const wireSpacing = 64;
    const wireW = 12;

    ctx.clearRect(0, 0, TW, TH);

    // 1. Draw outer wire shadow/border
    ctx.fillStyle = '#1e2632';
    for (let x = 0; x <= TW; x += wireSpacing) {
      ctx.fillRect(x - wireW / 2 - 2, 0, wireW + 4, TH);
    }
    for (let y = 0; y <= TH; y += wireSpacing) {
      ctx.fillRect(0, y - wireW / 2 - 2, TW, wireW + 4);
    }

    // 2. Draw metallic steel wires
    ctx.fillStyle = '#4b5563';
    for (let x = 0; x <= TW; x += wireSpacing) {
      ctx.fillRect(x - wireW / 2, 0, wireW, TH);
    }
    for (let y = 0; y <= TH; y += wireSpacing) {
      ctx.fillRect(0, y - wireW / 2, TW, wireW);
    }

    // 3. Draw metallic rounded highlight core
    ctx.fillStyle = '#9ca3af';
    for (let x = 0; x <= TW; x += wireSpacing) {
      ctx.fillRect(x - 2, 0, 4, TH);
    }
    for (let y = 0; y <= TH; y += wireSpacing) {
      ctx.fillRect(0, y - 2, TW, 4);
    }

  } else if (isHoneycomb) {
    // 1. Dark structural enterprise steel plate background
    ctx.fillStyle = '#1c222b';
    ctx.fillRect(0, 0, TW, TH);

    // Pointy-topped honeycomb hex with thick, strong structural walls matching reference pattern
    let cellPitchR = 45;      // outer cell radius defining the grid pitch
    let wallThickness = 8.5;  // thick steel wall between neighboring hexagons
    let rimBevel = 2.8;
    unitMM = 52;

    if (style.includes('large')) {
      cellPitchR = 64;
      wallThickness = 12.0;
      rimBevel = 3.5;
      unitMM = 70;
    } else if (style.includes('small')) {
      cellPitchR = 30;
      wallThickness = 6.0;
      rimBevel = 2.0;
      unitMM = 36;
    } else if (style.includes('tiny')) {
      cellPitchR = 20;
      wallThickness = 4.2;
      rimBevel = 1.5;
      unitMM = 25;
    }

    const voidR = cellPitchR - wallThickness; // void opening radius leaving thick solid steel walls
    const spacingX = cellPitchR * 1.7320508;  // sqrt(3) * R
    const spacingY = cellPitchR * 1.5;

    const numRows = Math.ceil(TH / spacingY) + 4;
    const numCols = Math.ceil(TW / spacingX) + 4;

    // A. Draw metallic rim bevel highlights around the thick walls
    ctx.fillStyle = '#3e4b5d';
    for (let row = -2; row <= numRows; row++) {
      for (let col = -2; col <= numCols; col++) {
        const cx = col * spacingX + (Math.abs(row) % 2 === 0 ? 0 : spacingX / 2);
        const cy = row * spacingY;
        drawHex(ctx, cx, cy, voidR + rimBevel);
        ctx.fill();
      }
    }

    // B. Cut out true pass-through transparent void holes with thick structural walls intact
    ctx.globalCompositeOperation = 'destination-out';
    for (let row = -2; row <= numRows; row++) {
      for (let col = -2; col <= numCols; col++) {
        const cx = col * spacingX + (Math.abs(row) % 2 === 0 ? 0 : spacingX / 2);
        const cy = row * spacingY;
        drawHex(ctx, cx, cy, voidR);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

  } else {
    // 1. Dark structural enterprise steel plate background
    ctx.fillStyle = '#1c222b';
    ctx.fillRect(0, 0, TW, TH);

    // Round hole perforations with strong solid steel webbing across all 4 tiers
    let holeR_px = 35;
    let spacingX = 100, spacingY = 86.60;
    let rimBevel = 2.6;
    unitMM = 65;

    if (style.includes('large')) {
      holeR_px = 54;
      spacingX = 150;
      spacingY = 129.90;
      rimBevel = 3.5;
      unitMM = 85;
    } else if (style.includes('small')) {
      holeR_px = 22;
      spacingX = 65;
      spacingY = 56.29;
      rimBevel = 2.0;
      unitMM = 45;
    } else if (style.includes('tiny')) {
      holeR_px = 13;
      spacingX = 40;
      spacingY = 34.64;
      rimBevel = 1.4;
      unitMM = 30;
    }

    const numRows = Math.ceil(TH / spacingY) + 4;
    const numCols = Math.ceil(TW / spacingX) + 4;

    // A. Draw metallic rim bevel highlights
    ctx.fillStyle = '#3e4b5d';
    for (let row = -2; row <= numRows; row++) {
      for (let col = -2; col <= numCols; col++) {
        const cx = col * spacingX + (Math.abs(row) % 2 === 0 ? 0 : spacingX / 2);
        const cy = row * spacingY;
        ctx.beginPath();
        ctx.arc(cx, cy, holeR_px + rimBevel, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // B. Cut out true pass-through transparent void holes with thick solid webbing
    ctx.globalCompositeOperation = 'destination-out';
    for (let row = -2; row <= numRows; row++) {
      for (let col = -2; col <= numCols; col++) {
        const cx = col * spacingX + (Math.abs(row) % 2 === 0 ? 0 : spacingX / 2);
        const cy = row * spacingY;
        ctx.beginPath();
        ctx.arc(cx, cy, holeR_px, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Identical unitMM in X and Y guarantees 100% perfect round circles and 100% perfect regular hexagons
  tex.repeat.set(panelW / unitMM, panelH / unitMM);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;

  // True pass-through cutout material
  return new THREE.MeshStandardMaterial({
    map: tex,
    metalness: 0.35,
    roughness: 0.50,
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

function makeVentHeaderMat(): THREE.MeshStandardMaterial {
  const TW = 512, TH = 32;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x080c10 });

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, TW, TH);

  // Clean vent slots
  ctx.fillStyle = '#030508';
  const tw = 16, th = Math.round(TH * 0.6), gap = 8;
  let tx = gap;
  while (tx + tw < TW - gap) {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(tx, (TH - th) / 2, tw, th, 1.5);
    } else {
      ctx.rect(tx, (TH - th) / 2, tw, th);
    }
    ctx.fill();
    tx += tw + gap;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.65 });
}

function makeSidePanelMat(color: string, roughness: number, metalness: number): THREE.MeshStandardMaterial {
  // Smooth, high quality powder-coated metallic finish without artificial striped brush grain
  return new THREE.MeshStandardMaterial({
    color,
    metalness: Math.min(metalness, 0.3),
    roughness: Math.max(roughness, 0.55),
    transparent: false,
    opacity: 1
  });
}

/** Fresh shell (side panel + body) materials for a given rack color preset — used both by
 *  buildRackGroup and by SceneManager for live color swaps on already-built racks. */
export function buildShellMaterials(colorKeyOrHex: string): {
  bodyMat: THREE.MeshStandardMaterial;
  sideMat: THREE.MeshStandardMaterial;
} {
  if (colorKeyOrHex && colorKeyOrHex.startsWith('#')) {
    return {
      bodyMat: makeBodyMat(colorKeyOrHex, 0.40, 0.30),
      sideMat: makeSidePanelMat(colorKeyOrHex, 0.45, 0.25),
    };
  }
  const preset = (RACK_COLOR_PRESETS as any)[colorKeyOrHex] ?? RACK_COLOR_PRESETS[DEFAULT_RACK_COLOR];
  return {
    bodyMat: makeBodyMat(preset.color, preset.roughness, preset.metalness),
    sideMat: makeSidePanelMat(preset.color, preset.roughness, preset.metalness),
  };
}

function make3DPduFaceMat(side: 'left' | 'right', pduW: number = 44): THREE.MeshStandardMaterial {
  const TW = Math.round(pduW * 3), TH = 512;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x161a22, metalness: 0.8, roughness: 0.2 });

  // PDU body
  ctx.fillStyle = '#16191f';
  ctx.fillRect(0, 0, TW, TH);

  // Status LED
  ctx.fillStyle = side === 'left' ? '#00e676' : '#2979ff';
  ctx.beginPath();
  ctx.arc(TW / 2, 16, 5, 0, Math.PI * 2);
  ctx.fill();

  // Digital readout
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(16, 26, TW - 32, 20);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('230V', TW / 2, 40);

  // Breaker
  ctx.fillStyle = '#222730';
  ctx.fillRect(24, 52, TW - 48, 16);
  ctx.fillStyle = '#e63946';
  ctx.fillRect(28, 55, (TW - 56) / 2, 10);

  // Outlets
  const numSockets = 16;
  const socketGap = (TH - 80) / numSockets;
  for (let i = 0; i < numSockets; i++) {
    const sy = 75 + i * socketGap;
    ctx.fillStyle = '#090b0e';
    ctx.fillRect(18, sy, TW - 36, socketGap - 4);
    ctx.strokeStyle = '#282f3a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, sy, TW - 36, socketGap - 4);

    // Socket pin holes
    ctx.fillStyle = '#000000';
    ctx.fillRect(TW / 2 - 10, sy + 3, 5, 4);
    ctx.fillRect(TW / 2 + 5, sy + 3, 5, 4);
    ctx.fillRect(TW / 2 - 2.5, sy + 8, 5, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.5, roughness: 0.4 });
}

function make3DVcmFaceMat(color: string, units: number): THREE.MeshStandardMaterial {
  const TW = 128, TH = 512;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.3, roughness: 0.7 });

  // Duct channel
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TW, TH);

  // Finger slits for each RU
  const slotPitch = TH / Math.max(units, 1);
  for (let u = 0; u < units; u++) {
    const y = u * slotPitch;
    ctx.fillStyle = '#080a0e';
    ctx.fillRect(8, y + 2, TW - 16, Math.max(3, slotPitch - 4));
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, y + 2, TW - 16, Math.max(3, slotPitch - 4));
  }

  // Vertical center accent line
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(TW / 2, 0);
  ctx.lineTo(TW / 2, TH);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.7 });
}

// ── Fan assembly ──────────────────────────────────────────────────────────────

function makeFanBladeMat(): THREE.MeshStandardMaterial {
  const TW = 256, TH = 256;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x0a1020 });

  const cx = TW / 2, cy = TH / 2;
  const outerR = TW / 2 - 2;
  const innerR = 16;
  const hubR   = 12;

  // Background disc
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = '#04060c';
  ctx.fill();

  // 7 fan blades
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const bgrad = ctx.createLinearGradient(innerR, 0, outerR, 0);
    bgrad.addColorStop(0, '#18243a');
    bgrad.addColorStop(0.5, '#0e1828');
    bgrad.addColorStop(1, '#070c18');

    ctx.beginPath();
    ctx.moveTo(innerR, -5);
    ctx.quadraticCurveTo(outerR * 0.7, -22, outerR * 0.92, -8);
    ctx.quadraticCurveTo(outerR * 0.98, 0, outerR * 0.92, 8);
    ctx.quadraticCurveTo(outerR * 0.7, 22, innerR, 5);
    ctx.closePath();
    ctx.fillStyle = bgrad;
    ctx.fill();
    ctx.restore();
  }

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, hubR + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#1a2535';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1525';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#2a3a50';
  ctx.fill();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = '#1a2535';
  ctx.lineWidth = 2;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.35, roughness: 0.60 });
}

function makeFanGuardMat(): THREE.MeshStandardMaterial {
  const TW = 128, TH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x0a1020 });

  // Dark background
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, TW, TH);

  // Wire guard — concentric rings + radials
  ctx.strokeStyle = '#141e2e';
  ctx.lineWidth = 1.5;

  for (const r of [TW * 0.15, TW * 0.28, TW * 0.4, TW * 0.48]) {
    ctx.beginPath();
    ctx.arc(TW / 2, TH / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(TW / 2 + Math.cos(a) * 12, TH / 2 + Math.sin(a) * 12);
    ctx.lineTo(TW / 2 + Math.cos(a) * TW * 0.47, TH / 2 + Math.sin(a) * TW * 0.47);
    ctx.stroke();
  }

  // Outer guard ring (frame border)
  ctx.beginPath();
  ctx.arc(TW / 2, TH / 2, TW / 2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e2e42';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Corner screw holes on square frame
  for (const [sx, sy] of [[8, 8], [TW - 8, 8], [8, TH - 8], [TW - 8, TH - 8]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#040608';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1018';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.40, roughness: 0.55 });
}

function buildFanAssembly(): THREE.Group {
  const fan = new THREE.Group();
  fan.name = 'rack-fan';

  const frameMat  = new THREE.MeshStandardMaterial({ color: 0x060a10, metalness: 0.25, roughness: 0.85 });
  const guardMat  = makeFanGuardMat();
  const bladeMat  = makeFanBladeMat();
  // The frame's top face is left unrendered (not a solid cap over the whole square) — a separate
  // round ring below fills in the guard look while leaving its center open, so the top-cap's
  // through-cut actually reveals the spinning blade instead of hitting another solid lid.
  const openMat = new THREE.MeshBasicMaterial({ visible: false });

  // Outer shroud frame — square housing; its corners sit outside the round guard ring below
  const frameGeo = new THREE.BoxGeometry(FAN_SIZE, FAN_DEPTH, FAN_SIZE);
  const frameMats = [frameMat, frameMat, openMat, frameMat, frameMat, frameMat];
  const frame = new THREE.Mesh(frameGeo, frameMats);
  frame.name = 'fan-frame';
  fan.add(frame);

  // Round wire guard — a flat ring (open center) sitting right at the shroud's top opening, an
  // actual through-cut rather than a texture painted on a solid face.
  const guardGeo = new THREE.RingGeometry(42, 58, 32);
  guardGeo.rotateX(-Math.PI / 2);
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.name = 'fan-guard';
  guard.position.set(0, FAN_DEPTH / 2, 0);
  fan.add(guard);

  // Spinning blade disc (slightly below top face, above center)
  const bladeGeo = new THREE.BoxGeometry(FAN_SIZE - 10, 3, FAN_SIZE - 10);
  // Top and bottom face show the blade canvas; sides are dark
  const bladeMats = [frameMat, frameMat, bladeMat, bladeMat, frameMat, frameMat];
  const blade = new THREE.Mesh(bladeGeo, bladeMats);
  blade.name = 'fan-blade';
  blade.position.set(0, FAN_DEPTH * 0.1, 0);
  fan.add(blade);

  return fan;
}



// ── Main build function ───────────────────────────────────────────────────────

export function buildRackGroup(
  rack: RackData,
  materials: MaterialManager,
  colorKey: RackColorKey = DEFAULT_RACK_COLOR
): THREE.Group {
  const group = new THREE.Group();
  group.name = `rack-${rack.id}`;

  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const bodyH  = rack.units * RU_HEIGHT;
  const fz     = RACK_DEPTH / 2;

  // Front face layout (inner: RACK_INNER_WIDTH = 400, outer = 450)
  const SIDE_T    = 22;     // outer wall thickness
  const GLASS_HW  = 95;     // half-width of glass door
  const RED_W     = 5;
  const PERF_START = GLASS_HW + RED_W;   // 100
  const PERF_END   = RACK_INNER_WIDTH / 2; // 200
  const PERF_W     = PERF_END - PERF_START; // 100
  const PERF_CX    = (PERF_START + PERF_END) / 2; // 150

  const doorStyle = rack.frontDoor ?? 'perforated';

  // Materials (prioritize individual rack.rackColor if defined)
  const effectiveColorKey = rack.rackColor || colorKey;
  const { bodyMat, sideMat } = buildShellMaterials(effectiveColorKey);
  const railMat   = materials.get('rail');
  const perfMat   = makePerforatedMat(PERF_W, bodyH, doorStyle);
  const ventMat   = makeVentHeaderMat();
  const glassMat  = new THREE.MeshStandardMaterial({
    color: 0x0d2035, transparent: true, opacity: 0.20,
    metalness: 0.04, roughness: 0.04, side: THREE.DoubleSide,
  });
  const acrylicMat = new THREE.MeshStandardMaterial({
    color: 0x0f2438, transparent: true, opacity: 0.35,
    metalness: 0.08, roughness: 0.06, side: THREE.DoubleSide,
  });
  const redMat    = new THREE.MeshStandardMaterial({
    color: 0xcc1a00, metalness: 0.25, roughness: 0.5,
    emissive: 0x440500, emissiveIntensity: 0.35,
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x6080a0, metalness: 0.55, roughness: 0.45 });
  const hingeMat  = new THREE.MeshStandardMaterial({ color: 0x708090, metalness: 0.50, roughness: 0.50 });
  const trackMat  = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.35 });

  const resolveDoorInsertMat = (styleStr: string, winW: number, winH: number) => {
    if (styleStr.includes('solid')) return bodyMat;
    if (styleStr.includes('acrylic')) return acrylicMat;
    if (styleStr.includes('glass')) return glassMat;
    if (styleStr.includes('louvered') || styleStr.includes('louvred')) return bodyMat;
    return makePerforatedMat(winW, winH, styleStr);
  };

  // Side walls and the back panel fill exactly the "body" zone between the top cap and bottom
  // plinth — NOT the full totalH. Both of those already own the top/bottom edge slices (see
  // their position.set calls below); spanning totalH here as well made every one of these panels
  // volumetrically overlap the top cap's (and bottom plinth's) full width/depth at those edges,
  // which is genuine z-fighting (the "brushed"/dithered seam), not just a rendering trick.
  const shellH = totalH - TOP_PLATE_THICKNESS - RACK_PADDING_BOTTOM;
  const shellCenterY = (RACK_PADDING_BOTTOM - TOP_PLATE_THICKNESS) / 2;

  // ── Side outer panels ──────────────────────────────────────────────────────
  const hasSidePanels = rack.sidePanels !== false && rack.rackType !== 'open-frame';
  if (hasSidePanels) {
    const sideGeo = new THREE.BoxGeometry(SIDE_T, shellH, RACK_DEPTH);
    const leftSide = new THREE.Mesh(sideGeo, sideMat);
    leftSide.name = 'rack-side-L';
    leftSide.position.set(-(RACK_OUTER_WIDTH / 2 - SIDE_T / 2), shellCenterY, 0);
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, sideMat);
    rightSide.name = 'rack-side-R';
    rightSide.position.set(RACK_OUTER_WIDTH / 2 - SIDE_T / 2, shellCenterY, 0);
    group.add(rightSide);
  }

  // ── Back panel (only rendered for front-only access; front-rear replaces this with rear door) ──
  const isDualAccess = rack.doorOpening === 'front-rear';
  if (rack.rackType !== 'open-frame' && !isDualAccess) {
    const backGeo  = new THREE.BoxGeometry(RACK_OUTER_WIDTH, shellH, 10);
    const backPanel = new THREE.Mesh(backGeo, bodyMat);
    backPanel.name  = 'rack-back';
    backPanel.position.set(0, shellCenterY, -fz + 5);
    group.add(backPanel);
  }

  // ── Top cap — thin sheet-metal plate, through-cut circular vents above each fan ──────────
  const topGeo  = buildTopCapGeometry();
  const topCap  = new THREE.Mesh(topGeo, bodyMat);
  topCap.name   = 'rack-top';
  topCap.position.set(0, totalH / 2 - TOP_PLATE_THICKNESS / 2, 0);
  group.add(topCap);

  // ── Bottom plinth ──────────────────────────────────────────────────────────
  const botGeo   = new THREE.BoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_BOTTOM, RACK_DEPTH);
  const botPlinth = new THREE.Mesh(botGeo, bodyMat);
  botPlinth.name  = 'rack-base';
  botPlinth.position.set(0, -(totalH - RACK_PADDING_BOTTOM) / 2, 0);
  group.add(botPlinth);

  // ── Front and Rear vent header strips ───────
  const ventH   = 14;
  const ventGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, ventH, 4);
  const vent    = new THREE.Mesh(ventGeo, ventMat);
  vent.name     = 'rack-vent-header';
  vent.position.set(0, bodyH / 2 - ventH / 2, fz - 2);
  group.add(vent);

  const frontHeaderTop = totalH / 2 - TOP_PLATE_THICKNESS;
  const frontHeaderBottom = bodyH / 2;
  const frontHeaderH = frontHeaderTop - frontHeaderBottom;
  if (frontHeaderH > 0) {
    const frontHeaderGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, frontHeaderH, 4);
    const frontHeader = new THREE.Mesh(frontHeaderGeo, bodyMat);
    frontHeader.name = 'rack-front-header';
    frontHeader.position.set(0, (frontHeaderTop + frontHeaderBottom) / 2, fz - 2);
    group.add(frontHeader);
  }

  if (isDualAccess && rack.rackType !== 'open-frame') {
    const rearVent = new THREE.Mesh(ventGeo, ventMat);
    rearVent.name = 'rack-rear-vent-header';
    rearVent.position.set(0, bodyH / 2 - ventH / 2, -fz + 2);
    group.add(rearVent);

    if (frontHeaderH > 0) {
      const rearHeaderGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, frontHeaderH, 4);
      const rearHeader = new THREE.Mesh(rearHeaderGeo, bodyMat);
      rearHeader.name = 'rack-rear-header';
      rearHeader.position.set(0, (frontHeaderTop + frontHeaderBottom) / 2, -fz + 2);
      group.add(rearHeader);
    }
  }

  // ── Door groups (Single, Split / Dual 50-50, Asymmetric 60/40, Bi-Fold, Multi-Compartment) ────────────
  const hasDoor = (rack.frontDoor !== 'none') && (rack.rackType !== 'open-frame');
  const doorOp = rack.doorOperation || (doorStyle.startsWith('split-') || doorStyle.startsWith('asym-') ? 'split-swing' : doorStyle.startsWith('bifold-') ? 'bifold' : 'swing-left');

  if (hasDoor) {
    const isAsym = doorStyle.startsWith('asym-split-') || doorStyle.includes('asym');
    const isBifold = doorStyle.startsWith('bifold-') || doorStyle.includes('bifold') || doorOp === 'bifold';
    const isSplit = doorStyle.startsWith('split-') || isAsym || isBifold;
    const isColo = doorStyle === 'multi-compartment-2' || doorStyle === 'multi-compartment-4';

    const facesToBuild: Array<{ isRear: boolean; faceZ: number; zDir: number; zOffset: number }> = [
      { isRear: false, faceZ: fz, zDir: 1, zOffset: 1.5 },
    ];
    if (isDualAccess) {
      facesToBuild.push({ isRear: true, faceZ: -fz, zDir: -1, zOffset: -1.5 });
    }

    for (const { isRear, faceZ, zDir, zOffset } of facesToBuild) {
      const prefix = isRear ? 'rack-rear-door' : 'rack-door';

      if (isSplit && !isColo) {
        // ── Dual / Split / Asymmetric / Bi-Fold Doors ──
        const totalDoorW = PERF_END * 2 - 3;
        const leftRatio = isAsym ? 0.60 : 0.50;
        const rightRatio = isAsym ? 0.40 : 0.50;

        const leftLeafW = totalDoorW * leftRatio;
        const rightLeafW = totalDoorW * rightRatio;
        const frameBorder = 14;
        const frameD = 4.0;
        const insertD = 1.6;

        const isSolid = doorStyle.includes('solid');
        const isGlass = doorStyle.includes('glass') || doorStyle.includes('acrylic');

        // 1. Left Door Leaf (Hinged at left outer edge x = -PERF_END)
        const leftDoorGroup = new THREE.Group();
        leftDoorGroup.name = `${prefix}-left`;
        leftDoorGroup.position.set(-PERF_END, 0, faceZ + zOffset);

        const leftWinW = Math.max(10, leftLeafW - frameBorder * 2);
        const leftWinH = Math.max(10, bodyH - frameBorder * 2);
        const leftSplitMat = resolveDoorInsertMat(doorStyle, leftWinW, leftWinH);

        if (isSolid) {
          const solidPanel = new THREE.Mesh(new THREE.BoxGeometry(leftLeafW, bodyH, frameD), bodyMat);
          solidPanel.position.set(leftLeafW / 2, 0, 0);
          leftDoorGroup.add(solidPanel);
        } else {
          // Perimeter frame
          const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(frameBorder, bodyH, frameD), bodyMat);
          leftBeam.position.set(frameBorder / 2, 0, 0);
          leftDoorGroup.add(leftBeam);

          const rightBeam = new THREE.Mesh(new THREE.BoxGeometry(frameBorder, bodyH, frameD), bodyMat);
          rightBeam.position.set(leftLeafW - frameBorder / 2, 0, 0);
          leftDoorGroup.add(rightBeam);

          const topBeam = new THREE.Mesh(new THREE.BoxGeometry(leftWinW, frameBorder, frameD), bodyMat);
          topBeam.position.set(leftLeafW / 2, bodyH / 2 - frameBorder / 2, 0);
          leftDoorGroup.add(topBeam);

          const botBeam = new THREE.Mesh(new THREE.BoxGeometry(leftWinW, frameBorder, frameD), bodyMat);
          botBeam.position.set(leftLeafW / 2, -bodyH / 2 + frameBorder / 2, 0);
          leftDoorGroup.add(botBeam);

          // Center insert
          const insertGeo = isGlass ? new THREE.BoxGeometry(leftWinW, leftWinH, insertD) : new THREE.PlaneGeometry(leftWinW, leftWinH);
          const leftInsert = new THREE.Mesh(insertGeo, leftSplitMat);
          leftInsert.position.set(leftLeafW / 2, 0, 0);
          leftDoorGroup.add(leftInsert);
        }

        // Bi-fold knuckle center hinge if bifold
        if (isBifold) {
          for (const hingeY of [-bodyH * 0.35, 0, bodyH * 0.35]) {
            const bifoldHinge = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 5), hingeMat);
            bifoldHinge.position.set(leftLeafW / 2, hingeY, zDir * 2);
            leftDoorGroup.add(bifoldHinge);
          }
        }

        // Left Escutcheon & Handle
        const leftEscutcheon = new THREE.Mesh(new THREE.BoxGeometry(7, 70, 4.5), bodyMat);
        leftEscutcheon.position.set(leftLeafW - 7, 0, zDir * 2);
        leftDoorGroup.add(leftEscutcheon);

        const leftHandle = new THREE.Mesh(new THREE.BoxGeometry(4, 55, 9), handleMat);
        leftHandle.position.set(leftLeafW - 7, 0, zDir * 4);
        leftDoorGroup.add(leftHandle);

        // Left Hinges
        for (const hingeY of [-bodyH * 0.38, bodyH * 0.38]) {
          const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 5), hingeMat);
          hinge.position.set(0, hingeY, zDir * -1);
          leftDoorGroup.add(hinge);
        }
        group.add(leftDoorGroup);

        // 2. Right Door Leaf (Hinged at right outer edge x = PERF_END)
        const rightDoorGroup = new THREE.Group();
        rightDoorGroup.name = `${prefix}-right`;
        rightDoorGroup.position.set(PERF_END, 0, faceZ + zOffset);

        const rightWinW = Math.max(10, rightLeafW - frameBorder * 2);
        const rightWinH = Math.max(10, bodyH - frameBorder * 2);
        const rightSplitMat = resolveDoorInsertMat(doorStyle, rightWinW, rightWinH);

        if (isSolid) {
          const solidPanel = new THREE.Mesh(new THREE.BoxGeometry(rightLeafW, bodyH, frameD), bodyMat);
          solidPanel.position.set(-rightLeafW / 2, 0, 0);
          rightDoorGroup.add(solidPanel);
        } else {
          const rightBeam = new THREE.Mesh(new THREE.BoxGeometry(frameBorder, bodyH, frameD), bodyMat);
          rightBeam.position.set(-frameBorder / 2, 0, 0);
          rightDoorGroup.add(rightBeam);

          const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(frameBorder, bodyH, frameD), bodyMat);
          leftBeam.position.set(-rightLeafW + frameBorder / 2, 0, 0);
          rightDoorGroup.add(leftBeam);

          const topBeam = new THREE.Mesh(new THREE.BoxGeometry(rightWinW, frameBorder, frameD), bodyMat);
          topBeam.position.set(-rightLeafW / 2, bodyH / 2 - frameBorder / 2, 0);
          rightDoorGroup.add(topBeam);

          const botBeam = new THREE.Mesh(new THREE.BoxGeometry(rightWinW, frameBorder, frameD), bodyMat);
          botBeam.position.set(-rightLeafW / 2, -bodyH / 2 + frameBorder / 2, 0);
          rightDoorGroup.add(botBeam);

          const insertGeo = isGlass ? new THREE.BoxGeometry(rightWinW, rightWinH, insertD) : new THREE.PlaneGeometry(rightWinW, rightWinH);
          const rightInsert = new THREE.Mesh(insertGeo, rightSplitMat);
          rightInsert.position.set(-rightLeafW / 2, 0, 0);
          rightDoorGroup.add(rightInsert);
        }

        // Bi-fold knuckle center hinge if bifold
        if (isBifold) {
          for (const hingeY of [-bodyH * 0.35, 0, bodyH * 0.35]) {
            const bifoldHinge = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 5), hingeMat);
            bifoldHinge.position.set(-rightLeafW / 2, hingeY, zDir * 2);
            rightDoorGroup.add(bifoldHinge);
          }
        }

        // Right Escutcheon & Handle
        const rightEscutcheon = new THREE.Mesh(new THREE.BoxGeometry(7, 70, 4.5), bodyMat);
        rightEscutcheon.position.set(-rightLeafW + 7, 0, zDir * 2);
        rightDoorGroup.add(rightEscutcheon);

        const rightHandle = new THREE.Mesh(new THREE.BoxGeometry(4, 55, 9), handleMat);
        rightHandle.position.set(-rightLeafW + 7, 0, zDir * 4);
        rightDoorGroup.add(rightHandle);

        // Right Hinges
        for (const hingeY of [-bodyH * 0.38, bodyH * 0.38]) {
          const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 5), hingeMat);
          hinge.position.set(0, hingeY, zDir * -1);
          rightDoorGroup.add(hinge);
        }
        group.add(rightDoorGroup);

      } else if (isColo) {
        // ── Multi-Compartment Colocation Doors ──
        const numCompartments = doorStyle === 'multi-compartment-4' ? 4 : 2;
        const compH = (bodyH - (numCompartments - 1) * 6) / numCompartments;
        const dividerH = 6;
        const compPerfMat = makePerforatedMat(GLASS_HW * 2, compH, doorStyle);
        const compWingMat = makePerforatedMat(PERF_W, compH, doorStyle);

        for (let c = 0; c < numCompartments; c++) {
          const compDoorGroup = new THREE.Group();
          compDoorGroup.name = isRear ? `rack-rear-door-comp-${c}` : `rack-door-comp-${c}`;
          const centerY = (bodyH / 2) - (c * (compH + dividerH)) - (compH / 2);
          compDoorGroup.position.set(PERF_END, centerY, faceZ);

          const compGeo = new THREE.PlaneGeometry(GLASS_HW * 2, compH);
          const compDoor = new THREE.Mesh(compGeo, compPerfMat);
          compDoor.position.set(-PERF_END, 0, 0);
          compDoorGroup.add(compDoor);

          // Handle for each compartment
          const compHandle = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 8), handleMat);
          compHandle.position.set(-PERF_END - GLASS_HW + 10, 0, zDir * 3);
          compDoorGroup.add(compHandle);

          // Hinges for each compartment
          for (const hingeY of [-compH * 0.3, compH * 0.3]) {
            const hinge = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 4), hingeMat);
            hinge.position.set(0, hingeY, zDir * -1);
            compDoorGroup.add(hinge);
          }

          // Side mesh wings for compartment (single plane)
          const compPerfGeo = new THREE.PlaneGeometry(PERF_W, compH);
          const leftPerf = new THREE.Mesh(compPerfGeo, compWingMat);
          leftPerf.position.set(-(PERF_END + PERF_CX), 0, 0);
          compDoorGroup.add(leftPerf);

          const rightPerf = new THREE.Mesh(compPerfGeo, compWingMat);
          rightPerf.position.set(PERF_CX - PERF_END, 0, 0);
          compDoorGroup.add(rightPerf);

          group.add(compDoorGroup);

          // Horizontal steel divider bar between compartments
          if (c < numCompartments - 1) {
            const divY = (bodyH / 2) - ((c + 1) * compH + c * dividerH) - (dividerH / 2);
            const divider = new THREE.Mesh(new THREE.BoxGeometry(RACK_INNER_WIDTH + 8, dividerH, 12), bodyMat);
            divider.name = isRear ? 'rack-rear-colo-divider' : 'rack-colo-divider';
            divider.position.set(0, divY, faceZ - zDir * 2);
            group.add(divider);
          }
        }

      } else {
        // ── Single Door Styles (glass, acrylic, perforated, solid, louvered, wire-mesh, hexa, round-hole) ──
        const isSwingLeft = doorOp === 'swing-left';
        const doorGroup = new THREE.Group();
        doorGroup.name  = isSwingLeft ? `${prefix}-left` : prefix;
        const pivotX = isSwingLeft ? -PERF_END : PERF_END;
        doorGroup.position.set(pivotX, 0, faceZ);

        const isMeshDoor = doorStyle.includes('perforated') || doorStyle.includes('honeycomb') || doorStyle.includes('hexa') || doorStyle.includes('mesh') || doorStyle.includes('round-hole');
        const activeDoorMat = resolveDoorInsertMat(doorStyle, GLASS_HW * 2, bodyH);
        const wingMat = makePerforatedMat(PERF_W, bodyH, doorStyle);
        const glassGeo  = isMeshDoor ? new THREE.PlaneGeometry(GLASS_HW * 2, bodyH) : new THREE.BoxGeometry(GLASS_HW * 2, bodyH, 4);
        const glassDoor = new THREE.Mesh(glassGeo, activeDoorMat);
        glassDoor.name  = isRear ? 'rack-rear-glass' : 'rack-glass';
        const centerRelX = isSwingLeft ? PERF_END : -PERF_END;
        glassDoor.position.set(centerRelX, 0, isMeshDoor ? 0 : zDir * -2);
        doorGroup.add(glassDoor);

        // Louvered slats for louvered door
        if (doorStyle === 'louvered' || doorStyle === 'louvred') {
          const slatGeo = new THREE.BoxGeometry(GLASS_HW * 1.8, 3, 2);
          const numSlats = Math.floor(bodyH / 18);
          for (let s = 0; s < numSlats; s++) {
            const slat = new THREE.Mesh(slatGeo, handleMat);
            const slatY = -bodyH / 2 + 15 + s * 18;
            slat.position.set(centerRelX, slatY, zDir * 1);
            slat.rotation.x = zDir * 0.4; // tilted louver slat
            doorGroup.add(slat);
          }
        }

        // Handle & Hinges (handle on opposite edge of hinge)
        const handleGeo = new THREE.BoxGeometry(5, 65, 10);
        const handle    = new THREE.Mesh(handleGeo, handleMat);
        handle.name     = isRear ? 'rack-rear-handle' : 'rack-handle';
        const handlePosX = isSwingLeft ? (centerRelX + GLASS_HW - 10) : (centerRelX - GLASS_HW + 10);
        handle.position.set(handlePosX, 0, zDir * 3);
        doorGroup.add(handle);

        for (const hingeY of [-bodyH * 0.35, bodyH * 0.35]) {
          const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 14, 5), hingeMat);
          hinge.position.set(0, hingeY, zDir * -1);
          doorGroup.add(hinge);
        }

        // Red accent strips
        const redGeo  = new THREE.BoxGeometry(RED_W, bodyH, 11);
        const leftRed = new THREE.Mesh(redGeo, redMat);
        leftRed.name  = isRear ? 'rack-rear-red-L' : 'rack-red-L';
        leftRed.position.set(centerRelX - (GLASS_HW + RED_W / 2), 0, zDir * -5.5);
        doorGroup.add(leftRed);

        const rightRed = new THREE.Mesh(redGeo, redMat);
        rightRed.name  = isRear ? 'rack-rear-red-R' : 'rack-red-R';
        rightRed.position.set(centerRelX + (GLASS_HW + RED_W / 2), 0, zDir * -5.5);
        doorGroup.add(rightRed);

        // Perforated mesh wings
        const perfGeo  = new THREE.PlaneGeometry(PERF_W, bodyH);
        const leftPerf = new THREE.Mesh(perfGeo, wingMat);
        leftPerf.name  = isRear ? 'rack-rear-perf-L' : 'rack-perf-L';
        leftPerf.position.set(centerRelX - PERF_CX, 0, 0);
        doorGroup.add(leftPerf);

        const rightPerf = new THREE.Mesh(perfGeo, wingMat);
        rightPerf.name  = isRear ? 'rack-rear-perf-R' : 'rack-perf-R';
        rightPerf.position.set(centerRelX + PERF_CX, 0, 0);
        doorGroup.add(rightPerf);

        group.add(doorGroup);
      }

      // ── Door Operation Hardware Visual Cues (Sliding Track / Lift-off Pins) ──
      if (doorOp === 'sliding' || doorStyle.includes('sliding')) {
        // Top sliding track guide rail
        const trackGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH + 10, 10, 12);
        const topTrack = new THREE.Mesh(trackGeo, trackMat);
        topTrack.position.set(0, bodyH / 2 + 5, faceZ + zDir * 4);
        group.add(topTrack);

        // Bottom sliding track guide rail
        const botTrack = new THREE.Mesh(trackGeo, trackMat);
        botTrack.position.set(0, -bodyH / 2 - 5, faceZ + zDir * 4);
        group.add(botTrack);
      } else if (doorOp === 'lift-off') {
        // Quick-release ball-detent lift pins
        for (const px of [-PERF_END + 15, PERF_END - 15]) {
          const pinGeo = new THREE.CylinderGeometry(3, 3, 14, 12);
          const topPin = new THREE.Mesh(pinGeo, handleMat);
          topPin.position.set(px, bodyH / 2 + 3, faceZ + zDir * 2);
          group.add(topPin);

          const botPin = new THREE.Mesh(pinGeo, handleMat);
          botPin.position.set(px, -bodyH / 2 - 3, faceZ + zDir * 2);
          group.add(botPin);
        }
      }
    }
  }

  // ── 3D Vertical Cable Managers (Left & Right Side Ducts) ───────────────────
  const get3DVcmWidth = (w?: string): number => {
    switch (w) {
      case '2-inch': return 25;
      case '4-inch': return 45;
      case '6-inch': return 65;
      case '8-inch': return 85;
      default: return 0;
    }
  };

  // ── 3D 0U Side-Mount PDUs & Vertical Cable Managers ──────────────────────
  const pduMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1e26'), roughness: 0.45, metalness: 0.55 });
  const has3DLeftPdu = !!rack.leftPduId;
  const has3DRightPdu = !!rack.rightPduId;

  let leftPduW = 0;
  if (has3DLeftPdu) {
    const leftPduDevice = rack.leftPduId ? stateManager.getDevice(rack.leftPduId) : null;
    const leftPduTemplate = leftPduDevice ? getTemplate(leftPduDevice.templateId) : null;
    leftPduW = leftPduTemplate?.pduWidth ?? 44;
    const leftPduFaceMat = (leftPduDevice && leftPduTemplate)
      ? getSidePdu3DMaterial(rack, 'left', leftPduDevice, leftPduTemplate, leftPduW, bodyH)
      : make3DPduFaceMat('left', leftPduW);
    // BoxGeometry face order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z(front), 5=-Z(back)
    const pduMats = [pduMat, pduMat, pduMat, pduMat, leftPduFaceMat, pduMat];
    const pduGeo = new THREE.BoxGeometry(leftPduW, bodyH, 50);
    const pduMesh = new THREE.Mesh(pduGeo, pduMats);
    pduMesh.name = 'rack-pdu-left';
    pduMesh.position.set(-(RACK_OUTER_WIDTH / 2 + leftPduW / 2 + 2), 0, fz - 25);
    group.add(pduMesh);
  }

  let rightPduW = 0;
  if (has3DRightPdu) {
    const rightPduDevice = rack.rightPduId ? stateManager.getDevice(rack.rightPduId) : null;
    const rightPduTemplate = rightPduDevice ? getTemplate(rightPduDevice.templateId) : null;
    rightPduW = rightPduTemplate?.pduWidth ?? 44;
    const rightPduFaceMat = (rightPduDevice && rightPduTemplate)
      ? getSidePdu3DMaterial(rack, 'right', rightPduDevice, rightPduTemplate, rightPduW, bodyH)
      : make3DPduFaceMat('right', rightPduW);
    const pduMats = [pduMat, pduMat, pduMat, pduMat, rightPduFaceMat, pduMat];
    const pduGeo = new THREE.BoxGeometry(rightPduW, bodyH, 50);
    const pduMesh = new THREE.Mesh(pduGeo, pduMats);
    pduMesh.name = 'rack-pdu-right';
    pduMesh.position.set(RACK_OUTER_WIDTH / 2 + rightPduW / 2 + 2, 0, fz - 25);
    group.add(pduMesh);
  }

  const leftVcmW = get3DVcmWidth(rack.leftCableManagerWidth);
  if (leftVcmW > 0) {
    const leftVcmColor = rack.leftCableManagerColor || rack.rackColor || '#11141a';
    const vcmBodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(leftVcmColor), roughness: 0.75, metalness: 0.25 });
    const vcmFaceMat = getVcm3DMaterial(rack, 'left', leftVcmW, totalH, rack.units);
    const vcmMats = [vcmBodyMat, vcmBodyMat, vcmBodyMat, vcmBodyMat, vcmFaceMat, vcmBodyMat];
    const vcmGeo = new THREE.BoxGeometry(leftVcmW, shellH, 120);
    const leftVcmMesh = new THREE.Mesh(vcmGeo, vcmMats);
    leftVcmMesh.name = 'rack-vcm-left';
    const leftOffset = has3DLeftPdu ? (leftPduW + 4 + leftVcmW / 2 + 2) : (leftVcmW / 2 + 2);
    leftVcmMesh.position.set(-(RACK_OUTER_WIDTH / 2 + leftOffset), shellCenterY, fz - 65);
    group.add(leftVcmMesh);
  }

  const rightVcmW = get3DVcmWidth(rack.rightCableManagerWidth);
  if (rightVcmW > 0) {
    const rightVcmColor = rack.rightCableManagerColor || rack.rackColor || '#11141a';
    const vcmBodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(rightVcmColor), roughness: 0.75, metalness: 0.25 });
    const vcmFaceMat = getVcm3DMaterial(rack, 'right', rightVcmW, totalH, rack.units);
    const vcmMats = [vcmBodyMat, vcmBodyMat, vcmBodyMat, vcmBodyMat, vcmFaceMat, vcmBodyMat];
    const vcmGeo = new THREE.BoxGeometry(rightVcmW, shellH, 120);
    const rightVcmMesh = new THREE.Mesh(vcmGeo, vcmMats);
    rightVcmMesh.name = 'rack-vcm-right';
    const rightOffset = has3DRightPdu ? (rightPduW + 4 + rightVcmW / 2 + 2) : (rightVcmW / 2 + 2);
    rightVcmMesh.position.set(RACK_OUTER_WIDTH / 2 + rightOffset, shellCenterY, fz - 65);
    group.add(rightVcmMesh);
  }

  // ── 4-post L-angle rails, EIA-310 holes, depth bars ────────────────────────
  group.add(buildRackInternals(rack, bodyH, materials));

  // ── Bay interior ───────────────────────────────────────────────────────────
  const bayD   = RACK_DEPTH - 40;
  const bayMat = materials.get('bay');
  const bayGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, bodyH, bayD);
  const bay    = new THREE.Mesh(bayGeo, bayMat);
  bay.name     = 'rack-bay';
  bay.position.set(0, 0, -15);
  group.add(bay);

  // ── 4 × 120mm fan assemblies, mounted flush to the underside of the (thin) top panel ─────
  // (not embedded inside its thickness — see buildTopCapGeometry's comment: the round 120mm
  // vent hole is smaller than the fan housing's square footprint at the corners, so the housing
  // has to sit entirely below the panel to avoid overlapping the solid, uncut material.)
  const topFaceY = totalH / 2;  // top face Y in group-local space
  const panelUnderside = topFaceY - TOP_PLATE_THICKNESS;
  for (const [fx, fz2] of FAN_POSITIONS) {
    const fanGroup = buildFanAssembly();
    fanGroup.position.set(fx, panelUnderside - FAN_DEPTH / 2, fz2);
    group.add(fanGroup);
  }

  group.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
  return group;
}
