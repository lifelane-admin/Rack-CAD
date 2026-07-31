// src/renderers/nac-renderer.ts
//
// Network Access Control appliance — a deliberately smaller sibling of switch-renderer.ts/
// firewall-renderer.ts: same visual language (chassis/blades, vendor-skinned tone, real RJ45
// jack art, MGMT/Console as real trailing ports) but no parametric port-count complexity beyond
// a single row of RJ45 uplinks, since real NAC boxes (ForeScout, Cisco ISE, Aruba ClearPass) are
// simple fixed-role 1U appliances, not switching fabric.
import { el, g } from './rack-kit';
import { nacVendorSkin } from './vendor-palette';
import type { DeviceTemplate, PortData, DeviceData, NacConfig } from '../core/types';

const U1 = 132;
const RW = 1240;
const MIN_BLADE_W = 34;
const EAR_W = 26;
const PANEL_PAD = 22;
const RJ_W = 30;
const RJ_H = 40;
const RJ_COL_GAP = 4;
const BLOCK_GAP = 15;
const SECTION_GAP = 26;
const CPB = 6;
const MIN_CONSOLE_W = 170, MAX_CONSOLE_W = 250;
const USB_W = 24, RST_W = 10, TRAIL_GAP = 14;

interface NacLayout {
  totRjW: number; trailW: number; consoleW: number;
  chassisW: number; bladeW: number; totW: number;
  rjX: number; mgmtX: number; consoleJackX: number; usbX: number; rstX: number;
  rjTop: number;
}

function computeNacLayout(rj45: number, mgmt = true, consolePort = true, usbPort = true): NacLayout {
  const blks = rj45 > 0 ? Math.ceil(rj45 / CPB) : 0;
  const blkW = CPB * RJ_W + (CPB - 1) * RJ_COL_GAP;
  const totRjW = Math.max(0, rj45 > 0
    ? blks * blkW + (blks - 1) * BLOCK_GAP - (blks * CPB - rj45) * (RJ_W + RJ_COL_GAP)
    : 0);

  const trailItemWidths = [
    ...(mgmt ? [RJ_W] : []),
    ...(consolePort ? [RJ_W] : []),
    ...(usbPort ? [USB_W] : []),
    RST_W,
  ];
  const trailW = trailItemWidths.reduce((a, b) => a + b, 0) + (trailItemWidths.length - 1) * TRAIL_GAP;

  const portsRowW = totRjW + SECTION_GAP + trailW;
  const consoleW = Math.max(MIN_CONSOLE_W, Math.min(portsRowW * 0.3, MAX_CONSOLE_W));

  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + consoleW + SECTION_GAP + portsRowW;
  let bladeW = (RW - chassisW) / 2;
  let totW = RW;
  if (bladeW < MIN_BLADE_W) { bladeW = MIN_BLADE_W; totW = chassisW + bladeW * 2; }

  const rjX = bladeW + EAR_W + PANEL_PAD + consoleW + SECTION_GAP;
  const trailX = rjX + totRjW + SECTION_GAP;
  const mgmtX = trailX;
  const consoleJackX = mgmtX + (mgmt ? RJ_W + TRAIL_GAP : 0);
  const usbX = consoleJackX + (consolePort ? RJ_W + TRAIL_GAP : 0);
  const rstX = usbX + (usbPort ? USB_W + TRAIL_GAP : 0);
  const rjTop = (U1 - RJ_H) / 2;

  return { totRjW, trailW, consoleW, chassisW, bladeW, totW, rjX, mgmtX, consoleJackX, usbX, rstX, rjTop };
}

