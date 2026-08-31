/**
 * Cloud Architecture Floating Toolbar — strict 2-row compact glass-dark design.
 *
 * Row 1 (tools):  ⋮⋮ drag | Select · Pan | Undo · Redo · Delete | Connect · Container |
 *                 provider-aware boundary shapes | Hierarchy wizard
 * Row 2 (context): AWS · Azure · GCP · Generic provider pills | Export SVG · Export PNG |
 *                  Lock selection | Customize button
 *
 * Provider-awareness: boundary shape labels adapt to the active cloud
 * (VPC for AWS, VNet for Azure, VPC Network for GCP).
 * Active provider is persisted in localStorage.
 */
import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode, CloudProvider } from '../core/types';
import { CLOUD_SHAPE_KINDS } from '../library/cloud-icon-catalog';


// ── Provider-aware terminology ─────────────────────────────────────────────
type ProviderTerms = {
  accentColor: string;
  region: string; az: string; network: string;
  subnet: string; group: string; account: string;
};
const PROVIDER_TERMS: Record<CloudProvider, ProviderTerms> = {
  aws:    { accentColor:'#FF9900', region:'Region', az:'AZ',   network:'VPC',         subnet:'Subnet', group:'Resource Group', account:'Account'      },
  azure:  { accentColor:'#0078D4', region:'Region', az:'Zone', network:'VNet',         subnet:'Subnet', group:'Resource Group', account:'Subscription'  },
  gcp:    { accentColor:'#4285F4', region:'Region', az:'Zone', network:'VPC Network',  subnet:'Subnet', group:'Folder',         account:'Project'       },
  onprem: { accentColor:'#64748B', region:'Region', az:'Zone', network:'VPC',          subnet:'Subnet', group:'Group',          account:'Account'       },
};
const KIND_TERM_KEY: Record<string, keyof ProviderTerms> = {
  region:'region', az:'az', vpc:'network', subnet:'subnet', 'resource-group':'group', account:'account',
};
// ── Icon map ──────────────────────────────────────────────────────────────────
const I = {
  select:    `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4l6.5 15.5 2.3-6.7 6.7-2.3z" fill="currentColor"/><path d="M12.5 12.5l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  pan:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V8a2 2 0 0 0-4 0v3"/><path d="M14 11V6a2 2 0 0 0-4 0v5"/><path d="M10 11V5a2 2 0 0 0-4 0v8"/><path d="M6 13c.6 2.4 2 5 4 7h4c2-2 3.4-4.6 4-7H6z"/></svg>`,
  undo:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17A9 9 0 0 0 6.3 9.3L3 13"/></svg>`,
  redo:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17A9 9 0 0 1 17.7 9.3L21 13"/></svg>`,
  delete:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  connect:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10"/></svg>`,
  container: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  region:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>`,
  az:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="8.5" y="14" width="7" height="7" rx="1"/></svg>`,
  vpc:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  subnet:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2"><rect x="5" y="7" width="14" height="10" rx="1"/></svg>`,
  group:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  account:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>`,
  hierarchy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><path d="M7 6h10"/><circle cx="19" cy="6" r="2"/><path d="M12 8v8"/><circle cx="12" cy="18" r="2"/></svg>`,
  exportSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  exportPng: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  lock:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  customize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
};
const KIND_ICON: Record<string, keyof typeof I> = {
  region:'region', az:'az', vpc:'vpc', subnet:'subnet', 'resource-group':'group', account:'account',
};
const PROVIDER_LOGOS: Record<CloudProvider, string> = {
  aws:    `<svg viewBox="0 0 40 16" width="36" height="14"><text y="13" fill="#FF9900" font-family="system-ui,sans-serif" font-weight="800" font-size="13">AWS</text></svg>`,
  azure:  `<svg viewBox="0 0 52 16" width="46" height="14"><text y="13" fill="#0078D4" font-family="system-ui,sans-serif" font-weight="800" font-size="12">Azure</text></svg>`,
  gcp:    `<svg viewBox="0 0 40 16" width="34" height="14"><text y="13" fill="#4285F4" font-family="system-ui,sans-serif" font-weight="800" font-size="13">GCP</text></svg>`,
  onprem: `<svg viewBox="0 0 72 16" width="60" height="14"><text y="13" fill="#94A3B8" font-family="system-ui,sans-serif" font-weight="700" font-size="11">Generic</text></svg>`,
};
const CFT_STORAGE_KEY = 'cft_active_provider';

