// src/renderers/rack-kit.ts

export const U1 = 132;           // 1U SVG height in JSX coordinate space
export const RACK_W = 1240;      // 19" rack width in JSX space
export const MIN_BLADE_W = 34;
export const EAR_W = 26;
export const PANEL_PAD = 22;

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function g(cls = ''): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (cls) group.setAttribute('class', cls);
  return group;
}

/** Compute chassis/blade widths so every device sizes to the same 19" span. */
export function fitToRack(contentW: number): {
  chassisW: number; bladeW: number; totalW: number; chassisX: number; contentX: number;
} {
  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + contentW;
  let bladeW = (RACK_W - chassisW) / 2;
  if (bladeW < MIN_BLADE_W) bladeW = MIN_BLADE_W;
  const totalW = chassisW + bladeW * 2;
  return { chassisW, bladeW, totalW, chassisX: bladeW, contentX: bladeW + EAR_W + PANEL_PAD };
}

/**
 * Appends a <defs> block with all shared dark-chassis gradients and filters.
 * Returns the defs element so callers can append device-specific symbols.
 * All IDs are namespaced with `uid` to avoid conflicts on multi-device canvases.
 */
export function makeRackDefs(ns: SVGSVGElement, uid: string): SVGDefsElement {
  const defs = el('defs');

  function lg(id: string, x1: number, y1: number, x2: number, y2: number, stops: [string, string][]) {
    const gr = el('linearGradient', { id, x1, y1, x2, y2, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => {
      const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s);
    });
    defs.appendChild(gr);
  }
  function rg(id: string, cx: number, cy: number, r: number, stops: [string, string][]) {
    const gr = el('radialGradient', { id, cx, cy, r, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => {
      const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s);
    });
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

  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  const fBlur = el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' });
  const fMrg  = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' }));
  fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fBlur); fGlow.appendChild(fMrg);
  defs.appendChild(fGlow);

  const fAO = el('filter', { id: `${uid}ao`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const fDS  = el('feDropShadow', { dx: '0', dy: '1.4', stdDeviation: '1.6' });
  fDS.setAttribute('flood-color', '#000'); fDS.setAttribute('flood-opacity', '0.55');
  fAO.appendChild(fDS); defs.appendChild(fAO);

  const fIS = el('filter', { id: `${uid}is`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const feOff  = el('feOffset',       { dx: '0', dy: '1.6' });
  const feBlr  = el('feGaussianBlur', { stdDeviation: '1.8', result: 'o' });
  const feCmp1 = el('feComposite',    { in: 'SourceGraphic', in2: 'o', operator: 'out', result: 'inv' });
  const feCM   = el('feColorMatrix',  { in: 'inv', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0', result: 'sh' });
  const feCmp2 = el('feComposite',    { in: 'sh', in2: 'SourceGraphic', operator: 'in' });
  [feOff, feBlr, feCmp1, feCM, feCmp2].forEach(f => fIS.appendChild(f));
  defs.appendChild(fIS);

  ns.appendChild(defs);
  return defs;
}

/** Dark chassis body rect + top highlight strip. */
export function drawChassis(ns: SVGSVGElement, uid: string, chassisX: number, chassisW: number): void {
  const chGrp = el('g');
  chGrp.setAttribute('filter', `url(#${uid}ao)`);
  chGrp.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: `url(#${uid}ch)`, stroke: '#0c0f11', 'stroke-width': 1.2 }));
  chGrp.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: '#454b51', opacity: 0.55 }));
  ns.appendChild(chGrp);
}

