# Phase 3.1 — Core 3D Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Three.js 3D viewport that runs side-by-side with the existing 2D SVG canvas, driven by the existing `stateManager` and `eventBus`, with full PBR + HDRI + ACES + SSAO + SSR + Bloom postprocessing.

**Architecture:** Pure Three.js (no React). A `ThreeViewport` orchestrator mounts a WebGL canvas into a new `#canvas-3d` div that lives alongside the existing SVG in a flex-row split inside `#canvas-viewport`. Five manager classes own discrete concerns (scene graph, camera, materials, assets, postprocessing). `ThreeViewport` subscribes to `eventBus.on('state:changed')` (debounced 100 ms) and calls `SceneManager.rebuild()` to diff the Three.js scene against the new `AppState`.

**Tech Stack:** `three ^0.177.0` (includes all required addons). Vite + TypeScript (existing). Vitest + happy-dom (existing, Three.js mocked in tests). No React, no R3F, no Drei.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `three` dependency |
| `public/hdri/datacenter.exr` | Add asset | HDRI environment map (~2 MB EXR) |
| `index.html` | Modify | Add `.splitter-3d` + `#canvas-3d` inside `#canvas-viewport` |
| `src/styles/three-viewport.css` | Create | Split layout, splitter, #canvas-3d styles |
| `src/three/MaterialManager.ts` | Create | PBR MeshStandardMaterial cache keyed by type/color |
| `src/three/rack-builder.ts` | Create | `RackData → THREE.Group` (posts, plates, rails, bay) |
| `src/three/device-builder.ts` | Create | `DeviceData → THREE.Mesh` (BoxGeometry slab at RU slot) |
| `src/three/AssetManager.ts` | Create | EXRLoader → PMREMGenerator → scene.environment |
| `src/three/CameraManager.ts` | Create | PerspectiveCamera, OrbitControls, 6 animated presets |
| `src/three/PostProcessingManager.ts` | Create | EffectComposer: SSAOPass → SSRPass → UnrealBloomPass → OutputPass/ACES |
| `src/three/SceneManager.ts` | Create | THREE.Scene owner; rack/device map diff + rebuild |
| `src/three/ThreeViewport.ts` | Create | Orchestrator: render loop, sync, mount/destroy, splitter resize |
| `src/app.ts` | Modify | Instantiate ThreeViewport, add camera preset buttons |
| `src/__tests__/three/MaterialManager.test.ts` | Create | Cache logic tests |
| `src/__tests__/three/rack-builder.test.ts` | Create | Geometry dimension + group structure tests |
| `src/__tests__/three/device-builder.test.ts` | Create | Mesh dimensions + RU position tests |
| `src/__tests__/three/SceneManager.test.ts` | Create | Diff logic tests (add/move/remove) |
| `src/__tests__/three/CameraManager.test.ts` | Create | Preset position tests |

---

## Task 1: Install Three.js + HDRI Asset + HTML/CSS Split Layout

**Files:**
- Modify: `package.json`
- Add: `public/hdri/datacenter.exr`
- Modify: `index.html`
- Create: `src/styles/three-viewport.css`

- [ ] **Step 1.1: Install Three.js**

```bash
npm install three@^0.177.0
npm install --save-dev @types/three
```

Expected output: `three` appears in `package.json` dependencies.

- [ ] **Step 1.2: Download the HDRI asset**

