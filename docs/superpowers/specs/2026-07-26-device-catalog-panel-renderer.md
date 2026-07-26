# Sub-Project A: Standard Device Library + High-Fidelity Panel Renderer
**Date:** 2026-07-26  
**Status:** Approved

---

## Overview

Replace the current OEM-specific device catalog with a complete generic Standard Library organized from basic to advanced. Implement a new `panel-renderer.ts` that draws industrial-quality SVG front panels for every device category. Add a front-panel image upload to the Properties panel so users can customize any device with their own photo.

---

## Goals

- Zero OEM names anywhere in the catalog or rendered panels
- Every device category has a high-fidelity generic SVG panel (no placeholder gray boxes)
- Panel style matches the approved mockup: brushed-metal gradient chassis, beveled port cavities, per-port LED bars, SFP+ cages with transceiver modules
- Users can override any device panel with a custom uploaded image (PNG/JPG → base64 data URL stored in `device.frontPanelImage`)
- Standard Library organized hierarchically: category → basic → advanced

---

## Standard Library — Complete Device List

### Category: server
| ID | Name | U | Drive Bays | Notes |
|---|---|---|---|---|
| `server-1u` | 1U Server | 1 | 4 × 2.5" | NIC ports right, LCD center |
| `server-2u` | 2U Server | 2 | 8 × 2.5" | Standard mid-range |
| `server-2u-hd` | 2U Server (High Density) | 2 | 12 × 2.5" | Dense storage compute |
| `server-4u` | 4U Server | 4 | 24 × 3.5" | Large storage server |
| `server-tower` | Tower Server | 4 | 8 × 3.5" | Tower form factor (4U equivalent) |

### Category: switch
| ID | Name | U | RJ45 | SFP+ | QSFP |
|---|---|---|---|---|---|
| `switch-4p` | 4-Port Switch | 1 | 4 | — | — |
| `switch-8p` | 8-Port Switch | 1 | 8 | 2 | — |
| `switch-12p` | 12-Port Managed Switch | 1 | 12 | 2 | — |
| `switch-16p` | 16-Port Managed Switch | 1 | 16 | 2 | — |
| `switch-24p` | 24-Port Managed Switch | 1 | 24 | 4 | — |
| `switch-24p-poe` | 24-Port PoE+ Switch | 1 | 24 | 4 | — |
| `switch-48p` | 48-Port Managed Switch | 1 | 48 | 4 | — |
| `switch-48p-poe` | 48-Port PoE+ Switch | 1 | 48 | 4 | — |
| `switch-core-24sfp` | Core Switch 24×SFP+ | 1 | — | 24 | — |
| `switch-core-32qsfp` | Core Switch 32×QSFP28 | 1 | — | — | 32 |

### Category: router
| ID | Name | U | Ports |
|---|---|---|---|
| `router-4p` | 4-Port Enterprise Router | 1 | 4×RJ45 + 2×SFP+ |
| `router-8p` | 8-Port Enterprise Router | 1 | 8×RJ45 + 4×SFP+ |
| `router-core` | Core Router | 2 | 8×QSFP28 + 2×SFP+ mgmt |

### Category: firewall
| ID | Name | U | Ports |
|---|---|---|---|
| `fw-4p` | Firewall Appliance 4-Port | 1 | 4×RJ45 (WAN/LAN/DMZ) |
| `fw-6p` | NGFW 6-Port | 1 | 6×SFP+ |
| `fw-8p` | NGFW 8-Port | 1 | 8×SFP+ |
| `fw-12p` | NGFW 12-Port | 1 | 12×SFP+ + 2×QSFP28 |

### Category: patch-panel
| ID | Name | U | Ports |
|---|---|---|---|
| `pp-12-cat6` | Patch Panel 12-Port Cat6 | 1 | 12 × RJ45 keystone |
| `pp-24-cat6` | Patch Panel 24-Port Cat6 | 1 | 24 × RJ45 keystone |
| `pp-48-cat6` | Patch Panel 48-Port Cat6 | 1 | 48 × RJ45 keystone |
| `pp-24-fiber` | Fiber Patch Panel 24-Port LC | 1 | 24 × LC duplex |
| `pp-48-fiber` | Fiber Patch Panel 48-Port LC | 1 | 48 × LC duplex |

### Category: pdu
| ID | Name | U | Outlets |
|---|---|---|---|
| `pdu-8` | Basic PDU 8-Outlet | 1 | 8 × IEC C13 |
| `pdu-12` | Basic PDU 12-Outlet | 1 | 12 × IEC C13 |
| `pdu-16-metered` | Metered PDU 16-Outlet | 1 | 16 × IEC C13 |
| `pdu-20-smart` | Smart PDU 20-Outlet | 2 | 20 × IEC C13 + 2 × C19 |
| `pdu-vertical-16` | Vertical PDU 16-Outlet | 0 | 16 × IEC C13 |
| `pdu-vertical-24` | Vertical PDU 24-Outlet | 0 | 24 × IEC C13 |

