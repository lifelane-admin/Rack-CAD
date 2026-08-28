import * as THREE from 'three';
import type { AppState } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { MaterialManager } from './MaterialManager';
import { AssetManager } from './AssetManager';
import { CameraManager, type CameraPreset } from './CameraManager';
import { PostProcessingManager } from './PostProcessingManager';
import { SceneManager, type DoorState } from './SceneManager';
import type { RackColorKey } from './rack-builder';

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { fn(...args); timer = null; }, ms);
  }) as T;
}

const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

export class ThreeViewport {
  private renderer!: THREE.WebGLRenderer;
  private materials!: MaterialManager;
  private assets!: AssetManager;
  private sceneManager!: SceneManager;
  private camera!: CameraManager;
  private post!: PostProcessingManager;
  private container: HTMLElement | null = null;
  private animId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private stateHandler: ((partial: Partial<AppState>) => void) | null = null;

  private dirtySync = false;
  private debouncedSync = debounce(() => {
    if (this.dirtySync) {
      this.sceneManager.rebuild(stateManager.getState());
      this.dirtySync = false;
    }
  }, 100);

  mount(container: HTMLElement): void {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.materials = new MaterialManager();
    this.sceneManager = new SceneManager(this.materials);
    this.camera = new CameraManager(this.renderer);
    this.assets = new AssetManager();

    const { width, height } = container.getBoundingClientRect();
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    this.renderer.setSize(w, h);
    this.camera.onResize(w, h);

    this.post = new PostProcessingManager(
      this.renderer,
      this.sceneManager.scene,
      this.camera.camera,
      w,
      h
    );

    // Load HDRI — non-blocking; scene renders with fallback until resolved
    this.assets.loadAll(this.renderer, this.sceneManager.scene).catch(console.warn);

    // Sync initial state
    this.sceneManager.rebuild(stateManager.getState());
    this.fitCameraToScene();

    // Subscribe to future state changes
    this.stateHandler = (partial: Partial<AppState>) => {
      if (partial.racks !== undefined || partial.devices !== undefined || partial.cables !== undefined) {
        this.dirtySync = true;
      }
      this.debouncedSync();
    };
    eventBus.on('state:changed', this.stateHandler);

    // Synchronize 3D selection box with 2D/3D selection state
    this.selectionHandler = (selection: Array<{ type: string; id: string }>) => {
      this.sceneManager.updateSelection(selection);
    };
    eventBus.on('selection:changed', this.selectionHandler);

    // Setup 3D interactive pointer selection & context menu
    this.setupInteractivePicking();

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    // Start render loop
    this.animate();

    // Mount splitter drag behavior
    this.mountSplitter();
  }

  private selectionHandler: ((selection: Array<{ type: string; id: string }>) => void) | null = null;
  private raycaster = new THREE.Raycaster();
  private mouseNdc = new THREE.Vector2();

  private raycastSelectable(clientX: number, clientY: number): { type: 'device' | 'rack' | 'cable'; id: string; object: THREE.Object3D } | null {
    if (!this.container) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.mouseNdc, this.camera.camera);

    const intersects = this.raycaster.intersectObjects(this.sceneManager.scene.children, true);
    if (intersects.length === 0) return null;

    let deviceHit: { type: 'device'; id: string; object: THREE.Object3D } | null = null;
    let cableHit: { type: 'cable'; id: string; object: THREE.Object3D } | null = null;
    let rackHit: { type: 'rack'; id: string; object: THREE.Object3D } | null = null;

