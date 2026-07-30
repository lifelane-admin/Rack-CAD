// src/renderers/pdu-renderer.ts
import { el, g, drawLed } from './rack-kit';
import type { DeviceTemplate, DeviceData, SocketType, PduConfig, PduOutletGroup } from '../core/types';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';

type PduTier = 'basic' | 'metered' | 'smart';

/** Legacy fallback for devices with no explicit `config.category` set yet. */
function inferTierFromName(template: DeviceTemplate | null): PduTier {
  const text = `${template?.name ?? ''} ${template?.model ?? ''}`.toLowerCase();
  if (text.includes('smart')) return 'smart';
  if (text.includes('metered')) return 'metered';
  return 'basic';
}

const TIER_BY_CATEGORY: Record<string, PduTier> = {
  basic: 'basic',
  metered: 'metered',
  meteredOutlet: 'metered',
  switched: 'metered',
  managed: 'metered',
  smart: 'smart',
  intelligent: 'smart',
  monitored: 'smart',
  highDensity: 'smart',
};

function tierFor(config: PduConfig, template: DeviceTemplate | null): PduTier {
  if (config.category && TIER_BY_CATEGORY[config.category]) return TIER_BY_CATEGORY[config.category];
  return inferTierFromName(template);
}

/** Safe cast + default for a device/template's untyped `deviceConfig` bag. */
function asPduConfig(config: unknown): PduConfig {
  return (config && typeof config === 'object') ? (config as PduConfig) : {};
}

interface FinishPreset { hi: string; mid: string; lo: string; text: string; texture?: boolean; }

const FINISH: Record<string, FinishPreset> = {
  'ral9005-texture': { hi:'#2a2a2a', mid:'#0f0f0f', lo:'#050505', text:'#e8eaec', texture:true },
  black:             { hi:'#3a3d40', mid:'#1c1e20', lo:'#0d0e10', text:'#e8eaec' },
  darkGrey:          { hi:'#54585c', mid:'#33373b', lo:'#1e2124', text:'#f0f2f4' },
  lightGrey:         { hi:'#c8ccd0', mid:'#a4a9ae', lo:'#7d8287', text:'#1a1c1e' },
  white:             { hi:'#ffffff', mid:'#eceef0', lo:'#c9cccf', text:'#1a1c1e' },
  brushedAluminium:  { hi:'#e8eaec', mid:'#c9ccce', lo:'#9fa3a6', text:'#1a1c1e' },
};

function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x + (p > 0 ? 255 - x : x) * p)));
  return '#' + [f(r), f(gr), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 128;
}

/** Resolves the enclosure finish, including the live "custom RAL / hex" swatch. */
function finishFor(config: PduConfig): FinishPreset {
  const enc = config.enclosure ?? {};
  if (enc.finish === 'customRal' && enc.customHex) {
    const hex = enc.customHex;
    return { hi: shade(hex, 0.25), mid: hex, lo: shade(hex, -0.35), text: isDark(hex) ? '#e8eaec' : '#1a1c1e' };
  }
  return FINISH[enc.finish ?? 'ral9005-texture'] ?? FINISH['ral9005-texture'];
}

interface ManufacturerStyle { accent: string; cornerRadius: number; }
const MANUFACTURERS: Record<string, ManufacturerStyle> = {
  apc:     { accent: '#5cb85c', cornerRadius: 3 },
  vertiv:  { accent: '#00a3e0', cornerRadius: 1.5 },
  generic: { accent: '#37b6ff', cornerRadius: 2 },
};

/** Draws the manufacturer's wordmark/badge, or nothing when branding is turned off. */
function drawBranding(parent: SVGElement, x: number, y: number, config: PduConfig, scale = 1): void {
  if (config.branding === 'none') return;
  const mfr = config.manufacturer ?? 'generic';
  const grp = el('g', { transform: `translate(${x} ${y}) scale(${scale})` });
  if (mfr === 'apc' && config.branding !== 'rackSlicer') {
    grp.appendChild(el('rect', { x: 0, y: 0, width: 30, height: 9, rx: 1.2, fill: '#e2231a' }));
    const t = el('text', { x: 15, y: 7, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#fff', 'font-family': 'Arial,sans-serif' });
    t.textContent = 'APC'; grp.appendChild(t);
  } else if (mfr === 'vertiv' && config.branding !== 'rackSlicer') {
    const t = el('text', { x: 0, y: 7, 'font-size': 7.5, 'font-weight': 700, fill: '#00a3e0', 'font-family': 'Arial,sans-serif' });
    t.textContent = 'Vertiv'; grp.appendChild(t);
  } else {
    const t = el('text', { x: 0, y: 7, 'font-size': 7, 'font-weight': 700, fill: MANUFACTURERS[mfr]?.accent ?? '#37b6ff', 'letter-spacing': 0.8 });
    t.textContent = 'RACK SLICER'; grp.appendChild(t);
  }
  parent.appendChild(grp);
}

/** Draws model/voltage/current/serial/warning label lines per the `labels` chip set. */
function drawLabelBlock(parent: SVGElement, x: number, y: number, config: PduConfig, template: DeviceTemplate | null, textColor: string): number {
  const labels = config.labels ?? ['model', 'voltage', 'current'];
  const elec = config.electrical ?? {};
  const parts: string[] = [];
  if (labels.includes('model')) parts.push(template?.model ?? 'PDU');
  if (labels.includes('voltage') && elec.voltage) parts.push(`${elec.voltage}V`);
  if (labels.includes('current') && elec.currentA) parts.push(`${elec.currentA}A`);
  let ly = y;
  if (parts.length) {
    const t = el('text', { x, y: ly, 'font-size': 5.5, fill: textColor, opacity: 0.75, 'letter-spacing': 0.3 });
    t.textContent = parts.join(' · '); parent.appendChild(t);
    ly += 8;
  }
  if (labels.includes('serial') && template) {
    const t = el('text', { x, y: ly, 'font-size': 4.6, fill: textColor, opacity: 0.5, 'font-family': 'monospace' });
    t.textContent = `SN:${template.id.slice(0, 10).toUpperCase()}`; parent.appendChild(t);
    ly += 7;
  }
  if (labels.includes('warning')) {
    const wg = el('g', { transform: `translate(${x} ${ly - 4})` });
    wg.appendChild(el('polygon', { points: '4,0 8,7 0,7', fill: '#ffb547' }));
    const wt = el('text', { x: 4, y: 6, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 700, fill: '#1a1c1e' });
    wt.textContent = '!'; wg.appendChild(wt);
    parent.appendChild(wg);
    ly += 9;
  }
  return ly;
}

/** Compact MCB (breaker) toggle-switch widget; `withGuard` draws a translucent safety-guard cover. */
function drawMcb(parent: SVGElement, x: number, y: number, curve: string, current: number, withGuard: boolean, vertical: boolean, maxH = 20): void {
  const w = vertical ? 14 : 10, h = vertical ? 22 : Math.max(14, Math.min(maxH, 20));
  const grp = el('g', { transform: `translate(${x} ${y})` });
  grp.appendChild(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 1, fill: '#26282b', stroke: '#000', 'stroke-width': 0.5 }));
  grp.appendChild(el('rect', { x: -w / 2 + 1.5, y: -h / 2 + 2, width: w - 3, height: h * 0.6, rx: 0.6, fill: '#0a0b0c' }));
  grp.appendChild(el('rect', { x: -w * 0.18, y: -h / 2 + 3, width: w * 0.36, height: h * 0.45, rx: 0.5, fill: '#d8d8d8', stroke: '#000', 'stroke-width': 0.3 }));
  const lbl = el('text', { x: 0, y: h / 2 - 2, 'text-anchor': 'middle', 'font-size': 3.2, 'font-weight': 700, fill: '#c9c9c9', 'font-family': 'monospace' });
  lbl.textContent = `${curve}${current}`;
  grp.appendChild(lbl);
  if (withGuard) {
    grp.appendChild(el('rect', { x: -w / 2 - 1, y: -h / 2 - 1, width: w + 2, height: h + 2, rx: 1.5, fill: '#c8d4de', stroke: '#7893a8', 'stroke-width': 0.4, opacity: 0.45 }));
  }
  parent.appendChild(grp);
}

