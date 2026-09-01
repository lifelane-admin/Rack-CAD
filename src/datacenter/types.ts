export interface DcFloorTile {
  id: string;       // e.g. "A-01"
  row: number;
  col: number;
  x: number;        // real-world meters
  y: number;
  z: number;        // always 0 in phase 1
  widthMm: number;
  depthMm: number;
  type: 'standard' | 'cutout' | 'partial';
}

export interface DcRack {
  id: string;       // e.g. "RACK-001"
  name: string;
  widthMm: number;
  depthMm: number;
  heightU: number;
  manufacturer?: string;
  model?: string;
  position: { x: number; y: number; z: number }; // real-world meters
  rotation: 0 | 90 | 180 | 270;  // degrees
  color?: string;
}

export type DcUnit = 'm' | 'mm' | 'ft' | 'in';

export interface DcFloor {
  id: string;
  name: string;
  unit: DcUnit;        // Preferred unit: 'm' | 'mm' | 'ft' | 'in'
  lengthM: number;   // floor length in meters
  widthM: number;    // floor width in meters
  tileSizeMm: number; // square tile size in mm (e.g. 600)
  tiles: DcFloorTile[];
  racks: DcRack[];
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
  selectedTileId: string | null;
  selectedRackId: string | null;
  zoom: number;       // canvas zoom factor
  panX: number;
  panY: number;
}
