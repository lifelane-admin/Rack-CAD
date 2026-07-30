// src/renderers/pdu-layout.ts
//
// Pure PDU outlet-position math, with ZERO dependency on `core/state.ts` or the DOM.
// This exists specifically so `core/state.ts`'s `getPortWorldPosition()` can resolve the
// synthetic `outlet-<deviceId>-<idx>` virtual ports used for power-cable connections without
// creating a circular import (pdu-renderer.ts imports `stateManager` from state.ts, so state.ts
// cannot import pdu-renderer.ts back). `pdu-renderer.ts` imports these same functions so the
// renderer and the cable-position resolver can never drift out of sync with each other.
import type { DeviceTemplate, PduConfig, PduOutletGroup, SocketType, OutletConfig, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';

export interface Point { x: number; y: number; }

export const DISPLAY_FEATURES = ['powerMeter', 'lcd', 'oled'];
export const NETWORK_FEATURES = ['snmp', 'redfish', 'modbus', 'restApi', 'bacnet', 'touch'];

export function normalizeComposition(config: PduConfig, fallback: OutletConfig[] | undefined): PduOutletGroup[] {
  const raw = (config.composition as PduOutletGroup[] | undefined)
    ?? (config as unknown as { rows?: Array<{ type?: string; socketType?: string; count: number }> }).rows;
  if (Array.isArray(raw) && raw.length) {
    return raw.map(r => ({ type: ((r as any).type ?? (r as any).socketType ?? 'C13') as SocketType, count: r.count }));
  }
  if (fallback?.length) return fallback.map(r => ({ type: r.socketType, count: r.count }));
  return [{ type: 'C13', count: 8 }];
}

export function socketWidth(type: string): number {
  if (type === 'C19' || type === 'iec-c19') return 22;
  if (type === 'NEMA-5-15') return 20;
  return 17;
}

export function socketHeight(type: string): number {
  if (type === 'C19' || type === 'iec-c19') return 18;
  if (type === 'NEMA-5-15') return 20;
  return 15;
}

/**
 * Fixed left-rail width for a horizontal PDU — brand/model, status LEDs, breaker, and the live
 * meter all live in this ~20% column; the remaining ~80% is reserved purely for outlet sockets
 * (see drawPduLeftRail() in pdu-renderer.ts). This used to grow with the product name's length
 * (a long model name alone could eat 40-50% of the chassis width) — now it's fixed regardless
 * of text length or how many smart features are configured; content that doesn't fit is shrunk/
 * truncated/dropped, it never pushes into the outlet area.
 */
export function pduLeftRailWidth(w: number): number {
  return Math.max(46, Math.min(w * 0.2, 92));
}

export function meterTierFor(config: PduConfig, template: DeviceTemplate | null): 'basic' | 'metered' | 'smart' {
  const feats = config.smartFeatures;
  if (Array.isArray(feats)) {
    if (feats.some(f => NETWORK_FEATURES.includes(f))) return 'smart';
    if (feats.some(f => DISPLAY_FEATURES.includes(f))) return 'metered';
    return 'basic';
  }
  const text = `${template?.name ?? ''} ${template?.model ?? ''}`.toLowerCase();
  if (text.includes('smart')) return 'smart';
  if (text.includes('metered')) return 'metered';
  return 'basic';
}

export interface ConfiguredPduLayout {
  positions: Point[];       // one per outlet, in composition/allSockets order
  allSockets: SocketType[]; // socket type per position, same order
  leftW: number;            // fixed left-rail width — brand/meter/breaker live here, outlets start after it
  showMeter: boolean;
  mcbShown: boolean;
  layoutRows: number;
  cy: number;
}

/**
 * Full layout for a HORIZONTAL, composition-configured PDU (the `renderConfiguredPdu` path in
 * pdu-renderer.ts — used once a device has `deviceConfig`). This is the single source of truth
 * for the fixed left-rail width and outlet row auto-growth — `renderConfiguredPdu` draws from
 * this object's fields directly rather than recomputing them, and `core/state.ts`'s
 * `getPortWorldPosition()` uses the same `positions` to resolve the synthetic
 * `outlet-<deviceId>-<idx>` ports cables connect to, so the two can never drift apart.
 *
 * Outlets always use the full ~80% of chassis width outside the left rail — no meter or breaker
 * ever carves outlet-area width away, per the reference PDU photo (branding/meter/breaker
 * confined to the left rail; everything else is ports).
 */
export function computeConfiguredPduLayout(template: DeviceTemplate | null, config: PduConfig, W: number, H: number): ConfiguredPduLayout {
  const composition = normalizeComposition(config, template?.outletConfig);

  const cy = H / 2;
  const leftW = pduLeftRailWidth(W);
  const railGap = 8;
  const startX = leftW + railGap;

  const totalSocketW = composition.reduce((sum, r) => sum + socketWidth(r.type) * r.count, 0);
  const allSockets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));

  const ROW_PITCH = 16;
  const maxRowsForHeight = Math.max(1, Math.floor((H - 8) / ROW_PITCH));
  const userRows = ({ single: 1, dual: 2, triple: 3 } as Record<string, number>)[config.sockets?.layout ?? 'single'] ?? 1;
  const availW = W - startX - 6;
  const perRowWidth = (rows: number) => totalSocketW / rows + Math.max(Math.ceil(allSockets.length / rows) - 1, 0) * 2;

  let layoutRows = Math.max(1, Math.min(userRows, maxRowsForHeight));
  while (layoutRows < maxRowsForHeight && perRowWidth(layoutRows) > availW) layoutRows++;

  const rowsPerLayout = Math.max(1, Math.ceil(allSockets.length / layoutRows));
  const socketWPerRow = totalSocketW / layoutRows;
  const spacing = Math.max(0, rowsPerLayout > 1
    ? Math.min(6, (availW - socketWPerRow) / (rowsPerLayout - 1))
    : 0);
  const rowH = (H - 8) / layoutRows;

  const positions: Point[] = [];
  let cx = startX + socketWidth(allSockets[0] ?? 'C13') / 2;
  let lastRow = 0;
  allSockets.forEach((sockType, i) => {
    const row = Math.floor(i / rowsPerLayout);
    if (row !== lastRow) { cx = startX + socketWidth(sockType) / 2; lastRow = row; }
    const rowCy = layoutRows > 1 ? (4 + rowH * row + rowH / 2) : cy;
    positions.push({ x: cx, y: rowCy });
    cx += socketWidth(sockType) + spacing;
  });

  const smartFeatures = config.smartFeatures ?? [];
  const showMeter = smartFeatures.some(f => DISPLAY_FEATURES.includes(f));
  const mcbShown = !!config.breaker && config.breaker !== 'none';

  return { positions, allSockets, leftW, showMeter, mcbShown, layoutRows, cy };
}

