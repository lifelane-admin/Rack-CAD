// Small floating panel for adjusting an uploaded ImageAsset — opens automatically when an image
// is selected on the canvas, closeable independently via its own ✕ button (same pattern as
// TextToolPanel/text-tool-panel.ts, which this deliberately mirrors for consistency).
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { SelectableItem, ImageAsset } from '../core/types';
import { makeDraggable } from './floating-panel-utils';
import { findNearestRack, rackCenterX } from '../utils/annotation-align';

export class ImageToolPanel {
  private el: HTMLElement | null = null;
  private closedByUser = false;
  private lastAutoShowKey: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;
    this.el = document.createElement('div');
    this.el.id = 'image-tool-panel';
    this.el.className = 'text-tool-panel image-tool-panel';
    this.el.style.top = '16px';
    this.el.style.left = '50%';
    viewport.appendChild(this.el);
    makeDraggable(this.el, '.ttp-drag-handle');

    eventBus.on('selection:changed', () => {
      this.maybeReopen();
      this.render();
    });

    // See text-tool-panel.ts for why this guards against document.activeElement (rebuilding
    // innerHTML while the opacity slider is dragged would interrupt it) and '.dragging-active'
    // (a canvas move/resize drag doesn't change anything this panel displays, so skip the
    // rebuild until it ends rather than churning the DOM on every mousemove).
    eventBus.on('state:changed', () => {
      if (this.el?.contains(document.activeElement)) return;
      if (document.getElementById('canvas')?.classList.contains('dragging-active')) return;
      this.render();
    });

    this.render();
  }

  private selectedAsset(): ImageAsset | null {
    const s = stateManager.getState();
    const sel: SelectableItem | undefined = s.selection.find(i => i.type === 'image');
    if (!sel) return null;
    return s.imageAssets.find(a => a.id === sel.id) ?? null;
  }

  private maybeReopen(): void {
    const asset = this.selectedAsset();
    const key = asset ? `sel:${asset.id}` : null;
    if (key !== null && key !== this.lastAutoShowKey) {
      this.closedByUser = false;
    }
    this.lastAutoShowKey = key;
  }

  private render(): void {
    if (!this.el) return;
    const asset = this.selectedAsset();
    const shouldShow = !!asset && !this.closedByUser;

    if (!shouldShow) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';

    this.el.innerHTML = `
      <div class="ttp-header">
        <span class="ttp-drag-handle" title="Drag to reposition">⋮⋮</span>
        <span class="ttp-title">Image</span>
        <button class="ttp-close" title="Close panel">✕</button>
      </div>
      <div class="ttp-body">
        <div class="ttp-row">
          <label class="ttp-rotation-label" title="Opacity" style="flex:1;">
            Opacity
            <input class="itp-opacity" type="range" min="0" max="100" step="1" value="${Math.round((asset!.opacity ?? 1) * 100)}" style="flex:1;" />
            <span class="itp-opacity-value">${Math.round((asset!.opacity ?? 1) * 100)}%</span>
          </label>
        </div>
        <div class="ttp-row">
          <label class="ttp-pos-label" title="Exact X position (world px, top-left)">X
            <input class="itp-pos-x" type="number" value="${Math.round(asset!.x)}" />
          </label>
          <label class="ttp-pos-label" title="Exact Y position (world px, top-left)">Y
            <input class="itp-pos-y" type="number" value="${Math.round(asset!.y)}" />
          </label>
        </div>

        <div class="ttp-row">
          <button class="ttp-btn itp-center-h" title="Center this image horizontally on the rack it's nearest to" style="flex:1;">⊙ Center Horizontally</button>
        </div>

        <div class="ttp-row">
          <label class="ttp-rotation-label" title="Rotation (degrees)">⟳
            <input class="itp-rotation" type="number" min="0" max="360" value="${asset!.rotation || 0}" />°
          </label>
          <button class="ttp-btn ttp-delete" title="Delete image">🗑 Delete</button>
        </div>
      </div>
    `;

    this.bindEvents(asset!);
  }

  private bindEvents(asset: ImageAsset): void {
    if (!this.el) return;

    this.el.querySelector('.ttp-close')?.addEventListener('click', () => {
      this.closedByUser = true;
      this.render();
    });

    const update = (data: Partial<ImageAsset>) => eventBus.emit('imageasset:update', { id: asset.id, data });

    const opacityInput = this.el.querySelector('.itp-opacity') as HTMLInputElement | null;
    const opacityValueLabel = this.el.querySelector('.itp-opacity-value');
    opacityInput?.addEventListener('input', (e: any) => {
      const pct = Number(e.target.value);
      if (opacityValueLabel) opacityValueLabel.textContent = `${pct}%`;
      update({ opacity: pct / 100 });
    });

    this.el.querySelector('.itp-rotation')?.addEventListener('change', (e: any) => {
      update({ rotation: Number(e.target.value) || 0 });
    });

    this.el.querySelector('.itp-pos-x')?.addEventListener('change', (e: any) => update({ x: Number(e.target.value) || 0 }));
    this.el.querySelector('.itp-pos-y')?.addEventListener('change', (e: any) => update({ y: Number(e.target.value) || 0 }));

    this.el.querySelector('.itp-center-h')?.addEventListener('click', () => {
      const racks = stateManager.getState().racks;
      const rack = findNearestRack(racks, asset.x + asset.width / 2, asset.y);
      if (!rack) return;
      update({ x: rackCenterX(rack) - asset.width / 2 });
    });

    this.el.querySelector('.ttp-delete')?.addEventListener('click', () => {
      eventBus.emit('edit:delete', undefined);
    });
  }
}