/** Small labeled connector box for a network-port chip (rj45/sfp/usb/usbC/serial/console/microUsb). */
function drawNetPort(parent: SVGElement, uid: string, x: number, y: number, kind: string): void {
  const SPEC: Record<string, { w: number; h: number; label: string; pin: string }> = {
    rj45:     { w: 11, h: 9, label: 'ETH', pin: '#c8b060' },
    sfp:      { w: 13, h: 9, label: 'SFP', pin: '#3a4d5c' },
    usb:      { w: 11, h: 5, label: 'USB', pin: '#0a0b0c' },
    usbC:     { w: 9,  h: 4, label: 'USB-C', pin: '#2a3540' },
    console:  { w: 11, h: 9, label: 'CON', pin: '#c8b060' },
    serial:   { w: 13, h: 6, label: 'RS232', pin: '#3a4d5c' },
    microUsb: { w: 7,  h: 3, label: 'µUSB', pin: '#2a3540' },
  };
  const s = SPEC[kind] ?? SPEC.usb;
  const grp = el('g', { transform: `translate(${x} ${y})` });
  grp.appendChild(el('rect', { x: 0, y: 0, width: s.w, height: s.h, rx: 1.2, fill: '#1c2024', stroke: '#05070a', 'stroke-width': 0.6 }));
  grp.appendChild(el('rect', { x: 1, y: 1, width: s.w - 2, height: s.h - 2, rx: 0.6, fill: s.pin, opacity: 0.75 }));
  if (kind === 'sfp') drawLed(grp, uid, s.w - 1.5, 1.5, '#39ff8a', true, 0.8);
  const t = el('text', { x: s.w / 2, y: s.h + 4.5, 'text-anchor': 'middle', 'font-size': 3, fill: '#7b838a' });
  t.textContent = s.label; grp.appendChild(t);
  parent.appendChild(grp);
}

/** Small icon for an environmental sensor chip. */
function drawEnvSensor(parent: SVGElement, x: number, y: number, kind: string): void {
  const LABEL: Record<string, string> = { temp: 'T°', humidity: 'RH', smoke: 'SMK', door: 'DOOR', leak: 'H₂O' };
  const grp = el('g', { transform: `translate(${x} ${y})` });
  grp.appendChild(el('rect', { x: 0, y: 0, width: 14, height: 7, rx: 1, fill: '#171d24', stroke: '#23303b', 'stroke-width': 0.5 }));
  grp.appendChild(el('circle', { cx: 3, cy: 3.5, r: 1.2, fill: '#37b6ff' }));
  const t = el('text', { x: 15.5, y: 5.5, 'font-size': 3.6, fill: '#8b939a' });
  t.textContent = LABEL[kind] ?? kind; grp.appendChild(t);
  parent.appendChild(grp);
}

/** Small icon for a wireless chip (wifi/bluetooth). */
function drawWirelessIcon(parent: SVGElement, x: number, y: number, kind: string): void {
  const grp = el('g', { transform: `translate(${x} ${y})` });
  if (kind === 'wifi') {
    [2.5, 4.2, 5.9].forEach((r, i) => {
      grp.appendChild(el('path', { d: `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`, fill: 'none', stroke: '#37b6ff', 'stroke-width': 0.7, opacity: 0.4 + i * 0.25 }));
    });
    grp.appendChild(el('circle', { cx: 0, cy: 1, r: 0.9, fill: '#37b6ff' }));
    const t = el('text', { x: 0, y: 10, 'text-anchor': 'middle', 'font-size': 3.4, fill: '#8b939a' });
    t.textContent = 'WiFi'; grp.appendChild(t);
  } else {
    grp.appendChild(el('path', { d: 'M0 -4 L2.5 -2 L0 0 L2.5 2 L0 4 M0 -4 L0 4', fill: 'none', stroke: '#37b6ff', 'stroke-width': 0.8 }));
    const t = el('text', { x: 0, y: 10, 'text-anchor': 'middle', 'font-size': 3.4, fill: '#8b939a' });
    t.textContent = 'BT'; grp.appendChild(t);
  }
  parent.appendChild(grp);
}

/** Compact trailing icon row for network ports (non-rj45)/env sensors/wireless — drawn on horizontal
 *  PDUs only when the chassis is tall enough (2U+) to have spare room below the socket row. */
