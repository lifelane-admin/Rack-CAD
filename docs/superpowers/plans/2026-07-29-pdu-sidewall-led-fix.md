# Vertical PDU Side-Wall + Switch LED Fix + Power Cables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix switch port LEDs to blink only on connected ports; add drag-and-drop vertical PDU side-wall mounting with auto-expanding rack canvas; add flexible per-port data/power types with power cable routing and PDU configurator v2 properties panel.

**Architecture:** Vertical PDUs become `DeviceData` objects with `mountType:'side'` and `sideMountPosition:'left'|'right'`; `RackData` caches `leftPduId`/`rightPduId` for fast width computation; rack canvas auto-expands by `pduWidth` per side; power ports/cables use new `portTypes` and `cableType` fields; LED fix passes `connectedPortIndices` from cable state to switch renderer.

**Tech Stack:** TypeScript, SVG DOM, existing eventBus/stateManager/rack-kit patterns.

---

## File Map

| File | Role |
|---|---|
| `src/core/types.ts` | Add `mountType`, `pduWidth`, `outletConfig`, `sideMountPosition`, `portTypes`, `cableType`, `plugType`, `leftPduId`, `rightPduId`, `SocketType`, `OutletConfig` |
| `src/library/device-catalog.ts` | Add vertical PDU entries (`mountType:'side'`) |
| `src/renderers/switch-renderer.ts` | Accept `connectedPortIndices: Set<number>`; replace fake LED logic |
| `src/renderers/panel-renderer.ts` | Derive connected port set; pass to switch renderer |
| `src/renderers/rack-renderer.ts` | Dynamic width from `leftPduId`/`rightPduId`; PDU zone rendering; "+" add handles |
| `src/renderers/pdu-renderer.ts` | New `renderSidePdu()` function |
| `src/renderers/device-renderer.ts` | Render power ports as C14 inlet graphic |
| `src/renderers/cable-renderer.ts` | Power cable visual: thick, dashed, red/blue, plug label |
| `src/core/state.ts` | Update default rack state to remove `showPduLeft`/`showPduRight` |
| `src/app.ts` | Drop routing for `mountType:'side'`; "+" handle clicks; PDU picker modal; power cable prompt; port right-click menu |
| `src/components/properties.ts` | PDU configurator v2 panel when vertical PDU is selected |

---

## Task 1: Type Extensions

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add new types to types.ts after the existing `PortType` definition (line 25)**

```typescript
// Add after line 25 (PortType definition):
export type SocketType =
  | 'C13' | 'C19' | 'C15' | 'C5'
  | 'NEMA-5-15' | 'NEMA-5-20' | 'NEMA-L5-30' | 'NEMA-L6-20'
  | 'BS1363' | 'Schuko'
  | 'IS6538-5A' | 'IS6538-15A' | 'IS1293-6A' | 'IS1293-16A';

export interface OutletConfig {
  count: number;
  socketType: SocketType;
}
```

- [ ] **Step 2: Extend `DeviceTemplate` (add after `powerWatts?: number` on line 61)**

```typescript
  mountType?: 'rack' | 'side';   // 'rack' is default
  pduWidth?: number;              // px width when side-mounted (e.g. 42)
  outletConfig?: OutletConfig[];  // for side PDUs
```

- [ ] **Step 3: Extend `DeviceData` (add after `powerWatts?: number` on line 78)**

```typescript
  sideMountPosition?: 'left' | 'right';  // only for mountType:'side' devices
  portTypes?: Record<number, 'data' | 'power'>;  // port index → type; absent = 'data'
```

- [ ] **Step 4: Extend `RackData` (add after `pduCapacityWatts?: number` on line 21)**

```typescript
  leftPduId?: string;    // deviceId of PDU on left wall
  rightPduId?: string;   // deviceId of PDU on right wall
```

- [ ] **Step 5: Extend `CableData` (add after `animatedFlow?: boolean` around line 159)**

```typescript
  powerCableType?: 'data' | 'power';   // 'data' is default
  plugType?: SocketType;               // set when powerCableType === 'power'
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd "G:\Claude\Rack_Design" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors from these additions (they're all optional fields).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: extend types for vertical PDU, socket types, power cables, port types"
```

---

## Task 2: Switch LED Fix

**Files:**
- Modify: `src/renderers/switch-renderer.ts` (lines 105, 366-370)
- Modify: `src/renderers/panel-renderer.ts` (lines 407-416)

- [ ] **Step 1: Update `renderSwitchPanel` signature (line 105 in switch-renderer.ts)**

Change:
```typescript
export function renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
```
To:
```typescript
export function renderSwitchPanel(
  template: DeviceTemplate | null,
  W: number,
  H: number,
  connectedPortIndices: Set<number> = new Set(),
): SVGGElement {
```

- [ ] **Step 2: Replace fake LED logic (lines 366-370 in switch-renderer.ts)**

Change:
```typescript
    const connected = n % 3 !== 0;
    const linkState = connected ? 'green' : 'off';
    const actState = connected ? 'greenBlink' : 'off';
```
To:
```typescript
    const connected = connectedPortIndices.has(n - 1);  // n is 1-based; port indices are 0-based
    const linkState = connected ? 'green' : 'off';
    const actState = connected ? 'greenBlink' : 'off';
```

- [ ] **Step 3: Update `renderFrontPanel` in panel-renderer.ts to derive and pass connected port set**

The function signature on line 407 is:
```typescript
export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement {
```

Add a new optional `connectedPortIndices` parameter and pass it to the switch case. Change to:
```typescript
export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,
  deviceWidth: number,
  deviceHeight: number,
  connectedPortIndices: Set<number> = new Set(),
): SVGGElement {
  switch (category) {
    case 'switch': return renderSwitchPanel(template, deviceWidth, deviceHeight, connectedPortIndices);
    // ... rest of cases unchanged
```

- [ ] **Step 4: Update the caller in device-renderer.ts to derive connected port set**

Find where `renderFrontPanel` is called in `src/renderers/device-renderer.ts`. It will look like:
```typescript
renderFrontPanel(category, template, deviceData, deviceWidth, deviceHeight)
```

Import stateManager if not already imported, then derive connected set before the call:
```typescript
import { stateManager } from '../core/state';

// Before calling renderFrontPanel:
const connectedPortIndices = new Set<number>();
if (category === 'switch' && deviceData) {
  const cables = stateManager.getState().cables;
  for (const cable of cables) {
    const port = deviceData.ports.find(p => p.id === cable.sourcePortId || p.id === cable.destPortId);
    if (port) {
      const idx = deviceData.ports.indexOf(port);
      if (idx >= 0) connectedPortIndices.add(idx);
    }
  }
}
const frontPanel = renderFrontPanel(category, template, deviceData, deviceWidth, deviceHeight, connectedPortIndices);
```

- [ ] **Step 5: Run dev server and verify**

