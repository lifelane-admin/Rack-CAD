export type DcTileType = 'standard' | 'cutout' | 'partial' | 'air-channel' | 'perforated' | 'ventilated';
export type DcAirflowDirection = 'north' | 'south' | 'east' | 'west';

export interface DcFloorTile {
  id: string;       // e.g. "A-01"
  row: number;
  col: number;
  x: number;        // real-world meters
  y: number;
  z: number;        // elevation
  widthMm: number;
  depthMm: number;
  type: DcTileType;
  airflowDir?: DcAirflowDirection;
  plenumDepthMm?: number;
  airChannelHeightMm?: number; // default 300mm to prevent obstruction of underfloor raceways
}

export type DcSpaceType =
  | 'white-space'
  | 'grey-space'
  | 'electrical-room'
  | 'mechanical-room'
  | 'generator-area'
  | 'battery-room'
  | 'network-room'
  | 'control-room'
  | 'loading-utility'
  | 'walls-roof';

export type DcEquipmentCategory =
  | 'housing'
  | 'compute'
  | 'storage'
  | 'network'
  | 'structured-cabling'
  | 'power-distribution'
  | 'backup-generation'
  | 'cooling'
  | 'pathways'
  | 'flooring'
  | 'containment'
  | 'fire-safety'
  | 'security'
  | 'bms-dcim'
  | 'architecture'
  | 'plumbing'
  | 'earthing'
  | 'operations'
  | 'facility-plant'
  | 'micro-dc'
  | 'ups'
  | 'busbars-transformers'
  | 'cable-management'
  | 'wall-equipment';

export type DcInfraCategory =
  | 'cable-tray'
  | 'cable-duct'
  | 'power-cable'
  | 'data-cable'
  | 'conduit'
  | 'riser'
  | 'busway'
  | 'fiber-raceway'
  | 'containment'
  | 'chilled-water-pipe'
  | 'drain-pipe';

export type DcInfraLayer = 'underfloor' | 'ceiling' | 'overhead';

export type DcRacewayFittingType =
  | 'straight'
  | 'coupling'
  | 'elbow-90'
  | 'elbow-45'
  | 'tee-joint'
  | 'cross-joint'
  | 'reducing-coupling'
  | 'waterfall-outlet'
  | 'upper-bend-45'
  | 'down-bend-45'
  | 'end-cap';

export interface DcRacewayJunctionNode {
  id: string;
  x: number; // meters
  y: number; // meters
  elevationMm: number;
  layer: DcInfraLayer;
  fittingType: DcRacewayFittingType;
  category: DcInfraCategory;
  subtype: string;
  widthMm: number;
  heightMm: number;
  angles: number[]; // Direction angles of connected branches in radians (0 to 2PI)
  connectedInfraIds: string[];
  rackId?: string; // Associated rack for waterfall drops
  color?: string;
  rotationY?: number;
  branchAngle?: number;
  branchVectors?: Array<{ x: number; z: number }>;
}

export interface DcInfrastructureItem {
  id: string;
  name: string;
  category: DcInfraCategory;
  layer: DcInfraLayer;
  subtype: string; // e.g. 'basket-tray', 'ladder-tray', 'pvc-duct', 'solid-duct', 'power-busway', 'fiber-optics', 'riser-pillar', 'containment-roof', 'containment-door'
  start: { x: number; y: number; z: number }; // meters
  end: { x: number; y: number; z: number };   // meters
  widthMm: number;
  heightMm: number;
  elevationMm: number; // depth below raised floor (e.g. -400mm on slab) or height overhead (e.g. 2600mm)
  mountType?: 'slab-resting' | 'bracket' | 'trapeze';
  color?: string;
  parentItemId?: string;
  notes?: string;
  amperage?: number;
  capacityKw?: number;
}