function drawExtraFeatureRow(parent: SVGElement, uid: string, x: number, y: number, config: PduConfig): void {
  let cx = x;
  (config.networkPorts ?? []).filter(p => p !== 'rj45').forEach(p => {
    drawNetPort(parent, uid, cx, y, p);
    cx += 22;
  });
  (config.envSensors ?? []).forEach(s => {
    drawEnvSensor(parent, cx, y + 2, s);
    cx += 24;
  });
  (config.wireless ?? []).forEach(w => {
    drawWirelessIcon(parent, cx + 4, y + 4, w);
    cx += 20;
  });
}

/** LED status strip for power/network/alarm/rgb (the per-outlet `'outlet'` LED is handled separately). */
function drawLedStrip(parent: SVGElement, uid: string, x: number, y: number, leds: string[], vertical: boolean): void {
  const COLORS: Record<string, string> = { power: '#37e07a', network: '#37b6ff', alarm: '#ff4d4d', rgb: '#c837ff' };
  const shown = leds.filter(l => l !== 'outlet' && COLORS[l]);
  shown.forEach((l, i) => {
    const cx = vertical ? x : x + i * 10;
    const cy = vertical ? y + i * 10 : y;
    drawLed(parent, uid, cx, cy, COLORS[l], true, 1.4);
  });
}

/** Draws the input plug shape at the cord tip, distinct per `inputPlug` selection. */
function drawInputPlug(parent: SVGElement, inputPlug: string | undefined): void {
  if (inputPlug === 'bs1363') {
    parent.appendChild(el('rect', { x: -5, y: -5, width: 10, height: 10, rx: 1.2, fill: '#f4f4f4', stroke: '#8a8a8a', 'stroke-width': 0.5 }));
    parent.appendChild(el('rect', { x: -1.5, y: -4, width: 3, height: 2.2, fill: '#e8b040' }));
    parent.appendChild(el('rect', { x: -3.5, y: -0.5, width: 2.2, height: 3, fill: '#e8b040' }));
    parent.appendChild(el('rect', { x: 1.3, y: -0.5, width: 2.2, height: 3, fill: '#e8b040' }));
  } else if (inputPlug === 'nema515') {
    parent.appendChild(el('rect', { x: -4.5, y: -4, width: 9, height: 8, rx: 4, fill: '#2a2a2a', stroke: '#000', 'stroke-width': 0.4 }));
    parent.appendChild(el('rect', { x: -2.2, y: -2, width: 1, height: 3, fill: '#c0c0c0' }));
    parent.appendChild(el('rect', { x: 1.2, y: -2, width: 1, height: 3, fill: '#c0c0c0' }));
    parent.appendChild(el('circle', { cx: 0, cy: 2, r: 0.7, fill: '#c0c0c0' }));
  } else if (inputPlug === 'iec60309-16a') {
    parent.appendChild(el('circle', { cx: 0, cy: 0, r: 3.5, fill: '#0a5fb0', stroke: '#063a6e', 'stroke-width': 0.4 }));
    parent.appendChild(el('circle', { cx: 0, cy: 0, r: 1.6, fill: '#03203d' }));
  } else {
    // iec60309-32a (default) — larger blue commando plug
    parent.appendChild(el('circle', { cx: 0, cy: 0, r: 4.4, fill: '#0a5fb0', stroke: '#063a6e', 'stroke-width': 0.5 }));
    parent.appendChild(el('circle', { cx: 0, cy: 0, r: 2.2, fill: '#03203d' }));
  }
}

/**
 * Draws a short strain-relief stub + the input plug shape, inset near the edge indicated by
 * `cableEntry`. Every PDU panel is drawn inside a nested `<svg viewBox="0 0 W H">`, and nested
 * SVGs clip to their own viewport by default — so unlike the HTML reference (whose canvas is
 * much larger than the device itself), this MUST stay fully within 0..W / 0..H or it's invisible.
 */
function drawCord(parent: SVGElement, W: number, H: number, cableEntry: string | undefined, cordCsa = 6, inputPlug?: string, marginOverride?: number): void {
  const margin = marginOverride ?? Math.max(9, Math.min(W, H) * 0.35);
  const stub = Math.min(4, margin * 0.4);
  let ex = W / 2, ey = margin, dx = 0, dy = -stub;
  if (cableEntry === 'bottom') { ex = W / 2; ey = H - margin; dx = 0; dy = stub; }
  else if (cableEntry === 'left') { ex = margin; ey = H / 2; dx = -stub; dy = 0; }
  else if (cableEntry === 'right') { ex = W - margin; ey = H / 2; dx = stub; dy = 0; }
  const thickness = 1 + cordCsa * 0.12;
  const grp = el('g', { transform: `translate(${ex} ${ey})` });
  grp.appendChild(el('line', { x1: 0, y1: 0, x2: dx, y2: dy, stroke: '#0f0f0f', 'stroke-width': thickness, 'stroke-linecap': 'round' }));
  const plugGrp = el('g', { transform: `translate(${dx * 1.3} ${dy * 1.3})` });
  drawInputPlug(plugGrp, inputPlug);
  grp.appendChild(plugGrp);
  parent.appendChild(grp);
}

/** Sums live wattage + which outlet indices are actually cabled, by walking real cables against
 *  this PDU's `outlet-<deviceId>-<idx>` virtual-port convention (see app.ts's power-cable flow). */
export function computePduLoad(pduDeviceId: string): { watts: number; connectedOutlets: Set<number> } {
  const state = stateManager.getState();
  const connectedOutlets = new Set<number>();
  let watts = 0;
  const prefix = `outlet-${pduDeviceId}-`;
  for (const cable of state.cables) {
    const ends = [cable.sourcePortId, cable.destPortId];
    const outletEnd = ends.find(p => p && p.startsWith(prefix));
    if (!outletEnd) continue;
    const idx = parseInt(outletEnd.slice(prefix.length), 10);
    if (!Number.isNaN(idx)) connectedOutlets.add(idx);
    const otherEnd = outletEnd === cable.sourcePortId ? cable.destPortId : cable.sourcePortId;
    if (otherEnd && !otherEnd.startsWith('outlet-')) {
      const otherPort = stateManager.getPort(otherEnd);
      if (otherPort) {
        const dev = stateManager.getDevice(otherPort.deviceId);
        const tmpl = dev ? getTemplate(dev.templateId) : undefined;
        watts += dev?.powerWatts ?? tmpl?.powerWatts ?? 0;
      }
    }
  }
  return { watts, connectedOutlets };
}

