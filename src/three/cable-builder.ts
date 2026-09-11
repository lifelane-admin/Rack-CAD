import * as THREE from 'three';
import type { CableData, AppState, DeviceData, RackData, Point } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { RACK_DEPTH, DEVICE_FACE_Z } from './rack-builder';
import { getTemplate } from '../library/device-catalog';
import { getPortOrientation, computeSmartRouting } from '../utils/routing';
import { stateManager } from '../core/state';

const { RACK_INNER_WIDTH, RAIL_WIDTH, RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

const DEFAULT_DEVICE_WIDTH = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
// Channel runs along the INNER face of each rail, inside the rack cavity
const CH_INSET = 15; // px inside from inner rail edge
const LEFT_CH_LOCAL  = -(RACK_INNER_WIDTH / 2 - CH_INSET);  // -185 (left side, inside rack)
const RIGHT_CH_LOCAL =  (RACK_INNER_WIDTH / 2 - CH_INSET);  // +185 (right side, inside rack)
const BEND_R = 25;   // corner bend radius (same unit as RU_HEIGHT)
const FRONT_Z = DEVICE_FACE_Z + 10; // in front of device face, behind front door

const POWER_TYPES = new Set(['power', 'c13-power', 'c19-power']);

// Small deliberate per-lane Z stagger for cables sharing the same rack+channel side. Without
// this, two cables whose vertical runs overlap in Y share the exact same X and Z for that whole
// stretch — literally identical tube geometry — which reads as flicker/z-fighting rather than a
// neat bundle. Staggering in Z (not X) was chosen because the channel's lateral room is only the
// ~25mm rail cavity (barely enough for the single base offset already), while Z is open space in
// front of the rack face with no collision risk.
const LANE_Z_SPACING = 3;
const MAX_STAGGERED_LANES = 8; // beyond this, extra cables in one channel just re-share a Z plane

function findPort(portId: string | null, devices: DeviceData[]) {
  if (!portId || !devices) return null;
  for (const device of devices) {
    const port = (device.ports || []).find(p => p.id === portId);
    if (port) return { port, device };
  }
  return null;
}

interface PortWorldPos {
  x: number;
  y: number;
  rackGroupX: number;
}

function portWorldPos(portId: string | null, state: AppState): PortWorldPos | null {
  if (!portId) return null;
  const found = findPort(portId, state.devices);
  if (!found) return null;
  const { port, device } = found;

  const rack = state.racks.find(r => r.id === device.rackId);
  if (!rack) return null;

  const template = getTemplate(device.templateId, state.customTemplates);
  const heightUnits: number = template?.heightUnits ?? 1;

  // rackGroupX is used only for channel side selection; cable points are rack-local
  const rackGroupX = rack.x + RACK_OUTER_WIDTH / 2;
  const deviceWidth3D: number = (device as any).device3D?.width
    ?? (template as any)?.default3D?.width
    ?? DEFAULT_DEVICE_WIDTH;

  // Rack-local x: device occupies [-deviceWidth3D/2, +deviceWidth3D/2] centered on rack group
  const portFraction = port.relativeX / DEFAULT_DEVICE_WIDTH;
  const localX = -deviceWidth3D / 2 + portFraction * deviceWidth3D;
  const worldY = RACK_PADDING_BOTTOM + (device.startUnit - 1 + heightUnits / 2) * RU_HEIGHT;

  return { x: localX, y: worldY, rackGroupX };
}

function resolveSide(cable: CableData, devices: DeviceData[]): 'left' | 'right' | null {
  const srcFound = cable.sourcePortId ? findPort(cable.sourcePortId, devices) : null;
  if (!srcFound) {
    const destFound = cable.destPortId ? findPort(cable.destPortId, devices) : null;
    if (destFound) {
      const destPortX = destFound.port.relativeX ?? 0;
      const useRight = POWER_TYPES.has(cable.type)
        || (cable as any).sidePreference === 'right'
        || destPortX >= DEFAULT_DEVICE_WIDTH / 2;
      return useRight ? 'right' : 'left';
    }
    return (cable as any).sidePreference === 'right' ? 'right' : 'left';
  }
  const srcPortX = srcFound.port.relativeX ?? 0;
  const useRight = POWER_TYPES.has(cable.type)
    || (cable as any).sidePreference === 'right'
    || srcPortX >= DEFAULT_DEVICE_WIDTH / 2;
  return useRight ? 'right' : 'left';
}

function laneIndexFor(cable: CableData, rackId: string, side: 'left' | 'right', state: AppState): number {
  const channelCables = (state.cables ?? []).filter(c => {
    const found = c.sourcePortId ? findPort(c.sourcePortId, state.devices) : null;
    if (!found || found.device.rackId !== rackId) return false;
    return resolveSide(c, state.devices) === side;
  });

  channelCables.sort((a, b) => {
    const posA = portWorldPos(a.sourcePortId, state);
    const posB = portWorldPos(b.sourcePortId, state);
    const yA = posA?.y ?? 0;
    const yB = posB?.y ?? 0;
    if (yA !== yB) return yA - yB;
    return a.id.localeCompare(b.id);
  });

  const idx = channelCables.findIndex(c => c.id === cable.id);
  return idx >= 0 ? idx : 0;
}

function portWorldPos2D(portId: string | null, state: AppState): Point | null {
  if (!portId) return null;
  const worldPos = stateManager.getPortWorldPosition(portId);
  if (worldPos) return worldPos;

  const found = findPort(portId, state.devices);
  if (!found) return null;
  const { port, device } = found;

  const rack = state.racks.find(r => r.id === device.rackId);
  if (!rack) return null;

  const template = getTemplate(device.templateId, state.customTemplates);
  const heightUnits: number = template?.heightUnits ?? 1;

  const deviceY = rack.y + RACK_PADDING_TOP + (rack.units - device.startUnit - heightUnits + 1) * RU_HEIGHT;
  const deviceX = rack.x + 50;

  return {
    x: deviceX + port.relativeX,
    y: deviceY + port.relativeY
  };
}



export function buildOrthogonal3DCurve(
  points2D: Point[],
  bendRadius: number,
  srcRack: RackData,
  destRack: RackData,
  laneZ: number
): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const srcTotalH = RACK_PADDING_TOP + srcRack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const destTotalH = RACK_PADDING_TOP + destRack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;

  const srcTo3D = (p: Point, z: number) => new THREE.Vector3(p.x, (srcRack.y + srcTotalH) - p.y, z);
  const destTo3D = (p: Point, z: number) => new THREE.Vector3(p.x, (destRack.y + destTotalH) - p.y, z);

  const fz = DEVICE_FACE_Z + 0.4;
  const portZ = fz - 1.0;
  const bootZ = fz + 9.5;

  const src2D = points2D[0];
  const dest2D = points2D[points2D.length - 1];

  // 1. Prepare the full 3D points sequence including straight leaders
  const pStart = srcTo3D(src2D, portZ);
  const pExit = srcTo3D(src2D, bootZ);

  const pts3D: THREE.Vector3[] = [pStart, pExit];
  const numIntermediates = points2D.length - 2;

  for (let i = 1; i < points2D.length - 1; i++) {
    const pt = points2D[i];
    // Linearly blend or select the corresponding rack coordinate transformation for inter-rack anchors
    const alpha = numIntermediates > 0 ? (i - 1) / Math.max(1, numIntermediates) : 0;
    const rackY = srcRack.y * (1 - alpha) + destRack.y * alpha;
    const totalH = srcTotalH * (1 - alpha) + destTotalH * alpha;
    const y3D = (rackY + totalH) - pt.y;
    pts3D.push(new THREE.Vector3(pt.x, y3D, laneZ));
  }

  const hasDest = (points2D.length > 2 && dest2D.x !== undefined);
  const pDestExit = hasDest ? destTo3D(dest2D, bootZ) : destTo3D(dest2D, laneZ);
  pts3D.push(pDestExit);

  if (hasDest) {
    const pEnd = destTo3D(dest2D, portZ);
    pts3D.push(pEnd);
  }

  // 2. Round the corners of the entire 3D path
  let lastPoint = pStart;
  for (let i = 1; i < pts3D.length; i++) {
    const prev = pts3D[i - 1];
    const curr = pts3D[i];

    if (i === pts3D.length - 1) {
      path.add(new THREE.LineCurve3(lastPoint, curr));
      lastPoint = curr;
      continue;
    }

    const next = pts3D[i + 1];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d1z = curr.z - prev.z;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const d2z = next.z - curr.z;
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z);

    if (l1 < 0.5 || l2 < 0.5) {
      path.add(new THREE.LineCurve3(lastPoint, curr));
      lastPoint = curr;
      continue;
    }

    // Determine corner rounding radius
    let r = Math.min(bendRadius, l1 / 2, l2 / 2);
    // For the boot-exit joints, cap the radius to 3.0 to ensure a straight lead-out before bending
    if (i === 1 || (hasDest && i === pts3D.length - 2)) {
      r = Math.min(r, 3.0);
    }

    if (r < 0.5) {
      path.add(new THREE.LineCurve3(lastPoint, curr));
      lastPoint = curr;
      continue;
    }

    const px = curr.x - (d1x / l1) * r;
    const py = curr.y - (d1y / l1) * r;
    const pz = curr.z - (d1z / l1) * r;
    const p3D = new THREE.Vector3(px, py, pz);

    const nx = curr.x + (d2x / l2) * r;
    const ny = curr.y + (d2y / l2) * r;
    const nz = curr.z + (d2z / l2) * r;
    const n3D = new THREE.Vector3(nx, ny, nz);

    path.add(new THREE.LineCurve3(lastPoint, p3D));
    path.add(new THREE.QuadraticBezierCurve3(p3D, curr, n3D));

    lastPoint = n3D;
  }

  return path;
}

