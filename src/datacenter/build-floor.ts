import { dcState } from './dc-state';
import { DcFloor, DcRack } from './types';
import {
  formatSingleDistance,
  formatDimensionsMeters,
  formatDimensionsMm,
  formatRackHeight,
  formatArea,
  metersToAll,
  mmToAll,
} from './units';

const RACK_COLORS = ['#1e3a5f', '#1a4731', '#3d1a1a', '#2d1f4e', '#1a3535'];
let rackColorIdx = 0;

export class BuildFloorView {
  private container: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrame = 0;
  private ppm = 100; // pixels per meter
  private panX = 40;
  private panY = 40;
  private toolMode: 'select' | 'pan' = 'select';
  private isPanning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  private isDraggingRack = false;
  private draggingRackId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragPos: { x: number; y: number } | null = null;
  private unsub: (() => void) | null = null;
  private hasFittedInitialFloor = false;
  private resizeObserver: ResizeObserver | null = null;

  // 2D Canvas View Rotation: 0, 90, 180, 270 degrees
  private canvasRotationDeg: 0 | 90 | 180 | 270 = 0;

  // 3D Isometric View Parameters
  private rotX = 55; // degrees (Default isometric pitch)
  private rotZ = -45; // degrees (Default isometric yaw)
  private scale3D = 1.0; // 3D Zoom scale
  private isOrbiting3D = false;
  private orbitStart = { x: 0, y: 0, rx: 0, rz: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
    this.unsub = dcState.subscribe(() => this.refresh());
  }

