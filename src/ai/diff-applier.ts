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
 * Validates and resolves a RackDiff against current device/cable/rack IDs.
 * Returns null if diff is null (analysis-only response).
 * Filters out operations targeting non-existent IDs.
 */
export function applyDiff(
  rackDiff: RackDiff,
  existingDeviceIds: string[],
  existingCableIds: string[],
  existingRackIds: string[] = [],
): ResolvedDiff | null {
  if (!rackDiff.diff) return null;

  const d = rackDiff.diff;
  const resolved: ResolvedDiff = {};

  if (d.addDevices?.length) {
    const sanitizedDevices: DeviceData[] = d.addDevices.map((raw: any, index: number) => {
      const name = raw.name || raw.hostname || raw.model || 'New Device';
      const defaults = {
        id: `dev_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        templateId: 'generic-server-1u',
        rackId: existingRackIds[0] || 'rack-1',
        startUnit: 1,
        name,
        hostname: name.toLowerCase().replace(/\s+/g, '-'),
        managementIp: '',
        serialNumber: '',
        description: '',
        ports: [],
      };
      const merged = Object.assign({}, defaults, raw);
      merged.id = raw.id || defaults.id;
      merged.templateId = raw.templateId || defaults.templateId;
      merged.rackId = raw.rackId || defaults.rackId;
      merged.startUnit = Number(raw.startUnit ?? raw.ruStart ?? raw.ruPosition ?? defaults.startUnit);
      merged.name = name;
      merged.ports = Array.isArray(raw.ports) ? raw.ports : defaults.ports;
      return merged as DeviceData;
    });

    const filtered = sanitizedDevices.filter(d => !existingDeviceIds.includes(d.id));
    if (filtered.length) resolved.addDevices = filtered;
  }

  if (d.removeDevices?.length) {
    const filtered = d.removeDevices.filter(id => existingDeviceIds.includes(id));
    if (filtered.length) resolved.removeDevices = filtered;
  }
  if (d.updateDevices?.length) {
    const filtered = d.updateDevices.filter(u => existingDeviceIds.includes(u.id));
    if (filtered.length) resolved.updateDevices = filtered;
  }

  if (d.addCables?.length) {
    const sanitizedCables: CableData[] = d.addCables.map((raw: any, index: number) => {
      const defaults = {
        id: `cable_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'cat6a',
        color: '#3b82f6',
        sourcePortId: null,
        destPortId: null,
        routingMode: 'overhead',
        anchorPoints: [],
      };
      const merged = Object.assign({}, defaults, raw);
      merged.id = raw.id || defaults.id;
      merged.sourcePortId = raw.sourcePortId ?? raw.fromPort ?? defaults.sourcePortId;
      merged.destPortId = raw.destPortId ?? raw.toPort ?? defaults.destPortId;
      merged.type = raw.type || defaults.type;
      merged.color = raw.color || defaults.color;
      merged.routingMode = raw.routingMode || defaults.routingMode;
      merged.anchorPoints = raw.anchorPoints ?? raw.anchors ?? defaults.anchorPoints;
      return merged as CableData;
    });

    const filtered = sanitizedCables.filter(c => !existingCableIds.includes(c.id));
    if (filtered.length) resolved.addCables = filtered;
  }

  if (d.removeCables?.length) {
    const filtered = d.removeCables.filter(id => existingCableIds.includes(id));
    if (filtered.length) resolved.removeCables = filtered;
  }
  if (d.updateCables?.length) {
    const filtered = d.updateCables.filter(u => existingCableIds.includes(u.id));
    if (filtered.length) resolved.updateCables = filtered;
  }
  if (d.updateAnchors?.length) {
    const filtered = d.updateAnchors.filter(u => existingCableIds.includes(u.cableId));
    if (filtered.length) resolved.updateAnchors = filtered;
  }

  if (d.addRacks?.length) {
    const sanitizedRacks: RackData[] = d.addRacks.map((raw: any, index: number) => {
      const defaults = {
        id: `rack_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        name: `Rack ${existingRackIds.length + index + 1}`,
        units: 42,
        x: 100,
        y: 100,
      };
      const merged = Object.assign({}, defaults, raw);
      merged.id = raw.id || defaults.id;
      merged.name = raw.name || defaults.name;
      merged.units = Number(raw.units || defaults.units);
      merged.x = Number(raw.x ?? defaults.x);
      merged.y = Number(raw.y ?? defaults.y);
      return merged as RackData;
    });

    const filtered = sanitizedRacks.filter(r => !existingRackIds.includes(r.id));
    if (filtered.length) resolved.addRacks = filtered;
  }

  if (d.removeRacks?.length) {
    const filtered = d.removeRacks.filter(id => existingRackIds.includes(id));
    if (filtered.length) resolved.removeRacks = filtered;
  }
  if (d.updateRacks?.length) {
    const filtered = d.updateRacks.filter(u => existingRackIds.includes(u.id));
    if (filtered.length) resolved.updateRacks = filtered;
  }

  // If all operations were filtered out, treat as no-op (same as null diff)
  if (Object.keys(resolved).length === 0) return null;

  return resolved;
}

/**
 * Applies a resolved diff to the current state arrays.
 * Returns the updated arrays to pass to stateManager.setState().
 *
 * NOTE: Removing devices does NOT automatically remove cables
 * connected to those devices' ports. Callers should include
 * corresponding removeCables entries in the diff.
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
    // After devices are removed, also remove cables connected to removed device ports
    const removedPortIds = new Set<string>(
      currentDevices
        .filter(d => resolved.removeDevices!.includes(d.id))
        .flatMap(d => d.ports.map(p => p.id))
    );
    cables = cables.filter(c =>
      !(c.sourcePortId && removedPortIds.has(c.sourcePortId)) &&
      !(c.destPortId && removedPortIds.has(c.destPortId))
    );
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
