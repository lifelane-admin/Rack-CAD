# Sub-Project B: Canvas Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six canvas interaction improvements: Ctrl+Drag clone, right-click context menu wiring, rubber-band multi-select, keyboard shortcuts, port hover tooltips, and direction-aware cable preview.

**Architecture:** `src/utils/clone.ts` (new) handles device deep-copy. `src/components/tooltip.ts` (new) handles port hover display. `src/app.ts` gets new event handlers for all interactions. `src/renderers/cable-renderer.ts` gets direction-aware preview path. All interactions emit through the existing eventBus and push to the undo/redo stack.

**Tech Stack:** TypeScript 6, Vite 8, SVG canvas, vitest.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/utils/clone.ts` | Create | `cloneDevice(device)` deep-copy with new UUIDs |
| `src/components/tooltip.ts` | Create | Port hover tooltip component |
| `src/styles/tooltip.css` | Create | Tooltip styles |
| `src/core/types.ts` | Modify | Add `locked?: boolean` to `DeviceData` |
| `src/app.ts` | Modify | Wire Ctrl+drag, rubber-band, keyboard shortcuts, context menu items |
| `src/renderers/cable-renderer.ts` | Modify | Direction-aware cable preview |
| `src/renderers/device-renderer.ts` | Modify | Render lock icon when `device.locked` |
| `src/utils/routing.ts` | Modify | Export `getExitDirection` helper |
| `src/__tests__/clone.test.ts` | Create | Clone tests: new IDs, cleared connections |
| `src/__tests__/canvas-interactions.test.ts` | Create | Tests for getExitDirection |

---

## Task 1: Add `locked` field to DeviceData and create clone utility

**Files:**
- Modify: `src/core/types.ts:53-65`
- Create: `src/utils/clone.ts`
- Create: `src/__tests__/clone.test.ts`

- [ ] **Step 1: Write the failing clone tests**

Create `src/__tests__/clone.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cloneDevice } from '../utils/clone';
import { DeviceData } from '../core/types';

const baseDevice: DeviceData = {
  id: 'dev-original',
  templateId: 'server-2u',
  rackId: 'rack-1',
  startUnit: 5,
  name: 'My Server',
  hostname: 'server-01',
  managementIp: '10.0.0.1',
  serialNumber: 'ABC123',
  description: 'Test server',
  ports: [
    { id: 'orig-port-1', deviceId: 'dev-original', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 15, connected: true, cableId: 'cable-abc' },
    { id: 'orig-port-2', deviceId: 'dev-original', name: 'NIC 2', type: 'sfp-plus', relativeX: 332, relativeY: 15, connected: false, cableId: null },
  ],
};

describe('cloneDevice', () => {
  it('returns a new object (not the same reference)', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone).not.toBe(baseDevice);
  });

  it('assigns a different device id', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.id).not.toBe(baseDevice.id);
    expect(clone.id.length).toBeGreaterThan(0);
  });

  it('appends -copy to hostname', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.hostname).toBe('server-01-copy');
  });

  it('assigns new UUIDs to all ports', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.ports[0].id).not.toBe(baseDevice.ports[0].id);
    expect(clone.ports[1].id).not.toBe(baseDevice.ports[1].id);
  });

  it('sets port deviceId to the new clone id', () => {
    const clone = cloneDevice(baseDevice);
    clone.ports.forEach(p => expect(p.deviceId).toBe(clone.id));
  });

  it('clears cable connections on all ports', () => {
    const clone = cloneDevice(baseDevice);
    clone.ports.forEach(p => {
      expect(p.connected).toBe(false);
      expect(p.cableId).toBeNull();
    });
  });

  it('copies all non-id fields (templateId, rackId, startUnit, etc.)', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.templateId).toBe(baseDevice.templateId);
    expect(clone.rackId).toBe(baseDevice.rackId);
    expect(clone.startUnit).toBe(baseDevice.startUnit);
    expect(clone.name).toBe(baseDevice.name);
    expect(clone.description).toBe(baseDevice.description);
  });
});
```

Run: `npm run test -- clone`
Expected: FAIL — module not found.

- [ ] **Step 2: Add `locked?: boolean` to `DeviceData` in `src/core/types.ts`**

After line 65 (`description: string;`), add:
```typescript
  locked?: boolean;
```

So the interface reads:
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
}
```

- [ ] **Step 3: Create `src/utils/clone.ts`**

