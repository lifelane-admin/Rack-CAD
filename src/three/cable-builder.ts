import * as THREE from 'three';
import type { CableData, AppState, DeviceData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { RACK_DEPTH } from './rack-builder';

const { RACK_INNER_WIDTH, RAIL_WIDTH, RACK_OUTER_WIDTH, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

const DEFAULT_DEVICE_WIDTH = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350
// Channel runs along the INNER face of each rail, inside the rack cavity
const CH_INSET = 15; // px inside from inner rail edge
const LEFT_CH_LOCAL  = -(RACK_INNER_WIDTH / 2 - CH_INSET);  // -185 (left side, inside rack)
const RIGHT_CH_LOCAL =  (RACK_INNER_WIDTH / 2 - CH_INSET);  // +185 (right side, inside rack)
const BEND_R = 25;   // corner bend radius (same unit as RU_HEIGHT)
const FRONT_Z = RACK_DEPTH / 2 + 5; // just in front of rack face so cables are always visible

const POWER_TYPES = new Set(['power', 'c13-power', 'c19-power']);

// Small deliberate per-lane Z stagger for cables sharing the same rack+channel side. Without
// this, two cables whose vertical runs overlap in Y share the exact same X and Z for that whole
// stretch — literally identical tube geometry — which reads as flicker/z-fighting rather than a
// neat bundle. Staggering in Z (not X) was chosen because the channel's lateral room is only the
// ~25mm rail cavity (barely enough for the single base offset already), while Z is open space in
// front of the rack face with no collision risk.
const LANE_Z_SPACING = 3;
const MAX_STAGGERED_LANES = 8; // beyond this, extra cables in one channel just re-share a Z plane

function findPort(portId: string, devices: DeviceData[]) {
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

function portWorldPos(portId: string, state: AppState): PortWorldPos | null {
  const found = findPort(portId, state.devices);
  if (!found) return null;
  const { port, device } = found;

  const rack = state.racks.find(r => r.id === device.rackId);
  if (!rack) return null;

  const template = state.customTemplates?.find(t => t.id === device.templateId)
    ?? (state as any).templates?.find((t: any) => t.id === device.templateId);
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
  const srcFound = findPort(cable.sourcePortId, devices);
  if (!srcFound) return null;
  const srcPortX = srcFound.port.relativeX ?? 0;
  const useRight = POWER_TYPES.has(cable.type)
    || (cable as any).sidePreference === 'right'
    || srcPortX >= DEFAULT_DEVICE_WIDTH / 2;
  return useRight ? 'right' : 'left';
}

/** Deterministic position of `cable` among every other cable sharing the same rack + channel
 *  side, ordered by source port height (then cable id) so the assignment is stable across
 *  rebuilds regardless of array order. */
function laneIndexFor(cable: CableData, rackId: string, side: 'left' | 'right', state: AppState): number {
  const channelCables = (state.cables ?? []).filter(c => {
    const found = findPort(c.sourcePortId, state.devices);
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

export function buildCableMesh(cable: CableData, state: AppState): THREE.Mesh | THREE.Line | null {
  if ((cable as any).floatingDest && !cable.destPortId) {
    return buildFloatingMesh(cable, state);
  }

  const srcPos = portWorldPos(cable.sourcePortId, state);
  if (!srcPos) return null;

  const destPos = cable.destPortId ? portWorldPos(cable.destPortId, state) : null;
  if (!destPos) return null;

  const srcFound = findPort(cable.sourcePortId, state.devices);
  const srcPortX = srcFound?.port.relativeX ?? 0;
  const useRight = POWER_TYPES.has(cable.type)
    || (cable as any).sidePreference === 'right'
    || srcPortX >= DEFAULT_DEVICE_WIDTH / 2;

  const channelX = useRight ? RIGHT_CH_LOCAL : LEFT_CH_LOCAL;

  // portWorldPos returns rack-local X; cables live in scene (world) space → add rackGroupX
  const srcX  = srcPos.rackGroupX  + srcPos.x;
  const destX = destPos.rackGroupX + destPos.x;
  const chSrcX  = srcPos.rackGroupX  + channelX;
  const chDestX = destPos.rackGroupX + channelX;

  const side: 'left' | 'right' = useRight ? 'right' : 'left';
  const rackId = srcFound?.device.rackId;
  const lane = rackId ? laneIndexFor(cable, rackId, side, state) % MAX_STAGGERED_LANES : 0;
  const laneZ = FRONT_Z + lane * LANE_Z_SPACING;

  // Direction helpers for routing bends
  const hSign = useRight ? 1 : -1;   // +1 = right channel, -1 = left channel
  const vSign = destPos.y >= srcPos.y ? 1 : -1; // +1 going up, -1 going down

  // 6-point rectangular path: horizontal exit → corner → vertical run → corner → horizontal entry
  // Every point uses this cable's own laneZ (not the shared FRONT_Z) so cables bundled in the
  // same rack channel stagger slightly in depth instead of sharing identical geometry.
  const pts = [
    new THREE.Vector3(srcX,                    srcPos.y,              laneZ), // port exit
    new THREE.Vector3(chSrcX  - hSign * BEND_R, srcPos.y,              laneZ), // approach channel
    new THREE.Vector3(chSrcX,                   srcPos.y  + vSign * BEND_R, laneZ), // enter channel
    new THREE.Vector3(chDestX,                  destPos.y - vSign * BEND_R, laneZ), // exit channel
    new THREE.Vector3(chDestX - hSign * BEND_R, destPos.y,             laneZ), // leave channel
    new THREE.Vector3(destX,                    destPos.y,             laneZ), // port entry
  ];

  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 48, 5, 8, false);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cable.color),
    emissive: new THREE.Color(cable.color),
    emissiveIntensity: 0.15,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `cable-${cable.id}`;
  return mesh;
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