export type DcRackType =
  | 'server'
  | 'network'
  | 'storage'
  | 'gpu-ai'
  | 'open-frame'
  | 'wall-mount'
  | 'inrow-cooling'
  | 'micro-dc'
  | 'odf-fiber'
  | 'power-rpp'
  | 'ups-cabinet'
  | 'battery-cabinet'
  | 'transformer'
  | 'switchgear'
  | 'chiller-plant'
  | 'cooling-tower'
  | 'chilled-water-pump'
  | 'generator'
  | 'fire-suppression-bank'
  | 'cduhx'
  | 'security-portal'
  | 'operation-station'
  | 'flooring-element'
  | 'pathway-segment'
  | 'earthing-bar';

export type DcDoorStyle =
  | 'perforated'
  | 'perforated-large'
  | 'perforated-medium'
  | 'perforated-small'
  | 'perforated-tiny'
  | 'honeycomb-large'
  | 'honeycomb-medium'
  | 'honeycomb-small'
  | 'honeycomb-tiny'
  | 'solid'
  | 'glass'
  | 'split-perforated'
  | 'split-perforated-large'
  | 'split-perforated-medium'
  | 'split-perforated-small'
  | 'split-perforated-tiny'
  | 'split-honeycomb'
  | 'split-honeycomb-large'
  | 'split-honeycomb-medium'
  | 'split-honeycomb-small'
  | 'split-honeycomb-tiny'
  | 'split-solid'
  | 'split-glass'
  | 'hexa'
  | 'round-hole'
  | 'mesh'
  | 'acrylic'
  | 'none'
  | 'multi-compartment-2'
  | 'multi-compartment-4'
  | 'smart-lcd'
  | 'containment-sliding'
  | 'louvred'
  | 'louvered';

export type DcDoorOperation =
  | 'swing-left'
  | 'swing-right'
  | 'split-swing'
  | 'sliding'
  | 'lift-off'
  | 'interlock';
export type DcMounting = 'floor' | 'wall-mount' | 'pad-mount';
export type DcSpacingStandard =
  | 'bayed-0mm'
  | 'cold-aisle-1.2m'
  | 'cold-aisle-1.5m'
  | 'hot-aisle-0.9m'
  | 'hot-aisle-1.2m'
  | 'inrow-300mm'
  | 'inrow-600mm';

export type DcGaugeStyle = 'radial' | 'linear';

export interface DcRack {
  id: string;       // e.g. "RACK-001"
  name: string;
  type: DcRackType; // server, network, open-frame, wall-mount, inrow-cooling, etc.
  spaceType?: DcSpaceType; // 'white-space' | 'grey-space'
  equipmentCategory?: DcEquipmentCategory;
  widthMm: number;
  depthMm: number;
  heightU: number;
  manufacturer?: string;
  model?: string;
  mounting?: DcMounting;
  doorStyle?: DcDoorStyle;
  position: { x: number; y: number; z: number }; // real-world meters
  rotation: 0 | 90 | 180 | 270;  // degrees
  color?: string;
  leftCableManagerWidth?: 'none' | '4-inch' | '6-inch' | '8-inch';
  rightCableManagerWidth?: 'none' | '4-inch' | '6-inch' | '8-inch';
  leftCableManagerColor?: string;
  rightCableManagerColor?: string;
  leftPduId?: string;
  rightPduId?: string;
  maxPowerKw?: number; // User-defined maximum power capacity in kW (default 20)
  showGauge?: boolean; // 3D HUD Gauge overlay enabled/disabled (default false)
  gaugeStyle?: DcGaugeStyle; // 'radial' | 'linear'
  
  // Advanced Telemetry & Capabilities
  coolingCapacityKw?: number;   // for in-row cooling & micro-dc
  upsCapacityKva?: number;      // for UPS cabinets & micro-dc
  pduVoltage?: '230V' | '415V' | '208V' | '120V';
  pduPhases?: 1 | 3;
  pduAmperage?: number;
  pduOutletCount?: number;
  securityLock?: 'biometric' | 'rfid' | 'keypad' | 'keyed' | 'none';
  busbarAmps?: number;
  transformerKva?: number;
  containmentType?: 'cold-aisle' | 'hot-aisle' | 'none';
  status?: 'normal' | 'warning' | 'critical' | 'offline';
}

