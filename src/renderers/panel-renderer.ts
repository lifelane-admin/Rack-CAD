import { DeviceCategory, DeviceTemplate } from '../core/types';

// ─── Port geometry constants ─────────────────────────────────────────────────
const PORT_W = 18;
const PORT_H = 15;
const PORT_PITCH = 21;
const SFP_W = 36;
const SFP_PITCH = 40;
const LED_H = 2.5;
const LED_GAP = 2;
const STATUS_END = 48;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function g(cls = ''): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (cls) group.setAttribute('class', cls);
  return group;
}

function makeChassisGradient(id: string, parent: SVGDefsElement): void {
  const grad = el('linearGradient', { id, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  [
    { offset: '0%',   color: '#3a3a3f' },
    { offset: '30%',  color: '#2a2a2f' },
    { offset: '70%',  color: '#22222a' },
    { offset: '100%', color: '#1a1a1e' },
  ].forEach(({ offset, color }) => {
    const stop = el('stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  });
  parent.appendChild(grad);
}

function drawRJ45(parent: SVGGElement, ax: number, portTopY: number, label: string, ledOn: boolean): void {
  const ledY = portTopY - LED_GAP - LED_H;
  parent.appendChild(el('rect', { x: ax + 1, y: ledY, width: PORT_W - 2, height: LED_H, rx: 1, fill: ledOn ? '#00e676' : '#1a2a1a' }));
  parent.appendChild(el('rect', { x: ax, y: portTopY, width: PORT_W, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: portTopY + 2, width: PORT_W - 4, height: PORT_H - 4, rx: 1, fill: '#050508' }));
  for (let c = 0; c < 3; c++) {
    parent.appendChild(el('rect', { x: ax + 4 + c * 3.5, y: portTopY + PORT_H - 5, width: 2.5, height: 3, fill: '#c0c0a0', rx: 0.5 }));
  }
  const txt = el('text', { x: ax + PORT_W / 2, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string, hasModule: boolean): void {
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: SFP_W, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#444', 'stroke-width': 0.8 }));
  if (hasModule) {
    parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: SFP_W - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
    parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: SFP_W - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.6 }));
  }
  const txt = el('text', { x: ax + SFP_W / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawQSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string): void {
  const w = 44;
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: w, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#555', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: w - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
  parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: w - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.8 }));
  const txt = el('text', { x: ax + w / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawStatusBlock(parent: SVGGElement, chY: number, chH: number): void {
  const midY = chY + chH / 2;
  parent.appendChild(el('circle', { cx: 12, cy: midY - 10, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  parent.appendChild(el('circle', { cx: 12, cy: midY, r: 3, fill: '#fb8c00', opacity: 0.9 }));
  parent.appendChild(el('rect', { x: 7, y: midY + 6, width: 10, height: 6, rx: 1, fill: '#222', stroke: '#555', 'stroke-width': 0.5 }));
  parent.appendChild(el('rect', { x: 26, y: midY - 5, width: 12, height: 10, rx: 1, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.7 }));
  parent.appendChild(el('line', { x1: STATUS_END, y1: chY + 2, x2: STATUS_END, y2: chY + chH - 2, stroke: '#333', 'stroke-width': 0.8 }));
}

function drawDriveBay(parent: SVGGElement, ax: number, ay: number, w: number, h: number, active: boolean, label: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 1.5, fill: '#0d0d12', stroke: '#333', 'stroke-width': 0.7 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#151518' }));
  parent.appendChild(el('circle', { cx: ax + w - 4, cy: ay + 4, r: 1.5, fill: active ? '#00e676' : '#1a1a1a' }));
  const txt = el('text', { x: ax + w / 2, y: ay + h - 2, 'text-anchor': 'middle', 'font-size': '5', fill: '#555', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawLcdPanel(parent: SVGGElement, ax: number, ay: number, w: number, h: number, text: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 2, fill: '#050910', stroke: '#30363d', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#0a1520', opacity: 0.9 }));
  const txt = el('text', { x: ax + w / 2, y: ay + h / 2 + 3, 'text-anchor': 'middle', 'font-size': '7', fill: '#00e5ff', 'font-family': 'monospace', opacity: 0.8 });
  txt.textContent = text;
  parent.appendChild(txt);
}

function drawVentSlots(parent: SVGGElement, startX: number, chY: number, chH: number): void {
  const count = Math.floor((350 - startX - 10) / 4);
  for (let i = 0; i < count; i++) {
    parent.appendChild(el('rect', { x: startX + i * 4, y: chY + 4, width: 2, height: chH - 8, rx: 0.5, fill: '#111114' }));
  }
}

function renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('switch-panel');

  const ports      = template?.ports ?? [];
  const rj45Count  = ports.filter(p => p.type === 'rj45').length;
  const sfpCount   = ports.filter(p =>
    p.type === 'sfp' || p.type === 'sfp-plus' || p.type === 'sfp28' ||
    p.type === 'qsfp' || p.type === 'qsfp28',
  ).length;
  const model = template?.model ?? 'Rack Slicer';

  // ── JSX geometry constants (exact from rackstudio-demo) ───────────────────
  const JU   = 132;   // 1U front height in JSX space
  const RW   = 1240;  // rack width in JSX space
  const MBW  = 34;    // min blade width
  const EAR  = 26;    // ear width
  const PAD  = 22;    // panel padding
  const CON  = 250;   // console section width
  const RJW  = 30;    // RJ45 jack width
  const RJH  = 40;    // RJ45 jack height
  const RCGP = 4;     // RJ45 column gap
  const RRGP = 7;     // RJ45 row gap (between stacked pair)
  const BGAP = 15;    // gap between RJ45 blocks
  const CPB  = 4;     // columns per block
  const SFPW = 46;    // SFP cage width
  const SFPH = 42.5;  // SFP cage height
  const SFGG = 9;     // gap between SFP cages
  const SGAP = 26;    // section gap (RJ45→SFP, console→RJ45)

  // Port count → geometry
  const rjRows = rj45Count <= 8 ? 1 : 2;
  const units  = rjRows === 1 ? rj45Count : Math.ceil(rj45Count / 2);
  const blks   = units > 0 ? Math.ceil(units / CPB) : 0;
  const blkW   = CPB * RJW + (CPB - 1) * RCGP;
  let totRjW   = units > 0
    ? blks * blkW + (blks - 1) * BGAP - (blks * CPB - units) * (RJW + RCGP)
    : 0;
  totRjW = Math.max(0, totRjW);

  const sfpRowW  = sfpCount > 0 ? sfpCount * SFPW + (sfpCount - 1) * SFGG : 0;
  const chassisW = EAR * 2 + PAD * 2 + CON + SGAP + totRjW + (sfpCount > 0 ? SGAP + sfpRowW : 0);

  let bladeW = (RW - chassisW) / 2;
  let totW   = RW;
  if (bladeW < MBW) { bladeW = MBW; totW = chassisW + bladeW * 2; }

  const chassisX = bladeW;
  const consX    = bladeW + EAR + PAD;
  const rjX      = consX + CON + SGAP;
  const sfpX     = rjX + totRjW + (sfpCount > 0 ? SGAP : 0);
  const rjBlkH   = rjRows === 1 ? RJH : RJH * 2 + RRGP;
  const rjTop    = (JU - rjBlkH) / 2;
  const sfpTop   = (JU - SFPH) / 2;

  function rjPos(n: number) {
    if (rjRows === 1) {
      const c = n - 1, b = Math.floor(c / CPB), ci = c % CPB;
      return { x: rjX + b * (blkW + BGAP) + ci * (RJW + RCGP), y: rjTop, row: 0, single: true };
    }
    const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
    const b = Math.floor(col / CPB), ci = col % CPB;
    return { x: rjX + b * (blkW + BGAP) + ci * (RJW + RCGP), y: rjTop + row * (RJH + RRGP), row, single: false };
  }

  const uid = `sw${Math.random().toString(36).slice(2, 7)}_`;

  // Nested SVG: renders the JSX design in its native 1240×132 coordinate space,
  // scaled to W×H via viewBox — no geometry changes, just uniform scale.
  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${JU}`);
  ns.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── Defs ──────────────────────────────────────────────────────────────────
  const defs = el('defs');

  function lg(id: string, x1: number, y1: number, x2: number, y2: number, stops: [string, string][]) {
    const gr = el('linearGradient', { id, x1, y1, x2, y2, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => { const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s); });
    defs.appendChild(gr);
  }
  function rg(id: string, cx: number, cy: number, r: number, stops: [string, string][]) {
    const gr = el('radialGradient', { id, cx, cy, r, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => { const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s); });
    defs.appendChild(gr);
  }

  lg(`${uid}ch`, 0,0,0,1, [['0','#3a4046'],['0.06','#2c3237'],['0.5','#23282c'],['0.94','#1b1f22'],['1','#141719']]);
  lg(`${uid}bl`, 0,0,1,0, [['0','#2a3035'],['0.35','#3a4247'],['0.55','#454d53'],['0.8','#2b3136'],['1','#1a1e21']]);
  lg(`${uid}cg`, 0,0,0,1, [['0','#0c0e10'],['0.12','#2a2f34'],['0.5','#171b1e'],['0.88','#0a0c0d'],['1','#050607']]);
  lg(`${uid}lp`, 0,0,0,1, [['0','#4b5258'],['1','#20252a']]);
  lg(`${uid}rm`, 0,0,0,1, [['0','#d9d3c2'],['0.5','#b3ad9c'],['1','#7c7768']]);
  lg(`${uid}go`, 0,0,0,1, [['0','#f6d98a'],['0.5','#c9a24b'],['1','#7d6021']]);
  lg(`${uid}sb`, 0,0,0,1, [['0','#c7ced4'],['0.14','#8f979e'],['0.5','#5c646b'],['0.86','#3a4147'],['1','#24292e']]);
  rg(`${uid}ci`, 0.5, 0.35, 0.9, [['0','#111417'],['1','#000000']]);
  rg(`${uid}bo`, 0.5, 0.4,  0.75, [['0','#1a2a3a'],['0.7','#060b12'],['1','#000']]);

  // Glow filter
  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  const fBlur = el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' });
  const fMrg  = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' }));
  fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fBlur); fGlow.appendChild(fMrg);
  defs.appendChild(fGlow);

  // Ambient occlusion shadow
  const fAO = el('filter', { id: `${uid}ao`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const fDS  = el('feDropShadow', { dx: '0', dy: '1.4', stdDeviation: '1.6' });
  fDS.setAttribute('flood-color', '#000'); fDS.setAttribute('flood-opacity', '0.55');
  fAO.appendChild(fDS); defs.appendChild(fAO);

  // Inner shadow (used inside RJ45 mouth and console port)
  const fIS = el('filter', { id: `${uid}is`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const feOff  = el('feOffset',      { dx: '0', dy: '1.6' });
  const feBlr  = el('feGaussianBlur',{ stdDeviation: '1.8', result: 'o' });
  const feCmp1 = el('feComposite',   { in: 'SourceGraphic', in2: 'o', operator: 'out', result: 'inv' });
  const feCM   = el('feColorMatrix', { in: 'inv', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0', result: 'sh' });
  const feCmp2 = el('feComposite',   { in: 'sh', in2: 'SourceGraphic', operator: 'in' });
  [feOff, feBlr, feCmp1, feCM, feCmp2].forEach(f => fIS.appendChild(f));
  defs.appendChild(fIS);

  // RJ45 symbols — rjup: latch tab points down; rjdn: tab points up (for stacked pairs)
  function addRjSymbol(symId: string, tabDown: boolean) {
    const sym = el('symbol', { id: symId, viewBox: `0 0 ${RJW} ${RJH}` });
    sym.appendChild(el('rect', { x: 0.5, y: 0.5, width: RJW-1, height: RJH-1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
    sym.appendChild(el('rect', { x: 1.5, y: 1.5, width: RJW-3, height: RJH-3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
    const mg = el('g');
    mg.setAttribute('transform', `translate(${RJW / 2} ${RJH / 2 + (tabDown ? 3 : -3)})`);
    const pd = tabDown
      ? 'M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z'
      : 'M-10 11 h20 v-14 h-4 v-4 a2 2 0 0 0 -2 -2 h-4 a2 2 0 0 0 -2 2 v4 h-4 z';
    mg.appendChild(el('path', { d: pd, fill: `url(#${uid}rm)`, stroke: '#3a352a', 'stroke-width': 0.8, filter: `url(#${uid}is)` }));
    mg.appendChild(el('rect', { x: -8, y: tabDown ? -9 : 0, width: 16, height: 9, rx: 1, fill: '#4a4638', opacity: 0.55 }));
    for (let i = 0; i < 8; i++) {
      mg.appendChild(el('rect', { x: -7.4 + i * 1.85, y: tabDown ? -9 : 2.5, width: 1.1, height: 6.5, fill: `url(#${uid}go)`, rx: 0.3 }));
    }
    sym.appendChild(mg); defs.appendChild(sym);
  }
  addRjSymbol(`${uid}rjup`, true);
  addRjSymbol(`${uid}rjdn`, false);

  // SFP empty cage symbol
  const sfpC = el('symbol', { id: `${uid}sfpc`, viewBox: `0 0 ${SFPW} ${SFPH}` });
  sfpC.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFPW-1, height: SFPH-1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpC.appendChild(el('rect', { x: 1.5, y: 1.5, width: SFPW-3, height: SFPH-3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
  sfpC.appendChild(el('rect', { x: 5, y: 11, width: SFPW-10, height: SFPH-18, rx: 1.5, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  for (let i = 0; i < 7; i++) { const gw = (SFPW-15)/7; sfpC.appendChild(el('rect', { x: 7.5+i*gw, y: 13, width: gw-1.3, height: SFPH-24, fill: `url(#${uid}go)`, rx: 0.4, opacity: 0.9 })); }
  sfpC.appendChild(el('rect', { x: SFPW/2-5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpC.appendChild(el('rect', { x: 3, y: 2.6, width: SFPW-6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpC);

  // SFP fiber transceiver symbol
  const sfpF = el('symbol', { id: `${uid}sfpf`, viewBox: `0 0 ${SFPW} ${SFPH}` });
  sfpF.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFPW-1, height: SFPH-1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpF.appendChild(el('rect', { x: 3.5, y: 4, width: SFPW-7, height: SFPH-8, rx: 2, fill: `url(#${uid}sb)`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpF.appendChild(el('rect', { x: 5, y: 5.4, width: SFPW-10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.55 }));
  sfpF.appendChild(el('rect', { x: 5, y: 4.2, width: SFPW-10, height: 3.4, rx: 1.4, fill: '#ffb020', opacity: 0.92 }));
  sfpF.appendChild(el('rect', { x: SFPW/2-9, y: SFPH/2-3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  sfpF.appendChild(el('circle', { cx: SFPW/2-5, cy: SFPH/2+1, r: 2.6, fill: `url(#${uid}bo)` }));
  sfpF.appendChild(el('rect', { x: SFPW/2+1, y: SFPH/2-3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  sfpF.appendChild(el('circle', { cx: SFPW/2+5, cy: SFPH/2+1, r: 2.6, fill: `url(#${uid}bo)` }));
  sfpF.appendChild(el('rect', { x: 5, y: SFPH-8.5, width: SFPW-10, height: 3, rx: 0.6, fill: '#c9ccce', opacity: 0.85 }));
  defs.appendChild(sfpF);

  ns.appendChild(defs);

  // ── LED helper (exact JSX Led component) ──────────────────────────────────
  function drawLed(parent: SVGElement, cx: number, cy: number, color: string, on: boolean, r = 1.6): void {
    const lg2 = el('g');
    lg2.appendChild(el('circle', { cx, cy, r: r + 0.7, fill: '#04060a', stroke: '#2a3036', 'stroke-width': 0.4 }));
    const dot = el('circle', { cx, cy, r, fill: color, opacity: on ? 1 : 0.35 });
    if (on) dot.setAttribute('filter', `url(#${uid}gw)`);
    lg2.appendChild(dot);
    if (on) lg2.appendChild(el('circle', { cx: cx - 0.4, cy: cy - 0.4, r: r * 0.35, fill: '#fff', opacity: 0.85 }));
    parent.appendChild(lg2);
  }

  // ── Chassis body ──────────────────────────────────────────────────────────
  const chGrp = el('g'); chGrp.setAttribute('filter', `url(#${uid}ao)`);
  chGrp.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: JU-2, rx: 4, fill: `url(#${uid}ch)`, stroke: '#0c0f11', 'stroke-width': 1.2 }));
  chGrp.appendChild(el('rect', { x: chassisX+2, y: 2.5, width: chassisW-4, height: 2, rx: 1, fill: '#454b51', opacity: 0.55 }));
  ns.appendChild(chGrp);

  // ── Rack-mount blades ─────────────────────────────────────────────────────
  [0, 1].forEach(side => {
    const isL    = side === 0;
    const bX     = isL ? 0 : totW - bladeW;
    const holeCx = isL ? Math.min(16, bladeW / 2) : bX + bladeW - Math.min(16, bladeW / 2);
    const bendX  = isL ? bladeW - 2.5 : bX;
    const bg = el('g'); bg.setAttribute('filter', `url(#${uid}ao)`);
    bg.appendChild(el('rect', { x: bX, y: 0, width: bladeW, height: JU, rx: 2.5, fill: `url(#${uid}bl)`, stroke: '#0c0f11', 'stroke-width': 1 }));
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: JU-8, fill: '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isL ? bladeW-1 : bX+bladeW-1.4, y: 4, width: 1.2, height: JU-8, fill: '#05070a', opacity: 0.7 }));
    [0.34, 0.66].forEach(f => {
      bg.appendChild(el('rect', { x: holeCx-4.5, y: JU*f-8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      bg.appendChild(el('rect', { x: holeCx-4.5, y: JU*f-8, width: 9, height: 16, rx: 4.5, fill: 'none', stroke: '#02040a', 'stroke-width': 0.6, opacity: 0.85 }));
      bg.appendChild(el('path', { d: `M ${holeCx-3} ${JU*f-6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 }));
    });
    ns.appendChild(bg);
  });

  // ── Console section (exact JSX Console component) ─────────────────────────
  const cy = JU / 2;
  const con = el('g'); con.setAttribute('transform', `translate(${consX} 0)`);

  [['PWR','#39ff8a',true],['SYS','#39ff8a',true],['ALM','#20262b',false],['LOC','#37b6ff',true]].forEach(([lbl, color, on], i) => {
    const ly = 20 + i * 22;
    drawLed(con, 10, ly, color as string, on as boolean);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: '#aeb6bd', 'letter-spacing': 0.6 });
    t.textContent = lbl as string; con.appendChild(t);
  });

  const tw = el('text', { x: 62, y: cy-12, 'font-size': 17, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 1.5 });
  tw.textContent = 'RACK SLICER'; con.appendChild(tw);
  const tm = el('text', { x: 62, y: cy+5, 'font-size': 9, fill: '#8b939a', 'letter-spacing': 1.2 });
  tm.textContent = model; con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy+12, width: 112, height: 1, fill: '#3a4147' }));
  const tp = el('text', { x: 62, y: cy+25, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  tp.textContent = `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  con.appendChild(tp);

  // USB-C
  const ug = el('g'); ug.setAttribute('transform', `translate(${CON - 110} ${cy + 6})`);
  ug.appendChild(el('rect', { x: 0, y: 0, width: 24, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  ug.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
  const tu = el('text', { x: 12, y: 18, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tu.textContent = 'USB-C'; ug.appendChild(tu); con.appendChild(ug);

  // Console RJ45
  const rjCon = el('g'); rjCon.setAttribute('transform', `translate(${CON - 72} ${cy + 4})`);
  rjCon.appendChild(el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 1.6, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 0.9 }));
  rjCon.appendChild(el('rect', { x: 2, y: 2, width: 22, height: 14, rx: 1, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  rjCon.appendChild(el('path', { d: 'M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z', fill: '#04060a' }));
  for (let i = 0; i < 8; i++) rjCon.appendChild(el('rect', { x: 4 + i * 2.3, y: 4.5, width: 1.3, height: 4, fill: '#c9a24b', opacity: 0.8 }));
  const tc = el('text', { x: 13, y: 26, 'font-size': 6.5, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tc.textContent = 'CONSOLE'; rjCon.appendChild(tc); con.appendChild(rjCon);

  // RST button
  const rstG = el('g'); rstG.setAttribute('transform', `translate(${CON - 22} ${cy + 11})`);
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
  const tr = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tr.textContent = 'RST'; rstG.appendChild(tr); con.appendChild(rstG);

  ns.appendChild(con);

  // ── RJ45 copper ports ─────────────────────────────────────────────────────
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const connected = (n % 3) !== 0;
    const symId = (single || row === 0) ? `${uid}rjup` : `${uid}rjdn`;
    const ledY  = single ? 5 : row === 0 ? 5 : RJH - 5;
    const pg = el('g'); pg.setAttribute('transform', `translate(${x} ${y})`);
    const u = el('use'); u.setAttribute('href', `#${symId}`); u.setAttribute('width', String(RJW)); u.setAttribute('height', String(RJH));
    pg.appendChild(u);
    drawLed(pg, 6,        ledY, connected ? '#39ff8a' : '#20262b', connected, 1.4);
    drawLed(pg, RJW - 6,  ledY, '#20262b', false, 1.4);
    ns.appendChild(pg);
  }

  // Port number labels (stacked pairs: odd above chassis, even below; single row: all below)
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const labelY = single ? y + RJH + 11 : row === 0 ? y - 4 : y + RJH + 11;
    const t = el('text', { x: x + RJW / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: '#aeb6bd' });
    t.textContent = String(n); ns.appendChild(t);
  }

  // ── SFP uplink cages ──────────────────────────────────────────────────────
  if (sfpCount > 0) {
    ns.appendChild(el('line', { x1: sfpX - SGAP/2, y1: 20, x2: sfpX - SGAP/2, y2: JU-20, stroke: '#3a4147', 'stroke-width': 1, opacity: 0.5 }));
    const ts = el('text', { x: sfpX, y: sfpTop - 9, 'font-size': 8, fill: '#7b838a', 'letter-spacing': 1.4 });
    ts.textContent = 'SFP UPLINK'; ns.appendChild(ts);
    for (let n = 1; n <= sfpCount; n++) {
      const sx      = sfpX + (n - 1) * (SFPW + SFGG);
      const isFiber = n % 2 === 0;
      const sg = el('g'); sg.setAttribute('transform', `translate(${sx} ${sfpTop})`);
      const u = el('use'); u.setAttribute('href', `#${isFiber ? `${uid}sfpf` : `${uid}sfpc`}`); u.setAttribute('width', String(SFPW)); u.setAttribute('height', String(SFPH));
      sg.appendChild(u);
      drawLed(sg, 6.5,        SFPH - 3.2, '#39ff8a', isFiber);
      drawLed(sg, SFPW - 6.5, SFPH - 3.2, '#20262b', false);
      const tl = el('text', { x: SFPW / 2, y: -5.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: '#aeb6bd' });
      tl.textContent = String(rj45Count + n); sg.appendChild(tl); ns.appendChild(sg);
    }
  }

  group.appendChild(ns);
  return group;
}

function renderServerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('server-panel');
  const defs = el('defs');
  const gradId = `sv-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  const honeycombId = `hc-${Math.random().toString(36).slice(2)}`;
  const pat = el('pattern', { id: honeycombId, width: 6, height: 10, patternUnits: 'userSpaceOnUse' });
  const path = el('path', { d: 'M 3 0 L 6 2 L 6 8 L 3 10 L 0 8 L 0 2 Z', fill: 'none', stroke: '#111115', 'stroke-width': 1 });
  pat.appendChild(path);
  defs.appendChild(pat);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1.5, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));

  const bayW = 32, bayH = Math.min(22, chH - 8);
  const bayCount = template?.id.includes('4u') ? 8 : template?.id.includes('hd') ? 6 : 4;
  const bayStartX = 12;
  for (let b = 0; b < bayCount; b++) {
    drawDriveBay(group, bayStartX + b * (bayW + 3), chY + 4, bayW, bayH, b < 2, String(b + 1));
  }

  const grillX = bayStartX + bayCount * (bayW + 3) + 6;
  const grillW = W - grillX - 90;
  if (grillW > 20) {
    group.appendChild(el('rect', { x: grillX, y: chY + 4, width: grillW, height: chH - 8, fill: `url(#${honeycombId})`, opacity: 0.5 }));
  }

  const lcdX = grillX + grillW + 4;
  drawLcdPanel(group, lcdX, chY + 4, 40, Math.min(chH - 8, 16), 'READY');

  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 - 6, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 + 4, r: 2, fill: '#fb8c00', opacity: 0.8 }));

  return group;
}

function renderFirewallPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('firewall-panel');
  const defs = el('defs');
  const gradId = `fw-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);

  const ports = template?.ports ?? [];
  const sfpPorts = ports.filter(p => p.type === 'sfp-plus');
  const rj45Ports = ports.filter(p => p.type === 'rj45');
  const allDataPorts = [...rj45Ports, ...sfpPorts];

  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  const ZONE_COLORS = ['#e53935', '#fb8c00', '#43a047'] as const;
  allDataPorts.forEach((p, i) => {
    const ax = STATUS_END + 6 + i * PORT_PITCH;
    if (p.type === 'sfp-plus') {
      drawSFPCage(group, ax, chY, chH, `${i + 1}`, true);
    } else {
      drawRJ45(group, ax, portTopY, `${i + 1}`, false);
    }
    const zoneIdx = i === 0 ? 0 : i <= 2 ? 1 : 2;
    const zoneTxt = el('text', { x: ax + PORT_W / 2, y: chY + 5, 'text-anchor': 'middle', 'font-size': '5', fill: ZONE_COLORS[zoneIdx], 'font-family': 'monospace' });
    zoneTxt.textContent = i === 0 ? 'WAN' : i <= 2 ? 'DMZ' : 'LAN';
    group.appendChild(zoneTxt);
  });

  drawVentSlots(group, STATUS_END + 6 + allDataPorts.length * PORT_PITCH + 8, chY, chH);

  return group;
}

function renderRouterPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('router-panel');
  const defs = el('defs');
  const gradId = `rtr-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 50, chH - 8, 'READY');

  const ports = template?.ports ?? [];
  const qsfp = ports.filter(p => p.type === 'qsfp28');
  const sfp = ports.filter(p => p.type === 'sfp-plus');
  let portX = STATUS_END + 64;
  qsfp.forEach((_, i) => { drawQSFPCage(group, portX + i * 52, chY, chH, `Q${i + 1}`); });
  portX += qsfp.length * 52 + (qsfp.length ? 8 : 0);
  sfp.forEach((_, i) => { drawSFPCage(group, portX + i * SFP_PITCH, chY, chH, `SFP${i + 1}`, true); });

  return group;
}

function renderPatchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('patch-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#1a1224', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const isFiber = ports.some(p => p.type === 'sfp' || p.type === 'sfp-plus');
  const portCount = ports.length || 24;
  const pitch = Math.min(14, (W - 20) / portCount);
  const portTopY = chY + Math.round((chH - (isFiber ? 8 : PORT_H)) / 2);

  for (let i = 0; i < portCount; i++) {
    const ax = 10 + i * pitch;
    if (isFiber) {
      group.appendChild(el('circle', { cx: ax + 3, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
      group.appendChild(el('circle', { cx: ax + 9, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
    } else {
      drawRJ45(group, ax, portTopY, String(i + 1), false);
    }
  }

  group.appendChild(el('rect', { x: 5, y: chY + chH - 6, width: W - 10, height: 4, rx: 1, fill: '#111', stroke: '#333', 'stroke-width': 0.5 }));

  return group;
}

function renderPduPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('pdu-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1a1e', stroke: '#111', 'stroke-width': 1 }));

  drawLcdPanel(group, 8, chY + 4, 50, chH - 8, '0.0 A');
  group.appendChild(el('circle', { cx: 67, cy: chY + chH / 2, r: 6, fill: '#c62828', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20;
  const outletH = chH - 10;
  const outletY = chY + 5;
  const startX = 85;

  c13Ports.forEach((_, i) => {
    const ax = startX + i * (outletW + 4);
    group.appendChild(el('rect', { x: ax, y: outletY, width: outletW, height: outletH, rx: 2, fill: '#0a0a0f', stroke: '#333', 'stroke-width': 0.7 }));
    const contactY = outletY + outletH - 8;
    [ax + 4, ax + 8.5, ax + 13].forEach(cx => {
      group.appendChild(el('rect', { x: cx, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
    });
    const numTxt = el('text', { x: ax + outletW / 2, y: outletY + outletH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#666', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  group.appendChild(el('rect', { x: W - 30, y: chY + 4, width: 22, height: chH - 8, rx: 2, fill: '#0a0a0f', stroke: '#555', 'stroke-width': 0.8 }));

  return group;
}

function renderUpsPanel(_template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('ups-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1c29', stroke: '#111', 'stroke-width': 1 }));

  drawLcdPanel(group, 10, chY + 4, 120, chH - 8, 'ON BATTERY');

  for (let s = 0; s < 5; s++) {
    const segColor = s < 3 ? '#43a047' : s === 3 ? '#fb8c00' : '#e53935';
    group.appendChild(el('rect', { x: 140 + s * 20, y: chY + chH / 2 - 5, width: 16, height: 10, rx: 1, fill: s < 4 ? segColor : '#111', stroke: '#333', 'stroke-width': 0.5 }));
  }

  ['IN', 'OUT', 'BAT'].forEach((lbl, i) => {
    group.appendChild(el('circle', { cx: 250 + i * 20, cy: chY + chH / 2 - 4, r: 3, fill: i === 0 ? '#00e676' : '#fb8c00' }));
    const t = el('text', { x: 250 + i * 20, y: chY + chH / 2 + 8, 'text-anchor': 'middle', 'font-size': '5', fill: '#666', 'font-family': 'monospace' });
    t.textContent = lbl;
    group.appendChild(t);
  });

  drawVentSlots(group, 320, chY, chH);

  return group;
}

function renderStoragePanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('storage-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141922', stroke: '#111', 'stroke-width': 1 }));

  const bayCount = template?.id.includes('24bay') || template?.id.includes('aff') ? 24 : template?.id.includes('12bay') ? 12 : 8;
  const cols = bayCount > 12 ? 6 : bayCount > 6 ? 6 : 4;
  const rows = Math.ceil(bayCount / cols);
  const bayW = 38, bayH = Math.min((chH - 8) / rows - 2, 20);
  const bayStartX = 10;

  for (let b = 0; b < bayCount; b++) {
    const bx = bayStartX + (b % cols) * (bayW + 3);
    const by = chY + 4 + Math.floor(b / cols) * (bayH + 3);
    drawDriveBay(group, bx, by, bayW, bayH, b < 4, String(b + 1));
  }

  const portX = bayStartX + cols * (bayW + 3) + 8;
  drawLcdPanel(group, portX, chY + 4, 50, chH - 8, 'ONLINE');

  return group;
}

function renderKvmPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('kvm-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1e1a1a', stroke: '#111', 'stroke-width': 1 }));

  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 40, chH - 8, 'KVM');

  const ports = template?.ports ?? [];
  const consolePorts = ports.filter(p => p.type === 'console');
  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  consolePorts.forEach((_, i) => {
    const ax = STATUS_END + 54 + i * PORT_PITCH;
    group.appendChild(el('rect', { x: ax, y: portTopY, width: 20, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
    for (let p = 0; p < 9; p++) {
      const row = p < 5 ? 0 : 1;
      const col = p < 5 ? p : p - 5;
      const offset = p >= 5 ? 1.5 : 0;
      group.appendChild(el('circle', { cx: ax + 2 + col * 3.5 + offset, cy: portTopY + 4 + row * 5, r: 0.8, fill: '#c0c0a0' }));
    }
    const numTxt = el('text', { x: ax + 10, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  return group;
}

function renderBlankPanel(W: number, H: number): SVGGElement {
  const group = g('blank-panel');
  const defs = el('defs');
  const gradId = `bp-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);
  group.appendChild(el('rect', { x: 0, y: 2, width: W, height: H - 4, rx: 1, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]].forEach(([cx, cy]) => {
    group.appendChild(el('circle', { cx, cy, r: 3, fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
  });
  return group;
}

function renderCoolingPanel(_template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cooling-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141618', stroke: '#111', 'stroke-width': 1 }));

  if (chH <= 32) {
    const slotCount = Math.floor((W - 20) / 8);
    for (let i = 0; i < slotCount; i++) {
      group.appendChild(el('rect', { x: 10 + i * 8, y: chY + 3, width: 6, height: chH - 6, rx: 0.5, fill: '#0a0a0c', stroke: '#222', 'stroke-width': 0.4 }));
    }
  } else {
    const fanCount = 4;
    const fanR = Math.min(chH / 2 - 8, 18);
    for (let f = 0; f < fanCount; f++) {
      const cx = 40 + f * (W - 80) / (fanCount - 1);
      const cy = chY + chH / 2;
      group.appendChild(el('circle', { cx, cy, r: fanR, fill: '#0a0a0c', stroke: '#333', 'stroke-width': 1 }));
      group.appendChild(el('circle', { cx, cy, r: fanR * 0.3, fill: '#1a1a1e' }));
      for (let a = 0; a < 6; a++) {
        const rad = (a * 60 * Math.PI) / 180;
        const line = el('line', {
          x1: cx + Math.cos(rad) * fanR * 0.35, y1: cy + Math.sin(rad) * fanR * 0.35,
          x2: cx + Math.cos(rad) * fanR * 0.95, y2: cy + Math.sin(rad) * fanR * 0.95,
          stroke: '#2a2a2f', 'stroke-width': 2.5, 'stroke-linecap': 'round',
        });
        group.appendChild(line);
      }
    }
  }

  return group;
}

function renderCableManagerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cable-mgr-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#151518', stroke: '#111', 'stroke-width': 1 }));

  if (template?.id === 'brush-panel-1u') {
    group.appendChild(el('rect', { x: 20, y: chY + 4, width: W - 40, height: chH - 8, rx: 2, fill: '#050508', stroke: '#30363d', 'stroke-width': 1 }));
    const fiberCount = 50;
    const fiberSpacing = (W - 40) / fiberCount;
    for (let i = 1; i < fiberCount; i++) {
      const fx = 20 + i * fiberSpacing;
      group.appendChild(el('line', { x1: fx, y1: chY + 4, x2: fx, y2: chY + chH - 4, stroke: '#1a1a20', 'stroke-width': 1, opacity: 0.6 }));
    }
  } else if (template?.id === 'd-ring-1u') {
    group.appendChild(el('line', { x1: 15, y1: chY + chH / 2, x2: W - 15, y2: chY + chH / 2, stroke: '#30363d', 'stroke-width': 1.5 }));
    const ringCount = 5;
    const spacing = (W - 80) / (ringCount - 1);
    for (let i = 0; i < ringCount; i++) {
      const rx = 40 + i * spacing;
      const ry = chY + chH / 2;
      const p = el('path', { d: `M ${rx - 10} ${ry - 4} L ${rx + 10} ${ry - 4} C ${rx + 12} ${ry - 4}, ${rx + 12} ${ry + 12}, ${rx + 10} ${ry + 12} L ${rx - 10} ${ry + 12} C ${rx - 12} ${ry + 12}, ${rx - 12} ${ry - 4}, ${rx - 10} ${ry - 4} Z`, fill: 'none', stroke: '#8b949e', 'stroke-width': 2 });
      group.appendChild(p);
    }
  } else {
    const slitCount = 10;
    const slitSpacing = (W - 40) / slitCount;
    for (let i = 0; i < slitCount; i++) {
      const sx = 20 + i * slitSpacing;
      group.appendChild(el('rect', { x: sx + 3, y: chY + 6, width: slitSpacing - 6, height: chH - 12, rx: 2, fill: '#050508', stroke: '#21262d', 'stroke-width': 0.8 }));
    }
  }

  return group;
}

export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement {
  switch (category) {
    case 'switch':        return renderSwitchPanel(template, deviceWidth, deviceHeight);
    case 'server':        return renderServerPanel(template, deviceWidth, deviceHeight);
    case 'firewall':      return renderFirewallPanel(template, deviceWidth, deviceHeight);
    case 'router':        return renderRouterPanel(template, deviceWidth, deviceHeight);
    case 'patch-panel':   return renderPatchPanel(template, deviceWidth, deviceHeight);
    case 'pdu':           return renderPduPanel(template, deviceWidth, deviceHeight);
    case 'ups':           return renderUpsPanel(template, deviceWidth, deviceHeight);
    case 'storage':       return renderStoragePanel(template, deviceWidth, deviceHeight);
    case 'console':       return renderKvmPanel(template, deviceWidth, deviceHeight);
    case 'blank-panel':   return renderBlankPanel(deviceWidth, deviceHeight);
    case 'cooling':       return renderCoolingPanel(template, deviceWidth, deviceHeight);
    case 'cable-manager': return renderCableManagerPanel(template, deviceWidth, deviceHeight);
    default: {
      const fallback = g('fallback-panel');
      fallback.appendChild(el('rect', { x: 0, y: 2, width: deviceWidth, height: deviceHeight - 4, rx: 1, fill: '#1b1b22', stroke: '#111', 'stroke-width': 1 }));
      return fallback;
    }
  }
}