Download a free CC0 2K EXR from Polyhaven (https://polyhaven.com/a/empty_warehouse_01 → "2K EXR" button).
Save it as `public/hdri/datacenter.exr`.

Verify it exists:
```bash
ls public/hdri/
# Should list: datacenter.exr
```

- [ ] **Step 1.3: Add the split layout HTML to `index.html`**

Locate this block in `index.html`:
```html
        <div id="canvas-viewport">
          <svg id="canvas"></svg>
        </div>
```

Replace with:
```html
        <div id="canvas-viewport">
          <svg id="canvas"></svg>
          <div class="splitter-3d" id="splitter-3d"></div>
          <div id="canvas-3d"></div>
        </div>
```

Also add the stylesheet import in `<head>` alongside the other CSS links:
```html
  <link rel="stylesheet" href="/src/styles/three-viewport.css" />
```

- [ ] **Step 1.4: Create `src/styles/three-viewport.css`**

```css
/* Split: make #canvas-viewport a flex row so 2D and 3D panels sit side by side */
#canvas-viewport {
  display: flex;
  flex-direction: row;
}

#canvas-viewport > svg#canvas {
  flex: 1;
  min-width: 0;
  height: 100%;
}

.splitter-3d {
  width: 5px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  cursor: col-resize;
  transition: background 0.15s;
  z-index: 10;
}

.splitter-3d:hover,
.splitter-3d.dragging {
  background: var(--accent-primary);
  opacity: 0.7;
}

#canvas-3d {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: #060c18;
}

#canvas-3d canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

/* Camera preset button strip at bottom of 3D panel */
#three-cam-presets {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  z-index: 20;
}

#three-cam-presets button {
  background: rgba(10, 20, 40, 0.75);
  border: 1px solid rgba(80, 120, 200, 0.3);
  color: var(--accent-primary, #7eb8f7);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 10px;
  cursor: pointer;
  font-family: monospace;
  backdrop-filter: blur(4px);
  transition: background 0.15s, border-color 0.15s;
}

#three-cam-presets button:hover,
#three-cam-presets button.active {
  background: rgba(40, 80, 180, 0.5);
  border-color: var(--accent-primary, #5865f2);
}
```

- [ ] **Step 1.5: Start the dev server and verify the split**

```bash
npm run dev
```

Open the browser. You should see the 2D SVG panel on the left, a thin splitter, and a dark `#canvas-3d` div on the right (no WebGL yet — just the dark background). If the ruler/SVG layout is broken, check that `#canvas-viewport > svg#canvas` has `flex: 1` and `height: 100%`.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json public/hdri/datacenter.exr index.html src/styles/three-viewport.css
git commit -m "feat: install Three.js, split layout, HDRI asset"
```

---

## Task 2: MaterialManager

**Files:**
- Create: `src/three/MaterialManager.ts`
- Create: `src/__tests__/three/MaterialManager.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `src/__tests__/three/MaterialManager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js — happy-dom has no WebGL
vi.mock('three', () => ({
  MeshStandardMaterial: vi.fn().mockImplementation((params) => ({
    ...params,
    dispose: vi.fn(),
    isMaterial: true,
  })),
  Color: vi.fn().mockImplementation((c) => ({ isColor: true, value: c })),
}));

import { MaterialManager } from '../../three/MaterialManager';

describe('MaterialManager', () => {
  let mgr: MaterialManager;

  beforeEach(() => {
    mgr = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a material for rack-frame type', () => {
    const mat = mgr.get('rack-frame');
    expect(mat).toBeDefined();
    expect(mat.isMaterial).toBe(true);
  });

  it('caches materials — same type returns same instance', () => {
    const a = mgr.get('rack-frame');
    const b = mgr.get('rack-frame');
    expect(a).toBe(b);
  });

  it('caches device materials by hex color', () => {
    const a = mgr.get('device', '#1e88e5');
    const b = mgr.get('device', '#1e88e5');
    const c = mgr.get('device', '#e53935');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('dispose clears all cached materials', () => {
    const mat = mgr.get('rack-frame');
    mgr.dispose();
    // After dispose, requesting the same type creates a new instance
    const mat2 = mgr.get('rack-frame');
    expect(mat2).not.toBe(mat);
  });

  it('supports all built-in types', () => {
    for (const type of ['rack-frame', 'rail', 'floor', 'blank-panel']) {
      expect(() => mgr.get(type)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2.2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/__tests__/three/MaterialManager.test.ts
```

Expected: FAIL — `Cannot find module '../../three/MaterialManager'`

- [ ] **Step 2.3: Create `src/three/MaterialManager.ts`**

```ts
import * as THREE from 'three';

export class MaterialManager {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  get(type: string, color?: string): THREE.MeshStandardMaterial {
    const key = color ? `device:${color}` : type;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const mat = this.create(type, color);
    this.cache.set(key, mat);
    return mat;
  }

  private create(type: string, color?: string): THREE.MeshStandardMaterial {
    switch (type) {
      case 'rack-frame':
        return new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.4 });
      case 'rail':
        return new THREE.MeshStandardMaterial({ color: 0x0d1520, metalness: 0.9, roughness: 0.3 });
      case 'floor':
        return new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.1, roughness: 0.8, transparent: true, opacity: 0.8 });
      case 'blank-panel':
        return new THREE.MeshStandardMaterial({ color: 0x0d1018, metalness: 0.5, roughness: 0.7 });
      default: // 'device'
        return new THREE.MeshStandardMaterial({
          color: color ? new THREE.Color(color) : new THREE.Color(0x1a3a6a),
          metalness: 0.3,
          roughness: 0.6,
        });
    }
  }

  dispose(): void {
    this.cache.forEach(mat => mat.dispose());
    this.cache.clear();
  }
}
```

- [ ] **Step 2.4: Run tests to confirm pass**

```bash
npm test -- --reporter=verbose src/__tests__/three/MaterialManager.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/three/MaterialManager.ts src/__tests__/three/MaterialManager.test.ts
git commit -m "feat: MaterialManager — PBR material cache"
```

---

## Task 3: rack-builder

**Files:**
- Create: `src/three/rack-builder.ts`
- Create: `src/__tests__/three/rack-builder.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/__tests__/three/rack-builder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Group = vi.fn().mockImplementation(() => ({
    name: '',
    children: [] as any[],
    position: { set: vi.fn() },
    add: vi.fn().mockImplementation(function(this: any, child: any) { this.children.push(child); }),
  }));
  const Mesh = vi.fn().mockImplementation((geo: any, mat: any) => ({
    geometry: geo, material: mat,
    position: { set: vi.fn() },
  }));
  const BoxGeometry = vi.fn().mockImplementation((w: number, h: number, d: number) => ({
    parameters: { width: w, height: h, depth: d },
    clone: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
  }));
  const MeshStandardMaterial = vi.fn().mockImplementation((p: any) => ({ ...p, dispose: vi.fn(), isMaterial: true }));
  const BackSide = 1;
  return { Group, Mesh, BoxGeometry, MeshStandardMaterial, BackSide };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() }),
  })),
}));

import { buildRackGroup } from '../../three/rack-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

describe('buildRackGroup', () => {
  let materials: MaterialManager;

  beforeEach(() => {
    materials = new MaterialManager();
  });

  it('returns a Group with the correct name', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const group = buildRackGroup(rack, materials);
    expect(group.name).toBe('rack-r1');
  });

  it('sets group position based on rack x/y', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const group = buildRackGroup(rack, materials);
    expect(group.position.set).toHaveBeenCalled();
  });

  it('adds children (posts, plates, rails, bay) to the group', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    // 4 posts + top plate + bottom plate + left rail + right rail + bay = 9 children minimum
    expect(group.children.length).toBeGreaterThanOrEqual(9);
  });

  it('uses 42 rack units when constructing total height geometry', () => {
    const { BoxGeometry } = await import('three');
    const rack = { id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0 } as any;
    buildRackGroup(rack, materials);
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const calls = vi.mocked(BoxGeometry).mock.calls;
    // At least one geometry should use totalH as its height param
    const found = calls.some(([, h]) => h === totalH);
    expect(found).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/__tests__/three/rack-builder.test.ts
```

Expected: FAIL — `Cannot find module '../../three/rack-builder'`

- [ ] **Step 3.3: Create `src/three/rack-builder.ts`**

```ts
import * as THREE from 'three';
import type { RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';

const { RU_HEIGHT, RACK_OUTER_WIDTH, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

export const RACK_DEPTH = 600;   // placeholder depth (mm-equivalent units); Phase 3.2 makes this parametric
const POST_W = 20;

export function buildRackGroup(rack: RackData, materials: MaterialManager): THREE.Group {
  const group = new THREE.Group();
  group.name = `rack-${rack.id}`;

  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const frameMat = materials.get('rack-frame');
  const railMat  = materials.get('rail');

  // 4 vertical corner posts
  const postGeo = new THREE.BoxGeometry(POST_W, totalH, POST_W);
  const postOffsets: [number, number, number][] = [
    [-RACK_OUTER_WIDTH / 2 + POST_W / 2, 0, -RACK_DEPTH / 2 + POST_W / 2],
    [ RACK_OUTER_WIDTH / 2 - POST_W / 2, 0, -RACK_DEPTH / 2 + POST_W / 2],
    [-RACK_OUTER_WIDTH / 2 + POST_W / 2, 0,  RACK_DEPTH / 2 - POST_W / 2],
    [ RACK_OUTER_WIDTH / 2 - POST_W / 2, 0,  RACK_DEPTH / 2 - POST_W / 2],
  ];
  for (const [x, y, z] of postOffsets) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(x, y, z);
    group.add(post);
  }

  // Top + bottom plates
  const plateGeo = new THREE.BoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_DEPTH);
  const topPlate = new THREE.Mesh(plateGeo, frameMat);
  topPlate.position.set(0, (totalH - RACK_PADDING_TOP) / 2, 0);
  group.add(topPlate);

  const botPlate = new THREE.Mesh(plateGeo.clone(), frameMat);
  botPlate.position.set(0, -(totalH - RACK_PADDING_BOTTOM) / 2, 0);
  group.add(botPlate);

  // Left + right front rails
  const railGeo = new THREE.BoxGeometry(RAIL_WIDTH, rack.units * RU_HEIGHT, RACK_DEPTH * 0.1);
  const leftRail = new THREE.Mesh(railGeo, railMat);
  leftRail.position.set(-(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2), 0, -RACK_DEPTH / 2 + RACK_DEPTH * 0.05);
  group.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo.clone(), railMat);
  rightRail.position.set(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2, 0, -RACK_DEPTH / 2 + RACK_DEPTH * 0.05);
  group.add(rightRail);

  // Inner bay volume — transparent back-face mesh gives interior depth
  const bayMat = new THREE.MeshStandardMaterial({ color: 0x080c14, transparent: true, opacity: 0.15, side: THREE.BackSide });
  const bayGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, rack.units * RU_HEIGHT, RACK_DEPTH * 0.95);
  const bay = new THREE.Mesh(bayGeo, bayMat);
  group.add(bay);

  // World position: racks sit on the floor (y = 0).
  // 2D uses top-left (rack.x, rack.y); in 3D x maps 1:1 and y is irrelevant (all racks on floor).
  group.position.set(
    rack.x + RACK_OUTER_WIDTH / 2,
    totalH / 2,   // center of rack height above floor (y = 0 = floor)
    0
  );

  return group;
}
```

- [ ] **Step 3.4: Run tests to confirm pass**

```bash
npm test -- --reporter=verbose src/__tests__/three/rack-builder.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/three/rack-builder.ts src/__tests__/three/rack-builder.test.ts
git commit -m "feat: rack-builder — RackData to Three.js Group"
```

---

## Task 4: device-builder

**Files:**
- Create: `src/three/device-builder.ts`
- Create: `src/__tests__/three/device-builder.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `src/__tests__/three/device-builder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Mesh = vi.fn().mockImplementation((geo: any, mat: any) => ({
    geometry: geo, material: mat, name: '',
    position: { set: vi.fn() },
  }));
  const BoxGeometry = vi.fn().mockImplementation((w: number, h: number, d: number) => ({
    parameters: { width: w, height: h, depth: d },
    dispose: vi.fn(),
  }));
  const MeshStandardMaterial = vi.fn().mockImplementation((p: any) => ({ ...p, dispose: vi.fn(), isMaterial: true }));
  return { Mesh, BoxGeometry, MeshStandardMaterial };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() }),
  })),
}));