export type Connector3DKind = 'rj45' | 'sfp' | 'fiber' | 'mpo' | 'power' | 'ground' | 'dsub' | 'video' | 'usb';

export function getConnectorKind(
  cable: CableData,
  portId: string | null,
  state: AppState
): Connector3DKind {
  const cType = (cable.type || '').toLowerCase();
  const found = portId ? findPort(portId, state.devices) : null;
  const pType = (found?.port?.type || '').toLowerCase();

  if (cType === 'ground') return 'ground';
  if (
    cType.includes('power') || cType.includes('c13') || cType.includes('c19') ||
    pType.includes('power') || pType.includes('c13') || pType.includes('c19') || pType.includes('outlet') ||
    cable.powerCableType === 'power'
  ) {
    return 'power';
  }
  if (cType.includes('mpo') || cType.includes('mtp')) return 'mpo';
  if (
    cType.includes('dac') || cType.includes('sfp') || cType.includes('qsfp') ||
    cType.includes('sas') || cType.includes('mcio') ||
    pType.includes('sfp') || pType.includes('qsfp')
  ) {
    return 'sfp';
  }
  if (
    cType.includes('fiber') || cType.includes('om3') || cType.includes('om4') || cType.includes('om5') ||
    cType.includes('lc') || cType.includes('sc') || cType.includes('st') ||
    pType.includes('fiber') || pType.includes('lc') || pType.includes('sc')
  ) {
    return 'fiber';
  }
  if (cType.includes('vga') || cType.includes('serial-rs232') || cType.includes('db9') || pType.includes('serial') || pType.includes('console')) {
    return 'dsub';
  }
  if (cType.includes('hdmi') || cType.includes('displayport') || pType.includes('hdmi') || pType.includes('displayport') || pType.includes('dp')) {
    return 'video';
  }
  if (cType.includes('usb') || pType.includes('usb')) return 'usb';

  return 'rj45';
}

