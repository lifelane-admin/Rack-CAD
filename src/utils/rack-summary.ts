// Pure computation behind both the "Rack Load Summary" and "Cable Types" panels — objects/
// cables/cable-type breakdown, equipment category counts, power draw, and RU capacity, scoped
// to a single rack. Originally lived inline inside dashboard-renderer.ts (an SVG-in-canvas
// widget); extracted so the floating HTML panels (floating-summary-panels.ts) can reuse the
// exact same numbers without duplicating the math.
import { RackData, DeviceData, CableData, CableType, CABLE_COLORS, DeviceCategory, LegendItem } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import { getRackPduCount, getRackPowerCapacityWatts, getDevicePowerWatts, powerSeverity } from './power';

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  server: 'Servers',
  switch: 'Switches',
  router: 'Routers',
  firewall: 'Firewalls',
  storage: 'Storage',
  'patch-panel': 'Patch Panels',
  pdu: 'PDUs',
  ups: 'UPS Units',
  'blank-panel': 'Blank Panels',
  'cable-manager': 'Cable Managers',
  cooling: 'Cooling',
  console: 'Console / KVM',
};

// Devices are grouped in a fixed, sensible order (servers/network gear first) rather than
// object-key iteration order, so the list doesn't jump around as devices are added/removed.
const CATEGORY_ORDER: DeviceCategory[] = [
  'server', 'switch', 'router', 'firewall', 'storage', 'pdu', 'ups', 'console', 'patch-panel', 'cable-manager', 'cooling', 'blank-panel',
];

export const SEVERITY_COLORS: Record<'ok' | 'warning' | 'critical' | 'none', string> = {
  ok: '#43a047', warning: '#fb8c00', critical: '#ef4444', none: '#78909c',
};

/** Resolves a port id to its owning device id from the actual device list passed in — not the
 *  global stateManager singleton — so this stays a pure function of its arguments (testable in
 *  isolation, and correct if ever called with anything other than live app state). */
function resolveDeviceIdForPort(portId: string, devices: DeviceData[]): string | null {
  if (portId.startsWith('outlet-')) {
    const m = /^outlet-(.+)-(\d+)$/.exec(portId);
    return m ? m[1] : null;
  }
  for (const d of devices) {
    if (d.ports.some(p => p.id === portId)) return d.id;
  }
  return null;
}

/** A cable "belongs" to a rack if either end's owning device is physically in that rack. */
export function cablesForRack(rack: RackData, devices: DeviceData[], cables: CableData[]): CableData[] {
  const rackDeviceIds = new Set(devices.filter(d => d.rackId === rack.id).map(d => d.id));
  return cables.filter(c => {
    const srcDeviceId = resolveDeviceIdForPort(c.sourcePortId, devices);
    const destDeviceId = c.destPortId ? resolveDeviceIdForPort(c.destPortId, devices) : null;
    return (srcDeviceId && rackDeviceIds.has(srcDeviceId)) || (destDeviceId && rackDeviceIds.has(destDeviceId));
  });
}

export interface CableTypeRow {
  label: string;
  color: string;
  count: number | null; // null for custom legend entries, which have no inherent count semantic
}

export interface RackSummary {
  rack: RackData;
  deviceCount: number;
  cableCount: number;
  cableTypeRows: CableTypeRow[];
  usingCustomLegend: boolean;
  categoryRows: [string, number][];
  pduCount: number;
  usedRUs: number;
  totalRUs: number;
  capacitySeverityColor: string;
  usedW: number;
  capacityW: number;
  powerSeverityColor: string;
}

export function computeRackSummary(
  rack: RackData, allDevices: DeviceData[], allCables: CableData[], customLegend?: LegendItem[],
): RackSummary {
  const devices = allDevices.filter(d => d.rackId === rack.id);
  const cables = cablesForRack(rack, allDevices, allCables);

  const usingCustomLegend = !!customLegend && customLegend.length > 0;
  const cableCounts = new Map<CableType, number>();
  cables.forEach(c => cableCounts.set(c.type, (cableCounts.get(c.type) ?? 0) + 1));
  const cableTypeRows: CableTypeRow[] = usingCustomLegend
    ? customLegend!.map(item => ({ label: item.label, color: item.color, count: null }))
    : Array.from(cableCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ label: type, color: CABLE_COLORS[type] ?? '#78909c', count }));

  const categoryCounts = new Map<DeviceCategory, number>();
  devices.forEach(d => {
    const cat = getTemplate(d.templateId)?.category;
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  });
  const categoryRows = CATEGORY_ORDER
    .filter(cat => categoryCounts.get(cat))
    .map(cat => [CATEGORY_LABELS[cat], categoryCounts.get(cat)!] as [string, number]);

  const usedRUs = devices.reduce((sum, d) => sum + (getTemplate(d.templateId)?.heightUnits ?? 1), 0);
  const usedW = devices.reduce((sum, d) => sum + getDevicePowerWatts(d), 0);
  const capacityW = getRackPowerCapacityWatts(rack);
  const pduCount = getRackPduCount(rack);

  const capacityRatio = rack.units > 0 ? usedRUs / rack.units : 0;
  const capacitySeverityColor = SEVERITY_COLORS[capacityRatio >= 0.95 ? 'critical' : capacityRatio >= 0.8 ? 'warning' : 'ok'];
  const powerSeverityColor = SEVERITY_COLORS[powerSeverity(usedW, capacityW)];

  return {
    rack,
    deviceCount: devices.length,
    cableCount: cables.length,
    cableTypeRows,
    usingCustomLegend,
    categoryRows,
    pduCount,
    usedRUs,
    totalRUs: rack.units,
    capacitySeverityColor,
    usedW,
    capacityW,
    powerSeverityColor,
  };
}
