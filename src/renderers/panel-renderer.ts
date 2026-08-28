import type { DeviceCategory, DeviceTemplate, DeviceData, KvmConfig } from '../core/types';
import { renderSwitchPanel } from './switch-renderer';
import { renderFirewallPanel } from './firewall-renderer';
import { renderPduPanel } from './pdu-renderer';
import { renderNacPanel } from './nac-renderer';
import { renderAtsPanel } from './ats-renderer';
import { makeConnectorDefs, drawSfpPort } from './rack-kit';
import { renderNetworkingPanel } from './networking-renderer';

// ─── Port geometry constants ─────────────────────────────────────────────────
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

// Legacy fallback for router-core (2U, 8× QSFP28 + MGMT + CON) — the reference
// catalog's WAN/LAN/DMZ/HA group system doesn't model high-speed QSFP core routers.
function renderCoreRouterPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('router-panel');
  const defs = el('defs');
  const gradId = `rtr-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);
  const uid = `rtp${Math.random().toString(36).slice(2, 7)}`;
  makeConnectorDefs(group, uid);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 50, chH - 8, 'READY');

  const qsfp = (template?.ports ?? []).filter(p => p.type === 'qsfp28');
  const sfpH = Math.min(chH - 6, 26);
  const sfpTopY = chY + Math.round((chH - sfpH) / 2);
  const portX = STATUS_END + 64;
  qsfp.forEach((_, i) => { drawSfpPort(group, uid, portX + i * 52, sfpTopY, { w: 44, h: sfpH, label: `Q${i + 1}` }); });

  return group;
}

function renderUpsPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('ups-panel');
  const uid = `ups${Math.random().toString(36).slice(2, 7)}`;
  const chY = 2, chH = H - 4, cy = chY + chH / 2;

  const defs = el('defs');
  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  fGlow.appendChild(el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' }));
  const fMrg = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' })); fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fMrg); defs.appendChild(fGlow);
  group.appendChild(defs);

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1c29', stroke: '#111', 'stroke-width': 1 }));

  const vaMatch = template?.name.match(/(\d+)\s*VA/i);
  const va = vaMatch ? parseInt(vaMatch[1], 10) : 750;
  const model = template?.model ?? 'UPS';
  const loadPct = Math.min(0.85, va / 8000);

  // ── Brand block + status LEDs (left) ─────────────────────────────────────
  // Fixed ~20% of chassis width — the LCD (VA/voltage/runtime readout) and load/battery bars
  // to the right get the remaining ~80%, matching the same split used for PDUs/switches/etc.
  const brandW = Math.max(60, Math.min(75, W * 0.2));
  const ledLbls: [string, string][] = [['LINE', 'green'], ['BATT', 'off'], ['FAULT', 'off'], ['LOAD', 'amber']];
  const ledColor: Record<string, string> = { green: '#39ff8a', amber: '#ffb020', off: '#20262b' };
  const rowGap = Math.min(13, (chH - 12) / ledLbls.length);
  ledLbls.forEach(([lbl, state], i) => {
    const ly = chY + 8 + i * rowGap;
    const on = state !== 'off';
    const dot = el('circle', { cx: 8, cy: ly, r: 2.2, fill: ledColor[state] });
    if (on) dot.setAttribute('filter', `url(#${uid}gw)`);
    group.appendChild(el('circle', { cx: 8, cy: ly, r: 3, fill: '#04060a', stroke: '#2a3036', 'stroke-width': 0.4 }));
    group.appendChild(dot);
    const t = el('text', { x: 15, y: ly + 2.5, 'font-size': 6, fill: '#aeb6bd', 'letter-spacing': 0.4 });
    t.textContent = lbl;
    group.appendChild(t);
  });
  // Brand/model text shrink to fit brandW instead of assuming a fixed ~50px is always
  // available — at the tightened 20% target that space is narrower than the old 27% gave.
  const textAvailW = Math.max(brandW - 42 - 3, 20);
  const brandFontSize = Math.max(4.5, Math.min(7, textAvailW / (11 * 0.62)));
  const brandTxt = el('text', { x: 42, y: chY + 10, 'font-size': brandFontSize, 'font-weight': 700, fill: '#ff8a3f', 'letter-spacing': 0.6 });
  brandTxt.textContent = 'RACK SLICER'; group.appendChild(brandTxt);
  const modelMaxChars = Math.max(3, Math.floor(textAvailW / (6.5 * 0.58)));
  const modelTxt = el('text', { x: 42, y: chY + 20, 'font-size': 6.5, fill: '#8b939a' });
  modelTxt.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  group.appendChild(modelTxt);

  // ── LCD (center): VA, voltage, runtime ───────────────────────────────────
  const lcdX = brandW + 6;
  const lcdW = Math.max(70, Math.min(120, W * 0.32));
  const lcdH = Math.min(chH - 6, 34);
  const lcdY = cy - lcdH / 2;
  group.appendChild(el('rect', { x: lcdX, y: lcdY, width: lcdW, height: lcdH, rx: 3, fill: '#04120a', stroke: '#0a1f14', 'stroke-width': 1.2 }));
  const vaTxt = el('text', { x: lcdX + 6, y: lcdY + lcdH * 0.45, 'font-size': Math.min(lcdH * 0.4, 13), 'font-weight': 700, fill: '#39ff5a', 'font-family': 'monospace' });
  vaTxt.setAttribute('filter', `url(#${uid}gw)`);
  vaTxt.textContent = `${va} VA`; group.appendChild(vaTxt);
  if (lcdH > 24) {
    const ioTxt = el('text', { x: lcdX + 6, y: lcdY + lcdH - 6, 'font-size': 6, fill: '#2a8a5a', 'font-family': 'monospace' });
    ioTxt.textContent = `RUNTIME ${Math.round(8 + va / 300)}m`;
    group.appendChild(ioTxt);
  }

  // ── LOAD / BATTERY segmented bars (right) ────────────────────────────────
  const barsX = lcdX + lcdW + 10;
  const barsW = W - barsX - 6;
  if (barsW > 40) {
    const segCount = 10;
    const segGap = 1.5;
    const segW = (barsW - (segCount - 1) * segGap) / segCount;
    const barH = Math.min((chH - 12) / 2 - 3, 10);
    const rowLoadY = cy - barH - 2;
    const rowBatY = cy + 2;
    for (let i = 0; i < segCount; i++) {
      const active = i / segCount < loadPct;
      const col = i < 6 ? '#39ff5a' : i < 8 ? '#ffb020' : '#ff4d4d';
      group.appendChild(el('rect', { x: barsX + i * (segW + segGap), y: rowLoadY, width: segW, height: barH, rx: 1, fill: active ? col : '#1a1f24', opacity: active ? 0.95 : 0.5 }));
    }
    for (let i = 0; i < segCount; i++) {
      group.appendChild(el('rect', { x: barsX + i * (segW + segGap), y: rowBatY, width: segW, height: barH, rx: 1, fill: i < 9 ? '#39ff5a' : '#1a1f24', opacity: i < 9 ? 0.95 : 0.5 }));
    }
  }

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

