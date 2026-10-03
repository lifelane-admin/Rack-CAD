// Shared rack power-capacity math — single source of truth for the PDU-wattage assumption
// previously duplicated (with a fragile description-text regex instead of the real
// `powerWatts` field) across validation.ts, report-builder.ts, and state-serializer.ts.
import { RackData, DeviceData, CableData } from '../core/types';
import { getTemplate } from '../library/device-catalog';

/** Nameplate capacity of one rack-mount PDU circuit — this is the FALLBACK constant
 *  used when no breaker/voltage configuration is available (30A × 240V = 7200W).
 *  Real deployments should use getPduCapacityWattsFromConfig() with actual Stage 6 settings. */
export const PDU_WATTS_PER_UNIT = 7200;

/**
 * Compute per-PDU capacity in Watts from the actual circuit configuration.
 *   capacity = breakerAmps × voltage × (continuousLoadPercent / 100)
 * e.g. 32A × 230V × 0.80 = 5,888W continuous safe load per feed.
 * Default matches the legacy 30A × 240V assumption when called without arguments.
 */
export function getPduCapacityWattsFromConfig(
  breakerAmps = 30,
  voltage = 240,
  continuousLoadPercent = 100,
): number {
  return Math.round(breakerAmps * voltage * (continuousLoadPercent / 100));
}

/** Counts actual PDU devices (horizontal rack-mount or vertical side-mount) placed in the rack —
 *  not the legacy `showPduLeft`/`showPduRight` rail checkboxes, which don't track real placement
 *  and don't move with devices added/removed. */
export function getRackPduCount(rack: RackData, devices: DeviceData[]): number {
  return devices.filter(d => d.rackId === rack.id && getTemplate(d.templateId)?.category === 'pdu').length;
}

/**
 * Total capacity across all PDUs in this rack.
 * Uses the rack's stored powerConfig (breakerAmps, voltage, continuousLoadPercent) if present;
 * falls back to the legacy PDU_WATTS_PER_UNIT constant otherwise.
 */
export function getRackPowerCapacityWatts(rack: RackData, devices: DeviceData[]): number {
  const count = getRackPduCount(rack, devices);
  if (count === 0) return 0;
  const pc = (rack as any).powerConfig as { breakerAmps?: number; voltage?: number; continuousLoadPercent?: number } | undefined;
  if (pc?.breakerAmps && pc?.voltage) {
    return count * getPduCapacityWattsFromConfig(pc.breakerAmps, pc.voltage, pc.continuousLoadPercent ?? 100);
  }
  return count * PDU_WATTS_PER_UNIT;
}

/**
 * Per-PDU capacity (single feed).
 * Uses rack.powerConfig when available; falls back to PDU_WATTS_PER_UNIT / pduCount
 * so callers can compare individual PDU meters against their own circuit limit.
 */
export function getPerPduCapacityWatts(rack: RackData, devices: DeviceData[]): number {
  const count = getRackPduCount(rack, devices);
  if (count === 0) return PDU_WATTS_PER_UNIT;
  const pc = (rack as any).powerConfig as { breakerAmps?: number; voltage?: number; continuousLoadPercent?: number } | undefined;
  if (pc?.breakerAmps && pc?.voltage) {
    return getPduCapacityWattsFromConfig(pc.breakerAmps, pc.voltage, pc.continuousLoadPercent ?? 100);
  }
  return PDU_WATTS_PER_UNIT;
}

/** A device's real nameplate wattage — its own override if set, else the catalog template's,
 *  else 0. This is the structured field the properties panel edits; it replaces the old
 *  regex-scraped-from-description approach used elsewhere in the app. */
export function getDevicePowerWatts(device: DeviceData): number {
  if (typeof device.powerWatts === 'number') return device.powerWatts;
  if (typeof (device.deviceConfig as any)?.powerWatts === 'number') return (device.deviceConfig as any).powerWatts;
  const template = getTemplate(device.templateId);
  return template?.powerWatts ?? 0;
}

/** Real load on one PDU's outlets — walks actual power cables plugged into its
 *  `outlet-<pduDeviceId>-<idx>` virtual ports and sums the nameplate wattage of whatever's on
 *  the other end. This is the same reading shown on the PDU's own live meter (pdu-renderer.ts,
 *  properties.ts); pulled out here as a pure function (cables/devices passed in, not read from
 *  the stateManager singleton) so rack-wide totals can reuse it without the coupling. */
