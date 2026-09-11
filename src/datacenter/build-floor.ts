import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialManager } from '../three/MaterialManager';
import { buildRackGroup } from '../three/rack-builder';
import { dcState } from './dc-state';
import { DcFloor, DcRack, DcUnit, DcRackType, DcDoorStyle, DcMounting, DcSpacingStandard, DcAddressFormat, DcFloorTile, DcAirflowDirection, DcInfrastructureItem, DcInfraCategory } from './types';
import { RACK_PRESETS, SPACING_STANDARDS, RackPreset, SpacingStandardInfo } from './standards';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import { RackData, RACK_CONSTANTS, DeviceData, DeviceTemplate, CableData } from '../core/types';
import { downloadFile, sanitizeAndRepairDevicesAndCables } from '../utils/export';
import { buildDeviceMesh } from '../three/device-builder';
import { buildCableMesh } from '../three/cable-builder';
import { getDevicePowerWatts, getRackPowerCapacityWatts } from '../utils/power';

import { getTemplate } from '../library/device-catalog';

import { DEVICE_FACE_Z } from '../three/rack-builder';
import {
  formatSingleDistance,
  formatDimensionsMeters,
  formatDimensionsMm,
  formatRackHeight,
  formatArea,
  metersToAll,
  mmToAll,
  unitToMeters,
  metersToUnit,
  unitToMm,
  mmToUnit,
  getUnitName,
  getUnitSymbol,
} from './units';

const RACK_COLORS = ['#1e3a5f', '#1a4731', '#3d1a1a', '#2d1f4e', '#1a3535'];
let rackColorIdx = 0;

export class BuildFloorView {
  private container: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrame = 0;
  private ppm = 100; // pixels per meter
  // Camera center in world coordinates (meters)
  private camX = 6;
  private camY = 4;
  private get panX(): number {
    const W = this.canvas?.width || 800;
    return W / 2 - this.camX * this.ppm;
  }
  private set panX(val: number) {
    const W = this.canvas?.width || 800;
    this.camX = (W / 2 - val) / this.ppm;
  }
  private get panY(): number {
    const H = this.canvas?.height || 600;
    return H / 2 - this.camY * this.ppm;
  }
  private set panY(val: number) {
    const H = this.canvas?.height || 600;
    this.camY = (H / 2 - val) / this.ppm;
  }
  private toolMode: 'select' | 'pan' = 'select';
  private isPanning = false;
  private panStartCam = { camX: 0, camY: 0, mouseX: 0, mouseY: 0 };
  private isDraggingRack = false;
  private draggingRackId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragPos: { x: number; y: number } | null = null;
  private unsub: (() => void) | null = null;
  private unsubGlobal: (() => void) | null = null;
  private unsubBus: (() => void) | null = null;
  private hasFittedInitialFloor = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceId = 0;  // RAF handle for debounced resize
  private isLeftPanelCollapsed = false;

  // Drag threshold to prevent unintended pan/drag resets on simple clicks
  private pendingPan = false;
  private pendingDragRack = false;
  private mouseDownClientPos = { x: 0, y: 0 };
  private readonly DRAG_THRESHOLD_PX = 6;

  // Snap Gap Indicators during dragging
  private snapGapInfo: { x1: number; y1: number; x2: number; y2: number; label: string } | null = null;
  private strictGridOnly = false; // When true, movements lock strictly to whole tile boundaries only
  private isMovingPlacementMode = false; // Active move mode from context menu, props, or hotkey

  public startMovingRack(rackId: string) {
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const rack = floor.racks.find(r => r.id === rackId);
    if (!rack) return;

    if (dcState.getState().viewMode === '3d') {
      this.setViewMode('2d');
    }

    dcState.setState({ selectedRackId: rack.id, selectedTileId: null });
    this.isMovingPlacementMode = true;
    this.isDraggingRack = true;
    this.draggingRackId = rack.id;
    this.dragOffset = {
      x: (rack.rotation % 180 === 0 ? rack.widthMm : rack.depthMm) / 2000,
      y: (rack.rotation % 180 === 0 ? rack.depthMm : rack.widthMm) / 2000,
    };
    this.dragPos = { x: rack.position.x, y: rack.position.y };
    this.canvas.style.cursor = 'move';
    this.renderPropsPanel();
    this.draw();

    eventBus.emit('notification', {
      message: `Moving ${rack.name}: Move cursor to position on floor grid and click to drop. [Esc] to cancel.`,
      type: 'info',
    });
  }

  public nudgeRack(rackId: string, dxM: number, dyM: number): boolean {
    const floor = dcState.getActiveFloor();
    if (!floor) return false;
    const rack = floor.racks.find(r => r.id === rackId);
    if (!rack) return false;

    const rW = rack.widthMm / 1000;
    const rD = rack.depthMm / 1000;
    const eW = rack.rotation % 180 === 0 ? rW : rD;
    const eD = rack.rotation % 180 === 0 ? rD : rW;

    const targetX = Math.max(0, Math.min(floor.lengthM - eW, parseFloat((rack.position.x + dxM).toFixed(4))));
    const targetY = Math.max(0, Math.min(floor.widthM - eD, parseFloat((rack.position.y + dyM).toFixed(4))));

    if (Math.abs(targetX - rack.position.x) < 0.0001 && Math.abs(targetY - rack.position.y) < 0.0001) {
      return false; // Already at boundary
    }

    const updatedRack = { ...rack, position: { x: targetX, y: targetY, z: 0 } };
    if (dcState.isOverlapping(updatedRack, rack.id)) {
      eventBus.emit('notification', { message: 'Cannot nudge: Overlaps another rack.', type: 'warning' });
      return false;
    }

    dcState.updateRack(rack.id, { position: { x: targetX, y: targetY, z: 0 } });
    this.renderPropsPanel();
    const is3D = dcState.getState().viewMode === '3d';
    if (is3D) this.render3D(); else this.draw();
    return true;
  }

  // 2D Canvas View Rotation: 0, 90, 180, 270 degrees
  private canvasRotationDeg: 0 | 90 | 180 | 270 = 0;

  // 3D WebGL Viewport
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private threeScene: THREE.Scene | null = null;
  private threeCamera: THREE.PerspectiveCamera | null = null;
  private threeControls: OrbitControls | null = null;
  private threeMaterials: MaterialManager | null = null;
  private threeAnimId: number | null = null;
  private threeRaycaster = new THREE.Raycaster();
  private threeMouse = new THREE.Vector2();
  private rackMeshMap = new Map<THREE.Object3D, string>();
  private hasInitialized3DTarget = false;
  private lastRenderedFloorId: string | null = null;
  private threeGridGroup: THREE.Group | null = null;
  private threeFloorMaterials: THREE.Material[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
    this.unsub = dcState.subscribe(() => this.refresh());
    const onStateChanged = () => {
      const s = dcState.getState();
      const floor = dcState.getActiveFloor();
      if (!floor) return;
      if (s.viewMode === '3d') {
        this.rebuildThreeScene(floor);
      } else {
        this.draw();
      }
      this.renderPropsPanel();
    };

    eventBus.on('state:changed', onStateChanged);
    eventBus.on('device:added' as any, onStateChanged);
    eventBus.on('device:updated' as any, onStateChanged);
    eventBus.on('device:deleted' as any, onStateChanged);
    eventBus.on('device:moved' as any, onStateChanged);

    this.unsubGlobal = () => {
      eventBus.off('state:changed', onStateChanged);
      eventBus.off('device:added' as any, onStateChanged);
      eventBus.off('device:updated' as any, onStateChanged);
      eventBus.off('device:deleted' as any, onStateChanged);
      eventBus.off('device:moved' as any, onStateChanged);
    };

    // Listen to events from the dedicated left sidebar
    const onAddRack = () => this.showAddRackDialog();
    const onAddRow = () => this.showAddRowDialog();
    const onEditFloor = (fl: DcFloor) => this.showEditFloorDialog(fl || dcState.getActiveFloor()!);
    const onDeleteFloor = (fl: DcFloor) => {
      const target = fl || dcState.getActiveFloor();
      if (target && confirm(`Delete floor "${target.name}"? This cannot be undone.`)) {
        dcState.deleteFloor(target.id);
      }
    };
    const onNewFloor = () => this.showCreateFloorDialog();
    const onSetUnit = (unit: DcUnit) => {
      const activeFl = dcState.getActiveFloor();
      if (activeFl) dcState.updateFloor(activeFl.id, { unit });
    };

    const onResetFloor = () => this.promptResetFloor();

    eventBus.on('dc:addrack' as any, onAddRack);
    eventBus.on('dc:addrow' as any, onAddRow);
    eventBus.on('dc:editfloor' as any, onEditFloor);
    eventBus.on('dc:deletefloor' as any, onDeleteFloor);
    eventBus.on('dc:newfloor' as any, onNewFloor);
    eventBus.on('dc:resetfloor' as any, onResetFloor);
    eventBus.on('dc:setunit' as any, onSetUnit);

    this.unsubBus = () => {
      eventBus.off('dc:addrack' as any, onAddRack);
      eventBus.off('dc:addrow' as any, onAddRow);
      eventBus.off('dc:editfloor' as any, onEditFloor);
      eventBus.off('dc:deletefloor' as any, onDeleteFloor);
      eventBus.off('dc:newfloor' as any, onNewFloor);
      eventBus.off('dc:resetfloor' as any, onResetFloor);
      eventBus.off('dc:setunit' as any, onSetUnit);
    };
  }

