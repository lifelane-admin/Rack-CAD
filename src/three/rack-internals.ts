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

function makeRailHoleMat(units: number): THREE.MeshStandardMaterial {
  const PX_PER_U = 32;
  const canvas   = document.createElement('canvas');
  canvas.width   = 64;
  canvas.height  = PX_PER_U * units;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x1a2535, metalness: 0.55, roughness: 0.7 });

  ctx.fillStyle = '#131c28';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // EIA-310: 3 square punch holes per rack unit
  const HOLE_W = 8, HOLE_H = 8;
  const HOLE_X = (64 - HOLE_W) / 2; // centered = 28
  const offsets = [4, 13, 22];

  for (let u = 0; u < units; u++) {
    const uTop = u * PX_PER_U;
    for (const yOff of offsets) {
      ctx.fillStyle = '#060c14';
      ctx.fillRect(HOLE_X, uTop + yOff, HOLE_W, HOLE_H);
      ctx.fillStyle = '#1e2c3c'; // 1px bevel hint on top edge
      ctx.fillRect(HOLE_X, uTop + yOff, HOLE_W, 1);
    }
  }

  const tex  = new THREE.CanvasTexture(canvas);
  tex.wrapS  = THREE.ClampToEdgeWrapping;
  tex.wrapT  = THREE.ClampToEdgeWrapping;

  return new THREE.MeshStandardMaterial({
    color: 0x1a2535,
    map: tex,
    metalness: 0.55,
    roughness: 0.7,
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

  // X positions
  const leftFaceX    = -(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2);  // -212.5
  const rightFaceX   =  (RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2);  // +212.5
  const leftFlangeX  = -(RACK_INNER_WIDTH / 2 + FLANGE_T / 2);    // -202.5
  const rightFlangeX =  (RACK_INNER_WIDTH / 2 + FLANGE_T / 2);    // +202.5

  // Z positions
  const frontFaceZ   =  fz - FACE_D / 2;                           //  297.5
  const rearFaceZ    = -fz + REAR_OFFSET + FACE_D / 2;             // -247.5
  const frontFlangeZ =  fz - FACE_D - FLANGE_D / 2;                //  255
  const rearFlangeZ  = -fz + REAR_OFFSET + FACE_D + FLANGE_D / 2;  // -205

  // Depth bar dimensions
  const barLen = 2 * fz - 2 * FACE_D - REAR_OFFSET;                // 540
  const barZ   = ((fz - FACE_D) + (-fz + REAR_OFFSET + FACE_D)) / 2; // 25

  const railMat = materials.get('rail');
  const holeMat = makeRailHoleMat(rack.units);

  // ── Face plates (EIA-310 hole texture) ───────────────────────────────────
  const faceGeo = new THREE.BoxGeometry(RAIL_WIDTH, bodyH, FACE_D);

  for (const [x, z, name] of [
    [leftFaceX,  frontFaceZ, 'rack-rail-front-face-L'],
    [rightFaceX, frontFaceZ, 'rack-rail-front-face-R'],
    [leftFaceX,  rearFaceZ,  'rack-rail-rear-face-L'],
    [rightFaceX, rearFaceZ,  'rack-rail-rear-face-R'],
  ] as [number, number, string][]) {
    const mesh = new THREE.Mesh(faceGeo, holeMat);
    mesh.name  = name;
    mesh.position.set(x, 0, z);
    group.add(mesh);
  }

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
