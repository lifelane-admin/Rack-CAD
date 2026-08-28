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
  if (!portId) return null;
  for (const device of devices) {
    const port = device.ports.find(p => p.id === portId);
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



export function buildOrthogonal3DCurve(points2D: Point[], bendRadius: number, rack: RackData, laneZ: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const to3D = (p: Point, z: number) => new THREE.Vector3(p.x, (rack.y + totalH) - p.y, z);

  const fz = DEVICE_FACE_Z + 0.4;
  const portZ = fz - 1.0;
  const bootZ = fz + 9.5;

  const src2D = points2D[0];
  const dest2D = points2D[points2D.length - 1];

  // 1. Prepare the full 3D points sequence including straight leaders
  const pStart = to3D(src2D, portZ);
  const pExit = to3D(src2D, bootZ);

  const pts3D: THREE.Vector3[] = [pStart, pExit];
  for (let i = 1; i < points2D.length - 1; i++) {
    pts3D.push(to3D(points2D[i], laneZ));
  }

  const hasDest = (points2D.length > 2 && dest2D.x !== undefined);
  const pDestExit = hasDest ? to3D(dest2D, bootZ) : to3D(dest2D, laneZ);
  pts3D.push(pDestExit);

  if (hasDest) {
    const pEnd = to3D(dest2D, portZ);
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

function buildPlugGroup(
  pos2D: Point,
  rack: RackData,
  totalH: number,
  color: string,
  orientation: 'up' | 'down' = 'down'
): THREE.Group {
  const group = new THREE.Group();

  const x = pos2D.x;
  const y = (rack.y + totalH) - pos2D.y;
  const fz = DEVICE_FACE_Z + 0.4;

  const cableColor = new THREE.Color(color);

  // 1. Crystal Polycarbonate Material (translucent tinted, matches 2D head)
  const crystalMat = new THREE.MeshStandardMaterial({
    color: cableColor,
    transparent: true,
    opacity: 0.52,
    roughness: 0.1,
    metalness: 0.12,
  });

  // 2. Solid Rubber Boot Material (matches 2D boot)
  const bootMat = new THREE.MeshStandardMaterial({
    color: cableColor,
    roughness: 0.35,
    metalness: 0.08,
  });

  // 3. Dark Recess / Groove Material
  const grooveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x181a20),
    roughness: 0.6,
    metalness: 0.1,
  });

  // 4. Glare / Highlight line material (top reflection)
  const glareMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    roughness: 0.05,
    metalness: 0.3,
  });

  const isUp = orientation === 'up';
  const flipY = isUp ? -1 : 1;

  // 5. 50µ Gold Contact Pins Material (metallic gold gleam)
  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf59e0b),
    roughness: 0.15,
    metalness: 0.85,
  });

  // ── 1. Translucent Tinted Crystal Head (Inside Socket Cavity) ───────────────
  const crystalGeo = new THREE.BoxGeometry(6.8, 4.4, 4.5);
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.set(x, y, fz - 0.25);
  group.add(crystal);

  // 8 Gold Contact Pins inside crystal head
  for (let i = 0; i < 8; i++) {
    const px = -2.6 + i * 0.74;
    const pinGeo = new THREE.BoxGeometry(0.45, 1.8, 0.4);
    const pin = new THREE.Mesh(pinGeo, goldMat);
    pin.position.set(x + px, y + 1.0 * flipY, fz - 0.2);
    group.add(pin);
  }

  // Inner latch clip tab inside crystal
  const innerLatchGeo = new THREE.BoxGeometry(3.0, 1.2, 3.5);
  const innerLatch = new THREE.Mesh(innerLatchGeo, crystalMat);
  innerLatch.position.set(x, y - 1.2 * flipY, fz - 0.2);
  group.add(innerLatch);

  // ── 2. Solid Rubber Strain-Relief Boot (Collar Block) ────────────────────────
  const bootGeo = new THREE.BoxGeometry(5.8, 4.2, 3.2);
  const boot = new THREE.Mesh(bootGeo, bootMat);
  boot.position.set(x, y, fz + 3.4);
  group.add(boot);

  // Molded Snagless Latch Arch Cover (center bump)
  const archGeo = new THREE.BoxGeometry(2.4, 1.6, 2.8);
  const arch = new THREE.Mesh(archGeo, bootMat);
  arch.position.set(x, y - 2.0 * flipY, fz + 2.8);
  group.add(arch);

  // Snagless ramp
  const rampGeo = new THREE.BoxGeometry(2.4, 0.8, 2.0);
  rampGeo.rotateX(flipY * 0.3);
  const ramp = new THREE.Mesh(rampGeo, bootMat);
  ramp.position.set(x, y - 2.4 * flipY, fz + 1.2);
  group.add(ramp);

  // ── 3. Three Detailed Flex Collar Ridges (Ribs) ──────────────────────────────
  // Groove core
  const coreGeo = new THREE.BoxGeometry(3.2, 2.2, 4.0);
  const core = new THREE.Mesh(coreGeo, grooveMat);
  core.position.set(x, y, fz + 7.0);
  group.add(core);

  // Ridge 1
  const rib1 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 0.9), bootMat);
  rib1.position.set(x, y, fz + 5.5);
  group.add(rib1);

  // Ridge 2
  const rib2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.0, 0.9), bootMat);
  rib2.position.set(x, y, fz + 6.8);
  group.add(rib2);

  // Ridge 3
  const rib3 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.5, 0.9), bootMat);
  rib3.position.set(x, y, fz + 8.1);
  group.add(rib3);

  // ── 4. Cable Exit Sleeve ─────────────────────────────────────────────────────
  const exitSleeve = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 1.6), bootMat);
  exitSleeve.position.set(x, y, fz + 9.3);
  group.add(exitSleeve);

  return group;
}