Open http://localhost:5173, place a switch, verify all port LEDs are OFF. Connect a cable from port 1 of the switch to another device. Verify port 1 LED turns green/blink, all others remain dark.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/switch-renderer.ts src/renderers/panel-renderer.ts src/renderers/device-renderer.ts
git commit -m "fix: switch port LEDs blink only on ports with connected cables"
```

---

## Task 3: Vertical PDU Catalog Entries

**Files:**
- Modify: `src/library/device-catalog.ts`

- [ ] **Step 1: Add vertical PDU entries to the catalog**

Add these entries to `deviceCatalog` array in `device-catalog.ts`, after the existing PDU entries (search for `category: 'pdu'` entries):

```typescript
  // ─── VERTICAL PDUs (Side-Mount) ────────────────────────────────────────────
  {
    id: 'vpdu-apc-ap8858',
    name: 'APC AP8858 Vertical PDU',
    manufacturer: 'APC',
    model: 'AP8858',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 42,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 20, socketType: 'C13' }],
    ports: [],
  },
  {
    id: 'vpdu-apc-ap8868',
    name: 'APC AP8868 Vertical PDU',
    manufacturer: 'APC',
    model: 'AP8868',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 48,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 24, socketType: 'C19' }],
    ports: [],
  },
  {
    id: 'vpdu-apc-ap8853',
    name: 'APC AP8853 Vertical PDU',
    manufacturer: 'APC',
    model: 'AP8853',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 44,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 16, socketType: 'C13' }, { count: 2, socketType: 'C19' }],
    ports: [],
  },
  {
    id: 'vpdu-vertiv-is',
    name: 'Vertiv MPH2-IS Vertical PDU (India)',
    manufacturer: 'Vertiv',
    model: 'MPH2-IS',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 44,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 16, socketType: 'IS6538-15A' }],
    ports: [],
  },
  {
    id: 'vpdu-legrand-is',
    name: 'Legrand LCS3 Vertical PDU (India)',
    manufacturer: 'Legrand',
    model: 'LCS3-IS',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 46,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 24, socketType: 'IS6538-5A' }],
    ports: [],
  },
  {
    id: 'vpdu-nema',
    name: 'Generic NEMA Vertical PDU',
    manufacturer: 'Generic',
    model: 'NEMA-5-15×24',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 44,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 24, socketType: 'NEMA-5-15' }],
    ports: [],
  },
  {
    id: 'vpdu-uk',
    name: 'Generic UK Vertical PDU',
    manufacturer: 'Generic',
    model: 'BS1363×16',
    category: 'pdu',
    heightUnits: 0,
    mountType: 'side',
    pduWidth: 42,
    color: '#1c1e22',
    icon: '⚡',
    powerWatts: 0,
    outletConfig: [{ count: 16, socketType: 'BS1363' }],
    ports: [],
  },
```

- [ ] **Step 2: Also update the sidebar `renderCatalog` to show "0U" for side-mount devices instead of "0U"**

In `src/components/sidebar.ts`, find the item-meta display inside `filteredItems.forEach`:
```typescript
<div class="item-meta">${item.heightUnits}U • ${item.ports.length} ports</div>
```
Change to:
```typescript
<div class="item-meta">${item.mountType === 'side' ? '0U · Side-Mount' : item.heightUnits + 'U'} • ${item.ports.length > 0 ? item.ports.length + ' ports' : item.outletConfig ? item.outletConfig.reduce((s,r) => s + r.count, 0) + ' outlets' : 'no ports'}</div>
```

- [ ] **Step 3: Verify catalog entries appear**

Open dev server, check sidebar PDU section has the 7 new vertical PDU entries showing "0U · Side-Mount".

- [ ] **Step 4: Commit**

```bash
git add src/library/device-catalog.ts src/components/sidebar.ts
git commit -m "feat: add vertical PDU catalog entries with socket type configs"
```

---

## Task 4: renderSidePdu() Function

**Files:**
- Modify: `src/renderers/pdu-renderer.ts`

- [ ] **Step 1: Add `renderSidePdu` to pdu-renderer.ts**

Add this function at the end of `src/renderers/pdu-renderer.ts`, before the final closing:

```typescript
/**
 * Renders a vertical side-mount PDU strip.
 * @param template  The vertical PDU DeviceTemplate
 * @param pduWidth  Width of the PDU strip in px
 * @param stripH    Height of the strip (rack inner height)
 * @param side      'left' | 'right' — used for outlet orientation
 * @param connectedOutlets  Set of outlet indices that have cables
 * @returns SVGGElement containing the complete PDU
 */
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

  // Create inner SVG
  const ns = el('svg', { width: pduWidth, height: stripH });
  ns.setAttribute('viewBox', `0 0 ${pduWidth} ${stripH}`);
  ns.setAttribute('preserveAspectRatio', 'none');
  makePduDefs(ns, uid, finish);

  // Chassis background
  ns.appendChild(el('rect', { x: 0, y: 0, width: pduWidth, height: stripH, rx: 2,
    fill: `url(#${uid}ps)`, stroke: finish.lo, 'stroke-width': 1 }));
  ns.appendChild(el('rect', { x: 1, y: 1, width: pduWidth - 2, height: stripH - 2, rx: 1.5,
    fill: 'none', stroke: '#3a4147', 'stroke-width': 0.5, opacity: 0.4 }));

  // LCD panel at top
  const lcdH = 28;
  ns.appendChild(el('rect', { x: 3, y: 6, width: pduWidth - 6, height: lcdH, rx: 2,
    fill: '#005f73', stroke: 'none' }));
  const lcdTxt = el('text', {
    x: pduWidth / 2, y: 16,
    'text-anchor': 'middle', 'font-size': 5,
    fill: '#a2d2ff', 'font-family': 'monospace', 'font-weight': 'bold',
  });
  lcdTxt.textContent = template.model ?? 'PDU';
  ns.appendChild(lcdTxt);
  const lcdA = el('text', {
    x: pduWidth / 2, y: 25,
    'text-anchor': 'middle', 'font-size': 4.5,
    fill: '#7ab8d4', 'font-family': 'monospace',
  });
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

    // Outlet face plate
    const ow = Math.min(pduWidth - 6, sockType === 'C19' ? 22 : 18);
    const oh = Math.min(outletSpacing - 2, 14);
    ns.appendChild(el('rect', {
      x: outletCx - ow / 2, y: oy - oh / 2, width: ow, height: oh, rx: 1.5,
      fill: '#141618', stroke: isConnected ? '#37e07a' : '#2a3036', 'stroke-width': isConnected ? 1.2 : 0.6,
    }));

    // Socket type label
    const lbl = el('text', {
      x: outletCx, y: oy + 1.5,
      'text-anchor': 'middle', 'font-size': 3.5,
      fill: isConnected ? '#37e07a' : '#5b636a', 'font-family': 'monospace',
      'pointer-events': 'none',
    });
    lbl.textContent = sockType;
    ns.appendChild(lbl);

    // Hit target for power cable connection
    const hitTarget = el('rect', {
      x: outletCx - ow / 2 - 2, y: oy - oh / 2 - 2, width: ow + 4, height: oh + 4,
      fill: 'transparent',
      'class': 'pdu-outlet-hit',
      'data-outlet-idx': i,
    });
    ns.appendChild(hitTarget);
  });

  // Vertical label
  const vtxt = el('text', {
    x: 0, y: 0,
    'font-size': 4, fill: '#3a4147', 'font-family': 'monospace',
    transform: `translate(${side === 'left' ? pduWidth - 3 : 3}, ${stripH / 2}) rotate(${side === 'left' ? -90 : 90})`,
    'text-anchor': 'middle',
    'pointer-events': 'none',
  });
  vtxt.textContent = side === 'left' ? `PDU-A · ${template.model}` : `PDU-B · ${template.model}`;
  ns.appendChild(vtxt);

  group.appendChild(ns);
  return group;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "G:\Claude\Rack_Design" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderers/pdu-renderer.ts
