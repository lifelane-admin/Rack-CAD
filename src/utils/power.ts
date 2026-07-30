// Shared rack power-capacity math — single source of truth for the PDU-wattage assumption
// previously duplicated (with a fragile description-text regex instead of the real
// `powerWatts` field) across validation.ts, report-builder.ts, and state-serializer.ts.
import { RackData, DeviceData } from '../core/types';
import { getTemplate } from '../library/device-catalog';

/** Nameplate capacity of one rack-mount PDU circuit (matches the existing 7200W assumption
 *  used across validation/report/AI-serializer before this was consolidated). */
export const PDU_WATTS_PER_UNIT = 7200;

export function getRackPduCount(rack: RackData): number {
  return (rack.showPduLeft ? 1 : 0) + (rack.showPduRight ? 1 : 0);
}

export function getRackPowerCapacityWatts(rack: RackData): number {
  return getRackPduCount(rack) * PDU_WATTS_PER_UNIT;
}

/** A device's real nameplate wattage — its own override if set, else the catalog template's,
 *  else 0. This is the structured field the properties panel edits; it replaces the old
 *  regex-scraped-from-description approach used elsewhere in the app. */
export function getDevicePowerWatts(device: DeviceData): number {
  if (typeof device.powerWatts === 'number') return device.powerWatts;
  const template = getTemplate(device.templateId);
  return template?.powerWatts ?? 0;
}

export function getRackPowerUsedWatts(rack: RackData, devices: DeviceData[]): number {
  return devices
    .filter(d => d.rackId === rack.id)
    .reduce((sum, d) => sum + getDevicePowerWatts(d), 0);
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
