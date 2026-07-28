# New Devices Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate three parallel device workstreams into the Rack Slicer TypeScript app: (1) a fresh vendor-specific switch renderer, (2) a white-chassis FortiGate 400F renderer, and (3) a detailed PDU outlet renderer with configurator sidebar.

**Architecture:** Shared `rack-kit.ts` exports SVG element helpers, geometry constants, and dark-chassis drawing primitives used by the switch renderer. FortiGate is self-contained (white palette). PDU reads `deviceData.deviceConfig` for finish/socket layout. `panel-renderer.ts` becomes a thin dispatcher importing from the new files.

**Tech Stack:** Vanilla TypeScript, DOM SVG API, Vite, Vitest. No React/JSX — all JSX sources are translated to `document.createElementNS` calls.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/core/types.ts` | Modify | Add `deviceConfig?: Record<string,unknown>` to `DeviceData` |
| `src/renderers/rack-kit.ts` | Create | Shared `el`, `g`, `fitToRack`, `makeRackDefs`, `drawChassis`, `drawBlades`, `drawLed` |
| `src/renderers/switch-renderer.ts` | Create | `renderSwitchPanel` (ported from panel-renderer) + `switchPorts` (moved from catalog) |
| `src/renderers/fortigate-renderer.ts` | Create | `renderFortiGatePanel` (white chassis, zone-based layout) |
| `src/renderers/pdu-renderer.ts` | Create | `renderPduPanel` with `deviceConfig` finish + socket layout |
| `src/renderers/panel-renderer.ts` | Modify | Thin dispatcher; add `deviceData` param; import from new renderers |
| `src/library/device-catalog.ts` | Modify | Remove old switches; add 5 vendor switches, FortiGate 400F, 4 PDU entries |
| `src/renderers/device-renderer.ts` | Modify | Pass `device` as `deviceData` arg to `renderFrontPanel` |
| `src/components/pdu-configurator.ts` | Create | Sidebar UI for PDU finish/voltage/socket-row config |
| `src/components/properties.ts` | Modify | Mount/unmount PDU configurator when category === 'pdu' |
| `src/__tests__/panel-renderer.test.ts` | Modify | Update switch IDs; add `null` deviceData arg |
| `src/__tests__/device-catalog.test.ts` | Modify | Update OEM test; update switch ID refs |

---

## Task 1: Add `deviceConfig` to `DeviceData`

**Files:**
- Modify: `src/core/types.ts:59-72`

- [ ] **Step 1: Edit `DeviceData` interface**

In `src/core/types.ts`, add one field after `frontPanelImage?`:

```typescript
export interface DeviceData {
  id: string;
  templateId: string;
  rackId: string;
  startUnit: number;
  name: string;
  hostname: string;
  managementIp: string;
  serialNumber: string;
  description: string;
  locked?: boolean;
  ports: PortData[];
  frontPanelImage?: string;
  deviceConfig?: Record<string, unknown>;  // PDU configurator state
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors (the field is optional — zero existing code breaks).

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add optional deviceConfig to DeviceData for PDU configurator state"
```

---

## Task 2: Create `rack-kit.ts` — Shared SVG Primitives

**Files:**
- Create: `src/renderers/rack-kit.ts`

Source: geometry extracted from `src/renderers/panel-renderer.ts` lines 3–23, 196–231, 289–311 (same code, extracted so other renderers don't duplicate it).

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit`
Expected: No errors (rack-kit exports are typed, not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add src/renderers/rack-kit.ts
git commit -m "feat: add rack-kit.ts shared SVG primitives (el, g, fitToRack, makeRackDefs, drawChassis, drawBlades, drawLed)"
```

---

## Task 3: Create `switch-renderer.ts`

**Files:**
- Create: `src/renderers/switch-renderer.ts`

The implementation is a refactor of `src/renderers/panel-renderer.ts` lines 112–399 (the existing `renderSwitchPanel` function) combined with the `switchPorts` function from `src/library/device-catalog.ts` lines 6–63. Imports replace the locally-defined helpers.

- [ ] **Step 1: Create the file**

```typescript
// src/renderers/switch-renderer.ts
import { el, g, U1, makeRackDefs, drawChassis, drawBlades, drawLed } from './rack-kit';
import type { DeviceTemplate, PortData } from '../core/types';

// ─── Port position calculator ─────────────────────────────────────────────────
// Computes JSX-accurate port positions matching the nested-SVG viewBox scale.
// Exported so device-catalog.ts can import it directly.
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

  // Nested SVG: renders JSX geometry at native 1240×132 coords, scaled to W×H via viewBox.
  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${totW} ${JU}`);
  ns.setAttribute('preserveAspectRatio', 'none');

  const defs = makeRackDefs(ns, uid);

  // Switch-specific RJ45 symbols
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

  // SFP empty cage symbol
  const sfpC = el('symbol', { id: `${uid}sfpc`, viewBox: `0 0 ${SFPW} ${SFPH}` });
  sfpC.appendChild(el('rect', { x: 0.5, y: 0.5, width: SFPW-1, height: SFPH-1, rx: 2.5, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 1 }));
  sfpC.appendChild(el('rect', { x: 1.5, y: 1.5, width: SFPW-3, height: SFPH-3, rx: 2, fill: 'none', stroke: `url(#${uid}lp)`, 'stroke-width': 1, opacity: 0.8 }));
  sfpC.appendChild(el('rect', { x: 5, y: 11, width: SFPW-10, height: SFPH-18, rx: 1.5, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  for (let i = 0; i < 7; i++) { const gw = (SFPW-15)/7; sfpC.appendChild(el('rect', { x: 7.5+i*gw, y: 13, width: gw-1.3, height: SFPH-24, fill: `url(#${uid}go)`, rx: 0.4, opacity: 0.9 })); }
  sfpC.appendChild(el('rect', { x: SFPW/2-5.5, y: 5.5, width: 11, height: 2.2, rx: 1.1, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.5 }));
  sfpC.appendChild(el('rect', { x: 3, y: 2.6, width: SFPW-6, height: 1.4, rx: 0.7, fill: '#6a7178', opacity: 0.5 }));
  defs.appendChild(sfpC);

  // SFP fiber transceiver symbol
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

  // Chassis + blades
  drawChassis(ns, uid, chassisX, chassisW);
  drawBlades(ns, uid, totW, bladeW);

  // Console section
  const cy = JU / 2;
  const con = el('g');
  con.setAttribute('transform', `translate(${consX} 0)`);

  [['PWR','#39ff8a',true],['SYS','#39ff8a',true],['ALM','#20262b',false],['LOC','#37b6ff',true]].forEach(([lbl, color, on], i) => {
    const ly = 20 + i * 22;
    drawLed(con, uid, 10, ly, color as string, on as boolean);
    const t = el('text', { x: 20, y: ly + 3.4, 'font-size': 8.5, fill: '#aeb6bd', 'letter-spacing': 0.6 });
    t.textContent = lbl as string; con.appendChild(t);
  });

  const tw = el('text', { x: 62, y: cy-12, 'font-size': 17, 'font-weight': 700, fill: '#37b6ff', 'letter-spacing': 1.5 });
  tw.textContent = 'RACK SLICER'; con.appendChild(tw);
  const tm = el('text', { x: 62, y: cy+5, 'font-size': 9, fill: '#8b939a', 'letter-spacing': 1.2 });
  tm.textContent = model; con.appendChild(tm);
  con.appendChild(el('rect', { x: 62, y: cy+12, width: 112, height: 1, fill: '#3a4147' }));
  const tp = el('text', { x: 62, y: cy+25, 'font-size': 7, fill: '#5b636a', 'letter-spacing': 1.2 });
  tp.textContent = `${rj45Count ? rj45Count + '× RJ45' : ''}${sfpCount ? (rj45Count ? ' + ' : '') + sfpCount + '× SFP' : ''} • 1U`;
  con.appendChild(tp);

  // USB-C
  const ug = el('g'); ug.setAttribute('transform', `translate(${CON - 110} ${cy + 6})`);
  ug.appendChild(el('rect', { x: 0, y: 0, width: 24, height: 9, rx: 4.5, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  ug.appendChild(el('rect', { x: 3, y: 2.9, width: 18, height: 3.2, rx: 1.6, fill: '#2a3036' }));
  const tu = el('text', { x: 12, y: 18, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tu.textContent = 'USB-C'; ug.appendChild(tu); con.appendChild(ug);

  // Console RJ45
  const rjCon = el('g'); rjCon.setAttribute('transform', `translate(${CON - 72} ${cy + 4})`);
  rjCon.appendChild(el('rect', { x: 0, y: 0, width: 26, height: 18, rx: 1.6, fill: `url(#${uid}cg)`, stroke: '#05070a', 'stroke-width': 0.9 }));
  rjCon.appendChild(el('rect', { x: 2, y: 2, width: 22, height: 14, rx: 1, fill: `url(#${uid}ci)`, filter: `url(#${uid}is)` }));
  rjCon.appendChild(el('path', { d: 'M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z', fill: '#04060a' }));
  for (let i = 0; i < 8; i++) rjCon.appendChild(el('rect', { x: 4 + i * 2.3, y: 4.5, width: 1.3, height: 4, fill: '#c9a24b', opacity: 0.8 }));
  const tc = el('text', { x: 13, y: 26, 'font-size': 6.5, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tc.textContent = 'CONSOLE'; rjCon.appendChild(tc); con.appendChild(rjCon);

  // RST button
  const rstG = el('g'); rstG.setAttribute('transform', `translate(${CON - 22} ${cy + 11})`);
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 3.4, fill: '#0a0d0f', stroke: '#3a4147', 'stroke-width': 0.8 }));
  rstG.appendChild(el('circle', { cx: 0, cy: 0, r: 1.1, fill: '#02040a' }));
  const tr = el('text', { x: 0, y: 14, 'font-size': 6, 'text-anchor': 'middle', fill: '#7b838a', 'letter-spacing': 0.6 });
  tr.textContent = 'RST'; rstG.appendChild(tr); con.appendChild(rstG);

  ns.appendChild(con);

  // RJ45 copper ports
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

  // Port number labels
  for (let n = 1; n <= rj45Count; n++) {
    const { x, y, row, single } = rjPos(n);
    const labelY = single ? y + RJH + 11 : row === 0 ? y - 4 : y + RJH + 11;
    const t = el('text', { x: x + RJW / 2, y: labelY, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: '#aeb6bd' });
    t.textContent = String(n); ns.appendChild(t);
  }

  // SFP uplink cages
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderers/switch-renderer.ts
git commit -m "feat: add switch-renderer.ts with renderSwitchPanel and exported switchPorts"
```

---

## Task 4: Update catalog + panel-renderer + tests (Switch)

**Files:**
- Modify: `src/library/device-catalog.ts`
- Modify: `src/renderers/panel-renderer.ts`
- Modify: `src/__tests__/device-catalog.test.ts`
- Modify: `src/__tests__/panel-renderer.test.ts`

These four files must change in one commit to keep the test suite green.

- [ ] **Step 1: Update `device-catalog.ts`**

At the top of `src/library/device-catalog.ts`:
- Remove the entire `switchPorts` function (lines 6–63).
- Add this import directly below the existing import line:

```typescript
import { switchPorts } from '../renderers/switch-renderer';
```

Then find the switch entries block (search for `id: 'switch-8p'`). Replace ALL entries from `switch-8p` through `switch-sfp12` (all `category: 'switch'` entries) with:

```typescript
  // ─── SWITCHES (vendor-specific) ─────────────────────────────────────────────
  {
    id: 'sw-tplink-sg2424',
    name: 'TP-LINK TL-SG2424',
    manufacturer: 'TP-LINK',
    model: 'TL-SG2424',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1e21',
    icon: '🔀',
    ports: switchPorts(24, 4, 2, 'tpsg2424-'),
  },
  {
    id: 'sw-tplink-sg2448',
    name: 'TP-LINK TL-SG2448',
    manufacturer: 'TP-LINK',
    model: 'TL-SG2448',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1e21',
    icon: '🔀',
    ports: switchPorts(48, 4, 2, 'tpsg2448-'),
  },
  {
    id: 'sw-cisco-sg350-28',
    name: 'Cisco SG350-28',
    manufacturer: 'Cisco',
    model: 'SG350-28',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1e21',
    icon: '🔀',
    ports: switchPorts(24, 4, 2, 'sg35028-'),
  },
  {
    id: 'sw-cisco-sg350-52',
    name: 'Cisco SG350-52',
    manufacturer: 'Cisco',
    model: 'SG350-52',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1e21',
    icon: '🔀',
    ports: switchPorts(48, 4, 2, 'sg35052-'),
  },
  {
    id: 'sw-cisco-c9200-24',
    name: 'Cisco Catalyst 9200-24',
    manufacturer: 'Cisco',
    model: 'Catalyst 9200-24',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1e21',
    icon: '🔀',
    ports: switchPorts(24, 4, 2, 'c920024-'),
  },
```

- [ ] **Step 2: Update `panel-renderer.ts`**

a. Add the import at the top of `panel-renderer.ts` (after the existing type import):

```typescript
import { renderSwitchPanel } from './switch-renderer';
```

b. Delete the entire `renderSwitchPanel` function body from `panel-renderer.ts` (lines 112–399). The function declaration AND its full body. The import above replaces it.

c. No other changes to panel-renderer.ts at this step (dispatcher already calls `renderSwitchPanel` which now resolves from the import).

- [ ] **Step 3: Update `device-catalog.test.ts`**

Replace the two switch-specific tests:

```typescript
  it('has no OEM manufacturer names in generic entries', () => {
    // Vendor-specific entries (Cisco, TP-LINK, Fortinet, APC) are now expected.
    // Only check that no *generic placeholder* has an OEM name.
    const genericOemNames = ['Dell', 'HPE', 'Supermicro'];
    for (const item of deviceCatalog) {
      for (const oem of genericOemNames) {
        expect(item.name).not.toContain(oem);
        expect(item.manufacturer).not.toContain(oem);
      }
    }
  });

  it('sw-tplink-sg2424 has 24 rj45 ports and 4 sfp-plus ports', () => {
    const t = getTemplate('sw-tplink-sg2424');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    const sfp = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe(24);
    expect(sfp.length).toBe(4);
  });

  it('sw-tplink-sg2448 has 48 rj45 ports and 4 sfp-plus ports', () => {
    const t = getTemplate('sw-tplink-sg2448');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    const sfp = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe(48);
    expect(sfp.length).toBe(4);
  });
```

- [ ] **Step 4: Update `panel-renderer.test.ts`**

Replace the two switch tests at lines 8–19:

```typescript
  it('returns an SVGGElement for sw-tplink-sg2424', () => {
    const t = getTemplate('sw-tplink-sg2424')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result).toBeDefined();
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for sw-tplink-sg2448', () => {
    const t = getTemplate('sw-tplink-sg2448')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });
```

Note: `null` is the new `deviceData` param (not yet added to the signature — leave the test as 4 args for now, the signature change happens in Task 8). Only update the template IDs at this step.

Actually — to keep things simple, only update the template IDs in panel-renderer.test.ts at this step (swap `switch-24p` → `sw-tplink-sg2424` and `switch-48p` → `sw-tplink-sg2448`). The signature update happens in Task 8.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass. The catalog test now checks TP-LINK/Cisco IDs; the renderer test resolves the new IDs.

- [ ] **Step 6: Commit**

```bash
git add src/library/device-catalog.ts src/renderers/panel-renderer.ts src/__tests__/device-catalog.test.ts src/__tests__/panel-renderer.test.ts
git commit -m "feat: replace generic switch catalog entries with 5 vendor-specific models; switch renderer now imported from switch-renderer.ts"
```

---

## Task 5: Create `fortigate-renderer.ts`

**Files:**
- Create: `src/renderers/fortigate-renderer.ts`

Source: `New_Development/RackFortiGate.jsx` — translated to TypeScript DOM API. The FortiGate has its own white palette and does not use dark-chassis rack-kit gradients; only `el` and `g` helpers are imported.

- [ ] **Step 1: Create the file**

```typescript
// src/renderers/fortigate-renderer.ts
import { el, g } from './rack-kit';
import type { DeviceTemplate } from '../core/types';

const PORT_W = 26, PORT_H = 20, COL_GAP = 5, ZONE_GAP = 26;
const EAR = 30, padL = 8, padR = 20, padY = 16, ROW_LABEL_H = 16, PAIR_GAP = 6;
const brandW = 190;

// Light palette (Fortinet white chassis)
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
  // Keystone mouth
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
  // Link LED
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

  // Compute geometry
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

  const sx = W / fullW;
  const sy = H / totalH;

  // Nested SVG for viewBox scaling
  const ns = el('svg', { width: W, height: H });
  ns.setAttribute('viewBox', `0 0 ${fullW} ${totalH}`);
  ns.setAttribute('preserveAspectRatio', 'none');

  drawFortiGateDefs(ns, uid);

  // Rack ears
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

  // Chassis
  const chG = el('g');
  chG.setAttribute('transform', `translate(${EAR} 0)`);
  chG.setAttribute('filter', `url(#${uid}wsh)`);
  chG.appendChild(el('rect', { x: 0, y: 2, width: totalW, height: totalH - 4, rx: 6, fill: `url(#${uid}wch)`, stroke: C.chassisEdge, 'stroke-width': 1.2 }));

  // Brand mark
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

  // Ports and labels
  placed.forEach(p => {
    const z = p.zone;
    const py = p.row === 0 ? topRowY : botRowY;
    const px = p.x - EAR; // chassis-local x
    const up = true; // static — all up in catalog view

    if (z.kind === 'sfp') {
      drawSfpPort(chG, px, py, up);
    } else {
      drawRj45Port(chG, uid, px, py, up);
    }

    // Per-column label above top row / below bottom row
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

/** Pre-compute port overlay positions for the FortiGate 400F catalog entry. */
export function fortigatePorts(): DeviceTemplate['ports'] {
  let cursor = brandW + 24;
  const placed: { x: number; row: number; zone: Zone; i: number }[] = [];
  const zoneWidths: number[] = [];

  DEFAULT_ZONES.forEach(z => {
    const cols = Math.ceil(z.count / 2);
    const zW = cols * PORT_W + (cols - 1) * COL_GAP;
    zoneWidths.push(zW);
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

  DEFAULT_ZONES.forEach((z, zi) => {
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
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderers/fortigate-renderer.ts
git commit -m "feat: add fortigate-renderer.ts with white-chassis zone-based port layout"
```

---

## Task 6: Wire FortiGate into dispatcher + catalog

**Files:**
- Modify: `src/renderers/panel-renderer.ts`
- Modify: `src/library/device-catalog.ts`

- [ ] **Step 1: Import in `panel-renderer.ts`**

Add at the top of `panel-renderer.ts` (after the switch-renderer import):

```typescript
import { renderFortiGatePanel } from './fortigate-renderer';
```

- [ ] **Step 2: Update the dispatcher in `panel-renderer.ts`**

Find the firewall case in the switch statement (line ~736):

```typescript
case 'firewall':      return renderFirewallPanel(template, deviceWidth, deviceHeight);
```

Replace with:

```typescript
case 'firewall':
  return template?.id === 'fw-fortigate-400f'
    ? renderFortiGatePanel(template, deviceWidth, deviceHeight)
    : renderFirewallPanel(template, deviceWidth, deviceHeight);
```

Note: `deviceData` parameter has not been added yet — that happens in Task 8.

- [ ] **Step 3: Add FortiGate catalog entry to `device-catalog.ts`**

Add the import at the top of `device-catalog.ts` (below the existing imports):

```typescript
import { fortigatePorts } from '../renderers/fortigate-renderer';
```

Then in the FIREWALLS section (after the existing `fw-12p` entry), add:

```typescript
  {
    id: 'fw-fortigate-400f',
    name: 'FortiGate 400F',
    manufacturer: 'Fortinet',
    model: 'FortiGate 400F',
    category: 'firewall',
    heightUnits: 1,
    color: '#ffffff',
    icon: '🛡️',
    ports: fortigatePorts(),
  },
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/panel-renderer.ts src/library/device-catalog.ts
git commit -m "feat: add FortiGate 400F to dispatcher and catalog (white chassis renderer)"
```

---

## Task 7: Create `pdu-renderer.ts`

**Files:**
- Create: `src/renderers/pdu-renderer.ts`

Port the SVG rendering portions of `New_Development/PDUConfigurator.jsx`, translating innerHTML string building to DOM API. The existing generic `renderPduPanel` from `panel-renderer.ts` is preserved as the fallback code path.

- [ ] **Step 1: Create the file**

```typescript
// src/renderers/pdu-renderer.ts
import { el, g } from './rack-kit';
import type { DeviceTemplate, DeviceData } from '../core/types';

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
  // L, N, Earth pins
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
  // L, N slots (rectangles), ground (circle)
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
  return 17; // C13 default
}

/** Render PDU with deviceConfig rows (finish + socket layout). */
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

  // Chassis background
  ns.appendChild(el('rect', { x: 0, y: 1, width: W, height: H - 2, rx: 3, fill: `url(#${uid}pf)`, stroke: finish.lo, 'stroke-width': 1 }));
  ns.appendChild(el('rect', { x: 2, y: 2.5, width: W - 4, height: 1.5, rx: 0.75, fill: finish.hi, opacity: 0.4 }));

  // Power indicator LED
  const ledR = Math.min(3.5, H / 6);
  const ledX = 10 + ledR, ledY = H / 2;
  ns.appendChild(el('circle', { cx: ledX, cy: ledY, r: ledR + 1.5, fill: '#37e07a', opacity: 0.15 }));
  ns.appendChild(el('circle', { cx: ledX, cy: ledY, r: ledR, fill: '#37e07a', stroke: '#000', 'stroke-width': 0.4 }));
  ns.appendChild(el('circle', { cx: ledX - ledR * 0.3, cy: ledY - ledR * 0.3, r: ledR * 0.35, fill: '#fff', opacity: 0.75 }));

  // Distribute sockets across available width
  const allSockets: { type: string }[] = rows.flatMap(row =>
    Array.from({ length: row.count }, () => ({ type: row.socketType })),
  );
  const socketArea = W - 24 - 8; // after LED area and right margin
  const startX = 24;
  const totalSocketW = allSockets.reduce((sum, s) => sum + socketWidth(s.type), 0);
  const spacing = allSockets.length > 1
    ? Math.min(6, (socketArea - totalSocketW) / (allSockets.length - 1))
    : 0;

  let cx = startX + socketWidth(allSockets[0]?.type ?? 'C13') / 2;
  allSockets.forEach(s => {
    const sw = socketWidth(s.type);
    drawSocket(ns, uid, s.type, cx, H / 2, );
    cx += sw + spacing;
  });

  // Model label (right-aligned)
  if (template?.model) {
    const lbl = el('text', { x: W - 6, y: H / 2 + 3, 'text-anchor': 'end', 'font-size': 7, fill: finish.text, 'font-family': 'monospace', opacity: 0.6, 'letter-spacing': 0.8 });
    lbl.textContent = template.model;
    ns.appendChild(lbl);
  }

  group.appendChild(ns);
  return group;
}

/** Generic PDU fallback (same as old panel-renderer.ts renderPduPanel). */
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
    [ax + 4, ax + 8.5, ax + 13].forEach(cx => {
      group.appendChild(el('rect', { x: cx, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
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
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderers/pdu-renderer.ts
git commit -m "feat: add pdu-renderer.ts with finish-system and C13/C19/NEMA-5-15 socket symbols"
```

---

## Task 8: Update `renderFrontPanel` signature + PDU dispatch + call sites

**Files:**
- Modify: `src/renderers/panel-renderer.ts`
- Modify: `src/renderers/device-renderer.ts`
- Modify: `src/__tests__/panel-renderer.test.ts`

All three must change in one commit because the signature change breaks the test.

- [ ] **Step 1: Update `panel-renderer.ts`**

a. Add the import (after the fortigate import):

```typescript
import { renderPduPanel } from './pdu-renderer';
```

b. Delete the existing `renderPduPanel` function body from `panel-renderer.ts` (the old implementation, ~32 lines starting at line 532).

c. Change the exported function signature:

```typescript
export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,   // new parameter
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement {
```

Add the `DeviceData` type import at the top:

```typescript
import { DeviceCategory, DeviceTemplate, DeviceData } from '../core/types';
```

d. Update the PDU case in the dispatcher:

```typescript
case 'pdu': return renderPduPanel(template, deviceData, deviceWidth, deviceHeight);
```

All other cases remain unchanged (they ignore `deviceData`).

- [ ] **Step 2: Update `device-renderer.ts`**

Find line 206 (the `renderFrontPanel` call):

```typescript
// Old:
const panel = renderFrontPanel(category, template ?? null, deviceWidth, deviceHeight);
// New:
const panel = renderFrontPanel(category, template ?? null, device, deviceWidth, deviceHeight);
```

The variable `device` is already in scope at that point (it's the `DeviceData` being rendered).

- [ ] **Step 3: Update `panel-renderer.test.ts`**

Add `null` as the third argument to every `renderFrontPanel` call:

```typescript
// Line 10: switch test
const result = renderFrontPanel('switch', t, null, W, 30);

// Line 16: switch-48p test
const result = renderFrontPanel('switch', t, null, W, 30);

// Line 22: server-2u test
const result = renderFrontPanel('server', t, null, W, 60);

// Line 27: null template test
const result = renderFrontPanel('server', null, null, W, 30);

// Line 36: every-category loop
const result = renderFrontPanel(cat, null, null, W, 30);
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All 70+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/panel-renderer.ts src/renderers/device-renderer.ts src/__tests__/panel-renderer.test.ts
git commit -m "feat: add deviceData param to renderFrontPanel; wire PDU renderer; update call sites"
```

---

## Task 9: Add PDU catalog entries

**Files:**
- Modify: `src/library/device-catalog.ts`

- [ ] **Step 1: Find the existing PDU entries** (`pdu-8`, `pdu-12`, etc.) and add new entries BEFORE them. The old entries are preserved as fallback (no deviceConfig → generic renderer path).

Add these four entries at the top of the PDU section:

```typescript
  // ─── PDU (vendor-specific, with deviceConfig) ────────────────────────────
  {
    id: 'pdu-basic-8c13',
    name: 'Basic PDU 8×C13',
    manufacturer: 'Generic',
    model: 'Basic PDU 8×C13',
    category: 'pdu',
    heightUnits: 1,
    color: '#0f0f0f',
    icon: '🔌',
    ports: Array.from({ length: 8 }, (_, i) => ({
      id: `pdu-basic-8c13-o${i+1}`, name: `Outlet ${i+1}`, type: 'power' as const,
      relativeX: 24 + i * 40, relativeY: 15,
    })),
    deviceConfig: { finish: 'ral9005-texture', rows: [{ count: 8, socketType: 'C13' }] },
  } as DeviceTemplate & { deviceConfig: Record<string, unknown> },
  {
    id: 'pdu-metered-16c13',
    name: 'Metered PDU 16×C13',
    manufacturer: 'Generic',
    model: 'Metered PDU 16×C13',
    category: 'pdu',
    heightUnits: 1,
    color: '#33373b',
    icon: '🔌',
    ports: Array.from({ length: 16 }, (_, i) => ({
      id: `pdu-metered-16c13-o${i+1}`, name: `Outlet ${i+1}`, type: 'power' as const,
      relativeX: 24 + i * 20, relativeY: 15,
    })),
    deviceConfig: { finish: 'darkGrey', rows: [{ count: 16, socketType: 'C13' }] },
  } as DeviceTemplate & { deviceConfig: Record<string, unknown> },
  {
    id: 'pdu-smart-20mix',
    name: 'Smart PDU 20×C13 + 2×C19',
    manufacturer: 'Generic',
    model: 'Smart PDU 20×C13 + 2×C19',
    category: 'pdu',
    heightUnits: 2,
    color: '#0f0f0f',
    icon: '🔌',
    ports: [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `pdu-smart-c13-${i+1}`, name: `C13 ${i+1}`, type: 'power' as const, relativeX: 24 + i * 15, relativeY: 20 })),
      ...Array.from({ length: 2 },  (_, i) => ({ id: `pdu-smart-c19-${i+1}`, name: `C19 ${i+1}`, type: 'power' as const, relativeX: 24 + i * 25, relativeY: 45 })),
    ],
    deviceConfig: { finish: 'ral9005-texture', rows: [{ count: 20, socketType: 'C13' }, { count: 2, socketType: 'C19' }] },
  } as DeviceTemplate & { deviceConfig: Record<string, unknown> },
  {
    id: 'pdu-apc-ap7920',
    name: 'APC AP7920',
    manufacturer: 'APC',
    model: 'AP7920',
    category: 'pdu',
    heightUnits: 1,
    color: '#e8eaec',
    icon: '🔌',
    ports: Array.from({ length: 8 }, (_, i) => ({
      id: `pdu-apc-ap7920-o${i+1}`, name: `Outlet ${i+1}`, type: 'power' as const,
      relativeX: 24 + i * 40, relativeY: 15,
    })),
    deviceConfig: { finish: 'brushedAluminium', rows: [{ count: 8, socketType: 'C13' }] },
  } as DeviceTemplate & { deviceConfig: Record<string, unknown> },
```

Note: `deviceConfig` on the template is used only to seed the initial config when a device is first added. The instance's `DeviceData.deviceConfig` is what gets persisted and mutated.

The `deviceConfig` field doesn't exist on `DeviceTemplate` — these entries cast to include it. Alternatively, add `deviceConfig?: Record<string,unknown>` to `DeviceTemplate` in `types.ts` as well (simpler approach):

In `src/core/types.ts`, add to `DeviceTemplate`:

```typescript
export interface DeviceTemplate {
  // ... existing fields ...
  deviceConfig?: Record<string, unknown>;  // default config seeded into DeviceData on device add
}
```

Then the cast is not needed. Use this approach.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass (new catalog entries, no test removal).

- [ ] **Step 3: Commit**

```bash
git add src/library/device-catalog.ts src/core/types.ts
git commit -m "feat: add 4 configured PDU catalog entries (C13, C19, mixed) with default deviceConfig"
```

---

## Task 10: Create `pdu-configurator.ts`

**Files:**
- Create: `src/components/pdu-configurator.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/components/pdu-configurator.ts
import type { DeviceData } from '../core/types';

interface PduRow { count: number; socketType: 'C13' | 'C19' | 'NEMA-5-15'; }

interface PduConfig {
  finish: string;
  voltage: string;
  rows: PduRow[];
}

const FINISH_OPTIONS = [
  { key: 'ral9005-texture', hi: '#2a2a2a', label: 'Textured Black' },
  { key: 'black',           hi: '#3a3d40', label: 'Black' },
  { key: 'darkGrey',        hi: '#54585c', label: 'Dark Grey' },
  { key: 'lightGrey',       hi: '#c8ccd0', label: 'Light Grey' },
  { key: 'white',           hi: '#ffffff', label: 'White' },
  { key: 'brushedAluminium',hi: '#e8eaec', label: 'Brushed Aluminium' },
];

function getConfig(device: DeviceData): PduConfig {
  const raw = device.deviceConfig ?? {};
  return {
    finish: (raw.finish as string) ?? 'ral9005-texture',
    voltage: (raw.voltage as string) ?? '230V',
    rows: (raw.rows as PduRow[]) ?? [{ count: 8, socketType: 'C13' }],
  };
}

export function mountPduConfigurator(
  container: HTMLElement,
  device: DeviceData,
  onUpdate: (config: Record<string, unknown>) => void,
): void {
  let config = getConfig(device);

  function render() {
    container.innerHTML = `
      <div style="padding-top:4px;">
        <div style="font-weight:600;font-size:12px;color:var(--text-secondary);margin-bottom:10px;letter-spacing:0.5px;">PDU CONFIGURATION</div>

        <div style="margin-bottom:12px;">
          <label style="font-size:11px;display:block;margin-bottom:6px;color:var(--text-muted);">Finish</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;" id="pdu-finish-swatches">
            ${FINISH_OPTIONS.map(f => `
              <div data-finish="${f.key}" title="${f.label}" style="
                width:22px;height:22px;border-radius:4px;cursor:pointer;
                background:${f.hi};
                border:2px solid ${config.finish === f.key ? '#58a6ff' : 'transparent'};
                box-shadow:0 0 0 1px rgba(0,0,0,0.4);
              "></div>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:11px;display:block;margin-bottom:4px;color:var(--text-muted);">Voltage</label>
          <select id="pdu-voltage" style="width:100%;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:5px 8px;font-size:12px;">
            <option value="208V" ${config.voltage === '208V' ? 'selected' : ''}>208V</option>
            <option value="230V" ${config.voltage === '230V' ? 'selected' : ''}>230V</option>
            <option value="240V" ${config.voltage === '240V' ? 'selected' : ''}>240V</option>
          </select>
        </div>

        <div style="margin-bottom:8px;">
          <label style="font-size:11px;display:block;margin-bottom:6px;color:var(--text-muted);">Socket Rows</label>
          <div id="pdu-rows-list">
            ${config.rows.map((row, idx) => `
              <div data-row-idx="${idx}" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                <select class="pdu-row-type" data-idx="${idx}" style="flex:1;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:4px 6px;font-size:11px;">
                  <option value="C13" ${row.socketType === 'C13' ? 'selected' : ''}>IEC C13</option>
                  <option value="C19" ${row.socketType === 'C19' ? 'selected' : ''}>IEC C19</option>
                  <option value="NEMA-5-15" ${row.socketType === 'NEMA-5-15' ? 'selected' : ''}>NEMA 5-15</option>
                </select>
                <input class="pdu-row-count" type="number" data-idx="${idx}" value="${row.count}" min="1" max="24"
                  style="width:50px;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:4px 6px;font-size:11px;" />
                <button class="pdu-row-remove" data-idx="${idx}" style="background:rgba(248,81,73,0.15);border:1px solid var(--danger-color);color:var(--danger-color);border-radius:4px;padding:4px 7px;font-size:11px;cursor:pointer;">×</button>
              </div>
            `).join('')}
          </div>
          <button id="pdu-add-row" style="width:100%;background:rgba(88,166,255,0.1);border:1px solid var(--accent-primary);color:var(--accent-primary);border-radius:4px;padding:6px;font-size:11px;cursor:pointer;margin-top:2px;">+ Add Row</button>
        </div>
      </div>
    `;

    // Finish swatches
    container.querySelectorAll('[data-finish]').forEach(el => {
      el.addEventListener('click', () => {
        config = { ...config, finish: (el as HTMLElement).dataset.finish! };
        emit();
      });
    });

    // Voltage
    container.querySelector('#pdu-voltage')?.addEventListener('change', (e: any) => {
      config = { ...config, voltage: e.target.value };
      emit();
    });

    // Row type dropdowns
    container.querySelectorAll('.pdu-row-type').forEach(sel => {
      sel.addEventListener('change', (e: any) => {
        const idx = parseInt((sel as HTMLElement).dataset.idx!);
        const newRows = config.rows.map((r, i) => i === idx ? { ...r, socketType: e.target.value as PduRow['socketType'] } : r);
        config = { ...config, rows: newRows };
        emit();
      });
    });

    // Row count inputs
    container.querySelectorAll('.pdu-row-count').forEach(inp => {
      inp.addEventListener('change', (e: any) => {
        const idx = parseInt((inp as HTMLElement).dataset.idx!);
        const newRows = config.rows.map((r, i) => i === idx ? { ...r, count: Math.max(1, Math.min(24, parseInt(e.target.value) || 1)) } : r);
        config = { ...config, rows: newRows };
        emit();
      });
    });

    // Row remove buttons
    container.querySelectorAll('.pdu-row-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const newRows = config.rows.filter((_, i) => i !== idx);
        if (newRows.length === 0) newRows.push({ count: 8, socketType: 'C13' });
        config = { ...config, rows: newRows };
        emit();
      });
    });

    // Add row
    container.querySelector('#pdu-add-row')?.addEventListener('click', () => {
      config = { ...config, rows: [...config.rows, { count: 8, socketType: 'C13' }] };
      emit();
    });
  }

  function emit() {
    onUpdate({ finish: config.finish, voltage: config.voltage, rows: config.rows });
    render(); // re-render the configurator UI to reflect new state
  }

  render();
}

export function unmountPduConfigurator(container: HTMLElement): void {
  container.innerHTML = '';
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pdu-configurator.ts
git commit -m "feat: add pdu-configurator.ts sidebar UI with finish swatches, voltage, socket row controls"
```

---

## Task 11: Wire PDU configurator into `properties.ts`

**Files:**
- Modify: `src/components/properties.ts`

- [ ] **Step 1: Add imports at the top of `properties.ts`**

```typescript
import { mountPduConfigurator, unmountPduConfigurator } from './pdu-configurator';
```

- [ ] **Step 2: Add cleanup before `container.innerHTML = ...`**

In `renderDeviceProperties`, right before the `container.innerHTML = ...` line, add:

```typescript
// Clean up any existing PDU configurator before replacing innerHTML
const prevMount = container.querySelector<HTMLElement>('#pdu-configurator-mount');
if (prevMount) unmountPduConfigurator(prevMount);
```

- [ ] **Step 3: Add PDU section to the template HTML**

Inside the `container.innerHTML = \`...\`` string, add this section after the server Cable Laying Helper section (after the closing `' : ''}` of the server section, before the closing backtick):

```typescript
      ${template?.category === 'pdu' ? `
        <div id="pdu-configurator-mount" style="margin-top:15px;border-top:1px solid var(--border-color);padding-top:12px;">
        </div>
      ` : ''}
```

- [ ] **Step 4: Mount after `container.innerHTML` is set**

After the `container.innerHTML = ...` assignment (in `renderDeviceProperties`), add:

```typescript
if (template?.category === 'pdu') {
  const mount = container.querySelector<HTMLElement>('#pdu-configurator-mount');
  if (mount) {
    mountPduConfigurator(mount, device, (newConfig) => {
      EventBus.emit('device:update', { id, data: { deviceConfig: newConfig } });
    });
  }
}
```

- [ ] **Step 5: Seed `deviceConfig` on device add**

When a PDU is dragged from the library and added, its `DeviceData.deviceConfig` needs to be seeded from `DeviceTemplate.deviceConfig`. Find where devices are created from templates (look for `'device:add'` or similar in app.ts or state.ts). When creating a new `DeviceData`, copy `template.deviceConfig` if present:

```typescript
const newDevice: DeviceData = {
  // ... existing fields ...
  deviceConfig: template.deviceConfig ? { ...template.deviceConfig } : undefined,
};
```

Search for the device-creation code: `grep -r "templateId" src/ --include="*.ts" -l` to find the file, then locate where `DeviceData` objects are constructed and add the `deviceConfig` copy.

- [ ] **Step 6: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npm test`
Expected: No errors. All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/properties.ts
git commit -m "feat: mount PDU configurator in properties panel; cleanup on device switch"
```

---

## Task 12: Final Validation

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (the number should be ≥ 70, unchanged from before).

- [ ] **Step 2: TypeScript strict check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 3: Manual verification in browser**

With dev server running (`npm run dev`):

- [ ] Switch: Drag `sw-tplink-sg2424` (24-port) into rack — stacked port pairs render correctly
- [ ] Switch: Drag `sw-tplink-sg2448` (48-port) — 48 stacked ports, 4 SFP cages
- [ ] Switch: Drag `sw-cisco-c9200-24` — renders identically to sg2424 (same port counts)
- [ ] FortiGate: Drag `FortiGate 400F` — white chassis with four zones; existing dark firewalls unaffected
- [ ] PDU: Drag `Basic PDU 8×C13` — C13 socket symbols render with textured black chassis
- [ ] PDU: Select the PDU device, open properties panel — finish swatches, voltage select, row controls appear
- [ ] PDU: Click a finish swatch — chassis colour updates immediately
- [ ] PDU: Add a C19 row — new row of wider sockets appears on the panel
- [ ] PDU: Remove a row — panel updates; minimum 1 row enforced
- [ ] PDU: Reload page — deviceConfig persists (device config survives save/reload)

---

## Self-Review Notes

**Spec coverage:** All spec sections covered — types.ts (§8), rack-kit (§3), switch-renderer (§4), fortigate-renderer (§5), pdu-renderer (§6), pdu-configurator (§7), dispatcher changes (§3/5/6), catalog entries (§4/5/6), test checklist (§9).

**Test breakage prevention:** Switch ID changes (Task 4), signature changes (Task 8), and OEM test update (Task 4) are each co-committed with the catalog/signature changes that cause them.

**Circular import check:** `switch-renderer` → `rack-kit` only. `device-catalog` → `switch-renderer`, `fortigate-renderer` (one-way). No cycles.

**FortiGate self-containment:** `fortigate-renderer.ts` only imports `el, g` from rack-kit — no dark gradients. Correct.

**`renderSwitchPanel` in panel-renderer.ts:** The function body is DELETED, replaced by the import. Do not leave the old function body — it will cause a duplicate identifier error.