```typescript
import { DeviceData } from '../core/types';

export function cloneDevice(device: DeviceData): DeviceData {
  const newId = crypto.randomUUID();
  return {
    ...device,
    id: newId,
    hostname: device.hostname + '-copy',
    locked: false,
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

- [ ] **Step 4: Run tests**

Run: `npm run test -- clone`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/utils/clone.ts src/__tests__/clone.test.ts
git commit -m "feat(clone): add cloneDevice utility and locked field to DeviceData"
```

---

## Task 2: Export `getExitDirection` from routing.ts

**Files:**
- Modify: `src/utils/routing.ts`
- Create: `src/__tests__/canvas-interactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/canvas-interactions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getExitDirection } from '../utils/routing';
import { Point } from '../core/types';

describe('getExitDirection', () => {
  const src: Point = { x: 100, y: 100 };

  it('returns right when mouse is clearly to the right', () => {
    expect(getExitDirection(src, { x: 200, y: 105 })).toBe('right');
  });

  it('returns left when mouse is clearly to the left', () => {
    expect(getExitDirection(src, { x: 0, y: 105 })).toBe('left');
  });

  it('returns down when mouse is clearly below', () => {
    expect(getExitDirection(src, { x: 105, y: 200 })).toBe('down');
  });

  it('returns up when mouse is clearly above', () => {
    expect(getExitDirection(src, { x: 105, y: 0 })).toBe('up');
  });

  it('prefers horizontal when dx > dy (diagonal)', () => {
    // dx=50, dy=30 → horizontal wins → right
    expect(getExitDirection(src, { x: 150, y: 130 })).toBe('right');
  });

  it('prefers vertical when dy > dx (diagonal)', () => {
    // dx=30, dy=50 → vertical wins → down
    expect(getExitDirection(src, { x: 130, y: 150 })).toBe('down');
  });
});
```

Run: `npm run test -- canvas-interactions`
Expected: FAIL — `getExitDirection` not exported.

- [ ] **Step 2: Add `getExitDirection` to `src/utils/routing.ts`**

Append the following function to the end of `src/utils/routing.ts` (after all existing functions):

```typescript
export function getExitDirection(
  sourcePos: Point,
  mousePos: Point,
): 'up' | 'down' | 'left' | 'right' {
  const dx = mousePos.x - sourcePos.x;
  const dy = mousePos.y - sourcePos.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- canvas-interactions`
Expected: All 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/routing.ts src/__tests__/canvas-interactions.test.ts
git commit -m "feat(routing): export getExitDirection helper for direction-aware cable preview"
```

---

## Task 3: Direction-aware cable preview in cable-renderer.ts

**Files:**
- Modify: `src/renderers/cable-renderer.ts`

The in-progress cable preview is rendered by `renderCableInProgress`. Currently it uses a fixed exit direction. We need to compute exit direction from the mouse vector, with 8px hysteresis to avoid jitter.

- [ ] **Step 1: Locate `renderCableInProgress` in `src/renderers/cable-renderer.ts`**

Find the function signature and body. Read its current implementation to understand how to integrate the directional exit.

- [ ] **Step 2: Update `renderCableInProgress` to use direction-aware exit**

At the top of `cable-renderer.ts`, add the import:
```typescript
import { getExitDirection } from '../utils/routing';
```

Find `renderCableInProgress` and modify its preview path computation. The function already has access to `sourcePos` and `currentPoint`. Add a module-level variable to track the last stable direction (for hysteresis):

```typescript
// Direction-aware preview state (module-level for hysteresis)
let _previewDirection: 'up' | 'down' | 'left' | 'right' = 'right';
let _previewDirLockPos: Point | null = null;
const HYSTERESIS_PX = 8;
```

Inside `renderCableInProgress`, before building the path, add:
```typescript
// Compute direction-aware exit with hysteresis
const rawDir = getExitDirection(sourcePos, currentPoint);
if (_previewDirLockPos === null) {
  _previewDirection = rawDir;
  _previewDirLockPos = currentPoint;
} else {
  const dx = Math.abs(currentPoint.x - _previewDirLockPos.x);
  const dy = Math.abs(currentPoint.y - _previewDirLockPos.y);
  if (dx > HYSTERESIS_PX || dy > HYSTERESIS_PX) {
    _previewDirection = rawDir;
    _previewDirLockPos = currentPoint;
  }
}
const exitOffset = 18;
let exitPoint: Point;
switch (_previewDirection) {
  case 'up':    exitPoint = { x: sourcePos.x, y: sourcePos.y - exitOffset }; break;
  case 'down':  exitPoint = { x: sourcePos.x, y: sourcePos.y + exitOffset }; break;
  case 'left':  exitPoint = { x: sourcePos.x - exitOffset, y: sourcePos.y }; break;
  case 'right': exitPoint = { x: sourcePos.x + exitOffset, y: sourcePos.y }; break;
}
```

Then use `exitPoint` as the first waypoint in the preview path (between `sourcePos` and `currentPoint`). Replace the existing preview path construction to route from `sourcePos` → `exitPoint` → `currentPoint` using the existing `generateOrthogonalPath` or a simple polyline.

When the cable-in-progress is cancelled (null `cableInProgress` state), reset the direction state:
```typescript
// Reset on new cable start
export function resetPreviewDirection(): void {
  _previewDirection = 'right';
  _previewDirLockPos = null;
}
```

Call `resetPreviewDirection()` in `app.ts` wherever `cableInProgress` is set to null.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 4: Visual check**

In browser, start routing a cable from any port. Move the mouse upward — the preview dotted line should exit the port upward. Move left — exits left. Diagonal near 45° should not jitter between directions.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/cable-renderer.ts
git commit -m "feat(cables): direction-aware cable preview follows mouse exit direction"
```