/** Normalizes `config.composition` (new) or the legacy `config.rows`/`template.outletConfig` shapes into one list. */
function normalizeComposition(config: PduConfig, fallback: Array<{ socketType: SocketType; count: number }> | undefined): PduOutletGroup[] {
  const raw = (config.composition as PduOutletGroup[] | undefined)
    ?? (config as unknown as { rows?: Array<{ type?: string; socketType?: string; count: number }> }).rows;
  if (Array.isArray(raw) && raw.length) {
    return raw.map(r => ({ type: ((r as any).type ?? (r as any).socketType ?? 'C13') as SocketType, count: r.count }));
  }
  if (fallback?.length) return fallback.map(r => ({ type: r.socketType, count: r.count }));
  return [{ type: 'C13', count: 8 }];
}

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

  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  fGlow.appendChild(el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' }));
  const fMrg = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' })); fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fMrg); defs.appendChild(fGlow);

  if (finish.texture) {
    const fTex = el('filter', { id: `${uid}tex`, x: '0', y: '0', width: '100%', height: '100%' });
    fTex.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.8', numOctaves: '1', seed: '7' }));
    const cm = el('feColorMatrix', { values: '0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0.35 0' });
    fTex.appendChild(cm);
    fTex.appendChild(el('feComposite', { in2: 'SourceGraphic', operator: 'in' }));
    defs.appendChild(fTex);
  }

  ns.appendChild(defs);
}

/** Compact brand block (PWR LED + "RACK SLICER" wordmark + model, optionally + voltage/current) reused by both PDU layouts. */
function drawPduBrand(parent: SVGElement, uid: string, x: number, cy: number, textColor: string, model: string, labelSuffix = ''): number {
  drawLed(parent, uid, x + 4, cy, '#39ff8a', true, 2.2);
  const brandTxt = el('text', { x: x + 11, y: cy - 3, 'font-size': 6.5, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 0.6 });
  brandTxt.textContent = 'RACK SLICER';
  parent.appendChild(brandTxt);
  const fullModel = model + labelSuffix;
  const modelTxt = el('text', { x: x + 11, y: cy + 7, 'font-size': 6, fill: textColor, opacity: 0.7, 'letter-spacing': 0.4 });
  modelTxt.textContent = fullModel;
  parent.appendChild(modelTxt);
  return x + 11 + Math.max(fullModel.length, 11) * 4.4;
}

/** Builds the " · 230V 32A" style suffix for drawPduBrand from the `labels`/`electrical` config. */
function labelSuffixFor(config: PduConfig): string {
  const labels = config.labels ?? ['model', 'voltage', 'current'];
  const elec = config.electrical ?? {};
  const parts: string[] = [];
  if (labels.includes('voltage') && elec.voltage) parts.push(`${elec.voltage}V`);
  if (labels.includes('current') && elec.currentA) parts.push(`${elec.currentA}A`);
  return parts.length ? ` · ${parts.join(' ')}` : '';
}

/** Compact digital meter readout for metered/smart PDUs; returns false if there isn't room to draw it. */
function drawPduMeter(parent: SVGElement, uid: string, x: number, cy: number, w: number, h: number, readingText: string, oled = false): boolean {
  if (w < 34) return false;
  const ledColor = oled ? '#4dd8ff' : '#39ff5a';
  parent.appendChild(el('rect', { x, y: cy - h / 2, width: w, height: h, rx: 2, fill: oled ? '#020a12' : '#020a06', stroke: oled ? '#0a1a2a' : '#0a2016', 'stroke-width': 1 }));
  const txt = el('text', { x: x + w / 2, y: cy + 3, 'text-anchor': 'middle', 'font-size': Math.min(h * 0.5, 11), 'font-weight': 700, fill: ledColor, 'font-family': 'monospace' });
  txt.setAttribute('filter', `url(#${uid}gw)`);
  txt.textContent = readingText;
  parent.appendChild(txt);
  return true;
}