/**
 * 1. 3D Enterprise RJ45 Modular Connector
 */
function buildRJ45Plug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const crystalMat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.52,
    roughness: 0.1,
    metalness: 0.12,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.08,
  });
  const grooveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x181a20),
    roughness: 0.6,
    metalness: 0.1,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf59e0b),
    roughness: 0.15,
    metalness: 0.85,
  });

  // Translucent crystal plug head
  const crystal = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 4.5), crystalMat);
  crystal.position.set(x, y, fz - 0.25);
  group.add(crystal);

  // 8 Gold Contact Pins
  for (let i = 0; i < 8; i++) {
    const px = -2.6 + i * 0.74;
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 0.4), goldMat);
    pin.position.set(x + px, y + 1.0 * flipY, fz - 0.2);
    group.add(pin);
  }

  // Snagless latch ramp & boot collar
  const boot = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.2, 3.2), bootMat);
  boot.position.set(x, y, fz + 3.4);
  group.add(boot);

  const arch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.8), bootMat);
  arch.position.set(x, y - 2.0 * flipY, fz + 2.8);
  group.add(arch);

  // Ribs
  const core = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 4.0), grooveMat);
  core.position.set(x, y, fz + 7.0);
  group.add(core);

  const rib1 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 0.9), bootMat);
  rib1.position.set(x, y, fz + 5.5);
  group.add(rib1);

  const rib2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.0, 0.9), bootMat);
  rib2.position.set(x, y, fz + 6.8);
  group.add(rib2);

  const rib3 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.5, 0.9), bootMat);
  rib3.position.set(x, y, fz + 8.1);
  group.add(rib3);

  const exitSleeve = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 1.6), bootMat);
  exitSleeve.position.set(x, y, fz + 9.3);
  group.add(exitSleeve);

  return group;
}

