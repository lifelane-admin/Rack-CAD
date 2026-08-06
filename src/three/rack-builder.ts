import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { buildRackInternals } from './rack-internals';

const { RU_HEIGHT, RACK_OUTER_WIDTH, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

export const RACK_DEPTH = 600;

// ── Shared geometry ───────────────────────────────────────────────────────────

const FAN_SIZE  = 120;   // 120mm fan
const FAN_DEPTH = 28;    // fan assembly thickness

// Fan positions in rack-group local space (X, Z)
const FAN_POSITIONS: [number, number][] = [
  [-90, -100],
  [ 90, -100],
  [-90,  100],
  [ 90,  100],
];

// ── Canvas material factories ─────────────────────────────────────────────────

function makeBlackBodyMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x07090c, metalness: 0.25, roughness: 0.90,
  });
}

function makePerforatedMat(panelW: number, panelH: number): THREE.MeshStandardMaterial {
  const TW = 64, TH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x050709, metalness: 0.5, roughness: 0.7 });

  // Flat matte black
  ctx.fillStyle = '#06080c';
  ctx.fillRect(0, 0, TW, TH);

  // Round perforations — offset rows (real hex-pack spacing)
  const holeR = 5;
  const spacingX = 14, spacingY = 12;
  ctx.fillStyle = '#020406';
  for (let row = -1; row <= TH / spacingY + 1; row++) {
    for (let col = -1; col <= TW / spacingX + 1; col++) {
      const x = col * spacingX + (row % 2 === 0 ? 0 : spacingX / 2) + 7;
      const y = row * spacingY + 7;
      ctx.beginPath();
      ctx.arc(x, y, holeR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(panelW / 50, panelH / 50);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.2, roughness: 0.85 });
}

function makeVentHeaderMat(): THREE.MeshStandardMaterial {
  const TW = 512, TH = 32;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x04060a });

  ctx.fillStyle = '#060a0e';
  ctx.fillRect(0, 0, TW, TH);

  // Zig-zag vent slots
  ctx.fillStyle = '#020406';
  const tw = 15, th = Math.round(TH * 0.6), gap = 6;
  let tx = gap;
  while (tx + tw < TW - gap) {
    ctx.fillRect(tx, (TH - th) / 2, tw, th);
    tx += tw + gap;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, 0, TW, 1);

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.75 });
}

function makeSidePanelMat(): THREE.MeshStandardMaterial {
  const TW = 128, TH = 256;
  const canvas = document.createElement('canvas');
  canvas.width = TW; canvas.height = TH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x05080b, metalness: 0.55, roughness: 0.75 });

  // Near-black body with very subtle horizontal sheen
  const g = ctx.createLinearGradient(0, 0, TW, 0);
  g.addColorStop(0, '#05080b');
  g.addColorStop(0.45, '#090d12');
  g.addColorStop(0.55, '#090d12');
  g.addColorStop(1, '#05080b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, TH);

  ctx.globalAlpha = 0.03;
  for (let x = 0; x < TW; x += 2) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, 0, 1, TH);
  }
  ctx.globalAlpha = 1;

  // Edge specular highlights (vertical)
  const eg = ctx.createLinearGradient(0, 0, TW, 0);
  eg.addColorStop(0, 'rgba(255,255,255,0.06)');
  eg.addColorStop(0.08, 'rgba(255,255,255,0)');
  eg.addColorStop(0.92, 'rgba(255,255,255,0)');
  eg.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, TW, TH);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.88 });
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

  // Outer shroud frame
  const frameGeo = new THREE.BoxGeometry(FAN_SIZE, FAN_DEPTH, FAN_SIZE);
  // Per-face: sides use frameMat, top (+Y) uses guardMat
  const frameMats = [frameMat, frameMat, guardMat, frameMat, frameMat, frameMat];
  const frame = new THREE.Mesh(frameGeo, frameMats);
  frame.name = 'fan-frame';
  fan.add(frame);

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