function drawSocket(parent: SVGElement, uid: string, type: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  if (type === 'C13' || type === 'iec-c13') return drawC13(parent, uid, cx, cy, outletFace, rotationDeg);
  if (type === 'C19' || type === 'iec-c19') return drawC19(parent, uid, cx, cy, outletFace, rotationDeg);
  drawNema515(parent, uid, cx, cy, outletFace, rotationDeg);
}
function drawC13(parent: SVGElement, uid: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  const w = 17, h = 15;
  const surround = outletFace === 'white' ? '#efe9d8' : '#141618';
  const stroke = outletFace === 'white' ? '#a89f88' : '#000';
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rotationDeg})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  const path = el('path');
  path.setAttribute('d', `M ${-w/2} ${-h/2+2} Q ${-w/2} ${-h/2} ${-w/2+2} ${-h/2} L ${w/2-2} ${-h/2} Q ${w/2} ${-h/2} ${w/2} ${-h/2+2} L ${w/2} ${h/2-1} Q ${w/2} ${h/2} ${w/2-1} ${h/2} L ${-w/2+1} ${h/2} Q ${-w/2} ${h/2} ${-w/2} ${h/2-1} Z`);
  path.setAttribute('fill', surround); path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', '0.3');
  grp.appendChild(path);
  grp.appendChild(el('rect', { x: -w/2+1.4, y: -h/2+1.4, width: w-2.8, height: h-2.8, rx: 1.2, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -4.4, y: -4.1, width: 2.2, height: 3.9, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: 2.2,  y: -4.1, width: 2.2, height: 3.9, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.3, y:  1.1, width: 2.6, height: 3.4, rx: 0.4, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -0.9, y:  1.5, width: 1.8, height: 1.1, fill: `url(#${uid}brass)`, opacity: 0.55 }));
  parent.appendChild(grp);
}
function drawC19(parent: SVGElement, uid: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  const w = 22, h = 18;
  const surround = outletFace === 'white' ? '#efe9d8' : '#141618';
  const stroke = outletFace === 'white' ? '#a89f88' : '#000';
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rotationDeg})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  grp.appendChild(el('rect', { x: -w/2, y: -h/2, width: w, height: h, rx: 2.2, fill: surround, stroke, 'stroke-width': 0.3 }));
  grp.appendChild(el('rect', { x: -w/2+1.8, y: -h/2+1.8, width: w-3.6, height: h-3.6, rx: 1.5, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -5.5, y: -4.6, width: 2.8, height: 5,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x:  2.7, y: -4.6, width: 2.8, height: 5,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.8, y:  1.6, width: 3.6, height: 4,   rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x: -1.2, y:  2.2, width: 2.4, height: 1.4, fill: `url(#${uid}brass)`, opacity: 0.55 }));
  parent.appendChild(grp);
}
function drawNema515(parent: SVGElement, uid: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  const w = 20, h = 20;
  const surround = outletFace === 'white' ? '#efe9d8' : '#141618';
  const stroke = outletFace === 'white' ? '#a89f88' : '#000';
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rotationDeg})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  grp.appendChild(el('rect', { x: -w/2, y: -h/2, width: w, height: h, rx: 2.5, fill: surround, stroke, 'stroke-width': 0.3 }));
  grp.appendChild(el('circle', { cx: 0, cy: 0, r: w/2-2, fill: `url(#${uid}pit)` }));
  grp.appendChild(el('rect', { x: -4, y: -6.5, width: 2.5, height: 4.5, rx: 0.6, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('rect', { x:  1.5, y: -6.5, width: 2.5, height: 4.5, rx: 0.6, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  grp.appendChild(el('circle', { cx: 0, cy: 4.5, r: 1.8, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
  parent.appendChild(grp);
}

function socketWidth(type: string): number {
  if (type === 'C19' || type === 'iec-c19') return 22;
  if (type === 'NEMA-5-15') return 20;
  return 17;
}
function socketHeight(type: string): number {
  if (type === 'C19' || type === 'iec-c19') return 18;
  if (type === 'NEMA-5-15') return 20;
  return 15;
}

/**
 * Smart-tier status cluster: SSL/DHCP indicators, a larger digital meter,
 * 1-2 Ethernet management ports, and a FUNCTION button. Distinguishes "smart"
 * PDUs from the plain metered readout drawn by drawPduMeter(). Returns false
 * (drawing nothing) if there isn't enough width/height, so the caller can
 * fall back to the compact meter instead.
 */
function drawSmartPduPanel(parent: SVGElement, uid: string, x: number, cy: number, w: number, h: number, readingText: string, showLan: boolean, oled = false): boolean {
  const METER_W = 44;
  const LAN_W = 24;
  const FUNC_W = 14;
  const ledColW = 26;
  const minW = ledColW + METER_W + 8 + (showLan ? LAN_W : 0) + FUNC_W;
  if (w < minW || h < 24) return false;
  const ledColor = oled ? '#4dd8ff' : '#39ff5a';
  const ledLblColor = oled ? '#1a5a7a' : '#2a8a4a';

  let cx = x;

  // SSL / DHCP indicator LEDs
  drawLed(parent, uid, cx + 3, cy - 6, '#ffb020', true, 1.6);
  const sslTxt = el('text', { x: cx + 8, y: cy - 3.5, 'font-size': 5.5, fill: '#aeb6bd' });
  sslTxt.textContent = 'SSL';
  parent.appendChild(sslTxt);
  drawLed(parent, uid, cx + 3, cy + 6, '#39ff8a', true, 1.6);
  const dhcpTxt = el('text', { x: cx + 8, y: cy + 8.5, 'font-size': 5.5, fill: '#aeb6bd' });
  dhcpTxt.textContent = 'DHCP';
  parent.appendChild(dhcpTxt);
  cx += ledColW;

  // Digital meter readout
  parent.appendChild(el('rect', { x: cx, y: cy - 10, width: METER_W, height: 20, rx: 2, fill: oled ? '#020a12' : '#020a06', stroke: oled ? '#0a1a2a' : '#0a2016', 'stroke-width': 1 }));
  const meterTxt = el('text', { x: cx + METER_W / 2, y: cy + 3, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: ledColor, 'font-family': 'monospace' });
  meterTxt.setAttribute('filter', `url(#${uid}gw)`);
  meterTxt.textContent = readingText;
  parent.appendChild(meterTxt);
  const meterLbl = el('text', { x: cx + METER_W / 2, y: cy + 9.5, 'text-anchor': 'middle', 'font-size': 4, fill: ledLblColor, 'letter-spacing': 1 });
  meterLbl.textContent = 'METER';
  parent.appendChild(meterLbl);
  cx += METER_W + 8;

  // Ethernet management ports (mini RJ45s) — 1 or 2 depending on remaining width
  const remaining = w - (cx - x);
  const lanCount = !showLan ? 0 : remaining >= LAN_W * 2 + FUNC_W + 4 ? 2 : remaining >= LAN_W + FUNC_W ? 1 : 0;
  for (let i = 0; i < lanCount; i++) {
    const lx = cx + i * LAN_W;
    parent.appendChild(el('rect', { x: lx, y: cy - 7, width: 20, height: 14, rx: 1.6, fill: '#1c2024', stroke: '#05070a', 'stroke-width': 0.8 }));
    parent.appendChild(el('rect', { x: lx + 1.5, y: cy - 5.5, width: 17, height: 11, rx: 1, fill: '#0d1013' }));
    drawLed(parent, uid, lx + 4, cy - 4.5, i === 0 ? '#39ff8a' : '#20262b', i === 0, 1);
    const lanTxt = el('text', { x: lx + 10, y: cy + 10.5, 'text-anchor': 'middle', 'font-size': 4.5, fill: '#7b838a' });
    lanTxt.textContent = `LAN${i + 1}`;
    parent.appendChild(lanTxt);
  }
  cx += lanCount * LAN_W + (lanCount ? 6 : 0);

  // FUNCTION button
  if (w - (cx - x) >= FUNC_W) {
    parent.appendChild(el('circle', { cx: cx + 6, cy, r: 6, fill: '#1a1d20', stroke: '#3a4147', 'stroke-width': 1 }));
    parent.appendChild(el('circle', { cx: cx + 4.5, cy: cy - 1.5, r: 1.4, fill: '#5b6268', opacity: 0.6 }));
  }

  return true;
}

/** Formats a wattage reading the way the reference's live meter does — auto W/kW with a fixed reading. */
function formatMeterReading(watts: number, asAmps: boolean, voltage: number): string {
  if (asAmps) {
    const amps = voltage > 0 ? watts / voltage : 0;
    return `${amps.toFixed(1)}A`;
  }
  if (watts < 1000) return `${Math.round(watts)}W`;
  return `${(watts / 1000).toFixed(2)}kW`;
}

function renderConfiguredPdu(
  template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number,
): SVGGElement {
  const group = g('pdu-panel');
  const uid = `pdu${Math.random().toString(36).slice(2, 7)}_`;
  const config = asPduConfig(deviceData?.deviceConfig);
  const finish = finishFor(config);
  const composition = normalizeComposition(config, template?.outletConfig);
  const tier = tierFor(config, template);
  const mfrStyle = MANUFACTURERS[config.manufacturer ?? 'generic'];
  const { watts, connectedOutlets } = deviceData ? computePduLoad(deviceData.id) : { watts: 0, connectedOutlets: new Set<number>() };
  const smartFeatures = config.smartFeatures ?? [];
  const leds = config.leds ?? ['power'];
  const showLedDot = leds.includes('outlet');
  const asAmps = smartFeatures.includes('currentMon') || smartFeatures.includes('powerMeter');

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns, uid, finish);

  ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: mfrStyle.cornerRadius, fill: `url(#${uid}pf)`, stroke: finish.lo, 'stroke-width': 1 }));
  if (finish.texture) ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: mfrStyle.cornerRadius, fill: 'transparent', filter: `url(#${uid}tex)` }));
  ns.appendChild(el('rect', { x: 2, y: 2.5, width: W - 4, height: 1.5, rx: 0.75, fill: finish.hi, opacity: 0.4 }));
  ns.appendChild(el('rect', { x: 2, y: 2, width: 2.5, height: H - 4, rx: 1, fill: mfrStyle.accent, opacity: 0.85 }));

  const cy = H / 2;
  const brandEndX = drawPduBrand(ns, uid, 4, cy, finish.text, template?.model ?? 'PDU', labelSuffixFor(config));
  drawLedStrip(ns, uid, brandEndX + 6, 5, leds, false);

  const totalSocketW = composition.reduce((sum, r) => sum + socketWidth(r.type) * r.count, 0);
  const allSockets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));

  const shownLedCount = leds.filter(l => l !== 'outlet').length;
  const hasBreaker = !!config.breaker && config.breaker !== 'none';
  const MCB_RESERVED_W = 20;
  const afterLedsX = brandEndX + 6 + (shownLedCount ? shownLedCount * 10 + 4 : 0);
  const startX = afterLedsX + (hasBreaker ? MCB_RESERVED_W : 0);
  const SMART_PANEL_W = 132;
  const BASIC_METER_W = 46;
  let meterW = tier === 'smart' ? SMART_PANEL_W : tier === 'metered' ? BASIC_METER_W : 0;
  let meterGap = meterW ? 10 : 0;
  const minSocketArea = totalSocketW + Math.max(allSockets.length - 1, 0) * 2;
  let showMeter = meterW > 0 && (W - startX - meterGap - meterW - 8) >= minSocketArea;
  if (tier === 'smart' && !showMeter) {
    meterW = BASIC_METER_W;
    meterGap = 10;
    showMeter = (W - startX - meterGap - meterW - 8) >= minSocketArea;
  }
  const socketArea = (showMeter ? W - meterW - meterGap : W) - startX - 8;

  const spacing = allSockets.length > 1
    ? Math.min(6, (socketArea - totalSocketW) / (allSockets.length - 1))
    : 0;

  const pduDeviceId = deviceData?.id ?? '';
  if (pduDeviceId) ns.setAttribute('data-pdu-device-id', pduDeviceId);

  const outletFace = config.enclosure?.outletFace ?? 'black';
  const rotSetting = config.sockets?.rotationDeg;
  const layoutRows = ({ single: 1, dual: 2, triple: 3 } as Record<string, number>)[config.sockets?.layout ?? 'single'] ?? 1;
  const perRow = Math.max(1, Math.ceil(allSockets.length / layoutRows));
  const rowH = (H - 8) / layoutRows;

  let cx = startX + socketWidth(allSockets[0] ?? 'C13') / 2;
  let lastRow = 0;
  allSockets.forEach((sockType, i) => {
    const row = Math.floor(i / perRow);
    if (row !== lastRow) { cx = startX + socketWidth(sockType) / 2; lastRow = row; }
    const rowCy = layoutRows > 1 ? (4 + rowH * row + rowH / 2) : cy;
    const rot = rotSetting === 'alternate' ? (i % 2 ? 180 : 0) : (typeof rotSetting === 'number' ? rotSetting : 0);
    const sw = socketWidth(sockType);
    const isConnected = connectedOutlets.has(i);
    drawSocket(ns, uid, sockType, cx, rowCy, outletFace, rot);
    if (isConnected) {
      ns.appendChild(el('circle', { cx, cy: rowCy, r: socketHeight(sockType) / 2 + 1.5, fill: 'none', stroke: '#37e07a', 'stroke-width': 0.8, opacity: 0.7 }));
    }
    if (showLedDot) {
      drawLed(ns, uid, cx + sw / 2 - 2, rowCy - socketHeight(sockType) / 2 - 1, isConnected ? '#37e07a' : '#39ff8a', true, 1);
    }
    if (pduDeviceId) {
      const hit = el('rect', { x: cx - sw / 2 - 1, y: rowCy - socketHeight(sockType) / 2 - 1, width: sw + 2, height: socketHeight(sockType) + 2, fill: 'transparent' });
      hit.setAttribute('class', 'pdu-outlet-hit');
      hit.setAttribute('data-outlet-idx', String(i));
      ns.appendChild(hit);
    }
    cx += sw + spacing;
  });

  if (showMeter) {
    const oled = smartFeatures.includes('oled');
    const readingText = formatMeterReading(watts, asAmps, config.electrical?.voltage ?? 230);
    const showLan = !config.networkPorts || config.networkPorts.includes('rj45');
    const drewSmart = tier === 'smart' && meterW === SMART_PANEL_W
      && drawSmartPduPanel(ns, uid, W - meterW - 6, cy, meterW, H, readingText, showLan, oled);
    if (!drewSmart) {
      drawPduMeter(ns, uid, W - meterW - 6, cy, meterW, Math.min(H - 8, 20), readingText, oled);
    }
  }

  drawBranding(ns, W - 40, H - 9, config, 0.8);
  drawMcbIfConfigured(ns, config, afterLedsX, cy, false, H - 6);
  if (H >= 40) drawExtraFeatureRow(ns, uid, 4, H - 16, config);
  drawCord(ns, W, H, config.cableEntry, config.cordCsa ?? 6, config.inputPlug);

  group.appendChild(ns);
  return group;
}

