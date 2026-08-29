// A compact floating quick-access toolbar for the Cloud Architecture canvas — mirrors the rack
// canvas's FloatingToolbar (same .floating-toolbar/.ft-row/.ft-btn styling and drag-to-reposition
// mechanics, see floating-toolbar.ts) but with cloud-specific content: Select/Pan, Undo/Redo/
// Delete, the Connect tool, and the six basic boundary shapes (Region/AZ/VPC/Subnet/Resource
// Group/Account) — a closer-to-hand duplicate of the main toolbar's "Cloud Tools"/"Cloud Shapes"
// groups, not a replacement for them. Mounted inside #cloud-viewport, so it's naturally
// hidden/shown by the same .hidden-class toggle app.ts's setActiveView() already applies there.
import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';
import { CLOUD_SHAPE_KINDS } from '../library/cloud-icon-catalog';

const SHAPE_ICONS: Record<string, string> = {
  region: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z"/></svg>',
  az: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="8.5" y="14" width="7" height="7" rx="1"/></svg>',
  vpc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>',
  subnet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2"><rect x="5" y="7" width="14" height="10" rx="1"/></svg>',
  'resource-group': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 002-2v-9a2 2 0 00-2-2h-7l-2-2H4a2 2 0 00-2 2v11a2 2 0 002 2z"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>',
};

