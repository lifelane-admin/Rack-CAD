# Workflow UI Enhancements — Design Spec
**Date:** 2026-10-04
**Branch:** improve_error_handling
**Status:** Approved — ready for implementation planning

---

## Overview

Six coordinated improvements to the RackSlicer AI Workflow (Stages 1–10):

1. N+1 spare node toggle actually updates the BOM
2. Stage 2 rack preview is taller with scroll-to-zoom
3. Auto-labels with elbow connectors in preview and on canvas deploy
4. Active Engineering Metrics bar replaces the static Design Summary
5. Full cable laying (power + data + management) on canvas deployment
6. New Stage 2b — Front Panel Port/Slot Inventory with isometric illustration and confirmation gate

All changes use Approach 1 (incremental, isolated) — each feature is independently testable and can be reverted without affecting the others.

---

## Feature 1 — N+1 Spare Node Toggle

### Problem
`asm_spare` checkbox calls `orchestrator.updateAssumption()` which only flips the `enabled` flag. Nothing downstream reads that flag to adjust the BOM. The toggle is decorative.

### Solution

**New orchestrator method:** `syncSpareNode(enabled: boolean)` in `workflow-orchestrator.ts`
- `enabled = false`: remove any BOM item where `badge === 'Redundancy N+1'` or `name` includes `'N+1 Standby Node'`. Call `notify()`.
- `enabled = true`: if no spare exists, add the standard spare item (Dell PowerEdge R760, 2U, 310W, $8,900, badge `'Redundancy N+1'`). Call `notify()`.

**Trigger:** `stage-renderers.ts` `asm_spare` checkbox change handler (line ~350) calls `orchestrator.syncSpareNode(checked)` immediately after `updateAssumption`.

**Stage 2 display:** "Cluster Size" row reads `asm_spare.enabled`:
- Spare on → `${req.nodeCount} Host Nodes + 1 N+1 Spare`
- Spare off → `${req.nodeCount} Host Nodes`

BOM totals (cost, power, rack U) recalculate automatically since they read from `getBomItems()`.

### Files Changed
- `src/ai/workflow/workflow-orchestrator.ts` — add `syncSpareNode()`
- `src/ai/workflow/stage-renderers.ts` — call `syncSpareNode()` in checkbox handler; update Stage 2 Cluster Size row

---

## Feature 2 — Rack Preview: Taller + Scroll-to-Zoom

### Problem
The Stage 2 rack preview column is a fixed small height (~200px) with no interaction.

### Solution

**New utility class:** `RackPreviewZoom` (`src/ai/workflow/rack-preview-zoom.ts`, ~60 lines)
- Constructor takes a container element
- Listens for `wheel` events, calls `event.preventDefault()` to stop page scroll
- Maintains `scale` clamped to `[0.4, 3.0]`, default `1.0`
- Applies `transform: scale(scale)` + `transform-origin: top center` to the inner rack frame
- Shows a fading `zoom-badge` overlay (e.g., `"100%"`) that disappears after 1.5s inactivity
- Exposes `reset()` — called when the stage re-renders to return to 1.0×

**CSS changes:**
- `.physical-preview-col` / right preview column: `min-height: 450px`
- Inner rack frame: `overflow: hidden`, expands to fill column height
- Device list: `overflow-y: auto` internally if content overflows at default zoom

**Attachment:** `renderArchitectureStage()` calls `new RackPreviewZoom(previewContainer)` after setting `innerHTML`. Same class reused in Stage 04 physical layout preview.

### Files Changed
- `src/ai/workflow/rack-preview-zoom.ts` — new file
- `src/ai/workflow/stage-renderers.ts` — attach `RackPreviewZoom` after render; update preview column CSS classes
- `src/styles/workflow.css` (or equivalent) — height + overflow rules

---

## Feature 3 — Auto-Labels with Elbow Connectors

### Problem
`text-label-renderer.ts` has a full elbow connector + label system but the workflow never calls it. Labels only exist if the user manually creates them.

### Label Naming Convention
`${shortManufacturer} ${roleShort} ${index}` examples:
- `"Dell Proxmox Host 1"`, `"Dell Proxmox Host 2"`
- `"Dell NVMe SAN"`
- `"Dell ToR-A"`, `"Dell ToR-B"`
- `"Dell PDU-A"`, `"Dell PDU-B"`

### Solution

**3a. Stage 2 preview labels (HTML overlay)**
Each device row in the rack frame mock gets a short label pill + CSS elbow leader line. Generated inline in `renderArchitectureStage()` alongside device rows. No SVG needed — pure CSS `::before` pseudo-element for the horizontal leader + colored pill. Updates whenever the stage re-renders.

**3b. Canvas deploy labels (`LabelSyncManager`)**
New class: `src/ai/workflow/label-sync-manager.ts`