/**
 * 2. 3D SFP+ / QSFP28 / DAC Transceiver Cage Module
 */
function buildSFPTransceiverPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd1d5db),
    metalness: 0.88,
    roughness: 0.22,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x374151),
    metalness: 0.8,
    roughness: 0.35,
  });
  const latchMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
  });

  // Die-cast zinc alloy transceiver casing inserted into cage
  const cage = new THREE.Mesh(new THREE.BoxGeometry(7.8, 5.2, 6.0), metalMat);
  cage.position.set(x, y, fz + 0.5);
  group.add(cage);

  // Metallic front collar ring
  const collar = new THREE.Mesh(new THREE.BoxGeometry(8.2, 5.6, 1.2), darkMetalMat);
  collar.position.set(x, y, fz + 3.8);
  group.add(collar);

  // Bail latch release pull-tab (color-coded)
  const pullTab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 2.4), latchMat);
  pullTab.position.set(x, y - 2.4 * flipY, fz + 3.0);
  group.add(pullTab);

  // Metal crimp sleeve
  const crimp = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 2.8), metalMat);
  crimp.position.set(x, y, fz + 5.5);
  group.add(crimp);

  // Flexible twinax / optical exit boot
  const boot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.8, 3.5), bootMat);
  boot.position.set(x, y, fz + 8.2);
  group.add(boot);

  return group;
}

/**
 * 3. 3D Fiber Duplex LC Connector
 */
function buildFiberLCPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const ferruleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf8fafc),
    roughness: 0.15,
    metalness: 0.1,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0284c7),
    roughness: 0.1,
    metalness: 0.3,
  });
  const housingMat = new THREE.MeshStandardMaterial({
    color: color.getHex() === 0x2563eb ? new THREE.Color(0x06b6d4) : color,
    roughness: 0.35,
    metalness: 0.15,
  });
  const clipMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xe2e8f0),
    roughness: 0.3,
    metalness: 0.2,
  });

  // Dual Ceramic Optical Ferrules
  const ferrule1 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 12), ferruleMat);
  ferrule1.rotation.x = Math.PI / 2;
  ferrule1.position.set(x - 1.5, y, fz - 0.8);
  group.add(ferrule1);

  const core1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), coreMat);
  core1.rotation.x = Math.PI / 2;
  core1.position.set(x - 1.5, y, fz - 2.2);
  group.add(core1);

  const ferrule2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 12), ferruleMat);
  ferrule2.rotation.x = Math.PI / 2;
  ferrule2.position.set(x + 1.5, y, fz - 0.8);
  group.add(ferrule2);

  const core2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), coreMat);
  core2.rotation.x = Math.PI / 2;
  core2.position.set(x + 1.5, y, fz - 2.2);
  group.add(core2);

  // Duplex Housing Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.4, 4.2), housingMat);
  body.position.set(x, y, fz + 2.0);
  group.add(body);

  // Duplex Snagless Clip
  const clip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 3.0), clipMat);
  clip.position.set(x, y - 2.2 * flipY, fz + 2.2);
  group.add(clip);

  // Dual Optical Rubber Boots
  const boot1 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 4.2, 12), housingMat);
  boot1.rotation.x = Math.PI / 2;
  boot1.position.set(x - 1.5, y, fz + 5.8);
  group.add(boot1);

  const boot2 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 4.2, 12), housingMat);
  boot2.rotation.x = Math.PI / 2;
  boot2.position.set(x + 1.5, y, fz + 5.8);
  group.add(boot2);

  return group;
}

