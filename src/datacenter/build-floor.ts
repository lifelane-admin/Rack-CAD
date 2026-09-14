import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MaterialManager } from '../three/MaterialManager';
import { buildRackGroup } from '../three/rack-builder';
import { dcState, getRowLabel, getColLabel } from './dc-state';
import { DcFloor, DcRack, DcUnit, DcRackType, DcDoorStyle, DcMounting, DcSpacingStandard, DcAddressFormat, DcFloorTile, DcAirflowDirection, DcInfrastructureItem, DcInfraCategory, DcGaugeStyle, DcSpaceType, DcEquipmentCategory, DcRacewayFittingType, DcRacewayJunctionNode, DcWallSegment, DcWallItem, DcWallItemType, DcWallSide } from './types';
import { RACK_PRESETS, SPACING_STANDARDS, RackPreset, SpacingStandardInfo } from './standards';
import { DATACENTER_CATALOG, CATEGORY_DEFINITIONS, WALL_EQUIPMENT_CATALOG, CatalogItemPreset, WallItemCatalogPreset } from './catalog';
import { solveRacewayTopology, getRacewayTheme, getTruncatedInfraSegments } from './raceway-topology';
import { createElbowMesh, createTeeMesh, createCrossMesh, createCouplingMesh } from './raceway-geometry';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import { RackData, RACK_CONSTANTS, DeviceData, DeviceTemplate, CableData } from '../core/types';
import { downloadFile, sanitizeAndRepairDevicesAndCables } from '../utils/export';
import { buildDeviceMesh } from '../three/device-builder';
import { buildCableMesh } from '../three/cable-builder';
import { getDevicePowerWatts, getRackPowerCapacityWatts } from '../utils/power';

