// src/renderers/switch-renderer.ts
import { el, g } from './rack-kit';
import { switchVendorSkin } from './vendor-palette';
import type { DeviceTemplate, PortData, PortType, DeviceData, SwitchConfig } from '../core/types';

const U1 = 132;
const RW = 1240;
const MIN_BLADE_W = 34;
const EAR_W = 26;
const PANEL_PAD = 22;
const RJ_W = 30;
const RJ_H = 40;
const RJ_COL_GAP = 4;
const RJ_ROW_GAP = 7;
const BLOCK_GAP = 15;
const SFP_W = 46;
const SFP_H = 42.5;
const SFP_GAP_X = 9;
const SECTION_GAP = 26;
const CPB = 4;
// Branding/identity block is a fixed ~20% of the ports area's width (25% of the ports width,
// since 20/80 as a ratio of the total is 0.25 of the ports side) instead of a flat 250px
// constant — a flat console block next to a small (e.g. 8-port) switch's ports row was 40%+ of
// the panel. Clamped so the block never gets too narrow for the brand text to stay legible.
const MIN_CONSOLE_W = 170, MAX_CONSOLE_W = 250;
// Trailing far-right cluster: MGMT and Console are real RJ45-shaped ports (same RJ_W×RJ_H
// footprint as a regular Ethernet jack — no separate, oddly-proportioned shape); USB-C and the
// reset button stay small decorative elements (never real connectable ports).
const USB_W = 24, RST_W = 10, TRAIL_GAP = 14;

interface SwitchLayout {
  totRjW: number; sfpRowW: number; stackRowW: number; trailW: number; consoleW: number;
  chassisW: number; bladeW: number; totW: number;
  rjX: number; sfpX: number; stackX: number; mgmtX: number; consoleJackX: number; usbX: number; rstX: number;
  rjTop: number; sfpTop: number; stackTop: number; blkW: number;
}

/** Single source of truth for switchPorts() (catalog port positions) and renderSwitchPanel()
 *  (actual drawing) — computed once so the two can never drift out of sync. `sfpTotal` is the
 *  combined SFP + SFP+ + QSFP transceiver count (all drawn in one uplink row, reusing the same
 *  SFP module art per the SDK's "reuse existing visuals" scoping); `stack` is the fixed 0/2
 *  stacking-port count. `mgmt`/`consolePort`/`usbPort` control the trailing far-right cluster —
 *  the reset button is always present, so that cluster always has non-zero width. */
function computeSwitchLayout(
  rj45: number, sfpTotal: number, rows: number, stack = 0,
  mgmt = true, consolePort = true, usbPort = true,
): SwitchLayout {
  const units = rows === 1 ? rj45 : Math.ceil(rj45 / 2);
  const blks = units > 0 ? Math.ceil(units / CPB) : 0;
  const blkW = CPB * RJ_W + (CPB - 1) * RJ_COL_GAP;
  let totRjW = units > 0
    ? blks * blkW + (blks - 1) * BLOCK_GAP - (blks * CPB - units) * (RJ_W + RJ_COL_GAP)
    : 0;
  totRjW = Math.max(0, totRjW);
  const sfpRowW = sfpTotal > 0 ? sfpTotal * SFP_W + (sfpTotal - 1) * SFP_GAP_X : 0;
  const stackRowW = stack > 0 ? stack * RJ_W + (stack - 1) * RJ_COL_GAP : 0;

  const trailItemWidths = [
    ...(mgmt ? [RJ_W] : []),
    ...(consolePort ? [RJ_W] : []),
    ...(usbPort ? [USB_W] : []),
    RST_W, // always present
  ];
  const trailW = trailItemWidths.reduce((a, b) => a + b, 0) + (trailItemWidths.length - 1) * TRAIL_GAP;

  const portsRowW = totRjW
    + (sfpTotal > 0 ? SECTION_GAP + sfpRowW : 0)
    + (stack > 0 ? SECTION_GAP + stackRowW : 0)
    + SECTION_GAP + trailW;

  const consoleW = Math.max(MIN_CONSOLE_W, Math.min(portsRowW * 0.25, MAX_CONSOLE_W));

  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + consoleW + SECTION_GAP + portsRowW;
  let bladeW = (RW - chassisW) / 2;
  let totW = RW;
  if (bladeW < MIN_BLADE_W) { bladeW = MIN_BLADE_W; totW = chassisW + bladeW * 2; }

  const rjX = bladeW + EAR_W + PANEL_PAD + consoleW + SECTION_GAP;
  const sfpX = rjX + totRjW + (sfpTotal > 0 ? SECTION_GAP : 0);
  const stackX = sfpX + sfpRowW + (stack > 0 ? SECTION_GAP : 0);
  const trailX = stackX + stackRowW + SECTION_GAP;
  const mgmtX = trailX;
  const consoleJackX = mgmtX + (mgmt ? RJ_W + TRAIL_GAP : 0);
  const usbX = consoleJackX + (consolePort ? RJ_W + TRAIL_GAP : 0);
  const rstX = usbX + (usbPort ? USB_W + TRAIL_GAP : 0);
  const rjTop = (U1 - (rows === 1 ? RJ_H : RJ_H * 2 + RJ_ROW_GAP)) / 2;
  const sfpTop = (U1 - SFP_H) / 2;
  const stackTop = (U1 - RJ_H) / 2;

  return { totRjW, sfpRowW, stackRowW, trailW, consoleW, chassisW, bladeW, totW, rjX, sfpX, stackX, mgmtX, consoleJackX, usbX, rstX, rjTop, sfpTop, stackTop, blkW };
}