export type DcWallSide = 'north' | 'south' | 'east' | 'west' | 'custom';

export type DcWallItemType =
  | 'ac-split'
  | 'fire-extinguisher'
  | 'fire-panel'
  | 'env-sensor'
  | 'epo-button'
  | 'access-keypad'
  | 'cctv-camera'
  | 'pdp-panel'
  | 'leak-detector'
  | 'first-aid';

export interface DcWallItem {
  id: string;
  wallId: string;
  type: DcWallItemType;
  name: string;
  positionRatio: number;        // 0.0 to 1.0 along the wall segment length
  heightOffsetM: number;        // Mounting height above raised floor in meters (e.g. 1.2m for extinguisher, 2.2m for A/C, 1.5m for EMS)
  widthMm: number;
  heightMm: number;
  depthMm: number;
  side?: 'inner' | 'outer';
  model?: string;
  manufacturer?: string;
  color?: string;
  notes?: string;
}

export interface DcWallSegment {
  id: string;
  start: { x: number; y: number }; // In meters
  end: { x: number; y: number };   // In meters
  heightM: number;               // default 3.2m
  thicknessMm: number;           // default 150mm
  opacity: number;               // 0.0 - 1.0 (default 0.35 glass / transparent boundary)
  color?: string;                // default glass cyan/slate '#38bdf8'
  side?: DcWallSide;
  name?: string;
  items?: DcWallItem[];          // Wall hanging items attached to this wall
}

export type DcUnit = 'm' | 'mm' | 'ft' | 'in';

export type DcGridScheme = 'letters' | 'numbers';
export type DcAddressFormat = 'compact' | 'hyphen'; // compact e.g. "A1", hyphen e.g. "A-01"

export interface DcFloor {
  id: string;
  name: string;
  unit: DcUnit;        // Preferred unit: 'm' | 'mm' | 'ft' | 'in'
  lengthM: number;   // floor length in meters
  widthM: number;    // floor width in meters
  tileSizeMm: number; // square tile size in mm (e.g. 600)
  raisedFloorHeightMm?: number; // default 450mm
  roofHeightM?: number; // ceiling / roof slab height above raised floor (e.g. 3.8m)
  roofOpacity?: number; // 0.0 to 1.0 (default 0.30 glass)
  roofColor?: string;   // default '#38bdf8'
  rowScheme?: DcGridScheme; // 'letters' (A-Z) or 'numbers' (01-99)
  colScheme?: DcGridScheme; // 'numbers' (01-99) or 'letters' (A-Z)
  addressFormat?: DcAddressFormat; // 'compact' (A1) or 'hyphen' (A-01)
  tiles: DcFloorTile[];
  racks: DcRack[];
  infrastructure?: DcInfrastructureItem[];
  walls?: DcWallSegment[];
  createdAt: string;
  updatedAt: string;
}

export type DcViewMode = '2d' | '3d';

export interface DcState {
  floors: DcFloor[];
  activeFloorId: string | null;
  viewMode: DcViewMode;
  gridVisible: boolean;
  snapEnabled: boolean;
  labelsVisible: boolean;
  wallsVisible: boolean; // toggle visibility of all perimeter & partition walls (default true)
  roofVisible: boolean;  // toggle visibility of transparent carpet-area roof (default true)
  wallOpacity: number;   // 0.0 to 1.0 (default 0.35)
  roofOpacity: number;   // 0.0 to 1.0 (default 0.30)
  floorOpacity: number;  // 0.0 to 1.0 (default 1.0)
  xrayMode: boolean;     // default false
  selectedTileId: string | null;
  selectedTileIds: string[]; // multi-tile selection (e.g. Ctrl+Select)
  selectedRackId: string | null;
  selectedInfraId: string | null;
  selectedWallId: string | null;
  selectedWallItemId: string | null;
  activeCatalogCategory: DcEquipmentCategory | 'all';
  activeSpaceTab: DcSpaceType | 'all';
  zoom: number;       // canvas zoom factor
  panX: number;
  panY: number;
}