/**
 * 4. 3D MPO / MTP-12 High Density Multi-Fiber Trunk Connector
 */
function buildMPOPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const ferruleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf1f5f9),
    roughness: 0.2,
    metalness: 0.2,
  });
  const housingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0d9488),
    roughness: 0.35,
    metalness: 0.15,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xdb2777),
    roughness: 0.3,
    metalness: 0.1,
  });

  // Wide rectangular ferrule with 12 micro fiber holes
  const ferrule = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 3.0), ferruleMat);
  ferrule.position.set(x, y, fz - 0.5);
  group.add(ferrule);

  // Release slider housing
  const housing = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.8, 4.5), housingMat);
  housing.position.set(x, y, fz + 2.5);
  group.add(housing);

  // Outer magenta pull sleeve
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(8.6, 5.2, 2.4), sleeveMat);
  sleeve.position.set(x, y, fz + 4.8);
  group.add(sleeve);

  // Heavy-duty trunk boot
  const boot = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.6, 3.8), housingMat);
  boot.position.set(x, y, fz + 7.6);
  group.add(boot);

  return group;
}

/**
 * 5. 3D IEC Power Plug (C13 / C14 / C19)
 */
function buildPowerIECPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const shroudMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x181c22),
    roughness: 0.45,
    metalness: 0.1,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.12,
  });
  const pinSlotMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0a0c10),
    roughness: 0.8,
  });

  // Molded IEC shroud head inserted flush
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(7.6, 6.2, 4.5), shroudMat);
  shroud.position.set(x, y, fz + 0.5);
  group.add(shroud);

  // 3 Contact Slots / Prongs face
  const slot = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.8, 0.4), pinSlotMat);
  slot.position.set(x, y, fz - 1.6);
  group.add(slot);

  // Finger grip indent collar
  const grip = new THREE.Mesh(new THREE.BoxGeometry(8.2, 6.8, 2.2), shroudMat);
  grip.position.set(x, y, fz + 3.4);
  group.add(grip);

  // High-amp molded strain relief boot
  const boot = new THREE.Mesh(new THREE.BoxGeometry(5.8, 5.0, 4.2), bootMat);
  boot.position.set(x, y, fz + 6.2);
  group.add(boot);

  // Exit sleeve
  const exit = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.8, 2.0), bootMat);
  exit.position.set(x, y, fz + 8.8);
  group.add(exit);

  return group;
}

/**
 * 6. 3D Rack Chassis Grounding Terminal Lug
 */
function buildGroundLugPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd97706),
    metalness: 0.9,
    roughness: 0.2,
  });
  const earthMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x16a34a),
    roughness: 0.4,
    metalness: 0.1,
  });

  // Dual-hole copper terminal ring
  const lug = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.2, 0.8), goldMat);
  lug.position.set(x, y, fz - 0.2);
  group.add(lug);

  // Terminal crimp barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4.0, 12), goldMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(x, y, fz + 2.0);
  group.add(barrel);

  // Earth green-yellow heat shrink sleeve
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4.5, 12), earthMat);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(x, y, fz + 5.8);
  group.add(sleeve);

  return group;
}

/**
 * 7. 3D Serial DB9 / VGA D-Sub Connector
 */
function buildDSubPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x94a3b8),
    metalness: 0.85,
    roughness: 0.25,
  });
  const hoodMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
  });
  const screwMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x475569),
    metalness: 0.9,
    roughness: 0.2,
  });

  // D-Sub metal shield
  const shield = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.0, 2.5), metalMat);
  shield.position.set(x, y, fz - 0.2);
  group.add(shield);

  // Molded connector hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6.2, 5.0), hoodMat);
  hood.position.set(x, y, fz + 3.2);
  group.add(hood);

  // Dual knurled thumbscrews
  const screwL = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 10), screwMat);
  screwL.rotation.x = Math.PI / 2;
  screwL.position.set(x - 5.4, y, fz + 3.0);
  group.add(screwL);

  const screwR = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 10), screwMat);
  screwR.rotation.x = Math.PI / 2;
  screwR.position.set(x + 5.4, y, fz + 3.0);
  group.add(screwR);

  // Cable exit grommet
  const grommet = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.5, 3.0, 12), hoodMat);
  grommet.rotation.x = Math.PI / 2;
  grommet.position.set(x, y, fz + 6.8);
  group.add(grommet);

  return group;
}

/**
 * 8. 3D HDMI / DisplayPort Digital Video Plug
 */
function buildVideoDigitalPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const shieldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf59e0b),
    metalness: 0.85,
    roughness: 0.2,
  });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1e293b),
    roughness: 0.35,
    metalness: 0.15,
  });

  // Gold-plated video shield
  const shield = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.8, 3.2), shieldMat);
  shield.position.set(x, y, fz - 0.4);
  group.add(shield);

  // Low-profile molded body
  const body = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.4, 5.0), bodyMat);
  body.position.set(x, y, fz + 3.2);
  group.add(body);

  // Exit boot
  const boot = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.0, 2.6), bodyMat);
  boot.position.set(x, y, fz + 6.8);
  group.add(boot);

  return group;
}

/**
 * 9. 3D USB Type-A / Type-C Universal Plug
 */
function buildUSBPlug(x: number, y: number, fz: number, color: THREE.Color, flipY: number): THREE.Group {
  const group = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd1d5db),
    metalness: 0.9,
    roughness: 0.2,
  });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1e2024),
    roughness: 0.4,
    metalness: 0.1,
  });

  // Reversible metal plug tongue
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 3.0), metalMat);
  tongue.position.set(x, y, fz - 0.4);
  group.add(tongue);

  // Molded handle
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.4, 4.5), bodyMat);
  body.position.set(x, y, fz + 3.0);
  group.add(body);

  // Exit sleeve
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.2), bodyMat);
  sleeve.position.set(x, y, fz + 6.0);
  group.add(sleeve);

  return group;
}

function buildPlugGroup(
  pos2D: Point,
  rack: RackData,
  totalH: number,
  color: string,
  orientation: 'up' | 'down' = 'down',
  kind: Connector3DKind = 'rj45'
): THREE.Group {
  const x = pos2D.x;
  const y = (rack.y + totalH) - pos2D.y;
  const fz = DEVICE_FACE_Z + 0.4;
  const cableColor = new THREE.Color(color);
  const isUp = orientation === 'up';
  const flipY = isUp ? -1 : 1;

  switch (kind) {
    case 'sfp':
      return buildSFPTransceiverPlug(x, y, fz, cableColor, flipY);
    case 'fiber':
      return buildFiberLCPlug(x, y, fz, cableColor, flipY);
    case 'mpo':
      return buildMPOPlug(x, y, fz, cableColor, flipY);
    case 'power':
      return buildPowerIECPlug(x, y, fz, cableColor, flipY);
    case 'ground':
      return buildGroundLugPlug(x, y, fz, cableColor, flipY);
    case 'dsub':
      return buildDSubPlug(x, y, fz, cableColor, flipY);
    case 'video':
      return buildVideoDigitalPlug(x, y, fz, cableColor, flipY);
    case 'usb':
      return buildUSBPlug(x, y, fz, cableColor, flipY);
    case 'rj45':
    default:
      return buildRJ45Plug(x, y, fz, cableColor, flipY);
  }
}