import { getTemplate } from '../library/device-catalog';
import { ALL_DC_COMPONENTS, DcComponentItem } from '../components/dc-component-graphics';

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
  private activeLeftTab: 'catalog' | 'info' = 'catalog';
  private catalogSearchQuery: string = '';
  private openCatalogFolders: Set<string> = new Set([
    'architecture',
    'wall-equipment',
    'housing',
    'compute',
    'storage',
    'network',
    'power-distribution',
    'cooling',
    'backup-generation',
    'containment',
  ]);

  // Drag threshold to prevent unintended pan/drag resets on simple clicks
  private pendingPan = false;
  private pendingDragRack = false;
  private mouseDownClientPos = { x: 0, y: 0 };
  private readonly DRAG_THRESHOLD_PX = 6;

  // Snap Gap Indicators during dragging
  private snapGapInfo: { x1: number; y1: number; x2: number; y2: number; label: string } | null = null;
  private strictGridOnly = false; // When true, movements lock strictly to whole tile boundaries only
  private isMovingPlacementMode = false; // Active move mode from context menu, props, or hotkey

  // Interactive Pathway Drawing Tool Mode (Ducts, Trays, Fiber Raceways, Busways)
  private activePathwayTool: {
    comp?: DcComponentItem;
    name: string;
    layer: 'underfloor' | 'overhead';
    elevationMm: number;
    widthMm: number;
    heightMm: number;
    category: DcInfraCategory;
    color: string;
    subtype: string;
    startPoint: { x: number; y: number } | null;
    currentPoint: { x: number; y: number } | null;
  } | null = null;

  // Interactive Equipment Placement Mode (Racks, PDUs, CRACs, UPS, Cameras, Sensors)
  private activePlacementTool: {
    comp?: DcComponentItem;
    presetId?: string;
    name: string;
    type: DcRackType;
    spaceType?: DcSpaceType;
    equipmentCategory?: DcEquipmentCategory;
    widthMm: number;
    depthMm: number;
    heightU: number;
    doorStyle: DcDoorStyle;
    mounting: DcMounting;
    color: string;
    maxPowerKw?: number;
    coolingCapacityKw?: number;
    upsCapacityKva?: number;
    pduVoltage?: '230V' | '415V' | '208V' | '120V';
    pduPhases?: 1 | 3;
    pduAmperage?: number;
    pduOutletCount?: number;
    busbarAmps?: number;
    transformerKva?: number;
    securityLock?: 'biometric' | 'rfid' | 'keypad' | 'keyed' | 'none';
    rotation: 0 | 90 | 180 | 270;
    previewPos: { x: number; y: number } | null;
  } | null = null;

  // Interactive Transparent Wall Laying Mode (Drag Coordinates)
  private activeWallTool: {
    name: string;
    opacity: number;
    heightM: number;
    thicknessMm: number;
    color: string;
    startPoint: { x: number; y: number } | null;
    currentPoint: { x: number; y: number } | null;
  } | null = null;

  // Interactive Wall-Mounted Equipment Placement Mode
  private activeWallItemPlacementTool: {
    preset: WallItemCatalogPreset;
    previewWallId: string | null;
    previewRatio: number;
  } | null = null;

  // Dragging existing wall start/end coordinates in 2D
  private isDraggingWallHandle: {
    wallId: string;
    handle: 'start' | 'end';
  } | null = null;

  public startLayingPathway(data: {
    comp?: DcComponentItem;
    name?: string;
    layer?: 'underfloor' | 'overhead';
    elevationMm?: number;
    widthMm?: number;
    heightMm?: number;
    category?: DcInfraCategory;
    color?: string;
    subtype?: string;
  }) {
    if (dcState.getState().viewMode === '3d') {
      this.setViewMode('2d');
    }

    const floor = dcState.getActiveFloor();
    const plenumDepthMm = floor?.raisedFloorHeightMm || 450;
    const isUF = (data.layer || data.comp?.pathwayLevel || 'underfloor') === 'underfloor';
    const layer = isUF ? 'underfloor' : 'overhead';
    const widthMm = data.widthMm || data.comp?.widthMm || 400;
    const heightMm = data.heightMm || 100;
    const defaultElev = isUF ? -(plenumDepthMm - heightMm / 2) : 2600;
    const elev = data.elevationMm !== undefined ? data.elevationMm : defaultElev;
    const cat: DcInfraCategory = data.category || (data.comp?.badgeType === 'fiber' ? 'fiber-raceway' : (data.comp?.id?.includes('bus') ? 'busway' : (data.comp?.id?.includes('duct') ? 'cable-duct' : 'cable-tray')));
    const color = data.color || (data.comp?.badgeType === 'fiber' ? '#eab308' : (isUF ? '#64748b' : '#38bdf8'));
    const name = data.name || data.comp?.name || 'Cable Duct Runway';
    const subtype = data.subtype || data.comp?.code || 'DUCT';

    this.activePlacementTool = null;
    this.activePathwayTool = {
      comp: data.comp,
      name,
      layer,
      elevationMm: elev,
      widthMm,
      heightMm,
      category: cat,
      color,
      subtype,
      startPoint: null,
      currentPoint: null,
    };

    this.canvas.style.cursor = 'crosshair';
    this.draw();

    eventBus.emit('dc:tool-started', {
      mode: 'lay-pathway',
      compName: name,
      icon: '⚡',
      layer,
      elevMm: elev,
    });

    eventBus.emit('notification', {
      message: `⚡ Laying Pathway: Click start tile, drag across floor to draw duct channel. [Esc] to exit.`,
      type: 'info',
    });
  }

  public startPlacingEquipment(data: { comp?: DcComponentItem; presetId?: string }) {
    if (dcState.getState().viewMode === '3d') {
      this.setViewMode('2d');
    }

    const comp = data.comp;
    const preset = data.presetId ? DATACENTER_CATALOG.find(p => p.id === data.presetId) : null;

    const name = preset?.name || comp?.name || 'Cabinet';
    const type: DcRackType = preset?.type || (comp?.category === 'power' ? 'power-rpp' : (comp?.category === 'cooling' ? 'inrow-cooling' : ((comp?.category as any) === 'ups' ? 'ups-cabinet' : 'server')));
    const widthMm = preset?.widthMm || comp?.widthMm || 600;
    const depthMm = preset?.depthMm || comp?.depthMm || 1000;
    const heightU = preset?.heightU || comp?.heightU || 42;
    const doorStyle: DcDoorStyle = preset?.doorStyle || (comp?.subCategory === 'twin_door' ? 'split-perforated' : (comp?.subCategory === 'glass_door' ? 'glass' : (comp?.subCategory === 'solid_door' ? 'solid' : 'perforated')));
    const mounting: DcMounting = preset?.mounting || 'floor';
    const color = preset?.color || (comp?.category === 'power' ? '#eab308' : (comp?.category === 'cooling' ? '#06b6d4' : '#1e293b'));

    this.activePathwayTool = null;
    this.activePlacementTool = {
      comp,
      presetId: data.presetId,
      name,
      type,
      spaceType: preset?.spaceType || (comp?.category === 'power' || comp?.category === 'cooling' ? 'grey-space' : 'white-space'),
      equipmentCategory: preset?.category,
      widthMm,
      depthMm,
      heightU,
      doorStyle,
      mounting,
      color,
      maxPowerKw: preset?.maxPowerKw || 20,
      coolingCapacityKw: preset?.coolingCapacityKw,
      upsCapacityKva: preset?.upsCapacityKva,
      pduVoltage: preset?.pduVoltage,
      pduPhases: preset?.pduPhases,
      pduAmperage: preset?.pduAmperage,
      pduOutletCount: preset?.pduOutletCount,
      busbarAmps: preset?.busbarAmps,
      transformerKva: preset?.transformerKva,
      securityLock: preset?.securityLock,
      rotation: 0,
      previewPos: null,
    };

    this.canvas.style.cursor = 'crosshair';
    this.draw();

    eventBus.emit('dc:tool-started', {
      mode: 'place-equipment',
      compName: name,
      icon: '📦',
    });

    eventBus.emit('notification', {
      message: `📦 Placing ${name}: Move cursor on floor grid, [R] to rotate 90°, Click to place. [Esc] to exit.`,
      type: 'info',
    });
  }

  public startLayingWall(data: {
    opacity?: number;
    heightM?: number;
    thicknessMm?: number;
    color?: string;
  } = {}) {
    if (dcState.getState().viewMode === '3d') {
      this.setViewMode('2d');
    }

    const opacity = data.opacity !== undefined ? data.opacity : 0.35;
    const heightM = data.heightM || 3.2;
    const thicknessMm = data.thicknessMm || 150;
    const color = data.color || '#38bdf8';

    this.activePathwayTool = null;
    this.activePlacementTool = null;
    this.activeWallItemPlacementTool = null;
    this.activeWallTool = {
      name: 'Custom Wall Partition',
      opacity,
      heightM,
      thicknessMm,
      color,
      startPoint: null,
      currentPoint: null,
    };

    this.canvas.style.cursor = 'crosshair';
    this.draw();

    eventBus.emit('dc:tool-started', {
      mode: 'lay-wall',
      name: 'Custom Wall Partition',
      icon: '🧱',
    });

    eventBus.emit('notification', {
      message: `🧱 Laying Wall: Click start coordinate, drag to end coordinate to create wall segment. [Esc] to cancel.`,
      type: 'info',
    });
  }

  public startPlacingWallItem(preset: WallItemCatalogPreset) {
    if (dcState.getState().viewMode === '3d') {
      this.setViewMode('2d');
    }
    this.activePathwayTool = null;
    this.activePlacementTool = null;
    this.activeWallTool = null;
    this.activeWallItemPlacementTool = {
      preset,
      previewWallId: null,
      previewRatio: 0.5,
    };
    this.canvas.style.cursor = 'crosshair';
    this.draw();

    eventBus.emit('notification', {
      message: `${preset.icon} Click on any perimeter or custom wall to attach ${preset.name}. [Esc] to cancel.`,
      type: 'info',
    });
  }

  public cancelActiveTools() {
    const hadTool = this.activePathwayTool !== null || this.activePlacementTool !== null || this.activeWallTool !== null || this.activeWallItemPlacementTool !== null;
    this.activePathwayTool = null;
    this.activePlacementTool = null;
    this.activeWallTool = null;
    this.activeWallItemPlacementTool = null;
    this.isDraggingWallHandle = null;
    this.canvas.style.cursor = this.toolMode === 'pan' ? 'grab' : 'crosshair';
    this.draw();
    if (hadTool) {
      eventBus.emit('dc:tool-ended', undefined);
      eventBus.emit('notification', { message: 'Placement / Drawing mode exited.', type: 'info' });
    }
  }

  private commitWall(start: { x: number; y: number }, end: { x: number; y: number }) {
    if (!this.activeWallTool) return;
    const lenM = Math.hypot(end.x - start.x, end.y - start.y);
    if (lenM < 0.2) return;

    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const id = 'wall-custom-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const wall: DcWallSegment = {
      id,
      name: `Custom Wall (${lenM.toFixed(1)}m)`,
      start: { x: parseFloat(start.x.toFixed(3)), y: parseFloat(start.y.toFixed(3)) },
      end: { x: parseFloat(end.x.toFixed(3)), y: parseFloat(end.y.toFixed(3)) },
      heightM: this.activeWallTool.heightM || 3.2,
      thicknessMm: this.activeWallTool.thicknessMm || 150,
      opacity: this.activeWallTool.opacity !== undefined ? this.activeWallTool.opacity : 0.35,
      color: this.activeWallTool.color || '#38bdf8',
      side: 'custom',
      items: [],
    };

    dcState.addWall(wall);
    dcState.setState({ selectedWallId: id, selectedWallItemId: null, selectedRackId: null, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
    const updatedFloor = dcState.getActiveFloor();
    if (updatedFloor) {
      this.rebuildThreeScene(updatedFloor);
    }
    this.renderPropsPanel();
    this.draw();

    eventBus.emit('notification', {
      message: `🧱 Built Wall Segment: ${lenM.toFixed(2)}m long (Opacity: ${Math.round(wall.opacity * 100)}%).`,
      type: 'info',
    });
  }

  private commitWallItemPlacement(wallId: string, ratio: number) {
    if (!this.activeWallItemPlacementTool) return;
    const preset = this.activeWallItemPlacementTool.preset;
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const wall = floor.walls?.find(w => w.id === wallId);
    if (!wall) return;

    const itemId = 'wallitem-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const item: DcWallItem = {
      id: itemId,
      wallId,
      type: preset.type,
      name: preset.name,
      positionRatio: Math.max(0.05, Math.min(0.95, parseFloat(ratio.toFixed(3)))),
      heightOffsetM: preset.defaultHeightOffsetM || 1.4,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      depthMm: preset.depthMm,
      side: 'inner',
      manufacturer: preset.manufacturer,
      model: preset.model,
      color: preset.color,
    };

    dcState.addWallItem(wallId, item);
    dcState.setState({ selectedWallId: wallId, selectedWallItemId: itemId, selectedRackId: null, selectedTileId: null, selectedInfraId: null });
    
    this.cancelActiveTools();
    const updatedFloor = dcState.getActiveFloor();
    if (updatedFloor) {
      this.rebuildThreeScene(updatedFloor);
    }
    this.renderPropsPanel();
    this.draw();

    eventBus.emit('notification', {
      message: `${preset.icon} Attached ${preset.name} to ${wall.name || 'Wall'} at ${(ratio * 100).toFixed(0)}% position.`,
      type: 'info',
    });
  }

  private createPathwaySegment(start: { x: number; y: number }, end: { x: number; y: number }): string | null {
    if (!this.activePathwayTool) return null;
    const tool = this.activePathwayTool;
    const lenM = Math.hypot(end.x - start.x, end.y - start.y);
    if (lenM < 0.08) return null;

    const id = 'INFRA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6);
    const item: DcInfrastructureItem = {
      id,
      name: tool.name,
      category: tool.category,
      layer: tool.layer,
      subtype: tool.subtype,
      start: { x: parseFloat(start.x.toFixed(3)), y: parseFloat(start.y.toFixed(3)), z: tool.elevationMm / 1000 },
      end: { x: parseFloat(end.x.toFixed(3)), y: parseFloat(end.y.toFixed(3)), z: tool.elevationMm / 1000 },
      widthMm: tool.widthMm,
      heightMm: tool.heightMm || 100,
      elevationMm: tool.elevationMm,
      color: tool.color,
    };
    dcState.addInfrastructureItem(item);
    return id;
  }

  private commitPathway(start: { x: number; y: number }, end: { x: number; y: number }) {
    if (!this.activePathwayTool) return;
    const tool = this.activePathwayTool;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const floor = dcState.getActiveFloor();
    const tileM = floor ? floor.tileSizeMm / 1000 : 0.6;
    const minLegM = Math.max(0.15, tileM / 4);

    let lastId: string | null = null;
    let totalLenM = 0;

    if (dx >= minLegM && dy >= minLegM) {
      // Orthogonal L-Route with automatic 90° corner fitting: Leg 1 along X, Leg 2 along Y
      const corner = { x: end.x, y: start.y };
      const id1 = this.createPathwaySegment(start, corner);
      const id2 = this.createPathwaySegment(corner, end);
      lastId = id2 || id1;
      totalLenM = dx + dy;
    } else if (dx >= minLegM) {
      // Pure horizontal X-axis segment
      const straightEnd = { x: end.x, y: start.y };
      lastId = this.createPathwaySegment(start, straightEnd);
      totalLenM = dx;
    } else if (dy >= minLegM) {
      // Pure vertical Y-axis segment
      const straightEnd = { x: start.x, y: end.y };
      lastId = this.createPathwaySegment(start, straightEnd);
      totalLenM = dy;
    } else {
      lastId = this.createPathwaySegment(start, end);
      totalLenM = Math.hypot(end.x - start.x, end.y - start.y);
    }

    if (lastId) {
      dcState.setState({ selectedInfraId: lastId, selectedRackId: null, selectedTileId: null, selectedTileIds: [] });
      this.refresh();
      eventBus.emit('notification', {
        message: `⚡ Routed ${tool.name} (${totalLenM.toFixed(2)}m) with automatic fitting assembly. Continuous routing active.`,
        type: 'success',
      });
    }
  }

  private commitPlacement() {
    if (!this.activePlacementTool || !this.activePlacementTool.previewPos) return;
    const floor = dcState.getActiveFloor();
    if (!floor) return;
    const tool = this.activePlacementTool;
    const pos = tool.previewPos;
    if (!pos) return;
    const rot = tool.rotation;

    const count = (floor.racks.length || 0) + 1;
    const prefix = (tool.comp?.code || tool.name.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 8)).toUpperCase();
    const newRackId = `${prefix}-${String(count).padStart(3, '0')}`;

    const newRack: DcRack = {
      id: newRackId,
      name: `${tool.name.split('(')[0].trim()} ${count}`,
      type: tool.type,
      spaceType: tool.spaceType,
      equipmentCategory: tool.equipmentCategory,
      widthMm: tool.widthMm,
      depthMm: tool.depthMm,
      heightU: tool.heightU,
      doorStyle: tool.doorStyle,
      mounting: tool.mounting,
      manufacturer: tool.comp?.name ? 'Antigravity Data Center Systems' : undefined,
      model: tool.comp?.code || undefined,
      position: { x: parseFloat(pos.x.toFixed(3)), y: parseFloat(pos.y.toFixed(3)), z: 0 },
      rotation: rot,
      color: tool.color,
      maxPowerKw: tool.maxPowerKw,
      coolingCapacityKw: tool.coolingCapacityKw,
      upsCapacityKva: tool.upsCapacityKva,
      pduVoltage: tool.pduVoltage,
      pduPhases: tool.pduPhases,
      pduAmperage: tool.pduAmperage,
      pduOutletCount: tool.pduOutletCount,
      busbarAmps: tool.busbarAmps,
      transformerKva: tool.transformerKva,
      securityLock: tool.securityLock,
    };

    if (dcState.isOverlapping(newRack)) {
      eventBus.emit('notification', { message: 'Warning: Placed equipment overlaps an existing rack or boundary.', type: 'warning' });
    }

    dcState.addRack(newRack);
    dcState.setState({ selectedRackId: newRack.id, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
    this.refresh();

    const tileM = floor.tileSizeMm / 1000;
    const colIdx = Math.floor(pos.x / tileM);
    const rowIdx = Math.floor(pos.y / tileM);
    const rowLabel = getRowLabel(rowIdx, floor.rowScheme ?? 'letters');
    const colLabel = getColLabel(colIdx, floor.colScheme ?? 'numbers', floor.addressFormat ?? 'compact');
    const gridAddr = `${rowLabel}-${colLabel}`;

    eventBus.emit('notification', {
      message: `Placed ${tool.name} at Grid Tile ${gridAddr}.`,
      type: 'success',
    });
  }

  private getFrontCenterScreen(sx: number, sy: number, pw: number, ph: number, rot: number) {
    if (rot === 0) return { x: sx + pw / 2, y: sy + ph };
    if (rot === 90) return { x: sx, y: sy + ph / 2 };
    if (rot === 180) return { x: sx + pw / 2, y: sy };
    return { x: sx + pw, y: sy + ph / 2 };
  }

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
            <button class="dc-btn" id="dc-btn-addrow" title="Add Row of Racks (International Standard Spacing)">▤ Add Row</button>
            <button class="dc-btn dc-btn-primary dc-btn-structure" id="dc-btn-addwall-topbar" title="Add / Configure Transparent Walls (Perimeter & Partitions, Hotkey: W)">🧱 ＋ Wall</button>
            <button class="dc-btn dc-btn-primary dc-btn-structure" id="dc-btn-addroof-topbar" title="Add / Configure Transparent Carpet-Area Roof (Hotkey: Shift+R)">🏠 ＋ Roof</button>
            <div class="dc-divider"></div>
            <!-- Mode switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-tool-select" title="Select Tool (Hotkey: S)">↖ Select (S)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-tool-pan" title="Move/Pan Tool (Hotkey: M)">✋ Move (M)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-tool-wall" title="Lay Custom Transparent Wall (Click & Drag Coordinates, Hotkey: W)">🧱 Lay Wall (W)</button>
            <button class="dc-btn dc-btn-secondary" id="dc-btn-perimeter-walls" title="Configure Transparent Perimeter Walls (North, South, East, West)">🏛 Perimeter Walls</button>
            <div class="dc-divider"></div>
            <!-- View switch -->
            <button class="dc-btn dc-btn-icon active" id="dc-btn-2d" title="2D Top View">2D (Top View)</button>
            <button class="dc-btn dc-btn-icon" id="dc-btn-3d" title="3D Isometric View">3D (Isometric)</button>
            <div class="dc-divider"></div>
            <!-- Floor, Wall & Roof Transparency & Visibility Controls -->
            <button class="dc-btn dc-btn-icon" id="dc-btn-xray" title="Toggle Under-Floor Infrastructure X-Ray Mode">🦴 X-Ray</button>
            <button class="dc-btn dc-btn-icon active" id="dc-btn-toggle-walls" title="Show / Hide All Walls (Hotkey: Shift+W)">🧱 Walls</button>
            <button class="dc-btn dc-btn-icon active" id="dc-btn-toggle-roof" title="Show / Hide Transparent Carpet-Area Roof (Hotkey: Shift+R)">🏠 Roof</button>
            <button class="dc-btn dc-btn-secondary" id="dc-btn-roof-settings" title="Configure Transparent Roof Height, Opacity & Trusses">🏠 Roof Settings</button>
            <div class="dc-slider-control" title="Adjust Raised Floor Surface Opacity (0% - 100%)">
              <span>Floor:</span>
              <input type="range" id="dc-floor-opacity" class="dc-slider" min="0" max="100" value="100" />
            </div>
            <div class="dc-slider-control" title="Adjust Transparent Wall Opacity (0% - 100%)">
              <span>Walls:</span>
              <input type="range" id="dc-wall-opacity" class="dc-slider" min="0" max="100" value="35" />
            </div>
            <div class="dc-slider-control" title="Adjust Transparent Roof Opacity (0% - 100%)">
              <span>Roof:</span>
              <input type="range" id="dc-roof-opacity" class="dc-slider" min="0" max="100" value="30" />
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
              <div class="dc-tabs-nav">
                <button class="dc-tab-nav-btn active" id="dc-tab-btn-catalog" title="Equipment Catalog Palette">📦 Equipment</button>
                <button class="dc-tab-nav-btn" id="dc-tab-btn-info" title="Datacenter Floor Statistics & Settings">📊 Floor Info</button>
              </div>
              <button class="dc-btn-toggle-panel" id="dc-toggle-left-panel" title="Collapse Left Panel">◀</button>
            </div>
            <div id="dc-catalog-content" class="dc-panel-tab-content"></div>
            <div id="dc-info-content" class="dc-panel-tab-content hidden"><div class="dc-no-floor">No floor loaded.<br>Click <b>+ New Floor</b> to start.</div></div>
          </div>
          <div class="dc-canvas-wrap" id="dc-canvas-wrap">
            <button class="dc-expand-panel-btn hidden" id="dc-expand-left-panel" title="Expand Equipment & Floor Panel">▶ Equipment & Floor</button>
            <canvas id="dc-canvas"></canvas>
            <div class="dc-3d-container hidden" id="dc-3d-container"></div>
          </div>
          <div class="dc-props-panel" id="dc-props-panel">
            <div class="dc-panel-title">PROPERTIES</div>
            <div id="dc-props-content"><p class="dc-muted">Select an equipment item or floor tile.</p></div>
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
    this.bindEventBusEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    dcState.subscribe(() => this.refresh());
    this.refresh();
  }

  private bindEventBusEvents() {
    eventBus.on('dc:set-tool', (mode) => this.setToolMode(mode));
    eventBus.on('dc:set-view', (mode) => this.setViewMode(mode));
    eventBus.on('dc:rotate-2d', () => this.rotate2DView());
    eventBus.on('dc:toggle-xray', () => this.toggleXrayMode());
    eventBus.on('dc:toggle-grid', () => { dcState.setState({ gridVisible: !dcState.getState().gridVisible }); });
    eventBus.on('dc:toggle-snap', () => { dcState.setState({ snapEnabled: !dcState.getState().snapEnabled }); });
    eventBus.on('dc:toggle-grid-lock', () => {
      this.strictGridOnly = !this.strictGridOnly;
      if (this.strictGridOnly) dcState.setState({ snapEnabled: true });
      this.updateButtonStates();
      this.draw();
    });
    eventBus.on('dc:toggle-labels', () => { dcState.setState({ labelsVisible: !dcState.getState().labelsVisible }); });
    eventBus.on('dc:fit', () => {
      const s = dcState.getState();
      if (s.selectedRackId) this.zoomToSelectedRack();
      else if (s.viewMode === '3d') this.set3DCameraPreset('iso');
      else this.fitToFloor();
    });
    eventBus.on('dc:zoom-in', () => {
      if (dcState.getState().viewMode === '3d') this.zoom3D(0.8);
      else this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 1.25);
    });
    eventBus.on('dc:zoom-out', () => {
      if (dcState.getState().viewMode === '3d') this.zoom3D(1.25);
      else this.zoomAtPoint(this.canvas.width / 2, this.canvas.height / 2, 0.8);
    });
    eventBus.on('dc:work-rack', (rackId) => {
      const floor = dcState.getActiveFloor();
      const rack = floor?.racks.find(r => r.id === rackId);
      if (rack) this.workOnRack(rack);
    });
    eventBus.on('dc:add-preset', (presetId) => this.addEquipmentFromCatalog(presetId));
    eventBus.on('dc:add-row', () => this.showAddRowDialog());
    eventBus.on('dc:new-floor', () => this.showCreateFloorDialog());
    eventBus.on('dc:toggle-left-panel', () => this.toggleLeftPanel());
    eventBus.on('dc:start-lay-pathway' as any, (data) => this.startLayingPathway(data));
    eventBus.on('dc:start-place-equipment' as any, (data) => this.startPlacingEquipment(data));
    eventBus.on('dc:start-lay-wall' as any, (data) => this.startLayingWall(data));
    eventBus.on('dc:perimeter-walls' as any, () => this.showPerimeterWallsModal());
    eventBus.on('dc:roof-settings' as any, () => this.showRoofConfigModal());
    eventBus.on('dc:start-place-wall-item' as any, (preset) => this.startPlacingWallItem(preset));
    eventBus.on('dc:cancel-tool' as any, () => this.cancelActiveTools());
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
    on('dc-btn-addwall-topbar', () => this.showPerimeterWallsModal());
    on('dc-btn-addroof-topbar', () => this.showRoofConfigModal());
    on('dc-btn-tool-select', () => this.setToolMode('select'));
    on('dc-btn-tool-pan', () => {
      const s = dcState.getState();
      if (s.selectedRackId) {
        this.startMovingRack(s.selectedRackId);
      } else {
        this.setToolMode('pan');
      }
    });
    on('dc-btn-tool-wall', () => this.startLayingWall());
    on('dc-btn-perimeter-walls', () => this.showPerimeterWallsModal());
    on('dc-btn-2d', () => this.setViewMode('2d'));
    on('dc-btn-3d', () => this.setViewMode('3d'));
    on('dc-btn-rotate-2d', () => this.rotate2DView());
    on('dc-btn-xray', () => this.toggleXrayMode());
    on('dc-btn-toggle-walls', () => {
      const visible = dcState.toggleWallsVisibility();
      this.refresh();
      eventBus.emit('notification', {
        message: `🧱 Walls ${visible ? 'Visible' : 'Hidden'}`,
        type: 'info',
      });
    });
    on('dc-btn-toggle-roof', () => {
      const visible = dcState.toggleRoofVisibility();
      this.refresh();
      eventBus.emit('notification', {
        message: `🏠 Roof ${visible ? 'Visible' : 'Hidden'}`,
        type: 'info',
      });
    });
    on('dc-btn-roof-settings', () => this.showRoofConfigModal());
    this.container.querySelector('#dc-floor-opacity')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      this.setFloorOpacity(val);
    });
    this.container.querySelector('#dc-wall-opacity')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      dcState.setWallOpacity(val);
      const floor = dcState.getActiveFloor();
      if (floor) {
        if (dcState.getState().viewMode === '3d') {
          this.rebuildThreeScene(floor);
        } else {
          this.draw();
        }
        this.renderPropsPanel();
      }
    });
    this.container.querySelector('#dc-roof-opacity')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      dcState.setRoofOpacity(val);
      const floor = dcState.getActiveFloor();
      if (floor && dcState.getState().viewMode === '3d') {
        this.rebuildThreeScene(floor);
      }
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

    const btnTabCatalog = this.container.querySelector('#dc-tab-btn-catalog');
    const btnTabInfo = this.container.querySelector('#dc-tab-btn-info');
    btnTabCatalog?.addEventListener('click', () => {
      this.activeLeftTab = 'catalog';
      btnTabCatalog.classList.add('active');
      btnTabInfo?.classList.remove('active');
      this.container.querySelector('#dc-catalog-content')?.classList.remove('hidden');
      this.container.querySelector('#dc-info-content')?.classList.add('hidden');
      this.renderCatalogPanel();
    });
    btnTabInfo?.addEventListener('click', () => {
      this.activeLeftTab = 'info';
      btnTabInfo.classList.add('active');
      btnTabCatalog?.classList.remove('active');
      this.container.querySelector('#dc-info-content')?.classList.remove('hidden');
      this.container.querySelector('#dc-catalog-content')?.classList.add('hidden');
      const floor = dcState.getActiveFloor();
      if (floor) this.updateInfoPanel(floor);
    });
    
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

    // Convert screen coordinates to world and unrotated canvas coordinates before zoom
    const { xM, yM, px, py } = this.screenToWorld(sx, sy);
    const W = this.canvas.width || 800;
    const H = this.canvas.height || 600;

    // Keep world coordinate (xM, yM) anchored strictly under cursor (px, py)
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
      if (e.shiftKey && key === 'W') {
        e.preventDefault();
        const visible = dcState.toggleWallsVisibility();
        this.refresh();
        eventBus.emit('notification', {
          message: `🧱 Walls ${visible ? 'Visible' : 'Hidden'}`,
          type: 'info',
        });
        return;
      }
      if ((e.shiftKey && key === 'R') || key === 'O') {
        e.preventDefault();
        const visible = dcState.toggleRoofVisibility();
        this.refresh();
        eventBus.emit('notification', {
          message: `🏠 Roof ${visible ? 'Visible' : 'Hidden'}`,
          type: 'info',
        });
        return;
      }
      if (key === 'S' && !e.shiftKey) this.setToolMode('select');
      if (key === 'M' && !e.shiftKey) this.setToolMode('pan');
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
        if (this.activePlacementTool) {
          this.activePlacementTool.rotation = ((this.activePlacementTool.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          this.draw();
          return;
        }
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
      } else if (key === 'S') {
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = dcState.getState();
        if (s.selectedWallItemId && s.selectedWallId) {
          dcState.deleteWallItem(s.selectedWallId, s.selectedWallItemId);
          this.refresh();
          eventBus.emit('notification', { message: 'Wall-mounted equipment removed.', type: 'info' });
          return;
        }
        if (s.selectedWallId) {
          dcState.deleteWall(s.selectedWallId);
          this.refresh();
          eventBus.emit('notification', { message: 'Wall partition deleted.', type: 'info' });
          return;
        }
        if (s.selectedRackId) {
          dcState.deleteRack(s.selectedRackId);
          this.refresh();
          eventBus.emit('notification', { message: 'Rack deleted.', type: 'info' });
          return;
        }
        if (s.selectedInfraId) {
          dcState.deleteInfrastructureItem(s.selectedInfraId);
          this.refresh();
          eventBus.emit('notification', { message: 'Infrastructure item deleted.', type: 'info' });
          return;
        }
      }
      if (e.key === 'Escape') {
        if (this.activePathwayTool || this.activePlacementTool || this.activeWallTool || this.activeWallItemPlacementTool) {
          this.cancelActiveTools();
          return;
        }
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
      if (this.activePathwayTool || this.activePlacementTool) {
        this.cancelActiveTools();
        return;
      }
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

    // Double-click on rack in 2D floor directly opens Rack Elevation ("Work on this Rack")
    this.canvas.addEventListener('dblclick', (e) => {
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
          this.workOnRack(rack);
          return;
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.activePathwayTool || this.activePlacementTool || this.activeWallTool || this.activeWallItemPlacementTool) {
        if (e.button === 0) this.handleMouseDown(e);
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey) || this.toolMode === 'pan') {
        this.pendingPan = true;
        this.isPanning = false;
        this.mouseDownClientPos = { x: e.clientX, y: e.clientY };
        this.panStartCam = { camX: this.camX, camY: this.camY, mouseX: e.clientX, mouseY: e.clientY };
        return;
      }
      if (e.button === 0) this.handleMouseDown(e);
    });

    // HTML5 Drag-and-drop from Equipment Directory Tree onto Canvas Floor
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer?.getData('application/json');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.dcCatalogPresetId) {
          const rect = this.canvas.getBoundingClientRect();
          const scaleX = this.canvas.width / (rect.width || 1);
          const scaleY = this.canvas.height / (rect.height || 1);
          const canvasSx = (e.clientX - rect.left) * scaleX;
          const canvasSy = (e.clientY - rect.top) * scaleY;
          const { xM, yM } = this.screenToWorld(canvasSx, canvasSy);
          this.addEquipmentFromCatalog(data.dcCatalogPresetId, { x: xM, y: yM });
        }
      } catch (err) {
        console.error('Directory tree drop error:', err);
      }
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

        // 1. Handling Active Pathway Drawing
        if (this.activePathwayTool) {
          const tileM = floor ? floor.tileSizeMm / 1000 : 0.6;
          const snapStep = tileM / 2;
          let sx = Math.round(xM / snapStep) * snapStep;
          let sy = Math.round(yM / snapStep) * snapStep;
          if (floor) {
            sx = Math.max(0, Math.min(floor.lengthM, parseFloat(sx.toFixed(3))));
            sy = Math.max(0, Math.min(floor.widthM, parseFloat(sy.toFixed(3))));
          }
          this.activePathwayTool.currentPoint = { x: sx, y: sy };

          if (statusbar) {
            if (this.activePathwayTool.startPoint) {
              const sp = this.activePathwayTool.startPoint;
              const dx = Math.abs(sx - sp.x);
              const dy = Math.abs(sy - sp.y);
              const isL = dx >= 0.15 && dy >= 0.15;
              const totalM = isL ? (dx + dy) : Math.hypot(sx - sp.x, sy - sp.y);
              const tiles = (totalM / tileM).toFixed(1);
              statusbar.textContent = `⚡ DRAWING PATHWAY: ${this.activePathwayTool.name} | ${isL ? `L-Bend (X: ${dx.toFixed(2)}m + Y: ${dy.toFixed(2)}m)` : `Length: ${totalM.toFixed(2)}m`} (${tiles} tiles) | Click/Drop to Route & Continue | [Esc] Exit`;
            } else {
              statusbar.textContent = `⚡ LAYING PATHWAY: ${this.activePathwayTool.name} (${this.activePathwayTool.layer.toUpperCase()} @ slab) | Click starting floor tile to begin continuous routing | [Esc] Exit`;
            }
          }
          this.draw();
          return;
        }

        // 2. Handling Active Wall Laying
        if (this.activeWallTool) {
          const tileM = floor ? floor.tileSizeMm / 1000 : 0.6;
          const snapStep = dcState.getState().snapEnabled ? tileM : 0.05;
          let sx = dcState.getState().snapEnabled ? Math.round(xM / snapStep) * snapStep : xM;
          let sy = dcState.getState().snapEnabled ? Math.round(yM / snapStep) * snapStep : yM;
          if (floor) {
            sx = Math.max(0, Math.min(floor.lengthM, parseFloat(sx.toFixed(3))));
            sy = Math.max(0, Math.min(floor.widthM, parseFloat(sy.toFixed(3))));
          }
          this.activeWallTool.currentPoint = { x: sx, y: sy };

          if (statusbar) {
            if (this.activeWallTool.startPoint) {
              const sp = this.activeWallTool.startPoint;
              const lenM = Math.hypot(sx - sp.x, sy - sp.y);
              const tiles = (lenM / tileM).toFixed(1);
              statusbar.textContent = `🧱 LAYING WALL: Length: ${formatSingleDistance(lenM, primaryUnit)} (${tiles} tiles) | (${sp.x.toFixed(2)}, ${sp.y.toFixed(2)}) → (${sx.toFixed(2)}, ${sy.toFixed(2)}) | Click to Finish Segment | [Esc] Exit`;
            } else {
              statusbar.textContent = `🧱 LAYING WALL: Click start coordinate on floor grid to begin wall segment | [Esc] Exit`;
            }
          }
          this.draw();
          return;
        }

        // 3. Handling Active Wall Item Placement
        if (this.activeWallItemPlacementTool && floor) {
          const walls = floor.walls || [];
          let bestWall: DcWallSegment | null = null;
          let bestDist = Infinity;
          let bestRatio = 0.5;

          for (const wall of walls) {
            const x1 = wall.start.x, y1 = wall.start.y;
            const x2 = wall.end.x, y2 = wall.end.y;
            const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
            if (lenSq > 0) {
              const t = Math.max(0.05, Math.min(0.95, ((xM - x1) * (x2 - x1) + (yM - y1) * (y2 - y1)) / lenSq));
              const px = x1 + t * (x2 - x1);
              const py = y1 + t * (y2 - y1);
              const dist = Math.hypot(xM - px, yM - py);
              if (dist < bestDist) {
                bestDist = dist;
                bestWall = wall;
                bestRatio = t;
              }
            }
          }

          if (bestWall && bestDist <= 1.2) {
            this.activeWallItemPlacementTool.previewWallId = bestWall.id;
            this.activeWallItemPlacementTool.previewRatio = bestRatio;
            if (statusbar) {
              statusbar.textContent = `${this.activeWallItemPlacementTool.preset.icon} ATTACH TO WALL: ${bestWall.name || 'Wall'} at ${(bestRatio * 100).toFixed(0)}% (Mount Height: ${this.activeWallItemPlacementTool.preset.defaultHeightOffsetM}m) | Click to Mount | [Esc] Exit`;
            }
          } else {
            this.activeWallItemPlacementTool.previewWallId = null;
            if (statusbar) {
              statusbar.textContent = `${this.activeWallItemPlacementTool.preset.icon} PLACING ${this.activeWallItemPlacementTool.preset.name}: Move cursor near any transparent wall to attach | [Esc] Exit`;
            }
          }
          this.draw();
          return;
        }

        // 4. Handling Dragging Existing Wall Handles
        if (this.isDraggingWallHandle && floor) {
          const wall = floor.walls?.find(w => w.id === this.isDraggingWallHandle!.wallId);
          if (wall) {
            const tileM = floor.tileSizeMm / 1000;
            const snapStep = dcState.getState().snapEnabled ? tileM : 0.05;
            let sx = dcState.getState().snapEnabled ? Math.round(xM / snapStep) * snapStep : xM;
            let sy = dcState.getState().snapEnabled ? Math.round(yM / snapStep) * snapStep : yM;
            sx = Math.max(0, Math.min(floor.lengthM, parseFloat(sx.toFixed(3))));
            sy = Math.max(0, Math.min(floor.widthM, parseFloat(sy.toFixed(3))));

            if (this.isDraggingWallHandle.handle === 'start') {
              dcState.updateWall(wall.id, { start: { x: sx, y: sy } });
            } else {
              dcState.updateWall(wall.id, { end: { x: sx, y: sy } });
            }
            this.draw();
            return;
          }
        }

        // 5. Handling Active Equipment Placement
        if (this.activePlacementTool && floor) {
          const tileM = floor.tileSizeMm / 1000;
          const rot = this.activePlacementTool.rotation;
          const rW = (rot % 180 === 0 ? this.activePlacementTool.widthMm : this.activePlacementTool.depthMm) / 1000;
          const rD = (rot % 180 === 0 ? this.activePlacementTool.depthMm : this.activePlacementTool.widthMm) / 1000;
          const col = Math.floor(xM / tileM);
          const row = Math.floor(yM / tileM);
          const posX = Math.max(0, Math.min(floor.lengthM - rW, col * tileM));
          const posY = Math.max(0, Math.min(floor.widthM - rD, row * tileM));
          this.activePlacementTool.previewPos = { x: parseFloat(posX.toFixed(3)), y: parseFloat(posY.toFixed(3)) };

          if (statusbar) {
            const rowLabel = getRowLabel(row, floor.rowScheme ?? 'letters');
            const colLabel = getColLabel(col, floor.colScheme ?? 'numbers', floor.addressFormat ?? 'compact');
            statusbar.textContent = `📦 PLACING: ${this.activePlacementTool.name} at Tile ${rowLabel}-${colLabel} | [R] Rotate 90° | Click to Place | [Esc] Exit`;
          }
          this.draw();
          return;
        }

        if (statusbar && xM >= 0 && yM >= 0) {
          if (this.isMovingPlacementMode) {
            statusbar.textContent = `✋ MOVING RACK: Click on floor to drop & position | [R] Rotate 90° | [Esc] Cancel | X: ${formatSingleDistance(xM, primaryUnit)} | Y: ${formatSingleDistance(yM, primaryUnit)}`;
          } else {
            statusbar.textContent = `Cursor: X: ${formatSingleDistance(xM, primaryUnit)} | Y: ${formatSingleDistance(yM, primaryUnit)} | [Z] Zoom to Rack / Fit | [S] Select | [M] Move | [R] Rotate | [W] Lay Wall`;
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

      if (this.isDraggingWallHandle) {
        this.isDraggingWallHandle = null;
        const currentFloor = dcState.getActiveFloor();
        if (currentFloor) this.rebuildThreeScene(currentFloor);
        this.renderPropsPanel();
        this.draw();
      }

      // Complete pathway laying on drag-release if distance >= 0.2m with continuity
      if (this.activePathwayTool && this.activePathwayTool.startPoint && this.activePathwayTool.currentPoint) {
        const start = this.activePathwayTool.startPoint;
        const end = this.activePathwayTool.currentPoint;
        const lenM = Math.hypot(end.x - start.x, end.y - start.y);
        if (lenM >= 0.2) {
          this.commitPathway(start, end);
          this.activePathwayTool.startPoint = { x: end.x, y: end.y };
          this.activePathwayTool.currentPoint = { x: end.x, y: end.y };
          this.draw();
          return;
        }
      }

      if (this.isDraggingRack && !this.isMovingPlacementMode) {
        this.handleRackDrop(_e);
      } else if (!this.isMovingPlacementMode) {
        this.draggingRackId = null;
        this.dragPos = null;
      }
    });
  }

  private worldToScreen(xM: number, yM: number): { sx: number; sy: number } {
    return { sx: xM * this.ppm + this.panX, sy: yM * this.ppm + this.panY };
  }

  private screenToWorld(sx: number, sy: number): { xM: number; yM: number; px: number; py: number } {
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
    return {
      xM: (px - this.panX) / this.ppm,
      yM: (py - this.panY) / this.ppm,
      px,
      py,
    };
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

    // 1. Handling Pathway Drawing Click
    if (this.activePathwayTool) {
      const snapStep = (floor.tileSizeMm / 1000) / 2;
      let sx = Math.round(xM / snapStep) * snapStep;
      let sy = Math.round(yM / snapStep) * snapStep;
      sx = Math.max(0, Math.min(floor.lengthM, parseFloat(sx.toFixed(3))));
      sy = Math.max(0, Math.min(floor.widthM, parseFloat(sy.toFixed(3))));

      if (!this.activePathwayTool.startPoint) {
        this.activePathwayTool.startPoint = { x: sx, y: sy };
        this.activePathwayTool.currentPoint = { x: sx, y: sy };
        this.draw();
      } else {
        const start = this.activePathwayTool.startPoint;
        const end = { x: sx, y: sy };
        const dist = Math.hypot(end.x - start.x, end.y - start.y);
        if (dist >= 0.2) {
          this.commitPathway(start, end);
          // CONTINUITY: keep the end point as the starting node for the next continuous leg
          this.activePathwayTool.startPoint = { x: end.x, y: end.y };
          this.activePathwayTool.currentPoint = { x: end.x, y: end.y };
          this.draw();
        } else if (dist < 0.05) {
          // Double clicked same point or clicked directly on start node: finish pathway routing
          eventBus.emit('notification', { message: `Completed pathway routing run.`, type: 'info' });
          this.cancelActiveTools();
        }
      }
      return;
    }

    // 2. Handling Wall Laying Click
    if (this.activeWallTool) {
      const tileM = floor.tileSizeMm / 1000;
      const snapStep = dcState.getState().snapEnabled ? tileM : 0.05;
      let sx = dcState.getState().snapEnabled ? Math.round(xM / snapStep) * snapStep : xM;
      let sy = dcState.getState().snapEnabled ? Math.round(yM / snapStep) * snapStep : yM;
      sx = Math.max(0, Math.min(floor.lengthM, parseFloat(sx.toFixed(3))));
      sy = Math.max(0, Math.min(floor.widthM, parseFloat(sy.toFixed(3))));

      if (!this.activeWallTool.startPoint) {
        this.activeWallTool.startPoint = { x: sx, y: sy };
        this.activeWallTool.currentPoint = { x: sx, y: sy };
        this.draw();
      } else {
        const start = this.activeWallTool.startPoint;
        const end = { x: sx, y: sy };
        const dist = Math.hypot(end.x - start.x, end.y - start.y);
        if (dist >= 0.2) {
          this.commitWall(start, end);
          this.activeWallTool.startPoint = { x: end.x, y: end.y };
          this.activeWallTool.currentPoint = { x: end.x, y: end.y };
          this.draw();
        } else if (dist < 0.05) {
          this.cancelActiveTools();
        }
      }
      return;
    }

    // 3. Handling Wall Item Placement Click
    if (this.activeWallItemPlacementTool) {
      if (this.activeWallItemPlacementTool.previewWallId) {
        this.commitWallItemPlacement(this.activeWallItemPlacementTool.previewWallId, this.activeWallItemPlacementTool.previewRatio);
      }
      return;
    }

    // 4. Handling Equipment Placement Click
    if (this.activePlacementTool && this.activePlacementTool.previewPos) {
      this.commitPlacement();
      return;
    }

    // If currently in active "Move Rack" placement mode, click to drop and place
    if (this.isMovingPlacementMode && this.draggingRackId) {
      this.handleRackDrop(e);
      return;
    }

    this.mouseDownClientPos = { x: e.clientX, y: e.clientY };

    // Check Wall Handle selection for dragging coordinates
    if (dcState.getState().wallsVisible !== false && floor.walls && floor.walls.length > 0) {
      for (const wall of floor.walls) {
        const handle = this.hitTestWallHandle(wall, xM, yM);
        if (handle) {
          this.isDraggingWallHandle = { wallId: wall.id, handle };
          dcState.setState({ selectedWallId: wall.id, selectedWallItemId: null, selectedRackId: null, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
          this.renderPropsPanel();
          this.draw();
          return;
        }
      }
    }

    // Check Wall Item selection
    if (dcState.getState().wallsVisible !== false && floor.walls && floor.walls.length > 0) {
      for (const wall of floor.walls) {
        if (wall.items && wall.items.length > 0) {
          for (const item of wall.items) {
            if (this.hitTestWallItem(wall, item, xM, yM)) {
              dcState.setState({ selectedWallId: wall.id, selectedWallItemId: item.id, selectedRackId: null, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
              this.renderPropsPanel();
              this.draw();
              return;
            }
          }
        }
      }
    }

    // Check Wall Body selection
    if (dcState.getState().wallsVisible !== false && floor.walls && floor.walls.length > 0) {
      for (const wall of floor.walls) {
        if (this.hitTestWall(wall, xM, yM)) {
          dcState.setState({ selectedWallId: wall.id, selectedWallItemId: null, selectedRackId: null, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
          this.renderPropsPanel();
          this.draw();
          return;
        }
      }
    }

    for (const rack of floor.racks) {
      if (this.hitTestRack(rack, xM, yM)) {
        dcState.setState({ selectedRackId: rack.id, selectedWallId: null, selectedWallItemId: null, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
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

    // Check Infrastructure selection in 2D
    if (floor.infrastructure && floor.infrastructure.length > 0) {
      for (const item of floor.infrastructure) {
        if (this.hitTestInfrastructure(item, xM, yM)) {
          dcState.setState({ selectedInfraId: item.id, selectedWallId: null, selectedWallItemId: null, selectedRackId: null, selectedTileId: null, selectedTileIds: [] });
          this.renderPropsPanel();
          this.draw();
          return;
        }
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
      dcState.setState({ selectedTileId: primaryTileId, selectedTileIds: newSelectedIds, selectedRackId: null, selectedInfraId: null });
      this.renderPropsPanel();
    } else {
      if (this.toolMode === 'pan' || e.altKey) {
        this.pendingPan = true;
        this.isPanning = false;
        this.panStartCam = { camX: this.camX, camY: this.camY, mouseX: e.clientX, mouseY: e.clientY };
      }
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        dcState.setState({ selectedTileId: null, selectedTileIds: [], selectedRackId: null, selectedInfraId: null });
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

  private hitTestInfrastructure(item: DcInfrastructureItem, xM: number, yM: number): boolean {
    const x1 = item.start.x, y1 = item.start.y;
    const x2 = item.end.x, y2 = item.end.y;
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    const thresholdM = Math.max(0.18, ((item.widthMm || 300) / 1000) / 2 + 0.08);
    if (l2 === 0) return Math.hypot(xM - x1, yM - y1) <= thresholdM;
    let t = ((xM - x1) * (x2 - x1) + (yM - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(xM - projX, yM - projY) <= thresholdM;
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

    // 2. Under-Floor & Overhead Infrastructure Paths & Automatic Assembly Fittings in 2D
    if (floor.infrastructure && floor.infrastructure.length > 0) {
      const items = floor.infrastructure;
      const junctionNodes = solveRacewayTopology(items, { racks: floor.racks, snapRadiusM: 0.22 });
      const truncatedSegments = getTruncatedInfraSegments(items, junctionNodes);

      // A. Draw Linear Channel Corridors
      for (const tSeg of truncatedSegments) {
        const item = tSeg.originalItem;
        const p1 = this.worldToScreen(tSeg.start.x, tSeg.start.y);
        const p2 = this.worldToScreen(tSeg.end.x, tSeg.end.y);
        const isSelected = item.id === s.selectedInfraId || item.parentItemId === s.selectedInfraId;
        const widthPx = Math.max(4, ((item.widthMm || 300) / 1000) * this.ppm);
        const isUF = item.layer === 'underfloor';

        this.ctx.save();

        if (item.category === 'riser') {
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

        const theme = getRacewayTheme(item.category, item.subtype);
        const strokeColor = item.color || theme.color2D;

        if (isSelected) {
          this.ctx.shadowColor = '#38bdf8';
          this.ctx.shadowBlur = 10;
        }

        // 1. Channel Body Outer Fill
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = widthPx;
        this.ctx.lineCap = 'butt';
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        this.ctx.lineTo(p2.sx, p2.sy);
        this.ctx.stroke();

        // 2. Channel Inner Details (Distinct CAD pattern per subtype)
        const sub = (item.subtype || (item.category === 'cable-duct' ? 'pvc-duct' : item.category === 'cable-tray' ? 'basket-tray' : 'pvc-duct')).toLowerCase();
        const segLenPx = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy) || 1;
        const uX = (p2.sx - p1.sx) / segLenPx;
        const uY = (p2.sy - p1.sy) / segLenPx;
        const nX = -uY;
        const nY = uX;

        if (sub === 'basket-tray') {
          // Wire mesh cross-hatch: Outer rails + Transverse welded wire rungs
          this.ctx.strokeStyle = '#fef08a';
          this.ctx.lineWidth = 1.5;
          const rungStep = 14;
          const numRungs = Math.floor(segLenPx / rungStep);
          for (let ri = 0; ri <= numRungs; ri++) {
            const rx = p1.sx + uX * (ri * rungStep);
            const ry = p1.sy + uY * (ri * rungStep);
            this.ctx.beginPath();
            this.ctx.moveTo(rx - nX * (widthPx / 2 - 1), ry - nY * (widthPx / 2 - 1));
            this.ctx.lineTo(rx + nX * (widthPx / 2 - 1), ry + nY * (widthPx / 2 - 1));
            this.ctx.stroke();
          }
          // 2 longitudinal center wires
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([4, 4]);
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx - nX * (widthPx / 4), p1.sy - nY * (widthPx / 4));
          this.ctx.lineTo(p2.sx - nX * (widthPx / 4), p2.sy - nY * (widthPx / 4));
          this.ctx.moveTo(p1.sx + nX * (widthPx / 4), p1.sy + nY * (widthPx / 4));
          this.ctx.lineTo(p2.sx + nX * (widthPx / 4), p2.sy + nY * (widthPx / 4));
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        } else if (sub === 'ladder-rack') {
          // Ladder Runway: 2 heavy side stringers + thick transverse ladder rungs
          this.ctx.strokeStyle = '#0f172a';
          this.ctx.lineWidth = 3;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx - nX * (widthPx / 2 - 1.5), p1.sy - nY * (widthPx / 2 - 1.5));
          this.ctx.lineTo(p2.sx - nX * (widthPx / 2 - 1.5), p2.sy - nY * (widthPx / 2 - 1.5));
          this.ctx.moveTo(p1.sx + nX * (widthPx / 2 - 1.5), p1.sy + nY * (widthPx / 2 - 1.5));
          this.ctx.lineTo(p2.sx + nX * (widthPx / 2 - 1.5), p2.sy + nY * (widthPx / 2 - 1.5));
          this.ctx.stroke();

          // Ladder cross rungs every 22px
          this.ctx.strokeStyle = '#94a3b8';
          this.ctx.lineWidth = 2.5;
          const rungStep = 22;
          const numRungs = Math.floor(segLenPx / rungStep);
          for (let ri = 0; ri <= numRungs; ri++) {
            const rx = p1.sx + uX * (ri * rungStep);
            const ry = p1.sy + uY * (ri * rungStep);
            this.ctx.beginPath();
            this.ctx.moveTo(rx - nX * (widthPx / 2 - 3), ry - nY * (widthPx / 2 - 3));
            this.ctx.lineTo(rx + nX * (widthPx / 2 - 3), ry + nY * (widthPx / 2 - 3));
            this.ctx.stroke();
          }
        } else if (sub === 'fiber-raceway' || item.category === 'fiber-raceway') {
          // Dual safety yellow internal guide ribs & fiber bundle core
          this.ctx.strokeStyle = '#fef08a';
          this.ctx.lineWidth = 1.8;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx - nX * (widthPx / 3), p1.sy - nY * (widthPx / 3));
          this.ctx.lineTo(p2.sx - nX * (widthPx / 3), p2.sy - nY * (widthPx / 3));
          this.ctx.moveTo(p1.sx + nX * (widthPx / 3), p1.sy + nY * (widthPx / 3));
          this.ctx.lineTo(p2.sx + nX * (widthPx / 3), p2.sy + nY * (widthPx / 3));
          this.ctx.stroke();

          this.ctx.strokeStyle = '#a16207';
          this.ctx.lineWidth = 1.2;
          this.ctx.setLineDash([6, 4]);
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx, p1.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        } else if (sub === 'busway' || sub === 'power-busway' || item.category === 'busway' || item.category === 'power-cable') {
          // 3-Phase conductor busbar lines (L1 red, L2 yellow, L3 blue)
          const phases = ['#f87171', '#fde047', '#60a5fa'];
          phases.forEach((pColor, pi) => {
            const offset = (pi - 1) * (widthPx / 3.5);
            this.ctx.strokeStyle = pColor;
            this.ctx.lineWidth = 1.8;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.sx + nX * offset, p1.sy + nY * offset);
            this.ctx.lineTo(p2.sx + nX * offset, p2.sy + nY * offset);
            this.ctx.stroke();
          });
        } else if (sub === 'conduit' || item.category === 'conduit') {
          // Cylindrical conduit tube with coupling collars
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx, p1.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
          this.ctx.stroke();

          // Coupler sleeves every 35px
          this.ctx.fillStyle = '#475569';
          const couplerStep = 35;
          const numCouplers = Math.floor(segLenPx / couplerStep);
          for (let ci = 0; ci <= numCouplers; ci++) {
            const cx = p1.sx + uX * (ci * couplerStep);
            const cy = p1.sy + uY * (ci * couplerStep);
            this.ctx.fillRect(cx - 3, cy - 3, 6, 6);
          }
        } else if (sub === 'solid-duct') {
          // Galvanized sheet with bolted seam collars
          this.ctx.strokeStyle = '#cbd5e1';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx, p1.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
          this.ctx.stroke();

          this.ctx.strokeStyle = '#334155';
          this.ctx.lineWidth = 2.5;
          const seamStep = 45;
          const numSeams = Math.floor(segLenPx / seamStep);
          for (let si = 0; si <= numSeams; si++) {
            const sx = p1.sx + uX * (si * seamStep);
            const sy = p1.sy + uY * (si * seamStep);
            this.ctx.beginPath();
            this.ctx.moveTo(sx - nX * (widthPx / 2), sy - nY * (widthPx / 2));
            this.ctx.lineTo(sx + nX * (widthPx / 2), sy + nY * (widthPx / 2));
            this.ctx.stroke();
          }
        } else {
          // PVC Solid Duct with center compartment divider
          this.ctx.strokeStyle = '#cbd5e1';
          this.ctx.lineWidth = 1.8;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx, p1.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
          this.ctx.stroke();
        }

        // 3. Selection Outline
        if (isSelected) {
          this.ctx.strokeStyle = '#38bdf8';
          this.ctx.lineWidth = widthPx + 4;
          this.ctx.globalAlpha = 0.4;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.sx, p1.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
          this.ctx.stroke();
          this.ctx.globalAlpha = 1.0;

          // Start & End Anchor Grab Rings
          this.ctx.fillStyle = '#38bdf8';
          this.ctx.beginPath();
          this.ctx.arc(p1.sx, p1.sy, 5, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(p2.sx, p2.sy, 5, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // 4. Infrastructure Label
        const midX = (p1.sx + p2.sx) / 2;
        const midY = (p1.sy + p2.sy) / 2;
        const lenM = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
        const labelText = `${item.name} (${lenM.toFixed(1)}m • ${item.widthMm}mm)`;

        this.ctx.fillStyle = isSelected ? '#38bdf8' : '#f1f5f9';
        this.ctx.font = 'bold 9px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(labelText, midX, midY - widthPx / 2 - 2);
        this.ctx.restore();
      }

      // B. Draw Procedural Automatic Fittings (90° Elbows, T-Joints, Cross-Joints, Couplers, Drops, Reducers)
      for (const jn of junctionNodes) {
        const pJ = this.worldToScreen(jn.x, jn.y);
        const jSizePx = Math.max(8, ((jn.widthMm + 60) / 1000) * this.ppm);
        const isSelected = jn.connectedInfraIds.some(id => {
          const base = id.split('_sub')[0];
          return base === s.selectedInfraId || id === s.selectedInfraId;
        });
        const theme = getRacewayTheme(jn.category, jn.subtype);

        this.ctx.save();
        if (isSelected) {
          this.ctx.shadowColor = '#38bdf8';
          this.ctx.shadowBlur = 12;
        }

        const baseColor = jn.color || theme.color2D;
        const accentColor = theme.accentColor;

        if (jn.fittingType === 'elbow-90' || jn.fittingType === 'elbow-45') {
          // 90° / 45° Smooth Curved Radius Elbow Fitting
          this.ctx.fillStyle = baseColor;
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, jSizePx / 2, 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#0f172a';
          this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
          this.ctx.stroke();

          // Inner radius curve guide
          this.ctx.strokeStyle = accentColor;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, jSizePx / 3.5, 0, Math.PI * 2);
          this.ctx.stroke();

          // Port connection flange tabs
          for (const angle of jn.angles) {
            const fx = pJ.sx + Math.cos(angle) * (jSizePx / 2);
            const fy = pJ.sy + Math.sin(angle) * (jSizePx / 2);
            this.ctx.fillStyle = '#1e293b';
            this.ctx.beginPath();
            this.ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
          }
        } else if (jn.fittingType === 'tee-joint') {
          // 3-Way T-Joint with internal fillet curves
          this.ctx.fillStyle = baseColor;
          this.ctx.fillRect(pJ.sx - jSizePx / 2, pJ.sy - jSizePx / 2, jSizePx, jSizePx);

          this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#0f172a';
          this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
          this.ctx.strokeRect(pJ.sx - jSizePx / 2, pJ.sy - jSizePx / 2, jSizePx, jSizePx);

          // T-Center through guide
          this.ctx.strokeStyle = accentColor;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, jSizePx / 3, 0, Math.PI * 2);
          this.ctx.stroke();

          // Center fastener bolt
          this.ctx.fillStyle = '#0f172a';
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (jn.fittingType === 'cross-joint') {
          // 4-Way Cross Joint with rounded corner guides
          this.ctx.fillStyle = baseColor;
          this.ctx.fillRect(pJ.sx - jSizePx / 2, pJ.sy - jSizePx / 2, jSizePx, jSizePx);

          this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#0f172a';
          this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
          this.ctx.strokeRect(pJ.sx - jSizePx / 2, pJ.sy - jSizePx / 2, jSizePx, jSizePx);

          // Center cross inspection plate
          this.ctx.fillStyle = accentColor;
          this.ctx.fillRect(pJ.sx - jSizePx / 4, pJ.sy - jSizePx / 4, jSizePx / 2, jSizePx / 2);

          this.ctx.fillStyle = '#0f172a';
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (jn.fittingType === 'coupling' || jn.fittingType === 'reducing-coupling') {
          // Coupling assembly clamp with thumbscrews/bolts
          const cW = jSizePx * 0.7;
          const cH = jSizePx * 1.1;
          this.ctx.fillStyle = jn.fittingType === 'reducing-coupling' ? '#d97706' : '#475569';
          this.ctx.fillRect(pJ.sx - cW / 2, pJ.sy - cH / 2, cW, cH);

          this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
          this.ctx.lineWidth = 1.2;
          this.ctx.strokeRect(pJ.sx - cW / 2, pJ.sy - cH / 2, cW, cH);

          // 2 Side clamp fastener bolts
          this.ctx.fillStyle = '#f8fafc';
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy - cH / 3, 2, 0, Math.PI * 2);
          this.ctx.arc(pJ.sx, pJ.sy + cH / 3, 2, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (jn.fittingType === 'waterfall-outlet') {
          // Waterfall trumpet drop spout over rack
          this.ctx.fillStyle = '#eab308';
          this.ctx.beginPath();
          this.ctx.arc(pJ.sx, pJ.sy, jSizePx / 2, 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.strokeStyle = '#0284c7';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();

          // Downward arrow / drop icon
          this.ctx.fillStyle = '#0f172a';
          this.ctx.font = 'bold 8px system-ui';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('▼ DROP', pJ.sx, pJ.sy);
        } else if (jn.fittingType === 'end-cap') {
          // End closure cap
          this.ctx.fillStyle = '#334155';
          this.ctx.fillRect(pJ.sx - jSizePx / 3, pJ.sy - jSizePx / 3, (jSizePx * 2) / 3, (jSizePx * 2) / 3);
          this.ctx.strokeStyle = '#64748b';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(pJ.sx - jSizePx / 3, pJ.sy - jSizePx / 3, (jSizePx * 2) / 3, (jSizePx * 2) / 3);
        }

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

    // 4.1 Draw Active Pathway Laying Rubberband Channel Preview
    if (this.activePathwayTool) {
      const tool = this.activePathwayTool;
      const curPt = tool.currentPoint;
      const startPt = tool.startPoint;

      this.ctx.save();
      if (startPt && curPt) {
        const p1 = this.worldToScreen(startPt.x, startPt.y);
        const p2 = this.worldToScreen(curPt.x, curPt.y);
        const dx = Math.abs(curPt.x - startPt.x);
        const dy = Math.abs(curPt.y - startPt.y);
        const minLegM = Math.max(0.15, tileM / 4);
        const isLRoute = dx >= minLegM && dy >= minLegM;
        const corner = { x: curPt.x, y: startPt.y };
        const pCorner = this.worldToScreen(corner.x, corner.y);

        const totalLenM = isLRoute ? (dx + dy) : Math.hypot(curPt.x - startPt.x, curPt.y - startPt.y);
        const tileCount = (totalLenM / tileM).toFixed(1);
        const widthPx = Math.max(4, (tool.widthMm / 1000) * this.ppm);
        const isUF = tool.layer === 'underfloor';
        const strokeColor = tool.color || (isUF ? '#38bdf8' : '#eab308');

        // Draw outer channel corridor
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = widthPx;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalAlpha = 0.45;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        if (isLRoute) {
          this.ctx.lineTo(pCorner.sx, pCorner.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
        } else {
          this.ctx.lineTo(p2.sx, p2.sy);
        }
        this.ctx.stroke();

        // Draw centerline with glowing dashed guide
        this.ctx.globalAlpha = 1.0;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2.5;
        this.ctx.setLineDash([8, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        if (isLRoute) {
          this.ctx.lineTo(pCorner.sx, pCorner.sy);
          this.ctx.lineTo(p2.sx, p2.sy);
        } else {
          this.ctx.lineTo(p2.sx, p2.sy);
        }
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Start anchor node
        this.ctx.fillStyle = strokeColor;
        this.ctx.beginPath();
        this.ctx.arc(p1.sx, p1.sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (isLRoute) {
          // 90° Elbow Corner Fitting Marker
          this.ctx.fillStyle = '#0f172a';
          this.ctx.fillRect(pCorner.sx - 8, pCorner.sy - 8, 16, 16);
          this.ctx.strokeStyle = strokeColor;
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(pCorner.sx - 8, pCorner.sy - 8, 16, 16);

          this.ctx.fillStyle = '#38bdf8';
          this.ctx.font = 'bold 9px system-ui';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'bottom';
          this.ctx.fillText('90°', pCorner.sx, pCorner.sy - 10);
        }

        // End cursor node
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(p2.sx, p2.sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Floating dimension & specs badge
        const midX = isLRoute ? (pCorner.sx + p2.sx) / 2 : (p1.sx + p2.sx) / 2;
        const midY = isLRoute ? (pCorner.sy + p2.sy) / 2 : (p1.sy + p2.sy) / 2;
        const badgeText = isLRoute
          ? `⚡ ${tool.name} | L-Bend: ${totalLenM.toFixed(2)}m (X: ${dx.toFixed(2)}m → Y: ${dy.toFixed(2)}m) | ${tool.widthMm}mm W | ${tool.layer.toUpperCase()}`
          : `⚡ ${tool.name} | ${totalLenM.toFixed(2)}m (${tileCount} tiles) | ${tool.widthMm}mm W | ${tool.layer.toUpperCase()}`;

        this.ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        const txtMetrics = this.ctx.measureText(badgeText);
        const bw = txtMetrics.width + 24;
        const bh = 24;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.roundRect(midX - bw / 2, midY - bh - 8, bw, bh, 6);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#f8fafc';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(badgeText, midX, midY - 8 - bh / 2);
      } else if (curPt) {
        // Hover cursor dot and tile guide before clicking start
        const p = this.worldToScreen(curPt.x, curPt.y);
        this.ctx.fillStyle = tool.color || '#38bdf8';
        this.ctx.beginPath();
        this.ctx.arc(p.sx, p.sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        const hint = `Click tile to start laying ${tool.name}`;
        this.ctx.font = 'bold 11px system-ui';
        const hw = this.ctx.measureText(hint).width + 16;
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        this.ctx.fillRect(p.sx - hw / 2, p.sy - 30, hw, 20);
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.strokeRect(p.sx - hw / 2, p.sy - 30, hw, 20);
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(hint, p.sx, p.sy - 20);
      }
      this.ctx.restore();
    }

    // 4.1.5 Draw Transparent Walls & Wall Equipment
    this.drawWalls(floor);

    // 4.1.6 Draw Active Wall Laying Rubberband Preview
    if (this.activeWallTool) {
      const tool = this.activeWallTool;
      const curPt = tool.currentPoint;
      const startPt = tool.startPoint;
      const primaryUnit = floor.unit ?? 'm';

      this.ctx.save();
      if (startPt && curPt) {
        const p1 = this.worldToScreen(startPt.x, startPt.y);
        const p2 = this.worldToScreen(curPt.x, curPt.y);
        const lenM = Math.hypot(curPt.x - startPt.x, curPt.y - startPt.y);
        const tileCount = (lenM / tileM).toFixed(1);
        const widthPx = Math.max(5, (tool.thicknessMm / 1000) * this.ppm);
        const opacity = tool.opacity !== undefined ? tool.opacity : 0.35;

        // Wall Body Preview
        this.ctx.strokeStyle = tool.color || '#38bdf8';
        this.ctx.lineWidth = widthPx;
        this.ctx.globalAlpha = Math.max(0.15, opacity);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        this.ctx.lineTo(p2.sx, p2.sy);
        this.ctx.stroke();

        // Glowing center dashed guide
        this.ctx.globalAlpha = 1.0;
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        this.ctx.lineTo(p2.sx, p2.sy);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Start anchor node
        this.ctx.fillStyle = '#0284c7';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(p1.sx, p1.sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // End cursor node
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.beginPath();
        this.ctx.arc(p2.sx, p2.sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Dimension Pill
        const midX = (p1.sx + p2.sx) / 2;
        const midY = (p1.sy + p2.sy) / 2;
        const badgeText = `🧱 ${formatSingleDistance(lenM, primaryUnit)} (${tileCount} tiles) • ${Math.round(opacity * 100)}% Glass`;
        this.ctx.font = 'bold 11px system-ui';
        const txtW = this.ctx.measureText(badgeText).width;
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        this.ctx.fillRect(midX - txtW / 2 - 8, midY - 26, txtW + 16, 20);
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(midX - txtW / 2 - 8, midY - 26, txtW + 16, 20);
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(badgeText, midX, midY - 16);
      }
      this.ctx.restore();
    }

    // 4.1.7 Draw Active Wall Item Placement Preview
    if (this.activeWallItemPlacementTool && this.activeWallItemPlacementTool.previewWallId && floor) {
      const tool = this.activeWallItemPlacementTool;
      const wall = floor.walls?.find(w => w.id === tool.previewWallId);
      if (wall) {
        const p1 = this.worldToScreen(wall.start.x, wall.start.y);
        const p2 = this.worldToScreen(wall.end.x, wall.end.y);
        const segLenPx = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy) || 1;
        const uX = (p2.sx - p1.sx) / segLenPx;
        const uY = (p2.sy - p1.sy) / segLenPx;
        const nX = -uY;
        const nY = uX;
        const widthPx = Math.max(5, (wall.thicknessMm / 1000) * this.ppm);
        const ix = p1.sx + uX * (segLenPx * tool.previewRatio);
        const iy = p1.sy + uY * (segLenPx * tool.previewRatio);
        const itemPxX = ix + nX * (widthPx / 2 + 6);
        const itemPxY = iy + nY * (widthPx / 2 + 6);

        this.ctx.save();
        this.ctx.fillStyle = '#0284c7';
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = '#38bdf8';
        this.ctx.shadowBlur = 12;
        this.ctx.beginPath();
        this.ctx.arc(itemPxX, itemPxY, 14, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.font = '14px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(tool.preset.icon, itemPxX, itemPxY);

        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 10px system-ui';
        this.ctx.fillText(`Click to attach ${tool.preset.shortLabel} (${tool.preset.defaultHeightOffsetM}m)`, itemPxX, itemPxY + 20);
        this.ctx.restore();
      }
    }

    // 4.2 Draw Active Equipment Placement Preview Footprint
    if (this.activePlacementTool && this.activePlacementTool.previewPos) {
      const tool = this.activePlacementTool;
      const pos = tool.previewPos;
      if (pos) {
        const rot = tool.rotation;
        const rW = tool.widthMm / 1000;
        const rD = tool.depthMm / 1000;
        const effW = rot % 180 === 0 ? rW : rD;
        const effD = rot % 180 === 0 ? rD : rW;

        const pScreen = this.worldToScreen(pos.x, pos.y);
        const pw = effW * this.ppm;
        const ph = effD * this.ppm;

        // Check collision
        const mockRack: DcRack = {
          id: 'placement-test',
          name: tool.name,
          type: tool.type,
          widthMm: tool.widthMm,
          depthMm: tool.depthMm,
          heightU: tool.heightU,
          position: { x: pos.x, y: pos.y, z: 0 },
          rotation: rot,
        };
        const isOverlap = dcState.isOverlapping(mockRack);
        const boxColor = isOverlap ? '#ef4444' : '#10b981';

        this.ctx.save();
        // Translucent fill
        this.ctx.fillStyle = isOverlap ? 'rgba(239, 68, 68, 0.28)' : 'rgba(16, 185, 129, 0.28)';
        this.ctx.fillRect(pScreen.sx, pScreen.sy, pw, ph);

        // Outline border
        this.ctx.strokeStyle = boxColor;
        this.ctx.lineWidth = 2.5;
        this.ctx.setLineDash([5, 3]);
        this.ctx.strokeRect(pScreen.sx, pScreen.sy, pw, ph);
        this.ctx.setLineDash([]);

        // Door swing direction indicator
        const frontCenter = this.getFrontCenterScreen(pScreen.sx, pScreen.sy, pw, ph, rot);
        this.ctx.fillStyle = boxColor;
        this.ctx.beginPath();
        this.ctx.arc(frontCenter.x, frontCenter.y, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Top label badge
        const badgeText = `${tool.name} • ${rot}° [R: Rotate | Click: Place | Esc: Exit]`;
        this.ctx.font = 'bold 11px system-ui';
        const bw = this.ctx.measureText(badgeText).width + 16;
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        this.ctx.fillRect(pScreen.sx + pw / 2 - bw / 2, pScreen.sy - 26, bw, 20);
        this.ctx.strokeStyle = boxColor;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(pScreen.sx + pw / 2 - bw / 2, pScreen.sy - 26, bw, 20);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(badgeText, pScreen.sx + pw / 2, pScreen.sy - 16);

        this.ctx.restore();
      }
    }

    this.ctx.restore();

    this.ctx.restore();

    // 5. Datacenter Layout Addressing Rulers (X-Axis Columns & Y-Axis Rows)
    const unit = floor.unit ?? 'm';
    const cols = Math.ceil(floor.lengthM / tileM);
    const rows = Math.ceil(floor.widthM / tileM);
    const rScheme = floor.rowScheme ?? 'letters';
    const cScheme = floor.colScheme ?? 'numbers';
    const addrFormat = floor.addressFormat ?? 'compact';

    const rulerThick = Math.max(22, Math.min(32, Math.round(24 * (this.ppm / 100))));
    const topRulerY = fy - rulerThick;
    const leftRulerX = fx - rulerThick;

    this.ctx.save();

    // ── A. Top Ruler: X-Axis Columns (01, 02, 03... or 1, 2, 3...) ──
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    this.ctx.fillRect(fx, topRulerY, fw, rulerThick);
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(fx, topRulerY, fw, rulerThick);

    const colFontSize = Math.max(10, Math.min(13, Math.round(tilePx * 0.28)));
    this.ctx.font = `bold ${colFontSize}px "SF Mono", Monaco, Menlo, Consolas, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let c = 0; c < cols; c++) {
      const csx = fx + c * tilePx;
      const csw = Math.min(tilePx, fx + fw - csx);
      const colLabel = getColLabel(c, cScheme, addrFormat);

      // Column divider line
      this.ctx.strokeStyle = '#334155';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(csx, topRulerY);
      this.ctx.lineTo(csx, fy);
      this.ctx.stroke();

      if (tilePx >= 16) {
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText(colLabel, csx + csw / 2, topRulerY + rulerThick / 2);
      }
    }

    // ── B. Left Ruler: Y-Axis Rows (A, B, C, D...) ──
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    this.ctx.fillRect(leftRulerX, fy, rulerThick, fh);
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(leftRulerX, fy, rulerThick, fh);

    const rowFontSize = Math.max(10, Math.min(13, Math.round(tilePx * 0.28)));
    this.ctx.font = `bold ${rowFontSize}px "SF Mono", Monaco, Menlo, Consolas, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      const rsy = fy + r * tilePx;
      const rsh = Math.min(tilePx, fy + fh - rsy);
      const rowLabel = getRowLabel(r, rScheme);

      // Row divider line
      this.ctx.strokeStyle = '#334155';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(leftRulerX, rsy);
      this.ctx.lineTo(fx, rsy);
      this.ctx.stroke();

      if (tilePx >= 16) {
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText(rowLabel, leftRulerX + rulerThick / 2, rsy + rsh / 2);
      }
    }

    // ── C. Top-Left Corner Origin Block (X→ / Y↓) ──
    this.ctx.fillStyle = 'rgba(2, 132, 199, 0.25)';
    this.ctx.fillRect(leftRulerX, topRulerY, rulerThick, rulerThick);
    this.ctx.strokeStyle = '#0284c7';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(leftRulerX, topRulerY, rulerThick, rulerThick);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = 'bold 9px system-ui, sans-serif';
    this.ctx.fillText('X →', leftRulerX + rulerThick / 2, topRulerY + rulerThick * 0.35);
    this.ctx.fillText('Y ↓', leftRulerX + rulerThick / 2, topRulerY + rulerThick * 0.72);

    this.ctx.restore();

    // 6. CAD Architectural Dimension Lines & Leader Arrows (Outside rulers)
    const dimOffset = rulerThick + Math.max(18, Math.min(32, Math.round(18 * (this.ppm / 100))));
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

  private drawWalls(floor: DcFloor) {
    if (!floor.walls || floor.walls.length === 0 || dcState.getState().wallsVisible === false) return;
    const s = dcState.getState();
    const primaryUnit = floor.unit ?? 'm';

    for (const wall of floor.walls) {
      const isSelected = wall.id === s.selectedWallId;
      const p1 = this.worldToScreen(wall.start.x, wall.start.y);
      const p2 = this.worldToScreen(wall.end.x, wall.end.y);
      const lenM = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      if (lenM <= 0.05) continue;

      const widthPx = Math.max(5, ((wall.thicknessMm || 150) / 1000) * this.ppm);
      const opacity = wall.opacity !== undefined ? wall.opacity : 0.35;

      this.ctx.save();

      // Glass Wall Body Fill
      this.ctx.strokeStyle = wall.color || '#38bdf8';
      this.ctx.lineWidth = widthPx;
      this.ctx.lineCap = 'butt';
      this.ctx.globalAlpha = Math.max(0.12, opacity * 0.8);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.sx, p1.sy);
      this.ctx.lineTo(p2.sx, p2.sy);
      this.ctx.stroke();

      // Outer glass surface line accents
      this.ctx.globalAlpha = Math.max(0.4, opacity);
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = '#38bdf8';

      const segLenPx = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy) || 1;
      const uX = (p2.sx - p1.sx) / segLenPx;
      const uY = (p2.sy - p1.sy) / segLenPx;
      const nX = -uY;
      const nY = uX;

      // Top and bottom boundary edges
      this.ctx.beginPath();
      this.ctx.moveTo(p1.sx + nX * (widthPx / 2), p1.sy + nY * (widthPx / 2));
      this.ctx.lineTo(p2.sx + nX * (widthPx / 2), p2.sy + nY * (widthPx / 2));
      this.ctx.moveTo(p1.sx - nX * (widthPx / 2), p1.sy - nY * (widthPx / 2));
      this.ctx.lineTo(p2.sx - nX * (widthPx / 2), p2.sy - nY * (widthPx / 2));
      this.ctx.stroke();

      // Selection glow & drag handles
      if (isSelected) {
        this.ctx.globalAlpha = 0.9;
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = widthPx + 6;
        this.ctx.shadowColor = '#38bdf8';
        this.ctx.shadowBlur = 12;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.sx, p1.sy);
        this.ctx.lineTo(p2.sx, p2.sy);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // Start & End coordinate drag handle dots
        this.ctx.fillStyle = '#0284c7';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(p1.sx, p1.sy, 7, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(p2.sx, p2.sy, 7, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Coordinate readout labels
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 9px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`(${wall.start.x.toFixed(2)}, ${wall.start.y.toFixed(2)})`, p1.sx, p1.sy - 14);
        this.ctx.fillText(`(${wall.end.x.toFixed(2)}, ${wall.end.y.toFixed(2)})`, p2.sx, p2.sy - 14);
      }

      // Wall Dimension & Opacity Tag
      const midX = (p1.sx + p2.sx) / 2;
      const midY = (p1.sy + p2.sy) / 2;
      const wallTag = `${wall.name || 'Glass Wall'} • ${formatSingleDistance(lenM, primaryUnit)} (${Math.round(opacity * 100)}% Glass)`;
      this.ctx.globalAlpha = 1.0;
      this.ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
      this.ctx.font = 'bold 10px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(wallTag, midX, midY - widthPx / 2 - 3);

      // Draw Wall-Mounted Equipment
      if (wall.items && wall.items.length > 0) {
        for (const item of wall.items) {
          const isItemSel = s.selectedWallItemId === item.id;
          const t = item.positionRatio;
          const ix = p1.sx + uX * (segLenPx * t);
          const iy = p1.sy + uY * (segLenPx * t);

          const sideOffset = (item.side === 'outer' ? -1 : 1) * (widthPx / 2 + 6);
          const itemPxX = ix + nX * sideOffset;
          const itemPxY = iy + nY * sideOffset;

          this.ctx.save();
          if (isItemSel) {
            this.ctx.shadowColor = '#38bdf8';
            this.ctx.shadowBlur = 10;
          }

          // Item badge circle
          this.ctx.fillStyle = isItemSel ? '#0284c7' : '#1e293b';
          this.ctx.strokeStyle = isItemSel ? '#38bdf8' : (item.color || '#64748b');
          this.ctx.lineWidth = isItemSel ? 2 : 1.5;
          this.ctx.beginPath();
          this.ctx.arc(itemPxX, itemPxY, 12, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();

          // Item Icon
          const icon = item.type === 'ac-split' ? '❄️' :
                       item.type === 'fire-extinguisher' ? '🧯' :
                       item.type === 'fire-panel' ? '🚨' :
                       item.type === 'env-sensor' ? '🌡️' :
                       item.type === 'epo-button' ? '🛑' :
                       item.type === 'access-keypad' ? '🔢' :
                       item.type === 'cctv-camera' ? '📹' :
                       item.type === 'pdp-panel' ? '⚡' :
                       item.type === 'leak-detector' ? '💧' : '🩹';

          this.ctx.font = '12px system-ui';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(icon, itemPxX, itemPxY);

          // Item name & height offset
          this.ctx.fillStyle = isItemSel ? '#38bdf8' : '#f8fafc';
          this.ctx.font = 'bold 9px system-ui';
          this.ctx.fillText(`${item.name} (${item.heightOffsetM || 1.4}m)`, itemPxX, itemPxY + 16);

          this.ctx.restore();
        }
      }

      this.ctx.restore();
    }
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

    // Outer Stroke with Category & Type distinction
    const strokeColor = invalid ? '#ef4444' : isSelected ? '#38bdf8' :
      rack.equipmentCategory === 'cooling' || rack.type === 'inrow-cooling' ? '#0284c7' :
      rack.equipmentCategory === 'micro-dc' || rack.type === 'micro-dc' ? '#c084fc' :
      rack.equipmentCategory === 'structured-cabling' || rack.type === 'odf-fiber' ? '#facc15' :
      rack.equipmentCategory === 'power-distribution' || rack.type === 'power-rpp' ? '#fbbf24' :
      rack.equipmentCategory === 'ups' || rack.type === 'ups-cabinet' || rack.type === 'battery-cabinet' ? '#4ade80' :
      rack.equipmentCategory === 'busbars-transformers' || rack.type === 'transformer' ? '#f59e0b' :
      rack.equipmentCategory === 'facility-plant' || rack.spaceType === 'grey-space' ? '#f87171' :
      rack.type === 'network' ? '#10b981' :
      rack.type === 'open-frame' ? '#f59e0b' :
      rack.type === 'wall-mount' ? '#a855f7' : '#4a9eff';

    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
    this.ctx.strokeRect(sx, sy, pw, ph);

    // Category-specific internal iconography & hatching
    if (pw >= 16 && ph >= 16) {
      if (rack.equipmentCategory === 'cooling' || rack.type === 'inrow-cooling') {
        this.ctx.fillStyle = 'rgba(2, 132, 199, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(sx + pw / 2, sy + ph / 2, Math.min(pw, ph) * 0.28, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (rack.equipmentCategory === 'micro-dc' || rack.type === 'micro-dc') {
        this.ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
        this.ctx.fillRect(sx + 4, sy + 3, pw - 8, Math.min(ph * 0.22, 12));
      } else if (rack.spaceType === 'grey-space') {
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.fillRect(sx, sy, Math.min(6, pw), Math.min(6, ph));
        this.ctx.fillRect(sx + pw - Math.min(6, pw), sy + ph - Math.min(6, ph), Math.min(6, pw), Math.min(6, ph));
      }
    }

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
        const labelText = rack.equipmentCategory ? rack.equipmentCategory.toUpperCase() : `${rack.heightU}U ${rack.type.toUpperCase()}`;
        this.ctx.fillText(labelText, sx + pw / 2, sy + ph / 2 + 5);
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

  public addEquipmentFromCatalog(presetId: string, customPos?: { x: number; y: number }) {
    const floor = dcState.getActiveFloor();
    if (!floor) {
      eventBus.emit('notification', { message: 'Please create or load a datacenter floor first.', type: 'warning' });
      return;
    }
    const preset = DATACENTER_CATALOG.find(p => p.id === presetId);
    if (!preset) return;

    // Special handler: If preset is a flooring tile type (e.g. perforated, air-channel, ventilated, standard, cutout)
    if (preset.tileType) {
      const tileM = floor.tileSizeMm / 1000;
      if (customPos) {
        const col = Math.floor(customPos.x / tileM);
        const row = Math.floor(customPos.y / tileM);
        const tile = floor.tiles.find(t => t.col === col && t.row === row);
        if (tile) {
          dcState.setFloorTileType(tile.id, preset.tileType, preset.airflowDir, preset.airChannelHeightMm || 300);
          this.refresh();
          eventBus.emit('notification', { message: `Updated Tile ${tile.id} to ${preset.shortLabel}`, type: 'success' });
          return;
        }
      }
      const selIds = dcState.getState().selectedTileIds;
      if (selIds && selIds.length > 0) {
        dcState.setFloorTilesType(selIds, preset.tileType, preset.airflowDir, preset.airChannelHeightMm || 300);
        this.refresh();
        eventBus.emit('notification', { message: `Updated ${selIds.length} tile(s) to ${preset.shortLabel}`, type: 'success' });
        return;
      }
    }

    // Special handler: If preset is a pathway
    if (preset.category === 'pathways') {
      this.startLayingPathway({
        name: preset.name,
        layer: preset.pathwayLayer || 'underfloor',
        elevationMm: preset.pathwayElevationMm,
        widthMm: preset.pathwayWidthMm || preset.widthMm || 400,
        heightMm: preset.pathwayHeightMm || 100,
        category: preset.infraCategory,
        color: preset.color,
      });
      return;
    }

    const tileM = floor.tileSizeMm / 1000;
    const rWM = preset.widthMm / 1000;
    const rDM = preset.depthMm / 1000;

    let targetX = customPos ? Math.max(0, Math.min(floor.lengthM - rWM, customPos.x - rWM / 2)) : tileM * 2;
    let targetY = customPos ? Math.max(0, Math.min(floor.widthM - rDM, customPos.y - rDM / 2)) : tileM * 2;

    if (dcState.getState().snapEnabled) {
      targetX = Math.round(targetX / tileM) * tileM;
      targetY = Math.round(targetY / tileM) * tileM;
    }

    const count = (floor.racks.length || 0) + 1;
    const prefix = preset.shortLabel.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
    const id = `${prefix}-${String(count).padStart(3, '0')}`;

    const rack: DcRack = {
      id,
      name: id,
      type: preset.type,
      spaceType: preset.spaceType,
      equipmentCategory: preset.category,
      widthMm: preset.widthMm,
      depthMm: preset.depthMm,
      heightU: preset.heightU,
      doorStyle: preset.doorStyle,
      mounting: preset.mounting,
      manufacturer: preset.manufacturer,
      model: preset.model,
      position: { x: parseFloat(targetX.toFixed(3)), y: parseFloat(targetY.toFixed(3)), z: 0 },
      rotation: 0,
      color: preset.color,
      maxPowerKw: preset.maxPowerKw,
      coolingCapacityKw: preset.coolingCapacityKw,
      upsCapacityKva: preset.upsCapacityKva,
      pduVoltage: preset.pduVoltage,
      pduPhases: preset.pduPhases,
      pduAmperage: preset.pduAmperage,
      pduOutletCount: preset.pduOutletCount,
      busbarAmps: preset.busbarAmps,
      transformerKva: preset.transformerKva,
      securityLock: preset.securityLock,
    };

    // If without customPos, find non-overlapping grid location
    if (!customPos) {
      while (dcState.isOverlapping(rack) && targetX < floor.lengthM - rWM) {
        targetX += rWM + 0.3;
        if (targetX + rWM > floor.lengthM) {
          targetX = tileM * 2;
          targetY += rDM + 1.2;
        }
        rack.position = { x: parseFloat(targetX.toFixed(3)), y: parseFloat(targetY.toFixed(3)), z: 0 };
      }
    }

    dcState.addRack(rack);
    dcState.setState({ selectedRackId: rack.id, selectedTileId: null, selectedTileIds: [], selectedInfraId: null });
    this.refresh();
    eventBus.emit('notification', {
      message: `Added ${preset.name} to ${preset.spaceType === 'grey-space' ? 'Grey Space' : 'White Space'} at (${rack.position.x.toFixed(1)}m, ${rack.position.y.toFixed(1)}m).`,
      type: 'success',
    });
  }

  private renderCatalogPanel() {
    const el = this.container.querySelector('#dc-catalog-content');
    if (!el) return;
    const s = dcState.getState();
    const query = this.catalogSearchQuery.trim().toLowerCase();

    const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

    interface DcCatDefinition {
      id: string;
      label: string;
      accent: string;
      svgHtml: string;
      isArchitecture?: boolean;
      isWallEquipment?: boolean;
      category?: DcEquipmentCategory;
    }

    const CATEGORIES: DcCatDefinition[] = [
      {
        id: 'housing',
        label: 'Racks & Enclosures',
        accent: '#00e5ff',
        svgHtml: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'),
        category: 'housing',
      },
      {
        id: 'architecture',
        label: 'Architecture & Walls',
        accent: '#38bdf8',
        svgHtml: svg('<path d="M3 21h18M3 7h18M3 14h18M7 7v7M17 7v7M12 14v7M7 14v7M17 14v7M12 3v4"/>'),
        isArchitecture: true,
      },
      {
        id: 'wall-equipment',
        label: 'Wall Equipment',
        accent: '#f59e0b',
        svgHtml: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
        isWallEquipment: true,
      },
      {
        id: 'compute',
        label: 'Active Compute',
        accent: '#fb8c00',
        svgHtml: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
        category: 'compute',
      },
      {
        id: 'network',
        label: 'Active Networking',
        accent: '#00f2fe',
        svgHtml: svg('<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 11h.01M10 11h.01"/>'),
        category: 'network',
      },
      {
        id: 'storage',
        label: 'Active Storage',
        accent: '#8e24aa',
        svgHtml: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
        category: 'storage',
      },
      {
        id: 'power-distribution',
        label: 'Power Distribution',
        accent: '#fdd835',
        svgHtml: svg('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
        category: 'power-distribution',
      },
      {
        id: 'backup-generation',
        label: 'UPS & Generation',
        accent: '#4ade80',
        svgHtml: svg('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
        category: 'backup-generation',
      },
      {
        id: 'cooling',
        label: 'Cooling & HVAC',
        accent: '#38bdf8',
        svgHtml: svg('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/><circle cx="12" cy="12" r="3"/>'),
        category: 'cooling',
      },
      {
        id: 'structured-cabling',
        label: 'Structured Cabling',
        accent: '#fbbf24',
        svgHtml: svg('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8"/>'),
        category: 'structured-cabling',
      },
      {
        id: 'containment',
        label: 'Aisle Containment',
        accent: '#c084fc',
        svgHtml: svg('<path d="M3 21h18M4 18h16M7 18V6a2 2 0 012-2h6a2 2 0 012 2v12"/>'),
        category: 'containment',
      },
      {
        id: 'pathways',
        label: 'Cabling & Pathways',
        accent: '#94a3b8',
        svgHtml: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
        category: 'pathways',
      },
      {
        id: 'flooring',
        label: 'Flooring Systems',
        accent: '#38bdf8',
        svgHtml: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
        category: 'flooring',
      },
      {
        id: 'fire-safety',
        label: 'Fire & Life Safety',
        accent: '#f87171',
        svgHtml: svg('<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>'),
        category: 'fire-safety',
      },
      {
        id: 'security',
        label: 'Physical Security',
        accent: '#d8b4fe',
        svgHtml: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
        category: 'security',
      },
      {
        id: 'bms-dcim',
        label: 'BMS & DCIM Probes',
        accent: '#38bdf8',
        svgHtml: svg('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-13h2v6h-2zm0 8h2v2h-2z"/>'),
        category: 'bms-dcim',
      },
      {
        id: 'plumbing',
        label: 'Plumbing & Piping',
        accent: '#06b6d4',
        svgHtml: svg('<path d="M6 12h12M6 12a3 3 0 01-3-3V6h6v3a3 3 0 01-3 3zm12 0a3 3 0 003-3V6h-6v3a3 3 0 003 3zM12 12v9"/>'),
        category: 'plumbing',
      },
      {
        id: 'earthing',
        label: 'Grounding & Lightning',
        accent: '#facc15',
        svgHtml: svg('<path d="M12 2v10M6 12h12M8 16h8M10 20h4"/>'),
        category: 'earthing',
      },
      {
        id: 'operations',
        label: 'Operations & Handling',
        accent: '#a3e635',
        svgHtml: svg('<path d="M16 16v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h8a2 2 0 012 2v1M18 8h4v8h-4M10 12h4"/>'),
        category: 'operations',
      },
      {
        id: 'facility-plant',
        label: 'Facility Plant (Grey Space)',
        accent: '#f59e0b',
        svgHtml: svg('<path d="M2 20h20M5 20V8l5 4V8l5 4V4h4v16"/>'),
        category: 'facility-plant',
      },
    ];

    el.innerHTML = `
      <div style="padding: 10px 10px 6px;">
        <input type="text" class="dc-catalog-search-box" id="dc-cat-search-input" placeholder="Search components..." value="${this.catalogSearchQuery}" style="width: 100%; background: #0d1117; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 7px 12px; color: #f0f6fc; font-size: 12px; outline: none; box-sizing: border-box;" />
      </div>
      <div id="dc-cat-accordion-list" style="overflow-y: auto; flex: 1;"></div>
    `;

    const accordionContainer = el.querySelector('#dc-cat-accordion-list') as HTMLElement;
    if (!accordionContainer) return;

    const createSubgroupHeader = (title: string, badge: string, accentColor = '#38bdf8'): HTMLElement => {
      const header = document.createElement('div');
      header.className = 'cat-subgroup-header';
      header.style.cssText = `padding: 7px 10px 4px 14px; font-size: 10px; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ${accentColor}26; margin: 6px 0 2px; display: flex; align-items: center; justify-content: space-between;`;
      header.innerHTML = `<span>${title}</span><span style="font-size: 9px; opacity: 0.8; color: #8b949e; text-transform: none; letter-spacing: normal;">${badge}</span>`;
      return header;
    };

    const makePresetItemEl = (p: CatalogItemPreset, catAccent: string): HTMLElement => {
      const itemEl = document.createElement('div');
      itemEl.className = 'cat-item';
      itemEl.draggable = true;
      let meta = `${p.depthMm}mm`;
      if (p.heightU) meta = `${p.heightU}U • ${p.depthMm}mm`;
      else if (p.coolingCapacityKw) meta = `${p.coolingCapacityKw} kW`;
      else if (p.upsCapacityKva) meta = `${p.upsCapacityKva} kVA`;
      else if (p.maxPowerKw) meta = `${p.maxPowerKw} kW`;
      else if (p.busbarAmps) meta = `${p.busbarAmps} A`;
      else if (p.transformerKva) meta = `${p.transformerKva} kVA`;
      else if (p.tileType) {
        if (p.tileType === 'perforated') meta = 'Perforated';
        else if (p.tileType === 'air-channel') meta = 'High Airflow';
        else if (p.tileType === 'ventilated') meta = 'Grille';
        else if (p.tileType === 'cutout') meta = 'Cutout';
        else meta = `${p.widthMm}×${p.depthMm}mm`;
      } else if (p.pathwayLayer) {
        meta = `${p.pathwayLayer === 'overhead' ? 'Overhead' : 'Underfloor'} • ${p.pathwayWidthMm || p.widthMm}mm`;
      }

      itemEl.title = `${p.name}\nDimensions: ${p.widthMm}×${p.depthMm}mm${p.heightU ? ` (${p.heightU}U)` : ''}\n${p.description}`;
      itemEl.innerHTML = `
        <div class="cat-item-dot" style="background: ${catAccent};"></div>
        <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
        <span class="cat-item-meta">${meta}</span>
      `;
      itemEl.ondragstart = (e) => {
        e.dataTransfer?.setData('application/json', JSON.stringify({ dcCatalogPresetId: p.id }));
      };
      itemEl.onclick = () => this.addEquipmentFromCatalog(p.id);
      return itemEl;
    };

    const appendSubgroup = (
      title: string,
      badge: string,
      elements: HTMLElement[],
      target: HTMLElement[],
      accentColor: string
    ) => {
      if (elements.length === 0) return;
      target.push(createSubgroupHeader(title, badge, accentColor));
      target.push(...elements);
    };

    for (const cat of CATEGORIES) {
      let itemEls: HTMLElement[] = [];

      if (cat.id === 'housing') {
        const customRackBtnEls: HTMLElement[] = [];
        if (!query || 'custom rack builder configurator'.includes(query)) {
          const customRackBtn = document.createElement('div');
          customRackBtn.className = 'cat-item';
          customRackBtn.setAttribute('draggable', 'true');
          customRackBtn.draggable = true;
          customRackBtn.style.cssText = 'border: 1px dashed rgba(0,229,255,0.4); background: rgba(0,229,255,0.06); font-weight: 600; color: #00e5ff; cursor: pointer;';
          customRackBtn.innerHTML = `
            <div class="cat-item-dot" style="background: #00e5ff;"></div>
            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">+ Custom Rack Builder…</div>
            <span class="cat-item-meta" style="color: #00e5ff;">Configurator</span>
          `;
          customRackBtn.onclick = () => this.showAddRackDialog();
          customRackBtnEls.push(customRackBtn);
        }

        const presets = DATACENTER_CATALOG.filter(p => p.category === 'housing').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.shortLabel.toLowerCase().includes(query);
        });

        const isStandard = (p: CatalogItemPreset) =>
          !p.id.includes('colo') &&
          !p.id.includes('open') &&
          !p.id.includes('wall') &&
          !p.name.toLowerCase().includes('open frame') &&
          !p.name.toLowerCase().includes('wall mount') &&
          (p.type === 'server' || p.type === 'network' || p.type === 'gpu-ai' || (p.heightU && p.heightU >= 42));

        const standardPresets = presets.filter(isStandard);
        const coloOpenWallPresets = presets.filter(p => !isStandard(p));

        appendSubgroup(
          'Standard & High-Density Server Racks',
          '42U - 52U',
          [...customRackBtnEls, ...standardPresets.map(p => makePresetItemEl(p, cat.accent))],
          itemEls,
          cat.accent
        );

        appendSubgroup(
          'Colocation, Open Frame & Wall Mounts',
          'Colo / Open / Edge',
          coloOpenWallPresets.map(p => makePresetItemEl(p, cat.accent)),
          itemEls,
          cat.accent
        );
      } else if (cat.isArchitecture) {
        const archActions = [
          { id: 'lay-wall', name: '+ Lay Custom Wall (Coordinates)', meta: 'Draw', desc: 'Click and drag on floor canvas to lay custom transparent walls', fn: () => this.startLayingWall() },
          { id: 'perimeter-walls', name: 'Perimeter Walls (N/S/E/W)', meta: 'Config', desc: 'Configure transparent perimeter walls for all 4 boundaries', fn: () => this.showPerimeterWallsModal() },
          { id: 'roof-config', name: 'Configure Transparent Roof', meta: 'Roof', desc: 'Configure transparent roof height, opacity & structural trusses', fn: () => this.showRoofConfigModal() },
          { id: 'toggle-walls', name: s.wallsVisible !== false ? 'Hide Walls (Perimeter & Partitions)' : 'Show Walls (Perimeter & Partitions)', meta: 'Toggle', desc: 'Toggle visibility of walls', fn: () => { const v = dcState.toggleWallsVisibility(); this.refresh(); eventBus.emit('notification', { message: `🧱 Walls ${v ? 'Visible' : 'Hidden'}`, type: 'info' }); } },
          { id: 'toggle-roof', name: s.roofVisible !== false ? 'Hide Transparent Roof' : 'Show Transparent Roof', meta: 'Toggle', desc: 'Toggle visibility of roof', fn: () => { const v = dcState.toggleRoofVisibility(); this.refresh(); eventBus.emit('notification', { message: `🏠 Roof ${v ? 'Visible' : 'Hidden'}`, type: 'info' }); } },
        ];

        const matchedActions = archActions.filter(a => !query || a.name.toLowerCase().includes(query) || a.desc.toLowerCase().includes(query));
        const actionEls = matchedActions.map(a => {
          const itemEl = document.createElement('div');
          itemEl.className = 'cat-item';
          itemEl.title = a.desc;
          itemEl.style.cursor = 'pointer';
          itemEl.innerHTML = `
            <div class="cat-item-dot" style="background: ${cat.accent};"></div>
            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #38bdf8;">${a.name}</div>
            <span class="cat-item-meta" style="color: #38bdf8;">${a.meta}</span>
          `;
          itemEl.onclick = a.fn;
          return itemEl;
        });

        appendSubgroup('Interactive CAD & Perimeter Tools', 'CAD Tools', actionEls, itemEls, cat.accent);

        const archPresets = DATACENTER_CATALOG.filter(p => p.category === 'architecture').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query);
        });

        const wallPresets = archPresets.filter(p => !p.id.includes('ceiling') && !p.id.includes('plenum'));
        const ceilingPresets = archPresets.filter(p => p.id.includes('ceiling') || p.id.includes('plenum'));

        appendSubgroup('Walls, Partitions & Doors', 'Fire / Glass / Acoustic', wallPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Ceilings & Structural Plenums', 'Structural Grid', ceilingPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.isWallEquipment) {
        const presets = WALL_EQUIPMENT_CATALOG.filter(w => {
          if (!query) return true;
          return w.name.toLowerCase().includes(query) || w.description.toLowerCase().includes(query) || w.manufacturer.toLowerCase().includes(query);
        });

        const makeWallEl = (w: typeof WALL_EQUIPMENT_CATALOG[0]) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'cat-item';
          itemEl.title = `${w.name}\nDimensions: ${w.widthMm}×${w.heightMm}×${w.depthMm}mm\nMount Height: ${w.defaultHeightOffsetM}m\n${w.description}`;
          itemEl.innerHTML = `
            <div class="cat-item-dot" style="background: ${cat.accent};"></div>
            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.name}</div>
            <span class="cat-item-meta">Wall Mount</span>
          `;
          itemEl.onclick = () => this.startPlacingWallItem(w);
          return itemEl;
        };

        const secItems = presets.filter(w => w.id.includes('bio') || w.id.includes('card') || w.id.includes('panic') || w.id.includes('keypad') || w.id.includes('intercom') || w.id.includes('epo') || w.id.includes('cctv') || w.name.toLowerCase().includes('access') || w.name.toLowerCase().includes('cctv') || w.name.toLowerCase().includes('intercom') || w.name.toLowerCase().includes('emergency'));
        const pwrItems = presets.filter(w => !secItems.includes(w) && (w.id.includes('meter') || w.id.includes('db') || w.id.includes('spd') || w.id.includes('power') || w.name.toLowerCase().includes('distribution') || w.name.toLowerCase().includes('meter') || w.name.toLowerCase().includes('panel')));
        const fireItems = presets.filter(w => !secItems.includes(w) && !pwrItems.includes(w));

        appendSubgroup('Security & Access Control', 'Biometrics & Readers', secItems.map(makeWallEl), itemEls, cat.accent);
        appendSubgroup('Power, Meters & Distribution', 'SMDB / DB / SPD', pwrItems.map(makeWallEl), itemEls, cat.accent);
        appendSubgroup('Fire Alarms & Life Safety', 'VESDA / Sounders', fireItems.map(makeWallEl), itemEls, cat.accent);
      } else if (cat.id === 'compute') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'compute').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isStandardCompute = (p: CatalogItemPreset) =>
          (p.heightU <= 2) &&
          !p.id.includes('ai') &&
          !p.id.includes('gpu') &&
          !p.id.includes('blade') &&
          !p.id.includes('dgx') &&
          !p.name.toLowerCase().includes('accelerator') &&
          !p.name.toLowerCase().includes('supercomputer') &&
          !p.name.toLowerCase().includes('blade');

        const rackCompute = presets.filter(isStandardCompute);
        const aiChassis = presets.filter(p => !isStandardCompute(p));

        appendSubgroup('Rack Servers & HCI Appliances', '1U - 2U Compute', rackCompute.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('AI Accelerators & Blade Chassis', '4U - 10U High-Power', aiChassis.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'network') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'network').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isFabricSwitch = (p: CatalogItemPreset) =>
          p.id.includes('switch') ||
          p.id.includes('director') ||
          p.id.includes('leaf') ||
          p.id.includes('spine') ||
          p.name.toLowerCase().includes('switch') ||
          p.name.toLowerCase().includes('director');

        const fabricSwitches = presets.filter(isFabricSwitch);
        const routersControllers = presets.filter(p => !isFabricSwitch(p));

        appendSubgroup('Fabric Switches & Core Directors', 'ToR / Leaf / Spine / Core', fabricSwitches.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Routers, Firewalls & Controllers', 'WAN / NGFW / ADC / TAP', routersControllers.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'storage') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'storage').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isPrimarySan = (p: CatalogItemPreset) =>
          p.id.includes('nvme') ||
          p.id.includes('san') ||
          p.id.includes('flash') ||
          p.name.toLowerCase().includes('flash') ||
          p.name.toLowerCase().includes('san') ||
          p.name.toLowerCase().includes('nvme');

        const primarySan = presets.filter(isPrimarySan);
        const jbodTape = presets.filter(p => !isPrimarySan(p));

        appendSubgroup('Primary All-Flash & SAN Directors', 'NVMe SAN / NAS', primarySan.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('JBOD Expansion & Tape Archives', 'Density & LTO Tape', jbodTape.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'power-distribution') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'power-distribution').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isRackPduAts = (p: CatalogItemPreset) =>
          p.type === 'power-rpp' ? false :
          (p.id.includes('pdu') || p.id.includes('ats') || (p.heightU !== undefined && p.heightU <= 2 && (p.maxPowerKw ?? 0) <= 30 && !p.id.includes('rpp') && !p.id.includes('busway') && !p.id.includes('meter') && !p.id.includes('smdb')));

        const rackPdus = presets.filter(isRackPduAts);
        const floorPanels = presets.filter(p => !isRackPduAts(p));

        appendSubgroup('Rack PDUs & Transfer Switches', 'ePDUs & ATS', rackPdus.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Floor Panels, Busways & Switchgear', 'RPP / Busway / MDB', floorPanels.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'backup-generation') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'backup-generation').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isUpsBattery = (p: CatalogItemPreset) =>
          p.type === 'ups-cabinet' ||
          p.type === 'battery-cabinet' ||
          p.id.includes('ups') ||
          p.id.includes('battery') ||
          p.id.includes('bms') ||
          p.id.includes('mbp') ||
          p.id.includes('vrla') ||
          p.id.includes('li-ion');

        const upsBattery = presets.filter(isUpsBattery);
        const standbyGenset = presets.filter(p => !isUpsBattery(p));

        appendSubgroup('UPS Systems & Battery Storage', 'UPS / Li-Ion / VRLA', upsBattery.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Standby Generation & MV Substations', 'Diesel Genset / MV', standbyGenset.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'cooling') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'cooling').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isAirDucts = (p: CatalogItemPreset) =>
          p.id.includes('duct') ||
          p.id.includes('damper') ||
          p.id.includes('vav') ||
          p.name.toLowerCase().includes('duct') ||
          p.name.toLowerCase().includes('damper') ||
          p.name.toLowerCase().includes('vav');

        const isLiquidCentral = (p: CatalogItemPreset) =>
          !isAirDucts(p) && (
            p.type === 'cduhx' ||
            p.type === 'chiller-plant' ||
            p.type === 'cooling-tower' ||
            p.id.includes('cdu') ||
            p.id.includes('rdhx') ||
            p.id.includes('chiller') ||
            p.id.includes('tower') ||
            p.id.includes('heat-exchanger') ||
            p.id.includes('expansion-tank') ||
            p.name.toLowerCase().includes('chiller') ||
            p.name.toLowerCase().includes('cdu')
          );

        const inrowPerimeter = presets.filter(p => !isAirDucts(p) && !isLiquidCentral(p));
        const liquidCentral = presets.filter(isLiquidCentral);
        const airDucts = presets.filter(isAirDucts);

        appendSubgroup('In-Row & Perimeter CRAC/CRAH', 'Precision Air Handlers', inrowPerimeter.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Liquid Cooling & Central Plant', 'CDU / Chillers / Towers', liquidCentral.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Air Distribution Ducts & Dampers', 'Plenums & VAV', airDucts.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'structured-cabling') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'structured-cabling').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isCopper = (p: CatalogItemPreset) =>
          p.id.includes('copper') ||
          p.id.includes('cat6') ||
          p.name.toLowerCase().includes('cat6') ||
          p.name.toLowerCase().includes('copper') ||
          p.name.toLowerCase().includes('rj45');

        const copperPresets = presets.filter(isCopper);
        const fiberPresets = presets.filter(p => !isCopper(p));

        appendSubgroup('Copper Patch Panels & Distributors', 'Cat6 / Cat6A', copperPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Fiber Optic ODF, LIU & MPO Cassettes', 'LC / SC / MPO / Splice', fiberPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'containment') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'containment').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isColdAisle = (p: CatalogItemPreset) =>
          p.containmentType === 'cold-aisle' ||
          p.id.includes('cold') ||
          p.id.includes('door') ||
          p.id.includes('ceiling') ||
          p.id.includes('curtain') ||
          p.name.toLowerCase().includes('cold') ||
          p.name.toLowerCase().includes('door') ||
          p.name.toLowerCase().includes('ceiling') ||
          p.name.toLowerCase().includes('curtain');

        const coldAisle = presets.filter(isColdAisle);
        const hotAisle = presets.filter(p => !isColdAisle(p));

        appendSubgroup('Cold Aisle Containment', 'Doors & Roofs', coldAisle.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Hot Aisle Chimneys & Baffles', 'Return Plenums & Baffles', hotAisle.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'pathways') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'pathways').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isUnderfloor = (p: CatalogItemPreset) =>
          p.pathwayLayer === 'underfloor' ||
          p.id.includes('underfloor') ||
          p.id.includes('trench') ||
          p.id.includes('gi-duct') ||
          p.id.includes('pvc-duct') ||
          p.name.toLowerCase().includes('underfloor') ||
          p.name.toLowerCase().includes('trench') ||
          p.name.toLowerCase().includes('pvc') ||
          p.name.toLowerCase().includes('gi slotted');

        const underfloorPresets = presets.filter(isUnderfloor);
        const overheadPresets = presets.filter(p => !isUnderfloor(p));

        // Underfloor Draw Action
        const underfloorActions: HTMLElement[] = [];
        if (!query || 'draw underfloor cable pathway tray duct runway'.includes(query)) {
          const drawAction = document.createElement('div');
          drawAction.className = 'cat-item';
          drawAction.style.cssText = 'border: 1px dashed rgba(148,163,184,0.4); background: rgba(148,163,184,0.06); font-weight: 600; color: #94a3b8; cursor: pointer;';
          drawAction.innerHTML = `
            <div class="cat-item-dot" style="background: #94a3b8;"></div>
            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">+ Draw Underfloor Pathway…</div>
            <span class="cat-item-meta" style="color: #94a3b8;">Underfloor</span>
          `;
          drawAction.onclick = () => this.startLayingPathway({ name: 'Underfloor Mesh Tray', layer: 'underfloor', widthMm: 300, heightMm: 100 });
          underfloorActions.push(drawAction);
        }

        // Overhead Draw Action
        const overheadActions: HTMLElement[] = [];
        if (!query || 'draw overhead cable pathway tray duct runway ladder'.includes(query)) {
          const drawAction = document.createElement('div');
          drawAction.className = 'cat-item';
          drawAction.style.cssText = 'border: 1px dashed rgba(148,163,184,0.4); background: rgba(148,163,184,0.06); font-weight: 600; color: #94a3b8; cursor: pointer;';
          drawAction.innerHTML = `
            <div class="cat-item-dot" style="background: #94a3b8;"></div>
            <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">+ Draw Overhead Pathway…</div>
            <span class="cat-item-meta" style="color: #94a3b8;">Overhead</span>
          `;
          drawAction.onclick = () => this.startLayingPathway({ name: 'Cable Runway Ladder', layer: 'overhead', widthMm: 400, heightMm: 100 });
          overheadActions.push(drawAction);
        }

        appendSubgroup(
          'Underfloor Pathways',
          'Underfloor / Ducts / Mesh',
          [...underfloorActions, ...underfloorPresets.map(p => makePresetItemEl(p, cat.accent))],
          itemEls,
          cat.accent
        );

        appendSubgroup(
          'Overhead Pathways',
          'Overhead / Ladders / Trays',
          [...overheadActions, ...overheadPresets.map(p => makePresetItemEl(p, cat.accent))],
          itemEls,
          cat.accent
        );
      } else if (cat.id === 'flooring') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'flooring').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isTileOrGrille = (p: CatalogItemPreset) =>
          p.tileType !== undefined ||
          p.id.includes('tile') ||
          p.id.includes('grille') ||
          p.id.includes('diffuser') ||
          p.name.toLowerCase().includes('tile') ||
          p.name.toLowerCase().includes('grille') ||
          p.name.toLowerCase().includes('diffuser');

        const tilePresets = presets.filter(isTileOrGrille);
        const accessPresets = presets.filter(p => !isTileOrGrille(p));

        appendSubgroup('Raised Floor Tiles & Grilles', '600×600mm Panels', tilePresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Structure, Grommets & Access', 'Understructure & Access', accessPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'fire-safety') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'fire-safety').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isDetection = (p: CatalogItemPreset) =>
          p.id.includes('vesda') ||
          p.id.includes('smoke') ||
          p.id.includes('detector') ||
          p.id.includes('optical') ||
          p.id.includes('flame') ||
          p.name.toLowerCase().includes('vesda') ||
          p.name.toLowerCase().includes('detector') ||
          p.name.toLowerCase().includes('smoke');

        const detectionPresets = presets.filter(isDetection);
        const suppressionPresets = presets.filter(p => !isDetection(p));

        appendSubgroup('Detection & Very Early Warning', 'VESDA & Optical Sensors', detectionPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Suppression, Alarms & Hydrants', 'Clean Agent / Pre-Action', suppressionPresets.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'security') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'security').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isAccessPortal = (p: CatalogItemPreset) =>
          p.id.includes('turnstile') ||
          p.id.includes('mantrap') ||
          p.id.includes('maglock') ||
          p.id.includes('door') ||
          p.id.includes('access') ||
          p.name.toLowerCase().includes('turnstile') ||
          p.name.toLowerCase().includes('mantrap') ||
          p.name.toLowerCase().includes('door') ||
          p.name.toLowerCase().includes('access');

        const accessPortals = presets.filter(isAccessPortal);
        const surveillance = presets.filter(p => !isAccessPortal(p));

        appendSubgroup('Access Control & Portals', 'Biometrics & Mantraps', accessPortals.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Surveillance & Communication', '4K CCTV & Intercoms', surveillance.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'bms-dcim') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'bms-dcim').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isSensorProbe = (p: CatalogItemPreset) =>
          p.id.includes('probe') ||
          p.id.includes('sensor') ||
          p.id.includes('temp') ||
          p.id.includes('pressure') ||
          p.id.includes('delta-p') ||
          p.id.includes('tree') ||
          p.name.toLowerCase().includes('probe') ||
          p.name.toLowerCase().includes('sensor') ||
          p.name.toLowerCase().includes('pressure') ||
          p.name.toLowerCase().includes('temp');

        const sensors = presets.filter(isSensorProbe);
        const gateways = presets.filter(p => !isSensorProbe(p));

        appendSubgroup('Environmental Sensors & Probes', 'Temp / Humidity / ΔP', sensors.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Gateways & SCADA Controllers', 'DCIM & PLC Gateways', gateways.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'plumbing') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'plumbing').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isPipingHeader = (p: CatalogItemPreset) =>
          p.id.includes('chilled-water') ||
          p.id.includes('condenser') ||
          p.id.includes('manifold') ||
          p.id.includes('buffer-tank') ||
          p.id.includes('pipe') ||
          p.name.toLowerCase().includes('pipe') ||
          p.name.toLowerCase().includes('header') ||
          p.name.toLowerCase().includes('manifold') ||
          p.name.toLowerCase().includes('tank');

        const piping = presets.filter(isPipingHeader);
        const pumps = presets.filter(p => !isPipingHeader(p));

        appendSubgroup('Chilled & Condenser Water Piping', 'Headers & Liquid Loops', piping.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Pumps, Valves & Water Treatment', 'Pumps & Filtration', pumps.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'earthing') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'earthing').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isBusbarSrg = (p: CatalogItemPreset) =>
          p.id.includes('tmgb') ||
          p.id.includes('tgb') ||
          p.id.includes('srg') ||
          p.id.includes('jumper') ||
          p.id.includes('ground-bar') ||
          p.id.includes('busbar') ||
          p.name.toLowerCase().includes('tmgb') ||
          p.name.toLowerCase().includes('tgb') ||
          p.name.toLowerCase().includes('srg') ||
          p.name.toLowerCase().includes('busbar') ||
          p.name.toLowerCase().includes('bonding');

        const busbars = presets.filter(isBusbarSrg);
        const pits = presets.filter(p => !isBusbarSrg(p));

        appendSubgroup('Busbars & Ground Reference Grids', 'TMGB / TGB / SRG', busbars.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Chemical Earth Pits & Lightning', 'Pits & Air Terminals', pits.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'operations') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'operations').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isLiftTrolley = (p: CatalogItemPreset) =>
          p.id.includes('lift') ||
          p.id.includes('trolley') ||
          (p.id.includes('cart') && p.id.includes('battery')) ||
          p.id.includes('scissor') ||
          p.name.toLowerCase().includes('lift') ||
          p.name.toLowerCase().includes('trolley') ||
          p.name.toLowerCase().includes('cart');

        const lifts = presets.filter(isLiftTrolley);
        const workbenches = presets.filter(p => !isLiftTrolley(p));

        appendSubgroup('Material Handling & Lifts', 'Server Lifts & Trolleys', lifts.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Workbenches, Tools & Ladders', 'Workstations & Tooling', workbenches.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      } else if (cat.id === 'facility-plant') {
        const presets = DATACENTER_CATALOG.filter(p => p.category === 'facility-plant').filter(p => {
          if (!query) return true;
          return p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query) || p.manufacturer.toLowerCase().includes(query) || p.model.toLowerCase().includes(query);
        });

        const isSwitchgearChiller = (p: CatalogItemPreset) =>
          p.id.includes('mdb') ||
          p.id.includes('switchgear') ||
          p.id.includes('ups') ||
          p.id.includes('chiller') ||
          p.name.toLowerCase().includes('switchgear') ||
          p.name.toLowerCase().includes('ups') ||
          p.name.toLowerCase().includes('chiller');

        const switchgearChillers = presets.filter(isSwitchgearChiller);
        const utilityYard = presets.filter(p => !isSwitchgearChiller(p));

        appendSubgroup('Heavy Switchgear & Chiller Plant', 'Plant Rooms', switchgearChillers.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
        appendSubgroup('Bulk Fuel, Water & Loading Bay', 'Utility Yard', utilityYard.map(p => makePresetItemEl(p, cat.accent)), itemEls, cat.accent);
      }

      const selectableCount = itemEls.filter(el => !el.classList.contains('cat-subgroup-header')).length;
      if (query && selectableCount === 0) continue;

      const isInitiallyOpen = query ? true : (this.openCatalogFolders.has(cat.id) || cat.id === 'housing');

      const row = document.createElement('div');
      row.className = `cat-row${isInitiallyOpen ? ' open' : ''}`;
      row.innerHTML = `
        <div class="cat-accent" style="background:${cat.accent}"></div>
        <div class="cat-icon" style="color:${cat.accent}">${cat.svgHtml}</div>
        <span class="cat-label">${cat.label}</span>
        <span class="cat-count">${selectableCount}</span>
        <div class="cat-chevron">${svg('<path d="M9 18l6-6-6-6"/>')}</div>
      `;

      const itemsEl = document.createElement('div');
      itemsEl.className = `cat-items${isInitiallyOpen ? ' open' : ''}`;
      itemEls.forEach(el => itemsEl.appendChild(el));

      row.addEventListener('click', () => {
        const isOpen = row.classList.contains('open');
        row.classList.toggle('open', !isOpen);
        itemsEl.classList.toggle('open', !isOpen);
        if (isOpen) {
          this.openCatalogFolders.delete(cat.id);
        } else {
          this.openCatalogFolders.add(cat.id);
        }
      });

      accordionContainer.appendChild(row);
      accordionContainer.appendChild(itemsEl);
    }

    // Search input listener
    const searchInput = el.querySelector('#dc-cat-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e: any) => {
      this.catalogSearchQuery = e.target.value;
      this.renderCatalogPanel();
      const updatedInput = this.container.querySelector('#dc-cat-search-input') as HTMLInputElement;
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
      }
    });
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
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-primary" id="dc-btn-switch-catalog">📦 Open Equipment Catalog</button>
      <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-btn-addrack">＋ Custom Rack</button>
      <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-btn-addrow-info">▤ Add Row (Standards)</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-secondary" id="dc-btn-editfloor">✎ Edit Floor</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-secondary" id="dc-btn-clearfloor">↺ Reset to Empty Floor</button>
      <button class="dc-btn dc-btn-sm dc-btn-full dc-btn-danger" id="dc-btn-deletefloor">🗑 Delete Floor</button>
    `;
    el.querySelector('#dc-btn-switch-catalog')?.addEventListener('click', () => {
      const btnTabCatalog = this.container.querySelector('#dc-tab-btn-catalog') as HTMLElement;
      btnTabCatalog?.click();
    });
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
    setActive('dc-btn-toggle-walls', s.wallsVisible !== false);
    setActive('dc-btn-toggle-roof', s.roofVisible !== false);
    setActive('dc3d-btn-walls', s.wallsVisible !== false);
    setActive('dc3d-btn-roof', s.roofVisible !== false);

    const opacityVal = Math.round((s.floorOpacity ?? 1) * 100);
    const topbarSlider = this.container.querySelector('#dc-floor-opacity') as HTMLInputElement | null;
    if (topbarSlider && parseInt(topbarSlider.value, 10) !== opacityVal) {
      topbarSlider.value = String(opacityVal);
    }
    const threeSlider = this.container.querySelector('#dc3d-floor-opacity') as HTMLInputElement | null;
    if (threeSlider && parseInt(threeSlider.value, 10) !== opacityVal) {
      threeSlider.value = String(opacityVal);
    }

    const wallOpacityVal = Math.round((s.wallOpacity ?? 0.35) * 100);
    const wallSlider = this.container.querySelector('#dc-wall-opacity') as HTMLInputElement | null;
    if (wallSlider && parseInt(wallSlider.value, 10) !== wallOpacityVal) {
      wallSlider.value = String(wallOpacityVal);
    }

    const roofOpacityVal = Math.round((s.roofOpacity ?? (floor?.roofOpacity ?? 0.30)) * 100);
    const roofSlider = this.container.querySelector('#dc-roof-opacity') as HTMLInputElement | null;
    if (roofSlider && parseInt(roofSlider.value, 10) !== roofOpacityVal) {
      roofSlider.value = String(roofOpacityVal);
    }
    const threeRoofSlider = this.container.querySelector('#dc3d-roof-opacity') as HTMLInputElement | null;
    if (threeRoofSlider && parseInt(threeRoofSlider.value, 10) !== roofOpacityVal) {
      threeRoofSlider.value = String(roofOpacityVal);
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
    if (floor) {
      this.updateInfoPanel(floor);
    }
    this.renderCatalogPanel();
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
          const spaceBadge = rack.spaceType === 'grey-space' 
            ? '<span class="dc-space-badge grey-space">🏭 Grey Space</span>' 
            : '<span class="dc-space-badge white-space">🏢 White Space</span>';
          const devices = stateManager.getState().devices?.filter(d => d.rackId === rack.id) || [];
          const usedU = devices.reduce((sum, d) => sum + (getTemplate(d.templateId)?.heightUnits || 1), 0);

          const tileM = (floor.tileSizeMm || 600) / 1000;
          const colIdx = Math.floor(rack.position.x / tileM);
          const rowIdx = Math.floor(rack.position.y / tileM);
          const rowLabel = getRowLabel(rowIdx, floor.rowScheme ?? 'letters');
          const colLabel = getColLabel(colIdx, floor.colScheme ?? 'numbers', floor.addressFormat ?? 'compact');
          const gridAddr = `${rowLabel}-${colLabel}`;

          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">Properties ${spaceBadge} ${typeBadge}</div>
              <div class="dc-info-row"><span class="dc-info-label">ID</span><span class="dc-info-val">${rack.id}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val">${rack.name}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Grid Addr</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${gridAddr}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val"><b>${rack.type.toUpperCase()}</b></span></div>
              ${rack.equipmentCategory ? `<div class="dc-info-row"><span class="dc-info-label">Category</span><span class="dc-info-val" style="color:#cbd5e1;font-weight:600;">${rack.equipmentCategory.replace('-', ' ').toUpperCase()}</span></div>` : ''}
              <div class="dc-info-row"><span class="dc-info-label">Size</span><span class="dc-info-val">${formatDimensionsMm(rack.widthMm, rack.depthMm, unit === 'm' ? 'mm' : unit)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Height</span><span class="dc-info-val">${formatRackHeight(rack.heightU)}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Capacity</span><span class="dc-info-val" style="color:#38bdf8;font-weight:600;">${devices.length} dev • ${usedU}/${rack.heightU}U</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Max Power</span><span class="dc-info-val" style="color:#ffd21a;font-weight:600;">${rack.maxPowerKw ?? 20} kW</span></div>
              ${rack.coolingCapacityKw ? `<div class="dc-info-row"><span class="dc-info-label">Cooling</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">❄ ${rack.coolingCapacityKw} kW</span></div>` : ''}
              ${rack.upsCapacityKva ? `<div class="dc-info-row"><span class="dc-info-label">UPS Rating</span><span class="dc-info-val" style="color:#10b981;font-weight:700;">⚡ ${rack.upsCapacityKva} kVA</span></div>` : ''}
              ${rack.pduVoltage ? `<div class="dc-info-row"><span class="dc-info-label">PDU Spec</span><span class="dc-info-val" style="color:#f59e0b;font-weight:600;">${rack.pduVoltage} • ${rack.pduPhases ?? 3}P • ${rack.pduAmperage ?? 32}A (${rack.pduOutletCount ?? 24} Outlets)</span></div>` : ''}
              ${rack.busbarAmps ? `<div class="dc-info-row"><span class="dc-info-label">Busbar</span><span class="dc-info-val" style="color:#eab308;font-weight:700;">⚡ ${rack.busbarAmps} A Busway</span></div>` : ''}
              ${rack.transformerKva ? `<div class="dc-info-row"><span class="dc-info-label">Transformer</span><span class="dc-info-val" style="color:#f97316;font-weight:700;">⚡ ${rack.transformerKva} kVA Step-Down</span></div>` : ''}
              ${rack.securityLock ? `<div class="dc-info-row"><span class="dc-info-label">Security</span><span class="dc-info-val" style="color:#a855f7;font-weight:600;">🔒 ${rack.securityLock.toUpperCase()} Access</span></div>` : ''}
              ${rack.containmentType && rack.containmentType !== 'none' ? `<div class="dc-info-row"><span class="dc-info-label">Containment</span><span class="dc-info-val" style="color:#38bdf8;font-weight:600;">🛡 ${rack.containmentType.toUpperCase()}</span></div>` : ''}
              <div class="dc-info-row" style="margin-top:4px;padding-top:4px;border-top:1px solid #1e293b;">
                <span class="dc-info-label" style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" id="${isGlobal ? 'g-dc-rack-show-gauge' : 'dc-rack-show-gauge'}" ${rack.showGauge ? 'checked' : ''} style="cursor:pointer;accent-color:#38bdf8;width:14px;height:14px;margin:0;"/>
                  <label for="${isGlobal ? 'g-dc-rack-show-gauge' : 'dc-rack-show-gauge'}" style="cursor:pointer;color:#f0f6fc;font-weight:600;">3D Gauge HUD</label>
                </span>
                <span class="dc-info-val" style="color:${rack.showGauge ? '#38bdf8' : '#64748b'};font-weight:600;">${rack.showGauge ? 'Enabled' : 'Disabled'}</span>
              </div>
              ${rack.showGauge ? `
              <div class="dc-info-row">
                <span class="dc-info-label" style="display:flex;align-items:center;gap:4px;padding-left:20px;font-size:11px;color:#94a3b8;">HUD Type</span>
                <select id="${isGlobal ? 'g-dc-rack-gauge-style' : 'dc-rack-gauge-style'}" class="dc-input" style="width:138px;padding:2px 4px;font-size:11px;height:24px;background:#0d1520;color:#38bdf8;border:1px solid #304560;border-radius:4px;font-weight:600;">
                  <option value="radial" ${(rack.gaugeStyle ?? 'radial') === 'radial' ? 'selected' : ''}>Radial Dial (Classic)</option>
                  <option value="linear" ${rack.gaugeStyle === 'linear' ? 'selected' : ''}>2 Horizontal Bars (CSS)</option>
                </select>
              </div>
              ` : ''}
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
          el.querySelector(`${prefix}dc-rack-show-gauge`)?.addEventListener('change', (e: any) => {
            const showGauge = !!e.target.checked;
            dcState.updateRack(rack.id, { showGauge });
            this.renderPropsPanel();
            const activeFloor = dcState.getActiveFloor();
            if (activeFloor) this.rebuildThreeScene(activeFloor);
          });
          el.querySelector(`${prefix}dc-rack-gauge-style`)?.addEventListener('change', (e: any) => {
            const newStyle = e.target.value as 'radial' | 'linear';
            dcState.updateRack(rack.id, { gaugeStyle: newStyle });
            this.renderPropsPanel();
            const activeFloor = dcState.getActiveFloor();
            if (activeFloor) this.rebuildThreeScene(activeFloor);
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
              ${tile.type === 'air-channel' ? `
                <div class="dc-info-row">
                  <span class="dc-info-label">Air Direction</span>
                  <select id="dc-tile-ac-dir" class="dc-input" style="width:130px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                    <option value="north" ${(tile.airflowDir || 'north') === 'north' ? 'selected' : ''}>North (⬆)</option>
                    <option value="south" ${tile.airflowDir === 'south' ? 'selected' : ''}>South (⬇)</option>
                    <option value="east" ${tile.airflowDir === 'east' ? 'selected' : ''}>East (➡)</option>
                    <option value="west" ${tile.airflowDir === 'west' ? 'selected' : ''}>West (⬅)</option>
                  </select>
                </div>
                <div class="dc-info-row">
                  <span class="dc-info-label">Vent Depth</span>
                  <select id="dc-tile-ac-depth" class="dc-input" style="width:130px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                    <option value="200" ${tile.airChannelHeightMm === 200 ? 'selected' : ''}>200 mm (Slim)</option>
                    <option value="300" ${(tile.airChannelHeightMm || 300) === 300 ? 'selected' : ''}>300 mm (Standard - Clears Ducts)</option>
                    <option value="400" ${tile.airChannelHeightMm === 400 ? 'selected' : ''}>400 mm (High Flow)</option>
                  </select>
                </div>
              ` : ''}
              <div class="dc-info-row"><span class="dc-info-label">Plenum</span><span class="dc-info-val">${floor.raisedFloorHeightMm || 450} mm</span></div>
            </div>
            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-vent">🔲 Set to Ventilated Grille</button>
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-perf">▦ Set to Perforated / Vented</button>
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-tile-btn-ac">💨 Under-Floor Air Channel (300mm)</button>
              <button class="dc-btn dc-btn-sm dc-btn-full" id="dc-tile-btn-addinfra">⚡ Add Cable Tray / Duct</button>
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-tile-btn-std">↺ Convert to Standard</button>
            </div>
          `;

          el.querySelector('#dc-tile-ac-dir')?.addEventListener('change', (e: any) => {
            const dir = e.target.value as DcAirflowDirection;
            dcState.setFloorTileType(tile.id, 'air-channel', dir, tile.airChannelHeightMm || 300);
            this.refresh();
          });

          el.querySelector('#dc-tile-ac-depth')?.addEventListener('change', (e: any) => {
            const depth = parseInt(e.target.value, 10) || 300;
            dcState.setFloorTileType(tile.id, 'air-channel', tile.airflowDir || 'north', depth);
            this.refresh();
          });

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
            dcState.setFloorTileType(tile.id, 'air-channel', nextDir, 300);
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
        const baseId = s.selectedInfraId.includes('_sub') ? s.selectedInfraId.split('_sub')[0] : s.selectedInfraId;
        const item = floor.infrastructure.find(i => i.id === s.selectedInfraId || i.id === baseId);
        if (item) {
          const lenM = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
          const sub = item.subtype || (item.category === 'cable-duct' ? 'pvc-duct' : item.category === 'cable-tray' ? 'basket-tray' : 'cable');

          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">⚡ Raceway & Pathway Properties</div>
              <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${item.name}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Length</span><span class="dc-info-val">${lenM.toFixed(2)} m (${(lenM / (floor.tileSizeMm / 1000)).toFixed(1)} tiles)</span></div>
              
              <!-- Pathway Subtype / Material Switcher -->
              <div class="dc-info-row">
                <span class="dc-info-label">Raceway Type</span>
                <select id="dc-infra-subtype" class="dc-input" style="width:138px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                  <option value="pvc-duct" ${sub === 'pvc-duct' ? 'selected' : ''}>PVC Solid Duct</option>
                  <option value="solid-duct" ${sub === 'solid-duct' ? 'selected' : ''}>Solid Metal Duct</option>
                  <option value="basket-tray" ${sub === 'basket-tray' ? 'selected' : ''}>Wire Basket Tray</option>
                  <option value="ladder-rack" ${sub === 'ladder-rack' ? 'selected' : ''}>Ladder Cable Runway</option>
                  <option value="fiber-raceway" ${sub === 'fiber-raceway' ? 'selected' : ''}>Yellow Fiber Raceway</option>
                  <option value="busway" ${sub === 'busway' ? 'selected' : ''}>Power Busway Bar</option>
                  <option value="conduit" ${sub === 'conduit' ? 'selected' : ''}>EMT Metallic Conduit</option>
                </select>
              </div>

              <!-- Pathway Width -->
              <div class="dc-info-row">
                <span class="dc-info-label">Width (mm)</span>
                <select id="dc-infra-width" class="dc-input" style="width:138px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                  <option value="100" ${item.widthMm === 100 ? 'selected' : ''}>100 mm (4 in)</option>
                  <option value="150" ${item.widthMm === 150 ? 'selected' : ''}>150 mm (6 in)</option>
                  <option value="200" ${item.widthMm === 200 ? 'selected' : ''}>200 mm (8 in)</option>
                  <option value="300" ${item.widthMm === 300 ? 'selected' : ''}>300 mm (12 in)</option>
                  <option value="400" ${(item.widthMm || 400) === 400 ? 'selected' : ''}>400 mm (16 in)</option>
                  <option value="500" ${item.widthMm === 500 ? 'selected' : ''}>500 mm (20 in)</option>
                  <option value="600" ${item.widthMm === 600 ? 'selected' : ''}>600 mm (24 in - Tile Width)</option>
                </select>
              </div>

              <!-- Pathway Height -->
              <div class="dc-info-row">
                <span class="dc-info-label">Height (mm)</span>
                <select id="dc-infra-height" class="dc-input" style="width:138px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                  <option value="50" ${item.heightMm === 50 ? 'selected' : ''}>50 mm (2 in)</option>
                  <option value="80" ${(item.heightMm || 80) === 80 ? 'selected' : ''}>80 mm (3.2 in)</option>
                  <option value="100" ${item.heightMm === 100 ? 'selected' : ''}>100 mm (4 in)</option>
                  <option value="150" ${item.heightMm === 150 ? 'selected' : ''}>150 mm (6 in)</option>
                </select>
              </div>

              <!-- Floor Elevation & Slab Sticking -->
              <div class="dc-info-row">
                <span class="dc-info-label">Elevation</span>
                <select id="dc-infra-elev" class="dc-input" style="width:138px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                  <option value="slab" ${item.layer === 'underfloor' && item.mountType !== 'bracket' ? 'selected' : ''}>Sticks to Subfloor Slab (Base)</option>
                  <option value="mid-plenum" ${item.layer === 'underfloor' && item.mountType === 'bracket' ? 'selected' : ''}>Mid-Plenum Bracket (-220mm)</option>
                  <option value="overhead" ${item.layer === 'overhead' ? 'selected' : ''}>Overhead Trapeze (+2600mm)</option>
                </select>
              </div>

              <div class="dc-info-row"><span class="dc-info-label">Start</span><span class="dc-info-val">(${item.start.x.toFixed(2)}m, ${item.start.y.toFixed(2)}m)</span></div>
              <div class="dc-info-row"><span class="dc-info-label">End</span><span class="dc-info-val">(${item.end.x.toFixed(2)}m, ${item.end.y.toFixed(2)}m)</span></div>
            </div>
            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-infra-stick-slab">⚓ Stick to Floor Slab</button>
              <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-infra-dup">⊕ Duplicate Raceway</button>
              <button class="dc-btn dc-btn-sm dc-btn-danger dc-btn-full" id="dc-infra-delete">🗑 Delete Infrastructure</button>
            </div>
          `;

          el.querySelector('#dc-infra-subtype')?.addEventListener('change', (e: any) => {
            const newSub = e.target.value;
            const catMap: Record<string, DcInfraCategory> = {
              'pvc-duct': 'cable-duct',
              'solid-duct': 'cable-duct',
              'basket-tray': 'cable-tray',
              'ladder-rack': 'cable-tray',
              'fiber-raceway': 'fiber-raceway',
              'busway': 'busway',
              'conduit': 'conduit',
            };
            const cat = catMap[newSub] || 'cable-duct';
            const name = newSub === 'pvc-duct' ? 'PVC Cable Duct'
              : newSub === 'solid-duct' ? 'Galvanized Solid Duct'
              : newSub === 'basket-tray' ? 'Wire Basket Tray'
              : newSub === 'ladder-rack' ? 'Ladder Cable Runway'
              : newSub === 'fiber-raceway' ? 'Yellow Fiber Optic Raceway'
              : newSub === 'busway' ? 'Power Busway Feeder'
              : 'Metallic Conduit';

            dcState.updateInfrastructureItem(item.id, { subtype: newSub, category: cat, name });
            this.refresh();
            eventBus.emit('notification', { message: `Updated raceway to ${name}.`, type: 'success' });
          });

          el.querySelector('#dc-infra-width')?.addEventListener('change', (e: any) => {
            const w = parseInt(e.target.value, 10) || 400;
            dcState.updateInfrastructureItem(item.id, { widthMm: w });
            this.refresh();
            eventBus.emit('notification', { message: `Updated raceway width to ${w}mm.`, type: 'info' });
          });

          el.querySelector('#dc-infra-height')?.addEventListener('change', (e: any) => {
            const h = parseInt(e.target.value, 10) || 80;
            dcState.updateInfrastructureItem(item.id, { heightMm: h });
            this.refresh();
          });

          el.querySelector('#dc-infra-elev')?.addEventListener('change', (e: any) => {
            const val = e.target.value;
            const plenumDepthMm = floor.raisedFloorHeightMm || 450;
            if (val === 'slab') {
              dcState.updateInfrastructureItem(item.id, {
                layer: 'underfloor',
                mountType: 'slab-resting',
                elevationMm: -(plenumDepthMm - (item.heightMm || 80) / 2),
              });
              eventBus.emit('notification', { message: 'Set raceway to stick firmly to subfloor concrete slab.', type: 'success' });
            } else if (val === 'mid-plenum') {
              dcState.updateInfrastructureItem(item.id, {
                layer: 'underfloor',
                mountType: 'bracket',
                elevationMm: -220,
              });
            } else if (val === 'overhead') {
              dcState.updateInfrastructureItem(item.id, {
                layer: 'overhead',
                mountType: 'trapeze',
                elevationMm: 2600,
              });
            }
            this.refresh();
          });

          el.querySelector('#dc-infra-stick-slab')?.addEventListener('click', () => {
            const plenumDepthMm = floor.raisedFloorHeightMm || 450;
            dcState.updateInfrastructureItem(item.id, {
              layer: 'underfloor',
              mountType: 'slab-resting',
              elevationMm: -(plenumDepthMm - (item.heightMm || 80) / 2),
            });
            this.refresh();
            eventBus.emit('notification', { message: 'Raceway anchored directly to concrete slab.', type: 'success' });
          });

          el.querySelector('#dc-infra-dup')?.addEventListener('click', () => {
            const tileM = floor.tileSizeMm / 1000;
            const dupId = 'INFRA-' + Date.now().toString(36).toUpperCase();
            const dupItem: DcInfrastructureItem = {
              ...item,
              id: dupId,
              name: `${item.name} (Copy)`,
              start: { ...item.start, y: item.start.y + tileM },
              end: { ...item.end, y: item.end.y + tileM },
            };
            dcState.addInfrastructureItem(dupItem);
            dcState.setState({ selectedInfraId: dupId });
            this.refresh();
          });

          el.querySelector('#dc-infra-delete')?.addEventListener('click', () => {
            if (confirm(`Delete infrastructure "${item.name}"?`)) {
              dcState.deleteInfrastructureItem(item.id);
              this.refresh();
            }
          });
          return;
        }
      }

      if (s.selectedWallId && floor && floor.walls) {
        const wall = floor.walls.find(w => w.id === s.selectedWallId);
        if (wall) {
          if (s.selectedWallItemId && wall.items) {
            const item = wall.items.find(it => it.id === s.selectedWallItemId);
            if (item) {
              const pct = Math.round(item.positionRatio * 100);
              el.innerHTML = `
                <div class="dc-props-section">
                  <div class="dc-props-title">🧱 Wall-Mounted Equipment</div>
                  <div class="dc-info-row"><span class="dc-info-label">Item</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${item.name}</span></div>
                  <div class="dc-info-row"><span class="dc-info-label">Type</span><span class="dc-info-val"><b>${item.type.toUpperCase()}</b></span></div>
                  <div class="dc-info-row"><span class="dc-info-label">Attached To</span><span class="dc-info-val">${wall.name || 'Wall'}</span></div>
                  <div class="dc-info-row"><span class="dc-info-label">Dimensions</span><span class="dc-info-val">${item.widthMm}×${item.heightMm}×${item.depthMm} mm</span></div>
                  
                  <div class="dc-info-row">
                    <span class="dc-info-label">Mount Height</span>
                    <input id="dc-wallitem-height" type="number" step="0.1" min="0.1" max="5.0" value="${item.heightOffsetM}" class="dc-input" style="width:70px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;"/> m
                  </div>

                  <div class="dc-info-row">
                    <span class="dc-info-label">Position (${pct}%)</span>
                    <input id="dc-wallitem-ratio" type="range" min="5" max="95" value="${pct}" class="dc-slider" style="flex:1;"/>
                  </div>

                  <div class="dc-info-row">
                    <span class="dc-info-label">Mount Face</span>
                    <select id="dc-wallitem-side" class="dc-input" style="width:90px;height:24px;padding:2px 4px;font-size:11px;background:#0d1520;color:#38bdf8;font-weight:600;">
                      <option value="inner" ${item.side === 'inner' ? 'selected' : ''}>Inner Room</option>
                      <option value="outer" ${item.side === 'outer' ? 'selected' : ''}>Outer Room</option>
                    </select>
                  </div>
                </div>

                <div class="dc-props-actions">
                  <button class="dc-btn dc-btn-sm dc-btn-secondary dc-btn-full" id="dc-wallitem-btn-back">← Select Wall</button>
                  <button class="dc-btn dc-btn-sm dc-btn-danger dc-btn-full" id="dc-wallitem-btn-delete">🗑 Remove Equipment</button>
                </div>
              `;

              el.querySelector('#dc-wallitem-height')?.addEventListener('change', (e: any) => {
                const val = parseFloat(e.target.value) || 1.4;
                dcState.updateWallItem(wall.id, item.id, { heightOffsetM: val });
                this.refresh();
              });

              el.querySelector('#dc-wallitem-ratio')?.addEventListener('input', (e: any) => {
                const ratio = parseFloat(e.target.value) / 100;
                dcState.updateWallItem(wall.id, item.id, { positionRatio: ratio });
                this.refresh();
              });

              el.querySelector('#dc-wallitem-side')?.addEventListener('change', (e: any) => {
                const side = e.target.value as 'inner' | 'outer';
                dcState.updateWallItem(wall.id, item.id, { side });
                this.refresh();
              });

              el.querySelector('#dc-wallitem-btn-back')?.addEventListener('click', () => {
                dcState.setState({ selectedWallItemId: null });
                this.refresh();
              });

              el.querySelector('#dc-wallitem-btn-delete')?.addEventListener('click', () => {
                if (confirm(`Remove "${item.name}" from wall?`)) {
                  dcState.deleteWallItem(wall.id, item.id);
                  dcState.setState({ selectedWallItemId: null });
                  this.refresh();
                }
              });
              return;
            }
          }

          // Wall segment itself
          const lenM = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
          const opacityPct = Math.round((wall.opacity !== undefined ? wall.opacity : 0.35) * 100);
          const itemCount = wall.items?.length || 0;

          el.innerHTML = `
            <div class="dc-props-section">
              <div class="dc-props-title">🏛 Transparent Perimeter Wall</div>
              <div class="dc-info-row"><span class="dc-info-label">Name</span><span class="dc-info-val" style="color:#38bdf8;font-weight:700;">${wall.name}</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Side</span><span class="dc-info-val"><b>${(wall.side || 'custom').toUpperCase()}</b></span></div>
              <div class="dc-info-row"><span class="dc-info-label">Length</span><span class="dc-info-val">${lenM.toFixed(2)} m</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Thickness</span><span class="dc-info-val">${wall.thicknessMm} mm</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Height</span><span class="dc-info-val">${wall.heightM} m</span></div>
              
              <div class="dc-info-row">
                <span class="dc-info-label">Opacity (${opacityPct}%)</span>
                <input id="dc-wall-seg-opacity" type="range" min="0" max="100" value="${opacityPct}" class="dc-slider" style="flex:1;"/>
              </div>

              <div class="dc-info-row"><span class="dc-info-label">Start Coord</span><span class="dc-info-val">(${wall.start.x.toFixed(2)}m, ${wall.start.y.toFixed(2)}m)</span></div>
              <div class="dc-info-row"><span class="dc-info-label">End Coord</span><span class="dc-info-val">(${wall.end.x.toFixed(2)}m, ${wall.end.y.toFixed(2)}m)</span></div>
              <div class="dc-info-row"><span class="dc-info-label">Wall Items</span><span class="dc-info-val" style="color:#38bdf8;font-weight:600;">${itemCount} mounted</span></div>
            </div>

            ${itemCount > 0 ? `
              <div class="dc-props-section" style="margin-top:8px;">
                <div class="dc-props-title" style="font-size:11px;">Mounted Equipment List</div>
                <div style="display:flex;flex-direction:column;gap:4px;max-height:120px;overflow-y:auto;">
                  ${wall.items!.map(it => `
                    <div class="dc-wall-item-row" data-select-wallitem="${it.id}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:4px;cursor:pointer;font-size:11px;">
                      <span style="color:#f0f6fc;">${it.name}</span>
                      <span style="color:#38bdf8;">${Math.round(it.positionRatio * 100)}%</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div class="dc-props-actions">
              <button class="dc-btn dc-btn-sm dc-btn-primary dc-btn-full" id="dc-wall-btn-add-item">＋ Attach Equipment (Catalog)</button>
              <button class="dc-btn dc-btn-sm dc-btn-danger dc-btn-full" id="dc-wall-btn-delete">🗑 Delete Wall Segment</button>
            </div>
          `;

          el.querySelector('#dc-wall-seg-opacity')?.addEventListener('input', (e: any) => {
            const val = parseInt(e.target.value, 10) / 100;
            dcState.updateWall(wall.id, { opacity: val });
            this.refresh();
          });

          el.querySelectorAll('[data-select-wallitem]').forEach(row => {
            row.addEventListener('click', () => {
              const itemId = row.getAttribute('data-select-wallitem');
              if (itemId) {
                dcState.setState({ selectedWallItemId: itemId });
                this.refresh();
              }
            });
          });

          el.querySelector('#dc-wall-btn-add-item')?.addEventListener('click', () => {
            dcState.setState({ activeCatalogCategory: 'wall-equipment' as any });
            const tabCatalog = this.container.querySelector('#dc-tab-btn-catalog') as HTMLElement;
            tabCatalog?.click();
            this.renderCatalogPanel();
          });

          el.querySelector('#dc-wall-btn-delete')?.addEventListener('click', () => {
            if (confirm(`Delete wall segment "${wall.name}"?`)) {
              dcState.deleteWall(wall.id);
              dcState.setState({ selectedWallId: null, selectedWallItemId: null });
              this.refresh();
            }
          });
          return;
        }
      }

      el.innerHTML = '<div class="properties-empty">Select a rack, ESD tile, pathway, or perimeter wall to view details.</div>';
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
      rackWidth: rack.widthMm === 800 ? '23-inch' : '19-inch',
      rackType: (rack.type === 'open-frame' ? 'open-frame' : rack.type === 'network' ? 'network' : rack.type === 'wall-mount' ? 'wall-mount' : 'server') as any,
      frontDoor: rack.doorStyle as any,
      mounting: rack.mounting === 'wall-mount' ? 'wall-mount' : 'floor',
      rackColor: rack.color ?? '#1e3a5f',
      x: posX,
      y: posY,
      leftCableManagerWidth: rack.leftCableManagerWidth || existing?.leftCableManagerWidth || 'none',
      rightCableManagerWidth: rack.rightCableManagerWidth || existing?.rightCableManagerWidth || 'none',
      leftPduId: rack.leftPduId || existing?.leftPduId,
      rightPduId: rack.rightPduId || existing?.rightPduId,
    };

    const finalRacks = [...otherRacks, targetRack];

    stateManager.setState({
      racks: finalRacks,
      selection: [{ type: 'rack', id: rack.id }],
      activeElevationRackId: rack.id,
      workflowMode: 'datacenter',
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
      this.refresh();
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
      mounting: targetDcRack.mounting === 'wall-mount' ? 'wall-mount' : 'floor',
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
      
      <div class="dc-menu-separator"></div>
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
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;">
          <input id="dr-show-gauge" type="checkbox" ${rack.showGauge ? 'checked' : ''} style="cursor:pointer;accent-color:#38bdf8;width:15px;height:15px;"/>
          <span style="font-weight:600;">Enable 3D HUD Gauge Overlay</span>
        </label>
        <label>3D HUD Gauge Design
          <select id="dr-gauge-style" class="dc-input">
            <option value="radial"${(rack.gaugeStyle ?? 'radial') === 'radial' ? ' selected' : ''}>Radial Dual Arc Dial (Classic)</option>
            <option value="linear"${rack.gaugeStyle === 'linear' ? ' selected' : ''}>2 Horizontal Bars (CSS Style)</option>
          </select>
        </label>
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
      const showGauge = (document.getElementById('dr-show-gauge') as HTMLInputElement)?.checked ?? false;
      const gaugeStyle = (document.getElementById('dr-gauge-style') as HTMLSelectElement).value as DcGaugeStyle;
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
        showGauge,
        gaugeStyle,
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

  private hitTestWall(wall: DcWallSegment, xM: number, yM: number, hitThresholdM: number = 0.25): boolean {
    const x1 = wall.start.x;
    const y1 = wall.start.y;
    const x2 = wall.end.x;
    const y2 = wall.end.y;
    const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (lenSq === 0) return Math.hypot(xM - x1, yM - y1) <= hitThresholdM;

    const t = Math.max(0, Math.min(1, ((xM - x1) * (x2 - x1) + (yM - y1) * (y2 - y1)) / lenSq));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    const dist = Math.hypot(xM - projX, yM - projY);
    const wallThickM = (wall.thicknessMm || 150) / 1000;
    return dist <= Math.max(hitThresholdM, wallThickM / 2 + 0.15);
  }

  private hitTestWallHandle(wall: DcWallSegment, xM: number, yM: number, radiusM: number = 0.3): 'start' | 'end' | null {
    if (Math.hypot(xM - wall.start.x, yM - wall.start.y) <= radiusM) return 'start';
    if (Math.hypot(xM - wall.end.x, yM - wall.end.y) <= radiusM) return 'end';
    return null;
  }

  private hitTestWallItem(wall: DcWallSegment, item: DcWallItem, xM: number, yM: number, radiusM: number = 0.35): boolean {
    const ix = wall.start.x + (wall.end.x - wall.start.x) * item.positionRatio;
    const iy = wall.start.y + (wall.end.y - wall.start.y) * item.positionRatio;
    return Math.hypot(xM - ix, yM - iy) <= radiusM;
  }

  public showPerimeterWallsModal() {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const currentWalls = floor.walls || [];
    const hasNorth = currentWalls.some(w => w.side === 'north');
    const hasSouth = currentWalls.some(w => w.side === 'south');
    const hasEast = currentWalls.some(w => w.side === 'east');
    const hasWest = currentWalls.some(w => w.side === 'west');
    const defaultOpacity = currentWalls.length > 0 ? (currentWalls[0].opacity ?? 0.35) : 0.35;
    const defaultHeight = currentWalls.length > 0 ? (currentWalls[0].heightM ?? 3.2) : 3.2;
    const defaultThickness = currentWalls.length > 0 ? (currentWalls[0].thicknessMm ?? 150) : 150;

    const html = `
      <div class="dc-form">
        <p class="dc-muted" style="margin-bottom:12px; font-size:12px; line-height:1.4;">
          Configure transparent glass perimeter walls to define data hall borders. You can select individual sides, customize glass transparency, wall height, and thickness.
        </p>
        <div class="dc-wall-side-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <label class="dc-checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; background:#1e293b; padding:8px 12px; border-radius:6px; border:1px solid #334155;">
            <input type="checkbox" id="dc-wall-north" ${hasNorth || currentWalls.length === 0 ? 'checked' : ''} />
            <span>⬆ North Wall (Top)</span>
          </label>
          <label class="dc-checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; background:#1e293b; padding:8px 12px; border-radius:6px; border:1px solid #334155;">
            <input type="checkbox" id="dc-wall-east" ${hasEast || currentWalls.length === 0 ? 'checked' : ''} />
            <span>➡ East Wall (Right)</span>
          </label>
          <label class="dc-checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; background:#1e293b; padding:8px 12px; border-radius:6px; border:1px solid #334155;">
            <input type="checkbox" id="dc-wall-south" ${hasSouth || currentWalls.length === 0 ? 'checked' : ''} />
            <span>⬇ South Wall (Bottom)</span>
          </label>
          <label class="dc-checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; background:#1e293b; padding:8px 12px; border-radius:6px; border:1px solid #334155;">
            <input type="checkbox" id="dc-wall-west" ${hasWest || currentWalls.length === 0 ? 'checked' : ''} />
            <span>⬅ West Wall (Left)</span>
          </label>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:14px;">
          <button type="button" class="dc-btn dc-btn-sm dc-btn-secondary" id="dc-wall-preset-all" style="flex:1;">Select All 4</button>
          <button type="button" class="dc-btn dc-btn-sm dc-btn-secondary" id="dc-wall-preset-3side" style="flex:1;">3 Sides (Open Front)</button>
          <button type="button" class="dc-btn dc-btn-sm dc-btn-secondary" id="dc-wall-preset-clear" style="flex:1;">Clear All</button>
        </div>

        <div class="dc-form-row" style="margin-bottom:12px;">
          <label>Glass Transparency / Opacity (<span id="dc-wall-modal-opacity-val">${Math.round(defaultOpacity * 100)}%</span>)</label>
          <input type="range" id="dc-wall-modal-opacity" min="0" max="100" value="${Math.round(defaultOpacity * 100)}" class="dc-slider" style="width:100%;" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="dc-form-row">
            <label>Wall Height (m)</label>
            <input type="number" id="dc-wall-modal-height" step="0.1" min="2.0" max="6.0" value="${defaultHeight}" class="dc-input" />
          </div>
          <div class="dc-form-row">
            <label>Wall Thickness (mm)</label>
            <input type="number" id="dc-wall-modal-thickness" step="10" min="50" max="400" value="${defaultThickness}" class="dc-input" />
          </div>
        </div>
      </div>
    `;

    this.showModal('🏛 Configure Perimeter Walls', html, 'Apply Walls', () => {
      const north = (document.getElementById('dc-wall-north') as HTMLInputElement)?.checked;
      const east = (document.getElementById('dc-wall-east') as HTMLInputElement)?.checked;
      const south = (document.getElementById('dc-wall-south') as HTMLInputElement)?.checked;
      const west = (document.getElementById('dc-wall-west') as HTMLInputElement)?.checked;
      const opacity = parseInt((document.getElementById('dc-wall-modal-opacity') as HTMLInputElement)?.value || '35', 10) / 100;
      const heightM = parseFloat((document.getElementById('dc-wall-modal-height') as HTMLInputElement)?.value || '3.2');
      const thicknessMm = parseFloat((document.getElementById('dc-wall-modal-thickness') as HTMLInputElement)?.value || '150');

      const sides: DcWallSide[] = [];
      if (north) sides.push('north');
      if (east) sides.push('east');
      if (south) sides.push('south');
      if (west) sides.push('west');

      dcState.generatePerimeterWalls(sides, opacity, heightM, thicknessMm);
      const updatedFloor = dcState.getActiveFloor();
      if (updatedFloor) {
        this.rebuildThreeScene(updatedFloor);
        this.draw();
        this.renderPropsPanel();
      }
      return true;
    });

    const modalEl = document.getElementById('dc-modal-overlay');
    if (modalEl) {
      const opSlider = modalEl.querySelector('#dc-wall-modal-opacity') as HTMLInputElement;
      const opVal = modalEl.querySelector('#dc-wall-modal-opacity-val') as HTMLElement;
      opSlider?.addEventListener('input', () => {
        if (opVal) opVal.textContent = `${opSlider.value}%`;
      });
      modalEl.querySelector('#dc-wall-preset-all')?.addEventListener('click', () => {
        ['north', 'east', 'south', 'west'].forEach(s => {
          const el = modalEl.querySelector(`#dc-wall-${s}`) as HTMLInputElement;
          if (el) el.checked = true;
        });
      });
      modalEl.querySelector('#dc-wall-preset-3side')?.addEventListener('click', () => {
        ['north', 'east', 'west'].forEach(s => {
          const el = modalEl.querySelector(`#dc-wall-${s}`) as HTMLInputElement;
          if (el) el.checked = true;
        });
        const southEl = modalEl.querySelector('#dc-wall-south') as HTMLInputElement;
        if (southEl) southEl.checked = false;
      });
      modalEl.querySelector('#dc-wall-preset-clear')?.addEventListener('click', () => {
        ['north', 'east', 'south', 'west'].forEach(s => {
          const el = modalEl.querySelector(`#dc-wall-${s}`) as HTMLInputElement;
          if (el) el.checked = false;
        });
      });
    }
  }

  public showRoofConfigModal() {
    const floor = dcState.getActiveFloor();
    if (!floor) return;

    const defaultHeight = floor.roofHeightM ?? 3.8;
    const defaultOpacity = floor.roofOpacity !== undefined ? floor.roofOpacity : (dcState.getState().roofOpacity ?? 0.30);
    const defaultColor = floor.roofColor || '#38bdf8';

    const html = `
      <div class="dc-form">
        <p class="dc-muted" style="margin-bottom:12px; font-size:12px; line-height:1.4;">
          Configure the transparent data hall roof slab matching your carpet area (${formatDimensionsMeters(floor.lengthM, floor.widthM, floor.unit ?? 'm')}). Includes architectural structural T-bar ceiling grid and recessed daylight LED troffer luminaires.
        </p>

        <div class="dc-form-row" style="margin-bottom:12px;">
          <label>Roof / Ceiling Height (m) above raised floor</label>
          <input type="number" id="dc-roof-modal-height" step="0.1" min="2.4" max="8.0" value="${defaultHeight}" class="dc-input" />
          <span class="dc-muted" style="font-size:11px;">Standard commercial data hall ceiling heights: 3.2m - 4.5m</span>
        </div>

        <div class="dc-form-row" style="margin-bottom:12px;">
          <label>Glass Transparency / Opacity (<span id="dc-roof-modal-opacity-val">${Math.round(defaultOpacity * 100)}%</span>)</label>
          <input type="range" id="dc-roof-modal-opacity" min="0" max="100" value="${Math.round(defaultOpacity * 100)}" class="dc-slider" style="width:100%;" />
        </div>

        <div class="dc-form-row" style="margin-bottom:12px;">
          <label>Glass Tint Style & Color</label>
          <select id="dc-roof-modal-color" class="dc-select">
            <option value="#38bdf8" ${defaultColor === '#38bdf8' ? 'selected' : ''}>Cyan Glass (Architectural)</option>
            <option value="#64748b" ${defaultColor === '#64748b' ? 'selected' : ''}>Smoked Slate Glass</option>
            <option value="#e0f2fe" ${defaultColor === '#e0f2fe' ? 'selected' : ''}>Cleanroom Clear Crystal</option>
            <option value="#0284c7" ${defaultColor === '#0284c7' ? 'selected' : ''}>Deep Blue Glass</option>
            <option value="#10b981" ${defaultColor === '#10b981' ? 'selected' : ''}>Emerald Tint</option>
          </select>
        </div>
      </div>
    `;

    this.showModal('🏠 Configure Data Hall Transparent Roof', html, 'Apply Roof Settings', () => {
      const heightM = parseFloat((document.getElementById('dc-roof-modal-height') as HTMLInputElement)?.value || '3.8');
      const opacity = parseInt((document.getElementById('dc-roof-modal-opacity') as HTMLInputElement)?.value || '30', 10) / 100;
      const color = (document.getElementById('dc-roof-modal-color') as HTMLSelectElement)?.value || '#38bdf8';

      dcState.setRoofConfig({ heightM, opacity, color });
      const updatedFloor = dcState.getActiveFloor();
      if (updatedFloor) {
        if (dcState.getState().viewMode === '3d') {
          this.rebuildThreeScene(updatedFloor);
        }
        this.renderPropsPanel();
        this.updateButtonStates();
      }
      eventBus.emit('notification', {
        message: `🏠 Updated Data Hall Roof: Height ${heightM}m, Opacity ${Math.round(opacity * 100)}%.`,
        type: 'success',
      });
      return true;
    });

    const modalEl = document.getElementById('dc-modal-overlay');
    if (modalEl) {
      const opSlider = modalEl.querySelector('#dc-roof-modal-opacity') as HTMLInputElement;
      const opVal = modalEl.querySelector('#dc-roof-modal-opacity-val') as HTMLElement;
      opSlider?.addEventListener('input', () => {
        if (opVal) opVal.textContent = `${opSlider.value}%`;
      });
    }
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
        let clickedWallId: string | null = null;
        let clickedWallItemId: string | null = null;
        for (const hit of intersects) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && cur !== this.threeScene) {
            if (this.rackMeshMap.has(cur)) {
              clickedRackId = this.rackMeshMap.get(cur)!;
              break;
            }
            if (cur.userData?.wallItemId) {
              clickedWallItemId = cur.userData.wallItemId;
              clickedWallId = cur.userData.wallId;
              break;
            }
            if (cur.userData?.wallId) {
              clickedWallId = cur.userData.wallId;
              break;
            }
            if (cur.userData?.infraId) {
              const rawId = cur.userData.infraId;
              clickedInfraId = rawId.includes('_sub') ? rawId.split('_sub')[0] : rawId;
              break;
            }
            if (cur.userData?.tileId) {
              clickedTileId = cur.userData.tileId;
              break;
            }
            cur = cur.parent;
          }
          if (clickedRackId || clickedWallItemId || clickedWallId || clickedInfraId || clickedTileId) break;
        }

        if (clickedRackId) {
          dcState.setState({ selectedRackId: clickedRackId, selectedTileId: null, selectedTileIds: [], selectedInfraId: null, selectedWallId: null, selectedWallItemId: null });
          this.renderPropsPanel();
          this.update3DSelectionHighlight();
        } else if (clickedWallItemId || clickedWallId) {
          dcState.setState({
            selectedWallId: clickedWallId,
            selectedWallItemId: clickedWallItemId,
            selectedRackId: null,
            selectedTileId: null,
            selectedTileIds: [],
            selectedInfraId: null,
          });
          this.renderPropsPanel();
          this.rebuildThreeScene(currentFloor);
        } else if (clickedInfraId) {
          const baseId = clickedInfraId.includes('_sub') ? clickedInfraId.split('_sub')[0] : clickedInfraId;
          dcState.setState({ selectedInfraId: baseId, selectedRackId: null, selectedTileId: null, selectedTileIds: [], selectedWallId: null, selectedWallItemId: null });
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
          dcState.setState({ selectedTileId: primaryId, selectedTileIds: newIds, selectedRackId: null, selectedInfraId: null, selectedWallId: null, selectedWallItemId: null });
          this.renderPropsPanel();
          this.rebuildThreeScene(currentFloor);
        } else {
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            dcState.setState({ selectedTileId: null, selectedTileIds: [], selectedRackId: null, selectedInfraId: null, selectedWallId: null, selectedWallItemId: null });
            this.renderPropsPanel();
            this.update3DSelectionHighlight();
          }
        }
      });

      // Double-click on rack in 3D data hall directly opens Rack Elevation ("Work on this Rack")
      this.threeRenderer.domElement.addEventListener('dblclick', (e) => {
        const currentFloor = dcState.getActiveFloor();
        if (!currentFloor) return;

        const rect = this.threeRenderer!.domElement.getBoundingClientRect();
        this.threeMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.threeMouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.threeRaycaster.setFromCamera(this.threeMouse, this.threeCamera!);

        const intersects = this.threeRaycaster.intersectObjects(this.threeScene!.children, true);
        for (const hit of intersects) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && cur !== this.threeScene) {
            if (this.rackMeshMap.has(cur)) {
              const rackId = this.rackMeshMap.get(cur)!;
              const rack = currentFloor.racks.find(r => r.id === rackId);
              if (rack) {
                this.workOnRack(rack);
                return;
              }
            }
            cur = cur.parent;
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

          // Physical Under-Floor Air Duct Box (Default 300mm height to avoid obstructing underfloor raceways)
          const acHeight = Math.min(plenumDepthMm - 50, t.airChannelHeightMm || 300);
          const ductBoxGeo = new THREE.BoxGeometry(panelSize - 12, acHeight, panelSize - 12);
          const ductMesh = new THREE.Mesh(ductBoxGeo, airChannelDuctMat);
          ductMesh.position.set(txMm, -acHeight / 2 - 2, tzMm);
          ductMesh.userData = { isDynamic: true, tileId: t.id };
          airChannelGroup.add(ductMesh);

          // Directional airflow arrow inside under-floor duct
          const arrowDir = t.airflowDir || 'north';
          const arrowConeGeo = new THREE.ConeGeometry(30, 80, 8);
          const arrowMesh = new THREE.Mesh(arrowConeGeo, airArrowMat);
          arrowMesh.position.set(txMm, -acHeight / 2 - 2, tzMm);
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

    // 4. Under-Floor & Overhead Cabling, Cable Trays, Ducts & Risers
    const infraGroup = new THREE.Group();
    infraGroup.userData = { isDynamic: true };

    const pvcMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db, // Industrial PVC light grey
      roughness: 0.40,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const solidDuctMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Galvanized metal duct
      roughness: 0.35,
      metalness: 0.85,
      side: THREE.DoubleSide,
    });
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Industrial amber wire basket tray
      roughness: 0.40,
      metalness: 0.70,
      side: THREE.DoubleSide,
    });
    const ladderMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark powder-coated ladder runway
      roughness: 0.30,
      metalness: 0.80,
      side: THREE.DoubleSide,
    });
    const fiberMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Bright authentic safety yellow fiber optic raceway
      roughness: 0.25,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const powerCableMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red high-voltage / power busway
      roughness: 0.50,
      metalness: 0.30,
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
    const unistrutMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Zinc-plated unistrut support channel
      roughness: 0.35,
      metalness: 0.75,
    });
    const steelRodMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8, // Threaded steel ceiling hanger rod
      roughness: 0.20,
      metalness: 0.90,
    });
    const roofY = (floor as any).ceilingHeightMm || 3800;

    const infraItems = floor.infrastructure || [];
    const junctionNodes3D = solveRacewayTopology(infraItems, { racks: floor.racks, snapRadiusM: 0.22 });
    const truncatedSegments3D = getTruncatedInfraSegments(infraItems, junctionNodes3D);

    const getInfraMaterial = (cat: string, sub?: string) => {
      const s = sub || (cat === 'cable-duct' ? 'pvc-duct' : 'basket-tray');
      if (s === 'solid-duct') return solidDuctMat;
      if (s === 'basket-tray') return trayMat;
      if (s === 'ladder-rack') return ladderMat;
      if (s === 'fiber-raceway' || cat === 'fiber-raceway') return fiberMat;
      if (cat === 'power-cable' || s === 'busway' || s === 'power-busway') return powerCableMat;
      if (cat === 'data-cable') return dataCableMat;
      if (cat === 'riser') return riserMat;
      return pvcMat;
    };

    // A. Render Linear Horizontal Channel Segments & Risers
    truncatedSegments3D.forEach(tSeg => {
      const item = tSeg.originalItem;
      const sX = tSeg.start.x * 1000;
      const sZ = tSeg.start.y * 1000;
      const eX = tSeg.end.x * 1000;
      const eZ = tSeg.end.y * 1000;
      const isUF = item.layer === 'underfloor';
      const subfloorY = -plenumDepthMm;
      const itemH = item.heightMm || 80;
      const itemW = item.widthMm || 300;
      const defaultSlabY = subfloorY + itemH / 2;

      // Underfloor raceways sit directly on the concrete slab unless explicitly mounted on bracket
      const elevY = item.mountType === 'bracket'
        ? (item.elevationMm !== undefined ? item.elevationMm : -220)
        : (isUF ? defaultSlabY : (item.elevationMm && item.elevationMm > 0 ? item.elevationMm : 2600));

      const lengthMm = tSeg.lengthMm;
      const midX = tSeg.midX;
      const midZ = tSeg.midZ;
      const angleY = tSeg.angleY;
      const masterInfraId = item.parentItemId || item.id;
      const isSelected = item.id === s.selectedInfraId || item.parentItemId === s.selectedInfraId;
      const itemMat = getInfraMaterial(item.category, item.subtype);

      if (item.category === 'riser') {
        // Vertical riser pillar spanning from subfloor through raised floor
        const rGeo = new THREE.CylinderGeometry(itemW / 2, itemW / 2, plenumDepthMm + 300, 16);
        const rMesh = new THREE.Mesh(rGeo, itemMat);
        rMesh.position.set(midX, -plenumDepthMm / 2 + 150, midZ);
        rMesh.userData = { isDynamic: true, infraId: masterInfraId };
        infraGroup.add(rMesh);
      } else {
        // Open 'U' Section Linear Horizontal Pathway Channel (holding visible cables)
        const channelGroup = new THREE.Group();
        channelGroup.position.set(midX, elevY, midZ);
        channelGroup.rotation.y = angleY;
        channelGroup.userData = { isDynamic: true, infraId: masterInfraId };

        const sub = (item.subtype || (item.category === 'cable-duct' ? 'pvc-duct' : item.category === 'cable-tray' ? 'basket-tray' : 'pvc-duct')).toLowerCase();
        const wallT = Math.max(5, itemW * 0.025); // ~6-8mm wall thickness
        const baseT = Math.max(6, itemW * 0.03);  // ~8mm base thickness

        if (sub === 'basket-tray') {
          // ── 1. WIRE MESH BASKET TRAY (Authentic Open Wire Mesh Structure) ──
          // Top rim wire rails (Left & Right)
          const rimWireGeo = new THREE.CylinderGeometry(3.5, 3.5, lengthMm, 8);
          const rimL = new THREE.Mesh(rimWireGeo, trayMat);
          rimL.rotation.x = Math.PI / 2;
          rimL.position.set(-itemW / 2, itemH / 2, 0);
          rimL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(rimL);

          const rimR = new THREE.Mesh(rimWireGeo, trayMat);
          rimR.rotation.x = Math.PI / 2;
          rimR.position.set(itemW / 2, itemH / 2, 0);
          rimR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(rimR);

          // Longitudinal bottom wire rods (4-6 parallel rods)
          const numBottomWires = Math.max(3, Math.round(itemW / 60));
          const bWireGeo = new THREE.CylinderGeometry(2.5, 2.5, lengthMm, 8);
          for (let bi = 0; bi < numBottomWires; bi++) {
            const bx = -itemW / 2 + (bi / (numBottomWires - 1)) * itemW;
            const bWire = new THREE.Mesh(bWireGeo, trayMat);
            bWire.rotation.x = Math.PI / 2;
            bWire.position.set(bx, -itemH / 2, 0);
            bWire.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(bWire);
          }

          // Side middle longitudinal wire rods
          const midWireGeo = new THREE.CylinderGeometry(2.5, 2.5, lengthMm, 8);
          const midL = new THREE.Mesh(midWireGeo, trayMat);
          midL.rotation.x = Math.PI / 2;
          midL.position.set(-itemW / 2, 0, 0);
          midL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(midL);

          const midR = new THREE.Mesh(midWireGeo, trayMat);
          midR.rotation.x = Math.PI / 2;
          midR.position.set(itemW / 2, 0, 0);
          midR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(midR);

          // Transverse welded U-rungs spaced every 100mm along length
          const rungSpacing = 100;
          const numRungs = Math.max(2, Math.floor(lengthMm / rungSpacing) + 1);
          const crossBottomGeo = new THREE.CylinderGeometry(2.5, 2.5, itemW, 8);
          const crossSideGeo = new THREE.CylinderGeometry(2.5, 2.5, itemH, 8);

          for (let ri = 0; ri < numRungs; ri++) {
            const rz = -lengthMm / 2 + (ri / (numRungs - 1)) * lengthMm;
            const bCross = new THREE.Mesh(crossBottomGeo, trayMat);
            bCross.rotation.z = Math.PI / 2;
            bCross.position.set(0, -itemH / 2, rz);
            bCross.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(bCross);

            const vL = new THREE.Mesh(crossSideGeo, trayMat);
            vL.position.set(-itemW / 2, 0, rz);
            vL.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(vL);

            const vR = new THREE.Mesh(crossSideGeo, trayMat);
            vR.position.set(itemW / 2, 0, rz);
            vR.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(vR);
          }

          // Internal cables inside wire mesh basket
          const cableRadius = Math.max(4, itemH * 0.12);
          const cableGeo = new THREE.CylinderGeometry(cableRadius, cableRadius, lengthMm - 20, 8);
          const cable1 = new THREE.Mesh(cableGeo, dataCableMat);
          cable1.rotation.x = Math.PI / 2;
          cable1.position.set(-itemW / 4, -itemH / 2 + cableRadius + 4, 0);
          cable1.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable1);

          const cable2 = new THREE.Mesh(cableGeo, fiberMat);
          cable2.rotation.x = Math.PI / 2;
          cable2.position.set(itemW / 4, -itemH / 2 + cableRadius + 4, 0);
          cable2.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable2);

        } else if (sub === 'ladder-rack') {
          // ── 2. LADDER CABLE RUNWAY (Side Stringers + Welded Rungs) ──
          const stringerGeo = new THREE.BoxGeometry(16, itemH, lengthMm);
          const stringerL = new THREE.Mesh(stringerGeo, ladderMat);
          stringerL.position.set(-itemW / 2 + 8, 0, 0);
          stringerL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(stringerL);

          const stringerR = new THREE.Mesh(stringerGeo, ladderMat);
          stringerR.position.set(itemW / 2 - 8, 0, 0);
          stringerR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(stringerR);

          // Transverse rectangular rungs spaced every 250mm
          const rungSpacing = 250;
          const numRungs = Math.max(2, Math.floor(lengthMm / rungSpacing) + 1);
          const rungGeo = new THREE.BoxGeometry(itemW - 32, 14, 28);

          for (let ri = 0; ri < numRungs; ri++) {
            const rz = -lengthMm / 2 + (ri / (numRungs - 1)) * lengthMm;
            const rung = new THREE.Mesh(rungGeo, ladderMat);
            rung.position.set(0, -itemH / 2 + 7, rz);
            rung.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(rung);
          }

          // Heavy cables draped across rungs
          const cableRadius = Math.max(6, itemH * 0.16);
          const cableGeo = new THREE.CylinderGeometry(cableRadius, cableRadius, lengthMm - 20, 8);
          const cable1 = new THREE.Mesh(cableGeo, dataCableMat);
          cable1.rotation.x = Math.PI / 2;
          cable1.position.set(-itemW / 4, -itemH / 2 + 14 + cableRadius, 0);
          cable1.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable1);

          const cable2 = new THREE.Mesh(cableGeo, powerCableMat);
          cable2.rotation.x = Math.PI / 2;
          cable2.position.set(itemW / 4, -itemH / 2 + 14 + cableRadius, 0);
          cable2.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable2);

        } else if (sub === 'fiber-raceway' || item.category === 'fiber-raceway') {
          // ── 3. YELLOW FIBER OPTIC RACEWAY (Molded Plastic U-Trough + Side Ribs) ──
          const baseGeo = new THREE.BoxGeometry(itemW, baseT, lengthMm);
          const baseMesh = new THREE.Mesh(baseGeo, fiberMat);
          baseMesh.position.set(0, -itemH / 2 + baseT / 2, 0);
          baseMesh.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(baseMesh);

          const wallGeo = new THREE.BoxGeometry(wallT, itemH, lengthMm);
          const wallL = new THREE.Mesh(wallGeo, fiberMat);
          wallL.position.set(-itemW / 2 + wallT / 2, 0, 0);
          wallL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallL);

          const wallR = new THREE.Mesh(wallGeo, fiberMat);
          wallR.position.set(itemW / 2 - wallT / 2, 0, 0);
          wallR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallR);

          const lipGeo = new THREE.BoxGeometry(wallT * 1.6, wallT, lengthMm);
          const lipL = new THREE.Mesh(lipGeo, fiberMat);
          lipL.position.set(-itemW / 2 - wallT * 0.2, itemH / 2 - wallT / 2, 0);
          lipL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(lipL);

          const lipR = new THREE.Mesh(lipGeo, fiberMat);
          lipR.position.set(itemW / 2 + wallT * 0.2, itemH / 2 - wallT / 2, 0);
          lipR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(lipR);

          // Exterior snap-on rib tracks
          const ribGeo = new THREE.BoxGeometry(wallT * 0.8, wallT * 1.5, lengthMm);
          const ribL = new THREE.Mesh(ribGeo, fiberMat);
          ribL.position.set(-itemW / 2 - wallT * 0.4, 0, 0);
          ribL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(ribL);

          const ribR = new THREE.Mesh(ribGeo, fiberMat);
          ribR.position.set(itemW / 2 + wallT * 0.4, 0, 0);
          ribR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(ribR);

        } else if (sub === 'solid-duct') {
          // ── 4. SOLID GALVANIZED STEEL DUCT (Sheet Metal + Splice Collars) ──
          const baseGeo = new THREE.BoxGeometry(itemW, baseT, lengthMm);
          const baseMesh = new THREE.Mesh(baseGeo, solidDuctMat);
          baseMesh.position.set(0, -itemH / 2 + baseT / 2, 0);
          baseMesh.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(baseMesh);

          const wallGeo = new THREE.BoxGeometry(wallT, itemH, lengthMm);
          const wallL = new THREE.Mesh(wallGeo, solidDuctMat);
          wallL.position.set(-itemW / 2 + wallT / 2, 0, 0);
          wallL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallL);

          const wallR = new THREE.Mesh(wallGeo, solidDuctMat);
          wallR.position.set(itemW / 2 - wallT / 2, 0, 0);
          wallR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallR);

          const flangeGeo = new THREE.BoxGeometry(wallT * 1.5, wallT, lengthMm);
          const flangeL = new THREE.Mesh(flangeGeo, solidDuctMat);
          flangeL.position.set(-itemW / 2 - wallT * 0.25, itemH / 2 - wallT / 2, 0);
          flangeL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(flangeL);

          const flangeR = new THREE.Mesh(flangeGeo, solidDuctMat);
          flangeR.position.set(itemW / 2 + wallT * 0.25, itemH / 2 - wallT / 2, 0);
          flangeR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(flangeR);

          const cableRadius = Math.max(4, itemH * 0.12);
          const cableGeo = new THREE.CylinderGeometry(cableRadius, cableRadius, lengthMm - 20, 8);
          const cable1 = new THREE.Mesh(cableGeo, dataCableMat);
          cable1.rotation.x = Math.PI / 2;
          cable1.position.set(-itemW / 4, -itemH / 2 + baseT + cableRadius, 0);
          cable1.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable1);

        } else if (sub === 'busway' || sub === 'power-busway' || item.category === 'busway' || item.category === 'power-cable') {
          // ── 5. POWER BUSWAY TRUNK BAR (Red Extruded Box + Copper Busbars) ──
          const housingGeo = new THREE.BoxGeometry(itemW, itemH, lengthMm);
          const housing = new THREE.Mesh(housingGeo, powerCableMat);
          housing.position.set(0, 0, 0);
          housing.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(housing);

          const finGeo = new THREE.BoxGeometry(itemW * 0.85, 8, lengthMm);
          const fin = new THREE.Mesh(finGeo, powerCableMat);
          fin.position.set(0, itemH / 2 + 4, 0);
          fin.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(fin);

          // Copper busbar terminal bars
          const copperMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.25, metalness: 0.95 });
          const barW = Math.max(8, itemW * 0.12);
          const barH = itemH * 0.5;
          const barGeo = new THREE.BoxGeometry(barW, barH, 20);
          for (let bi = -2; bi <= 2; bi++) {
            const copperBar = new THREE.Mesh(barGeo, copperMat);
            copperBar.position.set((bi * itemW) / 6, 0, lengthMm / 2 + 10);
            copperBar.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(copperBar);
          }

          // Tap-off distribution plug boxes
          const tapSpacing = 1200;
          const numTaps = Math.max(1, Math.floor(lengthMm / tapSpacing));
          const tapBoxGeo = new THREE.BoxGeometry(70, 70, 70);
          for (let ti = 0; ti < numTaps; ti++) {
            const tz = -lengthMm / 2 + ((ti + 0.5) / numTaps) * lengthMm;
            const tapBox = new THREE.Mesh(tapBoxGeo, solidDuctMat);
            tapBox.position.set(0, -itemH / 2 - 35, tz);
            tapBox.userData = { isDynamic: true, infraId: item.id };
            channelGroup.add(tapBox);
          }

        } else if (sub === 'conduit' || item.category === 'conduit') {
          // ── 6. EMT METALLIC CONDUIT (Tubular Steel Pipe) ──
          const conduitRadius = Math.max(15, itemW * 0.20);
          const conduitGeo = new THREE.CylinderGeometry(conduitRadius, conduitRadius, lengthMm, 20);
          const conduitMesh = new THREE.Mesh(conduitGeo, solidDuctMat);
          conduitMesh.rotation.x = Math.PI / 2;
          conduitMesh.position.set(0, 0, 0);
          conduitMesh.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(conduitMesh);

        } else {
          // ── 7. PVC SOLID DUCT (Default: Polymer U-Trough with Center Divider) ──
          const baseGeo = new THREE.BoxGeometry(itemW, baseT, lengthMm);
          const baseMesh = new THREE.Mesh(baseGeo, pvcMat);
          baseMesh.position.set(0, -itemH / 2 + baseT / 2, 0);
          baseMesh.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(baseMesh);

          const wallGeo = new THREE.BoxGeometry(wallT, itemH, lengthMm);
          const wallL = new THREE.Mesh(wallGeo, pvcMat);
          wallL.position.set(-itemW / 2 + wallT / 2, 0, 0);
          wallL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallL);

          const wallR = new THREE.Mesh(wallGeo, pvcMat);
          wallR.position.set(itemW / 2 - wallT / 2, 0, 0);
          wallR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(wallR);

          const divGeo = new THREE.BoxGeometry(4, itemH * 0.75, lengthMm);
          const divider = new THREE.Mesh(divGeo, pvcMat);
          divider.position.set(0, -itemH / 8, 0);
          divider.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(divider);

          const lipGeo = new THREE.BoxGeometry(wallT * 1.4, wallT, lengthMm);
          const lipL = new THREE.Mesh(lipGeo, pvcMat);
          lipL.position.set(-itemW / 2 + wallT * 0.2, itemH / 2 - wallT / 2, 0);
          lipL.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(lipL);

          const lipR = new THREE.Mesh(lipGeo, pvcMat);
          lipR.position.set(itemW / 2 - wallT * 0.2, itemH / 2 - wallT / 2, 0);
          lipR.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(lipR);

          const cableRadius = Math.max(4, itemH * 0.12);
          const cableGeo = new THREE.CylinderGeometry(cableRadius, cableRadius, lengthMm - 20, 8);
          const cable1 = new THREE.Mesh(cableGeo, dataCableMat);
          cable1.rotation.x = Math.PI / 2;
          cable1.position.set(-itemW / 4, -itemH / 2 + baseT + cableRadius, 0);
          cable1.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable1);

          const cable2 = new THREE.Mesh(cableGeo, powerCableMat);
          cable2.rotation.x = Math.PI / 2;
          cable2.position.set(itemW / 4, -itemH / 2 + baseT + cableRadius, 0);
          cable2.userData = { isDynamic: true, infraId: item.id };
          channelGroup.add(cable2);
        }

        // ── 8. THREADED CEILING HANGER RODS & TRAPEZE UNISTRUT SUPPORTS ──
        if (!isUF) {
          const rodLen = Math.max(100, (roofY - elevY) - (-itemH / 2 - 18));
          const rodCenterY = (-itemH / 2 - 18 + (roofY - elevY)) / 2;
          const rodRadius = 5; // 10mm diameter threaded rod

          const rodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLen, 10);
          const uniGeo = new THREE.BoxGeometry(itemW + 80, 20, 40);
          const anchorGeo = new THREE.BoxGeometry(36, 8, 36);
          const nutGeo = new THREE.CylinderGeometry(8, 8, 8, 6);

          // Calculate hanger locations along length (minimized, spaced ~2.0m-2.4m, never inside tray)
          const hangerPositions: number[] = [];
          if (lengthMm >= 900 && lengthMm < 2400) {
            // Single clean central support for standard runs
            hangerPositions.push(0);
          } else if (lengthMm >= 2400) {
            const numHangers = Math.max(2, Math.round(lengthMm / 2000));
            const margin = Math.min(500, lengthMm * 0.2);
            for (let hi = 0; hi < numHangers; hi++) {
              const hz = -lengthMm / 2 + margin + (hi / (numHangers - 1)) * (lengthMm - 2 * margin);
              hangerPositions.push(hz);
            }
          }

          for (const hz of hangerPositions) {
            // Unistrut horizontal trapeze bar underneath the channel
            const uniMesh = new THREE.Mesh(uniGeo, unistrutMat);
            uniMesh.position.set(0, -itemH / 2 - 10, hz);
            uniMesh.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(uniMesh);

            // Left Rod (strictly on the external side of the tray)
            const rodL = new THREE.Mesh(rodGeo, steelRodMat);
            rodL.position.set(-itemW / 2 - 30, rodCenterY, hz);
            rodL.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(rodL);

            // Right Rod (strictly on the external side of the tray)
            const rodR = new THREE.Mesh(rodGeo, steelRodMat);
            rodR.position.set(itemW / 2 + 30, rodCenterY, hz);
            rodR.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(rodR);

            // Top Ceiling Anchor Brackets
            const anchorL = new THREE.Mesh(anchorGeo, unistrutMat);
            anchorL.position.set(-itemW / 2 - 30, roofY - elevY - 4, hz);
            anchorL.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(anchorL);

            const anchorR = new THREE.Mesh(anchorGeo, unistrutMat);
            anchorR.position.set(itemW / 2 + 30, roofY - elevY - 4, hz);
            anchorR.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(anchorR);

            // Bottom Hex Nuts clamping Unistrut
            const nutL = new THREE.Mesh(nutGeo, steelRodMat);
            nutL.position.set(-itemW / 2 - 30, -itemH / 2 - 24, hz);
            nutL.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(nutL);

            const nutR = new THREE.Mesh(nutGeo, steelRodMat);
            nutR.position.set(itemW / 2 + 30, -itemH / 2 - 24, hz);
            nutR.userData = { isDynamic: true, infraId: masterInfraId };
            channelGroup.add(nutR);
          }
        }

        // Selection Wireframe Outline
        if (isSelected) {
          const selBoxGeo = new THREE.BoxGeometry(itemW + 12, itemH + 12, lengthMm + 12);
          const selWireGeo = new THREE.WireframeGeometry(selBoxGeo);
          const selWireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
          const selWire = new THREE.LineSegments(selWireGeo, selWireMat);
          selWire.userData = { isDynamic: true, infraId: masterInfraId };
          channelGroup.add(selWire);
        }

        infraGroup.add(channelGroup);
      }
    });

    // B. Render Procedural 3D Automatic Fittings (Open 'U' Section Curved 90° Elbows, T-Joints, Cross-Joints, Couplers, Waterfall Drops, Reducers)
    junctionNodes3D.forEach(jn => {
      const jGroup = new THREE.Group();
      const isUF = jn.layer === 'underfloor';
      const subfloorY = -plenumDepthMm;
      const jElevY = isUF ? (subfloorY + jn.heightMm / 2) : (jn.elevationMm || 2600);

      const primaryConnectedInfraId = jn.connectedInfraIds[0]?.split('_sub')[0];
      jGroup.position.set(jn.x * 1000, jElevY, jn.y * 1000);
      jGroup.userData = { isDynamic: true, infraId: primaryConnectedInfraId };

      const jMat = getInfraMaterial(jn.category, jn.subtype);
      const isSelected = jn.connectedInfraIds.some(id => {
        const base = id.split('_sub')[0];
        return base === s.selectedInfraId || id === s.selectedInfraId;
      });
      const hubSize = jn.widthMm + 24;
      const hubH = jn.heightMm;
      const wallT = Math.max(5, jn.widthMm * 0.025);
      const baseT = Math.max(6, jn.widthMm * 0.03);

      if (jn.fittingType === 'elbow-90' || jn.fittingType === 'elbow-45') {
        const u1 = jn.branchVectors?.[0] || { x: 1, z: 0 };
        const u2 = jn.branchVectors?.[1] || { x: 0, z: 1 };
        const elbow = createElbowMesh(jn.widthMm, jn.heightMm, u1, u2, jMat);
        jGroup.add(elbow);

      } else if (jn.fittingType === 'tee-joint') {
        const tee = createTeeMesh(jn.widthMm, jn.heightMm, jn.branchVectors || [], jMat);
        jGroup.add(tee);

      } else if (jn.fittingType === 'cross-joint') {
        const cross = createCrossMesh(jn.widthMm, jn.heightMm, jMat);
        jGroup.add(cross);

      } else if (jn.fittingType === 'reducing-coupling' || jn.fittingType === 'coupling') {
        const coupling = createCouplingMesh(jn.widthMm, jn.heightMm, jn.branchVectors?.[0], jMat);
        jGroup.add(coupling);

      } else if (jn.fittingType === 'waterfall-outlet') {
        // ── 7. OUTLET ASSEMBLY (Trumpet Waterfall Drop Spout over Server Rack) ──
        const dropHoodGeo = new THREE.BoxGeometry(hubSize, baseT, hubSize);
        const dropHood = new THREE.Mesh(dropHoodGeo, jMat);
        dropHood.position.set(0, -hubH / 2 + baseT / 2, 0);
        dropHood.userData = { isDynamic: true };
        jGroup.add(dropHood);

        const spoutGeo = new THREE.CylinderGeometry(hubSize * 0.4, hubSize * 0.5, 60, 16, 1, true);
        const spoutMesh = new THREE.Mesh(spoutGeo, jMat);
        spoutMesh.position.set(0, -hubH / 2 - 25, 0);
        spoutMesh.userData = { isDynamic: true };
        jGroup.add(spoutMesh);

        const chuteHeight = 550;
        const chuteW = hubSize * 0.6;
        const chuteWallGeo = new THREE.BoxGeometry(6, chuteHeight, chuteW);
        
        const chuteWallL = new THREE.Mesh(chuteWallGeo, jMat);
        chuteWallL.position.set(-chuteW / 2 + 3, -hubH / 2 - chuteHeight / 2 - 40, 0);
        chuteWallL.userData = { isDynamic: true };
        jGroup.add(chuteWallL);

        const chuteWallR = new THREE.Mesh(chuteWallGeo, jMat);
        chuteWallR.position.set(chuteW / 2 - 3, -hubH / 2 - chuteHeight / 2 - 40, 0);
        chuteWallR.userData = { isDynamic: true };
        jGroup.add(chuteWallR);

        const dropCableGeo = new THREE.CylinderGeometry(5, 5, chuteHeight, 8);
        const dropCable = new THREE.Mesh(dropCableGeo, dataCableMat);
        dropCable.position.set(0, -hubH / 2 - chuteHeight / 2 - 40, 0);
        dropCable.userData = { isDynamic: true };
        jGroup.add(dropCable);
      }


      if (isSelected) {
        const jWireGeo = new THREE.WireframeGeometry(new THREE.BoxGeometry(hubSize + 16, hubH + 12, hubSize + 16));
        const jWireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
        const jWire = new THREE.LineSegments(jWireGeo, jWireMat);
        jWire.userData = { isDynamic: true };
        jGroup.add(jWire);
      }

      infraGroup.add(jGroup);
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

    // 6. Realistic Industrial Datacenter Raised Floor Perimeter Trim with 3D Layout Addressing
    const curbThickness = 30; // 30mm trim
    const curbHeight = 14;    // 14mm proud curb
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Architectural anodized aluminum
      roughness: 0.35,
      metalness: 0.80,
    });

    // ── North Curb (X-Axis Column Numbers: 01, 02, 03...) ──
    const nTexW = Math.max(512, cols * 64);
    const nTexH = 64;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = nTexW;
    nCanvas.height = nTexH;
    const nCtx = nCanvas.getContext('2d')!;
    nCtx.fillStyle = '#1e293b';
    nCtx.fillRect(0, 0, nTexW, nTexH);

    const cStepPx = nTexW / cols;
    for (let c = 0; c < cols; c++) {
      const colLabel = getColLabel(c, floor.colScheme ?? 'numbers', floor.addressFormat ?? 'compact');
      const cx = c * cStepPx;
      nCtx.strokeStyle = '#475569';
      nCtx.lineWidth = 2;
      nCtx.beginPath();
      nCtx.moveTo(cx, 0);
      nCtx.lineTo(cx, nTexH);
      nCtx.stroke();

      nCtx.fillStyle = '#38bdf8';
      nCtx.font = 'bold 26px "SF Mono", Monaco, Menlo, Consolas, monospace';
      nCtx.textAlign = 'center';
      nCtx.textBaseline = 'middle';
      nCtx.fillText(colLabel, cx + cStepPx / 2, nTexH / 2);
    }
    const northCurbTex = new THREE.CanvasTexture(nCanvas);
    northCurbTex.colorSpace = THREE.SRGBColorSpace;
    const northCurbMat = new THREE.MeshStandardMaterial({
      map: northCurbTex,
      roughness: 0.35,
      metalness: 0.60,
    });

    // ── West Curb (Z-Axis Row Letters: A, B, C...) ──
    const wTexW = 64;
    const wTexH = Math.max(512, rows * 64);
    const wCanvas = document.createElement('canvas');
    wCanvas.width = wTexW;
    wCanvas.height = wTexH;
    const wCtx = wCanvas.getContext('2d')!;
    wCtx.fillStyle = '#1e293b';
    wCtx.fillRect(0, 0, wTexW, wTexH);

    const rStepPx = wTexH / rows;
    for (let r = 0; r < rows; r++) {
      const rowLabel = getRowLabel(r, floor.rowScheme ?? 'letters');
      const ry = r * rStepPx;
      wCtx.strokeStyle = '#475569';
      wCtx.lineWidth = 2;
      wCtx.beginPath();
      wCtx.moveTo(0, ry);
      wCtx.lineTo(wTexW, ry);
      wCtx.stroke();

      wCtx.fillStyle = '#38bdf8';
      wCtx.font = 'bold 26px "SF Mono", Monaco, Menlo, Consolas, monospace';
      wCtx.textAlign = 'center';
      wCtx.textBaseline = 'middle';
      wCtx.fillText(rowLabel, wTexW / 2, ry + rStepPx / 2);
    }
    const westCurbTex = new THREE.CanvasTexture(wCanvas);
    westCurbTex.colorSpace = THREE.SRGBColorSpace;
    const westCurbMat = new THREE.MeshStandardMaterial({
      map: westCurbTex,
      roughness: 0.35,
      metalness: 0.60,
    });

    const curbGroup = new THREE.Group();
    curbGroup.userData = { isDynamic: true };

    // North curb (z = -curbThickness / 2)
    const curbNorthGeo = new THREE.BoxGeometry(floorLenMm + curbThickness * 2, curbHeight, curbThickness);
    const curbNorth = new THREE.Mesh(curbNorthGeo, northCurbMat);
    curbNorth.position.set(floorLenMm / 2, curbHeight / 2 - 2, -curbThickness / 2);
    curbGroup.add(curbNorth);

    // South curb (z = floorWidMm + curbThickness / 2)
    const curbSouthGeo = new THREE.BoxGeometry(floorLenMm + curbThickness * 2, curbHeight, curbThickness);
    const curbSouth = new THREE.Mesh(curbSouthGeo, curbMat);
    curbSouth.position.set(floorLenMm / 2, curbHeight / 2 - 2, floorWidMm + curbThickness / 2);
    curbGroup.add(curbSouth);

    // West curb (x = -curbThickness / 2)
    const curbWestGeo = new THREE.BoxGeometry(curbThickness, curbHeight, floorWidMm);
    const curbWest = new THREE.Mesh(curbWestGeo, westCurbMat);
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
        mounting: dcRack.mounting === 'wall-mount' ? 'wall-mount' : 'floor',
        rackColor: dcRack.color ?? '#0c0e12',
        frontDoor: (dcRack.doorStyle || 'perforated') as any,
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

      // If no discrete elevation devices are mounted, render procedural equipment detailing for special types
      if (rackDevices.length === 0) {
        this.buildSpecialEquipmentInterior(dcRack, rackData, rackGroup);
      }

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

      // 3D Floating Gauge HUD (Radial Dial or Linear Telemetry Dashboard) - Optional, default unselected
      if (dcRack.showGauge) {
        const gaugeStyle = dcRack.gaugeStyle || 'radial';
        const hudCanvas = gaugeStyle === 'linear'
          ? this.createRackHUDLinearDashboardCanvas(dcRack, rackDevices, rackData)
          : this.createRackHUDGaugeCanvas(dcRack, rackDevices, rackData);
        const labelTex = new THREE.CanvasTexture(hudCanvas);
        labelTex.colorSpace = THREE.SRGBColorSpace;
        labelTex.anisotropy = 16;
        labelTex.generateMipmaps = true;
        labelTex.minFilter = THREE.LinearMipmapLinearFilter;
        labelTex.magFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        // Width in 3D world: 580mm for 2 horizontal bars or 490mm for radial dial, height proportional
        const spriteW = gaugeStyle === 'linear' ? 580 : 490;
        const spriteH = spriteW * (hudCanvas.height / hudCanvas.width);
        sprite.scale.set(spriteW, spriteH, 1);
        
        // Anchor sprite at bottom center (0.5, 0) so the bottom sits flush just above the rack top
        sprite.center.set(0.5, 0);
        const topY = (isFinite(initBox.max.y) ? initBox.max.y : totalHMm / 2) + 15;
        sprite.position.set(0, topY, 0);
        sprite.userData = { isDynamic: true, rackId: dcRack.id, isGauge: true };
        rackGroup.add(sprite);
        this.rackMeshMap.set(sprite, dcRack.id);
      }

      this.threeScene!.add(rackGroup);

    });

    // 5. 3D Transparent Perimeter & Custom Partition Walls with Wall-Mounted Equipment
    this.buildWallMeshes3D(floor);

    // 6. 3D Transparent Carpet-Area Glass Roof & Ceiling Suspension Trusses
    this.buildRoofMesh3D(floor);

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

  private buildSpecialEquipmentInterior(dcRack: DcRack, _rackData: RackData, rackGroup: THREE.Group) {
    const rType = dcRack.type;
    const cat = dcRack.equipmentCategory;
    const totalHMm = 65 + dcRack.heightU * 44.45 + 65;
    const depthMm = dcRack.depthMm;
    const widthMm = dcRack.widthMm;

    // 1. IN-ROW PRECISION COOLING UNIT
    if (rType === 'inrow-cooling' || cat === 'cooling') {
      const coolingGroup = new THREE.Group();
      coolingGroup.name = `cooling-interior-${dcRack.id}`;

      // 3 High-performance EC axial fans
      const fanRadius = Math.min(widthMm * 0.38, 120);
      const fanPositions = [totalHMm * 0.25, totalHMm * 0.5, totalHMm * 0.75];
      const fanMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
      const blueLedMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

      fanPositions.forEach(yPos => {
        const fanGeo = new THREE.CylinderGeometry(fanRadius, fanRadius, 35, 24);
        fanGeo.rotateX(Math.PI / 2);
        const fanMesh = new THREE.Mesh(fanGeo, fanMat);
        fanMesh.position.set(0, yPos - totalHMm / 2, depthMm * 0.25);
        coolingGroup.add(fanMesh);

        const ringGeo = new THREE.TorusGeometry(fanRadius - 6, 3, 8, 24);
        const ringMesh = new THREE.Mesh(ringGeo, blueLedMat);
        ringMesh.position.set(0, yPos - totalHMm / 2, depthMm * 0.25 + 18);
        coolingGroup.add(ringMesh);
      });

      // Digital airflow / temp LCD at 60% height
      const lcdGeo = new THREE.BoxGeometry(Math.min(110, widthMm * 0.7), 50, 8);
      const lcdMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.8, emissive: 0x0284c7, emissiveIntensity: 0.6 });
      const lcdMesh = new THREE.Mesh(lcdGeo, lcdMat);
      lcdMesh.position.set(0, totalHMm * 0.62 - totalHMm / 2, depthMm / 2 - 10);
      coolingGroup.add(lcdMesh);

      rackGroup.add(coolingGroup);
    }
    // 2. MICRO DATA CENTER (All-in-One)
    else if (rType === 'micro-dc' || cat === 'micro-dc') {
      const mdcGroup = new THREE.Group();
      mdcGroup.name = `microdc-interior-${dcRack.id}`;

      // Top Alert Beacon Light
      const beaconGeo = new THREE.CylinderGeometry(20, 24, 30, 16);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.set(0, totalHMm / 2 + 15, 0);
      mdcGroup.add(beaconMesh);

      // Front Smart LCD Touch Panel (emissive cyan screen)
      const lcdGeo = new THREE.BoxGeometry(Math.min(180, widthMm * 0.6), 100, 10);
      const lcdMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9, emissive: 0x06b6d4, emissiveIntensity: 0.4 });
      const lcdMesh = new THREE.Mesh(lcdGeo, lcdMat);
      lcdMesh.position.set(0, totalHMm * 0.6 - totalHMm / 2, depthMm / 2 - 5);
      mdcGroup.add(lcdMesh);

      // 4 Internal rack devices (compact server + mini UPS + smart PDU)
      const devColors = [0x334155, 0x1e293b, 0x0f172a, 0x1e3a5f];
      const devYs = [totalHMm * 0.15, totalHMm * 0.28, totalHMm * 0.40, totalHMm * 0.75];
      devYs.forEach((yPos, i) => {
        const dGeo = new THREE.BoxGeometry(widthMm * 0.82, 44, depthMm * 0.75);
        const dMat = new THREE.MeshStandardMaterial({ color: devColors[i % devColors.length], roughness: 0.5, metalness: 0.6 });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(0, yPos - totalHMm / 2, 0);
        mdcGroup.add(dMesh);

        const ledGeo = new THREE.BoxGeometry(12, 6, 2);
        const ledMat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0x10b981 : 0x38bdf8 });
        const ledMesh = new THREE.Mesh(ledGeo, ledMat);
        ledMesh.position.set(widthMm * 0.35, yPos - totalHMm / 2, depthMm * 0.375 + 1);
        mdcGroup.add(ledMesh);
      });

      rackGroup.add(mdcGroup);
    }
    // 3. MODULAR UPS / BATTERY CABINET
    else if (rType === 'ups-cabinet' || rType === 'battery-cabinet' || cat === 'ups') {
      const upsGroup = new THREE.Group();
      upsGroup.name = `ups-interior-${dcRack.id}`;

      const drawerCount = 6;
      const drawerH = (totalHMm * 0.75) / drawerCount;
      const startY = totalHMm * 0.12;

      for (let i = 0; i < drawerCount; i++) {
        const yPos = startY + i * drawerH;
        const dGeo = new THREE.BoxGeometry(widthMm * 0.85, drawerH - 12, depthMm * 0.8);
        const dMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
        const dMesh = new THREE.Mesh(dGeo, dMat);
        dMesh.position.set(0, yPos - totalHMm / 2, 0);
        upsGroup.add(dMesh);

        // Front battery charge status bar (segmented green LEDs)
        const ledGeo = new THREE.BoxGeometry(Math.min(40, widthMm * 0.15), 8, 2);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const ledMesh = new THREE.Mesh(ledGeo, ledMat);
        ledMesh.position.set(-widthMm * 0.25, yPos - totalHMm / 2, depthMm * 0.4 + 1);
        upsGroup.add(ledMesh);

        // DC breaker handle
        const brkGeo = new THREE.BoxGeometry(10, 18, 12);
        const brkMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const brkMesh = new THREE.Mesh(brkGeo, brkMat);
        brkMesh.position.set(widthMm * 0.30, yPos - totalHMm / 2, depthMm * 0.4 + 6);
        upsGroup.add(brkMesh);
      }

      // Master Rotary Isolator on top section
      const isoGeo = new THREE.CylinderGeometry(25, 25, 20, 16);
      isoGeo.rotateX(Math.PI / 2);
      const isoMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.5 });
      const isoMesh = new THREE.Mesh(isoGeo, isoMat);
      isoMesh.position.set(0, totalHMm * 0.88 - totalHMm / 2, depthMm * 0.4 + 10);
      upsGroup.add(isoMesh);

      rackGroup.add(upsGroup);
    }
    // 4. POWER RPP / MAIN SWITCHGEAR (MDB) / ATS
    else if (rType === 'power-rpp' || rType === 'switchgear' || cat === 'power-distribution' || cat === 'facility-plant') {
      const pwrGroup = new THREE.Group();
      pwrGroup.name = `pwr-interior-${dcRack.id}`;

      // Multi-meter LCD Display
      const meterGeo = new THREE.BoxGeometry(Math.min(160, widthMm * 0.6), 70, 10);
      const meterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.8, emissive: 0x0284c7, emissiveIntensity: 0.5 });
      const meterMesh = new THREE.Mesh(meterGeo, meterMat);
      meterMesh.position.set(0, totalHMm * 0.78 - totalHMm / 2, depthMm / 2 - 5);
      pwrGroup.add(meterMesh);

      // 4 Rows of Miniature Circuit Breakers (MCBs)
      const rowCount = 4;
      for (let r = 0; r < rowCount; r++) {
        const rowY = totalHMm * 0.25 + r * (totalHMm * 0.12);
        const rowGeo = new THREE.BoxGeometry(widthMm * 0.82, 35, 20);
        const rowMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
        const rowMesh = new THREE.Mesh(rowGeo, rowMat);
        rowMesh.position.set(0, rowY - totalHMm / 2, depthMm * 0.35);
        pwrGroup.add(rowMesh);

        const bCount = Math.floor((widthMm * 0.7) / 22);
        for (let b = -Math.floor(bCount / 2); b <= Math.floor(bCount / 2); b++) {
          const bGeo = new THREE.BoxGeometry(6, 14, 8);
          const bMat = new THREE.MeshStandardMaterial({ color: b % 2 === 0 ? 0x0f172a : 0xe2e8f0 });
          const bMesh = new THREE.Mesh(bGeo, bMat);
          bMesh.position.set(b * 22, rowY - totalHMm / 2, depthMm * 0.35 + 12);
          pwrGroup.add(bMesh);
        }
      }

      // Yellow / Black Hazard Caution Stripe Decal Plate at bottom
      const hazardGeo = new THREE.BoxGeometry(widthMm * 0.85, 28, 4);
      const hazardMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.4 });
      const hazardMesh = new THREE.Mesh(hazardGeo, hazardMat);
      hazardMesh.position.set(0, totalHMm * 0.08 - totalHMm / 2, depthMm / 2 - 2);
      pwrGroup.add(hazardMesh);

      rackGroup.add(pwrGroup);
    }
    // 5. ISOLATION STEP-DOWN TRANSFORMER
    else if (rType === 'transformer' || cat === 'busbars-transformers') {
      const xfmrGroup = new THREE.Group();
      xfmrGroup.name = `xfmr-interior-${dcRack.id}`;

      // 3 Heavy-duty Copper Winding Coils
      const coilRadius = Math.min(widthMm * 0.22, 90);
      const coilHeight = totalHMm * 0.55;
      const coilMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.85 });

      [-widthMm * 0.28, 0, widthMm * 0.28].forEach(xOff => {
        const coilGeo = new THREE.CylinderGeometry(coilRadius, coilRadius, coilHeight, 20);
        const coilMesh = new THREE.Mesh(coilGeo, coilMat);
        coilMesh.position.set(xOff, totalHMm * 0.45 - totalHMm / 2, 0);
        xfmrGroup.add(coilMesh);

        const coreGeo = new THREE.BoxGeometry(coilRadius * 1.5, coilHeight + 30, coilRadius * 1.5);
        const coreMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.6 });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(xOff, totalHMm * 0.45 - totalHMm / 2, 0);
        xfmrGroup.add(coreMesh);
      });

      // Warning High Voltage Triangle on front
      const warnGeo = new THREE.BoxGeometry(80, 70, 4);
      const warnMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.5 });
      const warnMesh = new THREE.Mesh(warnGeo, warnMat);
      warnMesh.position.set(0, totalHMm * 0.8 - totalHMm / 2, depthMm / 2 - 2);
      xfmrGroup.add(warnMesh);

      rackGroup.add(xfmrGroup);
    }
    // 6. HIGH DENSITY OPTICAL DISTRIBUTION FRAME (ODF)
    else if (rType === 'odf-fiber' || cat === 'structured-cabling') {
      const odfGroup = new THREE.Group();
      odfGroup.name = `odf-interior-${dcRack.id}`;

      const trayCount = 8;
      const trayH = (totalHMm * 0.78) / trayCount;
      const startY = totalHMm * 0.12;

      for (let i = 0; i < trayCount; i++) {
        const yPos = startY + i * trayH;
        const trayGeo = new THREE.BoxGeometry(widthMm * 0.85, trayH - 8, depthMm * 0.75);
        const trayMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
        const trayMesh = new THREE.Mesh(trayGeo, trayMat);
        trayMesh.position.set(0, yPos - totalHMm / 2, 0);
        odfGroup.add(trayMesh);

        const isAqua = i % 2 === 0;
        const portMat = new THREE.MeshBasicMaterial({ color: isAqua ? 0x06b6d4 : 0xeab308 });
        const pCount = Math.floor((widthMm * 0.6) / 28);
        for (let p = -Math.floor(pCount / 2); p <= Math.floor(pCount / 2); p++) {
          const pGeo = new THREE.BoxGeometry(18, 8, 4);
          const pMesh = new THREE.Mesh(pGeo, portMat);
          pMesh.position.set(p * 28, yPos - totalHMm / 2, depthMm * 0.375 + 2);
          odfGroup.add(pMesh);
        }
      }

      const spoolGeo = new THREE.CylinderGeometry(15, 15, totalHMm * 0.8, 16);
      const spoolMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.4 });
      const spoolL = new THREE.Mesh(spoolGeo, spoolMat);
      spoolL.position.set(-widthMm * 0.44, 0, depthMm * 0.2);
      odfGroup.add(spoolL);

      const spoolR = new THREE.Mesh(spoolGeo, spoolMat);
      spoolR.position.set(widthMm * 0.44, 0, depthMm * 0.2);
      odfGroup.add(spoolR);

      rackGroup.add(odfGroup);
    }
    // 7. STANDBY DIESEL GENERATOR / CENTRAL CHILLER PLANT
    else if (rType === 'generator' || rType === 'chiller-plant') {
      const plantGroup = new THREE.Group();
      plantGroup.name = `plant-interior-${dcRack.id}`;

      if (rType === 'generator') {
        const engGeo = new THREE.BoxGeometry(widthMm * 0.75, totalHMm * 0.55, depthMm * 0.7);
        const engMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4, metalness: 0.8 });
        const engMesh = new THREE.Mesh(engGeo, engMat);
        engMesh.position.set(0, totalHMm * 0.35 - totalHMm / 2, 0);
        plantGroup.add(engMesh);

        const exhGeo = new THREE.CylinderGeometry(35, 35, widthMm * 0.7, 16);
        exhGeo.rotateZ(Math.PI / 2);
        const exhMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.2, metalness: 0.9 });
        const exhMesh = new THREE.Mesh(exhGeo, exhMat);
        exhMesh.position.set(0, totalHMm * 0.8 - totalHMm / 2, 0);
        plantGroup.add(exhMesh);

        const esGeo = new THREE.CylinderGeometry(15, 15, 12, 16);
        esGeo.rotateX(Math.PI / 2);
        const esMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, metalness: 0.3 });
        const esMesh = new THREE.Mesh(esGeo, esMat);
        esMesh.position.set(widthMm * 0.35, totalHMm * 0.6 - totalHMm / 2, depthMm / 2 - 2);
        plantGroup.add(esMesh);
      } else {
        const fanGeo = new THREE.CylinderGeometry(widthMm * 0.35, widthMm * 0.35, 20, 20);
        const fanMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.7 });
        const fan1 = new THREE.Mesh(fanGeo, fanMat);
        fan1.position.set(0, totalHMm / 2 - 10, -depthMm * 0.22);
        plantGroup.add(fan1);

        const fan2 = new THREE.Mesh(fanGeo, fanMat);
        fan2.position.set(0, totalHMm / 2 - 10, depthMm * 0.22);
        plantGroup.add(fan2);

        const barrelGeo = new THREE.CylinderGeometry(widthMm * 0.3, widthMm * 0.3, depthMm * 0.8, 20);
        barrelGeo.rotateX(Math.PI / 2);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.8 });
        const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
        barrelMesh.position.set(0, totalHMm * 0.35 - totalHMm / 2, 0);
        plantGroup.add(barrelMesh);
      }

      rackGroup.add(plantGroup);
    }
  }

  private createRackHUDLinearDashboardCanvas(dcRack: DcRack, rackDevices: DeviceData[], _rackData: RackData): HTMLCanvasElement {
    const W = 800;
    const H = 280;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 1. Calculations for Power & Rack Load
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
    const powerRatio = Math.max(0, Math.min(1, powerKw / maxKw));
    const loadRatio = Math.max(0, Math.min(1, loadPercent / 100));

    // Address & Grid info
    const tileM = 0.6;
    const colIdx = Math.floor(dcRack.position.x / tileM);
    const rowIdx = Math.floor(dcRack.position.y / tileM);
    const rowLabel = getRowLabel(rowIdx, 'letters');
    const colLabel = getColLabel(colIdx, 'numbers', 'compact');
    const gridAddr = `${rowLabel}-${colLabel}`;

    // 2. Transparent Backdrop (No black card background)
    // Clean, floating HUD with high-contrast text and sleek translucent progress bars

    // 3. Header Row: Rack Name & Metadata (Large & Prominent 46px title, 28px subtitle)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(dcRack.name.toUpperCase(), 24, 38);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${dcRack.heightU}U Cabinet • Grid: ${gridAddr} • ${rackDevices.length} Devs`, W - 24, 38);
    ctx.restore();

    // Subtle divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 68);
    ctx.lineTo(W - 24, 68);
    ctx.stroke();

    const barX = 24;
    const barW = W - 48;
    const barH = 22;
    const barR = 11;

    // ── 4. BAR 1: POWER CONSUMPTION (Large 32px label, 34px value, 28px percentage) ──
    const pTopY = 112;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('⚡ POWER', barX, pTopY);

    const pColor = powerRatio > 0.9 ? '#ef4444' : powerRatio > 0.75 ? '#f59e0b' : '#38bdf8';
    const pPctStr = `(${Math.round(powerRatio * 100)}%)`;
    ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const pPctWidth = ctx.measureText(pPctStr).width;
    
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(pPctStr, W - 24, pTopY);

    ctx.fillStyle = pColor;
    ctx.font = 'bold 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${powerKw.toFixed(1)} kW / ${maxKw} kW`, W - 24 - pPctWidth - 14, pTopY);
    ctx.restore();

    // Track
    const pBarY = pTopY + 24;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX, pBarY, barW, barH, barR);
    ctx.fill();
    ctx.stroke();

    // Fill
    const pFillW = Math.max(powerRatio > 0 ? 12 : 0, Math.min(barW, powerRatio * barW));
    if (pFillW > 0) {
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.roundRect(barX, pBarY, pFillW, barH, barR);
      ctx.fill();
    }

    // ── 5. BAR 2: RACK LOAD (Large 32px label, 34px value, 28px percentage) ──
    const rTopY = 202;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('🖥️ RACK LOAD', barX, rTopY);

    const rColor = loadRatio > 0.9 ? '#ef4444' : loadRatio > 0.75 ? '#f59e0b' : '#10b981';
    const rPctStr = `(${loadPercent.toFixed(0)}%)`;
    ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const rPctWidth = ctx.measureText(rPctStr).width;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(rPctStr, W - 24, rTopY);

    ctx.fillStyle = rColor;
    ctx.font = 'bold 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${occupiedU}U / ${totalU}U`, W - 24 - rPctWidth - 14, rTopY);
    ctx.restore();

    // Track
    const rBarY = rTopY + 24;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX, rBarY, barW, barH, barR);
    ctx.fill();
    ctx.stroke();

    // Fill
    const rFillW = Math.max(loadRatio > 0 ? 12 : 0, Math.min(barW, loadRatio * barW));
    if (rFillW > 0) {
      ctx.fillStyle = rColor;
      ctx.beginPath();
      ctx.roundRect(barX, rBarY, rFillW, barH, barR);
      ctx.fill();
    }

    return canvas;
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
    const tileM = 0.6;
    const colIdx = Math.floor(dcRack.position.x / tileM);
    const rowIdx = Math.floor(dcRack.position.y / tileM);
    const rowLabel = getRowLabel(rowIdx, 'letters');
    const colLabel = getColLabel(colIdx, 'numbers', 'compact');
    const gridAddr = `${rowLabel}-${colLabel}`;
    const subtext = `${dcRack.heightU}U Cabinet  •  Grid: ${gridAddr} (${dcRack.position.x.toFixed(1)}m, ${dcRack.position.y.toFixed(1)}m)  •  ${rackDevices.length} Devs`;
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

  private buildWallMeshes3D(floor: DcFloor) {
    if (!this.threeScene || !floor.walls || floor.walls.length === 0 || dcState.getState().wallsVisible === false) return;

    const s = dcState.getState();
    const wallsGroup = new THREE.Group();
    wallsGroup.name = 'datacenter-walls';
    wallsGroup.userData = { isDynamic: true };

    const aluTrimMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Architectural anodized aluminum
      roughness: 0.35,
      metalness: 0.85,
    });

    const aluPostMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.40,
      metalness: 0.80,
    });

    floor.walls.forEach(wall => {
      const wallGroup = new THREE.Group();
      wallGroup.name = `wall-${wall.id}`;
      wallGroup.userData = { isDynamic: true, wallId: wall.id };

      const dx = (wall.end.x - wall.start.x) * 1000;
      const dz = (wall.end.y - wall.start.y) * 1000;
      const lengthMm = Math.hypot(dx, dz);
      if (lengthMm < 100) return;

      const angleRad = Math.atan2(dz, dx);
      const wallHeightMm = (wall.heightM || 3.2) * 1000;
      const wallThickMm = wall.thicknessMm || 150;
      const opacity = wall.opacity !== undefined ? wall.opacity : 0.35;
      const isSelected = s.selectedWallId === wall.id;

      const midX = (wall.start.x + wall.end.x) * 500;
      const midZ = (wall.start.y + wall.end.y) * 500;

      wallGroup.position.set(midX, 0, midZ);
      wallGroup.rotation.y = -angleRad;

      // 1. Transparent Architectural Glass Panel
      const glassGeo = new THREE.BoxGeometry(lengthMm, wallHeightMm - 80, wallThickMm);
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(wall.color || '#38bdf8'),
        transparent: true,
        opacity: Math.max(0.08, opacity),
        roughness: 0.08,
        transmission: 0.88,
        ior: 1.5,
        metalness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.position.set(0, wallHeightMm / 2, 0);
      glassMesh.userData = { isDynamic: true, wallId: wall.id };
      wallGroup.add(glassMesh);

      // 2. Base Floor Track & Top Ceiling Header Channel (Aluminum Extrusion)
      const trimGeo = new THREE.BoxGeometry(lengthMm + 20, 40, wallThickMm + 14);
      
      const baseTrack = new THREE.Mesh(trimGeo, aluTrimMat);
      baseTrack.position.set(0, 20, 0);
      baseTrack.userData = { isDynamic: true, wallId: wall.id };
      wallGroup.add(baseTrack);

      const topHeader = new THREE.Mesh(trimGeo, aluTrimMat);
      topHeader.position.set(0, wallHeightMm - 20, 0);
      topHeader.userData = { isDynamic: true, wallId: wall.id };
      wallGroup.add(topHeader);

      // 3. Vertical Corner Posts & Intermediate Partition Mullions
      const postGeo = new THREE.BoxGeometry(36, wallHeightMm, wallThickMm + 16);
      
      const postStart = new THREE.Mesh(postGeo, aluPostMat);
      postStart.position.set(-lengthMm / 2, wallHeightMm / 2, 0);
      postStart.userData = { isDynamic: true, wallId: wall.id };
      wallGroup.add(postStart);

      const postEnd = new THREE.Mesh(postGeo, aluPostMat);
      postEnd.position.set(lengthMm / 2, wallHeightMm / 2, 0);
      postEnd.userData = { isDynamic: true, wallId: wall.id };
      wallGroup.add(postEnd);

      // Mullions every 1.8m
      const numMullions = Math.max(0, Math.floor(lengthMm / 1800));
      for (let mi = 1; mi <= numMullions; mi++) {
        const mx = -lengthMm / 2 + (mi / (numMullions + 1)) * lengthMm;
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(16, wallHeightMm - 80, wallThickMm + 8), aluTrimMat);
        mullion.position.set(mx, wallHeightMm / 2, 0);
        mullion.userData = { isDynamic: true, wallId: wall.id };
        wallGroup.add(mullion);
      }

      // 4. Wall-Mounted Infrastructure Equipment
      if (wall.items && wall.items.length > 0) {
        wall.items.forEach(item => {
          const itemGroup = this.buildWallEquipment3DMesh(item, wallThickMm, wall.id);
          const itemX = (item.positionRatio - 0.5) * lengthMm;
          const itemY = (item.heightOffsetM || 1.4) * 1000;
          itemGroup.position.set(itemX, itemY, 0);
          wallGroup.add(itemGroup);
        });
      }

      // 5. Selection Wireframe Highlight
      if (isSelected && !s.selectedWallItemId) {
        const selBoxGeo = new THREE.BoxGeometry(lengthMm + 24, wallHeightMm + 20, wallThickMm + 24);
        const selEdges = new THREE.EdgesGeometry(selBoxGeo);
        const selLines = new THREE.LineSegments(selEdges, new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
        selLines.position.set(0, wallHeightMm / 2, 0);
        selLines.userData = { isDynamic: true, wallId: wall.id };
        wallGroup.add(selLines);
      }

      wallsGroup.add(wallGroup);
    });

    this.threeScene.add(wallsGroup);
  }

  private buildWallEquipment3DMesh(item: DcWallItem, wallThickMm: number, wallId: string): THREE.Group {
    const group = new THREE.Group();
    group.name = `wall-item-${item.id}`;
    group.userData = { isDynamic: true, wallId, wallItemId: item.id };

    const s = dcState.getState();
    const isSelected = s.selectedWallItemId === item.id;
    const isInner = (item.side || 'inner') === 'inner';
    const faceZ = (isInner ? 1 : -1) * (wallThickMm / 2 + (item.depthMm || 150) / 2);
    const itemW = item.widthMm || 400;
    const itemH = item.heightMm || 300;
    const itemD = item.depthMm || 150;

    const plasticMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.1 });
    const darkGreyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.40, metalness: 0.6 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.30, metalness: 0.4 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.30, metalness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 });
    const ledCyanMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ledGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

    if (item.type === 'ac-split') {
      // 1. PRECISION WALL-MOUNTED SPLIT A/C EVAPORATOR UNIT
      const body = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), plasticMat);
      body.position.set(0, 0, faceZ);
      body.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(body);

      // Louver discharge grill
      const grill = new THREE.Mesh(new THREE.BoxGeometry(itemW * 0.9, itemH * 0.25, itemD + 4), darkGreyMat);
      grill.position.set(0, -itemH * 0.25, faceZ);
      grill.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(grill);

      // Digital Temp Display (72°F / 22°C LED)
      const display = new THREE.Mesh(new THREE.PlaneGeometry(60, 24), ledCyanMat);
      display.position.set(itemW * 0.3, itemH * 0.2, faceZ + (isInner ? itemD / 2 + 1 : -itemD / 2 - 1));
      if (!isInner) display.rotation.y = Math.PI;
      display.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(display);

    } else if (item.type === 'fire-extinguisher') {
      // 2. CO2 / CLEAN AGENT FIRE EXTINGUISHER CYLINDER
      const tankRadius = Math.min(itemW, itemD) * 0.35;
      const tankHeight = itemH * 0.65;
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 16), redMat);
      cylinder.position.set(0, 0, faceZ);
      cylinder.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(cylinder);

      // Brass valve head & pressure gauge
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 30, 10), metalMat);
      valve.position.set(0, tankHeight / 2 + 15, faceZ);
      valve.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(valve);

      // Black discharge hose
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, tankHeight * 0.8, 8), darkGreyMat);
      hose.position.set(tankRadius + 8, -10, faceZ);
      hose.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(hose);

      // Wall bracket
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(tankRadius * 2.4, 20, Math.abs(faceZ) - tankRadius), metalMat);
      bracket.position.set(0, 20, faceZ / 2);
      bracket.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(bracket);

    } else if (item.type === 'fire-panel') {
      // 3. FM-200 / NOVEC 1230 FIRE SUPPRESSION RELEASE PANEL
      const panel = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), redMat);
      panel.position.set(0, 0, faceZ);
      panel.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(panel);

      // Glass inspection window / LCD
      const lcd = new THREE.Mesh(new THREE.BoxGeometry(itemW * 0.7, itemH * 0.35, 6), darkGreyMat);
      lcd.position.set(0, itemH * 0.2, faceZ + (isInner ? itemD / 2 + 2 : -itemD / 2 - 2));
      lcd.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(lcd);

      // Flashing Alarm Strobe Horn on top
      const strobe = new THREE.Mesh(new THREE.CylinderGeometry(20, 28, 40, 12), yellowMat);
      strobe.position.set(0, itemH / 2 + 20, faceZ);
      strobe.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(strobe);

    } else if (item.type === 'env-sensor') {
      // 4. ENVIRONMENTAL MONITORING SENSOR POD (EMS)
      const pod = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), plasticMat);
      pod.position.set(0, 0, faceZ);
      pod.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(pod);

      // Glowing Status Ring
      const ring = new THREE.Mesh(new THREE.RingGeometry(18, 24, 16), ledGreenMat);
      ring.position.set(0, 0, faceZ + (isInner ? itemD / 2 + 1 : -itemD / 2 - 1));
      if (!isInner) ring.rotation.y = Math.PI;
      ring.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(ring);

    } else if (item.type === 'epo-button') {
      // 5. EMERGENCY POWER OFF (EPO) MUSHROOM SWITCH
      const epoBox = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD * 0.5), yellowMat);
      epoBox.position.set(0, 0, faceZ);
      epoBox.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(epoBox);

      // Red mushroom button
      const mushroom = new THREE.Mesh(new THREE.CylinderGeometry(28, 24, 25, 16), redMat);
      mushroom.rotation.x = Math.PI / 2;
      mushroom.position.set(0, 0, faceZ + (isInner ? itemD * 0.25 + 12 : -itemD * 0.25 - 12));
      mushroom.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(mushroom);

    } else if (item.type === 'access-keypad') {
      // 6. BIOMETRIC / RFID ACCESS CONTROL KEYPAD
      const pad = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), darkGreyMat);
      pad.position.set(0, 0, faceZ);
      pad.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(pad);

      // RFID Reader Blue Circle
      const rfidGlow = new THREE.Mesh(new THREE.CircleGeometry(18, 16), ledCyanMat);
      rfidGlow.position.set(0, itemH * 0.22, faceZ + (isInner ? itemD / 2 + 1 : -itemD / 2 - 1));
      if (!isInner) rfidGlow.rotation.y = Math.PI;
      rfidGlow.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(rfidGlow);

    } else if (item.type === 'cctv-camera') {
      // 7. 4K SECURITY SURVEILLANCE CAMERA (DOME / BULLET)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 14, 16), darkGreyMat);
      base.rotation.x = Math.PI / 2;
      base.position.set(0, 0, faceZ);
      base.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(base);

      // Smoked optical dome hemisphere
      const dome = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.9 }));
      dome.rotation.x = isInner ? Math.PI / 2 : -Math.PI / 2;
      dome.position.set(0, 0, faceZ + (isInner ? 14 : -14));
      dome.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(dome);

    } else if (item.type === 'pdp-panel') {
      // 8. POWER DISTRIBUTION SUB-PANEL (PDP)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), metalMat);
      panel.position.set(0, 0, faceZ);
      panel.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(panel);

      // Rotary Breaker Disconnect Handle
      const handle = new THREE.Mesh(new THREE.BoxGeometry(20, 60, 25), darkGreyMat);
      handle.position.set(itemW * 0.25, 0, faceZ + (isInner ? itemD / 2 + 12 : -itemD / 2 - 12));
      handle.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(handle);

    } else if (item.type === 'first-aid') {
      // 9. FIRST AID & EMERGENCY EYEWASH STATION
      const locker = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), plasticMat);
      locker.position.set(0, 0, faceZ);
      locker.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(locker);

      // Green Cross Medical Emblem
      const crossV = new THREE.Mesh(new THREE.PlaneGeometry(16, 48), ledGreenMat);
      crossV.position.set(0, 0, faceZ + (isInner ? itemD / 2 + 1 : -itemD / 2 - 1));
      if (!isInner) crossV.rotation.y = Math.PI;
      crossV.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(crossV);

      const crossH = new THREE.Mesh(new THREE.PlaneGeometry(48, 16), ledGreenMat);
      crossH.position.set(0, 0, faceZ + (isInner ? itemD / 2 + 1.2 : -itemD / 2 - 1.2));
      if (!isInner) crossH.rotation.y = Math.PI;
      crossH.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(crossH);

    } else {
      // 10. DEFAULT / WATER LEAK DETECTION PANEL
      const genericBox = new THREE.Mesh(new THREE.BoxGeometry(itemW, itemH, itemD), plasticMat);
      genericBox.position.set(0, 0, faceZ);
      genericBox.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(genericBox);
    }

    // Selection Wireframe Outline on item
    if (isSelected) {
      const selBoxGeo = new THREE.BoxGeometry(itemW + 16, itemH + 16, itemD + 16);
      const selEdges = new THREE.EdgesGeometry(selBoxGeo);
      const selLines = new THREE.LineSegments(selEdges, new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
      selLines.position.set(0, 0, faceZ);
      selLines.userData = { isDynamic: true, wallId, wallItemId: item.id };
      group.add(selLines);
    }

    return group;
  }

  private buildRoofMesh3D(floor: DcFloor) {
    if (!this.threeScene || dcState.getState().roofVisible === false) return;

    const s = dcState.getState();
    const floorLenMm = floor.lengthM * 1000;
    const floorWidMm = floor.widthM * 1000;
    const roofHMm = (floor.roofHeightM || 3.8) * 1000;
    const opacity = Math.max(0.05, Math.min(1, s.roofOpacity ?? (floor.roofOpacity ?? 0.30)));
    const color = floor.roofColor || '#38bdf8';

    const roofGroup = new THREE.Group();
    roofGroup.name = 'datacenter-roof';
    roofGroup.userData = { isDynamic: true };

    // 1. Transparent Architectural Glass Roof Slab covering Carpet Area
    const glassSlabGeo = new THREE.BoxGeometry(floorLenMm, 30, floorWidMm);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opacity,
      roughness: 0.08,
      transmission: 0.88,
      ior: 1.5,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const glassSlab = new THREE.Mesh(glassSlabGeo, glassMat);
    glassSlab.position.set(floorLenMm / 2, roofHMm + 15, floorWidMm / 2);
    glassSlab.userData = { isDynamic: true, isRoof: true };
    roofGroup.add(glassSlab);

    // 2. Perimeter Fascia Edge Channel (Anodized Aluminum)
    const fasciaMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.40,
      metalness: 0.80,
    });

    const fasciaXGeo = new THREE.BoxGeometry(floorLenMm + 40, 50, 40);
    const fasciaZGeo = new THREE.BoxGeometry(40, 50, floorWidMm + 40);

    const fasciaNorth = new THREE.Mesh(fasciaXGeo, fasciaMat);
    fasciaNorth.position.set(floorLenMm / 2, roofHMm + 15, 0);
    fasciaNorth.userData = { isDynamic: true };
    roofGroup.add(fasciaNorth);

    const fasciaSouth = new THREE.Mesh(fasciaXGeo, fasciaMat);
    fasciaSouth.position.set(floorLenMm / 2, roofHMm + 15, floorWidMm);
    fasciaSouth.userData = { isDynamic: true };
    roofGroup.add(fasciaSouth);

    const fasciaWest = new THREE.Mesh(fasciaZGeo, fasciaMat);
    fasciaWest.position.set(0, roofHMm + 15, floorWidMm / 2);
    fasciaWest.userData = { isDynamic: true };
    roofGroup.add(fasciaWest);

    const fasciaEast = new THREE.Mesh(fasciaZGeo, fasciaMat);
    fasciaEast.position.set(floorLenMm, roofHMm + 15, floorWidMm / 2);
    fasciaEast.userData = { isDynamic: true };
    roofGroup.add(fasciaEast);

    // 3. Structural T-Bar Ceiling Suspension Grid
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.85,
    });

    // Primary trusses along X spaced every 2.4m
    for (let z = 1200; z < floorWidMm; z += 2400) {
      const trussGeo = new THREE.BoxGeometry(floorLenMm, 25, 20);
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(floorLenMm / 2, roofHMm - 10, z);
      truss.userData = { isDynamic: true };
      roofGroup.add(truss);
    }

    // Secondary cross-tees along Z spaced every 1.2m
    for (let x = 1200; x < floorLenMm; x += 1200) {
      const teeGeo = new THREE.BoxGeometry(20, 20, floorWidMm);
      const tee = new THREE.Mesh(teeGeo, trussMat);
      tee.position.set(x, roofHMm - 10, floorWidMm / 2);
      tee.userData = { isDynamic: true };
      roofGroup.add(tee);
    }

    // 4. Cleanroom Recessed LED Troffers (1200mm x 600mm)
    const trofferFrameMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.5 });
    const trofferPanelMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const trofferGlowMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });

    for (let x = 1200; x + 1200 <= floorLenMm; x += 2400) {
      for (let z = 1200; z + 600 <= floorWidMm; z += 2400) {
        const trofferGroup = new THREE.Group();
        trofferGroup.position.set(x + 600, roofHMm - 10, z + 300);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(1200, 16, 600), trofferFrameMat);
        trofferGroup.add(frame);

        const panel = new THREE.Mesh(new THREE.BoxGeometry(1160, 4, 560), trofferPanelMat);
        panel.position.set(0, -6, 0);
        trofferGroup.add(panel);

        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1140, 540), trofferGlowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.set(0, -9, 0);
        trofferGroup.add(glow);

        trofferGroup.userData = { isDynamic: true };
        roofGroup.add(trofferGroup);
      }
    }

    this.threeScene.add(roofGroup);
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
          <button class="dc-btn dc-btn-sm active" id="dc3d-btn-walls" title="Show / Hide Walls">🧱 Walls</button>
          <button class="dc-btn dc-btn-sm active" id="dc3d-btn-roof" title="Show / Hide Roof">🏠 Roof</button>
          <div class="dc-slider-control" title="Adjust Raised Floor Surface Opacity (0% - 100%)">
            <span>Floor:</span>
            <input type="range" id="dc3d-floor-opacity" class="dc-slider" min="0" max="100" value="${Math.round((dcState.getState().floorOpacity ?? 1) * 100)}" />
          </div>
          <div class="dc-slider-control" title="Adjust Transparent Roof Opacity (0% - 100%)">
            <span>Roof:</span>
            <input type="range" id="dc3d-roof-opacity" class="dc-slider" min="0" max="100" value="${Math.round((dcState.getState().roofOpacity ?? (floor.roofOpacity ?? 0.30)) * 100)}" />
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
      wrap3d.querySelector('#dc3d-btn-walls')?.addEventListener('click', () => {
        const visible = dcState.toggleWallsVisibility();
        this.refresh();
        eventBus.emit('notification', {
          message: `🧱 Walls ${visible ? 'Visible' : 'Hidden'}`,
          type: 'info',
        });
      });
      wrap3d.querySelector('#dc3d-btn-roof')?.addEventListener('click', () => {
        const visible = dcState.toggleRoofVisibility();
        this.refresh();
        eventBus.emit('notification', {
          message: `🏠 Roof ${visible ? 'Visible' : 'Hidden'}`,
          type: 'info',
        });
      });
      wrap3d.querySelector('#dc3d-floor-opacity')?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
        this.setFloorOpacity(val);
      });
      wrap3d.querySelector('#dc3d-roof-opacity')?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
        dcState.setRoofOpacity(val);
        const currentFloor = dcState.getActiveFloor();
        if (currentFloor) {
          this.rebuildThreeScene(currentFloor);
        }
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
