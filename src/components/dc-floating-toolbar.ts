/**
 * Datacenter Floating Toolbar — 2-Row Compact Glass-Dark Quick Access Toolbar
 *
 * Row 1 (Tools & Views):
 *   ⋮⋮ Drag | ⇄ Swap to Rack Elevation | Select (S) · Move (M) | 2D/3D Toggle · ↻ Rotate 2D · 🦴 X-Ray |
 *   ⊞ Grid · ⌂ Snap · ▦ Grid-Lock · 🏷 Labels | ⤢ Fit (Z) · ＋ Zoom In · － Zoom Out | 📦 Catalog
 *
 * Row 2 (Context-Aware Action Palette & Components Selector Dropdown):
 *   - Default:        Components Selector Pill (SVG Icon + Graphic + Code + Dropdown) + Quick Add Presets + Add Row
 *   - Rack Selected:  📦 Rack Info · ⚙ Work on Rack · ↻ Rotate 90° · ⊕ Duplicate · 🔄 Swap/Optimize Cabinet · 📊 HUD · 🗑 Delete
 *   - Tiles Selected: ▦ Tile Info · 🔲 Vent Grille · ▦ Perf Panel · 💨 Air Channel · ⚡ Add Pathway · ↺ Standard
 */

import EventBus from '../core/event-bus';
import State from '../core/state';
import { dcState, getRowLabel, getColLabel } from '../datacenter/dc-state';
import {
  ALL_DC_COMPONENTS,
  DC_COMPONENT_CATEGORIES,
  DcComponentItem,
  getDcComponentGraphicSvg,
  getDcComponentBadgeSvg,
  ensureDcSvgDefs
} from './dc-component-graphics';
import { DATACENTER_CATALOG } from '../datacenter/catalog';

const DC_FT_STORAGE_X = 'dc_ft_pos_x';
const DC_FT_STORAGE_Y = 'dc_ft_pos_y';

export class DcFloatingToolbar {
  private element: HTMLElement | null = null;
  private toolbarX: number | null = null;
  private toolbarY: number | null = null;
  private isRepositioning = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  // Dropdown States
  private isComponentMenuOpen = false;
  private isOptimizeMenuOpen = false;
  private activeCategoryTab = 'racks';
  private pathwaySubfilter: 'all' | 'underfloor' | 'overhead' = 'all';
  private componentSearchQuery = '';
  private selectedComponentId = 'rack-server-42u';

  constructor() {
    const savedX = localStorage.getItem(DC_FT_STORAGE_X);
    const savedY = localStorage.getItem(DC_FT_STORAGE_Y);
    if (savedX) this.toolbarX = parseFloat(savedX);
    if (savedY) this.toolbarY = parseFloat(savedY);

    ensureDcSvgDefs();
    this.init();
    this.setupListeners();
  }

