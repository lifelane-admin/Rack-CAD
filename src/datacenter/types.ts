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
}

export type DcInfraCategory = 'cable-tray' | 'cable-duct' | 'power-cable' | 'data-cable' | 'conduit' | 'riser';
export type DcInfraLayer = 'underfloor' | 'ceiling';

export interface DcInfrastructureItem {
  id: string;
  name: string;
  category: DcInfraCategory;
  layer: DcInfraLayer;
  subtype: string; // e.g. 'basket-tray', 'ladder-tray', 'pvc-duct', 'solid-duct', 'power-busway', 'fiber-optics', 'riser-pillar'
  start: { x: number; y: number; z: number }; // meters
  end: { x: number; y: number; z: number };   // meters
  widthMm: number;
  heightMm: number;
  elevationMm: number; // depth below raised floor (e.g. -200mm)
  color?: string;
  notes?: string;
}

export type DcRackType = 'server' | 'network' | 'open-frame' | 'wall-mount';
export type DcDoorStyle = 'perforated' | 'glass' | 'solid' | 'none' | 'split-perforated' | 'multi-compartment-2' | 'multi-compartment-4';
export type DcMounting = 'floor' | 'wall-mount';
export type DcSpacingStandard =
  | 'bayed-0mm'
  | 'cold-aisle-1.2m'
  | 'cold-aisle-1.5m'
  | 'hot-aisle-0.9m'
  | 'hot-aisle-1.2m'
  | 'inrow-300mm'
  | 'inrow-600mm';

export interface DcRack {
  id: string;       // e.g. "RACK-001"
  name: string;
  type: DcRackType; // server, network, open-frame, wall-mount
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
  zoom: number;       // canvas zoom factor
  panX: number;
  panY: number;
}