---

## Task 4: Port hover tooltip

**Files:**
- Create: `src/components/tooltip.ts`
- Create: `src/styles/tooltip.css`
- Modify: `src/app.ts` (subscribe to `port:hover`)
- Modify: `src/main.ts` or wherever CSS is imported

- [ ] **Step 1: Create `src/styles/tooltip.css`**

```css
#port-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  display: none;
  background: #1b1b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 8px 10px;
  min-width: 160px;
  max-width: 240px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: #c9d1d9;
  line-height: 1.5;
}

#port-tooltip .tooltip-port-name {
  font-weight: 600;
  color: #58a6ff;
  margin-bottom: 4px;
}

#port-tooltip .tooltip-port-meta {
  font-size: 10px;
  color: #8b949e;
  margin-bottom: 4px;
}

#port-tooltip .tooltip-connected {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

#port-tooltip .tooltip-connected .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

#port-tooltip .tooltip-connected .dot.connected {
  background: #00e676;
  box-shadow: 0 0 4px #00e676;
}

#port-tooltip .tooltip-connected .dot.disconnected {
  background: #555;
}
```

- [ ] **Step 2: Create `src/components/tooltip.ts`**

```typescript
import { stateManager } from '../core/state';

export class PortTooltip {
  private el: HTMLElement;
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'port-tooltip';
    document.body.appendChild(this.el);
  }

  show(portId: string, screenX: number, screenY: number): void {
    const state = stateManager.getState();

    let targetPort = null;
    let targetDevice = null;
    for (const device of state.devices) {
      const port = device.ports.find(p => p.id === portId);
      if (port) { targetPort = port; targetDevice = device; break; }
    }

    if (!targetPort || !targetDevice) return;

    let connectedToText = '';
    let cableTypeText = '';
    let cableColorHex = '#555';

    if (targetPort.connected && targetPort.cableId) {
      const cable = state.cables.find(c => c.id === targetPort.cableId);
      if (cable) {
        cableTypeText = cable.type;
        cableColorHex = cable.color;
        const otherPortId = cable.sourcePortId === portId ? cable.destPortId : cable.sourcePortId;
        if (otherPortId) {
          for (const dev of state.devices) {
            const otherPort = dev.ports.find(p => p.id === otherPortId);
            if (otherPort) {
              connectedToText = `${dev.name} : ${otherPort.name}`;
              break;
            }
          }
        }
      }
    }

    const portTypeLabel = `${targetPort.type.toUpperCase()}${targetPort.speed ? ' · ' + targetPort.speed : ''}`;

    this.el.innerHTML = `
      <div class="tooltip-port-name">${targetPort.name}</div>
      <div class="tooltip-port-meta">${portTypeLabel}</div>
      <div class="tooltip-connected">
        <span class="dot ${targetPort.connected ? 'connected' : 'disconnected'}"></span>
        ${targetPort.connected
          ? `<span>Connected via <strong style="color:${cableColorHex}">${cableTypeText}</strong><br>→ ${connectedToText || 'Unknown'}</span>`
          : `<span style="color:#666">Not connected</span>`
        }
      </div>
    `;

    // Position: 12px right of cursor, flip left if near right edge
    const tooltipW = 200;
    let px = screenX + 12;
    if (px + tooltipW > window.innerWidth - 10) {
      px = screenX - tooltipW - 12;
    }

    this.el.style.display = 'block';
    this.el.style.left = `${px}px`;
    this.el.style.top = `${screenY - 10}px`;
    this.visible = true;
  }

  hide(): void {
    this.el.style.display = 'none';
    this.visible = false;
  }
}
```