### Category: ups
| ID | Name | U | VA |
|---|---|---|---|
| `ups-1u-750` | UPS 750VA | 1 | 750 |
| `ups-2u-1500` | UPS 1500VA | 2 | 1500 |
| `ups-2u-3000` | UPS 3000VA | 2 | 3000 |
| `ups-3u-6000` | UPS 6000VA | 3 | 6000 |

### Category: storage
| ID | Name | U | Bays |
|---|---|---|---|
| `nas-4bay` | NAS 4-Bay | 1 | 4 × 3.5" |
| `nas-8bay` | NAS 8-Bay | 2 | 8 × 3.5" |
| `storage-12bay` | Storage Array 12-Bay | 2 | 12 × 2.5" SAS |
| `storage-24bay` | Storage Array 24-Bay | 4 | 24 × 2.5" SAS |
| `storage-aff` | All-Flash Array | 2 | 24 × NVMe U.2 |

### Category: console (rename from 'cable-manager' where applicable — new sub-entries)
| ID | Name | U | Ports |
|---|---|---|---|
| `kvm-8p` | KVM Switch 8-Port | 1 | 8 × KVM |
| `kvm-16p` | KVM Switch 16-Port | 1 | 16 × KVM |
| `console-8p` | Console Server 8-Port | 1 | 8 × Serial |
| `console-16p` | Console Server 16-Port | 1 | 16 × Serial |

### Category: cable-manager (retain, already good)
- `brush-panel-1u` — 1U Brush Panel
- `d-ring-1u` — 1U D-Ring Manager
- `finger-duct-2u` — 2U Finger Duct
- `finger-duct-4u` — 4U Finger Duct

### Category: blank-panel
- `blank-1u` — 1U Blank Panel
- `blank-2u` — 2U Blank Panel

### Category: cooling
- `cooling-1u` — 1U Blanking Panel (airflow)
- `cooling-2u` — 2U Active Cooling Unit

---

## Architecture

### New File: `src/renderers/panel-renderer.ts`

Exports one public function:

```typescript
export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate,
  device: DeviceData,
  deviceWidth: number,    // always RACK_CONSTANTS.RACK_INNER_WIDTH - 2*RAIL_WIDTH = 350
  deviceHeight: number,   // heightUnits * RU_HEIGHT
): SVGGElement
```

Internally dispatches to category-specific functions:

```typescript
function renderSwitchPanel(...)
function renderServerPanel(...)
function renderFirewallPanel(...)
function renderRouterPanel(...)
function renderPatchPanel(...)
function renderPduPanel(...)
function renderUpsPanel(...)
function renderStoragePanel(...)
function renderKvmPanel(...)
function renderBlankPanel(...)
function renderCoolingPanel(...)
```

### Shared Primitive Functions (all in panel-renderer.ts)

```typescript
// Standard port geometry constants
const PORT_W = 18, PORT_H = 15, PORT_PITCH = 21;
const SFP_W = 36, SFP_PITCH = 40;
const LED_H = 2.5, LED_GAP = 2;

function drawRJ45(
  g: SVGGElement,
  ax: number, portTopY: number,
  label: string, ledOn: boolean
): void

function drawSFPCage(
  g: SVGGElement,
  ax: number, chY: number, chH: number,
  label: string, hasModule: boolean, ledOn: boolean
): void

function drawQSFPCage(
  g: SVGGElement,
  ax: number, chY: number, chH: number,
  label: string, hasModule: boolean
): void

function drawStatusBlock(g: SVGGElement): void
// Draws: SYS LED, PWR LED, MODE button, CON port at fixed left-side positions

function drawDriveBay(
  g: SVGGElement,
  ax: number, ay: number, w: number, h: number,
  active: boolean, label: string
): void

function drawLcdPanel(
  g: SVGGElement,
  ax: number, ay: number, w: number, h: number,
  text: string
): void

function drawVentSlots(g: SVGGElement, startX: number, chY: number, chH: number): void

function makeChassisDefs(id: string, g: SVGGElement): void
// Appends linearGradients (chassis, port-bevel, port-cavity, sfp-cage) to g's defs
```

### Panel Layouts

**Switch (renderSwitchPanel)**
- Count RJ45 ports from `template.ports` where type==='rj45' → portCount
- Count SFP+ from ports where type==='sfp-plus' → sfpCount
- Count QSFP28 from ports where type==='qsfp28' → qsfpCount
- ≤24 RJ45: `portTopY = chY + Math.round((chH - PORT_H) / 2)` (single centred row)
- 48 RJ45: paired columns, odd top (`chY+10`), even bottom (`chY+10+PORT_H+LED_H+LED_GAP+3`)
- Numbering: sequential from 1, SFP+ continue after RJ45
- Status block at left (SYS/PWR/MODE/CON), divider, ports, divider, SFP/QSFP cages, vent slots + model text right

