// src/renderers/firewall-renderer.ts
//
// Two rendering paths share this file:
//  - The original FortiGate-400F-specific `renderFortiGatePanel`/`fortigatePorts`, kept verbatim
//    so any device with no `deviceConfig` (i.e. every firewall placed before this feature
//    existed) renders byte-identical to before.
//  - A generalized, `FirewallConfig`-driven renderer (`renderConfiguredFirewallPanel`/
//    `firewallPorts`) used once a device has been configured. This is a direct port of
//    switch-renderer.ts's engine (identical RJ_W×RJ_H gold-pin jack symbols, identical gradient
//    chassis, identical single-source-of-truth layout math) — NOT the old PORT_W=26×PORT_H=20
//    flat-color cursor-based zone system this replaced, which visibly changed the jack aspect
//    ratio/colors relative to the Switch configurator and re-flowed unpredictably on every count
//    change. Firewall-specific additions (HA port, QR code sticker) are layered on top of that
//    shared, already-hardened engine rather than invented separately.
// `renderFirewallPanel` is the public dispatcher: no config → legacy path (FortiGate 400F or the
// generic networking-renderer fallback for every other pre-existing firewall SKU); config → the
// switch-style dynamic renderer.
import { el, g } from './rack-kit';
import { renderNetworkingPanel } from './networking-renderer';
import { firewallVendorSkin } from './vendor-palette';
import type { DeviceTemplate, PortData, PortType, DeviceData, FirewallConfig } from '../core/types';

const PORT_W = 26, PORT_H = 20, COL_GAP = 5, ZONE_GAP = 26;
const EAR = 30, padL = 8, padR = 20, padY = 16, ROW_LABEL_H = 16, PAIR_GAP = 6;
const brandW = 190;

const C = {
  chassis0: '#ffffff', chassis1: '#f6f7f9', chassisEdge: '#d4d7dc',
  ear: '#f2f4f6', ear1: '#e2e5e9', earEdge: '#cfd3d9',
  portUpFill: '#e9f7ee', portUpEdge: '#2e9e5b',
  portDownFill: '#eef0f3', portDownEdge: '#b6bcc4',
  sfpFill: '#e7eaee', sfpEdge: '#aab1ba',
  text: '#3a3f46', textMute: '#8a9099', label: '#5a616a',
};

interface Zone {
  label: string | string[];
  kind: 'rj45' | 'sfp';
  count: number;
  start?: number;
  prefix?: string;
}

const DEFAULT_ZONES: Zone[] = [
  { label: ['HA', 'MGMT'], kind: 'rj45', count: 2 },
  { label: '1-16',  kind: 'rj45', count: 16, start: 1 },
  { label: 'X1-X8', kind: 'sfp',  count: 8, prefix: 'X', start: 1 },
  { label: '17-24', kind: 'rj45', count: 8, start: 17 },
];

