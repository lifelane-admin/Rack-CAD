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

export type DcSpaceType = 'white-space' | 'grey-space';

export type DcEquipmentCategory =
  | 'housing'
  | 'cooling'
  | 'micro-dc'
  | 'structured-cabling'
  | 'power-distribution'
  | 'security'
  | 'ups'
  | 'busbars-transformers'
  | 'cable-management'
  | 'facility-plant';

export type DcInfraCategory = 'cable-tray' | 'cable-duct' | 'power-cable' | 'data-cable' | 'conduit' | 'riser' | 'busway' | 'fiber-raceway' | 'containment';
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
  | 'generator';

export type DcDoorStyle = 'perforated' | 'glass' | 'solid' | 'none' | 'split-perforated' | 'multi-compartment-2' | 'multi-compartment-4' | 'smart-lcd' | 'containment-sliding' | 'louvred';
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
  rowScheme?: DcGridScheme; // 'letters' (A-Z) or 'numbers' (01-99)
  colScheme?: DcGridScheme; // 'numbers' (01-99) or 'letters' (A-Z)
  addressFormat?: DcAddressFormat; // 'compact' (A1) or 'hyphen' (A-01)
  tiles: DcFloorTile[];
  racks: DcRack[];
  infrastructure?: DcInfrastructureItem[];
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
  floorOpacity: number; // 0.0 to 1.0 (default 1.0)
  xrayMode: boolean;    // default false
  selectedTileId: string | null;
  selectedTileIds: string[]; // multi-tile selection (e.g. Ctrl+Select)
  selectedRackId: string | null;
  selectedInfraId: string | null;
  activeCatalogCategory: DcEquipmentCategory | 'all';
  activeSpaceTab: DcSpaceType | 'all';
  zoom: number;       // canvas zoom factor
  panX: number;
  panY: number;
}
