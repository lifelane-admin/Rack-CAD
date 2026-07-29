# Spec: Vertical PDU Side-Wall Mount + Switch LED Fix

**Date:** 2026-07-29  
**Status:** Approved for implementation

---

## Overview

Two related features:

1. **Switch LED fix** — port LEDs blink only when a cable is connected to that port (currently faked with `n % 3 !== 0` in `switch-renderer.ts:365`)
2. **Vertical PDU side-wall mount** — PDUs mount vertically on the rack's left and right inner walls; rack canvas auto-expands to fit; power cables connect device PSU ports to PDU outlets

---

## Feature 1: Switch LED Fix

### Problem

`switch-renderer.ts:365` determines LED state with `const connected = n % 3 !== 0` — a hardcoded fake pattern that lights up LEDs regardless of actual cable connections.

### Solution

Pass a `connectedPortIndices: Set<number>` parameter derived from the live cable state to the switch renderer. The renderer uses this to drive each port's LED state.

### Data Flow

1. Caller (`panel-renderer.ts`) receives the device's `deviceId`
2. Queries `stateManager.getState().cables` — filters for cables where `sourceDeviceId === deviceId || destDeviceId === deviceId`
3. Collects port indices from matching cables into a `Set<number>`
4. Passes the set to `renderSwitchPanel(template, deviceData, W, H, connectedPortIndices)`

### LED State Logic (per port index `n`)

```
if connectedPortIndices.has(n):
  linkState = 'green'       // steady link LED
  actState  = 'greenBlink'  // blinking activity LED
else:
  linkState = 'off'
  actState  = 'off'
```

### Files Changed

- `src/renderers/switch-renderer.ts` — add `connectedPortIndices` param; replace `n % 3 !== 0` logic
- `src/renderers/panel-renderer.ts` — derive connected port set and pass it when calling switch renderer

---

## Feature 2: Vertical PDU Side-Wall Mount

### Architecture

PDUs use the existing device infrastructure (`DeviceTemplate`, `DeviceData`, drag/drop, undo/redo, selection, delete). A new `mountType: 'rack' | 'side'` field distinguishes side-mount from standard rack-unit devices.

### 2a. Data Model Changes

**`src/core/types.ts`**

```typescript
// Existing DeviceTemplate — add:
mountType?: 'rack' | 'side'   // 'rack' is default (backward-compatible)
pduWidth?: number              // px width of this PDU model when side-mounted
outletConfig?: OutletConfig[]  // rows of outlets

// New:
interface OutletConfig {
  count: number
  socketType: SocketType
}

type SocketType =
  | 'C13' | 'C19' | 'C15' | 'C5'           // IEC international
  | 'NEMA-5-15' | 'NEMA-5-20'               // North America
  | 'NEMA-L5-30' | 'NEMA-L6-20'
  | 'BS1363'                                 // UK
  | 'Schuko'                                 // EU
  | 'IS6538-5A' | 'IS6538-15A'              // India Type D / M
  | 'IS1293-6A' | 'IS1293-16A'              // India 2+E

// Existing DeviceData — add:
sideMountPosition?: 'left' | 'right'        // only for mountType:'side' devices

// Existing RackData — add:
leftPduId?: string    // deviceId of PDU mounted on left wall (or undefined)
rightPduId?: string   // deviceId of PDU mounted on right wall (or undefined)

// Existing CableData — add:
cableType?: 'data' | 'power'                // defaults to 'data'
plugType?: SocketType                        // set when cableType === 'power'

// Per-port type override (stored in DeviceData):
portTypes?: Record<number, 'data' | 'power'>  // index → type; absent = 'data'
```

### 2b. Rack Canvas Geometry

The rack outer width dynamically widens when PDUs are mounted:

```
rackTotalWidth = RACK_OUTER_WIDTH
               + (leftPdu  ? leftPduTemplate.pduWidth  ?? 30 : 0)
               + (rightPdu ? rightPduTemplate.pduWidth ?? 30 : 0)
```

Layout (left→right for a dual-PDU rack):

```
[outer frame wall]
  [cable tray — fixed, inside frame]
    [LEFT PDU zone — pduWidth px, auto-fit]
      [U-scale rail — RAIL_WIDTH px]
        [equipment mounting area — RACK_INNER_WIDTH px]
      [U-scale rail — RAIL_WIDTH px]
    [RIGHT PDU zone — pduWidth px, auto-fit]
  [cable tray — fixed, inside frame]
[outer frame wall]
```

The equipment area and U-scale rails do not move; only the outer canvas grows outward.

### 2c. PDU Catalog Entries

New catalog category: **Vertical PDU** (`mountType: 'side'`).

| Model | Outlets | pduWidth | Region |
|---|---|---|---|
| APC AP8858 | C13×20 | 42px | International |
| APC AP8868 | C19×24 | 48px | International |
| APC AP8853 | C13×16 + C19×2 | 44px | International |
| Vertiv MPH2-IS | IS6538-15A×16 | 44px | India |
| Legrand LCS3 | IS6538-5A×24 | 46px | India |
| Generic NEMA | NEMA-5-15×24 | 44px | North America |
| Generic UK | BS1363×16 | 42px | UK |
| Custom PDU | configurable | configurable | Any |

### 2d. Drag-and-Drop — Two Entry Points

**Entry Point A: Catalog panel drag**