git commit -m "feat: add renderSidePdu() vertical strip renderer with outlets"
```

---

## Task 5: Rack Renderer — Dynamic Width + PDU Zones + "+" Handles

**Files:**
- Modify: `src/renderers/rack-renderer.ts`
- Modify: `src/core/state.ts` (remove `showPduLeft`/`showPduRight` from defaults)

- [ ] **Step 1: Import `renderSidePdu` and `getTemplate` at top of rack-renderer.ts**

Add after the existing imports:
```typescript
import { renderSidePdu } from './pdu-renderer';
import { getTemplate } from '../library/device-catalog';
```

- [ ] **Step 2: Replace the dynamic width computation at the start of `renderRack`**

Add these lines immediately after the existing `innerHeight` computation (after line 16):

```typescript
  // Compute PDU widths from attached side-mount devices
  const leftPduTemplate = rack.leftPduId
    ? getTemplate((state.devices ?? stateManager.getState().devices).find(d => d.id === rack.leftPduId)?.templateId ?? '')
    : null;
  const rightPduTemplate = rack.rightPduId
    ? getTemplate((state.devices ?? stateManager.getState().devices).find(d => d.id === rack.rightPduId)?.templateId ?? '')
    : null;
  const leftPduW = leftPduTemplate?.pduWidth ?? 0;
  const rightPduW = rightPduTemplate?.pduWidth ?? 0;

  // Total outer width expands for side PDUs
  const OUTER_W_TOTAL = RACK_CONSTANTS.RACK_OUTER_WIDTH + leftPduW + rightPduW;
  // Offset: everything shifts right by leftPduW when left PDU is present
  const pduOffset = leftPduW;
```

- [ ] **Step 3: Update the outer frame to use dynamic width**

Find the outer frame creation (currently: `createRect(0, 0, RACK_CONSTANTS.RACK_OUTER_WIDTH, totalHeight, {...})`):

Change to:
```typescript
  const outerFrame = createRect(-pduOffset, 0, OUTER_W_TOTAL, totalHeight, {
    fill: isSkel ? 'rgba(56, 189, 248, 0.05)' : `url(#rack-gradient-${rack.id})`,
    stroke: isSkel ? '#38bdf8' : 'none',
    'stroke-width': isSkel ? 1.5 : 0,
    rx: 6, ry: 6,
    filter: isSkel ? 'none' : `url(#shadow-${rack.id})`
  });
```

Note: The rack group is translated to `(rack.x, rack.y)`. The PDU zones are to the LEFT of x=0 (for left PDU) and to the RIGHT of RACK_OUTER_WIDTH (for right PDU). All existing equipment rendering stays at x=0…RACK_OUTER_WIDTH.

- [ ] **Step 4: Render left PDU zone or "+" handle**

Add this block AFTER the mounting rails and hole patterns section (after the `for (let u = 1; u <= rack.units; u++)` loop):

```typescript
  // === LEFT PDU ZONE OR "+" HANDLE ===
  const PDU_HANDLE_W = 20;
  if (leftPduTemplate) {
    // Render left PDU at x = -leftPduW
    const leftPduGrp = renderSidePdu(leftPduTemplate, leftPduW, innerHeight, 'left');
    leftPduGrp.setAttribute('transform', `translate(${-leftPduW}, ${innerY})`);
    leftPduGrp.setAttribute('data-pdu-side', 'left');
    leftPduGrp.setAttribute('data-rack-id', rack.id);
    leftPduGrp.setAttribute('data-pdu-device-id', rack.leftPduId ?? '');
    leftPduGrp.setAttribute('style', 'cursor:pointer');
    rackGroup.appendChild(leftPduGrp);
  } else {
    // "+" add handle
    const addHandle = createGroup('pdu-add-left');
    addHandle.setAttribute('data-pdu-add-side', 'left');
    addHandle.setAttribute('data-rack-id', rack.id);
    addHandle.setAttribute('style', 'cursor:pointer');

    addHandle.appendChild(createRect(-PDU_HANDLE_W, innerY, PDU_HANDLE_W, innerHeight, {
      fill: 'none',
      stroke: '#2a5a3a',
      'stroke-width': 1.2,
      'stroke-dasharray': '5,4',
      rx: 2,
    }));
    const plusTxt = createText(-PDU_HANDLE_W / 2, innerY + innerHeight / 2 + 4, '+', {
      fill: '#2aaa5a',
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
    });
    addHandle.appendChild(plusTxt);
    const tipTxt = createText(0, 0, 'Add PDU', {
      fill: '#1a6a3a',
      'text-anchor': 'middle',
      'font-size': 4.5,
      transform: `translate(${-PDU_HANDLE_W / 2}, ${innerY + innerHeight / 2 + 13})`,
    });
    addHandle.appendChild(tipTxt);
    rackGroup.appendChild(addHandle);
  }

  // === RIGHT PDU ZONE OR "+" HANDLE ===
  const rightPduX = RACK_CONSTANTS.RACK_OUTER_WIDTH;
  if (rightPduTemplate) {
    const rightPduGrp = renderSidePdu(rightPduTemplate, rightPduW, innerHeight, 'right');
    rightPduGrp.setAttribute('transform', `translate(${rightPduX}, ${innerY})`);
    rightPduGrp.setAttribute('data-pdu-side', 'right');
    rightPduGrp.setAttribute('data-rack-id', rack.id);
    rightPduGrp.setAttribute('data-pdu-device-id', rack.rightPduId ?? '');
    rightPduGrp.setAttribute('style', 'cursor:pointer');
    rackGroup.appendChild(rightPduGrp);
  } else {
    const addHandleR = createGroup('pdu-add-right');
    addHandleR.setAttribute('data-pdu-add-side', 'right');
    addHandleR.setAttribute('data-rack-id', rack.id);
    addHandleR.setAttribute('style', 'cursor:pointer');

    addHandleR.appendChild(createRect(rightPduX, innerY, PDU_HANDLE_W, innerHeight, {
      fill: 'none',
      stroke: '#2a5a3a',
      'stroke-width': 1.2,
      'stroke-dasharray': '5,4',
      rx: 2,
    }));
    const plusTxtR = createText(rightPduX + PDU_HANDLE_W / 2, innerY + innerHeight / 2 + 4, '+', {
      fill: '#2aaa5a',
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
    });
    addHandleR.appendChild(plusTxtR);
    rackGroup.appendChild(addHandleR);
  }