import { buildDeviceMesh } from '../../three/device-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350

describe('buildDeviceMesh', () => {
  let materials: MaterialManager;

  const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
  const template = { id: 'tmpl', heightUnits: 2, color: '#1a3a6a', category: 'server' } as any;
  const device = { id: 'd1', templateId: 'tmpl', startUnit: 1, rackId: 'r1' } as any;

  beforeEach(() => {
    materials = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a mesh named device-<id>', () => {
    const mesh = buildDeviceMesh(device, template, rack, materials);
    expect(mesh.name).toBe('device-d1');
  });

  it('geometry width matches inner rack width minus rails', () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[w]] = vi.mocked(BoxGeometry).mock.calls;
    expect(w).toBe(DEVICE_W);
  });

  it('geometry height = heightUnits * RU_HEIGHT minus gap', () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[, h]] = vi.mocked(BoxGeometry).mock.calls;
    expect(h).toBe(template.heightUnits * RU_HEIGHT - 1);
  });

  it('sets vertical position within rack group', () => {
    const mesh = buildDeviceMesh(device, template, rack, materials);
    expect(mesh.position.set).toHaveBeenCalled();
    const [, yArg] = vi.mocked(mesh.position.set).mock.calls[0];
    // startUnit=1, 2U device, 42U rack — device bottom at floor, center slightly above
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const expectedY = -totalH / 2 + RACK_PADDING_BOTTOM + (0 + 1) * RU_HEIGHT;
    expect(yArg).toBeCloseTo(expectedY);
  });

  it('asks MaterialManager for device material with template color', () => {
    buildDeviceMesh(device, template, rack, materials);
    expect(materials.get).toHaveBeenCalledWith('device', '#1a3a6a');
  });
});
```

- [ ] **Step 4.2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/__tests__/three/device-builder.test.ts
```

Expected: FAIL — `Cannot find module '../../three/device-builder'`

- [ ] **Step 4.3: Create `src/three/device-builder.ts`**

```ts
import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { RACK_DEPTH } from './rack-builder';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350 units
const DEVICE_DEPTH = RACK_DEPTH * 0.93;              // placeholder; Phase 3.2 makes this parametric

export function buildDeviceMesh(
  device: DeviceData,
  template: DeviceTemplate,
  rack: RackData,
  materials: MaterialManager
): THREE.Mesh {
  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const deviceH = template.heightUnits * RU_HEIGHT - 1; // 1 unit gap between devices

  const geo = new THREE.BoxGeometry(DEVICE_W, deviceH, DEVICE_DEPTH);
  const mat = materials.get('device', template.color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `device-${device.id}`;

  // Position within the rack Group (Group origin = rack center).
  // startUnit is 1-based from the bottom.
  const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
  mesh.position.set(0, -totalH / 2 + deviceYFromBottom, 0);

  return mesh;
}
```

