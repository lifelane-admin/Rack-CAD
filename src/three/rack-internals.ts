import * as THREE from 'three';
import type { RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';

const { RACK_INNER_WIDTH, RAIL_WIDTH } = RACK_CONSTANTS;

const RACK_DEPTH  = 600; // keep in sync with rack-builder.ts — avoids circular import
const FACE_D      = 5;   // face plate depth in Z
const FLANGE_T    = 5;   // depth flange thickness in X
const FLANGE_D    = 80;  // depth flange length in Z
const REAR_OFFSET = 50;  // rear rail face distance from back wall
const BAR_H       = 16;  // depth bar cross-section height

function makeRailHoleMat(units: number, isRightSide = false): THREE.MeshStandardMaterial {
  // Exact physical aspect ratio: RAIL_WIDTH (25mm) to RU_HEIGHT (44.45mm) = 1:1.778
  const CANVAS_W = 128;
  const PX_PER_U = Math.round(CANVAS_W * (44.45 / 25)); // 228px per 1U
  const canvas   = document.createElement('canvas');
  canvas.width   = CANVAS_W;
  canvas.height  = PX_PER_U * units;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x1a2535, metalness: 0.35, roughness: 0.6 });

  // Dark metallic steel rail body
  ctx.fillStyle = '#141820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // EIA-310: 3 square punch holes per rack unit
  const HOLE_W = 24, HOLE_H = 24;
  const HOLE_X = isRightSide ? 24 : 104; // Holes positioned on outer side of rail
  const TEXT_X = isRightSide ? 80 : 48;  // U number positioned towards inner side
  const offsets = [
    Math.round(PX_PER_U * 0.16),
    Math.round(PX_PER_U * 0.50),
    Math.round(PX_PER_U * 0.84),
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let u = 0; u < units; u++) {
    const uTop = u * PX_PER_U;
    const uNum = units - u; // top is highest U (e.g. 42), bottom is 1

    // Crisp RU boundary delimiter line across the rail
    ctx.fillStyle = '#3a4b60';
    ctx.fillRect(0, uTop, canvas.width, 3);

    // 3 Square EIA punch holes with metallic bevel
    for (const yOff of offsets) {
      ctx.fillStyle = '#010204';
      ctx.fillRect(HOLE_X - HOLE_W / 2, uTop + yOff - HOLE_H / 2, HOLE_W, HOLE_H);
      ctx.fillStyle = '#2d3e52';
      ctx.fillRect(HOLE_X - HOLE_W / 2, uTop + yOff - HOLE_H / 2, HOLE_W, 2.5);
    }

    // High-visibility Arial Black U number, perfectly proportioned without vertical stretching
    const isFiveMultiple = uNum % 5 === 0;
    ctx.font = isFiveMultiple
      ? '900 42px "Arial Black", Arial, sans-serif'
      : '900 36px "Arial Black", Arial, sans-serif';

    // Dark outline stroke for 100% crisp legibility
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(String(uNum), TEXT_X, uTop + PX_PER_U / 2);

    ctx.fillStyle = isFiveMultiple ? '#00e5ff' : '#ffffff';
    ctx.fillText(String(uNum), TEXT_X, uTop + PX_PER_U / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    metalness: 0.2,
    roughness: 0.5,
  });
}