```

- [ ] **Step 5: Remove old showPduLeft / showPduRight rendering blocks**

Find and delete the entire `// === 4. VERTICAL INTELLIGENT PDUS ===` section (lines 207–319 in the original), which contained the hardcoded `showPduLeft` / `showPduRight` rendering. The new rendering above replaces it.

- [ ] **Step 6: Update default state in state.ts — remove showPduLeft/showPduRight**

In `src/core/state.ts`, find the initial racks in the constructor (around line 21):

Change:
```typescript
{ id: 'rack-1', name: 'Rack 1', units: 42, x: 200, y: 100, showPduLeft: true, showPduRight: true, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' },
{ id: 'rack-2', name: 'Rack 2', units: 42, x: 700, y: 100, showPduLeft: true, showPduRight: true, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' }
```
To:
```typescript
{ id: 'rack-1', name: 'Rack 1', units: 42, x: 200, y: 100, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' },
{ id: 'rack-2', name: 'Rack 2', units: 42, x: 700, y: 100, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' }
```

- [ ] **Step 7: Run dev server and verify**

Open http://localhost:5173. Verify: racks render correctly without PDUs; dashed "+" handle strips appear on left and right of each rack.

- [ ] **Step 8: Commit**

```bash
git add src/renderers/rack-renderer.ts src/core/state.ts
git commit -m "feat: rack renderer with dynamic PDU-zone width and side '+' handles"
```

---

## Task 6: Drop Handler — Route side-mount PDUs to rack walls

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Generalize the existing hardcoded vertical PDU check in app.ts**

Find this block (around line 1488):
```typescript
if (template.id === 'pdu-vertical-16' || template.id === 'pdu-vertical-24') {
```

Replace the entire block (lines 1488–1512) with:

```typescript
// Handle side-mount devices (vertical PDUs)
if (template.mountType === 'side') {
  // Find closest rack
  let closestRack: RackData | null = null;
  let minDist = Infinity;
  for (const rack of s.racks) {
    const rx = rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
    const ry = rack.y + (rack.units * RACK_CONSTANTS.RU_HEIGHT) / 2;
    const dist = Math.sqrt(Math.pow(worldPos.x - rx, 2) + Math.pow(worldPos.y - ry, 2));
    if (dist < minDist) { minDist = dist; closestRack = rack; }
  }
  if (!closestRack) return;

  const isLeft = worldPos.x < closestRack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
  const side: 'left' | 'right' = isLeft ? 'left' : 'right';

  // Block if slot already occupied
  if (side === 'left' && closestRack.leftPduId) {
    eventBus.emit('notification', { message: 'A PDU is already mounted on the left side', type: 'warning' });
    return;
  }
  if (side === 'right' && closestRack.rightPduId) {
    eventBus.emit('notification', { message: 'A PDU is already mounted on the right side', type: 'warning' });
    return;
  }

  // Create a DeviceData for this side-mount PDU
  const deviceId = generateId();
  const newDevice: DeviceData = {
    id: deviceId,
    templateId: template.id,
    rackId: closestRack.id,
    startUnit: 0,
    name: template.name,
    hostname: '',
    managementIp: '',
    serialNumber: '',
    description: '',
    ports: [],
    sideMountPosition: side,
  };

  stateManager.addDevice(newDevice);

  // Update rack with PDU id
  const updatedRacks = s.racks.map(r =>
    r.id === closestRack!.id
      ? { ...r, ...(side === 'left' ? { leftPduId: deviceId } : { rightPduId: deviceId }) }
      : r,
  );
  stateManager.setState({ racks: updatedRacks });

  eventBus.emit('notification', {
    message: `${template.name} mounted on ${side} wall of ${closestRack.name}`,
    type: 'success',
  });
  this.renderAll();
  return;
}
```

- [ ] **Step 2: Add "+" handle click detection in the canvas click handler**

In app.ts, find the `canvas:click` or mousedown handler. After existing hit-test logic, add:

```typescript
// Check if user clicked a PDU "+" add handle
const addHandleEl = (e.target as Element)?.closest('[data-pdu-add-side]');
if (addHandleEl) {
  const side = addHandleEl.getAttribute('data-pdu-add-side') as 'left' | 'right';
  const rackId = addHandleEl.getAttribute('data-rack-id') ?? '';
  this.showPduPickerModal(rackId, side);
  return;
}

// Check if user clicked an existing side PDU (for selection)
const pduEl = (e.target as Element)?.closest('[data-pdu-side]');
if (pduEl) {
  const deviceId = pduEl.getAttribute('data-pdu-device-id') ?? '';
  if (deviceId) {
    stateManager.setState({ selection: [{ type: 'device', id: deviceId }] });
    this.renderAll();
  }
  return;
}
```

- [ ] **Step 3: Add `showPduPickerModal()` method to App class**

Add this method to the App class:

```typescript
private showPduPickerModal(rackId: string, side: 'left' | 'right'): void {
  const s = stateManager.getState();
  const rack = s.racks.find(r => r.id === rackId);
  if (!rack) return;

  // Get vertical PDU templates
  const { deviceCatalog } = await import('./library/device-catalog');
  const vpduTemplates = [...deviceCatalog, ...(s.customTemplates ?? [])]
    .filter(t => t.mountType === 'side');

  // Build modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#12171c;border:1px solid #23303b;border-radius:6px;padding:20px;min-width:320px;max-width:400px;';
  modal.innerHTML = `
    <h3 style="margin:0 0 12px;color:#37b6ff;font-size:13px;letter-spacing:1px;">SELECT PDU — ${side.toUpperCase()} WALL</h3>
    <div id="pdu-picker-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;"></div>
    <button id="pdu-picker-cancel" style="margin-top:14px;width:100%;padding:8px;background:#1a1f24;border:1px solid #30363d;color:#8b949e;cursor:pointer;border-radius:3px;font-size:12px;">Cancel</button>
  `;

  const list = modal.querySelector('#pdu-picker-list')!;
  vpduTemplates.forEach(t => {
    const btn = document.createElement('button');
    const outletCount = t.outletConfig?.reduce((s, r) => s + r.count, 0) ?? 0;
    const socketSummary = t.outletConfig?.map(r => `${r.count}×${r.socketType}`).join(' + ') ?? '';
    btn.style.cssText = 'text-align:left;padding:10px 12px;background:#171d24;border:1px solid #23303b;color:#e6ecf2;cursor:pointer;border-radius:3px;font-size:12px;';
    btn.innerHTML = `<strong>${t.name}</strong><br><span style="color:#8b939a;font-size:11px;">${socketSummary} · ${outletCount} outlets</span>`;
    btn.onmouseover = () => { btn.style.borderColor = '#37b6ff'; };
    btn.onmouseout = () => { btn.style.borderColor = '#23303b'; };
    btn.onclick = () => {
      document.body.removeChild(overlay);
      // Mount the PDU using same logic as drag-drop
      const s2 = stateManager.getState();
      const existingPduId = side === 'left' ? rack.leftPduId : rack.rightPduId;
      if (existingPduId) {
        eventBus.emit('notification', { message: 'A PDU is already mounted on this side', type: 'warning' });
        return;
      }
      const deviceId = generateId();
      const newDevice: DeviceData = {
        id: deviceId, templateId: t.id, rackId, startUnit: 0,
        name: t.name, hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [], sideMountPosition: side,
      };
      stateManager.addDevice(newDevice);
      const updatedRacks = s2.racks.map(r =>
        r.id === rackId ? { ...r, ...(side === 'left' ? { leftPduId: deviceId } : { rightPduId: deviceId }) } : r,
      );
      stateManager.setState({ racks: updatedRacks });
      eventBus.emit('notification', { message: `${t.name} mounted on ${side} wall`, type: 'success' });
      this.renderAll();
    };
    list.appendChild(btn);
  });

  modal.querySelector('#pdu-picker-cancel')!.addEventListener('click', () => document.body.removeChild(overlay));
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}
```