/** Left + right rack-mount blades with fold-line, screw holes, and specular highlights. */
export function drawBlades(ns: SVGSVGElement, uid: string, totW: number, bladeW: number): void {
  [0, 1].forEach(side => {
    const isL    = side === 0;
    const bX     = isL ? 0 : totW - bladeW;
    const holeCx = isL ? Math.min(16, bladeW / 2) : bX + bladeW - Math.min(16, bladeW / 2);
    const bendX  = isL ? bladeW - 2.5 : bX;
    const bg = el('g');
    bg.setAttribute('filter', `url(#${uid}ao)`);
    bg.appendChild(el('rect', { x: bX, y: 0, width: bladeW, height: U1, rx: 2.5, fill: `url(#${uid}bl)`, stroke: '#0c0f11', 'stroke-width': 1 }));
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: U1 - 8, fill: '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isL ? bladeW - 1 : bX + bladeW - 1.4, y: 4, width: 1.2, height: U1 - 8, fill: '#05070a', opacity: 0.7 }));
    [0.34, 0.66].forEach(f => {
      bg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      bg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: 'none', stroke: '#02040a', 'stroke-width': 0.6, opacity: 0.85 }));
      bg.appendChild(el('path', { d: `M ${holeCx - 3} ${U1 * f - 6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 }));
    });
    ns.appendChild(bg);
  });
}

/** Dark housing ring + coloured dot with optional glow; `uid` namespaces the glow filter. */
export function drawLed(parent: SVGElement, uid: string, cx: number, cy: number, color: string, on: boolean, r = 1.6): void {
  const grp = el('g');
  grp.appendChild(el('circle', { cx, cy, r: r + 0.7, fill: '#04060a', stroke: '#2a3036', 'stroke-width': 0.4 }));
  const dot = el('circle', { cx, cy, r, fill: color, opacity: on ? 1 : 0.35 });
  if (on) dot.setAttribute('filter', `url(#${uid}gw)`);
  grp.appendChild(dot);
  if (on) grp.appendChild(el('circle', { cx: cx - 0.4, cy: cy - 0.4, r: r * 0.35, fill: '#fff', opacity: 0.85 }));
  parent.appendChild(grp);
}

// ─── Photoreal RJ45 / SFP connector kit ──────────────────────────────────────
// Extracted from switch-renderer.ts so every device category (router, firewall,
// KVM/console, patch-panel, ...) can draw the same gold-pin, cage-lipped,
// inner-shadowed jack graphics instead of a flat placeholder rect.

const SFP_SYM_W = 46, SFP_SYM_H = 42.5;

/**
 * Builds a <defs> block (gradients, filters, SFP <symbol>s) namespaced
 * with `uid`, and appends it to `parent`. Call once per device panel, then draw
 * ports with drawSfpPort() reusing the same `uid`.
 */
export function makeConnectorDefs(parent: SVGElement, uid: string): SVGDefsElement {
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

  lg(`${uid}cg`, 0, 0, 0, 1, [['0', '#0c0e10'], ['0.12', '#2a2f34'], ['0.5', '#171b1e'], ['0.88', '#0a0c0d'], ['1', '#050607']]);
  lg(`${uid}lp`, 0, 0, 0, 1, [['0', '#4b5258'], ['1', '#20252a']]);
  lg(`${uid}go`, 0, 0, 0, 1, [['0', '#f6d98a'], ['0.5', '#c9a24b'], ['1', '#7d6021']]);
  lg(`${uid}sb`, 0, 0, 0, 1, [['0', '#c7ced4'], ['0.14', '#8f979e'], ['0.5', '#5c646b'], ['0.86', '#3a4147'], ['1', '#24292e']]);
  lg(`${uid}sboot`, 0, 0, 0, 1, [['0', '#2c333a'], ['0.5', '#171c21'], ['1', '#0c0f12']]);
  rg(`${uid}ci`, 0.5, 0.35, 0.9, [['0', '#111417'], ['1', '#000000']]);
  rg(`${uid}bo`, 0.5, 0.4, 0.75, [['0', '#1a2a3a'], ['0.7', '#060b12'], ['1', '#000']]);

  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  fGlow.appendChild(el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' }));
  const fMrg = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' }));
  fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fMrg);
  defs.appendChild(fGlow);

  const fIS = el('filter', { id: `${uid}is`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const feOff = el('feOffset', { dx: '0', dy: '1.6' });
  const feBlr = el('feGaussianBlur', { stdDeviation: '1.8', result: 'o' });
  const feCmp1 = el('feComposite', { in: 'SourceGraphic', in2: 'o', operator: 'out', result: 'inv' });
  const feCM = el('feColorMatrix', { in: 'inv', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0', result: 'sh' });
  const feCmp2 = el('feComposite', { in: 'sh', in2: 'SourceGraphic', operator: 'in' });
  [feOff, feBlr, feCmp1, feCM, feCmp2].forEach(f => fIS.appendChild(f));
  defs.appendChild(fIS);

  const fSh = el('filter', { id: `${uid}sfpsh`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const fShDS = el('feDropShadow', { dx: '0', dy: '0.8', stdDeviation: '0.9' });
  fShDS.setAttribute('flood-color', '#000'); fShDS.setAttribute('flood-opacity', '0.6');
  fSh.appendChild(fShDS); defs.appendChild(fSh);

  // ── SFP symbols (empty cage / fiber module / DAC module) ─────────────────
  const sfpCageSym = el('symbol', { id: `${uid}sfpCage`, viewBox: `0 0 ${SFP_SYM_W} ${SFP_SYM_H}` });
  sfpCageSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_SYM_W - 1, height: SFP_SYM_H - 1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpCageSym.appendChild(el('rect', { x: 1.5, y: 1.5, width: SFP_SYM_W - 3, height: SFP_SYM_H - 3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
  const cageIR = el('rect', { x: 5, y: 11, width: SFP_SYM_W - 10, height: SFP_SYM_H - 18, rx: 1.5, fill: `url(#${uid}ci)` });
  cageIR.setAttribute('filter', `url(#${uid}is)`);
  sfpCageSym.appendChild(cageIR);
  const cgG = el('g', { opacity: '0.9' });
  for (let i = 0; i < 7; i++) { const gw = (SFP_SYM_W - 15) / 7; cgG.appendChild(el('rect', { x: 7.5 + i * gw, y: 13, width: gw - 1.3, height: SFP_SYM_H - 24, fill: `url(#${uid}go)`, rx: 0.4 })); }
  sfpCageSym.appendChild(cgG);
  sfpCageSym.appendChild(el('rect', { x: SFP_SYM_W / 2 - 5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpCageSym.appendChild(el('rect', { x: 3, y: 2.6, width: SFP_SYM_W - 6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpCageSym);

  const sfpFiberSym = el('symbol', { id: `${uid}sfpFiber`, viewBox: `0 0 ${SFP_SYM_W} ${SFP_SYM_H}` });
  const sfpFG = el('g', {}); sfpFG.setAttribute('filter', `url(#${uid}sfpsh)`);
  sfpFG.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_SYM_W - 1, height: SFP_SYM_H - 1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpFG.appendChild(el('rect', { x: 3.5, y: 4, width: SFP_SYM_W - 7, height: SFP_SYM_H - 8, rx: 2, fill: `url(#${uid}sb)`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 5.4, width: SFP_SYM_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.55 }));
  sfpFG.appendChild(el('rect', { x: 5, y: 4.2, width: SFP_SYM_W - 10, height: 3.4, rx: 1.4, fill: '#39ff8a', opacity: 0.92 }));
  const fpG = el('g');
  fpG.appendChild(el('rect', { x: SFP_SYM_W / 2 - 9, y: SFP_SYM_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: SFP_SYM_W / 2 - 5, cy: SFP_SYM_H / 2 + 1, r: 2.6, fill: `url(#${uid}bo)` }));
  fpG.appendChild(el('rect', { x: SFP_SYM_W / 2 + 1, y: SFP_SYM_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  fpG.appendChild(el('circle', { cx: SFP_SYM_W / 2 + 5, cy: SFP_SYM_H / 2 + 1, r: 2.6, fill: `url(#${uid}bo)` }));
  sfpFG.appendChild(fpG);
  sfpFG.appendChild(el('rect', { x: 5, y: SFP_SYM_H - 8.5, width: SFP_SYM_W - 10, height: 3, rx: 0.6, fill: '#c9ccce', opacity: 0.85 }));
  sfpFiberSym.appendChild(sfpFG);
  defs.appendChild(sfpFiberSym);

  const sfpDacSym = el('symbol', { id: `${uid}sfpDac`, viewBox: `0 0 ${SFP_SYM_W} ${SFP_SYM_H}` });
  const sfpDG = el('g', {}); sfpDG.setAttribute('filter', `url(#${uid}sfpsh)`);
  sfpDG.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_SYM_W - 1, height: SFP_SYM_H - 1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpDG.appendChild(el('rect', { x: 3.5, y: 4, width: SFP_SYM_W - 7, height: SFP_SYM_H - 8, rx: 2, fill: `url(#${uid}sb)`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpDG.appendChild(el('rect', { x: 5, y: 5.4, width: SFP_SYM_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.5 }));
  sfpDG.appendChild(el('rect', { x: SFP_SYM_W / 2 - 6, y: SFP_SYM_H / 2 - 4, width: 12, height: 12, rx: 2.4, fill: `url(#${uid}sboot)`, stroke: '#05070a', 'stroke-width': 0.6 }));
  for (let i = 0; i < 3; i++) sfpDG.appendChild(el('rect', { x: SFP_SYM_W / 2 - 5, y: SFP_SYM_H / 2 - 2.4 + i * 3, width: 10, height: 1, rx: 0.5, fill: '#000', opacity: 0.35 }));
  sfpDacSym.appendChild(sfpDG);
  defs.appendChild(sfpDacSym);

  parent.appendChild(defs);
  return defs;
}

/** Draws one photoreal SFP cage (empty, or with a fiber/DAC module seated) + link/activity LEDs. */
export function drawSfpPort(
  parent: SVGElement, uid: string, x: number, y: number,
  opts: { w?: number; h?: number; kind?: 'cage' | 'fiber' | 'dac'; connected?: boolean; label?: string } = {},
): void {
  const { w = 30, h = 28, kind = 'fiber', connected = false, label } = opts;
  const pg = el('g', { transform: `translate(${x} ${y})` });
  const u = el('use', { width: w, height: h });
  u.setAttribute('href', `#${uid}sfp${kind === 'cage' ? 'Cage' : kind === 'dac' ? 'Dac' : 'Fiber'}`);
  pg.appendChild(u);
  if (kind !== 'cage') {
    drawLed(pg, uid, w * 0.18, h - h * 0.1, connected ? '#39ff8a' : '#20262b', connected, 1.1);
    drawLed(pg, uid, w * 0.82, h - h * 0.1, connected ? '#39ff8a' : '#20262b', connected, 1.1);
  }
  if (label) {
    const t = el('text', { x: w / 2, y: h + 9, 'text-anchor': 'middle', 'font-size': 6, fill: '#888', 'font-family': 'monospace' });
    t.textContent = label;
    pg.appendChild(t);
  }
  parent.appendChild(pg);
}