- [ ] **Step 3: Import tooltip CSS in `src/app.ts`**

Add at the top of `src/app.ts` with the other style imports:
```typescript
import '../styles/tooltip.css';
```

- [ ] **Step 4: Wire tooltip in `src/app.ts`**

In the `init()` method, after existing component initialization, add:
```typescript
import { PortTooltip } from './components/tooltip';

// In init():
const portTooltip = new PortTooltip();

// Subscribe to port hover events
eventBus.on('port:hover', (portId: string | null) => {
  if (!portId) {
    portTooltip.hide();
  } else {
    // Get current mouse screen position from the last known mouse event
    portTooltip.show(portId, this.lastMouseScreenX, this.lastMouseScreenY);
  }
});
```

Add `lastMouseScreenX` and `lastMouseScreenY` as private fields on the App class, and update them in the canvas `mousemove` handler:
```typescript
private lastMouseScreenX = 0;
private lastMouseScreenY = 0;
```

In the existing mousemove canvas handler, add:
```typescript
this.lastMouseScreenX = e.clientX;
this.lastMouseScreenY = e.clientY;
```

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

- [ ] **Step 6: Visual check**

In browser, hover over any port on a device. After ~100ms, a tooltip should appear showing the port name, type, speed, and connection status.

- [ ] **Step 7: Commit**

```bash
git add src/components/tooltip.ts src/styles/tooltip.css src/app.ts
git commit -m "feat(tooltip): add port hover tooltip showing port name, type, speed, connection"
```

---

## Task 5: Keyboard shortcuts

**Files:**
- Modify: `src/app.ts`
- Modify: `src/utils/clone.ts` (may need clipboard state)

The existing `app.ts` may already handle some keyboard events. We add a comprehensive `keydown` listener that fires only when focus is not in a text input.

- [ ] **Step 1: Add clipboard state and keyboard handler in `src/app.ts`**

Add a module-level clipboard variable inside the App class:
```typescript
private clipboard: DeviceData | null = null;
```

Add a `registerKeyboardShortcuts()` method on the App class and call it from `init()`:

```typescript
private registerKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Don't fire when typing in an input or textarea
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const state = stateManager.getState();
    const selection = state.selection;

    // Delete / Backspace — delete selected items
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      selection.forEach(item => {
        if (item.type === 'device') {
          const dev = stateManager.getDevice(item.id);
          if (dev?.locked) return;
          stateManager.removeDevice(item.id);
        } else if (item.type === 'cable') {
          stateManager.setState({
            cables: state.cables.filter(c => c.id !== item.id)
          });
        } else if (item.type === 'rack') {
          stateManager.removeRack(item.id);
        }
      });
      stateManager.setState({ selection: [] });
      eventBus.emit('selection:changed', []);
    }

    // Escape — clear selection, dismiss cable-in-progress
    else if (e.key === 'Escape') {
      stateManager.setState({ selection: [], cableInProgress: null });
      eventBus.emit('selection:changed', []);
    }

    // Ctrl+A — select all devices and cables
    else if (e.ctrlKey && e.key === 'a') {
      e.preventDefault();
      const allSelection = [
        ...state.devices.map(d => ({ type: 'device' as const, id: d.id })),
        ...state.cables.map(c => ({ type: 'cable' as const, id: c.id })),
      ];
      stateManager.setState({ selection: allSelection });
      eventBus.emit('selection:changed', allSelection);
    }

    // Ctrl+C — copy selected device to clipboard
    else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      const devSel = selection.find(s => s.type === 'device');
      if (devSel) {
        this.clipboard = stateManager.getDevice(devSel.id) ?? null;
      }
    }

    // Ctrl+X — cut selected device
    else if (e.ctrlKey && e.key === 'x') {
      e.preventDefault();
      const devSel = selection.find(s => s.type === 'device');
      if (devSel) {
        const dev = stateManager.getDevice(devSel.id);
        if (dev && !dev.locked) {
          this.clipboard = dev;
          stateManager.removeDevice(devSel.id);
          stateManager.setState({ selection: [] });
          eventBus.emit('selection:changed', []);
        }
      }
    }

    // Ctrl+V — paste from clipboard
    else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      if (this.clipboard) {
        const cloned = cloneDevice(this.clipboard);
        // Place at startUnit + 1 if available, else next available
        const rack = stateManager.getRack(cloned.rackId);
        if (rack) {
          const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
          if (nextRU !== null) cloned.startUnit = nextRU;
        }
        stateManager.addDevice(cloned);
        stateManager.setState({ selection: [{ type: 'device', id: cloned.id }] });
        eventBus.emit('selection:changed', [{ type: 'device', id: cloned.id }]);
      }
    }

    // Ctrl+D — duplicate selected device at +1 RU
    else if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      const devSel = selection.find(s => s.type === 'device');
      if (devSel) {
        const dev = stateManager.getDevice(devSel.id);
        if (dev) {
          const cloned = cloneDevice(dev);
          const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
          if (nextRU !== null) cloned.startUnit = nextRU;
          stateManager.addDevice(cloned);
          stateManager.setState({ selection: [{ type: 'device', id: cloned.id }] });
          eventBus.emit('selection:changed', [{ type: 'device', id: cloned.id }]);
        }
      }
    }

    // Ctrl+Z — undo (already handled by history manager, but add eventBus path)
    else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      eventBus.emit('history:undo', undefined as any);
    }

    // Ctrl+Y or Ctrl+Shift+Z — redo
    else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      eventBus.emit('history:redo', undefined as any);
    }

    // Arrow keys — nudge selected rack
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const rackSel = selection.find(s => s.type === 'rack');
      if (rackSel) {
        e.preventDefault();
        const rack = stateManager.getRack(rackSel.id);
        if (rack) {
          const step = e.shiftKey ? 10 : 1;
          let { x, y } = rack;
          if (e.key === 'ArrowLeft') x -= step;
          if (e.key === 'ArrowRight') x += step;
          if (e.key === 'ArrowUp') y -= step;
          if (e.key === 'ArrowDown') y += step;
          eventBus.emit('rack:update', { id: rackSel.id, data: { x, y } });
        }
      }
    }

    // Ctrl+0 — zoom to fit
    else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      this.canvas.zoomToFit();
    }
  });
}
```