function drawFortiGateDefs(ns: SVGSVGElement, uid: string): void {
  const defs = el('defs');

  function lg(id: string, stops: [string, string][], horiz = false) {
    const gr = el('linearGradient', { id, x1: 0, y1: 0, x2: horiz ? 1 : 0, y2: horiz ? 0 : 1, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => { const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s); });
    defs.appendChild(gr);
  }

  lg(`${uid}wch`, [['0','#ffffff'],['0.5','#f6f7f9'],['1','#eceef1']]);
  lg(`${uid}wear`, [['0','#f2f4f6'],['1','#e2e5e9']]);
  lg(`${uid}rjm`, [['0','#fbfaf5'],['0.5','#efe9da'],['1','#d8d1bf']]);
  lg(`${uid}wgo`, [['0','#f6d98a'],['0.5','#d4ad5a'],['1','#a07f2e']]);

  const fWS = el('filter', { id: `${uid}wsh`, x: '-10%', y: '-20%', width: '120%', height: '150%' });
  const fDS  = el('feDropShadow', { dx: '0', dy: '1.2', stdDeviation: '1.4' });
  fDS.setAttribute('flood-color', '#9aa0a8'); fDS.setAttribute('flood-opacity', '0.4');
  fWS.appendChild(fDS); defs.appendChild(fWS);

  const fJS = el('filter', { id: `${uid}wjs`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const feO  = el('feOffset',      { dx: '0', dy: '0.6' });
  const feB  = el('feGaussianBlur',{ stdDeviation: '0.7', result: 'o' });
  const feC1 = el('feComposite',   { in: 'SourceGraphic', in2: 'o', operator: 'out', result: 'inv' });
  const feCM = el('feColorMatrix', { in: 'inv', type: 'matrix', values: '0 0 0 0 0.4  0 0 0 0 0.38  0 0 0 0 0.33  0 0 0 0.5 0', result: 'sh' });
  const feC2 = el('feComposite',   { in: 'sh', in2: 'SourceGraphic', operator: 'in' });
  [feO, feB, feC1, feCM, feC2].forEach(f => fJS.appendChild(f));
  defs.appendChild(fJS);

  ns.appendChild(defs);
}

function drawRj45Port(parent: SVGElement, uid: string, px: number, py: number, up: boolean): void {
  const fill = up ? C.portUpFill : C.portDownFill;
  const edge = up ? C.portUpEdge : C.portDownEdge;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${px} ${py})`);
  grp.appendChild(el('rect', { x: 0, y: 0, width: PORT_W, height: PORT_H, rx: 2.5, fill, stroke: edge, 'stroke-width': 1.1 }));
  grp.appendChild(el('rect', { x: 1.4, y: 1.4, width: PORT_W-2.8, height: PORT_H-2.8, rx: 1.8, fill: 'none', stroke: edge, 'stroke-width': 0.6, opacity: 0.5 }));
  const mg = el('g');
  mg.setAttribute('transform', `translate(${PORT_W/2} ${PORT_H/2+1.5})`);
  const path = el('path');
  path.setAttribute('d', 'M-8 -7 h16 v9 a1.6 1.6 0 0 1 -1.6 1.6 h-3.2 v-2.6 a1.4 1.4 0 0 0 -1.4 -1.4 h-3.6 a1.4 1.4 0 0 0 -1.4 1.4 v2.6 h-3.2 a1.6 1.6 0 0 1 -1.6 -1.6 z');
  path.setAttribute('fill', `url(#${uid}rjm)`); path.setAttribute('stroke', edge); path.setAttribute('stroke-width', '0.7');
  path.setAttribute('filter', `url(#${uid}wjs)`);
  mg.appendChild(path);
  mg.appendChild(el('rect', { x: -6.4, y: -5.6, width: 12.8, height: 5.4, rx: 0.8, fill: '#f5efe0', opacity: 0.7 }));
  for (let i = 0; i < 8; i++) {
    mg.appendChild(el('rect', { x: -5.9 + i * 1.5, y: -5.6, width: 0.9, height: 4, fill: `url(#${uid}wgo)`, rx: 0.25 }));
  }
  grp.appendChild(mg);
  grp.appendChild(el('circle', { cx: PORT_W-4, cy: PORT_H-4, r: 1.4, fill: up ? '#2e9e5b' : '#cfd3d9' }));
  parent.appendChild(grp);
}

function drawSfpPort(parent: SVGElement, px: number, py: number, up: boolean): void {
  const fill = up ? C.portUpFill : C.sfpFill;
  const edge = up ? C.portUpEdge : C.sfpEdge;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${px} ${py})`);
  grp.appendChild(el('rect', { x: 0, y: 0, width: PORT_W, height: PORT_H, rx: 2.5, fill, stroke: edge, 'stroke-width': 1.1 }));
  grp.appendChild(el('rect', { x: 3.5, y: 4, width: PORT_W-7, height: PORT_H-8, rx: 1.2, fill: '#dfe3e8', stroke: edge, 'stroke-width': 0.8, opacity: up ? 0.9 : 1 }));
  grp.appendChild(el('rect', { x: 6, y: 6.5, width: PORT_W-12, height: PORT_H-13, rx: 0.8, fill: '#c7cdd4' }));
  grp.appendChild(el('circle', { cx: PORT_W-4, cy: PORT_H-4, r: 1.4, fill: up ? '#2e9e5b' : '#cfd3d9' }));
  parent.appendChild(grp);
}

export function renderFortiGatePanel(
  template: DeviceTemplate | null,
  W: number,
  H: number,
  ports: PortData[] = [],
  connectedIds: Set<string> = new Set(),
): SVGGElement {
  const group = g('fortigate-panel');
  const model = template?.model ?? 'FortiGate 400F';
  const uid = `fg${Math.random().toString(36).slice(2, 7)}_`;

  let cursor = brandW + 24;
  const zones = DEFAULT_ZONES;
  const placed: { zi: number; i: number; x: number; row: number; zone: Zone }[] = [];

  zones.forEach((z, zi) => {
    const cols = Math.ceil(z.count / 2);
    const startX = cursor;
    for (let i = 0; i < z.count; i++) {
      const col = Math.floor(i / 2), row = i % 2;
      placed.push({ zi, i, x: startX + col * (PORT_W + COL_GAP), row, zone: z });
    }
    cursor = startX + cols * PORT_W + (cols - 1) * COL_GAP + ZONE_GAP;
  });

  const portsW = cursor - ZONE_GAP;
  const totalW = portsW + padR + 20;
  const rowsH  = PORT_H * 2 + PAIR_GAP;
  const totalH = padY * 2 + ROW_LABEL_H + rowsH + ROW_LABEL_H + 8;
  const topRowY = padY + ROW_LABEL_H;
  const botRowY = topRowY + PORT_H + PAIR_GAP;
  const fullW   = totalW + EAR * 2;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${fullW} ${totalH}`);
  ns.setAttribute('preserveAspectRatio', 'none');

  drawFortiGateDefs(ns, uid);

  [0, 1].forEach(s => {
    const x = s === 0 ? 0 : fullW - EAR;
    const hx = s === 0 ? EAR / 2 : x + EAR / 2;
    const earG = el('g');
    earG.setAttribute('filter', `url(#${uid}wsh)`);
    earG.appendChild(el('rect', { x, y: 2, width: EAR, height: totalH - 4, rx: 3, fill: `url(#${uid}wear)`, stroke: C.earEdge, 'stroke-width': 1 }));
    [0.28, 0.72].forEach(f => {
      earG.appendChild(el('ellipse', { cx: hx, cy: totalH * f, rx: 4.5, ry: 6, fill: '#fff', stroke: C.earEdge, 'stroke-width': 1 }));
      earG.appendChild(el('ellipse', { cx: hx, cy: totalH * f, rx: 2, ry: 3.2, fill: '#d7dbe0' }));
    });
    ns.appendChild(earG);
  });

  const chG = el('g');
  chG.setAttribute('transform', `translate(${EAR} 0)`);
  chG.setAttribute('filter', `url(#${uid}wsh)`);
  chG.appendChild(el('rect', { x: 0, y: 2, width: totalW, height: totalH - 4, rx: 6, fill: `url(#${uid}wch)`, stroke: C.chassisEdge, 'stroke-width': 1.2 }));

  const brandG = el('g');
  brandG.setAttribute('transform', `translate(${padL} ${totalH / 2})`);
  const iconG = el('g');
  iconG.setAttribute('transform', 'translate(0 -9)');
  iconG.appendChild(el('rect', { x: 0, y: 0, width: 18, height: 18, rx: 3, fill: '#2a2f36' }));
  const brandPath = el('path');
  brandPath.setAttribute('d', 'M4 13 L8 5 L10 5 L14 13 L11.6 13 L10.8 11 L7.2 11 L6.4 13 Z');
  brandPath.setAttribute('fill', '#fff');
  iconG.appendChild(brandPath);
  brandG.appendChild(iconG);
  const modelTxt = el('text', { x: 26, y: 2, 'font-size': 12, 'font-weight': 700, fill: C.text, 'letter-spacing': 0.2 });
  modelTxt.textContent = model; brandG.appendChild(modelTxt);
  const subTxt = el('text', { x: 26, y: 16, 'font-size': 8.5, 'font-weight': 600, fill: C.textMute, 'letter-spacing': 0.3 });
  subTxt.textContent = 'ENTERPRISE FIREWALL'; brandG.appendChild(subTxt);
  chG.appendChild(brandG);

  placed.forEach((p, portIdx) => {
    const z = p.zone;
    const py = p.row === 0 ? topRowY : botRowY;
    const px = p.x - EAR;
    const port = ports[portIdx];
    const up = port ? connectedIds.has(port.id) : false;

    if (z.kind === 'sfp') {
      drawSfpPort(chG, px, py, up);
    } else {
      drawRj45Port(chG, uid, px, py, up);
    }

    if (p.i % 2 === 0) {
      const rowLabel = Array.isArray(z.label) ? (z.label as string[])[0] : (() => {
        const start = z.start ?? 1, prefix = z.prefix ?? '';
        return `${prefix}${start + Math.floor(p.i / 2)}`;
      })();
      const lt = el('text', { x: px + PORT_W/2, y: topRowY - 5, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 600, fill: C.label });
      lt.textContent = rowLabel; chG.appendChild(lt);
    }
    if (p.i % 2 === 1) {
      const rowLabel = Array.isArray(z.label) ? (z.label as string[])[1] : (() => {
        const start = z.start ?? 1, prefix = z.prefix ?? '';
        return `${prefix}${start + Math.floor(p.i / 2)}`;
      })();
      const lb = el('text', { x: px + PORT_W/2, y: botRowY + PORT_H + 11, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 600, fill: C.label });
      lb.textContent = rowLabel; chG.appendChild(lb);
    }
  });

  ns.appendChild(chG);
  group.appendChild(ns);
  return group;
}