Note: Since `showPduPickerModal` uses a dynamic import, change the `import` to a top-level static import instead. At the top of `app.ts`, add:
```typescript
import { deviceCatalog } from './library/device-catalog';
```
Then in `showPduPickerModal`, use `deviceCatalog` directly instead of the dynamic import.

- [ ] **Step 4: Handle Delete key for side-mount PDU**

In the existing Delete key handler (search for `'edit:delete'` in app.ts), add handling for side-mount PDU selection:

```typescript
// In the delete handler, before or after device delete logic:
const sel = s.selection;
if (sel.length === 1 && sel[0].type === 'device') {
  const devId = sel[0].id;
  const dev = stateManager.getDevice(devId);
  const tmpl = dev ? getTemplate(dev.templateId) : null;
  if (dev && tmpl?.mountType === 'side') {
    // Remove leftPduId/rightPduId from rack
    const updatedRacks = s.racks.map(r => {
      if (r.leftPduId === devId) return { ...r, leftPduId: undefined };
      if (r.rightPduId === devId) return { ...r, rightPduId: undefined };
      return r;
    });
    // Remove all power cables connected to this PDU's outlets
    const updatedCables = s.cables.filter(c =>
      !(c.sourcePortId.startsWith(`outlet-${devId}`) || (c.destPortId ?? '').startsWith(`outlet-${devId}`))
    );
    stateManager.setState({ racks: updatedRacks, cables: updatedCables, selection: [] });
    stateManager.removeDevice(devId);
    this.renderAll();
    return;
  }
}
```

- [ ] **Step 5: Run dev server and verify end-to-end**

1. Drag "APC AP8858 Vertical PDU" from catalog to left side of a rack → PDU appears, rack expands left
2. Drag another to right side → both sides have PDUs
3. Click "+" on a side with no PDU → modal appears with PDU list
4. Select from modal → PDU mounts
5. Click left PDU → it gets selected (blue highlight)
6. Press Delete → PDU removed, rack contracts

- [ ] **Step 6: Commit**

```bash
git add src/app.ts
git commit -m "feat: drag-drop and '+' handle for side-mount vertical PDUs with delete support"
```

---

## Task 7: Flexible Port Types — Right-Click Context Menu + C14 Rendering

**Files:**
- Modify: `src/renderers/device-renderer.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: In device-renderer.ts, render power ports as C14 inlet**

Find where individual ports are drawn on devices (search for `data-port-id` in device-renderer.ts). When a port's index appears in `deviceData.portTypes` as `'power'`, render it with a C14 graphic instead of the standard fill.

Locate the port rendering loop. Add a conditional around the port circle/rect fill:

```typescript
const portTypeOverride = deviceData?.portTypes?.[portIndex];
const isPowerPort = portTypeOverride === 'power';

if (isPowerPort) {
  // Draw C14 inlet shape: 3 oval holes in a dark rectangle
  const portEl = createGroup('power-port');
  portEl.setAttribute('data-port-id', port.id);
  portEl.setAttribute('data-device-id', device.id);

  const px = deviceX + port.relativeX - 7;
  const py = deviceY + port.relativeY - 7;

  // Dark face plate
  portEl.appendChild(createRect(px, py, 14, 14, {
    rx: 2, fill: '#1a0a20', stroke: '#cc44ff', 'stroke-width': 1.5,
  }));
  // 3 oval contact holes (C14 pattern)
  const holeAttrs = { rx: 1.5, ry: 2, fill: '#050506', stroke: '#000', 'stroke-width': 0.3 };
  portEl.appendChild(createSVGElement('ellipse', { cx: px + 3.5, cy: py + 8, ...holeAttrs }));
  portEl.appendChild(createSVGElement('ellipse', { cx: px + 7, cy: py + 4.5, ...holeAttrs }));
  portEl.appendChild(createSVGElement('ellipse', { cx: px + 10.5, cy: py + 8, ...holeAttrs }));

  deviceGroup.appendChild(portEl);
} else {
  // existing port rendering code (unchanged)
}
```

- [ ] **Step 2: Add port right-click context menu in app.ts**

In the `canvas:rightclick` handler (or wherever right-click is handled), add detection for port right-clicks:

```typescript
// Check for port right-click
const portEl = (e.target as Element)?.closest('[data-port-id]');
if (portEl) {
  const portId = portEl.getAttribute('data-port-id')!;
  const deviceId = portEl.getAttribute('data-device-id')!;
  const device = stateManager.getDevice(deviceId);
  if (!device) return;
  const portIdx = device.ports.findIndex(p => p.id === portId);
  const currentType = device.portTypes?.[portIdx] ?? 'data';

  this.contextMenu.show(e.screenPoint ?? { x: e.clientX, y: e.clientY }, [
    {
      label: `Port ${portIdx + 1} — currently: ${currentType.toUpperCase()}`,
      disabled: true,
    },
    { separator: true },
    {
      label: '📡 Set as Data port',
      checked: currentType === 'data',
      action: () => {
        const portTypes = { ...(device.portTypes ?? {}), [portIdx]: 'data' as const };
        eventBus.emit('device:update', { id: deviceId, data: { portTypes } });
        this.renderAll();
      },
    },
    {
      label: '⚡ Set as Power port',
      checked: currentType === 'power',
      action: () => {
        const portTypes = { ...(device.portTypes ?? {}), [portIdx]: 'power' as const };
        eventBus.emit('device:update', { id: deviceId, data: { portTypes } });
        this.renderAll();
      },
    },
  ]);
  return;
}
```

- [ ] **Step 3: Run dev server and verify**

Right-click a port on any server → context menu shows "Set as Data port" / "Set as Power port". Switching to power renders the port as C14 inlet (purple border, 3 oval holes). Switching back to data restores original appearance.

- [ ] **Step 4: Commit**

```bash
git add src/renderers/device-renderer.ts src/app.ts
git commit -m "feat: per-port data/power type toggle with C14 inlet rendering"
```

---

## Task 8: Power Cable Visual + Plug-Type Prompt

**Files:**
- Modify: `src/renderers/cable-renderer.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Add power cable visual logic to cable-renderer.ts**

