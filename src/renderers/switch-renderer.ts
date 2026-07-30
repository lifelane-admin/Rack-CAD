// src/renderers/switch-renderer.ts
import { el, g } from './rack-kit';
import type { DeviceTemplate, PortData } from '../core/types';

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
// Below this width the USB-C + console jack + reset button cluster would crowd the brand text.
const CONSOLE_ICONS_MIN_W = 195;

interface SwitchLayout {
  totRjW: number; sfpRowW: number; consoleW: number; showConsoleIcons: boolean;
  chassisW: number; bladeW: number; totW: number;
  rjX: number; sfpX: number; rjTop: number; sfpTop: number; blkW: number;
}

/** Single source of truth for switchPorts() (catalog port positions) and renderSwitchPanel()
 *  (actual drawing) — computed once so the two can never drift out of sync. */
function computeSwitchLayout(rj45: number, sfp: number, rows: number): SwitchLayout {
  const units = rows === 1 ? rj45 : Math.ceil(rj45 / 2);
  const blks = units > 0 ? Math.ceil(units / CPB) : 0;
  const blkW = CPB * RJ_W + (CPB - 1) * RJ_COL_GAP;
  let totRjW = units > 0
    ? blks * blkW + (blks - 1) * BLOCK_GAP - (blks * CPB - units) * (RJ_W + RJ_COL_GAP)
    : 0;
  totRjW = Math.max(0, totRjW);
  const sfpRowW = sfp > 0 ? sfp * SFP_W + (sfp - 1) * SFP_GAP_X : 0;
  const portsRowW = totRjW + (sfp > 0 ? SECTION_GAP + sfpRowW : 0);

  const consoleW = Math.max(MIN_CONSOLE_W, Math.min(portsRowW * 0.25, MAX_CONSOLE_W));
  const showConsoleIcons = consoleW >= CONSOLE_ICONS_MIN_W;

  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + consoleW + SECTION_GAP + portsRowW;
  let bladeW = (RW - chassisW) / 2;
  let totW = RW;
  if (bladeW < MIN_BLADE_W) { bladeW = MIN_BLADE_W; totW = chassisW + bladeW * 2; }

  const rjX = bladeW + EAR_W + PANEL_PAD + consoleW + SECTION_GAP;
  const sfpX = rjX + totRjW + (sfp > 0 ? SECTION_GAP : 0);
  const rjTop = (U1 - (rows === 1 ? RJ_H : RJ_H * 2 + RJ_ROW_GAP)) / 2;
  const sfpTop = (U1 - SFP_H) / 2;

  return { totRjW, sfpRowW, consoleW, showConsoleIcons, chassisW, bladeW, totW, rjX, sfpX, rjTop, sfpTop, blkW };
}