function renderCableManagerPanel(template: DeviceTemplate | null, W: number, H: number, deviceData?: DeviceData | null): SVGGElement {
  const group = g('cable-mgr-panel');
  const chY = 2;
  const chH = H - 4;
  const panelFill = deviceData?.color || template?.color || '#151518';
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: panelFill, stroke: '#111', 'stroke-width': 1 }));

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
  deviceData: DeviceData | null,
  deviceWidth: number,
  deviceHeight: number,
  connectedPortIndices: Set<number> = new Set(),
  connectedPortIds: Set<string> = new Set(),
): SVGGElement {
  switch (category) {
    case 'switch':        return renderSwitchPanel(template, deviceWidth, deviceHeight, connectedPortIndices, deviceData ?? undefined);
    case 'server':        return renderServerPanel(template, deviceWidth, deviceHeight);
    case 'firewall':      return renderFirewallPanel(template, deviceData, deviceWidth, deviceHeight, connectedPortIds);
    case 'router': {
      const hasQsfp = template?.ports.some(p => p.type === 'qsfp28') ?? false;
      if (hasQsfp) return renderCoreRouterPanel(template, deviceWidth, deviceHeight);
      const portCount = template?.ports.length ?? 4;
      return renderNetworkingPanel('router', portCount, undefined, template?.model ?? 'Router', deviceWidth, deviceHeight, deviceData?.ports ?? [], connectedPortIds);
    }
    case 'patch-panel': {
      const isFiber = template?.ports.some(p => p.type === 'sfp' || p.type === 'sfp-plus') ?? false;
      const portCount = template?.ports.length ?? 24;
      return renderNetworkingPanel(isFiber ? 'patch-fiber' : 'patch-cat6', portCount, undefined, template?.model ?? 'Patch Panel', deviceWidth, deviceHeight, deviceData?.ports ?? [], connectedPortIds);
    }
    case 'pdu': return renderPduPanel(template, deviceData, deviceWidth, deviceHeight);
    case 'nac': return renderNacPanel(template, deviceData, deviceWidth, deviceHeight, connectedPortIds);
    case 'ats': return renderAtsPanel(template, deviceData, deviceWidth, deviceHeight, connectedPortIds);
    case 'ups':           return renderUpsPanel(template, deviceWidth, deviceHeight);
    case 'storage':       return renderStoragePanel(template, deviceWidth, deviceHeight);
    case 'console': {
      const isKvm = template?.id.startsWith('kvm') ?? false;
      // Both KVM and plain console-server templates' `template.ports`/`deviceData.ports` also
      // include the customizable local peripheral group (see KvmConfig) — only the
      // TARGETS/SERIAL-group count belongs in `portCount` here, since buildGroups() derives the
      // local group entirely from the config itself.
      const targetGroupLabel = isKvm ? 'TARGETS' : 'SERIAL';
      const targetsCount = deviceData?.ports?.filter(p => p.group === targetGroupLabel).length
        || template?.ports.filter(p => p.group === targetGroupLabel).length || 8;
      const localConfig = deviceData?.deviceConfig as KvmConfig | undefined;
      return renderNetworkingPanel(isKvm ? 'kvm' : 'console', targetsCount, undefined, template?.model ?? 'Console', deviceWidth, deviceHeight, deviceData?.ports ?? [], connectedPortIds, localConfig);
    }
    case 'blank-panel':   return renderBlankPanel(deviceWidth, deviceHeight);
    case 'cooling':       return renderCoolingPanel(template, deviceWidth, deviceHeight);
    case 'cable-manager': return renderCableManagerPanel(template, deviceWidth, deviceHeight, deviceData);
    default: {
      const fallback = g('fallback-panel');
      fallback.appendChild(el('rect', { x: 0, y: 2, width: deviceWidth, height: deviceHeight - 4, rx: 1, fill: '#1b1b22', stroke: '#111', 'stroke-width': 1 }));
      return fallback;
    }
  }
}
