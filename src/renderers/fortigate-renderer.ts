// src/renderers/fortigate-renderer.ts
import { el, g } from './rack-kit';
import type { DeviceTemplate } from '../core/types';

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

export function renderFortiGatePanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
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

  placed.forEach(p => {
    const z = p.zone;
    const py = p.row === 0 ? topRowY : botRowY;
    const px = p.x - EAR;
    const up = true;

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