- Vertical PDU entries appear in the catalog panel under a "Vertical PDU" category
- While dragging a `mountType:'side'` device, the rack left/right "+" strips (20px placeholder zones) are the only valid drop targets — rack slots are not highlighted
- Drop is detected when the cursor is released within the left or right PDU zone bounds (world-space hit test against the strip rect)
- Drop snaps the PDU to that side; rack canvas widens immediately to `pduWidth`
- Blocked if a PDU is already mounted on that side (tooltip: "A PDU is already mounted here")

**Entry Point B: Side-wall "+" handle**

- When no PDU is mounted on a side, a dashed-border strip (20px wide) with a centred "+" handle appears on that side of the rack
- Clicking "+" opens a PDU picker modal listing the same Vertical PDU catalog entries
- Selecting a model mounts it and widens the rack

### 2e. PDU Rendering (side-mounted)

The PDU zone renders:

- Dark background strip matching pduWidth × rackInnerHeight
- LCD/status panel at top (model name, total load %)
- IEC outlet blocks stacked vertically, spaced evenly
- Each outlet shows socket type label and a fill indicator (green dot = cable connected)
- Outlets are hit-targets for power cable drop

### 2f. PDU Removal

- Click the PDU strip to select it (highlight border, selection handles)
- Press **Delete** → PDU removed, rack narrows back, all connected power cables deleted
- Undo/redo supported via existing state history

### 2g. "+" Handle Visibility

- Left side: shows "+" if `rack.leftPduId` is undefined
- Right side: shows "+" if `rack.rightPduId` is undefined
- Handle disappears once the slot is occupied

---

## Feature 3: Flexible Port Types

### Port Type Concept

Every port on every device defaults to type `'data'`. Users can right-click any port and toggle it to `'power'`. The type is stored in `DeviceData.portTypes: Record<number, 'data' | 'power'>`.

### Rendering

| Port type | Visual |
|---|---|
| `'data'` | Existing RJ45/SFP jack graphic (no change) |
| `'power'` | IEC C14 inlet: 3-oval-hole pattern, purple border `#cc44ff` |

### Right-Click Context Menu (on a port)

```
Port [N] options
─────────────────
📡  Set as Data port
⚡  Set as Power port
─────────────────
Cancel
```

Menu only appears when right-clicking directly on a port hit-target.

### Cable Compatibility Rules

When the user draws a cable between two endpoints:

| Source port type | Dest endpoint | Result |
|---|---|---|
| `'data'` | `'data'` port | Network cable — existing behavior |
| `'power'` | PDU outlet | Power cable — prompts for plug sub-type |
| `'power'` | `'data'` port | Blocked: tooltip "Incompatible port types" |
| `'data'` | PDU outlet | Blocked: tooltip "Connect a power port to PDU" |

### Power Cable Plug Sub-Type Prompt

When a power cable connection is confirmed, a small popup appears:

```
Select plug type
───────────────────────────────
IEC:    [C13]  [C19]  [C15]
NEMA:   [5-15] [5-20] [L5-30]
India:  [IS6538-5A] [IS6538-15A] [IS1293-6A]
UK/EU:  [BS1363] [Schuko]
───────────────────────────────
[Confirm]  [Cancel]
```

Selection stored as `cable.plugType: SocketType`.

### Power Cable Visual

- Thicker stroke than data cables (3px vs 2px)
- Color: red `#ff4422` when connecting to left PDU, blue `#3399ff` for right PDU, black `#555` if unconnected to a PDU
- Label: plug type shown mid-cable (e.g. "C13")
- Dashed pattern to distinguish from data cables: `stroke-dasharray: 6 3`

---

## Switch LED and Power Port Interaction

Switches have only data ports. Power cables cannot connect to switch ports. Switch LEDs blink only for data cable connections (Feature 1 already covers this — the LED logic reads from `connectedPortIndices` which only includes data cables).

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/core/types.ts` | Add `mountType`, `pduWidth`, `outletConfig`, `sideMountPosition`, `cableType`, `plugType`, `portTypes`, `leftPduId`, `rightPduId`, `SocketType`, `OutletConfig` |
| `src/library/device-catalog.ts` | Add Vertical PDU catalog entries |
| `src/renderers/switch-renderer.ts` | Accept `connectedPortIndices`; replace fake LED pattern |
| `src/renderers/panel-renderer.ts` | Derive connected port set from cables; pass to switch renderer |
| `src/renderers/rack-renderer.ts` | Dynamic rack width; render PDU zones; "+" handles; outlet hit-targets |
| `src/renderers/pdu-renderer.ts` | New `renderSidePdu()` for vertical side-mount layout |
| `src/renderers/device-renderer.ts` | Render power ports (C14 inlet graphic); right-click context menu |
| `src/renderers/cable-renderer.ts` | Power cable style (thick, dashed, colored); plug type label |
| `src/app.ts` | Drop detection for side-mount PDUs; "+" handle click handler; plug sub-type prompt; port right-click handler; cable type determination on connect |
| `src/core/state.ts` | `leftPduId`/`rightPduId` in rack state; `portTypes` in device state |

---

## Out of Scope

- PDU load monitoring / power consumption aggregation (separate feature)
- 3D isometric mode for PDU side zones
- PDU daisy-chaining or branch circuit modeling
- Automatic cable color assignment based on feed labeling (manual choice for now)