Find the cable stroke rendering in `cable-renderer.ts`. When `cable.powerCableType === 'power'`, apply power cable styling:

```typescript
// At the point where stroke attributes are set on the cable path:
const isPower = cable.powerCableType === 'power';
const strokeColor = isPower
  ? (cable.color !== '#212529' && cable.color !== '#000' ? cable.color : '#ff4422')  // respect explicit color
  : (cable.color || CABLE_COLORS[cable.type] || '#78909c');
const strokeW = isPower ? 3 : (cable.thickness || RACK_CONSTANTS.CABLE_THICKNESS);
const dashArray = isPower ? '6 3' : (cable.type === 'console' ? '4 2' : 'none');

// Apply to path element:
pathEl.setAttribute('stroke', strokeColor);
pathEl.setAttribute('stroke-width', String(strokeW));
if (dashArray !== 'none') pathEl.setAttribute('stroke-dasharray', dashArray);
```

- [ ] **Step 2: Add plug-type mid-cable label for power cables**

After rendering the cable path, add a label at the cable midpoint for power cables:

```typescript
if (isPower && cable.plugType && midPoint) {
  const label = createSVGElement('text', {
    x: midPoint.x,
    y: midPoint.y - 5,
    'text-anchor': 'middle',
    'font-size': 7,
    'font-family': 'monospace',
    fill: strokeColor,
    'pointer-events': 'none',
  });
  label.textContent = cable.plugType;
  cableGroup.appendChild(label);
}
```

- [ ] **Step 3: Add plug-type prompt when connecting power port → PDU outlet in app.ts**

In the cable completion handler (where a cable is finalized), check if source is a power port and destination is a PDU outlet:

```typescript
// After cable routing is determined, before committing:
const srcPort = stateManager.getPort(cable.sourcePortId);
const srcDevice = srcPort ? stateManager.getDevice(srcPort.deviceId) : null;
const srcTemplate = srcDevice ? getTemplate(srcDevice.templateId) : null;
const srcPortIdx = srcDevice?.ports.findIndex(p => p.id === cable.sourcePortId) ?? -1;
const isSrcPower = srcDevice?.portTypes?.[srcPortIdx] === 'power';

if (isSrcPower) {
  // Prompt for plug type
  this.showPlugTypeModal((plugType: SocketType | null) => {
    if (!plugType) return; // cancelled
    const finalCable: Partial<CableData> = {
      powerCableType: 'power',
      plugType,
      color: side === 'left' ? '#ff4422' : '#3399ff', // red for A-feed, blue for B-feed
    };
    stateManager.addCable({ ...cable, ...finalCable });
    this.renderAll();
  });
  return;
}
```

- [ ] **Step 4: Add `showPlugTypeModal()` method to App class**

```typescript
private showPlugTypeModal(callback: (plugType: SocketType | null) => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#12171c;border:1px solid #23303b;border-radius:6px;padding:20px;min-width:340px;';
  modal.innerHTML = `
    <h3 style="margin:0 0 12px;color:#37b6ff;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Select Power Plug Type</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;" id="plug-grid"></div>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button id="plug-cancel" style="flex:1;padding:8px;background:#1a1f24;border:1px solid #30363d;color:#8b949e;cursor:pointer;border-radius:3px;font-size:12px;">Cancel</button>
    </div>
  `;

  const PLUGS: { type: SocketType; label: string; region: string }[] = [
    { type: 'C13', label: 'C13', region: 'IEC 10A' },
    { type: 'C19', label: 'C19', region: 'IEC 16A' },
    { type: 'C15', label: 'C15', region: 'IEC Hi-Temp' },
    { type: 'NEMA-5-15', label: 'NEMA 5-15', region: 'US 15A' },
    { type: 'NEMA-5-20', label: 'NEMA 5-20', region: 'US 20A' },
    { type: 'IS6538-5A', label: 'IS6538 5A', region: 'India Type D' },
    { type: 'IS6538-15A', label: 'IS6538 15A', region: 'India Type M' },
    { type: 'IS1293-6A', label: 'IS1293 6A', region: 'India 2+E' },
    { type: 'BS1363', label: 'BS 1363', region: 'UK 13A' },
    { type: 'Schuko', label: 'Schuko', region: 'EU 16A' },
  ];

  const grid = modal.querySelector('#plug-grid')!;
  PLUGS.forEach(p => {
    const btn = document.createElement('button');
    btn.style.cssText = 'padding:8px 4px;background:#171d24;border:1px solid #23303b;color:#e6ecf2;cursor:pointer;border-radius:3px;font-size:11px;text-align:center;';
    btn.innerHTML = `<strong>${p.label}</strong><br><span style="color:#8b939a;font-size:9px;">${p.region}</span>`;
    btn.onmouseover = () => { btn.style.borderColor = '#37b6ff'; btn.style.color = '#37b6ff'; };
    btn.onmouseout = () => { btn.style.borderColor = '#23303b'; btn.style.color = '#e6ecf2'; };
    btn.onclick = () => { document.body.removeChild(overlay); callback(p.type); };
    grid.appendChild(btn);
  });

  modal.querySelector('#plug-cancel')!.addEventListener('click', () => { document.body.removeChild(overlay); callback(null); });
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
```

- [ ] **Step 5: Block incompatible connections**

In the cable start/completion logic, add validation:

```typescript
// When completing a cable connection:
// If source is data port and destination is a PDU outlet → block
// If source is power port and destination is a data port → block
const srcIsPower = srcDevice?.portTypes?.[srcPortIdx] === 'power';
const destPort = stateManager.getPort(destPortId);
const destDevice = destPort ? stateManager.getDevice(destPort.deviceId) : null;
const destPortIdx = destDevice?.ports.findIndex(p => p.id === destPortId) ?? -1;
const destIsPower = destDevice?.portTypes?.[destPortIdx] === 'power';

if (srcIsPower && !destIsPower && destPortId && !destPortId.startsWith('outlet-')) {
  eventBus.emit('notification', { message: 'Power port can only connect to PDU outlets', type: 'warning' });
  return;
}
if (!srcIsPower && destPortId?.startsWith('outlet-')) {
  eventBus.emit('notification', { message: 'Connect a power port to PDU outlet', type: 'warning' });
  return;
}
```

- [ ] **Step 6: Verify power cables**

1. Right-click a server port → set as Power → port shows C14 graphic
2. Start drawing cable from that port → on connect to PDU outlet, plug-type modal appears
3. Select C13 → cable appears thick, dashed, red/blue with "C13" label
4. Incompatible connections show warning notification