// ── U-number label ────────────────────────────────────────────────────────────

function makeULabel(u: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(1, 1, 30, 18);
    ctx.fillStyle = '#8090a0';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(u), 16, 10);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(16, 10, 1);
  return sprite;
}

// ── Main build function ───────────────────────────────────────────────────────

export function buildRackGroup(rack: RackData, materials: MaterialManager): THREE.Group {
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

  // Materials
  const bodyMat   = makeBlackBodyMat();
  const railMat   = materials.get('rail');
  const sideMat   = makeSidePanelMat();
  const perfMat   = makePerforatedMat(PERF_W, bodyH);
  const ventMat   = makeVentHeaderMat();
  const glassMat  = new THREE.MeshStandardMaterial({
    color: 0x0d2035, transparent: true, opacity: 0.20,
    metalness: 0.04, roughness: 0.04, side: THREE.DoubleSide,
  });
  const redMat    = new THREE.MeshStandardMaterial({
    color: 0xcc1a00, metalness: 0.25, roughness: 0.5,
    emissive: 0x440500, emissiveIntensity: 0.35,
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x6080a0, metalness: 0.55, roughness: 0.45 });
  const hingeMat  = new THREE.MeshStandardMaterial({ color: 0x708090, metalness: 0.50, roughness: 0.50 });

  // ── Side outer panels ──────────────────────────────────────────────────────
  const sideGeo = new THREE.BoxGeometry(SIDE_T, totalH, RACK_DEPTH);
  const leftSide = new THREE.Mesh(sideGeo, sideMat);
  leftSide.name = 'rack-side-L';
  leftSide.position.set(-(RACK_OUTER_WIDTH / 2 - SIDE_T / 2), 0, 0);
  group.add(leftSide);

  const rightSide = new THREE.Mesh(sideGeo, sideMat);
  rightSide.name = 'rack-side-R';
  rightSide.position.set(RACK_OUTER_WIDTH / 2 - SIDE_T / 2, 0, 0);
  group.add(rightSide);

  // ── Back panel ─────────────────────────────────────────────────────────────
  const backGeo  = new THREE.BoxGeometry(RACK_OUTER_WIDTH, totalH, 10);
  const backPanel = new THREE.Mesh(backGeo, bodyMat);
  backPanel.name  = 'rack-back';
  backPanel.position.set(0, 0, -fz + 5);
  group.add(backPanel);

  // ── Top cap — rounded edges (12mm radius) ─────────────────────────────────
  const topGeo  = new RoundedBoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_DEPTH, 4, 12);
  const topCap  = new THREE.Mesh(topGeo, bodyMat);
  topCap.name   = 'rack-top';
  topCap.position.set(0, (totalH - RACK_PADDING_TOP) / 2, 0);
  group.add(topCap);

  // ── Bottom plinth ──────────────────────────────────────────────────────────
  const botGeo   = new THREE.BoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_BOTTOM, RACK_DEPTH);
  const botPlinth = new THREE.Mesh(botGeo, bodyMat);
  botPlinth.name  = 'rack-base';
  botPlinth.position.set(0, -(totalH - RACK_PADDING_BOTTOM) / 2, 0);
  group.add(botPlinth);

  // ── Front vent header strip ────────────────────────────────────────────────
  const ventH   = 14;
  const ventGeo = new THREE.BoxGeometry(RACK_OUTER_WIDTH, ventH, 6);
  const vent    = new THREE.Mesh(ventGeo, ventMat);
  vent.name     = 'rack-vent-header';
  vent.position.set(0, bodyH / 2 - ventH / 2, fz - 3);
  group.add(vent);

  // ── Door group (hinge pivot at right outer edge of door assembly) ────────────
  // Pivot = PERF_END (x=200) — the right edge where door meets the side wall.
  // All child local positions: local_x = world_x - PERF_END.
  const doorGroup = new THREE.Group();
  doorGroup.name  = 'rack-door';
  doorGroup.position.set(PERF_END, 0, fz);

  const glassGeo  = new THREE.BoxGeometry(GLASS_HW * 2, bodyH, 4);
  const glassDoor = new THREE.Mesh(glassGeo, glassMat);
  glassDoor.name  = 'rack-glass';
  glassDoor.position.set(-PERF_END, 0, -2);                        // world 0
  doorGroup.add(glassDoor);

  const handleGeo = new THREE.BoxGeometry(5, 65, 10);
  const handle    = new THREE.Mesh(handleGeo, handleMat);
  handle.name     = 'rack-handle';
  handle.position.set(-PERF_END - GLASS_HW + 10, 0, 3);           // world -85
  doorGroup.add(handle);

  for (const hingeY of [-bodyH * 0.35, bodyH * 0.35]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 14, 5), hingeMat);
    hinge.position.set(0, hingeY, -1);                             // world PERF_END
    doorGroup.add(hinge);
  }

  // Red accent strips — local x = world_x - PERF_END
  const redGeo  = new THREE.BoxGeometry(RED_W, bodyH, 11);
  const leftRed = new THREE.Mesh(redGeo, redMat);
  leftRed.name  = 'rack-red-L';
  leftRed.position.set(-(PERF_END + GLASS_HW + RED_W / 2), 0, -5.5); // world -97.5
  doorGroup.add(leftRed);

  const rightRed = new THREE.Mesh(redGeo, redMat);
  rightRed.name  = 'rack-red-R';
  rightRed.position.set(GLASS_HW + RED_W / 2 - PERF_END, 0, -5.5);   // world 97.5
  doorGroup.add(rightRed);

  // Perforated mesh wings — local x = world_x - PERF_END
  const perfGeo  = new THREE.BoxGeometry(PERF_W, bodyH - ventH, 9);
  const leftPerf = new THREE.Mesh(perfGeo, perfMat);
  leftPerf.name  = 'rack-perf-L';
  leftPerf.position.set(-(PERF_END + PERF_CX), -ventH / 2, -4.5);    // world -150
  doorGroup.add(leftPerf);

  const rightPerf = new THREE.Mesh(perfGeo, perfMat);
  rightPerf.name  = 'rack-perf-R';
  rightPerf.position.set(PERF_CX - PERF_END, -ventH / 2, -4.5);      // world 150
  doorGroup.add(rightPerf);

  group.add(doorGroup);

  // ── 4-post L-angle rails, EIA-310 holes, depth bars ──────────────────────
  group.add(buildRackInternals(rack, bodyH, materials));

  // ── Bay interior ───────────────────────────────────────────────────────────
  const bayD   = RACK_DEPTH - 40;
  const bayMat = materials.get('bay');
  const bayGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, bodyH, bayD);
  const bay    = new THREE.Mesh(bayGeo, bayMat);
  bay.name     = 'rack-bay';
  bay.position.set(0, 0, -15);
  group.add(bay);

  // ── 4 × 120mm fan assemblies on top panel ─────────────────────────────────
  const topFaceY = totalH / 2;  // top face Y in group-local space
  for (const [fx, fz2] of FAN_POSITIONS) {
    const fanGroup = buildFanAssembly();
    // Embed slightly below top face so guard is flush with panel surface
    fanGroup.position.set(fx, topFaceY - FAN_DEPTH / 2, fz2);
    group.add(fanGroup);
  }

  // ── U-number sprite labels ─────────────────────────────────────────────────
  for (let u = 1; u <= rack.units; u++) {
    const sprite      = makeULabel(u);
    const slotCenterY = -totalH / 2 + RACK_PADDING_BOTTOM + (u - 1) * RU_HEIGHT + RU_HEIGHT / 2;
    sprite.position.set(-(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2), slotCenterY, fz + 2);
    group.add(sprite);
  }

  group.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
  return group;
}
