// src/renderers/networking-renderer.ts
// Port of New_Development/rack-catalog-demo.jsx's RackNetworking system to vanilla DOM/TS.
// Shared by router, firewall (non-FortiGate), KVM, console-server, and patch-panel categories.
// Exports both a port-position generator (for device-catalog.ts, mirroring switchPorts())
// and the render function (for panel-renderer.ts, mirroring renderSwitchPanel()) so the
// interactive hit-targets placed by port-renderer.ts always line up with the drawn symbols.

import { el, g, fitToRack, U1 } from './rack-kit';
import type { PortData, PortType, DeviceTemplate, KvmConfig } from '../core/types';

const RJ_W = 30, RJ_H = 40, RJ_GAP = 4;
const GROUP_GAP = 20;
const SFP_W = 46, SFP_H = 42.5;
const LC_W = 40, LC_H = 30;
const SEC_GAP = 24;
// KVM local-console peripheral ports (customizable — see KvmConfig)
const DVI_W = 34, DVI_H = 22;
const DP_W = 22, DP_H = 13;
const USB_W = 20, USB_H = 11;
const VGA_W = 30, VGA_H = 20;
const HDMI_W = 26, HDMI_H = 13;
const JACK_W = 14, JACK_H = 14;
const DB9_W = 26, DB9_H = 16;

/** All possible KVM local ports, in the order they're drawn — the default set used when a KVM
 *  device has no explicit KvmConfig yet. Mirrors a real 1U KVM's front panel: local console
 *  ports (USB keyboard/mouse, video, audio), a management (LAN/IP) port, and a firmware/
 *  diagnostics RS-232 serial port. */
export const KVM_LOCAL_PORT_OPTIONS = [
  'usb1', 'usb2', 'usb3', 'usb4', 'vga', 'hdmi', 'dvi', 'displayport', 'audio', 'mic', 'ethernet', 'serial',
];

/** Same idea as KVM_LOCAL_PORT_OPTIONS but for the plain serial console-server category — no
 *  video/audio (it aggregates RS-232 out to devices, not a keyboard/video/mouse switch): a
 *  couple of USB ports (modem/storage) and a primary + failover management LAN port. */
export const CONSOLE_LOCAL_PORT_OPTIONS = ['usb1', 'usb2', 'ethernet', 'ethernet2'];

/** Splits a port count into chunks of at most 8 — e.g. 16 -> [8, 8], 12 -> [8, 4], 4 -> [4]. */
function chunk8(n: number): number[] {
  const chunks: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    const c = Math.min(8, remaining);
    chunks.push(c);
    remaining -= c;
  }
  return chunks.length ? chunks : [0];
}

export type NetKind = 'router' | 'firewall' | 'kvm' | 'console' | 'patch-cat6' | 'patch-fiber';

const ACCENTS: Record<NetKind, string> = {
  router: '#37b6ff', firewall: '#ff5a5a', kvm: '#39ff8a', console: '#39ff8a',
  'patch-cat6': '#b57bff', 'patch-fiber': '#b57bff',
};
const CATEGORY_LABEL: Record<NetKind, string> = {
  router: 'Router', firewall: 'Firewall', kvm: 'KVM Switch', console: 'Console Server',
  'patch-cat6': 'Patch Panel', 'patch-fiber': 'Patch Panel',
};

type GroupKind = 'rj45' | 'sfp' | 'lc' | 'dvi' | 'displayport' | 'usb' | 'vga' | 'hdmi' | 'audio' | 'mic' | 'db9';
// Cell kinds that are purely decorative local-peripheral jacks — no per-port LED pair, no
// network "speed" label (unlike rj45/sfp, which represent real switched network links).
const NO_LINK_KINDS = new Set<GroupKind>(['lc', 'dvi', 'displayport', 'usb', 'vga', 'hdmi', 'audio', 'mic', 'db9']);
interface GroupSpec { label: string; kind: GroupKind; fns: string[]; portType: PortType; }

