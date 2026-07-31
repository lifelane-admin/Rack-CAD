// src/renderers/ats-renderer.ts
//
// Automatic Transfer Switch — a 1U power device that looks distinct from a plain PDU: TWO power
// inlets (SOURCE A / SOURCE B) instead of one, plus a transfer-status indicator showing which
// source is currently feeding the output outlets. Same chassis/blade body language as the other
// 1U renderers in this app, but its own simple content (no PDU-style outlet-type configurator —
// see AtsConfig, deliberately small).
import { el, g } from './rack-kit';
import type { DeviceTemplate, PortData, DeviceData, AtsConfig } from '../core/types';

const U1 = 132;
const RW = 1240;
const MIN_BLADE_W = 34;
const EAR_W = 26;
const PANEL_PAD = 22;
const INLET_W = 34, INLET_H = 40;
const OUTLET_R = 9;
const OUTLET_GAP = 26;
const SECTION_GAP = 30;
const BRAND_W = 190;
const TRANSFER_W = 90;

interface AtsLayout {
  chassisW: number; bladeW: number; totW: number;
  inletX: number; transferX: number; outletX: number; outletsW: number; inletsW: number;
}

/** Single source of truth for atsPorts() and renderAtsPanel() — computed once so the two can
 *  never drift out of sync (same reasoning as switch/firewall/nac's compute*Layout functions). */
function computeAtsLayout(outletCount: number): AtsLayout {
  const outletsW = outletCount * (OUTLET_R * 2 + OUTLET_GAP) - OUTLET_GAP;
  const inletsW = INLET_W * 2 + 20;
  const portsRowW = inletsW + SECTION_GAP + TRANSFER_W + SECTION_GAP + outletsW;
  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + BRAND_W + SECTION_GAP + portsRowW;
  let bladeW = (RW - chassisW) / 2;
  let totW = RW;
  if (bladeW < MIN_BLADE_W) { bladeW = MIN_BLADE_W; totW = chassisW + bladeW * 2; }

  const consX = bladeW + EAR_W + PANEL_PAD;
  const inletX = consX + BRAND_W + SECTION_GAP;
  const transferX = inletX + inletsW + SECTION_GAP;
  const outletX = transferX + TRANSFER_W + SECTION_GAP;

  return { chassisW, bladeW, totW, inletX, transferX, outletX, outletsW, inletsW };
}

export function atsPorts(config: AtsConfig, idPfx = 'ats-'): DeviceTemplate['ports'] {
  const outletCount = config.outletCount ?? 8;
  const W = 350, H = 30;
  const { totW, inletX, outletX } = computeAtsLayout(outletCount);
  const sx = W / totW;
  const sy = H / U1;
  const cy = U1 / 2;

  type PortEntry = Omit<PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: PortEntry[] = [];

  out.push({
    id: `${idPfx}src-a`, name: 'Source A', type: 'power', speed: undefined,
    relativeX: (inletX + INLET_W / 2) * sx, relativeY: (U1 / 2) * sy,
    portW: INLET_W * sx, portH: INLET_H * sy, group: 'INPUT',
  });
  out.push({
    id: `${idPfx}src-b`, name: 'Source B', type: 'power', speed: undefined,
    relativeX: (inletX + INLET_W + 20 + INLET_W / 2) * sx, relativeY: (U1 / 2) * sy,
    portW: INLET_W * sx, portH: INLET_H * sy, group: 'INPUT',
  });

  for (let n = 1; n <= outletCount; n++) {
    const ox = outletX + (n - 1) * (OUTLET_R * 2 + OUTLET_GAP) + OUTLET_R;
    out.push({
      id: `${idPfx}out${n}`, name: `Outlet ${n}`, type: 'power', speed: undefined,
      relativeX: ox * sx, relativeY: cy * sy,
      portW: OUTLET_R * 2 * sx, portH: OUTLET_R * 2 * sy, group: 'OUTPUT',
    });
  }

  return out;
}