- [ ] **Step 4.4: Run tests to confirm pass**

```bash
npm test -- --reporter=verbose src/__tests__/three/device-builder.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/three/device-builder.ts src/__tests__/three/device-builder.test.ts
git commit -m "feat: device-builder — DeviceData to Three.js Mesh at correct RU slot"
```

---

## Task 5: AssetManager

**Files:**
- Create: `src/three/AssetManager.ts`

No unit tests for this module — it wraps `EXRLoader` which requires a real fetch + WebGL context. Browser smoke test in Task 12 verifies it.

- [ ] **Step 5.1: Create `src/three/AssetManager.ts`**

```ts
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class AssetManager {
  private loadingManager = new THREE.LoadingManager();
  private hdriTexture: THREE.Texture | null = null;

  async loadAll(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void> {
    await this.loadHDRI(renderer, scene);
  }

  private loadHDRI(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new EXRLoader(this.loadingManager);
      loader.load(
        '/hdri/datacenter.exr',
        (texture) => {
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const envMap = pmrem.fromEquirectangular(texture).texture;
          scene.environment = envMap;
          scene.background = envMap;
          texture.dispose();
          pmrem.dispose();
          this.hdriTexture = envMap;
          resolve();
        },
        undefined,
        (err) => {
          console.warn('[AssetManager] HDRI load failed, using fallback colour background:', err);
          scene.background = new THREE.Color(0x060c18);
          resolve(); // non-fatal — scene still renders without HDRI
        }
      );
    });
  }

  dispose(): void {
    this.hdriTexture?.dispose();
    this.hdriTexture = null;
  }
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/three/AssetManager.ts
git commit -m "feat: AssetManager — EXR HDRI loader with graceful fallback"
```

---

## Task 6: CameraManager

**Files:**
- Create: `src/three/CameraManager.ts`
- Create: `src/__tests__/three/CameraManager.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `src/__tests__/three/CameraManager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('three', () => ({
  PerspectiveCamera: vi.fn().mockImplementation(() => ({
    aspect: 1,
    fov: 60,
    near: 0.1,
    far: 100000,
    updateProjectionMatrix: vi.fn(),
    position: { set: vi.fn(), copy: vi.fn(), x: 0, y: 0, z: 0 },
    lookAt: vi.fn(),
  })),
  Vector3: vi.fn().mockImplementation((x: number, y: number, z: number) => ({ x, y, z, copy: vi.fn(), lerpVectors: vi.fn() })),
}));

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(() => ({
    target: { set: vi.fn(), copy: vi.fn(), x: 0, y: 0, z: 0 },
    update: vi.fn(),
    dispose: vi.fn(),
    enableDamping: false,
    dampingFactor: 0,
  })),
}));

import { CameraManager } from '../../three/CameraManager';

