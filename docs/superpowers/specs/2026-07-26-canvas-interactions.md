# Sub-Project B: Canvas Interaction Improvements
**Date:** 2026-07-26  
**Status:** Approved

---

## Overview

Add six interaction improvements to the canvas: Ctrl+Drag to clone devices, a right-click context menu, rubber-band multi-select, keyboard shortcuts, port hover tooltips, and direction-aware cable preview. All changes wire into the existing `eventBus` / `stateManager` / `history` stack — every action is undoable.

---

## Features

### 1. Ctrl+Drag to Clone

**Trigger:** User holds `Ctrl` key while dragging a selected device on the canvas.

**Behaviour:**
- On `mousedown` with `event.ctrlKey`: set a `cloningMode = true` flag
- On first `mousemove` after threshold (4px): create a deep-copy of the device with new UUIDs for device and all ports; add it to state at the original position; begin dragging the clone
- On `mouseup`: place the clone at drop position; push to history
- Visual: during drag, show the clone at the cursor with 70% opacity to distinguish from the original

**Deep copy logic (in `src/utils/clone.ts`, new file):**
```typescript
export function cloneDevice(device: DeviceData): DeviceData {
  const newId = crypto.randomUUID();
  return {
    ...device,
    id: newId,
    hostname: device.hostname + '-copy',
    ports: device.ports.map(p => ({
      ...p,
      id: crypto.randomUUID(),
      deviceId: newId,
      connected: false,
      cableId: null,
    })),
  };
}
```
Cloned device has no cable connections (cables stay on the original).

**Files:** `src/utils/clone.ts` (new), `src/app.ts` (drag handler update)

---

### 2. Right-Click Context Menu

**Trigger:** `canvas:rightclick` event (already fired by canvas mouse handler).

**Component:** New `src/components/context-menu.ts` + `src/styles/context-menu.css`

```typescript
export class ContextMenu {
  show(items: ContextMenuItem[], screenX: number, screenY: number): void
  hide(): void
}

interface ContextMenuItem {
  label: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  action: () => void;
}
```

**Menu contents by target:**

*Device selected:*
```
Cut          Ctrl+X
Copy         Ctrl+C
Paste        Ctrl+V
Duplicate    Ctrl+D
─────────────────────
Delete       Del
─────────────────────
Lock / Unlock
Properties
Upload Front Panel Image
```

*Cable selected:*
```
Edit Cable Type
Reverse Direction
─────────────────────
Delete       Del
```

*Rack (right-click on rack frame):*
```
Add Device
Edit Rack Name
─────────────────────
Delete Rack
```

*Empty canvas:*
```
Paste        Ctrl+V
Select All   Ctrl+A
─────────────────────
Zoom to Fit  Ctrl+0
```

**State for clipboard:**
```typescript
// Stored in module-level variable in context-menu.ts (not in AppState)
let clipboard: DeviceData | null = null;
```

Cut = copy to clipboard + delete. Paste = clone from clipboard and place at canvas centre. Duplicate = clone at +20px offset.

**Dismiss:** Click outside, Escape key, or another right-click.

**Files:** `src/components/context-menu.ts` (new), `src/styles/context-menu.css` (new), `src/app.ts` (wire `canvas:rightclick` handler)

---

### 3. Rubber-Band Multi-Select

**Trigger:** Click + drag on empty canvas (no device/cable under cursor).

**Behaviour:**
- `mousedown` on empty canvas: record `selectionStart: Point`
- `mousemove` while dragging: draw SVG `<rect>` selection overlay (dashed border `#58a6ff`, fill `rgba(88,166,255,0.08)`)
- `mouseup`: find all devices whose bounding rect intersects the selection rect; add them all to `AppState.selection`
- If `Shift` held: append to existing selection instead of replacing

**Selection rect element:** Created and removed dynamically in the canvas SVG. `id="selection-rect"`, `pointer-events="none"`.

**Files:** `src/app.ts` (canvas mouse handler), `src/core/state.ts` (selection already supports multiple items)

---

### 4. Keyboard Shortcuts

**Handler registered in `src/app.ts` on `document.addEventListener('keydown')`.** Only fires when focus is not in a text input.

| Key | Action |
|---|---|
| `Delete` / `Backspace` | Delete all selected items (devices + cables) |
| `Escape` | Clear selection; dismiss context menu; cancel cable-in-progress |
| `Ctrl+A` | Select all devices and cables |
| `Ctrl+C` | Copy selected device to clipboard |
| `Ctrl+X` | Cut selected device to clipboard |
| `Ctrl+V` | Paste from clipboard at canvas centre + 20px offset |
| `Ctrl+D` | Duplicate selected device at +20/+20 offset |
| `Ctrl+Z` | Undo (already exists via `history:undo` event) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo (already exists via `history:redo`) |
| `Arrow keys` | Nudge selected **rack** 1px on canvas (devices inside racks move by RU, not pixel — arrow keys do not apply to devices) |
| `Shift+Arrow` | Nudge selected rack 10px |
| `Ctrl+0` | Zoom to fit all content |