function drawMcbIfConfigured(parent: SVGElement, config: PduConfig, x: number, y: number, vertical: boolean, maxH = 20): void {
  if (!config.breaker || config.breaker === 'none') return;
  drawMcb(parent, x + 5, y, config.mcbCurve ?? 'D', config.electrical?.currentA ?? 32, config.breaker === 'mcb-guarded', vertical, maxH);
}

function renderGenericPdu(template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number): SVGGElement {
  const group = g('pdu-panel');
  const uid = `gpdu${Math.random().toString(36).slice(2, 7)}_`;
  const chY = 2, chH = H - 4, cy = chY + chH / 2;
  const config = asPduConfig(deviceData?.deviceConfig);
  const tier = tierFor(config, template);
  const { watts, connectedOutlets } = deviceData ? computePduLoad(deviceData.id) : { watts: 0, connectedOutlets: new Set<number>() };
  const asAmps = (config.smartFeatures ?? []).includes('currentMon') || (config.smartFeatures ?? []).includes('powerMeter');

  const defs = el('defs');
  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  fGlow.appendChild(el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' }));
  const fMrg = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' })); fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fMrg); defs.appendChild(fGlow);
  group.appendChild(defs);

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1a1e', stroke: '#111', 'stroke-width': 1 }));

  const pduDeviceId = deviceData?.id ?? '';
  if (pduDeviceId) group.setAttribute('data-pdu-device-id', pduDeviceId);

  const brandEndX = drawPduBrand(group, uid, 4, cy, '#e8eaec', template?.model ?? 'PDU', labelSuffixFor(config));
  const hasBreaker = !!config.breaker && config.breaker !== 'none';
  const MCB_RESERVED_W = 20;
  const startX = brandEndX + 8 + (hasBreaker ? MCB_RESERVED_W : 0);

  const SMART_PANEL_W = 132;
  const BASIC_METER_W = 46;
  let meterW = tier === 'smart' ? SMART_PANEL_W : tier === 'metered' ? BASIC_METER_W : 0;
  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20, outletH = chH - 10, outletY = chY + 5;
  const outletsW = c13Ports.length * (outletW + 4);
  let showMeter = meterW > 0 && (W - startX - 8 - meterW - 10) >= outletsW;
  if (tier === 'smart' && !showMeter) {
    meterW = BASIC_METER_W;
    showMeter = (W - startX - 8 - meterW - 10) >= outletsW;
  }
  const meterX = W - meterW - 6;

  c13Ports.forEach((_, i) => {
    const ax = startX + i * (outletW + 4);
    const isConnected = connectedOutlets.has(i);
    group.appendChild(el('rect', { x: ax, y: outletY, width: outletW, height: outletH, rx: 2, fill: '#0a0a0f', stroke: isConnected ? '#37e07a' : '#333', 'stroke-width': isConnected ? 1.2 : 0.7 }));
    const contactY = outletY + outletH - 8;
    [ax + 4, ax + 8.5, ax + 13].forEach(cxPos => {
      group.appendChild(el('rect', { x: cxPos, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
    });
    if ((config.leds ?? ['power']).includes('outlet')) {
      drawLed(group, uid, ax + outletW - 3, outletY - 2, isConnected ? '#37e07a' : '#39ff8a', true, 1);
    }
    if (pduDeviceId) {
      const hit = el('rect', { x: ax, y: outletY, width: outletW, height: outletH, fill: 'transparent' });
      hit.setAttribute('class', 'pdu-outlet-hit');
      hit.setAttribute('data-outlet-idx', String(i));
      group.appendChild(hit);
    }
  });

  if (showMeter) {
    const oled = (config.smartFeatures ?? []).includes('oled');
    const readingText = formatMeterReading(watts, asAmps, config.electrical?.voltage ?? 230);
    const showLan = !config.networkPorts || config.networkPorts.includes('rj45');
    const drewSmart = tier === 'smart' && meterW === SMART_PANEL_W
      && drawSmartPduPanel(group, uid, meterX, cy, meterW, chH, readingText, showLan, oled);
    if (!drewSmart) drawPduMeter(group, uid, meterX, cy, meterW, Math.min(chH - 4, 20), readingText, oled);
  }

  drawMcbIfConfigured(group, config, brandEndX + 8, cy, false, chH - 6);
  if (chH >= 40) drawExtraFeatureRow(group, uid, 4, H - 16, config);
  drawCord(group, W, H, config.cableEntry, config.cordCsa ?? 6, config.inputPlug);

  return group;
}

export function renderPduPanel(
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,
  W: number,
  H: number,
): SVGGElement {
  const config = asPduConfig(deviceData?.deviceConfig);
  if (config.composition || (deviceData?.deviceConfig as any)?.rows) return renderConfiguredPdu(template, deviceData, W, H);
  return renderGenericPdu(template, deviceData, W, H);
}

function drawSocketFacePlate(
  parent: SVGElement,
  cx: number,
  cy: number,
  ow: number,
  oh: number,
  sockType: SocketType,
  isConnected: boolean,
  outletFace: 'white' | 'black' = 'black',
): void {
  const strokeColor = isConnected ? '#37e07a' : (outletFace === 'white' ? '#a89f88' : '#2a3036');
  const strokeW = isConnected ? 1.2 : 0.6;
  const halfW = ow / 2;
  const halfH = oh / 2;

  // Face plate background (shared by all types)
  const face = el('rect', {
    x: cx - halfW, y: cy - halfH,
    width: ow, height: oh,
    rx: 1.5,
    fill: outletFace === 'white' ? '#efe9d8' : '#141618',
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
  deviceData: DeviceData | null = null,
): SVGGElement {
  const group = g('side-pdu');

  const uid = `spdu${Math.random().toString(36).slice(2, 7)}_`;
  const config = asPduConfig(deviceData?.deviceConfig);
  const finish = finishFor(config);
  const mfrStyle = MANUFACTURERS[config.manufacturer ?? 'generic'];
  const { watts, connectedOutlets } = deviceData ? computePduLoad(deviceData.id) : { watts: 0, connectedOutlets: new Set<number>() };
  const elec = config.electrical ?? {};
  const voltage = elec.voltage ?? 230;
  const amps = voltage > 0 ? watts / voltage : 0; // side-strip LCD always reads amps, matching its native "0.0A / 0W" layout

  // Create inner SVG element using el()
  const ns = el('svg', { width: pduWidth, height: stripH });
  ns.setAttribute('viewBox', `0 0 ${pduWidth} ${stripH}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns as unknown as SVGSVGElement, uid, finish);

  if (deviceData) ns.setAttribute('data-pdu-device-id', deviceData.id);

  // Chassis background
  ns.appendChild(el('rect', { x: 0, y: 0, width: pduWidth, height: stripH, rx: mfrStyle.cornerRadius, fill: `url(#${uid}ps)`, stroke: finish.lo, 'stroke-width': 1 }));
  ns.appendChild(el('rect', { x: 1, y: 1, width: pduWidth - 2, height: stripH - 2, rx: 1.5, fill: 'none', stroke: '#3a4147', 'stroke-width': 0.5, opacity: 0.4 }));
  ns.appendChild(el('rect', { x: 1, y: 1, width: 2, height: stripH - 2, fill: mfrStyle.accent, opacity: 0.85 }));

  // LCD panel at top — live voltage/current reading + model
  const lcdH = 28;
  ns.appendChild(el('rect', { x: 3, y: 6, width: pduWidth - 6, height: lcdH, rx: 2, fill: '#005f73' }));

  const lcdTxt = el('text', { x: pduWidth / 2, y: 16, 'text-anchor': 'middle', 'font-size': 5, fill: '#a2d2ff', 'font-family': 'monospace', 'font-weight': 'bold' });
  lcdTxt.textContent = template.model ?? 'PDU';
  ns.appendChild(lcdTxt);

  const lcdA = el('text', { x: pduWidth / 2, y: 25, 'text-anchor': 'middle', 'font-size': 4.5, fill: '#7ab8d4', 'font-family': 'monospace' });
  lcdA.textContent = `${amps.toFixed(1)}A / ${Math.round(watts)}W`;
  ns.appendChild(lcdA);

  let headerBottom = lcdH + 12;

  // MCB / breaker widget, LED strip, wireless/env-sensor icons, and branding all live in the
  // header zone above the outlets — matching the reference's "header grows with content" behavior.
  if (config.breaker && config.breaker !== 'none') {
    drawMcbIfConfigured(ns, config, pduWidth / 2, headerBottom + 10, true);
    headerBottom += 22;
  }
  const leds = (config.leds ?? ['power']).filter(l => l !== 'outlet');
  if (leds.length) {
    drawLedStrip(ns, uid, pduWidth / 2 - (leds.length - 1) * 5, headerBottom + 4, leds, false);
    headerBottom += 10;
  }
  const envSensors = config.envSensors ?? [];
  envSensors.forEach((s, i) => drawEnvSensor(ns, (pduWidth - 14) / 2, headerBottom + 2 + i * 9, s));
  if (envSensors.length) headerBottom += envSensors.length * 9 + 2;
  const wireless = config.wireless ?? [];
  wireless.forEach((w, i) => drawWirelessIcon(ns, pduWidth / 2, headerBottom + 6 + i * 14, w));
  if (wireless.length) headerBottom += wireless.length * 14 + 4;
  const netPorts = (config.networkPorts ?? []).filter(p => p !== 'rj45');
  if (netPorts.length) {
    netPorts.forEach((p, i) => drawNetPort(ns, uid, (pduWidth - 12) / 2, headerBottom + 2 + i * 13, p));
    headerBottom += netPorts.length * 13 + 2;
  }

  // Outlets — composition (per-instance, live) falls back to the catalog template's default
  const composition = normalizeComposition(config, template.outletConfig);
  const allOutlets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));

  const outletAreaTop = headerBottom + 6;
  const footerH = 8;
  const outletAreaH = stripH - outletAreaTop - footerH;
  const outletSpacing = outletAreaH / Math.max(allOutlets.length, 1);
  const outletCx = pduWidth / 2;
  const showLedDot = (config.leds ?? []).includes('outlet');
  const outletFace = config.enclosure?.outletFace ?? 'black';
  const rotSetting = config.sockets?.rotationDeg;

  allOutlets.forEach((sockType, i) => {
    const oy = outletAreaTop + i * outletSpacing + outletSpacing / 2;
    const isConnected = connectedOutlets.has(i);
    const ow = Math.min(pduWidth - 6, sockType === 'C19' ? 22 : 18);
    const oh = Math.min(outletSpacing - 2, 14);
    const rot = rotSetting === 'alternate' ? (i % 2 ? 180 : 0) : (typeof rotSetting === 'number' ? rotSetting : 0);

    // Outlet face plate with distinct socket graphic per type — rotated via a wrapper group
    // since drawSocketFacePlate appends many absolute-positioned children directly.
    const outletTarget = rot
      ? (() => { const wrap = el('g', { transform: `rotate(${rot} ${outletCx} ${oy})` }); ns.appendChild(wrap); return wrap; })()
      : (ns as unknown as SVGElement);
    drawSocketFacePlate(outletTarget, outletCx, oy, ow, oh, sockType, isConnected, outletFace);
    if (showLedDot) {
      drawLed(ns as unknown as SVGElement, uid, outletCx + ow / 2 + 4, oy, isConnected ? '#37e07a' : '#39ff8a', true, 1.1);
    }

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

  // Footer: labels + branding
  drawLabelBlock(ns as unknown as SVGElement, 3, stripH - 40, config, template, '#8b939a');
  drawBranding(ns as unknown as SVGElement, 3, stripH - 6, config, 0.55);
  drawCord(ns as unknown as SVGElement, pduWidth, stripH, config.cableEntry, config.cordCsa ?? 6, config.inputPlug, 4);

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