- [ ] **Step 7: Commit**

```bash
git add src/renderers/cable-renderer.ts src/app.ts
git commit -m "feat: power cable visual (thick/dashed/colored) + plug-type selection modal"
```

---

## Task 9: PDU Configurator v2 in Properties Panel

**Files:**
- Modify: `src/components/properties.ts`

This task adds the full PDU configurator v2 UI to the properties panel when a vertical PDU DeviceData is selected. The reference design is at `G:\Claude\Rack_Design\New_Development\pdu-configurator-v2.html`.

- [ ] **Step 1: In properties.ts, detect vertical PDU selection**

Find where the properties panel renders device details. Add a branch for `template.mountType === 'side'`:

```typescript
if (template.mountType === 'side') {
  this.renderVerticalPduProperties(device, template, container);
  return;
}
```

- [ ] **Step 2: Add `renderVerticalPduProperties()` method**

```typescript
private renderVerticalPduProperties(device: DeviceData, template: DeviceTemplate, container: HTMLElement): void {
  const config = device.deviceConfig as Record<string, unknown> ?? {};

  container.innerHTML = `
    <div style="padding:12px;font-family:monospace;font-size:11px;color:#e6ecf2;">
      <div style="color:#37b6ff;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #23303b;padding-bottom:6px;">
        ⚡ ${template.name}
      </div>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Category</label>
      <select id="pdu-category" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:6px;font-size:11px;border-radius:2px;">
        <option value="basic" ${config.category==='basic'?'selected':''}>Basic</option>
        <option value="metered" ${config.category==='metered'?'selected':''}>Metered</option>
        <option value="switched" ${config.category==='switched'?'selected':''}>Switched</option>
        <option value="managed" ${config.category==='managed'?'selected':''}>Managed</option>
        <option value="intelligent" ${!config.category||config.category==='intelligent'?'selected':''}>Intelligent</option>
      </select>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Electrical</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div>
          <div style="font-size:9px;color:#5b636a;margin-bottom:3px;">Phase</div>
          <select id="pdu-phase" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;">
            <option value="single" ${(config.phase??'single')==='single'?'selected':''}>Single</option>
            <option value="three" ${config.phase==='three'?'selected':''}>Three</option>
          </select>
        </div>
        <div>
          <div style="font-size:9px;color:#5b636a;margin-bottom:3px;">Voltage</div>
          <select id="pdu-voltage" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;">
            ${['110','120','208','220','230','240'].map(v => `<option ${(config.voltage??'230')===v?'selected':''}>${v}V</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="margin-top:6px;">
        <div style="font-size:9px;color:#5b636a;margin-bottom:3px;">Max Current (A)</div>
        <input type="number" id="pdu-current" value="${config.current ?? 32}" min="6" max="63"
          style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;"/>
      </div>

      <div style="margin-top:6px;">
        <div style="font-size:9px;color:#5b636a;margin-bottom:3px;">Input Plug</div>
        <select id="pdu-inputplug" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;">
          <option value="iec60309-32a" ${(config.inputPlug??'iec60309-32a')==='iec60309-32a'?'selected':''}>IEC 60309 32A Industrial</option>
          <option value="iec60309-16a" ${config.inputPlug==='iec60309-16a'?'selected':''}>IEC 60309 16A Industrial</option>
          <option value="bs1363" ${config.inputPlug==='bs1363'?'selected':''}>UK BS 1363 13A</option>
          <option value="nema515" ${config.inputPlug==='nema515'?'selected':''}>NEMA 5-15P</option>
          <option value="is1293" ${config.inputPlug==='is1293'?'selected':''}>India IS 1293</option>
        </select>
      </div>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Outlet Composition</label>
      <div id="pdu-outlet-rows" style="display:flex;flex-direction:column;gap:4px;"></div>
      <button id="pdu-add-row" style="width:100%;margin-top:5px;padding:6px;background:#0f2a1e;color:#00e0a4;border:1px dashed #1e5040;font-size:10px;cursor:pointer;border-radius:2px;">+ Add Outlet Group</button>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Protection</label>
      <select id="pdu-breaker" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;">
        <option value="none" ${(config.breaker??'mcb-guarded')==='none'?'selected':''}>None</option>
        <option value="mcb" ${config.breaker==='mcb'?'selected':''}>MCB</option>
        <option value="mcb-guarded" ${(config.breaker??'mcb-guarded')==='mcb-guarded'?'selected':''}>MCB + Safety Guard</option>
        <option value="hydraulic" ${config.breaker==='hydraulic'?'selected':''}>Hydraulic</option>
        <option value="electronic" ${config.breaker==='electronic'?'selected':''}>Electronic</option>
      </select>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Finish</label>
      <select id="pdu-finish" style="width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:5px;font-size:10px;border-radius:2px;">
        <option value="ral9005-texture" ${(config.finish??'ral9005-texture')==='ral9005-texture'?'selected':''}>RAL 9005 Texture (Jet Black)</option>
        <option value="black" ${config.finish==='black'?'selected':''}>Smooth Black</option>
        <option value="darkGrey" ${config.finish==='darkGrey'?'selected':''}>Dark Grey</option>
        <option value="brushedAluminium" ${config.finish==='brushedAluminium'?'selected':''}>Brushed Aluminium</option>
        <option value="white" ${config.finish==='white'?'selected':''}>White</option>
      </select>

      <label style="display:block;font-size:10px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin:10px 0 4px;">Smart Features</label>
      <div style="display:flex;flex-wrap:wrap;gap:4px;" id="pdu-features">
        ${['Per-outlet metering','Remote switching','Environment sensor','LCD display','Network port','Current alarm','Email alerts'].map(f =>
          `<span class="pdu-feat-chip" data-feature="${f}" style="padding:3px 7px;background:${(config.features as string[])?.includes(f)?'#37b6ff':'#171d24'};color:${(config.features as string[])?.includes(f)?'#000':'#8b939a'};border:1px solid ${(config.features as string[])?.includes(f)?'#37b6ff':'#23303b'};border-radius:2px;font-size:9.5px;cursor:pointer;letter-spacing:.5px;">${f}</span>`
        ).join('')}
      </div>

      <div style="margin-top:12px;padding:8px;background:#0a1015;border:1px solid #23303b;border-radius:3px;font-size:10px;color:#8b939a;">
        <div style="margin-bottom:4px;">Model: <span style="color:#e6ecf2;">${template.model}</span></div>
        <div style="margin-bottom:4px;">Side: <span style="color:#e6ecf2;">${device.sideMountPosition?.toUpperCase() ?? '—'}</span></div>
        <div>Outlets: <span style="color:#37b6ff;">${template.outletConfig?.map(r => r.count + '×' + r.socketType).join(' + ') ?? '—'}</span></div>
      </div>
    </div>
  `;

  // Render outlet rows
  const rows: { count: number; socketType: string }[] = (config.outletRows as any[]) ?? template.outletConfig?.map(r => ({ count: r.count, socketType: r.socketType })) ?? [];
  this.renderPduOutletRows(container, device.id, rows);

  // Wire up all controls to save deviceConfig
  const save = () => {
    const newConfig: Record<string, unknown> = {
      category: (container.querySelector('#pdu-category') as HTMLSelectElement)?.value,
      phase: (container.querySelector('#pdu-phase') as HTMLSelectElement)?.value,
      voltage: (container.querySelector('#pdu-voltage') as HTMLSelectElement)?.value,
      current: Number((container.querySelector('#pdu-current') as HTMLInputElement)?.value),
      inputPlug: (container.querySelector('#pdu-inputplug') as HTMLSelectElement)?.value,
      breaker: (container.querySelector('#pdu-breaker') as HTMLSelectElement)?.value,
      finish: (container.querySelector('#pdu-finish') as HTMLSelectElement)?.value,
      features: Array.from(container.querySelectorAll('.pdu-feat-chip.active')).map(el => el.getAttribute('data-feature') ?? ''),
      outletRows: rows,
    };
    eventBus.emit('device:update' as any, { id: device.id, data: { deviceConfig: newConfig } });
  };

  container.querySelectorAll('select, input').forEach(el => el.addEventListener('change', save));

  // Feature chip toggles
  container.querySelectorAll('.pdu-feat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      const f = chip.getAttribute('data-feature') ?? '';
      const isActive = chip.classList.contains('active');
      (chip as HTMLElement).style.background = isActive ? '#37b6ff' : '#171d24';
      (chip as HTMLElement).style.color = isActive ? '#000' : '#8b939a';
      (chip as HTMLElement).style.borderColor = isActive ? '#37b6ff' : '#23303b';
      save();
    });
  });

  // Add outlet group button
  container.querySelector('#pdu-add-row')?.addEventListener('click', () => {
    rows.push({ count: 8, socketType: 'C13' });
    this.renderPduOutletRows(container, device.id, rows);
    save();
  });
}

