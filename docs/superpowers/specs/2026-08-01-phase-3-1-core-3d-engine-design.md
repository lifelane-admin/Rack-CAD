# Phase 3.1 — Core 3D Engine Design

**Date:** 2026-08-01
**Status:** Approved

---

## Vision

Add a live, navigable 3D viewport to Rack Slicer that runs side-by-side with the existing 2D SVG canvas. The 3D scene is generated procedurally from the existing `AppState` — 2D remains the single source of truth. No existing code is modified beyond adding two divs to `index.html` and one instantiation in `app.ts`.

---

## Decisions

| Question | Decision |
|---|---|
| Framework | Pure Three.js — no React, no R3F, no Drei |
| Layout | Side-by-side split — 2D left, 3D right, draggable splitter |
| Visual quality | Full stack: PBR + HDRI + ACES + SSAO + SSR + Bloom |
| Architecture | Manager-per-concern — matches existing codebase pattern |

---

## Architecture

### Module Map

```
Existing (untouched)
  stateManager       — AppState, RackData, DeviceData, CableData
  eventBus           — state:changed, rack:added, device:moved, ...
  CanvasManager      — 2D SVG rendering pipeline
  Toolbar / Sidebar / Properties

New — src/three/
  ThreeViewport          — orchestrator
  SceneManager           — scene graph, rack/device mesh map
  CameraManager          — PerspectiveCamera, OrbitControls, presets
  MaterialManager        — PBR material library (shared instances)
  AssetManager           — HDRI loading, LoadingManager
  PostProcessingManager  — EffectComposer, SSAO, SSR, Bloom, ACES
  rack-builder.ts        — RackData → THREE.Group (pure function)
  device-builder.ts      — DeviceData → THREE.Mesh (pure function)
```

### UI Layout

```
[sidebar] | [#canvas-2d (SVG)] [splitter] [#canvas-3d (WebGL)] | [properties]
```

The existing `#canvas-viewport` div becomes the left half. A new `#canvas-3d` div is inserted alongside it. Both are `flex: 1; min-width: 0` children of `#canvas-container`. `ThreeViewport` mounts `WebGLRenderer.domElement` into `#canvas-3d`.

---

## Manager Responsibilities

### ThreeViewport
- Owns: `WebGLRenderer`, animation loop (`requestAnimationFrame`), `ResizeObserver`
- Exposes: `mount(container: HTMLElement)`, `destroy()`, `sync(state: AppState)`
- Wires: instantiates all managers; subscribes to `eventBus.on('state:changed', debounce(this.sync, 100))`
- On destroy: calls `dispose()` on renderer, geometries, materials, textures — no memory leaks

### SceneManager
- Owns: `THREE.Scene`, `rackGroups: Map<string, THREE.Group>`, `deviceMeshes: Map<string, THREE.Mesh>`
- Exposes: `rebuild(state: AppState)` — diffs current scene against new state, adds/moves/removes objects surgically
- Builds: calls `rack-builder` and `device-builder` helpers
- Also owns: floor plane, hemisphere light, fog

### CameraManager
- Owns: `PerspectiveCamera`, `OrbitControls`
- Exposes: `setPreset(name: CameraPreset)` — animates camera to named position over 400 ms via lerp
- Presets: `'front' | 'rear' | 'left' | 'right' | 'top' | 'perspective'`
- Handles: canvas resize → updates `camera.aspect` + `camera.updateProjectionMatrix()` (renderer resize is handled by ThreeViewport.onResize)

### MaterialManager
- Owns: singleton `MeshStandardMaterial` instances, keyed by type or hex color
- Exposes: `get(type: string, color?: string): MeshStandardMaterial`
- Types: `'rack-frame'`, `'rail'`, `'floor'`, `'blank-panel'`; device materials are keyed by hex color and created on first request
- All materials are shared across meshes — no per-mesh material duplication

### AssetManager
- Owns: `THREE.LoadingManager`, HDRI `Texture` reference
- Exposes: `loadAll(): Promise<void>` — loads `public/hdri/datacenter.exr` via `EXRLoader`
- On load: sets `scene.environment` and `scene.background` via `PMREMGenerator`

### PostProcessingManager
- Owns: `EffectComposer` and all render passes
- Exposes: `render()` — called by `ThreeViewport` each frame instead of `renderer.render()`
- Handles: resize → updates composer and all passes
- Pass stack (in order):
  1. `RenderPass` — base scene
  2. `SSAOPass` — ambient occlusion (radius: 0.5, minDistance: 0.001, maxDistance: 0.1)
  3. `SSRPass` — screen-space reflections on floor plane
  4. `UnrealBloomPass` — LED glow / edge bloom (threshold: 0.85, strength: 0.4, radius: 0.3)
  5. `OutputPass` — ACES tone mapping + gamma correction

---

## Builder Functions

### rack-builder.ts
```ts
buildRackGroup(rack: RackData, materials: MaterialManager): THREE.Group
```
Constructs a Group containing:
- 4 vertical posts (`BoxGeometry`) at rack corners
- Top and bottom plates
- Inner bay volume (transparent `MeshStandardMaterial` with low opacity — gives the rack interior visible depth without blocking device slabs)
- RU tick marks on rails