function buildGroups(kind: NetKind, ports: number, variant?: string, kvmConfig?: KvmConfig): GroupSpec[] {
  if (kind === 'router') {
    if (ports <= 4) return [
      { label: 'WAN', kind: 'rj45', portType: 'rj45', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: ['LAN1', 'LAN2'] },
    ];
    if (ports <= 8) return [
      { label: 'WAN', kind: 'sfp', portType: 'sfp-plus', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: ['LAN1', 'LAN2', 'LAN3', 'LAN4', 'LAN5', 'LAN6'] },
    ];
    return [
      { label: 'WAN / UPLINK', kind: 'sfp', portType: 'sfp-plus', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: Array.from({ length: 8 }, (_, i) => `LAN${i + 1}`) },
    ];
  }
  if (kind === 'firewall') {
    if (ports <= 6) return [
      { label: 'WAN', kind: 'rj45', portType: 'rj45', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: ['LAN1', 'LAN2'] },
      { label: 'DMZ', kind: 'rj45', portType: 'rj45', fns: ['DMZ'] },
      { label: 'HA', kind: 'rj45', portType: 'rj45', fns: ['HA'] },
    ];
    if (ports <= 8) return [
      { label: 'WAN', kind: 'rj45', portType: 'rj45', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: ['LAN1', 'LAN2', 'LAN3', 'LAN4'] },
      { label: 'DMZ', kind: 'rj45', portType: 'rj45', fns: ['DMZ'] },
      { label: 'HA', kind: 'rj45', portType: 'rj45', fns: ['HA'] },
    ];
    if (ports <= 10) return [
      { label: 'WAN', kind: 'sfp', portType: 'sfp-plus', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: Array.from({ length: 6 }, (_, i) => `LAN${i + 1}`) },
      { label: 'HA', kind: 'rj45', portType: 'rj45', fns: ['HA1', 'HA2'] },
    ];
    return [
      { label: 'WAN', kind: 'sfp', portType: 'sfp-plus', fns: ['WAN1', 'WAN2'] },
      { label: 'LAN', kind: 'rj45', portType: 'rj45', fns: Array.from({ length: 8 }, (_, i) => `LAN${i + 1}`) },
      { label: 'DMZ', kind: 'rj45', portType: 'rj45', fns: ['DMZ'] },
      { label: 'HA', kind: 'rj45', portType: 'rj45', fns: ['HA1', 'HA2'] },
    ];
  }
  if (kind === 'kvm' || kind === 'console') {
    const groups: GroupSpec[] = [];
    const targetLabel = kind === 'kvm' ? 'TARGETS' : 'SERIAL';
    // Real KVM/console-server port blocks (Aten/Adder/Raritan/Opengear) are wired in banks of
    // 8 with a physical divider between banks — split into 8-port chunks instead of one
    // continuous row so a 16-port unit reads as two clearly-separated "1-8" / "9-16" blocks.
    // Every chunk keeps the same label (networkingPorts() stamps this onto each port's `group`
    // field — that's what state.ts/panel-renderer.ts use to tell target/serial ports apart from
    // the customizable local group); renderNetworkingPanel separately suppresses the redundant
    // per-chunk caption (portType 'console' groups get the amber frame + bottom bracket instead).
    let base = 0;
    for (const c of chunk8(ports)) {
      groups.push({ label: targetLabel, kind: 'rj45', portType: 'console', fns: Array.from({ length: c }, (_, i) => `${base + i + 1}`) });
      base += c;
    }
    if (kind === 'kvm') {
      // Local peripheral ports — customizable per-device (see KvmConfig), mirroring a real 1U
      // KVM's front panel (local console USB/video/audio + a management LAN port + a firmware/
      // diagnostics RS-232 serial port). Separate from the TARGETS group above, which connects
      // out to each managed server.
      const local = new Set(kvmConfig?.localPorts ?? KVM_LOCAL_PORT_OPTIONS);
      const usbFns = ['usb1', 'usb2', 'usb3', 'usb4'].filter(u => local.has(u)).map((_, i) => `USB${i + 1}`);
      if (usbFns.length) groups.push({ label: 'USB (KB/MOUSE)', kind: 'usb', portType: 'usb', fns: usbFns });
      if (local.has('vga')) groups.push({ label: 'VGA', kind: 'vga', portType: 'vga', fns: ['VGA'] });
      if (local.has('hdmi')) groups.push({ label: 'HDMI', kind: 'hdmi', portType: 'hdmi', fns: ['HDMI'] });
      if (local.has('dvi')) groups.push({ label: 'DVI', kind: 'dvi', portType: 'dvi', fns: ['DVI'] });
      if (local.has('displayport')) groups.push({ label: 'DP', kind: 'displayport', portType: 'displayport', fns: ['DP'] });
      if (local.has('audio')) groups.push({ label: 'AUDIO', kind: 'audio', portType: 'audio', fns: ['AUDIO'] });
      if (local.has('mic')) groups.push({ label: 'MIC', kind: 'mic', portType: 'mic', fns: ['MIC'] });
      if (local.has('ethernet')) groups.push({ label: 'MGMT', kind: 'rj45', portType: 'management', fns: ['ETH'] });
      if (local.has('serial')) groups.push({ label: 'SERIAL', kind: 'db9', portType: 'serial', fns: ['RS232'] });
    } else {
      // Plain serial console server — no video/audio (it's a serial aggregator, not a KVM):
      // just local USB (modem/storage) and primary + failover management LAN.
      const local = new Set(kvmConfig?.localPorts ?? CONSOLE_LOCAL_PORT_OPTIONS);
      const usbFns = ['usb1', 'usb2'].filter(u => local.has(u)).map((_, i) => `USB${i + 1}`);
      if (usbFns.length) groups.push({ label: 'USB', kind: 'usb', portType: 'usb', fns: usbFns });
      const lanFns: string[] = [];
      if (local.has('ethernet')) lanFns.push('LAN1');
      if (local.has('ethernet2')) lanFns.push('LAN2');
      if (lanFns.length) groups.push({ label: 'MGMT', kind: 'rj45', portType: 'management', fns: lanFns });
    }
    return groups;
  }
  // patch panels
  return [{
    label: kind === 'patch-fiber' ? 'LC DUPLEX' : 'CAT6',
    kind: kind === 'patch-fiber' ? 'lc' : 'rj45',
    portType: kind === 'patch-fiber' ? 'sfp' : 'rj45',
    fns: Array.from({ length: ports }, (_, i) => `${i + 1}`),
  }];
}

function cellFor(kind: GroupKind): { w: number; h: number } {
  switch (kind) {
    case 'sfp': return { w: SFP_W, h: SFP_H };
    case 'lc': return { w: LC_W, h: LC_H };
    case 'dvi': return { w: DVI_W, h: DVI_H };
    case 'displayport': return { w: DP_W, h: DP_H };
    case 'usb': return { w: USB_W, h: USB_H };
    case 'vga': return { w: VGA_W, h: VGA_H };
    case 'hdmi': return { w: HDMI_W, h: HDMI_H };
    case 'audio': case 'mic': return { w: JACK_W, h: JACK_H };
    case 'db9': return { w: DB9_W, h: DB9_H };
    default: return { w: RJ_W, h: RJ_H };
  }
}

interface NetLayout {
  totalW: number; chassisX: number; chassisW: number; bladeW: number; contentX: number;
  consoleW: number; portsX: number; portsTop: number; tallest: number;
  groups: GroupSpec[]; groupX: number[]; groupW: number[]; showConsoleIcons: boolean;
}

// Branding/identity block is a fixed ~20% of the ports area's width (25% of the ports width
// itself, since 20/80 as a ratio of the total is 0.2/0.8 = 0.25 of the ports side) instead of a
// flat constant — a flat 240px console block next to, say, an 8-port KVM's ports row (~268px)
// was 45% of the panel, not 20%. Clamped so the identity block never gets so narrow the brand
// text is unreadable, nor so wide it dominates a small device.
const MIN_CONSOLE_W = 150, MAX_CONSOLE_W = 240;
const MIN_PATCH_W = 110, MAX_PATCH_W = 170;
// Below this width the USB console jack + reset button cluster (drawConsoleBlock's right-most
// icons) would start crowding the brand text — they're simply omitted rather than overlapping.
const CONSOLE_ICONS_MIN_W = 195;