describe('CameraManager', () => {
  let mgr: CameraManager;
  const mockRenderer = { domElement: document.createElement('canvas') } as any;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new CameraManager(mockRenderer);
  });

  afterEach(() => {
    vi.useRealTimers();
    mgr.dispose();
  });

  it('creates camera and controls', () => {
    expect(mgr.camera).toBeDefined();
    expect(mgr.controls).toBeDefined();
  });

  it('setPreset("front") starts a camera animation', () => {
    mgr.setPreset('front');
    // Advancing timers should complete the animation without throwing
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });

  it('setPreset accepts all 6 valid preset names', () => {
    const presets = ['front', 'rear', 'left', 'right', 'top', 'perspective'] as const;
    for (const p of presets) {
      expect(() => mgr.setPreset(p)).not.toThrow();
    }
  });

  it('onResize updates camera aspect and calls updateProjectionMatrix', () => {
    mgr.onResize(1920, 1080);
    expect(mgr.camera.aspect).toBeCloseTo(1920 / 1080);
    expect(mgr.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('setTarget updates the orbit controls target', () => {
    mgr.setTarget(100, 630, 0);
    expect(mgr.controls.target.set).toHaveBeenCalledWith(100, 630, 0);
  });
});
```

- [ ] **Step 6.2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/__tests__/three/CameraManager.test.ts
```

Expected: FAIL — `Cannot find module '../../three/CameraManager'`

- [ ] **Step 6.3: Create `src/three/CameraManager.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraPreset = 'front' | 'rear' | 'left' | 'right' | 'top' | 'perspective';

// Spherical offsets (distance, azimuth radians, polar radians) for each preset.
// These are applied relative to the current orbit target.
const PRESET_OFFSETS: Record<CameraPreset, { dist: number; az: number; polar: number }> = {
  front:       { dist: 2800, az: 0,                   polar: Math.PI / 2 },
  rear:        { dist: 2800, az: Math.PI,              polar: Math.PI / 2 },
  left:        { dist: 2800, az: -Math.PI / 2,         polar: Math.PI / 2 },
  right:       { dist: 2800, az:  Math.PI / 2,         polar: Math.PI / 2 },
  top:         { dist: 2800, az: 0,                   polar: 0.01 },
  perspective: { dist: 2800, az: -Math.PI / 4,         polar: Math.PI / 3 },
};

const TRANSITION_MS = 400;

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private animFrame: number | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100000);
    this.camera.position.set(1200, 1200, 2800);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(700, 700, 0);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }

  setTarget(x: number, y: number, z: number): void {
    this.controls.target.set(x, y, z);
    this.controls.update();
  }

  setPreset(preset: CameraPreset): void {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);

    const { dist, az, polar } = PRESET_OFFSETS[preset];
    const target = this.controls.target;

    const destX = target.x + dist * Math.sin(polar) * Math.sin(az);
    const destY = target.y + dist * Math.cos(polar);
    const destZ = target.z + dist * Math.sin(polar) * Math.cos(az);

    const startPos = this.camera.position.clone();
    const startTime = performance.now();

    const animate = () => {
      const t = Math.min((performance.now() - startTime) / TRANSITION_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad

      this.camera.position.set(
        startPos.x + (destX - startPos.x) * eased,
        startPos.y + (destY - startPos.y) * eased,
        startPos.z + (destZ - startPos.z) * eased,
      );
      this.controls.update();

      if (t < 1) {
        this.animFrame = requestAnimationFrame(animate);
      } else {
        this.animFrame = null;
      }
    };

    this.animFrame = requestAnimationFrame(animate);
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.controls.dispose();
  }
}
```

- [ ] **Step 6.4: Run tests to confirm pass**

```bash
npm test -- --reporter=verbose src/__tests__/three/CameraManager.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/three/CameraManager.ts src/__tests__/three/CameraManager.test.ts
git commit -m "feat: CameraManager — PerspectiveCamera, OrbitControls, animated presets"
```

---

## Task 7: PostProcessingManager

**Files:**
- Create: `src/three/PostProcessingManager.ts`

No unit tests — EffectComposer and passes require WebGL context. Browser smoke test in Task 12 verifies the full pass stack.

- [ ] **Step 7.1: Create `src/three/PostProcessingManager.ts`**

```ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessingManager {
  private composer: EffectComposer;
  private ssaoPass: SSAOPass;
  private ssrPass: SSRPass;
  private bloomPass: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(renderer);

    // Pass 1: base scene render
    this.composer.addPass(new RenderPass(scene, camera));

    // Pass 2: SSAO — ambient occlusion (contact shadows between rack parts + devices)
    this.ssaoPass = new SSAOPass(scene, camera, width, height);
    this.ssaoPass.kernelRadius = 0.5;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.1;
    this.composer.addPass(this.ssaoPass);

    // Pass 3: SSR — screen-space reflections (primarily on the floor plane)
    this.ssrPass = new SSRPass({ renderer, scene, camera, width, height, groundReflector: null, selects: null } as any);
    this.ssrPass.thickness = 0.018;
    this.ssrPass.maxDistance = 0.1;
    this.ssrPass.opacity = 0.35;
    this.composer.addPass(this.ssrPass);

    // Pass 4: Bloom — LED glow, highlighted edges
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.4, 0.3, 0.85);
    this.composer.addPass(this.bloomPass);

    // Pass 5: OutputPass — ACES tone mapping + gamma (replaces deprecated ShaderPass(GammaCorrectionShader))
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  onResize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.ssaoPass.setSize(width, height);
    this.ssrPass.resolution = new THREE.Vector2(width, height);
    this.bloomPass.resolution = new THREE.Vector2(width, height);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/three/PostProcessingManager.ts
git commit -m "feat: PostProcessingManager — EffectComposer with SSAO, SSR, Bloom, ACES"
```

---

## Task 8: SceneManager

**Files:**
- Create: `src/three/SceneManager.ts`
- Create: `src/__tests__/three/SceneManager.test.ts`

- [ ] **Step 8.1: Write the failing tests**

Create `src/__tests__/three/SceneManager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Group = vi.fn().mockImplementation(() => ({
    name: '', children: [] as any[],
    position: { set: vi.fn() },
    add: vi.fn().mockImplementation(function(this: any, c: any) { this.children.push(c); }),
    remove: vi.fn(),
  }));
  const Scene = vi.fn().mockImplementation(() => ({
    add: vi.fn(), remove: vi.fn(), background: null, environment: null, fog: null, children: [],
  }));
  const Mesh = vi.fn().mockImplementation((g: any, m: any) => ({
    geometry: g, material: m, name: '',
    position: { set: vi.fn() },
  }));
  const BoxGeometry = vi.fn().mockImplementation((w: number, h: number, d: number) => ({ parameters: { width: w, height: h, depth: d }, dispose: vi.fn() }));
  const PlaneGeometry = vi.fn().mockImplementation(() => ({ dispose: vi.fn() }));
  const MeshStandardMaterial = vi.fn().mockImplementation((p: any) => ({ ...p, dispose: vi.fn(), isMaterial: true }));
  const HemisphereLight = vi.fn().mockImplementation(() => ({ position: { set: vi.fn() } }));
  const FogExp2 = vi.fn();
  const Color = vi.fn();
  const BackSide = 1;
  return { Group, Scene, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, HemisphereLight, FogExp2, Color, BackSide };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() }),
  })),
}));

vi.mock('../../three/rack-builder', () => ({
  buildRackGroup: vi.fn().mockImplementation((_rack: any) => {
    const { Group } = require('three');
    const g = new Group();
    g.name = `rack-${_rack.id}`;
    return g;
  }),
}));

vi.mock('../../three/device-builder', () => ({
  buildDeviceMesh: vi.fn().mockImplementation((_device: any) => {
    const { Mesh, BoxGeometry, MeshStandardMaterial } = require('three');
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    m.name = `device-${_device.id}`;
    return m;
  }),
}));

vi.mock('../../library/device-catalog', () => ({
  getTemplate: vi.fn().mockReturnValue({ id: 'tmpl', heightUnits: 1, color: '#ccc', category: 'server' }),
}));

import { SceneManager } from '../../three/SceneManager';
import { MaterialManager } from '../../three/MaterialManager';

const makeState = (racks: any[], devices: any[]) => ({ racks, devices } as any);

describe('SceneManager', () => {
  let mgr: SceneManager;
  let materials: MaterialManager;

  beforeEach(() => {
    materials = new MaterialManager();
    mgr = new SceneManager(materials);
  });

  it('exposes a THREE.Scene', () => {
    expect(mgr.scene).toBeDefined();
  });

  it('rebuild adds a Group for a new rack', () => {
    const state = makeState([{ id: 'r1', units: 42, x: 0, y: 0 }], []);
    mgr.rebuild(state);
    expect(mgr.scene.add).toHaveBeenCalled();
  });

  it('rebuild removes a Group when rack is deleted', () => {
    const state1 = makeState([{ id: 'r1', units: 42, x: 0, y: 0 }], []);
    mgr.rebuild(state1);
    const state2 = makeState([], []);
    mgr.rebuild(state2);
    expect(mgr.scene.remove).toHaveBeenCalled();
  });

  it('rebuild does not re-add existing racks on second call', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 };
    mgr.rebuild(makeState([rack], []));
    const addCallCount = vi.mocked(mgr.scene.add).mock.calls.length;
    mgr.rebuild(makeState([rack], []));
    // scene.add should not have been called again for the same rack
    expect(vi.mocked(mgr.scene.add).mock.calls.length).toBe(addCallCount);
  });

  it('rebuild adds device mesh inside rack group', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 };
    const device = { id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 1 };
    mgr.rebuild(makeState([rack], [device]));
    // The rack group should have received the device mesh
    const { buildDeviceMesh } = await import('../../three/device-builder');
    expect(buildDeviceMesh).toHaveBeenCalledWith(device, expect.anything(), rack, materials);
  });
});
```

- [ ] **Step 8.2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/__tests__/three/SceneManager.test.ts
```

Expected: FAIL — `Cannot find module '../../three/SceneManager'`

- [ ] **Step 8.3: Create `src/three/SceneManager.ts`**

```ts
import * as THREE from 'three';
import type { AppState, RackData, DeviceData } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup } from './rack-builder';
import { buildDeviceMesh } from './device-builder';

