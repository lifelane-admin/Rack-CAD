# New Devices Integration — Design Spec
**Date:** 2026-07-28  
**Status:** Approved  
**Scope:** Switch re-implementation, FortiGate 400F firewall, PDU configurator

---

## 1. Overview

Three parallel work streams, all landing in the same codebase:

1. **Switch** — fresh re-port of `renderSwitchPanel` from `New_Development/rackstudio-demo (2).jsx` using shared `RackKit` primitives, plus new vendor-specific catalog entries.
2. **FortiGate 400F** — new `renderFortiGatePanel` (white chassis, zone-based layout) added alongside the existing dark generic firewall renderer. One new catalog entry.
3. **PDU** — detailed outlet SVG renderer + properties-panel configurator sidebar. Config persisted in `DeviceData.deviceConfig`.

---

## 2. File Changes

```
src/
  renderers/
    rack-kit.ts              CREATE  shared chassis/blade/LED/gradient primitives
    switch-renderer.ts       CREATE  renderSwitchPanel + switchPorts (moved from catalog)
    fortigate-renderer.ts    CREATE  renderFortiGatePanel (white chassis)
    pdu-renderer.ts          CREATE  renderPduPanel with deviceConfig support
    panel-renderer.ts        MODIFY  thin dispatcher; import from above; add deviceData param
  components/
    pdu-configurator.ts      CREATE  sidebar UI for PDU device config
  library/
    device-catalog.ts        MODIFY  new switch models, FortiGate 400F, new PDU entries
  core/
    types.ts                 MODIFY  add deviceConfig?: Record<string,unknown> to DeviceData
```

---

## 3. `rack-kit.ts` — Shared Primitives

Source: `New_Development/rack-power-demo.jsx` (`RackKit`)

### Exported constants
```typescript
export const U1 = 132;           // 1U SVG height
export const RACK_W = 1240;      // 19" flange-to-flange
export const MIN_BLADE_W = 34;
export const EAR_W = 26;
export const PANEL_PAD = 22;
```

### Exported functions

**`fitToRack(contentW: number)`**  
Returns `{ chassisW, bladeW, totalW, chassisX, contentX }`.  
All renderers call this so every device sizes to the same 19" span.

**`makeRackDefs(ns: SVGSVGElement, uid: string): void`**  
Appends a `<defs>` block with all shared gradients and filters, each id namespaced with `uid`:
- Gradients: `chassis`, `blade`, `cage`, `cageLip`, `rjMouth`, `gold`, `sfpBody`, `bossOut`
- Filters: `glow` (feGaussianBlur + feMerge), `ao` (feDropShadow), `innerShadow` (feOffset + feComposite)

**`drawChassis(ns: SVGSVGElement, uid: string, chassisX: number, chassisW: number): void`**  
Chassis body rect (gradient fill, rounded corners) + top highlight strip.

**`drawBlades(ns: SVGSVGElement, uid: string, totW: number, bladeW: number): void`**  
Left + right rack-mount blades: body rect, fold-line strip, two screw holes at 34%/66% height, specular arc highlight on each hole.

**`drawLed(parent: SVGElement, cx: number, cy: number, color: string, on: boolean, r?: number): void`**  
Dark housing ring, coloured dot (opacity 0.35 when off, 1.0 when on), glow filter when on, specular highlight dot when on. `r` defaults to `1.6`.