export function buildCableMesh(cable: CableData, state: AppState): THREE.Mesh | THREE.Line | THREE.Group | null {
  const src2D = cable.sourcePortId ? portWorldPos2D(cable.sourcePortId, state) : cable.floatingSource;
  if (!src2D) return null;

  const dest2D = cable.destPortId ? portWorldPos2D(cable.destPortId, state) : cable.floatingDest;
  if (!dest2D) return null;

  const srcFound = cable.sourcePortId ? findPort(cable.sourcePortId, state.devices) : null;
  const destFound = cable.destPortId ? findPort(cable.destPortId, state.devices) : null;

  const srcRackId = srcFound?.device?.rackId ?? state.racks[0]?.id;
  const destRackId = destFound?.device?.rackId ?? srcRackId ?? state.racks[0]?.id;

  const srcRack = state.racks.find(r => r.id === srcRackId) || state.racks[0];
  const destRack = state.racks.find(r => r.id === destRackId) || srcRack;
  if (!srcRack) return null;

  const srcPortX = srcFound?.port.relativeX ?? destFound?.port.relativeX ?? 175;
  const useRight = POWER_TYPES.has(cable.type)
    || (cable as any).sidePreference === 'right'
    || srcPortX >= DEFAULT_DEVICE_WIDTH / 2;

  const side: 'left' | 'right' = useRight ? 'right' : 'left';
  const lane = srcRackId ? laneIndexFor(cable, srcRackId, side, state) % MAX_STAGGERED_LANES : 0;
  const laneZ = FRONT_Z + lane * LANE_Z_SPACING;

  const anchors = (cable.anchorsLocked && cable.anchorPoints && cable.anchorPoints.length > 0)
    ? cable.anchorPoints
    : computeSmartRouting(cable, src2D, dest2D);

  const allPoints2D = [src2D, ...anchors, dest2D];
  // Increase bend radius in 3D (to 22) for a smoother, realistic cable turn loop, capped dynamically by segment length
  const bendR = Math.max(22, cable.bendRadius ?? RACK_CONSTANTS.CABLE_BEND_RADIUS);

  const curve = buildOrthogonal3DCurve(allPoints2D, bendR, srcRack, destRack, laneZ);
  // Increase tubular segments to 256 and radial segments to 12 for perfectly smooth, round-edged turns
  const geo = new THREE.TubeGeometry(curve, 256, 2, 12, false);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cable.color),
    roughness: 0.65,
    metalness: 0.04,
    transparent: true,
    opacity: 0.96,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `cable-tube-${cable.id}`;

  const srcTotalH = RACK_PADDING_TOP + srcRack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const destTotalH = RACK_PADDING_TOP + destRack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;

  const group = new THREE.Group();
  group.name = `cable-${cable.id}`;
  group.add(mesh);

  // Add source plug & boot (only if not an ear port and not floating)
  if (cable.sourcePortId && !cable.sourcePortId.includes('-ear-')) {
    const rawOrient = getPortOrientation(cable, 'source');
    const srcOrient = (rawOrient === 'up' || rawOrient === 'down') ? rawOrient : ((anchors[0] && anchors[0].y < src2D.y) ? 'up' : 'down');
    const srcKind = getConnectorKind(cable, cable.sourcePortId, state);
    const srcPlug = buildPlugGroup(src2D, srcRack, srcTotalH, cable.color, srcOrient, srcKind);
    group.add(srcPlug);
  }

  // Add dest plug & boot (if not floating and not an ear port)
  if (cable.destPortId && !cable.destPortId.includes('-ear-')) {
    const rawOrient = getPortOrientation(cable, 'dest');
    const lastAnchor = anchors.length > 0 ? anchors[anchors.length - 1] : src2D;
    const destOrient = (rawOrient === 'up' || rawOrient === 'down') ? rawOrient : ((lastAnchor && lastAnchor.y < dest2D.y) ? 'up' : 'down');
    const destKind = getConnectorKind(cable, cable.destPortId, state);
    const destPlug = buildPlugGroup(dest2D, destRack, destTotalH, cable.color, destOrient, destKind);
    group.add(destPlug);
  }

  return group;
}

function buildFloatingMesh(cable: CableData, state: AppState): THREE.Line | null {
  const srcPos = portWorldPos(cable.sourcePortId, state);
  if (!srcPos || !(cable as any).floatingDest) return null;

  const fd = (cable as any).floatingDest;
  const points = [
    new THREE.Vector3(srcPos.rackGroupX + srcPos.x, srcPos.y, FRONT_Z),
    new THREE.Vector3(fd.x, fd.y, FRONT_Z),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({ color: new THREE.Color(cable.color), dashSize: 10, gapSize: 5 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  line.name = `cable-${cable.id}`;
  return line;
}