Make sure to add these imports at the top of `app.ts` (they may already exist):
```typescript
import { cloneDevice } from './utils/clone';
import { getTemplate } from './library/device-catalog';
```

Call `this.registerKeyboardShortcuts()` at the end of `init()`.

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 3: Visual check**

- Select a device, press `Delete` → device removed
- Press `Ctrl+Z` → device restored  
- Select all with `Ctrl+A` → all highlighted
- Press `Escape` → selection cleared
- Select a device, `Ctrl+C`, then `Ctrl+V` → duplicate appears
- Select a rack, press `ArrowRight` → rack moves 1px right

- [ ] **Step 4: Commit**

```bash
git add src/app.ts src/utils/clone.ts
git commit -m "feat(shortcuts): add keyboard shortcuts (Delete, Ctrl+A/C/X/V/D/Z/Y, Arrow)"
```

---

## Task 6: Ctrl+Drag to clone devices

**Files:**
- Modify: `src/app.ts` (drag handler)

- [ ] **Step 1: Add cloning mode state to App class**

In `src/app.ts`, add new private fields to the App class alongside existing drag state:
```typescript
private cloningMode = false;
private cloneThresholdMet = false;
private dragOriginalDevice: DeviceData | null = null;
```

- [ ] **Step 2: Update the `mousedown` handler for devices**

In the canvas `mousedown` handler where device drag is initiated (look for `isDraggingDevice = true` assignment), add Ctrl key detection:

```typescript
// When a device is clicked with Ctrl held
if (e.ctrlKey && hitDevice && !hitDevice.locked) {
  this.cloningMode = true;
  this.cloneThresholdMet = false;
  this.dragOriginalDevice = hitDevice;
  // Don't start drag yet — wait for threshold
}
```

- [ ] **Step 3: Update the `mousemove` handler**

In the canvas `mousemove` handler, when `cloningMode` is true and drag threshold (4px) is exceeded:

```typescript
if (this.cloningMode && !this.cloneThresholdMet && this.dragOriginalDevice) {
  const dx = Math.abs(worldPos.x - this.dragStartWorldPos.x);
  const dy = Math.abs(worldPos.y - this.dragStartWorldPos.y);
  if (dx > 4 || dy > 4) {
    this.cloneThresholdMet = true;
    // Create the clone and start dragging it
    const clone = cloneDevice(this.dragOriginalDevice);
    stateManager.addDevice(clone);
    // Begin dragging the clone
    this.isDraggingDevice = true;
    this.draggedDeviceId = clone.id;
    this.dragStartWorldPos = worldPos;
    this.dragStartUnit = clone.startUnit;
    this.dragStartRackId = clone.rackId;
    // Visually mark the clone element as semi-transparent
    const cloneEl = document.querySelector(`[data-device-id="${clone.id}"]`) as SVGGElement | null;
    if (cloneEl) cloneEl.style.opacity = '0.7';
    stateManager.setState({ selection: [{ type: 'device', id: clone.id }] });
    eventBus.emit('selection:changed', [{ type: 'device', id: clone.id }]);
  }
}
```

