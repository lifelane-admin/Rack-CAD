// Pure computation behind both the "Rack Load Summary" and "Cable Types" cards — objects/
// cables/cable-type breakdown, equipment category counts, power draw, and RU capacity, scoped
// to a single rack. Used by renderers/export-summary-overlay.ts, which draws both the live
// on-canvas cards and the export version from this same data.
import { RackData, DeviceData, CableData, CableType, CABLE_COLORS, DeviceCategory, LegendItem } from '../core/types';
import { getTemplate, getEffectiveCategory } from '../library/device-catalog';
import { getRackPduCount, getRackPowerCapacityWatts, getRackPduLoadWatts, getRackRedundantPowerDeviceCount, powerSeverity } from './power';

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  server: 'Servers',
  switch: 'Switches',
  router: 'Routers',
  firewall: 'Firewalls',
  nac: 'NAC Appliances',
  storage: 'Storage',
  'patch-panel': 'Patch Panels',
  pdu: 'PDUs',
  ats: 'ATS Switches',
  ups: 'UPS Units',
  'blank-panel': 'Blank Panels',
  'cable-manager': 'Cable Managers',
  cooling: 'Cooling',
  console: 'Console / KVM',
  'load-balancer': 'Load Balancers',
  'vpn-concentrator': 'VPN Concentrators',
  'ids-ips': 'IDS/IPS Appliances',
  'proxy-waf': 'Proxy/WAF Appliances',
};

// Devices are grouped in a fixed, sensible order (servers/network gear first) rather than
// object-key iteration order, so the list doesn't jump around as devices are added/removed.
const CATEGORY_ORDER: DeviceCategory[] = [
  'server', 'switch', 'router', 'firewall', 'load-balancer', 'ids-ips', 'proxy-waf', 'vpn-concentrator',
  'nac', 'storage', 'pdu', 'ats', 'ups', 'console', 'patch-panel', 'cable-manager', 'cooling', 'blank-panel',
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
    const srcDeviceId = c.sourcePortId ? resolveDeviceIdForPort(c.sourcePortId, devices) : null;
    const destDeviceId = c.destPortId ? resolveDeviceIdForPort(c.destPortId, devices) : null;
    return (srcDeviceId && rackDeviceIds.has(srcDeviceId)) || (destDeviceId && rackDeviceIds.has(destDeviceId));
  });
}

export interface CableTypeRow {
  label: string;
  color: string;
  count: number | null; // null for custom legend entries, which have no inherent count semantic
  /** The real CableType this row groups by — null for custom legend entries (free-form user
   *  labels with no inherent cable-type semantic), which the legend then draws with a plain
   *  swatch instead of a connector icon since there's no type to pick one from. */
  type: CableType | null;
}

export interface RackSummary {
  rack: RackData;
  deviceCount: number;
  cableCount: number;
  cableTypeRows: CableTypeRow[];
  usingCustomLegend: boolean;
  categoryRows: [string, number][];
  pduCount: number;
  redundantPowerDeviceCount: number;
  usedRUs: number;
  totalRUs: number;
  capacitySeverityColor: string;
  usedW: number;
  capacityW: number;
  powerSeverityColor: string;
}