export class CloudFloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private toolbarX: number | null = null;
  private toolbarY: number | null = null;
  private isRepositioning = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor() {
    this.init();
    this.setupListeners();
  }

  private init() {
    const viewport = document.getElementById('cloud-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'cloud-floating-toolbar';
    this.element.className = 'floating-toolbar';
    viewport.appendChild(this.element);

    if (!State.getState().floatingToolbarVisible) {
      this.element.classList.add('hidden');
    }

    this.render();
    this.setupRepositionDrag();
  }

  private setupListeners() {
    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });
    EventBus.on('state:changed', () => this.render());
    EventBus.on('view:toggle-floating-toolbar' as any, () => {
      const newVisible = !State.getState().floatingToolbarVisible;
      State.setState({ floatingToolbarVisible: newVisible });
      if (this.element) this.element.classList.toggle('hidden', !newVisible);
    });
  }

  private setupRepositionDrag() {
    if (!this.element) return;

    this.element.addEventListener('mousedown', (e: MouseEvent) => {
      const handle = (e.target as HTMLElement).closest('.ft-drag-handle');
      if (!handle || !this.element) return;

      e.preventDefault();
      this.isRepositioning = true;

      // Account for CSS zoom scaling on the floating toolbar
      const computedStyle = window.getComputedStyle(this.element);
      const zoomVal = parseFloat((computedStyle as any).zoom) || 1.0;

      const viewport = document.getElementById('cloud-viewport') || document.body;
      const viewportRect = viewport.getBoundingClientRect();
      const rect = this.element.getBoundingClientRect();

      this.dragOffsetX = (e.clientX - rect.left) / zoomVal;
      this.dragOffsetY = (e.clientY - rect.top) / zoomVal;

      const handleMousemove = (moveEvent: MouseEvent) => {
        if (!this.isRepositioning || !this.element) return;

        const currentVpRect = viewport.getBoundingClientRect();
        let left = (moveEvent.clientX - currentVpRect.left) / zoomVal - this.dragOffsetX;
        let top = (moveEvent.clientY - currentVpRect.top) / zoomVal - this.dragOffsetY;

        const unzoomedW = rect.width / zoomVal;
        const unzoomedH = rect.height / zoomVal;
        const vpW = currentVpRect.width / zoomVal;
        const vpH = currentVpRect.height / zoomVal;

        left = Math.max(0, Math.min(left, vpW - unzoomedW));
        top = Math.max(0, Math.min(top, vpH - unzoomedH));

        this.toolbarX = left;
        this.toolbarY = top;
        this.applyPosition();
      };

      const handleMouseup = () => {
        this.isRepositioning = false;
        window.removeEventListener('mousemove', handleMousemove);
        window.removeEventListener('mouseup', handleMouseup);
      };

      window.addEventListener('mousemove', handleMousemove);
      window.addEventListener('mouseup', handleMouseup);
    });
  }

  private applyPosition() {
    if (!this.element || this.toolbarX === null || this.toolbarY === null) return;
    this.element.style.left = `${this.toolbarX}px`;
    this.element.style.top = `${this.toolbarY}px`;
    this.element.style.bottom = 'auto';
    this.element.style.transform = 'none';
  }

  private render() {
    if (!this.element) return;
    const state = State.getState();
    const isSelect = this.currentTool === 'select';
    const isPan = this.currentTool === 'pan';
    const isConnect = this.currentTool === 'cloud-connect';
    const isContainer = this.currentTool === 'cloud-container';

    const shapeButtons = CLOUD_SHAPE_KINDS.map(({ kind, label }) => `
      <button class="ft-btn" id="cft-shape-${kind}" title="Add ${label}">${SHAPE_ICONS[kind]}</button>
    `).join('');

    this.element.innerHTML = `
      <div class="ft-row" id="ft-row-1">
        <div class="ft-drag-handle" title="Drag to reposition toolbar"><span class="ft-toolbar-label">Cloud Toolbar</span><span class="ft-drag-dots">⋮⋮</span></div>

        <div class="ft-section">
          <button class="ft-btn ${isSelect ? 'active' : ''}" id="cft-tool-select" title="Select Tool (V)">
            <svg viewBox="0 0 24 24"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/><path d="M13 13l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <button class="ft-btn ${isPan ? 'active' : ''}" id="cft-tool-pan" title="Pan Tool (H)">✋</button>
        </div>

        <div class="ft-separator"></div>

        <div class="ft-section">
          <button class="ft-btn ft-btn--accent" id="cft-act-undo" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
          </button>
          <button class="ft-btn ft-btn--accent" id="cft-act-redo" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
          </button>
          <button class="ft-btn" id="cft-act-delete" ${!state.selection.length ? 'disabled' : ''} title="Delete Selected (Del)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <div class="ft-section">
          <button class="ft-btn ft-btn--accent ${isConnect ? 'active' : ''}" id="cft-tool-connect" title="Connect Cloud Services (or just drag from any node's connection dot)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10"/></svg>
          </button>
          <button class="ft-btn ft-btn--accent ${isContainer ? 'active' : ''}" id="cft-tool-container" title="Draw a generic Container">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <div class="ft-section">
          ${shapeButtons}
        </div>

        <div class="ft-separator"></div>

        <div class="ft-section">
          <button class="ft-btn ft-btn--accent" id="cft-act-hierarchy" title="Describe Infra in one line (Account/Region/Resource Group/VPC/Subnet)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a2 2 0 002 2h8M6 4h4M6 4a2 2 0 100 4 2 2 0 000-4z"/><circle cx="18" cy="18" r="2"/><path d="M6 10v6a2 2 0 002 2h8"/></svg>
          </button>
        </div>
      </div>
    `;

    this.applyPosition();
    this.bindEvents();
  }

  private bindEvents() {
    if (!this.element) return;
    this.element.querySelector('#cft-tool-select')?.addEventListener('click', () => EventBus.emit('tool:changed', 'select'));
    this.element.querySelector('#cft-tool-pan')?.addEventListener('click', () => EventBus.emit('tool:changed', 'pan'));
    this.element.querySelector('#cft-tool-connect')?.addEventListener('click', () => EventBus.emit('tool:changed', 'cloud-connect'));
    this.element.querySelector('#cft-tool-container')?.addEventListener('click', () => EventBus.emit('tool:changed', 'cloud-container'));
    this.element.querySelector('#cft-act-undo')?.addEventListener('click', () => EventBus.emit('edit:undo', undefined));
    this.element.querySelector('#cft-act-redo')?.addEventListener('click', () => EventBus.emit('edit:redo', undefined));
    this.element.querySelector('#cft-act-delete')?.addEventListener('click', () => EventBus.emit('edit:delete', undefined));
    this.element.querySelector('#cft-act-hierarchy')?.addEventListener('click', () => EventBus.emit('cloudhierarchy:prime' as any, undefined));
    for (const { kind } of CLOUD_SHAPE_KINDS) {
      this.element.querySelector(`#cft-shape-${kind}`)?.addEventListener('click', () => EventBus.emit('cloud-shape:prime' as any, kind));
    }
  }
}