- [ ] **Step 4: Update the `mouseup` handler**

On `mouseup`, reset cloning state and restore opacity:

```typescript
if (this.cloningMode) {
  this.cloningMode = false;
  this.cloneThresholdMet = false;
  this.dragOriginalDevice = null;
  // Restore full opacity
  if (this.draggedDeviceId) {
    const cloneEl = document.querySelector(`[data-device-id="${this.draggedDeviceId}"]`) as SVGGElement | null;
    if (cloneEl) cloneEl.style.opacity = '1';
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: All pass (no new tests for this — it's interaction behavior, tested visually).

- [ ] **Step 6: Visual check**

Hold `Ctrl`, drag a device. A semi-transparent clone should appear and follow the mouse. On release, the clone is placed. The original stays in place. Press `Ctrl+Z` → both the original and clone revert (or the clone is removed depending on history snapshot timing).

- [ ] **Step 7: Commit**

```bash
git add src/app.ts
git commit -m "feat(canvas): Ctrl+Drag to clone devices with 70% opacity preview"
```

---

## Task 7: Right-click context menu wiring

**Files:**
- Modify: `src/app.ts`

The `ContextMenu` component already exists in `src/components/context-menu.ts`. The `canvas:rightclick` event is already emitted. We wire up the menu items for device, cable, rack, and empty canvas targets.

- [ ] **Step 1: Wire context menu in `src/app.ts`**

Find where `canvas:rightclick` is handled (or add a listener if missing). Replace or augment with full menu content:

```typescript
eventBus.on('canvas:rightclick', ({ point, target, screenPoint }) => {
  const state = stateManager.getState();
  const sx = screenPoint?.x ?? point.x;
  const sy = screenPoint?.y ?? point.y;

  if (target?.type === 'device') {
    const devId = target.id;
    const dev = stateManager.getDevice(devId);
    if (!dev) return;

    this.contextMenu.show(sx, sy, [
      { label: 'Cut',    shortcut: 'Ctrl+X', action: () => { this.clipboard = dev; stateManager.removeDevice(devId); stateManager.setState({ selection: [] }); eventBus.emit('selection:changed', []); } },
      { label: 'Copy',   shortcut: 'Ctrl+C', action: () => { this.clipboard = dev; } },
      { label: 'Paste',  shortcut: 'Ctrl+V', disabled: !this.clipboard, action: () => { if (this.clipboard) { const c = cloneDevice(this.clipboard); stateManager.addDevice(c); } } },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => { const c = cloneDevice(dev); const ru = stateManager.getNextAvailableRU(c.rackId, getTemplate(c.templateId)?.heightUnits ?? 1); if (ru !== null) c.startUnit = ru; stateManager.addDevice(c); } },
      { separator: true, label: '', action: () => {} },
      { label: 'Delete', shortcut: 'Del', disabled: !!dev.locked, action: () => { stateManager.removeDevice(devId); stateManager.setState({ selection: [] }); eventBus.emit('selection:changed', []); } },
      { separator: true, label: '', action: () => {} },
      { label: dev.locked ? 'Unlock' : 'Lock', action: () => { eventBus.emit('device:update', { id: devId, data: { locked: !dev.locked } }); } },
    ]);

  } else if (target?.type === 'cable') {
    const cableId = target.id;
    this.contextMenu.show(sx, sy, [
      { label: 'Edit Cable Type', action: () => { stateManager.setState({ selection: [{ type: 'cable', id: cableId }] }); eventBus.emit('selection:changed', [{ type: 'cable', id: cableId }]); } },
      { separator: true, label: '', action: () => {} },
      { label: 'Delete', shortcut: 'Del', action: () => { stateManager.setState({ cables: state.cables.filter(c => c.id !== cableId), selection: [] }); eventBus.emit('selection:changed', []); } },
    ]);

  } else if (target?.type === 'rack') {
    const rackId = target.id;
    this.contextMenu.show(sx, sy, [
      { label: 'Edit Rack Name', action: () => { const r = stateManager.getRack(rackId); if (r) { const name = prompt('Rack name:', r.name); if (name) eventBus.emit('rack:update', { id: rackId, data: { name } }); } } },
      { separator: true, label: '', action: () => {} },
      { label: 'Delete Rack', action: () => { stateManager.removeRack(rackId); } },
    ]);

  } else {
    // Empty canvas
    this.contextMenu.show(sx, sy, [
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !this.clipboard, action: () => { if (this.clipboard) { const c = cloneDevice(this.clipboard); stateManager.addDevice(c); } } },
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => { const allSel = [...state.devices.map(d => ({ type: 'device' as const, id: d.id })), ...state.cables.map(c => ({ type: 'cable' as const, id: c.id }))]; stateManager.setState({ selection: allSel }); eventBus.emit('selection:changed', allSel); } },
      { separator: true, label: '', action: () => {} },
      { label: 'Zoom to Fit', shortcut: 'Ctrl+0', action: () => { this.canvas.zoomToFit(); } },
    ]);
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 3: Visual check**