All geometry uses `materials.get('rack-frame')` — a dark brushed-metal `MeshStandardMaterial` (metalness: 0.8, roughness: 0.4).

### device-builder.ts
```ts
buildDeviceMesh(device: DeviceData, template: DeviceTemplate, materials: MaterialManager): THREE.Mesh
```
Constructs a `BoxGeometry(RACK_INNER_WIDTH - 2*RAIL_WIDTH, heightUnits * RU_HEIGHT, 60)` positioned at the device's RU slot within the rack Group. Material: `materials.get('device', device.color)` — a `MeshStandardMaterial` with the device's 2D color, metalness: 0.3, roughness: 0.6.

---

## Data Flow

```
User edits 2D (drag device, add rack, etc.)
  → stateManager.setState(partial)
  → eventBus.emit('state:changed', partial)
  → ThreeViewport listener (debounced 100 ms)
  → ThreeViewport.sync(stateManager.getState())
    → shallow diff: did racks or devices change?
    → if yes: SceneManager.rebuild(state)
      → for each rack: add / move Group / remove + dispose
      → for each device: add / move Mesh / remove + dispose
    → if only selection changed: update material highlight only
    → if only theme/tool changed: no-op

Render loop (independent, always running):
  requestAnimationFrame → CameraManager.update() (OrbitControls)
                        → PostProcessingManager.render() (EffectComposer)
                        → frame on screen
```

The render loop and the sync pipeline are fully decoupled — the scene can be updated at any time and the next frame picks it up automatically.

---

## Splitter

Implemented as a `<div class="splitter">` between `#canvas-viewport` and `#canvas-3d`. A single `pointermove` handler tracks drag offset and applies it as a percentage split via CSS custom property `--split-left`. On resize, `ThreeViewport.onResize(w, h)` updates:
- `camera.aspect = w / h; camera.updateProjectionMatrix()`
- `renderer.setSize(w, h)`
- `composer.setSize(w, h)`
- All pass-specific size setters (SSAO, SSR)

---

## Dependencies

**Add to package.json:**
```json
"three": "^0.177.0"
```

Three.js bundles all required addons (`three/addons`): `OrbitControls`, `EffectComposer`, `RenderPass`, `SSAOPass`, `SSRPass`, `UnrealBloomPass`, `OutputPass`, `EXRLoader`. `PMREMGenerator` is part of Three.js core. No additional packages needed.

**New static asset:**
```
public/hdri/datacenter.exr   (~2 MB)
```
Served by Vite as a static file. Referenced as `/hdri/datacenter.exr` at runtime.

---

## File Checklist

| File | Action |
|---|---|
| `src/three/ThreeViewport.ts` | Create |
| `src/three/SceneManager.ts` | Create |
| `src/three/CameraManager.ts` | Create |
| `src/three/MaterialManager.ts` | Create |
| `src/three/AssetManager.ts` | Create |
| `src/three/PostProcessingManager.ts` | Create |
| `src/three/rack-builder.ts` | Create |
| `src/three/device-builder.ts` | Create |
| `src/styles/three-viewport.css` | Create |
| `public/hdri/datacenter.exr` | Add asset |
| `index.html` | Add `#canvas-3d` div + `.splitter` div inside `#canvas-container` |
| `src/app.ts` | Instantiate `ThreeViewport`, call `mount()`, call `sync()` on init |
| `package.json` | Add `three` dependency |

**Untouched:** `stateManager`, `eventBus`, `CanvasManager`, all renderers, all components, `AppState` type, `vite.config.ts`.

---

## Out of Scope (Later Phases)

- Parametric device geometry (Phase 3.2)
- Walk / fly / first-person camera (Phase 3.3)
- ViewCube (Phase 3.4)
- Move / rotate / scale gizmos (Phase 3.5)
- Rack door / server slide-out animations (Phase 3.6)
- Cables in 3D (Phase 3.7)
- Photorealistic material presets panel (Phase 3.8)
- GPU instancing, LOD, BVH raycasting (Phase 3.9)
- Offline HTML export (Phase 3.10)
- `.rsx` package format (Phase 3.11)
- Click-to-select devices in 3D (raycasting)

---

## Success Criteria

Phase 3.1 is complete when all of the following are true:

1. Loading the demo project shows 2D and 3D panels side by side
2. Adding a device in 2D appears in 3D within 100 ms
3. Moving a rack in 2D repositions it in 3D
4. All 6 camera presets work with smooth 400 ms animated transitions
5. Orbit (drag), pan (right-drag or middle-drag), and zoom (scroll) all work
6. HDRI environment renders; all device slabs show correct PBR shading
7. SSAO, SSR, Bloom, and ACES tone mapping are all active
8. The splitter is draggable and both panels resize correctly
9. 60 FPS sustained on the demo project (7 devices)
10. `destroy()` cleans up renderer, geometries, materials, and textures — verified by checking no Three.js objects remain in memory after unmount