function computeLayout(kind: NetKind, portCount: number, variant?: string, kvmConfig?: KvmConfig): NetLayout {
  const groups = buildGroups(kind, portCount, variant, kvmConfig);
  const isPatch = kind.startsWith('patch');

  const groupW = groups.map(gr => {
    const { w } = cellFor(gr.kind);
    return gr.fns.length * w + (gr.fns.length - 1) * RJ_GAP;
  });
  const portsRowW = groupW.reduce((a, b) => a + b, 0) + (groups.length - 1) * GROUP_GAP;

  const consoleW = isPatch
    ? Math.max(MIN_PATCH_W, Math.min(portsRowW * 0.25, MAX_PATCH_W))
    : Math.max(MIN_CONSOLE_W, Math.min(portsRowW * 0.25, MAX_CONSOLE_W));
  const showConsoleIcons = !isPatch && consoleW >= CONSOLE_ICONS_MIN_W;
  const contentW = consoleW + SEC_GAP + portsRowW;
  const { totalW, chassisX, chassisW, bladeW, contentX } = fitToRack(contentW);

  const portsX = contentX + consoleW + SEC_GAP;
  const tallest = Math.max(...groups.map(gr => cellFor(gr.kind).h));
  const portsTop = (U1 - tallest) / 2 + 4;

  const groupX: number[] = [];
  { let acc = portsX; groups.forEach((_, i) => { groupX[i] = acc; acc += groupW[i] + GROUP_GAP; }); }

  return { totalW, chassisX, chassisW, bladeW, contentX, consoleW, portsX, portsTop, tallest, groups, groupX, groupW, showConsoleIcons };
}

/**
 * Generates catalog PortData (id/name/type/relativeX/relativeY/portW/portH) for a
 * networking device, scaled into the final device-pixel space (W×H, typically 350×30).
 * Call this from device-catalog.ts — the returned order/positions match exactly what
 * renderNetworkingPanel() draws for the same (kind, portCount, variant).
 */
export function networkingPorts(
  kind: NetKind, portCount: number, idPfx: string, variant?: string, kvmConfig?: KvmConfig,
): DeviceTemplate['ports'] {
  const W = 350, H = 30;
  const layout = computeLayout(kind, portCount, variant, kvmConfig);
  const sx = W / layout.totalW;
  const sy = H / U1;

  const out: DeviceTemplate['ports'] = [];
  layout.groups.forEach((gr, gi) => {
    const { w: cw, h: ch } = cellFor(gr.kind);
    const gx = layout.groupX[gi];
    // Shorter cells (USB/DisplayPort next to full-height RJ45/DVI cells) are centered within
    // the row's tallest cell height instead of sharing one top-aligned y for every group.
    const y = layout.portsTop + (layout.tallest - ch) / 2;
    gr.fns.forEach((fn, pIdx) => {
      const x = gx + pIdx * (cw + RJ_GAP);
      out.push({
        id: `${idPfx}${fn.toLowerCase()}`,
        name: fn,
        type: gr.portType,
        relativeX: Math.round((x + cw / 2) * sx),
        relativeY: Math.round((y + ch / 2) * sy),
        portW: Math.round(cw * sx),
        portH: Math.round(ch * sy),
        group: gr.label,
        speed: gr.kind === 'sfp' ? '10 Gbps'
          : (NO_LINK_KINDS.has(gr.kind) || gr.portType === 'console') ? undefined
          : '1 Gbps',
      });
    });
  });
  return out;
}

// ─── LEDs (state + optional blink, matching switch-renderer's convention) ───────
const LED_COLORS: Record<string, string> = {
  off: '#20262b', green: '#39ff8a', greenBlink: '#39ff8a', amber: '#ffb020',
  amberBlink: '#ffb020', blue: '#37b6ff', red: '#ff4d4d', redBlink: '#ff4d4d', white: '#f2f6ff',
};

function drawLed(parent: SVGElement, uid: string, cx: number, cy: number, state: string, r = 1.6): void {
  const base = state.replace('Blink', '');
  const color = LED_COLORS[base] ?? LED_COLORS.off;
  const on = base !== 'off';
  const cls = state.endsWith('Blink') ? `blink-${uid}` : on ? `pulse-${uid}` : '';
  const grp = g();
  grp.appendChild(el('circle', { cx, cy, r: r + 0.7, fill: '#04060a', stroke: '#2a3036', 'stroke-width': 0.4 }));
  const dot = el('circle', { cx, cy, r, fill: color, opacity: on ? 1 : 0.35 });
  if (on) dot.setAttribute('filter', `url(#${uid}gw)`);
  if (cls) dot.setAttribute('class', cls);
  grp.appendChild(dot);
  if (on) grp.appendChild(el('circle', { cx: cx - 0.4, cy: cy - 0.4, r: r * 0.35, fill: '#fff', opacity: 0.85 }));
  parent.appendChild(grp);
}

