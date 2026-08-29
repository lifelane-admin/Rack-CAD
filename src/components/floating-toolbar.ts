import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode, SelectableItem, CableData, Point, CableType } from '../core/types';
import { computeSmartRouting, getPortOrientation } from '../utils/routing';
import {
  CABLE_CATEGORIES,
  ALL_CABLE_ITEMS,
  getCableGraphicSvg,
  getPortBadgeSvg,
  PortBadgeType
} from './cable-graphics';

const ORIENTATION_CYCLE: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];

export class FloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private selectedCableId: string | null = null;
  private selectedPointerLabelId: string | null = null;
  private activeCableEnd: 'source' | 'dest' = 'dest';
  private isCableMenuOpen: boolean = false;

  // Toolbar position dragging states
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
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'floating-toolbar';
    this.element.className = 'floating-toolbar';
    viewport.appendChild(this.element);
    if (!State.getState().floatingToolbarVisible) {
      this.element.classList.add('hidden');
    }

    this.render();
    this.setupRepositionDrag();
  }

  private setupListeners() {
    EventBus.on('selection:changed', (selection: SelectableItem[]) => {
      const cableSelection = selection.find(item => item.type === 'cable');
      this.selectedCableId = cableSelection ? cableSelection.id : null;
      const textSelection = selection.find(item => item.type === 'text');
      const textLabel = textSelection ? State.getState().textLabels.find(t => t.id === textSelection.id) : null;
      this.selectedPointerLabelId = (textLabel?.pointerDeviceId && textLabel.pointerStyle === 'flexible') ? textLabel.id : null;
      this.render();
    });

    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });

    EventBus.on('state:changed', () => {
      this.render();
    });

    EventBus.on('view:toggle-floating-toolbar', () => {
      const newVisible = !State.getState().floatingToolbarVisible;
      State.setState({ floatingToolbarVisible: newVisible });
      if (this.element) this.element.classList.toggle('hidden', !newVisible);
    });

    // Close cable popup menu on click outside
    document.addEventListener('click', (e) => {
      if (this.isCableMenuOpen && this.element && !this.element.contains(e.target as Node)) {
        this.isCableMenuOpen = false;
        this.render();
      }
    });
  }

  private setupRepositionDrag() {
    if (!this.element) return;

    const handleMousedown = (e: MouseEvent) => {
      const handle = (e.target as HTMLElement).closest('.ft-drag-handle');
      if (!handle || !this.element) return;

      e.preventDefault();
      this.isRepositioning = true;

      // Account for CSS zoom scaling on the floating toolbar
      const computedStyle = window.getComputedStyle(this.element);
      const zoomVal = parseFloat((computedStyle as any).zoom) || 1.0;

      const viewport = document.getElementById('canvas-viewport') || document.body;
      const viewportRect = viewport.getBoundingClientRect();
      const rect = this.element.getBoundingClientRect();

      this.dragOffsetX = (e.clientX - rect.left) / zoomVal;
      this.dragOffsetY = (e.clientY - rect.top) / zoomVal;

      const handleMousemove = (moveEvent: MouseEvent) => {
        if (!this.isRepositioning || !this.element) return;

        const currentVpRect = viewport.getBoundingClientRect();
        let left = (moveEvent.clientX - currentVpRect.left) / zoomVal - this.dragOffsetX;
        let top = (moveEvent.clientY - currentVpRect.top) / zoomVal - this.dragOffsetY;

        // Constraint checking in unzoomed CSS pixels
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
    };

    this.element.addEventListener('mousedown', handleMousedown);
  }

  private applyPosition() {
    if (!this.element) return;
    if (this.toolbarX !== null && this.toolbarY !== null) {
      this.element.style.left = `${this.toolbarX}px`;
      this.element.style.top = `${this.toolbarY}px`;
      this.element.style.bottom = 'auto';
      this.element.style.transform = 'none';
    }
  }

  private getPortBadgeSvg(badgeType: 'rj45' | 'power' | 'fiber' | 'sfp' | 'serial' | 'sas' | 'video' | 'usb'): string {
    switch (badgeType) {
      case 'power':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <polygon points="4,4 16,4 18,7 18,16 2,16 2,7" fill="#1c2128" stroke="#ffb020" stroke-width="1.2"/>
          <rect x="9" y="6" width="2" height="3" fill="#e1e4e8" rx="0.5"/>
          <rect x="5" y="10" width="3" height="2" fill="#e1e4e8" rx="0.5"/>
          <rect x="12" y="10" width="3" height="2" fill="#e1e4e8" rx="0.5"/>
        </svg>`;
      case 'fiber':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <rect x="2" y="5" width="16" height="10" rx="2" fill="#1c2128" stroke="#00e5ff" stroke-width="1.2"/>
          <circle cx="7" cy="10" r="2.2" fill="#00e5ff" stroke="#00acc1"/>
          <circle cx="13" cy="10" r="2.2" fill="#00e5ff" stroke="#00acc1"/>
        </svg>`;
      case 'sfp':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <rect x="2" y="5" width="16" height="10" rx="2" fill="#1c2128" stroke="#a5d6ff" stroke-width="1.2"/>
          <path d="M6 5v10" stroke="#a5d6ff" stroke-width="1.2"/>
          <path d="M14 8l-3 3-2-2" stroke="#e3b341" stroke-width="1.2"/>
        </svg>`;
      case 'serial':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <polygon points="3,6 17,6 15,14 5,14" fill="#1c2128" stroke="#94a3b8" stroke-width="1.2"/>
          <circle cx="7" cy="9" r="0.8" fill="#ecc94b"/>
          <circle cx="10" cy="9" r="0.8" fill="#ecc94b"/>
          <circle cx="13" cy="9" r="0.8" fill="#ecc94b"/>
          <circle cx="8.5" cy="11.5" r="0.8" fill="#ecc94b"/>
          <circle cx="11.5" cy="11.5" r="0.8" fill="#ecc94b"/>
        </svg>`;
      case 'sas':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <rect x="2" y="5" width="16" height="10" rx="1.5" fill="#1c2128" stroke="#22c55e" stroke-width="1.2"/>
          <line x1="6" y1="8" x2="14" y2="8" stroke="#22c55e" stroke-width="1"/>
          <line x1="6" y1="12" x2="14" y2="12" stroke="#22c55e" stroke-width="1"/>
        </svg>`;
      case 'video':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <polygon points="3,6 17,6 16,14 4,14" fill="#1c2128" stroke="#38bdf8" stroke-width="1.2"/>
          <rect x="6" y="8" width="8" height="4" rx="0.5" fill="#0284c7"/>
        </svg>`;
      case 'usb':
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <rect x="3" y="6" width="14" height="8" rx="1.5" fill="#1c2128" stroke="#c084fc" stroke-width="1.2"/>
          <rect x="6" y="8.5" width="3" height="3" fill="#e2e8f0"/>
          <rect x="11" y="8.5" width="3" height="3" fill="#e2e8f0"/>
        </svg>`;
      default: // rj45
        return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <rect x="2" y="3" width="16" height="14" rx="2" fill="#1c2128" stroke="#58a6ff" stroke-width="1.2"/>
          <path d="M6 17v-4h8v4" stroke="#58a6ff" stroke-width="1.2"/>
          <line x1="6" y1="6.5" x2="6" y2="9" stroke="#f1e05a" stroke-width="1.2"/>
          <line x1="8.5" y1="6.5" x2="8.5" y2="9" stroke="#f1e05a" stroke-width="1.2"/>
          <line x1="11.5" y1="6.5" x2="11.5" y2="9" stroke="#f1e05a" stroke-width="1.2"/>
          <line x1="14" y1="6.5" x2="14" y2="9" stroke="#f1e05a" stroke-width="1.2"/>
        </svg>`;
    }
  }

  private render() {
    if (!this.element) return;

    const state = State.getState();
    const cable = this.selectedCableId ? State.getCable(this.selectedCableId) : null;
    const pointerLabel = this.selectedPointerLabelId ? state.textLabels.find(t => t.id === this.selectedPointerLabelId) : null;
    const anchorTarget = cable ?? pointerLabel;

    const isSelect = this.currentTool === 'select';
    const isPan = this.currentTool === 'pan';
    const isCableMode = this.currentTool === 'cable' || this.currentTool === 'power';
    const isTextMode = this.currentTool === 'text';
    const isLabelMode = this.currentTool === 'label';
    const isAirdropDestination = !!state.airdropDestination;
    const show3D = !!state.show3DPanel;

    const activeColor = cable ? cable.color : (state.selectedCableColor || '#2563eb');
    const selectedType = state.selectedCableType || 'general';
    const activeCatalogOption = ALL_CABLE_ITEMS.find(c => c.type === selectedType) || ALL_CABLE_ITEMS[0];

    const swatches = [
      '#fb8c00', // Orange
      '#f57c00', // Amber
      '#fdd835', // Yellow
      '#43a047', // Green
      '#8e24aa', // Purple
      '#1e88e5', // Blue
      '#e53935', // Red
    ];

    this.element.innerHTML = `
      <!-- Row 1: Drag handle, Select, Rotate, Move, Undo, Redo, Delete, Anchors, Inserts, 2D/3D -->
      <div class="ft-row" id="ft-row-1">
        <div class="ft-drag-handle" title="Drag to reposition toolbar">
          <span class="ft-drag-dots">⋮⋮</span>
        </div>

        <div class="ft-separator"></div>

        <!-- Select Tool -->
        <button class="ft-btn ${isSelect ? 'active' : ''}" id="ft-tool-select" title="Select Tool (V)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/>
          </svg>
        </button>

        <!-- Actions with sub-labels -->
        <div class="ft-item-labeled">
          <button class="ft-btn" id="ft-cab-rotate-end" ${!cable ? 'disabled' : ''} title="Rotate Port Exit Direction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l6.13-5.19"/>
            </svg>
          </button>
          <span class="ft-btn-label">Rotate Port</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn ${isPan ? 'active' : ''}" id="ft-tool-pan" title="Move / Pan Canvas (H)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v3"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
          <span class="ft-btn-label">Move</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn" id="ft-act-undo" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
          </button>
          <span class="ft-btn-label">Undo</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn" id="ft-act-redo" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
            </svg>
          </button>
          <span class="ft-btn-label">Redo</span>
        </div>

        <button class="ft-btn" id="ft-act-delete" ${!state.selection.length ? 'disabled' : ''} title="Delete Selected (Del)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>

        <div class="ft-separator"></div>

        <!-- Anchor Points Group -->
        <div class="ft-group-container">
          <span class="ft-group-header">ANCHOR POINTS</span>
          <div class="ft-group-buttons">
            <button class="ft-btn" id="ft-cab-rem-anchor" ${!anchorTarget ? 'disabled' : ''} title="Remove Last Anchor Point">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="3"/>
                <line x1="12" y1="22" x2="12" y2="8"/>
                <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
                <line x1="16" y1="9" x2="22" y2="9"/>
              </svg>
            </button>
            <button class="ft-btn" id="ft-cab-add-anchor" ${!anchorTarget ? 'disabled' : ''} title="Add Anchor Point">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="3"/>
                <line x1="12" y1="22" x2="12" y2="8"/>
                <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
                <line x1="19" y1="6" x2="19" y2="12"/>
                <line x1="16" y1="9" x2="22" y2="9"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="ft-separator"></div>

        <!-- Insert Group -->
        <div class="ft-group-container">
          <span class="ft-group-header">INSERT</span>
          <div class="ft-group-buttons">
            <div class="ft-item-labeled">
              <button class="ft-btn ${isTextMode ? 'active' : ''}" id="ft-tool-text" title="Text (T)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16M12 6v14M9 20h6"/>
                </svg>
              </button>
              <span class="ft-btn-label">Text</span>
            </div>

            <div class="ft-item-labeled">
              <button class="ft-btn ${isLabelMode ? 'active' : ''}" id="ft-tool-label" title="Device Callout Label (L)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <span class="ft-btn-label">Labels</span>
            </div>

            <div class="ft-item-labeled">
              <button class="ft-btn" id="ft-insert-image" title="Insert Image / Diagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
              </button>
              <span class="ft-btn-label">Image</span>
            </div>
          </div>
        </div>

        <div class="ft-separator"></div>

        <!-- 2D / 3D Switch -->
        <div class="ft-2d-3d-toggle ${show3D ? 'is-3d' : ''}" id="ft-toggle-3d-panel" title="Toggle 2D Elevation / 3D Model View">
          <span class="ft-toggle-label ${!show3D ? 'active' : ''}">2D</span>
          <div class="ft-toggle-knob"></div>
          <span class="ft-toggle-label ${show3D ? 'active' : ''}">3D</span>
        </div>
      </div>

      <!-- Row 2: Cable Type Selector Pill, AirDrop, Color Swatches Capsule, AI Mode -->
      <div class="ft-row" id="ft-row-2">
        <!-- Cable Selector Pill -->
        <div class="ft-cable-selector ${this.isCableMenuOpen ? 'menu-open' : ''} ${isCableMode ? 'active' : ''}" id="ft-cable-selector-btn" title="Click to choose cable type and start cabling">
          <div class="ft-cable-icon-badge">
            ${getPortBadgeSvg(activeCatalogOption.portBadgeType)}
          </div>
          <div class="ft-cable-graphic">
            ${getCableGraphicSvg(activeCatalogOption.type, 90, 20)}
          </div>
          <span class="ft-cable-text">${activeCatalogOption.subLabel}</span>
          <span class="ft-cable-chevron">▼</span>
        </div>

        <!-- AirDrop Tool Button -->
        <div class="ft-item-labeled">
          <button class="ft-btn ${isAirdropDestination ? 'active' : ''}" id="ft-toggle-airdrop-dest" title="AirDrop: Finish cable anywhere on canvas without requiring destination port">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>
              <path d="M12 4v11"/>
              <path d="M8 11l4 4 4-4"/>
            </svg>
          </button>
          <span class="ft-btn-label" style="color: ${isAirdropDestination ? '#58a6ff' : '#8b929d'}">AirDrop</span>
        </div>

        <!-- Color Palette Swatches Capsule -->
        <div class="ft-colors-capsule" id="ft-cable-colors">
          <div class="ft-colors-core-bubble">
            ${['#fb8c00', '#f57c00', '#fdd835', '#43a047', '#8e24aa'].map(hex => `
              <div class="ft-swatch ${activeColor.toLowerCase() === hex.toLowerCase() ? 'active' : ''}"
                   style="background-color: ${hex}; color: ${hex};"
                   data-color="${hex}"></div>
            `).join('')}
          </div>
          ${['#1e88e5', '#e53935'].map(hex => `
            <div class="ft-swatch ${activeColor.toLowerCase() === hex.toLowerCase() ? 'active' : ''}"
                 style="background-color: ${hex}; color: ${hex};"
                 data-color="${hex}"></div>
          `).join('')}
          <button class="ft-color-add-btn" id="ft-color-add-btn" title="Add custom color">+</button>
          <input type="color" id="ft-custom-color-input" style="position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0;" />
        </div>

        <!-- AI Mode Button (Neon Gradient Ring) -->
        <div class="ft-ai-btn" id="ft-ai-mode-btn" title="AI Autonomous Layout & Wiring Mode">
          <span class="ft-ai-text">ai</span>
          <span class="ft-ai-sub">Mode</span>
          <div class="ft-ai-tooltip">🤖 AI Mode — Coming Soon</div>
        </div>
      </div>

      <!-- Popover Cable Type Menu -->
      ${this.isCableMenuOpen ? `
        <div class="ft-cable-menu" id="ft-cable-menu">
          ${CABLE_CATEGORIES.map(cat => `
            <div class="ft-cable-menu-category">${cat.category}</div>
            ${cat.items.map(c => `
              <div class="ft-cable-menu-item ${c.type === selectedType ? 'active' : ''}" data-type="${c.type}" data-power="${c.isPower}" data-color="${c.defaultColor}">
                <div class="ft-cable-menu-graphic">
                  ${getCableGraphicSvg(c.type, 85, 18)}
                </div>
                <span class="ft-cable-menu-label">${c.subLabel}</span>
              </div>
            `).join('')}
          `).join('')}
        </div>
      ` : ''}
    `;

    this.applyPosition();
    this.bindEvents();
  }

  private bindEvents() {
    if (!this.element) return;

    this.element.querySelector('#ft-tool-select')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'select');
    });
    this.element.querySelector('#ft-tool-pan')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'pan');
    });
    this.element.querySelector('#ft-tool-text')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'text');
    });
    this.element.querySelector('#ft-tool-label')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'label');
    });
    this.element.querySelector('#ft-insert-image')?.addEventListener('click', () => {
      EventBus.emit('image:insert' as any, undefined);
    });
    this.element.querySelector('#ft-toggle-airdrop-dest')?.addEventListener('click', () => {
      EventBus.emit('cable:toggle-airdrop-destination', undefined);
    });
    this.element.querySelector('#ft-toggle-3d-panel')?.addEventListener('click', () => {
      EventBus.emit('view:toggle-3d-panel', undefined);
    });
    this.element.querySelector('#ft-act-undo')?.addEventListener('click', () => {
      EventBus.emit('edit:undo', undefined);
    });
    this.element.querySelector('#ft-act-redo')?.addEventListener('click', () => {
      EventBus.emit('edit:redo', undefined);
    });
    this.element.querySelector('#ft-act-delete')?.addEventListener('click', () => {
      EventBus.emit('edit:delete', undefined);
    });

    // Cable selector pill dropdown toggle
    this.element.querySelector('#ft-cable-selector-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isCableMenuOpen = !this.isCableMenuOpen;
      this.render();
    });

    // Cable menu item selection
    this.element.querySelectorAll('.ft-cable-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = (item as HTMLElement).getAttribute('data-type') as CableType;
        const isPower = (item as HTMLElement).getAttribute('data-power') === 'true';
        const defaultColor = (item as HTMLElement).getAttribute('data-color') || '#1e88e5';

        const matched = ALL_CABLE_ITEMS.find(c => c.type === type);
        State.setState({
          selectedCableType: type,
          selectedCableColor: matched?.defaultColor || defaultColor,
          selectedCableTermination: matched?.termination || 'RJ45 Modular',
          selectedCableBend: 15,
        });

        EventBus.emit('tool:changed', isPower ? 'power' : 'cable');
        EventBus.emit('state:changed', State.getState());
        if (matched) {
          EventBus.emit('notification', {
            message: `Selected ${matched.label}. Click any port to start routing!`,
            type: 'info',
          });
        }

        this.isCableMenuOpen = false;
        this.render();
      });
    });

    // Custom color input trigger
    const colorInput = this.element.querySelector('#ft-custom-color-input') as HTMLInputElement;
    this.element.querySelector('#ft-color-add-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      colorInput?.click();
    });

    colorInput?.addEventListener('input', (e: any) => {
      const color = e.target.value;
      if (this.selectedCableId) {
        EventBus.emit('cable:update', { id: this.selectedCableId, data: { color } });
      } else {
        State.setState({ selectedCableColor: color });
        EventBus.emit('notification', { message: `Active cable color changed to ${color}`, type: 'info' });
      }
      this.render();
    });

    // AI Mode Button Click & Hover
    this.element.querySelector('#ft-ai-mode-btn')?.addEventListener('click', () => {
      EventBus.emit('notification', {
        message: '✨ AI Mode is coming soon! Automated rack layout and auto-wiring engine is in development.',
        type: 'info'
      });
    });

    if (this.selectedCableId) {
      const cableId = this.selectedCableId;
      const cable = State.getCable(cableId);

      if (cable) {
        this.element.querySelector('#ft-cab-add-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : computeSmartRouting(cable, sourcePos, destPos))];
          
          const fullSeq = [sourcePos, ...currentPts, destPos];
          let maxDist = -1;
          let maxIdx = 0;
          for (let i = 0; i < fullSeq.length - 1; i++) {
            const dist = Math.hypot(fullSeq[i + 1].x - fullSeq[i].x, fullSeq[i + 1].y - fullSeq[i].y);
            if (dist > maxDist) {
              maxDist = dist;
              maxIdx = i;
            }
          }
          const pA = fullSeq[maxIdx];
          const pB = fullSeq[maxIdx + 1];
          const newPt: Point = {
            x: Math.round((pA.x + pB.x) / 2),
            y: Math.round((pA.y + pB.y) / 2)
          };
          currentPts.splice(maxIdx, 0, newPt);
          EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: true } });
          EventBus.emit('notification', { message: `Anchor point added (${currentPts.length} total)`, type: 'info' });
          this.render();
        });

        this.element.querySelector('#ft-cab-rem-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          
          let currentPts: Point[] = [];
          if (cable.anchorPoints && cable.anchorPoints.length > 0) {
            currentPts = [...cable.anchorPoints];
          } else {
            // Materialize current smart routing anchors to allow immediate reduction
            currentPts = [...computeSmartRouting(cable, sourcePos, destPos)];
          }

          if (currentPts.length > 0) {
            currentPts.pop();
            EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: true } });
            EventBus.emit('notification', { message: `Anchor point removed (${currentPts.length} remaining)`, type: 'info' });
          } else {
            // Zero anchors: direct straight line
            EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: [], anchorsLocked: true } });
            EventBus.emit('notification', { message: `All anchor points removed`, type: 'info' });
          }
          this.render();
        });

        this.element.querySelector('#ft-cab-rotate-end')?.addEventListener('click', () => {
          const end = State.getState().activeCableEnd || this.activeCableEnd || 'dest';
          const field = end === 'source' ? 'sourceOrientation' : 'destOrientation';
          const current = cable[field] || getPortOrientation(cable, end);
          let idx = ORIENTATION_CYCLE.indexOf(current as any);
          if (idx < 0) idx = 0;
          const next = ORIENTATION_CYCLE[(idx + 1) % ORIENTATION_CYCLE.length];
          EventBus.emit('cable:update', { id: cableId, data: { [field]: next, anchorPoints: [], anchorsLocked: false } });
          this.render();
        });
      }
    } else if (this.selectedPointerLabelId) {
      const labelId = this.selectedPointerLabelId;
      const label = State.getState().textLabels.find(t => t.id === labelId);

      if (label && label.pointerDeviceId) {
        this.element.querySelector('#ft-cab-add-anchor')?.addEventListener('click', () => {
          const origin = State.getDeviceWorldOrigin(label.pointerDeviceId!);
          const deviceWorld = origin ? { x: origin.x + (label.pointerAnchorX ?? 0), y: origin.y + (label.pointerAnchorY ?? 0) } : { x: label.x, y: label.y };
          const currentPts = [...(label.pointerAnchorPoints ?? [])];
          const lastPt = currentPts[currentPts.length - 1] || deviceWorld;
          currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
          EventBus.emit('textlabel:update', { id: labelId, data: { pointerAnchorPoints: currentPts } });
          EventBus.emit('notification', { message: `Pointer anchor point added`, type: 'info' });
          this.render();
        });

        this.element.querySelector('#ft-cab-rem-anchor')?.addEventListener('click', () => {
          const currentPts = [...(label.pointerAnchorPoints ?? [])];
          if (currentPts.length > 0) {
            currentPts.pop();
            EventBus.emit('textlabel:update', { id: labelId, data: { pointerAnchorPoints: currentPts } });
            EventBus.emit('notification', { message: `Pointer anchor point removed`, type: 'info' });
            this.render();
          }
        });
      }
    }

    this.element.querySelectorAll('.ft-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e: any) => {
        const color = e.target.getAttribute('data-color');
        if (this.selectedCableId) {
          EventBus.emit('cable:update', { id: this.selectedCableId, data: { color } });
        } else {
          State.setState({ selectedCableColor: color });
          EventBus.emit('notification', { message: `Active cable color changed.`, type: 'info' });
        }
      });
    });
  }
}