Public API:
```typescript
class LabelSyncManager {
  syncLabels(bomItems: BomItem[], devices: DeviceData[]): void
  clearAll(): void
}
```

`syncLabels()` behaviour:
- For each deployed device: looks up canvas `DeviceData` by templateId
- Creates a `TextLabel` in `stateManager` with short name, positioned 60px right of device, elbow connector pointing to device center-right anchor
- Skips devices that already have a matching label (idempotent — checks by `targetDeviceId`)
- Removes labels whose device no longer exists in canvas state

**3c. Dynamic re-sync**
`LabelSyncManager.syncLabels()` is called:
1. After canvas deployment completes (end of `applyTransaction` success path)
2. Whenever `orchestrator.notify()` fires AND `orchestrator.getState().hasCanvasDeployment === true` (a boolean flag set to `true` on first successful deploy, never reset by config changes — only by explicit "Undo AI Deployment")

This covers the "back from Stage 6/7/10 and change config" case — renames changed labels, removes orphans, adds new ones.

### Files Changed
- `src/ai/workflow/label-sync-manager.ts` — new file
- `src/ai/workflow/stage-renderers.ts` — Stage 2 preview label HTML; call `syncLabels()` post-deploy
- `src/ai/workflow/workflow-orchestrator.ts` — call `syncLabels()` in `notify()` when deployed

---

## Feature 4 — Active Engineering Metrics Bar

### Problem
The `bom-summary-bar` in Stage 3 shows four static stats and disappears outside Stage 3. No action buttons.

### Solution

**New renderer function:** `EngineeringMetricsBar.render(orchestrator)` in `stage-renderers.ts`

Reads live from:
- `orchestrator.getBomTotals()` → `{ totalCost, totalUnits, totalWatts, itemCount }`
- `orchestrator.getState().requirement` → `powerFeed`, `nodeCount`

Derived values:
- Heat load: `totalWatts × 3.412142` BTU/hr
- U utilization: `totalUnits / 42` as percentage
- Redundancy status: `powerFeed === 'A/B Redundant'` → `"Dual Feed Verified"` (green) else `"Single Feed"` (amber)

**Metrics displayed:**
| Metric | Formula |
|--------|---------|
| U Space Used | `totalUnits / 42 U (Y%)` |
| Rack IT Draw | `totalWatts / 1000` kW |
| Heat Load | `totalWatts × 3.412` BTU/hr |
| Estimated BOM | `$totalCost` USD |
| A/B Redundancy | derived from `powerFeed` |

**Action buttons:**
- `↩ Undo AI Deployment` → `orchestrator.undoDeployment()`
- `📊 Export BOM Report` → existing BOM export flow

**Placement:**
- Replaces `bom-summary-bar` in Stage 3
- Appended as persistent footer strip inside `workflow-stage-card` from Stage 2 onward — every `render*Stage()` call includes it before `stage-footer` buttons
- Reactive updates: `updateMetricsBar(container, orchestrator)` patches inner text nodes only (no full re-render) on every `orchestrator.notify()`

### Files Changed
- `src/ai/workflow/stage-renderers.ts` — `EngineeringMetricsBar` renderer + `updateMetricsBar()` patch fn; inject into Stage 2+ render calls
- `src/styles/workflow.css` — metrics bar styles

---

## Feature 5 — Auto Cable Laying on Deployment

### Problem
Devices are deployed to canvas but no cables are created. Power, data, and management connections must be auto-wired to produce a complete rack diagram.

### Solution

**New class:** `CableLayingOrchestrator` (`src/ai/workflow/cable-laying-orchestrator.ts`)

Public API:
```typescript
class CableLayingOrchestrator {
  syncCables(devices: DeviceData[], cables: CableData[], req: RequirementSpec): void
  clearAll(): void
}
```

**Power cables:**
- Each device with PSU ports: PSU 1 → Feed A PDU first available outlet, PSU 2 → Feed B PDU first available outlet
- Dual-corded where device has 2 PSU ports; single-corded otherwise
- Reuses port-finding logic from `canvas-deploy-smart-cabling.ts`
- Visual: red/orange colour
- Routing: `sidePreference: 'right'` → **Right Vertical Cable Manager** (keeps AC power separated from data to prevent EMI — enforced by existing validation rule in `validation.ts`)

**Data cables:**
- Each server NIC uplink 1 → ToR-A first available port; uplink 2 → ToR-B first available port
- Storage nodes: dedicated storage NICs → ToR-A/B storage VLAN ports
- Speed/type derived from `req.networkFabric` (25GbE → SFP28, 100GbE → QSFP28)
- Inter-switch uplink: ToR-A ↔ ToR-B peer link on highest-index ports of each switch
- Visual: blue (25G) / teal (100G)
- Routing: `sidePreference: 'left'` → **Left Vertical Cable Manager**