Arrow nudge emits `device:update` event → pushed to history.

**Files:** `src/app.ts`

---

### 5. Port Hover Tooltips

**Trigger:** `port:hover` event with a port ID (already fired by port renderer on mouseenter).

**Tooltip component (new `src/components/tooltip.ts`):**
```typescript
export class Tooltip {
  show(content: TooltipContent, screenX: number, screenY: number): void
  hide(): void
}

interface TooltipContent {
  portName: string;
  portType: string;
  speed?: string;
  connected: boolean;
  connectedTo?: string;  // device name + port name
  cableType?: string;
  cableColor?: string;
}
```

**Tooltip HTML (rendered via `innerHTML` in a fixed-position div):**
```
┌─────────────────────────────┐
│  NIC 1 (RJ45 · 10 Gbps)   │
│  ● Connected via VM-Network │
│    → Switch-A : Gi0/1      │
└─────────────────────────────┘
```
Or if unconnected: `○ Not connected`

**Position:** 12px right of cursor, flip left if near right edge.

**Dismiss:** `port:hover` null event (mouseout).

**Lookup:** Given `portId`, find device and cable from `stateManager.getState()`. Find the *other* port on the cable (source or dest) to show "connected to" info.

**Files:** `src/components/tooltip.ts` (new), `src/styles/tooltip.css` (new), `src/app.ts` (subscribe to `port:hover`)

---

### 6. Device Lock

**State:** Add `locked?: boolean` to `DeviceData` in `types.ts`.

**Behaviour:**
- Locked devices cannot be dragged, cannot be deleted via keyboard
- Locked devices show a small 🔒 padlock icon in top-left of device panel (rendered in `device-renderer.ts`)
- Right-click → Lock/Unlock toggles the flag
- Locked devices CAN still be selected and viewed in Properties

**Files:** `src/core/types.ts`, `src/renderers/device-renderer.ts`, `src/app.ts`

---

## Modified Files Summary

| File | Change |
|---|---|
| `src/utils/clone.ts` | New — deep-copy device with new UUIDs |
| `src/components/context-menu.ts` | New — right-click menu component |
| `src/styles/context-menu.css` | New — context menu styles |
| `src/components/tooltip.ts` | New — port hover tooltip |
| `src/styles/tooltip.css` | New — tooltip styles |
| `src/app.ts` | Wire all 5 interaction handlers |
| `src/core/types.ts` | Add `locked?: boolean` to `DeviceData` |
| `src/renderers/device-renderer.ts` | Render lock icon when `device.locked` |

---

---

### 7. Direction-Aware Cable Preview

**Problem:** When laying a cable, the dotted preview line exits the source port in a fixed direction regardless of where the mouse is moving.

**Fix:** In `src/renderers/cable-renderer.ts`, when drawing the in-progress cable preview, compute the **exit direction** from the vector between the source port position and the current mouse point:

```typescript
function getExitDirection(sourcePos: Point, mousePos: Point): 'up' | 'down' | 'left' | 'right' {
  const dx = mousePos.x - sourcePos.x;
  const dy = mousePos.y - sourcePos.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
```

**Preview path construction:** Apply a straight exit segment in the computed direction (length = `exitStraightOffset`, default 18px) before the first bend:
- `'up'`:    first control point = `{ x: src.x, y: src.y - offset }`
- `'down'`:  first control point = `{ x: src.x, y: src.y + offset }`
- `'left'`:  first control point = `{ x: src.x - offset, y: src.y }`
- `'right'`: first control point = `{ x: src.x + offset, y: src.y }`

The preview then routes from that control point to the mouse position using the existing smart-routing path builder.

**Hysteresis:** Only switch direction when the mouse has moved > 8px in the new axis to avoid jitter when moving diagonally near 45°.

**Files:** `src/renderers/cable-renderer.ts` (preview path builder), `src/utils/routing.ts` (export `getExitDirection` helper)

---

## Testing

- Cable preview direction: drag from a port upward → preview exits upward; drag left → exits left; diagonal near 45° → stable (no jitter)
- Ctrl+drag a server: clone appears, original stays, both in undo stack
- Right-click a device: menu appears with all items; Cut/Copy/Paste round-trip works
- Right-click empty canvas: shows Paste / Select All / Zoom to Fit
- Rubber-band drag: drags blue selection rect; releases selects all intersecting devices
- `Delete` key deletes selected device; `Ctrl+Z` restores it
- `Ctrl+A` selects all; `Escape` deselects all
- Hover a connected port: tooltip shows port name, type, speed, connected-to device + port
- Hover an unconnected port: tooltip shows "Not connected"
- Lock a device: cannot drag or delete it; padlock icon visible
