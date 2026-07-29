// src/renderers/pdu-renderer.ts
import { el, g } from './rack-kit';
import type { DeviceTemplate, DeviceData, SocketType } from '../core/types';

interface FinishPreset { hi: string; mid: string; lo: string; text: string; texture?: boolean; }

const FINISH: Record<string, FinishPreset> = {
  'ral9005-texture': { hi:'#2a2a2a', mid:'#0f0f0f', lo:'#050505', text:'#e8eaec', texture:true },
  black:             { hi:'#3a3d40', mid:'#1c1e20', lo:'#0d0e10', text:'#e8eaec' },
  darkGrey:          { hi:'#54585c', mid:'#33373b', lo:'#1e2124', text:'#f0f2f4' },
  lightGrey:         { hi:'#c8ccd0', mid:'#a4a9ae', lo:'#7d8287', text:'#1a1c1e' },
  white:             { hi:'#ffffff', mid:'#eceef0', lo:'#c9cccf', text:'#1a1c1e' },
  brushedAluminium:  { hi:'#e8eaec', mid:'#c9ccce', lo:'#9fa3a6', text:'#1a1c1e' },
};

function makePduDefs(ns: SVGSVGElement, uid: string, finish: FinishPreset): void {
  const defs = el('defs');
  function lg(id: string, stops: [string, string][], horiz = false) {
    const gr = el('linearGradient', { id, x1: 0, y1: 0, x2: horiz ? 1 : 0, y2: horiz ? 0 : 1, gradientUnits: 'objectBoundingBox' });
    stops.forEach(([o, c]) => { const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); gr.appendChild(s); });
    defs.appendChild(gr);
  }
  lg(`${uid}pf`, [['0', finish.hi], ['0.1', finish.mid], ['0.9', finish.mid], ['1', finish.lo]]);
  lg(`${uid}ps`, [['0', finish.lo], ['0.15', finish.mid], ['0.85', finish.mid], ['1', finish.lo]], true);

  const rg = el('radialGradient', { id: `${uid}pit`, cx: 0.5, cy: 0.4, r: 0.75, gradientUnits: 'objectBoundingBox' });
  [['0','#242527'],['0.6','#0a0b0c'],['1','#020203']].forEach(([o,c]) => {
    const s = el('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); rg.appendChild(s);
  });
  defs.appendChild(rg);

  lg(`${uid}brass`, [['0','#f4e2a1'],['1','#a9871f']]);

  const fSS = el('filter', { id: `${uid}ss`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const fDS = el('feDropShadow', { dx: '0', dy: '1.5', stdDeviation: '1.6' });
  fDS.setAttribute('flood-color', '#000'); fDS.setAttribute('flood-opacity', '0.55');
  fSS.appendChild(fDS); defs.appendChild(fSS);

  ns.appendChild(defs);
}

function drawC13(parent: SVGElement, uid: string, cx: number, cy: number): void {
  const w = 17, h = 15;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  const path = el('path');
  path.setAttribute('d', `M ${-w/2} ${-h/2+2} Q ${-w/2} ${-h/2} ${-w/2+2} ${-h/2} L ${w/2-2} ${-h/2} Q ${w/2} ${-h/2} ${w/2} ${-h/2+2} L ${w/2} ${h/2-1} Q ${w/2} ${h/2} ${w/2-1} ${h/2} L ${-w/2+1} ${h/2} Q ${-w/2} ${h/2} ${-w/2} ${h/2-1} Z`);
  path.setAttribute('fill', '#141618'); path.setAttribute('stroke', '#000'); path.setAttribute('stroke-width', '0.3');
  grp.appendChild(path);
  grp.appendChild(el('rect', { x: -w/2+1.4, y: -h/2+1.4, width: w-2.8, height: h-2.8, rx: 1.2, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -4.4, y: -4.1, width: 2.2, height: 3.9, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: 2.2,  y: -4.1, width: 2.2, height: 3.9, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.3, y:  1.1, width: 2.6, height: 3.4, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -0.9, y:  1.5, width: 1.8, height: 1.1, fill: `url(#${uid}brass)`, opacity: 0.55 }));
  parent.appendChild(grp);
}

function drawC19(parent: SVGElement, uid: string, cx: number, cy: number): void {
  const w = 22, h = 18;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  grp.appendChild(el('rect', { x: -w/2, y: -h/2, width: w, height: h, rx: 2.2, fill: '#141618', stroke: '#000', 'stroke-width': 0.3 }));
  grp.appendChild(el('rect', { x: -w/2+1.8, y: -h/2+1.8, width: w-3.6, height: h-3.6, rx: 1.5, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -5.5, y: -4.6, width: 2.8, height: 5,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x:  2.7, y: -4.6, width: 2.8, height: 5,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.8, y:  1.6, width: 3.6, height: 4,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.2, y:  2.2, width: 2.4, height: 1.4, fill: `url(#${uid}brass)`, opacity: 0.55 }));
  parent.appendChild(grp);
}

function drawNema515(parent: SVGElement, uid: string, cx: number, cy: number): void {
  const w = 20, h = 20;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  grp.appendChild(el('rect', { x: -w/2, y: -h/2, width: w, height: h, rx: 2.5, fill: '#141618', stroke: '#000', 'stroke-width': 0.3 }));
  grp.appendChild(el('circle', { cx: 0, cy: 0, r: w/2-2, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -4, y: -6.5, width: 2.5, height: 4.5, rx: 0.6, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x:  1.5, y: -6.5, width: 2.5, height: 4.5, rx: 0.6, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('circle', { cx: 0, cy: 4.5, r: 1.8, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  parent.appendChild(grp);
}

function drawSocket(parent: SVGElement, uid: string, type: string, cx: number, cy: number): void {
  if (type === 'C13' || type === 'iec-c13') return drawC13(parent, uid, cx, cy);
  if (type === 'C19' || type === 'iec-c19') return drawC19(parent, uid, cx, cy);
  drawNema515(parent, uid, cx, cy);
}

function socketWidth(type: string): number {
  if (type === 'C19' || type === 'iec-c19') return 22;
  if (type === 'NEMA-5-15') return 20;
  return 17;
}

function renderConfiguredPdu(
  template: DeviceTemplate | null, config: Record<string, unknown>, W: number, H: number,
): SVGGElement {
  const group = g('pdu-panel');
  const uid = `pdu${Math.random().toString(36).slice(2, 7)}_`;
  const finishKey = (config.finish as string) ?? 'ral9005-texture';
  const finish = FINISH[finishKey] ?? FINISH['ral9005-texture'];
  const rows = (config.rows as Array<{ count: number; socketType: string }>) ?? [{ count: 8, socketType: 'C13' }];

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns, uid, finish);

  ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: 3, fill: `url(#${uid}pf)`, stroke: finish.lo, 'stroke-width': 1 }));
  ns.appendChild(el('rect', { x: 2, y: 2.5, width: W - 4, height: 1.5, rx: 0.75, fill: finish.hi, opacity: 0.4 }));

  const ledR = Math.min(3.5, H / 6);
  const ledX = 10 + ledR, ledY = H / 2;
  ns.appendChild(el('circle', { cx: ledX, cy: ledY, r: ledR + 1.5, fill: '#37e07a', opacity: 0.15 }));
  ns.appendChild(el('circle', { cx: ledX, cy: ledY, r: ledR, fill: '#37e07a', stroke: '#000', 'stroke-width': 0.4 }));
  ns.appendChild(el('circle', { cx: ledX - ledR * 0.3, cy: ledY - ledR * 0.3, r: ledR * 0.35, fill: '#fff', opacity: 0.75 }));

  const allSockets: { type: string }[] = rows.flatMap(row =>
    Array.from({ length: row.count }, () => ({ type: row.socketType })),
  );
  const socketArea = W - 24 - 8;
  const startX = 24;
  const totalSocketW = allSockets.reduce((sum, s) => sum + socketWidth(s.type), 0);
  const spacing = allSockets.length > 1
    ? Math.min(6, (socketArea - totalSocketW) / (allSockets.length - 1))
    : 0;

  let cx = startX + socketWidth(allSockets[0]?.type ?? 'C13') / 2;
  allSockets.forEach(s => {
    const sw = socketWidth(s.type);
    drawSocket(ns, uid, s.type, cx, H / 2);
    cx += sw + spacing;
  });

  if (template?.model) {
    const lbl = el('text', { x: W - 6, y: H / 2 + 3, 'text-anchor': 'end', 'font-size': 7, fill: finish.text, 'font-family': 'monospace', opacity: 0.6, 'letter-spacing': 0.8 });
    lbl.textContent = template.model;
    ns.appendChild(lbl);
  }

  group.appendChild(ns);
  return group;
}

function renderGenericPdu(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('pdu-panel');
  const chY = 2, chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1a1e', stroke: '#111', 'stroke-width': 1 }));
  group.appendChild(el('rect', { x: 8, y: chY + 4, width: 50, height: chH - 8, rx: 2, fill: '#050910', stroke: '#30363d', 'stroke-width': 0.8 }));
  group.appendChild(el('rect', { x: 10, y: chY + 6, width: 46, height: chH - 12, rx: 1, fill: '#0a1520', opacity: 0.9 }));
  const lcd = el('text', { x: 33, y: chY + chH / 2 + 3, 'text-anchor': 'middle', 'font-size': 7, fill: '#00e5ff', 'font-family': 'monospace', opacity: 0.8 });
  lcd.textContent = '0.0 A'; group.appendChild(lcd);
  group.appendChild(el('circle', { cx: 67, cy: chY + chH / 2, r: 6, fill: '#c62828', stroke: '#111', 'stroke-width': 1 }));
  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20, outletH = chH - 10, outletY = chY + 5, startX = 85;
  c13Ports.forEach((_, i) => {
    const ax = startX + i * (outletW + 4);
    group.appendChild(el('rect', { x: ax, y: outletY, width: outletW, height: outletH, rx: 2, fill: '#0a0a0f', stroke: '#333', 'stroke-width': 0.7 }));
    const contactY = outletY + outletH - 8;
    [ax + 4, ax + 8.5, ax + 13].forEach(cxPos => {
      group.appendChild(el('rect', { x: cxPos, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
    });
  });
  group.appendChild(el('rect', { x: W - 30, y: chY + 4, width: 22, height: chH - 8, rx: 2, fill: '#0a0a0f', stroke: '#555', 'stroke-width': 0.8 }));
  return group;
}

export function renderPduPanel(
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,
  W: number,
  H: number,
): SVGGElement {
  const config = deviceData?.deviceConfig;
  if (config?.rows) return renderConfiguredPdu(template, config, W, H);
  return renderGenericPdu(template, W, H);
}

function drawSocketFacePlate(
  parent: SVGElement,
  cx: number,
  cy: number,
  ow: number,
  oh: number,
  sockType: SocketType,
  isConnected: boolean,
): void {
  const strokeColor = isConnected ? '#37e07a' : '#2a3036';
  const strokeW = isConnected ? 1.2 : 0.6;
  const halfW = ow / 2;
  const halfH = oh / 2;

  // Face plate background (shared by all types)
  const face = el('rect', {
    x: cx - halfW, y: cy - halfH,
    width: ow, height: oh,
    rx: 1.5,
    fill: '#141618',
    stroke: strokeColor,
    'stroke-width': strokeW,
  });
  parent.appendChild(face);

  // Inner socket graphic — distinct per type
  if (sockType === 'C13') {
    // IEC C13: 3 ovals in triangular pattern — bottom-left, top-center, bottom-right
    const hRx = 1.4, hRy = 2.2;
    parent.appendChild(el('ellipse', { cx: cx - 2.8, cy: cy + 1.5, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx,       cy: cy - 2,   rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx + 2.8, cy: cy + 1.5, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

  } else if (sockType === 'C19') {
    // IEC C19: like C13 but wider, 3 ovals more spread
    const hRx = 1.6, hRy = 2.5;
    parent.appendChild(el('ellipse', { cx: cx - 3.5, cy: cy + 1.8, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx,       cy: cy - 2.2, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx + 3.5, cy: cy + 1.8, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

  } else if (sockType === 'C15') {
    // IEC C15: same as C13 but with a notch at bottom (hot equipment)
    const hRx = 1.4, hRy = 2.2;
    parent.appendChild(el('ellipse', { cx: cx - 2.8, cy: cy + 1.5, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx,       cy: cy - 2,   rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('ellipse', { cx: cx + 2.8, cy: cy + 1.5, rx: hRx, ry: hRy, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    // Notch (bottom edge)
    parent.appendChild(el('rect', { x: cx - 1, y: cy + halfH - 2.5, width: 2, height: 2, fill: '#030304' }));

  } else if (sockType === 'NEMA-5-15' || sockType === 'NEMA-5-20') {
    // NEMA: 2 vertical blade slots + D-shaped ground hole below
    const bW = 1.2, bH = 3.5;
    parent.appendChild(el('rect', { x: cx - 3.5 - bW / 2, y: cy - bH / 2 - 0.5, width: bW, height: bH, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    // NEMA-5-20 has one horizontal blade
    if (sockType === 'NEMA-5-20') {
      parent.appendChild(el('rect', { x: cx + 2.0, y: cy - bW / 2 - 0.5, width: bH, height: bW, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    } else {
      parent.appendChild(el('rect', { x: cx + 3.5 - bW / 2, y: cy - bH / 2 - 0.5, width: bW, height: bH, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    }
    // D-shaped ground (half circle below)
    parent.appendChild(el('ellipse', { cx: cx, cy: cy + 2.5, rx: 1.3, ry: 1.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

  } else if (sockType === 'NEMA-L5-30' || sockType === 'NEMA-L6-20') {
    // NEMA Locking: two curved slots + ground — distinctive circular keyway
    parent.appendChild(el('circle', { cx, cy, r: 3.5, fill: 'none', stroke: '#2a2a36', 'stroke-width': 0.5 }));
    parent.appendChild(el('ellipse', { cx: cx - 2.5, cy: cy - 1, rx: 0.9, ry: 2.2, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3, transform: `rotate(-30,${cx - 2.5},${cy - 1})` }));
    parent.appendChild(el('ellipse', { cx: cx + 2.5, cy: cy - 1, rx: 0.9, ry: 2.2, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3, transform: `rotate(30,${cx + 2.5},${cy - 1})` }));
    parent.appendChild(el('ellipse', { cx, cy: cy + 2.5, rx: 1.0, ry: 1.0, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

  } else if (sockType === 'BS1363') {
    // UK BS1363: 3 rectangular slots in triangular pattern (live=top-right, neutral=top-left, earth=bottom-center larger)
    parent.appendChild(el('rect', { x: cx - 3.8, y: cy - 3.5, width: 3, height: 1.2, rx: 0.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // neutral (left)
    parent.appendChild(el('rect', { x: cx + 0.8, y: cy - 3.5, width: 3, height: 1.2, rx: 0.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // live (right)
    parent.appendChild(el('rect', { x: cx - 2,   y: cy + 0.5, width: 4, height: 1.5, rx: 0.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // earth (bottom, wider)

  } else if (sockType === 'Schuko') {
    // Schuko (EU): 2 round holes + earth contacts on sides
    parent.appendChild(el('circle', { cx: cx - 2.8, cy, r: 1.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('circle', { cx: cx + 2.8, cy, r: 1.3, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    // Earth contacts (side strips)
    parent.appendChild(el('rect', { x: cx - halfW + 0.5, y: cy - 1, width: 1.5, height: 2, rx: 0.4, fill: '#3a3a4a', stroke: '#2a2a36', 'stroke-width': 0.3 }));
    parent.appendChild(el('rect', { x: cx + halfW - 2,   y: cy - 1, width: 1.5, height: 2, rx: 0.4, fill: '#3a3a4a', stroke: '#2a2a36', 'stroke-width': 0.3 }));

  } else if (sockType === 'IS6538-5A' || sockType === 'IS6538-15A') {
    // India IS6538 (Type D/M): 3 round pins in triangular arrangement (larger for 15A)
    const r = sockType === 'IS6538-15A' ? 1.5 : 1.2;
    parent.appendChild(el('circle', { cx: cx - 2.5, cy: cy + 1.8, r, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('circle', { cx: cx,       cy: cy - 2.2, r, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('circle', { cx: cx + 2.5, cy: cy + 1.8, r, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

  } else if (sockType === 'IS1293-6A' || sockType === 'IS1293-16A') {
    // India IS1293 (2+E): 2 round holes + earth — flat rectangular body
    const r = sockType === 'IS1293-16A' ? 1.4 : 1.1;
    parent.appendChild(el('circle', { cx: cx - 2.2, cy: cy + 1,   r, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // live
    parent.appendChild(el('circle', { cx: cx + 2.2, cy: cy + 1,   r, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // neutral
    parent.appendChild(el('circle', { cx: cx,       cy: cy - 2.2, r: r * 0.9, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 })); // earth

  } else {
    // Fallback: generic 2 holes
    parent.appendChild(el('circle', { cx: cx - 2, cy, r: 1.2, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('circle', { cx: cx + 2, cy, r: 1.2, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
  }

  // Socket type label below the outlet
  const lbl = el('text', {
    x: cx, y: cy + halfH + 3,
    'text-anchor': 'middle', 'font-size': 2.8,
    fill: isConnected ? '#37e07a' : '#5b636a',
    'font-family': 'monospace', 'pointer-events': 'none',
  });
  lbl.textContent = sockType;
  parent.appendChild(lbl);
}

export function renderSidePdu(
  template: DeviceTemplate,
  pduWidth: number,
  stripH: number,
  side: 'left' | 'right',
  connectedOutlets: Set<number> = new Set(),
): SVGGElement {
  const group = g('side-pdu');

  const uid = `spdu${Math.random().toString(36).slice(2, 7)}_`;
  const finishKey = 'ral9005-texture';
  const finish = FINISH[finishKey];

  // Create inner SVG element using el()
  const ns = el('svg', { width: pduWidth, height: stripH });
  ns.setAttribute('viewBox', `0 0 ${pduWidth} ${stripH}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns as unknown as SVGSVGElement, uid, finish);

  // Chassis background
  ns.appendChild(el('rect', { x: 0, y: 0, width: pduWidth, height: stripH, rx: 2, fill: `url(#${uid}ps)`, stroke: finish.lo, 'stroke-width': 1 }));
  ns.appendChild(el('rect', { x: 1, y: 1, width: pduWidth - 2, height: stripH - 2, rx: 1.5, fill: 'none', stroke: '#3a4147', 'stroke-width': 0.5, opacity: 0.4 }));

  // LCD panel at top
  const lcdH = 28;
  ns.appendChild(el('rect', { x: 3, y: 6, width: pduWidth - 6, height: lcdH, rx: 2, fill: '#005f73' }));

  const lcdTxt = el('text', { x: pduWidth / 2, y: 16, 'text-anchor': 'middle', 'font-size': 5, fill: '#a2d2ff', 'font-family': 'monospace', 'font-weight': 'bold' });
  lcdTxt.textContent = template.model ?? 'PDU';
  ns.appendChild(lcdTxt);

  const lcdA = el('text', { x: pduWidth / 2, y: 25, 'text-anchor': 'middle', 'font-size': 4.5, fill: '#7ab8d4', 'font-family': 'monospace' });
  lcdA.textContent = '0.0A / 0W';
  ns.appendChild(lcdA);

  // Outlets
  const outletConfig = template.outletConfig ?? [{ count: 20, socketType: 'C13' as SocketType }];
  const allOutlets: SocketType[] = outletConfig.flatMap(row =>
    Array.from({ length: row.count }, () => row.socketType),
  );

  const outletAreaTop = lcdH + 14;
  const outletAreaH = stripH - outletAreaTop - 8;
  const outletSpacing = outletAreaH / Math.max(allOutlets.length, 1);
  const outletCx = pduWidth / 2;

  allOutlets.forEach((sockType, i) => {
    const oy = outletAreaTop + i * outletSpacing + outletSpacing / 2;
    const isConnected = connectedOutlets.has(i);
    const ow = Math.min(pduWidth - 6, sockType === 'C19' ? 22 : 18);
    const oh = Math.min(outletSpacing - 2, 14);

    // Outlet face plate with distinct socket graphic per type
    drawSocketFacePlate(ns as unknown as SVGElement, outletCx, oy, ow, oh, sockType, isConnected);

    // Hit target for power cable connection
    const hitTarget = el('rect', {
      x: outletCx - ow / 2 - 2, y: oy - oh / 2 - 2,
      width: ow + 4, height: oh + 4,
      fill: 'transparent',
    });
    hitTarget.setAttribute('class', 'pdu-outlet-hit');
    hitTarget.setAttribute('data-outlet-idx', String(i));
    ns.appendChild(hitTarget);
  });

  // Vertical label
  const vtxt = el('text', {
    'font-size': 4, fill: '#3a4147',
    'font-family': 'monospace',
    transform: `translate(${side === 'left' ? pduWidth - 3 : 3}, ${stripH / 2}) rotate(${side === 'left' ? -90 : 90})`,
    'text-anchor': 'middle', 'pointer-events': 'none',
  });
  vtxt.textContent = side === 'left' ? `PDU-A · ${template.model}` : `PDU-B · ${template.model}`;
  ns.appendChild(vtxt);

  group.appendChild(ns);
  return group;
}
