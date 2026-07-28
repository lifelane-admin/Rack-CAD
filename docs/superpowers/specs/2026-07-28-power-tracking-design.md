# Power Tracking + Dual-PDU Circuits + Switch LEDs — Design Spec
**Date:** 2026-07-28  
**Status:** Approved  
**Scope:** Per-device power consumption, rack load aggregation, dual-PDU circuit assignment, switch port LED animation

---

## 1. Overview

Three parallel enhancements that combine into a coherent power-management layer:

1. **Power consumption** — every device template carries a `powerWatts` default; per-instance override in the properties panel; rack-level load totals shown in rack properties.
2. **Dual-PDU circuit assignment** — an inline "Power Mode" on the canvas where each device gets an A/B/A+B badge; the rack's PDU columns show live load bars; capacity warnings prevent overload.
3. **Switch port LEDs** — connected ports blink green (activity); disconnected ports show solid red; driven by actual `DeviceData.ports[n].connected` state.

---

## 2. Data Model Changes

### 2.1 `DeviceTemplate` (new optional field)

```typescript
export interface DeviceTemplate {
  // ... existing fields unchanged ...
  powerWatts?: number;      // nameplate / typical watts; 0 for passive devices
}
```

### 2.2 `DeviceData` (new optional field)

```typescript
export interface DeviceData {
  // ... existing fields unchanged ...
  deviceConfig?: Record<string, unknown>;   // already added in integration plan
  powerWatts?: number;                      // per-instance override; falls back to template.powerWatts
}
```

### 2.3 `RackData` (three new optional fields)

```typescript
export interface RackData {
  // ... existing fields unchanged ...
  powerCircuitA?: string[];        // device IDs assigned to Circuit A (default: all devices)
  powerCircuitB?: string[];        // device IDs assigned to Circuit B
  pduCapacityWatts?: number;       // max watts per circuit; default 3600 (15A × 240V)
}
```

Circuit assignment rules:
- A device with no entry in `powerCircuitB` is treated as Circuit A only.
- A device in both arrays is "dual-corded" (contributes to both circuit load totals at 50%).
- A device in neither array defaults to Circuit A.

---

## 3. Power Consumption Values (Catalog Defaults)

Representative `powerWatts` defaults by category. All values are typical-load figures (not peak nameplate), so they produce realistic rack load totals.

| Category | Typical entries | `powerWatts` |
|----------|----------------|-------------|
| Server 1U | `server-1u` | 200 |
| Server 2U | `server-2u`, `server-2u-hd` | 350 |
| Server 4U | `server-4u` | 600 |
| Switch 8-port | `sw-tplink-sg2424` (24p) | 28 |
| Switch 24-port | `sw-cisco-sg350-28` | 32 |
| Switch 48-port | `sw-tplink-sg2448`, `sw-cisco-sg350-52` | 55 |
| Switch 48p (Catalyst) | `sw-cisco-c9200-24` | 40 |
| Firewall 4–12 port | `fw-4p`, `fw-6p`, `fw-8p`, `fw-12p` | 65 |
| FortiGate 400F | `fw-fortigate-400f` | 150 |
| Router | `router-4p`, `router-8p` | 45 |
| Router core | `router-core` | 120 |
| Storage | storage entries | 180 |
| Patch panel | all `pp-*` | 0 |
| PDU (basic) | `pdu-basic-8c13` | 5 |
| PDU (metered/smart) | `pdu-metered-*`, `pdu-smart-*`, `pdu-apc-*` | 8 |
| Old generic PDUs | `pdu-8`, `pdu-12` etc. | 5 |
| UPS | all `ups-*` | 25 |
| KVM/Console | all console entries | 18 |
| Blank panel | `blank-*` | 0 |
| Cable manager | `*cable-mgr*`, `brush-panel-*`, `d-ring-*` | 0 |
| Cooling | all cooling entries | 150 |

---

## 4. Properties Panel Changes

### 4.1 Device properties — Power field

Added below the Description textarea, above the Front Panel Image section:

```
┌─────────────────────────────────┐
│ Power Consumption               │
│ [    200    ] W                 │
│ Tip: Volts × Amps = Watts       │
└─────────────────────────────────┘
```

- Input pre-filled from `deviceData.powerWatts ?? template.powerWatts ?? 0`.
- On change → `EventBus.emit('device:update', { id, data: { powerWatts: value } })`.
- Accepts integers only; negative values clamped to 0.

### 4.2 Rack properties — Rack Load section

Appended below existing rack properties (name, units, cable managers):

```
┌───────────────────────────────────────┐
│ ⚡ Rack Load                          │
│                                       │
│ Circuit A  [████████░░░░] 1820 / 3600 W │
│ Circuit B  [████░░░░░░░░]  920 / 3600 W │
│ Total      2740 W                     │
│                                       │
│ PDU Capacity (W/circuit)  [  3600  ]  │
│                                       │
│ ⚠ Circuits unbalanced (A carries 2× B)│
└───────────────────────────────────────┘
```

- Load bar colours: green (< 70%), amber (70–90%), red (≥ 90%).
- `pduCapacityWatts` editable inline; default 3600.
- Unbalance warning appears when `max(A,B) > 2 × min(A,B)` and both circuits have at least one device.
- Capacity warning (separate badge) when either circuit load > `pduCapacityWatts`.

---

## 5. Dual-PDU Circuit Assignment (Inline Canvas Mode)

### 5.1 Activation

A **"⚡ Power Mode"** toggle button is added to the rack header bar (the narrow strip just above the rack frame in the canvas). Click to enter; click again to exit. State stored in `AppState` (transient, not persisted).

### 5.2 Per-device badge overlay

While Power Mode is active, `device-renderer.ts` renders an additional SVG overlay on each device:

