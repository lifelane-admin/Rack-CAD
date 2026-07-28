// src/renderers/switch-renderer.ts
import { el, g, U1, makeRackDefs, drawChassis, drawBlades, drawLed } from './rack-kit';
import type { DeviceTemplate, PortData } from '../core/types';

// ─── Port position calculator ─────────────────────────────────────────────────
export function switchPorts(
  rj45: number, sfp: number, rows: number, idPfx: string,
): DeviceTemplate['ports'] {
  const JU=132, RW=1240, MBW=34, EAR=26, PAD=22, CON=250;
  const RJW=30, RJH=40, RCGP=4, RRGP=7, BGAP=15, CPB=4;
  const SFPW=46, SFPH=42.5, SFGG=9, SGAP=26;
  const W=350, H=30;

  const rjRows = rows;
  const units  = rjRows === 1 ? rj45 : Math.ceil(rj45 / 2);
  const blks   = units > 0 ? Math.ceil(units / CPB) : 0;
  const blkW   = CPB * RJW + (CPB - 1) * RCGP;
  let totRjW   = units > 0
    ? blks * blkW + (blks - 1) * BGAP - (blks * CPB - units) * (RJW + RCGP)
    : 0;
  totRjW = Math.max(0, totRjW);
  const sfpRowW  = sfp > 0 ? sfp * SFPW + (sfp - 1) * SFGG : 0;
  const chassisW = EAR*2 + PAD*2 + CON + SGAP + totRjW + (sfp > 0 ? SGAP + sfpRowW : 0);
  let bladeW = (RW - chassisW) / 2;
  let totW   = RW;
  if (bladeW < MBW) { bladeW = MBW; totW = chassisW + bladeW * 2; }

  const sx   = W / totW;
  const sy   = H / JU;
  const rjX  = bladeW + EAR + PAD + CON + SGAP;
  const sfpX = rjX + totRjW + (sfp > 0 ? SGAP : 0);
  const rjTop  = (JU - (rjRows === 1 ? RJH : RJH * 2 + RRGP)) / 2;
  const sfpTop = (JU - SFPH) / 2;

  type PortEntry = Omit<PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: PortEntry[] = [];

  for (let n = 1; n <= rj45; n++) {
    let jx: number, jy: number;
    if (rjRows === 1) {
      const c = n-1, b = Math.floor(c/CPB), ci = c%CPB;
      jx = rjX + b*(blkW+BGAP) + ci*(RJW+RCGP);
      jy = rjTop;
    } else {
      const col = Math.floor((n-1)/2), row = (n-1)%2;
      const b = Math.floor(col/CPB), ci = col%CPB;
      jx = rjX + b*(blkW+BGAP) + ci*(RJW+RCGP);
      jy = rjTop + row*(RJH+RRGP);
    }
    out.push({ id:`${idPfx}p${n}`, name:`Port ${n}`, type:'rj45', speed:'1 Gbps',
      relativeX: Math.round((jx + RJW/2) * sx), relativeY: Math.round((jy + RJH/2) * sy),
      portW: Math.round(RJW * sx), portH: Math.round(RJH * sy) });
  }

  for (let n = 1; n <= sfp; n++) {
    const jx = sfpX + (n-1) * (SFPW + SFGG);
    out.push({ id:`${idPfx}sfp${n}`, name:`SFP ${n}`, type:'sfp-plus', speed:'10 Gbps',
      relativeX: Math.round((jx + SFPW/2) * sx), relativeY: Math.round((sfpTop + SFPH/2) * sy),
      portW: Math.round(SFPW * sx), portH: Math.round(SFPH * sy) });
  }

  return out;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
export function renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('switch-panel');

  const ports      = template?.ports ?? [];
  const rj45Count  = ports.filter(p => p.type === 'rj45').length;
  const sfpCount   = ports.filter(p =>
    p.type === 'sfp' || p.type === 'sfp-plus' || p.type === 'sfp28' ||
    p.type === 'qsfp' || p.type === 'qsfp28',
  ).length;
  const model = template?.model ?? 'Rack Slicer';

  const JU   = 132, RW = 1240, MBW = 34, EAR = 26, PAD = 22, CON = 250;
  const RJW  = 30, RJH = 40, RCGP = 4, RRGP = 7, BGAP = 15, CPB = 4;
  const SFPW = 46, SFPH = 42.5, SFGG = 9, SGAP = 26;

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

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${JU}`);
  ns.setAttribute('preserveAspectRatio', 'none');

  const defs = makeRackDefs(ns, uid);

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

  const sfpC = el('symbol', { id: `${uid}sfpc`, viewBox: `0 0 ${SFPW} ${SFPH}` });
  sfpC.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFPW-1, height: SFPH-1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpC.appendChild(el('rect', { x: 1.5, y: 1.5, width: SFPW-3, height: SFPH-3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
  sfpC.appendChild(el('rect', { x: 5, y: 11, width: SFPW-10, height: SFPH-18, rx: 1.5, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  for (let i = 0; i < 7; i++) { const gw = (SFPW-15)/7; sfpC.appendChild(el('rect', { x: 7.5+i*gw, y: 13, width: gw-1.3, height: SFPH-24, fill: `url(#${uid}go)`, rx: 0.4, opacity: 0.9 })); }
  sfpC.appendChild(el('rect', { x: SFPW/2-5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpC.appendChild(el('rect', { x: 3, y: 2.6, width: SFPW-6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpC);

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

  drawChassis(ns, uid, chassisX, chassisW);
  drawBlades(ns, uid, totW, bladeW);

  const cy = JU / 2;
  const con = el('g');
  con.setAttribute('transform', `translate(${consX} 0)`);

  ([['PWR','#39ff8a',true],['SYS','#39ff8a',true],['ALM','#20262b',false],['LOC','#37b6ff',true]] as [string,string,boolean][]).forEach(([lbl, color, on], i) => {
    const ly = 20 + i * 22;
    drawLed(con, uid, 10, ly, color, on);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: '#aeb6bd', 'letter-spacing': 0.6 });
    t.textContent = lbl; con.appendChild(t);
  });

  const tw = el('text', { x: 62, y: cy-12, 'font-size': 17, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 1.5 });
  tw.textContent = 'RACK SLICER'; con.appendChild(tw);
  const tm = el('text', { x: 62, y: cy+5, 'font-size': 9, fill: '#8b939a', 'letter-spacing': 1.2 });
  tm.textContent = model; con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy+12, width: 112, height: 1, fill: '#3a4147' }));
  const tp = el('text', { x: 62, y: cy+25, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  tp.textContent = `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  con.appendChild(tp);

  const ug = el('g'); ug.setAttribute('transform', `translate(${CON - 110} ${cy + 6})`);
  ug.appendChild(el('rect', { x: 0, y: 0, width: 24, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  ug.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
  const tu = el('text', { x: 12, y: 18, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tu.textContent = 'USB-C'; ug.appendChild(tu); con.appendChild(ug);

  const rjCon = el('g'); rjCon.setAttribute('transform', `translate(${CON - 72} ${cy + 4})`);
  rjCon.appendChild(el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 1.6, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 0.9 }));
  rjCon.appendChild(el('rect', { x: 2, y: 2, width: 22, height: 14, rx: 1, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  rjCon.appendChild(el('path', { d: 'M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z', fill: '#04060a' }));
  for (let i = 0; i < 8; i++) rjCon.appendChild(el('rect', { x: 4 + i * 2.3, y: 4.5, width: 1.3, height: 4, fill: '#c9a24b', opacity: 0.8 }));
  const tc = el('text', { x: 13, y: 26, 'font-size': 6.5, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tc.textContent = 'CONSOLE'; rjCon.appendChild(tc); con.appendChild(rjCon);

  const rstG = el('g'); rstG.setAttribute('transform', `translate(${CON - 22} ${cy + 11})`);
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
  const tr = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tr.textContent = 'RST'; rstG.appendChild(tr); con.appendChild(rstG);

  ns.appendChild(con);

  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const connected = (n % 3) !== 0;
    const symId = (single || row === 0) ? `${uid}rjup` : `${uid}rjdn`;
    const ledY  = single ? 5 : row === 0 ? 5 : RJH - 5;
    const pg = el('g'); pg.setAttribute('transform', `translate(${x} ${y})`);
    const u = el('use'); u.setAttribute('href', `#${symId}`); u.setAttribute('width', String(RJW)); u.setAttribute('height', String(RJH));
    pg.appendChild(u);
    drawLed(pg, uid, 6,        ledY, connected ? '#39ff8a' : '#20262b', connected, 1.4);
    drawLed(pg, uid, RJW - 6,  ledY, '#20262b', false, 1.4);
    ns.appendChild(pg);
  }

  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const labelY = single ? y + RJH + 11 : row === 0 ? y - 4 : y + RJH + 11;
    const t = el('text', { x: x + RJW / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: '#aeb6bd' });
    t.textContent = String(n); ns.appendChild(t);
  }

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
      drawLed(sg, uid, 6.5,        SFPH - 3.2, '#39ff8a', isFiber);
      drawLed(sg, uid, SFPW - 6.5, SFPH - 3.2, '#20262b', false);
      const tl = el('text', { x: SFPW / 2, y: -5.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: '#aeb6bd' });
      tl.textContent = String(rj45Count + n); sg.appendChild(tl); ns.appendChild(sg);
    }
  }

  group.appendChild(ns);
  return group;
}