export class SceneManager {
  readonly scene: THREE.Scene;
  private rackGroups = new Map<string, THREE.Group>();
  private deviceMeshes = new Map<string, THREE.Mesh>();
  private materials: MaterialManager;

  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c18, 0.000025);

    // Hemisphere light (sky/ground) — HDRI fills in after AssetManager loads
    const hemi = new THREE.HemisphereLight(0x4466aa, 0x223344, 0.6);
    hemi.position.set(0, 5000, 0);
    this.scene.add(hemi);

    // Floor plane
    const floorGeo = new THREE.PlaneGeometry(20000, 20000);
    const floorMat = this.materials.get('floor');
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    this.scene.add(floor);
  }

  rebuild(state: AppState): void {
    this.syncRacks(state.racks);
    this.syncDevices(state.racks, state.devices);
  }

  private syncRacks(racks: RackData[]): void {
    const incoming = new Set(racks.map(r => r.id));

    // Remove deleted racks
    for (const [id, group] of this.rackGroups) {
      if (!incoming.has(id)) {
        this.scene.remove(group);
        this.rackGroups.delete(id);
      }
    }

    // Add new racks
    for (const rack of racks) {
      if (!this.rackGroups.has(rack.id)) {
        const group = buildRackGroup(rack, this.materials);
        this.scene.add(group);
        this.rackGroups.set(rack.id, group);
      } else {
        // Update position if rack moved
        const group = this.rackGroups.get(rack.id)!;
        const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = await import('../core/types').then(m => m.RACK_CONSTANTS);
        const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
        group.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
      }
    }
  }

  private syncDevices(racks: RackData[], devices: DeviceData[]): void {
    const incoming = new Set(devices.map(d => d.id));

    // Remove deleted devices
    for (const [id, mesh] of this.deviceMeshes) {
      if (!incoming.has(id)) {
        const device = { rackId: [...this.rackGroups.keys()].find(k => this.deviceMeshes.get(id)) };
        // Remove from whichever rack group owns it
        for (const group of this.rackGroups.values()) {
          group.remove(mesh);
        }
        mesh.geometry.dispose();
        this.deviceMeshes.delete(id);
      }
    }

    // Add new devices
    for (const device of devices) {
      const template = getTemplate(device.templateId);
      if (!template) continue;

      const rack = racks.find(r => r.id === device.rackId);
      if (!rack) continue;

      const rackGroup = this.rackGroups.get(device.rackId);
      if (!rackGroup) continue;

      if (!this.deviceMeshes.has(device.id)) {
        const mesh = buildDeviceMesh(device, template, rack, this.materials);
        rackGroup.add(mesh);
        this.deviceMeshes.set(device.id, mesh);
      } else {
        // Update position if device moved (startUnit changed)
        const { RACK_CONSTANTS } = await import('../core/types');
        const { RU_HEIGHT, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
        const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
        const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
        this.deviceMeshes.get(device.id)!.position.set(0, -totalH / 2 + deviceYFromBottom, 0);
      }
    }
  }

  dispose(): void {
    this.scene.clear();
    this.rackGroups.clear();
    this.deviceMeshes.clear();
  }
}
```

**Note:** The dynamic `await import(...)` inside sync methods is an anti-pattern. Replace with a static import at the top of the file:

Replace the two `await import(...)` calls in `syncRacks` and `syncDevices` with a top-level import:

```ts
import { RACK_CONSTANTS } from '../core/types';
```

And remove the dynamic imports — use `RACK_CONSTANTS` directly. Here is the corrected `SceneManager.ts` without dynamic imports:

```ts
import * as THREE from 'three';
import type { AppState, RackData, DeviceData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup } from './rack-builder';
import { buildDeviceMesh } from './device-builder';

const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