    for (const hit of intersects) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.sceneManager.scene) {
        if (!deviceHit && curr.name?.startsWith('device-')) {
          const id = curr.name.replace('device-', '');
          deviceHit = { type: 'device', id, object: curr };
        } else if (!deviceHit && (curr.name?.startsWith('ear-left-') || curr.name?.startsWith('ear-right-'))) {
          const id = curr.name.replace('ear-left-', '').replace('ear-right-', '');
          deviceHit = { type: 'device', id, object: curr };
        } else if (!cableHit && (curr.name?.startsWith('cable-tube-') || curr.name?.startsWith('cable-'))) {
          const id = curr.name.replace('cable-tube-', '').replace('cable-', '');
          cableHit = { type: 'cable', id, object: curr };
        } else if (!rackHit && (curr.name?.startsWith('rack-') && curr.userData?.rack)) {
          rackHit = { type: 'rack', id: curr.userData.rack.id, object: curr };
        } else if (curr.userData?.type && curr.userData?.id) {
          if (!deviceHit && curr.userData.type === 'device') {
            deviceHit = { type: 'device', id: curr.userData.id, object: curr };
          } else if (!cableHit && curr.userData.type === 'cable') {
            cableHit = { type: 'cable', id: curr.userData.id, object: curr };
          } else if (!rackHit && curr.userData.type === 'rack') {
            rackHit = { type: 'rack', id: curr.userData.id, object: curr };
          }
        }
        curr = curr.parent;
      }
      if (deviceHit) break; // Device takes top priority
    }

    return deviceHit || cableHit || rackHit || null;
  }

  private setupInteractivePicking(): void {
    const el = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    let downTime = 0;

    el.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      downTime = performance.now();
    });

    el.addEventListener('pointerup', (e) => {
      // If user dragged the camera (orbit/pan/zoom), ignore selection
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      const duration = performance.now() - downTime;
      if (dist > 8 || duration > 600) return;

      if (e.button === 0) {
        // Left click selection
        const hit = this.raycastSelectable(e.clientX, e.clientY);
        if (hit) {
          stateManager.setState({ selection: [{ type: hit.type, id: hit.id }] });
          eventBus.emit('selection:changed', [{ type: hit.type, id: hit.id }]);
        } else {
          // Clicked empty 3D space — deselect
          stateManager.setState({ selection: [] });
          eventBus.emit('selection:changed', []);
        }
      }
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hit = this.raycastSelectable(e.clientX, e.clientY);
      if (hit) {
        stateManager.setState({ selection: [{ type: hit.type, id: hit.id }] });
        eventBus.emit('selection:changed', [{ type: hit.type, id: hit.id }]);

        const attrName = `data-${hit.type}-id`;
        const domEl = document.querySelector(`[${attrName}="${hit.id}"]`) as SVGElement | null;
        eventBus.emit('canvas:rightclick', {
          point: { x: 0, y: 0 },
          target: domEl || el,
          screenPoint: { x: e.clientX, y: e.clientY }
        } as any);
      }
    });

    el.addEventListener('pointermove', (e) => {
      const hit = this.raycastSelectable(e.clientX, e.clientY);
      el.style.cursor = hit ? 'pointer' : 'default';
    });

    el.addEventListener('dblclick', (e) => {
      const hit = this.raycastSelectable(e.clientX, e.clientY);
      if (hit && hit.type === 'device') {
        const entry = this.sceneManager.getDeviceEntry(hit.id);
        if (entry) {
          const worldPos = new THREE.Vector3();
          entry.mesh.getWorldPosition(worldPos);
          this.camera.setTarget(worldPos.x, worldPos.y, worldPos.z);
        }
      }
    });
  }

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    this.sceneManager.tick(performance.now() / 1000);
    this.camera.update();
    this.post.render();
  }

  /** Stops the render loop — used while the 3D panel is hidden (see AppState.show3DPanel) so an
   *  unopened panel doesn't keep rendering an off-screen scene every frame. Safe to call more
   *  than once. */
  pause(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  /** Restarts the render loop after pause(), and forces an immediate resize since the container
   *  may have gone from display:none (0x0) to its real size since the loop last ran — a
   *  ResizeObserver firing on un-hide isn't guaranteed to land before the first frame. */
  resume(): void {
    this.onResize();
    if (this.animId === null) this.animate();
  }

  private onResize(): void {
    if (!this.container) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.onResize(width, height);
    this.post.onResize(width, height);
  }

  fitCameraToScene(): void {
    const racks = stateManager.getState().racks;
    if (racks.length === 0) return;
    const cx = racks.reduce((s, r) => s + r.x + RACK_OUTER_WIDTH / 2, 0) / racks.length;
    const totalH = RACK_PADDING_TOP + racks[0].units * RU_HEIGHT + RACK_PADDING_BOTTOM;
    this.camera.setTarget(cx, totalH / 2, 0);
    this.camera.setPreset('perspective');
  }

  setPreset(preset: CameraPreset): void {
    this.camera.setPreset(preset);
  }

  setDoorState(state: DoorState): void {
    this.sceneManager.setDoorState(state);
  }

  setRackColor(colorKey: RackColorKey): void {
    this.sceneManager.setRackColor(colorKey);
  }

  setPanelOpacity(opacity: number): void {
    this.sceneManager.setPanelOpacity(opacity);
  }

  zoomBy(factor: number): void {
    this.camera.zoomBy(factor);
  }

  setPanMode(pan: boolean): void {
    this.camera.setPanMode(pan);
  }

  private mountSplitter(): void {
    const splitter = document.getElementById('splitter-3d');
    const viewport = document.getElementById('canvas-viewport');
    const svg = viewport?.querySelector('svg#canvas') as HTMLElement | null;
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
      const totalW = viewport.getBoundingClientRect().width - 5;
      const newLeftPx = Math.max(200, Math.min(totalW - 200, startLeftPx + delta));
      const pct = (newLeftPx / totalW) * 100;
      if (svg) svg.style.flex = `0 0 ${pct}%`;
      if (this.container) (this.container as HTMLElement).style.flex = `0 0 ${100 - pct}%`;
      this.onResize();
    });

    splitter.addEventListener('pointerup', () => {
      dragging = false;
      splitter.classList.remove('dragging');
    });
  }

  destroy(): void {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    if (this.stateHandler) eventBus.off('state:changed', this.stateHandler);
    if (this.selectionHandler) eventBus.off('selection:changed', this.selectionHandler);
    this.resizeObserver?.disconnect();
    this.camera.dispose();
    this.post.dispose();
    this.sceneManager.dispose();
    this.materials.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.container = null;
  }
}