  private init() {
    const viewport = document.getElementById('dc-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'dc-floating-toolbar';
    this.element.className = 'floating-toolbar dc-floating-toolbar';
    viewport.appendChild(this.element);

    if (!State.getState().floatingToolbarVisible) {
      this.element.classList.add('hidden');
    }

    this.render();
    this.setupRepositionDrag();
    this.applyPosition();
  }

  private setupListeners() {
    dcState.subscribe(() => this.render());

    EventBus.on('view:toggle-floating-toolbar' as any, () => {
      const newVisible = !State.getState().floatingToolbarVisible;
      State.setState({ floatingToolbarVisible: newVisible });
      if (this.element) this.element.classList.toggle('hidden', !newVisible);
    });

    EventBus.on('view:changed', () => {
      this.render();
    });

    // Close menus on click outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        (this.isComponentMenuOpen || this.isOptimizeMenuOpen) &&
        this.element &&
        !this.element.contains(target) &&
        !target.closest('.dc-component-menu') &&
        !target.closest('.dc-optimize-popover')
      ) {
        this.isComponentMenuOpen = false;
        this.isOptimizeMenuOpen = false;
        this.render();
      }
    });
  }

  private setupRepositionDrag() {
    if (!this.element) return;

    this.element.addEventListener('mousedown', (e: MouseEvent) => {
      const handle = (e.target as HTMLElement).closest('.ft-drag-handle');
      if (!handle || !this.element) return;

      e.preventDefault();
      this.isRepositioning = true;

      const computedStyle = window.getComputedStyle(this.element);
      const zoomVal = parseFloat((computedStyle as any).zoom) || 1.0;

      const viewport = document.getElementById('dc-viewport') || document.body;
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
        localStorage.setItem(DC_FT_STORAGE_X, String(left));
        localStorage.setItem(DC_FT_STORAGE_Y, String(top));
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
    if (!this.element) return;
    if (this.toolbarX !== null && this.toolbarY !== null) {
      this.element.style.left = `${this.toolbarX}px`;
      this.element.style.top = `${this.toolbarY}px`;
      this.element.style.bottom = 'auto';
      this.element.style.transform = 'none';
    }
  }

  public render() {
    if (!this.element) return;

    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    const is3D = s.viewMode === '3d';
    const isGrid = s.gridVisible !== false;
    const isSnap = s.snapEnabled !== false;
    const isLabels = s.labelsVisible !== false;
    const isXray = !!s.xrayMode;

    const selectedRack = (s.selectedRackId && floor) ? floor.racks.find(r => r.id === s.selectedRackId) : null;
    const selectedTileIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
    const hasSelectedTiles = selectedTileIds.length > 0 && !selectedRack;

    const currentComponent = ALL_DC_COMPONENTS.find(c => c.id === this.selectedComponentId) || ALL_DC_COMPONENTS[0];

    // Filter components for popover dropdown
    let filteredComponents = ALL_DC_COMPONENTS;
    if (this.componentSearchQuery.trim()) {
      const q = this.componentSearchQuery.toLowerCase();
      filteredComponents = ALL_DC_COMPONENTS.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    } else {
      filteredComponents = ALL_DC_COMPONENTS.filter(c => c.category === this.activeCategoryTab);
      if (this.activeCategoryTab === 'pathways' && this.pathwaySubfilter !== 'all') {
        filteredComponents = filteredComponents.filter(c => c.pathwayLevel === this.pathwaySubfilter);
      }
    }

    // Build Row 2 HTML dynamically based on selection context
    let row2Html = '';

    if (selectedRack) {
      const tileM = (floor?.tileSizeMm || 600) / 1000;
      const colIdx = Math.floor(selectedRack.position.x / tileM);
      const rowIdx = Math.floor(selectedRack.position.y / tileM);
      const gridAddr = `${getRowLabel(rowIdx, floor?.rowScheme ?? 'letters')}-${getColLabel(colIdx, floor?.colScheme ?? 'numbers', floor?.addressFormat ?? 'compact')}`;

      row2Html = `
        <div class="dc-ft-context-group">
          <div class="dc-ft-item-badge">
            <span class="dc-ft-badge-dot" style="background:${selectedRack.color || '#38bdf8'};"></span>
            <span class="dc-ft-badge-title">${selectedRack.name}</span>
            <span class="dc-ft-badge-sub">${selectedRack.heightU}U • ${gridAddr}</span>
          </div>

          <div class="ft-separator"></div>

          <button class="dc-ft-btn-primary" id="dc-ft-work-rack" title="Open Rack Elevation Editor to mount servers, switches, PDUs, and patch cords">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>⚙ Work on Rack</span>
          </button>

          <!-- Swap / Optimize Cabinet Action Dropdown -->
          <button class="dc-ft-pill-btn dc-ft-optimize-btn ${this.isOptimizeMenuOpen ? 'active' : ''}" id="dc-ft-toggle-optimize" title="Swap Cabinet Model or Optimize Dimensions, Airflow & Power Specs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.13-5.19"/>
            </svg>
            <span>🔄 Swap / Optimize</span>
            <span class="dc-ft-chevron">▼</span>
          </button>

          <button class="ft-btn" id="dc-ft-rack-rotate" title="Rotate Rack 90° (Hotkey: R)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.13-5.19"/>
            </svg>
          </button>

          <button class="ft-btn" id="dc-ft-rack-duplicate" title="Duplicate Rack to Adjacent Tile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>

          <button class="ft-btn" id="dc-ft-rack-hud" title="Toggle 3D Floating HUD Style (Radial Dial vs Linear 2-Bars)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </button>

          <button class="ft-btn ft-btn-danger" id="dc-ft-rack-delete" title="Delete Rack">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    } else if (hasSelectedTiles) {
      row2Html = `
        <div class="dc-ft-context-group">
          <div class="dc-ft-item-badge">
            <span class="dc-ft-badge-title">▦ ${selectedTileIds.length} Tile${selectedTileIds.length > 1 ? 's' : ''} Selected</span>
            <span class="dc-ft-badge-sub">Raised Floor Surface</span>
          </div>

          <div class="ft-separator"></div>

          <button class="dc-ft-pill-btn" id="dc-ft-tile-vent" title="Convert to Ventilated Steel Bar Grille">🔲 Vent Grille</button>
          <button class="dc-ft-pill-btn" id="dc-ft-tile-perf" title="Convert to Perforated Airflow Panel">▦ Perf Panel</button>
          <button class="dc-ft-pill-btn" id="dc-ft-tile-ac" title="Convert to Underfloor Air Channel">💨 Air Channel</button>
          <button class="dc-ft-pill-btn" id="dc-ft-tile-duct" title="Add Underfloor Cable Duct Pathway along selected tiles">⚡ Add UF Duct</button>
          <button class="dc-ft-pill-btn" id="dc-ft-tile-std" title="Reset to Standard Floor Panel">↺ Standard</button>
        </div>
      `;
    } else {
      // Default: Equipment & Pathways Dropdown Pill + Quick Presets
      row2Html = `
        <div class="dc-ft-context-group">
          <!-- Components Selection Pill -->
          <div class="dc-component-selector ${this.isComponentMenuOpen ? 'menu-open' : ''}" id="dc-ft-component-selector-btn" title="Click to browse 57+ Racks, Cable Ducts, Power, Cooling & DCIM Components">
            <div class="dc-comp-icon-badge">
              ${getDcComponentBadgeSvg(currentComponent.badgeType)}
            </div>
            <div class="dc-comp-graphic-preview">
              ${getDcComponentGraphicSvg(currentComponent.id, 70, 22)}
            </div>
            <div class="dc-comp-text-col">
              <span class="dc-comp-name">${currentComponent.name}</span>
              <span class="dc-comp-code">${currentComponent.code}</span>
            </div>
            <span class="dc-comp-chevron">▼</span>
          </div>

          <div class="ft-separator"></div>

          <!-- Quick Shortcuts -->
          <button class="dc-ft-quick-btn" data-preset="rack-server-42u-std" title="Add 42U Server Rack (600×1200mm)">＋ Server Rack</button>
          <button class="dc-ft-quick-btn" data-preset="duct-uf-cable" title="Draw Underfloor Cable Duct Pathway">＋ UF Duct</button>
          <button class="dc-ft-quick-btn" data-preset="duct-oh-ladder" title="Draw Overhead Ladder Rack">＋ OH Ladder</button>
          <button class="dc-ft-quick-btn" data-preset="cooling-inrow-dx-300" title="Add In-Row Precision Cooling Unit">＋ In-Row Cooling</button>
          <button class="dc-ft-quick-btn" data-preset="ups-inrow-50kva" title="Add In-Row Modular 3-Phase UPS">＋ Modular UPS</button>
          <button class="dc-ft-quick-btn" id="dc-ft-quick-addrow" title="Add Complete Bayed Row of Racks (Standards)">▤ Add Row</button>
        </div>
      `;
    }

    this.element.innerHTML = `
      <!-- Row 1: Primary View Modes, Tools & Swap Switcher -->
      <div class="ft-row" id="dc-ft-row-1">
        <div class="ft-drag-handle" title="Drag to reposition toolbar">
          <span class="ft-drag-dots">⋮⋮</span>
        </div>

        <div class="ft-separator"></div>

        <!-- ⇄ Swap to Rack Elevation Button -->
        <button class="dc-ft-swap-btn" id="dc-ft-swap-view" title="Swap View: Switch directly to Rack Elevation Editor (Mount Servers & Switches)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
          </svg>
          <span>⇄ Rack Layout</span>
        </button>

        <div class="ft-separator"></div>

        <!-- Tool Mode -->
        <div class="ft-item-labeled">
          <button class="ft-btn active" id="dc-ft-tool-select" title="Select Tool (Hotkey: S)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/>
            </svg>
          </button>
          <span class="ft-btn-label">Select (S)</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn" id="dc-ft-tool-pan" title="Move Rack / Pan Canvas (Hotkey: M)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v3"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
          <span class="ft-btn-label">Move (M)</span>
        </div>

        <div class="ft-separator"></div>

        <!-- 2D / 3D Switch Capsule -->
        <div class="ft-2d-3d-toggle ${is3D ? 'is-3d' : ''}" id="dc-ft-toggle-viewmode" title="Toggle 2D Top Floor Plan / 3D Isometric Real-Rack Data Hall">
          <span class="ft-toggle-label ${!is3D ? 'active' : ''}">2D</span>
          <div class="ft-toggle-knob"></div>
          <span class="ft-toggle-label ${is3D ? 'active' : ''}">3D</span>
        </div>

        <!-- 2D Rotation -->
        <div class="ft-item-labeled" style="${is3D ? 'display:none;' : ''}">
          <button class="ft-btn" id="dc-ft-rotate-2d" title="Rotate 2D Top View 90°">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.13-5.19"/>
            </svg>
          </button>
          <span class="ft-btn-label">Rotate 2D</span>
        </div>

        <!-- X-Ray Mode -->
        <div class="ft-item-labeled">
          <button class="ft-btn ${isXray ? 'active' : ''}" id="dc-ft-toggle-xray" title="Toggle Under-Floor Infrastructure X-Ray Mode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16M4 20L20 4M9 4v16M15 4v16M4 9h16M4 15h16"/>
            </svg>
          </button>
          <span class="ft-btn-label">X-Ray</span>
        </div>

        <div class="ft-separator"></div>

        <!-- Alignment / Grid Group -->
        <div class="ft-group-container">
          <span class="ft-group-header">GRID & SNAP</span>
          <div class="ft-group-buttons">
            <button class="ft-btn ${isGrid ? 'active' : ''}" id="dc-ft-toggle-grid" title="Toggle ESD Grid Lines">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>

            <button class="ft-btn ${isSnap ? 'active' : ''}" id="dc-ft-toggle-snap" title="Toggle Smart Standards Snap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5v14"/>
                <circle cx="12" cy="12" r="9"/>
              </svg>
            </button>

            <button class="ft-btn ${isLabels ? 'active' : ''}" id="dc-ft-toggle-labels" title="Toggle Labels">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="ft-separator"></div>

        <!-- Navigation Group -->
        <div class="ft-item-labeled">
          <button class="ft-btn" id="dc-ft-fit" title="Zoom Fit / Center (Hotkey: Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
          <span class="ft-btn-label">Fit (Z)</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn" id="dc-ft-zoomin" title="Zoom In (+)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <span class="ft-btn-label">Zoom +</span>
        </div>

        <div class="ft-item-labeled">
          <button class="ft-btn" id="dc-ft-zoomout" title="Zoom Out (-)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </button>
          <span class="ft-btn-label">Zoom -</span>
        </div>

        <div class="ft-separator"></div>

        <!-- Left Palette Toggle -->
        <div class="ft-item-labeled">
          <button class="ft-btn" id="dc-ft-toggle-catalog" title="Toggle Equipment Catalog Palette">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </button>
          <span class="ft-btn-label">Catalog</span>
        </div>
      </div>

      <!-- Row 2: Contextual Actions / Components Dropdown -->
      <div class="ft-row" id="dc-ft-row-2">
        ${row2Html}
      </div>

      <!-- Popover 1: Datacenter Components & Ducts Dropdown Menu -->
      ${this.isComponentMenuOpen ? `
        <div class="dc-component-menu" id="dc-component-menu">
          <!-- Search Header -->
          <div class="dc-comp-menu-header">
            <div class="dc-comp-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="dc-comp-search-input" placeholder="Search 57+ components (e.g. 42U, duct, mesh, UPS, CRAC)..." value="${this.componentSearchQuery}" />
              ${this.componentSearchQuery ? '<button id="dc-comp-search-clear">×</button>' : ''}
            </div>
          </div>

          <!-- Category Tabs -->
          <div class="dc-comp-tabs-bar">
            ${DC_COMPONENT_CATEGORIES.map(cat => `
              <button class="dc-comp-tab ${cat.id === this.activeCategoryTab && !this.componentSearchQuery ? 'active' : ''}" data-cat="${cat.id}">
                <span>${cat.icon}</span>
                <span>${cat.label}</span>
                <span class="dc-comp-tab-count">${cat.items.length}</span>
              </button>
            `).join('')}
          </div>

          <!-- Ducts Subfilter (Underfloor ESD vs Roof Overhead) -->
          ${this.activeCategoryTab === 'pathways' && !this.componentSearchQuery ? `
            <div class="dc-comp-subfilters">
              <span class="dc-comp-subfilter-label">PATHWAY LEVEL:</span>
              <button class="dc-comp-subfilter-btn ${this.pathwaySubfilter === 'all' ? 'active' : ''}" data-subfilter="all">All Pathways (8)</button>
              <button class="dc-comp-subfilter-btn ${this.pathwaySubfilter === 'underfloor' ? 'active' : ''}" data-subfilter="underfloor">▼ Under ESD Floor (4)</button>
              <button class="dc-comp-subfilter-btn ${this.pathwaySubfilter === 'overhead' ? 'active' : ''}" data-subfilter="overhead">▲ Overhead / Roof (4)</button>
            </div>
          ` : ''}

          <!-- Component Grid Cards -->
          <div class="dc-comp-grid">
            ${filteredComponents.length === 0 ? `
              <div class="dc-comp-empty">No datacenter components match "${this.componentSearchQuery}"</div>
            ` : filteredComponents.map(item => `
              <div class="dc-comp-card ${item.id === this.selectedComponentId ? 'selected' : ''}" data-comp-id="${item.id}" title="${item.description}">
                <div class="dc-comp-card-badge">${item.code}</div>
                <div class="dc-comp-card-graphic">
                  ${getDcComponentGraphicSvg(item.id, 85, 24)}
                </div>
                <div class="dc-comp-card-body">
                  <div class="dc-comp-card-title">${item.name}</div>
                  <div class="dc-comp-card-sub">${item.pathwayLevel ? (item.pathwayLevel === 'underfloor' ? 'Under ESD Floor' : 'Roof / Overhead Runway') : item.description.slice(0, 50) + '...'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Popover 2: Swap / Optimize Cabinet Menu -->
      ${this.isOptimizeMenuOpen && selectedRack ? `
        <div class="dc-optimize-popover" id="dc-optimize-popover">
          <div class="dc-opt-header">
            <span class="dc-opt-title">🔄 Optimize & Swap Cabinet</span>
            <span class="dc-opt-target">${selectedRack.name}</span>
          </div>

          <!-- Section 1: Cabinet Size & Standard Swap -->
          <div class="dc-opt-section">
            <div class="dc-opt-sec-title">1. CABINET FORM FACTOR & SIZE</div>
            <div class="dc-opt-chips">
              <button class="dc-opt-chip ${selectedRack.heightU === 42 && selectedRack.widthMm === 600 ? 'active' : ''}" data-opt-size="42u-600">42U Standard (600×1000mm)</button>
              <button class="dc-opt-chip ${selectedRack.heightU === 48 && selectedRack.widthMm === 750 ? 'active' : ''}" data-opt-size="48u-750">48U High-Density (750×1200mm)</button>
              <button class="dc-opt-chip ${selectedRack.heightU === 52 ? 'active' : ''}" data-opt-size="52u-800">52U Compute Cluster (800×1200mm)</button>
              <button class="dc-opt-chip ${selectedRack.heightU === 24 ? 'active' : ''}" data-opt-size="24u-600">24U Edge Micro DC (600×1000mm)</button>
              <button class="dc-opt-chip ${selectedRack.type === 'open-frame' ? 'active' : ''}" data-opt-type="open-frame">2-Post Network Frame</button>
              <button class="dc-opt-chip ${selectedRack.type === 'inrow-cooling' ? 'active' : ''}" data-opt-type="inrow-cooling">In-Row Precision Cooler (300mm)</button>
            </div>
          </div>

          <!-- Section 2: Airflow & Containment Optimization -->
          <div class="dc-opt-section">
            <div class="dc-opt-sec-title">2. AIRFLOW & DOOR CONTAINMENT</div>
            <div class="dc-opt-chips">
              <button class="dc-opt-chip ${selectedRack.doorStyle === 'perforated' ? 'active' : ''}" data-opt-door="perforated">Perforated 80% Curved Mesh</button>
              <button class="dc-opt-chip ${selectedRack.doorStyle === 'split-perforated' ? 'active' : ''}" data-opt-door="split-perforated">Split Rear/Front (Narrow Aisle)</button>
              <button class="dc-opt-chip ${selectedRack.containmentType === 'cold-aisle' ? 'active' : ''}" data-opt-containment="cold-aisle">Cold Aisle Contained</button>
              <button class="dc-opt-chip ${selectedRack.containmentType === 'hot-aisle' ? 'active' : ''}" data-opt-containment="hot-aisle">Hot Aisle Vertical Chimney</button>
            </div>
          </div>

          <!-- Section 3: Power Distribution Specs -->
          <div class="dc-opt-section">
            <div class="dc-opt-sec-title">3. POWER & PDU SPECIFICATION</div>
            <div class="dc-opt-chips">
              <button class="dc-opt-chip ${selectedRack.pduVoltage === '230V' && selectedRack.pduAmperage === 16 ? 'active' : ''}" data-opt-power="230v-16a">1-Phase 230V 16A (3.7 kW)</button>
              <button class="dc-opt-chip ${selectedRack.pduVoltage === '230V' && selectedRack.pduAmperage === 32 ? 'active' : ''}" data-opt-power="230v-32a">1-Phase 230V 32A (7.4 kW)</button>
              <button class="dc-opt-chip ${selectedRack.pduVoltage === '415V' && selectedRack.pduPhases === 3 ? 'active' : ''}" data-opt-power="415v-32a">3-Phase 415V 32A Redundant A+B (22 kW)</button>
              <button class="dc-opt-chip ${selectedRack.maxPowerKw === 44 ? 'active' : ''}" data-opt-power="415v-63a">3-Phase 415V 63A Ultra-Dense (44 kW)</button>
            </div>
          </div>

          <!-- Section 4: Cabinet Electronic Security -->
          <div class="dc-opt-section">
            <div class="dc-opt-sec-title">4. SECURITY & ACCESS LOCK</div>
            <div class="dc-opt-chips">
              <button class="dc-opt-chip ${selectedRack.securityLock === 'keyed' ? 'active' : ''}" data-opt-lock="keyed">Keyed Cylinder Handle</button>
              <button class="dc-opt-chip ${selectedRack.securityLock === 'rfid' ? 'active' : ''}" data-opt-lock="rfid">RFID Smart Card Swing-Handle</button>
              <button class="dc-opt-chip ${selectedRack.securityLock === 'biometric' ? 'active' : ''}" data-opt-lock="biometric">Biometric Iris/FP Handle</button>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    this.bindActionEvents();
  }

  private bindActionEvents() {
    if (!this.element) return;

    // ⇄ Swap View Button
    this.element.querySelector('#dc-ft-swap-view')?.addEventListener('click', () => {
      const s = dcState.getState();
      if (s.selectedRackId) {
        EventBus.emit('dc:work-rack', s.selectedRackId);
      } else {
        EventBus.emit('view:switch', 'rack');
      }
    });

    // Tool modes
    this.element.querySelector('#dc-ft-tool-select')?.addEventListener('click', () => {
      EventBus.emit('dc:set-tool', 'select');
    });

    this.element.querySelector('#dc-ft-tool-pan')?.addEventListener('click', () => {
      EventBus.emit('dc:set-tool', 'pan');
    });

    // View mode toggle
    this.element.querySelector('#dc-ft-toggle-viewmode')?.addEventListener('click', () => {
      const is3D = dcState.getState().viewMode === '3d';
      EventBus.emit('dc:set-view', is3D ? '2d' : '3d');
    });

    // 2D Rotation
    this.element.querySelector('#dc-ft-rotate-2d')?.addEventListener('click', () => {
      EventBus.emit('dc:rotate-2d', undefined);
    });

    // X-Ray
    this.element.querySelector('#dc-ft-toggle-xray')?.addEventListener('click', () => {
      EventBus.emit('dc:toggle-xray', undefined);
    });

    // Grid, Snap, Labels
    this.element.querySelector('#dc-ft-toggle-grid')?.addEventListener('click', () => {
      EventBus.emit('dc:toggle-grid', undefined);
    });

    this.element.querySelector('#dc-ft-toggle-snap')?.addEventListener('click', () => {
      EventBus.emit('dc:toggle-snap', undefined);
    });

    this.element.querySelector('#dc-ft-toggle-labels')?.addEventListener('click', () => {
      EventBus.emit('dc:toggle-labels', undefined);
    });

    // Fit & Zoom
    this.element.querySelector('#dc-ft-fit')?.addEventListener('click', () => {
      EventBus.emit('dc:fit', undefined);
    });

    this.element.querySelector('#dc-ft-zoomin')?.addEventListener('click', () => {
      EventBus.emit('dc:zoom-in', undefined);
    });

    this.element.querySelector('#dc-ft-zoomout')?.addEventListener('click', () => {
      EventBus.emit('dc:zoom-out', undefined);
    });

    // Catalog toggle
    this.element.querySelector('#dc-ft-toggle-catalog')?.addEventListener('click', () => {
      EventBus.emit('dc:toggle-left-panel', undefined);
    });

    // Component Selector Pill Toggle
    this.element.querySelector('#dc-ft-component-selector-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isComponentMenuOpen = !this.isComponentMenuOpen;
      this.isOptimizeMenuOpen = false;
      this.render();
    });

    // Component Search & Filter
    const searchInput = this.element.querySelector('#dc-comp-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', (e) => {
        this.componentSearchQuery = (e.target as HTMLInputElement).value;
        this.render();
      });
    }

    this.element.querySelector('#dc-comp-search-clear')?.addEventListener('click', () => {
      this.componentSearchQuery = '';
      this.render();
    });

    // Category Tabs in Popover
    this.element.querySelectorAll('.dc-comp-tab[data-cat]').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cat = (e.currentTarget as HTMLElement).getAttribute('data-cat');
        if (cat) {
          this.activeCategoryTab = cat;
          this.componentSearchQuery = '';
          this.render();
        }
      });
    });

    // Pathway Subfilters
    this.element.querySelectorAll('.dc-comp-subfilter-btn[data-subfilter]').forEach(subBtn => {
      subBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sub = (e.currentTarget as HTMLElement).getAttribute('data-subfilter') as any;
        if (sub) {
          this.pathwaySubfilter = sub;
          this.render();
        }
      });
    });

    // Component Item Card Selection
    this.element.querySelectorAll('.dc-comp-card[data-comp-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const compId = (e.currentTarget as HTMLElement).getAttribute('data-comp-id');
        if (compId) {
          this.selectedComponentId = compId;
          this.isComponentMenuOpen = false;
          const comp = ALL_DC_COMPONENTS.find(c => c.id === compId);

          if (comp) {
            if (comp.category === 'pathways') {
              this.handlePathwaySelection(comp);
            } else if (comp.presetId) {
              EventBus.emit('dc:add-preset', comp.presetId);
            } else {
              this.handleGenericEquipmentPlacement(comp);
            }
          }
          this.render();
        }
      });
    });

    // Swap / Optimize Toggle
    this.element.querySelector('#dc-ft-toggle-optimize')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOptimizeMenuOpen = !this.isOptimizeMenuOpen;
      this.isComponentMenuOpen = false;
      this.render();
    });

    // Optimize Option Handlers
    this.bindOptimizeActions();

    // Row 2 Rack Actions
    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    if (s.selectedRackId && floor) {
      const rack = floor.racks.find(r => r.id === s.selectedRackId);
      if (rack) {
        this.element.querySelector('#dc-ft-work-rack')?.addEventListener('click', () => {
          EventBus.emit('dc:work-rack', rack.id);
        });

        this.element.querySelector('#dc-ft-rack-rotate')?.addEventListener('click', () => {
          const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          dcState.updateRack(rack.id, { rotation: rot });
        });

        this.element.querySelector('#dc-ft-rack-duplicate')?.addEventListener('click', () => {
          const dup = dcState.duplicateRack(rack.id);
          if (dup) dcState.setState({ selectedRackId: dup.id });
        });

        this.element.querySelector('#dc-ft-rack-hud')?.addEventListener('click', () => {
          const newStyle = rack.gaugeStyle === 'linear' ? 'radial' : 'linear';
          dcState.updateRack(rack.id, { gaugeStyle: newStyle });
          EventBus.emit('notification', {
            message: `3D HUD switched to ${newStyle === 'linear' ? 'Horizontal Dual-Bar' : 'Radial Dial'}.`,
            type: 'info',
          });
        });

        this.element.querySelector('#dc-ft-rack-delete')?.addEventListener('click', () => {
          if (confirm(`Delete rack "${rack.name}"?`)) {
            dcState.deleteRack(rack.id);
          }
        });
      }
    }

    // Row 2 Tile Actions
    const selectedTileIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
    if (selectedTileIds.length > 0 && !s.selectedRackId) {
      this.element.querySelector('#dc-ft-tile-vent')?.addEventListener('click', () => {
        dcState.setFloorTilesType(selectedTileIds, 'ventilated');
        EventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tile(s) to Ventilated ESD Grille.`, type: 'info' });
      });

      this.element.querySelector('#dc-ft-tile-perf')?.addEventListener('click', () => {
        dcState.setFloorTilesType(selectedTileIds, 'perforated');
        EventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tile(s) to Perforated Panel.`, type: 'info' });
      });

      this.element.querySelector('#dc-ft-tile-ac')?.addEventListener('click', () => {
        dcState.setFloorTilesType(selectedTileIds, 'air-channel', 'north');
        EventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tile(s) to Air Channel (North).`, type: 'info' });
      });

      this.element.querySelector('#dc-ft-tile-duct')?.addEventListener('click', () => {
        this.addUnderfloorDuctAlongTiles(selectedTileIds);
      });

      this.element.querySelector('#dc-ft-tile-std')?.addEventListener('click', () => {
        dcState.setFloorTilesType(selectedTileIds, 'standard');
        EventBus.emit('notification', { message: `Reset ${selectedTileIds.length} tile(s) to Standard Raised Floor.`, type: 'info' });
      });
    }

    // Row 2 Quick Add Presets
    this.element.querySelectorAll('.dc-ft-quick-btn[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const presetId = (e.currentTarget as HTMLElement).getAttribute('data-preset');
        if (presetId) {
          if (presetId.startsWith('duct-')) {
            const comp = ALL_DC_COMPONENTS.find(c => c.id === presetId);
            if (comp) this.handlePathwaySelection(comp);
          } else {
            EventBus.emit('dc:add-preset', presetId);
          }
        }
      });
    });

    this.element.querySelector('#dc-ft-quick-addrow')?.addEventListener('click', () => {
      EventBus.emit('dc:add-row', undefined);
    });
  }

  private bindOptimizeActions() {
    if (!this.element) return;
    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    if (!s.selectedRackId || !floor) return;
    const rack = floor.racks.find(r => r.id === s.selectedRackId);
    if (!rack) return;

    // Size Swaps
    this.element.querySelectorAll('.dc-opt-chip[data-opt-size]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const sz = (e.currentTarget as HTMLElement).getAttribute('data-opt-size');
        if (!sz) return;
        if (sz === '42u-600') {
          dcState.updateRack(rack.id, { heightU: 42, widthMm: 600, depthMm: 1000 });
        } else if (sz === '48u-750') {
          dcState.updateRack(rack.id, { heightU: 48, widthMm: 750, depthMm: 1200 });
        } else if (sz === '52u-800') {
          dcState.updateRack(rack.id, { heightU: 52, widthMm: 800, depthMm: 1200 });
        } else if (sz === '24u-600') {
          dcState.updateRack(rack.id, { heightU: 24, widthMm: 600, depthMm: 1000 });
        }
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Optimized cabinet size to ${sz.toUpperCase()}`, type: 'success' });
      });
    });

    // Type Swaps
    this.element.querySelectorAll('.dc-opt-chip[data-opt-type]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const t = (e.currentTarget as HTMLElement).getAttribute('data-opt-type') as any;
        if (t === 'open-frame') {
          dcState.updateRack(rack.id, { type: 'open-frame', doorStyle: 'none', widthMm: 800, depthMm: 800 });
        } else if (t === 'inrow-cooling') {
          dcState.updateRack(rack.id, { type: 'inrow-cooling', widthMm: 300, depthMm: 1200, coolingCapacityKw: 35 });
        }
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Swapped cabinet type to ${t}`, type: 'success' });
      });
    });

    // Door / Containment Swaps
    this.element.querySelectorAll('.dc-opt-chip[data-opt-door]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const door = (e.currentTarget as HTMLElement).getAttribute('data-opt-door') as any;
        dcState.updateRack(rack.id, { doorStyle: door });
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Updated door airflow style to ${door}`, type: 'info' });
      });
    });

    this.element.querySelectorAll('.dc-opt-chip[data-opt-containment]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const cont = (e.currentTarget as HTMLElement).getAttribute('data-opt-containment') as any;
        dcState.updateRack(rack.id, { containmentType: cont });
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Configured aisle containment: ${cont}`, type: 'info' });
      });
    });

    // Power Optimization Swaps
    this.element.querySelectorAll('.dc-opt-chip[data-opt-power]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const pwr = (e.currentTarget as HTMLElement).getAttribute('data-opt-power');
        if (pwr === '230v-16a') {
          dcState.updateRack(rack.id, { pduVoltage: '230V', pduPhases: 1, pduAmperage: 16, maxPowerKw: 3.7 });
        } else if (pwr === '230v-32a') {
          dcState.updateRack(rack.id, { pduVoltage: '230V', pduPhases: 1, pduAmperage: 32, maxPowerKw: 7.4 });
        } else if (pwr === '415v-32a') {
          dcState.updateRack(rack.id, { pduVoltage: '415V', pduPhases: 3, pduAmperage: 32, maxPowerKw: 22 });
        } else if (pwr === '415v-63a') {
          dcState.updateRack(rack.id, { pduVoltage: '415V', pduPhases: 3, pduAmperage: 63, maxPowerKw: 44 });
        }
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Upgraded PDU power specification: ${pwr}`, type: 'success' });
      });
    });

    // Security Lock Swaps
    this.element.querySelectorAll('.dc-opt-chip[data-opt-lock]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const lk = (e.currentTarget as HTMLElement).getAttribute('data-opt-lock') as any;
        dcState.updateRack(rack.id, { securityLock: lk });
        this.isOptimizeMenuOpen = false;
        EventBus.emit('notification', { message: `Updated electronic rack lock to ${lk}`, type: 'info' });
      });
    });
  }

  private handlePathwaySelection(comp: DcComponentItem) {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const isUF = comp.pathwayLevel === 'underfloor';
    const layer = isUF ? 'underfloor' : 'overhead';
    const elevationMm = isUF ? -250 : 2600;

    // Create a new pathway infrastructure item spanning across the center aisle
    const tileM = floor.tileSizeMm / 1000;
    const startX = tileM * 2;
    const endX = Math.max(startX + tileM * 4, floor.lengthM - tileM * 2);
    const yCenter = Math.floor(floor.widthM / 2);

    dcState.addInfrastructureItem({
      id: 'INFRA-' + Date.now().toString(36),
      name: comp.name,
      category: comp.badgeType === 'fiber' ? 'fiber-raceway' : (comp.id.includes('bus') ? 'busway' : 'cable-tray'),
      layer,
      subtype: comp.code,
      start: { x: startX, y: yCenter, z: 0 },
      end: { x: endX, y: yCenter, z: 0 },
      widthMm: 400,
      heightMm: 100,
      elevationMm,
      color: comp.badgeType === 'fiber' ? '#eab308' : (isUF ? '#64748b' : '#38bdf8')
    });

    EventBus.emit('notification', {
      message: `Placed ${comp.name} (${isUF ? 'Underfloor' : 'Overhead'} @ ${elevationMm}mm)`,
      type: 'success'
    });
  }

  private handleGenericEquipmentPlacement(comp: DcComponentItem) {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const tileM = floor.tileSizeMm / 1000;
    const wMm = comp.widthMm || 600;
    const dMm = comp.depthMm || 1000;
    const hU = comp.heightU || 42;

    const newRackId = dcState.generateRackId();
    dcState.addRack({
      id: newRackId,
      name: `${comp.name.split('(')[0].trim()}`,
      type: (comp.category === 'power' ? 'power-rpp' : (comp.category === 'cooling' ? 'inrow-cooling' : 'server')) as any,
      widthMm: wMm,
      depthMm: dMm,
      heightU: hU,
      manufacturer: 'Antigravity Data Center Systems',
      model: comp.code,
      position: { x: tileM * 2, y: tileM * 2, z: 0 },
      rotation: 0,
      color: comp.category === 'power' ? '#eab308' : (comp.category === 'cooling' ? '#06b6d4' : '#1e293b'),
      maxPowerKw: 20
    });

    dcState.setState({ selectedRackId: newRackId });
    EventBus.emit('notification', {
      message: `Placed ${comp.name} on Floor Grid`,
      type: 'success'
    });
  }

  private addUnderfloorDuctAlongTiles(tileIds: string[]) {
    const floor = dcState.getActiveFloor();
    if (!floor || !tileIds.length) return;

    const tiles = floor.tiles.filter(t => tileIds.includes(t.id));
    if (!tiles.length) return;

    const minX = Math.min(...tiles.map(t => t.x));
    const maxX = Math.max(...tiles.map(t => t.x + (t.widthMm / 1000)));
    const minY = Math.min(...tiles.map(t => t.y));
    const maxY = Math.max(...tiles.map(t => t.y + (t.depthMm / 1000)));

    dcState.addInfrastructureItem({
      id: 'UF-DUCT-' + Date.now().toString(36),
      name: 'Underfloor Cable Duct Runway',
      category: 'cable-duct',
      layer: 'underfloor',
      subtype: 'UF-DUCT',
      start: { x: minX, y: minY + (floor.tileSizeMm / 2000), z: 0 },
      end: { x: maxX, y: maxY - (floor.tileSizeMm / 2000), z: 0 },
      widthMm: 300,
      heightMm: 100,
      elevationMm: -200,
      color: '#475569'
    });

    EventBus.emit('notification', {
      message: `Created Underfloor Cable Duct across ${tileIds.length} tile(s).`,
      type: 'success'
    });
  }
}