export class SceneManager {
  readonly scene: THREE.Scene;
  private rackGroups = new Map<string, THREE.Group>();
  private deviceMeshes = new Map<string, { mesh: THREE.Mesh; rackId: string }>();
  private materials: MaterialManager;

  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c18, 0.000025);

    const hemi = new THREE.HemisphereLight(0x4466aa, 0x223344, 0.6);
    hemi.position.set(0, 5000, 0);
    this.scene.add(hemi);

    const floorGeo = new THREE.PlaneGeometry(20000, 20000);
    const floor = new THREE.Mesh(floorGeo, this.materials.get('floor'));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    this.scene.add(floor);
  }

  rebuild(state: AppState): void {
    this.syncRacks(state.racks);
    this.syncDevices(state.racks, state.devices);
  }

  private syncRacks(racks: RackData[]): void {
    const incoming = new Set(racks.map(r => r.id));

    for (const [id, group] of this.rackGroups) {
      if (!incoming.has(id)) {
        this.scene.remove(group);
        this.rackGroups.delete(id);
      }
    }

    for (const rack of racks) {
      const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
      if (!this.rackGroups.has(rack.id)) {
        const group = buildRackGroup(rack, this.materials);
        this.scene.add(group);
        this.rackGroups.set(rack.id, group);
      } else {
        this.rackGroups.get(rack.id)!.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
      }
    }
  }

  private syncDevices(racks: RackData[], devices: DeviceData[]): void {
    const incoming = new Set(devices.map(d => d.id));

    for (const [id, { mesh, rackId }] of this.deviceMeshes) {
      if (!incoming.has(id)) {
        this.rackGroups.get(rackId)?.remove(mesh);
        mesh.geometry.dispose();
        this.deviceMeshes.delete(id);
      }
    }

    for (const device of devices) {
      const template = getTemplate(device.templateId);
      if (!template) continue;
      const rack = racks.find(r => r.id === device.rackId);
      if (!rack) continue;
      const rackGroup = this.rackGroups.get(device.rackId);
      if (!rackGroup) continue;

      const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
      const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
      const deviceY = -totalH / 2 + deviceYFromBottom;

      if (!this.deviceMeshes.has(device.id)) {
        const mesh = buildDeviceMesh(device, template, rack, this.materials);
        rackGroup.add(mesh);
        this.deviceMeshes.set(device.id, { mesh, rackId: device.rackId });
      } else {
        this.deviceMeshes.get(device.id)!.mesh.position.set(0, deviceY, 0);
      }
    }
  }

  dispose(): void {
    this.scene.clear();
    this.rackGroups.clear();
    this.deviceMeshes.clear();
  }
}
```

- [ ] **Step 8.4: Run tests to confirm pass**

```bash
npm test -- --reporter=verbose src/__tests__/three/SceneManager.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/three/SceneManager.ts src/__tests__/three/SceneManager.test.ts
git commit -m "feat: SceneManager — Three.js scene owner with rack/device diff rebuild"
```

---

## Task 9: ThreeViewport Orchestrator

**Files:**
- Create: `src/three/ThreeViewport.ts`

No unit tests — ThreeViewport wires together all managers and requires WebGL. Browser smoke test in Task 12 covers it.

- [ ] **Step 9.1: Create `src/three/ThreeViewport.ts`**

```ts
import * as THREE from 'three';
import type { AppState } from '../core/types';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { MaterialManager } from './MaterialManager';
import { AssetManager } from './AssetManager';
import { CameraManager, type CameraPreset } from './CameraManager';
import { PostProcessingManager } from './PostProcessingManager';
import { SceneManager } from './SceneManager';

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { fn(...args); timer = null; }, ms);
  }) as T;
}

export class ThreeViewport {
  private renderer!: THREE.WebGLRenderer;
  private materials!: MaterialManager;
  private assets!: AssetManager;
  private scene!: SceneManager;
  private camera!: CameraManager;
  private post!: PostProcessingManager;
  private container: HTMLElement | null = null;
  private animId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribe: (() => void) | null = null;

  private debouncedSync = debounce((partial: Partial<AppState>) => {
    if (partial.racks !== undefined || partial.devices !== undefined) {
      this.scene.rebuild(stateManager.getState());
    }
  }, 100);