  destroy() {
    this.unsub?.();
    this.unsubGlobal?.();
    this.unsubBus?.();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.animFrame);
    if (this.threeAnimId !== null) cancelAnimationFrame(this.threeAnimId);
    if (this.threeControls) this.threeControls.dispose();
    if (this.threeRenderer) this.threeRenderer.dispose();
  }

  public show() {
    // Always collapse the global right-panel when entering datacenter view.
    // The datacenter uses its own internal panels; the global #properties-panel opening
    // would cause a CSS width transition on #dc-canvas-wrap → ResizeObserver cascade → viewport jump.
    document.getElementById('properties-panel')?.classList.add('collapsed');
    document.getElementById('btn-unhide-properties')?.classList.remove('hidden');

    setTimeout(() => {
      this.resize();
      const activeFloor = dcState.getActiveFloor();
      if (!activeFloor) {
        this.showCreateFloorDialog(true);
        return;
      }
      this.fitToFloor();
      this.hasFittedInitialFloor = true;
      const s = dcState.getState();
      if (s.viewMode === '3d') {
        this.render3D();
        this.rebuildThreeScene(activeFloor);
        this.resizeThree();
      } else {
        this.draw();
      }
      this.renderPropsPanel();
    }, 40);
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
            <button class="dc-btn dc-btn-secondary" id="dc-btn-resetfloor" title="Reset Datacenter Floor to empty layout">↺ Reset Floor</button>
            <button class="dc-btn dc-btn-primary" id="dc-btn-addrack-topbar" title="Add single rack to floor">＋ Add Rack</button>
            <button class="dc-btn" id="dc-btn-addrow" title="Add Row of Racks (International Standard Spacing)">▤ Add Row (Standards)</button>
            <div class="dc-divider"></div>
            <!-- Mode switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-tool-select" title="Select Tool (Hotkey: S)">↖ Select (S)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-tool-pan" title="Move/Pan Tool (Hotkey: M)">✋ Move (M)</button>
            <div class="dc-divider"></div>
            <!-- View switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-2d" title="2D Top View">2D (Top View)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-3d" title="3D Isometric View">3D (Isometric)</button>
            <div class="dc-divider"></div>
            <!-- Floor Transparency & X-Ray Mode -->
            <button class="dc-btn dc-btn-icon" id="dc-btn-xray" title="Toggle Under-Floor Infrastructure X-Ray Mode">🦴 X-Ray</button>
            <div class="dc-slider-control" title="Adjust Raised Floor Surface Opacity (0% - 100%)">
              <span>Floor:</span>
              <input type="range" id="dc-floor-opacity" class="dc-slider" min="0" max="100" value="100" />
            </div>
            <div class="dc-divider"></div>
            <!-- Grid & Labels -->
            <button class="dc-btn dc-btn-icon" id="dc-btn-grid" title="Toggle Grid Lines">⊞ Grid</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-snap" title="Toggle Smart Snap (Standards & Grid)">⌂ Snap</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-grid-lock" title="Strict Grid Movement (Lock movement strictly to whole ESD grid tiles only)">▦ Grid-Only (Off)</button>
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
            <label class="dc-unit-selector-label" title="Active measurement unit">Unit:
              <select id="dc-topbar-unit" class="dc-select-sm">
                <option value="m">Meters (m)</option>
                <option value="mm">Millimeters (mm)</option>
                <option value="ft">Feet (ft)</option>
                <option value="in">Inches (in)</option>
              </select>
            </label>
            <span class="dc-save-indicator" id="dc-save-indicator">● Saved</span>
          </div>
        </div>
        <div class="dc-body">
          <div class="dc-info-panel" id="dc-info-panel">
            <div class="dc-panel-header">
              <div class="dc-panel-title">DATACENTER FLOOR</div>
              <button class="dc-btn-toggle-panel" id="dc-toggle-left-panel" title="Collapse Left Panel (more room space)">◀</button>
            </div>
            <div id="dc-info-content"><div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div></div>
          </div>
          <div class="dc-canvas-wrap" id="dc-canvas-wrap">
            <button class="dc-expand-panel-btn hidden" id="dc-expand-left-panel" title="Expand Floor Info Panel">▶ Floor Info</button>
            <canvas id="dc-canvas"></canvas>
            <div class="dc-3d-container hidden" id="dc-3d-container"></div>
          </div>
          <div class="dc-props-panel" id="dc-props-panel">
            <div class="dc-panel-title">PROPERTIES</div>
            <div id="dc-props-content"><p class="dc-muted">Select a tile or rack.</p></div>
          </div>
        </div>
        <div class="dc-statusbar" id="dc-statusbar">Point-to-Zoom: Wheel | [Z] Zoom to Selected Rack / Fit Floor | [S] Select | [M] Move | [R] Rotate</div>
      </div>
    `;

    this.canvas = this.container.querySelector('#dc-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;

    // Setup ResizeObserver to handle dynamic viewport sizing.
    // IMPORTANT: debounce with rAF so that CSS panel open/close transitions (0.22s) only
    // trigger ONE resize+redraw at the FINAL settled size, not 50+ during the animation.
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (wrap && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeDebounceId) cancelAnimationFrame(this.resizeDebounceId);
        this.resizeDebounceId = requestAnimationFrame(() => {
          this.resizeDebounceId = 0;
          if (wrap.clientWidth > 0 && wrap.clientHeight > 0) {
            this.resize();
            if (!this.hasFittedInitialFloor) {
              this.fitToFloor();
              this.hasFittedInitialFloor = true;
            }
          }
        });
      });
      this.resizeObserver.observe(wrap);
    }

    this.bindButtons();
    this.bindCanvasEvents();
    this.bindKeyboardEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    dcState.subscribe(() => this.refresh());
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

  private toggleLeftPanel(collapse?: boolean) {
    this.isLeftPanelCollapsed = collapse !== undefined ? collapse : !this.isLeftPanelCollapsed;
    const panel = this.container.querySelector('#dc-info-panel');
    const expandBtn = this.container.querySelector('#dc-expand-left-panel');
    if (panel) panel.classList.toggle('collapsed', this.isLeftPanelCollapsed);
    if (expandBtn) expandBtn.classList.toggle('hidden', !this.isLeftPanelCollapsed);
    setTimeout(() => {
      this.resize();
      if (dcState.getState().viewMode === '3d') this.render3D(); else this.draw();
    }, 220);
  }

  public toggleXrayMode() {
    const s = dcState.getState();
    const newXray = !s.xrayMode;
    dcState.setState({ xrayMode: newXray });
    this.applyFloorOpacity(newXray ? 0.22 : s.floorOpacity);
    this.updateButtonStates();
    eventBus.emit('notification', { message: `X-Ray Mode ${newXray ? 'Enabled (Beneath Raised Floor Service View)' : 'Disabled'}.`, type: 'info' });
  }

  public setFloorOpacity(val: number) {
    const clamped = Math.max(0, Math.min(1, val));
    dcState.setState({ floorOpacity: clamped });
    const s = dcState.getState();
    const eff = s.xrayMode ? 0.22 : clamped;
    this.applyFloorOpacity(eff);
    this.updateButtonStates();
  }

  private applyFloorOpacity(effOpacity: number) {
    if (this.threeFloorMaterials && this.threeFloorMaterials.length > 0) {
      this.threeFloorMaterials.forEach(m => {
        m.transparent = effOpacity < 0.99;
        m.opacity = effOpacity;
        m.needsUpdate = true;
      });
    }

    if (dcState.getState().viewMode === '2d') {
      this.draw();
    }
  }

  private bindButtons() {
    const on = (id: string, fn: () => void) => this.container.querySelector(`#${id}`)?.addEventListener('click', fn);
    on('dc-btn-newfloor', () => this.showCreateFloorDialog());
    on('dc-btn-resetfloor', () => this.promptResetFloor());
    on('dc-btn-addrack-topbar', () => this.showAddRackDialog());
    on('dc-btn-addrow', () => this.showAddRowDialog());
    on('dc-btn-tool-select', () => this.setToolMode('select'));
    on('dc-btn-tool-pan', () => {
      const s = dcState.getState();
      if (s.selectedRackId) {
        this.startMovingRack(s.selectedRackId);
      } else {
        this.setToolMode('pan');
      }
    });
    on('dc-btn-2d', () => this.setViewMode('2d'));
    on('dc-btn-3d', () => this.setViewMode('3d'));
    on('dc-btn-rotate-2d', () => this.rotate2DView());
    on('dc-btn-xray', () => this.toggleXrayMode());
    this.container.querySelector('#dc-floor-opacity')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      this.setFloorOpacity(val);
    });
    on('dc-btn-grid', () => { dcState.setState({ gridVisible: !dcState.getState().gridVisible }); });
    on('dc-btn-snap', () => { dcState.setState({ snapEnabled: !dcState.getState().snapEnabled }); });
    on('dc-btn-grid-lock', () => {
      this.strictGridOnly = !this.strictGridOnly;
      if (this.strictGridOnly) dcState.setState({ snapEnabled: true });
      this.updateButtonStates();
      this.draw();
    });
    on('dc-btn-labels', () => { dcState.setState({ labelsVisible: !dcState.getState().labelsVisible }); });
    on('dc-toggle-left-panel', () => this.toggleLeftPanel(true));
    on('dc-expand-left-panel', () => this.toggleLeftPanel(false));
    
    this.container.querySelector('#dc-topbar-unit')?.addEventListener('change', (e) => {
      const selectedUnit = (e.target as HTMLSelectElement).value as DcUnit;
      const floor = dcState.getActiveFloor();
      if (floor) {
        dcState.updateFloor(floor.id, { unit: selectedUnit });
        this.refresh();
      }
    });

    // Pan navigation buttons
    on('dc-nav-left', () => { this.camX -= 80 / this.ppm; this.draw(); });
    on('dc-nav-right', () => { this.camX += 80 / this.ppm; this.draw(); });
    on('dc-nav-up', () => { this.camY -= 80 / this.ppm; this.draw(); });
    on('dc-nav-down', () => { this.camY += 80 / this.ppm; this.draw(); });

    on('dc-btn-fit', () => {
      const s = dcState.getState();
      if (s.selectedRackId) {
        this.zoomToSelectedRack();
      } else if (s.viewMode === '3d') {
        this.set3DCameraPreset('iso');
      } else {
        this.fitToFloor();
      }
    });

    on('dc-btn-zoomin', () => {
      if (dcState.getState().viewMode === '3d') {
        this.zoom3D(0.8);
      } else {
        this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 1.25);
      }
    });

    on('dc-btn-zoomout', () => {
      if (dcState.getState().viewMode === '3d') {
        this.zoom3D(1.25);
      } else {
        this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 0.8);
      }
    });
  }

  private resize() {
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    if (!wrap || !this.canvas) return;
    const oldW = this.canvas.width;
    const oldH = this.canvas.height;
    const newW = wrap.clientWidth;
    const newH = wrap.clientHeight;
    if (newW > 0 && newH > 0) {
      if (newW !== oldW || newH !== oldH) {
        console.log('[DC-RESIZE] canvas changed:', oldW, 'x', oldH, '->', newW, 'x', newH, '| panX:', this.panX.toFixed(1), 'panY:', this.panY.toFixed(1), 'ppm:', this.ppm.toFixed(1));
      }
      this.canvas.width = newW;
      this.canvas.height = newH;
      if (this.hasFittedInitialFloor && dcState.getState().viewMode !== '3d') {
        this.draw();
      }
    }
    this.resizeThree();
  }

  private zoomAtPoint(sx: number, sy: number, factor: number) {
    const oldPpm = this.ppm;
    // Cap zoom scale to 2,500 ppm max (1 meter fills 2,500px on screen).
    // This allows inspecting 1RU devices down to millimeter precision without runaway floating-point compounding.
    const newPpm = Math.min(Math.max(oldPpm * factor, 15), 2500);
    if (newPpm === oldPpm) return;

    // Convert screen coordinates to world coordinates before zoom
    const { xM, yM } = this.screenToWorld(sx, sy);

    const W = this.canvas.width || 800;
    const H = this.canvas.height || 600;
    let px = sx;
    let py = sy;
    if (this.canvasRotationDeg !== 0) {
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

    // Keep world coordinate (xM, yM) anchored exactly under cursor (px, py)
    this.camX = xM - (px - W / 2) / newPpm;
    this.camY = yM - (py - H / 2) / newPpm;
    this.ppm = newPpm;
    this.draw();
  }

  public zoomToSelectedRack() {
    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const rack = s.selectedRackId ? floor.racks.find(r => r.id === s.selectedRackId) : null;
    if (!rack) {
      if (s.viewMode === '3d') {
        this.set3DCameraPreset('iso');
      } else {
        this.fitToFloor();
      }
      return;
    }

    if (s.viewMode === '3d') {
      if (!this.threeCamera || !this.threeControls) return;
      const rWMm = rack.widthMm;
      const rDMm = rack.depthMm;
      const posX = rack.position.x * 1000 + (rack.rotation % 180 === 0 ? rWMm / 2 : rDMm / 2);
      const posZ = rack.position.y * 1000 + (rack.rotation % 180 === 0 ? rDMm / 2 : rWMm / 2);
      const rackHeightMm = 65 + rack.heightU * 44.45 + 65;
      const targetY = rackHeightMm / 2;

      this.threeControls.target.set(posX, targetY, posZ);
      const camDist = Math.max(Math.max(rWMm, rDMm) * 2.2, 1600);
      this.threeCamera.position.set(posX + camDist * 0.7, targetY + camDist * 0.55, posZ + camDist * 0.95);
      this.threeControls.update();
      this.update3DSelectionHighlight();
      return;
    }

    // 2D View Zoom to Rack
    this.resize();
    const rW = rack.widthMm / 1000;
    const rD = rack.depthMm / 1000;
    const effW = rack.rotation % 180 === 0 ? rW : rD;
    const effD = rack.rotation % 180 === 0 ? rD : rW;

    const rackCenterX = rack.position.x + effW / 2;
    const rackCenterY = rack.position.y + effD / 2;

    const W = this.canvas.width || 800;
    const H = this.canvas.height || 600;
    // Fit rack into ~40% of viewport
    const targetPpm = Math.min(Math.max(Math.min((W * 0.45) / effW, (H * 0.45) / effD), 300), 1800);

    this.ppm = targetPpm;
    this.camX = rackCenterX;
    this.camY = rackCenterY;
    this.draw();

    eventBus.emit('notification', {
      message: `Zoomed to ${rack.name} (${rack.heightU}U ${rack.type.toUpperCase()})`,
      type: 'info',
    });
  }

  private bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      const is3D = dcState.getState().viewMode === '3d';
      const key = e.key.toUpperCase();
      if (key === 'S') this.setToolMode('select');
      if (key === 'M') this.setToolMode('pan');
      if (key === 'Z') {
        const s = dcState.getState();
        if (s.selectedRackId) {
          this.zoomToSelectedRack();
        } else if (is3D) {
          this.set3DCameraPreset('iso');
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
      const s = dcState.getState();
      const floor = dcState.getActiveFloor();
      const stepM = floor ? floor.tileSizeMm / 1000 : 0.6;
      const nudgeDist = e.shiftKey ? 0.1 : stepM;

      if (e.key === 'ArrowLeft') {
        if (s.selectedRackId && floor) {
          e.preventDefault();
          this.nudgeRack(s.selectedRackId, -nudgeDist, 0);
          return;
        }
        this.camX -= 60 / this.ppm; this.draw();
      } else if (key === 'A') {
        this.camX -= 60 / this.ppm; this.draw();
      }

      if (e.key === 'ArrowRight') {
        if (s.selectedRackId && floor) {
          e.preventDefault();
          this.nudgeRack(s.selectedRackId, nudgeDist, 0);
          return;
        }
        this.camX += 60 / this.ppm; this.draw();
      } else if (key === 'D') {
        this.camX += 60 / this.ppm; this.draw();
      }

      if (e.key === 'ArrowUp') {
        if (s.selectedRackId && floor) {
          e.preventDefault();
          this.nudgeRack(s.selectedRackId, 0, -nudgeDist);
          return;
        }
        this.camY -= 60 / this.ppm; this.draw();
      } else if (key === 'W') {
        this.camY -= 60 / this.ppm; this.draw();
      }

      if (e.key === 'ArrowDown') {
        if (s.selectedRackId && floor) {
          e.preventDefault();
          this.nudgeRack(s.selectedRackId, 0, nudgeDist);
          return;
        }
        this.camY += 60 / this.ppm; this.draw();
      }
      if (e.key === '=' || e.key === '+') {
        if (is3D) {
          this.zoom3D(0.8);
        } else {
          this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 1.2);
        }
      }
      if (e.key === '-' || e.key === '_') {
        if (is3D) {
          this.zoom3D(1.25);
        } else {
          this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 0.8);
        }
      }
      if (e.key === 'Escape') {
        if (this.isMovingPlacementMode) {
          this.isMovingPlacementMode = false;
          this.isDraggingRack = false;
          this.draggingRackId = null;
          this.dragPos = null;
          this.snapGapInfo = null;
          this.canvas.style.cursor = this.toolMode === 'pan' ? 'grab' : 'crosshair';
          this.draw();
          eventBus.emit('notification', { message: 'Move rack cancelled.', type: 'info' });
          return;
        }
        dcState.setState({ selectedRackId: null, selectedTileId: null });
        this.renderPropsPanel();
        if (is3D) this.update3DSelectionHighlight(); else this.draw();
      }
    });
  }

  private bindCanvasEvents() {
    const wrap = this.container.querySelector('#dc-canvas-wrap') as HTMLElement;
    const wheelTarget = wrap || this.canvas;
    wheelTarget.addEventListener('wheel', (e) => {
      if (dcState.getState().viewMode === '3d') return; // Handled by 3D container
      e.preventDefault();
      let delta = -e.deltaY;
      if (e.deltaMode === 1) delta *= 30;
      else if (e.deltaMode === 2) delta *= 300;
      delta = Math.max(-120, Math.min(120, delta));

      // Use a consistent, smooth geometric step
      const factor = delta > 0 ? 1.12 : (1 / 1.12);
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / (rect.width || 1);
      const scaleY = this.canvas.height / (rect.height || 1);
      const mouseSx = (e.clientX - rect.left) * scaleX;
      const mouseSy = (e.clientY - rect.top) * scaleY;

      this.hasFittedInitialFloor = true;
      this.zoomAtPoint(mouseSx, mouseSy, factor);
    }, { passive: false });

    // Right-click context menu on 2D Canvas
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
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
          this.renderPropsPanel();
          this.showContextMenu(e.clientX, e.clientY, rack);
          return;
        }
      }

      // Check if clicking on an ESD floor tile
      if (xM >= 0 && yM >= 0 && xM < floor.lengthM && yM < floor.widthM) {
        const tileM = floor.tileSizeMm / 1000;
        const col = Math.floor(xM / tileM);
        const row = Math.floor(yM / tileM);
        const targetTile = floor.tiles.find(t => t.row === row && t.col === col);
        if (targetTile) {
          const s = dcState.getState();
          const currentTileIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
          if (currentTileIds.includes(targetTile.id) && currentTileIds.length > 1) {
            // Right-clicked on one of the already multi-selected tiles: keep multi-selection
            const selectedTiles = floor.tiles.filter(t => currentTileIds.includes(t.id));
            this.renderPropsPanel();
            this.draw();
            this.showTileContextMenu(e.clientX, e.clientY, targetTile, selectedTiles);
          } else {
            // Single tile select
            dcState.setState({ selectedTileId: targetTile.id, selectedTileIds: [targetTile.id], selectedRackId: null });
            this.renderPropsPanel();
            this.draw();
            this.showTileContextMenu(e.clientX, e.clientY, targetTile, [targetTile]);
          }
          return;
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey) || this.toolMode === 'pan') {
        this.pendingPan = true;
        this.isPanning = false;
        this.mouseDownClientPos = { x: e.clientX, y: e.clientY };
        this.panStartCam = { camX: this.camX, camY: this.camY, mouseX: e.clientX, mouseY: e.clientY };
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
        const floor = dcState.getActiveFloor();
        const primaryUnit = floor?.unit ?? 'm';
        if (statusbar && xM >= 0 && yM >= 0) {
          if (this.isMovingPlacementMode) {
            statusbar.textContent = `✋ MOVING RACK: Click on floor to drop & position | [R] Rotate 90° | [Esc] Cancel | X: ${formatSingleDistance(xM, primaryUnit)} | Y: ${formatSingleDistance(yM, primaryUnit)}`;
          } else {
            statusbar.textContent = `Cursor: X: ${formatSingleDistance(xM, primaryUnit)} | Y: ${formatSingleDistance(yM, primaryUnit)} | [Z] Zoom to Rack / Fit | [S] Select | [M] Move | [R] Rotate`;
          }
        }
      }

      // Check drag threshold for panning
      if (this.pendingPan && !this.isPanning) {
        const dist = Math.hypot(e.clientX - this.mouseDownClientPos.x, e.clientY - this.mouseDownClientPos.y);
        if (dist >= this.DRAG_THRESHOLD_PX) {
          this.isPanning = true;
          this.canvas.style.cursor = 'grabbing';
        }
      }

      // Check drag threshold for dragging racks
      if (this.pendingDragRack && !this.isDraggingRack) {
        const dist = Math.hypot(e.clientX - this.mouseDownClientPos.x, e.clientY - this.mouseDownClientPos.y);
        if (dist >= this.DRAG_THRESHOLD_PX) {
          this.isDraggingRack = true;
          this.canvas.style.cursor = 'move';
        }
      }

      if (this.isPanning) {
        const dx = e.clientX - this.panStartCam.mouseX;
        const dy = e.clientY - this.panStartCam.mouseY;
        let unrotDx = dx;
        let unrotDy = dy;
        if (this.canvasRotationDeg !== 0) {
          const rad = (-this.canvasRotationDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          unrotDx = dx * cos - dy * sin;
          unrotDy = dx * sin + dy * cos;
        }
        // Shifting mouse right moves view right -> camera center moves left (negative dx)
        this.camX = this.panStartCam.camX - unrotDx / this.ppm;
        this.camY = this.panStartCam.camY - unrotDy / this.ppm;
        this.draw();
        return;
      }
      if (this.isDraggingRack) this.handleRackDrag(e);
    });

    window.addEventListener('mouseup', (_e) => {
      this.pendingPan = false;
      this.pendingDragRack = false;
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.toolMode === 'pan' ? 'grab' : 'default';
      }
      if (this.isDraggingRack && !this.isMovingPlacementMode) {
        this.handleRackDrop(_e);
      } else if (!this.isMovingPlacementMode) {
        // Simple click without exceeding drag threshold: cleanly reset drag state so no ghost drag remains
        this.draggingRackId = null;
        this.dragPos = null;
      }
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

    // DEBUG: log coordinate state on every click
    console.log('[DC-CLICK] panX:', this.panX.toFixed(1), 'panY:', this.panY.toFixed(1),
      'ppm:', this.ppm.toFixed(1),
      'canvas:', this.canvas.width, 'x', this.canvas.height,
      'rect:', rect.width.toFixed(0), 'x', rect.height.toFixed(0),
      'rect.left:', rect.left.toFixed(0), 'rect.top:', rect.top.toFixed(0),
      'scaleX:', scaleX.toFixed(3), 'scaleY:', scaleY.toFixed(3),
      'canvasSx:', canvasSx.toFixed(1), 'canvasSy:', canvasSy.toFixed(1));

    const { xM, yM } = this.screenToWorld(canvasSx, canvasSy);
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    // If currently in active "Move Rack" placement mode, click to drop and place
    if (this.isMovingPlacementMode && this.draggingRackId) {
      this.handleRackDrop(e);
      return;
    }

    this.mouseDownClientPos = { x: e.clientX, y: e.clientY };

    for (const rack of floor.racks) {
      if (this.hitTestRack(rack, xM, yM)) {
        dcState.setState({ selectedRackId: rack.id, selectedTileId: null, selectedTileIds: [] });
        this.pendingDragRack = true;
        this.isDraggingRack = false;
        this.draggingRackId = rack.id;
        this.dragOffset = { x: xM - rack.position.x, y: yM - rack.position.y };
        this.dragPos = { x: rack.position.x, y: rack.position.y };
        this.renderPropsPanel();
        this.draw();
        return;
      }
    }

    const tileM = floor.tileSizeMm / 1000;
    const col = Math.floor(xM / tileM);
    const row = Math.floor(yM / tileM);
    if (xM >= 0 && yM >= 0 && xM < floor.lengthM && yM < floor.widthM) {
      const targetTile = floor.tiles.find(t => t.row === row && t.col === col);
      const rowLabel = String.fromCharCode(65 + (row % 26));
      const colLabel = String(col + 1).padStart(2, '0');
      const tileId = targetTile ? targetTile.id : `${rowLabel}-${colLabel}`;

      const isMultiKey = e.ctrlKey || e.metaKey || e.shiftKey;
      let newSelectedIds: string[] = [];
      const s = dcState.getState();
      const currentIds = Array.isArray(s.selectedTileIds) ? [...s.selectedTileIds] : (s.selectedTileId ? [s.selectedTileId] : []);

      if (isMultiKey) {
        if (currentIds.includes(tileId)) {
          newSelectedIds = currentIds.filter(id => id !== tileId);
        } else {
          newSelectedIds = [...currentIds, tileId];
        }
      } else {
        newSelectedIds = [tileId];
      }

      const primaryTileId = newSelectedIds.length > 0 ? newSelectedIds[newSelectedIds.length - 1] : null;
      dcState.setState({ selectedTileId: primaryTileId, selectedTileIds: newSelectedIds, selectedRackId: null });
      this.renderPropsPanel();
    } else {
      if (this.toolMode === 'pan' || e.altKey) {
        this.pendingPan = true;
        this.isPanning = false;
        this.panStartCam = { camX: this.camX, camY: this.camY, mouseX: e.clientX, mouseY: e.clientY };
      }
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        dcState.setState({ selectedTileId: null, selectedTileIds: [], selectedRackId: null });
        this.renderPropsPanel();
      }
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

    this.snapGapInfo = null;

    if (this.strictGridOnly) {
      // STRICT GRID LOCK: Move strictly on full ESD tile boundaries
      const tileM = floor.tileSizeMm / 1000;
      nx = Math.round(nx / tileM) * tileM;
      ny = Math.round(ny / tileM) * tileM;
      nx = parseFloat(nx.toFixed(4));
      ny = parseFloat(ny.toFixed(4));
    } else if (dcState.getState().snapEnabled) {
      const snapped = dcState.snapToGrid(nx, ny, floor.tileSizeMm / 1000);
      nx = snapped.x; ny = snapped.y;

      // Smart Snap to International Standard Gaps (0mm, 0.3m, 0.6m, 0.9m, 1.2m, 1.5m)
      const currentRack = floor.racks.find(r => r.id === this.draggingRackId);
      if (currentRack) {
        const cW = currentRack.widthMm / 1000;
        const cD = currentRack.depthMm / 1000;

        for (const other of floor.racks) {
          if (other.id === currentRack.id) continue;
          const oW = other.widthMm / 1000;
          const oD = other.depthMm / 1000;

          // Check horizontal gaps
          for (const std of SPACING_STANDARDS) {
            const gap = std.gapM;
            // Snap to right of other rack: nx = other.x + oW + gap
            const targetXRight = other.position.x + oW + gap;
            if (Math.abs(nx - targetXRight) < 0.08) {
              nx = parseFloat(targetXRight.toFixed(3));
              this.snapGapInfo = {
                x1: other.position.x + oW,
                y1: other.position.y + oD / 2,
                x2: nx,
                y2: ny + cD / 2,
                label: std.label,
              };
              break;
            }
            // Snap to left of other rack: nx + cW = other.x - gap
            const targetXLeft = other.position.x - gap - cW;
            if (Math.abs(nx - targetXLeft) < 0.08) {
              nx = parseFloat(targetXLeft.toFixed(3));
              this.snapGapInfo = {
                x1: nx + cW,
                y1: ny + cD / 2,
                x2: other.position.x,
                y2: other.position.y + oD / 2,
                label: std.label,
              };
              break;
            }
          }
        }
      }
    }

    const currentRack = floor.racks.find(r => r.id === this.draggingRackId);
    if (currentRack) {
      const rW = currentRack.widthMm / 1000;
      const rD = currentRack.depthMm / 1000;
      const eW = currentRack.rotation % 180 === 0 ? rW : rD;
      const eD = currentRack.rotation % 180 === 0 ? rD : rW;

      // Strict Room Boundary Clamping: Never allow rack dragging outside the user-defined floor
      const maxX = Math.max(0, floor.lengthM - eW);
      const maxY = Math.max(0, floor.widthM - eD);
      nx = Math.max(0, Math.min(maxX, nx));
      ny = Math.max(0, Math.min(maxY, ny));
    }

    this.dragPos = { x: parseFloat(nx.toFixed(4)), y: parseFloat(ny.toFixed(4)) };
    this.draw();
  }

  private handleRackDrop(_e: MouseEvent) {
    this.isDraggingRack = false;
    this.isMovingPlacementMode = false;
    this.canvas.style.cursor = this.toolMode === 'pan' ? 'grab' : 'crosshair';
    this.snapGapInfo = null;
    if (!this.draggingRackId || !this.dragPos) { this.draggingRackId = null; this.dragPos = null; return; }
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const rack = floor.racks.find(r => r.id === this.draggingRackId);
    if (!rack) return;

    const rW = rack.widthMm / 1000;
    const rD = rack.depthMm / 1000;
    const eW = rack.rotation % 180 === 0 ? rW : rD;
    const eD = rack.rotation % 180 === 0 ? rD : rW;
    const maxX = Math.max(0, floor.lengthM - eW);
    const maxY = Math.max(0, floor.widthM - eD);
    const clampedX = Math.max(0, Math.min(maxX, this.dragPos.x));
    const clampedY = Math.max(0, Math.min(maxY, this.dragPos.y));

    const updated: DcRack = { ...rack, position: { x: clampedX, y: clampedY, z: 0 } };
    if (!dcState.isOutOfBounds(updated) && !dcState.isOverlapping(updated, rack.id)) {
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

    const { sx: fx, sy: fy } = this.worldToScreen(0, 0);
    const fw = floor.lengthM * this.ppm;
    const fh = floor.widthM * this.ppm;

    // Strict defined room boundary letterbox / perimeter backdrop
    // Outer room shadow to elevate the physical data hall above dark letterbox backdrop
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    this.ctx.shadowBlur = 18;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 4;
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(fx, fy, fw, fh);
    this.ctx.restore();

    // STRICT ROOM BOUNDARY CLIPPING: Prevent any tile fills, lines, or textures from leaking outside
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(fx, fy, fw, fh);
    this.ctx.clip();

    // 1. Draw ESD Tiles (Realistic White Static Dissipative Access Floor Tiles)
    for (const tile of floor.tiles) {
      const { sx, sy } = this.worldToScreen(tile.x, tile.y);
      const tw = tilePx;
      const th = tilePx;

      const isPartial = tile.type === 'partial';
      const isSelected = (s.selectedTileIds && s.selectedTileIds.includes(tile.id)) || tile.id === s.selectedTileId;
      const isChecker = (tile.row + tile.col) % 2 === 0;

      if (isSelected) {
        // Cyan-blue tech selection glow over ESD tile
        this.ctx.fillStyle = '#bae6fd';
      } else if (tile.type === 'ventilated') {
        // Heavy-duty steel bar-grate ventilated plenum tile (dark plenum background)
        this.ctx.fillStyle = '#0f172a';
      } else if (tile.type === 'perforated') {
        // High-airflow perforated cold-aisle vented tile (metallic tint)
        this.ctx.fillStyle = '#e2e8f0';
      } else if (tile.type === 'air-channel') {
        // Under-floor air channel plenum tile (cool cyan tint)
        this.ctx.fillStyle = '#e0f2fe';
      } else if (isPartial) {
        // Partial perimeter cut tile
        this.ctx.fillStyle = isChecker ? '#e2e8f0' : '#cbd5e1';
      } else {
        // Authentic White ESD Tile (Crisp off-white / light tech gray with static dissipative panel variation)
        this.ctx.fillStyle = isChecker ? '#f8fafc' : '#f1f5f9';
      }
      this.ctx.fillRect(sx, sy, tw, th);

      // Render Ventilated ESD Steel Bar Grate / Grille in 2D
      if (tile.type === 'ventilated' && tw >= 14) {
        this.ctx.save();
        // 1. Steel outer border frame
        this.ctx.strokeStyle = '#64748b';
        this.ctx.lineWidth = Math.max(1.5, tw * 0.04);
        this.ctx.strokeRect(sx + 1, sy + 1, tw - 2, th - 2);

        // 2. Main vertical load-bearing steel bars (dense parallel bars)
        const barSpacing = Math.max(4, Math.min(10, tw / 14));
        const barCount = Math.floor((tw - 6) / barSpacing);
        this.ctx.fillStyle = '#cbd5e1';
        for (let i = 1; i <= barCount; i++) {
          const bx = sx + 3 + i * ((tw - 6) / (barCount + 1));
          this.ctx.fillRect(bx, sy + 2, 1.2, th - 4);
        }

        // 3. Transverse horizontal cross-tie rods (spaced further apart)
        const tieSpacing = Math.max(8, Math.min(18, th / 7));
        const tieCount = Math.floor((th - 6) / tieSpacing);
        this.ctx.fillStyle = '#94a3b8';
        for (let j = 1; j <= tieCount; j++) {
          const by = sy + 3 + j * ((th - 6) / (tieCount + 1));
          this.ctx.fillRect(sx + 2, by, tw - 4, 1.0);
        }
        this.ctx.restore();
      }

      // Render Perforated Tile Dot Grille in 2D
      if (tile.type === 'perforated' && tw >= 18) {
        this.ctx.fillStyle = '#1e293b';
        const colsHoles = Math.max(3, Math.min(8, Math.floor(tw / 6)));
        const rowsHoles = Math.max(3, Math.min(8, Math.floor(th / 6)));
        const dx = tw / (colsHoles + 1);
        const dy = th / (rowsHoles + 1);
        const r = Math.max(1, Math.min(2.5, dx * 0.25));
        for (let ix = 1; ix <= colsHoles; ix++) {
          for (let iy = 1; iy <= rowsHoles; iy++) {
            this.ctx.beginPath();
            this.ctx.arc(sx + ix * dx, sy + iy * dy, r, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
      }

      // Render Under-Floor Air Channel Airflow Direction Arrow in 2D
      if (tile.type === 'air-channel') {
        this.ctx.save();
        this.ctx.fillStyle = '#0284c7';
        this.ctx.strokeStyle = '#0369a1';
        this.ctx.lineWidth = 1.5;
        const arrow = tile.airflowDir || 'north';
        const cx = sx + tw / 2;
        const cy = sy + th / 2;
        const arrowSize = Math.min(tw, th) * 0.35;

        this.ctx.beginPath();
        if (arrow === 'north') {
          this.ctx.moveTo(cx, cy - arrowSize);
          this.ctx.lineTo(cx + arrowSize * 0.6, cy + arrowSize * 0.4);
          this.ctx.lineTo(cx + arrowSize * 0.2, cy + arrowSize * 0.4);
          this.ctx.lineTo(cx + arrowSize * 0.2, cy + arrowSize);
          this.ctx.lineTo(cx - arrowSize * 0.2, cy + arrowSize);
          this.ctx.lineTo(cx - arrowSize * 0.2, cy + arrowSize * 0.4);
          this.ctx.lineTo(cx - arrowSize * 0.6, cy + arrowSize * 0.4);
        } else if (arrow === 'south') {
          this.ctx.moveTo(cx, cy + arrowSize);
          this.ctx.lineTo(cx + arrowSize * 0.6, cy - arrowSize * 0.4);
          this.ctx.lineTo(cx + arrowSize * 0.2, cy - arrowSize * 0.4);
          this.ctx.lineTo(cx + arrowSize * 0.2, cy - arrowSize);
          this.ctx.lineTo(cx - arrowSize * 0.2, cy - arrowSize);
          this.ctx.lineTo(cx - arrowSize * 0.2, cy - arrowSize * 0.4);
          this.ctx.lineTo(cx - arrowSize * 0.6, cy - arrowSize * 0.4);
        } else if (arrow === 'east') {
          this.ctx.moveTo(cx + arrowSize, cy);
          this.ctx.lineTo(cx - arrowSize * 0.4, cy - arrowSize * 0.6);
          this.ctx.lineTo(cx - arrowSize * 0.4, cy - arrowSize * 0.2);
          this.ctx.lineTo(cx - arrowSize, cy - arrowSize * 0.2);
          this.ctx.lineTo(cx - arrowSize, cy + arrowSize * 0.2);
          this.ctx.lineTo(cx - arrowSize * 0.4, cy + arrowSize * 0.2);
          this.ctx.lineTo(cx - arrowSize * 0.4, cy + arrowSize * 0.6);
        } else if (arrow === 'west') {
          this.ctx.moveTo(cx - arrowSize, cy);
          this.ctx.lineTo(cx + arrowSize * 0.4, cy - arrowSize * 0.6);
          this.ctx.lineTo(cx + arrowSize * 0.4, cy - arrowSize * 0.2);
          this.ctx.lineTo(cx + arrowSize, cy - arrowSize * 0.2);
          this.ctx.lineTo(cx + arrowSize, cy + arrowSize * 0.2);
          this.ctx.lineTo(cx + arrowSize * 0.4, cy + arrowSize * 0.2);
          this.ctx.lineTo(cx + arrowSize * 0.4, cy + arrowSize * 0.6);
        }
        this.ctx.closePath();
        this.ctx.globalAlpha = 0.55;
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
        this.ctx.stroke();
        this.ctx.restore();
      }

      // Fine static-dissipative micro-veins / conductive tech veins on full standard tiles
      if (!isPartial && tile.type === 'standard' && tilePx >= 24) {
        this.ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
        // 2 subtle conductive micro-veins across tile surface
        this.ctx.fillRect(sx + tw * 0.22, sy + th * 0.18, Math.max(1, tw * 0.35), 1);
        this.ctx.fillRect(sx + tw * 0.48, sy + th * 0.65, Math.max(1, tw * 0.28), 1);
      }

      // Realistic 3D tile panel chamfer / bevel highlight (top and left edge)
      if (!isPartial && tilePx > 16) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.ctx.fillRect(sx + 1, sy + 1, tw - 2, 1.2);
        this.ctx.fillRect(sx + 1, sy + 1, 1.2, th - 2);

        // Tile bevel inner shadow (bottom and right edge)
        this.ctx.fillStyle = 'rgba(100, 116, 139, 0.25)';
        this.ctx.fillRect(sx + 1, sy + th - 2, tw - 2, 1.2);
        this.ctx.fillRect(sx + tw - 2, sy + 1, 1.2, th - 2);
      }

      // High-contrast conductive vinyl ESD tile perimeter seam (Grid lines on every tile)
      if (s.gridVisible !== false) {
        this.ctx.strokeStyle = '#334155'; // Dark industrial slate conductive gasket
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(sx, sy, tw, th);
      }

      // Highlight selected tile boundary
      if (isSelected) {
        this.ctx.strokeStyle = '#0284c7';
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeRect(sx, sy, tw, th);
      }

      // High-contrast Tile Coordinate ID Label (e.g. A1, A2 or A-01)
      if (s.labelsVisible && tilePx >= 20) {
        this.ctx.fillStyle = isSelected
          ? '#0369a1'
          : (tile.type === 'ventilated' ? '#94a3b8' : tile.type === 'air-channel' ? '#0369a1' : '#1e293b');
        const fontSize = Math.max(9, Math.min(13, Math.round(tilePx * 0.22)));
        this.ctx.font = `bold ${fontSize}px "SF Mono", Monaco, Menlo, Consolas, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(tile.id, sx + tw / 2, sy + th / 2);
      }
    }

    // 2. Under-Floor Infrastructure Paths in 2D (Cable Trays, Ducts, Power/Data Bundles, Risers)
    if (floor.infrastructure && floor.infrastructure.length > 0) {
      for (const item of floor.infrastructure) {
        const p1 = this.worldToScreen(item.start.x, item.start.y);
        const p2 = this.worldToScreen(item.end.x, item.end.y);
        const isSelected = item.id === s.selectedInfraId;

        this.ctx.save();
        if (item.category === 'cable-tray') {
          this.ctx.strokeStyle = '#f59e0b'; // Industrial amber tray
          this.ctx.lineWidth = Math.max(3, (item.widthMm / 1000) * this.ppm);
          this.ctx.setLineDash([8, 4]);
        } else if (item.category === 'cable-duct') {
          this.ctx.strokeStyle = '#94a3b8'; // Galvanized metal duct
          this.ctx.lineWidth = Math.max(3, (item.widthMm / 1000) * this.ppm);
          this.ctx.setLineDash([]);
        } else if (item.category === 'power-cable') {
          this.ctx.strokeStyle = '#ef4444'; // Power red
          this.ctx.lineWidth = 2.5;
          this.ctx.setLineDash([4, 2]);
        } else if (item.category === 'data-cable') {
          this.ctx.strokeStyle = '#3b82f6'; // Data blue
          this.ctx.lineWidth = 2.5;
          this.ctx.setLineDash([4, 2]);
        } else if (item.category === 'riser') {
          // Circle riser pillar
          this.ctx.fillStyle = '#10b981';
          this.ctx.strokeStyle = '#047857';
          this.ctx.lineWidth = 2;
          const rPx = Math.max(6, (item.widthMm / 2000) * this.ppm);
          this.ctx.beginPath();
          this.ctx.arc(p1.sx, p1.sy, rPx, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.restore();
          continue;
        }

        if (isSelected) {
          this.ctx.shadowColor = '#38bdf8';
          this.ctx.shadowBlur = 8;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        this.ctx.lineTo(p2.sx, p2.sy);
        this.ctx.stroke();

        // Infrastructure label badge
        const midX = (p1.sx + p2.sx) / 2;
        const midY = (p1.sy + p2.sy) / 2;
        this.ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
        this.ctx.font = 'bold 9px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(item.name, midX, midY - 3);
        this.ctx.restore();
      }
    }

    // NOTE: Per-tile ESD seam borders are drawn individually via strokeRect inside the tile loop above.

    // 2. Draw Main Outer Floor Architectural Border (Anodized Aluminum Perimeter Curb Trim)
    this.ctx.strokeStyle = '#0284c7';
    this.ctx.lineWidth = 3.5;
    this.ctx.strokeRect(fx, fy, fw, fh);

    // 3. Draw Racks strictly within floor area
    for (const rack of floor.racks) {
      const isDragging = rack.id === this.draggingRackId;
      const pos = isDragging && this.dragPos ? this.dragPos : rack.position;
      this.drawRack(rack, pos.x, pos.y, isDragging);
    }

    // 4. Draw Snap Gap Guidelines if dragging
    if (this.snapGapInfo) {
      const p1 = this.worldToScreen(this.snapGapInfo.x1, this.snapGapInfo.y1);
      const p2 = this.worldToScreen(this.snapGapInfo.x2, this.snapGapInfo.y2);

      this.ctx.save();
      this.ctx.strokeStyle = '#059669';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.sx, p1.sy);
      this.ctx.lineTo(p2.sx, p2.sy);
      this.ctx.stroke();

      // Label badge
      const midX = (p1.sx + p2.sx) / 2;
      const midY = (p1.sy + p2.sy) / 2;
      this.ctx.fillStyle = '#059669';
      this.ctx.font = 'bold 11px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`SNAP: ${this.snapGapInfo.label}`, midX, midY - 6);
      this.ctx.restore();
    }

    this.ctx.restore();

    this.ctx.restore();

    // 5. CAD Architectural Dimension Lines & Leader Arrows (Outside clipped floor boundary)
    const unit = floor.unit ?? 'm';
    const dimOffset = Math.max(22, Math.min(36, 18 * (this.ppm / 100)));
    const arrowSz = 6;
    const lenLabel = formatDimensionsMeters(floor.lengthM, 0, unit).split('×')[0].trim();
    const widLabel = formatDimensionsMeters(0, floor.widthM, unit).split('×')[1]?.trim() || formatSingleDistance(floor.widthM, unit);

    this.ctx.save();
    this.ctx.strokeStyle = '#64748b';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.lineWidth = 1.2;
    this.ctx.font = '600 11px system-ui, -apple-system, sans-serif';

    // Top Width Dimension Line (Length along X)
    const topY = fy - dimOffset;
    // Extension witness lines
    this.ctx.beginPath();
    this.ctx.moveTo(fx, fy - 4);
    this.ctx.lineTo(fx, topY - 5);
    this.ctx.moveTo(fx + fw, fy - 4);
    this.ctx.lineTo(fx + fw, topY - 5);
    // Dimension line
    this.ctx.moveTo(fx, topY);
    this.ctx.lineTo(fx + fw, topY);
    // Left arrow
    this.ctx.moveTo(fx, topY);
    this.ctx.lineTo(fx + arrowSz, topY - 3);
    this.ctx.moveTo(fx, topY);
    this.ctx.lineTo(fx + arrowSz, topY + 3);
    // Right arrow
    this.ctx.moveTo(fx + fw, topY);
    this.ctx.lineTo(fx + fw - arrowSz, topY - 3);
    this.ctx.moveTo(fx + fw, topY);
    this.ctx.lineTo(fx + fw - arrowSz, topY + 3);
    this.ctx.stroke();

    // Top Dimension Text
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(`◄── ${lenLabel} ──►`, fx + fw / 2, topY - 3);

    // Left Height Dimension Line (Width along Y)
    const leftX = fx - dimOffset;
    // Extension witness lines
    this.ctx.beginPath();
    this.ctx.moveTo(fx - 4, fy);
    this.ctx.lineTo(leftX - 5, fy);
    this.ctx.moveTo(fx - 4, fy + fh);
    this.ctx.lineTo(leftX - 5, fy + fh);
    // Dimension line
    this.ctx.moveTo(leftX, fy);
    this.ctx.lineTo(leftX, fy + fh);
    // Top arrow
    this.ctx.moveTo(leftX, fy);
    this.ctx.lineTo(leftX - 3, fy + arrowSz);
    this.ctx.moveTo(leftX, fy);
    this.ctx.lineTo(leftX + 3, fy + arrowSz);
    // Bottom arrow
    this.ctx.moveTo(leftX, fy + fh);
    this.ctx.lineTo(leftX - 3, fy + fh - arrowSz);
    this.ctx.moveTo(leftX, fy + fh);
    this.ctx.lineTo(leftX + 3, fy + fh - arrowSz);
    this.ctx.stroke();

    // Left Dimension Text (Rotated along Y dimension line)
    this.ctx.save();
    this.ctx.translate(leftX - 6, fy + fh / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(`◄── ${widLabel} ──►`, 0, 0);
    this.ctx.restore();

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

    // Outer Stroke with Rack Type distinction
    this.ctx.strokeStyle = invalid ? '#ef4444' : isSelected ? '#38bdf8' : rack.type === 'network' ? '#10b981' : rack.type === 'open-frame' ? '#f59e0b' : rack.type === 'wall-mount' ? '#a855f7' : '#4a9eff';
    this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
    this.ctx.strokeRect(sx, sy, pw, ph);

    // Draw rack doors or open frame indicators
    if (rack.doorStyle === 'perforated' && pw >= 20) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.setLineDash([2, 2]);
      this.ctx.strokeRect(sx + 3, sy + 3, pw - 6, ph - 6);
      this.ctx.setLineDash([]);
    }

    if (s.labelsVisible && pw >= 20) {
      // Query devices mounted in this rack from stateManager
      const devices = stateManager.getState().devices?.filter(d => d.rackId === rack.id) || [];
      const usedU = devices.reduce((sum, d) => {
        const tmpl = getTemplate(d.templateId);
        return sum + (tmpl?.heightUnits || 1);
      }, 0);

      this.ctx.fillStyle = '#f0f6fc';
      this.ctx.font = `bold ${Math.max(9, Math.min(13, pw * 0.15))}px system-ui`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(rack.name, sx + pw / 2, sy + ph / 2 - 8);
      if (ph >= 24) {
        this.ctx.font = `${Math.max(8, Math.min(10, pw * 0.12))}px system-ui`;
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.fillText(`${rack.heightU}U ${rack.type.toUpperCase()}`, sx + pw / 2, sy + ph / 2 + 5);
      }
      if (devices.length > 0 && ph >= 38) {
        this.ctx.font = `600 ${Math.max(7.5, Math.min(9.5, pw * 0.10))}px system-ui`;
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText(`● ${devices.length} dev • ${usedU}/${rack.heightU}U`, sx + pw / 2, sy + ph / 2 + 18);
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
    this.camX = floor.lengthM / 2;
    this.camY = floor.widthM / 2;
    this.draw();
  }

  private updateInfoPanel(floor: DcFloor) {
    const el = this.container.querySelector('#dc-info-content');
    if (!el) return;
    const unit = floor.unit ?? 'm';
    const colCount = Math.ceil(floor.lengthM / (floor.tileSizeMm / 1000));
    const rowCount = Math.ceil(floor.widthM / (floor.tileSizeMm / 1000));
    el.innerHTML = `
      <div class="dc-info-row"><span class="dc-info-label">Floor</span><span class="dc-info-val">${floor.name}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Unit System</span><span class="dc-info-val"><b>${getUnitName(unit)}</b></span></div>
      <div class="dc-info-row"><span class="dc-info-label">Dimensions</span><span class="dc-info-val">${formatDimensionsMeters(floor.lengthM, floor.widthM, unit)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Floor Area</span><span class="dc-info-val">${formatArea(floor.lengthM, floor.widthM)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">ESD Tile</span><span class="dc-info-val">${formatDimensionsMm(floor.tileSizeMm, floor.tileSizeMm, unit === 'm' ? 'mm' : unit)}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Grid</span><span class="dc-info-val">${colCount} × ${rowCount}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Tiles</span><span class="dc-info-val">${floor.tiles.length.toLocaleString()}</span></div>
      <div class="dc-info-row"><span class="dc-info-label">Total Racks</span><span class="dc-info-val">${floor.racks.length}</span></div>
      <div class="dc-divider-h"></div>
      <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-btn-addrack">＋ Add Single Rack</button>
      <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-btn-addrow-info">▤ Add Row (Standards)</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-secondary" id="dc-btn-editfloor">✎ Edit Floor</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-secondary" id="dc-btn-clearfloor">↺ Reset to Empty Floor</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-danger" id="dc-btn-deletefloor">🗑 Delete Floor</button>
    `;
    el.querySelector('#dc-btn-addrack')?.addEventListener('click', () => this.showAddRackDialog());
    el.querySelector('#dc-btn-addrow-info')?.addEventListener('click', () => this.showAddRowDialog());
    el.querySelector('#dc-btn-editfloor')?.addEventListener('click', () => this.showEditFloorDialog(floor));
    el.querySelector('#dc-btn-clearfloor')?.addEventListener('click', () => this.promptResetFloor());
    el.querySelector('#dc-btn-deletefloor')?.addEventListener('click', () => {
      if (confirm(`Delete floor "${floor.name}"? This cannot be undone.`)) {
        dcState.deleteFloor(floor.id);
      }
    });
  }

  private updateButtonStates() {
    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    const setActive = (id: string, active: boolean) => {
      const el = this.container.querySelector(`#${id}`) as HTMLElement;
      if (el) el.classList.toggle('active', active);
    };
    setActive('dc-btn-2d', s.viewMode === '2d');
    setActive('dc-btn-3d', s.viewMode === '3d');
    setActive('dc-btn-grid', s.gridVisible);
    setActive('dc-btn-snap', s.snapEnabled && !this.strictGridOnly);
    setActive('dc-btn-grid-lock', this.strictGridOnly);
    const gridLockBtn = this.container.querySelector('#dc-btn-grid-lock');
    if (gridLockBtn) {
      gridLockBtn.textContent = this.strictGridOnly ? '▦ Grid-Only (ON)' : '▦ Grid-Only (Off)';
    }
    setActive('dc-btn-labels', s.labelsVisible);
    setActive('dc-btn-xray', s.xrayMode);
    setActive('dc3d-btn-xray', s.xrayMode);

    const opacityVal = Math.round((s.floorOpacity ?? 1) * 100);
    const topbarSlider = this.container.querySelector('#dc-floor-opacity') as HTMLInputElement | null;
    if (topbarSlider && parseInt(topbarSlider.value, 10) !== opacityVal) {
      topbarSlider.value = String(opacityVal);
    }
    const threeSlider = this.container.querySelector('#dc3d-floor-opacity') as HTMLInputElement | null;
    if (threeSlider && parseInt(threeSlider.value, 10) !== opacityVal) {
      threeSlider.value = String(opacityVal);
    }

    if (floor) {
      const topbarUnitSel = this.container.querySelector('#dc-topbar-unit') as HTMLSelectElement;
      if (topbarUnitSel && topbarUnitSel.value !== (floor.unit ?? 'm')) {
        topbarUnitSel.value = floor.unit ?? 'm';
      }
    }
  }

  private refresh() {
    this.updateButtonStates();
    const floor = dcState.getActiveFloor();
    if (!floor) {
      const el = this.container.querySelector('#dc-info-content');
      if (el) el.innerHTML = '<div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div>';
    } else if (dcState.getState().viewMode === '3d') {
      if (this.threeGridGroup) {
        this.threeGridGroup.visible = dcState.getState().gridVisible !== false;
      }
      if (!this.threeRenderer || this.lastRenderedFloorId !== floor.id) {
        this.render3D();
      } else {
        this.rebuildThreeScene(floor);
        this.update3DSelectionHighlight();
      }
    } else {
      this.draw();
    }
    this.renderPropsPanel();
  }

  private renderPropsPanel() {
    const s = dcState.getState();
    const internalEl = this.container.querySelector('#dc-props-content') as HTMLElement | null;
    const globalEl = document.getElementById('properties-content');
    const floor = dcState.getActiveFloor();
    const unit = floor?.unit ?? 'm';

    const renderTo = (el: HTMLElement, isGlobal: boolean) => {
      if (s.selectedRackId && floor) {
        const rack = floor.racks.find(r => r.id === s.selectedRackId);
        if (rack) {
          const posX = formatSingleDistance(rack.position.x, unit);
          const posY = formatSingleDistance(rack.position.y, unit);
          const typeBadge = `<span class="dc-type-badge ${rack.type}">${rack.type}</span>`;
          const devices = stateManager.getState().devices?.filter(d => d.rackId === rack.id) || [];
          const usedU = devices.reduce((sum, d) => sum + (getTemplate(d.templateId)?.heightUnits || 1), 0);

          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">Rack Properties ${typeBadge}</div>
              <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${rack.id}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val">${rack.name}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val"><b>${rack.type.toUpperCase()}</b></span></div>
              <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${formatDimensionsMm(rack.widthMm, rack.depthMm, unit === 'm' ? 'mm' : unit)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Height</span><span class="dc-info-val">${formatRackHeight(rack.heightU)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Capacity</span><span class="dc-info-val" style="color:#38bdf8;font-weight:600;">${devices.length} dev • ${usedU}/${rack.heightU}U</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Max Power</span><span class="dc-info-val" style="color:#ffd21a;font-weight:600;">${rack.maxPowerKw ?? 20} kW</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Pos X</span><span class="dc-info-val">${posX}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Pos Y</span><span class="dc-info-val">${posY}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Rotation</span><span class="dc-info-val">${rack.rotation}°</span></div>
              ${rack.doorStyle ? `<div class="dc-info-row"><span class="dc-info-label">Door</span><span class="dc-info-val">${rack.doorStyle}</span></div>` : ''}
              ${rack.manufacturer ? `<div class="dc-info-row"><span class="dc-info-label">Mfr</span><span class="dc-info-val">${rack.manufacturer} ${rack.model || ''}</span></div>` : ''}
            </div>
            <div class="dc-nudge-section">
              <div class="dc-nudge-title">
                <span>Nudge Position</span>
                <span class="dc-nudge-hint">Arrows (Shift=0.1m)</span>
              </div>
              <div class="dc-nudge-grid">
                <div></div>
                <button class="dc-nudge-btn" id="${isGlobal ? 'g-dc-nudge-up' : 'dc-nudge-up'}" title="Nudge Up (↑ / W)">↑</button>
                <div></div>
                <button class="dc-nudge-btn" id="${isGlobal ? 'g-dc-nudge-left' : 'dc-nudge-left'}" title="Nudge Left (← / A)">←</button>
                <button class="dc-nudge-btn" id="${isGlobal ? 'g-dc-nudge-down' : 'dc-nudge-down'}" title="Nudge Down (↓ / S)">↓</button>
                <button class="dc-nudge-btn" id="${isGlobal ? 'g-dc-nudge-right' : 'dc-nudge-right'}" title="Nudge Right (→ / D)">→</button>
              </div>
            </div>
            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="${isGlobal ? 'g-dc-rack-work' : 'dc-rack-work'}" title="Mount devices, servers & switches in this rack">⚙ Work on this Rack (Mount Devices)</button>
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="${isGlobal ? 'g-dc-rack-import-json' : 'dc-rack-import-json'}" title="Import servers & equipment from a previously saved Rack JSON file into this rack">📥 Import Rack JSON</button>
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="${isGlobal ? 'g-dc-rack-export-json' : 'dc-rack-export-json'}" title="Export this rack's equipment configuration to a reusable JSON file">📤 Export Rack JSON</button>
              <button class="dc-btn dc-btn-sm" id="${isGlobal ? 'g-dc-rack-zoom' : 'dc-rack-zoom'}" title="Zoom and center view directly onto this rack (Hotkey: Z)">🔍 Zoom to Rack (Hotkey: Z)</button>
              <button class="dc-btn dc-btn-sm" id="${isGlobal ? 'g-dc-rack-move' : 'dc-rack-move'}" title="Move and reposition rack on floor grid (Hotkey: M)">✋ Move Rack</button>
              <button class="dc-btn dc-btn-sm" id="${isGlobal ? 'g-dc-rack-rotate' : 'dc-rack-rotate'}" title="Rotate 90° (Hotkey: R)">↻ Rotate 90° (R)</button>
              <button class="dc-btn dc-btn-sm" id="${isGlobal ? 'g-dc-rack-edit' : 'dc-rack-edit'}" title="Edit Properties">✎ Edit Rack</button>
              <button class="dc-btn dc-btn-sm" id="${isGlobal ? 'g-dc-rack-duplicate' : 'dc-rack-duplicate'}" title="Duplicate">⊕ Duplicate</button>
              <button class="dc-btn dc-btn-sm dc-btn-danger" id="${isGlobal ? 'g-dc-rack-delete' : 'dc-rack-delete'}" title="Delete">🗑 Delete</button>
            </div>
          `;

          const prefix = isGlobal ? '#g-' : '#';
          const stepM = floor.tileSizeMm / 1000;
          el.querySelector(`${prefix}dc-nudge-up`)?.addEventListener('click', () => this.nudgeRack(rack.id, 0, -stepM));
          el.querySelector(`${prefix}dc-nudge-down`)?.addEventListener('click', () => this.nudgeRack(rack.id, 0, stepM));
          el.querySelector(`${prefix}dc-nudge-left`)?.addEventListener('click', () => this.nudgeRack(rack.id, -stepM, 0));
          el.querySelector(`${prefix}dc-nudge-right`)?.addEventListener('click', () => this.nudgeRack(rack.id, stepM, 0));

          el.querySelector(`${prefix}dc-rack-work`)?.addEventListener('click', () => this.workOnRack(rack));
          el.querySelector(`${prefix}dc-rack-import-json`)?.addEventListener('click', () => this.importRackJSON(rack.id));
          el.querySelector(`${prefix}dc-rack-export-json`)?.addEventListener('click', () => this.exportRackJSON(rack.id));
          el.querySelector(`${prefix}dc-rack-zoom`)?.addEventListener('click', () => this.zoomToSelectedRack());
          el.querySelector(`${prefix}dc-rack-move`)?.addEventListener('click', () => this.startMovingRack(rack.id));
          el.querySelector(`${prefix}dc-rack-rotate`)?.addEventListener('click', () => {
            const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
            dcState.updateRack(rack.id, { rotation: rot });
            this.renderPropsPanel();
            if (dcState.getState().viewMode === '3d') this.render3D(); else this.draw();
          });
          el.querySelector(`${prefix}dc-rack-edit`)?.addEventListener('click', () => this.showEditRackDialog(rack));
          el.querySelector(`${prefix}dc-rack-duplicate`)?.addEventListener('click', () => {
            const dup = dcState.duplicateRack(rack.id);
            if (dup) dcState.setState({ selectedRackId: dup.id });
          });
          el.querySelector(`${prefix}dc-rack-delete`)?.addEventListener('click', () => {
            if (confirm(`Delete rack "${rack.name}"?`)) dcState.deleteRack(rack.id);
          });
          return;
        }
      }

      const selectedTileIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
      if (selectedTileIds.length > 1 && floor) {
        const selectedTiles = floor.tiles.filter(t => selectedTileIds.includes(t.id));
        const addressSummary = selectedTiles.map(t => t.id).slice(0, 10).join(', ') + (selectedTiles.length > 10 ? ` +${selectedTiles.length - 10} more` : '');
        el.innerHTML = `
          <div class="dc-props-section">
            <div class="dc-props-title">Multi-Tile Selection</div>
            <div class="dc-info-row"><span class="dc-info-label">Selected</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${selectedTiles.length} Tiles</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Tiles</span><span class="dc-info-val" style="font-size:11px;">${addressSummary}</span></div>
            <div class="dc-info-row"><span class="dc-info-label">Plenum</span><span class="dc-info-val">${floor.raisedFloorHeightMm || 450} mm</span></div>
          </div>
          <div class="dc-props-actions">
            <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tiles-btn-vent">🔲 Convert to Ventilated Grille</button>
            <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tiles-btn-perf">▦ Convert to Perforated / Vented</button>
            <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tiles-btn-ac">💨 Convert to Air Channel</button>
            <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-tiles-btn-std">↺ Convert to Standard Floor</button>
          </div>
        `;
        el.querySelector('#dc-tiles-btn-vent')?.addEventListener('click', () => {
          dcState.setFloorTilesType(selectedTileIds, 'ventilated');
          this.refresh();
          eventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tiles to Ventilated ESD Grille (Steel Bar Grate).`, type: 'info' });
        });
        el.querySelector('#dc-tiles-btn-perf')?.addEventListener('click', () => {
          dcState.setFloorTilesType(selectedTileIds, 'perforated');
          this.refresh();
          eventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tiles to Perforated / Vented Panel.`, type: 'info' });
        });
        el.querySelector('#dc-tiles-btn-ac')?.addEventListener('click', () => {
          dcState.setFloorTilesType(selectedTileIds, 'air-channel', 'north');
          this.refresh();
          eventBus.emit('notification', { message: `Converted ${selectedTileIds.length} tiles to Under-Floor Air Channel (Airflow North).`, type: 'info' });
        });
        el.querySelector('#dc-tiles-btn-std')?.addEventListener('click', () => {
          dcState.setFloorTilesType(selectedTileIds, 'standard');
          this.refresh();
          eventBus.emit('notification', { message: `Reset ${selectedTileIds.length} tiles to Standard Floor.`, type: 'info' });
        });
        return;
      }

      if (s.selectedTileId && floor) {
        const tile = floor.tiles.find(t => t.id === s.selectedTileId);
        if (tile) {
          const typeDesc = tile.type === 'ventilated'
            ? 'Ventilated ESD Grille (Steel Bar Grate)'
            : tile.type === 'air-channel'
            ? `Air Channel (${tile.airflowDir?.toUpperCase() || 'NORTH'})`
            : tile.type === 'perforated'
            ? 'Perforated / Vented Panel'
            : tile.type === 'partial'
            ? 'Partial Perimeter Cut'
            : 'Standard Raised Floor';

          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">Floor Tile Properties</div>
              <div class="dc-info-row"><span class="dc-info-label">Address</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${tile.id}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Grid</span><span class="dc-info-val">Row ${tile.row}, Col ${tile.col}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">X Pos</span><span class="dc-info-val">${formatSingleDistance(tile.x, unit)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Y Pos</span><span class="dc-info-val">${formatSingleDistance(tile.y, unit)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${formatDimensionsMm(tile.widthMm, tile.depthMm, unit === 'm' ? 'mm' : unit)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val"><b>${typeDesc}</b></span></div>
              ${tile.airflowDir ? `<div class="dc-info-row"><span class="dc-info-label">Airflow</span><span class="dc-info-val" style="color:#0284c7;font-weight:600;">${tile.airflowDir.toUpperCase()}</span></div>` : ''}
              <div class="dc-info-row"><span class="dc-info-label">Plenum</span><span class="dc-info-val">${floor.raisedFloorHeightMm || 450} mm</span></div>
            </div>
            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-vent">🔲 Set to Ventilated Grille</button>
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-perf">▦ Set to Perforated / Vented</button>
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-ac">💨 Under-Floor Air Channel</button>
              <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-tile-btn-addinfra">⚡ Add Cable Tray / Duct</button>
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-tile-btn-std">↺ Convert to Standard</button>
            </div>
          `;

          el.querySelector('#dc-tile-btn-vent')?.addEventListener('click', () => {
            dcState.setFloorTileType(tile.id, 'ventilated');
            this.refresh();
            eventBus.emit('notification', { message: `Tile ${tile.id} converted to Ventilated ESD Grille (Steel Bar Grate).`, type: 'info' });
          });
          el.querySelector('#dc-tile-btn-perf')?.addEventListener('click', () => {
            dcState.setFloorTileType(tile.id, 'perforated');
            this.refresh();
          });
          el.querySelector('#dc-tile-btn-ac')?.addEventListener('click', () => {
            const dirs: DcAirflowDirection[] = ['north', 'south', 'east', 'west'];
            const curIdx = dirs.indexOf(tile.airflowDir || 'north');
            const nextDir = dirs[(curIdx + 1) % dirs.length];
            dcState.setFloorTileType(tile.id, 'air-channel', nextDir);
            this.refresh();
          });
          el.querySelector('#dc-tile-btn-addinfra')?.addEventListener('click', () => {
            this.showAddInfraDialog(tile);
          });
          el.querySelector('#dc-tile-btn-std')?.addEventListener('click', () => {
            dcState.setFloorTileType(tile.id, 'standard');
            this.refresh();
          });
          return;
        }
      }

      if (s.selectedInfraId && floor && floor.infrastructure) {
        const item = floor.infrastructure.find(i => i.id === s.selectedInfraId);
        if (item) {
          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">Under-Floor Infrastructure</div>
              <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${item.id}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val">${item.name}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Category</span><span class="dc-info-val"><b>${item.category.toUpperCase()}</b></span></div>
              <div class="dc-info-row"><span class="dc-info-label">Layer</span><span class="dc-info-val">${item.layer}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${item.widthMm}W × ${item.heightMm}H mm</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Elevation</span><span class="dc-info-val">${item.elevationMm} mm</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Start</span><span class="dc-info-val">(${item.start.x.toFixed(2)}m, ${item.start.y.toFixed(2)}m)</span></div>
              <div class="dc-info-row"><span class="dc-info-label">End</span><span class="dc-info-val">(${item.end.x.toFixed(2)}m, ${item.end.y.toFixed(2)}m)</span></div>
            </div>
            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-danger dc-btn-full" id="dc-infra-delete">🗑 Delete Infrastructure</button>
            </div>
          `;
          el.querySelector('#dc-infra-delete')?.addEventListener('click', () => {
            if (confirm(`Delete infrastructure "${item.name}"?`)) {
              dcState.deleteInfrastructureItem(item.id);
              this.refresh();
            }
          });
          return;
        }
      }

      el.innerHTML = '<div class="properties-empty">Select a rack, ESD tile, or under-floor pathway to view details.</div>';
    };

    if (internalEl) renderTo(internalEl, false);
    // NOTE: We intentionally do NOT render to the global #properties-panel or toggle its collapsed
    // state here. Manipulating that panel triggers a CSS width transition on #dc-canvas-wrap
    // (via ResizeObserver), causing 50+ rapid canvas resize/redraw cycles that make the viewport jump.
    // The datacenter view uses its own internal #dc-props-content panel exclusively.
  }

  private workOnRack(rack: DcRack) {
    const s = stateManager.getState();
    const racks = s.racks;
    let existing = racks.find(r => r.id === rack.id);

    // Filter out any empty default-rack with 0 devices to prevent clutter and collision
    const cleanRacks = racks.filter(r => {
      if (r.id === 'default-rack' && r.id !== rack.id) {
        const hasDevices = s.devices.some(d => d.rackId === r.id);
        return hasDevices;
      }
      return true;
    });

    const otherRacks = cleanRacks.filter(r => r.id !== rack.id);
    const posX = existing ? existing.x : 200;
    const posY = existing ? existing.y : 40;

    const targetRack: RackData = {
      id: rack.id,
      name: rack.name,
      units: rack.heightU,
      depthMm: rack.depthMm,
      rackType: (rack.type === 'open-frame' ? 'open-frame' : rack.type === 'network' ? 'network' : rack.type === 'wall-mount' ? 'wall-mount' : 'server') as any,
      mounting: rack.mounting ?? 'floor',
      rackColor: rack.color ?? '#1e3a5f',
      x: posX,
      y: posY,
      leftCableManagerWidth: existing?.leftCableManagerWidth,
      rightCableManagerWidth: existing?.rightCableManagerWidth,
      leftPduId: existing?.leftPduId,
      rightPduId: existing?.rightPduId,
    };

    const finalRacks = [...otherRacks, targetRack];

    stateManager.setState({
      racks: finalRacks,
      selection: [{ type: 'rack', id: rack.id }],
      activeElevationRackId: rack.id,
    });

    eventBus.emit('view:switch' as any, 'rack');
    setTimeout(() => {
      eventBus.emit('view:focus-rack' as any, rack.id);
    }, 60);

    eventBus.emit('notification', {
      message: `Opened ${rack.name} in Rack Elevation Editor. Place your servers & active devices!`,
      type: 'info',
    });

    this.showWorkingBannerInElevation(rack);
  }

  private showWorkingBannerInElevation(rack: DcRack) {
    let banner = document.getElementById('dc-working-banner');
    if (banner) banner.remove();

    const parent = document.getElementById('canvas-viewport') || document.body;
    if (!parent) return;

    banner = document.createElement('div');
    banner.id = 'dc-working-banner';
    banner.className = 'dc-floating-return-badge';
    banner.innerHTML = `
      <div class="dc-floating-badge-info">
        <span class="dc-floating-badge-icon">⚡</span>
        <span class="dc-floating-badge-text">Rack Elevation: <b>${rack.name}</b> <span class="dc-floating-badge-meta">(${rack.heightU}U ${rack.type.toUpperCase()})</span></span>
      </div>
      <div class="dc-floating-badge-actions">
        <button class="dc-btn-floating-action" id="dc-btn-elevation-import" title="Import servers & equipment from a previously saved Rack JSON file into this rack">📥 Import JSON</button>
        <button class="dc-btn-floating-action" id="dc-btn-elevation-export" title="Export this rack configuration to a reusable JSON file">📤 Export JSON</button>
        <button class="dc-btn-floating-return" id="dc-btn-return-dc" title="Return to Datacenter 2D/3D Floor Plan">
          <span>← Return to Datacenter</span>
        </button>
      </div>
    `;

    parent.appendChild(banner);

    banner.querySelector('#dc-btn-elevation-import')?.addEventListener('click', () => {
      this.importRackJSON(rack.id);
    });

    banner.querySelector('#dc-btn-elevation-export')?.addEventListener('click', () => {
      this.exportRackJSON(rack.id);
    });

    banner.querySelector('#dc-btn-return-dc')?.addEventListener('click', () => {
      stateManager.setState({ activeElevationRackId: null });
      eventBus.emit('view:switch' as any, 'datacenter');
      banner?.remove();
    });
  }

  public importRackJSON(targetRackId: string) {
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const targetDcRack = floor.racks.find(r => r.id === targetRackId);
    if (!targetDcRack) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rawText = reader.result as string;
          const data = JSON.parse(rawText);

          let sourceRack: any = null;
          let sourceDevices: DeviceData[] = [];
          let sourceTemplates: DeviceTemplate[] = [];
          const sourceCables: CableData[] = Array.isArray(data.cables) ? data.cables : [];

          if (data.type === 'rack-config' && data.rack) {
            sourceRack = data.rack;
            sourceDevices = data.devices || [];
            sourceTemplates = data.customTemplates || [];
            this.applyImportedRackConfig(targetDcRack, sourceRack, sourceDevices, sourceTemplates, sourceCables);
          } else if (data.racks && Array.isArray(data.racks)) {
            sourceTemplates = data.customTemplates || [];
            if (data.racks.length === 0) {
              eventBus.emit('notification', { message: 'No racks found in this JSON file.', type: 'warning' });
              return;
            } else if (data.racks.length === 1) {
              sourceRack = data.racks[0];
              sourceDevices = (data.devices || []).filter((d: any) => d.rackId === sourceRack.id || !d.rackId);
              this.applyImportedRackConfig(targetDcRack, sourceRack, sourceDevices, sourceTemplates, sourceCables);
            } else {
              this.showRackPickerModal(targetDcRack, data.racks, data.devices || [], sourceTemplates, sourceCables);
            }
          } else if (Array.isArray(data.devices)) {
            sourceDevices = data.devices;
            sourceTemplates = data.customTemplates || [];
            this.applyImportedRackConfig(targetDcRack, null, sourceDevices, sourceTemplates, sourceCables);
          } else {
            throw new Error('Unrecognized rack JSON format.');
          }
        } catch (err: any) {
          eventBus.emit('notification', { message: `Import failed: ${err.message || err}`, type: 'error' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private showRackPickerModal(
    targetDcRack: DcRack,
    racks: any[],
    allDevices: DeviceData[],
    customTemplates: DeviceTemplate[],
    allCables: CableData[] = []
  ) {
    const listHtml = racks.map((r, idx) => {
      const devCount = allDevices.filter(d => d.rackId === r.id).length;
      return `
        <div class="dc-rack-picker-item" data-rack-idx="${idx}" style="padding:10px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:8px;cursor:pointer;background:rgba(255,255,255,0.02);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;color:#f0f6fc;font-size:13px;">${r.name || r.id}</div>
            <div style="font-size:11px;color:#94a3b8;">${r.units || r.heightU || 42}U • ${r.rackType || 'Server Rack'}</div>
          </div>
          <div style="text-align:right;">
            <span style="font-size:12px;color:#38bdf8;font-weight:600;background:rgba(56,189,248,0.12);padding:2px 8px;border-radius:12px;">${devCount} devices</span>
          </div>
        </div>
      `;
    }).join('');

    this.showModal(`Import Rack Configuration into ${targetDcRack.name}`, `
      <p style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Select which rack configuration to load into <b>${targetDcRack.name}</b>:</p>
      <div style="max-height:260px;overflow-y:auto;margin-bottom:10px;">${listHtml}</div>
    `, 'Cancel', () => true, false);

    const modalEl = document.getElementById('dc-modal-overlay');
    modalEl?.querySelectorAll('.dc-rack-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-rack-idx') || '0', 10);
        const selRack = racks[idx];
        const selDevices = allDevices.filter(d => d.rackId === selRack.id || !d.rackId);
        const selPortIds = new Set<string>();
        selDevices.forEach(d => (d.ports || []).forEach(p => selPortIds.add(p.id)));
        const selCables = allCables.filter(c => (c.sourcePortId && selPortIds.has(c.sourcePortId)) || (c.destPortId && selPortIds.has(c.destPortId)));
        modalEl.remove();
        this.applyImportedRackConfig(targetDcRack, selRack, selDevices, customTemplates, selCables.length > 0 ? selCables : allCables);
      });
    });
  }

  private applyImportedRackConfig(
    targetDcRack: DcRack,
    sourceRack: any,
    sourceDevices: DeviceData[],
    sourceTemplates: DeviceTemplate[],
    sourceCables: CableData[] = []
  ) {
    // Auto-repair missing switch ports and heal floating cable endpoints
    const repaired = sanitizeAndRepairDevicesAndCables(sourceDevices, sourceCables);
    sourceDevices = repaired.devices;
    sourceCables = repaired.cables;

    const s = stateManager.getState();


    // 1. Merge custom templates
    if (sourceTemplates && sourceTemplates.length > 0) {
      const existing = s.customTemplates || [];
      const existIds = new Set(existing.map(t => t.id));
      const merged = [...existing, ...sourceTemplates.filter(t => !existIds.has(t.id))];
      stateManager.setState({ customTemplates: merged });
    }

    // 2. Remove previous devices and cables in target rack
    const otherDevices = s.devices.filter(d => d.rackId !== targetDcRack.id);
    const oldTargetPortIds = new Set<string>();
    s.devices.forEach(d => {
      if (d.rackId === targetDcRack.id && d.ports) {
        d.ports.forEach(p => oldTargetPortIds.add(p.id));
      }
    });
    const otherCables = (s.cables || []).filter(c => (!c.sourcePortId || !oldTargetPortIds.has(c.sourcePortId)) && (!c.destPortId || !oldTargetPortIds.has(c.destPortId)));

    // 3. Remap devices & cables to target rack (preserving exact port IDs so connections stay intact)
    const existingOtherDevIds = new Set(otherDevices.map(d => d.id));
    const isCollision = sourceDevices.some(d => existingOtherDevIds.has(d.id));

    let newDevices: DeviceData[] = [];
    let newCables: CableData[] = [];

    if (!isCollision) {
      newDevices = sourceDevices.map(d => ({
        ...d,
        rackId: targetDcRack.id,
      }));
      newCables = sourceCables.map(c => ({
        ...c,
        id: c.id || `cable-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
      }));
    } else {
      const prefix = `${targetDcRack.id}-`;
      const portIdMap = new Map<string, string>();
      newDevices = sourceDevices.map(d => {
        const newDevId = `${prefix}${d.id}`;
        const newPorts = (d.ports || []).map((p: any) => {
          const newPortId = `${prefix}${p.id}`;
          portIdMap.set(p.id, newPortId);
          return {
            ...p,
            id: newPortId,
            deviceId: newDevId,
          };
        });
        return {
          ...d,
          id: newDevId,
          rackId: targetDcRack.id,
          ports: newPorts,
        };
      });

      newCables = sourceCables.map(c => {
        const newSrc = c.sourcePortId ? (portIdMap.get(c.sourcePortId) || `${prefix}${c.sourcePortId}`) : null;
        const newDest = c.destPortId ? (portIdMap.get(c.destPortId) || `${prefix}${c.destPortId}`) : null;
        return {
          ...c,
          id: `cable-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
          sourcePortId: newSrc,
          destPortId: newDest,
        };
      });
    }

    // 4. Update DC rack height if source rack defines a different height
    const sourceUnits = sourceRack?.units || sourceRack?.heightU;
    if (sourceUnits && typeof sourceUnits === 'number' && sourceUnits > 0 && sourceUnits !== targetDcRack.heightU) {
      targetDcRack.heightU = sourceUnits;
      dcState.updateRack(targetDcRack.id, { heightU: sourceUnits });
    }

    // 5. Clean / purge foreign ghost racks, keeping ONLY the target rack and existing valid DC racks
    const dcFloor = dcState.getActiveFloor();
    const validDcRackIds = new Set((dcFloor?.racks || []).map(r => r.id));
    const existingRackData = s.racks.find(r => r.id === targetDcRack.id);
    let mappedLeftPduId = sourceRack?.leftPduId || existingRackData?.leftPduId;
    let mappedRightPduId = sourceRack?.rightPduId || existingRackData?.rightPduId;

    if (isCollision) {
      if (mappedLeftPduId && sourceDevices.some(d => d.id === mappedLeftPduId)) {
        mappedLeftPduId = `${targetDcRack.id}-${mappedLeftPduId}`;
      }
      if (mappedRightPduId && sourceDevices.some(d => d.id === mappedRightPduId)) {
        mappedRightPduId = `${targetDcRack.id}-${mappedRightPduId}`;
      }
    }

    targetDcRack.leftCableManagerWidth = sourceRack?.leftCableManagerWidth || existingRackData?.leftCableManagerWidth || 'none';
    targetDcRack.rightCableManagerWidth = sourceRack?.rightCableManagerWidth || existingRackData?.rightCableManagerWidth || 'none';
    targetDcRack.leftPduId = mappedLeftPduId;
    targetDcRack.rightPduId = mappedRightPduId;
    dcState.updateRack(targetDcRack.id, {
      leftCableManagerWidth: targetDcRack.leftCableManagerWidth,
      rightCableManagerWidth: targetDcRack.rightCableManagerWidth,
      leftPduId: mappedLeftPduId,
      rightPduId: mappedRightPduId,
    });

    const updatedRackData: RackData = {
      id: targetDcRack.id,
      name: targetDcRack.name,
      units: targetDcRack.heightU,
      depthMm: targetDcRack.depthMm,
      rackType: (targetDcRack.type === 'open-frame' ? 'open-frame' : targetDcRack.type === 'network' ? 'network' : targetDcRack.type === 'wall-mount' ? 'wall-mount' : 'server') as any,
      mounting: targetDcRack.mounting ?? 'floor',
      rackColor: targetDcRack.color ?? '#1e3a5f',
      x: 200,
      y: 40,
      leftCableManagerWidth: targetDcRack.leftCableManagerWidth,
      rightCableManagerWidth: targetDcRack.rightCableManagerWidth,
      leftPduId: mappedLeftPduId,
      rightPduId: mappedRightPduId,
    };

    const cleanRacks = s.racks.filter(r => r.id !== targetDcRack.id && validDcRackIds.has(r.id));
    cleanRacks.push(updatedRackData);

    stateManager.setState({
      racks: cleanRacks,
      devices: [...otherDevices, ...newDevices],
      cables: [...otherCables, ...newCables],
      activeElevationRackId: targetDcRack.id,
    });

    eventBus.emit('device:added' as any, newDevices[0] || ({} as any));
    this.refresh();

    const activeFloor = dcState.getActiveFloor();
    if (activeFloor) {
      this.rebuildThreeScene(activeFloor);
    }
    this.renderPropsPanel();

    const cableMsg = newCables.length > 0 ? ` and ${newCables.length} cables` : '';
    eventBus.emit('notification', {
      message: `Successfully imported ${newDevices.length} devices${cableMsg} into ${targetDcRack.name}!`,
      type: 'success',
    });
  }

  public exportRackJSON(rackId: string) {
    const floor = dcState.getActiveFloor();
    const dcRack = floor?.racks.find(r => r.id === rackId);
    if (!dcRack) return;

    const s = stateManager.getState();
    const rackData = s.racks.find(r => r.id === rackId);
    const devices = s.devices.filter(d => d.rackId === rackId);

    // Get all port IDs in this rack
    const rackPortIds = new Set<string>();
    devices.forEach(d => {
      (d.ports || []).forEach(p => rackPortIds.add(p.id));
    });

    // Get cables connected to these ports
    const cables = (s.cables || []).filter(c => (c.sourcePortId && rackPortIds.has(c.sourcePortId)) || (c.destPortId && rackPortIds.has(c.destPortId)));

    const templateIds = new Set(devices.map(d => d.templateId));
    const usedCustomTemplates = (s.customTemplates || []).filter(t => templateIds.has(t.id));

    const exportPayload = {
      version: '1.0.0',
      type: 'rack-config',
      exportedAt: new Date().toISOString(),
      rack: {
        id: dcRack.id,
        name: dcRack.name,
        heightU: dcRack.heightU,
        widthMm: dcRack.widthMm,
        depthMm: dcRack.depthMm,
        type: dcRack.type,
        mounting: dcRack.mounting,
        color: dcRack.color,
        doorStyle: dcRack.doorStyle,
        leftCableManagerWidth: rackData?.leftCableManagerWidth || dcRack.leftCableManagerWidth,
        rightCableManagerWidth: rackData?.rightCableManagerWidth || dcRack.rightCableManagerWidth,
        leftPduId: rackData?.leftPduId || dcRack.leftPduId,
        rightPduId: rackData?.rightPduId || dcRack.rightPduId,
      },
      devices: devices,
      cables: cables,
      customTemplates: usedCustomTemplates,
    };


    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const safeName = dcRack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadFile(jsonStr, `rack-${safeName}-config.json`, 'application/json');
    const cableMsg = cables.length > 0 ? ` and ${cables.length} cables` : '';
    eventBus.emit('notification', {
      message: `Exported ${dcRack.name} config (${devices.length} devices${cableMsg}) to JSON.`,
      type: 'success',
    });
  }

  private showContextMenu(x: number, y: number, rack: DcRack) {
    let existing = document.getElementById('dc-context-menu');
    existing?.remove();

    const menu = document.createElement('div');
    menu.id = 'dc-context-menu';
    menu.className = 'dc-context-menu';
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;

    menu.innerHTML = `
      <div class="dc-menu-header">${rack.name} (${rack.heightU}U ${rack.type.toUpperCase()})</div>
      <div class="dc-menu-item primary" id="cm-work">⚙ Work on this Rack (Mount Devices)</div>
      <div class="dc-menu-item" id="cm-import-json">📥 Import Rack Config (.json)</div>
      <div class="dc-menu-item" id="cm-export-json">📤 Export Rack Config (.json)</div>
      <div class="dc-menu-item" id="cm-zoom">🔍 Zoom to Rack (Hotkey: Z)</div>
      <div class="dc-menu-item" id="cm-move">✋ Move Rack (Place on Floor)</div>
      <div class="dc-menu-item" id="cm-rotate">↻ Rotate 90° (R)</div>
      <div class="dc-menu-item" id="cm-duplicate">⊕ Duplicate Rack</div>
      <div class="dc-menu-item" id="cm-edit">✎ Edit Properties</div>
      <div class="dc-menu-item danger" id="cm-delete">🗑 Delete Rack</div>
    `;

    document.body.appendChild(menu);

    const close = () => menu.remove();

    menu.querySelector('#cm-work')?.addEventListener('click', () => { close(); this.workOnRack(rack); });
    menu.querySelector('#cm-import-json')?.addEventListener('click', () => { close(); this.importRackJSON(rack.id); });
    menu.querySelector('#cm-export-json')?.addEventListener('click', () => { close(); this.exportRackJSON(rack.id); });
    menu.querySelector('#cm-zoom')?.addEventListener('click', () => { close(); this.zoomToSelectedRack(); });
    menu.querySelector('#cm-move')?.addEventListener('click', () => { close(); this.startMovingRack(rack.id); });
    menu.querySelector('#cm-rotate')?.addEventListener('click', () => {
      close();
      const rot = ((rack.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      dcState.updateRack(rack.id, { rotation: rot });
      this.renderPropsPanel();
      if (dcState.getState().viewMode === '3d') this.render3D(); else this.draw();
    });
    menu.querySelector('#cm-duplicate')?.addEventListener('click', () => {
      close();
      const dup = dcState.duplicateRack(rack.id);
      if (dup) dcState.setState({ selectedRackId: dup.id });
    });
    menu.querySelector('#cm-edit')?.addEventListener('click', () => { close(); this.showEditRackDialog(rack); });
    menu.querySelector('#cm-delete')?.addEventListener('click', () => {
      close();
      if (confirm(`Delete rack "${rack.name}"?`)) dcState.deleteRack(rack.id);
    });

    setTimeout(() => {
      const dismiss = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          close();
          window.removeEventListener('click', dismiss);
        }
      };
      window.addEventListener('click', dismiss);
    }, 20);
  }

  private showTileContextMenu(clientX: number, clientY: number, tile: DcFloorTile, selectedTiles?: DcFloorTile[]) {
    let existing = document.getElementById('dc-context-menu');
    existing?.remove();

    const menu = document.createElement('div');
    menu.id = 'dc-context-menu';
    menu.className = 'dc-context-menu';
    menu.style.left = `${Math.min(clientX, window.innerWidth - 280)}px`;
    menu.style.top = `${Math.min(clientY, window.innerHeight - 340)}px`;

    const tilesToUpdate = selectedTiles && selectedTiles.length > 0 ? selectedTiles : [tile];
    const isMulti = tilesToUpdate.length > 1;
    const tileIds = tilesToUpdate.map(t => t.id);

    const typeDesc = tile.type === 'ventilated'
      ? 'Ventilated ESD Grille (Bar Grate)'
      : tile.type === 'air-channel'
      ? `Air Channel (${tile.airflowDir?.toUpperCase() || 'NORTH'})`
      : tile.type === 'perforated'
      ? 'Perforated / Vented'
      : tile.type === 'partial'
      ? 'Partial Tile'
      : 'Standard Tile';

    const headerText = isMulti
      ? `⚡ ${tilesToUpdate.length} Tiles Selected • Bulk Conversion`
      : `Tile ${tile.id} • ${typeDesc}`;

    menu.innerHTML = `
      <div class="dc-menu-header">${headerText}</div>
      <div class="dc-menu-item primary" id="cm-tile-vent">🔲 Convert to Ventilated ESD Grille</div>
      <div class="dc-menu-item" id="cm-tile-perf">▦ Convert to Perforated / Vented Panel</div>
      <div class="dc-menu-item" id="cm-tile-standard">⬛ Convert to Standard ESD Floor Panel</div>
      <div class="dc-menu-separator"></div>
      <div class="dc-menu-section-title">💨 Under-Floor Air Channel</div>
      <div class="dc-menu-item" id="cm-tile-ac-north">⬆ Airflow North</div>
      <div class="dc-menu-item" id="cm-tile-ac-south">⬇ Airflow South</div>
      <div class="dc-menu-item" id="cm-tile-ac-east">➡ Airflow East</div>
      <div class="dc-menu-item" id="cm-tile-ac-west">⬅ Airflow West</div>
      <div class="dc-menu-separator"></div>
      ${!isMulti ? `<div class="dc-menu-item" id="cm-tile-add-infra">⚡ Add Under-Floor Cable Tray / Duct</div>` : ''}
      <div class="dc-menu-item danger" id="cm-tile-reset">↺ Reset to Standard Floor</div>
    `;

    document.body.appendChild(menu);

    const close = () => menu.remove();

    menu.querySelector('#cm-tile-vent')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'ventilated');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Ventilated ESD Grille (Steel Bar Grate).`
          : `Tile ${tile.id} converted to Ventilated ESD Grille (Steel Bar Grate).`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-perf')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'perforated');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Perforated / Vented Floor Panel.`
          : `Tile ${tile.id} converted to Perforated / Vented Floor Panel.`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-standard')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'standard');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Standard Raised Floor Panel.`
          : `Tile ${tile.id} set to Standard Raised Floor Panel.`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-ac-north')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'air-channel', 'north');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Under-Floor Air Channel (Airflow North).`
          : `Tile ${tile.id} converted to Under-Floor Air Channel (Airflow North).`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-ac-south')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'air-channel', 'south');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Under-Floor Air Channel (Airflow South).`
          : `Tile ${tile.id} converted to Under-Floor Air Channel (Airflow South).`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-ac-east')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'air-channel', 'east');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Under-Floor Air Channel (Airflow East).`
          : `Tile ${tile.id} converted to Under-Floor Air Channel (Airflow East).`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-ac-west')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'air-channel', 'west');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Converted ${tilesToUpdate.length} tiles to Under-Floor Air Channel (Airflow West).`
          : `Tile ${tile.id} converted to Under-Floor Air Channel (Airflow West).`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-reset')?.addEventListener('click', () => {
      close();
      dcState.setFloorTilesType(tileIds, 'standard');
      this.refresh();
      eventBus.emit('notification', {
        message: isMulti
          ? `Reset ${tilesToUpdate.length} tiles to Standard Floor.`
          : `Tile ${tile.id} reset to Standard Floor.`,
        type: 'info'
      });
    });

    menu.querySelector('#cm-tile-add-infra')?.addEventListener('click', () => {
      close();
      this.showAddInfraDialog(tile);
    });

    setTimeout(() => {
      const dismiss = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          close();
          window.removeEventListener('click', dismiss);
        }
      };
      window.addEventListener('click', dismiss);
    }, 20);
  }

  public promptResetFloor() {
    const floor = dcState.getActiveFloor();
    const rackCount = floor?.racks.length ?? 0;
    const msg = rackCount > 0
      ? `Reset Datacenter Floor? This will clear all ${rackCount} racks and create a brand new clean empty floor layout.`
      : 'Create a brand new clean Datacenter Floor layout?';

    if (confirm(msg)) {
      this.showCreateFloorDialog();
    }
  }

  private showCreateFloorDialog(isMandatory: boolean = false) {
    this.showModal('Create Datacenter Floor Layout', `
      <div class="dc-form">
        <label>Floor Name<input id="df-name" type="text" value="Main Data Hall" class="dc-input"/></label>
        <label>Measurement Unit System
          <select id="df-unit" class="dc-input">
            <option value="m" selected>Meters (m)</option>
            <option value="ft">Feet (ft)</option>
            <option value="mm">Millimeters (mm)</option>
            <option value="in">Inches (in)</option>
          </select>
        </label>
        <label id="lbl-df-length">Length (meters)<input id="df-length" type="number" value="12" min="0.1" step="0.5" class="dc-input"/></label>
        <label id="lbl-df-width">Width (meters)<input id="df-width" type="number" value="8" min="0.1" step="0.5" class="dc-input"/></label>
        <label id="lbl-df-tile">ESD Tile Size (mm)<input id="df-tile" type="number" value="600" min="10" step="50" class="dc-input"/></label>
        
        <div style="display:flex; gap:10px;">
          <label style="flex:1;">Row Addressing
            <select id="df-rowscheme" class="dc-input">
              <option value="letters" selected>Letters (A, B, C...)</option>
              <option value="numbers">Numbers (01, 02, 03...)</option>
            </select>
          </label>
          <label style="flex:1;">Column Addressing
            <select id="df-colscheme" class="dc-input">
              <option value="numbers" selected>Numbers (1, 2, 3...)</option>
              <option value="letters">Letters (A, B, C...)</option>
            </select>
          </label>
        </div>

        <label>Coordinate Identifier Format
          <select id="df-addrformat" class="dc-input">
            <option value="compact" selected>Compact Coordinates: A1, A2, B1, B2...</option>
            <option value="hyphen">Standard Hyphenated: A-01, A-02, B-01, B-02...</option>
          </select>
        </label>

        <div class="dc-form-preview" id="df-preview"></div>
      </div>
    `, 'Create Floor', () => {
      const name = (document.getElementById('df-name') as HTMLInputElement).value.trim() || 'Main Data Hall';
      const unit = (document.getElementById('df-unit') as HTMLSelectElement).value as DcUnit;
      const rowScheme = ((document.getElementById('df-rowscheme') as HTMLSelectElement)?.value || 'letters') as 'letters' | 'numbers';
      const colScheme = ((document.getElementById('df-colscheme') as HTMLSelectElement)?.value || 'numbers') as 'letters' | 'numbers';
      const addrFormat = ((document.getElementById('df-addrformat') as HTMLSelectElement)?.value || 'compact') as DcAddressFormat;

      const rawLen = parseFloat((document.getElementById('df-length') as HTMLInputElement).value) || 12;
      const rawWid = parseFloat((document.getElementById('df-width') as HTMLInputElement).value) || 8;
      const rawTile = parseFloat((document.getElementById('df-tile') as HTMLInputElement).value) || 600;

      const lenM = unitToMeters(rawLen, unit);
      const widM = unitToMeters(rawWid, unit);
      const tileMm = rawTile; // Tile size input is always in mm (label: "ESD Tile Size (mm)")

      if (lenM <= 0 || widM <= 0 || tileMm <= 0) { alert('Invalid dimensions.'); return false; }
      dcState.createFloor(name, lenM, widM, tileMm, unit, rowScheme, colScheme, addrFormat);
      this.hasFittedInitialFloor = false;
      this.hasInitialized3DTarget = false;
      setTimeout(() => {
        const s = dcState.getState();
        if (s.viewMode === '3d') {
          this.set3DCameraPreset('iso');
        } else {
          this.fitToFloor();
        }
        eventBus.emit('notification', { message: `Datacenter floor "${name}" created.`, type: 'info' });
      }, 50);
      return true;
    }, isMandatory);

    let activeUnit: DcUnit = 'm';

    const updatePreview = () => {
      const unit = ((document.getElementById('df-unit') as HTMLSelectElement)?.value as DcUnit) || 'm';
      const rowScheme = ((document.getElementById('df-rowscheme') as HTMLSelectElement)?.value || 'letters') as 'letters' | 'numbers';
      const colScheme = ((document.getElementById('df-colscheme') as HTMLSelectElement)?.value || 'numbers') as 'letters' | 'numbers';
      const addrFormat = ((document.getElementById('df-addrformat') as HTMLSelectElement)?.value || 'compact') as DcAddressFormat;

      const rawLen = parseFloat((document.getElementById('df-length') as HTMLInputElement)?.value) || 12;
      const rawWid = parseFloat((document.getElementById('df-width') as HTMLInputElement)?.value) || 8;
      const rawTile = parseFloat((document.getElementById('df-tile') as HTMLInputElement)?.value) || 600;

      const lenM = unitToMeters(rawLen, unit);
      const widM = unitToMeters(rawWid, unit);
      const tileMm = rawTile; // Always mm — label reads "ESD Tile Size (mm)"

      const cols = Math.ceil(lenM / (tileMm / 1000));
      const rows = Math.ceil(widM / (tileMm / 1000));

      const sep = addrFormat === 'hyphen' ? '-' : '';
      const firstRow = rowScheme === 'numbers' ? '01' : 'A';
      const firstCol = colScheme === 'letters' ? 'A' : (addrFormat === 'hyphen' ? '01' : '1');
      const lastRow = rowScheme === 'numbers' ? String(rows).padStart(2, '0') : String.fromCharCode(65 + ((rows - 1) % 26));
      const lastCol = colScheme === 'letters' ? String.fromCharCode(65 + ((cols - 1) % 26)) : (addrFormat === 'hyphen' ? String(cols).padStart(2, '0') : String(cols));

      const prev = document.getElementById('df-preview');
      if (prev) {
        prev.innerHTML = `
          <div class="dc-preview-line"><b>Measurement Unit:</b> ${getUnitName(unit)}</div>
          <div class="dc-preview-line"><b>Dimensions:</b> ${formatDimensionsMeters(lenM, widM, unit)} (${formatArea(lenM, widM)})</div>
          <div class="dc-preview-line"><b>Grid Layout:</b> ${cols} cols × ${rows} rows (${(cols * rows).toLocaleString()} ESD tiles)</div>
          <div class="dc-preview-line"><b>Addressing Scheme:</b> ${firstRow}${sep}${firstCol} ... ${lastRow}${sep}${lastCol}</div>
        `;
      }
    };

    setTimeout(() => {
      const unitSel = document.getElementById('df-unit') as HTMLSelectElement;
      unitSel?.addEventListener('change', () => {
        const newUnit = unitSel.value as DcUnit;
        const oldUnit = activeUnit;
        if (oldUnit === newUnit) return;

        const lenEl = document.getElementById('df-length') as HTMLInputElement;
        const widEl = document.getElementById('df-width') as HTMLInputElement;
        const tileEl = document.getElementById('df-tile') as HTMLInputElement;

        const lenM = unitToMeters(parseFloat(lenEl?.value) || 0, oldUnit);
        const widM = unitToMeters(parseFloat(widEl?.value) || 0, oldUnit);
        // Tile size stays in mm regardless of unit system — do NOT convert
        const tileCurrentMm = parseFloat(tileEl?.value) || 600;

        activeUnit = newUnit;

        const newLenVal = parseFloat(metersToUnit(lenM, newUnit).toFixed(2));
        const newWidVal = parseFloat(metersToUnit(widM, newUnit).toFixed(2));

        const lblLen = document.getElementById('lbl-df-length');
        const lblWid = document.getElementById('lbl-df-width');
        const lblTile = document.getElementById('lbl-df-tile');
        const unitName = getUnitName(newUnit);

        if (lblLen) lblLen.innerHTML = `Length (${unitName})<input id="df-length" type="number" value="${newLenVal}" min="0.1" step="0.5" class="dc-input"/>`;
        if (lblWid) lblWid.innerHTML = `Width (${unitName})<input id="df-width" type="number" value="${newWidVal}" min="0.1" step="0.5" class="dc-input"/>`;
        // Tile size label stays "(mm)" — always enter tile size in mm
        if (lblTile) lblTile.innerHTML = `ESD Tile Size (mm)<input id="df-tile" type="number" value="${tileCurrentMm}" min="50" step="50" class="dc-input"/>`;

        document.getElementById('df-length')?.addEventListener('input', updatePreview);
        document.getElementById('df-width')?.addEventListener('input', updatePreview);
        document.getElementById('df-tile')?.addEventListener('input', updatePreview);

        updatePreview();
      });

      document.getElementById('df-length')?.addEventListener('input', updatePreview);
      document.getElementById('df-width')?.addEventListener('input', updatePreview);
      document.getElementById('df-tile')?.addEventListener('input', updatePreview);
      document.getElementById('df-rowscheme')?.addEventListener('change', updatePreview);
      document.getElementById('df-colscheme')?.addEventListener('change', updatePreview);
      document.getElementById('df-addrformat')?.addEventListener('change', updatePreview);
      updatePreview();
    }, 50);
  }

  private showEditFloorDialog(floor: DcFloor) {
    const initUnit = floor.unit ?? 'm';
    const initLen = parseFloat(metersToUnit(floor.lengthM, initUnit).toFixed(2));
    const initWid = parseFloat(metersToUnit(floor.widthM, initUnit).toFixed(2));
    const initTile = floor.tileSizeMm; // Tile size always shown and stored in mm
    const initRowScheme = floor.rowScheme ?? 'letters';
    const initColScheme = floor.colScheme ?? 'numbers';
    const initAddrFormat = floor.addressFormat ?? 'compact';

    this.showModal('Edit Floor', `
      <div class="dc-form">
        <label>Floor Name<input id="edf-name" type="text" value="${floor.name}" class="dc-input"/></label>
        <label>Measurement Unit System
          <select id="edf-unit" class="dc-input">
            <option value="m"${initUnit === 'm' ? ' selected' : ''}>Meters (m)</option>
            <option value="ft"${initUnit === 'ft' ? ' selected' : ''}>Feet (ft)</option>
            <option value="mm"${initUnit === 'mm' ? ' selected' : ''}>Millimeters (mm)</option>
            <option value="in"${initUnit === 'in' ? ' selected' : ''}>Inches (in)</option>
          </select>
        </label>
        <label id="lbl-edf-length">Length (${getUnitName(initUnit)})<input id="edf-length" type="number" value="${initLen}" min="0.1" step="0.5" class="dc-input"/></label>
        <label id="lbl-edf-width">Width (${getUnitName(initUnit)})<input id="edf-width" type="number" value="${initWid}" min="0.1" step="0.5" class="dc-input"/></label>
        <label id="lbl-edf-tile">ESD Tile Size (mm)<input id="edf-tile" type="number" value="${initTile}" min="50" step="50" class="dc-input"/></label>
        
        <div style="display:flex; gap:10px;">
          <label style="flex:1;">Row Addressing
            <select id="edf-rowscheme" class="dc-input">
              <option value="letters"${initRowScheme === 'letters' ? ' selected' : ''}>Letters (A, B, C...)</option>
              <option value="numbers"${initRowScheme === 'numbers' ? ' selected' : ''}>Numbers (01, 02, 03...)</option>
            </select>
          </label>
          <label style="flex:1;">Column Addressing
            <select id="edf-colscheme" class="dc-input">
              <option value="numbers"${initColScheme === 'numbers' ? ' selected' : ''}>Numbers (1, 2, 3...)</option>
              <option value="letters"${initColScheme === 'letters' ? ' selected' : ''}>Letters (A, B, C...)</option>
            </select>
          </label>
        </div>

        <label>Coordinate Identifier Format
          <select id="edf-addrformat" class="dc-input">
            <option value="compact"${initAddrFormat === 'compact' ? ' selected' : ''}>Compact Coordinates: A1, A2, B1, B2...</option>
            <option value="hyphen"${initAddrFormat === 'hyphen' ? ' selected' : ''}>Standard Hyphenated: A-01, A-02, B-01, B-02...</option>
          </select>
        </label>

        <div class="dc-form-preview" id="edf-preview"></div>
        <p class="dc-warning">⚠ Changing dimensions will rebuild the tile grid. Racks outside new boundaries will be removed.</p>
      </div>
    `, 'Save Changes', () => {
      const name = (document.getElementById('edf-name') as HTMLInputElement).value.trim() || floor.name;
      const unit = (document.getElementById('edf-unit') as HTMLSelectElement).value as DcUnit;
      const rowScheme = ((document.getElementById('edf-rowscheme') as HTMLSelectElement)?.value || 'letters') as 'letters' | 'numbers';
      const colScheme = ((document.getElementById('edf-colscheme') as HTMLSelectElement)?.value || 'numbers') as 'letters' | 'numbers';
      const addrFormat = ((document.getElementById('edf-addrformat') as HTMLSelectElement)?.value || 'compact') as DcAddressFormat;

      const rawLen = parseFloat((document.getElementById('edf-length') as HTMLInputElement).value) || initLen;
      const rawWid = parseFloat((document.getElementById('edf-width') as HTMLInputElement).value) || initWid;
      const rawTile = parseFloat((document.getElementById('edf-tile') as HTMLInputElement).value) || floor.tileSizeMm;

      const lenM = unitToMeters(rawLen, unit);
      const widM = unitToMeters(rawWid, unit);
      const tileMm = rawTile; // Tile size is always in mm (label: "ESD Tile Size (mm)")

      const filteredRacks = floor.racks.filter(r => {
        const rW = r.widthMm / 1000, rD = r.depthMm / 1000;
        const eW = r.rotation % 180 === 0 ? rW : rD;
        const eD = r.rotation % 180 === 0 ? rD : rW;
        return r.position.x + eW <= lenM && r.position.y + eD <= widM;
      });

      dcState.updateFloor(floor.id, {
        name,
        unit,
        lengthM: lenM,
        widthM: widM,
        tileSizeMm: tileMm,
        rowScheme,
        colScheme,
        addressFormat: addrFormat,
        racks: filteredRacks,
      });
      dcState.rebuildTiles();
      setTimeout(() => this.fitToFloor(), 50);
      return true;
    });

    let editActiveUnit: DcUnit = initUnit;

    const updateEditPreview = () => {
      const unit = ((document.getElementById('edf-unit') as HTMLSelectElement)?.value as DcUnit) || 'm';
      const rowScheme = ((document.getElementById('edf-rowscheme') as HTMLSelectElement)?.value || 'letters') as 'letters' | 'numbers';
      const colScheme = ((document.getElementById('edf-colscheme') as HTMLSelectElement)?.value || 'numbers') as 'letters' | 'numbers';
      const addrFormat = ((document.getElementById('edf-addrformat') as HTMLSelectElement)?.value || 'compact') as DcAddressFormat;

      const rawLen = parseFloat((document.getElementById('edf-length') as HTMLInputElement)?.value) || initLen;
      const rawWid = parseFloat((document.getElementById('edf-width') as HTMLInputElement)?.value) || initWid;
      const rawTile = parseFloat((document.getElementById('edf-tile') as HTMLInputElement)?.value) || floor.tileSizeMm;

      const lenM = unitToMeters(rawLen, unit);
      const widM = unitToMeters(rawWid, unit);
      const tileMm = rawTile; // Always mm

      const cols = Math.ceil(lenM / (tileMm / 1000));
      const rows = Math.ceil(widM / (tileMm / 1000));

      const sep = addrFormat === 'hyphen' ? '-' : '';
      const firstRow = rowScheme === 'numbers' ? '01' : 'A';
      const firstCol = colScheme === 'letters' ? 'A' : (addrFormat === 'hyphen' ? '01' : '1');
      const lastRow = rowScheme === 'numbers' ? String(rows).padStart(2, '0') : String.fromCharCode(65 + ((rows - 1) % 26));
      const lastCol = colScheme === 'letters' ? String.fromCharCode(65 + ((cols - 1) % 26)) : (addrFormat === 'hyphen' ? String(cols).padStart(2, '0') : String(cols));

      const prev = document.getElementById('edf-preview');
      if (prev) {
        prev.innerHTML = `
          <div class="dc-preview-line"><b>Measurement Unit:</b> ${getUnitName(unit)}</div>
          <div class="dc-preview-line"><b>Dimensions:</b> ${formatDimensionsMeters(lenM, widM, unit)} (${formatArea(lenM, widM)})</div>
          <div class="dc-preview-line"><b>Grid Layout:</b> ${cols} cols × ${rows} rows (${(cols * rows).toLocaleString()} ESD tiles)</div>
          <div class="dc-preview-line"><b>Addressing Scheme:</b> ${firstRow}${sep}${firstCol} ... ${lastRow}${sep}${lastCol}</div>
        `;
      }
    };

    setTimeout(() => {
      const unitSel = document.getElementById('edf-unit') as HTMLSelectElement;
      unitSel?.addEventListener('change', () => {
        const newUnit = unitSel.value as DcUnit;
        const oldUnit = editActiveUnit;
        if (oldUnit === newUnit) return;

        const lenEl = document.getElementById('edf-length') as HTMLInputElement;
        const widEl = document.getElementById('edf-width') as HTMLInputElement;
        const tileEl = document.getElementById('edf-tile') as HTMLInputElement;

        const lenM = unitToMeters(parseFloat(lenEl?.value) || 0, oldUnit);
        const widM = unitToMeters(parseFloat(widEl?.value) || 0, oldUnit);
        // Tile stays in mm — preserve raw mm value
        const tileCurrentMm = parseFloat(tileEl?.value) || floor.tileSizeMm;

        editActiveUnit = newUnit;

        const newLenVal = parseFloat(metersToUnit(lenM, newUnit).toFixed(2));
        const newWidVal = parseFloat(metersToUnit(widM, newUnit).toFixed(2));

        const lblLen = document.getElementById('lbl-edf-length');
        const lblWid = document.getElementById('lbl-edf-width');
        const lblTile = document.getElementById('lbl-edf-tile');
        const unitName = getUnitName(newUnit);

        if (lblLen) lblLen.innerHTML = `Length (${unitName})<input id="edf-length" type="number" value="${newLenVal}" min="0.1" step="0.5" class="dc-input"/>`;
        if (lblWid) lblWid.innerHTML = `Width (${unitName})<input id="edf-width" type="number" value="${newWidVal}" min="0.1" step="0.5" class="dc-input"/>`;
        // Tile stays mm always
        if (lblTile) lblTile.innerHTML = `ESD Tile Size (mm)<input id="edf-tile" type="number" value="${tileCurrentMm}" min="50" step="50" class="dc-input"/>`;

        document.getElementById('edf-length')?.addEventListener('input', updateEditPreview);
        document.getElementById('edf-width')?.addEventListener('input', updateEditPreview);
        document.getElementById('edf-tile')?.addEventListener('input', updateEditPreview);

        updateEditPreview();
      });

      document.getElementById('edf-length')?.addEventListener('input', updateEditPreview);
      document.getElementById('edf-width')?.addEventListener('input', updateEditPreview);
      document.getElementById('edf-tile')?.addEventListener('input', updateEditPreview);
      document.getElementById('edf-rowscheme')?.addEventListener('change', updateEditPreview);
      document.getElementById('edf-colscheme')?.addEventListener('change', updateEditPreview);
      document.getElementById('edf-addrformat')?.addEventListener('change', updateEditPreview);
      updateEditPreview();
    }, 50);
  }

  private showAddRackDialog() {
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const defaultId = dcState.generateRackId();
    this.showModal('Add Datacenter Rack', `
      <div class="dc-form">
        <label>Rack Preset Model
          <select id="dr-preset" class="dc-input">
            <option value="custom">Custom Configuration...</option>
            ${RACK_PRESETS.map(p => `<option value="${p.id}">${p.name} (${p.heightU}U, ${p.widthMm}×${p.depthMm}mm)</option>`).join('')}
          </select>
        </label>
        <label>Rack Type
          <select id="dr-type" class="dc-input">
            <option value="server" selected>Server Cabinet (Enclosed, Perforated Front/Rear)</option>
            <option value="network">Network / Telecom Cabinet (High Cable Capacity)</option>
            <option value="open-frame">Open Frame Relay Rack (2-Post / 4-Post Structural)</option>
            <option value="wall-mount">Wall-Mount Cabinet Enclosure</option>
          </select>
        </label>
        <label>Rack ID<input id="dr-id" type="text" value="${defaultId}" class="dc-input"/></label>
        <label>Rack Name / Tag<input id="dr-name" type="text" value="${defaultId}" class="dc-input"/></label>
        <label>Width (mm)<input id="dr-width" type="number" value="600" min="300" max="1500" step="50" class="dc-input"/></label>
        <label>Depth (mm)<input id="dr-depth" type="number" value="1200" min="300" max="2000" step="50" class="dc-input"/></label>
        <label>Height (U)<input id="dr-height" type="number" value="42" min="2" max="54" step="2" class="dc-input"/></label>
        <label>Door Style
          <select id="dr-door" class="dc-input">
            <option value="perforated" selected>Perforated High-Airflow Steel (Single Door)</option>
            <option value="split-perforated">Split Perforated Twin-Doors (Dual Wardrobe)</option>
            <option value="glass">Tempered Glass Window Door</option>
            <option value="solid">Solid Steel Security Door</option>
            <option value="multi-compartment-2">Multi-Compartment 2-Colo Doors</option>
            <option value="multi-compartment-4">Multi-Compartment 4-Colo Doors</option>
            <option value="none">No Door (Open Frame Relay Rack)</option>
          </select>
        </label>
        <label>Mounting Style
          <select id="dr-mounting" class="dc-input">
            <option value="floor" selected>Floor Mounted (Free-standing / Bayed)</option>
            <option value="wall-mount">Wall Mounted</option>
          </select>
        </label>
        <label>Manufacturer<input id="dr-mfr" type="text" value="APC Schneider" class="dc-input"/></label>
        <label>Model Number<input id="dr-model" type="text" value="AR3100" class="dc-input"/></label>
        <label>Max Power Load (kW)<input id="dr-power" type="number" value="20" min="1" max="200" step="1" class="dc-input"/></label>
        <label>Cabinet Color<input id="dr-color" type="color" value="#1e3a5f" class="dc-input" style="height:36px;padding:2px;"/></label>
      </div>
    `, 'Add Rack to Floor', () => {
      const id = (document.getElementById('dr-id') as HTMLInputElement).value.trim() || defaultId;
      const name = (document.getElementById('dr-name') as HTMLInputElement).value.trim() || id;
      const type = (document.getElementById('dr-type') as HTMLSelectElement).value as DcRackType;
      const w = parseFloat((document.getElementById('dr-width') as HTMLInputElement).value) || 600;
      const d = parseFloat((document.getElementById('dr-depth') as HTMLInputElement).value) || 1200;
      const h = parseFloat((document.getElementById('dr-height') as HTMLInputElement).value) || 42;
      const door = (document.getElementById('dr-door') as HTMLSelectElement).value as DcDoorStyle;
      const mounting = (document.getElementById('dr-mounting') as HTMLSelectElement).value as DcMounting;
      const mfr = (document.getElementById('dr-mfr') as HTMLInputElement).value.trim();
      const model = (document.getElementById('dr-model') as HTMLInputElement).value.trim();
      const maxPowerKw = parseFloat((document.getElementById('dr-power') as HTMLInputElement).value) || 20;
      const color = (document.getElementById('dr-color') as HTMLInputElement).value || '#1e3a5f';

      if (w <= 0 || d <= 0 || h <= 0) { alert('Invalid dimensions.'); return false; }

      const tileM = floor.tileSizeMm / 1000;
      const rack: DcRack = {
        id,
        name,
        type,
        widthMm: w,
        depthMm: d,
        heightU: h,
        doorStyle: door,
        mounting,
        manufacturer: mfr || undefined,
        model: model || undefined,
        position: { x: tileM * 2, y: tileM * 2, z: 0 },
        rotation: 0,
        color,
        maxPowerKw,
      };
      dcState.addRack(rack);
      dcState.setState({ selectedRackId: id });
      return true;
    });

    setTimeout(() => {
      const presetSel = document.getElementById('dr-preset') as HTMLSelectElement;
      presetSel?.addEventListener('change', () => {
        const val = presetSel.value;
        const preset = RACK_PRESETS.find(p => p.id === val);
        if (preset) {
          (document.getElementById('dr-type') as HTMLSelectElement).value = preset.type;
          (document.getElementById('dr-width') as HTMLInputElement).value = String(preset.widthMm);
          (document.getElementById('dr-depth') as HTMLInputElement).value = String(preset.depthMm);
          (document.getElementById('dr-height') as HTMLInputElement).value = String(preset.heightU);
          (document.getElementById('dr-door') as HTMLSelectElement).value = preset.doorStyle;
          (document.getElementById('dr-mounting') as HTMLSelectElement).value = preset.mounting;
          (document.getElementById('dr-mfr') as HTMLInputElement).value = preset.manufacturer;
          (document.getElementById('dr-model') as HTMLInputElement).value = preset.model;
          (document.getElementById('dr-color') as HTMLInputElement).value = preset.color;
        }
      });
    }, 50);
  }

  private showEditRackDialog(rack: DcRack) {
    this.showModal('Edit Rack Properties', `
      <div class="dc-form">
        <label>Rack ID<input id="dr-id" type="text" value="${rack.id}" disabled class="dc-input" style="opacity:0.6;"/></label>
        <label>Rack Name / Tag<input id="dr-name" type="text" value="${rack.name}" class="dc-input"/></label>
        <label>Rack Type
          <select id="dr-type" class="dc-input">
            <option value="server"${rack.type === 'server' ? ' selected' : ''}>Server Cabinet (Enclosed, Perforated Front/Rear)</option>
            <option value="network"${rack.type === 'network' ? ' selected' : ''}>Network / Telecom Cabinet (High Cable Capacity)</option>
            <option value="open-frame"${rack.type === 'open-frame' ? ' selected' : ''}>Open Frame Relay Rack (2-Post / 4-Post Structural)</option>
            <option value="wall-mount"${rack.type === 'wall-mount' ? ' selected' : ''}>Wall-Mount Cabinet Enclosure</option>
          </select>
        </label>
        <label>Width (mm)<input id="dr-width" type="number" value="${rack.widthMm}" min="300" max="1500" step="50" class="dc-input"/></label>
        <label>Depth (mm)<input id="dr-depth" type="number" value="${rack.depthMm}" min="300" max="2000" step="50" class="dc-input"/></label>
        <label>Height (U)<input id="dr-height" type="number" value="${rack.heightU}" min="2" max="54" step="2" class="dc-input"/></label>
        <label>Door Style
          <select id="dr-door" class="dc-input">
            <option value="perforated"${rack.doorStyle === 'perforated' ? ' selected' : ''}>Perforated High-Airflow Steel (Single Door)</option>
            <option value="split-perforated"${rack.doorStyle === 'split-perforated' ? ' selected' : ''}>Split Perforated Twin-Doors (Dual Wardrobe)</option>
            <option value="glass"${rack.doorStyle === 'glass' ? ' selected' : ''}>Tempered Glass Window Door</option>
            <option value="solid"${rack.doorStyle === 'solid' ? ' selected' : ''}>Solid Steel Security Door</option>
            <option value="multi-compartment-2"${rack.doorStyle === 'multi-compartment-2' ? ' selected' : ''}>Multi-Compartment 2-Colo Doors</option>
            <option value="multi-compartment-4"${rack.doorStyle === 'multi-compartment-4' ? ' selected' : ''}>Multi-Compartment 4-Colo Doors</option>
            <option value="none"${rack.doorStyle === 'none' ? ' selected' : ''}>No Door (Open Frame Relay Rack)</option>
          </select>
        </label>
        <label>Mounting Style
          <select id="dr-mounting" class="dc-input">
            <option value="floor"${(rack.mounting ?? 'floor') === 'floor' ? ' selected' : ''}>Floor Mounted (Free-standing / Bayed)</option>
            <option value="wall-mount"${rack.mounting === 'wall-mount' ? ' selected' : ''}>Wall Mounted</option>
          </select>
        </label>
        <label>Manufacturer<input id="dr-mfr" type="text" value="${rack.manufacturer || ''}" class="dc-input"/></label>
        <label>Model Number<input id="dr-model" type="text" value="${rack.model || ''}" class="dc-input"/></label>
        <label>Max Power Load (kW)<input id="dr-power" type="number" value="${rack.maxPowerKw ?? 20}" min="1" max="200" step="1" class="dc-input"/></label>
        <label>Cabinet Color<input id="dr-color" type="color" value="${rack.color || '#1e3a5f'}" class="dc-input" style="height:36px;padding:2px;"/></label>
      </div>
    `, 'Save Rack Properties', () => {
      const name = (document.getElementById('dr-name') as HTMLInputElement).value.trim() || rack.name;
      const type = (document.getElementById('dr-type') as HTMLSelectElement).value as DcRackType;
      const w = parseFloat((document.getElementById('dr-width') as HTMLInputElement).value) || rack.widthMm;
      const d = parseFloat((document.getElementById('dr-depth') as HTMLInputElement).value) || rack.depthMm;
      const h = parseFloat((document.getElementById('dr-height') as HTMLInputElement).value) || rack.heightU;
      const door = (document.getElementById('dr-door') as HTMLSelectElement).value as DcDoorStyle;
      const mounting = (document.getElementById('dr-mounting') as HTMLSelectElement).value as DcMounting;
      const mfr = (document.getElementById('dr-mfr') as HTMLInputElement).value.trim();
      const model = (document.getElementById('dr-model') as HTMLInputElement).value.trim();
      const maxPowerKw = parseFloat((document.getElementById('dr-power') as HTMLInputElement).value) || (rack.maxPowerKw ?? 20);
      const color = (document.getElementById('dr-color') as HTMLInputElement).value || rack.color;

      dcState.updateRack(rack.id, {
        name,
        type,
        widthMm: w,
        depthMm: d,
        heightU: h,
        doorStyle: door,
        mounting,
        manufacturer: mfr || undefined,
        model: model || undefined,
        color,
        maxPowerKw,
      });
      this.refresh();
      return true;
    });
  }

  private showAddRowDialog() {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    this.showModal('Add Row of Racks (International Standard Spacing)', `
      <div class="dc-form">
        <label>Row Tag / Prefix<input id="row-prefix" type="text" value="ROW-A" class="dc-input"/></label>
        <label>Rack Preset & Type
          <select id="row-preset" class="dc-input">
            ${RACK_PRESETS.map(p => `<option value="${p.id}">${p.name} (${p.heightU}U, ${p.widthMm}×${p.depthMm}mm)</option>`).join('')}
          </select>
        </label>
        <label>Number of Racks in Row<input id="row-count" type="number" value="4" min="1" max="20" class="dc-input"/></label>
        <label>International Spacing Standard
          <select id="row-spacing" class="dc-input">
            ${SPACING_STANDARDS.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
          </select>
        </label>
        <label>Row Orientation
          <select id="row-dir" class="dc-input">
            <option value="h" selected>Horizontal Row (Left-to-Right)</option>
            <option value="v">Vertical Row (Top-to-Bottom)</option>
          </select>
        </label>
        <div class="dc-form-preview" id="row-preview"></div>
      </div>
    `, 'Generate Standard Row', () => {
      const prefix = (document.getElementById('row-prefix') as HTMLInputElement).value.trim() || 'ROW-A';
      const presetId = (document.getElementById('row-preset') as HTMLSelectElement).value;
      const count = parseInt((document.getElementById('row-count') as HTMLInputElement).value) || 4;
      const spacingId = (document.getElementById('row-spacing') as HTMLSelectElement).value as DcSpacingStandard;
      const dir = (document.getElementById('row-dir') as HTMLSelectElement).value as 'h' | 'v';

      const preset = RACK_PRESETS.find(p => p.id === presetId) || RACK_PRESETS[0];
      const standard = SPACING_STANDARDS.find(s => s.id === spacingId) || SPACING_STANDARDS[0];

      const gapM = standard.gapM;
      const rWM = preset.widthMm / 1000;
      const rDM = preset.depthMm / 1000;

      const tileM = floor.tileSizeMm / 1000;
      let startX = tileM * 2;
      let startY = tileM * 2;

      for (let i = 0; i < count; i++) {
        const id = `${prefix}-${String(i + 1).padStart(2, '0')}`;
        const posX = dir === 'h' ? startX + i * (rWM + gapM) : startX;
        const posY = dir === 'v' ? startY + i * (rDM + gapM) : startY;

        const rack: DcRack = {
          id,
          name: id,
          type: preset.type,
          widthMm: preset.widthMm,
          depthMm: preset.depthMm,
          heightU: preset.heightU,
          doorStyle: preset.doorStyle,
          mounting: preset.mounting,
          manufacturer: preset.manufacturer,
          model: preset.model,
          position: { x: parseFloat(posX.toFixed(3)), y: parseFloat(posY.toFixed(3)), z: 0 },
          rotation: 0,
          color: preset.color,
        };
        dcState.addRack(rack);
      }

      setTimeout(() => this.fitToFloor(), 50);
      return true;
    });

    const updatePreview = () => {
      const spacingId = ((document.getElementById('row-spacing') as HTMLSelectElement)?.value as DcSpacingStandard) || 'bayed-0mm';
      const count = parseInt((document.getElementById('row-count') as HTMLInputElement)?.value) || 4;
      const presetId = ((document.getElementById('row-preset') as HTMLSelectElement)?.value) || RACK_PRESETS[0].id;

      const preset = RACK_PRESETS.find(p => p.id === presetId) || RACK_PRESETS[0];
      const standard = SPACING_STANDARDS.find(s => s.id === spacingId) || SPACING_STANDARDS[0];

      const rWM = preset.widthMm / 1000;
      const totalLenM = count * rWM + (count - 1) * standard.gapM;

      const prev = document.getElementById('row-preview');
      if (prev) {
        prev.innerHTML = `
          <div class="dc-preview-line"><b>Standard:</b> ${standard.standardDoc}</div>
          <div class="dc-preview-line"><b>Inter-Rack Gap:</b> ${formatSingleDistance(standard.gapM, floor.unit ?? 'm')}</div>
          <div class="dc-preview-line"><b>Row Footprint:</b> ${formatSingleDistance(totalLenM, floor.unit ?? 'm')} (${count} Racks)</div>
          <div class="dc-preview-line"><i>${standard.description}</i></div>
        `;
      }
    };

    setTimeout(() => {
      document.getElementById('row-preset')?.addEventListener('change', updatePreview);
      document.getElementById('row-count')?.addEventListener('input', updatePreview);
      document.getElementById('row-spacing')?.addEventListener('change', updatePreview);
      updatePreview();
    }, 50);
  }

  private showAddInfraDialog(tile?: DcFloorTile) {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const startX = tile ? tile.x : 0;
    const startY = tile ? tile.y : 0;
    const tileM = floor.tileSizeMm / 1000;
    const endX = tile ? parseFloat((tile.x + tileM * 2).toFixed(2)) : 2.4;
    const endY = tile ? tile.y : 0;
    const defaultElevation = -220; // 220mm below raised floor surface

    this.showModal('Add Under-Floor Infrastructure', `
      <div class="dc-form">
        <label>Infrastructure Category
          <select id="infra-category" class="dc-input">
            <option value="cable-tray" selected>Cable Tray (Basket / Ladder Mesh)</option>
            <option value="cable-duct">Cable Duct (Galvanized / PVC Channel)</option>
            <option value="power-cable">Power Cabling (Red Busway / Feeders)</option>
            <option value="data-cable">Data / Network Fiber Optic Bundle</option>
            <option value="riser">Vertical Floor Riser (Plenum Penetration)</option>
          </select>
        </label>
        <label>Item Name / ID
          <input id="infra-name" type="text" value="Underfloor Tray 1" class="dc-input"/>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label>Start X (m)<input id="infra-sx" type="number" step="0.1" value="${startX.toFixed(2)}" class="dc-input"/></label>
          <label>Start Y (m)<input id="infra-sy" type="number" step="0.1" value="${startY.toFixed(2)}" class="dc-input"/></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label>End X (m)<input id="infra-ex" type="number" step="0.1" value="${endX.toFixed(2)}" class="dc-input"/></label>
          <label>End Y (m)<input id="infra-ey" type="number" step="0.1" value="${endY.toFixed(2)}" class="dc-input"/></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label>Width (mm)<input id="infra-w" type="number" step="10" value="300" class="dc-input"/></label>
          <label>Height (mm)<input id="infra-h" type="number" step="10" value="80" class="dc-input"/></label>
        </div>
        <label>Depth Below Floor (mm)
          <input id="infra-elev" type="number" step="10" value="${defaultElevation}" class="dc-input" title="Elevation below floor (e.g. -220 mm)"/>
        </label>
      </div>
    `, 'Add Infrastructure', () => {
      const cat = (document.getElementById('infra-category') as HTMLSelectElement).value as DcInfraCategory;
      const name = (document.getElementById('infra-name') as HTMLInputElement).value.trim() || 'Underfloor Item';
      const sx = parseFloat((document.getElementById('infra-sx') as HTMLInputElement).value) || 0;
      const sy = parseFloat((document.getElementById('infra-sy') as HTMLInputElement).value) || 0;
      const ex = parseFloat((document.getElementById('infra-ex') as HTMLInputElement).value) || 0;
      const ey = parseFloat((document.getElementById('infra-ey') as HTMLInputElement).value) || 0;
      const w = parseFloat((document.getElementById('infra-w') as HTMLInputElement).value) || 300;
      const h = parseFloat((document.getElementById('infra-h') as HTMLInputElement).value) || 80;
      const elev = parseFloat((document.getElementById('infra-elev') as HTMLInputElement).value) || -220;

      const id = `INFRA-${Date.now().toString(36).toUpperCase()}`;
      const item: DcInfrastructureItem = {
        id,
        name,
        category: cat,
        layer: 'underfloor',
        subtype: cat === 'cable-tray' ? 'basket-tray' : cat === 'cable-duct' ? 'solid-duct' : 'cable',
        start: { x: sx, y: sy, z: elev / 1000 },
        end: { x: ex, y: ey, z: elev / 1000 },
        widthMm: w,
        heightMm: h,
        elevationMm: elev,
      };

      dcState.addInfrastructureItem(item);
      dcState.setState({ selectedInfraId: id });
      this.refresh();
      eventBus.emit('notification', { message: `Added ${name} (${cat}) to under-floor infrastructure.`, type: 'info' });
      return true;
    });
  }

  private showModal(
    title: string,
    bodyHtml: string,
    confirmLabel: string,
    onConfirm: () => boolean,
    isMandatory: boolean = false
  ) {
    let existing = document.getElementById('dc-modal-overlay');
    existing?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dc-modal-overlay';
    overlay.className = 'dc-modal-overlay';
    overlay.innerHTML = `
      <div class="dc-modal">
        <div class="dc-modal-header">
          <h3>${title}</h3>
          ${!isMandatory ? '<button class="dc-modal-close" id="dc-modal-close">×</button>' : ''}
        </div>
        <div class="dc-modal-body">${bodyHtml}</div>
        <div class="dc-modal-footer">
          ${!isMandatory ? '<button class="dc-btn dc-btn-secondary" id="dc-modal-cancel">Cancel</button>' : ''}
          <button class="dc-btn dc-btn-primary" id="dc-modal-confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    if (!isMandatory) {
      overlay.querySelector('#dc-modal-close')?.addEventListener('click', close);
      overlay.querySelector('#dc-modal-cancel')?.addEventListener('click', close);
    }
    overlay.querySelector('#dc-modal-confirm')?.addEventListener('click', () => {
      if (onConfirm()) close();
    });
  }

  private initThree3D(wrap3d: HTMLElement, floor: DcFloor) {
    if (!this.threeRenderer) {
      this.threeRenderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
      });
      this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.threeRenderer.shadowMap.enabled = true;
      this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const viewportEl = wrap3d.querySelector('#dc3d-viewport') as HTMLElement;
      if (viewportEl) {
        viewportEl.appendChild(this.threeRenderer.domElement);
      }

      this.threeMaterials = new MaterialManager();
      this.threeScene = new THREE.Scene();
      this.threeScene.background = new THREE.Color(0x0d1117);

      this.threeCamera = new THREE.PerspectiveCamera(50, 1, 10, 50000);
      this.threeControls = new OrbitControls(this.threeCamera, this.threeRenderer.domElement);
      this.threeControls.enableDamping = true;
      this.threeControls.dampingFactor = 0.08;
      this.threeControls.minPolarAngle = 0;
      this.threeControls.maxPolarAngle = Math.PI - 0.001; // Full vertical tilting from 0° (top-down) to 180° (underneath)

      // Lighting: Natural studio ambient + directional key & fill
      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334455, 1.6);
      this.threeScene.add(hemiLight);

      const ambLight = new THREE.AmbientLight(0xffffff, 1.1);
      this.threeScene.add(ambLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
      dirLight.position.set(2000, 5000, 3000);
      this.threeScene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x90b0e0, 1.0);
      fillLight.position.set(-3000, 4000, -2000);
      this.threeScene.add(fillLight);

      // Mouse picking / selection on 3D Racks
      this.threeRenderer.domElement.addEventListener('pointerdown', (e) => {
        if (e.button === 2) return; // Allow context menu
        const currentFloor = dcState.getActiveFloor();
        if (!currentFloor) return;

        const rect = this.threeRenderer!.domElement.getBoundingClientRect();
        this.threeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.threeMouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.threeRaycaster.setFromCamera(this.threeMouse, this.threeCamera!);

        const intersects = this.threeRaycaster.intersectObjects(this.threeScene!.children, true);
        let clickedRackId: string | null = null;
        let clickedTileId: string | null = null;
        let clickedInfraId: string | null = null;
        for (const hit of intersects) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && cur !== this.threeScene) {
            if (this.rackMeshMap.has(cur)) {
              clickedRackId = this.rackMeshMap.get(cur)!;
              break;
            }
            if (cur.userData?.infraId) {
              clickedInfraId = cur.userData.infraId;
              break;
            }
            if (cur.userData?.tileId) {
              clickedTileId = cur.userData.tileId;
              break;
            }
            cur = cur.parent;
          }
          if (clickedRackId || clickedInfraId || clickedTileId) break;
        }

        if (clickedRackId) {
          dcState.setState({ selectedRackId: clickedRackId, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
          this.renderPropsPanel();
          this.update3DSelectionHighlight();
        } else if (clickedInfraId) {
          dcState.setState({ selectedInfraId: clickedInfraId, selectedRackId: null, selectedTileId: null, selectedTileIds: [] });
          this.renderPropsPanel();
          this.rebuildThreeScene(currentFloor);
        } else if (clickedTileId) {
          const isMultiKey = e.ctrlKey || e.metaKey || e.shiftKey;
          const s = dcState.getState();
          const curIds = Array.isArray(s.selectedTileIds) ? [...s.selectedTileIds] : (s.selectedTileId ? [s.selectedTileId] : []);
          let newIds: string[] = [];
          if (isMultiKey) {
            if (curIds.includes(clickedTileId)) {
              newIds = curIds.filter(id => id !== clickedTileId);
            } else {
              newIds = [...curIds, clickedTileId];
            }
          } else {
            newIds = [clickedTileId];
          }
          const primaryId = newIds.length > 0 ? newIds[newIds.length - 1] : null;
          dcState.setState({ selectedTileId: primaryId, selectedTileIds: newIds, selectedRackId: null, selectedInfraId: null });
          this.renderPropsPanel();
          this.rebuildThreeScene(currentFloor);
        } else {
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            dcState.setState({ selectedTileId: null, selectedTileIds: [], selectedRackId: null, selectedInfraId: null });
            this.renderPropsPanel();
            this.update3DSelectionHighlight();
          }
        }
      });

      this.threeRenderer.domElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const currentFloor = dcState.getActiveFloor();
        if (!currentFloor) return;

        const rect = this.threeRenderer!.domElement.getBoundingClientRect();
        this.threeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.threeMouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.threeRaycaster.setFromCamera(this.threeMouse, this.threeCamera!);

        const intersects = this.threeRaycaster.intersectObjects(this.threeScene!.children, true);
        let clickedRackId: string | null = null;
        let clickedTileId: string | null = null;
        for (const hit of intersects) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && cur !== this.threeScene) {
            if (this.rackMeshMap.has(cur)) {
              clickedRackId = this.rackMeshMap.get(cur)!;
              break;
            }
            if (cur.userData?.tileId) {
              clickedTileId = cur.userData.tileId;
              break;
            }
            cur = cur.parent;
          }
          if (clickedRackId || clickedTileId) break;
        }

        if (clickedRackId) {
          const rack = currentFloor.racks.find(r => r.id === clickedRackId);
          if (rack) {
            dcState.setState({ selectedRackId: rack.id, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
            this.renderPropsPanel();
            this.update3DSelectionHighlight();
            this.showContextMenu(e.clientX, e.clientY, rack);
          }
        } else if (clickedTileId) {
          const tile = currentFloor.tiles.find(t => t.id === clickedTileId);
          if (tile) {
            const s = dcState.getState();
            const curIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
            if (curIds.includes(tile.id) && curIds.length > 1) {
              const selectedTiles = currentFloor.tiles.filter(t => curIds.includes(t.id));
              this.renderPropsPanel();
              this.showTileContextMenu(e.clientX, e.clientY, tile, selectedTiles);
            } else {
              dcState.setState({ selectedTileId: tile.id, selectedTileIds: [tile.id], selectedRackId: null, selectedInfraId: null });
              this.renderPropsPanel();
              this.rebuildThreeScene(currentFloor);
              this.showTileContextMenu(e.clientX, e.clientY, tile, [tile]);
            }
          }
        }
      });

      // Render loop
      const animate3D = () => {
        this.threeAnimId = requestAnimationFrame(animate3D);
        if (this.threeControls) this.threeControls.update();
        if (this.threeRenderer && this.threeScene && this.threeCamera) {
          this.threeRenderer.render(this.threeScene, this.threeCamera);
        }
      };
      animate3D();
    }

    this.resizeThree();
    this.rebuildThreeScene(floor);
  }

  private resizeThree() {
    const wrap3d = this.container.querySelector('#dc-3d-container') as HTMLElement;
    if (!wrap3d || !this.threeRenderer || !this.threeCamera) return;
    const viewportEl = wrap3d.querySelector('#dc3d-viewport') as HTMLElement;
    const width = viewportEl ? viewportEl.clientWidth : wrap3d.clientWidth;
    const height = viewportEl ? viewportEl.clientHeight : wrap3d.clientHeight;
    if (width > 0 && height > 0) {
      this.threeRenderer.setSize(width, height);
      this.threeCamera.aspect = width / height;
      this.threeCamera.updateProjectionMatrix();
    }
  }

  private rebuildThreeScene(floor: DcFloor) {
    if (!this.threeScene || !this.threeMaterials || !this.threeCamera || !this.threeControls) return;

    // Clear previous dynamic meshes (keep lights)
    const toRemove: THREE.Object3D[] = [];
    this.threeScene.traverse(child => {
      if (child.userData?.isDynamic) toRemove.push(child);
    });
    toRemove.forEach(obj => {
      this.threeScene!.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    });
    this.rackMeshMap.clear();

    const s = dcState.getState();
    const floorLenMm = floor.lengthM * 1000;
    const floorWidMm = floor.widthM * 1000;
    const tileMm = floor.tileSizeMm;
    const cols = Math.ceil(floorLenMm / tileMm);
    const rows = Math.ceil(floorWidMm / tileMm);

    // 1. Authentic Clean White ESD Raised Access Floor Texture (Clean, uniform surface with static-dissipative micro-speckles)
    const canvasW = 512;
    const canvasH = 512;
    const esdCanvas = document.createElement('canvas');
    esdCanvas.width = canvasW;
    esdCanvas.height = canvasH;
    const esdCtx = esdCanvas.getContext('2d')!;

    // Clean off-white ESD laminate base tone
    esdCtx.fillStyle = '#f8fafc';
    esdCtx.fillRect(0, 0, canvasW, canvasH);

    // Fine ESD static-dissipative carbon micro-speckles across surface
    esdCtx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 400; i++) {
      const sx = (Math.sin(i * 19.3) * 0.5 + 0.5) * canvasW;
      const sy = (Math.cos(i * 37.7) * 0.5 + 0.5) * canvasH;
      esdCtx.fillRect(sx, sy, 1.2, 1.2);
    }
    esdCtx.fillStyle = '#94a3b8';
    for (let i = 0; i < 200; i++) {
      const sx = (Math.sin(i * 29.7) * 0.5 + 0.5) * canvasW;
      const sy = (Math.cos(i * 43.1) * 0.5 + 0.5) * canvasH;
      esdCtx.fillRect(sx, sy, 1.0, 1.0);
    }

    const esdTexture = new THREE.CanvasTexture(esdCanvas);
    esdTexture.colorSpace = THREE.SRGBColorSpace;
    esdTexture.anisotropy = 16;

    // 1. Concrete Subfloor Base Slab (at y = -plenumDepthMm)
    const plenumDepthMm = floor.raisedFloorHeightMm || 450;
    const subfloorGeo = new THREE.PlaneGeometry(floorLenMm, floorWidMm);
    const subfloorMat = new THREE.MeshStandardMaterial({
      color: 0x22262d, // Industrial dark concrete
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const subfloorMesh = new THREE.Mesh(subfloorGeo, subfloorMat);
    subfloorMesh.rotation.x = -Math.PI / 2;
    subfloorMesh.position.set(floorLenMm / 2, -plenumDepthMm, floorWidMm / 2);
    subfloorMesh.userData = { isDynamic: true };
    this.threeScene.add(subfloorMesh);

    // 2. Zinc-Plated Steel Raised Floor Pedestals / Stanchions with leveling heads at grid intersections
    const pedestalGroup = new THREE.Group();
    pedestalGroup.userData = { isDynamic: true };
    const pedestalShaftGeo = new THREE.CylinderGeometry(14, 14, plenumDepthMm, 8);
    const pedestalHeadGeo = new THREE.BoxGeometry(70, 8, 70);
    const pedestalBaseGeo = new THREE.BoxGeometry(85, 6, 85);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa, // Zinc-chromate passivated steel
      roughness: 0.35,
      metalness: 0.75,
    });

    const colPeds = cols + 1;
    const rowPeds = rows + 1;
    for (let r = 0; r < rowPeds; r++) {
      for (let c = 0; c < colPeds; c++) {
        const px = Math.min(floorLenMm, c * tileMm);
        const pz = Math.min(floorWidMm, r * tileMm);
        const stanchion = new THREE.Group();
        const shaft = new THREE.Mesh(pedestalShaftGeo, pedestalMat);
        shaft.position.y = -plenumDepthMm / 2;
        const head = new THREE.Mesh(pedestalHeadGeo, pedestalMat);
        head.position.y = -4;
        const base = new THREE.Mesh(pedestalBaseGeo, pedestalMat);
        base.position.y = -plenumDepthMm + 3;
        stanchion.add(shaft, head, base);
        stanchion.position.set(px, 0, pz);
        pedestalGroup.add(stanchion);
      }
    }
    this.threeScene.add(pedestalGroup);

    // 3. Intelligent Floor Panels (Standard White ESD / Perforated Vented / Air-Channel Plenum)
    const effectiveFloorOpacity = dcState.getState().xrayMode ? 0.22 : dcState.getState().floorOpacity;
    this.threeFloorMaterials = [];

    const stdFloorMat = new THREE.MeshStandardMaterial({
      map: esdTexture,
      roughness: 0.45,
      metalness: 0.08,
      transparent: effectiveFloorOpacity < 1.0,
      opacity: effectiveFloorOpacity,
      side: THREE.DoubleSide,
    });
    this.threeFloorMaterials.push(stdFloorMat);

    // Procedural Perforated Vented Tile Texture (Datacenter Cold-Aisle high-flow metal grille)
    const perfCanvas = document.createElement('canvas');
    perfCanvas.width = 256;
    perfCanvas.height = 256;
    const pCtx = perfCanvas.getContext('2d')!;
    pCtx.fillStyle = '#e2e8f0';
    pCtx.fillRect(0, 0, 256, 256);
    // Draw perforation hole matrix (60% open area)
    pCtx.fillStyle = '#0f172a';
    const holeRadius = 5.5;
    const step = 20;
    for (let hx = 14; hx < 246; hx += step) {
      for (let hy = 14; hy < 246; hy += step) {
        pCtx.beginPath();
        pCtx.arc(hx, hy, holeRadius, 0, Math.PI * 2);
        pCtx.fill();
      }
    }
    pCtx.strokeStyle = '#334155';
    pCtx.lineWidth = 4;
    pCtx.strokeRect(2, 2, 252, 252);

    const perfTexture = new THREE.CanvasTexture(perfCanvas);
    perfTexture.colorSpace = THREE.SRGBColorSpace;
    const perfTileMat = new THREE.MeshStandardMaterial({
      map: perfTexture,
      roughness: 0.35,
      metalness: 0.65,
      transparent: effectiveFloorOpacity < 1.0,
      opacity: Math.max(0.35, effectiveFloorOpacity),
      side: THREE.DoubleSide,
    });
    this.threeFloorMaterials.push(perfTileMat);

    // Air Channel plenum tile group
    const airChannelGroup = new THREE.Group();
    airChannelGroup.userData = { isDynamic: true };

    const airChannelDuctMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // HVAC galvanized supply duct blue
      roughness: 0.40,
      metalness: 0.60,
      transparent: true,
      opacity: 0.70,
      side: THREE.DoubleSide,
    });

    const airArrowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
    });

    const tilesGroup = new THREE.Group();
    tilesGroup.userData = { isDynamic: true };

    // Group standard tiles onto a single optimized plane or individual panels if specialized or selected
    const hasSpecialTiles = floor.tiles.some(t => t.type === 'perforated' || t.type === 'air-channel' || t.type === 'ventilated');
    const selectedTileIds = Array.isArray(s.selectedTileIds) ? s.selectedTileIds : (s.selectedTileId ? [s.selectedTileId] : []);
    const hasSelection = selectedTileIds.length > 0;

    if (!hasSpecialTiles && !hasSelection && effectiveFloorOpacity >= 0.99) {
      // Fast single plane if all standard and none selected
      const floorGeo = new THREE.PlaneGeometry(floorLenMm, floorWidMm);
      const floorMesh = new THREE.Mesh(floorGeo, stdFloorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(floorLenMm / 2, 0, floorWidMm / 2);
      floorMesh.userData = { isDynamic: true };
      this.threeScene.add(floorMesh);
    } else {
      // Individual panels for realistic tile-by-tile appearance
      const panelSize = tileMm;
      const tilePanelGeo = new THREE.PlaneGeometry(panelSize, panelSize);
      floor.tiles.forEach(t => {
        const txMm = t.x * 1000 + tileMm / 2;
        const tzMm = t.y * 1000 + tileMm / 2;

        if (t.type === 'ventilated') {
          // Authentic Heavy-Duty Steel Bar Grate / Grille Tile (Open Plenum Floor)
          const ventTileGroup = new THREE.Group();
          ventTileGroup.position.set(txMm, 0, tzMm);
          ventTileGroup.userData = { isDynamic: true, tileId: t.id };

          const steelMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8, // Architectural galvanized / brushed steel
            roughness: 0.30,
            metalness: 0.85,
          });

          // 1. Steel Perimeter Rim Frame (Outer square rim, 14mm wide, 25mm deep)
          const rimWidth = 14;
          const rimDepth = 25;
          const rimLength = panelSize;

          // North & South rims
          const rimNSGeo = new THREE.BoxGeometry(rimLength, rimDepth, rimWidth);
          const rimN = new THREE.Mesh(rimNSGeo, steelMat);
          rimN.position.set(0, -rimDepth / 2, -panelSize / 2 + rimWidth / 2);
          rimN.userData = { isDynamic: true, tileId: t.id };
          ventTileGroup.add(rimN);

          const rimS = new THREE.Mesh(rimNSGeo, steelMat);
          rimS.position.set(0, -rimDepth / 2, panelSize / 2 - rimWidth / 2);
          rimS.userData = { isDynamic: true, tileId: t.id };
          ventTileGroup.add(rimS);

          // East & West rims
          const rimEWGeo = new THREE.BoxGeometry(rimWidth, rimDepth, rimLength - rimWidth * 2);
          const rimW = new THREE.Mesh(rimEWGeo, steelMat);
          rimW.position.set(-panelSize / 2 + rimWidth / 2, -rimDepth / 2, 0);
          rimW.userData = { isDynamic: true, tileId: t.id };
          ventTileGroup.add(rimW);

          const rimE = new THREE.Mesh(rimEWGeo, steelMat);
          rimE.position.set(panelSize / 2 - rimWidth / 2, -rimDepth / 2, 0);
          rimE.userData = { isDynamic: true, tileId: t.id };
          ventTileGroup.add(rimE);

          // 2. Longitudinal Load-Bearing Steel Bars (dense vertical flat bars)
          const innerSize = panelSize - rimWidth * 2;
          const numLoadBars = 12;
          const barThickness = 3.5;
          const barDepth = 22;
          const loadBarGeo = new THREE.BoxGeometry(barThickness, barDepth, innerSize);
          const stepX = innerSize / (numLoadBars + 1);

          for (let bi = 1; bi <= numLoadBars; bi++) {
            const barMesh = new THREE.Mesh(loadBarGeo, steelMat);
            barMesh.position.set(-innerSize / 2 + bi * stepX, -barDepth / 2 - 1, 0);
            barMesh.userData = { isDynamic: true, tileId: t.id };
            ventTileGroup.add(barMesh);
          }

          // 3. Transverse Cross-Tie Tie Rods (horizontal cross rods)
          const numCrossRods = 6;
          const rodThickness = 3;
          const rodDepth = 6;
          const crossRodGeo = new THREE.BoxGeometry(innerSize, rodDepth, rodThickness);
          const stepZ = innerSize / (numCrossRods + 1);

          for (let ri = 1; ri <= numCrossRods; ri++) {
            const rodMesh = new THREE.Mesh(crossRodGeo, steelMat);
            rodMesh.position.set(0, -rodDepth / 2 - 0.5, -innerSize / 2 + ri * stepZ);
            rodMesh.userData = { isDynamic: true, tileId: t.id };
            ventTileGroup.add(rodMesh);
          }

          // 4. Invisible / raycastable surface plane for clicking and raycasting
          const hitPlaneGeo = new THREE.PlaneGeometry(panelSize, panelSize);
          const hitPlaneMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitPlane = new THREE.Mesh(hitPlaneGeo, hitPlaneMat);
          hitPlane.rotation.x = -Math.PI / 2;
          hitPlane.position.set(0, 0.1, 0);
          hitPlane.userData = { isDynamic: true, tileId: t.id };
          ventTileGroup.add(hitPlane);

          tilesGroup.add(ventTileGroup);
        } else if (t.type === 'perforated') {
          const perfMesh = new THREE.Mesh(tilePanelGeo, perfTileMat);
          perfMesh.rotation.x = -Math.PI / 2;
          perfMesh.position.set(txMm, 0.2, tzMm);
          perfMesh.userData = { isDynamic: true, tileId: t.id };
          tilesGroup.add(perfMesh);
        } else if (t.type === 'air-channel') {
          // Standard tile surface (tinted light cyan ESD) with under-floor plenum box
          const acMat = stdFloorMat.clone();
          acMat.color = new THREE.Color(0xdbeafe);
          this.threeFloorMaterials.push(acMat);
          const acMesh = new THREE.Mesh(tilePanelGeo, acMat);
          acMesh.rotation.x = -Math.PI / 2;
          acMesh.position.set(txMm, 0.1, tzMm);
          acMesh.userData = { isDynamic: true, tileId: t.id };
          tilesGroup.add(acMesh);

          // Physical Under-Floor Air Duct Box below raised floor (y = -plenumDepthMm to 0)
          const ductDepth = plenumDepthMm - 40;
          const ductBoxGeo = new THREE.BoxGeometry(panelSize - 10, ductDepth, panelSize - 10);
          const ductMesh = new THREE.Mesh(ductBoxGeo, airChannelDuctMat);
          ductMesh.position.set(txMm, -ductDepth / 2 - 10, tzMm);
          ductMesh.userData = { isDynamic: true, tileId: t.id };
          airChannelGroup.add(ductMesh);

          // Directional airflow arrow inside/on top of under-floor duct
          const arrowDir = t.airflowDir || 'north';
          const arrowConeGeo = new THREE.ConeGeometry(30, 80, 8);
          const arrowMesh = new THREE.Mesh(arrowConeGeo, airArrowMat);
          arrowMesh.position.set(txMm, -ductDepth / 2, tzMm);
          if (arrowDir === 'north') arrowMesh.rotation.x = -Math.PI / 2;
          else if (arrowDir === 'south') arrowMesh.rotation.x = Math.PI / 2;
          else if (arrowDir === 'east') arrowMesh.rotation.z = -Math.PI / 2;
          else if (arrowDir === 'west') arrowMesh.rotation.z = Math.PI / 2;
          airChannelGroup.add(arrowMesh);
        } else {
          // Standard ESD tile
          const stdMesh = new THREE.Mesh(tilePanelGeo, stdFloorMat);
          stdMesh.rotation.x = -Math.PI / 2;
          stdMesh.position.set(txMm, 0.1, tzMm);
          stdMesh.userData = { isDynamic: true, tileId: t.id };
          tilesGroup.add(stdMesh);
        }
      });

      // 3D Tile Selection Highlights (for all multi-selected tiles)
      if (selectedTileIds.length > 0) {
        const selMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        });
        const selBorderMat = new THREE.LineBasicMaterial({
          color: 0x0284c7,
          linewidth: 2,
        });
        const selPlaneGeo = new THREE.PlaneGeometry(panelSize, panelSize);

        selectedTileIds.forEach(id => {
          const tile = floor.tiles.find(t => t.id === id);
          if (!tile) return;
          const txMm = tile.x * 1000 + panelSize / 2;
          const tzMm = tile.y * 1000 + panelSize / 2;

          const selMesh = new THREE.Mesh(selPlaneGeo, selMat);
          selMesh.rotation.x = -Math.PI / 2;
          selMesh.position.set(txMm, 0.8, tzMm);
          selMesh.userData = { isDynamic: true };
          tilesGroup.add(selMesh);

          // Selection border lines
          const bPositions = [
            -panelSize / 2, 0, -panelSize / 2,
             panelSize / 2, 0, -panelSize / 2,
             panelSize / 2, 0, -panelSize / 2,
             panelSize / 2, 0,  panelSize / 2,
             panelSize / 2, 0,  panelSize / 2,
            -panelSize / 2, 0,  panelSize / 2,
            -panelSize / 2, 0,  panelSize / 2,
            -panelSize / 2, 0, -panelSize / 2,
          ];
          const bGeo = new THREE.BufferGeometry();
          bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPositions, 3));
          const bLines = new THREE.LineSegments(bGeo, selBorderMat);
          bLines.rotation.x = -Math.PI / 2;
          bLines.position.set(txMm, 0.9, tzMm);
          bLines.userData = { isDynamic: true };
          tilesGroup.add(bLines);
        });
      }

      this.threeScene.add(tilesGroup);
      this.threeScene.add(airChannelGroup);
    }

    // 4. Under-Floor Cabling, Cable Trays, Ducts & Risers
    const infraGroup = new THREE.Group();
    infraGroup.userData = { isDynamic: true };

    const trayMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Industrial yellow cable tray
      roughness: 0.40,
      metalness: 0.70,
    });
    const ductMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Galvanized metal duct
      roughness: 0.35,
      metalness: 0.80,
    });
    const powerCableMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red high-voltage / power busway
      roughness: 0.50,
      metalness: 0.20,
    });
    const dataCableMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6, // Blue fiber / Cat6 data bundle
      roughness: 0.50,
      metalness: 0.20,
    });
    const riserMat = new THREE.MeshStandardMaterial({
      color: 0x10b981, // Green riser pillar
      roughness: 0.45,
      metalness: 0.65,
    });

    (floor.infrastructure || []).forEach(item => {
      const sX = item.start.x * 1000;
      const sZ = item.start.y * 1000;
      const eX = item.end.x * 1000;
      const eZ = item.end.y * 1000;
      const elevY = item.elevationMm !== undefined ? item.elevationMm : -220; // depth below raised floor
      const lengthMm = Math.hypot(eX - sX, eZ - sZ) || 600;
      const midX = (sX + eX) / 2;
      const midZ = (sZ + eZ) / 2;
      const angleY = Math.atan2(eX - sX, eZ - sZ);

      let itemMat = trayMat;
      if (item.category === 'cable-duct') itemMat = ductMat;
      else if (item.category === 'power-cable') itemMat = powerCableMat;
      else if (item.category === 'data-cable') itemMat = dataCableMat;
      else if (item.category === 'riser') itemMat = riserMat;

      if (item.category === 'riser') {
        // Vertical riser pillar spanning from subfloor through raised floor
        const rGeo = new THREE.CylinderGeometry(item.widthMm / 2, item.widthMm / 2, plenumDepthMm + 300, 16);
        const rMesh = new THREE.Mesh(rGeo, itemMat);
        rMesh.position.set(midX, -plenumDepthMm / 2 + 150, midZ);
        rMesh.userData = { isDynamic: true, infraId: item.id };
        infraGroup.add(rMesh);
      } else {
        // Linear horizontal under-floor pathway (Tray, Duct, Conduit, Cable Bundle)
        const iGeo = new THREE.BoxGeometry(item.widthMm || 200, item.heightMm || 60, lengthMm);
        const iMesh = new THREE.Mesh(iGeo, itemMat);
        iMesh.position.set(midX, elevY, midZ);
        iMesh.rotation.y = angleY;
        iMesh.userData = { isDynamic: true, infraId: item.id };
        infraGroup.add(iMesh);
      }
    });
    this.threeScene.add(infraGroup);

    // 5. Clean, Exact ESD Grid Lines running directly through pedestal pillar centers
    this.threeGridGroup = new THREE.Group();
    this.threeGridGroup.userData = { isDynamic: true };

    const seamsY = 0.6; // Slightly above white ESD tile surface to prevent z-fighting

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x334155, // Dark industrial slate — matches 2D strokeStyle '#334155'
      linewidth: 1.5,
      depthTest: true,
      depthWrite: false,
    });

    const linePositions: number[] = [];

    // Horizontal grid lines along X axis through pillar centers (r = 0..rows)
    for (let r = 0; r <= rows; r++) {
      const z = Math.min(floorWidMm, r * tileMm);
      linePositions.push(0, seamsY, z, floorLenMm, seamsY, z);
    }

    // Vertical grid lines along Z axis through pillar centers (c = 0..cols)
    for (let c = 0; c <= cols; c++) {
      const x = Math.min(floorLenMm, c * tileMm);
      linePositions.push(x, seamsY, 0, x, seamsY, floorWidMm);
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const gridLines = new THREE.LineSegments(lineGeo, lineMat);
    this.threeGridGroup.add(gridLines);

    // Synchronize grid visibility with state
    this.threeGridGroup.visible = dcState.getState().gridVisible !== false;
    this.threeScene.add(this.threeGridGroup);

    // 6. Realistic Industrial Datacenter Raised Floor Anodized Aluminum Perimeter Curb Trim (Hollow 4-Edge Trim)
    const curbThickness = 30; // 30mm trim
    const curbHeight = 14;    // 14mm proud curb
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Architectural anodized aluminum
      roughness: 0.35,
      metalness: 0.80,
    });

    const curbGroup = new THREE.Group();
    curbGroup.userData = { isDynamic: true };

    // North curb (z = -curbThickness / 2)
    const curbNorthGeo = new THREE.BoxGeometry(floorLenMm + curbThickness * 2, curbHeight, curbThickness);
    const curbNorth = new THREE.Mesh(curbNorthGeo, curbMat);
    curbNorth.position.set(floorLenMm / 2, curbHeight / 2 - 2, -curbThickness / 2);
    curbGroup.add(curbNorth);

    // South curb (z = floorWidMm + curbThickness / 2)
    const curbSouthGeo = new THREE.BoxGeometry(floorLenMm + curbThickness * 2, curbHeight, curbThickness);
    const curbSouth = new THREE.Mesh(curbSouthGeo, curbMat);
    curbSouth.position.set(floorLenMm / 2, curbHeight / 2 - 2, floorWidMm + curbThickness / 2);
    curbGroup.add(curbSouth);

    // West curb (x = -curbThickness / 2)
    const curbWestGeo = new THREE.BoxGeometry(curbThickness, curbHeight, floorWidMm);
    const curbWest = new THREE.Mesh(curbWestGeo, curbMat);
    curbWest.position.set(-curbThickness / 2, curbHeight / 2 - 2, floorWidMm / 2);
    curbGroup.add(curbWest);

    // East curb (x = floorLenMm + curbThickness / 2)
    const curbEastGeo = new THREE.BoxGeometry(curbThickness, curbHeight, floorWidMm);
    const curbEast = new THREE.Mesh(curbEastGeo, curbMat);
    curbEast.position.set(floorLenMm + curbThickness / 2, curbHeight / 2 - 2, floorWidMm / 2);
    curbGroup.add(curbEast);

    this.threeScene.add(curbGroup);

    // 4. Real 3D Racks using buildRackGroup
    floor.racks.forEach(dcRack => {
      const stateRack = stateManager.getRack(dcRack.id);
      const rackData: RackData = {
        id: dcRack.id,
        name: dcRack.name,
        units: dcRack.heightU,
        depthMm: dcRack.depthMm,
        rackType: dcRack.type === 'open-frame' ? 'open-frame' : dcRack.type === 'network' ? 'network' : dcRack.type === 'wall-mount' ? 'wall-mount' : 'server',
        mounting: dcRack.mounting ?? 'floor',
        rackColor: dcRack.color ?? '#0c0e12',
        frontDoor: dcRack.doorStyle ?? 'perforated',
        sidePanels: dcRack.type !== 'open-frame',
        leftCableManagerWidth: dcRack.leftCableManagerWidth || stateRack?.leftCableManagerWidth || 'none',
        rightCableManagerWidth: dcRack.rightCableManagerWidth || stateRack?.rightCableManagerWidth || 'none',
        leftPduId: dcRack.leftPduId || stateRack?.leftPduId,
        rightPduId: dcRack.rightPduId || stateRack?.rightPduId,
        leftCableManagerColor: dcRack.leftCableManagerColor || stateRack?.leftCableManagerColor,
        rightCableManagerColor: dcRack.rightCableManagerColor || stateRack?.rightCableManagerColor,
        x: 0,
        y: 0,
      };


      const rackColorKey = (dcRack.color && !dcRack.color.startsWith('#') ? dcRack.color : 'black') as any;
      const rackGroup = buildRackGroup(rackData, this.threeMaterials!, rackColorKey);
      rackGroup.userData = { isDynamic: true, rackId: dcRack.id };

      // Make rack side panels and door panels semi-transparent so mounted servers/switches/ports are clearly visible in DC 3D view
      rackGroup.traverse(child => {
        const mesh = child as THREE.Mesh;
        if ((mesh as any).isMesh) {
          if (mesh.name === 'rack-side-L' || mesh.name === 'rack-side-R') {
            const m = (mesh.material as THREE.MeshStandardMaterial)?.clone?.() || mesh.material;
            mesh.material = m;
            m.transparent = true;
            m.opacity = 0.35;
            m.needsUpdate = true;
          } else if (
            mesh.name === 'rack-glass' ||
            mesh.name === 'rack-perf-L' ||
            mesh.name === 'rack-perf-R' ||
            mesh.name.startsWith('rack-door')
          ) {
            const m = (mesh.material as THREE.MeshStandardMaterial)?.clone?.() || mesh.material;
            mesh.material = m;
            m.transparent = true;
            m.opacity = 0.28;
            m.needsUpdate = true;
          }
        }
      });

      // 3. Mount Devices into Rack (Synchronized from Elevation / StateManager)
      const globalDevices = stateManager.getState().devices || [];
      const customTemplates = stateManager.getState().customTemplates || [];
      const rackDevices = globalDevices.filter(d => d.rackId === dcRack.id);

      rackDevices.forEach(device => {
        const template = getTemplate(device.templateId, customTemplates);
        if (!template) return;
        if (template.mountType === 'side' || device.sideMountPosition) return;

        try {
          const deviceResult = buildDeviceMesh(device, template, rackData, this.threeMaterials!);
          if (deviceResult && deviceResult.group) {
            // Map device meshes for raycast selection as well
            this.rackMeshMap.set(deviceResult.group, dcRack.id);
            deviceResult.group.traverse(dChild => {
              if (dChild instanceof THREE.Mesh) {
                this.rackMeshMap.set(dChild, dcRack.id);
                dChild.userData.rackId = dcRack.id;
              }
            });
            rackGroup.add(deviceResult.group);
          }
        } catch (err) {
          console.warn('Failed to build 3D device mesh for DC rack:', err);
        }
      });

      // 4. Mount 3D Cables into Rack Group
      const allCables = stateManager.getState().cables || [];
      const rackCables = allCables.filter(c => {
        const srcPort = c.sourcePortId ? stateManager.getPort(c.sourcePortId) : null;
        const destPort = c.destPortId ? stateManager.getPort(c.destPortId) : null;
        const srcDev = srcPort ? stateManager.getDevice(srcPort.deviceId) : null;
        const destDev = destPort ? stateManager.getDevice(destPort.deviceId) : null;
        return (srcDev && srcDev.rackId === dcRack.id) || (destDev && destDev.rackId === dcRack.id);
      });

      if (rackCables.length > 0) {
        const rackCableContainer = new THREE.Group();
        rackCableContainer.name = `rack-cables-${dcRack.id}`;
        const totalHeightMm = RACK_CONSTANTS.RACK_PADDING_TOP + rackData.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
        const curRackInState = stateManager.getRack(dcRack.id);
        const refRackX = curRackInState ? curRackInState.x : 200;

        rackCableContainer.position.set(-(refRackX + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2), -totalHeightMm / 2, 0);

        rackCables.forEach(c => {
          try {
            const cableMesh = buildCableMesh(c, stateManager.getState());
            if (cableMesh) {
              rackCableContainer.add(cableMesh);
            }
          } catch (err) {
            console.warn(`Failed to build 3D cable mesh for rack ${dcRack.id}:`, err);
          }
        });

        rackGroup.add(rackCableContainer);
      }

      // Map group and all its children for raycast selection
      this.rackMeshMap.set(rackGroup, dcRack.id);

      rackGroup.traverse(child => {
        if (child instanceof THREE.Mesh) {
          this.rackMeshMap.set(child, dcRack.id);
          child.userData.rackId = dcRack.id;
        }
      });

      // Total rack height in mm (from RACK_CONSTANTS: RACK_PADDING_TOP + RU_HEIGHT * units + RACK_PADDING_BOTTOM)
      const totalHMm = 65 + dcRack.heightU * 44.45 + 65;
      const rWMm = dcRack.widthMm;
      const rDMm = dcRack.depthMm;
      const rotRad = (-dcRack.rotation * Math.PI) / 180;

      // Group position: ground base flush onto floor surface at Y = 0
      const posX = dcRack.position.x * 1000 + (dcRack.rotation % 180 === 0 ? rWMm / 2 : rDMm / 2);
      const posZ = dcRack.position.y * 1000 + (dcRack.rotation % 180 === 0 ? rDMm / 2 : rWMm / 2);

      rackGroup.position.set(posX, 0, posZ);
      rackGroup.rotation.y = rotRad;
      rackGroup.updateMatrixWorld(true);

      // Compute actual lowest vertex Y and shift so cabinet base rests solidly on floor (Y = 0)
      const initBox = new THREE.Box3().setFromObject(rackGroup);
      if (isFinite(initBox.min.y)) {
        rackGroup.position.y = -initBox.min.y;
        rackGroup.updateMatrixWorld(true);
      }

      // 3D Floating Radial Gauge HUD (Power Consumption & Rack Load)
      const hudCanvas = this.createRackHUDGaugeCanvas(dcRack, rackDevices, rackData);
      const labelTex = new THREE.CanvasTexture(hudCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      const spriteMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      // Width 490mm in 3D world (25% reduction from 650mm), height proportional (1024x768 -> 367.5mm)
      const spriteW = 490;
      const spriteH = spriteW * (hudCanvas.height / hudCanvas.width);
      sprite.scale.set(spriteW, spriteH, 1);
      
      // Anchor sprite at bottom center (0.5, 0) so the bottom sits flush just above the rack top
      sprite.center.set(0.5, 0);
      const topY = (isFinite(initBox.max.y) ? initBox.max.y : totalHMm / 2) + 15;
      sprite.position.set(0, topY, 0);
      sprite.userData = { isDynamic: true, rackId: dcRack.id };
      rackGroup.add(sprite);

      this.threeScene!.add(rackGroup);

    });

    // Add selection highlight on selected rack
    this.update3DSelectionHighlight();

    // Adjust camera target to floor center ONLY on initial scene setup or floor change, never on rack click
    if (!this.hasInitialized3DTarget || this.lastRenderedFloorId !== floor.id) {
      const centerX = floorLenMm / 2;
      const centerZ = floorWidMm / 2;
      this.threeControls.target.set(centerX, 900, centerZ);
      this.threeControls.update();
      this.hasInitialized3DTarget = true;
    }

    this.lastRenderedFloorId = floor.id;
  }

  private createRackHUDGaugeCanvas(dcRack: DcRack, rackDevices: DeviceData[], _rackData: RackData): HTMLCanvasElement {
    const W = 1024;
    const H = 768;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 1. Calculations for Real-time Power & Space Load
    let totalWatts = 0;
    let occupiedU = 0;
    const totalU = dcRack.heightU || 42;

    rackDevices.forEach(d => {
      const template = getTemplate(d.templateId);
      const isPdu = template?.category === 'pdu' || d.templateId?.includes('pdu');
      if (!isPdu) {
        totalWatts += getDevicePowerWatts(d);
        if (template?.mountType !== 'side' && !d.sideMountPosition) {
          occupiedU += (template?.heightUnits ?? 1);
        }
      }
    });

    const maxKw = dcRack.maxPowerKw && dcRack.maxPowerKw > 0 ? dcRack.maxPowerKw : 20;
    const powerKw = totalWatts / 1000;
    const loadPercent = Math.min(100, Math.round((occupiedU / totalU) * 1000) / 10);
    // Scale for power: 0KW to maxKw (user-defined max power load, default 20kW)
    const powerRatio = Math.max(0, Math.min(1, powerKw / maxKw));
    const loadRatio = Math.max(0, Math.min(1, loadPercent / 100));

    // 2. Top Header Banner with Rack Name & Info (Transparent backdrop + smart text accommodation)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Rack Name with shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(dcRack.name.toUpperCase(), W / 2, 38);
    ctx.restore();

    // Subtitle banner with smart width fitting and dark pill backing
    const subtext = `${dcRack.heightU}U Cabinet  •  Pos: (${dcRack.position.x.toFixed(1)}m, ${dcRack.position.y.toFixed(1)}m)  •  ${rackDevices.length} Devices Mounted`;
    let subFontSize = 22;
    ctx.font = `600 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    while (ctx.measureText(subtext).width > W - 100 && subFontSize > 14) {
      subFontSize -= 1;
      ctx.font = `600 ${subFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    }
    const subMetrics = ctx.measureText(subtext);
    const pillW = Math.min(W - 40, subMetrics.width + 40);
    const pillH = subFontSize + 16;
    ctx.fillStyle = 'rgba(11, 20, 29, 0.85)';
    ctx.strokeStyle = '#303e4b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect((W - pillW) / 2, 82 - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(subtext, W / 2, 82);

    // 3. Geometry Setup: Center Origin (512, 680)
    const Cx = 512;
    const Cy = 680;

    // Helper to draw a semi-annular arc between angle PI (180deg, Left) and 0 (0deg, Right)
    const drawHalfArc = (rOuter: number, rInner: number, startA: number, endA: number) => {
      ctx.beginPath();
      ctx.arc(Cx, Cy, rOuter, startA, endA, true); // counterclockwise from startA to endA
      ctx.lineTo(Cx + rInner * Math.cos(endA), Cy - rInner * Math.sin(endA));
      ctx.arc(Cx, Cy, rInner, endA, startA, false); // clockwise back to startA
      ctx.closePath();
    };

    // ── A. OUTER GLASS BEZEL (R: 485 -> 438) ──
    const bezelGrad = ctx.createLinearGradient(0, Cy - 485, 0, Cy);
    bezelGrad.addColorStop(0, 'rgba(140, 152, 163, 0.40)');
    bezelGrad.addColorStop(0.35, 'rgba(102, 114, 126, 0.25)');
    bezelGrad.addColorStop(1, 'rgba(45, 57, 68, 0.25)');

    ctx.fillStyle = bezelGrad;
    ctx.strokeStyle = '#7e8994';
    ctx.lineWidth = 2;
    drawHalfArc(485, 438, 0, Math.PI);
    ctx.fill();
    ctx.stroke();

    // ── B. OUTER RACK LOAD ARC (R: 450 -> 380) ──
    // Dark track background
    ctx.fillStyle = '#29333d';
    ctx.strokeStyle = '#48535e';
    ctx.lineWidth = 2;
    drawHalfArc(450, 380, 0, Math.PI);
    ctx.fill();
    ctx.stroke();

    // Rack Load Gradient Fill (0% Green -> 50% Yellow -> 100% Red)
    const rackGrad = ctx.createLinearGradient(Cx - 450, 0, Cx + 450, 0);
    rackGrad.addColorStop(0.00, '#19e875');
    rackGrad.addColorStop(0.30, '#5df05c');
    rackGrad.addColorStop(0.50, '#ffd21a');
    rackGrad.addColorStop(0.72, '#ff7a1a');
    rackGrad.addColorStop(1.00, '#ff1538');

    ctx.fillStyle = rackGrad;
    drawHalfArc(450, 380, 0, Math.PI);
    ctx.fill();

    // Inner edge of Rack arc (R: 380 -> 350)
    ctx.fillStyle = '#252f39';
    ctx.strokeStyle = '#52606b';
    ctx.lineWidth = 2;
    drawHalfArc(380, 350, 0, Math.PI);
    ctx.fill();
    ctx.stroke();

    // ── C. INNER POWER ARC (R: 330 -> 282) ──
    // Dark track background
    ctx.fillStyle = '#111b24';
    ctx.strokeStyle = '#303e4b';
    ctx.lineWidth = 2;
    drawHalfArc(330, 282, 0, Math.PI);
    ctx.fill();
    ctx.stroke();

    // Power Gradient Fill (0KW Green -> 10KW Yellow -> 20KW Red)
    const powerGrad = ctx.createLinearGradient(Cx - 330, 0, Cx + 330, 0);
    powerGrad.addColorStop(0.00, '#18e85f');
    powerGrad.addColorStop(0.30, '#8bf21e');
    powerGrad.addColorStop(0.50, '#ffd21a');
    powerGrad.addColorStop(0.75, '#ff7419');
    powerGrad.addColorStop(1.00, '#ff1739');

    ctx.fillStyle = powerGrad;
    drawHalfArc(330, 282, 0, Math.PI);
    ctx.fill();

    // Inner glass edge of power arc (R: 282 -> 265)
    ctx.fillStyle = 'rgba(18, 29, 38, 0.65)';
    drawHalfArc(282, 265, 0, Math.PI);
    ctx.fill();

    // ── D. SCALE TICKS & LABELS ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. Rack Load Ticks (0% to 100%, 11 steps of 10% - font size 30px)
    ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
    for (let i = 0; i <= 10; i++) {
      const frac = i / 10;
      const angle = Math.PI * (1 - frac);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Tick mark line (R=450 to R=424)
      const x1 = Cx + 450 * cosA;
      const y1 = Cy - 450 * sinA;
      const x2 = Cx + 424 * cosA;
      const y2 = Cy - 424 * sinA;

      ctx.strokeStyle = '#f5f7fa';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Label at R = 492
      const lx = Cx + 492 * cosA;
      const ly = Cy - 492 * sinA + (i === 0 || i === 10 ? 14 : 0);
      ctx.fillStyle = '#f1f4f7';
      ctx.fillText(`${i * 10}%`, lx, ly);
    }

    // 2. Power Ticks (0 to maxKw, 11 steps - font size 25px)
    ctx.font = 'bold 25px Arial, Helvetica, sans-serif';
    for (let i = 0; i <= 10; i++) {
      const frac = i / 10;
      const angle = Math.PI * (1 - frac);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Tick mark line (R=330 to R=307)
      const x1 = Cx + 330 * cosA;
      const y1 = Cy - 330 * sinA;
      const x2 = Cx + 307 * cosA;
      const y2 = Cy - 307 * sinA;

      ctx.strokeStyle = '#f5f7fa';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Label at R = 358
      const lx = Cx + 358 * cosA;
      const ly = Cy - 358 * sinA + (i === 0 || i === 10 ? 10 : 0);
      ctx.fillStyle = '#f1f4f7';
      const tickVal = Math.round(frac * maxKw * 10) / 10;
      const tickLabel = tickVal % 1 === 0 ? `${tickVal}K` : `${tickVal.toFixed(1)}K`;
      ctx.fillText(tickLabel, lx, ly);
    }

    // ── E. SECTION TITLES (Dedicated non-overlapping badges) ──

    // 1. RACK LOAD Badge (Placed at y = 132 above the outer arc)
    const rlText = 'RACK LOAD';
    ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
    const rlw = ctx.measureText(rlText).width + 32;
    ctx.fillStyle = 'rgba(11, 20, 29, 0.90)';
    ctx.strokeStyle = '#48535e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(Cx - rlw / 2, 118, rlw, 28, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#63ee55';
    ctx.fillText(rlText, Cx, 132);

    // 2. POWER Badge (Placed at y = 425 above the digital panel)
    const pwText = `POWER (${maxKw}kW MAX)`;
    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
    const pww = ctx.measureText(pwText).width + 32;
    ctx.fillStyle = 'rgba(11, 20, 29, 0.90)';
    ctx.strokeStyle = '#303e4b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(Cx - pww / 2, 411, pww, 28, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(pwText, Cx, 425);

    // ── F. MATHEMATICALLY ACCURATE NEEDLES ──

    // 1. Rack Load Needle (Purple / Violet glowing pointer pointing to Outer Arc)
    const thetaLoad = Math.PI * (1 - loadRatio);
    const loadNeedleLen = 430;
    const lTipX = Cx + loadNeedleLen * Math.cos(thetaLoad);
    const lTipY = Cy - loadNeedleLen * Math.sin(thetaLoad);

    ctx.save();
    ctx.shadowColor = '#c58cff';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#c58cff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(lTipX, lTipY);
    ctx.stroke();

    ctx.strokeStyle = '#e0bdff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(lTipX, lTipY);
    ctx.stroke();
    ctx.restore();

    // 2. Power Needle (Metallic Silver/White pointer pointing to Inner Arc)
    const thetaPower = Math.PI * (1 - powerRatio);
    const pwrNeedleLen = 315;
    const pTipX = Cx + pwrNeedleLen * Math.cos(thetaPower);
    const pTipY = Cy - pwrNeedleLen * Math.sin(thetaPower);

    ctx.save();
    ctx.shadowColor = 'rgba(219, 229, 238, 0.7)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#dbe5ee';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(pTipX, pTipY);
    ctx.stroke();
    ctx.restore();

    // Center Hub Pointer Diamond
    ctx.fillStyle = '#e7eef4';
    ctx.beginPath();
    ctx.moveTo(Cx, Cy - 25);
    ctx.lineTo(Cx + 8, Cy);
    ctx.lineTo(Cx, Cy + 20);
    ctx.lineTo(Cx - 8, Cy);
    ctx.closePath();
    ctx.fill();

    // Center Pivot Hub Circle (R = 20)
    ctx.fillStyle = '#17212b';
    ctx.strokeStyle = '#aebbc8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(Cx, Cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center Hub Dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(Cx, Cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // ── G. CENTER DIGITAL INFORMATION PANEL ──
    const pw = 380;
    const ph = 160;
    const px = Cx - pw / 2;
    const py = 465;

    ctx.fillStyle = 'rgba(11, 20, 29, 0.92)';
    ctx.strokeStyle = '#2b3945';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.stroke();

    // Divider line
    ctx.strokeStyle = '#52606b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 20, py + 80);
    ctx.lineTo(px + pw - 20, py + 80);
    ctx.stroke();

    // Upper Section: Power (Label 22px, Value 52px)
    ctx.fillStyle = '#b9c5cf';
    ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
    ctx.fillText('POWER', Cx, py + 26);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
    ctx.fillText(`${powerKw.toFixed(1)}KW`, Cx, py + 62);

    // Lower Section: Rack Load (Label 22px, Value 52px)
    ctx.fillStyle = '#b9c5cf';
    ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
    ctx.fillText('RACK LOAD', Cx, py + 106);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
    ctx.fillText(`${loadPercent.toFixed(1)}%`, Cx, py + 142);

    // ── H. STATUS READOUT (Bottom Center) ──
    let statusText = 'OK / OPTIMAL';
    let statusColor = '#63ee55';
    if (loadPercent >= 90 || powerKw >= maxKw * 0.9) {
      statusText = 'CRITICAL / OVERLOAD';
      statusColor = '#ff1538';
    } else if (loadPercent >= 75 || powerKw >= maxKw * 0.75) {
      statusText = 'WARNING / HIGH LOAD';
      statusColor = '#ffd21a';
    }

    // Status background pill
    ctx.fillStyle = 'rgba(11, 20, 29, 0.90)';
    ctx.strokeStyle = '#2b3945';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(300, 680, 424, 60, 18);
    ctx.fill();
    ctx.stroke();

    // Status circular badge at (345, 710)
    ctx.save();
    ctx.strokeStyle = statusColor === '#63ee55' ? '#f6bf16' : statusColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(345, 710, 18, -Math.PI * 0.7, Math.PI * 0.8);
    ctx.stroke();

    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(345, 710, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
    ctx.fillText('Total Rack Status', 380, 699);

    ctx.fillStyle = statusColor;
    ctx.font = 'bold 26px Arial, Helvetica, sans-serif';
    ctx.fillText(statusText, 380, 726);

    return canvas;
  }


  private update3DSelectionHighlight() {
    if (!this.threeScene) return;
    const s = dcState.getState();
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    this.threeScene.traverse(child => {
      if (child.name === 'selection-highlight') {
        child.parent?.remove(child);
      }
    });

    if (s.selectedRackId) {
      const rack = floor.racks.find(r => r.id === s.selectedRackId);
      if (rack) {
        this.threeScene.traverse(child => {
          if (child.userData?.rackId === rack.id && child instanceof THREE.Group) {
            child.updateMatrixWorld(true);
            const rackBox = new THREE.Box3().setFromObject(child);
            const boxSize = new THREE.Vector3();
            const boxCenter = new THREE.Vector3();
            rackBox.getSize(boxSize);
            rackBox.getCenter(boxCenter);

            const selBoxGeo = new THREE.BoxGeometry(
              Math.max(boxSize.x + 16, 20),
              Math.max(boxSize.y + 10, 20),
              Math.max(boxSize.z + 16, 20)
            );
            const selEdges = new THREE.EdgesGeometry(selBoxGeo);
            const selLine = new THREE.LineSegments(
              selEdges,
              new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
            );
            selLine.name = 'selection-highlight';
            selLine.userData = { isDynamic: true };
            selLine.position.copy(boxCenter);
            this.threeScene!.add(selLine);
          }
        });
      }
    }
  }

  private set3DCameraPreset(preset: 'iso' | 'top' | 'front') {
    if (!this.threeCamera || !this.threeControls) return;
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const floorLenMm = floor.lengthM * 1000;
    const floorWidMm = floor.widthM * 1000;
    const cx = floorLenMm / 2;
    const cz = floorWidMm / 2;
    const maxDim = Math.max(floorLenMm, floorWidMm, 6000);

    this.threeControls.target.set(cx, 900, cz);

    if (preset === 'iso') {
      this.threeCamera.position.set(cx + maxDim * 0.95, maxDim * 0.85, cz + maxDim * 0.95);
    } else if (preset === 'top') {
      this.threeCamera.position.set(cx, maxDim * 1.4, cz + 10);
    } else if (preset === 'front') {
      this.threeCamera.position.set(cx, 1200, cz + maxDim * 1.2);
    }
    this.threeControls.update();
  }

  private zoom3D(factor: number) {
    if (!this.threeCamera || !this.threeControls) return;
    const dir = this.threeCamera.position.clone().sub(this.threeControls.target);
    this.threeCamera.position.copy(this.threeControls.target).addScaledVector(dir, factor);
    this.threeControls.update();
  }

  private render3D() {
    const floor = dcState.getActiveFloor();
    const wrap3d = this.container.querySelector('#dc-3d-container') as HTMLElement;
    if (!wrap3d) return;
    const is3D = dcState.getState().viewMode === '3d';
    wrap3d.classList.toggle('hidden', !is3D);
    this.canvas.classList.toggle('hidden', is3D);
    if (!is3D || !floor) return;

    let viewportEl = wrap3d.querySelector('#dc3d-viewport') as HTMLElement;
    if (!viewportEl) {
      wrap3d.innerHTML = `
        <div class="dc3d-controls">
          <span class="dc3d-ctrl-label">3D Real-Rack Data Hall</span>
          <button class="dc-btn dc-btn-sm" id="dc3d-preset-iso" title="Isometric 3D Perspective">Isometric</button>
          <button class="dc-btn dc-btn-sm" id="dc3d-preset-top" title="Top-Down Plan View">Top View</button>
          <button class="dc-btn dc-btn-sm" id="dc3d-preset-front" title="Front Elevation View">Front View</button>
          <div class="dc-divider"></div>
          <button class="dc-btn dc-btn-sm" id="dc3d-btn-xray" title="Toggle Under-Floor Infrastructure X-Ray Mode">🦴 X-Ray</button>
          <div class="dc-slider-control" title="Adjust Raised Floor Surface Opacity (0% - 100%)">
            <span>Floor:</span>
            <input type="range" id="dc3d-floor-opacity" class="dc-slider" min="0" max="100" value="${Math.round((dcState.getState().floorOpacity ?? 1) * 100)}" />
          </div>
          <div class="dc-divider"></div>
          <button class="dc-btn dc-btn-sm" id="dc3d-zoomin" title="Zoom In (+)">＋</button>
          <button class="dc-btn dc-btn-sm" id="dc3d-zoomout" title="Zoom Out (-)">－</button>
          <button class="dc-btn dc-btn-sm" id="dc3d-reset-cam" title="Reset View (Z)">Reset (Z)</button>
        </div>
        <div class="dc3d-viewport-inner" id="dc3d-viewport"></div>
        <div class="dc3d-label">3D Data Hall — ${floor.name} (${formatDimensionsMeters(floor.lengthM, floor.widthM, floor.unit ?? 'm')})</div>
      `;

      wrap3d.querySelector('#dc3d-preset-iso')?.addEventListener('click', () => this.set3DCameraPreset('iso'));
      wrap3d.querySelector('#dc3d-preset-top')?.addEventListener('click', () => this.set3DCameraPreset('top'));
      wrap3d.querySelector('#dc3d-preset-front')?.addEventListener('click', () => this.set3DCameraPreset('front'));
      wrap3d.querySelector('#dc3d-reset-cam')?.addEventListener('click', () => this.set3DCameraPreset('iso'));
      wrap3d.querySelector('#dc3d-btn-xray')?.addEventListener('click', () => this.toggleXrayMode());
      wrap3d.querySelector('#dc3d-floor-opacity')?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
        this.setFloorOpacity(val);
      });
      wrap3d.querySelector('#dc3d-zoomin')?.addEventListener('click', () => this.zoom3D(0.8));
      wrap3d.querySelector('#dc3d-zoomout')?.addEventListener('click', () => this.zoom3D(1.25));

      viewportEl = wrap3d.querySelector('#dc3d-viewport') as HTMLElement;
    } else {
      const labelEl = wrap3d.querySelector('.dc3d-label');
      if (labelEl) {
        labelEl.textContent = `3D Data Hall — ${floor.name} (${formatDimensionsMeters(floor.lengthM, floor.widthM, floor.unit ?? 'm')})`;
      }
    }

    const isInitial = !this.threeRenderer;
    this.initThree3D(wrap3d, floor);
    if (isInitial) {
      this.set3DCameraPreset('iso');
    }
  }
}