// ─── shared <defs>: chassis/blade gradients + connector symbols + accent ────────
function makeNetDefs(ns: SVGSVGElement, uid: string, accent: string): void {
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

  lg(`${uid}ch`, 0, 0, 0, 1, [['0', '#3a4046'], ['0.06', '#2c3237'], ['0.5', '#23282c'], ['0.94', '#1b1f22'], ['1', '#141719']]);
  lg(`${uid}bl`, 0, 0, 1, 0, [['0', '#2a3035'], ['0.35', '#3a4247'], ['0.55', '#454d53'], ['0.8', '#2b3136'], ['1', '#1a1e21']]);
  lg(`${uid}cg`, 0, 0, 0, 1, [['0', '#0c0e10'], ['0.12', '#2a2f34'], ['0.5', '#171b1e'], ['0.88', '#0a0c0d'], ['1', '#050607']]);
  lg(`${uid}lp`, 0, 0, 0, 1, [['0', '#4b5258'], ['1', '#20252a']]);
  lg(`${uid}rm`, 0, 0, 0, 1, [['0', '#d9d3c2'], ['0.5', '#b3ad9c'], ['1', '#7c7768']]);
  lg(`${uid}go`, 0, 0, 0, 1, [['0', '#f6d98a'], ['0.5', '#c9a24b'], ['1', '#7d6021']]);
  lg(`${uid}sb`, 0, 0, 0, 1, [['0', '#c7ced4'], ['0.14', '#8f979e'], ['0.5', '#5c646b'], ['0.86', '#3a4147'], ['1', '#24292e']]);
  rg(`${uid}ci`, 0.5, 0.35, 0.9, [['0', '#111417'], ['1', '#000000']]);
  rg(`${uid}bo`, 0.5, 0.4, 0.75, [['0', '#1a2a3a'], ['0.7', '#060b12'], ['1', '#000']]);
  // accent gradient needs opacity stops, which the lg() helper above doesn't support
  const acGrad = el('linearGradient', { id: `${uid}ac`, x1: 0, y1: 0, x2: 0, y2: 1, gradientUnits: 'objectBoundingBox' });
  const acS1 = el('stop', { offset: '0' }); acS1.setAttribute('stop-color', accent); acS1.setAttribute('stop-opacity', '0.9');
  const acS2 = el('stop', { offset: '1' }); acS2.setAttribute('stop-color', accent); acS2.setAttribute('stop-opacity', '0.35');
  acGrad.appendChild(acS1); acGrad.appendChild(acS2);
  defs.appendChild(acGrad);

  const fGrain = el('filter', { id: `${uid}gr`, x: '-2%', y: '-2%', width: '104%', height: '104%' });
  const grainTurb = el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9 0.012', numOctaves: '2', seed: '7', result: 'n' });
  const grainCM = el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0', result: 'grain' });
  const grainComp = el('feComposite', { in: 'grain', in2: 'SourceGraphic', operator: 'over' });
  fGrain.appendChild(grainTurb); fGrain.appendChild(grainCM); fGrain.appendChild(grainComp);
  defs.appendChild(fGrain);

  const fAO = el('filter', { id: `${uid}ao`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  const fDS = el('feDropShadow', { dx: '0', dy: '1.4', stdDeviation: '1.6' });
  fDS.setAttribute('flood-color', '#000'); fDS.setAttribute('flood-opacity', '0.55');
  fAO.appendChild(fDS); defs.appendChild(fAO);

  const fIS = el('filter', { id: `${uid}is`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const feOff = el('feOffset', { dx: '0', dy: '1.6' });
  const feBlr = el('feGaussianBlur', { stdDeviation: '1.8', result: 'o' });
  const feCmp1 = el('feComposite', { in: 'SourceGraphic', in2: 'o', operator: 'out', result: 'inv' });
  const feCM = el('feColorMatrix', { in: 'inv', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0', result: 'sh' });
  const feCmp2 = el('feComposite', { in: 'sh', in2: 'SourceGraphic', operator: 'in' });
  [feOff, feBlr, feCmp1, feCM, feCmp2].forEach(f => fIS.appendChild(f));
  defs.appendChild(fIS);

  const fSh = el('filter', { id: `${uid}sh`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  const fShDS = el('feDropShadow', { dx: '0', dy: '0.8', stdDeviation: '0.9' });
  fShDS.setAttribute('flood-color', '#000'); fShDS.setAttribute('flood-opacity', '0.6');
  fSh.appendChild(fShDS); defs.appendChild(fSh);

  const fGlow = el('filter', { id: `${uid}gw`, x: '-120%', y: '-120%', width: '340%', height: '340%' });
  fGlow.appendChild(el('feGaussianBlur', { stdDeviation: '1.1', result: 'b' }));
  const fMrg = el('feMerge');
  fMrg.appendChild(el('feMergeNode', { in: 'b' })); fMrg.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
  fGlow.appendChild(fMrg); defs.appendChild(fGlow);

  // RJ45 symbol (single tab-down orientation — one data row, unlike the stacked switch faceplate)
  const rjSym = el('symbol', { id: `${uid}rj`, viewBox: `0 0 ${RJ_W} ${RJ_H}` });
  rjSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: RJ_W - 1, height: RJ_H - 1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  rjSym.appendChild(el('rect', { x: 1.5, y: 1.5, width: RJ_W - 3, height: RJ_H - 3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
  const rjMg = el('g', { transform: `translate(${RJ_W / 2} ${RJ_H / 2 + 2})` });
  const rjMp = el('path', {
    d: 'M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z',
    fill: `url(#${uid}rm)`, stroke: '#3a352a', 'stroke-width': 0.8,
  });
  rjMp.setAttribute('filter', `url(#${uid}is)`);
  rjMg.appendChild(rjMp);
  rjMg.appendChild(el('rect', { x: -8, y: -9, width: 16, height: 9, rx: 1, fill: '#4a4638', opacity: 0.55 }));
  for (let i = 0; i < 8; i++) rjMg.appendChild(el('rect', { x: -7.4 + i * 1.85, y: -9, width: 1.1, height: 6.5, fill: `url(#${uid}go)`, rx: 0.3 }));
  rjSym.appendChild(rjMg);
  defs.appendChild(rjSym);

  // SFP symbol (fiber module seated)
  const sfpSym = el('symbol', { id: `${uid}sfp`, viewBox: `0 0 ${SFP_W} ${SFP_H}` });
  const sfpG = el('g', {}); sfpG.setAttribute('filter', `url(#${uid}sh)`);
  sfpG.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFP_W - 1, height: SFP_H - 1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpG.appendChild(el('rect', { x: 3.5, y: 4, width: SFP_W - 7, height: SFP_H - 8, rx: 2, fill: `url(#${uid}sb)`, stroke: '#1b2024', 'stroke-width': 0.8 }));
  sfpG.appendChild(el('rect', { x: 5, y: 5.4, width: SFP_W - 10, height: 1.6, rx: 0.8, fill: '#e8edf1', opacity: 0.55 }));
  sfpG.appendChild(el('rect', { x: 5, y: 4.2, width: SFP_W - 10, height: 3.4, rx: 1.4, fill: accent, opacity: 0.92 }));
  sfpG.appendChild(el('rect', { x: SFP_W / 2 - 9, y: SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  sfpG.appendChild(el('circle', { cx: SFP_W / 2 - 5, cy: SFP_H / 2 + 1, r: 2.6, fill: `url(#${uid}bo)` }));
  sfpG.appendChild(el('rect', { x: SFP_W / 2 + 1, y: SFP_H / 2 - 3.5, width: 8, height: 9, rx: 1.6, fill: '#0d1319', stroke: '#454d54', 'stroke-width': 0.7 }));
  sfpG.appendChild(el('circle', { cx: SFP_W / 2 + 5, cy: SFP_H / 2 + 1, r: 2.6, fill: `url(#${uid}bo)` }));
  sfpG.appendChild(el('rect', { x: 5, y: SFP_H - 8.5, width: SFP_W - 10, height: 3, rx: 0.6, fill: '#c9ccce', opacity: 0.85 }));
  sfpSym.appendChild(sfpG);
  defs.appendChild(sfpSym);

  // LC duplex fiber symbol
  const lcSym = el('symbol', { id: `${uid}lc`, viewBox: `0 0 ${LC_W} ${LC_H}` });
  lcSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: LC_W - 1, height: LC_H - 1, rx: 2, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  lcSym.appendChild(el('rect', { x: 3, y: 4, width: LC_W - 6, height: LC_H - 8, rx: 1.5, fill: '#c7b28a', stroke: '#7a6a45', 'stroke-width': 0.8 }));
  for (let i = 0; i < 2; i++) {
    const lcG = el('g', { transform: `translate(${LC_W / 2 - 8 + i * 16} ${LC_H / 2})` });
    lcG.appendChild(el('rect', { x: -5, y: -6, width: 10, height: 12, rx: 1.4, fill: '#0d1013', stroke: '#5a4f38', 'stroke-width': 0.6 }));
    lcG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.2, fill: `url(#${uid}bo)` }));
    lcG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.4, fill: '#1a2a3a', opacity: 0.8 }));
    lcSym.appendChild(lcG);
  }
  defs.appendChild(lcSym);

  // DVI-I symbol (video — simplified 6x3 pin grid + the characteristic flat ground blade)
  const dviSym = el('symbol', { id: `${uid}dvi`, viewBox: `0 0 ${DVI_W} ${DVI_H}` });
  dviSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: DVI_W - 1, height: DVI_H - 1, rx: 2, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  dviSym.appendChild(el('rect', { x: 3, y: 3, width: DVI_W - 6, height: DVI_H - 6, rx: 1.5, fill: `url(#${uid}sb)`, stroke: '#1b2024', 'stroke-width': 0.6 }));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      dviSym.appendChild(el('circle', { cx: 6 + c * 3.8, cy: 6 + r * 5, r: 0.7, fill: '#0a0c0e' }));
    }
  }
  dviSym.appendChild(el('rect', { x: DVI_W - 6, y: DVI_H / 2 - 3.5, width: 2, height: 7, rx: 0.5, fill: '#0a0c0e' }));
  defs.appendChild(dviSym);

  // DisplayPort symbol (video — distinctive asymmetric trapezoid shroud + pin row)
  const dpSym = el('symbol', { id: `${uid}dp`, viewBox: `0 0 ${DP_W} ${DP_H}` });
  dpSym.appendChild(el('path', {
    d: `M1 1 H${DP_W - 4} L${DP_W - 1} ${DP_H / 2} L${DP_W - 4} ${DP_H - 1} H1 Z`,
    fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1,
  }));
  dpSym.appendChild(el('rect', { x: 3, y: 3, width: DP_W - 8, height: DP_H - 6, rx: 1, fill: '#0a0c0e' }));
  for (let i = 0; i < 5; i++) {
    dpSym.appendChild(el('rect', { x: 4.5 + i * 2.6, y: DP_H / 2 - 1, width: 1.4, height: 2, fill: `url(#${uid}go)` }));
  }
  defs.appendChild(dpSym);

  // USB-A symbol (peripheral — simple rectangular receptacle, keyboard/mouse)
  const usbSym = el('symbol', { id: `${uid}usb`, viewBox: `0 0 ${USB_W} ${USB_H}` });
  usbSym.appendChild(el('rect', { x: 0.5, y: 0.5, width: USB_W - 1, height: USB_H - 1, rx: 1.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  usbSym.appendChild(el('rect', { x: 3, y: 2.5, width: USB_W - 6, height: USB_H - 5, rx: 0.8, fill: '#0a0c0e', stroke: '#2a2f34', 'stroke-width': 0.5 }));
  usbSym.appendChild(el('rect', { x: 5, y: USB_H / 2 - 0.6, width: USB_W - 10, height: 1.2, fill: `url(#${uid}sb)`, opacity: 0.6 }));
  defs.appendChild(usbSym);

  // VGA symbol (video — blue-tinted trapezoid shroud, classic 3-row x5-col 15-pin D-sub grid)
  const vgaSym = el('symbol', { id: `${uid}vga`, viewBox: `0 0 ${VGA_W} ${VGA_H}` });
  vgaSym.appendChild(el('path', {
    d: `M2 1 H${VGA_W - 2} L${VGA_W - 1} 4 V${VGA_H - 4} L${VGA_W - 2} ${VGA_H - 1} H2 L1 ${VGA_H - 4} V4 Z`,
    fill: `url(#${uid}cg)`, stroke: '#1b3550', 'stroke-width': 1,
  }));
  vgaSym.appendChild(el('rect', { x: 4, y: 3.5, width: VGA_W - 8, height: VGA_H - 7, rx: 1, fill: '#12314a', opacity: 0.9 }));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      vgaSym.appendChild(el('circle', { cx: 6.5 + c * 4.2, cy: 5.5 + r * 4.5, r: 0.7, fill: '#0a0c0e' }));
    }
  }
  defs.appendChild(vgaSym);

  // HDMI symbol (video — dark trapezoid, one corner bevelled off per the real Type-A shape)
  const hdmiSym = el('symbol', { id: `${uid}hdmi`, viewBox: `0 0 ${HDMI_W} ${HDMI_H}` });
  hdmiSym.appendChild(el('path', {
    d: `M1 1 H${HDMI_W - 4} L${HDMI_W - 1} 4 V${HDMI_H - 1} H1 Z`,
    fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1,
  }));
  hdmiSym.appendChild(el('rect', { x: 3, y: 3, width: HDMI_W - 8, height: HDMI_H - 6, rx: 0.8, fill: '#0a0c0e', stroke: '#2a2f34', 'stroke-width': 0.5 }));
  defs.appendChild(hdmiSym);

  // 3.5mm jack symbols (audio-out green, mic pink) — concentric rings around a dark barrel
  function jackSym(id: string, ringColor: string) {
    const sym = el('symbol', { id, viewBox: `0 0 ${JACK_W} ${JACK_H}` });
    sym.appendChild(el('rect', { x: 0.5, y: 0.5, width: JACK_W - 1, height: JACK_H - 1, rx: 2, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
    sym.appendChild(el('circle', { cx: JACK_W / 2, cy: JACK_H / 2, r: 4.6, fill: ringColor, opacity: 0.85 }));
    sym.appendChild(el('circle', { cx: JACK_W / 2, cy: JACK_H / 2, r: 2.6, fill: `url(#${uid}bo)` }));
    defs.appendChild(sym);
  }
  jackSym(`${uid}audio`, '#39ff8a');
  jackSym(`${uid}mic`, '#ff6ec7');

  // DB9 symbol (RS-232 serial — narrower trapezoid, 5-pin top row / 4-pin bottom row D-sub)
  const db9Sym = el('symbol', { id: `${uid}db9`, viewBox: `0 0 ${DB9_W} ${DB9_H}` });
  db9Sym.appendChild(el('path', {
    d: `M2 1 H${DB9_W - 2} L${DB9_W - 1} 3.5 V${DB9_H - 3.5} L${DB9_W - 2} ${DB9_H - 1} H2 L1 ${DB9_H - 3.5} V3.5 Z`,
    fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1,
  }));
  db9Sym.appendChild(el('rect', { x: 3.5, y: 3, width: DB9_W - 7, height: DB9_H - 6, rx: 1, fill: `url(#${uid}sb)`, opacity: 0.9 }));
  for (let c = 0; c < 5; c++) db9Sym.appendChild(el('circle', { cx: 5.5 + c * 3.8, cy: 6, r: 0.75, fill: '#0a0c0e' }));
  for (let c = 0; c < 4; c++) db9Sym.appendChild(el('circle', { cx: 7.4 + c * 3.8, cy: DB9_H - 6, r: 0.75, fill: '#0a0c0e' }));
  defs.appendChild(db9Sym);

  ns.appendChild(defs);
}

function drawChassisWithBlades(ns: SVGSVGElement, uid: string, totalW: number, totalH: number, chassisX: number, chassisW: number, bladeW: number): void {
  const chG = el('g'); chG.setAttribute('filter', `url(#${uid}ao)`);
  chG.appendChild(el('rect', { x: chassisX, y: 1, width: chassisW, height: totalH - 2, rx: 4, fill: `url(#${uid}ch)`, stroke: '#0c0f11', 'stroke-width': 1.2 }));
  const chGrain = el('rect', { x: chassisX, y: 1, width: chassisW, height: totalH - 2, rx: 4, fill: 'transparent' });
  chGrain.setAttribute('filter', `url(#${uid}gr)`); chG.appendChild(chGrain);
  chG.appendChild(el('rect', { x: chassisX + 2, y: 2.5, width: chassisW - 4, height: 2, rx: 1, fill: '#454b51', opacity: 0.55 }));
  ns.appendChild(chG);

  [0, 1].forEach(side => {
    const isLeft = side === 0;
    const bladeX = isLeft ? 0 : totalW - bladeW;
    const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
    const bendX = isLeft ? bladeW - 2.5 : bladeX;
    const bg = el('g'); bg.setAttribute('filter', `url(#${uid}ao)`);
    bg.appendChild(el('rect', { x: bladeX, y: 0, width: bladeW, height: totalH, rx: 2.5, fill: `url(#${uid}bl)`, stroke: '#0c0f11', 'stroke-width': 1 }));
    const blGrain = el('rect', { x: bladeX, y: 1, width: bladeW, height: totalH - 2, fill: 'transparent', opacity: 0.7 });
    blGrain.setAttribute('filter', `url(#${uid}gr)`); bg.appendChild(blGrain);
    bg.appendChild(el('rect', { x: bendX, y: 4, width: 2.5, height: totalH - 8, fill: '#4c545b', opacity: 0.55 }));
    bg.appendChild(el('rect', { x: isLeft ? bladeW - 1 : bladeX + bladeW - 1.4, y: 4, width: 1.2, height: totalH - 8, fill: '#05070a', opacity: 0.7 }));
    [0.34, 0.66].forEach(f => {
      bg.appendChild(el('rect', { x: holeCx - 4.5, y: totalH * f - 8, width: 9, height: 16, rx: 4.5, fill: '#0a0c0e', stroke: '#525a61', 'stroke-width': 1 }));
      bg.appendChild(el('path', { d: `M ${holeCx - 3} ${totalH * f - 6} a 3 5 0 0 1 3 -2`, fill: 'none', stroke: '#6a727a', 'stroke-width': 0.8, opacity: 0.55 }));
    });
    ns.appendChild(bg);
  });
}

function drawBrand(parent: SVGElement, x: number, y: number, accent: string, fontSize = 15): void {
  const t1 = el('text', { x, y, 'font-size': fontSize, 'font-weight': 700, fill: accent, 'letter-spacing': 1.4 });
  t1.textContent = 'RACK SLICER';
  parent.appendChild(t1);
}

function drawConsoleBlock(
  ns: SVGSVGElement, uid: string, x: number, w: number, h: number, accent: string,
  kind: NetKind, model: string, portCount: number, variant: string | undefined, showIcons: boolean,
): void {
  const cy = h / 2;
  const leds = kind === 'firewall'
    ? [['PWR', 'green'], ['HA', 'blue'], ['THREAT', 'amberBlink'], ['VPN', 'green']]
    : kind === 'kvm' || kind === 'console'
    ? [['PWR', 'green'], ['SYS', 'greenBlink'], ['LNK', 'green'], ['ACT', 'greenBlink']]
    : [['PWR', 'green'], ['SYS', 'greenBlink'], ['WAN', 'green'], ['VPN', 'blue']];
  const category = kind === 'firewall' && variant === 'ngfw' ? 'Firewall (NGFW)' : CATEGORY_LABEL[kind];

  const grp = el('g', { transform: `translate(${x} 0)` });
  leds.forEach(([l, s], i) => {
    const ly = 24 + i * 21;
    drawLed(grp, uid, 12, ly, s, 1.6);
    const t = el('text', { x: 22, y: ly + 3.4, 'font-size': 8, fill: '#aeb6bd', 'letter-spacing': 0.5 });
    t.textContent = l; grp.appendChild(t);
  });

  // Text column shrinks to fit whatever width is left of the LED column instead of assuming
  // a fixed 150px+ — a narrow (small port-count) console block would otherwise overflow past
  // its own right edge into the ports area.
  const textX = 64;
  const availW = Math.max(w - textX - 6, 40);
  const brandFontSize = Math.max(9, Math.min(15, availW / (11 * 0.62)));
  drawBrand(grp, textX, cy - 14, accent, brandFontSize);

  const catFontSize = Math.max(7, Math.min(10.5, availW / (category.length * 0.58)));
  const catMaxChars = Math.max(4, Math.floor(availW / (catFontSize * 0.58)));
  const catTxt = el('text', { x: textX, y: cy + 1, 'font-size': catFontSize, 'font-weight': 600, fill: '#e7edf2', 'letter-spacing': 0.4 });
  catTxt.textContent = category.length > catMaxChars ? category.slice(0, catMaxChars - 1) + '…' : category;
  grp.appendChild(catTxt);

  const modelMaxChars = Math.max(4, Math.floor(availW / (8 * 0.58)));
  const modelTxt = el('text', { x: textX, y: cy + 14, 'font-size': 8, fill: '#8b939a', 'letter-spacing': 1 });
  modelTxt.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  grp.appendChild(modelTxt);

  grp.appendChild(el('rect', { x: textX, y: cy + 20, width: availW, height: 1, fill: '#3a4147' }));
  const specTxt = el('text', { x: textX, y: cy + 31, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  specTxt.textContent = `${portCount} PORTS • 1U`;
  grp.appendChild(specTxt);

  // USB console jack + reset button — dropped entirely below CONSOLE_ICONS_MIN_W rather than
  // overlapping the brand text, matching how the PDU rail drops its own extras when tight.
  if (showIcons) {
    const usbG = el('g', { transform: `translate(${w - 84} ${cy + 2})` });
    usbG.appendChild(el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 1.6, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 0.9 }));
    const usbI = el('rect', { x: 2, y: 2, width: 22, height: 14, rx: 1, fill: `url(#${uid}ci)` });
    usbI.setAttribute('filter', `url(#${uid}is)`); usbG.appendChild(usbI);
    usbG.appendChild(el('path', { d: 'M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z', fill: '#04060a' }));
    for (let i = 0; i < 8; i++) usbG.appendChild(el('rect', { x: 4 + i * 2.3, y: 4.5, width: 1.3, height: 4, fill: '#c9a24b', opacity: 0.8 }));
    const usbT = el('text', { x: 13, y: 26, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.5 });
    usbT.textContent = 'CONSOLE'; usbG.appendChild(usbT);
    grp.appendChild(usbG);

    const rstG = el('g', { transform: `translate(${w - 16} ${cy + 6})` });
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.2, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
    rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
    const rstT = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a' });
    rstT.textContent = 'RST'; rstG.appendChild(rstT);
    grp.appendChild(rstG);
  }

  ns.appendChild(grp);
}

function drawPatchLabel(ns: SVGSVGElement, x: number, w: number, h: number, accent: string, model: string, portCount: number, fiber: boolean): void {
  const cy = h / 2;
  const grp = el('g', { transform: `translate(${x} 0)` });
  const availW = Math.max(w - 8, 40);
  const brandFontSize = Math.max(9, Math.min(15, availW / (11 * 0.62)));
  drawBrand(grp, 4, cy - 12, accent, brandFontSize);
  const catFontSize = Math.max(7, Math.min(10.5, availW / ('Patch Panel'.length * 0.58)));
  const catTxt = el('text', { x: 4, y: cy + 3, 'font-size': catFontSize, 'font-weight': 600, fill: '#e7edf2', 'letter-spacing': 0.4 });
  catTxt.textContent = 'Patch Panel'; grp.appendChild(catTxt);
  const modelMaxChars = Math.max(4, Math.floor(availW / (8 * 0.58)));
  const modelTxt = el('text', { x: 4, y: cy + 16, 'font-size': 8, fill: '#8b939a', 'letter-spacing': 1 });
  modelTxt.textContent = model.length > modelMaxChars ? model.slice(0, modelMaxChars - 1) + '…' : model;
  grp.appendChild(modelTxt);
  grp.appendChild(el('rect', { x: 4, y: cy + 22, width: availW, height: 1, fill: '#3a4147' }));
  const specTxt = el('text', { x: 4, y: cy + 33, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  specTxt.textContent = `${portCount}× ${fiber ? 'LC FIBER' : 'CAT6'} • 1U`;
  grp.appendChild(specTxt);
  ns.appendChild(grp);
}

function addKeyframeStyle(ns: SVGSVGElement, uid: string): void {
  const style = el('style');
  style.textContent = `.hov-${uid}{transition:opacity .12s ease}g[role="button"]:hover .hov-${uid}{opacity:.14}g[role="button"]:focus-visible .hov-${uid}{opacity:.22}@keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}@keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}.blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}.pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.blink-${uid},.pulse-${uid}{animation:none}}`;
  ns.appendChild(style);
}

/**
 * Renders a full 1U networking device panel (chassis + blades + brand/status block +
 * named, grouped ports) matching the visual quality of switch-renderer.ts.
 * `ports` must be the device's actual PortData array, in the same order networkingPorts()
 * generated them, so LEDs can reflect real connection state via `connectedIds`.
 */
export function renderNetworkingPanel(
  kind: NetKind, portCount: number, variant: string | undefined, model: string,
  W: number, H: number, ports: PortData[], connectedIds: Set<string>, kvmConfig?: KvmConfig,
): SVGGElement {
  const group = g('net-panel');
  const uid = `np${Math.random().toString(36).slice(2, 7)}`;
  const accent = ACCENTS[kind];
  const layout = computeLayout(kind, portCount, variant, kvmConfig);
  const { totalW, chassisX, chassisW, bladeW, contentX, consoleW, portsX, portsTop, tallest, groups, groupX, groupW, showConsoleIcons } = layout;

  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totalW} ${U1}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  ns.setAttribute('role', 'img');

  makeNetDefs(ns, uid, accent);
  drawChassisWithBlades(ns, uid, totalW, U1, chassisX, chassisW, bladeW);
  ns.appendChild(el('rect', { x: chassisX + 3, y: 14, width: 3, height: U1 - 28, rx: 1.5, fill: `url(#${uid}ac)` }));

  const isPatch = kind.startsWith('patch');
  if (isPatch) {
    drawPatchLabel(ns, contentX, consoleW, U1, accent, model, portCount, kind === 'patch-fiber');
  } else {
    drawConsoleBlock(ns, uid, contentX, consoleW, U1, accent, kind, model, portCount, variant, showConsoleIcons);
  }

  ns.appendChild(el('line', { x1: portsX - SEC_GAP / 2, y1: 18, x2: portsX - SEC_GAP / 2, y2: U1 - 18, stroke: '#3a4147', 'stroke-width': 1, opacity: 0.5 }));

  let portIdx = 0;
  groups.forEach((gr, gi) => {
    const { w: cw, h: ch } = cellFor(gr.kind);
    const gx = groupX[gi], gw = groupW[gi];

    // Target/serial (TARGETS/SERIAL) groups get their own amber frame + shared bottom bracket
    // (drawn below, after this loop) instead of a per-chunk caption, for both KVM and plain
    // console-server kinds — both are now chunked into 8-port banks by buildGroups.
    const showCaption = gr.label && !((kind === 'kvm' || kind === 'console') && gr.portType === 'console');
    if (showCaption) {
      const labelEl = el('text', { x: gx + gw / 2, y: portsTop - 8, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: accent, 'letter-spacing': 1.1 });
      labelEl.textContent = gr.label;
      ns.appendChild(labelEl);
      ns.appendChild(el('rect', { x: gx, y: portsTop - 5, width: gw, height: 1, fill: accent, opacity: 0.4 }));
    }

    const groupY = portsTop + (tallest - ch) / 2;
    gr.fns.forEach((fn, pIdx) => {
      const portData = ports[portIdx++];
      const x = gx + pIdx * (cw + RJ_GAP);
      const connected = portData ? connectedIds.has(portData.id) : false;
      const sym = gr.kind === 'sfp' ? `${uid}sfp`
        : gr.kind === 'lc' ? `${uid}lc`
        : gr.kind === 'dvi' ? `${uid}dvi`
        : gr.kind === 'displayport' ? `${uid}dp`
        : gr.kind === 'usb' ? `${uid}usb`
        : gr.kind === 'vga' ? `${uid}vga`
        : gr.kind === 'hdmi' ? `${uid}hdmi`
        : gr.kind === 'audio' ? `${uid}audio`
        : gr.kind === 'mic' ? `${uid}mic`
        : gr.kind === 'db9' ? `${uid}db9`
        : `${uid}rj`;

      const pg = el('g', { transform: `translate(${x} ${groupY})` });
      pg.setAttribute('tabindex', '0'); pg.setAttribute('role', 'button'); pg.setAttribute('aria-label', fn);
      pg.setAttribute('style', 'cursor:pointer;outline:none');
      const u = el('use', { width: cw, height: ch }); u.setAttribute('href', `#${sym}`);
      pg.appendChild(u);
      if (!NO_LINK_KINDS.has(gr.kind)) {
        drawLed(pg, uid, 6, 5, connected ? 'green' : 'off', 1.4);
        drawLed(pg, uid, cw - 6, 5, connected ? 'greenBlink' : 'off', 1.4);
      }
      const t = el('text', { x: cw / 2, y: ch + 10, 'text-anchor': 'middle', 'font-size': fn.length > 3 ? 6.5 : 8, 'font-weight': 600, fill: '#aeb6bd', 'pointer-events': 'none' });
      t.textContent = fn;
      pg.appendChild(t);
      const hov = el('rect', { x: 0, y: 0, width: cw, height: ch, rx: 2.5, fill: accent, opacity: 0, 'pointer-events': 'none' });
      hov.setAttribute('class', `hov-${uid}`);
      pg.appendChild(hov);
      ns.appendChild(pg);
    });
  });

  // Section framing — dashed bounding boxes + a bottom bracket grouping the panel into the
  // three zones a real KVM/console-server's silkscreen shows: local ports (blue), management
  // (grey), and 8-port target/serial banks (amber) with a shared "Nx RJ45" bracket underneath.
  // Only these two kinds have enough distinct customizable groups to make this framing useful.
  if (kind === 'kvm' || kind === 'console') {
    const LOCAL_KINDS = new Set<GroupKind>(['usb', 'vga', 'hdmi', 'dvi', 'displayport', 'audio', 'mic']);
    const localIdx = groups.map((_, i) => i).filter(i => LOCAL_KINDS.has(groups[i].kind));
    const mgmtIdx = groups.map((_, i) => i).filter(i => groups[i].portType === 'management' || groups[i].portType === 'serial');
    const targetIdx = groups.map((_, i) => i).filter(i => groups[i].portType === 'console');

    const boxY0 = portsTop - 16, boxY1 = portsTop + tallest + 16;
    const frame = (idxs: number[], color: string, label?: string): { x0: number; x1: number } | undefined => {
      if (!idxs.length) return undefined;
      const x0 = Math.min(...idxs.map(i => groupX[i])) - 6;
      const x1 = Math.max(...idxs.map(i => groupX[i] + groupW[i])) + 6;
      ns.appendChild(el('rect', {
        x: x0, y: boxY0, width: x1 - x0, height: boxY1 - boxY0, rx: 5,
        fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3 2', opacity: 0.55,
      }));
      if (label) {
        const t = el('text', { x: x0 + 4, y: boxY0 - 5, 'font-size': 7.5, 'font-weight': 700, fill: color, 'letter-spacing': 1 });
        t.textContent = label;
        ns.appendChild(t);
      }
      return { x0, x1 };
    };

    frame(localIdx, '#37b6ff', kind === 'kvm' ? 'LOCAL CONSOLE PORTS' : 'LOCAL PORTS');
    frame(mgmtIdx, '#9aa3ab', 'MANAGEMENT');

    // Each 8-port (or smaller final remainder) bank drawn in buildGroups gets its own amber
    // frame — no per-frame label, the numbered jacks plus the shared bracket below say enough.
    let targetsExtent: { x0: number; x1: number } | undefined;
    targetIdx.forEach(i => {
      const r = frame([i], '#e0a030');
      if (r) targetsExtent = targetsExtent
        ? { x0: Math.min(targetsExtent.x0, r.x0), x1: Math.max(targetsExtent.x1, r.x1) }
        : r;
    });
    if (targetsExtent) {
      const { x0, x1 } = targetsExtent;
      const by = boxY1 + 4;
      ns.appendChild(el('line', { x1: x0 + 4, y1: by, x2: x1 - 4, y2: by, stroke: '#e0a030', 'stroke-width': 1.2, opacity: 0.75 }));
      ns.appendChild(el('line', { x1: x0 + 4, y1: by, x2: x0 + 4, y2: by + 4, stroke: '#e0a030', 'stroke-width': 1.2, opacity: 0.75 }));
      ns.appendChild(el('line', { x1: x1 - 4, y1: by, x2: x1 - 4, y2: by + 4, stroke: '#e0a030', 'stroke-width': 1.2, opacity: 0.75 }));
      const bt = el('text', { x: (x0 + x1) / 2, y: by + 11, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, fill: '#e0a030', 'letter-spacing': 0.8 });
      bt.textContent = kind === 'kvm' ? `${portCount}× RJ45 SERVER PORTS` : `${portCount}× RJ45 SERIAL PORTS`;
      ns.appendChild(bt);
    }
  }

  addKeyframeStyle(ns, uid);
  group.appendChild(ns);
  return group;
}