/** One combined transceiver uplink row, ordered SFP → SFP+ → QSFP. QSFP+/QSFP56/QSFP-DD all
 *  render as the same QSFP module (labelled "Q<n>") per the SDK's port-type scoping decision —
 *  no dedicated artwork per exotic transceiver type. `sfpPlus` stays the 2nd positional arg
 *  (existing catalog entries all call this 4-arg form) so every pre-existing call site keeps
 *  producing byte-identical ports; `extra` carries the new SwitchConfig-driven fields. */
export function switchPorts(
  rj45: number, sfpPlus: number, rows: number, idPfx: string,
  extra?: { sfp?: number; qsfp?: number; stack?: number; mgmt?: boolean; consolePort?: boolean; usbPort?: boolean },
): DeviceTemplate['ports'] {
  const { sfp = 0, qsfp = 0, stack = 0, mgmt = true, consolePort = true, usbPort = true } = extra ?? {};
  const W = 350, H = 30;
  const sfpTotal = sfp + sfpPlus + qsfp;
  const { blkW, totW, rjX, sfpX, stackX, mgmtX, consoleJackX, rjTop, sfpTop, stackTop } =
    computeSwitchLayout(rj45, sfpTotal, rows, stack, mgmt, consolePort, usbPort);

  const sx = W / totW;
  const sy = H / U1;

  type PortEntry = Omit<PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: PortEntry[] = [];

  for (let n = 1; n <= rj45; n++) {
    let jx: number, jy: number;
    if (rows === 1) {
      const c = n - 1, b = Math.floor(c / CPB), ci = c % CPB;
      jx = rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP);
      jy = rjTop;
    } else {
      const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
      const b = Math.floor(col / CPB), ci = col % CPB;
      jx = rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP);
      jy = rjTop + row * (RJ_H + RJ_ROW_GAP);
    }
    out.push({
      id: `${idPfx}p${n}`, name: `Port ${n}`, type: 'rj45', speed: '1 Gbps',
      // Not rounded — the panel SVG scales this exact same geometry by the exact same (sx, sy)
      // factors via preserveAspectRatio="none", so keeping full precision here is what makes the
      // hover/neon-glow overlay (drawn from these relativeX/Y/portW/portH values) land pixel-
      // perfect on the actual jack instead of drifting off by rounding error.
      relativeX: (jx + RJ_W / 2) * sx, relativeY: (jy + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy,
    });
  }

  const transceivers: { type: PortType; label: string; speed: string }[] = [
    ...Array.from({ length: sfp }, () => ({ type: 'sfp' as PortType, label: 'SFP', speed: '1 Gbps' })),
    ...Array.from({ length: sfpPlus }, () => ({ type: 'sfp-plus' as PortType, label: 'SFP+', speed: '10 Gbps' })),
    ...Array.from({ length: qsfp }, () => ({ type: 'qsfp28' as PortType, label: 'QSFP', speed: '40 Gbps' })),
  ];
  transceivers.forEach((t, idx) => {
    const n = idx + 1;
    const jx = sfpX + idx * (SFP_W + SFP_GAP_X);
    out.push({
      id: `${idPfx}sfp${n}`, name: `${t.label} ${n}`, type: t.type, speed: t.speed,
      relativeX: (jx + SFP_W / 2) * sx, relativeY: (sfpTop + SFP_H / 2) * sy,
      portW: SFP_W * sx, portH: SFP_H * sy,
      group: 'UPLINK',
    });
  });

  for (let n = 1; n <= stack; n++) {
    const jx = stackX + (n - 1) * (RJ_W + RJ_COL_GAP);
    out.push({
      id: `${idPfx}stk${n}`, name: `Stack ${n}`, type: 'rj45', speed: '10 Gbps',
      relativeX: (jx + RJ_W / 2) * sx, relativeY: (stackTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy,
      group: 'STACK',
    });
  }

  // MGMT and Console are real, separately-connectable ports in the trailing far-right cluster —
  // not a relabeled entry borrowed from the numbered RJ45 range. Same RJ_W×RJ_H footprint as a
  // regular Ethernet jack (see computeSwitchLayout's trailing-cluster math above).
  if (mgmt) {
    out.push({
      id: `${idPfx}mgmt`, name: 'MGMT', type: 'management', speed: '1 Gbps',
      relativeX: (mgmtX + RJ_W / 2) * sx, relativeY: (stackTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy,
      group: 'MGMT',
    });
  }
  if (consolePort) {
    out.push({
      id: `${idPfx}console`, name: 'Console', type: 'console', speed: '115.2 Kbps',
      relativeX: (consoleJackX + RJ_W / 2) * sx, relativeY: (stackTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy,
      group: 'MGMT',
    });
  }

  return out;
}

const LED_COLORS: Record<string, string> = {
  off: '#20262b', green: '#39ff8a', greenBlink: '#39ff8a',
  amber: '#ffb020', amberBlink: '#ffb020', blue: '#37b6ff',
  red: '#ff4d4d', white: '#f2f6ff',
};

function switchLed(
  parent: SVGElement, uid: string,
  cx: number, cy: number, state: string, r = 1.6,
): void {
  const base = state.replace('Blink', '');
  const color = LED_COLORS[base] ?? LED_COLORS.off;
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

export function renderSwitchPanel(
  template: DeviceTemplate | null,
  W: number,
  H: number,
  connectedPortIndices: Set<number> = new Set(),
  deviceData?: DeviceData,
): SVGGElement {
  const group = g('switch-panel');

  const config = deviceData?.deviceConfig as SwitchConfig | undefined;
  const skin = switchVendorSkin(config?.vendor);
  const isLight = !!config && skin.tone === 'light';

  // Prefer the device's own live ports (kept in sync with SwitchConfig by injectConfigurablePorts
  // in state.ts) over the catalog template's frozen ports — otherwise, once a device's port
  // counts diverge from the template's original composition, the panel keeps drawing the stale
  // template layout while the port-renderer.ts hover/neon overlay (positioned from the live
  // ports) moves to the new layout, visibly desyncing the two. Ear-hole ports (injectEarPorts in
  // state.ts, mostly typed 'rj45' too) only exist on live device.ports, never on the template —
  // exclude them here or they'd inflate rj45Count and the panel would draw extra jacks that
  // don't correspond to any real network port.
  const ports = (deviceData?.ports ?? template?.ports ?? []).filter(p => !p.id.includes('-ear-'));
  const rj45Count = ports.filter(p => p.type === 'rj45' && p.group !== 'STACK').length;
  // `group` is only set on ports generated after this feature landed — fall back to type-based
  // matching so devices persisted before this change (no `group` field yet) keep their uplinks.
  const isTransceiverType = (t: string) => t === 'sfp' || t === 'sfp-plus' || t === 'sfp28' || t === 'qsfp' || t === 'qsfp28';
  const uplinkPorts = ports.filter(p => p.group === 'UPLINK' || (!p.group && isTransceiverType(p.type)));
  const sfpCount = uplinkPorts.length;
  const stackPorts = ports.filter(p => p.group === 'STACK');
  const stackCount = stackPorts.length;
  const model = config?.modelName || template?.model || 'RS-2400M';
  const brandLabel = config?.brandName || skin.brandName;
  const rjRows = rj45Count <= 8 ? 1 : 2;

  const linkOn = config?.ledTheme ?? 'green';
  const actOn = `${linkOn}Blink`;

  // MGMT/Console are real, separately-connectable ports (see switchPorts()) — their presence in
  // `ports`, not a config flag, is what drives drawing them (a config flag only controls whether
  // injectConfigurablePorts generated the port in the first place). USB-C stays config-driven
  // since it's decorative only and never a real port entity.
  const mgmtPortEntry = ports.find(p => p.type === 'management');
  const consolePortEntry = ports.find(p => p.type === 'console');
  const showMgmt = !!mgmtPortEntry;
  const showConsolePort = !!consolePortEntry;
  const showUsbPort = !config || config.usbPort !== false;
  const showLcd = !!config?.lcd;
  const showAssetLabel = !!config?.assetLabel;
  const showDustCovers = !!config?.dustCovers;
  // The global PoE toggle only applies to ports inside [poeStartPort, poeEndPort] (defaulting to
  // the full RJ45 range) — a port group's own `poe` flag is an independent, additional way to
  // mark a specific named range as PoE-capable.
  const poeStart = config?.poeStartPort ?? 1;
  const poeEnd = config?.poeEndPort ?? rj45Count;
  const poeForPort = (n: number, grp?: { poe?: boolean }) => (!!config?.poe && n >= poeStart && n <= poeEnd) || !!grp?.poe;

  const { blkW, consoleW, chassisW, bladeW, totW, rjX, sfpX, stackX, mgmtX, consoleJackX, usbX, rstX, rjTop, sfpTop, stackTop } =
    computeSwitchLayout(rj45Count, sfpCount, rjRows, stackCount, showMgmt, showConsolePort, showUsbPort);

  const chassisX = bladeW;
  const consX = bladeW + EAR_W + PANEL_PAD;

  function rjPos(n: number) {
    if (rjRows === 1) {
      const c = n - 1, b = Math.floor(c / CPB), ci = c % CPB;
      return { x: rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP), y: rjTop, row: 0, single: true };
    }
    const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
    const b = Math.floor(col / CPB), ci = col % CPB;
    return { x: rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP), y: rjTop + row * (RJ_H + RJ_ROW_GAP), row, single: false };
  }

  const uid = `sw${Math.random().toString(36).slice(2, 7)}`;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${U1}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  ns.setAttribute('role', 'img');
  ns.setAttribute('aria-label', `${brandLabel} ${model} switch`);

  const defs = el('defs');

  // ── gradients ──────────────────────────────────────────────────────────
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

  // ── filters ────────────────────────────────────────────────────────────
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

  // ── symbols ────────────────────────────────────────────────────────────
  function addRjSym(symId: string, tabDown: boolean) {
    const sym = el('symbol', { id: symId, viewBox: `0 0 ${RJ_W} ${RJ_H}` });
    sym.appendChild(el('rect', { x: 0.5, y: 0.5, width: RJ_W - 1, height: RJ_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
    sym.appendChild(el('rect', { x: 1.5, y: 1.5, width: RJ_W - 3, height: RJ_H - 3, rx: 2, fill: 'none', stroke: `url(#cageLip-${uid})`, 'stroke-width': 1, opacity: 0.8 }));
    const mg = g();
    mg.setAttribute('transform', `translate(${RJ_W / 2} ${RJ_H / 2 + (tabDown ? 3 : -3)})`);
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

  const sfpCageSym = el('symbol', { id: `sfpCage-${uid}`, viewBox: `0 0 ${SFP_W} ${SFP_H}` });
  sfpCageSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_W - 1, height: SFP_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpCageSym.appendChild(el('rect', { x: 1.5, y: 1.5, width: SFP_W - 3, height: SFP_H - 3, rx: 2, fill: 'none', stroke: `url(#cageLip-${uid})`, 'stroke-width': 1, opacity: 0.8 }));
  const cageIR = el('rect', { x: 5, y: 11, width: SFP_W - 10, height: SFP_H - 18, rx: 1.5, fill: `url(#cageInner-${uid})` });
  cageIR.setAttribute('filter', `url(#innerShadow-${uid})`); sfpCageSym.appendChild(cageIR);
  const cgG = g(); cgG.setAttribute('opacity', '0.9');
  for (let i = 0; i < 7; i++) { const gw = (SFP_W - 15) / 7; cgG.appendChild(el('rect', { x: 7.5 + i * gw, y: 13, width: gw - 1.3, height: SFP_H - 24, fill: `url(#gold-${uid})`, rx: 0.4 })); }
  sfpCageSym.appendChild(cgG);
  sfpCageSym.appendChild(el('rect', { x: SFP_W / 2 - 5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpCageSym.appendChild(el('rect', { x: 3, y: 2.6, width: SFP_W - 6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpCageSym);

  const sfpFiberSym = el('symbol', { id: `sfpFiber-${uid}`, viewBox: `0 0 ${SFP_W} ${SFP_H}` });
  const sfpFG = g(); sfpFG.setAttribute('filter', `url(#sfpShadow-${uid})`);
  sfpFG.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_W - 1, height: SFP_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpFG.appendChild(el('rect', { x: 3.5, y: 4, width: SFP_W - 7, height: SFP_H - 8, rx: 2, fill: `url(#sfpBody-${uid})`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 5.4, width: SFP_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.55 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 4.2, width: SFP_W - 10, height: 3.4, rx: 1.4, fill: 'var(--bail)', opacity: 0.92 }));
  const fpG = g();
  fpG.appendChild(el('rect', { x: SFP_W / 2 - 9, y: SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: SFP_W / 2 - 5, cy: SFP_H / 2 + 1, r: 2.6, fill: `url(#bore-${uid})` }));
  fpG.appendChild(el('rect', { x: SFP_W / 2 + 1, y: SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: SFP_W / 2 + 5, cy: SFP_H / 2 + 1, r: 2.6, fill: `url(#bore-${uid})` }));
  sfpFG.appendChild(fpG);
  sfpFG.appendChild(el('rect', { x: 5, y: SFP_H - 8.5, width: SFP_W - 10, height: 3, rx: 0.6, fill: '#c9ccce', opacity: 0.85 }));
  sfpFiberSym.appendChild(sfpFG); defs.appendChild(sfpFiberSym);

  const sfpDacSym = el('symbol', { id: `sfpDac-${uid}`, viewBox: `0 0 ${SFP_W} ${SFP_H}` });
  const sfpDG = g(); sfpDG.setAttribute('filter', `url(#sfpShadow-${uid})`);
  sfpDG.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_W - 1, height: SFP_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpDG.appendChild(el('rect', { x: 3.5, y: 4, width: SFP_W - 7, height: SFP_H - 8, rx: 2, fill: `url(#sfpBody-${uid})`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpDG.appendChild(el('rect', { x: 5, y: 5.4, width: SFP_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.5 }));
  sfpDG.appendChild(el('rect', { x: SFP_W / 2 - 6, y: SFP_H / 2 - 4, width: 12, height: 12, rx: 2.4, fill: `url(#sfpBoot-${uid})`, stroke: '#05070a', 'stroke-width': 0.6 }));
  for (let i = 0; i < 3; i++) sfpDG.appendChild(el('rect', { x: SFP_W / 2 - 5, y: SFP_H / 2 - 2.4 + i * 3, width: 10, height: 1, rx: 0.5, fill: '#000', opacity: 0.35 }));
  sfpDacSym.appendChild(sfpDG); defs.appendChild(sfpDacSym);

  ns.appendChild(defs);

  // ── text tone (dark text on a light chassis vs. light text on a dark chassis) ──────────────
  const txt = isLight
    ? { label: '#5a616a', mute: '#8a9099' }
    : { label: '#aeb6bd', mute: '#8b939a' };
  const chassisStroke = isLight ? '#d4d7dc' : '#0c0f11';
  const accent = config?.accentColor || (config ? skin.accent : '#37b6ff');

  // ── chassis ────────────────────────────────────────────────────────────
  const chG = g(); chG.setAttribute('filter', `url(#ao-${uid})`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: config?.panelColor || `url(#chassis-${uid})`, stroke: chassisStroke, 'stroke-width': 1.2 }));
  if (!isLight) {
    const chGrain = el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: 'transparent' });
    chGrain.setAttribute('filter', `url(#grain-${uid})`); chG.appendChild(chGrain);
  }
  chG.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: isLight ? '#fff' : '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  // ── blades ────────────────────────────────────────────────────────────
  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bendX = isLeft ? bladeW - 2.5 : bladeX;
    const bg = g(); bg.setAttribute('filter', `url(#ao-${uid})`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: U1, rx: 2.5, fill: config?.panelColor || `url(#blade-${uid})`, stroke: chassisStroke, 'stroke-width': 1 }));
    if (!isLight) {
      const blGrain = el('rect', { x: bladeX, y: 1, width: bladeW, height: U1 - 2, fill: 'transparent', opacity: 0.7 });
      blGrain.setAttribute('filter', `url(#grain-${uid})`); bg.appendChild(blGrain);
    }
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: U1 - 8, fill: isLight ? '#c7cbd0' : '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isLeft ? bladeW - 1 : bladeX + bladeW - 1.4, y: 4, width: 1.2, height: U1 - 8, fill: isLight ? '#b8bcc2' : '#05070a', opacity: 0.7 }));
    for (const f of [0.34, 0.66]) {
      const hg = g();
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: 'none', stroke: '#02040a', 'stroke-width': 0.6, opacity: 0.85 }));
      const rp = el('path', { d: `M ${holeCx - 3} ${U1 * f - 6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 });
      hg.appendChild(rp); bg.appendChild(hg);
    }
    ns.appendChild(bg);
  }

  // ── console ────────────────────────────────────────────────────────────
  const cy = U1 / 2;
  const con = g(); con.setAttribute('transform', `translate(${consX} 0)`);

  const statusLeds: [string, string][] = [
    ['PWR', 'green'], ['SYS', 'greenBlink'], ['ALM', 'off'], ['LOC', 'blue'],
  ];
  for (let i = 0; i < statusLeds.length; i++) {
    const [lbl, state] = statusLeds[i];
    const ly = 20 + i * 22;
    switchLed(con, uid, 10, ly, state);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: txt.label, 'letter-spacing': 0.6 });
    t.textContent = lbl; con.appendChild(t);
  }

  // Text column shrinks to fit whatever width is left of the LED column instead of assuming a
  // fixed 112px+ — a narrow (small port-count) console block would otherwise overflow past its
  // own right edge into the ports area.
  const textAvailW = Math.max(consoleW - 62 - 6, 40);
  const brandFontSize = Math.max(10, Math.min(17, textAvailW / (11 * 0.62)));
  const tw = el('text', { x: 62, y: cy - 12, 'font-size': brandFontSize, 'font-weight': 700, fill: accent, 'letter-spacing': 1.5 });
  tw.textContent = brandLabel.toUpperCase(); con.appendChild(tw);

  // Switch layer badge (L1/L2/L3) — a physical/labeling attribute only, no routing/switching
  // logic (out of this app's physical-appearance-only scope). Only shown once a device has a
  // deviceConfig, so legacy no-config switches keep their exact prior look.
  const layer = config?.layer ?? (config ? 'L2' : undefined);
  if (layer) {
    const lyG = g(); lyG.setAttribute('transform', `translate(${consoleW - 24} 8)`);
    lyG.appendChild(el('rect', { x: 0, y: 0, width: 20, height: 11, rx: 2, fill: accent }));
    const lyT = el('text', { x: 10, y: 8.2, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 700, fill: isLight ? '#fff' : '#04060a' });
    lyT.textContent = layer; lyG.appendChild(lyT);
    con.appendChild(lyG);
  }
  const modelMaxChars = Math.max(4, Math.floor(textAvailW / (9 * 0.58)));
  const tm = el('text', { x: 62, y: cy + 5, 'font-size': 9, fill: txt.mute, 'letter-spacing': 1.2 });
  tm.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy + 12, width: textAvailW, height: 1, fill: isLight ? '#d4d7dc' : '#3a4147' }));

  const totalPortCount = rj45Count + sfpCount + stackCount + (showMgmt ? 1 : 0) + (showConsolePort ? 1 : 0);
  const lcdLine = showLcd
    ? `${connectedPortIndices.size}/${totalPortCount} UP`
    : `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  const tp = el('text', { x: 62, y: cy + 25, 'font-size': 7, fill: isLight ? '#8a9099' : '#5b636a', 'letter-spacing': 1.2 });
  tp.textContent = lcdLine;
  con.appendChild(tp);

  ns.appendChild(con);

  if (showAssetLabel) {
    const ag = g(); ag.setAttribute('transform', `translate(${chassisX + chassisW - 46} ${U1 - 12})`);
    ag.appendChild(el('rect', { x: 0, y: 0, width: 42, height: 9, rx: 1.2, fill: isLight ? '#eef0f3' : '#0d1114', stroke: isLight ? '#c7cbd0' : '#33383d', 'stroke-width': 0.6 }));
    const at = el('text', { x: 21, y: 6.4, 'text-anchor': 'middle', 'font-size': 5, fill: txt.mute, 'letter-spacing': 0.3 });
    at.textContent = deviceData?.serialNumber ? `S/N ${deviceData.serialNumber}` : 'S/N —';
    ag.appendChild(at); ns.appendChild(ag);
  }

  // Port-range groups (VLAN-style visual grouping only — no switching logic). First match wins
  // when ranges overlap.
  const portGroups = config?.portGroups ?? [];
  const groupForPort = (n: number) => portGroups.find(pgr => n >= pgr.startPort && n <= pgr.endPort);

  // ── RJ45 ports ─────────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const connected = connectedPortIndices.has(n - 1);  // n is 1-based; port indices are 0-based
    const linkState = connected ? linkOn : 'off';
    const actState = connected ? actOn : 'off';
    const symId = (single || row === 0) ? `rj45up-${uid}` : `rj45dn-${uid}`;
    const ledY = single ? 5 : row === 0 ? 5 : RJ_H - 5;
    const grp = groupForPort(n);
    const pg = g(); pg.setAttribute('transform', `translate(${x} ${y})`);
    pg.setAttribute('role', 'button'); pg.setAttribute('tabindex', '0');
    pg.setAttribute('aria-label', `RJ45 port ${n}${grp ? ` (${grp.name}${grp.poe ? ', PoE' : ''})` : ''}`);
    pg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#${symId}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    pg.appendChild(u);
    switchLed(pg, uid, 6, ledY, linkState, 1.4);
    switchLed(pg, uid, RJ_W - 6, ledY, actState, 1.4);
    if (poeForPort(n, grp)) {
      pg.appendChild(el('circle', { cx: RJ_W - 4, cy: 4, r: 2.6, fill: '#ffb020', opacity: 0.85, class: 'poe-badge' }));
      const poeT = el('text', { x: RJ_W - 4, y: 6.2, 'text-anchor': 'middle', 'font-size': 3.6, 'font-weight': 700, fill: '#241a00' });
      poeT.textContent = 'P'; pg.appendChild(poeT);
    }
    if (grp) {
      pg.appendChild(el('rect', { x: 2, y: RJ_H - 2.2, width: RJ_W - 4, height: 1.8, rx: 0.9, fill: grp.color }));
    }
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    pg.appendChild(hov); ns.appendChild(pg);
  }

  // ── port labels ─────────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const labelY = single ? y + RJ_H + 11 : row === 0 ? y - 4 : y + RJ_H + 11;
    const grp = groupForPort(n);
    const t = el('text', { x: x + RJ_W / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: grp ? grp.color : txt.label });
    t.setAttribute('pointer-events', 'none'); t.textContent = String(n); ns.appendChild(t);
  }

  // ── uplink transceivers (SFP / SFP+ / QSFP, one combined row) ──────────
  if (sfpCount > 0) {
    ns.appendChild(el('line', { x1: sfpX - SECTION_GAP / 2, y1: 20, x2: sfpX - SECTION_GAP / 2, y2: U1 - 20, stroke: isLight ? '#d4d7dc' : '#3a4147', 'stroke-width': 1, opacity: 0.5 }));
    const ts = el('text', { x: sfpX, y: sfpTop - 9, 'font-size': 8, fill: txt.mute, 'letter-spacing': 1.4 });
    ts.textContent = 'UPLINK'; ns.appendChild(ts);

    for (let n = 1; n <= sfpCount; n++) {
      const port = uplinkPorts[n - 1];
      const displayLabel = port?.type === 'qsfp28' ? `Q${uplinkPorts.slice(0, n).filter(p => p.type === 'qsfp28').length}` : String(rj45Count + n);
      const sx = sfpX + (n - 1) * (SFP_W + SFP_GAP_X);
      const globalIdx = rj45Count + n - 1;
      const connected = connectedPortIndices.has(globalIdx);
      const linkState = connected ? linkOn : 'off';
      const actState = connected ? actOn : 'off';
      const sg = g(); sg.setAttribute('transform', `translate(${sx} ${sfpTop})`);
      sg.setAttribute('role', 'button'); sg.setAttribute('tabindex', '0');
      sg.setAttribute('aria-label', `Uplink port ${displayLabel}`);
      sg.setAttribute('style', 'cursor:pointer;outline:none;--bail:#39ff8a');
      const u = el('use'); u.setAttribute('href', `#sfpFiber-${uid}`); u.setAttribute('width', String(SFP_W)); u.setAttribute('height', String(SFP_H));
      sg.appendChild(u);
      switchLed(sg, uid, 6.5, SFP_H - 3.2, linkState);
      switchLed(sg, uid, SFP_W - 6.5, SFP_H - 3.2, actState);
      const tl = el('text', { x: SFP_W / 2, y: -5.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: txt.label });
      tl.setAttribute('pointer-events', 'none'); tl.textContent = displayLabel; sg.appendChild(tl);
      if (showDustCovers && !connected) {
        sg.appendChild(el('rect', { x: 4, y: 4, width: SFP_W - 8, height: SFP_H - 8, rx: 2, fill: '#3a3f46', opacity: 0.55 }));
      }
      const sfpHov = el('rect', { x: 0, y: 0, width: SFP_W, height: SFP_H, rx: 2.5, fill: accent, opacity: 0 });
      sfpHov.setAttribute('class', `hov-${uid}`); sfpHov.setAttribute('pointer-events', 'none');
      sg.appendChild(sfpHov); ns.appendChild(sg);
    }
  }

  // ── stacking ports (fixed-count toggle, reuses the RJ45 jack visual) ───
  if (stackCount > 0) {
    ns.appendChild(el('line', { x1: stackX - SECTION_GAP / 2, y1: 20, x2: stackX - SECTION_GAP / 2, y2: U1 - 20, stroke: isLight ? '#d4d7dc' : '#3a4147', 'stroke-width': 1, opacity: 0.5 }));
    const ts = el('text', { x: stackX, y: stackTop - 9, 'font-size': 8, fill: txt.mute, 'letter-spacing': 1.4 });
    ts.textContent = 'STACK'; ns.appendChild(ts);

    for (let n = 1; n <= stackCount; n++) {
      const sx = stackX + (n - 1) * (RJ_W + RJ_COL_GAP);
      const globalIdx = rj45Count + sfpCount + n - 1;
      const connected = connectedPortIndices.has(globalIdx);
      const linkState = connected ? linkOn : 'off';
      const stG = g(); stG.setAttribute('transform', `translate(${sx} ${stackTop})`);
      stG.setAttribute('role', 'button'); stG.setAttribute('tabindex', '0');
      stG.setAttribute('aria-label', `Stack port ${n}`);
      stG.setAttribute('style', 'cursor:pointer;outline:none');
      const u = el('use'); u.setAttribute('href', `#rj45up-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
      stG.appendChild(u);
      switchLed(stG, uid, 6, 5, linkState, 1.4);
      switchLed(stG, uid, RJ_W - 6, 5, linkState, 1.4);
      const tl = el('text', { x: RJ_W / 2, y: RJ_H + 11, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 600, fill: txt.label });
      tl.setAttribute('pointer-events', 'none'); tl.textContent = `S${n}`; stG.appendChild(tl);
      ns.appendChild(stG);
    }
  }

  // ── trailing far-right cluster: MGMT, Console, USB-C, reset ────────────
  // MGMT and Console are real ports (same RJ_W×RJ_H footprint/artwork as a regular Ethernet
  // jack — matching aspect ratio, not a separate squashed shape); USB-C/reset stay decorative.
  const trailBaseIdx = rj45Count + sfpCount + stackCount;
  if (showMgmt) {
    const connected = connectedPortIndices.has(trailBaseIdx);
    const linkState = connected ? linkOn : 'off';
    const mg = g(); mg.setAttribute('transform', `translate(${mgmtX} ${stackTop})`);
    mg.setAttribute('role', 'button'); mg.setAttribute('tabindex', '0');
    mg.setAttribute('aria-label', 'MGMT port');
    mg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#rj45up-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    mg.appendChild(u);
    switchLed(mg, uid, 6, 5, linkState, 1.4);
    switchLed(mg, uid, RJ_W - 6, 5, linkState, 1.4);
    const tl = el('text', { x: RJ_W / 2, y: RJ_H + 11, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 600, fill: accent });
    tl.setAttribute('pointer-events', 'none'); tl.textContent = 'MGMT'; mg.appendChild(tl);
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    mg.appendChild(hov);
    ns.appendChild(mg);
  }

  if (showConsolePort) {
    const consoleIdx = trailBaseIdx + (showMgmt ? 1 : 0);
    const connected = connectedPortIndices.has(consoleIdx);
    const cg2 = g(); cg2.setAttribute('transform', `translate(${consoleJackX} ${stackTop})`);
    cg2.setAttribute('role', 'button'); cg2.setAttribute('tabindex', '0');
    cg2.setAttribute('aria-label', 'Console port');
    cg2.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#rj45up-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    cg2.appendChild(u);
    switchLed(cg2, uid, RJ_W / 2, 5, connected ? 'blue' : 'off', 1.4);
    const tl = el('text', { x: RJ_W / 2, y: RJ_H + 11, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 600, fill: txt.label });
    tl.setAttribute('pointer-events', 'none'); tl.textContent = 'CONSOLE'; cg2.appendChild(tl);
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    cg2.appendChild(hov);
    ns.appendChild(cg2);
  }

  if (showUsbPort) {
    const usbG = g(); usbG.setAttribute('transform', `translate(${usbX} ${U1 / 2 - 4.5})`);
    usbG.appendChild(el('rect', { x: 0, y: 0, width: USB_W, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    usbG.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
    const usbT = el('text', { x: USB_W / 2, y: 20, 'font-size': 6, 'text-anchor': 'middle', fill: txt.mute, 'letter-spacing': 0.6 });
    usbT.textContent = 'USB-C'; usbG.appendChild(usbT);
    ns.appendChild(usbG);
  }

  {
    const rstG = g(); rstG.setAttribute('transform', `translate(${rstX + RST_W / 2} ${U1 / 2})`);
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
    const rstT = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: txt.mute, 'letter-spacing': 0.6 });
    rstT.textContent = 'RST'; rstG.appendChild(rstT);
    ns.appendChild(rstG);
  }

  // ── CSS animations ─────────────────────────────────────────────────────
  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.14}g[role="button"]:focus-visible .hov-${uid}{opacity:.22}@keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}@keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}.blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}.pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.blink-${uid},.pulse-${uid}{animation:none}}`;
  ns.appendChild(style);

  group.appendChild(ns);
  return group;
}