export function getCableTypeDisplayName(type: string, isPower: boolean = false, color?: string): string {
  const map: Record<string, string> = {
    'cat6': 'Cat6 RJ45',
    'cat6a': 'Cat6A RJ45',
    'cat8': 'Cat8 40G',
    'om4': 'OM4 Fiber LC',
    'om5': 'OM5 Fiber LC',
    'dac-twinax': 'DAC Twinax SFP28',
    'qsfp28': 'QSFP28 100G',
    'power': 'Power C13/C14',
    'c13-power': 'Power C13/C14',
    'power-c13': 'Power C13/C14',
    'c19-power': 'High Power C19/C20',
    'power-c19': 'High Power C19/C20',
    'power-redundant': 'Redundant Power',
    'idrac': 'iDRAC / IPMI Mgmt',
    'vm-network': 'VM Network 10G',
    'ceph-primary': 'Storage Prim 25G',
    'ceph-secondary': 'Storage Sec 25G',
    'live-migration': 'Live Migration 10G',
    'backup': 'Backup Network',
    'general': 'General Data RJ45',
    'general-a': 'Fabric A Data',
    'general-b': 'Fabric B Data',
    'console': 'Console / Serial',
    'custom': 'Custom Cable',
  };
  const baseName = map[type] || (isPower ? 'Power Cable' : `${type.toUpperCase()}`);

  if (color) {
    const c = color.toLowerCase();
    if (isPower || type.includes('power')) {
      if (c === '#2563eb' || c === '#0284c7' || c === '#1e88e5' || c === '#3b82f6') return `${baseName} (Feed A)`;
      if (c === '#dc2626' || c === '#e53935' || c === '#ef4444') return `${baseName} (Feed B)`;
    }
    if (type === 'dac-twinax' || type === 'qsfp28') {
      if (c === '#0284c7') return '25G Data Fabric A (LACP)';
      if (c === '#10b981') return '25G Data Fabric B (LACP)';
      if (c === '#8b5cf6') return '100G MLAG ISL Trunk';
      if (c === '#06b6d4' || c === '#00acc1') return '100G NVMe-oF Storage';
    }
  }

  return baseName;
}

export function computeRackSummary(
  rack: RackData, allDevices: DeviceData[], allCables: CableData[], customLegend?: LegendItem[],
): RackSummary {
  const devices = allDevices.filter(d => d.rackId === rack.id);
  const cables = cablesForRack(rack, allDevices, allCables);

  const usingCustomLegend = !!customLegend && customLegend.length > 0;
  // Group by (type, actual color) rather than just type — a cable's color may have been
  // manually overridden (Cable Color picker) away from the type's default CABLE_COLORS swatch,
  // and the legend must show what's actually drawn, not the type's nominal default.
  const cableGroups = new Map<string, { type: CableType; color: string; count: number; isPower: boolean }>();
  cables.forEach(c => {
    const isPower = !!(c.powerCableType === 'power' || c.type?.includes('power') || c.sourcePortId?.startsWith('outlet-') || c.destPortId?.startsWith('outlet-'));
    const color = c.color || (CABLE_COLORS as any)[c.type] || (isPower ? '#212529' : '#78909c');
    const key = `${c.type} ${color}`;
    const existing = cableGroups.get(key);
    if (existing) existing.count++;
    else cableGroups.set(key, { type: c.type, color, count: 1, isPower });
  });
  const cableTypeRows: CableTypeRow[] = usingCustomLegend
    ? customLegend!.map(item => ({ label: item.label, color: item.color, count: null, type: null }))
    : Array.from(cableGroups.values())
        .sort((a, b) => b.count - a.count)
        .map(({ type, color, count, isPower }) => ({ label: getCableTypeDisplayName(type, isPower, color), color, count, type }));

  const categoryCounts = new Map<DeviceCategory, number>();
  devices.forEach(d => {
    const cat = getEffectiveCategory(d, getTemplate(d.templateId));
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  });
  const categoryRows = CATEGORY_ORDER
    .filter(cat => categoryCounts.get(cat))
    .map(cat => [CATEGORY_LABELS[cat], categoryCounts.get(cat)!] as [string, number]);

  const usedRUs = devices.reduce((sum, d) => sum + (getTemplate(d.templateId)?.heightUnits ?? 1), 0);
  // Real total draw: sum of every PDU's own connected-outlet reading (getRackPduLoadWatts walks
  // actual power cables into each PDU's outlets), not a blanket nameplate sum over every device
  // in the rack — matches what each PDU's own live meter reports.
  const usedW = getRackPduLoadWatts(rack, allDevices, cables);
  const capacityW = getRackPowerCapacityWatts(rack, devices);
  const pduCount = getRackPduCount(rack, devices);
  const redundantPowerDeviceCount = getRackRedundantPowerDeviceCount(rack, allDevices, cables);

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
    redundantPowerDeviceCount,
    usedRUs,
    totalRUs: rack.units,
    capacitySeverityColor,
    usedW,
    capacityW,
    powerSeverityColor,
  };
}