**`el<K>(tag: K, attrs?): SVGElementTagNameMap[K]`** and **`g(cls?): SVGGElement`**  
SVG element factory helpers (same pattern as existing panel-renderer.ts, extracted here so renderers don't redefine them).

---

## 4. `switch-renderer.ts`

Source: `New_Development/rackstudio-demo (2).jsx`

### Exports

**`renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement`**

Uses a nested `<svg>` with `viewBox="0 0 {totW} 132"` + `preserveAspectRatio="none"` so the JSX geometry renders at native coordinates and scales to the device's pixel size. Uses `rack-kit.ts` for chassis, blades, LEDs, and defs.

Switch-specific `<defs>` symbols built inside this function (not in rack-kit, since they're switch-only):
- `rjup` — RJ45 symbol, latch tab pointing down (top jack of stacked pair)
- `rjdn` — RJ45 symbol, latch tab pointing up (bottom jack of stacked pair)
- `sfpc` — SFP empty cage symbol
- `sfpf` — SFP fiber transceiver symbol

Console section (left side): 4 LEDs (PWR/SYS/ALM/LOC), brand text "RACK SLICER", model text, separator line, "GIGABIT SWITCH" subtext.

RJ45 block layout:
- `colsPerBlock = 4`, `BLOCK_GAP = 15`, `RJ_ROW_GAP = 7`
- `rjRows = 1` when ≤ 8 ports, `rjRows = 2` otherwise
- Stacked pairs: port N odd → top row, port N even → bottom row

SFP uplink group: right of RJ45 area, `SFP_GAP_X = 9` between cages.

**`switchPorts(rj45: number, sfp: number, rows: number, idPfx: string): DeviceTemplate['ports']`**  
Moved from `device-catalog.ts` to here. Exported so catalog imports it. Computes JSX-accurate `relativeX/Y`, `portW`, `portH` for each port, matching the nested-SVG viewBox scale.

### Catalog replacement (in `device-catalog.ts`)

**All existing generic switch entries are removed** (`switch-8`, `switch-16`, `switch-24`, `switch-48`, and any other `category: 'switch'` entries). The catalog is flushed and replaced entirely with the vendor-specific entries below.

All use `switchPorts()` for port positions. All have `category: 'switch'`, `heightUnits: 1`, `color: '#1a1e21'`.

| id | name | rj45 | sfp | rows |
|---|---|---|---|---|
| `sw-tplink-sg2424` | TP-LINK TL-SG2424 | 24 | 4 | 2 |
| `sw-tplink-sg2448` | TP-LINK TL-SG2448 | 48 | 4 | 2 |
| `sw-cisco-sg350-28` | Cisco SG350-28 | 24 | 4 | 2 |
| `sw-cisco-sg350-52` | Cisco SG350-52 | 48 | 4 | 2 |
| `sw-cisco-c9200-24` | Cisco Catalyst 9200-24 | 24 | 4 | 2 |

---

## 5. `fortigate-renderer.ts`

Source: `New_Development/RackFortiGate.jsx`

### Exports

**`renderFortiGatePanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement`**

Uses `fitToRack`, `makeRackDefs`, `drawBlades` from `rack-kit.ts`.

**Palette (white chassis):**
```
chassis:     #ffffff → #f4f5f7   (light gradient)
ear:         #eceef1 / edge #cfd3d9
portUp:      fill #e9f7ee / edge #2e9e5b / tab #37b26a
portDown:    fill #eef0f3 / edge #b6bcc4 / tab #c2c8d0
sfp:         fill #e7eaee / edge #aab1ba
text:        #3a3f46
textMute:    #8a9099
red accent:  #e01e2b   (Fortinet brand)
```

**Zone-based port layout (FortiGate 400F fixed zones):**
```
Zone 0: HA + MGMT  — 2 RJ45, label ["HA","MGMT"]
Zone 1: 1–16       — 16 RJ45, stacked pairs
Zone 2: X1–X8      — 8 SFP+
Zone 3: 17–24      — 8 RJ45, stacked pairs
```
Zone gap: `ZONE_GAP = 26`. Row label strip: `ROW_LABEL_H = 16` above each zone.

**RJ45 jack rendering** (white-chassis variant, not a shared symbol):
- Housing rect with light fill + edge colour based on link state
- Inner inset rect (opacity 0.5 border)
- Keystone mouth path: ivory recess (`#f5efe0`), 8 gold contact pins using `url(#gold)` from rack-kit
- Link LED dot (bottom-right corner): green when up, grey when down

**SFP+ cage** (light chassis variant):
- `PORT_W=26` width (narrower than switch SFP)
- Light fill `#e7eaee`, edge `#aab1ba`

**Fortinet brand mark:** Red rect on far left (`width=18`), "FORTINET" text rotated −90°, white fill.

### Dispatcher change in `panel-renderer.ts`
```typescript
case 'firewall':
  return template?.id === 'fw-fortigate-400f'
    ? renderFortiGatePanel(template, W, H)
    : renderFirewallPanel(template, W, H);
```

### New catalog entry

Port positions are pre-computed at catalog definition time using the same zone geometry constants as the renderer (`PORT_W=26`, `PORT_H=20`, `PAIR_GAP=6`, `COL_GAP=5`, `ZONE_GAP=26`, `ROW_LABEL_H=16`) converted to the device's `350×30` coordinate space (same `sx = 350/totW`, `sy = 30/132` scale as the switch).

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
  ports: [
    // Zone 0: HA (rj45, management), MGMT (rj45, management)
    // Zone 1: Ports 1–16 (rj45, 1 Gbps, stacked pairs)
    // Zone 2: X1–X8 (sfp-plus, 10 Gbps)
    // Zone 3: Ports 17–24 (rj45, 1 Gbps, stacked pairs)
    // All relativeX/Y/portW/portH computed from zone geometry — no magic numbers
  ]
}
```

---

## 6. `pdu-renderer.ts`

Source: `New_Development/PDUConfigurator.jsx` (SVG rendering portions only)

### Exports

**`renderPduPanel(template: DeviceTemplate | null, deviceData: DeviceData | null, W: number, H: number): SVGGElement`**

Reads `deviceData?.deviceConfig` for finish and socket layout. Falls back to template defaults if no config.

**Finish system (5 presets):**
```
ral9005-texture:  hi #2a2a2a / mid #0f0f0f / lo #050505 / text #e8eaec
darkGrey:         hi #54585c / mid #33373b / lo #1e2124 / text #f0f2f4
lightGrey:        hi #c8ccd0 / mid #a4a9ae / lo #7d8287 / text #1a1c1e
white:            hi #ffffff / mid #eceef0 / lo #c9cccf / text #1a1c1e
brushedAluminium: hi #e8eaec / mid #c9ccce / lo #9fa3a6 / text #1a1c1e
```

**Socket symbols (built in `<defs>`):**
- `C13` — trapezoidal 3-pin female IEC: housing rect, inner recess, 3 pin holes (L/N/E arrangement)
- `C19` — wider rectangular IEC (high-power): same structure, wider body
- `NEMA-5-15` — US 2+ground: D-shaped housing, 2 rectangular slots + ground hole

**Layout:** outlets arranged left-to-right in rows defined by `deviceConfig.rows: Array<{ count: number, socketType: 'C13'|'C19'|'NEMA-5-15' }>`. Outlet positions computed to fill available panel width with even spacing.

**Dispatcher change in `panel-renderer.ts`:**  
The public `renderDevicePanel(template, deviceData, deviceWidth, deviceHeight)` gains a `deviceData: DeviceData | null` parameter (inserted as second argument). All existing call sites in `app.ts` and `renderer.ts` pass the current `DeviceData` instance (already available at call sites). The dispatcher passes it through only for PDU:
```typescript
// Public signature change:
export function renderDevicePanel(
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,   // NEW
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement

// Dispatcher:
case 'pdu':
  return renderPduPanel(template, deviceData, W, H);
// All other cases unchanged — they ignore deviceData
```

### New catalog entries
Default `deviceConfig` embedded in catalog entry for initial render:

| id | name | heightUnits | default config |
|---|---|---|---|
| `pdu-basic-8c13` | Basic PDU 8×C13 | 1 | finish: ral9005-texture, rows: [{count:8, socketType:'C13'}] |
| `pdu-metered-16c13` | Metered PDU 16×C13 | 1 | finish: darkGrey, rows: [{count:16, socketType:'C13'}] |
| `pdu-smart-20mix` | Smart PDU 20×C13 + 2×C19 | 2 | finish: ral9005-texture, rows: [{count:20,type:'C13'},{count:2,type:'C19'}] |
| `pdu-apc-ap7920` | APC AP7920 | 1 | finish: brushedAluminium, rows: [{count:8, socketType:'C13'}] |

Old PDU entries (`pdu-8`, `pdu-12`, etc.) remain — they have no `deviceConfig` so `renderPduPanel` falls back to the old drawing path.

---

## 7. `pdu-configurator.ts` — Sidebar UI

Shown in the properties panel when `selectedDevice.template.category === 'pdu'`.

### Controls
- **Finish** — 5 swatches (coloured squares). Click to select. Active swatch has a bright border.
- **Voltage** — `<select>`: 208V / 230V / 240V
- **Socket rows** — list of rows. Each row:
  - Socket type dropdown: C13 / C19 / NEMA-5-15
  - Count input: numeric spinner (1–24)
  - Remove button (×)
- **Add row** button — appends a new row with defaults (C13, count 8)

### Data flow
1. User changes a control → `pduConfiguratorChange(deviceId, newConfig)` called
2. Writes `device.deviceConfig = newConfig` via `appState.updateDevice()`
3. Triggers `app.rerenderDevice(deviceId)` which calls `renderDevicePanel()` → `renderPduPanel()` with new config
4. `autosave` runs automatically (existing mechanism) — `deviceConfig` is serialised with the rest of `DeviceData`

### Mounting
`pdu-configurator.ts` exports `mountPduConfigurator(container: HTMLElement, device: DeviceData, onUpdate: (config) => void): void` and `unmountPduConfigurator(container: HTMLElement): void`. The properties panel calls mount/unmount when PDU selection changes.

---

## 8. `types.ts` change

```typescript
export interface DeviceData {
  // ... all existing fields unchanged ...
  deviceConfig?: Record<string, unknown>;  // PDU configurator state; other devices may use in future
}
```

One field added. No existing code breaks — it's optional.

---

## 9. Testing

Existing 70 tests continue to pass unchanged — no public APIs removed, `DeviceData` change is additive.

New manual verification checklist:
- [ ] Switch: 24-port and 48-port renders match JSX reference visually (stacked pairs, console section, SFP cages)
- [ ] Switch: new vendor catalog entries appear in sidebar and port positions hit correctly
- [ ] FortiGate: white chassis renders in rack, zones display correctly, existing dark firewalls unaffected
- [ ] PDU: finish swatches change chassis colour in real time
- [ ] PDU: adding/removing socket rows updates the panel immediately
- [ ] PDU: config survives save/reload cycle (autosave → refresh)
- [ ] No TypeScript errors (`tsc --noEmit`)