export function buildCableMesh(cable: CableData, state: AppState): THREE.Mesh | THREE.Line | THREE.Group | null {
  const src2D = cable.sourcePortId ? portWorldPos2D(cable.sourcePortId, state) : cable.floatingSource;
  if (!src2D) return null;

  const dest2D = cable.destPortId ? portWorldPos2D(cable.destPortId, state) : cable.floatingDest;
  if (!dest2D) return null;

  const srcFound = cable.sourcePortId ? findPort(cable.sourcePortId, state.devices) : null;
  const destFound = cable.destPortId ? findPort(cable.destPortId, state.devices) : null;

  const device = srcFound?.device ?? destFound?.device;
  const rackId = device?.rackId ?? state.racks[0]?.id;
  const rack = state.racks.find(r => r.id === rackId);
  if (!rack) return null;

  const srcPortX = srcFound?.port.relativeX ?? destFound?.port.relativeX ?? 175;
  const useRight = POWER_TYPES.has(cable.type)
    || (cable as any).sidePreference === 'right'
    || srcPortX >= DEFAULT_DEVICE_WIDTH / 2;

  const side: 'left' | 'right' = useRight ? 'right' : 'left';
  const lane = rackId ? laneIndexFor(cable, rackId, side, state) % MAX_STAGGERED_LANES : 0;
  const laneZ = FRONT_Z + lane * LANE_Z_SPACING;

  const anchors = (cable.anchorsLocked && cable.anchorPoints && cable.anchorPoints.length > 0)
    ? cable.anchorPoints
    : computeSmartRouting(cable, src2D, dest2D);

  const allPoints2D = [src2D, ...anchors, dest2D];
  // Increase bend radius in 3D (to 22) for a smoother, realistic cable turn loop, capped dynamically by segment length
  const bendR = Math.max(22, cable.bendRadius ?? RACK_CONSTANTS.CABLE_BEND_RADIUS);

  const curve = buildOrthogonal3DCurve(allPoints2D, bendR, rack, laneZ);
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

  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const group = new THREE.Group();
  group.name = `cable-${cable.id}`;
  group.add(mesh);

  // Add source plug & boot (only if not an ear port and not floating)
  if (cable.sourcePortId && !cable.sourcePortId.includes('-ear-')) {
    const rawOrient = getPortOrientation(cable, 'source');
    const srcOrient = (rawOrient === 'up' || rawOrient === 'down') ? rawOrient : ((anchors[0] && anchors[0].y < src2D.y) ? 'up' : 'down');
    const srcPlug = buildPlugGroup(src2D, rack, totalH, cable.color, srcOrient);
    group.add(srcPlug);
  }

  // Add dest plug & boot (if not floating and not an ear port)
  if (cable.destPortId && !cable.destPortId.includes('-ear-')) {
    const rawOrient = getPortOrientation(cable, 'dest');
    const lastAnchor = anchors.length > 0 ? anchors[anchors.length - 1] : src2D;
    const destOrient = (rawOrient === 'up' || rawOrient === 'down') ? rawOrient : ((lastAnchor && lastAnchor.y < dest2D.y) ? 'up' : 'down');
    const destPlug = buildPlugGroup(dest2D, rack, totalH, cable.color, destOrient);
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