```
┌────────────────────────────────┐
│  [A]  Dell PowerEdge R640     │   ← blue "A" badge, left edge
└────────────────────────────────┘
```

- Badge is a 20×20 pill at the left edge of the device row.
- **Circuit A only**: blue pill, white "A"
- **Circuit B only**: orange pill, white "B"
- **Dual-corded (A+B)**: half-blue / half-orange pill, "A+B"
- Click cycles: A → B → A+B → A
- Badge is pointer-events enabled; device selection is suppressed while Power Mode is active.

### 5.3 PDU column load bars

The rack's left and right PDU indicator columns (already rendered as narrow strips at the rack sides) gain:
- **Left column** (Circuit A): vertical green/amber/red fill bar, watt label at top
- **Right column** (Circuit B): same

These update live as badges are toggled.

### 5.4 Capacity guard

When toggling a device would push a circuit over `pduCapacityWatts`:
- The badge pulses red once (CSS animation, 600 ms)
- A tooltip appears: `"Circuit A would reach XXXX W — exceeds PDU capacity (YYYY W)"`
- The assignment is still applied (it is a warning, not a hard block) — real admins sometimes deliberately run over for short-term maintenance

### 5.5 Unbalance indicator

A ⚠ badge in the rack header (visible only in Power Mode) when `max(loadA, loadB) > 2 × min(loadA, loadB)` and both circuits are non-zero.

---

## 6. Switch Port LED Animation

### 6.1 Behaviour

| Port state | Green LED | Red LED |
|-----------|-----------|---------|
| Connected to active device | Blinks (activity pattern) | Dim / off |
| Not connected | Dim / off | Solid on (`#ff3333`) |

"Connected" is determined by `deviceData?.ports.find(p => p.id === portId)?.connected`.  
If `deviceData` is null (no instance, catalog preview), all ports render as connected (demonstration mode).

### 6.2 Blink animation

A `<style>` element is injected into the nested switch SVG:

```css
@keyframes rsLedBlink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0.18; }
}
```

The green LED `<circle>` element receives `animation: rsLedBlink 0.9s steps(1) infinite` when `connected === true`.

Each port's animation is offset by `(portIndex * 0.07) s` so all ports don't blink in lockstep — produces a natural "traffic on many ports" look.

SFP ports follow the same pattern.

### 6.3 `renderSwitchPanel` signature update

The switch renderer needs to know which ports are connected. Since `renderFrontPanel` already passes `deviceData` (Task 8 of integration plan), the existing call path delivers it. `renderSwitchPanel` gains a `deviceData` parameter:

```typescript
export function renderSwitchPanel(
  template: DeviceTemplate | null,
  deviceData: DeviceData | null,   // new
  W: number,
  H: number,
): SVGGElement
```

The dispatcher in `panel-renderer.ts` passes it through:

```typescript
case 'switch': return renderSwitchPanel(template, deviceData, deviceWidth, deviceHeight);
```

---

## 7. PDU LED Display with Circuit Load

`renderPduPanel` (already receiving `deviceData`) does not have access to sibling device data. Instead, a new `rackLoadWatts?: number` field is written into `deviceData.deviceConfig` whenever circuit assignments change, so the PDU renderer can read it without needing rack-wide context:

```typescript
// Written by power-circuit.ts whenever circuit A or B load changes:
device.deviceConfig = { ...device.deviceConfig, circuitLoadWatts: 1820, circuitCapacityWatts: 3600 };
```

`renderPduPanel` reads `config.circuitLoadWatts` and `config.circuitCapacityWatts` and overlays on the panel:
- 7-segment style number display (ported from PDUConfigurator.jsx `sevenSegNumber`) showing watts
- Load bar below the number
- Colour follows the same green/amber/red thresholds

For old generic PDU entries (no `deviceConfig.rows`): the existing generic renderer path; no load display added.

---

## 8. New File

| File | Purpose |
|------|---------|
| `src/components/power-circuit.ts` | Power Mode toggle, A/B badge rendering, load bar updates, capacity guard, `RackData` mutation |

`power-circuit.ts` exports:
- `enterPowerMode(rackId: string): void` — activates overlay
- `exitPowerMode(): void` — removes overlay
- `isPowerMode(): boolean`
- `getCircuitLoads(rackId: string): { a: number; b: number }` — used by properties panel and PDU

---

## 9. Integration with Existing Plan

This spec is additive to `2026-07-28-new-devices-integration-design.md`. Tasks from the integration plan execute first; this plan's tasks run after and depend on Task 8 (deviceData signature) being complete.

No existing tests break. New tests cover:
- `powerWatts` present on all catalog entries
- `getCircuitLoads` returns correct totals for given circuit assignments
- Switch renderer: connected port has LED with `animation` attribute set; disconnected port has red LED

---

## 10. Testing Checklist

- [ ] All catalog entries have `powerWatts` defined (≥ 0)
- [ ] Device properties panel shows correct default from template
- [ ] Editing power in properties updates rack load bar in real time
- [ ] Circuit A load bar shows correct sum; Circuit B same
- [ ] pduCapacityWatts field editable and persists
- [ ] Unbalance warning appears when A > 2× B (and vice versa)
- [ ] Capacity warning appears when circuit > pduCapacityWatts
- [ ] Power Mode enters/exits cleanly; badges render on every device
- [ ] Badge click cycles A → B → A+B → A
- [ ] Capacity guard tooltip fires when toggle would exceed limit
- [ ] PDU LED display shows circuit watt total (configured PDUs only)
- [ ] Switch connected ports blink green; disconnected ports show red
- [ ] Port blink offsets produce staggered pattern (not lockstep)
- [ ] No TypeScript errors (`tsc --noEmit`)