export function getPduConnectedLoadWatts(
  pduDeviceId: string, cables: CableData[], devices: DeviceData[],
): { watts: number; connectedOutlets: Set<number> } {
  const connectedOutlets = new Set<number>();
  let watts = 0;
  const pduDevice = devices.find(d => d.id === pduDeviceId);
  const pduPortIds = new Set(pduDevice ? pduDevice.ports.map(p => p.id) : []);
  const prefix = `outlet-${pduDeviceId}-`;

  for (const cable of cables) {
    const ends = [cable.sourcePortId, cable.destPortId];
    const outletEnd = ends.find(p => p && (p.startsWith(prefix) || pduPortIds.has(p)));
    if (!outletEnd) continue;

    if (outletEnd.startsWith(prefix)) {
      const idx = parseInt(outletEnd.slice(prefix.length), 10);
      if (!Number.isNaN(idx)) connectedOutlets.add(idx);
    } else {
      const portIdx = pduDevice?.ports.findIndex(p => p.id === outletEnd);
      if (portIdx !== undefined && portIdx >= 0) connectedOutlets.add(portIdx);
    }

    const otherEnd = outletEnd === cable.sourcePortId ? cable.destPortId : cable.sourcePortId;
    if (otherEnd && !otherEnd.startsWith('outlet-')) {
      const dev = devices.find(d => d.id !== pduDeviceId && (d.ports.some(p => p.id === otherEnd) || otherEnd.startsWith(d.id + '-')));
      if (dev) watts += getDevicePowerWatts(dev);
    }
  }

  return { watts, connectedOutlets };
}

/** Every power cable that runs from `deviceId`'s own ports to any PDU's outlet — i.e. how many
 *  cords this device is drawing power through right now. A device on its 2nd (or later) cord is
 *  dual/multi-corded for redundancy, not drawing extra power — see `isRedundantPowerCable`. */
export function countDevicePowerCables(deviceId: string, cables: CableData[], devices: DeviceData[]): number {
  const device = devices.find(d => d.id === deviceId);
  if (!device) return 0;
  const portIds = new Set(device.ports.map(p => p.id));
  return cables.filter(c => {
    const ends = [c.sourcePortId, c.destPortId];
    const deviceEnd = ends.find(p => p && portIds.has(p));
    const outletEnd = ends.find(p => p && p.startsWith('outlet-'));
    return !!deviceEnd && !!outletEnd;
  }).length;
}

/** Sum of every PDU's own real connected-outlet reading in the rack — literally what you'd get
 *  by adding up each PDU's individual "live load" (getPduConnectedLoadWatts), horizontal and
 *  vertical alike. A device with redundant power (2 cords into 2 different PDUs) is counted once
 *  per PDU it's plugged into — matching each PDU's own meter, which has no way to know a second
 *  cord exists — rather than deduped down to one physical device's wattage. Use
 *  `getRackRedundantPowerDeviceCount` separately if you need to know how many devices are
 *  dual-corded; it doesn't change this total. */
export function getRackPduLoadWatts(rack: RackData, devices: DeviceData[], cables: CableData[]): number {
  const pduIds = devices.filter(d => d.rackId === rack.id && getTemplate(d.templateId)?.category === 'pdu').map(d => d.id);
  return pduIds.reduce((sum, id) => sum + getPduConnectedLoadWatts(id, cables, devices).watts, 0);
}

/** Devices in the rack fed by 2+ power cords — used for the Rack Summary's redundant-power
 *  count and to decide whether a newly-drawn power cable should auto-tag as `power-redundant`. */
export function getRackRedundantPowerDeviceCount(rack: RackData, devices: DeviceData[], cables: CableData[]): number {
  return devices.filter(d => d.rackId === rack.id && countDevicePowerCables(d.id, cables, devices) >= 2).length;
}

/** Standard power-draw severity thresholds, shared so the dashboard gauge and the
 *  validation-alert thresholds (validation.ts) always agree on what counts as "critical". */
export function powerSeverity(usedW: number, capacityW: number): 'ok' | 'warning' | 'critical' | 'none' {
  if (capacityW <= 0) return 'none';
  const ratio = usedW / capacityW;
  if (ratio >= 0.95) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}
