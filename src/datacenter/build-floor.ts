import { dcState } from './dc-state';
import { DcFloor, DcRack } from './types';

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
  private isPanning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  private isDraggingRack = false;
  private draggingRackId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragPos: { x: number; y: number } | null = null;
  private unsub: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
    this.unsub = dcState.subscribe(() => this.refresh());
  }

  destroy() {
    this.unsub?.();
    cancelAnimationFrame(this.animFrame);
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
            <button class="dc-btn dc-btn-icon" id="dc-btn-2d" title="2D Floor Plan">2D</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-3d" title="3D View">3D</button>
            <div class="dc-divider"></div>
            <button class="dc-btn dc-btn-icon" id="dc-btn-grid" title="Toggle Grid">⊞ Grid</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-snap" title="Toggle Snap">⌂ Snap</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-labels" title="Toggle Labels">🏷 Labels</button>
            <div class="dc-divider"></div>
            <button class="dc-btn dc-btn-icon" id="dc-btn-fit" title="Fit Floor to Screen">⤢ Fit</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-zoomin" title="Zoom In">＋</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-zoomout" title="Zoom Out">－</button>
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
        <div class="dc-statusbar" id="dc-statusbar">Ready</div>
      </div>
    `;

    this.canvas = this.container.querySelector('#dc-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;

    this.bindButtons();
    this.bindCanvasEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.refresh();
  }

  private bindButtons() {
    const on = (id: string, fn: () => void) => this.container.querySelector(`#${id}`)?.addEventListener('click', fn);
    on('dc-btn-newfloor', () => this.showCreateFloorDialog());
    on('dc-btn-2d', () => { dcState.setState({ viewMode: '2d' }); this.refresh(); });
    on('dc-btn-3d', () => { dcState.setState({ viewMode: '3d' }); this.render3D(); });
    on('dc-btn-grid', () => { dcState.setState({ gridVisible: !dcState.getState().gridVisible }); });
    on('dc-btn-snap', () => { dcState.setState({ snapEnabled: !dcState.getState().snapEnabled }); });
    on('dc-btn-labels', () => { dcState.setState({ labelsVisible: !dcState.getState().labelsVisible }); });
    on('dc-btn-fit', () => this.fitToFloor());
    on('dc-btn-zoomin', () => { this.ppm = Math.min(this.ppm * 1.25, 2000); this.draw(); });
    on('dc-btn-zoomout', () => { this.ppm = Math.max(this.ppm * 0.8, 10); this.draw(); });
  }

  private resize() {
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (!wrap || !this.canvas) return;
    this.canvas.width = wrap.clientWidth;
    this.canvas.height = wrap.clientHeight;
    this.draw();
  }

  private bindCanvasEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.panX = mx - (mx - this.panX) * factor;
      this.panY = my - (my - this.panY) * factor;
      this.ppm = Math.min(Math.max(this.ppm * factor, 10), 2000);
      this.draw();
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
        this.canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 0) this.handleMouseDown(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = this.panStart.px + (e.clientX - this.panStart.x);
        this.panY = this.panStart.py + (e.clientY - this.panStart.y);
        this.draw();
        return;
      }
      if (this.isDraggingRack) this.handleRackDrag(e);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) { this.isPanning = false; this.canvas.style.cursor = 'default'; }
      if (this.isDraggingRack) this.handleRackDrop(e);
    });

    this.canvas.addEventListener('click', (e) => {
      if (!this.isDraggingRack) this.handleClick(e);
    });
  }

  private worldToScreen(xM: number, yM: number): { sx: number; sy: number } {
    return { sx: xM * this.ppm + this.panX, sy: yM * this.ppm + this.panY };
  }

  private screenToWorld(sx: number, sy: number): { xM: number; yM: number } {
    return { xM: (sx - this.panX) / this.ppm, yM: (sy - this.panY) / this.ppm };
  }

  private handleMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const { xM, yM } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
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
    const { xM, yM } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
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

  private handleClick(_e: MouseEvent) {
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
    this.ctx.clearRect(0, 0, W, H);

    this.ctx.fillStyle = '#0d1117';
    this.ctx.fillRect(0, 0, W, H);

    if (!floor) {
      this.ctx.fillStyle = '#475569';
      this.ctx.font = '16px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('No floor loaded. Click + New Floor to start.', W / 2, H / 2);
      return;
    }

    const tileM = floor.tileSizeMm / 1000;
    const tilePx = tileM * this.ppm;

    for (const tile of floor.tiles) {
      const { sx, sy } = this.worldToScreen(tile.x, tile.y);
      const tw = tilePx;
      const th = tilePx;

      if (sx + tw < 0 || sy + th < 0 || sx > W || sy > H) continue;

      const isPartial = tile.type === 'partial';
      const isSelected = tile.id === s.selectedTileId;

      if (isSelected) {
        this.ctx.fillStyle = 'rgba(56,189,248,0.25)';
      } else if (isPartial) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
      } else {
        this.ctx.fillStyle = 'rgba(255,255,255,0.04)';
      }
      this.ctx.fillRect(sx, sy, tw, th);

      if (s.gridVisible) {
        this.ctx.strokeStyle = isSelected ? 'rgba(56,189,248,0.7)' : isPartial ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(sx, sy, tw, th);
      }

      if (s.labelsVisible && tilePx >= 40) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
        this.ctx.font = `${Math.max(9, Math.min(11, tilePx * 0.18))}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(tile.id, sx + tw / 2, sy + th / 2 + 4);
      }
    }

    const { sx: fx, sy: fy } = this.worldToScreen(0, 0);
    const fw = floor.lengthM * this.ppm;
    const fh = floor.widthM * this.ppm;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(fx, fy, fw, fh);

    for (const rack of floor.racks) {
      const isDragging = rack.id === this.draggingRackId;
      const pos = isDragging && this.dragPos ? this.dragPos : rack.position;
      this.drawRack(rack, pos.x, pos.y, isDragging);
    }

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
    this.ctx.shadowBlur = isSelected ? 12 : 6;

    this.ctx.fillStyle = invalid ? 'rgba(239,68,68,0.5)' : isDragging ? 'rgba(56,189,248,0.3)' : color;
    this.ctx.fillRect(sx, sy, pw, ph);
    this.ctx.shadowBlur = 0;

    this.ctx.strokeStyle = invalid ? '#ef4444' : isSelected ? '#38bdf8' : '#4a9eff';
    this.ctx.lineWidth = isSelected ? 2 : 1;
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
    const padding = 60;
    const availW = wrap.clientWidth - padding * 2;
    const availH = wrap.clientHeight - padding * 2;
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
      <div class="dc-info-row"><span class="dc-info-label">Dimensions</span><span class="dc-info-val">${floor.lengthM}m × ${floor.widthM}m</span></div>
      <div class="dc-info-row"><span class="dc-info-label">ESD Tile</span><span class="dc-info-val">${floor.tileSizeMm} × ${floor.tileSizeMm}mm</span></div>
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
    this.draw();
    const floor = dcState.getActiveFloor();
    if (!floor) {
      const el = this.container.querySelector('#dc-info-content');
      if (el) el.innerHTML = '<div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div>';
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
        el.innerHTML = `
          <div class="dc-props-section">
            <div class="dc-props-title">Rack</div>
            <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${rack.id}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val">${rack.name}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${rack.widthMm} × ${rack.depthMm}mm</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Height</span><span class="dc-info-val">${rack.heightU}U</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Position</span><span class="dc-info-val">X:${rack.position.x.toFixed(2)}m Y:${rack.position.y.toFixed(2)}m</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Rotation</span><span class="dc-info-val">${rack.rotation}°</span></div>
            ${rack.manufacturer ? `<div class="dc-info-row"><span class="dc-info-label">Mfr</span><span class="dc-info-val">${rack.manufacturer}</span></div>` : ''}
          </div>
          <div class="dc-props-actions">
            <button class="dc-btn dc-btn-sm" id="dc-rack-rotate" title="Rotate 90°">↻ Rotate</button>
            <button class="dc-btn dc-btn-sm" id="dc-rack-duplicate" title="Duplicate">⊕ Duplicate</button>
            <button class="dc-btn dc-btn-sm dc-btn-danger" id="dc-rack-delete" title="Delete">🗑 Delete</button>
          </div>
        `;
        el.querySelector('#dc-rack-rotate')?.addEventListener('click', () => {
          const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          dcState.updateRack(rack.id, { rotation: rot });
          this.renderPropsPanel();
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
            <div class="dc-props-title">Tile</div>
            <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${tile.id}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Row</span><span class="dc-info-val">${tile.row}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Col</span><span class="dc-info-val">${tile.col}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">X</span><span class="dc-info-val">${tile.x.toFixed(3)}m</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Y</span><span class="dc-info-val">${tile.y.toFixed(3)}m</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Z</span><span class="dc-info-val">${tile.z}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${tile.widthMm} × ${tile.depthMm}mm</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val">${tile.type}</span></div>
          </div>
        `;
        return;
      }
    }

    el.innerHTML = '<p class="dc-muted">Select a tile or rack.</p>';
  }

  private showCreateFloorDialog() {
    this.showModal('Create Datacenter Floor', `
      <div class="dc-form">
        <label>Floor Name<input id="df-name" type="text" value="Main Data Hall" class="dc-input"/></label>
        <label>Length (meters)<input id="df-length" type="number" value="30" min="1" max="500" step="1" class="dc-input"/></label>
        <label>Width (meters)<input id="df-width" type="number" value="20" min="1" max="500" step="1" class="dc-input"/></label>
        <label>ESD Tile Size (mm)<input id="df-tile" type="number" value="600" min="300" max="1200" step="50" class="dc-input"/></label>
        <div class="dc-form-preview" id="df-preview"></div>
      </div>
    `, 'Create Floor', () => {
      const name = (document.getElementById('df-name') as HTMLInputElement).value.trim() || 'Main Data Hall';
      const len = parseFloat((document.getElementById('df-length') as HTMLInputElement).value) || 30;
      const wid = parseFloat((document.getElementById('df-width') as HTMLInputElement).value) || 20;
      const tile = parseFloat((document.getElementById('df-tile') as HTMLInputElement).value) || 600;
      if (len <= 0 || wid <= 0 || tile <= 0) { alert('Invalid dimensions.'); return false; }
      dcState.createFloor(name, len, wid, tile);
      setTimeout(() => this.fitToFloor(), 50);
      return true;
    });

    const updatePreview = () => {
      const len = parseFloat((document.getElementById('df-length') as HTMLInputElement)?.value) || 30;
      const wid = parseFloat((document.getElementById('df-width') as HTMLInputElement)?.value) || 20;
      const tile = parseFloat((document.getElementById('df-tile') as HTMLInputElement)?.value) || 600;
      const cols = Math.ceil(len / (tile / 1000));
      const rows = Math.ceil(wid / (tile / 1000));
      const prev = document.getElementById('df-preview');
      if (prev) prev.innerHTML = `<div class="dc-preview-line">Grid: <b>${cols} columns × ${rows} rows</b> = <b>${cols * rows}</b> tiles</div>`;
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
        position: { x: tileM, y: tileM, z: 0 },
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

  private render3D() {
    const floor = dcState.getActiveFloor();
    const wrap3d = this.container.querySelector('#dc-3d-container') as HTMLElement;
    const canvasEl = this.container.querySelector('#dc-canvas') as HTMLElement;
    if (!wrap3d) return;
    const is3D = dcState.getState().viewMode === '3d';
    wrap3d.classList.toggle('hidden', !is3D);
    canvasEl?.classList.toggle('hidden', is3D);
    if (!is3D || !floor) return;
    wrap3d.innerHTML = this.build3DHTML(floor);
  }

  private build3DHTML(floor: DcFloor): string {
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
      return `<div class="dc3d-rack" style="left:${x}px;top:${y}px;width:${pw}px;height:${ph}px;background:${color};">
        <div class="dc3d-rack-top" style="width:${pw}px;height:${pw * 0.3}px;"></div>
        <span class="dc3d-rack-label">${rack.name}</span>
      </div>`;
    }).join('');

    return `<div class="dc3d-scene" style="width:${floor.lengthM * scale * 10}px;height:${floor.widthM * scale * 10}px;">
      <div class="dc3d-floor" style="width:100%;height:100%;"></div>
      ${rackHtml}
      <div class="dc3d-label">3D Floor Plan — ${floor.name} (${floor.lengthM}m × ${floor.widthM}m)</div>
    </div>`;
  }
}