**Server (renderServerPanel)**
- Drive bay row left-aligned, bay count from template ID suffix or drive port count
- 1U: 4 bays (32×24 each), 2U: 8 bays (32×24), 4U: 24 bays in a 4×6 grid
- Center: LCD panel (40×16 dark rect with model text), power button (circle), USB port
- Status LEDs: power (green glow), HDD activity (amber), NIC activity (green)
- Right 80px: NIC port cluster (from `template.ports`, rendered by `renderPorts()`)

**Firewall (renderFirewallPanel)**
- 4–12 SFP+ or RJ45 ports depending on template, single row centred
- Zone labels above each port group: "WAN" (first), "DMZ" (second pair), "LAN" (rest)
- Per-port LED bars (green=up, amber=active-traffic, dark=down)
- Status block at left, model text + vent right

**Router (renderRouterPanel)**
- QSFP28 cages (larger: 44×(chH-8)) for core router
- SFP+ cages for enterprise router
- Management port (small RJ45 labelled "MGMT") + Console port labelled "CON"
- LCD showing "READY" text

**Patch Panel (renderPatchPanel)**
- No status block, no LEDs
- All ports: RJ45 keystone style — 16×16px square opening, recessed, numbered below
- Strain-relief bar: horizontal rect at bottom of panel (y = chY+chH-6, h=4, dark gray)
- Port count: 12, 24, or 48 from template
- Fiber patch panel: LC duplex ports — pairs of small circles (8mm diameter) instead of RJ45

**PDU Horizontal (renderPduPanel)**
- IEC C13 outlet: 22×16px trapezoid-ish rect with 3 contact holes inside
- Outlets in a single row, numbered 1–n below each
- Left side: LCD display (power reading), circuit breaker button
- Right: input power inlet (IEC C20)

**UPS (renderUpsPanel)**
- Large LCD panel (120×40) showing VA rating and battery bar
- Battery status bar: horizontal 5-segment indicator (green/amber/red fill)
- Input/Output status indicators
- Left: AC input port, Right: AC output section

**Storage (renderStoragePanel)**
- Drive bay grid: 2.5" bays in rows
- 12-bay: 2 rows of 6; 24-bay: 4 rows of 6
- Each bay: 40×22px with drive activity LED (green if active, dark if empty)
- Right 80px: SAS/NVMe port cluster + LCD status

**KVM/Console (renderKvmPanel)**
- Port cluster: 8 or 16 DB9 serial / KVM port openings
- DB9 port: 22×12px trapezoid with 9 pin dots
- Status LEDs per port
- LCD display center

**Blank Panel (renderBlankPanel)**
- Brushed metal gradient fill only
- 4 screw holes: circles at corners (rx=3, dark fill, gray stroke)

**Cooling (renderCoolingPanel)**
- 1U: horizontal louvre slots across full width
- 2U: large fan grills (circles with blade lines)

---

## Modified Files

### `src/renderers/device-renderer.ts`
- Keep existing logic order: skeleton → rear-view → custom image → **else: call panel-renderer**
- In the `else` branch (no custom image, not skeleton, not rear), replace the current inline category switch with:
  ```typescript
  import { renderFrontPanel } from './panel-renderer';
  // …
  } else {
    const panel = renderFrontPanel(category, template ?? null, deviceWidth, deviceHeight);
    deviceGroup.appendChild(panel);
  }
  ```
- `renderFrontPanel` must handle `template === null` gracefully (render a generic dark rect)
- Keep: rack ears, screw heads, port rendering via `renderPorts()`, preview highlight ring, skeleton mode
- The `honeycomb` pattern and cable-manager-specific drawing move into `panel-renderer.ts`

### `src/library/device-catalog.ts`
- Delete ALL existing entries
- Replace with the full Standard Library table above (≈50 devices)
- Organize with comment blocks per category
- Each server template: `frontPanelImage: undefined` (rendered by panel-renderer)
- Port definitions for each template must use correct types (rj45, sfp-plus, qsfp28, management, console, power)

### `src/components/properties.ts`
- In the device properties section, add an **"Upload Front Panel Image"** button after the device name field
- On click: `<input type="file" accept="image/*">` → FileReader → `readAsDataURL` → `stateManager.setState({ devices: [...] })` updating `device.frontPanelImage`
- Show thumbnail (40×20px) if `device.frontPanelImage` is set
- Add a "Remove" (×) button next to thumbnail to clear it back to SVG rendering
- The existing `renderDevice()` already checks `hasCustomImage = !!(device.frontPanelImage || template?.frontPanelImage)` and renders via `<image>` element — no change needed in renderer

### `src/core/types.ts`
- Add `DeviceCategory` value `'console'` for KVM/Console Server category (next to existing categories)
- No other type changes needed

---

## Testing

- Visual: load app, sidebar shows all new generic categories with no OEM names
- Visual: every device category renders correct industrial SVG panel (no gray box fallback)
- Visual: upload a PNG for a server → panel immediately shows the image
- Visual: remove uploaded image → SVG panel returns
- Test: 24-port switch port numbers 1–24 correct left-to-right
- Test: 48-port switch port numbers odd-top/even-bottom correct
- Test: port `connected` state from `PortData` does not affect LED (LEDs are decorative/generic — real port state shown by port renderer overlay)