private renderPduOutletRows(container: HTMLElement, deviceId: string, rows: { count: number; socketType: string }[]): void {
  const rowsEl = container.querySelector('#pdu-outlet-rows');
  if (!rowsEl) return;
  rowsEl.innerHTML = '';

  const SOCKET_TYPES = ['C13','C19','C15','NEMA-5-15','NEMA-5-20','IS6538-5A','IS6538-15A','IS1293-6A','BS1363','Schuko'];

  rows.forEach((row, idx) => {
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:grid;grid-template-columns:1.5fr 0.7fr 24px;gap:5px;align-items:center;';
    rowEl.innerHTML = `
      <select style="background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;">
        ${SOCKET_TYPES.map(t => `<option ${row.socketType===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <input type="number" value="${row.count}" min="1" max="48" style="background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;"/>
      <button style="background:#2a1416;color:#ff8080;border:1px solid #4a2020;cursor:pointer;border-radius:2px;padding:0;height:26px;font-size:14px;">×</button>
    `;

    const [selEl, numEl, delBtn] = rowEl.querySelectorAll('select, input, button');
    selEl.addEventListener('change', () => { rows[idx].socketType = (selEl as HTMLSelectElement).value; });
    numEl.addEventListener('change', () => { rows[idx].count = Number((numEl as HTMLInputElement).value); });
    delBtn.addEventListener('click', () => { rows.splice(idx, 1); this.renderPduOutletRows(container, deviceId, rows); });

    rowsEl.appendChild(rowEl);
  });
}
```

- [ ] **Step 3: Verify properties panel**

Select a vertical PDU on the canvas → properties panel shows full v2 configurator with category, electrical, outlet composition, protection, finish, features. Changing any field auto-saves to `deviceConfig`.

- [ ] **Step 4: Commit**

```bash
git add src/components/properties.ts
git commit -m "feat: PDU configurator v2 in properties panel for vertical side-mount PDUs"
```

---

## Task 10: Final Verification + Tests

**Files:**
- Test: `src/tests/` (or wherever existing tests live)

- [ ] **Step 1: Run all existing tests**

```bash
cd "G:\Claude\Rack_Design" && npm test 2>&1 | tail -20
```
Expected: all 70 tests pass (no regressions).

- [ ] **Step 2: TypeScript full check**

```bash
cd "G:\Claude\Rack_Design" && npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 3: Full manual smoke test**

1. Open http://localhost:5173
2. **LED fix**: Place a switch → all port LEDs are off. Connect port 3 → port 3 LEDs blink. Disconnect → port 3 LEDs go off.
3. **PDU drag from catalog**: Drag "APC AP8858" from sidebar PDU section → drop on left side of rack → PDU zone appears, rack expands. Drag "APC AP8868" → drop on right → both sides occupied.
4. **"+" handle**: Clear state, open fresh rack → "+" handles appear both sides. Click "+" → modal shows 7 PDU models. Select one → mounts.
5. **Delete PDU**: Click left PDU → selected. Press Delete → PDU removed, rack contracts.
6. **Port types**: Right-click server port → "Set as Power port" → port shows C14 inlet (purple). Start cable from it → plug type modal appears. Select C13 → cable is thick, dashed, red.
7. **PDU configurator**: Select vertical PDU → properties panel shows full v2 configurator with all fields.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete vertical PDU side-wall + switch LED fix + power cables implementation"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Switch LED fix (Task 2) — covers `switch-renderer.ts:365` fake LED → real cable state
- [x] PDU catalog entries (Task 3) — 7 entries including Indian standards
- [x] Rack auto-expand (Task 5) — `leftPduW`/`rightPduW` from template; outer frame grows
- [x] Drag from catalog (Task 6) — `mountType:'side'` routing
- [x] "+" handle click (Task 6) — `showPduPickerModal()`
- [x] PDU selection + Delete (Task 6) — side-mount aware delete handler
- [x] Side PDU rendering (Task 4+5) — `renderSidePdu()` with outlet hit targets
- [x] Flexible port types (Task 7) — `portTypes` map, right-click menu, C14 graphic
- [x] Power cable visual (Task 8) — thick/dashed/colored, plug label
- [x] Plug sub-type prompt (Task 8) — `showPlugTypeModal()` with all socket types
- [x] Connection validation (Task 8) — power↔data mismatch blocked
- [x] PDU configurator v2 (Task 9) — full left panel from v2.html in properties panel

**Type consistency:**
- `SocketType` defined in Task 1, used in Tasks 3, 4, 8, 9
- `OutletConfig` defined in Task 1, used in Tasks 3, 4
- `mountType` defined in Task 1, checked in Tasks 3, 5, 6, 9
- `sideMountPosition` defined in Task 1, set in Task 6, read in Tasks 5, 9
- `leftPduId`/`rightPduId` defined in Task 1, set in Task 6, read in Task 5
- `portTypes` defined in Task 1, written in Task 7, read in Tasks 7, 8
- `powerCableType`/`plugType` defined in Task 1, set in Task 8, read in Task 8