export function renderAtsPanel(
  template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number,
  connectedIds: Set<string> = new Set(),
): SVGGElement {
  const group = g('ats-panel');
  const config = (deviceData?.deviceConfig as AtsConfig | undefined) ?? {};
  const accent = config.accentColor || '#ffb020';
  const brandLabel = config.brandName || 'Rack Slicer';
  const model = config.modelName || template?.model || 'ATS Switch';
  const activeSource = config.activeSource ?? 'A';
  const outletCount = config.outletCount ?? 8;

  const { chassisW, bladeW, totW, inletX, transferX, outletX } = computeAtsLayout(outletCount);
  const brandW = BRAND_W, transferW = TRANSFER_W;

  const chassisX = bladeW;
  const consX = bladeW + EAR_W + PANEL_PAD;

  const uid = `ats${Math.random().toString(36).slice(2, 7)}`;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${U1}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  ns.setAttribute('role', 'img');
  ns.setAttribute('aria-label', `${brandLabel} ${model} automatic transfer switch`);

  const defs = el('defs');
  function linGrad(id: string, x2: string, y2: string, stops: [string, string][]) {
    const gr = el('linearGradient', { id, x1: '0', y1: '0', x2, y2 });
    for (const [offset, color] of stops) {
      const s = el('stop'); s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      gr.appendChild(s);
    }
    defs.appendChild(gr);
  }
  linGrad(`chassis-${uid}`, '0', '1', [['0', '#3a4046'], ['0.06', '#2c3237'], ['0.5', '#23282c'], ['0.94', '#1b1f22'], ['1', '#141719']]);
  linGrad(`blade-${uid}`, '1', '0', [['0', '#2a3035'], ['0.35', '#3a4247'], ['0.55', '#454d53'], ['0.8', '#2b3136'], ['1', '#1a1e21']]);

  const glowF = el('filter', { id: `glow-${uid}`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  const glowBlur = el('feGaussianBlur'); glowBlur.setAttribute('stdDeviation', '1.1'); glowBlur.setAttribute('result', 'b'); glowF.appendChild(glowBlur);
  const glowMrg = el('feMerge');
  const mn1 = el('feMergeNode'); mn1.setAttribute('in', 'b'); glowMrg.appendChild(mn1);
  const mn2 = el('feMergeNode'); mn2.setAttribute('in', 'SourceGraphic'); glowMrg.appendChild(mn2);
  glowF.appendChild(glowMrg); defs.appendChild(glowF);

  const aoF = el('filter', { id: `ao-${uid}`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const aoDS = el('feDropShadow');
  aoDS.setAttribute('dx', '0'); aoDS.setAttribute('dy', '1.4'); aoDS.setAttribute('stdDeviation', '1.6');
  aoDS.setAttribute('flood-color', '#000'); aoDS.setAttribute('flood-opacity', '0.55');
  aoF.appendChild(aoDS); defs.appendChild(aoF);

  ns.appendChild(defs);

  const txt = { label: '#aeb6bd', mute: '#8b939a' };
  const chassisStroke = '#0c0f11';

  const chG = g(); chG.setAttribute('filter', `url(#ao-${uid})`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: config.panelColor || `url(#chassis-${uid})`, stroke: chassisStroke, 'stroke-width': 1.2 }));
  chG.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bg = g(); bg.setAttribute('filter', `url(#ao-${uid})`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: U1, rx: 2.5, fill: config.panelColor || `url(#blade-${uid})`, stroke: chassisStroke, 'stroke-width': 1 }));
    for (const f of [0.34, 0.66]) {
      const hg = g();
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      hg.appendChild(el('rect', { x: holeCx - 4.5, y: U1 * f - 8, width: 9, height: 16, rx: 4.5, fill: 'none', stroke: '#02040a', 'stroke-width': 0.6, opacity: 0.85 }));
      hg.appendChild(el('path', { d: `M ${holeCx - 3} ${U1 * f - 6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 }));
      bg.appendChild(hg);
    }
    ns.appendChild(bg);
  }

  // ── brand block ───────────────────────────────────────────────────────────
  const cy = U1 / 2;
  const con = g(); con.setAttribute('transform', `translate(${consX} 0)`);
  const tw = el('text', { x: 0, y: cy - 12, 'font-size': 15, 'font-weight': 700, fill: accent, 'letter-spacing': 1.5 });
  tw.textContent = brandLabel.toUpperCase(); con.appendChild(tw);
  const tm = el('text', { x: 0, y: cy + 5, 'font-size': 9, fill: txt.mute, 'letter-spacing': 1.2 });
  tm.textContent = model; con.appendChild(tm);
  con.appendChild(el('rect', { x: 0, y: cy + 12, width: brandW - 6, height: 1, fill: '#3a4147' }));
  const tp = el('text', { x: 0, y: cy + 25, 'font-size': 7, fill: txt.mute, 'letter-spacing': 1.2 });
  tp.textContent = 'AUTOMATIC TRANSFER SWITCH • 1U';
  con.appendChild(tp);
  ns.appendChild(con);

  // ── dual power-input inlets (the defining ATS feature) ─────────────────────
  function drawInlet(x: number, label: string, active: boolean) {
    const ig = g(); ig.setAttribute('transform', `translate(${x} ${(U1 - INLET_H) / 2})`);
    ig.appendChild(el('rect', { x: 0, y: 0, width: INLET_W, height: INLET_H, rx: 2.5, fill: '#0c0e10', stroke: '#05070a', 'stroke-width': 1 }));
    ig.appendChild(el('rect', { x: 4, y: 5, width: INLET_W - 8, height: INLET_H - 10, rx: 1.5, fill: '#171b1e', stroke: '#2a3036', 'stroke-width': 0.6 }));
    // Two IEC-style prong slots
    ig.appendChild(el('rect', { x: INLET_W / 2 - 7, y: 12, width: 3.5, height: 9, rx: 1, fill: '#000' }));
    ig.appendChild(el('rect', { x: INLET_W / 2 + 3.5, y: 12, width: 3.5, height: 9, rx: 1, fill: '#000' }));
    ig.appendChild(el('rect', { x: INLET_W / 2 - 4, y: 24, width: 8, height: 5, rx: 1, fill: '#000' }));
    const ledColor = active ? '#39ff8a' : '#3a3f46';
    const led = el('circle', { cx: INLET_W / 2, cy: 4, r: 2.4, fill: ledColor });
    if (active) led.setAttribute('filter', `url(#glow-${uid})`);
    ig.appendChild(led);
    const lbl = el('text', { x: INLET_W / 2, y: INLET_H + 11, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 600, fill: active ? '#39ff8a' : txt.label });
    lbl.textContent = label; ig.appendChild(lbl);
    ns.appendChild(ig);
  }
  drawInlet(inletX, 'SOURCE A', activeSource === 'A');
  drawInlet(inletX + INLET_W + 20, 'SOURCE B', activeSource === 'B');

  // ── transfer-status indicator ───────────────────────────────────────────────
  const tg = g(); tg.setAttribute('transform', `translate(${transferX} ${cy})`);
  tg.appendChild(el('circle', { cx: transferW / 2 - 10, cy: 0, r: 13, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 1.2 }));
  const arrowColor = activeSource === 'A' ? '#39ff8a' : '#37b6ff';
  const arrow = el('path', {
    d: activeSource === 'A'
      ? `M ${transferW / 2 - 16} 0 L ${transferW / 2 - 10} -6 L ${transferW / 2 - 4} 0 L ${transferW / 2 - 10} 6 Z`
      : `M ${transferW / 2 - 4} 0 L ${transferW / 2 - 10} -6 L ${transferW / 2 - 16} 0 L ${transferW / 2 - 10} 6 Z`,
    fill: arrowColor,
  });
  arrow.setAttribute('filter', `url(#glow-${uid})`);
  tg.appendChild(arrow);
  const transferLbl = el('text', { x: transferW / 2 - 10, y: 26, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 600, fill: txt.mute, 'letter-spacing': 0.6 });
  transferLbl.textContent = 'AUTO XFER'; tg.appendChild(transferLbl);
  ns.appendChild(tg);

  // ── output outlets ───────────────────────────────────────────────────────
  const outletY = cy;
  for (let n = 1; n <= outletCount; n++) {
    const ox = outletX + (n - 1) * (OUTLET_R * 2 + OUTLET_GAP) + OUTLET_R;
    const og = g(); og.setAttribute('transform', `translate(${ox} ${outletY})`);
    og.setAttribute('role', 'button'); og.setAttribute('tabindex', '0');
    og.setAttribute('aria-label', `Outlet ${n}`);
    og.setAttribute('style', 'cursor:pointer;outline:none');
    og.appendChild(el('circle', { cx: 0, cy: 0, r: OUTLET_R, fill: '#171b1e', stroke: '#05070a', 'stroke-width': 1.4 }));
    og.appendChild(el('rect', { x: -3.4, y: -5.5, width: 2, height: 6, rx: 0.6, fill: '#000' }));
    og.appendChild(el('rect', { x: 1.4, y: -5.5, width: 2, height: 6, rx: 0.6, fill: '#000' }));
    og.appendChild(el('rect', { x: -2.2, y: 2, width: 4.4, height: 2.6, rx: 0.6, fill: '#000' }));
    const outletPorts = (deviceData?.ports ?? template?.ports ?? []).filter(p => p.group === 'OUTPUT');
    const connected = connectedIds.has(outletPorts[n - 1]?.id ?? '');
    const led = el('circle', { cx: 0, cy: OUTLET_R + 4, r: 1.6, fill: connected ? '#39ff8a' : '#20262b' });
    if (connected) led.setAttribute('filter', `url(#glow-${uid})`);
    og.appendChild(led);
    const hov = el('circle', { cx: 0, cy: 0, r: OUTLET_R + 2, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    og.appendChild(hov);
    ns.appendChild(og);

    const lbl = el('text', { x: 0, y: -(OUTLET_R + 6), 'text-anchor': 'middle', 'font-size': 7, fill: txt.label });
    lbl.textContent = String(n); ns.appendChild(lbl);
  }

  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.2}g[role="button"]:focus-visible .hov-${uid}{opacity:.3}`;
  ns.appendChild(style);

  group.appendChild(ns);
  return group;
}
