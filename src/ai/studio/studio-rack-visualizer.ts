/**
 * RackSlicer AI Studio — Real-Time Rack Visualizer
 *
 * Provides real-time dynamic blank-to-topup rack visualization:
 * - 2D Elevation: Pure SVG using Rack Builder's native vector rendering (renderRack + renderDevice)
 * - 3D View: Interactive Three.js WebGL viewport with OrbitControls & camera presets
 * - Topology View: Cluster leaf/spine networking and storage interconnect graph
 * - Cables View: Color-coded port-to-port cable run map
 * - Power View: Dual A/B PDU electrical distribution schematic
 */

import * as THREE from 'three';
import { MaterialManager } from '../../three/MaterialManager';
import { SceneManager, type DoorState } from '../../three/SceneManager';
import { CameraManager, CameraPreset } from '../../three/CameraManager';
import { renderRack } from '../../renderers/rack-renderer';
import { renderDevice } from '../../renderers/device-renderer';
import { RackData, DeviceData, RACK_CONSTANTS } from '../../core/types';
import { getTemplate } from '../../library/device-catalog';
import { stateManager } from '../../core/state';
import { eventBus } from '../../core/event-bus';
import { AIWorkflowOrchestrator } from '../workflow/workflow-orchestrator';
import { RackPlacementItem } from '../workflow/types';

export type StudioViewMode = '2d' | '3d' | 'topology' | 'cables' | 'power';

export class StudioRackVisualizer {
  private container: HTMLElement | null = null;
  private currentMode: StudioViewMode = '2d';

  // 3D Three.js subsystem
  private threeContainer: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private sceneManager: SceneManager | null = null;
  private cameraManager: CameraManager | null = null;
  private materials: MaterialManager | null = null;
  private animId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // 3D Door Controls state
  private frontDoorState: DoorState = 'closed';
  private rearDoorState: DoorState = 'closed';
  private doorControlsWrap: HTMLElement | null = null;

  // 2D Viewport Pan & Zoom state
  private zoom2D: number = 1.0;
  private pan2D: { x: number; y: number } = { x: 0, y: 0 };
  private isDragging2D: boolean = false;
  private dragStart2D: { x: number; y: number } = { x: 0, y: 0 };
  private baseViewBox2D: { minX: number; minY: number; totalW: number; totalH: number } = {
    minX: 0,
    minY: 0,
    totalW: 500,
    totalH: 1400,
  };
  private current2DSvg: SVGSVGElement | null = null;
  private zoomBadge2D: HTMLElement | null = null;
  private onWindowMouseMove: ((e: MouseEvent) => void) | null = null;
  private onWindowMouseUp: ((e: MouseEvent) => void) | null = null;

  constructor() {
    eventBus.on('view:zoom-in', () => {
      if (this.currentMode === '2d') this.zoomIn2D();
    });
    eventBus.on('view:zoom-out', () => {
      if (this.currentMode === '2d') this.zoomOut2D();
    });
    eventBus.on('view:zoom-fit', () => {
      if (this.currentMode === '2d') this.resetZoom2D();
    });
  }

  public zoomIn2D(): void {
    if (!this.current2DSvg) return;
    const rect = this.current2DSvg.getBoundingClientRect();
    this.applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
  }

  public zoomOut2D(): void {
    if (!this.current2DSvg) return;
    const rect = this.current2DSvg.getBoundingClientRect();
    this.applyZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
  }

  public resetZoom2D(): void {
    this.zoom2D = 1.0;
    this.pan2D = { x: 0, y: 0 };
    this.update2DTransform();
  }

  public getZoom2D(): number {
    return this.zoom2D;
  }

  public setZoom2D(zoom: number, pan?: { x: number; y: number }): void {
    this.zoom2D = Math.max(0.5, Math.min(8.0, zoom));
    if (pan) {
      this.pan2D = { ...pan };
    }
    this.update2DTransform();
  }

