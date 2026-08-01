import * as THREE from 'three';
import type { AppState } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
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

  private debouncedSync = debounce((partial: Partial<AppState>) => {
    if (partial.racks !== undefined || partial.devices !== undefined) {
      this.sceneManager.rebuild(stateManager.getState());
    }
  }, 100);

  mount(container: HTMLElement): void {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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
    this.stateHandler = (partial: Partial<AppState>) => this.debouncedSync(partial);
    eventBus.on('state:changed', this.stateHandler);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    // Start render loop
    this.animate();

    // Mount splitter drag behavior
    this.mountSplitter();
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