- Right-click a device → menu shows Cut/Copy/Paste/Duplicate/Delete/Lock
- Right-click a cable → menu shows Edit/Delete
- Right-click empty canvas → Paste/Select All/Zoom to Fit

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "feat(context-menu): wire right-click menu for device, cable, rack, empty canvas"
```

---

## Task 8: Rubber-band multi-select

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Add rubber-band state to App class**

```typescript
private isRubberBanding = false;
private rubberBandStart: Point = { x: 0, y: 0 };
private rubberBandEl: SVGRectElement | null = null;
```

- [ ] **Step 2: Add rubber-band to mousedown handler**

In the canvas `mousedown` handler, after checking for device/cable/rack hits (when nothing is hit):

```typescript
// Start rubber-band if clicking on empty canvas with no hit target
if (!hitDevice && !hitCable && !hitRack && state.tool === 'select') {
  this.isRubberBanding = true;
  this.rubberBandStart = worldPos;

  // Create selection rect SVG element
  const svgEl = document.getElementById('canvas') as SVGSVGElement | null;
  if (svgEl) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'selection-rect';
    rect.setAttribute('fill', 'rgba(88,166,255,0.08)');
    rect.setAttribute('stroke', '#58a6ff');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('stroke-dasharray', '4,2');
    rect.setAttribute('pointer-events', 'none');
    svgEl.appendChild(rect);
    this.rubberBandEl = rect;
  }
}
```

- [ ] **Step 3: Update mousemove handler for rubber-band**

```typescript
if (this.isRubberBanding && this.rubberBandEl) {
  const x = Math.min(worldPos.x, this.rubberBandStart.x);
  const y = Math.min(worldPos.y, this.rubberBandStart.y);
  const w = Math.abs(worldPos.x - this.rubberBandStart.x);
  const h = Math.abs(worldPos.y - this.rubberBandStart.y);
  this.rubberBandEl.setAttribute('x', String(x));
  this.rubberBandEl.setAttribute('y', String(y));
  this.rubberBandEl.setAttribute('width', String(w));
  this.rubberBandEl.setAttribute('height', String(h));
}
```

- [ ] **Step 4: Update mouseup handler for rubber-band**

```typescript
if (this.isRubberBanding) {
  this.isRubberBanding = false;
  this.rubberBandEl?.remove();
  this.rubberBandEl = null;

  // Find all devices whose bounding rect intersects the rubber-band
  const selX = Math.min(worldPos.x, this.rubberBandStart.x);
  const selY = Math.min(worldPos.y, this.rubberBandStart.y);
  const selW = Math.abs(worldPos.x - this.rubberBandStart.x);
  const selH = Math.abs(worldPos.y - this.rubberBandStart.y);

  const state = stateManager.getState();
  const selected: SelectableItem[] = [];

  state.devices.forEach(dev => {
    const rack = stateManager.getRack(dev.rackId);
    if (!rack) return;
    const template = getTemplate(dev.templateId);
    const hU = template?.heightUnits ?? 1;
    const RACK_CONSTANTS_import = { RU_HEIGHT: 30, RACK_OUTER_WIDTH: 450, RACK_INNER_WIDTH: 400, RACK_PADDING_TOP: 30, RAIL_WIDTH: 25 };
    const deviceX = rack.x + (RACK_CONSTANTS_import.RACK_OUTER_WIDTH - RACK_CONSTANTS_import.RACK_INNER_WIDTH) / 2 + RACK_CONSTANTS_import.RAIL_WIDTH;
    const deviceY = rack.y + RACK_CONSTANTS_import.RACK_PADDING_TOP + (rack.units - dev.startUnit - hU + 1) * RACK_CONSTANTS_import.RU_HEIGHT;
    const deviceW = RACK_CONSTANTS_import.RACK_INNER_WIDTH - 2 * RACK_CONSTANTS_import.RAIL_WIDTH;
    const deviceH = hU * RACK_CONSTANTS_import.RU_HEIGHT;

    // AABB intersection
    const intersects = deviceX < selX + selW && deviceX + deviceW > selX && deviceY < selY + selH && deviceY + deviceH > selY;
    if (intersects) selected.push({ type: 'device', id: dev.id });
  });

  const newSelection = e.shiftKey ? [...state.selection, ...selected] : selected;
  stateManager.setState({ selection: newSelection });
  eventBus.emit('selection:changed', newSelection);
}
```

Note: Import `RACK_CONSTANTS` from `../core/types` instead of redefining — use `import { RACK_CONSTANTS } from './core/types'` (already imported in app.ts).

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 6: Visual check**

Click and drag on empty canvas area. A dashed blue rectangle should appear. On release, all devices within the rectangle are selected (highlighted).

- [ ] **Step 7: Commit**

```bash
git add src/app.ts
git commit -m "feat(canvas): rubber-band multi-select with SVG selection rect"
```

---

## Task 9: Lock icon in device renderer

**Files:**
- Modify: `src/renderers/device-renderer.ts`

- [ ] **Step 1: Add lock icon rendering**

In `renderDevice`, after the main panel body is rendered (after the `} else {` panel-renderer call), add the lock icon overlay:

```typescript
// Lock icon overlay
if (device.locked) {
  const lockGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  lockGroup.setAttribute('pointer-events', 'none');
  // Background badge
  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  badge.setAttribute('x', '4');
  badge.setAttribute('y', '4');
  badge.setAttribute('width', '14');
  badge.setAttribute('height', '14');
  badge.setAttribute('rx', '2');
  badge.setAttribute('fill', 'rgba(0,0,0,0.6)');
  lockGroup.appendChild(badge);
  // Lock body
  const lockBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  lockBody.setAttribute('x', '6');
  lockBody.setAttribute('y', '9');
  lockBody.setAttribute('width', '10');
  lockBody.setAttribute('height', '7');
  lockBody.setAttribute('rx', '1');
  lockBody.setAttribute('fill', '#fb8c00');
  lockGroup.appendChild(lockBody);
  // Lock shackle arc
  const shackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shackle.setAttribute('d', 'M 8 9 L 8 7 A 3 3 0 0 1 14 7 L 14 9');
  shackle.setAttribute('fill', 'none');
  shackle.setAttribute('stroke', '#fb8c00');
  shackle.setAttribute('stroke-width', '1.5');
  shackle.setAttribute('stroke-linecap', 'round');
  lockGroup.appendChild(shackle);
  deviceGroup.appendChild(lockGroup);
}
```

- [ ] **Step 2: Prevent drag for locked devices**

In the App class `mousedown` handler, where device dragging begins:
```typescript
if (hitDevice?.locked) return; // Can't drag locked devices
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 4: Visual check**

Right-click a device → Lock → device shows orange padlock icon in top-left. Attempt to drag → device doesn't move. Right-click → Unlock → icon disappears, device draggable again.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/device-renderer.ts src/app.ts
git commit -m "feat(device): render padlock icon for locked devices, prevent drag when locked"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Ctrl+Drag clone (Task 6) — new UUIDs, 70% opacity, pushes to history via addDevice
- ✅ Right-click context menu (Task 7) — device/cable/rack/empty targets with correct items
- ✅ Clipboard is module-level (class field) not AppState (Task 7)
- ✅ Rubber-band multi-select (Task 8) — SVG rect `id="selection-rect"`, shift-append
- ✅ Keyboard shortcuts (Task 5) — all keys from spec table
- ✅ Arrow keys nudge only racks (Task 5)
- ✅ Port hover tooltips (Task 4) — shows portName, portType, speed, connected, connectedTo
- ✅ Lock/Unlock (Task 9 + Task 7) — `locked` field, padlock icon, drag prevention
- ✅ Direction-aware cable preview (Task 3) — 8px hysteresis, exit straight segment
- ✅ `getExitDirection` exported from routing.ts (Task 2)
- ✅ `cloneDevice` in separate `src/utils/clone.ts` (Task 1)

**Type consistency:** `cloneDevice` accepts and returns `DeviceData` throughout Tasks 1, 5, 6, 7.