export function nacPorts(config: NacConfig, idPfx = 'nac-'): DeviceTemplate['ports'] {
  const rj45 = config.rj45Count ?? 4;
  const mgmt = config.mgmtPort !== false;
  const consolePort = config.consolePort !== false;
  const W = 350, H = 30;
  const { totW, rjX, mgmtX, consoleJackX, rjTop } = computeNacLayout(rj45, mgmt, consolePort, config.usbPort !== false);
  const sx = W / totW;
  const sy = H / U1;

  type PortEntry = Omit<PortData, 'deviceId' | 'connected' | 'cableId'>;
  const out: PortEntry[] = [];

  for (let n = 1; n <= rj45; n++) {
    const c = n - 1, b = Math.floor(c / CPB), ci = c % CPB;
    const blkW = CPB * RJ_W + (CPB - 1) * RJ_COL_GAP;
    const jx = rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP);
    out.push({
      id: `${idPfx}p${n}`, name: `Port ${n}`, type: 'rj45', speed: '1 Gbps',
      relativeX: (jx + RJ_W / 2) * sx, relativeY: (rjTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy,
    });
  }

  if (mgmt) {
    out.push({
      id: `${idPfx}mgmt`, name: 'MGMT', type: 'management', speed: '1 Gbps',
      relativeX: (mgmtX + RJ_W / 2) * sx, relativeY: (rjTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy, group: 'MGMT',
    });
  }
  if (consolePort) {
    out.push({
      id: `${idPfx}console`, name: 'Console', type: 'console', speed: '115.2 Kbps',
      relativeX: (consoleJackX + RJ_W / 2) * sx, relativeY: (rjTop + RJ_H / 2) * sy,
      portW: RJ_W * sx, portH: RJ_H * sy, group: 'MGMT',
    });
  }

  return out;
}

const LED_COLORS: Record<string, string> = {
  off: '#20262b', green: '#39ff8a', greenBlink: '#39ff8a',
  amber: '#ffb020', amberBlink: '#ffb020', blue: '#37b6ff',
  red: '#ff4d4d', white: '#f2f6ff',
};

function nacLed(parent: SVGElement, uid: string, cx: number, cy: number, state: string, r = 1.6): void {
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

export function renderNacPanel(
  template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number,
  connectedIds: Set<string> = new Set(),
): SVGGElement {
  const group = g('nac-panel');
  const config = (deviceData?.deviceConfig as NacConfig | undefined) ?? {};
  const skin = nacVendorSkin(config.vendor);
  const isLight = skin.tone === 'light';
  const accent = config.accentColor || skin.accent;
  const brandLabel = config.brandName || skin.brandName;
  const model = config.modelName || template?.model || 'NAC Appliance';

  const ports = (deviceData?.ports ?? template?.ports ?? []).filter(p => !p.id.includes('-ear-'));
  const rj45Count = ports.filter(p => p.type === 'rj45').length;
  const mgmtPortEntry = ports.find(p => p.type === 'management');
  const consolePortEntry = ports.find(p => p.type === 'console');
  const showMgmt = !!mgmtPortEntry;
  const showConsolePort = !!consolePortEntry;
  const showUsbPort = config.usbPort !== false;
  const showAssetLabel = !!config.assetLabel;
  const linkOn = config.ledTheme ?? 'green';
  const actOn = `${linkOn}Blink`;

  const { consoleW, chassisW, bladeW, totW, rjX, mgmtX, consoleJackX, usbX, rstX, rjTop } =
    computeNacLayout(rj45Count, showMgmt, showConsolePort, showUsbPort);

  const chassisX = bladeW;
  const consX = bladeW + EAR_W + PANEL_PAD;
  const uid = `nac${Math.random().toString(36).slice(2, 7)}`;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${U1}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  ns.setAttribute('role', 'img');
  ns.setAttribute('aria-label', `${brandLabel} ${model} NAC appliance`);

  const defs = el('defs');

  function linGrad(id: string, x2: string, y2: string, stops: [string, string][]) {
    const gr = el('linearGradient', { id, x1: '0', y1: '0', x2, y2 });
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

  const glowF = el('filter', { id: `glow-${uid}`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  const glowBlur = el('feGaussianBlur'); glowBlur.setAttribute('stdDeviation', '1.1'); glowBlur.setAttribute('result', 'b'); glowF.appendChild(glowBlur);
  const glowMrg = el('feMerge');
  const mn1 = el('feMergeNode'); mn1.setAttribute('in', 'b'); glowMrg.appendChild(mn1);
  const mn2 = el('feMergeNode'); mn2.setAttribute('in', 'SourceGraphic'); glowMrg.appendChild(mn2);
  glowF.appendChild(glowMrg); defs.appendChild(glowF);

  function addRjSym(symId: string) {
    const sym = el('symbol', { id: symId, viewBox: `0 0 ${RJ_W} ${RJ_H}` });
    sym.appendChild(el('rect', { x: 0.5, y: 0.5, width: RJ_W - 1, height: RJ_H - 1, rx: 2.5, fill: `url(#cage-${uid})`, stroke: '#05070a', 'stroke-width': 1 }));
    sym.appendChild(el('rect', { x: 1.5, y: 1.5, width: RJ_W - 3, height: RJ_H - 3, rx: 2, fill: 'none', stroke: `url(#cageLip-${uid})`, 'stroke-width': 1, opacity: 0.8 }));
    const mg = g();
    mg.setAttribute('transform', `translate(${RJ_W / 2} ${RJ_H / 2 + 3})`);
    const pd = 'M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z';
    const mp = el('path', { d: pd, fill: `url(#rjMouth-${uid})`, stroke: '#3a352a', 'stroke-width': 0.8 });
    mp.setAttribute('filter', `url(#innerShadow-${uid})`);
    mg.appendChild(mp);
    mg.appendChild(el('rect', { x: -8, y: -9, width: 16, height: 9, rx: 1, fill: '#4a4638', opacity: 0.55 }));
    for (let i = 0; i < 8; i++)
      mg.appendChild(el('rect', { x: -7.4 + i * 1.85, y: -9, width: 1.1, height: 6.5, fill: `url(#gold-${uid})`, rx: 0.3 }));
    sym.appendChild(mg); defs.appendChild(sym);
  }
  addRjSym(`rj45-${uid}`);

  ns.appendChild(defs);

  const txt = {
    label: isLight ? '#5a616a' : '#aeb6bd',
    mute: isLight ? '#8a9099' : '#8b939a',
  };
  const chassisStroke = isLight ? '#d4d7dc' : '#0c0f11';

  const chG = g(); chG.setAttribute('filter', `url(#ao-${uid})`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: config.panelColor || `url(#chassis-${uid})`, stroke: chassisStroke, 'stroke-width': 1.2 }));
  if (!isLight) {
    const chGrain = el('rect', { x: chassisX, y: 1, width: chassisW, height: U1 - 2, rx: 4, fill: 'transparent' });
    chGrain.setAttribute('filter', `url(#grain-${uid})`); chG.appendChild(chGrain);
  }
  chG.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: isLight ? '#fff' : '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  for (let side = 0; side < 2; side++) {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bendX = isLeft ? bladeW - 2.5 : bladeX;
    const bg = g(); bg.setAttribute('filter', `url(#ao-${uid})`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: U1, rx: 2.5, fill: config.panelColor || `url(#blade-${uid})`, stroke: chassisStroke, 'stroke-width': 1 }));
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

  const cy = U1 / 2;
  const con = g(); con.setAttribute('transform', `translate(${consX} 0)`);

  const statusLeds: [string, string][] = [['PWR', 'green'], ['SYS', 'greenBlink'], ['ALM', 'off']];
  for (let i = 0; i < statusLeds.length; i++) {
    const [lbl, state] = statusLeds[i];
    const ly = 24 + i * 24;
    nacLed(con, uid, 10, ly, state);
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

  const tp = el('text', { x: 62, y: cy + 25, 'font-size': 7, fill: txt.mute, 'letter-spacing': 1.2 });
  tp.textContent = 'NETWORK ACCESS CONTROL';
  con.appendChild(tp);

  ns.appendChild(con);

  if (showAssetLabel) {
    const ag = g(); ag.setAttribute('transform', `translate(${chassisX + chassisW - 46} ${U1 - 12})`);
    ag.appendChild(el('rect', { x: 0, y: 0, width: 42, height: 9, rx: 1.2, fill: isLight ? '#eef0f3' : '#0d1114', stroke: isLight ? '#c7cbd0' : '#33383d', 'stroke-width': 0.6 }));
    const at = el('text', { x: 21, y: 6.4, 'text-anchor': 'middle', 'font-size': 5, fill: txt.mute, 'letter-spacing': 0.3 });
    at.textContent = deviceData?.serialNumber ? `S/N ${deviceData.serialNumber}` : 'S/N —';
    ag.appendChild(at); ns.appendChild(ag);
  }

  const blkW = CPB * RJ_W + (CPB - 1) * RJ_COL_GAP;
  function rjPos(n: number) {
    const c = n - 1, b = Math.floor(c / CPB), ci = c % CPB;
    return { x: rjX + b * (blkW + BLOCK_GAP) + ci * (RJ_W + RJ_COL_GAP), y: rjTop };
  }

  for (let n = 1; n <= rj45Count; n++) {
    const { x, y } = rjPos(n);
    const portEntry = ports.filter(p => p.type === 'rj45')[n - 1];
    const connected = connectedIds.has(portEntry?.id ?? '');
    const linkState = connected ? linkOn : 'off';
    const actState = connected ? actOn : 'off';
    const pg = g(); pg.setAttribute('transform', `translate(${x} ${y})`);
    pg.setAttribute('role', 'button'); pg.setAttribute('tabindex', '0');
    pg.setAttribute('aria-label', `RJ45 port ${n}`);
    pg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#rj45-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    pg.appendChild(u);
    nacLed(pg, uid, 6, 5, linkState, 1.4);
    nacLed(pg, uid, RJ_W - 6, 5, actState, 1.4);
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    pg.appendChild(hov); ns.appendChild(pg);

    const t = el('text', { x: x + RJ_W / 2, y: y + RJ_H + 11, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: txt.label });
    t.setAttribute('pointer-events', 'none'); t.textContent = String(n); ns.appendChild(t);
  }

  if (showMgmt) {
    const connected = connectedIds.has(mgmtPortEntry?.id ?? '');
    const linkState = connected ? linkOn : 'off';
    const mg = g(); mg.setAttribute('transform', `translate(${mgmtX} ${rjTop})`);
    mg.setAttribute('role', 'button'); mg.setAttribute('tabindex', '0');
    mg.setAttribute('aria-label', 'MGMT port');
    mg.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#rj45-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    mg.appendChild(u);
    nacLed(mg, uid, 6, 5, linkState, 1.4);
    nacLed(mg, uid, RJ_W - 6, 5, linkState, 1.4);
    const tl = el('text', { x: RJ_W / 2, y: RJ_H + 11, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 600, fill: accent });
    tl.setAttribute('pointer-events', 'none'); tl.textContent = 'MGMT'; mg.appendChild(tl);
    const hov = el('rect', { x: 0, y: 0, width: RJ_W, height: RJ_H, rx: 2.5, fill: accent, opacity: 0 });
    hov.setAttribute('class', `hov-${uid}`); hov.setAttribute('pointer-events', 'none');
    mg.appendChild(hov);
    ns.appendChild(mg);
  }

  if (showConsolePort) {
    const connected = connectedIds.has(consolePortEntry?.id ?? '');
    const cg2 = g(); cg2.setAttribute('transform', `translate(${consoleJackX} ${rjTop})`);
    cg2.setAttribute('role', 'button'); cg2.setAttribute('tabindex', '0');
    cg2.setAttribute('aria-label', 'Console port');
    cg2.setAttribute('style', 'cursor:pointer;outline:none');
    const u = el('use'); u.setAttribute('href', `#rj45-${uid}`); u.setAttribute('width', String(RJ_W)); u.setAttribute('height', String(RJ_H));
    cg2.appendChild(u);
    nacLed(cg2, uid, RJ_W / 2, 5, connected ? 'blue' : 'off', 1.4);
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

  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.14}g[role="button"]:focus-visible .hov-${uid}{opacity:.22}@keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}@keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}.blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}.pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.blink-${uid},.pulse-${uid}{animation:none}}`;
  ns.appendChild(style);

  group.appendChild(ns);
  return group;
}
