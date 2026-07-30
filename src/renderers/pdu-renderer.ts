// src/renderers/pdu-renderer.ts
import { el, g, drawLed, iecShroudPath, IEC_CONTACTS } from './rack-kit';
import type { DeviceTemplate, DeviceData, SocketType, PduConfig, PduOutletGroup } from '../core/types';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';
import {
  normalizeComposition, socketWidth, socketHeight, meterTierFor,
  computeConfiguredPduLayout, computeGenericPduLayout,
  computeSidePduHeaderBottom, computeSidePduOutletPositions,
  DISPLAY_FEATURES,
} from './pdu-layout';

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

/** Real RJ45 jack shape (cage + keyed trapezoid mouth + gold pins) — same silhouette as the
 *  switch/networking panel renderers' Ethernet ports, at PDU network-port-row scale, reusing
 *  the `${uid}pit`/`${uid}brass` gradients already set up by makePduDefs(). Used for both the
 *  'rj45' and 'console' network-port chips (real console ports are RJ45-shaped too). */
function drawRj45Jack(parent: SVGElement, uid: string, x: number, y: number, label: string): void {
  const w = 11, h = 9;
  const grp = el('g', { transform: `translate(${x} ${y})` });
  grp.appendChild(el('rect', { x: 0.3, y: 0.3, width: w - 0.6, height: h - 0.6, rx: 1.6, fill: '#15181b', stroke: '#05070a', 'stroke-width': 0.6 }));
  grp.appendChild(el('rect', { x: 0.9, y: 0.9, width: w - 1.8, height: h - 1.8, rx: 1.2, fill: 'none', stroke: '#3a4147', 'stroke-width': 0.4, opacity: 0.8 }));
  const mg = el('g', { transform: `translate(${w / 2} ${h / 2 + 1})` });
  mg.appendChild(el('path', {
    d: 'M-4 -3 h8 v4 h-1.6 v1.3 a0.8 0.8 0 0 1 -0.8 0.8 h-1.6 a0.8 0.8 0 0 1 -0.8 -0.8 v-1.3 h-1.6 z',
    fill: `url(#${uid}pit)`, stroke: '#3a352a', 'stroke-width': 0.3,
  }));
  for (let i = 0; i < 8; i++) {
    mg.appendChild(el('rect', { x: -3.1 + i * 0.8, y: -3, width: 0.5, height: 2.6, fill: `url(#${uid}brass)`, opacity: 0.9 }));
  }
  grp.appendChild(mg);
  const t = el('text', { x: w / 2, y: h + 4.5, 'text-anchor': 'middle', 'font-size': 3, fill: '#7b838a' });
  t.textContent = label;
  grp.appendChild(t);
  parent.appendChild(grp);
}

/** Small labeled connector box for a network-port chip (sfp/usb/usbC/serial/microUsb); rj45 and
 *  console are handled by drawRj45Jack() instead, for the real jack shape. */