export function buildRackInternals(
  rack: RackData,
  bodyH: number,
  materials: MaterialManager
): THREE.Group {
  const group = new THREE.Group();
  group.name  = 'rack-internals';

  const fz = RACK_DEPTH / 2; // 300
  const FRONT_RAIL_RECESS = 28; // Recessed behind front door bezel to prevent Z-fighting

  // X positions (shifted inwards to ±187.5 so they align between device bezel edge and side wall)
  const leftFaceX    = -(RACK_INNER_WIDTH / 2 - RAIL_WIDTH / 2);  // -187.5
  const rightFaceX   =  (RACK_INNER_WIDTH / 2 - RAIL_WIDTH / 2);  // +187.5
  const leftFlangeX  = -(RACK_INNER_WIDTH / 2 + FLANGE_T / 2);    // -202.5
  const rightFlangeX =  (RACK_INNER_WIDTH / 2 + FLANGE_T / 2);    // +202.5

  // Z positions (recessed cleanly away from front door plane)
  const frontFaceZ   =  fz - FRONT_RAIL_RECESS - FACE_D / 2;       // 269.5
  const rearFaceZ    = -fz + REAR_OFFSET + FACE_D / 2;             // -247.5
  const frontFlangeZ =  frontFaceZ - FACE_D / 2 - FLANGE_D / 2;   // 227
  const rearFlangeZ  =  rearFaceZ + FACE_D / 2 + FLANGE_D / 2;    // -205

  // Depth bar dimensions
  const barLen = Math.abs(frontFaceZ - rearFaceZ);
  const barZ   = (frontFaceZ + rearFaceZ) / 2;

  const railMat = materials.get('rail');
  const leftFrontHoleMat = makeRailHoleMat(rack.units, false);
  const rightFrontHoleMat = makeRailHoleMat(rack.units, true);
  const rearHoleMat = makeRailHoleMat(rack.units, false);

  // ── Face plates (EIA-310 hole + U numbering on front face) ───────────────
  const faceGeo = new THREE.BoxGeometry(RAIL_WIDTH, bodyH, FACE_D);

  // Multi-material: only face 4 (+Z front) has the U numbering texture; other 5 faces are solid rail steel
  const leftFrontMats = [railMat, railMat, railMat, railMat, leftFrontHoleMat, railMat];
  const rightFrontMats = [railMat, railMat, railMat, railMat, rightFrontHoleMat, railMat];
  const rearMats = [railMat, railMat, railMat, railMat, rearHoleMat, railMat];

  const leftFrontMesh = new THREE.Mesh(faceGeo, leftFrontMats);
  leftFrontMesh.name = 'rack-rail-front-face-L';
  leftFrontMesh.position.set(leftFaceX, 0, frontFaceZ);
  group.add(leftFrontMesh);

  const rightFrontMesh = new THREE.Mesh(faceGeo, rightFrontMats);
  rightFrontMesh.name = 'rack-rail-front-face-R';
  rightFrontMesh.position.set(rightFaceX, 0, frontFaceZ);
  group.add(rightFrontMesh);

  const leftRearMesh = new THREE.Mesh(faceGeo, rearMats);
  leftRearMesh.name = 'rack-rail-rear-face-L';
  leftRearMesh.position.set(leftFaceX, 0, rearFaceZ);
  group.add(leftRearMesh);

  const rightRearMesh = new THREE.Mesh(faceGeo, rearMats);
  rightRearMesh.name = 'rack-rail-rear-face-R';
  rightRearMesh.position.set(rightFaceX, 0, rearFaceZ);
  group.add(rightRearMesh);

  // ── Depth flanges (inner L-tab, plain steel) ──────────────────────────────
  const flangeGeo = new THREE.BoxGeometry(FLANGE_T, bodyH, FLANGE_D);

  for (const [x, z, name] of [
    [leftFlangeX,  frontFlangeZ, 'rack-flange-front-L'],
    [rightFlangeX, frontFlangeZ, 'rack-flange-front-R'],
    [leftFlangeX,  rearFlangeZ,  'rack-flange-rear-L'],
    [rightFlangeX, rearFlangeZ,  'rack-flange-rear-R'],
  ] as [number, number, string][]) {
    const mesh = new THREE.Mesh(flangeGeo, railMat);
    mesh.name  = name;
    mesh.position.set(x, 0, z);
    group.add(mesh);
  }

  // ── Horizontal depth bars (front rail → rear rail) ────────────────────────
  const barGeo = new THREE.BoxGeometry(RAIL_WIDTH, BAR_H, barLen);
  const topY   =  bodyH / 2 - BAR_H / 2;
  const botY   = -bodyH / 2 + BAR_H / 2;

  for (const [x, y, name] of [
    [leftFaceX,  topY, 'rack-bar-L-top'],
    [leftFaceX,  botY, 'rack-bar-L-bot'],
    [rightFaceX, topY, 'rack-bar-R-top'],
    [rightFaceX, botY, 'rack-bar-R-bot'],
  ] as [number, number, string][]) {
    const mesh = new THREE.Mesh(barGeo, railMat);
    mesh.name  = name;
    mesh.position.set(x, y, barZ);
    group.add(mesh);
  }

  return group;
}
