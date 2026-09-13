/**
 * Datacenter Floating Toolbar — 2-Row Compact Glass-Dark Quick Access Toolbar
 *
 * Row 1 (Tools & Views):
 *   ⋮⋮ Drag | ⇄ Swap to Rack Elevation | Select (S) · Move (M) | 2D/3D Toggle · ↻ Rotate 2D · 🦴 X-Ray |
 *   ⊞ Grid · ⌂ Snap · ▦ Grid-Lock · 🏷 Labels | ⤢ Fit (Z) · ＋ Zoom In · － Zoom Out | 📦 Catalog
 *
 * Row 2 (Context-Aware Action Palette):
 *   - Rack Selected:  📦 Rack Info · ⚙ Work on Rack (Elevation) · ↻ Rotate 90° · ⊕ Duplicate · 📊 HUD · 🗑 Delete
 *   - Tiles Selected: ▦ Tile Info · 🔲 Vent Grille · ▦ Perf Panel · 💨 Air Channel · ⚡ Add Pathway · ↺ Standard
 *   - Default:        ⚡ Quick Add: ＋ Server Rack · ＋ In-Row Cooler · ＋ Micro DC · ＋ UPS · ＋ RPP · ＋ ODF · ▤ Add Row
 */

import EventBus from '../core/event-bus';
import State from '../core/state';
import { dcState, getRowLabel, getColLabel } from '../datacenter/dc-state';

const DC_FT_STORAGE_X = 'dc_ft_pos_x';
const DC_FT_STORAGE_Y = 'dc_ft_pos_y';

export class DcFloatingToolbar {
  private element: HTMLElement | null = null;
  private toolbarX: number | null = null;
  private toolbarY: number | null = null;
  private isRepositioning = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor() {
    const savedX = localStorage.getItem(DC_FT_STORAGE_X);
    const savedY = localStorage.getItem(DC_FT_STORAGE_Y);
    if (savedX) this.toolbarX = parseFloat(savedX);
    if (savedY) this.toolbarY = parseFloat(savedY);

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
            <span>⚙ Work on Rack (Elevation)</span>
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
          <button class="dc-ft-pill-btn" id="dc-ft-tile-std" title="Reset to Standard Floor Panel">↺ Standard</button>
        </div>
      `;
    } else {
      // Default: Quick Add Palette
      row2Html = `
        <div class="dc-ft-context-group">
          <span class="dc-ft-label">＋ QUICK ADD:</span>
          <button class="dc-ft-quick-btn" data-preset="rack-server-42u-std" title="Add 42U Server Rack (600×1200mm)">＋ Server (42U)</button>
          <button class="dc-ft-quick-btn" data-preset="cooling-inrow-dx-300" title="Add In-Row Precision DX Cooling Unit (300mm)">＋ In-Row Cooling</button>
          <button class="dc-ft-quick-btn" data-preset="microdc-edge-24u" title="Add Edge All-in-One Micro Data Center (24U)">＋ Micro DC</button>
          <button class="dc-ft-quick-btn" data-preset="ups-inrow-50kva" title="Add In-Row Modular 3-Phase UPS (50kVA)">＋ Modular UPS</button>
          <button class="dc-ft-quick-btn" data-preset="pwr-rpp-100kva" title="Add Floor Remote Power Panel (RPP 100kVA)">＋ Power RPP</button>
          <button class="dc-ft-quick-btn" data-preset="odf-fiber-288f" title="Add High-Density Optical Distribution Frame (288F)">＋ ODF Fiber</button>
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

      <!-- Row 2: Contextual Actions / Quick Add -->
      <div class="ft-row" id="dc-ft-row-2">
        ${row2Html}
      </div>
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
          EventBus.emit('dc:add-preset', presetId);
        }
      });
    });

    this.element.querySelector('#dc-ft-quick-addrow')?.addEventListener('click', () => {
      EventBus.emit('dc:add-row', undefined);
    });
  }
}