  destroy() {
    this.unsub?.();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.animFrame);
  }

  public show() {
    setTimeout(() => {
      this.resize();
      if (!this.hasFittedInitialFloor) {
        this.fitToFloor();
        this.hasFittedInitialFloor = true;
      }
      const s = dcState.getState();
      if (s.viewMode === '3d') {
        this.render3D();
      } else {
        this.draw();
      }
    }, 20);
  }

  private build() {
    this.container.innerHTML = `
      <div class="dc-layout">
        <div class="dc-topbar">
          <div class="dc-topbar-left">
            <span class="dc-brand">⚡ Datacenter <span class="dc-breadcrumb">/ Build Floor</span></span>
          </div>
          <div class="dc-topbar-center">
            <button class="dc-btn" id="dc-btn-newfloor" title="Create new floor">＋ New Floor</button>
            <div class="dc-divider"></div>
            <!-- Mode switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-tool-select" title="Select Tool (Hotkey: S)">↖ Select (S)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-tool-pan" title="Move/Pan Tool (Hotkey: M)">✋ Move (M)</button>
            <div class="dc-divider"></div>
            <!-- View switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-2d" title="2D Top View">2D (Top View)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-3d" title="3D Isometric View">3D (Isometric)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-rotate-2d" title="Rotate 2D View 90° (Hotkey: R)">↻ Rotate View (<span id="dc-rot-label">0°</span>)</button>
            <div class="dc-divider"></div>
            <!-- Grid & Labels -->
            <button class="dc-btn dc-btn-icon" id="dc-btn-grid" title="Toggle Grid">⊞ Grid</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-snap" title="Toggle Snap">⌂ Snap</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-labels" title="Toggle Labels">🏷 Labels</button>
            <div class="dc-divider"></div>
            <!-- Navigation & Zoom controls -->
            <button class="dc-btn dc-btn-icon" id="dc-nav-left" title="Pan Left (← / A)">←</button>
            <button class="dc-btn dc-btn-icon" id="dc-nav-up" title="Pan Up (↑ / W)">↑</button>
            <button class="dc-btn dc-btn-icon" id="dc-nav-down" title="Pan Down (↓ / S)">↓</button>
            <button class="dc-btn dc-btn-icon" id="dc-nav-right" title="Pan Right (→ / D)">→</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-fit" title="Zoom Fit / Center (Hotkey: Z)">⤢ Fit (Z)</button>
            <div class="dc-divider"></div>
            <button class="dc-btn dc-btn-icon" id="dc-btn-zoomin" title="Zoom In (+)">＋</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-zoomout" title="Zoom Out (-)">－</button>
          </div>
          <div class="dc-topbar-right">
            <span class="dc-save-indicator" id="dc-save-indicator">● Saved</span>
          </div>
        </div>
        <div class="dc-body">
          <div class="dc-info-panel" id="dc-info-panel">
            <div class="dc-panel-title">DATACENTER FLOOR</div>
            <div id="dc-info-content"><div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div></div>
          </div>
          <div class="dc-canvas-wrap" id="dc-canvas-wrap">
            <canvas id="dc-canvas"></canvas>
            <div class="dc-3d-container hidden" id="dc-3d-container"></div>
          </div>
          <div class="dc-props-panel" id="dc-props-panel">
            <div class="dc-panel-title">PROPERTIES</div>
            <div id="dc-props-content"><p class="dc-muted">Select a tile or rack.</p></div>
          </div>
        </div>
        <div class="dc-statusbar" id="dc-statusbar">Point-to-Zoom: Wheel / Pinch | Hotkeys: [S] Select | [M] Move/Pan | [Z] Zoom Fit | [R] Rotate</div>
      </div>
    `;

    this.canvas = this.container.querySelector('#dc-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;

    // Setup ResizeObserver to handle dynamic viewport sizing
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (wrap && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
          this.resize();
          if (!this.hasFittedInitialFloor) {
            this.fitToFloor();
            this.hasFittedInitialFloor = true;
          }
        }
      });
      this.resizeObserver.observe(wrap);
    }

    this.bindButtons();
    this.bindCanvasEvents();
    this.bindKeyboardEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.refresh();
  }

  private setToolMode(mode: 'select' | 'pan') {
    this.toolMode = mode;
    const btnSelect = this.container.querySelector('#dc-btn-tool-select');
    const btnPan = this.container.querySelector('#dc-btn-tool-pan');
    btnSelect?.classList.toggle('active', mode === 'select');
    btnPan?.classList.toggle('active', mode === 'pan');
    this.canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  }

  private setViewMode(mode: '2d' | '3d') {
    dcState.setState({ viewMode: mode });
    const wrap3d = this.container.querySelector('#dc-3d-container') as HTMLElement;
    const btn2d = this.container.querySelector('#dc-btn-2d');
    const btn3d = this.container.querySelector('#dc-btn-3d');
    const btnRot = this.container.querySelector('#dc-btn-rotate-2d') as HTMLElement;

    btn2d?.classList.toggle('active', mode === '2d');
    btn3d?.classList.toggle('active', mode === '3d');
    if (btnRot) btnRot.style.display = mode === '2d' ? 'inline-flex' : 'none';

    if (mode === '2d') {
      wrap3d?.classList.add('hidden');
      this.canvas.classList.remove('hidden');
      this.resize();
      this.draw();
    } else {
      this.canvas.classList.add('hidden');
      wrap3d?.classList.remove('hidden');
      this.render3D();
    }
  }

  private rotate2DView() {
    this.canvasRotationDeg = ((this.canvasRotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    const label = this.container.querySelector('#dc-rot-label');
    if (label) label.textContent = `${this.canvasRotationDeg}°`;
    this.draw();
  }

  private bindButtons() {
    const on = (id: string, fn: () => void) => this.container.querySelector(`#${id}`)?.addEventListener('click', fn);
    on('dc-btn-newfloor', () => this.showCreateFloorDialog());
    on('dc-btn-tool-select', () => this.setToolMode('select'));
    on('dc-btn-tool-pan', () => this.setToolMode('pan'));
    on('dc-btn-2d', () => this.setViewMode('2d'));
    on('dc-btn-3d', () => this.setViewMode('3d'));
    on('dc-btn-rotate-2d', () => this.rotate2DView());
    on('dc-btn-grid', () => { dcState.setState({ gridVisible: !dcState.getState().gridVisible }); });
    on('dc-btn-snap', () => { dcState.setState({ snapEnabled: !dcState.getState().snapEnabled }); });
    on('dc-btn-labels', () => { dcState.setState({ labelsVisible: !dcState.getState().labelsVisible }); });
    
    // Pan navigation buttons
    on('dc-nav-left', () => { this.panX += 80; this.draw(); });
    on('dc-nav-right', () => { this.panX -= 80; this.draw(); });
    on('dc-nav-up', () => { this.panY += 80; this.draw(); });
    on('dc-nav-down', () => { this.panY -= 80; this.draw(); });

    on('dc-btn-fit', () => {
      if (dcState.getState().viewMode === '3d') {
        this.scale3D = 1.0;
        this.rotX = 55;
        this.rotZ = -45;
        this.apply3DTransform();
      } else {
        this.fitToFloor();
      }
    });

    on('dc-btn-zoomin', () => {
      if (dcState.getState().viewMode === '3d') {
        this.scale3D = Math.min(this.scale3D * 1.25, 4.0);
        this.apply3DTransform();
      } else {
        this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 1.25);
      }
    });

    on('dc-btn-zoomout', () => {
      if (dcState.getState().viewMode === '3d') {
        this.scale3D = Math.max(this.scale3D * 0.8, 0.3);
        this.apply3DTransform();
      } else {
        this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 0.8);
      }
    });
  }

  private resize() {
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (!wrap || !this.canvas) return;
    if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
      this.canvas.width = wrap.clientWidth;
      this.canvas.height = wrap.clientHeight;
    }
  }

  private zoomAtPoint(sx: number, sy: number, factor: number) {
    const oldPpm = this.ppm;
    const newPpm = Math.min(Math.max(oldPpm * factor, 15), 2000);
    if (newPpm === oldPpm) return;
    const actualFactor = newPpm / oldPpm;

    let px = sx;
    let py = sy;
    if (this.canvasRotationDeg !== 0) {
      const W = this.canvas.width || 800;
      const H = this.canvas.height || 600;
      const cx = W / 2;
      const cy = H / 2;
      const rad = (-this.canvasRotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = sx - cx;
      const dy = sy - cy;
      px = cx + (dx * cos - dy * sin);
      py = cy + (dx * sin + dy * cos);
    }

    this.panX = px - (px - this.panX) * actualFactor;
    this.panY = py - (py - this.panY) * actualFactor;
    this.ppm = newPpm;
    this.draw();
  }

  private bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      const is3D = dcState.getState().viewMode === '3d';
      const key = e.key.toUpperCase();
      if (key === 'S') this.setToolMode('select');
      if (key === 'M') this.setToolMode('pan');
      if (key === 'Z') {
        if (is3D) {
          this.scale3D = 1.0;
          this.rotX = 55;
          this.rotZ = -45;
          this.apply3DTransform();
        } else {
          this.fitToFloor();
        }
      }
      if (key === 'R') {
        const s = dcState.getState();
        const floor = dcState.getActiveFloor();
        if (s.selectedRackId && floor) {
          const rack = floor.racks.find(r => r.id === s.selectedRackId);
          if (rack) {
            const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
            dcState.updateRack(rack.id, { rotation: rot });
            this.renderPropsPanel();
            if (is3D) this.render3D(); else this.draw();
            return;
          }
        }
        this.rotate2DView();
      }
      if (e.key === 'ArrowLeft' || key === 'A') { this.panX += 60; this.draw(); }
      if (e.key === 'ArrowRight' || key === 'D') { this.panX -= 60; this.draw(); }
      if (e.key === 'ArrowUp' || key === 'W') { this.panY += 60; this.draw(); }
      if (e.key === 'ArrowDown') { this.panY -= 60; this.draw(); }
      if (e.key === '=' || e.key === '+') {
        if (is3D) {
          this.scale3D = Math.min(this.scale3D * 1.2, 4.0);
          this.apply3DTransform();
        } else {
          this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 1.2);
        }
      }
      if (e.key === '-' || e.key === '_') {
        if (is3D) {
          this.scale3D = Math.max(this.scale3D * 0.8, 0.3);
          this.apply3DTransform();
        } else {
          this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 0.8);
        }
      }
      if (e.key === 'Escape') {
        dcState.setState({ selectedRackId: null, selectedTileId: null });
        this.renderPropsPanel();
        if (is3D) this.render3D(); else this.draw();
      }
    });
  }

  private bindCanvasEvents() {
    // 2D Point-to-Zoom & Scroll-to-Zoom with DPI scale awareness
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      let delta = -e.deltaY;
      if (e.deltaMode === 1) delta *= 30;
      else if (e.deltaMode === 2) delta *= 300;
      delta = Math.max(-120, Math.min(120, delta));

      const factor = Math.pow(1.002, delta);
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / (rect.width || 1);
      const scaleY = this.canvas.height / (rect.height || 1);
      const mouseSx = (e.clientX - rect.left) * scaleX;
      const mouseSy = (e.clientY - rect.top) * scaleY;

      this.zoomAtPoint(mouseSx, mouseSy, factor);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey) || this.toolMode === 'pan') {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
        this.canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 0) this.handleMouseDown(e);
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const canvasSx = (e.clientX - rect.left) * scaleX;
        const canvasSy = (e.clientY - rect.top) * scaleY;
        const { xM, yM } = this.screenToWorld(canvasSx, canvasSy);

        const statusbar = this.container.querySelector('#dc-statusbar');
        if (statusbar && xM >= 0 && yM >= 0) {
          const xAll = metersToAll(xM);
          const yAll = metersToAll(yM);
          statusbar.textContent = `Cursor: X: ${xM.toFixed(2)}m (${xAll.mm.toLocaleString()}mm | ${xAll.feet.toFixed(2)}ft | ${xAll.inches.toFixed(1)}in), Y: ${yM.toFixed(2)}m (${yAll.mm.toLocaleString()}mm | ${yAll.feet.toFixed(2)}ft | ${yAll.inches.toFixed(1)}in) | Hotkeys: [S] Select | [M] Move | [Z] Fit | [R] Rotate`;
        }
      }

      if (this.isPanning) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        let unrotDx = dx;
        let unrotDy = dy;
        if (this.canvasRotationDeg !== 0) {
          const rad = (-this.canvasRotationDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          unrotDx = dx * cos - dy * sin;
          unrotDy = dx * sin + dy * cos;
        }
        this.panX = this.panStart.px + unrotDx;
        this.panY = this.panStart.py + unrotDy;
        this.draw();
        return;
      }
      if (this.isDraggingRack) this.handleRackDrag(e);
    });

    window.addEventListener('mouseup', (_e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.toolMode === 'pan' ? 'grab' : 'default';
      }
      if (this.isDraggingRack) this.handleRackDrop(_e);
    });
  }

  private worldToScreen(xM: number, yM: number): { sx: number; sy: number } {
    return { sx: xM * this.ppm + this.panX, sy: yM * this.ppm + this.panY };
  }

  private screenToWorld(sx: number, sy: number): { xM: number; yM: number } {
    let px = sx;
    let py = sy;
    if (this.canvasRotationDeg !== 0) {
      const W = this.canvas.width || 800;
      const H = this.canvas.height || 600;
      const cx = W / 2;
      const cy = H / 2;
      const rad = (-this.canvasRotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = sx - cx;
      const dy = sy - cy;
      px = cx + (dx * cos - dy * sin);
      py = cy + (dx * sin + dy * cos);
    }
    return { xM: (px - this.panX) / this.ppm, yM: (py - this.panY) / this.ppm };
  }

  private handleMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    const canvasSx = (e.clientX - rect.left) * scaleX;
    const canvasSy = (e.clientY - rect.top) * scaleY;

    const { xM, yM } = this.screenToWorld(canvasSx, canvasSy);
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    for (const rack of floor.racks) {
      if (this.hitTestRack(rack, xM, yM)) {
        dcState.setState({ selectedRackId: rack.id, selectedTileId: null });
        this.isDraggingRack = true;
        this.draggingRackId = rack.id;
        this.dragOffset = { x: xM - rack.position.x, y: yM - rack.position.y };
        this.dragPos = { x: rack.position.x, y: rack.position.y };
        this.renderPropsPanel();
        return;
      }
    }

    const tileM = floor.tileSizeMm / 1000;
    const col = Math.floor(xM / tileM);
    const row = Math.floor(yM / tileM);
    if (xM >= 0 && yM >= 0 && xM < floor.lengthM && yM < floor.widthM) {
      const rowLabel = String.fromCharCode(65 + (row % 26));
      const colLabel = String(col + 1).padStart(2, '0');
      const tileId = `${rowLabel}-${colLabel}`;
      dcState.setState({ selectedTileId: tileId, selectedRackId: null });
      this.renderPropsPanel();
    } else {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
      this.canvas.style.cursor = 'grabbing';
      dcState.setState({ selectedTileId: null, selectedRackId: null });
      this.renderPropsPanel();
    }
    this.draw();
  }

  private handleRackDrag(e: MouseEvent) {
    if (!this.draggingRackId) return;
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    const canvasSx = (e.clientX - rect.left) * scaleX;
    const canvasSy = (e.clientY - rect.top) * scaleY;

    const { xM, yM } = this.screenToWorld(canvasSx, canvasSy);
    let nx = xM - this.dragOffset.x;
    let ny = yM - this.dragOffset.y;
    if (dcState.getState().snapEnabled) {
      const snapped = dcState.snapToGrid(nx, ny, floor.tileSizeMm / 1000);
      nx = snapped.x; ny = snapped.y;
    }
    this.dragPos = { x: nx, y: ny };
    this.draw();
  }

  private handleRackDrop(_e: MouseEvent) {
    this.isDraggingRack = false;
    if (!this.draggingRackId || !this.dragPos) { this.draggingRackId = null; this.dragPos = null; return; }
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const rack = floor.racks.find(r => r.id === this.draggingRackId);
    if (!rack) return;
    const updated: DcRack = { ...rack, position: { x: this.dragPos.x, y: this.dragPos.y, z: 0 } };
    if (!dcState.isOutOfBounds(updated) && !dcState.isOverlapping(updated)) {
      dcState.updateRack(this.draggingRackId, { position: updated.position });
    }
    this.draggingRackId = null;
    this.dragPos = null;
    this.draw();
  }

  private hitTestRack(rack: DcRack, xM: number, yM: number): boolean {
    const rW = rack.widthMm / 1000, rD = rack.depthMm / 1000;
    const eW = rack.rotation % 180 === 0 ? rW : rD;
    const eD = rack.rotation % 180 === 0 ? rD : rW;
    return xM >= rack.position.x && xM <= rack.position.x + eW &&
           yM >= rack.position.y && yM <= rack.position.y + eD;
  }

  private draw() {
    const s = dcState.getState();
    if (s.viewMode === '3d') return;
    const floor = dcState.getActiveFloor();
    const { width: W, height: H } = this.canvas;

    if (!W || !H) return;

    this.ctx.save();
    this.ctx.clearRect(0, 0, W, H);

    this.ctx.fillStyle = '#0d1117';
    this.ctx.fillRect(0, 0, W, H);

    if (!floor) {
      this.ctx.fillStyle = '#475569';
      this.ctx.font = '16px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('No floor loaded. Click + New Floor to start.', W / 2, H / 2);
      this.ctx.restore();
      return;
    }

    // Apply 2D Canvas Rotation if active
    if (this.canvasRotationDeg !== 0) {
      const centerX = W / 2;
      const centerY = H / 2;
      this.ctx.translate(centerX, centerY);
      this.ctx.rotate((this.canvasRotationDeg * Math.PI) / 180);
      this.ctx.translate(-centerX, -centerY);
    }

    const tileM = floor.tileSizeMm / 1000;
    const tilePx = tileM * this.ppm;

    // 1. Draw ESD Tiles
    for (const tile of floor.tiles) {
      const { sx, sy } = this.worldToScreen(tile.x, tile.y);
      const tw = tilePx;
      const th = tilePx;

      const isPartial = tile.type === 'partial';
      const isSelected = tile.id === s.selectedTileId;
      const isChecker = (tile.row + tile.col) % 2 === 0;

      if (isSelected) {
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      } else if (isPartial) {
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      } else {
        this.ctx.fillStyle = isChecker ? 'rgba(30, 41, 59, 0.7)' : 'rgba(21, 32, 50, 0.7)';
      }
      this.ctx.fillRect(sx, sy, tw, th);

      // Grid line border for individual tile
      if (s.gridVisible) {
        this.ctx.strokeStyle = isSelected ? '#38bdf8' : isPartial ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.45)';
        this.ctx.lineWidth = isSelected ? 2 : 1;
        this.ctx.strokeRect(sx, sy, tw, th);
      }

      // Tile ID Label
      if (s.labelsVisible && tilePx >= 32) {
        this.ctx.fillStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
        this.ctx.font = `${Math.max(9, Math.min(11, tilePx * 0.18))}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(tile.id, sx + tw / 2, sy + th / 2 + 4);
      }
    }

    // 2. Draw Main Outer Floor Border
    const { sx: fx, sy: fy } = this.worldToScreen(0, 0);
    const fw = floor.lengthM * this.ppm;
    const fh = floor.widthM * this.ppm;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeRect(fx, fy, fw, fh);

    for (const rack of floor.racks) {
      const isDragging = rack.id === this.draggingRackId;
      const pos = isDragging && this.dragPos ? this.dragPos : rack.position;
      this.drawRack(rack, pos.x, pos.y, isDragging);
    }

    this.ctx.restore();

    this.updateInfoPanel(floor);
    this.updateButtonStates();
  }

  private drawRack(rack: DcRack, xM: number, yM: number, isDragging: boolean) {
    const s = dcState.getState();
    const rW = rack.widthMm / 1000, rD = rack.depthMm / 1000;
    const eW = rack.rotation % 180 === 0 ? rW : rD;
    const eD = rack.rotation % 180 === 0 ? rD : rW;
    const { sx, sy } = this.worldToScreen(xM, yM);
    const pw = eW * this.ppm;
    const ph = eD * this.ppm;
    const isSelected = rack.id === s.selectedRackId;
    const color = rack.color ?? '#1e3a5f';

    const updated = { ...rack, position: { x: xM, y: yM, z: 0 } };
    const invalid = dcState.isOutOfBounds(updated) || dcState.isOverlapping(updated, rack.id);

    this.ctx.shadowColor = isSelected ? '#38bdf8' : 'rgba(0,0,0,0.5)';
    this.ctx.shadowBlur = isSelected ? 14 : 6;

    this.ctx.fillStyle = invalid ? 'rgba(239,68,68,0.5)' : isDragging ? 'rgba(56,189,248,0.3)' : color;
    this.ctx.fillRect(sx, sy, pw, ph);
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = invalid ? '#ef4444' : isSelected ? '#38bdf8' : '#4a9eff';
    this.ctx.lineWidth = isSelected ? 2.5 : 1;
    this.ctx.strokeRect(sx, sy, pw, ph);

    if (s.labelsVisible && pw >= 20) {
      this.ctx.fillStyle = '#f0f6fc';
      this.ctx.font = `bold ${Math.max(9, Math.min(13, pw * 0.15))}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(rack.name, sx + pw / 2, sy + ph / 2 - 4);
      if (ph >= 24) {
        this.ctx.font = `${Math.max(8, Math.min(10, pw * 0.12))}px system-ui`;
        this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        this.ctx.fillText(`${rack.heightU}U`, sx + pw / 2, sy + ph / 2 + 10);
      }
    }
  }

  private fitToFloor() {
    const floor = dcState.getActiveFloor();
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (!floor || !wrap) return;
    this.resize();
    const padding = 60;
    const availW = Math.max(100, (this.canvas.width || wrap.clientWidth) - padding * 2);
    const availH = Math.max(100, (this.canvas.height || wrap.clientHeight) - padding * 2);
    const ppmW = availW / floor.lengthM;
    const ppmH = availH / floor.widthM;
    this.ppm = Math.min(ppmW, ppmH);
    this.panX = padding + (availW - floor.lengthM * this.ppm) / 2;
    this.panY = padding + (availH - floor.widthM * this.ppm) / 2;
    this.draw();
  }

  private updateInfoPanel(floor: DcFloor) {
    const el = this.container.querySelector('#dc-info-content');
    if (!el) return;
    const colCount = Math.ceil(floor.lengthM / (floor.tileSizeMm / 1000));
    const rowCount = Math.ceil(floor.widthM / (floor.tileSizeMm / 1000));
    el.innerHTML = `
      <div class="dc-info-row"><span class="dc-info-label">Floor</span><span class="dc-info-val">${floor.name}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Dimensions</span><span class="dc-info-val">${formatDimensionsMeters(floor.lengthM, floor.widthM)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Floor Area</span><span class="dc-info-val">${formatArea(floor.lengthM, floor.widthM)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">ESD Tile</span><span class="dc-info-val">${formatDimensionsMm(floor.tileSizeMm, floor.tileSizeMm)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Grid</span><span class="dc-info-val">${colCount} × ${rowCount}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Tiles</span><span class="dc-info-val">${floor.tiles.length.toLocaleString()}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Racks</span><span class="dc-info-val">${floor.racks.length}</span></div>
      <div class="dc-divider-h"></div>
      <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-btn-addrack">＋ Add Rack</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-secondary" id="dc-btn-editfloor">✎ Edit Floor</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-danger" id="dc-btn-deletefloor">🗑 Delete Floor</button>
    `;
    el.querySelector('#dc-btn-addrack')?.addEventListener('click', () => this.showAddRackDialog());
    el.querySelector('#dc-btn-editfloor')?.addEventListener('click', () => this.showEditFloorDialog(floor));
    el.querySelector('#dc-btn-deletefloor')?.addEventListener('click', () => {
      if (confirm(`Delete floor "${floor.name}"? This cannot be undone.`)) {
        dcState.deleteFloor(floor.id);
      }
    });
  }

  private updateButtonStates() {
    const s = dcState.getState();
    const setActive = (id: string, active: boolean) => {
      const el = this.container.querySelector(`#${id}`) as HTMLElement;
      if (el) el.classList.toggle('active', active);
    };
    setActive('dc-btn-2d', s.viewMode === '2d');
    setActive('dc-btn-3d', s.viewMode === '3d');
    setActive('dc-btn-grid', s.gridVisible);
    setActive('dc-btn-snap', s.snapEnabled);
    setActive('dc-btn-labels', s.labelsVisible);
  }

  private refresh() {
    const floor = dcState.getActiveFloor();
    if (!floor) {
      const el = this.container.querySelector('#dc-info-content');
      if (el) el.innerHTML = '<div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div>';
    } else if (dcState.getState().viewMode === '3d') {
      this.render3D();
    } else {
      this.draw();
    }
    this.renderPropsPanel();
  }

  private renderPropsPanel() {
    const s = dcState.getState();
    const el = this.container.querySelector('#dc-props-content');
    if (!el) return;
    const floor = dcState.getActiveFloor();

    if (s.selectedRackId && floor) {
      const rack = floor.racks.find(r => r.id === s.selectedRackId);
      if (rack) {
        const posX = formatSingleDistance(rack.position.x);
        const posY = formatSingleDistance(rack.position.y);
        el.innerHTML = `
          <div class="dc-props-section">
            <div class="dc-props-title">Rack Properties</div>
            <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${rack.id}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val">${rack.name}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${formatDimensionsMm(rack.widthMm, rack.depthMm)}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Height</span><span class="dc-info-val">${formatRackHeight(rack.heightU)}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Pos X</span><span class="dc-info-val">${posX}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Pos Y</span><span class="dc-info-val">${posY}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Rotation</span><span class="dc-info-val">${rack.rotation}°</span></div>
            ${rack.manufacturer ? `<div class="dc-info-row"><span class="dc-info-label">Mfr</span><span class="dc-info-val">${rack.manufacturer}</span></div>` : ''}
          </div>
          <div class="dc-props-actions">
            <button class="dc-btn dc-btn-sm" id="dc-rack-rotate" title="Rotate 90° (Hotkey: R)">↻ Rotate 90° (R)</button>
            <button class="dc-btn dc-btn-sm" id="dc-rack-duplicate" title="Duplicate">⊕ Duplicate</button>
            <button class="dc-btn dc-btn-sm dc-btn-danger" id="dc-rack-delete" title="Delete">🗑 Delete</button>
          </div>
        `;
        el.querySelector('#dc-rack-rotate')?.addEventListener('click', () => {
          const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          dcState.updateRack(rack.id, { rotation: rot });
          this.renderPropsPanel();
          if (dcState.getState().viewMode === '3d') this.render3D(); else this.draw();
        });
        el.querySelector('#dc-rack-duplicate')?.addEventListener('click', () => {
          const dup = dcState.duplicateRack(rack.id);
          if (dup) dcState.setState({ selectedRackId: dup.id });
        });
        el.querySelector('#dc-rack-delete')?.addEventListener('click', () => {
          if (confirm(`Delete rack "${rack.name}"?`)) dcState.deleteRack(rack.id);
        });
        return;
      }
    }

    if (s.selectedTileId && floor) {
      const tile = floor.tiles.find(t => t.id === s.selectedTileId);
      if (tile) {
        el.innerHTML = `
          <div class="dc-props-section">
            <div class="dc-props-title">ESD Tile Properties</div>
            <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${tile.id}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Grid Pos</span><span class="dc-info-val">Row ${tile.row}, Col ${tile.col}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">X</span><span class="dc-info-val">${formatSingleDistance(tile.x)}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Y</span><span class="dc-info-val">${formatSingleDistance(tile.y)}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${formatDimensionsMm(tile.widthMm, tile.depthMm)}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val">${tile.type}</span></div>
          </div>
        `;
        return;
      }
    }

    el.innerHTML = '<p class="dc-muted">Click any tile or rack to inspect details.</p>';
  }

  private showCreateFloorDialog() {
    this.showModal('Create Datacenter Floor', `
      <div class="dc-form">
        <label>Floor Name<input id="df-name" type="text" value="Main Data Hall" class="dc-input"/></label>
        <label>Length (meters)<input id="df-length" type="number" value="12" min="1" max="500" step="1" class="dc-input"/></label>
        <label>Width (meters)<input id="df-width" type="number" value="8" min="1" max="500" step="1" class="dc-input"/></label>
        <label>ESD Tile Size (mm)<input id="df-tile" type="number" value="600" min="300" max="1200" step="50" class="dc-input"/></label>
        <div class="dc-form-preview" id="df-preview"></div>
      </div>
    `, 'Create Floor', () => {
      const name = (document.getElementById('df-name') as HTMLInputElement).value.trim() || 'Main Data Hall';
      const len = parseFloat((document.getElementById('df-length') as HTMLInputElement).value) || 12;
      const wid = parseFloat((document.getElementById('df-width') as HTMLInputElement).value) || 8;
      const tile = parseFloat((document.getElementById('df-tile') as HTMLInputElement).value) || 600;
      if (len <= 0 || wid <= 0 || tile <= 0) { alert('Invalid dimensions.'); return false; }
      dcState.createFloor(name, len, wid, tile);
      setTimeout(() => this.fitToFloor(), 50);
      return true;
    });

    const updatePreview = () => {
      const len = parseFloat((document.getElementById('df-length') as HTMLInputElement)?.value) || 12;
      const wid = parseFloat((document.getElementById('df-width') as HTMLInputElement)?.value) || 8;
      const tile = parseFloat((document.getElementById('df-tile') as HTMLInputElement)?.value) || 600;
      const cols = Math.ceil(len / (tile / 1000));
      const rows = Math.ceil(wid / (tile / 1000));
      const prev = document.getElementById('df-preview');
      if (prev) {
        prev.innerHTML = `
          <div class="dc-preview-line"><b>Grid:</b> ${cols} cols × ${rows} rows (${cols * rows} tiles)</div>
          <div class="dc-preview-line"><b>Dimensions:</b> ${formatDimensionsMeters(len, wid)}</div>
          <div class="dc-preview-line"><b>Area:</b> ${formatArea(len, wid)}</div>
        `;
      }
    };
    setTimeout(() => {
      document.getElementById('df-length')?.addEventListener('input', updatePreview);
      document.getElementById('df-width')?.addEventListener('input', updatePreview);
      document.getElementById('df-tile')?.addEventListener('input', updatePreview);
      updatePreview();
    }, 50);
  }

  private showEditFloorDialog(floor: DcFloor) {
    this.showModal('Edit Floor', `
      <div class="dc-form">
        <label>Floor Name<input id="df-name" type="text" value="${floor.name}" class="dc-input"/></label>
        <label>Length (meters)<input id="df-length" type="number" value="${floor.lengthM}" min="1" step="1" class="dc-input"/></label>
        <label>Width (meters)<input id="df-width" type="number" value="${floor.widthM}" min="1" step="1" class="dc-input"/></label>
        <label>ESD Tile Size (mm)<input id="df-tile" type="number" value="${floor.tileSizeMm}" min="300" max="1200" step="50" class="dc-input"/></label>
        <p class="dc-warning">⚠ Changing dimensions will rebuild the tile grid. Racks outside new boundaries will be removed.</p>
      </div>
    `, 'Save Changes', () => {
      const name = (document.getElementById('df-name') as HTMLInputElement).value.trim() || floor.name;
      const len = parseFloat((document.getElementById('df-length') as HTMLInputElement).value) || floor.lengthM;
      const wid = parseFloat((document.getElementById('df-width') as HTMLInputElement).value) || floor.widthM;
      const tile = parseFloat((document.getElementById('df-tile') as HTMLInputElement).value) || floor.tileSizeMm;
      const filteredRacks = floor.racks.filter(r => {
        const rW = r.widthMm/1000, rD = r.depthMm/1000;
        const eW = r.rotation % 180 === 0 ? rW : rD;
        const eD = r.rotation % 180 === 0 ? rD : rW;
        return r.position.x + eW <= len && r.position.y + eD <= wid;
      });
      dcState.updateFloor(floor.id, { name, lengthM: len, widthM: wid, tileSizeMm: tile, racks: filteredRacks });
      dcState.rebuildTiles();
      setTimeout(() => this.fitToFloor(), 50);
      return true;
    });
  }

  private showAddRackDialog() {
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const defaultId = dcState.generateRackId();
    this.showModal('Add Rack', `
      <div class="dc-form">
        <label>Rack ID<input id="dr-id" type="text" value="${defaultId}" class="dc-input"/></label>
        <label>Name<input id="dr-name" type="text" value="${defaultId}" class="dc-input"/></label>
        <label>Width (mm)<input id="dr-width" type="number" value="600" min="300" max="1200" step="50" class="dc-input"/></label>
        <label>Depth (mm)<input id="dr-depth" type="number" value="1200" min="400" max="2000" step="50" class="dc-input"/></label>
        <label>Height (U)<input id="dr-height" type="number" value="42" min="2" max="54" step="2" class="dc-input"/></label>
        <label>Manufacturer (optional)<input id="dr-mfr" type="text" placeholder="e.g. APC, Eaton" class="dc-input"/></label>
        <label>Model (optional)<input id="dr-model" type="text" placeholder="e.g. AR3150" class="dc-input"/></label>
      </div>
    `, 'Add Rack', () => {
      const id = (document.getElementById('dr-id') as HTMLInputElement).value.trim() || defaultId;
      const name = (document.getElementById('dr-name') as HTMLInputElement).value.trim() || id;
      const w = parseFloat((document.getElementById('dr-width') as HTMLInputElement).value) || 600;
      const d = parseFloat((document.getElementById('dr-depth') as HTMLInputElement).value) || 1200;
      const h = parseFloat((document.getElementById('dr-height') as HTMLInputElement).value) || 42;
      const mfr = (document.getElementById('dr-mfr') as HTMLInputElement).value.trim();
      const model = (document.getElementById('dr-model') as HTMLInputElement).value.trim();
      if (w <= 0 || d <= 0 || h <= 0) { alert('Invalid dimensions.'); return false; }
      const color = RACK_COLORS[rackColorIdx++ % RACK_COLORS.length];
      const tileM = floor.tileSizeMm / 1000;
      const rack: DcRack = {
        id,
        name,
        widthMm: w,
        depthMm: d,
        heightU: h,
        manufacturer: mfr || undefined,
        model: model || undefined,
        position: { x: tileM * 2, y: tileM * 2, z: 0 },
        rotation: 0,
        color,
      };
      dcState.addRack(rack);
      dcState.setState({ selectedRackId: id });
      return true;
    });
  }

  private showModal(title: string, bodyHtml: string, confirmLabel: string, onConfirm: () => boolean) {
    let existing = document.getElementById('dc-modal-overlay');
    existing?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dc-modal-overlay';
    overlay.className = 'dc-modal-overlay';
    overlay.innerHTML = `
      <div class="dc-modal">
        <div class="dc-modal-header">
          <h3>${title}</h3>
          <button class="dc-modal-close" id="dc-modal-close">×</button>
        </div>
        <div class="dc-modal-body">${bodyHtml}</div>
        <div class="dc-modal-footer">
          <button class="dc-btn dc-btn-secondary" id="dc-modal-cancel">Cancel</button>
          <button class="dc-btn dc-btn-primary" id="dc-modal-confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#dc-modal-close')?.addEventListener('click', close);
    overlay.querySelector('#dc-modal-cancel')?.addEventListener('click', close);
    overlay.querySelector('#dc-modal-confirm')?.addEventListener('click', () => {
      if (onConfirm()) close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  private apply3DTransform() {
    const wrap3d = this.container.querySelector('#dc-3d-container');
    const scene = wrap3d?.querySelector('.dc3d-scene') as HTMLElement;
    if (scene) {
      scene.style.transform = `scale(${this.scale3D}) perspective(900px) rotateX(${this.rotX}deg) rotateZ(${this.rotZ}deg)`;
    }
  }

  private render3D() {
    const floor = dcState.getActiveFloor();
    const wrap3d = this.container.querySelector('#dc-3d-container') as HTMLElement;
    if (!wrap3d) return;
    const is3D = dcState.getState().viewMode === '3d';
    wrap3d.classList.toggle('hidden', !is3D);
    this.canvas.classList.toggle('hidden', is3D);
    if (!is3D || !floor) return;

    wrap3d.innerHTML = `
      <div class="dc3d-controls">
        <span class="dc3d-ctrl-label">Isometric 3D Hall</span>
        <button class="dc-btn dc-btn-sm" id="dc3d-preset-iso">Isometric</button>
        <button class="dc-btn dc-btn-sm" id="dc3d-preset-top">Top View</button>
        <button class="dc-btn dc-btn-sm" id="dc3d-preset-front">Front View</button>
        <div class="dc-divider"></div>
        <button class="dc-btn dc-btn-sm" id="dc3d-zoomin" title="Zoom In (+)">＋</button>
        <button class="dc-btn dc-btn-sm" id="dc3d-zoomout" title="Zoom Out (-)">－</button>
        <button class="dc-btn dc-btn-sm" id="dc3d-reset-cam">Reset 3D (Z)</button>
      </div>
      <div class="dc3d-viewport-inner" id="dc3d-inner">
        ${this.build3DHTML(floor)}
      </div>
    `;

    // 3D Scroll to Zoom
    wrap3d.onwheel = (e) => {
      e.preventDefault();
      let delta = -e.deltaY;
      if (e.deltaMode === 1) delta *= 30;
      else if (e.deltaMode === 2) delta *= 300;
      delta = Math.max(-120, Math.min(120, delta));

      const factor = Math.pow(1.002, delta);
      this.scale3D = Math.min(Math.max(this.scale3D * factor, 0.3), 4.0);
      this.apply3DTransform();
    };

    // 3D Mouse Orbiting & Object Selection
    wrap3d.onmousedown = (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.dc3d-controls')) return;

      const rackEl = target.closest('.dc3d-rack') as HTMLElement;
      if (rackEl) {
        const rackId = rackEl.dataset.rackId;
        if (rackId) {
          dcState.setState({ selectedRackId: rackId, selectedTileId: null });
          this.renderPropsPanel();
          this.render3D();
          return;
        }
      } else {
        dcState.setState({ selectedRackId: null, selectedTileId: null });
        this.renderPropsPanel();
        this.render3D();
      }

      this.isOrbiting3D = true;
      this.orbitStart = { x: e.clientX, y: e.clientY, rx: this.rotX, rz: this.rotZ };
    };

    window.onmousemove = (e) => {
      if (!this.isOrbiting3D) return;
      const dx = e.clientX - this.orbitStart.x;
      const dy = e.clientY - this.orbitStart.y;
      this.rotZ = this.orbitStart.rz + dx * 0.5;
      this.rotX = Math.max(10, Math.min(85, this.orbitStart.rx - dy * 0.5));
      this.apply3DTransform();
    };

    window.onmouseup = () => { this.isOrbiting3D = false; };

    wrap3d.querySelector('#dc3d-preset-iso')?.addEventListener('click', () => {
      this.rotX = 55; this.rotZ = -45; this.scale3D = 1.0;
      this.apply3DTransform();
    });

    wrap3d.querySelector('#dc3d-preset-top')?.addEventListener('click', () => {
      this.rotX = 15; this.rotZ = 0; this.scale3D = 1.0;
      this.apply3DTransform();
    });

    wrap3d.querySelector('#dc3d-preset-front')?.addEventListener('click', () => {
      this.rotX = 80; this.rotZ = 0; this.scale3D = 1.0;
      this.apply3DTransform();
    });

    wrap3d.querySelector('#dc3d-reset-cam')?.addEventListener('click', () => {
      this.rotX = 55; this.rotZ = -45; this.scale3D = 1.0;
      this.apply3DTransform();
    });

    wrap3d.querySelector('#dc3d-zoomin')?.addEventListener('click', () => {
      this.scale3D = Math.min(this.scale3D * 1.25, 4.0);
      this.apply3DTransform();
    });

    wrap3d.querySelector('#dc3d-zoomout')?.addEventListener('click', () => {
      this.scale3D = Math.max(this.scale3D * 0.8, 0.3);
      this.apply3DTransform();
    });
  }

  private build3DHTML(floor: DcFloor): string {
    const s = dcState.getState();
    const scale = 12;
    const rackHtml = floor.racks.map(rack => {
      const x = rack.position.x * scale * 10;
      const y = rack.position.y * scale * 10;
      const rW = rack.widthMm / 1000;
      const rD = rack.depthMm / 1000;
      const eW = rack.rotation % 180 === 0 ? rW : rD;
      const eD = rack.rotation % 180 === 0 ? rD : rW;
      const pw = eW * scale * 10;
      const ph = eD * scale * 10;
      const color = rack.color ?? '#1e3a5f';
      const heightPx = Math.max(30, rack.heightU * 1.5);
      const isSelected = rack.id === s.selectedRackId;
      return `<div class="dc3d-rack${isSelected ? ' selected' : ''}" data-rack-id="${rack.id}" style="left:${x}px;top:${y}px;width:${pw}px;height:${ph}px;background:${color};">
        <div class="dc3d-rack-top" style="width:${pw}px;height:${ph}px;transform: translateZ(${heightPx}px);"></div>
        <span class="dc3d-rack-label" style="transform: translateZ(${heightPx + 4}px);">${rack.name}</span>
      </div>`;
    }).join('');

    return `<div class="dc3d-scene" style="width:${floor.lengthM * scale * 10}px;height:${floor.widthM * scale * 10}px;transform: scale(${this.scale3D}) perspective(900px) rotateX(${this.rotX}deg) rotateZ(${this.rotZ}deg);">
      <div class="dc3d-floor" style="width:100%;height:100%;"></div>
      ${rackHtml}
      <div class="dc3d-label">3D Isometric Plot — ${floor.name} (${formatDimensionsMeters(floor.lengthM, floor.widthM)})</div>
    </div>`;
  }
}