export class CloudFloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private toolbarX: number | null = null;
  private toolbarY: number | null = null;
  private isRepositioning = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private activeProvider: CloudProvider = 'aws';

  constructor() {
    const saved = localStorage.getItem(CFT_STORAGE_KEY) as CloudProvider | null;
    if (saved && saved in PROVIDER_TERMS) this.activeProvider = saved;
    this.init();
    this.setupListeners();
  }

  private init() {
    const viewport = document.getElementById('cloud-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'cloud-floating-toolbar';
    this.element.className = 'floating-toolbar cft-2row';
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
    const state       = State.getState();
    const terms       = PROVIDER_TERMS[this.activeProvider];
    const isSelect    = this.currentTool === 'select';
    const isPan       = this.currentTool === 'pan';
    const isConnect   = this.currentTool === 'cloud-connect';
    const isContainer = this.currentTool === 'cloud-container';
    const hasSel      = state.selection && state.selection.length > 0;

    // Build provider-aware shape buttons
    const shapeTermKey: Record<string, keyof ProviderTerms> = {
      region: 'region', az: 'az', vpc: 'network',
      subnet: 'subnet', 'resource-group': 'group', account: 'account',
    };
    const shapeButtons = CLOUD_SHAPE_KINDS.map(({ kind }) => {
      const icoKey = KIND_ICON[kind] ?? 'container';
      const termKey = shapeTermKey[kind];
      const label = termKey ? String(terms[termKey]) : kind;
      return `
        <div class="cft-shape-item">
          <button class="ft-btn cft-shape-btn" id="cft-shape-${kind}" title="Draw ${label}">${I[icoKey] ?? I.container}</button>
          <span class="cft-shape-label">${label}</span>
        </div>`;
    }).join('');

    this.element.innerHTML = `
      <!-- ══ ROW 1 — TOOLS ═══════════════════════════════════════════════════ -->
      <div class="ft-row cft-row1" id="cft-row1">
        <div class="ft-drag-handle" title="Drag to reposition">
          <span class="ft-drag-dots">⋮⋮</span>
        </div>

        <button class="ft-btn ${isSelect ? 'active' : ''}" id="cft-tool-select" title="Select (V)">${I.select}</button>
        <button class="ft-btn ${isPan    ? 'active' : ''}" id="cft-tool-pan"    title="Pan (H)">${I.pan}</button>

        <div class="ft-separator"></div>

        <button class="ft-btn" id="cft-act-undo"   title="Undo (Ctrl+Z)">${I.undo}</button>
        <button class="ft-btn" id="cft-act-redo"   title="Redo (Ctrl+Y)">${I.redo}</button>
        <button class="ft-btn" id="cft-act-delete" ${hasSel ? '' : 'disabled'} title="Delete (Del)">${I.delete}</button>

        <div class="ft-separator"></div>

        <button class="ft-btn ${isConnect   ? 'active' : ''}" id="cft-tool-connect"   title="Connect services">${I.connect}</button>
        <button class="ft-btn ${isContainer ? 'active' : ''}" id="cft-tool-container" title="Draw container">${I.container}</button>

        <div class="ft-separator"></div>

        <!-- Provider-aware boundary shapes -->
        <div class="cft-shapes-row">${shapeButtons}</div>

        <div class="ft-separator"></div>

        <button class="ft-btn" id="cft-act-hierarchy" title="Hierarchy wizard">${I.hierarchy}</button>
      </div>

      <!-- ══ ROW 2 — PROVIDER / CONTEXT ════════════════════════════════════ -->
      <div class="ft-row cft-row2" id="cft-row2">

        <!-- Provider pills -->
        <span class="cft-provider-label">Provider</span>
        ${(['aws', 'azure', 'gcp', 'onprem'] as CloudProvider[]).map(p => `
          <button class="cft-provider-pill ${this.activeProvider === p ? 'active' : ''}"
                  id="cft-provider-${p}"
                  style="--pill-accent:${PROVIDER_TERMS[p].accentColor}"
                  title="${p.toUpperCase()}">${PROVIDER_LOGOS[p]}</button>
        `).join('')}

        <div class="ft-separator"></div>

        <!-- Export -->
        <div class="cft-labeled-btn">
          <button class="ft-btn" id="cft-act-export-svg" title="Export as SVG">${I.exportSvg}</button>
          <span class="cft-btn-label">SVG</span>
        </div>
        <div class="cft-labeled-btn">
          <button class="ft-btn" id="cft-act-export-png" title="Export as PNG">${I.exportPng}</button>
          <span class="cft-btn-label">PNG</span>
        </div>

        <div class="ft-separator"></div>

        <!-- Lock -->
        <button class="ft-btn" id="cft-act-lock" ${hasSel ? '' : 'disabled'} title="Lock / unlock selected">${I.lock}</button>

        <!-- Flex spacer -->
        <div style="flex:1"></div>

        <!-- Customize -->
        <button class="ft-btn cft-customize-btn" id="cft-act-customize" title="Customize toolbar">${I.customize}</button>
      </div>
    `;

    this.applyPosition();
    this.bindEvents();
  }

  private bindEvents() {
    if (!this.element) return;
    const q = (id: string) => this.element!.querySelector(`#${id}`);

    // Tools
    q('cft-tool-select')?.addEventListener('click',    () => EventBus.emit('tool:changed', 'select'));
    q('cft-tool-pan')?.addEventListener('click',       () => EventBus.emit('tool:changed', 'pan'));
    q('cft-tool-connect')?.addEventListener('click',   () => EventBus.emit('tool:changed', 'cloud-connect'));
    q('cft-tool-container')?.addEventListener('click', () => EventBus.emit('tool:changed', 'cloud-container'));

    // Edit
    q('cft-act-undo')?.addEventListener('click',   () => EventBus.emit('edit:undo', undefined));
    q('cft-act-redo')?.addEventListener('click',   () => EventBus.emit('edit:redo', undefined));
    q('cft-act-delete')?.addEventListener('click', () => EventBus.emit('edit:delete', undefined));

    // Shapes
    for (const { kind } of CLOUD_SHAPE_KINDS) {
      q(`cft-shape-${kind}`)?.addEventListener('click', () => EventBus.emit('cloud-shape:prime' as any, kind));
    }

    // Hierarchy wizard (pass active provider so it knows the terminology)
    q('cft-act-hierarchy')?.addEventListener('click', () => EventBus.emit('cloudhierarchy:prime' as any, this.activeProvider));

    // Provider pills
    const providers: CloudProvider[] = ['aws', 'azure', 'gcp', 'onprem'];
    for (const p of providers) {
      q(`cft-provider-${p}`)?.addEventListener('click', () => {
        this.activeProvider = p;
        localStorage.setItem(CFT_STORAGE_KEY, p);
        this.render();
      });
    }

    // Export
    q('cft-act-export-svg')?.addEventListener('click', () => EventBus.emit('export:cloud-svg' as any, undefined));
    q('cft-act-export-png')?.addEventListener('click', () => EventBus.emit('export:cloud-png' as any, undefined));

    // Lock
    q('cft-act-lock')?.addEventListener('click', () => EventBus.emit('notification', {
      message: 'Lock/unlock selection — coming soon!', type: 'info'
    }));

    // Customize
    q('cft-act-customize')?.addEventListener('click', () => EventBus.emit('notification', {
      message: '🔧 Toolbar customization panel — drag-to-reorder is coming in the next release!', type: 'info'
    }));
  }
}