  mount(container: HTMLElement): void {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.materials = new MaterialManager();
    this.scene = new SceneManager(this.materials);
    this.camera = new CameraManager(this.renderer);
    this.assets = new AssetManager();

    const { width, height } = container.getBoundingClientRect();
    this.renderer.setSize(width, height);
    this.camera.onResize(width, height);

    this.post = new PostProcessingManager(
      this.renderer,
      this.scene.scene,
      this.camera.camera,
      width,
      height
    );

    // Load HDRI (non-blocking — scene renders with fallback colour until it resolves)
    this.assets.loadAll(this.renderer, this.scene.scene).catch(console.warn);

    // Sync initial state
    this.scene.rebuild(stateManager.getState());
    this.fitCameraToScene();

    // Subscribe to future state changes
    const handler = (partial: Partial<AppState>) => this.debouncedSync(partial);
    eventBus.on('state:changed', handler);
    this.unsubscribe = () => eventBus.off('state:changed', handler);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    // Start render loop
    this.animate();
  }

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    this.camera.update();
    this.post.render();
  }

  private onResize(): void {
    if (!this.container) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.onResize(width, height);
    this.post.onResize(width, height);
  }

  /** Fit the orbit camera to show all racks. Called once on first mount. */
  fitCameraToScene(): void {
    const racks = stateManager.getState().racks;
    if (racks.length === 0) return;

    const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = await import('../core/types').then(m => m.RACK_CONSTANTS);
    // Compute centroid of all rack centers
    const cx = racks.reduce((s, r) => s + r.x + RACK_OUTER_WIDTH / 2, 0) / racks.length;
    const firstRack = racks[0];
    const totalH = RACK_PADDING_TOP + firstRack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const cy = totalH / 2;

    this.camera.setTarget(cx, cy, 0);
    this.camera.setPreset('perspective');
  }

  setPreset(preset: CameraPreset): void {
    this.camera.setPreset(preset);
  }

  destroy(): void {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.camera.dispose();
    this.post.dispose();
    this.scene.dispose();
    this.materials.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.container = null;
  }
}
```

**Note:** Replace the `await import(...)` in `fitCameraToScene` with a static import at the top of the file:

```ts
import { RACK_CONSTANTS } from '../core/types';
```

And update `fitCameraToScene`:
```ts
fitCameraToScene(): void {
  const racks = stateManager.getState().racks;
  if (racks.length === 0) return;
  const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;
  const cx = racks.reduce((s, r) => s + r.x + RACK_OUTER_WIDTH / 2, 0) / racks.length;
  const totalH = RACK_PADDING_TOP + racks[0].units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  this.camera.setTarget(cx, totalH / 2, 0);
  this.camera.setPreset('perspective');
}
```

- [ ] **Step 9.2: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests pass; new Three.js tests pass.

- [ ] **Step 9.3: Commit**

```bash
git add src/three/ThreeViewport.ts
git commit -m "feat: ThreeViewport — orchestrator, render loop, eventBus sync, resize"
```

---

## Task 10: Splitter Drag-to-Resize

**Files:**
- Modify: `src/three/ThreeViewport.ts`

The splitter drag logic is self-contained and belongs in ThreeViewport since it controls the 3D canvas size.

- [ ] **Step 10.1: Add `mountSplitter` to `ThreeViewport.ts`**

Add this method to the `ThreeViewport` class and call it from `mount()`:

```ts
private mountSplitter(): void {
  const splitter = document.getElementById('splitter-3d');
  const viewport = document.getElementById('canvas-viewport');
  const svg = document.getElementById('canvas-viewport')?.querySelector('svg');
  if (!splitter || !viewport || !this.container) return;

  let dragging = false;
  let startX = 0;
  let startLeftPx = 0;

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startLeftPx = svg ? svg.getBoundingClientRect().width : viewport.getBoundingClientRect().width / 2;
    splitter.classList.add('dragging');
    splitter.setPointerCapture(e.pointerId);
  });

  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const totalW = viewport.getBoundingClientRect().width - 5; // 5px splitter
    const newLeftPx = Math.max(200, Math.min(totalW - 200, startLeftPx + delta));
    const pct = (newLeftPx / totalW) * 100;

    if (svg) (svg as HTMLElement).style.flex = `0 0 ${pct}%`;
    if (this.container) (this.container as HTMLElement).style.flex = `0 0 ${100 - pct}%`;
    this.onResize();
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('dragging');
  });
}
```

Call `this.mountSplitter()` at the end of the `mount()` method (after the render loop starts).

- [ ] **Step 10.2: Verify splitter in browser**

Run `npm run dev`, open the app, and drag the splitter left and right. Both panels should resize and the 3D viewport should refit correctly.

- [ ] **Step 10.3: Commit**

```bash
git add src/three/ThreeViewport.ts
git commit -m "feat: splitter drag-to-resize for 2D/3D split panel"
```

---

## Task 11: Wire Up in app.ts + Camera Preset Buttons

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 11.1: Add ThreeViewport import and instantiation to `app.ts`**

Add the import at the top of `src/app.ts` (after existing imports):
```ts
import { ThreeViewport } from './three/ThreeViewport';
import './styles/three-viewport.css';
```

Add a private field to the `App` class:
```ts
private threeViewport!: ThreeViewport;
```

In the `init()` method, add after `this.canvas = new CanvasManager(...)`:
```ts
// Mount 3D viewport
const canvas3d = document.getElementById('canvas-3d');
if (canvas3d) {
  this.threeViewport = new ThreeViewport();
  this.threeViewport.mount(canvas3d);
}
```

- [ ] **Step 11.2: Add camera preset buttons to the 3D panel**

In the `init()` method, after mounting the ThreeViewport, add:
```ts
// Camera preset buttons
if (canvas3d && this.threeViewport) {
  const bar = document.createElement('div');
  bar.id = 'three-cam-presets';
  const presets = ['Front', 'Rear', 'Left', 'Right', 'Top', 'Perspective'] as const;
  let activeBtn: HTMLButtonElement | null = null;

  for (const label of presets) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this.threeViewport.setPreset(label.toLowerCase() as any);
      activeBtn?.classList.remove('active');
      btn.classList.add('active');
      activeBtn = btn;
    });
    bar.appendChild(btn);
    if (label === 'Perspective') {
      btn.classList.add('active');
      activeBtn = btn;
    }
  }
  canvas3d.appendChild(bar);
}
```

- [ ] **Step 11.3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 11.4: Commit**

```bash
git add src/app.ts
git commit -m "feat: wire ThreeViewport into app.ts with camera preset buttons"
```

---

## Task 12: Browser Smoke Test + Final Commit

This task has no automated tests — it's visual verification in the browser.

- [ ] **Step 12.1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 12.2: Verify success criteria one by one**

Open the app at `http://localhost:5173`.

| # | Check | Pass? |
|---|---|---|
| 1 | 2D and 3D panels appear side by side | ☐ |
| 2 | File → Demo Project: racks and device slabs appear in 3D immediately | ☐ |
| 3 | Drag a device in 2D → it moves in 3D within 100 ms | ☐ |
| 4 | Click all 6 camera preset buttons → smooth animated transitions | ☐ |
| 5 | Orbit (drag), pan (right-drag), zoom (scroll) work in 3D panel | ☐ |
| 6 | Device slabs have visible PBR shading (not flat colour) | ☐ |
| 7 | Splitter is draggable; both panels resize | ☐ |
| 8 | Open browser DevTools → Console: no errors | ☐ |
| 9 | Performance tab: FPS ≥ 60 with demo project (7 devices) | ☐ |

- [ ] **Step 12.3: Fix any issues found during smoke test**

Common issues and fixes:
- **Black screen / no HDRI**: Check `public/hdri/datacenter.exr` exists; if missing, AssetManager's fallback sets `scene.background` to a dark colour — the scene will still render.
- **SSRPass error**: Some Three.js versions have `SSRPass` constructor signature changes — check the console for TypeError and adjust the constructor call in `PostProcessingManager.ts`.
- **FPS < 60**: Reduce `UnrealBloomPass` strength or disable SSR temporarily via `ssrPass.enabled = false` to identify the bottleneck.
- **Splitter not working**: Verify `#splitter-3d` exists in the DOM with correct id; check event listener is attached in `mountSplitter()`.

- [ ] **Step 12.4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3.1 complete — Core 3D Engine with PBR, HDRI, SSAO, SSR, Bloom"
```

---

## Success Criteria Checklist

- [ ] Loading the demo project shows 2D and 3D panels side by side
- [ ] Adding a device in 2D appears in 3D within 100 ms
- [ ] Moving a rack in 2D repositions it in 3D
- [ ] All 6 camera presets work with smooth 400 ms animated transitions
- [ ] Orbit / pan / zoom all work
- [ ] HDRI environment renders; all device slabs show PBR shading
- [ ] SSAO, SSR, Bloom, and ACES tone mapping are active
- [ ] Splitter is draggable and both panels resize correctly
- [ ] 60 FPS sustained on demo project (7 devices)
- [ ] `destroy()` is callable without errors (no memory leak on unmount)
