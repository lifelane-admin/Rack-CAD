import { RackDiff } from './types';
import { CableData, DeviceData, RackData, Point } from '../core/types';

export interface ResolvedDiff {
  addDevices?: DeviceData[];
  removeDevices?: string[];
  updateDevices?: (Partial<DeviceData> & { id: string })[];
  addCables?: CableData[];
  removeCables?: string[];
  updateCables?: (Partial<CableData> & { id: string })[];
  updateAnchors?: { cableId: string; anchors: Point[] }[];
  addRacks?: RackData[];
  removeRacks?: string[];
  updateRacks?: (Partial<RackData> & { id: string })[];
}

/**
 * Validates and resolves a RackDiff against current device/cable IDs.
 * Returns null if diff is null (analysis-only response).
 * Filters out operations targeting non-existent IDs.
 */
export function applyDiff(
  rackDiff: RackDiff,
  existingDeviceIds: string[],
  existingCableIds: string[],
): ResolvedDiff | null {
  if (!rackDiff.diff) return null;

  const d = rackDiff.diff;
  const resolved: ResolvedDiff = {};

  if (d.addDevices?.length) resolved.addDevices = d.addDevices;
  if (d.removeDevices?.length) {
    resolved.removeDevices = d.removeDevices.filter(id => existingDeviceIds.includes(id));
  }
  if (d.updateDevices?.length) {
    resolved.updateDevices = d.updateDevices.filter(u => existingDeviceIds.includes(u.id));
  }
  if (d.addCables?.length) resolved.addCables = d.addCables;
  if (d.removeCables?.length) {
    resolved.removeCables = d.removeCables.filter(id => existingCableIds.includes(id));
  }
  if (d.updateCables?.length) {
    resolved.updateCables = d.updateCables.filter(u => existingCableIds.includes(u.id));
  }
  if (d.updateAnchors?.length) {
    resolved.updateAnchors = d.updateAnchors.filter(u => existingCableIds.includes(u.cableId));
  }
  if (d.addRacks?.length) resolved.addRacks = d.addRacks;
  if (d.removeRacks?.length) resolved.removeRacks = d.removeRacks;
  if (d.updateRacks?.length) resolved.updateRacks = d.updateRacks;

  return resolved;
}

/**
 * Applies a resolved diff to the current state arrays.
 * Returns the updated arrays to pass to stateManager.setState().
 */
export function executeResolvedDiff(
  resolved: ResolvedDiff,
  currentDevices: DeviceData[],
  currentCables: CableData[],
  currentRacks: RackData[],
): { devices: DeviceData[]; cables: CableData[]; racks: RackData[] } {
  let devices = [...currentDevices];
  let cables = [...currentCables];
  let racks = [...currentRacks];

  // Racks
  if (resolved.removeRacks) {
    racks = racks.filter(r => !resolved.removeRacks!.includes(r.id));
  }
  if (resolved.addRacks) racks = [...racks, ...resolved.addRacks];
  if (resolved.updateRacks) {
    racks = racks.map(r => {
      const update = resolved.updateRacks!.find(u => u.id === r.id);
      return update ? { ...r, ...update } : r;
    });
  }

  // Devices
  if (resolved.removeDevices) {
    devices = devices.filter(d => !resolved.removeDevices!.includes(d.id));
  }
  if (resolved.addDevices) devices = [...devices, ...resolved.addDevices];
  if (resolved.updateDevices) {
    devices = devices.map(d => {
      const update = resolved.updateDevices!.find(u => u.id === d.id);
      return update ? { ...d, ...update } : d;
    });
  }

  // Cables
  if (resolved.removeCables) {
    cables = cables.filter(c => !resolved.removeCables!.includes(c.id));
  }
  if (resolved.addCables) cables = [...cables, ...resolved.addCables];
  if (resolved.updateCables) {
    cables = cables.map(c => {
      const update = resolved.updateCables!.find(u => u.id === c.id);
      return update ? { ...c, ...update } : c;
    });
  }
  if (resolved.updateAnchors) {
    cables = cables.map(c => {
      const anchor = resolved.updateAnchors!.find(u => u.cableId === c.id);
      return anchor ? { ...c, anchorPoints: anchor.anchors } : c;
    });
  }

  return { devices, cables, racks };
}