  private applyZoomAt(clientX: number, clientY: number, factor: number): void {
    if (!this.current2DSvg) return;
    const rect = this.current2DSvg.getBoundingClientRect();

    // Cursor position normalized to SVG element [0..1] (fallback to center if no layout in jsdom)
    const rx = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0.5;
    const ry = rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.5;

    const oldZoom = this.zoom2D;
    const newZoom = Math.max(0.5, Math.min(8.0, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    // Current visible viewBox world dimensions
    const curW = this.baseViewBox2D.totalW / oldZoom;
    const curH = this.baseViewBox2D.totalH / oldZoom;
    const curX = this.baseViewBox2D.minX + this.pan2D.x;
    const curY = this.baseViewBox2D.minY + this.pan2D.y;

    // World coordinate under cursor
    const worldX = curX + rx * curW;
    const worldY = curY + ry * curH;

    // New visible viewBox world dimensions
    const newW = this.baseViewBox2D.totalW / newZoom;
    const newH = this.baseViewBox2D.totalH / newZoom;

    // Keep world coordinate pinned under cursor
    const newX = worldX - rx * newW;
    const newY = worldY - ry * newH;

    this.zoom2D = newZoom;
    this.pan2D.x = newX - this.baseViewBox2D.minX;
    this.pan2D.y = newY - this.baseViewBox2D.minY;

    this.update2DTransform();
  }

  private update2DTransform(): void {
    if (!this.current2DSvg) return;
    const curW = this.baseViewBox2D.totalW / this.zoom2D;
    const curH = this.baseViewBox2D.totalH / this.zoom2D;
    const curX = this.baseViewBox2D.minX + this.pan2D.x;
    const curY = this.baseViewBox2D.minY + this.pan2D.y;

    this.current2DSvg.setAttribute('viewBox', `${curX} ${curY} ${curW} ${curH}`);
    this.current2DSvg.style.cursor = this.zoom2D > 1.05 ? (this.isDragging2D ? 'grabbing' : 'grab') : 'default';

    if (this.zoomBadge2D) {
      this.zoomBadge2D.textContent = `${Math.round(this.zoom2D * 100)}%`;
      this.zoomBadge2D.classList.toggle('active-zoom', Math.abs(this.zoom2D - 1.0) > 0.05);
    }
  }

  private cleanup2DListeners(): void {
    if (this.onWindowMouseMove) {
      window.removeEventListener('mousemove', this.onWindowMouseMove);
      this.onWindowMouseMove = null;
    }
    if (this.onWindowMouseUp) {
      window.removeEventListener('mouseup', this.onWindowMouseUp);
      this.onWindowMouseUp = null;
    }
    this.isDragging2D = false;
  }

  public setFrontDoorState(state: DoorState): void {
    this.frontDoorState = state;
    if (this.sceneManager) {
      this.sceneManager.setFrontDoorState(state);
    }
    this.updateDoorControlsUI();
  }

  public getFrontDoorState(): DoorState {
    return this.frontDoorState;
  }

  public setRearDoorState(state: DoorState): void {
    this.rearDoorState = state;
    if (this.sceneManager) {
      this.sceneManager.setRearDoorState(state);
    }
    this.updateDoorControlsUI();
  }

  public getRearDoorState(): DoorState {
    return this.rearDoorState;
  }

  public toggleFrontDoorOpen(): void {
    const next = this.frontDoorState === 'open' ? 'closed' : 'open';
    this.setFrontDoorState(next);
  }

  public toggleFrontDoorEnable(): void {
    const next = this.frontDoorState === 'removed' ? 'closed' : 'removed';
    this.setFrontDoorState(next);
  }

  public mount(container: HTMLElement): void {
    this.container = container;
  }

  public render(orchestrator: AIWorkflowOrchestrator, mode: StudioViewMode): void {
    this.currentMode = mode;
    if (!this.container) return;

    const stage = orchestrator.getState().currentStage;
    const isBlank = stage === 'REQUIREMENT_PROMPT' || stage === 'REQUIREMENT_BRIEF';
    const cab = orchestrator.getCabinetConfig();
    const placements = isBlank ? [] : orchestrator.getRackPlacements();

    // ── Vertical PDU Configuration (From Asset Catalog) ──────────────────────
    const leftPduTemplateId = cab.leftPduTemplateId || 'vpdu-apc-ap8858';
    const rightPduTemplateId = cab.rightPduTemplateId || 'vpdu-apc-ap8858';
    const leftPduTemplate = getTemplate(leftPduTemplateId);
    const rightPduTemplate = getTemplate(rightPduTemplateId);

    const hasLeftPdu = !isBlank && leftPduTemplateId !== 'none' && !!leftPduTemplate;
    const hasRightPdu = !isBlank && rightPduTemplateId !== 'none' && !!rightPduTemplate;

    const leftPduDevice: DeviceData | null = hasLeftPdu
      ? {
          id: 'ai-studio-pdu-left',
          name: leftPduTemplate?.name || 'Feed A Vertical PDU',
          rackId: 'ai-studio-rack-01',
          templateId: leftPduTemplateId,
          startUnit: 0,
          hostname: 'pdu-a.dc01.lan',
          managementIp: '10.0.99.2',
          serialNumber: 'SN-VPDU-A-1001',
          description: 'Feed A Vertical PDU (A-Side)',
          ports: (leftPduTemplate?.ports || []).map((pt, pIdx) => ({
            ...pt,
            id: `outlet-ai-pdu-left-${pIdx}`,
            deviceId: 'ai-studio-pdu-left',
            connected: false,
            cableId: null,
          })),
          sideMountPosition: 'left',
        }
      : null;

    const rightPduDevice: DeviceData | null = hasRightPdu
      ? {
          id: 'ai-studio-pdu-right',
          name: rightPduTemplate?.name || 'Feed B Vertical PDU',
          rackId: 'ai-studio-rack-01',
          templateId: rightPduTemplateId,
          startUnit: 0,
          hostname: 'pdu-b.dc01.lan',
          managementIp: '10.0.99.3',
          serialNumber: 'SN-VPDU-B-1002',
          description: 'Feed B Vertical PDU (B-Side)',
          ports: (rightPduTemplate?.ports || []).map((pt, pIdx) => ({
            ...pt,
            id: `outlet-ai-pdu-right-${pIdx}`,
            deviceId: 'ai-studio-pdu-right',
            connected: false,
            cableId: null,
          })),
          sideMountPosition: 'right',
        }
      : null;

    const req = orchestrator.getState().requirement;
    const isDualRack = (req?.rackCount || 1) >= 2;

    const rackData: RackData = {
      id: 'ai-studio-rack-01',
      name: isDualRack ? 'DC01-CAB-01 (Rack A)' : (cab.name || 'DC01-CAB-01'),
      units: cab.totalU || 42,
      x: 0,
      y: 0,
      rackColor: '#16161a',
      frontDoor: 'perforated',
      leftCableManagerWidth: cab.leftCableManagerWidth || '4-inch',
      rightCableManagerWidth: cab.rightCableManagerWidth || '4-inch',
      vcmType: cab.vcmType || 'single-sided',
      leftPduId: hasLeftPdu ? leftPduDevice!.id : undefined,
      rightPduId: hasRightPdu ? rightPduDevice!.id : undefined,
      showPduLeft: true,
      showPduRight: true,
    };

    const rackDataB: RackData | null = isDualRack
      ? {
          id: 'ai-studio-rack-02',
          name: 'DC01-CAB-02 (Rack B)',
          units: cab.totalU || 42,
          x: 450,
          y: 0,
          rackColor: '#16161a',
          frontDoor: 'perforated',
          leftCableManagerWidth: cab.leftCableManagerWidth || '4-inch',
          rightCableManagerWidth: cab.rightCableManagerWidth || '4-inch',
          vcmType: cab.vcmType || 'single-sided',
          leftPduId: hasLeftPdu ? 'ai-studio-pdu-left-r2' : undefined,
          rightPduId: hasRightPdu ? 'ai-studio-pdu-right-r2' : undefined,
          showPduLeft: true,
          showPduRight: true,
        }
      : null;

    const computePlacements = placements.filter(p => p.category === 'Compute');
    const halfCompute = Math.ceil(computePlacements.length / 2);
    let cCount = 0;
    let sCount = 0;

    const devices: DeviceData[] = placements.map((p, idx) => {
      const templateId = this.getTemplateIdForPlacement(p);
      const tmpl = getTemplate(templateId);
      const devId = p.id || `dev-${idx}`;

      let targetRackId = rackData.id;
      if (isDualRack) {
        if (p.category === 'Network') {
          targetRackId = sCount === 0 ? rackData.id : rackDataB!.id;
          sCount++;
        } else if (p.category === 'Compute') {
          targetRackId = cCount >= halfCompute ? rackDataB!.id : rackData.id;
          cCount++;
        }
      }

      return {
        id: devId,
        name: isDualRack && p.category === 'Compute' ? `${p.name} (${targetRackId === rackData.id ? 'Rack A' : 'Rack B'})` : p.name,
        rackId: targetRackId,
        templateId,
        startUnit: p.startU,
        color: p.action === 'Reserve' ? '#78350f' : undefined,
        hostname: `${p.category.toLowerCase()}-${idx + 1}.dc01.lan`,
        managementIp: `10.0.99.${10 + idx}`,
        serialNumber: `SN-${p.category.substring(0, 3).toUpperCase()}-${1000 + idx}`,
        description: p.name,
        ports: (tmpl?.ports || []).map((portTmpl, pIdx) => ({
          ...portTmpl,
          id: `${devId}-port-${pIdx}`,
          deviceId: devId,
          connected: false,
          cableId: null,
        })),
      };
    });

    const allDevicesForScene: DeviceData[] = [...devices];
    if (leftPduDevice) allDevicesForScene.push(leftPduDevice);
    if (rightPduDevice) allDevicesForScene.push(rightPduDevice);

    const allRacks = isDualRack ? [rackData, rackDataB!] : [rackData];

    // Sync stateManager so SceneManager, rack-builder, and renderRack find all side-mount PDUs and racks
    stateManager.setState({
      racks: allRacks,
      devices: isBlank ? [] : allDevicesForScene,
    });

    if (mode === '3d') {
      this.render3D(rackData, allDevicesForScene, isBlank);
    } else {
      this.teardown3D();
      switch (mode) {
        case '2d':
          this.render2D(rackData, devices, isBlank, allDevicesForScene);
          break;
        case 'topology':
          this.renderTopology(orchestrator, isBlank);
          break;
        case 'cables':
          this.renderCables(orchestrator, isBlank);
          break;
        case 'power':
          this.renderPower(orchestrator, isBlank);
          break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2D Elevation View (Exact Rack Builder Graphics Quality)
  // ──────────────────────────────────────────────────────────────────────────

  private render2D(
    rackData: RackData,
    devices: DeviceData[],
    isBlank: boolean,
    allDevices: DeviceData[]
  ): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.cleanup2DListeners();

    // Calculate dynamic bounding box to include 0U Vertical PDUs and Vertical Cable Managers
    const getVcmWidthPx = (w?: string): number => {
      switch (w) {
        case '2-inch': return 16;
        case '4-inch': return 26;
        case '6-inch': return 40;
        case '8-inch': return 54;
        default: return 26;
      }
    };
    const showLeft = rackData.leftCableManagerWidth !== undefined && rackData.leftCableManagerWidth !== 'none';
    const showRight = rackData.rightCableManagerWidth !== undefined && rackData.rightCableManagerWidth !== 'none';
    const leftVcmWidth = showLeft ? getVcmWidthPx(rackData.leftCableManagerWidth) : 0;
    const rightVcmWidth = showRight ? getVcmWidthPx(rackData.rightCableManagerWidth) : 0;

    const leftPduDevice = rackData.leftPduId ? allDevices.find(d => d.id === rackData.leftPduId) : null;
    const rightPduDevice = rackData.rightPduId ? allDevices.find(d => d.id === rackData.rightPduId) : null;
    const leftPduTemplate = leftPduDevice ? getTemplate(leftPduDevice.templateId) : null;
    const rightPduTemplate = rightPduDevice ? getTemplate(rightPduDevice.templateId) : null;
    const leftPduW = leftPduTemplate?.pduWidth ?? 44;
    const rightPduW = rightPduTemplate?.pduWidth ?? 44;

    const hasLeftPdu = !!(leftPduDevice && leftPduTemplate);
    const hasRightPdu = !!(rightPduDevice && rightPduTemplate);

    const leftPduX = hasLeftPdu ? (-leftPduW - 4) : 0;
    const leftDuctX = showLeft ? (hasLeftPdu ? (-leftPduW - 4 - leftVcmWidth - 4) : (-leftVcmWidth - 4)) : 0;
    const minLeftX = Math.min(0, hasLeftPdu ? leftPduX : 0, showLeft ? leftDuctX : 0);

    const rightPduX = RACK_CONSTANTS.RACK_OUTER_WIDTH + 4;
    const rightDuctX = showRight ? (hasRightPdu ? (RACK_CONSTANTS.RACK_OUTER_WIDTH + rightPduW + 8) : (RACK_CONSTANTS.RACK_OUTER_WIDTH + 4)) : RACK_CONSTANTS.RACK_OUTER_WIDTH;
    const maxRightX = Math.max(
      RACK_CONSTANTS.RACK_OUTER_WIDTH,
      hasRightPdu ? (rightPduX + rightPduW) : RACK_CONSTANTS.RACK_OUTER_WIDTH,
      showRight ? (rightDuctX + rightVcmWidth) : RACK_CONSTANTS.RACK_OUTER_WIDTH
    );

    const minX = Math.floor(minLeftX - 16);
    const maxX = Math.ceil(maxRightX + 16);
    const totalW = maxX - minX;

    const H =
      RACK_CONSTANTS.RACK_PADDING_TOP +
      rackData.units * RACK_CONSTANTS.RU_HEIGHT +
      RACK_CONSTANTS.RACK_PADDING_BOTTOM;

    this.baseViewBox2D = {
      minX,
      minY: 0,
      totalW,
      totalH: H,
    };

    const wrap = document.createElement('div');
    wrap.className = 'studio-2d-viewport';
    this.container.appendChild(wrap);

    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.style.maxHeight = '390px';
    svgEl.style.display = 'block';
    svgEl.style.margin = '0 auto';
    svgEl.style.filter = 'drop-shadow(0 10px 25px rgba(0,0,0,0.5))';

    const parentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    svgEl.appendChild(parentGroup);

    // Native Rack Builder frame with side-mounted 0U PDUs and Vertical Cable Managers
    renderRack(rackData, parentGroup, { cabinetViewMode: 'front', cabinetDrawMode: 'default', devices: allDevices });

    // Render loaded RU devices (empty if blank)
    if (!isBlank && devices.length > 0) {
      devices.forEach((d) => {
        parentGroup.appendChild(
          renderDevice(d, rackData.x, rackData.y, rackData.units, {
            cabinetViewMode: 'front',
            cabinetDrawMode: 'default',
          })
        );
      });
    }

    wrap.appendChild(svgEl);
    this.current2DSvg = svgEl;

    // Floating 2D Zoom Control Toolbar
    const zoomControls = document.createElement('div');
    zoomControls.className = 'studio-2d-zoom-controls';
    zoomControls.innerHTML = `
      <button class="btn-2d-zoom btn-2d-zoom-in" data-action="zoom-in" title="Zoom In (+)">＋</button>
      <button class="studio-2d-zoom-badge" data-action="zoom-reset" title="Click to Reset (100%)">${Math.round(this.zoom2D * 100)}%</button>
      <button class="btn-2d-zoom btn-2d-zoom-out" data-action="zoom-out" title="Zoom Out (−)">－</button>
      <button class="btn-2d-zoom btn-2d-fit" data-action="zoom-fit" title="Fit to View">⤢ Fit</button>
    `;
    wrap.appendChild(zoomControls);
    this.zoomBadge2D = zoomControls.querySelector('.studio-2d-zoom-badge');

    zoomControls.querySelector('.btn-2d-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomIn2D();
    });
    zoomControls.querySelector('.btn-2d-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomOut2D();
    });
    zoomControls.querySelector('.studio-2d-zoom-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetZoom2D();
    });
    zoomControls.querySelector('.btn-2d-fit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetZoom2D();
    });

    // Apply current zoom/pan transform to viewBox
    this.update2DTransform();

    // Mouse wheel zoom focused on cursor
    wrap.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
      this.applyZoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    // Drag-to-pan
    wrap.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as HTMLElement).closest('.studio-2d-zoom-controls')) return;
      this.isDragging2D = true;
      this.dragStart2D = { x: e.clientX, y: e.clientY };
      if (this.current2DSvg) this.current2DSvg.style.cursor = 'grabbing';
      e.preventDefault();
    });

    this.onWindowMouseMove = (e: MouseEvent) => {
      if (!this.isDragging2D || !this.current2DSvg) return;
      const dx = e.clientX - this.dragStart2D.x;
      const dy = e.clientY - this.dragStart2D.y;
      this.dragStart2D = { x: e.clientX, y: e.clientY };

      const rect = this.current2DSvg.getBoundingClientRect();
      const curW = this.baseViewBox2D.totalW / this.zoom2D;
      const curH = this.baseViewBox2D.totalH / this.zoom2D;
      const scaleX = curW / (rect.width || 1);
      const scaleY = curH / (rect.height || 1);

      this.pan2D.x -= dx * scaleX;
      this.pan2D.y -= dy * scaleY;
      this.update2DTransform();
    };

    this.onWindowMouseUp = () => {
      if (this.isDragging2D) {
        this.isDragging2D = false;
        if (this.current2DSvg) {
          this.current2DSvg.style.cursor = this.zoom2D > 1.05 ? 'grab' : 'default';
        }
      }
    };

    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);

    // Double-click to reset zoom
    wrap.addEventListener('dblclick', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.studio-2d-zoom-controls')) return;
      this.resetZoom2D();
    });

    // If blank state, display a clean status badge
    if (isBlank) {
      const blankOverlay = document.createElement('div');
      blankOverlay.className = 'studio-blank-rack-tag';
      blankOverlay.innerHTML = `
        <div style="font-weight:700; color:#38bdf8; margin-bottom:2px;">EMPTY ${rackData.units}U CHASSIS</div>
        <div style="font-size:10px; color:#94a3b8;">Awaiting input — resources will populate dynamically</div>
      `;
      wrap.appendChild(blankOverlay);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3D Three.js View (Interactive Orbit, Zoom & Camera Angle Presets)
  // ──────────────────────────────────────────────────────────────────────────

  private render3D(rackData: RackData, devices: DeviceData[], isBlank: boolean): void {
    if (!this.container) return;

    if (!this.renderer || !this.threeContainer) {
      this.container.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.width = '100%';
      wrap.style.height = '100%';
      wrap.style.minHeight = '390px';
      wrap.style.overflow = 'hidden';
      this.container.appendChild(wrap);

      this.threeContainer = wrap;

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      wrap.appendChild(this.renderer.domElement);

      this.materials = new MaterialManager();
      this.sceneManager = new SceneManager(this.materials);
      this.cameraManager = new CameraManager(this.renderer);

      // Camera preset floating controls (Front, Rear, Left, Right, Top)
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'studio-3d-cam-controls';
      controlsDiv.innerHTML = `
        <button class="btn-3d-cam active" data-preset="front">Front</button>
        <button class="btn-3d-cam" data-preset="rear">Rear</button>
        <button class="btn-3d-cam" data-preset="left">Left</button>
        <button class="btn-3d-cam" data-preset="right">Right</button>
        <button class="btn-3d-cam" data-preset="top">Top</button>
      `;
      wrap.appendChild(controlsDiv);

      controlsDiv.querySelectorAll('.btn-3d-cam').forEach((btn) => {
        btn.addEventListener('click', () => {
          controlsDiv.querySelectorAll('.btn-3d-cam').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const preset = btn.getAttribute('data-preset') as CameraPreset;
          if (preset && this.cameraManager) {
            this.cameraManager.setPreset(preset);
          }
        });
      });

      // Floating Door Controls (Open / Close / Enable or Disable)
      const doorControlsDiv = document.createElement('div');
      doorControlsDiv.className = 'studio-3d-door-controls';
      wrap.appendChild(doorControlsDiv);
      this.doorControlsWrap = doorControlsDiv;

      this.resizeObserver = new ResizeObserver(() => this.on3DResize());
      this.resizeObserver.observe(wrap);

      this.animate3D();
    }

    // Refresh door controls with latest rack configuration
    if (this.doorControlsWrap) {
      this.renderDoorControlsUI(rackData);
    }

    // Update 3D scene geometry
    const totalH =
      RACK_CONSTANTS.RACK_PADDING_TOP +
      rackData.units * RACK_CONSTANTS.RU_HEIGHT +
      RACK_CONSTANTS.RACK_PADDING_BOTTOM;

    if (this.cameraManager) {
      this.cameraManager.setTarget(225, totalH / 2, 0);
    }

    if (this.sceneManager) {
      this.sceneManager.rebuild({
        racks: [rackData],
        devices: isBlank ? [] : devices,
        cables: [],
      } as any);
      // Preserve door states across rebuilds
      this.sceneManager.setFrontDoorState(this.frontDoorState);
      this.sceneManager.setRearDoorState(this.rearDoorState);
    }

    this.on3DResize();
  }

  private renderDoorControlsUI(rackData?: RackData): void {
    if (!this.doorControlsWrap) return;
    const hasRearDoor = rackData?.doorOpening === 'front-rear';

    this.doorControlsWrap.innerHTML = `
      <div class="studio-3d-door-row">
        <span class="studio-3d-pill-title">DOOR:</span>
        <span class="studio-3d-door-badge ${this.frontDoorState === 'removed' ? 'badge-disabled' : 'badge-active'} studio-door-badge-front">${this.frontDoorState === 'removed' ? 'DISABLED' : this.frontDoorState.toUpperCase()}</span>
      </div>
      <div class="studio-3d-btn-group front-door-group">
        <button class="btn-3d-door btn-3d-door-front ${this.frontDoorState === 'open' ? 'active' : ''}" data-state="open" title="Open Front Door (Swung Wide)">
          <span class="icon">🔓</span> Open
        </button>
        <button class="btn-3d-door btn-3d-door-front ${this.frontDoorState === 'closed' ? 'active' : ''}" data-state="closed" title="Close Front Door">
          <span class="icon">🔒</span> Closed
        </button>
        <button class="btn-3d-door btn-door-toggle ${this.frontDoorState === 'removed' ? 'active-disabled' : ''}" title="Enable or Disable Door Visibility">
          <span class="icon">${this.frontDoorState === 'removed' ? '👁️' : '🚫'}</span> ${this.frontDoorState === 'removed' ? 'Enable' : 'Disable'}
        </button>
      </div>
      ${hasRearDoor ? `
        <div class="studio-3d-door-row" style="margin-top:6px;">
          <span class="studio-3d-pill-title">REAR DOOR:</span>
          <span class="studio-3d-door-badge ${this.rearDoorState === 'removed' ? 'badge-disabled' : 'badge-active'} studio-door-badge-rear">${this.rearDoorState === 'removed' ? 'DISABLED' : this.rearDoorState.toUpperCase()}</span>
        </div>
        <div class="studio-3d-btn-group rear-door-group">
          <button class="btn-3d-door btn-3d-door-rear ${this.rearDoorState === 'open' ? 'active' : ''}" data-state="open" title="Open Rear Door">
            <span class="icon">🔓</span> Open
          </button>
          <button class="btn-3d-door btn-3d-door-rear ${this.rearDoorState === 'closed' ? 'active' : ''}" data-state="closed" title="Close Rear Door">
            <span class="icon">🔒</span> Closed
          </button>
          <button class="btn-3d-door btn-door-toggle-rear ${this.rearDoorState === 'removed' ? 'active-disabled' : ''}" title="Enable or Disable Rear Door">
            <span class="icon">${this.rearDoorState === 'removed' ? '👁️' : '🚫'}</span> ${this.rearDoorState === 'removed' ? 'Enable' : 'Disable'}
          </button>
        </div>
      ` : ''}
    `;

    // Bind front door buttons
    const frontOpenBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.front-door-group [data-state="open"]');
    frontOpenBtn?.addEventListener('click', () => this.setFrontDoorState('open'));

    const frontClosedBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.front-door-group [data-state="closed"]');
    frontClosedBtn?.addEventListener('click', () => this.setFrontDoorState('closed'));

    const frontToggleBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.btn-door-toggle');
    frontToggleBtn?.addEventListener('click', () => {
      const next = this.frontDoorState === 'removed' ? 'closed' : 'removed';
      this.setFrontDoorState(next);
    });

    // Bind rear door buttons if present
    if (hasRearDoor) {
      const rearOpenBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.rear-door-group [data-state="open"]');
      rearOpenBtn?.addEventListener('click', () => this.setRearDoorState('open'));

      const rearClosedBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.rear-door-group [data-state="closed"]');
      rearClosedBtn?.addEventListener('click', () => this.setRearDoorState('closed'));

      const rearToggleBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.btn-door-toggle-rear');
      rearToggleBtn?.addEventListener('click', () => {
        const next = this.rearDoorState === 'removed' ? 'closed' : 'removed';
        this.setRearDoorState(next);
      });
    }
  }

  private updateDoorControlsUI(): void {
    if (!this.doorControlsWrap) return;

    // Update front door badge
    const frontBadge = this.doorControlsWrap.querySelector('.studio-door-badge-front') as HTMLElement | null;
    if (frontBadge) {
      if (this.frontDoorState === 'removed') {
        frontBadge.textContent = 'DISABLED';
        frontBadge.className = 'studio-3d-door-badge badge-disabled studio-door-badge-front';
      } else {
        frontBadge.textContent = this.frontDoorState.toUpperCase();
        frontBadge.className = 'studio-3d-door-badge badge-active studio-door-badge-front';
      }
    }

    // Update front door buttons
    const frontButtons = this.doorControlsWrap.querySelectorAll<HTMLButtonElement>('.btn-3d-door-front');
    frontButtons.forEach((btn) => {
      const state = btn.getAttribute('data-state') as DoorState;
      if (state === this.frontDoorState) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const frontToggleBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.btn-door-toggle');
    if (frontToggleBtn) {
      if (this.frontDoorState === 'removed') {
        frontToggleBtn.innerHTML = '<span class="icon">👁️</span> Enable';
        frontToggleBtn.title = 'Enable Door visibility';
        frontToggleBtn.classList.add('active-disabled');
      } else {
        frontToggleBtn.innerHTML = '<span class="icon">🚫</span> Disable';
        frontToggleBtn.title = 'Disable/Hide Door to view interior directly';
        frontToggleBtn.classList.remove('active-disabled');
      }
    }

    // Update rear door badge
    const rearBadge = this.doorControlsWrap.querySelector('.studio-door-badge-rear') as HTMLElement | null;
    if (rearBadge) {
      if (this.rearDoorState === 'removed') {
        rearBadge.textContent = 'DISABLED';
        rearBadge.className = 'studio-3d-door-badge badge-disabled studio-door-badge-rear';
      } else {
        rearBadge.textContent = this.rearDoorState.toUpperCase();
        rearBadge.className = 'studio-3d-door-badge badge-active studio-door-badge-rear';
      }
    }

    const rearButtons = this.doorControlsWrap.querySelectorAll<HTMLButtonElement>('.btn-3d-door-rear');
    rearButtons.forEach((btn) => {
      const state = btn.getAttribute('data-state') as DoorState;
      if (state === this.rearDoorState) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const rearToggleBtn = this.doorControlsWrap.querySelector<HTMLButtonElement>('.btn-door-toggle-rear');
    if (rearToggleBtn) {
      if (this.rearDoorState === 'removed') {
        rearToggleBtn.innerHTML = '<span class="icon">👁️</span> Enable';
        rearToggleBtn.title = 'Enable Rear Door visibility';
        rearToggleBtn.classList.add('active-disabled');
      } else {
        rearToggleBtn.innerHTML = '<span class="icon">🚫</span> Disable';
        rearToggleBtn.title = 'Disable/Hide Rear Door';
        rearToggleBtn.classList.remove('active-disabled');
      }
    }
  }

  private animate3D = (): void => {
    if (!this.renderer || !this.sceneManager || !this.cameraManager) return;
    this.animId = requestAnimationFrame(this.animate3D);
    this.sceneManager.tick(performance.now() / 1000);
    this.cameraManager.update();
    this.renderer.render(this.sceneManager.scene, this.cameraManager.camera);
  };

  private on3DResize(): void {
    if (!this.threeContainer || !this.renderer || !this.cameraManager) return;
    const { width, height } = this.threeContainer.getBoundingClientRect();
    const w = Math.max(width, 100);
    const h = Math.max(height, 200);
    this.renderer.setSize(w, h);
    this.cameraManager.camera.aspect = w / h;
    this.cameraManager.camera.updateProjectionMatrix();
  }

  private teardown3D(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.cameraManager) {
      this.cameraManager.dispose();
      this.cameraManager = null;
    }
    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    if (this.materials) {
      this.materials.dispose();
      this.materials = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.doorControlsWrap = null;
    this.threeContainer = null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Topology View (Spine/Leaf, Cluster Interconnect & Storage Fabric)
  // ──────────────────────────────────────────────────────────────────────────

  private renderTopology(orchestrator: AIWorkflowOrchestrator, isBlank: boolean): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (isBlank) {
      this.container.innerHTML = `
        <div style="height:380px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; gap:8px;">
          <div style="font-size:32px;">🌐</div>
          <div style="font-weight:700; color:#38bdf8;">Network Topology Awaiting Specification</div>
          <div style="font-size:11px;">Complete Stage 01 to generate spine/leaf network graph</div>
        </div>
      `;
      return;
    }

    const req = orchestrator.getState().requirement;
    const nodeCount = req.nodeCount || 2;

    this.container.innerHTML = `
      <div style="height:380px; width:100%; padding:14px; overflow-y:auto; box-sizing:border-box; color:#cbd5e1; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #1e293b; padding-bottom:6px;">
          <strong style="color:#38bdf8;">🌐 SPINE / LEAF NETWORK TOPOLOGY</strong>
          <span style="font-size:10px; background:#065f46; color:#a7f3d0; padding:2px 6px; border-radius:4px; font-weight:700;">Zero-SPOF MLAG</span>
        </div>

        <!-- ToR Switches -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div style="background:#0f172a; border:1px solid #3b82f6; border-radius:6px; padding:8px; text-align:center;">
            <div style="font-weight:700; color:#93c5fd;">ToR-A: 25GbE Switch</div>
            <div style="font-size:9.5px; color:#64748b;">Primary Data & VM Fabric</div>
          </div>
          <div style="background:#0f172a; border:1px solid #3b82f6; border-radius:6px; padding:8px; text-align:center;">
            <div style="font-weight:700; color:#93c5fd;">ToR-B: 25GbE Switch</div>
            <div style="font-size:9.5px; color:#64748b;">Redundant Sync & Cluster</div>
          </div>
        </div>

        <div style="text-align:center; font-size:10px; color:#38bdf8; margin:-6px 0 8px;">
          ⇅ 100GbE MLAG Inter-Switch Link (Dual DAC Active-Active)
        </div>

        <!-- Compute Nodes -->
        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px;">
          ${Array.from({ length: nodeCount })
            .map(
              (_, i) => `
            <div style="background:#090d16; border:1px solid #1e293b; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; color:#f8fafc;">Host Node ${i + 1}</span>
              <span style="font-size:10px; color:#10b981;">Dual 25G LACP Bond (eth0/eth1)</span>
              <span style="font-size:9.5px; color:#f59e0b;">iDRAC OOB (VLAN 99)</span>
            </div>
          `
            )
            .join('')}
        </div>

        <!-- Shared Storage -->
        <div style="background:#172554; border:1px solid #60a5fa; border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#bfdbfe;">Storage Tier: Enterprise NVMe / SAN</div>
            <div style="font-size:9.5px; color:#93c5fd;">Dedicated Storage Pool Interconnects</div>
          </div>
          <span style="font-size:10px; background:#1e40af; color:#dbeafe; padding:2px 6px; border-radius:4px; font-weight:700;">Sub-ms Latency</span>
        </div>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cables View (Physical Port Mapping & Harness Verification)
  // ──────────────────────────────────────────────────────────────────────────

  private renderCables(orchestrator: AIWorkflowOrchestrator, isBlank: boolean): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (isBlank) {
      this.container.innerHTML = `
        <div style="height:380px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; gap:8px;">
          <div style="font-size:32px;">🔌</div>
          <div style="font-weight:700; color:#38bdf8;">Cable Runs Awaiting Allocation</div>
          <div style="font-size:11px;">Complete Stage 01 to view physical patch cable runs</div>
        </div>
      `;
      return;
    }

    const routes = orchestrator.getCableRoutes();

    this.container.innerHTML = `
      <div style="height:380px; width:100%; padding:14px; overflow-y:auto; box-sizing:border-box; color:#cbd5e1; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #1e293b; padding-bottom:6px;">
          <strong style="color:#38bdf8;">🔌 PHYSICAL CABLE RUN HARNESS (${routes.length} RUNS)</strong>
          <span style="font-size:10px; color:#10b981; font-weight:700;">✓ All Intra-Rack &lt; 2.5m</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px;">
          ${routes
            .map(
              (r) => `
            <div style="background:#090d16; border:1px solid #1e293b; border-radius:5px; padding:6px 8px; display:flex; align-items:center; justify-content:space-between; font-size:10.5px;">
              <span style="color:#f8fafc; font-weight:600;">${r.source}</span>
              <span style="color:#64748b;">⟶</span>
              <span style="color:#f8fafc; font-weight:600;">${r.dest}</span>
              <span style="display:flex; align-items:center; gap:4px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${r.color};"></span>
                <span style="font-size:9.5px; color:#94a3b8;">${r.length}</span>
              </span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Power View (A/B Feed Distribution Schematic)
  // ──────────────────────────────────────────────────────────────────────────

  private renderPower(orchestrator: AIWorkflowOrchestrator, isBlank: boolean): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (isBlank) {
      this.container.innerHTML = `
        <div style="height:380px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; gap:8px;">
          <div style="font-size:32px;">⚡</div>
          <div style="font-weight:700; color:#38bdf8;">Electrical Feeds Awaiting Allocation</div>
          <div style="font-size:11px;">Complete Stage 01 to view dual A/B power distribution</div>
        </div>
      `;
      return;
    }

    const pwr = orchestrator.getPowerThermalConfig();
    const bomTotals = orchestrator.getBomTotals();
    const itWatts = bomTotals.totalWatts > 0 ? bomTotals.totalWatts : 1720;
    const pduCapacity = Math.round(pwr.voltage * pwr.breakerAmps);
    const isSingle = pwr.feedType === 'Single Feed';
    const feedAWatts = isSingle ? itWatts : Math.round(itWatts * 0.5);
    const feedBWatts = isSingle ? 0 : Math.round(itWatts * 0.5);
    const utilA = Math.round((feedAWatts / pduCapacity) * 100);
    const utilB = isSingle ? 0 : Math.round((feedBWatts / pduCapacity) * 100);

    this.container.innerHTML = `
      <div style="height:380px; width:100%; padding:14px; overflow-y:auto; box-sizing:border-box; color:#cbd5e1; font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #1e293b; padding-bottom:6px;">
          <strong style="color:#38bdf8;">⚡ ELECTRICAL INFRASTRUCTURE (${pwr.feedType})</strong>
          <span style="font-size:10px; color:#10b981; font-weight:700;">${pwr.breakerAmps}A @ ${pwr.voltage}V</span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <!-- Feed A -->
          <div style="background:#090d16; border:1px solid #086cff; border-radius:6px; padding:10px;">
            <div style="font-weight:700; color:#38bdf8;">FEED A (PDU-A)</div>
            <div style="font-size:16px; font-weight:800; color:#f8fafc; margin:4px 0;">${utilA}% Load</div>
            <div style="font-size:10px; color:#94a3b8;">${feedAWatts} W / ${pduCapacity} W</div>
            <div style="height:5px; background:#1e293b; border-radius:3px; margin-top:6px; overflow:hidden;">
              <div style="height:100%; width:${Math.min(100, utilA)}%; background:#086cff;"></div>
            </div>
          </div>

          <!-- Feed B -->
          <div style="background:#090d16; border:1px solid ${isSingle ? '#64748b' : '#10b981'}; border-radius:6px; padding:10px;">
            <div style="font-weight:700; color:${isSingle ? '#94a3b8' : '#34d399'};">FEED B (PDU-B)</div>
            ${
              isSingle
                ? `
              <div style="font-size:14px; font-weight:700; color:#94a3b8; margin:4px 0;">None</div>
              <div style="font-size:10px; color:#f59e0b;">Single Feed: SPOF</div>
            `
                : `
              <div style="font-size:16px; font-weight:800; color:#f8fafc; margin:4px 0;">${utilB}% Load</div>
              <div style="font-size:10px; color:#94a3b8;">${feedBWatts} W / ${pduCapacity} W</div>
              <div style="height:5px; background:#1e293b; border-radius:3px; margin-top:6px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(100, utilB)}%; background:#10b981;"></div>
              </div>
            `
            }
          </div>
        </div>

        <div style="background:#0f172a; border:1px solid #1e293b; border-radius:6px; padding:8px 10px; font-size:10.5px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:#94a3b8;">Redundant Load Failover Headroom:</span>
            <strong style="color:#10b981;">${Math.round((itWatts / pduCapacity) * 100)}% Max Safe Load</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#94a3b8;">Continuous Threshold:</span>
            <strong style="color:#cbd5e1;">${pwr.continuousLoadPercent}% Rating</strong>
          </div>
        </div>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Device Catalog Matching Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private getTemplateIdForPlacement(p: RackPlacementItem): string {
    if (p.category === 'Network') {
      return 'sw-1u-tor-25g-100g';
    }
    if (p.category === 'Storage') {
      return 'storage-2u-allflash-nvme';
    }
    if (p.category === 'Passive') {
      return 'brush-panel-1u';
    }
    if (p.category === 'Compute') {
      if (p.heightU === 1) return 'server-1u-nvme';
      if (p.heightU === 4) return 'server-4u-ai-gpu';
      return 'server-2u-enterprise';
    }
    if (p.category === 'Power' || p.category === 'Power Distribution') {
      return 'pdu-1u-monitored-10p';
    }
    return p.heightU === 1 ? 'server-1u' : 'server-2u';
  }

  public destroy(): void {
    this.teardown3D();
    this.cleanup2DListeners();
    this.container = null;
    this.current2DSvg = null;
    this.zoomBadge2D = null;
  }
}