export interface GenericPduLayout {
  positions: Point[];
  leftW: number;
  showMeter: boolean;
  mcbShown: boolean;
  cy: number;
  chH: number;
}

/**
 * Full layout for a HORIZONTAL PDU with no `deviceConfig` composition (the `renderGenericPdu`
 * fallback path — positions driven by fixed `template.ports` entries rather than a configurable
 * composition). Same single-source-of-truth role as `computeConfiguredPduLayout` above — fixed
 * left rail, outlets get the rest.
 */
export function computeGenericPduLayout(template: DeviceTemplate | null, config: PduConfig, W: number, H: number): GenericPduLayout {
  const chY = 2, chH = H - 4, cy = chY + chH / 2;
  const leftW = pduLeftRailWidth(W);
  const startX = leftW + 8;
  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20, outletY = chY + 5, outletH = chH - 10;

  const smartFeatures = config.smartFeatures ?? [];
  const showMeter = smartFeatures.some(f => DISPLAY_FEATURES.includes(f));
  const mcbShown = !!config.breaker && config.breaker !== 'none';

  const positions = c13Ports.map((_, i) => ({ x: startX + i * (outletW + 4) + outletW / 2, y: outletY + outletH / 2 }));
  return { positions, leftW, showMeter, mcbShown, cy, chH };
}