function drawNetPort(parent: SVGElement, uid: string, x: number, y: number, kind: string): void {
  if (kind === 'rj45') return drawRj45Jack(parent, uid, x, y, 'ETH');
  if (kind === 'console') return drawRj45Jack(parent, uid, x, y, 'CON');
  const SPEC: Record<string, { w: number; h: number; label: string; pin: string }> = {
    sfp:      { w: 13, h: 9, label: 'SFP', pin: '#3a4d5c' },
    usb:      { w: 11, h: 5, label: 'USB', pin: '#0a0b0c' },
    usbC:     { w: 9,  h: 4, label: 'USB-C', pin: '#2a3540' },
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

/** Compact trailing icon row for network ports/env sensors/wireless — drawn on horizontal
 *  PDUs only when the chassis is tall enough (2U+) to have spare room below the socket row. */
/** Trailing icon row for network ports/env sensors/wireless, confined to `maxX` (the left rail's
 *  right edge) so it can never spill into the outlet area — items beyond that are simply dropped
 *  rather than drawn over ports. */
function drawExtraFeatureRow(parent: SVGElement, uid: string, x: number, y: number, config: PduConfig, maxX: number): void {
  let cx = x;
  (config.networkPorts ?? []).forEach(p => {
    if (cx + 22 > maxX) return;
    drawNetPort(parent, uid, cx, y, p);
    cx += 22;
  });
  (config.envSensors ?? []).forEach(s => {
    if (cx + 24 > maxX) return;
    drawEnvSensor(parent, cx, y + 2, s);
    cx += 24;
  });
  (config.wireless ?? []).forEach(w => {
    if (cx + 20 > maxX) return;
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

/**
 * Everything that isn't an outlet — brand wordmark, model/spec subtitle, status LEDs, breaker,
 * live meter, and the manufacturer badge — stacked vertically inside the fixed-width left rail
 * (`railW`, from pduLeftRailWidth()). The remaining ~80% of the chassis is reserved purely for
 * outlet sockets, matching the reference PDU photo: branding/meter/breaker never carve space out
 * of the port area, they just shrink/truncate/stack to fit their own narrow column instead.
 */
function drawPduLeftRail(
  parent: SVGElement, uid: string, config: PduConfig, template: DeviceTemplate | null,
  railW: number, H: number, textColor: string,
  watts: number, showMeter: boolean, mcbShown: boolean,
): void {
  const oled = (config.smartFeatures ?? []).includes('oled');
  const voltage = config.electrical?.voltage ?? 230;
  const amps = voltage > 0 ? watts / voltage : 0;
  const leds = (config.leds ?? ['power']).filter(l => l !== 'outlet' && ['power', 'network', 'alarm', 'rgb'].includes(l));

  // Brand wordmark drawn exactly once — no second "RACK SLICER" stamp elsewhere in this rail.
  drawLed(parent, uid, 6, 6, '#39ff8a', true, 1.3);
  const brandFontSize = Math.max(3.6, Math.min(6, railW * 0.1));
  const brandTxt = el('text', { x: 11, y: 8, 'font-size': brandFontSize, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 0.1 });
  brandTxt.textContent = 'RACK SLICER';
  parent.appendChild(brandTxt);
  let y = 8 + brandFontSize * 0.4;

  // Model/spec subtitle — only when there's real room for it, so it never eats into the meter.
  if (H - y > 18) {
    const modelText = template?.model ?? 'PDU';
    const subFontSize = Math.max(3, Math.min(4.2, railW * 0.075));
    const maxChars = Math.max(6, Math.floor((railW - 6) / (subFontSize * 0.58)));
    const displaySub = modelText.length > maxChars ? modelText.slice(0, maxChars - 1) + '…' : modelText;
    const subTxt = el('text', { x: 5, y: y + subFontSize, 'font-size': subFontSize, fill: textColor, opacity: 0.6 });
    subTxt.textContent = displaySub;
    parent.appendChild(subTxt);
    y += subFontSize + 3;
  }

  // Status LED strip — lowest priority; only drawn if the meter/breaker below still has enough
  // room afterward, so the big V/A/W display always wins the remaining space.
  if (leds.length && H - y > 30) {
    drawLedStrip(parent, uid, 5, y + 3, leds, false);
    y += 8;
  }

  y += 2;
  const bottomH = Math.max(H - y - 3, 8);
  if (mcbShown && showMeter) {
    const mcbColW = Math.min(16, railW * 0.26);
    drawMcbIfConfigured(parent, config, 2, y + bottomH / 2, false, bottomH);
    const meterX = mcbColW + 4;
    drawPduMeter(parent, uid, meterX, y, Math.max(railW - meterX - 3, 20), bottomH, voltage, amps, watts, oled);
  } else if (showMeter) {
    drawPduMeter(parent, uid, 3, y, railW - 6, bottomH, voltage, amps, watts, oled);
  } else if (mcbShown) {
    drawMcbIfConfigured(parent, config, railW / 2 - 5, y + bottomH / 2, false, bottomH);
  }
}

/** Which of the 7 LCD segments (a=top, b=top-right, c=bottom-right, d=bottom, e=bottom-left,
 *  f=top-left, g=middle) are lit for each digit — the classic calculator/digital-meter font. */
const SEVEN_SEG: Record<string, string[]> = {
  '0': ['a','b','c','d','e','f'], '1': ['b','c'], '2': ['a','b','g','e','d'],
  '3': ['a','b','c','d','g'], '4': ['f','g','b','c'], '5': ['a','f','g','c','d'],
  '6': ['a','f','g','e','c','d'], '7': ['a','b','c'], '8': ['a','b','c','d','e','f','g'],
  '9': ['a','b','c','d','f','g'],
};

/** One 7-segment LCD-style digit glyph (real segments, not a font — no font install is possible
 *  in this offline environment), height `dh`, top-left at (x,y). Returns the glyph's width.
 *  Unlit segments are drawn very dim rather than omitted, matching the "ghost segment" look of
 *  a real digital display. */
function drawSevenSegDigit(parent: SVGElement, uid: string, x: number, y: number, digit: string, dh: number, color: string): number {
  const dw = dh * 0.56;
  const st = dh * 0.16;
  const on = new Set(SEVEN_SEG[digit] ?? []);
  const segs: Array<[string, number, number, number, number]> = [
    ['a', st * 0.5, 0, dw - st, st],
    ['b', dw - st, st * 0.5, st, dh / 2 - st * 0.75],
    ['c', dw - st, dh / 2 + st * 0.25, st, dh / 2 - st * 0.75],
    ['d', st * 0.5, dh - st, dw - st, st],
    ['e', 0, dh / 2 + st * 0.25, st, dh / 2 - st * 0.75],
    ['f', 0, st * 0.5, st, dh / 2 - st * 0.75],
    ['g', st * 0.5, dh / 2 - st * 0.5, dw - st, st],
  ];
  segs.forEach(([key, sx, sy, sw, sh]) => {
    const isOn = on.has(key);
    const r = el('rect', {
      x: x + sx, y: y + sy, width: Math.max(sw, 0.1), height: Math.max(sh, 0.1),
      rx: Math.min(st, sw, sh) * 0.35, fill: color, opacity: isOn ? 1 : 0.12,
    });
    if (isOn) r.setAttribute('filter', `url(#${uid}gw)`);
    parent.appendChild(r);
  });
  return dw;
}

/** Draws a full digital-meter reading ("450V", "12.5A", "3000W") centered at (cx,cy) — the
 *  numeric part as real 7-segment glyphs, any trailing unit letters as a smaller plain
 *  monospace suffix. `dh` is the digit glyph height. */
function drawSevenSegReading(parent: SVGElement, uid: string, cx: number, cy: number, text: string, dh: number, color: string): void {
  const dw = dh * 0.56;
  const gap = dh * 0.18;
  const dotW = dh * 0.18;
  const digitPart = text.match(/^[\d.]+/)?.[0] ?? '';
  const suffix = text.slice(digitPart.length);
  const chars = digitPart.split('');
  const charW = (ch: string) => (ch === '.' ? dotW : dw);
  const digitsW = chars.reduce((sum, ch, i) => sum + charW(ch) + (i > 0 ? gap : 0), 0);
  const suffixW = suffix.length * dh * 0.52;
  const totalW = digitsW + (suffix ? gap + suffixW : 0);

  let x = cx - totalW / 2;
  const y = cy - dh / 2;
  chars.forEach((ch, i) => {
    if (i > 0) x += gap;
    if (ch === '.') {
      parent.appendChild(el('circle', { cx: x + dotW / 2, cy: y + dh - dh * 0.1, r: dh * 0.09, fill: color }));
    } else {
      drawSevenSegDigit(parent, uid, x, y, ch, dh, color);
    }
    x += charW(ch);
  });
  if (suffix) {
    x += gap;
    const t = el('text', {
      x, y: cy + dh * 0.32,
      'font-size': dh * 0.62, 'font-family': "'Consolas','Courier New',monospace", 'font-weight': 700,
      fill: color, opacity: 0.85,
    });
    t.textContent = suffix;
    parent.appendChild(t);
  }
}

/**
 * Digital meter box showing Voltage, Current, and Wattage as 3 stacked 7-segment lines — never
 * just one of the three, and never anything else drawn on top of it (it owns its full (x,y,w,h)
 * box exclusively). Digit height auto-shrinks to whatever room is actually available so it never
 * overlaps neighboring rail content (brand/subtitle/LEDs/breaker above/beside it).
 */
function drawPduMeter(parent: SVGElement, uid: string, x: number, y: number, w: number, h: number, voltage: number, amps: number, watts: number, oled = false): void {
  const ledColor = oled ? '#4dd8ff' : '#39ff5a';
  parent.appendChild(el('rect', { x, y, width: w, height: h, rx: 2, fill: oled ? '#020a12' : '#020a06', stroke: oled ? '#0a1a2a' : '#0a2016', 'stroke-width': 1 }));

  const lines = [`${Math.round(voltage)}V`, `${Math.round(amps)}A`, `${Math.round(watts)}W`];
  const lineH = h / 3;
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  const digitCount = longest.match(/^[\d.]+/)?.[0].length ?? longest.length;
  const suffixCount = longest.length - digitCount;
  const widthPerDh = digitCount * 0.74 + (suffixCount ? 0.7 + suffixCount * 0.52 : 0);
  const dh = Math.max(2.6, Math.min(lineH * 0.72, (w - 4) / Math.max(widthPerDh, 1)));

  lines.forEach((txt, i) => {
    const lineCy = y + lineH * i + lineH / 2;
    drawSevenSegReading(parent, uid, x + w / 2, lineCy, txt, dh, ledColor);
  });
}

function drawSocket(parent: SVGElement, uid: string, type: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  if (type === 'C13' || type === 'iec-c13') return drawC13(parent, uid, cx, cy, outletFace, rotationDeg);
  if (type === 'C19' || type === 'iec-c19') return drawC19(parent, uid, cx, cy, outletFace, rotationDeg);
  drawNema515(parent, uid, cx, cy, outletFace, rotationDeg);
}
/** Draws the IEC 60320 pentagon shroud (shared shape) centered at (cx,cy), sized w x h. */
function drawIecShroud(parent: SVGElement, uid: string, cx: number, cy: number, w: number, h: number, outletFace: 'white' | 'black' = 'black'): void {
  const surround = outletFace === 'white' ? '#efe9d8' : '#141618';
  const stroke = outletFace === 'white' ? '#a89f88' : '#383b42';
  parent.appendChild(el('path', { d: iecShroudPath(cx, cy, w, h), fill: surround, stroke, 'stroke-width': 0.3 }));
  parent.appendChild(el('path', { d: iecShroudPath(cx, cy, w - 2.6, h - 2.6), fill: `url(#${uid}pit)`, stroke: '#050505', 'stroke-width': 0.25 }));
}

/** Draws the Live/Neutral (top) + Earth (bottom) vertical slot contacts of a C13 female
 *  receptacle onto a w x h IEC shroud centered at (cx,cy). */
function drawIecFemaleSlots(parent: SVGElement, cx: number, cy: number, w: number, h: number): void {
  const slotW = w * 0.09, slotH = h * 0.26;
  [IEC_CONTACTS.live, IEC_CONTACTS.neutral, IEC_CONTACTS.earth].forEach(({ dx, dy }) => {
    parent.appendChild(el('rect', {
      x: cx + dx * w - slotW / 2, y: cy + dy * h - slotH / 2, width: slotW, height: slotH, rx: slotW * 0.3,
      fill: '#050506', stroke: '#000', 'stroke-width': 0.25,
    }));
  });
}

function drawC13(parent: SVGElement, uid: string, cx: number, cy: number, outletFace: 'white' | 'black' = 'black', rotationDeg = 0): void {
  const w = 17, h = 15;
  const grp = el('g');
  grp.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rotationDeg})`);
  grp.setAttribute('filter', `url(#${uid}ss)`);
  drawIecShroud(grp, uid, 0, 0, w, h, outletFace);
  drawIecFemaleSlots(grp, 0, 0, w, h);
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
  {
    // Real C19 receptacles use horizontal (wide/short) blade slots, not vertical ones.
    const sw = 5, sh = 1.8;
    grp.appendChild(el('rect', { x: -6 - sw / 2, y: -4 - sh / 2, width: sw, height: sh, rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
    grp.appendChild(el('rect', { x:  6 - sw / 2, y: -4 - sh / 2, width: sw, height: sh, rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
    grp.appendChild(el('rect', { x: -sw / 2,     y:  3 - sh / 2, width: sw, height: sh, rx: 0.5, fill: '#050506', stroke: '#000', 'stroke-width': 0.25 }));
    grp.appendChild(el('rect', { x: -1.2,        y:  3 - sh / 2 + 0.3, width: 2.4, height: sh - 0.6, fill: `url(#${uid}brass)`, opacity: 0.55 }));
  }
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

function renderConfiguredPdu(
  template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number,
): SVGGElement {
  const group = g('pdu-panel');
  const uid = `pdu${Math.random().toString(36).slice(2, 7)}_`;
  const config = asPduConfig(deviceData?.deviceConfig);
  const finish = finishFor(config);
  const mfrStyle = MANUFACTURERS[config.manufacturer ?? 'generic'];
  const { watts, connectedOutlets } = deviceData ? computePduLoad(deviceData.id) : { watts: 0, connectedOutlets: new Set<number>() };
  const leds = config.leds ?? ['power'];
  const showLedDot = leds.includes('outlet');

  // Single source of truth for the fixed left-rail width and outlet row auto-growth — the exact
  // same function core/state.ts's getPortWorldPosition() uses to resolve where a power cable
  // should connect to this PDU's outlets, so the two can never drift apart.
  const layout = computeConfiguredPduLayout(template, config, W, H);
  const { positions, allSockets, leftW, showMeter, mcbShown, cy } = layout;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns, uid, finish);

  ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: mfrStyle.cornerRadius, fill: `url(#${uid}pf)`, stroke: finish.lo, 'stroke-width': 1 }));
  if (finish.texture) ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: mfrStyle.cornerRadius, fill: 'transparent', filter: `url(#${uid}tex)` }));
  ns.appendChild(el('rect', { x: 2, y: 2.5, width: W - 4, height: 1.5, rx: 0.75, fill: finish.hi, opacity: 0.4 }));
  ns.appendChild(el('rect', { x: 2, y: 2, width: 2.5, height: H - 4, rx: 1, fill: mfrStyle.accent, opacity: 0.85 }));

  drawPduLeftRail(ns, uid, config, template, leftW, H, finish.text, watts, showMeter, mcbShown);

  const pduDeviceId = deviceData?.id ?? '';
  if (pduDeviceId) ns.setAttribute('data-pdu-device-id', pduDeviceId);

  const outletFace = config.enclosure?.outletFace ?? 'black';
  const rotSetting = config.sockets?.rotationDeg;

  allSockets.forEach((sockType, i) => {
    const { x: cx, y: rowCy } = positions[i];
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
  });

  if (H >= 40) drawExtraFeatureRow(ns, uid, 4, H - 16, config, leftW);

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
  const { watts, connectedOutlets } = deviceData ? computePduLoad(deviceData.id) : { watts: 0, connectedOutlets: new Set<number>() };

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

  // Single source of truth shared with core/state.ts's getPortWorldPosition() — see
  // computeConfiguredPduLayout's doc comment for why this matters.
  const layout = computeGenericPduLayout(template, config, W, H);
  const { positions, leftW, showMeter, mcbShown } = layout;

  drawPduLeftRail(group, uid, config, template, leftW, H, '#e8eaec', watts, showMeter, mcbShown);
  const outletW = 20, outletH = chH - 10, outletY = chY + 5;
  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');

  c13Ports.forEach((_, i) => {
    const ax = positions[i].x - outletW / 2;
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

  if (chH >= 40) drawExtraFeatureRow(group, uid, 4, H - 16, config, leftW);

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
  uid: string,
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

  // C13/C15 use the real IEC 60320 pentagon shroud (per New_Development/SVG - Power Plug
  // Types/C13.svg) instead of the generic rounded-rect face plate every other socket type uses.
  if (sockType === 'C13' || sockType === 'C15') {
    drawIecShroud(parent, uid, cx, cy, ow, oh, outletFace);
    if (isConnected) {
      parent.appendChild(el('path', { d: iecShroudPath(cx, cy, ow, oh), fill: 'none', stroke: strokeColor, 'stroke-width': strokeW }));
    }
    drawIecFemaleSlots(parent, cx, cy, ow, oh);
    if (sockType === 'C15') {
      // Notch (top edge, indicating the C15/C16 hot-equipment keying)
      parent.appendChild(el('rect', { x: cx - 1, y: cy - halfH + 0.5, width: 2, height: 2, fill: '#030304' }));
    }
    const lbl = el('text', {
      x: cx, y: cy + halfH + 3,
      'text-anchor': 'middle', 'font-size': 2.8,
      fill: isConnected ? '#37e07a' : '#5b636a',
      'font-family': 'monospace', 'pointer-events': 'none',
    });
    lbl.textContent = sockType;
    parent.appendChild(lbl);
    return;
  }

  // Face plate background (shared by all other types)
  const face = el('rect', {
    x: cx - halfW, y: cy - halfH,
    width: ow, height: oh,
    rx: 1.5,
    fill: outletFace === 'white' ? '#efe9d8' : '#141618',
    stroke: strokeColor,
    'stroke-width': strokeW,
  });
  parent.appendChild(face);

  // Inner socket graphic — distinct per type.
  if (sockType === 'C19') {
    // Real C19 receptacles use horizontal (wide/short) blade slots rather than round/oval holes.
    const sw = 3.4, sh = 1.6;
    parent.appendChild(el('rect', { x: cx - 5 - sw / 2, y: cy - 2.8 - sh / 2, width: sw, height: sh, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('rect', { x: cx + 5 - sw / 2, y: cy - 2.8 - sh / 2, width: sw, height: sh, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));
    parent.appendChild(el('rect', { x: cx - sw / 2,     y: cy + 2.6 - sh / 2, width: sw, height: sh, rx: 0.4, fill: '#030304', stroke: '#1a1a20', 'stroke-width': 0.3 }));

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

  // LCD panel at top — live voltage/current reading + model. Only drawn when a display-type
  // smart feature is actually selected (Power Meter/LCD/OLED/Energy Meter/Current/Voltage Mon.)
  // — matching how the horizontal PDU's meter is gated, so a PDU with none of those chips on
  // shows a plain outlet strip instead of an always-on readout no config could ever turn off.
  const smartFeatures = config.smartFeatures ?? [];
  const hasDisplay = smartFeatures.some(f => DISPLAY_FEATURES.includes(f));
  const oled = smartFeatures.includes('oled');
  let headerBottom = 10;
  if (hasDisplay) {
    // 3-line LED digital readout — Voltage / Current / Wattage stacked, matching a real smart
    // PDU's front display (bright monospace digits + glow on a black recessed screen), rather
    // than one small combined text line.
    const lcdH = 32;
    const ledColor = oled ? '#4dd8ff' : '#39ff5a';
    ns.appendChild(el('rect', { x: 3, y: 6, width: pduWidth - 6, height: lcdH, rx: 2, fill: '#04120a', stroke: '#000', 'stroke-width': 0.6 }));
    ns.appendChild(el('rect', { x: 4, y: 7, width: pduWidth - 8, height: lcdH - 2, rx: 1.5, fill: 'none', stroke: ledColor, 'stroke-width': 0.3, opacity: 0.2 }));

    const lines = [`${Math.round(voltage)}V`, `${Math.round(amps)}A`, `${Math.round(watts)}W`];
    const lineH = lcdH / 3;
    // Size digit glyphs to fit both the line height and the longest line's width (the widest
    // reading, e.g. "12500W", must still fit inside the narrowest vertical PDU chassis).
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
    const digitCount = longest.match(/^[\d.]+/)?.[0].length ?? longest.length;
    const suffixCount = longest.length - digitCount;
    const widthPerDh = digitCount * 0.74 + (suffixCount ? 0.7 + suffixCount * 0.52 : 0);
    const dh = Math.max(4, Math.min(lineH * 0.72, (pduWidth - 10) / Math.max(widthPerDh, 1)));
    lines.forEach((txt, i) => {
      const lineCy = 6 + lineH * i + lineH / 2;
      drawSevenSegReading(ns, uid, pduWidth / 2, lineCy, txt, dh, ledColor);
    });

    headerBottom = lcdH + 12;
  }

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
  const netPorts = config.networkPorts ?? [];
  if (netPorts.length) {
    netPorts.forEach((p, i) => drawNetPort(ns, uid, (pduWidth - 12) / 2, headerBottom + 2 + i * 13, p));
    headerBottom += netPorts.length * 13 + 2;
  }

  // Outlets — composition (per-instance, live) falls back to the catalog template's default.
  // Positions come from the same computeSidePduOutletPositions() that core/state.ts's
  // getPortWorldPosition() uses to resolve power-cable connections to these outlets, so a
  // header-layout change here can never silently desync from where cables actually attach.
  // (headerBottom, tracked above while drawing the header sections, must stay in sync with
  // computeSidePduHeaderBottom()'s formula — verified identical as of this writing.)
  const composition = normalizeComposition(config, template.outletConfig);
  const allOutlets: SocketType[] = composition.flatMap(row => Array.from({ length: row.count }, () => row.type));
  const outletPositions = computeSidePduOutletPositions(template, config, pduWidth, stripH);
  const outletAreaH = (stripH - (headerBottom + 6) - 8);
  const outletSpacing = outletAreaH / Math.max(allOutlets.length, 1);
  const outletCx = pduWidth / 2;
  const showLedDot = (config.leds ?? []).includes('outlet');
  const outletFace = config.enclosure?.outletFace ?? 'black';
  const rotSetting = config.sockets?.rotationDeg;

  allOutlets.forEach((sockType, i) => {
    const oy = outletPositions[i].y;
    const isConnected = connectedOutlets.has(i);
    const ow = Math.min(pduWidth - 6, sockType === 'C19' ? 22 : 18);
    const oh = Math.min(outletSpacing - 2, 14);
    const rot = rotSetting === 'alternate' ? (i % 2 ? 180 : 0) : (typeof rotSetting === 'number' ? rotSetting : 0);

    // Outlet face plate with distinct socket graphic per type — rotated via a wrapper group
    // since drawSocketFacePlate appends many absolute-positioned children directly.
    const outletTarget = rot
      ? (() => { const wrap = el('g', { transform: `rotate(${rot} ${outletCx} ${oy})` }); ns.appendChild(wrap); return wrap; })()
      : (ns as unknown as SVGElement);
    drawSocketFacePlate(outletTarget, uid, outletCx, oy, ow, oh, sockType, isConnected, outletFace);
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

  // Footer: labels + branding. No cord/plug graphic here — the strip is only 42-48px wide and
  // its header (LCD/MCB/sensors) already fills that width top-to-bottom; the LCD's live A/W
  // readout already represents "power in" for this narrow 0U form factor. cableEntry/cordCsa/
  // inputPlug still show up in the Metadata/BOM/JSON inspector for vertical PDUs.
  drawLabelBlock(ns as unknown as SVGElement, 3, stripH - 40, config, template, '#8b939a');
  drawBranding(ns as unknown as SVGElement, 3, stripH - 6, config, 0.55);

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