export function fortigatePorts(): DeviceTemplate['ports'] {
  let cursor = brandW + 24;
  const placed: { x: number; row: number; zone: Zone; i: number }[] = [];

  DEFAULT_ZONES.forEach(z => {
    const cols = Math.ceil(z.count / 2);
    const zW = cols * PORT_W + (cols - 1) * COL_GAP;
    const startX = cursor;
    for (let i = 0; i < z.count; i++) {
      placed.push({ x: startX + Math.floor(i / 2) * (PORT_W + COL_GAP), row: i % 2, zone: z, i });
    }
    cursor += zW + ZONE_GAP;
  });

  const portsW = cursor - ZONE_GAP;
  const totalW = portsW + padR + 20;
  const fullW  = totalW + EAR * 2;
  const totalH = padY * 2 + ROW_LABEL_H + PORT_H * 2 + PAIR_GAP + ROW_LABEL_H + 8;
  const topRowY = padY + ROW_LABEL_H;
  const botRowY = topRowY + PORT_H + PAIR_GAP;
  const sx = 350 / fullW;
  const sy = 30 / totalH;

  type E = Omit<import('../core/types').PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: E[] = [];
  let portIdx = 0;

  DEFAULT_ZONES.forEach(z => {
    for (let i = 0; i < z.count; i++) {
      const p = placed[portIdx++];
      const py = p.row === 0 ? topRowY : botRowY;
      const portType = z.kind === 'sfp' ? 'sfp-plus' as const : 'rj45' as const;
      let name: string;
      if (Array.isArray(z.label)) {
        name = (z.label as string[])[p.row];
      } else {
        const start = z.start ?? 1, prefix = z.prefix ?? '';
        name = `${prefix}${start + Math.floor(i / 2)}`;
      }
      out.push({
        id: `fg400f-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        type: portType,
        speed: z.kind === 'sfp' ? '10 Gbps' : '1 Gbps',
        relativeX: Math.round((p.x + PORT_W / 2) * sx),
        relativeY: Math.round((py + PORT_H / 2) * sy),
        portW: Math.round(PORT_W * sx),
        portH: Math.round(PORT_H * sy),
      });
    }
  });

  return out;
}

// ─── Configurable path (direct port of switch-renderer.ts's engine) ────────────────────────
// Same RJ_W×RJ_H gold-pin jack, same gradient chassis, same single-source-of-truth layout
// function, same "prefer live device.ports over the frozen catalog template, excluding ear-hole
// ports" fix — see switch-renderer.ts's computeSwitchLayout/switchPorts/renderSwitchPanel for the
// (extensively bug-fixed) original. Firewall-specific additions: an HA port alongside MGMT in
// the trailing cluster, and a QR code sticker.

const FW_U1 = 132;
const FW_RW = 1240;
const FW_MIN_BLADE_W = 34;
const FW_EAR_W = 26;
const FW_PANEL_PAD = 22;
const FW_RJ_W = 30;
const FW_RJ_H = 40;
const FW_RJ_COL_GAP = 4;
const FW_RJ_ROW_GAP = 7;
const FW_BLOCK_GAP = 15;
const FW_SFP_W = 46;
const FW_SFP_H = 42.5;
const FW_SFP_GAP_X = 9;
const FW_SECTION_GAP = 26;
// 6 columns × 2 rows (odd-top/even-bottom, matching real firewall port numbering) = 12 ports per
// block before a gap starts a fresh block — "up to 12 ports in a line, then jump to the next".
const FW_COLS_PER_BLOCK = 6;
const FW_MIN_CONSOLE_W = 170, FW_MAX_CONSOLE_W = 250;
const FW_USB_W = 24, FW_RST_W = 10, FW_TRAIL_GAP = 14;

interface FirewallLayout {
  lanW: number; wanW: number; sfpRowW: number; trailW: number; consoleW: number;
  chassisW: number; bladeW: number; totW: number;
  mgmtHaX: number; wanX: number; rjX: number; sfpX: number; consoleJackX: number; usbX: number; rstX: number;
  gridTop: number; sfpTop: number;
}

/** Width of a stacked-pair (odd-top/even-bottom) port grid: `count` ports arranged in blocks of
 *  `colsPerBlock` columns (2 ports per column), with a gap between blocks. */
function gridWidth(count: number, colsPerBlock: number): number {
  const units = Math.ceil(count / 2);
  const blocks = units > 0 ? Math.ceil(units / colsPerBlock) : 0;
  const blockW = colsPerBlock * FW_RJ_W + (colsPerBlock - 1) * FW_RJ_COL_GAP;
  const w = units > 0
    ? blocks * blockW + (blocks - 1) * FW_BLOCK_GAP - (blocks * colsPerBlock - units) * (FW_RJ_W + FW_RJ_COL_GAP)
    : 0;
  return Math.max(0, w);
}

/** Position of port `n` (1-based) within a stacked-pair grid starting at `startX`. */
function gridPos(n: number, colsPerBlock: number, startX: number, top: number): { x: number; y: number; row: number } {
  const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
  const b = Math.floor(col / colsPerBlock), ci = col % colsPerBlock;
  const blockW = colsPerBlock * FW_RJ_W + (colsPerBlock - 1) * FW_RJ_COL_GAP;
  const x = startX + b * (blockW + FW_BLOCK_GAP) + ci * (FW_RJ_W + FW_RJ_COL_GAP);
  const y = top + row * (FW_RJ_H + FW_RJ_ROW_GAP);
  return { x, y, row };
}

/** Single source of truth for firewallPorts() and renderConfiguredFirewallPanel() — computed
 *  once so the two can never drift out of sync. Zone order (left to right) matches a real
 *  enterprise firewall's front panel: a paired HA/MGMT column right after the branding, then WAN,
 *  then the numbered LAN range, then the combined SFP+/SFP28/QSFP uplink row, then Console/USB/
 *  reset trailing at the far right. `sfpTotal` combines SFP+/SFP28/QSFP into one uplink row,
 *  matching the switch engine's "reuse existing visuals" scoping. */
function computeFirewallLayout(
  rj45: number, wan: number, sfpTotal: number,
  mgmt = true, ha = true, consolePort = true, usbPort = true,
): FirewallLayout {
  const gridTop = (FW_U1 - (FW_RJ_H * 2 + FW_RJ_ROW_GAP)) / 2;
  const sfpTop = (FW_U1 - FW_SFP_H) / 2;

  const mgmtHaW = (mgmt || ha) ? FW_RJ_W : 0;
  const wanW = gridWidth(wan, FW_COLS_PER_BLOCK);
  const lanW = gridWidth(rj45, FW_COLS_PER_BLOCK);
  const sfpRowW = sfpTotal > 0 ? sfpTotal * FW_SFP_W + (sfpTotal - 1) * FW_SFP_GAP_X : 0;

  const trailItemWidths = [
    ...(consolePort ? [FW_RJ_W] : []),
    ...(usbPort ? [FW_USB_W] : []),
    FW_RST_W, // always present
  ];
  const trailW = trailItemWidths.reduce((a, b) => a + b, 0) + (trailItemWidths.length - 1) * FW_TRAIL_GAP;

  const portsRowW = (mgmtHaW > 0 ? mgmtHaW + FW_SECTION_GAP : 0)
    + (wanW > 0 ? wanW + FW_SECTION_GAP : 0)
    + lanW
    + (sfpRowW > 0 ? FW_SECTION_GAP + sfpRowW : 0)
    + FW_SECTION_GAP + trailW;

  const consoleW = Math.max(FW_MIN_CONSOLE_W, Math.min(portsRowW * 0.25, FW_MAX_CONSOLE_W));

  const chassisW = FW_EAR_W * 2 + FW_PANEL_PAD * 2 + consoleW + FW_SECTION_GAP + portsRowW;
  let bladeW = (FW_RW - chassisW) / 2;
  let totW = FW_RW;
  if (bladeW < FW_MIN_BLADE_W) { bladeW = FW_MIN_BLADE_W; totW = chassisW + bladeW * 2; }

  const zoneStart = bladeW + FW_EAR_W + FW_PANEL_PAD + consoleW + FW_SECTION_GAP;
  const mgmtHaX = zoneStart;
  const wanX = mgmtHaX + (mgmtHaW > 0 ? mgmtHaW + FW_SECTION_GAP : 0);
  const rjX = wanX + (wanW > 0 ? wanW + FW_SECTION_GAP : 0);
  const sfpX = rjX + lanW + (sfpRowW > 0 ? FW_SECTION_GAP : 0);
  const trailX = sfpX + sfpRowW + FW_SECTION_GAP;
  const consoleJackX = trailX;
  const usbX = consoleJackX + (consolePort ? FW_RJ_W + FW_TRAIL_GAP : 0);
  const rstX = usbX + (usbPort ? FW_USB_W + FW_TRAIL_GAP : 0);

  return { lanW, wanW, sfpRowW, trailW, consoleW, chassisW, bladeW, totW, mgmtHaX, wanX, rjX, sfpX, consoleJackX, usbX, rstX, gridTop, sfpTop };
}

export function firewallPorts(config: FirewallConfig, idPfx = 'fw-'): DeviceTemplate['ports'] {
  const rj45 = config.rj45Count ?? 0;
  const wan = config.wanCount ?? 0;
  const sfpPlus = config.sfpPlusCount ?? 0;
  const sfp28 = config.sfp28Count ?? 0;
  const qsfp = config.qsfpCount ?? 0;
  const mgmt = config.mgmtPort !== false;
  const ha = config.haPorts !== false;
  const consolePort = config.consolePort !== false;
  const usbPort = config.usbPort !== false;
  const sfpTotal = sfpPlus + sfp28 + qsfp;

  const W = 350, H = 30;
  const { totW, mgmtHaX, wanX, rjX, sfpX, consoleJackX, gridTop, sfpTop } =
    computeFirewallLayout(rj45, wan, sfpTotal, mgmt, ha, consolePort, usbPort);

  const sx = W / totW;
  const sy = H / FW_U1;

  type PortEntry = Omit<PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: PortEntry[] = [];

  // HA/MGMT paired column — HA on top, MGMT below, matching the reference FortiGate layout
  // (real, separately-connectable ports, not relabeled entries from the numbered LAN range).
  const mgmtHaOrder: { type: PortType; name: string; group: string }[] = [
    ...(ha ? [{ type: 'rj45' as PortType, name: 'HA', group: 'HA' }] : []),
    ...(mgmt ? [{ type: 'management' as PortType, name: 'MGMT', group: 'MGMT' }] : []),
  ];
  mgmtHaOrder.forEach((p, idx) => {
    const { x, y } = gridPos(idx + 1, 1, mgmtHaX, gridTop);
    out.push({
      id: `${idPfx}${p.name.toLowerCase()}`, name: p.name, type: p.type, speed: '1 Gbps',
      relativeX: (x + FW_RJ_W / 2) * sx, relativeY: (y + FW_RJ_H / 2) * sy,
      portW: FW_RJ_W * sx, portH: FW_RJ_H * sy,
      group: p.group,
    });
  });

  // WAN1/WAN2/... — real, separately-connectable ports in their own zone, distinct from the
  // numbered LAN range (matches how enterprise firewalls physically group Internet uplinks).
  for (let n = 1; n <= wan; n++) {
    const { x, y } = gridPos(n, FW_COLS_PER_BLOCK, wanX, gridTop);
    out.push({
      id: `${idPfx}wan${n}`, name: `WAN${n}`, type: 'rj45', speed: '1 Gbps',
      relativeX: (x + FW_RJ_W / 2) * sx, relativeY: (y + FW_RJ_H / 2) * sy,
      portW: FW_RJ_W * sx, portH: FW_RJ_H * sy,
      group: 'WAN',
    });
  }

  for (let n = 1; n <= rj45; n++) {
    const { x, y } = gridPos(n, FW_COLS_PER_BLOCK, rjX, gridTop);
    out.push({
      id: `${idPfx}p${n}`, name: `Port ${n}`, type: 'rj45', speed: '1 Gbps',
      // Not rounded — same precision reasoning as switchPorts(): the panel SVG scales this exact
      // geometry by the exact same (sx, sy), so the hover overlay lands pixel-perfect on the jack.
      relativeX: (x + FW_RJ_W / 2) * sx, relativeY: (y + FW_RJ_H / 2) * sy,
      portW: FW_RJ_W * sx, portH: FW_RJ_H * sy,
    });
  }

  const transceivers: { type: PortType; label: string; speed: string }[] = [
    ...Array.from({ length: sfpPlus }, () => ({ type: 'sfp-plus' as PortType, label: 'SFP+', speed: '10 Gbps' })),
    ...Array.from({ length: sfp28 }, () => ({ type: 'sfp28' as PortType, label: 'SFP28', speed: '25 Gbps' })),
    ...Array.from({ length: qsfp }, () => ({ type: 'qsfp28' as PortType, label: 'QSFP', speed: '40 Gbps' })),
  ];
  transceivers.forEach((t, idx) => {
    const n = idx + 1;
    const jx = sfpX + idx * (FW_SFP_W + FW_SFP_GAP_X);
    out.push({
      id: `${idPfx}sfp${n}`, name: `${t.label} ${n}`, type: t.type, speed: t.speed,
      relativeX: (jx + FW_SFP_W / 2) * sx, relativeY: (sfpTop + FW_SFP_H / 2) * sy,
      portW: FW_SFP_W * sx, portH: FW_SFP_H * sy,
      group: 'UPLINK',
    });
  });

  if (consolePort) {
    out.push({
      id: `${idPfx}console`, name: 'Console', type: 'console', speed: '115.2 Kbps',
      relativeX: (consoleJackX + FW_RJ_W / 2) * sx, relativeY: (gridTop + FW_RJ_H / 2) * sy,
      portW: FW_RJ_W * sx, portH: FW_RJ_H * sy,
      group: 'MGMT',
    });
  }

  return out;
}

const FW_LED_COLORS: Record<string, string> = {
  off: '#20262b', green: '#39ff8a', greenBlink: '#39ff8a',
  amber: '#ffb020', amberBlink: '#ffb020', blue: '#37b6ff',
  red: '#ff4d4d', white: '#f2f6ff',
};

function firewallLed(parent: SVGElement, uid: string, cx: number, cy: number, state: string, r = 1.6): void {
  const base = state.replace('Blink', '');
  const color = FW_LED_COLORS[base] ?? FW_LED_COLORS.off;
  const on = base !== 'off';
  const cls = state.endsWith('Blink') ? `blink-${uid}` : on ? `pulse-${uid}` : '';
  const grp = g();
  grp.appendChild(el('circle', { cx, cy, r: r + 0.7, fill: '#04060a', stroke: '#2a3036', 'stroke-width': 0.4 }));
  const dot = el('circle', { cx, cy, r, fill: color, opacity: on ? 1 : 0.35 });
  if (on) dot.setAttribute('filter', `url(#glow-${uid})`);
  if (cls) dot.setAttribute('class', cls);
  grp.appendChild(dot);
  if (on) grp.appendChild(el('circle', { cx: cx - 0.4, cy: cy - 0.4, r: r * 0.35, fill: '#fff', opacity: 0.85 }));
  parent.appendChild(grp);
}

/** Config-driven firewall panel — same engine as switch-renderer.ts's renderSwitchPanel (gold-pin
 *  RJ_W×RJ_H jacks, gradient chassis, single-source-of-truth layout). Only reached once a device
 *  has a `deviceConfig` — see `renderFirewallPanel` below for the no-config legacy path. */
function renderConfiguredFirewallPanel(
  template: DeviceTemplate | null, config: FirewallConfig, W: number, H: number,
  deviceData: DeviceData | null, connectedIds: Set<string>,
): SVGGElement {
  const group = g('firewall-panel');
  const skin = firewallVendorSkin(config.vendor);
  const isLight = skin.tone === 'light';
  const accent = config.accentColor || skin.accent;
  const brandLabel = config.brandName || skin.brandName;
  const model = config.modelName || template?.model || 'Enterprise Firewall';

  // Prefer live device.ports over the frozen catalog template — see switch-renderer.ts's
  // renderSwitchPanel for why (the exact "panel draws stale layout, hover overlay tracks the new
  // one" bug this avoids). Ear-hole ports are switch/router/firewall/etc-wide (injectEarPorts in
  // state.ts) and mostly typed 'rj45' too — exclude them so they don't inflate rj45Count.
  const ports = (deviceData?.ports ?? template?.ports ?? []).filter(p => !p.id.includes('-ear-'));
  const rj45Count = ports.filter(p => p.type === 'rj45' && p.group !== 'HA' && p.group !== 'WAN').length;
  const wanPorts = ports.filter(p => p.group === 'WAN');
  const wanCount = wanPorts.length;
  const isTransceiverType = (t: string) => t === 'sfp' || t === 'sfp-plus' || t === 'sfp28' || t === 'qsfp' || t === 'qsfp28';
  const uplinkPorts = ports.filter(p => p.group === 'UPLINK' || (!p.group && isTransceiverType(p.type)));
  const sfpCount = uplinkPorts.length;

  const linkOn = config.ledTheme ?? 'green';
  const actOn = `${linkOn}Blink`;

  // MGMT/HA/Console are real, separately-connectable ports — their presence in `ports`, not a
  // config flag, drives drawing them (the config flag only controls whether firewallPorts()
  // generated the port in the first place). USB-C stays config-driven (decorative only).
  const mgmtPortEntry = ports.find(p => p.type === 'management');
  const haPortEntry = ports.find(p => p.group === 'HA');
  const consolePortEntry = ports.find(p => p.type === 'console');
  const showMgmt = !!mgmtPortEntry;
  const showHa = !!haPortEntry;
  const showConsolePort = !!consolePortEntry;
  const showUsbPort = config.usbPort !== false;
  const showLcd = !!config.lcd;
  const showAssetLabel = !!config.assetLabel;
  const showQrCode = !!config.qrCode;
  const showDustCovers = !!config.dustCovers;

  // Port-range groups (WAN/LAN/PoE/10GbE/25GbE etc.) — a purely visual label/colour over a range
  // of the numbered LAN ports, same mechanism as SwitchConfig.portGroups. First match wins.
  const portGroups = config.portGroups ?? [];
  const groupForPort = (n: number) => portGroups.find(pgr => n >= pgr.startPort && n <= pgr.endPort);

  const { consoleW, chassisW, bladeW, totW, mgmtHaX, wanX, rjX, sfpX, consoleJackX, usbX, rstX, gridTop, sfpTop } =
    computeFirewallLayout(rj45Count, wanCount, sfpCount, showMgmt, showHa, showConsolePort, showUsbPort);

  const chassisX = bladeW;
  const consX = bladeW + FW_EAR_W + FW_PANEL_PAD;

  const uid = `fw${Math.random().toString(36).slice(2, 7)}`;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${FW_U1}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  ns.setAttribute('role', 'img');
  ns.setAttribute('aria-label', `${brandLabel} ${model} firewall`);

  const defs = el('defs');

  function linGrad(id: string, x2: string, y2: string, stops: [string, string][]) {
    const gr = el('linearGradient', { id, x1: '0', y1: '0', x2, y2 });
    for (const [offset, color] of stops) {
      const s = el('stop'); s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      gr.appendChild(s);
    }
    defs.appendChild(gr);
  }
  function radGrad(id: string, cx: string, cy: string, r: string, stops: [string, string][]) {
    const gr = el('radialGradient', { id, cx, cy, r });
    for (const [offset, color] of stops) {
      const s = el('stop'); s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      gr.appendChild(s);
    }
    defs.appendChild(gr);
  }

  linGrad(`chassis-${uid}`, '0', '1', isLight
    ? [['0', '#ffffff'], ['0.5', '#f6f7f9'], ['1', '#eceef1']]
    : [['0', '#3a4046'], ['0.06', '#2c3237'], ['0.5', '#23282c'], ['0.94', '#1b1f22'], ['1', '#141719']]);
  linGrad(`blade-${uid}`, '1', '0', isLight
    ? [['0', '#f2f4f6'], ['0.5', '#e8eaed'], ['1', '#dfe2e6']]
    : [['0', '#2a3035'], ['0.35', '#3a4247'], ['0.55', '#454d53'], ['0.8', '#2b3136'], ['1', '#1a1e21']]);
  linGrad(`cage-${uid}`, '0', '1', [['0', '#0c0e10'], ['0.12', '#2a2f34'], ['0.5', '#171b1e'], ['0.88', '#0a0c0d'], ['1', '#050607']]);
  linGrad(`cageLip-${uid}`, '0', '1', [['0', '#4b5258'], ['1', '#20252a']]);
  linGrad(`rjMouth-${uid}`, '0', '1', [['0', '#d9d3c2'], ['0.5', '#b3ad9c'], ['1', '#7c7768']]);
  linGrad(`gold-${uid}`, '0', '1', [['0', '#f6d98a'], ['0.5', '#c9a24b'], ['1', '#7d6021']]);
  linGrad(`sfpBody-${uid}`, '0', '1', [['0', '#c7ced4'], ['0.14', '#8f979e'], ['0.5', '#5c646b'], ['0.86', '#3a4147'], ['1', '#24292e']]);
  linGrad(`sfpBoot-${uid}`, '0', '1', [['0', '#2c333a'], ['0.5', '#171c21'], ['1', '#0c0f12']]);
  radGrad(`cageInner-${uid}`, '0.5', '0.35', '0.9', [['0', '#111417'], ['1', '#000000']]);
  radGrad(`bore-${uid}`, '0.5', '0.4', '0.75', [['0', '#1a2a3a'], ['0.7', '#060b12'], ['1', '#000']]);

  const grainF = el('filter', { id: `grain-${uid}`, x: '-2%', y: '-2%', width: '104%', height: '104%' });
  const grainTurb = el('feTurbulence');
  grainTurb.setAttribute('type', 'fractalNoise'); grainTurb.setAttribute('baseFrequency', '0.9 0.012');
  grainTurb.setAttribute('numOctaves', '2'); grainTurb.setAttribute('seed', '7'); grainTurb.setAttribute('result', 'n');
  grainF.appendChild(grainTurb);
  const grainCM = el('feColorMatrix');
  grainCM.setAttribute('in', 'n'); grainCM.setAttribute('type', 'matrix');
  grainCM.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0'); grainCM.setAttribute('result', 'grain');
  grainF.appendChild(grainCM);
  const grainComp = el('feComposite');
  grainComp.setAttribute('in', 'grain'); grainComp.setAttribute('in2', 'SourceGraphic'); grainComp.setAttribute('operator', 'over');
  grainF.appendChild(grainComp);
  defs.appendChild(grainF);

  const aoF = el('filter', { id: `ao-${uid}`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const aoDS = el('feDropShadow');
  aoDS.setAttribute('dx', '0'); aoDS.setAttribute('dy', '1.4'); aoDS.setAttribute('stdDeviation', '1.6');
  aoDS.setAttribute('flood-color', '#000'); aoDS.setAttribute('flood-opacity', '0.55');
  aoF.appendChild(aoDS); defs.appendChild(aoF);

  const isF = el('filter', { id: `innerShadow-${uid}`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const isOff = el('feOffset'); isOff.setAttribute('dx', '0'); isOff.setAttribute('dy', '1.6'); isF.appendChild(isOff);
  const isBlur = el('feGaussianBlur'); isBlur.setAttribute('stdDeviation', '1.8'); isBlur.setAttribute('result', 'o'); isF.appendChild(isBlur);
  const isCmp1 = el('feComposite'); isCmp1.setAttribute('in', 'SourceGraphic'); isCmp1.setAttribute('in2', 'o'); isCmp1.setAttribute('operator', 'out'); isCmp1.setAttribute('result', 'inv'); isF.appendChild(isCmp1);
  const isCM = el('feColorMatrix'); isCM.setAttribute('in', 'inv'); isCM.setAttribute('type', 'matrix'); isCM.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0'); isCM.setAttribute('result', 'sh'); isF.appendChild(isCM);
  const isCmp2 = el('feComposite'); isCmp2.setAttribute('in', 'sh'); isCmp2.setAttribute('in2', 'SourceGraphic'); isCmp2.setAttribute('operator', 'in'); isF.appendChild(isCmp2);
  defs.appendChild(isF);

  const sfpShF = el('filter', { id: `sfpShadow-${uid}`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const sfpShDS = el('feDropShadow');
  sfpShDS.setAttribute('dx', '0'); sfpShDS.setAttribute('dy', '0.8'); sfpShDS.setAttribute('stdDeviation', '0.9');
  sfpShDS.setAttribute('flood-color', '#000'); sfpShDS.setAttribute('flood-opacity', '0.6');
  sfpShF.appendChild(sfpShDS); defs.appendChild(sfpShF);

  const glowF = el('filter', { id: `glow-${uid}`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  const glowBlur = el('feGaussianBlur'); glowBlur.setAttribute('stdDeviation', '1.1'); glowBlur.setAttribute('result', 'b'); glowF.appendChild(glowBlur);
  const glowMrg = el('feMerge');
  const mn1 = el('feMergeNode'); mn1.setAttribute('in', 'b'); glowMrg.appendChild(mn1);
  const mn2 = el('feMergeNode'); mn2.setAttribute('in', 'SourceGraphic'); glowMrg.appendChild(mn2);
  glowF.appendChild(glowMrg); defs.appendChild(glowF);

  function addRjSym(symId: string, tabDown: boolean) {
    const sym = el('symbol', { id: symId, viewBox: `0 0 ${FW_RJ_W} ${FW_RJ_H}` });
    sym.appendChild(el('rect', { x: 0.5, y: 0.5, width: FW_RJ_W - 1, height: FW_RJ_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
    sym.appendChild(el('rect', { x: 1.5, y: 1.5, width: FW_RJ_W - 3, height: FW_RJ_H - 3, rx: 2, fill: 'none', stroke: `url(#cageLip-${uid})`, 'stroke-width': 1, opacity: 0.8 }));
    const mg = g();
    mg.setAttribute('transform', `translate(${FW_RJ_W / 2} ${FW_RJ_H / 2 + (tabDown ? 3 : -3)})`);
    const pd = tabDown
      ? 'M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z'
      : 'M-10 11 h20 v-14 h-4 v-4 a2 2 0 0 0 -2 -2 h-4 a2 2 0 0 0 -2 2 v4 h-4 z';
    const mp = el('path', { d: pd, fill: `url(#rjMouth-${uid})`, stroke: '#3a352a', 'stroke-width': 0.8 });
    mp.setAttribute('filter', `url(#innerShadow-${uid})`);
    mg.appendChild(mp);
    mg.appendChild(el('rect', { x: -8, y: tabDown ? -9 : 0, width: 16, height: 9, rx: 1, fill: '#4a4638', opacity: 0.55 }));
    for (let i = 0; i < 8; i++)
      mg.appendChild(el('rect', { x: -7.4 + i * 1.85, y: tabDown ? -9 : 2.5, width: 1.1, height: 6.5, fill: `url(#gold-${uid})`, rx: 0.3 }));
    sym.appendChild(mg); defs.appendChild(sym);
  }
  addRjSym(`rj45up-${uid}`, true);
  addRjSym(`rj45dn-${uid}`, false);

  const sfpCageSym = el('symbol', { id: `sfpCage-${uid}`, viewBox: `0 0 ${FW_SFP_W} ${FW_SFP_H}` });
  sfpCageSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: FW_SFP_W - 1, height: FW_SFP_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpCageSym.appendChild(el('rect', { x: 1.5, y: 1.5, width: FW_SFP_W - 3, height: FW_SFP_H - 3, rx: 2, fill: 'none', stroke: `url(#cageLip-${uid})`, 'stroke-width': 1, opacity: 0.8 }));
  const cageIR = el('rect', { x: 5, y: 11, width: FW_SFP_W - 10, height: FW_SFP_H - 18, rx: 1.5, fill: `url(#cageInner-${uid})` });
  cageIR.setAttribute('filter', `url(#innerShadow-${uid})`); sfpCageSym.appendChild(cageIR);
  const cgG = g(); cgG.setAttribute('opacity', '0.9');
  for (let i = 0; i < 7; i++) { const gw = (FW_SFP_W - 15) / 7; cgG.appendChild(el('rect', { x: 7.5 + i * gw, y: 13, width: gw - 1.3, height: FW_SFP_H - 24, fill: `url(#gold-${uid})`, rx: 0.4 })); }
  sfpCageSym.appendChild(cgG);
  sfpCageSym.appendChild(el('rect', { x: FW_SFP_W / 2 - 5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpCageSym.appendChild(el('rect', { x: 3, y: 2.6, width: FW_SFP_W - 6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpCageSym);

  const sfpFiberSym = el('symbol', { id: `sfpFiber-${uid}`, viewBox: `0 0 ${FW_SFP_W} ${FW_SFP_H}` });
  const sfpFG = g(); sfpFG.setAttribute('filter', `url(#sfpShadow-${uid})`);
  sfpFG.appendChild(el('rect', { x: 0.5, y: 0.5, width: FW_SFP_W - 1, height: FW_SFP_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpFG.appendChild(el('rect', { x: 3.5, y: 4, width: FW_SFP_W - 7, height: FW_SFP_H - 8, rx: 2, fill: `url(#sfpBody-${uid})`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 5.4, width: FW_SFP_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.55 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 4.2, width: FW_SFP_W - 10, height: 3.4, rx: 1.4, fill: 'var(--bail)', opacity: 0.92 }));
  const fpG = g();
  fpG.appendChild(el('rect', { x: FW_SFP_W / 2 - 9, y: FW_SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: FW_SFP_W / 2 - 5, cy: FW_SFP_H / 2 + 1, r: 2.6, fill: `url(#bore-${uid})` }));
  fpG.appendChild(el('rect', { x: FW_SFP_W / 2 + 1, y: FW_SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: FW_SFP_W / 2 + 5, cy: FW_SFP_H / 2 + 1, r: 2.6, fill: `url(#bore-${uid})` }));
  sfpFG.appendChild(fpG);
  sfpFG.appendChild(el('rect', { x: 5, y: FW_SFP_H - 8.5, width: FW_SFP_W - 10, height: 3, rx: 0.6, fill: '#c9ccce', opacity: 0.85 }));
  sfpFiberSym.appendChild(sfpFG); defs.appendChild(sfpFiberSym);

  ns.appendChild(defs);

  const txt = {
    label: config.fontColor || (isLight ? '#5a616a' : '#aeb6bd'),
    mute: config.fontMuteColor || (isLight ? '#8a9099' : '#8b939a'),
  };
  const chassisStroke = isLight ? '#d4d7dc' : '#0c0f11';

  const chG = g(); chG.setAttribute('filter', `url(#ao-${uid})`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: FW_U1 - 2, rx: 4, fill: config.panelColor || `url(#chassis-${uid})`, stroke: chassisStroke, 'stroke-width': 1.2 }));
  if (!isLight) {
    const chGrain = el('rect', { x: chassisX, y: 1, width: chassisW, height: FW_U1 - 2, rx: 4, fill: 'transparent' });
    chGrain.setAttribute('filter', `url(#grain-${uid})`); chG.appendChild(chGrain);
  }
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: 3, fill: config.brandStripColor || accent, opacity: 0.9 }));
  chG.appendChild(el('rect', { x: chassisX + 2, y: 4.5, width: chassisW - 4, height: 2, rx: 1, fill: isLight ? '#fff' : '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bendX = isLeft ? bladeW - 2.5 : bladeX;
    const bg = g(); bg.setAttribute('filter', `url(#ao-${uid})`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: FW_U1, rx: 2.5, fill: config.panelColor || `url(#blade-${uid})`, stroke: chassisStroke, 'stroke-width': 1 }));
    if (!isLight) {
      const blGrain = el('rect', { x: bladeX, y: 1, width: bladeW, height: FW_U1 - 2, fill: 'transparent', opacity: 0.7 });
      blGrain.setAttribute('filter', `url(#grain-${uid})`); bg.appendChild(blGrain);
    }
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: FW_U1 - 8, fill: isLight ? '#c7cbd0' : '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isLeft ? bladeW - 1 : bladeX + bladeW - 1.4, y: 4, width: 1.2, height: FW_U1 - 8, fill: isLight ? '#b8bcc2' : '#05070a', opacity: 0.7 }));
    for (const f of [0.34, 0.66]) {
      const hg = g();
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: FW_U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: FW_U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: 'none', stroke: '#02040a', 'stroke-width': 0.6, opacity: 0.85 }));
      const rp = el('path', { d: `M ${holeCx - 3} ${FW_U1 * f - 6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 });
      hg.appendChild(rp); bg.appendChild(hg);
    }
    ns.appendChild(bg);
  }

  const cy = FW_U1 / 2;
  const con = g(); con.setAttribute('transform', `translate(${consX} 0)`);

  const statusLeds: [string, string][] = [
    ['PWR', 'green'], ['SYS', 'greenBlink'], ['ALM', 'off'], ['LOC', 'blue'],
  ];
  for (let i = 0; i < statusLeds.length; i++) {
    const [lbl, state] = statusLeds[i];
    const ly = 20 + i * 22;
    firewallLed(con, uid, 10, ly, state);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: txt.label, 'letter-spacing': 0.6 });
    t.textContent = lbl; con.appendChild(t);
  }

  const textAvailW = Math.max(consoleW - 62 - 6, 40);
  const brandFontSize = Math.max(10, Math.min(17, textAvailW / (11 * 0.62)));
  const tw = el('text', { x: 62, y: cy - 12, 'font-size': brandFontSize, 'font-weight': 700, fill: accent, 'letter-spacing': 1.5 });
  tw.textContent = brandLabel.toUpperCase(); con.appendChild(tw);

  const modelMaxChars = Math.max(4, Math.floor(textAvailW / (9 * 0.58)));
  const tm = el('text', { x: 62, y: cy + 5, 'font-size': 9, fill: txt.mute, 'letter-spacing': 1.2 });
  tm.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy + 12, width: textAvailW, height: 1, fill: isLight ? '#d4d7dc' : '#3a4147' }));

  const totalPortCount = rj45Count + wanCount + sfpCount + (showMgmt ? 1 : 0) + (showHa ? 1 : 0) + (showConsolePort ? 1 : 0);
  const lcdLine = showLcd
    ? `${connectedIds.size}/${totalPortCount} UP`
    : `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  const tp = el('text', { x: 62, y: cy + 25, 'font-size': 7, fill: txt.mute, 'letter-spacing': 1.2 });
  tp.textContent = lcdLine;
  con.appendChild(tp);

  ns.appendChild(con);

  if (showAssetLabel) {
    const ag = g(); ag.setAttribute('transform', `translate(${chassisX + chassisW - 46} ${FW_U1 - 12})`);
    ag.appendChild(el('rect', { x: 0, y: 0, width: 42, height: 9, rx: 1.2, fill: isLight ? '#eef0f3' : '#0d1114', stroke: isLight ? '#c7cbd0' : '#33383d', 'stroke-width': 0.6 }));
    const at = el('text', { x: 21, y: 6.4, 'text-anchor': 'middle', 'font-size': 5, fill: txt.mute, 'letter-spacing': 0.3 });
    at.textContent = deviceData?.serialNumber ? `S/N ${deviceData.serialNumber}` : 'S/N —';
    ag.appendChild(at); ns.appendChild(ag);
  }
  if (showQrCode) {
    const qg = g(); qg.setAttribute('transform', `translate(${chassisX + chassisW - 90} ${FW_U1 - 16})`);
    qg.appendChild(el('rect', { x: 0, y: 0, width: 13, height: 13, rx: 1, fill: isLight ? '#eef0f3' : '#0d1114', stroke: isLight ? '#c7cbd0' : '#33383d', 'stroke-width': 0.6 }));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if ((r + c) % 2 === 0) qg.appendChild(el('rect', { x: 1.5 + c * 3.7, y: 1.5 + r * 3.7, width: 3, height: 3, fill: txt.label }));
    ns.appendChild(qg);
  }

  // Draws one stacked-pair-grid port (RJ45/WAN/MGMT/HA all share this — same jack, same LEDs,
  // same hover — differing only in id/label/colour/connection state) and its number/name label.
  function drawGridPort(x: number, y: number, row: number, ariaLabel: string, labelText: string, labelColor: string, connected: boolean): void {
    const symId = row === 0 ? `rj45up-${uid}` : `rj45dn-${uid}`;
    const ledY = row === 0 ? 5 : FW_RJ_H - 5;
    const linkState = connected ? linkOn : 'off';
    const actState = connected ? actOn : 'off';
    const pg = g(); pg.setAttribute('transform', `translate(${x} ${y})`);
    pg.setAttribute('role', 'button'); pg.setAttribute('tabindex', '0');
    pg.setAttribute('aria-label', ariaLabel);
    pg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#${symId}`); u.setAttribute('width', String(FW_RJ_W)); u.setAttribute('height', String(FW_RJ_H));
    pg.appendChild(u);
    firewallLed(pg, uid, 6, ledY, linkState, 1.4);
    firewallLed(pg, uid, FW_RJ_W - 6, ledY, actState, 1.4);
    const hov = el('rect', { x: 0, y: 0, width: FW_RJ_W, height: FW_RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    pg.appendChild(hov); ns.appendChild(pg);

    const labelY = row === 0 ? y - 4 : y + FW_RJ_H + 11;
    const t = el('text', { x: x + FW_RJ_W / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: labelColor });
    t.setAttribute('pointer-events', 'none'); t.textContent = labelText; ns.appendChild(t);
  }

  // ── HA/MGMT paired column ───────────────────────────────────────────────
  if (showHa) {
    const { x, y, row } = gridPos(1, 1, mgmtHaX, gridTop);
    drawGridPort(x, y, row, 'HA port', 'HA', txt.label, connectedIds.has(haPortEntry?.id ?? ''));
  }
  if (showMgmt) {
    const idx = showHa ? 2 : 1;
    const { x, y, row } = gridPos(idx, 1, mgmtHaX, gridTop);
    drawGridPort(x, y, row, 'MGMT port', 'MGMT', accent, connectedIds.has(mgmtPortEntry?.id ?? ''));
  }

  // ── WAN ports ────────────────────────────────────────────────────────────
  // No zone caption here (unlike UPLINK) — each port already carries its own "WAN1"/"WAN2"/...
  // label, so a floating "WAN" text above the block would be redundant.
  if (wanCount > 0) {
    for (let n = 1; n <= wanCount; n++) {
      const { x, y, row } = gridPos(n, FW_COLS_PER_BLOCK, wanX, gridTop);
      drawGridPort(x, y, row, `WAN port ${n}`, `WAN${n}`, txt.label, connectedIds.has(wanPorts[n - 1]?.id ?? ''));
    }
  }

  // ── RJ45 (LAN) ports ─────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row } = gridPos(n, FW_COLS_PER_BLOCK, rjX, gridTop);
    const grp = groupForPort(n);
    const connected = connectedIds.has(ports.filter(p => p.type === 'rj45' && p.group !== 'HA' && p.group !== 'WAN')[n - 1]?.id ?? '');
    drawGridPort(x, y, row, `RJ45 port ${n}${grp ? ` (${grp.name})` : ''}`, String(n), grp ? grp.color : txt.label, connected);
    if (grp) {
      // Coloured underline directly on the jack, matching the switch configurator's port groups.
      ns.appendChild(el('rect', { x: x + 2, y: y + FW_RJ_H - 2.2, width: FW_RJ_W - 4, height: 1.8, rx: 0.9, fill: grp.color }));
    }
  }

  // ── uplink transceivers (SFP+ / SFP28 / QSFP, one combined row) ────────
  if (sfpCount > 0) {
    ns.appendChild(el('line', { x1: sfpX - FW_SECTION_GAP / 2, y1: 20, x2: sfpX - FW_SECTION_GAP / 2, y2: FW_U1 - 20, stroke: isLight ? '#d4d7dc' : '#3a4147', 'stroke-width': 1, opacity: 0.5 }));
    const ts = el('text', { x: sfpX, y: sfpTop - 9, 'font-size': 8, fill: txt.mute, 'letter-spacing': 1.4 });
    ts.textContent = 'UPLINK'; ns.appendChild(ts);

    for (let n = 1; n <= sfpCount; n++) {
      const port = uplinkPorts[n - 1];
      const displayLabel = port?.type === 'qsfp28' ? `Q${uplinkPorts.slice(0, n).filter(p => p.type === 'qsfp28').length}`
        : port?.type === 'sfp28' ? `S${uplinkPorts.slice(0, n).filter(p => p.type === 'sfp28').length}`
        : String(rj45Count + n);
      const sxPos = sfpX + (n - 1) * (FW_SFP_W + FW_SFP_GAP_X);
      const connected = connectedIds.has(port?.id ?? '');
      const linkState = connected ? linkOn : 'off';
      const actState = connected ? actOn : 'off';
      const sg = g(); sg.setAttribute('transform', `translate(${sxPos} ${sfpTop})`);
      sg.setAttribute('role', 'button'); sg.setAttribute('tabindex', '0');
      sg.setAttribute('aria-label', `Uplink port ${displayLabel}`);
      sg.setAttribute('style', 'cursor:pointer;outline:none;--bail:#39ff8a');
      const u = el('use'); u.setAttribute('href', `#sfpFiber-${uid}`); u.setAttribute('width', String(FW_SFP_W)); u.setAttribute('height', String(FW_SFP_H));
      sg.appendChild(u);
      firewallLed(sg, uid, 6.5, FW_SFP_H - 3.2, linkState);
      firewallLed(sg, uid, FW_SFP_W - 6.5, FW_SFP_H - 3.2, actState);
      const tl = el('text', { x: FW_SFP_W / 2, y: -5.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: txt.label });
      tl.setAttribute('pointer-events', 'none'); tl.textContent = displayLabel; sg.appendChild(tl);
      if (showDustCovers && !connected) {
        sg.appendChild(el('rect', { x: 4, y: 4, width: FW_SFP_W - 8, height: FW_SFP_H - 8, rx: 2, fill: '#3a3f46', opacity: 0.55 }));
      }
      const sfpHov = el('rect', { x: 0, y: 0, width: FW_SFP_W, height: FW_SFP_H, rx: 2.5, fill: accent, opacity: 0 });
      sfpHov.setAttribute('class', `hov-${uid}`); sfpHov.setAttribute('pointer-events', 'none');
      sg.appendChild(sfpHov); ns.appendChild(sg);
    }
  }

  // ── trailing far-right cluster: Console, USB-C, reset (MGMT/HA now live in ────
  // their own paired column near the branding, matching the reference layout) ──
  if (showConsolePort) {
    const { x, y, row } = gridPos(1, 1, consoleJackX, gridTop);
    drawGridPort(x, y, row, 'Console port', 'CONSOLE', txt.label, connectedIds.has(consolePortEntry?.id ?? ''));
  }

  if (showUsbPort) {
    const usbG = g(); usbG.setAttribute('transform', `translate(${usbX} ${FW_U1 / 2 - 4.5})`);
    usbG.appendChild(el('rect', { x: 0, y: 0, width: FW_USB_W, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    usbG.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
    const usbT = el('text', { x: FW_USB_W / 2, y: 20, 'font-size': 6, 'text-anchor': 'middle', fill: txt.mute, 'letter-spacing': 0.6 });
    usbT.textContent = 'USB-C'; usbG.appendChild(usbT);
    ns.appendChild(usbG);
  }

  {
    const rstG = g(); rstG.setAttribute('transform', `translate(${rstX + FW_RST_W / 2} ${FW_U1 / 2})`);
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
    const rstT = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: txt.mute, 'letter-spacing': 0.6 });
    rstT.textContent = 'RST'; rstG.appendChild(rstT);
    ns.appendChild(rstG);
  }

  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.14}g[role="button"]:focus-visible .hov-${uid}{opacity:.22}@keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}@keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}.blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}.pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.blink-${uid},.pulse-${uid}{animation:none}}`;
  ns.appendChild(style);

  group.appendChild(ns);
  return group;
}

/** Public dispatcher. No `deviceConfig` → the exact legacy look (FortiGate 400F's fixed zones,
 *  or the generic networking-renderer fallback every other pre-existing firewall SKU already
 *  used) so placed-before-this-feature devices are unaffected. A `deviceConfig` present (either
 *  the new "Enterprise Firewall" base template, or any firewall a user has opened the
 *  configurator on) switches to the switch-style dynamic renderer. */
export function renderFirewallPanel(
  template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number,
  connectedIds: Set<string> = new Set(),
): SVGGElement {
  const config = deviceData?.deviceConfig as FirewallConfig | undefined;
  if (config) {
    return renderConfiguredFirewallPanel(template, config, W, H, deviceData, connectedIds);
  }
  if (template?.id === 'fw-fortigate-400f') {
    return renderFortiGatePanel(template, W, H, deviceData?.ports ?? [], connectedIds);
  }
  const portCount = template?.ports.length ?? 6;
  const variant = template?.id === 'fw-4p' ? 'appliance' : 'ngfw';
  return renderNetworkingPanel('firewall', portCount, variant, template?.model ?? 'Firewall', W, H, deviceData?.ports ?? [], connectedIds);
}