/** Header height (LCD/MCB/LEDs/sensors/wireless/network-ports) above the outlet column on a
 *  vertical (0U side-mount) PDU strip — mirrors renderSidePdu()'s header-growth logic exactly. */
export function computeSidePduHeaderBottom(config: PduConfig): number {
  const smartFeatures = config.smartFeatures ?? [];
  const hasDisplay = smartFeatures.some(f => DISPLAY_FEATURES.includes(f));
  let headerBottom = 10;
  if (hasDisplay) headerBottom = 32 + 12; // 3-line LED readout box (lcdH) + gap, see renderSidePdu()
  if (config.breaker && config.breaker !== 'none') headerBottom += 22;
  const leds = (config.leds ?? ['power']).filter(l => l !== 'outlet');
  if (leds.length) headerBottom += 10;
  const envSensors = config.envSensors ?? [];
  if (envSensors.length) headerBottom += envSensors.length * 9 + 2;
  const wireless = config.wireless ?? [];
  if (wireless.length) headerBottom += wireless.length * 14 + 4;
  const netPorts = config.networkPorts ?? [];
  if (netPorts.length) headerBottom += netPorts.length * 13 + 2;
  return headerBottom;
}

/** Device-local (x,y) center point of every outlet on a vertical (0U side-mount) PDU strip. */
export function computeSidePduOutletPositions(template: DeviceTemplate, config: PduConfig, pduWidth: number, stripH: number): Point[] {
  const composition = normalizeComposition(config, template.outletConfig);
  const allOutlets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));
  const outletAreaTop = computeSidePduHeaderBottom(config) + 6;
  const footerH = 8;
  const outletAreaH = stripH - outletAreaTop - footerH;
  const outletSpacing = outletAreaH / Math.max(allOutlets.length, 1);
  const outletCx = pduWidth / 2;
  return allOutlets.map((_, i) => ({ x: outletCx, y: outletAreaTop + i * outletSpacing + outletSpacing / 2 }));
}

/** The actual configured socket type (C13, C19, IS6538-15A, etc.) at a given outlet index —
 *  same composition/outletConfig resolution for both horizontal and vertical PDUs, so a power
 *  cable's plug can be auto-matched to what the outlet actually is instead of asking the user
 *  to guess it from a generic list. */
export function socketTypeAtOutletIndex(template: DeviceTemplate | null, config: PduConfig, idx: number): SocketType | null {
  const composition = normalizeComposition(config, template?.outletConfig);
  const allOutlets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));
  return allOutlets[idx] ?? null;
}

/** Total horizontal space a vertical cable manager duct occupies (its width + the 6px gap
 *  from the rack edge), or 0 when none is configured for that side. */
export function cableManagerSpan(width: RackData['leftCableManagerWidth']): number {
  if (!width || width === 'none') return 0;
  return (width === '6-inch' ? 40 : 26) + 6;
}

/**
 * X-offset (in rack-local coordinates, i.e. relative to the rack's own translate(rack.x, rack.y))
 * of a side-mount PDU's own left edge, given the rack it's mounted on. PDUs are placed OUTSIDE
 * any vertical cable manager on that side — layout order (innermost to outermost) is always
 * Rack → Cable Manager → PDU. Shared by rack-renderer.ts (drawing) and core/state.ts's
 * getPortWorldPosition() (cable endpoint resolution) so the two can never drift apart.
 */
export function sidePduOffsetX(rack: RackData, side: 'left' | 'right', pduWidth: number): number {
  if (side === 'left') return -(cableManagerSpan(rack.leftCableManagerWidth) + pduWidth);
  return RACK_CONSTANTS.RACK_OUTER_WIDTH + cableManagerSpan(rack.rightCableManagerWidth);
}