**Management cables:**
- Each device MGMT/BMC port → OOB management switch sequential port assignment
- If no OOB switch in BOM: MGMT ports left unconnected; logged as known issue in Validation Log
- Visual: grey, dashed style
- Routing: `sidePreference: 'left'` → **Left Vertical Cable Manager** (bundled with data cables)

**Cable manager congestion:** The existing `runValidationAlerts()` congestion check (threshold: 12 cables per manager) will automatically flag over-populated managers in the Validation Log after deployment. No special handling needed — it runs on every `stateManager.setState()` call.

**Idempotency:** `syncCables()` checks existing cable `sourcePortId`/`destPortId` pairs before creating — skips any cable that already exists. On config change (device removed): removes orphaned cables whose source or dest device no longer exists.

**Trigger:** Called after `LabelSyncManager.syncLabels()` at the end of canvas deployment and on every `orchestrator.notify()` when `orchestrator.getState().hasCanvasDeployment === true`.

### Files Changed
- `src/ai/workflow/cable-laying-orchestrator.ts` — new file
- `src/ai/workflow/stage-renderers.ts` — call `syncCables()` post-deploy
- `src/ai/workflow/workflow-orchestrator.ts` — call `syncCables()` in `notify()` when deployed

---

## Feature 6 — Front Panel Port/Slot Assessment (Stage 2b)

### Problem
Port and slot assignments are assumed silently during architecture. Users have no visibility into what physical ports exist on each device, how they are mapped to cables, or the opportunity to remap before deployment. This makes port conflicts and cabling errors invisible until deployment fails.

### New Stage: `PORT_SLOT_INVENTORY`
Inserted between `ARCHITECTURE_DESIGN` (Stage 2) and `RESOURCE_BOM` (Stage 3). All existing stages re-number to Stage 3–11. Stage label constants updated in `stage-renderers.ts` and `workflow-orchestrator.ts`.

### Notation System
| Prefix | Meaning | Examples |
|--------|---------|---------|
| `S1, S2…` | PCIe / expansion slot bays | S1: PCIe x16 [NIC card] |
| `P1, P2…` | Network data ports (SFP28, QSFP28, RJ45) | P1: SFP28 → ToR-A P3 |
| `PWR1, PWR2` | PSU bays (C13/C14 power inlets) | PWR1 → PDU-A Outlet 4 |
| `MGMT` | BMC / iDRAC / iLO management port | MGMT → OOB-SW P12 |

### Stage Card Layout
One panel card per device type in the BOM (compute server, ToR switch, PDU, storage array). Each card:
1. Device name + specs header
2. Isometric SVG front panel illustration (see below)
3. Port inventory table beneath the graphic (all ports listed with S/P notation, type, assignment, status)
4. `"Confirm Port Map ✓"` button — enabled only after user has reviewed/interacted with the card
5. `✓ Port Map Locked` green badge shown after confirmation

Stage "Accept & Continue" button disabled until all device cards are `confirmed: true`.

### Isometric SVG Front Panel (`port-slot-renderer.ts`)
Generated programmatically from `device-catalog.ts` port definitions. Each device's ports are already typed (`sfp28`, `qsfp28`, `power`, `management`, `rj45`).

**Visual style:** 12° isometric tilt, subtle drop shadow, brushed-metal faceplate via SVG gradient. Connector silhouettes:
- SFP28 / SFP+ → small square cage outline
- QSFP28 / QSFP → larger square cage outline
- C13 / C14 power → trapezoid inlet
- RJ45 → rectangular port with 8-pin suggestion lines
- PCIe slot → horizontal slot outline with bay number

**Per-port label (traffic-light status):**
- `P1: SFP28 → ToR-A P3` with colour-coded dot:
  - 🟢 Green — confirmed + cable assignment locked
  - 🟡 Amber — auto-assigned, awaiting confirmation
  - 🔴 Red — conflict (duplicate assignment or speed mismatch)
  - ⚫ Grey — unassigned / reserved for future use
- Hover tooltip: full detail (speed, VLAN, cable colour, cable manager side)

### Port Remapping Interaction
Click any port → inline popover with:
- Current assignment (pre-filled from architecture decisions in Stage 2)
- Dropdown to reassign to a different device/port
- "Mark as Reserved" option
- "Clear" (set to unassigned)

Changes written to `orchestrator.portAssignmentMap: Record<deviceId, Record<portId, PortAssignment>>` where:
```typescript
interface PortAssignment {
  targetDeviceId: string;
  targetPortId: string;
  cableType: 'data' | 'power' | 'management';
  confirmed: boolean;
}
```

### Integration with Cable Laying (Feature 5)
`CableLayingOrchestrator.syncCables()` reads `orchestrator.portAssignmentMap` as the authoritative source for all cable connections. If a port assignment exists in the map, that exact pairing is used. If no map entry exists for a port (device added after Stage 2b), auto-assignment logic applies as fallback.