export function switchPorts(
  rj45: number, sfp: number, rows: number, idPfx: string,
): DeviceTemplate['ports'] {
  const W = 350, H = 30;
  const { blkW, totW, rjX, sfpX, rjTop, sfpTop } = computeSwitchLayout(rj45, sfp, rows);

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
      relativeX: Math.round((jx + RJ_W / 2) * sx), relativeY: Math.round((jy + RJ_H / 2) * sy),
      portW: Math.round(RJ_W * sx), portH: Math.round(RJ_H * sy),
    });
  }

  for (let n = 1; n <= sfp; n++) {
    const jx = sfpX + (n - 1) * (SFP_W + SFP_GAP_X);
    out.push({
      id: `${idPfx}sfp${n}`, name: `SFP ${n}`, type: 'sfp-plus', speed: '10 Gbps',
      relativeX: Math.round((jx + SFP_W / 2) * sx), relativeY: Math.round((sfpTop + SFP_H / 2) * sy),
      portW: Math.round(SFP_W * sx), portH: Math.round(SFP_H * sy),
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
): SVGGElement {
  const group = g('switch-panel');

  const ports = template?.ports ?? [];
  const rj45Count = ports.filter(p => p.type === 'rj45').length;
  const sfpCount = ports.filter(p =>
    p.type === 'sfp' || p.type === 'sfp-plus' || p.type === 'sfp28' ||
    p.type === 'qsfp' || p.type === 'qsfp28',
  ).length;
  const model = template?.model ?? 'RS-2400M';
  const rjRows = rj45Count <= 8 ? 1 : 2;

  const { blkW, consoleW, showConsoleIcons, chassisW, bladeW, totW, rjX, sfpX, rjTop, sfpTop } =
    computeSwitchLayout(rj45Count, sfpCount, rjRows);

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
  ns.setAttribute('aria-label', `Rack Slicer ${model} switch`);

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

  linGrad(`chassis-${uid}`, '0', '1', [['0','#3a4046'],['0.06','#2c3237'],['0.5','#23282c'],['0.94','#1b1f22'],['1','#141719']]);
  linGrad(`blade-${uid}`, '1', '0', [['0','#2a3035'],['0.35','#3a4247'],['0.55','#454d53'],['0.8','#2b3136'],['1','#1a1e21']]);
  linGrad(`cage-${uid}`, '0', '1', [['0','#0c0e10'],['0.12','#2a2f34'],['0.5','#171b1e'],['0.88','#0a0c0d'],['1','#050607']]);
  linGrad(`cageLip-${uid}`, '0', '1', [['0','#4b5258'],['1','#20252a']]);
  linGrad(`rjMouth-${uid}`, '0', '1', [['0','#d9d3c2'],['0.5','#b3ad9c'],['1','#7c7768']]);
  linGrad(`gold-${uid}`, '0', '1', [['0','#f6d98a'],['0.5','#c9a24b'],['1','#7d6021']]);
  linGrad(`sfpBody-${uid}`, '0', '1', [['0','#c7ced4'],['0.14','#8f979e'],['0.5','#5c646b'],['0.86','#3a4147'],['1','#24292e']]);
  linGrad(`sfpBoot-${uid}`, '0', '1', [['0','#2c333a'],['0.5','#171c21'],['1','#0c0f12']]);
  radGrad(`cageInner-${uid}`, '0.5', '0.35', '0.9', [['0','#111417'],['1','#000000']]);
  radGrad(`bore-${uid}`, '0.5', '0.4', '0.75', [['0','#1a2a3a'],['0.7','#060b12'],['1','#000']]);

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

  // ── chassis ────────────────────────────────────────────────────────────
  const chG = g(); chG.setAttribute('filter', `url(#ao-${uid})`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: `url(#chassis-${uid})`, stroke: '#0c0f11', 'stroke-width': 1.2 }));
  const chGrain = el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: 'transparent' });
  chGrain.setAttribute('filter', `url(#grain-${uid})`); chG.appendChild(chGrain);
  chG.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  // ── blades ────────────────────────────────────────────────────────────
  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bendX = isLeft ? bladeW - 2.5 : bladeX;
    const bg = g(); bg.setAttribute('filter', `url(#ao-${uid})`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: U1, rx: 2.5, fill: `url(#blade-${uid})`, stroke: '#0c0f11', 'stroke-width': 1 }));
    const blGrain = el('rect', { x: bladeX, y: 1, width: bladeW, height: U1 - 2, fill: 'transparent', opacity: 0.7 });
    blGrain.setAttribute('filter', `url(#grain-${uid})`); bg.appendChild(blGrain);
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: U1 - 8, fill: '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isLeft ? bladeW - 1 : bladeX + bladeW - 1.4, y: 4, width: 1.2, height: U1 - 8, fill: '#05070a', opacity: 0.7 }));
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

  const statusLeds: [string, string][] = [['PWR','green'],['SYS','greenBlink'],['ALM','off'],['LOC','blue']];
  for (let i = 0; i < statusLeds.length; i++) {
    const [lbl, state] = statusLeds[i];
    const ly = 20 + i * 22;
    switchLed(con, uid, 10, ly, state);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: '#aeb6bd', 'letter-spacing': 0.6 });
    t.textContent = lbl; con.appendChild(t);
  }

  // Text column shrinks to fit whatever width is left of the LED column instead of assuming a
  // fixed 112px+ — a narrow (small port-count) console block would otherwise overflow past its
  // own right edge into the ports area.
  const textAvailW = Math.max(consoleW - 62 - 6, 40);
  const brandFontSize = Math.max(10, Math.min(17, textAvailW / (11 * 0.62)));
  const tw = el('text', { x: 62, y: cy - 12, 'font-size': brandFontSize, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 1.5 });
  tw.textContent = 'RACK SLICER'; con.appendChild(tw);
  const modelMaxChars = Math.max(4, Math.floor(textAvailW / (9 * 0.58)));
  const tm = el('text', { x: 62, y: cy + 5, 'font-size': 9, fill: '#8b939a', 'letter-spacing': 1.2 });
  tm.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy + 12, width: textAvailW, height: 1, fill: '#3a4147' }));
  const tp = el('text', { x: 62, y: cy + 25, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  tp.textContent = `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  con.appendChild(tp);

  // USB-C + console jack + reset button — dropped entirely below CONSOLE_ICONS_MIN_W rather
  // than overlapping the brand text, matching how the PDU rail drops its own extras when tight.
  if (showConsoleIcons) {
    const usbG = g(); usbG.setAttribute('transform', `translate(${consoleW - 110} ${cy + 6})`);
    usbG.appendChild(el('rect', { x: 0, y: 0, width: 24, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    usbG.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
    const usbT = el('text', { x: 12, y: 18, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
    usbT.textContent = 'USB-C'; usbG.appendChild(usbT); con.appendChild(usbG);

    const rjCG = g(); rjCG.setAttribute('transform', `translate(${consoleW - 72} ${cy + 4})`);
    rjCG.appendChild(el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 1.6, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 0.9 }));
    const rjCI = el('rect', { x: 2, y: 2, width: 22, height: 14, rx: 1, fill: `url(#cageInner-${uid})` });
    rjCI.setAttribute('filter', `url(#innerShadow-${uid})`); rjCG.appendChild(rjCI);
    rjCG.appendChild(el('path', { d: 'M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z', fill: '#04060a' }));
    for (let i = 0; i < 8; i++) rjCG.appendChild(el('rect', { x: 4 + i * 2.3, y: 4.5, width: 1.3, height: 4, fill: '#c9a24b', opacity: 0.8 }));
    const rjCT = el('text', { x: 13, y: 26, 'font-size': 6.5, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
    rjCT.textContent = 'CONSOLE'; rjCG.appendChild(rjCT); con.appendChild(rjCG);

    const rstG = g(); rstG.setAttribute('transform', `translate(${consoleW - 22} ${cy + 11})`);
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
    const rstT = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
    rstT.textContent = 'RST'; rstG.appendChild(rstT); con.appendChild(rstG);
  }

  ns.appendChild(con);

  // ── RJ45 ports ─────────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const connected = connectedPortIndices.has(n - 1);  // n is 1-based; port indices are 0-based
    const linkState = connected ? 'green' : 'off';
    const actState = connected ? 'greenBlink' : 'off';
    const symId = (single || row === 0) ? `rj45up-${uid}` : `rj45dn-${uid}`;
    const ledY = single ? 5 : row === 0 ? 5 : RJ_H - 5;
    const pg = g(); pg.setAttribute('transform', `translate(${x} ${y})`);
    pg.setAttribute('role', 'button'); pg.setAttribute('tabindex', '0');
    pg.setAttribute('aria-label', `RJ45 port ${n}`);
    pg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#${symId}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    pg.appendChild(u);
    switchLed(pg, uid, 6, ledY, linkState, 1.4);
    switchLed(pg, uid, RJ_W - 6, ledY, actState, 1.4);
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: '#37b6ff', opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    pg.appendChild(hov); ns.appendChild(pg);
  }

  // ── port labels ─────────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const labelY = single ? y + RJ_H + 11 : row === 0 ? y - 4 : y + RJ_H + 11;
    const t = el('text', { x: x + RJ_W / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: '#aeb6bd' });
    t.setAttribute('pointer-events', 'none'); t.textContent = String(n); ns.appendChild(t);
  }

  // ── SFP uplinks ─────────────────────────────────────────────────────────
  if (sfpCount > 0) {
    ns.appendChild(el('line', { x1: sfpX - SECTION_GAP / 2, y1: 20, x2: sfpX - SECTION_GAP / 2, y2: U1 - 20, stroke: '#3a4147', 'stroke-width': 1, opacity: 0.5 }));
    const ts = el('text', { x: sfpX, y: sfpTop - 9, 'font-size': 8, fill: '#7b838a', 'letter-spacing': 1.4 });
    ts.textContent = 'SFP UPLINK'; ns.appendChild(ts);

    for (let n = 1; n <= sfpCount; n++) {
      const sx = sfpX + (n - 1) * (SFP_W + SFP_GAP_X);
      const sg = g(); sg.setAttribute('transform', `translate(${sx} ${sfpTop})`);
      sg.setAttribute('role', 'button'); sg.setAttribute('tabindex', '0');
      sg.setAttribute('aria-label', `SFP port ${rj45Count + n}`);
      sg.setAttribute('style', 'cursor:pointer;outline:none;--bail:#39ff8a');
      const u = el('use'); u.setAttribute('href', `#sfpFiber-${uid}`); u.setAttribute('width', String(SFP_W)); u.setAttribute('height', String(SFP_H));
      sg.appendChild(u);
      switchLed(sg, uid, 6.5, SFP_H - 3.2, 'green');
      switchLed(sg, uid, SFP_W - 6.5, SFP_H - 3.2, 'greenBlink');
      const tl = el('text', { x: SFP_W / 2, y: -5.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: '#aeb6bd' });
      tl.setAttribute('pointer-events', 'none'); tl.textContent = String(rj45Count + n); sg.appendChild(tl);
      const sfpHov = el('rect', { x: 0, y: 0, width: SFP_W, height: SFP_H, rx: 2.5, fill: '#37b6ff', opacity: 0 });
      sfpHov.setAttribute('class', `hov-${uid}`); sfpHov.setAttribute('pointer-events', 'none');
      sg.appendChild(sfpHov); ns.appendChild(sg);
    }
  }

  // ── CSS animations ─────────────────────────────────────────────────────
  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.14}g[role="button"]:focus-visible .hov-${uid}{opacity:.22}@keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}@keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}.blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}.pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.blink-${uid},.pulse-${uid}{animation:none}}`;
  ns.appendChild(style);

  group.appendChild(ns);
  return group;
}