### New Type in `workflow/types.ts`
```typescript
interface PortAssignment {
  targetDeviceId: string;
  targetPortId: string;
  cableType: 'data' | 'power' | 'management';
  confirmed: boolean;
}
```
`portAssignmentMap` added to `WorkflowState`.

### Files Changed
- `src/ai/workflow/port-slot-renderer.ts` — new file; isometric SVG generator + port interaction events
- `src/ai/workflow/stage-renderers.ts` — `renderPortSlotInventoryStage()`; stage number constants updated
- `src/ai/workflow/workflow-orchestrator.ts` — `portAssignmentMap` state; `confirmDevicePortMap(deviceId)`; stage transition guard
- `src/ai/workflow/types.ts` — `PortAssignment` interface; `portAssignmentMap` on `WorkflowState`
- `src/ai/workflow/cable-laying-orchestrator.ts` — read `portAssignmentMap` as primary cable source

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/ai/workflow/rack-preview-zoom.ts` | Scroll-to-zoom handler for rack preview panels |
| `src/ai/workflow/label-sync-manager.ts` | Creates/updates/removes TextLabel objects in sync with orchestrator |
| `src/ai/workflow/cable-laying-orchestrator.ts` | Auto-wires power, data, management cables on deployment |
| `src/ai/workflow/port-slot-renderer.ts` | Isometric SVG front panel generator + port interaction events |

## Modified Files Summary

| File | Changes |
|------|---------|
| `src/ai/workflow/workflow-orchestrator.ts` | `syncSpareNode()`, `portAssignmentMap`, `confirmDevicePortMap()`, call `syncLabels()` + `syncCables()` in `notify()` |
| `src/ai/workflow/stage-renderers.ts` | All 6 features — checkbox handler, preview labels, metrics bar, zoom, post-deploy hooks, Stage 2b renderer, stage number re-labelling |
| `src/ai/workflow/types.ts` | `PortAssignment` interface, `portAssignmentMap` on `WorkflowState` |
| `src/styles/workflow.css` | Preview height, metrics bar styles, port card styles, isometric panel styles |

---

## Testing Checklist

**Feature 1 — N+1 Toggle**
- [ ] Uncheck N+1 in Stage 1 → Stage 2 Cluster Size drops spare, BOM totals decrease by 1 node cost/power/U
- [ ] Re-check N+1 → spare node returns to BOM, Stage 2 shows "+1 N+1 Spare"

**Feature 2 — Rack Preview**
- [ ] Stage 2 rack preview renders at ≥450px height
- [ ] Scroll wheel over preview zooms in/out (0.4×–3.0×); zoom badge appears then fades after 1.5s
- [ ] Zoom resets to 1.0× on stage re-render

**Feature 3 — Auto-Labels**
- [ ] Stage 2 device rows show short label pills with CSS elbow leaders
- [ ] Deploy to canvas → devices appear with TextLabel elbow connectors on main canvas
- [ ] Back from Stage 7, change node count → canvas labels update (rename/add/remove), no duplicates

**Feature 4 — Engineering Metrics Bar**
- [ ] Metrics bar visible from Stage 2 onward with correct U%, kW, BTU/hr, BOM $, redundancy status
- [ ] Metrics update reactively when N+1 toggled or BOM changes
- [ ] Undo AI Deployment button triggers rollback
- [ ] Export BOM Report button triggers existing export

**Feature 5 — Cable Laying**
- [ ] Deploy → power cables (red) connect PSU ports to PDU outlets via Right Cable Manager
- [ ] Deploy → data cables (blue/teal) connect server NICs to ToR-A/B via Left Cable Manager
- [ ] Deploy → management cables (grey, dashed) connect BMC ports to OOB switch or log known issue
- [ ] Re-deploy after config change → cables are idempotent (no duplicates)
- [ ] Congestion alert fires in Validation Log if either cable manager exceeds 12 cables

**Feature 6 — Port/Slot Assessment (Stage 2b)**
- [ ] Stage 2b appears between Stage 2 and Stage 3 (now Stage 3)
- [ ] Every BOM device type has a panel card with isometric SVG front panel
- [ ] All ports show S/P notation with type, assignment, and traffic-light status dot
- [ ] Hover on port shows full tooltip (speed, VLAN, cable manager side)
- [ ] Clicking a port opens remap popover; reassignment updates portAssignmentMap
- [ ] "Confirm Port Map ✓" button locks device card with green badge
- [ ] "Accept & Continue" is disabled until all device cards confirmed
- [ ] CableLayingOrchestrator uses confirmed portAssignmentMap as primary cable source
- [ ] Port added after Stage 2b (config change) falls back to auto-assignment
